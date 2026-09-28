require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // skrót zawartości plików frontu (patrz ASSET_VERSION)
const { warsawParts, todayWaw, warsawWallTimeToMs, isWeekendStr, addBusinessDaysMs } = require('./lib/time');

const app = express();
const PORT = process.env.PORT || 31535;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123michal';
// Publiczny adres serwisu — linki na Discordzie i tagi podglądu linku (og:url, og:image).
const APP_URL = process.env.APP_URL || 'https://frog03-21535.wykr.es/';

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Zdjęcia profilowe Snakes — wymagane do gry, serwowane statycznie spod /avatars/<id>.jpg.
const avatarsDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'michal.db'));
// Snakes & Ladders trzyma swoje dane (sl_*) we własnym pliku, dołączonym pod schemat
// „snakes" — fizycznie osobno od Wordle, ale w jednej transakcji/połączeniu, więc
// JOIN-y z tabelą players nadal działają bez zmian w resztcie zapytań.
db.exec(`ATTACH DATABASE '${path.join(dbDir, 'snakes.db').replace(/'/g, "''")}' AS snakes`);

// Gracze — wspólni dla Snakes i Wordle (jedno konto, logowanie tokenem X-Token). Kolumny
// *_streak, total_wins, last_word_index to spadek po Wordle; Snakes trzyma swoje w sl_state.
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    last_word_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Dokłada kolumnę do istniejącej tabeli, jeśli jej brakuje — migracje schematu przy starcie
// (Wordle, boss, zamknięcie sezonu). Dostają ją też moduły z lib/.
function ensureColumn(table, column, definition) {
  const exists = db.prepare(
    `SELECT COUNT(*) AS c FROM pragma_table_info(?) WHERE name = ?`
  ).get(table, column).c > 0;
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

app.use(express.json());

// ══ WERSJONOWANIE ZASOBÓW FRONTU ══
// Nie ma bundlera, więc `<script src="snakes.js">` to dla przeglądarki ciągle ten sam
// adres — po wdrożeniu potrafi grać starym, zacache'owanym kodem na nowym API i wygląda
// to jak „zmiany nie weszły". Doklejamy więc `?v=<skrót zawartości>`: zmiana pliku zmienia
// adres, więc przeglądarka MUSI pobrać go na nowo, a gdy plik się nie zmienił, adres
// zostaje ten sam i cache nadal działa (skrót treści, nie czas startu — inaczej każdy
// restart pm2 kasowałby cache wszystkim bez powodu).
const VERSIONED_ASSETS = ['style.css', 'snakes.css', 'snakes.js', 'app.js'];
const ASSET_VERSION = (() => {
  const hash = crypto.createHash('sha1');
  for (const name of VERSIONED_ASSETS) {
    try {
      hash.update(fs.readFileSync(path.join(__dirname, 'public', name)));
    } catch {
      // Brak pliku nie może wywrócić startu serwera — po prostu nie wchodzi do skrótu.
    }
  }
  return hash.digest('hex').slice(0, 8);
})();

// Strony czytamy raz przy starcie i trzymamy gotowe w pamięci — to kilka kilobajtów,
// a pm2 i tak restartuje proces przy każdym wdrożeniu.
const versionedPages = new Map();
function versionedHtml(file) {
  if (versionedPages.has(file)) return versionedPages.get(file);
  let html = null;
  try {
    html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8')
      .replace(
        new RegExp(`(href|src)="(/?)(${VERSIONED_ASSETS.join('|').replace(/\./g, '\\.')})"`, 'g'),
        (_, attr, slash, name) => `${attr}="${slash}${name}?v=${ASSET_VERSION}"`
      )
      // Tagi podglądu linku (og:image, og:url) muszą mieć adres BEZWZGLĘDNY — komunikatory
      // nie rozwiązują ścieżek względnych. Domena bierze się z APP_URL, jak linki na Discordzie.
      .replace(/%SITE_URL%/g, APP_URL.replace(/\/+$/, ''));
  } catch {
    html = null; // trasa zrobi wtedy zwykłe sendFile
  }
  versionedPages.set(file, html);
  return html;
}

// Musi stać PRZED express.static, inaczej statyczny handler odda surowy plik bez wersji.
function sendPage(res, file) {
  const html = versionedHtml(file);
  // no-cache = „zawsze zapytaj serwer" (przy braku zmian i tak leci szybkie 304 po ETagu).
  // Bez tego przeładowanie po wdrożeniu mogłoby wziąć z cache STARY HTML ze starym ?v=,
  // czyli dokładnie ten kod, od którego uciekamy (patrz X-App-Version niżej).
  res.set('Cache-Control', 'no-cache');
  if (html == null) return res.sendFile(path.join(__dirname, 'public', file));
  res.type('html').send(html);
}

// ── WYMUSZONE ODŚWIEŻENIE PO WDROŻENIU ──
// Otwarta karta gra kodem, który wczytała rano — wdrożenie niczego jej nie podmienia, więc
// nowy panel docierał do ludzi dopiero, gdy sami nacisnęli F5. Każda odpowiedź API niesie
// więc wersję frontu, a snakes.js porównuje ją ze swoją i przy różnicy sam przeładowuje
// stronę (w bezpiecznym momencie — patrz slCheckAppVersion). Wersja to skrót PLIKÓW frontu,
// więc restart pm2 bez zmian we froncie nikogo nie przeładowuje.
app.use('/api', (req, res, next) => {
  res.set('X-App-Version', ASSET_VERSION);
  next();
});
// Serwis to dziś Snakes — Wordle skończył się 2026-08-31 i przeniósł pod /wordle (lib/wordle.js).
// Stare adresy przekierowujemy, żeby zakładki i linki z Discorda dalej gdzieś prowadziły.
app.get(['/', '/index.html'], (req, res) => res.redirect(302, '/snakes'));
app.get(['/admin', '/admin.html'], (req, res) => res.redirect(302, '/wordle/admin'));
app.get(['/snakes', '/snakes.html'], (req, res) => sendPage(res, 'snakes.html'));
app.get(['/snakes/admin', '/snakes-admin.html'], (req, res) => sendPage(res, 'snakes-admin.html'));

app.use(express.static(path.join(__dirname, 'public')));

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function authPlayer(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });
  const player = db.prepare('SELECT * FROM players WHERE token = ?').get(token);
  if (!player) return res.status(401).json({ error: 'Nieznany token' });
  db.prepare('UPDATE players SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);
  req.player = player;
  next();
}

// ──────────────────────────────────────────────
// ENDPOINTS — GRACZE
// ──────────────────────────────────────────────

app.post('/api/register', (req, res) => {
  const { nickname } = req.body;
  if (!nickname || nickname.trim().length < 2) {
    return res.status(400).json({ error: 'Nick za krótki — minimum 2 znaki' });
  }
  if (nickname.trim().length > 20) {
    return res.status(400).json({ error: 'Nick za długi — maximum 20 znaków' });
  }

  const existing = db.prepare('SELECT id, token FROM players WHERE nickname = ?').get(nickname.trim());
  if (existing) {
    return res.json({ player_id: existing.id, token: existing.token, new: false });
  }

  const token = uuidv4();
  try {
    const result = db.prepare(
      'INSERT INTO players (nickname, token) VALUES (?, ?)'
    ).run(nickname.trim(), token);
    res.json({ player_id: Number(result.lastInsertRowid), token, new: true });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ten nick jest zajęty, wymyśl coś lepszego' });
    }
    throw e;
  }
});

// GET /api/me — kim jestem (Snakes i Wordle logują się tym samym tokenem). Statystyki
// Wordle stąd wyleciały razem z modułem: żaden front ich nie czytał.
app.get('/api/me', authPlayer, (req, res) => {
  res.json({ id: req.player.id, nickname: req.player.nickname });
});

// ──────────────────────────────────────────────
// ENDPOINTS — ADMIN
// ──────────────────────────────────────────────

function checkAdmin(req, res) {
  const password = req.body.password || req.query.password;
  if (password !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Złe hasło' });
    return false;
  }
  return true;
}

// ── OFFICE WORDLE (archiwum) — cały w lib/wordle.js ──
// Musi stać PO express.json() (trasy POST czytają req.body) i przed schematem Snakes —
// tu dawniej leżał kod Wordle, więc kolejność startu się nie zmienia.
const wordle = require('./lib/wordle')({
  app, db, transaction, ensureColumn, authPlayer, checkAdmin, sendPage, APP_URL
});

// ══════════════════════════════════════════════════════════════════════════
// ── SNAKES & LADDERS (Węże i Drabiny) — nieskończona pętla, 1 ruch dziennie ──
// ══════════════════════════════════════════════════════════════════════════
// Osobny tryb gry, w pełni addytywny wobec Wordle: współdzieli tabelę `players`
// (logowanie tokenem X-Token), ale trzyma swój stan w tabelach `sl_*`.
//
// Zasady w skrócie:
//  • Jedna WSPÓLNA plansza dla wszystkich (49 pól = 7×7, indeks 0..48), zapętlona —
//    po ostatnim polu wraca się na start i liczy kolejne okrążenie (brak „mety").
//  • Każdy gracz ma DOKŁADNIE JEDEN ruch dziennie (blokada jak w Wordle: unikalny
//    wpis (player_id, move_date) w `sl_moves`; doba wg strefy Europe/Warsaw).
//  • Ruch jest wyzwalany przez gracza (klik „Rzuć kostką"), nie automatyczny.
//  • Punkty = wartość rzutu + pola bonusowe + postęp po planszy (przebyty dystans
//    i ukończone okrążenia). Punkty się kumulują (leaderboard) i są walutą sklepu.
//  • Power-upy kupowane za punkty (NIE losowe dropy): Freeze, Curse (3 warianty),
//    Extra Move oraz Shield (obrona — blokuje najbliższy Freeze/Curse).
//  • Wydarzenie kooperacyjne: gracze dorzucają punkty do wspólnej puli; po przekroczeniu
//    progu rusza event „bossowy", a po jego ukończeniu kontrybutorzy dostają nagrody.

// Kształt i układ planszy nie mieszkają w kodzie — każdy sezon to plik boards/<id>.js
// (patrz lib/seasons.js). Aktywny sezon trzyma silnik planszy (lib/board.js); czyta się
// go przez slCurrentBoard(), a podmienia przez slSetBoard() — przy starcie i przy zmianie
// sezonu z panelu (slInstallBoard). Liczba pól bywa różna w różnych sezonach, dlatego
// rozmiar czytamy zawsze przez slBoardSize(), nigdy ze stałej.
const seasons = require('./lib/seasons');

// ── WYDARZENIE KOOPERACYJNE (co-op) / WALKA Z BOSSEM ──
// Cała mechanika bossa — stałe, schemat, rozliczenia i trasy — mieszka w lib/boss.js.
// Tutaj zostaje wyłącznie punkt podpięcia (szukaj "const boss = createBossModule").

// Ile ruchów (rzutów) dziennie ma każdy gracz na starcie dnia. Freeze blokuje JEDEN
// z nich (nie cały dzień), a Extra Move DOKŁADA jeden ruch ponad ten limit — od ręki,
// w momencie użycia (patrz POST /api/snakes/shop/use i slDailyRollsFor).
const SL_DAILY_ROLLS = 3;
// Ile slotów PONAD dzienny limit można w sumie dołożyć Extra Move'ami w ciągu jednego
// dnia. Bez tego sufitu Extra Move był dziurą w ekonomii: każdy rzut daje punkty, punkty
// są walutą sklepu, więc gracz z zapasem monet kupował kolejne Extra Move'y i rzucał
// w kółko (zdarzyło się 31 ruchów jednego dnia). Twardy limit dnia to
// SL_DAILY_ROLLS + SL_MAX_EXTRA_ROLLS = 5 rzutów.
const SL_MAX_EXTRA_ROLLS = 2;
// Między ruchami NIE MA odstępu — gracz sam decyduje, jak rozłożyć swoje trzy rzuty
// w ciągu dnia (choćby wszystkie pod rząd). Jedyne ograniczenie to okno godzin biurowych.

// ── GODZINY BIUROWE ──
// To gra biurowa: rzucać można wyłącznie w oknie SL_PLAY_START_HOUR–SL_PLAY_END_HOUR
// (czasu Warszawy, dni robocze). Po 16:00 niewykorzystane ruchy przepadają.
// Stałe z env to tylko DOMYŚLNE okno — admin może je nadpisać w panelu (sl_meta), np. na
// czas testów zdjąć blokadę całkiem (0–24 i weekendy). Dlatego okno czytamy zawsze przez
// slPlayHours(), nigdy wprost ze stałych: inaczej komunikat mówiłby „8–16", a gra
// wpuszczała o 20:00.
const SL_PLAY_START_HOUR = Number(process.env.SNAKES_PLAY_START_HOUR || 8);
const SL_PLAY_END_HOUR = Number(process.env.SNAKES_PLAY_END_HOUR || 16);
const SL_PLAY_META_START = 'play_start_hour';
const SL_PLAY_META_END = 'play_end_hour';
const SL_PLAY_META_WEEKENDS = 'play_weekends';

// Aktualne okno gry: { start, end, weekends, custom }. `end` = 24 znaczy „do północy".
// Zepsuta wartość w sl_meta (ręczna edycja bazy) nie może zamknąć gry na zawsze —
// wtedy wracamy do domyślnych z env.
function slPlayHours() {
  const rawStart = slMetaGet(SL_PLAY_META_START);
  const rawEnd = slMetaGet(SL_PLAY_META_END);
  let start = rawStart != null ? Number(rawStart) : SL_PLAY_START_HOUR;
  let end = rawEnd != null ? Number(rawEnd) : SL_PLAY_END_HOUR;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end) {
    start = SL_PLAY_START_HOUR;
    end = SL_PLAY_END_HOUR;
  }
  const weekends = slMetaGet(SL_PLAY_META_WEEKENDS) === '1';
  return {
    start, end, weekends,
    custom: rawStart != null || rawEnd != null || weekends,
    default_start: SL_PLAY_START_HOUR,
    default_end: SL_PLAY_END_HOUR
  };
}

// Czy w danej chwili okno gry jest otwarte (dzień roboczy + godzina w zakresie).
function slOfficeOpenAt(ms = Date.now()) {
  const hours = slPlayHours();
  const p = warsawParts(new Date(ms));
  if (!hours.weekends && isWeekendStr(`${p.y}-${p.mo}-${p.d}`)) return false;
  const h = Number(p.h);
  return h >= hours.start && h < hours.end;
}

// Najbliższa chwila (epoch ms), w której okno gry jest otwarte: samo `fromMs`, jeśli
// właśnie trwa, inaczej godzina otwarcia najbliższego dnia roboczego. Dni przeglądamy
// od kotwicy w południe, żeby zmiana czasu (CET/CEST) nie przesunęła nam doby.
function slNextOpenMs(fromMs = Date.now()) {
  if (slOfficeOpenAt(fromMs)) return fromMs;
  const hours = slPlayHours();
  const p0 = warsawParts(new Date(fromMs));
  let anchor = warsawWallTimeToMs(Number(p0.y), Number(p0.mo), Number(p0.d), 12);
  for (let i = 0; i < 14; i++) {
    const p = warsawParts(new Date(anchor));
    const openMs = warsawWallTimeToMs(Number(p.y), Number(p.mo), Number(p.d), hours.start);
    if ((hours.weekends || !isWeekendStr(`${p.y}-${p.mo}-${p.d}`)) && openMs > fromMs) return openMs;
    anchor += 24 * 60 * 60 * 1000;
  }
  return fromMs;
}

// Godzina zamknięcia okna dla dnia, w którym wypada `ms` (epoch ms).
function slOfficeCloseMs(ms = Date.now()) {
  const p = warsawParts(new Date(ms));
  return warsawWallTimeToMs(Number(p.y), Number(p.mo), Number(p.d), slPlayHours().end);
}


