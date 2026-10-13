// ── ROZGRYWKA SCENARIUSZA W TERMINALU („gra papierowa") ──
// Etap B roadmapy: zanim powstanie UI, sprawdzamy na ludziach, czy scenariusz jest ciekawy
// i zrozumiały. Prowadzący odpala to przy stole, grupa decyduje.
//   node ciso-sim/proto/rozegraj.js S01 [--kontrole=weryfikacja_platnosci,mfa]
// Bez interakcji (np. do sprawdzenia pliku): --auto=najlepsza | --auto=najgorsza
//
// Przy okazji WALIDUJE plik scenariusza (jak lib/seasons.js waliduje plansze): zły plik
// nie zagra, a powód jest wypisany.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const OCENY = { dobra: '✅', dopuszczalna: '⚠️', blad: '❌' };
const PEWNOSC = ['pewne', 'prawdopodobne', 'nie wiadomo'];

function waliduj(s) {
  const bledy = [];
  if (!s.id || !s.tytul) bledy.push('brak id/tytul');
  if (typeof s.start !== 'function') bledy.push('start musi być funkcją (stan → id fazy)');
  if (!s.fazy || !Object.keys(s.fazy).length) bledy.push('brak faz');
  for (const [fid, f] of Object.entries(s.fazy || {})) {
    if (!Array.isArray(f.opcje) || !f.opcje.length) bledy.push(`${fid}: brak opcji`);
    for (const [fakt, p] of f.wiedza || []) {
      if (!PEWNOSC.includes(p)) bledy.push(`${fid}: pewność „${p}" przy „${fakt}"`);
    }
    for (const o of f.opcje || []) {
      if (!OCENY[o.ocena]) bledy.push(`${fid}/${o.id}: ocena „${o.ocena}"`);
      if (o.dalej !== 'koniec' && !s.fazy[o.dalej]) bledy.push(`${fid}/${o.id}: dalej → nieznana faza „${o.dalej}"`);
      if (!o.dlaczego) bledy.push(`${fid}/${o.id}: brak „dlaczego" (idzie do debriefu)`);
    }
  }
  for (const z of s.zegary || []) if (!s.fazy[z.start]) bledy.push(`zegar ${z.id}: start w nieznanej fazie`);
  if (!(s.zakonczenia || []).length) bledy.push('brak zakończeń');
  // Rubryka: najlepsza ścieżka z każdej fazy startowej ma dawać dokładnie 100 pkt —
  // inaczej Jakość Decyzji nie jest porównywalna między scenariuszami.
  const najlepsza = (fid, byly = new Set()) => {
    if (fid === 'koniec' || byly.has(fid) || !s.fazy?.[fid]) return 0;
    const dalej = new Set(byly).add(fid);
    return Math.max(...s.fazy[fid].opcje.map(o => (o.pkt || 0) + najlepsza(o.dalej, dalej)));
  };
  for (const st of s.starty || []) {
    const suma = najlepsza(st);
    if (suma !== 100) bledy.push(`najlepsza ścieżka od „${st}" daje ${suma} pkt, a powinna 100`);
  }
  return bledy;
}

function wczytaj(id) {
  const dir = path.join(__dirname, '..', 'scenariusze');
  const plik = fs.readdirSync(dir).find(f => f.startsWith(id) && f.endsWith('.dane.js'));
  if (!plik) throw new Error(`Brak pliku danych dla ${id} (scenariusze/${id}-*.dane.js)`);
  return require(path.join(dir, plik));
}

async function graj(s, stan, wybierz, wypisz = console.log) {
  const log = wypisz;
  let faza = s.start(stan);
  let zegar = 0;
  const decyzje = [];
  const zegaryStart = {};
  while (faza !== 'koniec') {
    const f = s.fazy[faza];
    zegar = Math.max(zegar, f.czas_h);
    for (const z of s.zegary || []) if (z.start === faza && zegaryStart[z.id] === undefined) zegaryStart[z.id] = zegar;
    log(`\n── T+${zegar.toFixed(1)} h ─────────────────────────────`);
    log(f.opis);
    for (const [fakt, p] of f.wiedza || []) log(`  • ${fakt} [${p}]`);
    for (const z of s.zegary || []) {
      if (zegaryStart[z.id] === undefined) continue;
      log(`  ⏱ ${z.nazwa}: zostało ${(z.godzin - (zegar - zegaryStart[z.id])).toFixed(1)} h`);
    }
    f.opcje.forEach((o, i) => log(`  ${i + 1}) ${o.tekst}`));
    const o = f.opcje[await wybierz(f.opcje)];
    log(`  → ${o.tekst}`);
    zegar += o.czas_h || 0;
    Object.assign(stan, o.skutek || {});
    decyzje.push({ faza, o });
    faza = o.dalej;
  }
  const kon = s.zakonczenia.find(z => z.warunek(stan));
  const pkt = decyzje.reduce((a, d) => a + (d.o.pkt || 0), 0);
  log(`\n══ ${kon.tytul} ══\n${kon.opis}`);
  log(`\nJakość decyzji: ${pkt}/100\n`);
  for (const d of decyzje) log(`${OCENY[d.o.ocena]} ${d.o.tekst}\n   ${d.o.dlaczego}`);
  log('\nDebrief:');
  for (const z of s.debrief) log(`  – ${z}`);
  return { pkt, zakonczenie: kon.tytul, decyzje: decyzje.map(d => ({ faza: d.faza, tekst: d.o.tekst, ocena: d.o.ocena, dlaczego: d.o.dlaczego })) };
}

async function main() {
  const id = process.argv[2] || 'S01';
  const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
  const s = wczytaj(id);
  const bledy = waliduj(s);
  if (bledy.length) { console.error(`Scenariusz ${id} ma błędy:\n - ${bledy.join('\n - ')}`); process.exit(1); }
  const stan = { kontrole: (arg('kontrole') || '').split(',').filter(Boolean) };
  console.log(`\n${s.id}. ${s.tytul}   (kontrole gracza: ${stan.kontrole.join(', ') || 'brak'})`);

  const auto = arg('auto');
  if (auto) {
    const ranga = { dobra: 2, dopuszczalna: 1, blad: 0 };
    const cel = auto === 'najgorsza' ? -1 : 1;
    await graj(s, stan, async opcje => opcje.reduce((best, o, i) =>
      (ranga[o.ocena] * cel > ranga[opcje[best].ocena] * cel ? i : best), 0));
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pytaj = q => new Promise(r => rl.question(q, r));
  await graj(s, stan, async opcje => {
    for (;;) {
      const n = Number(await pytaj('Twoja decyzja: '));
      if (n >= 1 && n <= opcje.length) return n - 1;
    }
  });
  rl.close();
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { waliduj, wczytaj, graj };
