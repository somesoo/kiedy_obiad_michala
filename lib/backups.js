'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  KOPIE ZAPASOWE BAZY — codziennie o 7:30 (czasu Warszawy), trzy wstecz
// ══════════════════════════════════════════════════════════════════════════════
// To jest zastępstwo za wyłączone „Cofnij dzień" (SL_DAY_ROLLBACK_ENABLED w
// routes/snakes-admin.js). Tamto próbowało odkręcić dzień wzorem i gubiło skutki dla
// innych graczy (kieszonkowiec, zbicia, sklep). Kopia z 7:30 to stan PRZED otwarciem gry
// (8:00), więc przywrócenie cofa cały dzień dokładnie — razem ze wszystkim, co się w nim
// stało, także u graczy, którzy sami nie rzucali. Cena: przepada WSZYSTKO po 7:30, także
// zmiany w panelu, nowi gracze i zakupy.
//
// ── ZRZUT ──
// `VACUUM <schemat> INTO` robi spójną kopię otwartej bazy bez zatrzymywania serwera.
// Dwa pliki (michal.db i dołączony snakes.db) zrzucamy dwoma poleceniami, ale oba są
// synchroniczne i serwer ma jeden proces — między nimi żaden zapis nie ma jak się wcisnąć,
// więc para plików zawsze pasuje do siebie. Zrzut idzie do katalogu `.tmp`, a gotowy jest
// dopiero po zmianie nazwy — przerwany w połowie nie udaje pełnej kopii.
//
// Harmonogram sprawdza co minutę, czy DZIŚ jest już kopia. Serwer, który stał o 7:30,
// zrobi ją zaraz po starcie (z prawdziwą godziną w nazwie — w panelu widać, że to nie 7:30).
// Trzymamy 3 ostatnie kopie dzienne. Osobno zostaje JEDNA kopia „przed przywróceniem"
// (robi ją każde przywrócenie), żeby dało się odkręcić pomyłkę tym samym przyciskiem.
//
// ── PRZYWRÓCENIE ──
// Otwartego uchwytu `db` nie da się podmienić w locie (trzyma go cały server.js), więc
// przywrócenie idzie przez restart: trasa zapisuje znacznik RESTORE i kończy proces, pm2 go
// podnosi, a applyPendingRestore() — PRZED otwarciem bazy — kopiuje pliki kopii na miejsce.
// Bez pm2 serwer trzeba uruchomić ręcznie; znacznik poczeka. Z terminala (serwer może stać):
//   node lib/backups.js                 — lista kopii
//   node lib/backups.js restore <nazwa> — przywróci przy najbliższym starcie serwera
//
// Zdjęcia profilowe (public/avatars) nie są w kopii: to pliki, nie baza. Po przywróceniu
// zostają najnowsze, co niczego nie psuje (najwyżej osierocony plik po nowym graczu).

const fs = require('fs');
const path = require('path');
const { warsawParts, todayWaw } = require('./time');

const FILES = [['main', 'michal.db'], ['snakes', 'snakes.db']];
const KEEP = 3;
const AT_HOUR = 7;
const AT_MINUTE = 30;
const PRE_RESTORE = 'przed-przywroceniem';
const NAME_RE = /^[\w-]+$/;

const backupsDirOf = dbDir => path.join(dbDir, 'backups');

function stamp() {
  const p = warsawParts();
  return `${p.y}-${p.mo}-${p.d}_${p.h}${p.mi}`;
}
const markerOf = dbDir => path.join(backupsDirOf(dbDir), 'RESTORE');