// ── MIGRACJA: Snakes trzymał dotąd tabele sl_* w tym samym pliku co Wordle
// (michal.db). Od teraz mają własny plik (snakes.db, dołączony wyżej jako "snakes").
// Jeśli w michal.db wykryjemy stare tabele sl_*, przenosimy je 1:1 (razem z kolumnami
// dołożonymi wcześniej przez ensureColumn) do snakes.db i kasujemy stare — inaczej
// zostałyby dwie tabele o tej samej nazwie, a "main" jest sprawdzane przed dołączoną
// bazą, więc zapytania bez prefiksu po cichu trafiałyby w martwą kopię w michal.db.
// REFERENCES players(id) w starym DDL usuwamy przy przenoszeniu — SQLite nie
// pozwala na klucze obce między różnymi plikami bazy, a i tak nie były egzekwowane
// (brak PRAGMA foreign_keys = ON), więc to czysta kosmetyka schematu.
(function migrateSnakesToOwnDbFile() {
  const oldTables = db.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'sl_%'`
  ).all();
  if (oldTables.length === 0) return;
  let moved = 0;
  transaction(() => {
    for (const { name, sql } of oldTables) {
      const alreadyMoved = db.prepare(
        `SELECT COUNT(*) AS c FROM snakes.sqlite_master WHERE type = 'table' AND name = ?`
      ).get(name).c > 0;
      if (alreadyMoved) continue;
      const newSql = sql
        .replace(/^CREATE TABLE\s+/i, 'CREATE TABLE snakes.')
        .replace(/\s*REFERENCES\s+players\s*\([^)]*\)/gi, '');
      db.exec(newSql);
      db.exec(`INSERT INTO snakes.${name} SELECT * FROM main.${name}`);
      db.exec(`DROP TABLE main.${name}`);
      moved++;
    }
  });
  if (moved > 0) {
    console.log(`Snakes & Ladders: przeniesiono ${moved} tabel(e) z michal.db do własnego pliku snakes.db`);
  }
})();

// ── SCHEMAT (addytywny, CREATE IF NOT EXISTS — nie rusza tabel Wordle) ──
db.exec(`
  -- Stan gracza w Wężach i Drabinach
  CREATE TABLE IF NOT EXISTS snakes.sl_state (
    player_id         INTEGER PRIMARY KEY,
    abs_pos           INTEGER DEFAULT 0,   -- łączny przebyty dystans (pól od startu)
    laps              INTEGER DEFAULT 0,   -- ukończone okrążenia
    balance           INTEGER DEFAULT 0,   -- punkty do wydania w sklepie
    total_points      INTEGER DEFAULT 0,   -- suma zdobytych punktów (leaderboard)
    last_move_date    TEXT,                -- YYYY-MM-DD (Europe/Warsaw) ostatniego ruchu
    last_move_at      DATETIME,            -- dokładny moment ostatniego ruchu (zapis, nie blokada)
    has_avatar        INTEGER DEFAULT 0,   -- 1 = ma zdjęcie profilowe (wymagane do gry)
    avatar_updated_at DATETIME,            -- kiedy ostatnio wgrał/zmienił zdjęcie
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Konfiguracja wspólnej planszy: typ pola i (dla węża/drabiny) cel skoku.
  CREATE TABLE IF NOT EXISTS snakes.sl_board (
    position INTEGER PRIMARY KEY,       -- 0..(liczba pól aktywnego sezonu - 1)
    kind     TEXT NOT NULL,             -- 'ladder' | 'snake' | 'bonus' | 'fork'
    target   INTEGER,                   -- pole docelowe (ladder/snake), NULL dla bonus
    value    INTEGER DEFAULT 0          -- punkty bonusowe (bonus), 0 dla ladder/snake
  );

  -- Dziennik ruchów — blokada „SL_DAILY_ROLLS ruchów dziennie" przez
  -- UNIQUE(player_id, move_date, move_seq): move_seq numeruje kolejne ruchy tego
  -- samego dnia (1, 2, ...), więc każdy z dziennych ruchów dostaje własny wiersz.
  CREATE TABLE IF NOT EXISTS snakes.sl_moves (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id  INTEGER,
    move_date  TEXT NOT NULL,           -- YYYY-MM-DD (Europe/Warsaw)
    move_seq   INTEGER NOT NULL DEFAULT 1, -- który to ruch danego dnia (1, 2, ...)
    rolls      TEXT DEFAULT '[]',       -- JSON: rzucone wartości (1 lub 2 przy Extra Move)
    from_abs   INTEGER,
    to_abs     INTEGER,
    points     INTEGER DEFAULT 0,
    note       TEXT,                    -- np. 'frozen', 'ladder', 'snake', 'bonus'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, move_date, move_seq)
  );

  -- Ekwipunek power-upów (ile sztuk danego typu ma gracz).
  CREATE TABLE IF NOT EXISTS snakes.sl_inventory (
    player_id INTEGER,
    type      TEXT NOT NULL,            -- 'freeze' | 'curse' | 'double_move' | 'shield'
    qty       INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, type)
  );

  -- Aktywne efekty power-upów oczekujące na „następną turę" celu.
  -- Shield leży tu jako 'pending' aż do momentu, w którym zablokuje cudzy atak.
  CREATE TABLE IF NOT EXISTS snakes.sl_effects (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    target_player_id INTEGER,
    source_player_id INTEGER,
    type             TEXT NOT NULL,     -- 'freeze' | 'curse' | 'double_move' | 'shield'
    variant          INTEGER,           -- dla 'curse': 1..3 (który wariant); inaczej NULL
    status           TEXT DEFAULT 'pending',  -- 'pending' | 'consumed' | 'blocked'
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    consumed_at      DATETIME
  );

  -- Klucz-wartość na ustawienia trybu (rozmiar planszy do migracji, przełączniki Discorda…)
  CREATE TABLE IF NOT EXISTS snakes.sl_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Tabele walki z bossem (sl_coop, sl_coop_contributions, sl_boss_payouts) zakłada
  -- lib/boss.js przez initSchema() — patrz podpięcie modułu niżej.

  -- Rozbicie ZDOBYTYCH PUNKTÓW na kategorie. Osobna tabela, a nie liczniki na sl_state,
  -- bo gra ma pięć różnych ścieżek cofania (cały dzień, pojedynczy ruch, nagrody bossa,
  -- reset gry, wyczyszczenie gracza) — licznik przy każdej z nich rozjechałby się po cichu
  -- i nikt by tego nie zauważył. Wiersze da się skasować dokładnie tak samo, jak cofa się
  -- to, co je stworzyło: po dniu (kolumna "day") albo po konkretnym ruchu (kolumna "ref").
  --
  -- Rozbicie liczy się WYŁĄCZNIE od wdrożenia tej tabeli. Punkty zdobyte wcześniej nie
  -- są tu policzone i nie da się ich rzetelnie odtworzyć (patrz slPointsBreakdownMap),
  -- więc UI pokazuje różnicę jako osobną pozycję „sprzed podziału" — dzięki temu suma
  -- kategorii ZAWSZE zgadza się co do punktu z total_points, zamiast kłamać.
  CREATE TABLE IF NOT EXISTS snakes.sl_points_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id  INTEGER NOT NULL,
    day        TEXT NOT NULL,           -- YYYY-MM-DD (Europe/Warsaw), do cofania dnia
    category   TEXT NOT NULL,           -- 'dice' | 'bonus' | 'knockback' | 'boss'
    points     INTEGER NOT NULL,
    ref        TEXT,                    -- 'move:<id>' dla dice/bonus — do cofania ruchu
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS snakes.idx_points_log_player ON sl_points_log(player_id, category);
  CREATE INDEX IF NOT EXISTS snakes.idx_points_log_day ON sl_points_log(day);

  -- Dziennik aktywności (ruchy + sklep + walka z bossem + knockback) — widoczny dla
  -- wszystkich, do przeglądania "kto co zrobił którego dnia" w prawej kolumnie UI.
  -- Kolumna "detail" to ZAWSZE oryginał zapisany przez grę; to, co widzą gracze, składa
  -- moderacja widoku (patrz slPublicActivity) — nic tu nie jest nadpisywane.
  CREATE TABLE IF NOT EXISTS snakes.sl_activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id  INTEGER,
    type       TEXT NOT NULL,   -- 'roll' | 'shop_buy' | 'shop_use' | 'knockback' | 'boss_hit' | 'avatar'
    detail     TEXT NOT NULL,
    day        TEXT NOT NULL,   -- YYYY-MM-DD wg Europe/Warsaw (do grupowania/filtrowania)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Reguły moderacji widoku dziennika: chowają albo podmieniają treść wpisów PASUJĄCYCH
  -- do kombinacji (typ, gracz, zakres dni, fragment tekstu). Puste pole = "dowolny",
  -- więc reguła bez żadnego dopasowania łapie wszystko. Nic nie kasują i niczego nie
  -- zapisują we wpisach — działają przy odczycie, więc wyłączenie reguły (enabled = 0)
  -- natychmiast przywraca wpisy w niezmienionej postaci (patrz slActivityHiddenSql).
  CREATE TABLE IF NOT EXISTS snakes.sl_activity_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    enabled         INTEGER DEFAULT 1,
    action          TEXT NOT NULL DEFAULT 'hide',  -- 'hide' | 'redact'
    replacement     TEXT,                          -- tekst pokazywany zamiast oryginału ('redact')
    match_type      TEXT,                          -- NULL = dowolny typ wpisu
    match_player_id INTEGER,                       -- NULL = dowolny gracz
    match_day_from  TEXT,                          -- NULL = bez dolnej granicy (YYYY-MM-DD)
    match_day_to    TEXT,                          -- NULL = bez górnej granicy
    match_text      TEXT,                          -- fragment treści, NULL = dowolna
    note            TEXT,                          -- po co ta reguła — notatka dla admina
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// sl_state powstał już wcześniej niż zdjęcia profilowe w tym projekcie — dołóż kolumny
// dla istniejących wdrożeń (musi być PO utworzeniu tabeli, stąd nie przy graczach/games wyżej).
ensureColumn('sl_state', 'has_avatar', 'INTEGER DEFAULT 0');
ensureColumn('sl_state', 'avatar_updated_at', 'DATETIME');
// Ile z dziennego limitu ruchów (SL_DAILY_ROLLS) gracz już zużył — liczone dla dnia
// zapisanego w last_move_date; przy zmianie dnia licznik efektywnie wraca do zera
// (patrz slRollsUsedToday), więc kolumna nie musi być sama w sobie zerowana o północy.
ensureColumn('sl_state', 'rolls_today', 'INTEGER DEFAULT 0');
// Dokładny moment ostatniego ruchu — sam w sobie niczego nie blokuje (odstęp między
// ruchami zniknął), zostaje jako ślad w danych i pod ewentualne statystyki.
ensureColumn('sl_state', 'last_move_at', 'DATETIME');
// Dodatkowe ruchy PONAD dzienny limit, przyznane przez Extra Move (patrz
// slDailyRollsFor). Ważne wyłącznie w dniu z extra_rolls_date — nazajutrz licznik
// jest ignorowany, więc niewykorzystane sloty przepadają razem z resztą limitu.
ensureColumn('sl_state', 'extra_rolls', 'INTEGER DEFAULT 0');
ensureColumn('sl_state', 'extra_rolls_date', 'TEXT');

// Drożyzna ma TRZY stany, nie dwa, i ta kolumna trzyma ten środkowy:
//   1. wisi ukryta      — revealed_at NULL, ceny w sklepie bazowe, gracz nic nie wie,
//   2. ujawniona        — revealed_at ustawione pierwszą PRÓBĄ zakupu (która nie obciąża
//                         konta), ceny pokazane i pobierane w podwyżce,
//   3. zużyta           — status 'consumed' po zakupie, ceny wracają.
// Bez stanu 2 trzeba było wybierać między „witryna kłamie o cenie" a „klątwa zdradza się
// sama, zanim odpali". Ten stan pozwala mieć jedno i drugie: cena nigdy nie kłamie,
// bo dopóki klątwa jest ukryta, NIC nie zostaje pobrane.
ensureColumn('sl_effects', 'revealed_at', 'DATETIME');

// Kolumny bossa dokłada lib/boss.js (initSchema).

// Klucz TURY: wszystkie wpisy z jednego rzutu (sam rzut, klątwa, zbicia, trafienie bossa)
// dostają ten sam `ref`, żeby front mógł je narysować jako JEDEN blok. Bez tego dziennik
// był ścianą jednakowych wierszy z tą samą godziną i różnymi nickami — nie dało się
// zobaczyć, gdzie kończy się jedna tura, a zaczyna następna.
ensureColumn('sl_activity', 'ref', 'TEXT');
// Rozwidlona drabina (kind 'fork'): `target` to cel przy trafionych oczkach, `alt_target`
// przy pozostałych, `faces` to lista zwycięskich oczek jako tekst "3,6".
ensureColumn('sl_board', 'alt_target', 'INTEGER');
ensureColumn('sl_board', 'faces', 'TEXT');
ensureColumn('sl_activity', 'visibility', 'TEXT');
ensureColumn('sl_activity', 'public_detail', 'TEXT');

// ── MIGRACJA (jednorazowa): KLUCZ TURY DLA STAREJ HISTORII ──
// Wpisy sprzed wprowadzenia `ref` renderowałyby się pojedynczo, czyli cała dotychczasowa
// historia zostałaby ścianą wierszy, a od wdrożenia w dół nagle zaczęłyby się bloki.
// Da się to odtworzyć, bo CAŁY rzut leci w JEDNEJ transakcji — wpisy jednej tury są więc
// ciągłe w numeracji `id` i nie mogą się przepleść z cudzym rzutem. Układ jest stały:
//
//     [zbicia z kaskadą]  🎲 rzut  [klątwa]  [trafienie bossa]
//
// Kotwicą jest wpis o rzucie; to, co stoi tuż PRZED nim (zbicia) i tuż PO nim (klątwa,
// boss), należy do tej samej tury. Wszystko inne zostaje samodzielnym wierszem.
//
// Rozpoznanie kotwicy po emoji na początku treści jest tu WYJĄTKIEM od zasady „nie
// filtruj po treści wpisu" i jest bezpieczne: zasada chroni przed zdradzeniem CELU ataku
// (patrz komentarz przy renderActivity), a tu tylko rysujemy ramki wokół wierszy, które
// i tak są publiczne. Starsze klątwy miały typ 'roll' zamiast 'curse_fired', więc po
// samym typie nie dałoby się odróżnić rzutu od klątwy.
(function backfillActivityTurnRefs() {
  const FLAG = 'activity_turn_ref_backfill_done';
  if (slMetaGet(FLAG)) return;

  const updated = transaction(() => {
    slMetaSet(FLAG, new Date().toISOString());
    const rows = db.prepare(
      'SELECT id, type, detail FROM sl_activity WHERE ref IS NULL ORDER BY id'
    ).all();
    if (!rows.length) return 0;

    const isAnchor = r => r.type === 'roll' && (r.detail.startsWith('🎲') || r.detail.startsWith('❄️'));
    // Skutki rzutu zapisywane PO nim: klątwa (dziś 'curse_fired', dawniej 'roll' z 💀)
    // i trafienie bossa. Ciąg urywa się na pierwszym wpisie innego rodzaju.
    const isAftermath = r => r.type === 'curse_fired' || r.type === 'boss_hit'
      || (r.type === 'roll' && r.detail.startsWith('💀'));

    const assign = db.prepare('UPDATE sl_activity SET ref = ? WHERE id = ?');
    let pending = [];   // zbicia czekające na swoją kotwicę
    let current = null; // ref tury, w której właśnie jesteśmy
    let count = 0;

    for (const r of rows) {
      if (isAnchor(r)) {
        current = `turn:backfill:${r.id}`;
        for (const p of pending) { assign.run(current, p.id); count++; }
        pending = [];
        assign.run(current, r.id); count++;
      } else if (current && isAftermath(r)) {
        assign.run(current, r.id); count++;
      } else if (r.type === 'knockback') {
        // Zbicia są zapisywane PRZED wpisem o rzucie, więc trafią do NASTĘPNEJ kotwicy.
        pending.push(r);
        current = null;
      } else {
        // Zakup, awatar, nagroda bossa — samodzielny wiersz. Domyka bieżącą turę i kasuje
        // bufor: zbicia bez kotwicy (np. gdy wpis o rzucie skasowano) zostają luzem.
        pending = [];
        current = null;
      }
    }
    return count;
  });

  if (updated > 0) {
    console.log(`Snakes: stara historia pogrupowana w tury — ${updated} wpisów dostało klucz. Leci tylko raz.`);
  }
})();

// ── MIGRACJA (jednorazowa): stare rozliczenia bossa też zwijają się w jeden blok ──
// Od teraz kamień milowy, wygrana i kara dostają wspólny `ref` przy zapisie (patrz
// slBossActivityRef w lib/boss.js). Stare wpisy go nie mają, a kara to kilkanaście
// identycznych wierszy naraz — dokładnie ta ściana, którą blok ma zwinąć.
//
// Jedno rozliczenie to jedna pętla w jednej transakcji, więc jego wpisy są ciągłe w `id`
// i mają ten sam początek treści sprzed „ — " („🎯 Boss zbity do 75%", „🏆 Boss
// pokonany", „💥 Boss zaatakował"). Kilka progów przekroczonych jednym ciosem różni się
// procentem, więc się nie skleją. Do tego limit czasu między wpisami — na wypadek, gdyby
// dwie kary z rzędu nie miały nic pomiędzy. Tak jak przy turach: treść służy tu tylko do
// narysowania ramki wokół publicznych wierszy, nie do rozpoznania celu ataku.
(function backfillBossRewardRefs() {
  const FLAG = 'activity_boss_ref_backfill_done';
  if (slMetaGet(FLAG)) return;

  const updated = transaction(() => {
    slMetaSet(FLAG, new Date().toISOString());
    const rows = db.prepare(
      'SELECT id, type, detail, ref, created_at FROM sl_activity ORDER BY id'
    ).all();
    const assign = db.prepare('UPDATE sl_activity SET ref = ? WHERE id = ?');
    const head = r => String(r.detail).split(' — ')[0];
    const ts = r => Date.parse(String(r.created_at).replace(' ', 'T') + 'Z') || 0;
    let count = 0;
    let run = [];
    const flush = () => {
      // Pojedynczy wpis zostaje samodzielnym wierszem — nie ma czego zwijać.
      if (run.length > 1) {
        const ref = `boss:backfill:${run[0].id}`;
        for (const r of run) { assign.run(ref, r.id); count++; }
      }
      run = [];
    };
    for (const r of rows) {
      const fits = r.type === 'boss_reward' && r.ref == null;
      const prev = run[run.length - 1];
      if (fits && prev && head(prev) === head(r) && Math.abs(ts(r) - ts(prev)) <= 5000) {
        run.push(r);
        continue;
      }
      flush();
      if (fits) run.push(r);
    }
    flush();
    return count;
  });

  if (updated > 0) {
    console.log(`Snakes: stare rozliczenia bossa zebrane w bloki — ${updated} wpisów dostało klucz. Leci tylko raz.`);
  }
})();

// sl_moves: stare wdrożenia mają UNIQUE(player_id, move_date) — blokadę na WYŁĄCZNIE
// jeden ruch dziennie. Przy więcej niż jednym ruchu dziennie druga wstawka wywaliłaby
// błąd unikalności, więc trzeba przebudować tabelę (SQLite nie zmienia constraintów
// przez ALTER). Bezpieczne: to tylko dziennik/log, nie trzyma stanu gry (to sl_state).
(function migrateSlMovesUniqueConstraint() {
  const ddl = db.prepare(`SELECT sql FROM snakes.sqlite_master WHERE type='table' AND name='sl_moves'`).get();
  if (!ddl || !ddl.sql.includes('UNIQUE(player_id, move_date)') || ddl.sql.includes('move_seq')) return;
  transaction(() => {
    db.exec(`
      CREATE TABLE snakes.sl_moves_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id  INTEGER,
        move_date  TEXT NOT NULL,
        move_seq   INTEGER NOT NULL DEFAULT 1,
        rolls      TEXT DEFAULT '[]',
        from_abs   INTEGER,
        to_abs     INTEGER,
        points     INTEGER DEFAULT 0,
        note       TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, move_date, move_seq)
      );
      INSERT INTO sl_moves_new (id, player_id, move_date, move_seq, rolls, from_abs, to_abs, points, note, created_at)
        SELECT id, player_id, move_date, 1, rolls, from_abs, to_abs, points, note, created_at FROM sl_moves;
      DROP TABLE sl_moves;
      ALTER TABLE sl_moves_new RENAME TO sl_moves;
    `);
  });
  console.log('Snakes & Ladders: sl_moves przebudowane pod wiele ruchów dziennie (move_seq)');
})();

// Backfill rolls_today: gracze, którzy mieli już zapisany last_move_date PRZED tą
// aktualizacją, dostaliby świeżą kolumnę z DEFAULT 0 — czyli z powrotem PEŁNY dzienny
// limit, mimo że część już dziś zużyli. Liczymy rzeczywistą liczbę ruchów z sl_moves
// dla ich last_move_date i tym uzupełniamy. Bezpieczne uruchamiać przy każdym starcie:
// dotyka tylko wierszy z rolls_today=0, więc dla już poprawnie policzonych graczy to no-op.
db.exec(`
  UPDATE sl_state SET rolls_today = (
    SELECT COUNT(*) FROM sl_moves
    WHERE sl_moves.player_id = sl_state.player_id AND sl_moves.move_date = sl_state.last_move_date
  )
  WHERE last_move_date IS NOT NULL AND rolls_today = 0
`);

// Zapisuje wpis do dziennika aktywności. Wołane z ruchu, sklepu, walki z bossem i knockbacku.
// UWAGA: `detail` trafia do UI PO nicku i ikonie typu (patrz renderActivity w snakes.js),
// więc nie powtarzamy w nim ani jednego, ani drugiego — wpis ma być krótki jak nagłówek.
// ── ROZBICIE PUNKTÓW NA KATEGORIE ──
// Kolejność ma znaczenie — UI wypisuje kategorie dokładnie w tej kolejności.
const SL_POINT_CATEGORIES = ['dice', 'bonus', 'knockback', 'boss', 'season'];

// Dopisuje punkty do rozbicia. Wołane RAZEM z każdym dopisaniem do total_points — jeśli
// kiedyś dojdzie nowe źródło punktów, ma tu trafić także, inaczej po cichu wpadnie do puli
// „sprzed podziału" i nikt nie zauważy, że kategoria jest niepełna.
function slLogPoints(playerId, category, points, ref = null, day = null) {
  const pts = Math.round(Number(points) || 0);
  if (pts === 0) return;
  db.prepare('INSERT INTO sl_points_log (player_id, day, category, points, ref) VALUES (?, ?, ?, ?, ?)')
    .run(playerId, day || todayWaw(), category, pts, ref);
}

// Rozbicie dla WSZYSTKICH graczy jednym zapytaniem — payloady planszy i rankingu budują
// się dla kilkunastu graczy naraz, więc odpytywanie per gracz byłoby N+1.
function slPointsBreakdownMap() {
  const rows = db.prepare(
    'SELECT player_id, category, SUM(points) AS pts FROM sl_points_log GROUP BY player_id, category'
  ).all();
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.player_id)) map.set(r.player_id, {});
    map.get(r.player_id)[r.category] = Number(r.pts);
  }
  return map;
}

// Rozbicie JEDNEGO gracza, gotowe do wysłania. `pre_split` jest LICZONE jako reszta do
// total_points, a nie zapisywane — dzięki temu suma kategorii zgadza się co do punktu
// zawsze, także gdyby jakaś ścieżka cofania kiedyś minęła się z tabelą. Ujemna reszta
// (teoretycznie możliwa przy ręcznej korekcie punktów z panelu) jest przycinana do zera,
// żeby UI nie pokazywał bzdury.
function slPointsBreakdown(totalPoints, raw) {
  const out = {};
  let sum = 0;
  for (const cat of SL_POINT_CATEGORIES) {
    const v = Math.max(0, Number((raw || {})[cat]) || 0);
    out[cat] = v;
    sum += v;
  }
  out.pre_split = Math.max(0, Math.round(Number(totalPoints) || 0) - sum);
  return out;
}

// ── ROZBICIE NA SEZONY ──
// Granica sezonu to ID wiersza, a nie data: `season_points_floor` = ostatni wiersz
// sl_points_log sprzed przełączenia sezonu. Wszystko powyżej należy do bieżącego sezonu.
// Dzięki temu nie trzeba dopisywać kolumny ani dogrywać starych wierszy, a każda ścieżka
// cofania, która kasuje wiersze rozbicia, automatycznie poprawia też sezon. Reset gry
// granicy nie rusza: AUTOINCREMENT nie oddaje starych ID, więc nowe wiersze i tak lądują
// powyżej niej. Brak granicy = sezonu jeszcze nikt nie przełączał i cała gra to „ten sezon".
function slSeasonPointsFloor() {
  const v = slMetaGet('season_points_floor');
  return v == null ? null : Number(v);
}

// Nazwa tego, co było PRZED bieżącym sezonem — w dymku jedna suma, bez rozbicia. Pierwszy
// sezon (sprzed planszy-z-pliku) nazywa się „Snakes Game". Od drugiego przełączenia
// „wcześniej" to już kilka sezonów naraz, a ich nazw nigdzie nie trzymamy.
const SL_FIRST_SEASON_NAME = 'Snakes Game';

function slMarkSeasonStart() {
  if (slSeasonPointsFloor() != null) slMetaSet('season_prior_label', 'Poprzednie sezony');
  const last = db.prepare('SELECT MAX(id) AS m FROM sl_points_log').get().m;
  slMetaSet('season_points_floor', String(last == null ? 0 : Number(last)));
}

// Jak slPointsBreakdownMap, ale tylko wiersze bieżącego sezonu. null = brak granicy.
function slSeasonPointsMap() {
  const floor = slSeasonPointsFloor();
  if (floor == null) return null;
  const rows = db.prepare(
    'SELECT player_id, category, SUM(points) AS pts FROM sl_points_log WHERE id > ? GROUP BY player_id, category'
  ).all(floor);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.player_id)) map.set(r.player_id, {});
    map.get(r.player_id)[r.category] = Number(r.pts);
  }
  return map;
}

// Rozbicie gracza na „ten sezon" i „wcześniej". „Wcześniej" jest RESZTĄ (całość minus
// sezon), więc pula „sprzed podziału" i ręczne korekty z panelu lądują tam, a obie części
// zawsze sumują się do total_points. null, gdy sezonu jeszcze nie przełączano — wtedy
// front pokazuje samo rozbicie całościowe, jak dawniej.
function slPointsSeasonSplit(totalPoints, rawAll, rawSeason, seasonMap) {
  if (!seasonMap) return null;
  const all = slPointsBreakdown(totalPoints, rawAll);
  const season = {};
  const prior = {};
  let seasonSum = 0;
  let priorSum = 0;
  for (const cat of SL_POINT_CATEGORIES) {
    season[cat] = Math.max(0, Number((rawSeason || {})[cat]) || 0);
    prior[cat] = Math.max(0, all[cat] - season[cat]);
    seasonSum += season[cat];
    priorSum += prior[cat];
  }
  season.total = seasonSum;
  prior.total = Math.max(0, Math.round(Number(totalPoints) || 0) - seasonSum);
  prior.pre_split = Math.max(0, prior.total - priorSum);
  return { season, prior };
}

// ── DZIENNIK AKTYWNOŚCI ── zapis, klucze tur i moderacja widoku (lib/activity.js),
// razem z trasami: publiczną GET /api/snakes/activity i panelem admina od historii.
const {
  slLogActivity, slNewTurnRef
} = require('./lib/activity')({
  db, todayWaw, slMetaGet, slMetaSet, slAvatarUrl, app, checkAdmin
});

// ── SILNIK PLANSZY ── aktywny sezon, pola, ruch, rozstaje i zbicia (lib/board.js).
// Musi powstać przed aktywacją planszy przy starcie (slActivateBoardOnStartup niżej).
const {
  slSetBoard, slCurrentBoard, slTileOf, slBoardSize, slBoardPayload, slBoardMap, d6, slStepMove, slResolveTileEffect, slApplyKnockback, SL_POINTS_PER_PIP, SL_POINTS_PER_TILE, slLapPoints
} = require('./lib/board')({
  db, slBonusesOff, slLogPoints, slLogActivity, slMetaGet, SL_FIRST_SEASON_NAME
});

// ── META (klucz-wartość) ──
function slMetaGet(key) {
  const row = db.prepare('SELECT value FROM sl_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}
function slMetaSet(key, value) {
  db.prepare(`
    INSERT INTO sl_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

// ── SEZON PLANSZY ──
// sl_board to LUSTRO aktywnego pliku sezonu: przy każdym starcie i każdej zmianie sezonu
// kasujemy je i zaszczepiamy od nowa. Tabela nie trzyma stanu gracza (to robi sl_state),
// więc reseed jest bezpieczny — poprawka w pliku (np. przesunięty wąż) wchodzi po
// restarcie bez żadnej wersji układu. Dawne SL_BOARD_LAYOUT_VERSION i skalowanie pozycji
// ze 100 na 49 pól (slMigrateBoard) już się na produkcji wykonały i zostały usunięte.
function slSeedBoardRows(season) {
  db.exec('DELETE FROM sl_board');
  const insert = db.prepare('INSERT INTO sl_board (position, kind, target, value, alt_target, faces) VALUES (?, ?, ?, ?, ?, ?)');
  for (const t of season.tiles) {
    insert.run(t.position, t.kind, t.target, t.value, t.alt_target == null ? null : t.alt_target, t.faces ? t.faces.join(',') : null);
  }
}

// Nowy sezon = wszyscy na polu 0. Licznik okrążeń ZOSTAJE: laps i tak wyliczamy z abs_pos
// (floor(abs_pos / liczba pól)), więc „pole 0 okrążenia N" to dokładnie laps × nowy rozmiar.
// Punkty, coins i ekwipunek nietknięte.
// `season_move_floor` = ostatni ruch zagrany na poprzedniej planszy. Cofanie ruchu i dnia
// odmawia dla ruchów o id ≤ tej wartości: ich from_abs to pozycja na INNEJ planszy (inny
// rozmiar, inne pola), więc przywrócenie jej postawiłoby gracza w losowym miejscu.
function slResetPositionsToStart(newSize) {
  const upd = db.prepare('UPDATE sl_state SET abs_pos = ? WHERE player_id = ?');
  let n = 0;
  for (const st of db.prepare('SELECT player_id, laps FROM sl_state').all()) {
    upd.run(Number(st.laps) * newSize, st.player_id);
    n++;
  }
  const last = db.prepare('SELECT MAX(id) AS m FROM sl_moves').get().m;
  slMetaSet('season_move_floor', String(last == null ? 0 : Number(last)));
  return n;
}

function slSeasonMoveFloor() {
  return Number(slMetaGet('season_move_floor') || 0);
}

// Ustawia sezon jako aktywny (baza + pamięć). resetPositions = wszyscy na start.
// newSeason = admin ŚWIADOMIE zaczyna sezon (także ponownie ten sam) — wtedy od tego miejsca
// liczy się rozbicie punktów „ten sezon". Reset pozycji przy starcie po edycji pliku
// planszy sezonu nie zaczyna.
function slInstallBoardRows(season, resetPositions, newSeason) {
  slSeedBoardRows(season);
  const n = resetPositions ? slResetPositionsToStart(season.size) : 0;
  if (newSeason) slMarkSeasonStart();
  slMetaSet('active_board', season.id);
  slMetaSet('board_size', season.size);
  return n;
}

function slInstallBoard(season, resetPositions, newSeason = false) {
  const moved = transaction(() => slInstallBoardRows(season, resetPositions, newSeason));
  slSetBoard(season); // dopiero po udanej transakcji — przy błędzie zostaje stara plansza
  return moved;
}

// ── ZAMKNIĘCIE SEZONU ──
// Zdjęcie rankingu do archiwum, zerowanie gry i nowa plansza — w JEDNEJ transakcji, żeby
// żaden rzut nie wpadł pomiędzy archiwum a zerowanie. Zerujemy wszystko, co daje przewagę:
// punkty, coins, okrążenia, ekwipunek, czekające ataki i tarcze, dokupione dziś Extra Move.
// Zostają kostiumy (kosmetyka, zapłacone i tak) i dzienny licznik rzutów — zmiana sezonu
// w środku dnia nie ma dawać nikomu dodatkowych rzutów.
//
// Rozbicie punktów (sl_points_log) kasujemy w całości: suma starego sezonu żyje już
// w archiwum, a stare wiersze po wyzerowaniu total_points rozjechałyby dymek. Stąd też
// znika granica „ten sezon / wcześniej" — po zamknięciu wszystko w dymku to ten sezon.
//
// Plansza musi być nowa JUŻ w środku transakcji: slCloseFightForSeason startuje nowy cykl
// bossa, a ten czyta bossa sezonowego z aktywnej planszy.
function slCloseSeasonAndInstall(season) {
  const prev = slCurrentBoard();
  try {
    return transaction(() => {
      const closure = crowning.archiveSeason({
        board: prev.id,
        name: slSeasonLabel(prev.id),
        moveFloor: slSeasonMoveFloor(),
        candies: seasonal.candyMap(),
        tileOf: slTileOf
      });
      db.exec(`
        UPDATE sl_state SET abs_pos = 0, laps = 0, balance = 0, total_points = 0,
          extra_rolls = 0, extra_rolls_date = NULL;
        DELETE FROM sl_inventory;
        DELETE FROM sl_effects WHERE status = 'pending';
        DELETE FROM sl_points_log;
        DELETE FROM sl_meta WHERE key = 'season_points_floor';
      `);
      // Gdyby admin przełączył potem planszę BEZ zamykania, dymek pokaże to jako „wcześniej".
      slMetaSet('season_prior_label', 'Poprzednia plansza');
      seasonal.resetAll(); // kocioł, cukierki na polach i rejestr — liczba cukierków jest w archiwum
      const moved = slInstallBoardRows(season, true, false);
      slSetBoard(season);
      const fight = boss.slCloseFightForSeason();
      return { closure, moved, fight };
    });
  } catch (e) {
    slSetBoard(prev);
    throw e;
  }
}

(function slActivateBoardOnStartup() {
  const wanted = slMetaGet('active_board') || seasons.DEFAULT_ID;
  let season = seasons.get(wanted);
  if (!season) {
    // Plik zniknął albo ma błąd (szczegóły w logu wyżej, z lib/seasons.js). Wracamy na
    // plansze podstawową zamiast wstać bez planszy.
    console.error(`Snakes & Ladders: sezon "${wanted}" niedostępny — wracam na "${seasons.DEFAULT_ID}"`);
    season = seasons.get(seasons.DEFAULT_ID);
  }
  // Brak board_size = świeża instalacja, nikt jeszcze nie stoi na planszy. Reset pozycji
  // tylko wtedy, gdy plansza pod graczami faktycznie się zmieniła: inny sezon niż zapisany
  // (fallback wyżej) albo ten sam plik po edycji ma inną liczbę pól — wtedy stare numery
  // pól mogłyby w ogóle nie istnieć.
  const storedSize = slMetaGet('board_size');
  const changed = storedSize != null && (season.id !== wanted || Number(storedSize) !== season.size);
  const moved = slInstallBoard(season, changed);
  console.log(`Snakes & Ladders: sezon "${season.id}" (${season.name}) — ${season.size} pól, siatka ${season.cols}×${season.rows}`
    + (season.testing ? ' [W TESTACH]' : '')
    + (changed ? `; plansza się zmieniła, ${moved} graczy wraca na pole 0` : ''));
  // Sezon po premierze (bez `testing`) nie powinien zmieniać liczby pól bez migracji:
  // reset pozycji to jeszcze nic, ale rozbicie punktów, cukierki na polach i historia
  // ruchów odnoszą się do starych numerów. Głośno w logu, żeby nie przeszło niezauważone.
  if (changed && !season.testing) {
    console.error(`Snakes & Ladders: UWAGA — liczba pól sezonu "${season.id}" zmieniła się po premierze (${storedSize} → ${season.size}). Czy była do tego migracja?`);
  }
})();

// Zwraca (i w razie potrzeby tworzy) rekord stanu gracza.
function slEnsureState(playerId) {
  let st = db.prepare('SELECT * FROM sl_state WHERE player_id = ?').get(playerId);
  if (!st) {
    db.prepare('INSERT INTO sl_state (player_id) VALUES (?)').run(playerId);
    st = db.prepare('SELECT * FROM sl_state WHERE player_id = ?').get(playerId);
  }
  return st;
}

function slInventory(playerId) {
  const rows = db.prepare('SELECT type, qty FROM sl_inventory WHERE player_id = ?').all(playerId);
  const inv = {};
  for (const t of SL_POWERUP_TYPES) inv[t] = 0;
  for (const r of rows) if (r.type in inv) inv[r.type] = Number(r.qty);
  return inv;
}

function slAddPowerup(playerId, type, delta) {
  db.prepare(`
    INSERT INTO sl_inventory (player_id, type, qty) VALUES (?, ?, ?)
    ON CONFLICT(player_id, type) DO UPDATE SET qty = qty + ?
  `).run(playerId, type, delta, delta);
}

// Ile ruchów ma DZIŚ dany gracz: bazowy limit plus dodatkowe sloty kupione Extra
// Move'em. Dodatki liczą się tylko w dniu, w którym power-up został użyty — inny dzień
// (albo pusta data) znaczy zero, więc kolumny nie trzeba zerować o północy. `st` to
// wiersz sl_state (wystarczą kolumny extra_rolls i extra_rolls_date).
function slDailyRollsFor(st, today) {
  const extra = st && st.extra_rolls_date === today ? Number(st.extra_rolls || 0) : 0;
  return SL_DAILY_ROLLS + Math.max(0, extra);
}

// URL zdjęcia profilowego gracza — z parametrem wersji (data ostatniej zmiany), żeby
// przeglądarki od razu widziały nowe zdjęcie po re-uploadzie, a nie stare z cache'u.
// null, gdy gracz jeszcze nie wgrał zdjęcia (avatar_updated_at puste).
function slAvatarUrl(playerId, avatarUpdatedAt) {
  if (!avatarUpdatedAt) return null;
  const v = Date.parse(avatarUpdatedAt.replace(' ', 'T') + 'Z') || Date.now();
  return `/avatars/${playerId}.jpg?v=${v}`;
}

// ── MIGRACJA (jednorazowa): retroaktywne dogranie punktów za kradzieże przy
// wypchnięciu sprzed naprawy total_points wyżej w slApplyKnockback — do tej pory
// skradzione monety trafiały tylko na balance, nigdy na total_points (ranking).
// Nie ma osobnej, ustrukturyzowanej tabeli z historią kradzieży — jedyny ślad to
// wolny tekst w sl_activity ("💰 Zbiłeś X i zgarnąłeś N monet!"), więc parsujemy
// go regexem. Zabezpieczone znacznikiem w sl_meta — leci raz, kolejne restarty
// serwera to no-op (patrz też migracja układu planszy wyżej, ten sam wzorzec).
// UWAGA: szukamy słowa "monet", a nie "coins", CELOWO. Waluta nazywa się dziś coins,
// ale ta migracja czyta wpisy sprzed tej zmiany nazwy — i tylko takie ma naprawiać.
// Podmiana na "coins" sprawiłaby, że nie znajdzie niczego.
(function backfillKnockbackPoints() {
  if (slMetaGet('knockback_points_backfilled') === '1') return;
  const rows = db.prepare(
    `SELECT player_id, detail FROM sl_activity WHERE type = 'knockback' AND detail LIKE '%zgarnąłeś%monet%'`
  ).all();
  const totals = new Map();
  for (const row of rows) {
    const match = row.detail.match(/zgarnąłeś (\d+) monet/);
    if (!match) continue;
    const amount = Number(match[1]);
    totals.set(row.player_id, (totals.get(row.player_id) || 0) + amount);
  }
  if (totals.size > 0) {
    transaction(() => {
      const upd = db.prepare('UPDATE sl_state SET total_points = total_points + ? WHERE player_id = ?');
      for (const [playerId, amount] of totals) {
        if (amount > 0) upd.run(amount, playerId);
      }
    });
    const totalAmount = [...totals.values()].reduce((a, b) => a + b, 0);
    console.log(`Snakes & Ladders: dograno retroaktywnie ${totalAmount} pkt za kradzieże przy wypchnięciu (${totals.size} graczy)`);
  }
  slMetaSet('knockback_points_backfilled', '1');
})();

// ── MIGRACJA (jednorazowa): Extra Move przestał być efektem czekającym na następną
// turę (dwie kostki w jednym ruchu) — teraz dokłada osobny ruch od ręki, w momencie
// użycia. Wpisy, które zostały w kolejce jako 'pending', nigdy by już nie odpaliły,
// więc oddajemy graczom power-up do ekwipunku, żeby wykorzystali go na nowych zasadach.
(function migrateDoubleMoveToInstant() {
  if (slMetaGet('double_move_instant_migrated')) return;
  const stale = db.prepare(
    `SELECT id, target_player_id FROM sl_effects WHERE type = 'double_move' AND status = 'pending'`
  ).all();
  if (stale.length) {
    transaction(() => {
      for (const e of stale) {
        db.prepare(`UPDATE sl_effects SET status = 'refunded', consumed_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(e.id);
        slAddPowerup(e.target_player_id, 'double_move', 1);
        slLogActivity(e.target_player_id, 'shop_use',
          '⏩ Extra Move wrócił do ekwipunku — nowe zasady: daje dodatkowy ruch od ręki, nie dwie kostki w turze.');
      }
    });
    console.log(`Snakes: oddano ${stale.length} niewykorzystanych Extra Move do ekwipunku (nowe zasady)`);
  }
  slMetaSet('double_move_instant_migrated', '1');
})();