function list(dbDir) {
  const dir = backupsDirOf(dbDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => NAME_RE.test(n) && FILES.every(([, f]) => fs.existsSync(path.join(dir, n, f))))
    .map(n => {
      const files = FILES.map(([, f]) => fs.statSync(path.join(dir, n, f)));
      return {
        name: n,
        pre_restore: n.startsWith(PRE_RESTORE),
        created_at: files[0].mtime.toISOString(),
        size: files.reduce((s, st) => s + st.size, 0),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function pendingRestore(dbDir) {
  const m = markerOf(dbDir);
  return fs.existsSync(m) ? fs.readFileSync(m, 'utf8').trim() : null;
}

function stageRestore(dbDir, name) {
  if (!NAME_RE.test(String(name || '')) || !list(dbDir).some(b => b.name === name)) {
    return { error: 'Nie ma takiej kopii.', status: 404 };
  }
  fs.writeFileSync(markerOf(dbDir), name);
  return { success: true, name };
}

// Woła server.js jako PIERWSZĄ rzecz przed `new DatabaseSync` — potem pliki są otwarte.
function applyPendingRestore(dbDir) {
  const name = pendingRestore(dbDir);
  if (!name) return null;
  fs.unlinkSync(markerOf(dbDir)); // najpierw znacznik: zła kopia nie może zapętlić restartów
  const dir = backupsDirOf(dbDir);
  const src = path.join(dir, name);
  if (!NAME_RE.test(name) || !FILES.every(([, f]) => fs.existsSync(path.join(src, f)))) {
    console.error(`Kopie: nie przywracam „${name}" — nie ma takiej kopii albo jest niepełna`);
    return null;
  }
  // Obecny stan idzie najpierw do kopii „przed przywróceniem" — pomyłkę da się odkręcić
  // tym samym mechanizmem. Baza jeszcze nie jest otwarta, więc wystarczy skopiować pliki
  // (z ewentualnym dziennikiem: SQLite dokończy go przy otwarciu tej kopii). Dawna kopia
  // „przed przywróceniem" ustępuje nowej — trzymamy jedną.
  if (FILES.every(([, f]) => fs.existsSync(path.join(dbDir, f)))) {
    for (const b of list(dbDir).filter(b => b.pre_restore)) fs.rmSync(path.join(dir, b.name), { recursive: true, force: true });
    const safety = path.join(dir, `${PRE_RESTORE}_${stamp()}`);
    fs.mkdirSync(safety, { recursive: true });
    for (const [, f] of FILES) {
      for (const ext of ['', '-journal', '-wal']) {
        if (fs.existsSync(path.join(dbDir, f + ext))) fs.copyFileSync(path.join(dbDir, f + ext), path.join(safety, f + ext));
      }
    }
    console.log(`Kopie: obecny stan zapisany jako „${path.basename(safety)}"`);
  }
  for (const [, f] of FILES) {
    // Pozostawiony dziennik (-journal / -wal) wgrałby się w PRZYWRÓCONY plik przy pierwszym
    // otwarciu i zepsułby go — należy do starej bazy, więc idzie do kosza razem z nią.
    for (const ext of ['-journal', '-wal', '-shm']) fs.rmSync(path.join(dbDir, f + ext), { force: true });
    fs.copyFileSync(path.join(src, f), path.join(dbDir, f));
  }
  console.log(`Kopie: PRZYWRÓCONO bazę z kopii „${name}"`);
  return name;
}

module.exports = function createBackupsModule({ db, dbDir }) {
  const dir = backupsDirOf(dbDir);

  function snapshot(name) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `${name}.tmp`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);
    for (const [schema, f] of FILES) {
      db.prepare(`VACUUM ${schema} INTO ?`).run(path.join(tmp, f));
    }
    const final = path.join(dir, name);
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(tmp, final);
    return name;
  }

  // Najnowsze KEEP kopii dziennych zostaje, z kopii „przed przywróceniem" — jedna.
  function prune() {
    const all = list(dbDir);
    const daily = all.filter(b => !b.pre_restore).slice(KEEP);
    const pre = all.filter(b => b.pre_restore).slice(1);
    for (const b of [...daily, ...pre]) fs.rmSync(path.join(dir, b.name), { recursive: true, force: true });
    // Resztki po przerwanym zrzucie.
    if (fs.existsSync(dir)) {
      for (const n of fs.readdirSync(dir)) if (n.endsWith('.tmp')) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
    }
  }

  function dailyDoneToday() {
    const today = todayWaw();
    return list(dbDir).some(b => !b.pre_restore && b.name.startsWith(today));
  }

  function tick() {
    const p = warsawParts();
    if (Number(p.h) * 60 + Number(p.mi) < AT_HOUR * 60 + AT_MINUTE) return;
    if (dailyDoneToday()) return;
    try {
      const name = snapshot(stamp());
      prune();
      console.log(`Kopie: zrobiona kopia bazy „${name}"`);
    } catch (e) {
      console.error('Kopie: nie udało się zrobić kopii bazy:', e.message);
    }
  }

  function startScheduler() {
    tick();
    setInterval(tick, 60_000);
    console.log(`Kopie: codziennie o ${AT_HOUR}:${String(AT_MINUTE).padStart(2, '0')} (Europe/Warsaw), trzymam ${KEEP} ostatnie — ${dir}`);
  }

  function registerRoutes(app, { checkAdmin }) {
    // GET /api/snakes/admin/backups?password=
    app.get('/api/snakes/admin/backups', (req, res) => {
      if (!checkAdmin(req, res)) return;
      res.json({ backups: list(dbDir), pending: pendingRestore(dbDir), keep: KEEP, at: `${AT_HOUR}:${String(AT_MINUTE).padStart(2, '0')}` });
    });

    // POST /api/snakes/admin/backups/restore { password, name } — znacznik i restart;
    // kopię obecnego stanu robi applyPendingRestore przy starcie. Odpowiedź leci PRZED
    // zakończeniem procesu, żeby panel zdążył ją dostać. Transakcje są synchroniczne,
    // więc w chwili exit żadna nie jest w połowie.
    app.post('/api/snakes/admin/backups/restore', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const out = stageRestore(dbDir, String(req.body.name || ''));
      if (out.error) return res.status(out.status).json({ error: out.error });
      console.log(`Kopie: admin przywraca „${out.name}" — restart`);
      res.json({ success: true, name: out.name });
      setTimeout(() => process.exit(0), 500);
    });
  }

  return { startScheduler, registerRoutes, snapshot, list: () => list(dbDir) };
};

module.exports.applyPendingRestore = applyPendingRestore;

// ── Z TERMINALA ── (patrz nagłówek)
if (require.main === module) {
  const dbDir = path.join(__dirname, '..', 'db');
  const [cmd, name] = process.argv.slice(2);
  if (cmd === 'restore') {
    const out = stageRestore(dbDir, name);
    if (out.error) { console.error(out.error); process.exit(1); }
    console.log(`Kopia „${name}" zostanie przywrócona przy najbliższym starcie serwera (pm2 restart kiedy-obiad).`);
  } else {
    const all = list(dbDir);
    if (!all.length) console.log('Brak kopii.');
    for (const b of all) console.log(`${b.name}\t${b.created_at}\t${Math.round(b.size / 1024)} KB`);
    const p = pendingRestore(dbDir);
    if (p) console.log(`\nCzeka na przywrócenie przy starcie: ${p}`);
  }
}