// Pozycje wszystkich graczy na wspólnej planszy (widoczne dla każdego).
// TYLKO gracze ze zdjęciem profilowym — bez zdjęcia nie widać ich na planszy i nie da
// się ich wskazać jako celu power-upa (has_avatar = 1 w WHERE). To lustrzane odbicie
// bramki na rzut (patrz POST /api/snakes/roll): kto nie wgrał zdjęcia, ten "nie gra".
// Ile PEŁNYCH dni roboczych gracz przepuścił bez rzutu: dni pon–pt ściśle między ostatnim
// ruchem a dzisiaj. Dzisiaj się nie liczy — do 16:00 każdy ma jeszcze czas. Gracz, który
// nigdy nie rzucał, dostaje wartość „dużo", bo po prostu nie gra.
// Na tym stoją duchy na planszy (patrz ghost_after_days w pliku sezonu) — to czysty wygląd,
// nic w grze od tego nie zależy.
function slMissedWorkdays(lastMoveDate, today) {
  if (!lastMoveDate) return 99;
  const [y, m, d] = lastMoveDate.split('-').map(Number);
  let cur = Date.UTC(y, m - 1, d);
  let missed = 0;
  for (let i = 0; i < 60; i++) {
    cur += 24 * 60 * 60 * 1000;
    const day = new Date(cur).toISOString().slice(0, 10);
    if (day >= today) break;
    if (!isWeekendStr(day)) missed++;
  }
  return missed;
}

function slPlayersPayload(meId) {
  const rows = db.prepare(`
    SELECT s.player_id, p.nickname, s.abs_pos, s.laps, s.total_points, s.balance, s.last_move_date, s.rolls_today,
           s.extra_rolls, s.extra_rolls_date, s.avatar_updated_at
    FROM sl_state s JOIN players p ON p.id = s.player_id
    WHERE s.has_avatar = 1
    ORDER BY s.total_points DESC, s.abs_pos DESC
  `).all();
  const today = todayWaw();
  // Jedno zapytanie na wszystkie tarcze zamiast N zapytań w pętli.
  const shielded = new Set(db.prepare(
    `SELECT DISTINCT target_player_id AS id FROM sl_effects WHERE type = 'shield' AND status = 'pending'`
  ).all().map(r => r.id));
  // Też jednym zapytaniem na wszystkich — inaczej byłoby N+1 przy kilkunastu pionkach.
  const breakdown = slPointsBreakdownMap();
  const seasonPts = slSeasonPointsMap();
  const worn = costumes.slWornMap();
  return rows.map(r => {
    const rollsUsedToday = r.last_move_date === today ? Number(r.rolls_today) : 0;
    const dailyRolls = slDailyRollsFor(r, today);
    return {
      player_id: r.player_id,
      nickname: r.nickname,
      avatar_url: slAvatarUrl(r.player_id, r.avatar_updated_at),
      missed_workdays: slMissedWorkdays(r.last_move_date, today),
      costume: worn.get(r.player_id) || {},
      tile: slTileOf(r.abs_pos),
      abs_pos: Number(r.abs_pos),
      laps: Number(r.laps),
      total_points: Number(r.total_points),
      // Rozbicie punktów na kategorie — do dymka po najechaniu na pionek.
      points_breakdown: slPointsBreakdown(r.total_points, breakdown.get(r.player_id)),
      points_split: slPointsSeasonSplit(r.total_points, breakdown.get(r.player_id), seasonPts && seasonPts.get(r.player_id), seasonPts),
      moved_today: rollsUsedToday >= dailyRolls,
      rolls_used_today: rollsUsedToday,
      rolls_remaining_today: Math.max(0, dailyRolls - rollsUsedToday),
      // Tarcza jest widoczna TYLKO u siebie — innym graczom nie zdradzamy, kto ma
      // tarczę, żeby dało się kogoś zaskoczyć Freeze/Curse (patrz też slBuildState → me).
      has_shield: (meId && r.player_id === meId) ? shielded.has(r.player_id) : false,
      is_me: meId ? r.player_id === meId : false
    };
  });
}


function slLeaderboard(meId) {
  const rows = db.prepare(`
    SELECT s.player_id, p.nickname, s.total_points, s.laps, s.abs_pos, s.balance
    FROM sl_state s JOIN players p ON p.id = s.player_id
    ORDER BY s.total_points DESC, s.laps DESC, s.abs_pos DESC
  `).all();
  const breakdown = slPointsBreakdownMap();
  const seasonPts = slSeasonPointsMap();
  // Polowanie na cukierki (sezon z events.candy) nie ma osobnego rankingu — liczba 🍬
  // stoi w wierszu gracza obok punktów. null = sezon bez cukierków.
  const candies = seasonal.candyMap();
  // Medale za podium zamkniętych sezonów — przy nicku, niezależnie od bieżących punktów.
  const medals = crowning.medalsMap();
  return rows.map((r, i) => ({
    rank: i + 1,
    candies: candies ? (candies.get(r.player_id) || 0) : null,
    medals: medals.get(r.player_id) || [],
    player_id: r.player_id,
    nickname: r.nickname,
    total_points: Number(r.total_points),
    points_breakdown: slPointsBreakdown(r.total_points, breakdown.get(r.player_id)),
    points_split: slPointsSeasonSplit(r.total_points, breakdown.get(r.player_id), seasonPts && seasonPts.get(r.player_id), seasonPts),
    laps: Number(r.laps),
    tile: slTileOf(r.abs_pos),
    is_me: meId ? r.player_id === meId : false
  }));
}

// ══ WYDARZENIE KOOPERACYJNE ══
// Gracze dobrowolnie dorzucają punkty ze swojego salda do WSPÓLNEJ puli. Pula jest
// osobnym workiem — nie miesza się z saldem na power-upy i nie da się jej wypłacić.
// Po przekroczeniu progu rusza event „bossowy" (mechanika = stub do uzupełnienia),
// a po jego zakończeniu kontrybutorzy dostają nagrody wg wybranego podziału.


// ══ DISCORD — SZYNA ZDARZEŃ ══
// Zdarzenia gry lecą przez jedną szynę: każdy typ ma własny przełącznik, trzymany
// w sl_meta (klucz 'discord_events'), więc da się je włączać/wyłączać z panelu admina
// bez restartu. Webhook bierzemy z SNAKES_DISCORD_WEBHOOK_URL, a gdy go nie ma —
// z DISCORD_WEBHOOK_URL (ten sam, co Wordle). Wysyłka jest „fire & forget":
// błąd Discorda nigdy nie wywraca ruchu gracza.
const SL_DISCORD_WEBHOOK_URL = process.env.SNAKES_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
const SNAKES_URL = (process.env.APP_URL || 'https://frog03-21535.wykr.es/').replace(/\/+$/, '') + '/snakes';

// Domyślnie ON to rzeczy „warte pingu": ataki, tarcze, węże/drabiny, kamienie milowe
// co-opu i dzienne podsumowanie. Codzienny wynik każdego rzutu i Extra Move są
// domyślnie OFF, żeby nie zasypywać kanału.
const SL_EVENT_DEFAULTS = {
  roll_result:        false,
  tile_landing:       true,
  powerup_freeze:     true,
  powerup_curse:      true,
  shield_block:       true,
  double_move:        false,
  knockback:          true,
  coop_milestone:     true,
  coop_completed:     true,
  leaderboard_daily:  true
};

const SL_EVENT_LABELS = {
  roll_result:        'Wynik dziennego rzutu',
  tile_landing:       'Wejście na węża / drabinę',
  powerup_freeze:     'Użycie Freeze (kto na kogo)',
  powerup_curse:      'Klątwy (rzucenie — bez celu i wariantu; odpalenie)',
  shield_block:       'Shield zablokował atak',
  double_move:        'Użycie Extra Move',
  knockback:          'Wypchnięcie z zajętego pola (i efekt domina)',
  coop_milestone:     'Pula co-op przekroczyła próg',
  coop_completed:     'Wydarzenie co-op ukończone (nagrody wypłacone, kolejna edycja rusza)',
  leaderboard_daily:  'Dzienne podsumowanie rankingu'
};

function slEventsConfig() {
  let stored = {};
  try {
    stored = JSON.parse(slMetaGet('discord_events') || '{}');
  } catch {
    stored = {};
  }
  const cfg = {};
  for (const key of Object.keys(SL_EVENT_DEFAULTS)) {
    cfg[key] = typeof stored[key] === 'boolean' ? stored[key] : SL_EVENT_DEFAULTS[key];
  }
  return cfg;
}

function slSetEventsConfig(patch) {
  const cfg = slEventsConfig();
  for (const [key, val] of Object.entries(patch || {})) {
    if (key in SL_EVENT_DEFAULTS) cfg[key] = !!val;
  }
  slMetaSet('discord_events', JSON.stringify(cfg));
  return cfg;
}

function slEventEnabled(type) {
  return slEventsConfig()[type] === true;
}

async function slPostDiscord(payload) {
  if (!SL_DISCORD_WEBHOOK_URL) return { skipped: 'brak webhooka' };
  const r = await fetch(SL_DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Discord ${r.status}: ${await r.text()}`);
  return { sent: true };
}

// Główny punkt wejścia szyny. `build` to funkcja zwracająca treść (leniwie — nie
// budujemy wiadomości, gdy zdarzenie jest wyłączone). Nigdy nie rzuca wyjątkiem.
function slEmit(type, build) {
  try {
    if (!SL_DISCORD_WEBHOOK_URL) return;
    if (!slEventEnabled(type)) return;
    const content = build();
    if (!content) return;
    slPostDiscord(typeof content === 'string' ? { content } : content)
      .catch(err => console.error(`Snakes/Discord [${type}]:`, err.message));
  } catch (err) {
    console.error(`Snakes/Discord [${type}] — błąd budowania wiadomości:`, err.message);
  }
}

// ── DZIENNE PODSUMOWANIE RANKINGU ──
// Tykamy co minutę (jak scheduler Wordle) i raz dziennie, o SNAKES_SUMMARY_HOUR,
// wrzucamy skrót: podium, ilu graczy ruszyło się dziś, stan puli co-op.
const SL_SUMMARY_HOUR = parseInt(process.env.SNAKES_SUMMARY_HOUR, 10) || 20;
let slLastSummaryDate = null;

function slBuildDailySummary() {
  const today = todayWaw();
  const top = slLeaderboard(null).slice(0, 5);
  if (!top.length) return null;
  const movedToday = Number(db.prepare(
    'SELECT COUNT(*) AS c FROM sl_moves WHERE move_date = ?'
  ).get(today).c);
  const coop = boss.slCoopPayload(null);
  const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
  const lines = top.map((p, i) => `${medals[i]} **${p.nickname}** — ${p.total_points} pkt (okr. ${p.laps}, pole ${p.tile})`);
  return {
    content: '🐍 **Office Snakes & Ladders — podsumowanie dnia**',
    embeds: [{
      title: 'Ranking',
      url: SNAKES_URL,
      description: `${lines.join('\n')}\n\n🎲 Ruch dziś wykonało: **${movedToday}** ${movedToday === 1 ? 'osoba' : 'osób'}` +
        (coop && coop.boss ? `\n👹 **${coop.boss.name}** — HP ${coop.boss.hp}/${coop.boss.max_hp} (${coop.boss.percent}%)` : ''),
      color: 0xC8F135,
      footer: { text: 'Jeden ruch dziennie — nie zapomnij rzucić kostką!' }
    }]
  };
}

function startSnakesDiscordScheduler() {
  if (!SL_DISCORD_WEBHOOK_URL) {
    console.log('Snakes/Discord: brak webhooka (SNAKES_DISCORD_WEBHOOK_URL / DISCORD_WEBHOOK_URL) — zdarzenia wyłączone');
    return;
  }
  // Start po godzinie podsumowania = dzisiejsze uznajemy za wysłane (bez spamu po restarcie).
  if (Number(warsawParts().h) >= SL_SUMMARY_HOUR) slLastSummaryDate = todayWaw();

  setInterval(() => {
    const today = todayWaw();
    if (today === slLastSummaryDate) return;
    if (Number(warsawParts().h) < SL_SUMMARY_HOUR) return;
    slLastSummaryDate = today; // ustawiamy przed wysyłką — błąd sieci nie ma wracać co minutę
    slEmit('leaderboard_daily', slBuildDailySummary);
  }, 60_000);

  console.log(`Snakes/Discord: szyna zdarzeń aktywna, podsumowanie dnia o ${String(SL_SUMMARY_HOUR).padStart(2, '0')}:00 (Europe/Warsaw)`);
}
startSnakesDiscordScheduler();

// ══ WALKA Z BOSSEM (lib/boss.js) ══
// Podpinamy TUTAJ, a nie wyżej, bo moduł potrzebuje szyny Discorda (slEmit) i SNAKES_URL,
// a te powstają dopiero w tej sekcji. Helpery wstrzykujemy zamiast robić require w drugą
// stronę: inaczej byłby cykl server → boss → server, a przy jednym pliku bazy dwa
// niezależne uchwyty to proszenie się o „database is locked".
// `snakesUrl` i `buildState` idą jako funkcje, a nie wartości, bo obie są zdefiniowane
// niżej w pliku — opakowanie odracza sięgnięcie po nie do czasu realnego wywołania.
const boss = require('./lib/boss')({
  db, transaction, ensureColumn,
  slMetaGet, slMetaSet,
  slLogActivity, slLogPoints,
  slEnsureState,
  slEmit, postDiscord: slPostDiscord,
  snakesUrl: () => SNAKES_URL,
  todayWaw, addBusinessDaysMs,
  getSpecialBoss: () => slSpecialBossNow()
});
boss.initSchema();
boss.runStartupMigrations();
boss.registerRoutes(app, {
  authPlayer, checkAdmin,
  buildState: playerId => slBuildState(playerId)
});
boss.startDeadlineScheduler();

// Boss sezonowy (special_boss w pliku planszy) przeliczony na TEN rok: daty w pliku są
// bez roku, żeby sezon działał co roku bez zmian. `key` odróżnia edycje z różnych lat —
// Dynia z 2026 nie blokuje Dyni z 2027.
function slSpecialBossNow() {
  const sb = slCurrentBoard().special_boss;
  if (!sb) return null;
  const y = Number(todayWaw().slice(0, 4));
  const at = (mmdd, hour = 0) => {
    const [m, d] = mmdd.split('-').map(Number);
    return warsawWallTimeToMs(y, m, d, hour);
  };
  const [attackDay, attackHour] = sb.attack_at.split(' ');
  return {
    key: `${slCurrentBoard().id}-${y}`, name: sb.name, emoji: sb.emoji, hp_per_workday: sb.hp_per_workday,
    attackMs: at(attackDay, Number(attackHour))
  };
}

// ── KOSTIUMY ── czysta kosmetyka pionka za coins (lib/costumes.js). Ta sama fabryka co
// boss: helpery przychodzą w deps, jeden uchwyt bazy.
// Pierwszy sezon w UI nazywa się „Snakes Game", nie jak plik planszy (patrz dymek gracza).
function slSeasonLabel(id) {
  return id === seasons.DEFAULT_ID ? SL_FIRST_SEASON_NAME : ((seasons.get(id) || {}).name || id);
}

const costumes = require('./lib/costumes')({
  db, transaction, slLogActivity, slEnsureState, slMetaGet, slMetaSet,
  activeSeasonId: () => slCurrentBoard().id,
  seasonLabel: slSeasonLabel,
});
costumes.initSchema();
costumes.registerRoutes(app, { authPlayer, checkAdmin, buildState: playerId => slBuildState(playerId) });

// Silnik planszy (lib/board.js) powstaje wcześniej niż moduł sezonowy, więc o zdjęte bonusy
// (drzwi z hide_bonuses) pyta przez tę funkcję — po `seasonal` sięga dopiero w trakcie rzutu.
function slBonusesOff() { return seasonal.bonusesOff(); }

// ── MECHANIKI SEZONOWE ── kocioł, cukierek albo psikus, cukierki (lib/seasonal.js).
// Aktywną planszę podajemy funkcją, nie wartością — admin może zmienić sezon w locie.
const seasonal = require('./lib/seasonal')({
  db, transaction, slLogActivity, slLogPoints, slEmit, todayWaw, isWeekendStr,
  getSeason: slCurrentBoard, tileOf: slTileOf, boardSize: slBoardSize
});
seasonal.initSchema();

// ── ZAMKNIĘCIE SEZONU ── archiwum rankingu, medale, ukoronowanie (lib/crowning.js).
const crowning = require('./lib/crowning')({ db, ensureColumn, slAvatarUrl });
crowning.initSchema();
crowning.registerRoutes(app, { authPlayer });

// ── MIGRACJA (jednorazowa): DOŁADOWANIE „bank się pomylił" — każdy gracz dostaje
// SL_BANK_ERROR_GRANT coins do portfela. Jednorazowy prezent od admina przy okazji
// przemianowania waluty na coins, nie element mechaniki.
//
// To ŚWIADOMA EMISJA coins, czyli jedyne miejsce w grze, gdzie waluta powstaje poza
// rzutem kostką (patrz komentarz o pętli przy bossie wyżej). Jest bezpieczna dokładnie
// dlatego, że leci RAZ: flaga w sl_meta pilnuje, żeby restart serwera nie dosypywał
// kolejnej setki. Bez niej każdy deploy drukowałby graczom pieniądze.
//
// Punktów rankingowych NIE dotyka — coins i total_points to dwie różne wielkości i to
// rozdzielenie trzyma ekonomię (patrz slCoopContribReward).
const SL_BANK_ERROR_GRANT = 100;
(function grantBankErrorCoins() {
  const FLAG = 'bank_error_grant_100_done';
  if (slMetaGet(FLAG)) return;

  const granted = transaction(() => {
    slMetaSet(FLAG, new Date().toISOString());
    const players = db.prepare('SELECT id FROM players').all();
    const add = db.prepare('UPDATE sl_state SET balance = balance + ? WHERE player_id = ?');
    for (const p of players) {
      slEnsureState(p.id);
      add.run(SL_BANK_ERROR_GRANT, p.id);
      slLogActivity(p.id, 'bonus_grant',
        `🏦 Bank się pomylił — +${SL_BANK_ERROR_GRANT} coins dla wszystkich`);
    }
    return players.length;
  });

  console.log(`Snakes: doładowano ${SL_BANK_ERROR_GRANT} coins dla ${granted} ${granted === 1 ? 'gracza' : 'graczy'} („bank się pomylił") — leci tylko raz.`);

  // Ogłoszenie idzie DOPIERO po commicie transakcji i nigdy nie blokuje startu serwera:
  // jak Discord nie odpowie, coins i tak są przyznane, a flaga już ustawiona.
  if (granted > 0) {
    slPostDiscord({ content: `🏦 **Bank się pomylił, każdy otrzymuje ${SL_BANK_ERROR_GRANT} coins!**` })
      .catch(err => console.error('Snakes/Discord [bank_error_grant]:', err.message));
  }
})();


// Pełny stan gry dla gracza (wszystko, czego potrzebuje UI w jednym zapytaniu).
function slBuildState(playerId) {
  const st = slEnsureState(playerId);
  const shop = slShopPayload(playerId); // raz — sięga do bazy po oczekującą Drożyznę
  const today = todayWaw();
  // „Weekend" = dzień, w którym gra jest zamknięta z powodu weekendu. Z włączonymi w panelu
  // weekendami (testy) sobota i niedziela zachowują się jak zwykły dzień.
  const playHours = slPlayHours();
  const isWeekend = isWeekendStr(today) && !playHours.weekends;
  const rollsUsedToday = st.last_move_date === today ? Number(st.rolls_today) : 0;
  const dailyRolls = slDailyRollsFor(st, today);
  const rollsRemainingToday = Math.max(0, dailyRolls - rollsUsedToday);
  const officeOpen = slOfficeOpenAt();
  return {
    board: slBoardPayload(),
    players: slPlayersPayload(playerId),
    me: {
      player_id: playerId,
      tile: slTileOf(st.abs_pos),
      abs_pos: Number(st.abs_pos),
      laps: Number(st.laps),
      balance: Number(st.balance),
      total_points: Number(st.total_points),
      moved_today: rollsRemainingToday === 0,
      rolls_used_today: rollsUsedToday,
      rolls_remaining_today: rollsRemainingToday,
      daily_rolls: dailyRolls,
      extra_rolls_today: dailyRolls - SL_DAILY_ROLLS,
      is_weekend: isWeekend,
      office_open: officeOpen,
      office_start_hour: playHours.start,
      office_end_hour: playHours.end,
      office_closes_at: officeOpen ? new Date(slOfficeCloseMs()).toISOString() : null,
      next_move_at: new Date(slNextOpenMs()).toISOString(),
      can_roll: rollsRemainingToday > 0 && !!st.has_avatar && !isWeekend && officeOpen,
      has_shield: slHasShield(playerId),
      has_avatar: !!st.has_avatar,
      avatar_url: slAvatarUrl(playerId, st.avatar_updated_at)
    },
    inventory: slInventory(playerId),
    leaderboard: slLeaderboard(playerId),
    // Cennik jest PER GRACZ, bo Drożyzna podbija ceny tylko jemu (patrz slShopPayload).
    shop: shop.items,
    shop_price_curse: shop.price_curse,
    costumes: costumes.slCostumeShop(playerId),
    season_events: seasonal.payload(playerId),
    coop: boss.slCoopPayload(playerId),
    // Zamknięte sezony (zakładki w rankingu) i podium do obejrzenia raz po zamknięciu.
    seasons_archive: crowning.closures(),
    crowning: crowning.crowningFor(playerId),
    server_date: today
  };
}

// ── SKLEP I POWER-UPY ── cennik, klątwy, tarcza i trasy sklepu (lib/shop.js).
// Podpięte tu, a nie przy stałych, bo trasy potrzebują bossa, sezonu i stanu gracza.
const {
  SL_POWERUP_TYPES, slShopPayload, slHasShield, SL_CURSE_PRICE_VARIANT, slCurseAdjustRoll, SL_CURSE_COIN_STEAL, SL_CURSE_LABELS, SL_CURSE_DESCRIPTIONS, SL_POWERUP_COSTS, SL_POWERUP_LABELS
} = require('./lib/shop')({
  db, app, authPlayer, transaction, slEnsureState, slInventory, slAddPowerup, slLogActivity, slBuildState, slEmit, todayWaw, isWeekendStr, slPlayHours, slOfficeOpenAt, SL_MAX_EXTRA_ROLLS, SL_DAILY_ROLLS
});

// ── ENDPOINTY — SNAKES & LADDERS ──

// GET /api/snakes/state — pełny stan gry gracza (plansza, pozycje, sklep, ekwipunek…)
app.get('/api/snakes/state', authPlayer, (req, res) => {
  res.json(slBuildState(req.player.id));
});

// POST /api/snakes/avatar — wgraj/zmień zdjęcie profilowe (wymagane, żeby zagrać).
// Ciało to SUROWE bajty JPEG (Content-Type: application/octet-stream) — nie JSON —
// świadomie, żeby nie podnosić globalnego limitu express.json() (dzielonego z Wordle)
// tylko dla tego jednego, cięższego endpointu. Klient sam kadruje/kompresuje zdjęcie
// przez <canvas> przed wysyłką, więc 3 MB to zapas bezpieczeństwa, nie oczekiwany rozmiar.
const SL_AVATAR_MAX_BYTES = 3 * 1024 * 1024;
app.post('/api/snakes/avatar', authPlayer, express.raw({ type: '*/*', limit: SL_AVATAR_MAX_BYTES }), (req, res) => {
  const playerId = req.player.id;
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;

  // Minimalna walidacja "to naprawdę JPEG" po magicznych bajtach (0xFFD8) — klient
  // zawsze eksportuje przez canvas.toBlob('image/jpeg', ...), więc to powinno się zgadzać;
  // to tylko siatka bezpieczeństwa przeciw pustym/zepsutym/nie-obrazkowym wysyłkom.
  if (!buffer || buffer.length < 100 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return res.status(400).json({ error: 'Nieprawidłowy plik zdjęcia — spróbuj innego.' });
  }

  fs.writeFileSync(path.join(avatarsDir, `${playerId}.jpg`), buffer);
  slEnsureState(playerId);
  db.prepare(`UPDATE sl_state SET has_avatar = 1, avatar_updated_at = CURRENT_TIMESTAMP WHERE player_id = ?`)
    .run(playerId);
  slLogActivity(playerId, 'avatar', '🖼️ Wgrał/zaktualizował zdjęcie profilowe');

  res.json({ success: true, state: slBuildState(playerId) });
});

// GET /api/snakes/board — publiczny widok planszy + pozycji (bez logowania)
app.get('/api/snakes/board', (req, res) => {
  res.json({
    board: slBoardPayload(),
    players: slPlayersPayload(null),
    leaderboard: slLeaderboard(null),
    seasons_archive: crowning.closures(),
    coop: boss.slCoopPayload(null)
  });
});

// POST /api/snakes/roll — jedyny dzienny ruch gracza (rzut kostką).
app.post('/api/snakes/roll', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const nickname = req.player.nickname;
  const today = todayWaw();
  const board = slBoardMap();
  // Pozycja, którą klient ma narysowaną na planszy (patrz weryfikacja niżej).
  // Brak pola = null, czyli weryfikacja pominięta.
  const knownAbsPos = Number.isInteger(req.body && req.body.known_abs_pos)
    ? Number(req.body.known_abs_pos)
    : null;

  // Bramka: bez zdjęcia profilowego nie da się zagrać. Sprawdzana przed transakcją,
  // żeby nawet nie próbować rzutu — klient i tak trzyma gracza na ekranie uploadu.
  if (!slEnsureState(playerId).has_avatar) {
    return res.status(403).json({ error: 'Wgraj najpierw zdjęcie profilowe, żeby móc zagrać.', avatar_required: true });
  }

  // Bramka: w weekend nie gramy — dokładnie jak w Wordle.
  if (isWeekendStr(today) && !slPlayHours().weekends) {
    return res.status(400).json({ error: 'W weekend nie gramy — wróć w poniedziałek.', is_weekend: true });
  }

  // Bramka: gra biurowa — rzucamy tylko w godzinach pracy (czasu Warszawy).
  if (!slOfficeOpenAt()) {
    return res.status(400).json({
      error: `Rzucamy tylko w godzinach ${slPlayHours().start}:00–${slPlayHours().end}:00 — to gra biurowa.`,
      office_closed: true,
      next_open: new Date(slNextOpenMs()).toISOString()
    });
  }

  // Jeden klucz na CAŁĄ turę — stempluje wszystkie wpisy, które ten rzut wygeneruje
  // (rzut, klątwa, zbicia z kaskadą, trafienie bossa), żeby front narysował je jako
  // jeden blok zamiast kilkunastu nierozróżnialnych wierszy. Patrz slNewTurnRef.
  const turnRef = slNewTurnRef(playerId);

  const result = transaction(() => {
    const st = slEnsureState(playerId);
    // rolls_today liczy się dla dnia zapisanego w last_move_date — inny dzień = licznik
    // efektywnie na zero, bez potrzeby osobnego resetu o północy.
    const rollsUsedToday = st.last_move_date === today ? Number(st.rolls_today) : 0;
    const dailyRolls = slDailyRollsFor(st, today); // limit bazowy + sloty z Extra Move
    if (rollsUsedToday >= dailyRolls) return { locked: true, daily_rolls: dailyRolls };
    const moveSeq = rollsUsedToday + 1;

    // ── WERYFIKACJA POZYCJI ──
    // Klient dosyła `known_abs_pos` — pole, na którym RYSUJE swój pionek w chwili
    // klikania „Rzuć". Ruch zawsze liczy się od pozycji z bazy (`st.abs_pos`), ale gdy
    // te dwie się rozjeżdżają, to znaczy, że gracz patrzy na nieaktualną planszę:
    // ktoś go w międzyczasie wypchnął. Wtedy NIE ruszamy — nie zużywamy rzutu, nie
    // odpalamy efektów, tylko odsyłamy prawdziwą pozycję, żeby front odświeżył planszę
    // i gracz rzucił świadomie, wiedząc, skąd startuje.
    // Pole jest opcjonalne (stary klient / inne wywołania nie muszą go znać).
    if (knownAbsPos !== null && knownAbsPos !== Number(st.abs_pos)) {
      return { stale: true, known_abs: knownAbsPos, actual_abs: Number(st.abs_pos) };
    }

    // Zbierz oczekujące efekty na tym graczu (tarcza nie jest efektem na turę — pomijamy).
    const pending = db.prepare(
      `SELECT * FROM sl_effects WHERE target_player_id = ? AND status = 'pending' ORDER BY id`
    ).all(playerId);
    const freeze = pending.find(e => e.type === 'freeze');
    // Drożyzna czeka na zakup, nie na ruch — pomijamy ją przy szukaniu klątwy na turę,
    // żeby nie zużyła się na rzucie, nie odpaliwszy swojego efektu.
    const curse = pending.find(e => e.type === 'curse' && Number(e.variant) !== SL_CURSE_PRICE_VARIANT);

    const consume = id => db.prepare(
      `UPDATE sl_effects SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);

    // FREEZE: blokuje JEDEN ruch (nie cały dzień) — zużywa ten slot bez przesunięcia,
    // inne sloty tego dnia (przy SL_DAILY_ROLLS > 1) zostają nietknięte.
    if (freeze) {
      consume(freeze.id);
      db.prepare(`
        INSERT INTO sl_moves (player_id, move_date, move_seq, rolls, from_abs, to_abs, points, note)
        VALUES (?, ?, ?, '[]', ?, ?, 0, 'frozen')
      `).run(playerId, today, moveSeq, st.abs_pos, st.abs_pos);
      db.prepare('UPDATE sl_state SET last_move_date = ?, rolls_today = ?, last_move_at = CURRENT_TIMESTAMP WHERE player_id = ?')
        .run(today, moveSeq, playerId);
      // Freeze ujawnia się DOPIERO teraz — w momencie faktycznej aktywacji, nie kiedy
      // ktoś go kupił/użył na kogoś (patrz POST /api/snakes/shop/use, gdzie celowo nie
      // ma żadnego wpisu dla freeze).
      const freezeSource = freeze.source_player_id
        ? db.prepare('SELECT nickname FROM players WHERE id = ?').get(freeze.source_player_id)
        : null;
      const freezeSourceNick = freezeSource ? freezeSource.nickname : null;
      slLogActivity(playerId, 'roll', `❄️ Zamrożony${freezeSourceNick ? ` przez ${freezeSourceNick}` : ''} — ruch ${moveSeq}/${SL_DAILY_ROLLS} dzisiaj przepadł.`, turnRef);
      if (freeze.source_player_id) {
        slLogActivity(freeze.source_player_id, 'shop_use', `❄️ Twój Freeze na ${nickname} właśnie odpalił!`, turnRef);
      }
      return { frozen: true, source: freeze.source_player_id, source_nickname: freezeSourceNick, rolls_used_today: moveSeq };
    }

    // Jedna kostka na turę. (Extra Move nie dokłada tu drugiego rzutu — daje osobny,
    // dodatkowy ruch już w momencie użycia; patrz POST /api/snakes/shop/use.) Tablica
    // zostaje, bo klątwa „Rozdwojona Kostka" nadal potrafi zmienić wynik rzutu.
    const rolls = [d6()];

    const curseVariant = curse ? Number(curse.variant) : null;
    // Warianty 1 (Odwrotny Ruch) i 2 (Rozdwojona Kostka) zmieniają wartość kości —
    // muszą zadziałać PRZED odpaleniem węży/drabin/bonusów, inaczej gracz wylądowałby
    // na złym polu. Wariant 5 (Odwrócone Zasady) odwraca role drabin/węży na ten ruch.
    const effectiveRolls = rolls.map(r => slCurseAdjustRoll(curseVariant, r));
    const invertBoard = curseVariant === 5;

    // Sekwencyjnie wykonaj kroki (każdy rzut oddzielnie, by węże/drabiny/bonusy
    // z każdego lądowania zadziałały poprawnie).
    let abs = Number(st.abs_pos);
    const from_abs = abs;
    let tilePoints = 0;
    const notes = [];
    let fork = null; // { roll, win, to_tile } gdy ruch wszedł na rozwidloną drabinę
    const noteFork = (r) => {
      if (r.forkRoll == null) return;
      fork = { roll: r.forkRoll, win: r.note === 'fork_win', at_tile: r.forkAt, to_tile: slTileOf(r.abs != null ? r.abs : r.absAfter) };
    };
    for (const roll of effectiveRolls) {
      const step = slStepMove(abs, roll, board, invertBoard);
      abs = step.absAfter;
      tilePoints += step.tilePoints;
      if (step.note) notes.push(step.note);
      noteFork(step);
    }

    let curseCoinSteal = 0;
    if (curseVariant) {
      notes.push(`curse${curseVariant}`);
      if (curseVariant === 6) {
        // CHAOS: po normalnym wylądowaniu, dodatkowy losowy doskok o 1–3 pola —
        // ponownie odpalamy efekt pola (drabina/wąż/bonus), gdyby doskok w coś trafił.
        const landedTile = slTileOf(abs);
        const base = abs - landedTile;
        const jitter = (1 + Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? -1 : 1);
        const jitteredTile = Math.min(slBoardSize() - 1, Math.max(0, landedTile + jitter));
        const resolved = slResolveTileEffect(base + jitteredTile, board);
        abs = resolved.abs;
        tilePoints += resolved.tilePoints;
        if (resolved.note) notes.push(resolved.note);
        noteFork(resolved);
      } else if (curseVariant === 7) {
        tilePoints = 0; // BEZ BONUSU: pole bonusowe tego ruchu nie liczy się
      }
    }

    // ── ZDARZENIE SEZONOWE NA POLU LĄDOWANIA ── (kocioł, drzwi, cukierek)
    // Rozstrzygamy TERAZ, bo psikus potrafi cofnąć pionek, a wypychanie ma się liczyć
    // z pola, na którym gracz faktycznie stanął. Zapis efektów — dopiero po wstawieniu
    // ruchu, kiedy znamy jego `ref` (patrz seasonalLanding.apply niżej).
    const seasonalLanding = seasonal.resolveLanding({ playerId, landedAbs: abs, day: today, turnRef });
    abs = seasonalLanding.abs;

    // ── KNOCKBACK: jeśli roller wylądował na zajętym polu, wypycha okupanta(ów) ──
    // Sprawdzane na OSTATECZNYM polu lądowania tej tury (po drabinach/wężach/klątwie,
    // po obu rzutach przy Extra Move) — nie na każdym pośrednim kroku.
    const knockback = slApplyKnockback(playerId, abs, board, nickname, turnRef);
    if (knockback.length) notes.push('knockback');

    // ── PUNKTACJA ── (pipPoints liczone od SUROWYCH rzutów, nie od skorygowanych
    // klątwą — gracz i tak wyrzucił tyle oczek, klątwa psuje tylko ruch/zdobycz)
    const pipPoints = rolls.reduce((a, r) => a + r, 0) * SL_POINTS_PER_PIP;
    const distance = Math.max(0, abs - from_abs);
    const progressPoints = distance * SL_POINTS_PER_TILE;
    const oldLaps = Math.floor(from_abs / slBoardSize());
    const newLaps = Math.floor(abs / slBoardSize());
    const lapPoints = Math.max(0, newLaps - oldLaps) * slLapPoints();
    let earned = pipPoints + progressPoints + lapPoints + tilePoints;

    if (curseVariant === 4) earned = Math.floor(earned / 2); // CHCIWOŚĆ: połowa zdobyczy przepada

    if (curseVariant === 3) {
      // KIESZONKOWIEC: zabiera monety z BIEŻĄCEGO salda (sprzed doliczenia `earned`)
      // na rzecz tego, kto rzucił klątwę — symetrycznie do kradzieży przy knockbacku.
      curseCoinSteal = Math.min(SL_CURSE_COIN_STEAL, Math.max(0, Number(st.balance)));
      if (curseCoinSteal > 0 && curse.source_player_id) {
        db.prepare('UPDATE sl_state SET balance = balance + ? WHERE player_id = ?')
          .run(curseCoinSteal, curse.source_player_id);
      }
    }

    if (curse) consume(curse.id);

    const moveIns = db.prepare(`
      INSERT INTO sl_moves (player_id, move_date, move_seq, rolls, from_abs, to_abs, points, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(playerId, today, moveSeq, JSON.stringify(rolls), from_abs, abs, earned, notes.join(',') || null);

    // ── ROZBICIE PUNKTÓW Z TEGO RUCHU ──
    // `earned` jest jedną liczbą, ale składa się z dwóch rzeczy, które gracz rozróżnia:
    // gry kostką (oczka + postęp + okrążenie) i pola bonusowego. Dzielimy PROPORCJONALNIE
    // do surowej sumy, bo Chciwość połowi całość PO zsumowaniu — proporcja jest jedynym
    // podziałem, który po takim obcięciu nadal sumuje się dokładnie do `earned`.
    // `tilePoints` jest tu już po ewentualnym wyzerowaniu przez klątwę Bez Bonusu, więc
    // ruch bez działającego bonusu poprawnie wpada w całości do kategorii „kostka".
    const rawTotal = pipPoints + progressPoints + lapPoints + tilePoints;
    const bonusPart = rawTotal > 0 ? Math.round(earned * (tilePoints / rawTotal)) : 0;
    const moveRef = `move:${moveIns.lastInsertRowid}`;
    slLogPoints(playerId, 'bonus', bonusPart, moveRef, today);
    slLogPoints(playerId, 'dice', earned - bonusPart, moveRef, today);

    db.prepare(`
      UPDATE sl_state
      SET abs_pos = ?, laps = ?, balance = balance + ?, total_points = total_points + ?, last_move_date = ?, rolls_today = ?, last_move_at = CURRENT_TIMESTAMP
      WHERE player_id = ?
    `).run(abs, newLaps, earned - curseCoinSteal, earned, today, moveSeq, playerId);
    // Efekty zdarzenia sezonowego idą do własnego rejestru (sl_season_ledger) z tym samym
    // `ref` co ruch — „Cofnij ruch" odkręci je dokładnie, nie ruszając `earned`.
    seasonalLanding.apply(moveRef);

    // Rozwidlenie dopisujemy po ludzku — sam znacznik [fork_win] nic by nikomu nie mówił.
    const forkTxt = fork ? ` 🪜🎲 rozwidlenie: wypadło ${fork.roll} → ${fork.win ? 'górą' : 'krótszą odnogą'} na pole ${fork.to_tile}` : '';
    slLogActivity(playerId, 'roll',
      `🎲 ${rolls.join('+')} → pole ${slTileOf(abs)} (+${earned} pkt)${notes.length ? ' [' + notes.join(', ') + ']' : ''}${forkTxt} (ruch ${moveSeq}/${SL_DAILY_ROLLS})`, turnRef);
    if (curseVariant) {
      slLogActivity(playerId, 'curse_fired',
        `💀 Klątwa ${SL_CURSE_LABELS[curseVariant]}: ${SL_CURSE_DESCRIPTIONS[curseVariant]}${curseCoinSteal > 0 ? ` (-${curseCoinSteal} coins)` : ''}`, turnRef);
      // Rzucający przy rzuceniu nie dostał wariantu — dowiaduje się TERAZ, razem z ofiarą,
      // tak jak Freeze i Drożyzna. Nazwanie celu jest już bezpieczne: klątwa odpaliła.
      if (curse.source_player_id) {
        slLogActivity(curse.source_player_id, 'curse_fired',
          `💀 Twoja klątwa na ${nickname} odpaliła: ${SL_CURSE_LABELS[curseVariant]}${curseCoinSteal > 0 ? ` (+${curseCoinSteal} coins dla Ciebie)` : ''}`, turnRef);
      }
    }

    // ── SZTURM NA BOSSA: jeśli trwa walka, KAŻDY rzut zadaje bossowi obrażenia —
    // normalna gra już "walczy", bez dodatkowej akcji. Liczone od SUROWYCH rzutów.
    // Obrażenia z kości NIE dają nagrody (te idą wyłącznie z wpłat coins — patrz
    // lib/boss.js), ale zdejmują większość HP. `moveIns.lastInsertRowid` idzie jako `ref`,
    // żeby cofnięcie tego ruchu umiało oddać bossowi dokładnie te obrażenia.
    const bossHit = boss.slApplyDiceDamage(playerId, rolls, Number(moveIns.lastInsertRowid), turnRef);

    return {
      frozen: false,
      rolls,
      from_tile: slTileOf(from_abs),
      to_tile: slTileOf(abs),
      distance,
      completed_laps: Math.max(0, newLaps - oldLaps),
      breakdown: { pip: pipPoints, progress: progressPoints, laps: lapPoints, bonus: tilePoints },
      earned,
      notes,
      curse_applied: !!curse,
      curse_variant: curseVariant,
      curse_label: curseVariant ? SL_CURSE_LABELS[curseVariant] : null,
      curse_coin_steal: curseCoinSteal,
      knockback,
      fork,
      season_event: seasonalLanding.result,
      boss_hit: bossHit,
      rolls_used_today: moveSeq
    };
  });

  if (result.locked) {
    return res.status(400).json({ error: `Wykorzystałeś już dzisiejsze ${result.daily_rolls} ruchy — wróć jutro między ${slPlayHours().start}:00 a ${slPlayHours().end}:00 (albo dołóż sobie ruch Extra Move'em).` });
  }

  // Plansza u gracza była nieaktualna — rzut się NIE odbył (limit dzienny nietknięty).
  // Odsyłamy świeży stan, żeby front od razu przerysował planszę na prawdziwą pozycję.
  if (result.stale) {
    return res.status(409).json({
      error: `Twoja pozycja zmieniła się, odkąd załadowała się plansza — stoisz teraz na polu ${slTileOf(result.actual_abs)}, nie ${slTileOf(result.known_abs)}. Plansza odświeżona, rzuć jeszcze raz.`,
      stale_position: true,
      known_tile: slTileOf(result.known_abs),
      actual_tile: slTileOf(result.actual_abs),
      actual_abs_pos: result.actual_abs,
      state: slBuildState(playerId)
    });
  }

  // ── ZDARZENIA DISCORD ──
  if (result.frozen) {
    // Ujawniamy "kto kogo zamroził" DOPIERO teraz — Freeze nie ma żadnej zapowiedzi
    // przy użyciu, tylko przy faktycznej aktywacji (patrz POST /api/snakes/shop/use).
    slEmit('powerup_freeze', () => result.source_nickname
      ? `❄️ **${result.source_nickname}** zamroził **${nickname}** — właśnie odpalił, tura przepada.`
      : `❄️ **${nickname}** próbował rzucić, ale jest zamrożony — tura przepada.`);
  } else {
    slEmit('roll_result', () => {
      const dice = result.rolls.join(' + ');
      return `🎲 **${nickname}** wyrzucił **${dice}** → pole **${result.to_tile}** (+${result.earned} pkt).`;
    });
    if (result.notes.includes('ladder')) {
      slEmit('tile_landing', () => `🪜 **${nickname}** wszedł na drabinę i wskoczył na pole **${result.to_tile}**!`);
    }
    if (result.notes.includes('snake')) {
      slEmit('tile_landing', () => `🐍 **${nickname}** wdepnął na węża i zjechał na pole **${result.to_tile}**.`);
    }
    seasonal.emitFor(result.season_event, nickname);
    if (result.fork) {
      slEmit('tile_landing', () => result.fork.win
        ? `🪜🎲 **${nickname}** wszedł na rozwidloną drabinę, wyrzucił **${result.fork.roll}** i poszedł górą na pole **${result.fork.to_tile}**!`
        : `🪜🎲 **${nickname}** wszedł na rozwidloną drabinę, wyrzucił **${result.fork.roll}** — krótsza odnoga, pole **${result.fork.to_tile}**.`);
    }
    if (result.knockback && result.knockback.length) {
      // Wypchnięcie kończy się na `knocked_tile`; drabina/wąż to DRUGI ruch, więc mówimy
      // o nim osobno („→ pole 3, a stamtąd 🪜 na 17"), zamiast pokazywać samo pole końcowe
      // jako miejsce wypchnięcia. Inaczej wychodziło „wypchnięty → pole 17" przy cofnięciu.
      const extraFor = k => (k.tile_effect === 'ladder' || k.tile_effect === 'fork_win' || k.tile_effect === 'fork_lose' ? `, a stamtąd 🪜 drabiną na **${k.to_tile}**`
        : k.tile_effect === 'snake' ? `, a stamtąd 🐍 wężem na **${k.to_tile}**`
        : k.tile_effect === 'bonus' ? ` ⭐ +${k.bonus_points} pkt bonusu`
        : '') + ` 💰 ${k.stolen_by}: +${k.points_won} pkt${k.coins_stolen ? ` i ${k.coins_stolen} coins zabranych` : ''}`;
      slEmit('knockback', () => result.knockback.map((k, i) => i === 0
        ? `💥 **${nickname}** wylądował na polu **${k.from_tile}** i wypchnął **${k.nickname}** → pole **${k.knocked_tile}**${extraFor(k)}.`
        : `↳ efekt domina: **${k.nickname}** też wypchnięty → pole **${k.knocked_tile}**${extraFor(k)}.`
      ).join('\n'));
    }
    if (result.curse_variant) {
      slEmit('powerup_curse', () =>
        `💀 **${nickname}** dostał klątwę **${result.curse_label}** na tym ruchu: ${SL_CURSE_DESCRIPTIONS[result.curse_variant]}.`);
    }
    if (result.boss_hit) {
      if (result.boss_hit.defeated) {
        slEmit('coop_completed', () => ({
          content: `🏆 **${result.boss_hit.boss_name} pokonany!**`,
          embeds: [{
            title: `Edycja #${result.boss_hit.victory.cycle}`,
            url: SNAKES_URL,
            description: `Ostateczny cios (${result.boss_hit.damage} obr.) zadał **${nickname}**. Wpłacający (${result.boss_hit.victory.contributors}) dzielą **${result.boss_hit.victory.points_awarded} pkt** i odzyskują **${result.boss_hit.victory.coins_refunded}** z wpłaconych **${result.boss_hit.victory.coins_paid}** coins.`
              + boss.slBossPayoutLines(result.boss_hit.victory),
            color: 0x53D06B
          }]
        }));
      }
      // Pojedyncze trafienia bossa (bez finału) celowo NIE lecą na Discorda — spamowałyby
      // kanał przy każdym rzucie podczas eventu. Kamień milowy to co innego: pada najwyżej
      // trzy razy na całą walkę i jest jedynym momentem, w którym gra może powiedzieć
      // „zostało tyle, dorzućcie się".
      if (result.boss_hit.milestones && result.boss_hit.milestones.length) {
        boss.slEmitMilestones(
          { boss_name: result.boss_hit.boss_name, cycle: result.boss_hit.cycle },
          result.boss_hit.milestones
        );
      }
    }
  }

  res.json({ move: result, state: slBuildState(playerId) });
});

// GET /api/snakes/players — lekka lista graczy do wyboru celu power-upa.
app.get('/api/snakes/players', authPlayer, (req, res) => {
  res.json({ players: slPlayersPayload(req.player.id) });
});

// Trasa POST /api/snakes/coop/contribute mieszka w lib/boss.js (registerRoutes).

// GET /api/snakes/admin/settings?password= — konfiguracja zdarzeń + stan co-opu
app.get('/api/snakes/admin/settings', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({
    events: slEventsConfig(),
    labels: SL_EVENT_LABELS,
    defaults: SL_EVENT_DEFAULTS,
    webhook_configured: !!SL_DISCORD_WEBHOOK_URL,
    summary_hour: SL_SUMMARY_HOUR,
    board: (b => ({ id: b.id, name: b.name, size: slBoardSize(), cols: b.cols, rows: b.rows }))(slCurrentBoard()),
    powerup_costs: SL_POWERUP_COSTS,
    // Panel pokazuje koszty pod nazwami, które widzi gracz — inaczej admin czytałby
    // surowy klucz `double_move`, gdy reszta gry mówi o nim „Extra Move".
    powerup_labels: SL_POWERUP_LABELS,
    play_hours: slPlayHours(),
    boss_enabled: boss.slBossEnabled(),
    // null = boss wyłączony; panel czyta to jako „nie ma czym sterować" (patrz renderInfo).
    coop: boss.slBossEnabled() ? boss.slCoopPayload(null) : null
  });
});

// POST /api/snakes/admin/play-hours { password, start, end, weekends } albo { password, reset: true }
// Okno, w którym wolno rzucać (godziny czasu Warszawy, `end` wyłącznie, 24 = do północy).
// Głównie na testy: 0–24 z weekendami zdejmuje blokadę całkiem. `reset` wraca do okna
// z env (SNAKES_PLAY_*_HOUR). Liczba dziennych ruchów się nie zmienia — dalej liczy się
// po dniu kalendarzowym, więc szersze okno nie daje nikomu dodatkowych rzutów.
app.post('/api/snakes/admin/play-hours', (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (req.body.reset === true) {
    db.prepare('DELETE FROM sl_meta WHERE key IN (?, ?, ?)')
      .run(SL_PLAY_META_START, SL_PLAY_META_END, SL_PLAY_META_WEEKENDS);
  } else {
    const start = Number(req.body.start);
    const end = Number(req.body.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 1 || end > 24) {
      return res.status(400).json({ error: 'Godziny muszą być liczbami całkowitymi: początek 0–23, koniec 1–24.' });
    }
    if (start >= end) {
      return res.status(400).json({ error: 'Koniec okna musi być później niż początek.' });
    }
    transaction(() => {
      slMetaSet(SL_PLAY_META_START, start);
      slMetaSet(SL_PLAY_META_END, end);
      slMetaSet(SL_PLAY_META_WEEKENDS, req.body.weekends ? '1' : '0');
    });
  }
  const hours = slPlayHours();
  console.log(`Snakes/Admin: okno gry ${hours.start}:00–${hours.end}:00${hours.weekends ? ' z weekendami' : ' (pon–pt)'}${hours.custom ? '' : ' — domyślne'}`);
  res.json({ success: true, play_hours: hours });
});

// POST /api/snakes/admin/reset { password } — twardy reset CAŁEJ gry Snakes do stanu
// zerowego: każdy gracz wraca na pole 0 z saldem/punktami 0, ekwipunkiem power-upów
// wyczyszczonym i bez oczekujących efektów (Freeze/Curse/Shield/Extra Move). Historia
// ruchów i dziennik aktywności są kasowane, a pula co-op wraca do świeżej edycji #1
// z bazowym progiem/czasem (patrz slCurrentCoop). Gracze i ich AWATARY
// (pionki) NIE są ruszane — konta w Snakes zostają, tylko ich postęp w grze wraca do zera.
// Wordle jest kompletnie nietknięte (osobne tabele). Nieodwracalne — potwierdzenie
// (i podwójne potwierdzenie w UI) leży po stronie panelu admina.
app.post('/api/snakes/admin/reset', (req, res) => {
  if (!checkAdmin(req, res)) return;

  const out = transaction(() => {
    const playersAffected = Number(db.prepare('SELECT COUNT(*) AS c FROM sl_state').get().c);
    db.exec(`
      UPDATE sl_state SET abs_pos = 0, laps = 0, balance = 0, total_points = 0,
        last_move_date = NULL, rolls_today = 0, last_move_at = NULL;
      DELETE FROM sl_moves;
      DELETE FROM sl_inventory;
      DELETE FROM sl_effects;
      DELETE FROM sl_activity;
      DELETE FROM sl_points_log;
    `);
    // ŚCIEŻKA COFANIA #4 — wszystko po bossie (cykle, obrażenia, rejestr wypłat) kasuje
    // moduł, żeby lista tabel do wyczyszczenia mieszkała tam, gdzie te tabele powstają.
    boss.slResetBossData();
    costumes.slResetCostumes(); // reset = zerowe konto, więc i szafa pusta (poza skinami wsparcia)
    seasonal.resetAll();
    // sl_coop pusty → następne wywołanie slCurrentCoop() samo założy świeżą edycję #1,
    // zakotwiczoną od teraz (dokładnie jak przy zupełnie nowej instalacji).
    return { players_affected: playersAffected, coop: boss.slCoopPayload(null) };
  });

  slEmit('coop_completed', () => '🔄 **Admin zresetował grę Snakes & Ladders** — wszyscy wracają na start z zerowym kontem.');

  res.json({ success: true, ...out });
});

// GET /api/snakes/admin/seasons?password= — lista sezonów z boards/ (tylko poprawne
// pliki; błędne lądują w logu przy starcie) i to, który jest aktywny.
app.get('/api/snakes/admin/seasons', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ active: slCurrentBoard().id, seasons: seasons.list() });
});

// POST /api/snakes/admin/season { password, board, close? } — przełącza sezon planszy.
// Domyślnie (close ≠ false) ZAMYKA poprzedni sezon: ranking idzie do archiwum, podium
// dostaje medale, a wszyscy zaczynają od zera (slCloseSeasonAndInstall). Z close: false
// tylko zmienia planszę — wszyscy na pole 0, reszta zostaje. Ruchów sprzed zmiany
// nie da się już cofnąć (patrz slResetPositionsToStart). Ponowne włączenie AKTYWNEGO
// sezonu też resetuje pozycje — to świadome: „zacznijmy sezon od nowa".
app.post('/api/snakes/admin/season', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const season = seasons.get(String(req.body.board || ''));
  if (!season) return res.status(404).json({ error: 'Nie ma takiego sezonu (albo jego plik ma błąd — patrz logi serwera).' });

  const previous = slCurrentBoard().id;
  // Domyślnie przełączenie ZAMYKA sezon (archiwum, medale, wszyscy od zera). Bez zamykania
  // — tylko w razie pomyłki albo testów: sama zmiana planszy, wszystko inne zostaje.
  const close = req.body.close !== false;
  let moved, closure = null;
  if (close) {
    const out = slCloseSeasonAndInstall(season);
    moved = out.moved;
    closure = out.closure;
    console.log(`Snakes/Admin: sezon ${previous} ZAMKNIĘTY (#${closure.id}, ${closure.players} graczy w archiwum) → ${season.id} (${season.size} pól), wszyscy od zera`);
  } else {
    moved = slInstallBoard(season, true, true);
    console.log(`Snakes/Admin: sezon ${previous} → ${season.id} (${season.size} pól), ${moved} graczy na polu 0 (bez zamykania)`);
  }
  // Sezon z własnym bossem (special_boss) wystawia go OD RAZU, a nie przy kolejnej edycji.
  // Po zamknięciu to no-op (nowy cykl już jest bossem sezonu), bez zamknięcia — zwraca wpłaty.
  boss.slEnsureSpecialBoss();

  let content;
  if (closure) {
    const medal = ['🥇', '🥈', '🥉'];
    const podium = closure.podium.map(p => `${medal[p.place - 1]} **${p.nickname}** (${p.total_points} pkt)`).join('\n');
    content = `🏆 **Koniec sezonu ${closure.name}!**` + (podium ? `\n${podium}` : '')
      + `\n\n🗺️ **Startuje nowy sezon: ${season.name}.** Wszyscy od zera: punkty, coins, okrążenia i ekwipunek. Kostiumy zostają.\n${SNAKES_URL}`;
  } else {
    content = `🗺️ **Nowa plansza: ${season.name}!** Wszyscy startują od pola 0 — punkty i coins zostają.`;
  }
  slPostDiscord({ content }).catch(err => console.error('Snakes/Discord [season]:', err.message));

  res.json({ success: true, active: season.id, players_moved: moved, closure, board: slBoardPayload() });
});

// GET /api/snakes/admin/players — lista graczy z ich stanem w Snakes & Ladders
// (tylko ci, którzy mieli już z grą kontakt — sl_state powstaje leniwie przy pierwszym
// zapytaniu o stan). Do wyboru gracza w akcjach admina niżej.
app.get('/api/snakes/admin/players', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const today = todayWaw();
  const rows = db.prepare(`
    SELECT s.player_id, p.nickname, s.abs_pos, s.laps, s.balance, s.total_points, s.last_move_date, s.rolls_today,
           s.extra_rolls, s.extra_rolls_date
    FROM sl_state s JOIN players p ON p.id = s.player_id
    ORDER BY p.nickname COLLATE NOCASE ASC
  `).all();
  res.json({
    players: rows.map(r => {
      const rollsUsedToday = r.last_move_date === today ? Number(r.rolls_today) : 0;
      const dailyRolls = slDailyRollsFor(r, today);
      return {
        player_id: r.player_id,
        nickname: r.nickname,
        tile: slTileOf(r.abs_pos),
        laps: Number(r.laps),
        balance: Number(r.balance),
        total_points: Number(r.total_points),
        last_move_date: r.last_move_date,
        rolls_used_today: rollsUsedToday,
        daily_rolls: dailyRolls,
        moved_today: rollsUsedToday >= dailyRolls
      };
    }),
    today
  });
});

// DELETE /api/snakes/admin/players/:id — usuwa gracza WYŁĄCZNIE z trybu Snakes.
// Kasuje jego stan, ekwipunek, dziennik ruchów, aktywne/przychodzące efekty i wpłaty
// do puli co-op. Konto (players) i dane Wordle zostają nietknięte — to ten sam login,
// więc gracz może dalej grać w Wordle, a w Snakes wystartuje od zera przy następnym
// wejściu (sl_state tworzy się leniwie).
app.delete('/api/snakes/admin/players/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);
  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  transaction(() => {
    db.prepare('DELETE FROM sl_moves WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_inventory WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_effects WHERE target_player_id = ? OR source_player_id = ?').run(playerId, playerId);
    boss.slClearPlayerBossData(playerId); // ŚCIEŻKA COFANIA #5 — wkłady i wypłaty bossa
    costumes.slClearPlayerCostumes(playerId);
    seasonal.clearPlayer(playerId);
    crowning.clearPlayer(playerId);
    db.prepare('DELETE FROM sl_activity WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_points_log WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_state WHERE player_id = ?').run(playerId);
  });

  res.json({ success: true, deleted: player.nickname });
});

// POST /api/snakes/admin/players/:id/grant-move { password, date? } — oddaje graczowi
// JEDEN dodatkowy ruch danego dnia (domyślnie dziś, wg czasu Warszawy) — z SL_DAILY_ROLLS
// dostępnych ruchów cofa licznik zużycia o jeden i kasuje ostatni zapisany ruch z tego
// dnia. NIE cofa punktów/pozycji z ruchów już wykonanych — to dodatkowa szansa, nie
// cofnięcie. Wołane wielokrotnie odda kolejne sloty (aż do pełnego dziennego limitu).
app.post('/api/snakes/admin/players/:id/grant-move', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : todayWaw();

  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  const result = transaction(() => {
    const st = slEnsureState(playerId);
    if (st.last_move_date !== date) return { already_full: true };
    const used = Number(st.rolls_today);
    if (used <= 0) return { already_full: true };
    db.prepare('DELETE FROM sl_moves WHERE player_id = ? AND move_date = ? AND move_seq = ?')
      .run(playerId, date, used);
    db.prepare('UPDATE sl_state SET rolls_today = ? WHERE player_id = ?').run(used - 1, playerId);
    return { already_full: false, rolls_used_today: used - 1 };
  });

  if (result.already_full) {
    return res.status(400).json({ error: `${player.nickname} ma już pełny limit ruchów na ${date}.` });
  }
  res.json({ success: true, nickname: player.nickname, date, rolls_used_today: result.rolls_used_today, daily_rolls: SL_DAILY_ROLLS });
});

// POST /api/snakes/admin/settings { password, events: { typ: bool } } — przełącz zdarzenia
app.post('/api/snakes/admin/settings', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const events = slSetEventsConfig(req.body.events);
  res.json({ success: true, events });
});

// POST /api/snakes/admin/discord-test { password } — testowy strzał w webhooka
app.post('/api/snakes/admin/discord-test', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!SL_DISCORD_WEBHOOK_URL) {
    return res.status(400).json({ error: 'Brak webhooka — ustaw SNAKES_DISCORD_WEBHOOK_URL lub DISCORD_WEBHOOK_URL w .env' });
  }
  try {
    await slPostDiscord({ content: '🐍 Test webhooka Office Snakes & Ladders — działa!' });
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/snakes/admin/coop/complete { password, force? } — zamknij wydarzenie i wypłać
// nagrody ręcznie. Normalnie robi to sama mechanika bossa (HP=0 przy rzucie/ataku, albo
// timeout w schedulerze) — ten endpoint to głównie fallback na wypadek utkniętego eventu.
// `force: true` domyka event NAWET jeśli boss żyje (bez premii za pokonanie — jak timeout).
// Trasy admina od bossa (coop/complete, coop/config, coop/boss, coop/toggle,
// coop/revert-rewards) mieszkają w lib/boss.js (registerRoutes).

// GET /api/snakes/admin/moves?date=&player_id= — ruchy (nie dziennik) do podglądu:
// z czego, na co, ile punktów. Stąd widać np. gracza, który zrobił ich dziś podejrzanie dużo.
app.get('/api/snakes/admin/moves', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
  const playerId = req.query.player_id ? parseInt(req.query.player_id, 10) : null;
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));

  const where = [];
  const args = [];
  if (date) { where.push('m.move_date = ?'); args.push(date); }
  if (Number.isInteger(playerId)) { where.push('m.player_id = ?'); args.push(playerId); }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const moves = db.prepare(`
    SELECT m.id, m.player_id, p.nickname, m.move_date, m.move_seq, m.rolls,
           m.from_abs, m.to_abs, m.points, m.note, m.created_at
    FROM sl_moves m JOIN players p ON p.id = m.player_id
    ${sql} ORDER BY m.id DESC LIMIT ?
  `).all(...args, limit).map(m => ({ ...m, from_tile: slTileOf(m.from_abs), to_tile: slTileOf(m.to_abs) }));

  // Ile ruchów kto zrobił w wybranym dniu — od razu widać przekroczenia limitu.
  const perPlayer = db.prepare(`
    SELECT p.nickname, COUNT(*) AS moves, SUM(m.points) AS points
    FROM sl_moves m JOIN players p ON p.id = m.player_id
    ${sql} GROUP BY m.player_id, p.nickname ORDER BY moves DESC
  `).all(...args);

  res.json({
    success: true, moves, per_player: perPlayer,
    daily_max: SL_DAILY_ROLLS + SL_MAX_EXTRA_ROLLS,
    days: db.prepare('SELECT DISTINCT move_date FROM sl_moves ORDER BY move_date DESC LIMIT 60').all().map(r => r.move_date)
  });
});

// ── COFNIĘCIE CAŁEGO DNIA GRY ──
// Kasuje wszystko, co wydarzyło się danego dnia, i stawia graczy tam, gdzie stali o 8:00.
// Pozycję startową bierzemy z `from_abs` PIERWSZEGO ruchu gracza tego dnia — to dokładnie
// pole, z którego zaczynał, zanim cokolwiek dziś rzucił. Punkty z tego dnia (a więc i
// monety, bo rzut dolicza je do obu) odejmujemy, z podłogą na zerze.
// Czego to NIE robi (świadomie):
//   • nie zwraca monet wydanych w sklepie ani na ataki — kupione power-upy zostają
//     w ekwipunku, wydane monety przepadają,
//   • nie odkręca monet ukradzionych przy wypchnięciu/klątwie — kwota była przycinana do
//     salda ofiary, więc realnie zabrana wartość nigdzie nie została zapisana,
//   • nie kasuje oczekujących Freeze/Curse — atak padł, cel dowie się przy swoim ruchu.
// Uwaga na wypchniętych: gracz, którego ktoś dziś zbił ZANIM sam zdążył rzucić, wróci na
// pole sprzed swojego pierwszego rzutu, czyli już po wypchnięciu (a gracz, który dziś
// wcale nie rzucał, zostaje tam, gdzie go zbito) — wypchnięcia nie mają w bazie zapisu
// pozycji sprzed, więc tego jednego nie da się odtworzyć automatycznie. Takich graczy
// zwracamy w `pushed_not_restored`, żeby dało się ich poprawić ręcznie z panelu.
function slRollbackDay(date) {
  return transaction(() => {
    const movers = db.prepare(`
      SELECT m.player_id, p.nickname, SUM(m.points) AS points, COUNT(*) AS moves
      FROM sl_moves m JOIN players p ON p.id = m.player_id
      WHERE m.move_date = ? GROUP BY m.player_id, p.nickname
    `).all(date);

    const firstOfDay = db.prepare(`
      SELECT from_abs FROM sl_moves WHERE player_id = ? AND move_date = ?
      ORDER BY move_seq ASC, id ASC LIMIT 1
    `);
    // Saldo bez przycinania do zera — patrz „Cofnij ruch" (undo-move): MAX(0, …) drukowało
    // coins, a tutaj do tego przed revertami bossa i sezonu niżej.
    const restore = db.prepare(`
      UPDATE sl_state
      SET abs_pos = ?, laps = ?, total_points = MAX(0, total_points - ?), balance = balance - ?,
          rolls_today = 0, last_move_date = NULL, last_move_at = NULL
      WHERE player_id = ?
    `);

    const details = [];
    for (const m of movers) {
      const startAbs = Number(firstOfDay.get(m.player_id, date).from_abs);
      const pts = Number(m.points);
      restore.run(startAbs, Math.floor(startAbs / slBoardSize()), pts, pts, m.player_id);
      details.push({
        player_id: m.player_id, nickname: m.nickname, moves: Number(m.moves),
        points_removed: pts, back_to_tile: slTileOf(startAbs)
      });
    }

    // Kto dziś oberwał wypchnięciem, a sam nie rzucał — jego pozycji nie mamy z czego
    // odtworzyć. Zbieramy listę do zgłoszenia adminowi, ZANIM skasujemy dziennik.
    const pushedNotRestored = db.prepare(`
      SELECT DISTINCT a.player_id, p.nickname
      FROM sl_activity a JOIN players p ON p.id = a.player_id
      WHERE a.day = ? AND a.type = 'knockback' AND a.detail LIKE '%Wypchnięty%'
        AND a.player_id NOT IN (SELECT player_id FROM sl_moves WHERE move_date = ?)
    `).all(date, date).map(r => r.nickname);

    // Gracze bez ruchów, ale z licznikiem/slotami z tego dnia (np. kupili Extra Move
    // i nie zdążyli go zużyć) — też wracają do czystego limitu.
    db.prepare(`UPDATE sl_state SET rolls_today = 0, last_move_date = NULL, last_move_at = NULL WHERE last_move_date = ?`).run(date);
    db.prepare(`UPDATE sl_state SET extra_rolls = 0, extra_rolls_date = NULL WHERE extra_rolls_date = ?`).run(date);

    const moves = db.prepare('DELETE FROM sl_moves WHERE move_date = ?').run(date);
    // Rozbicie punktów z tego dnia znika razem z ruchami — inaczej kategorie zostałyby
    // z punktami, których w total_points już nie ma, i pula „sprzed podziału" zeszłaby
    // na minus. Kasujemy po `day`, bo dokładnie po to ta kolumna jest.
    db.prepare('DELETE FROM sl_points_log WHERE day = ?').run(date);
    // ŚCIEŻKA COFANIA #1 — wypłaty i kary bossa z tego dnia wracają na konta, a obrażenia
    // zadane tego dnia wracają bossowi na pasek (o ile walka wciąż trwa).
    const bossBack = boss.slRevertBossDay(date);
    seasonal.revertDay(date);
    const activity = db.prepare('DELETE FROM sl_activity WHERE day = ?').run(date);

    return {
      date,
      players: details.length,
      moves_deleted: moves.changes,
      activity_deleted: activity.changes,
      points_removed: details.reduce((a, d) => a + d.points_removed, 0),
      boss_payouts_reverted: bossBack.payouts_reverted,
      boss_hp_restored: bossBack.hp_restored,
      pushed_not_restored: pushedNotRestored,
      details
    };
  });
}

// ── COFANIE DNIA: WYŁĄCZONE ──
// Funkcja czeka na przebudowę i do tego czasu jest zablokowana — świadoma decyzja
// właściciela, nie awaria. Powody, dla których lepiej jej teraz nie używać:
//   • odejmuje za dużo coins: rzut dopisuje do salda `earned - curseCoinSteal`, a cofanie
//     zdejmuje pełne `earned` z obu kolumn, więc kto był pod klątwą Kieszonkowiec, traci
//     50 coins za dużo (`sl_moves` nie pamięta dziś tej różnicy),
//   • nie odkręca coins ukradzionych przy wypchnięciu ani wydanych w sklepie,
//   • gracza, którego ktoś tego dnia zbił, a on sam nie rzucał, trzeba poprawić ręcznie,
//   • od czasu przebudowy bossa dotyka też wypłat, kar i HP (slRevertBossDay), więc pomyłka
//     kosztuje więcej niż kiedyś.
// `slRollbackDay` ZOSTAJE nietknięta — przebudowa ma od czego wyjść, a przy okazji wołają
// ją narzędzia bossa. Odblokowanie to zmiana tej jednej stałej na `true`.
const SL_DAY_ROLLBACK_ENABLED = false;

// POST /api/snakes/admin/day/rollback { password, date? } — cofa cały dzień gry do stanu
// z 8:00 (domyślnie dzisiejszy, wg czasu Warszawy). Patrz slRollbackDay po szczegóły tego,
// co wraca, a co zostaje. Nieodwracalne — potwierdzenie leży po stronie panelu.
// Blokada siedzi TUTAJ, a nie tylko w panelu: trasa jest wystawiona na świat i schowanie
// przycisku niczego by nie zamknęło.
app.post('/api/snakes/admin/day/rollback', (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!SL_DAY_ROLLBACK_ENABLED) {
    return res.status(503).json({
      error: 'Cofanie dnia jest wyłączone — funkcja czeka na przebudowę (m.in. odejmuje za dużo coins po klątwie Kieszonkowiec i nie odkręca kradzieży przy wypchnięciu). Do pojedynczych poprawek użyj „Cofnij ostatni ruch" albo ręcznej edycji gracza.',
      disabled: true
    });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : todayWaw();
  // Dzień z ruchami sprzed zmiany sezonu odpada w całości: ich from_abs to pole na innej
  // planszy (patrz slResetPositionsToStart). Częściowe cofnięcie dnia byłoby gorsze niż żadne.
  const preSeason = db.prepare('SELECT COUNT(*) AS c FROM sl_moves WHERE move_date = ? AND id <= ?')
    .get(date, slSeasonMoveFloor()).c;
  if (Number(preSeason) > 0) {
    return res.status(409).json({ error: `Tego dnia (${date}) zmienił się sezon planszy — ruchy sprzed zmiany stały na innej planszy, więc dnia nie da się cofnąć.` });
  }
  const out = slRollbackDay(date);
  console.log(`Snakes/Admin: cofnięto dzień ${date} — ${out.players} graczy, ${out.moves_deleted} ruchów, ${out.points_removed} pkt odjęte`);
  res.json({ success: true, ...out });
});

// POST /api/snakes/admin/players/:id/stats { password, balance?, total_points? } — ręczna
// korekta salda (monet) i/lub sumy punktów gracza. Wartości ustawiane WPROST (nie delta),
// bo panel pokazuje obok aktualne liczby. Nie rusza pozycji na planszy ani ekwipunku.
app.post('/api/snakes/admin/players/:id/stats', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);

  // Każde pole osobno opcjonalne — panel wysyła tylko to, co admin faktycznie zmienił.
  const num = (v) => (v != null ? parseInt(v, 10) : null);
  const balance = num(req.body.balance);
  const totalPoints = num(req.body.total_points);
  const tile = num(req.body.tile);
  const laps = num(req.body.laps);
  const rollsToday = num(req.body.rolls_today);
  const extraRolls = num(req.body.extra_rolls);

  const bad = (v, min, max, label) =>
    v != null && (!Number.isInteger(v) || v < min || (max != null && v > max)) ? label : null;
  const err = bad(balance, 0, null, 'Coins muszą być liczbą całkowitą ≥ 0.')
    || bad(totalPoints, 0, null, 'Punkty muszą być liczbą całkowitą ≥ 0.')
    || bad(tile, 0, slBoardSize() - 1, `Pole musi być z zakresu 0–${slBoardSize() - 1}.`)
    || bad(laps, 0, null, 'Okrążenia muszą być liczbą całkowitą ≥ 0.')
    || bad(rollsToday, 0, null, 'Zużyte rzuty muszą być liczbą całkowitą ≥ 0.')
    || bad(extraRolls, 0, SL_MAX_EXTRA_ROLLS, `Dodatkowe sloty: 0–${SL_MAX_EXTRA_ROLLS}.`);
  if (err) return res.status(400).json({ error: err });

  if ([balance, totalPoints, tile, laps, rollsToday, extraRolls].every(v => v == null)) {
    return res.status(400).json({ error: 'Nie podano żadnej zmiany.' });
  }

  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  const out = transaction(() => {
    const st = slEnsureState(playerId);
    const today = todayWaw();

    // Pozycja na planszy to para (okrążenie, pole) — trzymana jako jedna liczba abs_pos.
    // Admin podaje ją tak, jak ją widzi w UI, więc składamy z powrotem tutaj.
    const nextTile = tile != null ? tile : slTileOf(Number(st.abs_pos));
    const nextLaps = laps != null ? laps : Number(st.laps);
    const nextAbs = nextLaps * slBoardSize() + nextTile;

    // Licznik zużytych rzutów liczy się dla dnia z last_move_date — ustawiając go ręcznie
    // trzeba przypiąć go do DZIŚ, inaczej zmiana nie miałaby żadnego skutku.
    const nextRolls = rollsToday != null ? rollsToday : (st.last_move_date === today ? Number(st.rolls_today) : 0);
    const nextMoveDate = rollsToday != null ? (nextRolls > 0 ? today : null) : st.last_move_date;

    db.prepare(`
      UPDATE sl_state SET
        balance = ?, total_points = ?, abs_pos = ?, laps = ?,
        rolls_today = ?, last_move_date = ?,
        extra_rolls = ?, extra_rolls_date = ?
      WHERE player_id = ?
    `).run(
      balance != null ? balance : Number(st.balance),
      totalPoints != null ? totalPoints : Number(st.total_points),
      nextAbs, nextLaps,
      nextRolls, nextMoveDate,
      extraRolls != null ? extraRolls : Number(st.extra_rolls || 0),
      extraRolls != null ? (extraRolls > 0 ? today : null) : st.extra_rolls_date,
      playerId
    );
    return slAdminPlayerDetail(playerId);
  });

  res.json({ success: true, nickname: player.nickname, player: out });
});

// GET /api/snakes/admin/player/:id?password= — komplet tego, co o graczu wie tryb Snakes:
// stan, ekwipunek, oczekujące na niego efekty, ostatnie ruchy i wpisy w dzienniku.
// Jeden strzał zamiast pięciu — panel otwiera ten szczegół po kliknięciu w gracza.
function slAdminPlayerDetail(playerId) {
  const st = slEnsureState(playerId);
  const today = todayWaw();
  const p = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  const rollsUsedToday = st.last_move_date === today ? Number(st.rolls_today) : 0;
  return {
    player_id: playerId,
    nickname: p ? p.nickname : null,
    tile: slTileOf(Number(st.abs_pos)),
    abs_pos: Number(st.abs_pos),
    laps: Number(st.laps),
    balance: Number(st.balance),
    total_points: Number(st.total_points),
    rolls_used_today: rollsUsedToday,
    daily_rolls: slDailyRollsFor(st, today),
    extra_rolls: st.extra_rolls_date === today ? Number(st.extra_rolls || 0) : 0,
    max_extra_rolls: SL_MAX_EXTRA_ROLLS,
    last_move_date: st.last_move_date,
    has_avatar: !!st.avatar_updated_at,
    inventory: slInventory(playerId),
    effects: db.prepare(`
      SELECT e.id, e.type, e.variant, e.created_at, p2.nickname AS source_nickname
      FROM sl_effects e LEFT JOIN players p2 ON p2.id = e.source_player_id
      WHERE e.target_player_id = ? AND e.status = 'pending' ORDER BY e.id
    `).all(playerId),
    moves: db.prepare(`
      SELECT id, move_date, move_seq, rolls, from_abs, to_abs, points, note, created_at
      FROM sl_moves WHERE player_id = ? ORDER BY id DESC LIMIT 15
    `).all(playerId).map(m => ({ ...m, from_tile: slTileOf(m.from_abs), to_tile: slTileOf(m.to_abs) })),
    activity: db.prepare(`
      SELECT id, type, detail, day, created_at FROM sl_activity
      WHERE player_id = ? ORDER BY id DESC LIMIT 15
    `).all(playerId)
  };
}

app.get('/api/snakes/admin/player/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);
  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });
  res.json({ success: true, player: slAdminPlayerDetail(playerId) });
});

// POST /api/snakes/admin/players/:id/inventory { password, type, qty|delta } — ustawia
// stan ekwipunku wprost (`qty`) albo zmienia go o `delta` (przyciski +/- w panelu).
app.post('/api/snakes/admin/players/:id/inventory', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);
  const type = String(req.body.type || '');
  const qty = req.body.qty != null ? parseInt(req.body.qty, 10) : null;
  const delta = req.body.delta != null ? parseInt(req.body.delta, 10) : null;

  if (!SL_POWERUP_TYPES.includes(type)) {
    return res.status(400).json({ error: `Nieznany power-up. Dostępne: ${SL_POWERUP_TYPES.join(', ')}.` });
  }
  if (qty == null && delta == null) return res.status(400).json({ error: 'Podaj qty albo delta.' });
  if (qty != null && (!Number.isInteger(qty) || qty < 0)) {
    return res.status(400).json({ error: 'Liczba sztuk musi być liczbą całkowitą ≥ 0.' });
  }
  if (delta != null && !Number.isInteger(delta)) {
    return res.status(400).json({ error: 'Zmiana musi być liczbą całkowitą.' });
  }

  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  const out = transaction(() => {
    slEnsureState(playerId);
    const current = slInventory(playerId)[type];
    const next = Math.max(0, qty != null ? qty : current + delta);
    db.prepare(`
      INSERT INTO sl_inventory (player_id, type, qty) VALUES (?, ?, ?)
      ON CONFLICT(player_id, type) DO UPDATE SET qty = excluded.qty
    `).run(playerId, type, next);
    return slAdminPlayerDetail(playerId);
  });

  res.json({ success: true, nickname: player.nickname, type, player: out });
});

// POST /api/snakes/admin/players/:id/effects/clear { password, effect_id? } — kasuje
// oczekujące na graczu efekty (Freeze/Curse/Shield). Bez `effect_id` zdejmuje wszystkie.
// Efekt znika bez śladu w dzienniku — to narzędzie naprawcze, nie ruch w grze.
app.post('/api/snakes/admin/players/:id/effects/clear', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);
  const effectId = req.body.effect_id != null ? parseInt(req.body.effect_id, 10) : null;

  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  const out = transaction(() => {
    const del = effectId != null
      ? db.prepare(`DELETE FROM sl_effects WHERE id = ? AND target_player_id = ? AND status = 'pending'`).run(effectId, playerId)
      : db.prepare(`DELETE FROM sl_effects WHERE target_player_id = ? AND status = 'pending'`).run(playerId);
    return { cleared: del.changes, player: slAdminPlayerDetail(playerId) };
  });

  res.json({ success: true, nickname: player.nickname, ...out });
});

// POST /api/snakes/admin/players/:id/undo-move { password } — cofa OSTATNI ruch gracza
// naprawdę: wraca na pole sprzed niego (from_abs), odejmuje zdobyte w nim punkty i monety
// oraz oddaje zużyty slot, żeby dało się rzucić jeszcze raz. To coś innego niż „Dodaj ruch",
// które tylko oddaje slot i zostawia zdobycze — tu ruch znika, jakby go nie było.
// Odkręca też obrażenia, które ten rzut zadał bossowi (wkład znika, HP wraca — patrz
// slRevertBossDamageForRef). Nie odkręca za to reszty skutków ubocznych: kogo wtedy
// wypchnął ani komu ukradł monety — tego wiersz ruchu nie pamięta.
app.post('/api/snakes/admin/players/:id/undo-move', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);

  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  const out = transaction(() => {
    const move = db.prepare('SELECT * FROM sl_moves WHERE player_id = ? ORDER BY id DESC LIMIT 1').get(playerId);
    if (!move) return { none: true };
    // Ruch z poprzedniego sezonu: from_abs wskazuje pole na innej planszy.
    if (Number(move.id) <= slSeasonMoveFloor()) return { before_season: true };

    const st = slEnsureState(playerId);
    const fromAbs = Number(move.from_abs);
    const pts = Number(move.points);
    const sameDay = st.last_move_date === move.move_date;
    const nextRolls = sameDay ? Math.max(0, Number(st.rolls_today) - 1) : Number(st.rolls_today);

    // Kocioł, psikusy i cukierki tego ruchu (ten sam `ref`) — z własnego rejestru.
    seasonal.revertRef(`move:${move.id}`);

    // Saldo BEZ przycinania do zera (CLAUDE.md, „Dwie waluty"): dawne MAX(0, balance - ?)
    // kasowało dług po bossie i wydane w międzyczasie coins, czyli drukowało je — gracz
    // z −50, który rzucił +12 i dostał cofnięcie, lądował na 0 zamiast na −50. Bez
    // przycięcia kolejność względem revertRef wyżej też przestaje mieć znaczenie.
    db.prepare(`
      UPDATE sl_state SET abs_pos = ?, laps = ?, total_points = MAX(0, total_points - ?),
        balance = balance - ?, rolls_today = ?
      WHERE player_id = ?
    `).run(fromAbs, Math.floor(fromAbs / slBoardSize()), pts, pts, nextRolls, playerId);

    db.prepare('DELETE FROM sl_moves WHERE id = ?').run(move.id);
    // Ruch ma własne wiersze rozbicia oznaczone kolumną "ref" — kasujemy dokładnie je, żeby
    // cofnięcie jednego ruchu nie ruszyło pozostałych z tego samego dnia.
    // UWAGA: string składamy w JS, a NIE w SQL-u przez ('move:' || ?). node:sqlite binduje
    // liczbę JS jako REAL, więc taka konkatenacja daje 'move:16.0' zamiast 'move:16'
    // i warunek po cichu nie trafia w nic — cofnięty ruch zostawiłby swoje punkty
    // w rozbiciu, mimo że total_points już ich nie ma.
    db.prepare('DELETE FROM sl_points_log WHERE ref = ?').run(`move:${move.id}`);
    // ŚCIEŻKA COFANIA #2 — ten sam `ref` niesie obrażenia zadane bossowi tym rzutem.
    const bossBack = boss.slRevertBossDamageForRef(`move:${move.id}`);
    return {
      none: false, move_date: move.move_date, move_seq: Number(move.move_seq),
      points_removed: pts, back_to_tile: slTileOf(fromAbs),
      boss_hp_restored: bossBack.hp_restored, player: slAdminPlayerDetail(playerId)
    };
  });

  if (out.none) return res.status(400).json({ error: 'Ten gracz nie ma żadnego zapisanego ruchu.' });
  if (out.before_season) return res.status(409).json({ error: 'Ostatni ruch tego gracza był jeszcze na planszy poprzedniego sezonu — nie da się go cofnąć.' });
  res.json({ success: true, nickname: player.nickname, ...out });
});

// Strona gry i panel admina trybu Snakes są rejestrowane WYŻEJ, przed express.static —
// muszą tam być, żeby doklejać wersję do adresów snakes.js/snakes.css (patrz sendPage).

app.listen(PORT, () => {
  console.log(`Snakes Game — serwer na http://localhost:${PORT}`);
  console.log(`Snakes: ${SL_DAILY_ROLLS} ruchy dziennie, domyślnie ${SL_PLAY_START_HOUR}:00–${SL_PLAY_END_HOUR}:00 (pon–pt, Europe/Warsaw; okno zmienia się w panelu admina), bez odstępu między ruchami`);
  wordle.start();
});
