require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123michal';

// Pierwszy dzień gry (hasło o order_index = 1). Hasła lecą tylko w dni robocze (pon–pt),
// więc numer hasła = ile dni roboczych minęło od WORD_START (włącznie), a weekendy pomijamy.
// Hasła lecą w sposób ciągły, niezależnie od miesięcznego resetu sezonu.
const WORD_START = process.env.WORDLE_WORD_START || process.env.WORDLE_SEASON_START || '2026-07-27';

// Sezon = miesiąc kalendarzowy. Leaderboard/streak/punkty liczą się per sezon i zerują 1. dnia
// miesiąca. Do końca lipca trwa okres testowy; konkurs startuje od tego sezonu:
const CONTEST_START = process.env.WORDLE_CONTEST_START || '2026-08'; // 'YYYY-MM'

const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

// ── PUNKTACJA ──
const POINTS_PER_ATTEMPT_STEP = 10;   // baza = (max_prób - N + 1) * 10
const LENGTH_BONUS_PER_LETTER = 2;    // +2 * długość hasła za trafienie
const STREAK_BONUS_PER_DAY = 5;       // +5 * streak
const STREAK_BONUS_CAP = 25;          // ...ale nie więcej niż +25
const SPEED_BONUS_PLACES = 5;         // bonus za szybkość dla pierwszych 5 osób dnia: +5/+4/+3/+2/+1

// Miejsce liczymy w kolejności ukończenia (kto pierwszy trafił hasło dnia), nie po liczbie prób.
function speedBonusFor(place) {
  return place >= 1 && place <= SPEED_BONUS_PLACES ? SPEED_BONUS_PLACES - place + 1 : 0;
}

// Liczba prób na hasło = długość + 1
function maxAttemptsFor(wordLength) {
  return wordLength + 1;
}

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Zdjęcia profilowe Snakes — wymagane do gry, serwowane statycznie spod /avatars/<id>.jpg.
const avatarsDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'michal.db'));

// ── MIGRACJA ──
// Poprzedni rozdział to biurowa bukmacherka mundialowa. Office Wordle to nowy tryb —
// zachowujemy graczy i logowanie, ale usuwamy tabele zakładów i budujemy schemat Wordle.
const hasWordsTable = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' AND name='words'`
).get();
if (!hasWordsTable) {
  db.exec(`
    DROP TABLE IF EXISTS bets;
    DROP TABLE IF EXISTS bet_withdrawals;
    DROP TABLE IF EXISTS results;
    DROP TABLE IF EXISTS matches;
    DROP TABLE IF EXISTS bank;
  `);
}

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

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    order_index INTEGER UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id),
    word_id INTEGER REFERENCES words(id),
    word_index INTEGER NOT NULL,
    guesses TEXT DEFAULT '[]',
    status TEXT DEFAULT 'in_progress',
    attempts_used INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    win_place INTEGER,
    speed_bonus INTEGER DEFAULT 0,
    played_on TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    UNIQUE(player_id, word_id)
  );
`);

// Migracja starej tabeli players (z czasów bukmacherki) — dołóż brakujące kolumny.
function ensureColumn(table, column, definition) {
  const exists = db.prepare(
    `SELECT COUNT(*) AS c FROM pragma_table_info(?) WHERE name = ?`
  ).get(table, column).c > 0;
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('players', 'total_points', 'INTEGER DEFAULT 0');
ensureColumn('players', 'last_word_index', 'INTEGER DEFAULT 0');
ensureColumn('players', 'season', 'TEXT'); // sezon (YYYY-MM), w którym gracz ostatnio grał — do resetu streaka
// Bonus za szybkość doszedł później niż tabela games — dokładamy kolumny do istniejącej bazy.
ensureColumn('games', 'win_place', 'INTEGER');      // które to było trafienie danego dnia (1, 2, 3…)
ensureColumn('games', 'speed_bonus', 'INTEGER DEFAULT 0');

// Zamiana polskich znaków na ASCII — hasła muszą być grywalne na klawiaturze A–Z.
const PL_ASCII = { Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z' };
function toAsciiUpper(s) {
  return String(s).toUpperCase().replace(/[ĄĆĘŁŃÓŚŹŻ]/g, ch => PL_ASCII[ch]);
}

// Tasowanie Fisher-Yates
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Normalizacja hasła do postaci grywalnej (A–Z). Zwraca '' gdy nic nie zostaje.
function normalizeWord(raw) {
  return toAsciiUpper(raw == null ? '' : raw).replace(/[^A-Z]/g, '');
}

// ── SEED HASEŁ ──
// Hasła wczytujemy z slowa.json (jeśli istnieje), zamieniamy polskie znaki na ASCII
// i TASUJEMY — order_index przydzielany losowo, więc hasła dnia lecą w losowej kolejności.
const FALLBACK_WORDS = ['KAWA', 'BIURO', 'LAPTOP', 'PROJEKT', 'ZEBRANIE'];

// Akceptuje zarówno listę stringów, jak i listę obiektów { word: ... } (stary format).
function parseWordList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(w => normalizeWord(typeof w === 'string' ? w : w && w.word))
    .filter(w => w.length >= 3 && w.length <= 12);
}

function loadSeedWords() {
  const file = path.join(__dirname, 'slowa.json');
  if (fs.existsSync(file)) {
    try {
      const words = parseWordList(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (words.length) return words;
    } catch (e) {
      console.error('Nie udało się wczytać slowa.json:', e.message);
    }
  }
  return FALLBACK_WORDS.map(normalizeWord);
}

const seedCount = db.prepare('SELECT COUNT(*) AS c FROM words').get().c;
if (seedCount === 0) {
  const insertWord = db.prepare('INSERT INTO words (word, order_index) VALUES (?, ?)');
  shuffle(loadSeedWords()).forEach((w, i) => insertWord.run(w, i + 1));
}

// ── WALIDACJA SŁOWNIKOWA (hybryda) ──
// Zgadywane słowo musi być prawdziwe: albo jest w bundlowanym słowniku polskim (data/pl-words.txt,
// zwinięty do ASCII), albo — jeśli go tam nie ma (rzadkie/odmienione słowo) — przechodzi test
// fonotaktyczny. Blokuje to strzelanie samymi samogłoskami i "matematyczne" nie-słowa,
// nie odrzucając przy tym normalnie zbudowanych, realnych słów. Hasła gry są zawsze dozwolone.
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);
const DICTIONARY = new Set();
(function loadDictionary() {
  try {
    const file = path.join(__dirname, 'data', 'pl-words.txt');
    if (fs.existsSync(file)) {
      for (const w of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (w) DICTIONARY.add(w);
      }
    } else {
      console.warn('Brak data/pl-words.txt — walidacja opiera się tylko na heurystyce.');
    }
  } catch (e) {
    console.error('Nie udało się wczytać słownika:', e.message);
  }
  for (const r of db.prepare('SELECT word FROM words').all()) DICTIONARY.add(r.word);
  console.log('Słownik zgadywanej:', DICTIONARY.size, 'słów');
})();

// Heurystyka fonotaktyczna — odsiewa nie-słowa (same samogłoski, mash spółgłosek, powtórki liter).
function looksLikeWord(w) {
  const len = w.length;
  let vowels = 0;
  const counts = {};
  for (const c of w) {
    if (VOWELS.has(c)) vowels++;
    counts[c] = (counts[c] || 0) + 1;
    if (counts[c] > 3) return false;               // ta sama litera 4+ razy
  }
  if (vowels === 0) return false;                   // brak samogłoski
  if (vowels === len) return false;                 // same samogłoski (np. AEIOU)
  if (/(.)\1\1/.test(w)) return false;              // 3 identyczne litery pod rząd
  const ratio = vowels / len;
  if (ratio < 0.15 || ratio > 0.80) return false;   // nienaturalny udział samogłosek
  return true;
}

function isAllowedGuess(guess) {
  return DICTIONARY.has(guess) || looksLikeWord(guess);
}

// ── ZESTAWY HASEŁ ──
// Gotowe paczki haseł na dany miesiąc leżą w sets/*.json:
//   { "id": "2026-08", "label": "Sierpień 2026", "starts_on": "2026-08-01", "words": ["ALERT", ...] }
// Admin ładuje taki zestaw jednym przyciskiem — hasła trafiają do puli od pierwszego dnia
// roboczego miesiąca, w losowej kolejności, a wcześniejsze (rozegrane) dni zostają nietknięte.
const SETS_DIR = path.join(__dirname, 'sets');

function loadWordSets() {
  if (!fs.existsSync(SETS_DIR)) return [];
  return fs.readdirSync(SETS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(SETS_DIR, f), 'utf8'));
        const words = parseWordList(raw.words);
        if (!words.length) return null;
        const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(raw.starts_on || '') ? raw.starts_on : null;
        if (!startsOn) return null;
        return {
          id: raw.id || path.basename(f, '.json'),
          label: raw.label || path.basename(f, '.json'),
          starts_on: startsOn,
          words: [...new Set(words)]
        };
      } catch (e) {
        console.error(`Nie udało się wczytać zestawu ${f}:`, e.message);
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

// Numer hasła, od którego zestaw wchodzi do puli
function setStartIndex(set) {
  return businessDaysElapsed(firstBusinessDayOnOrAfter(set.starts_on));
}

// Granica nietykalna: do tego numeru hasła włącznie nie ruszamy niczego — to dni, które
// ktoś już rozegrał, plus hasło aktualnie wiszące (ktoś może być w trakcie zgadywania).
function frozenThroughIndex() {
  const lastPlayed = db.prepare(`
    SELECT MAX(w.order_index) AS n FROM words w JOIN games g ON g.word_id = w.id
  `).get().n || 0;
  return Math.max(Number(lastPlayed), supplyIndex());
}

// Plan podmiany zestawu: [from..to] to jego zakres dni, ale nadpisujemy dopiero od write_from.
function setPlan(set) {
  const from = setStartIndex(set);
  const to = from + set.words.length - 1;
  const writeFrom = Math.max(from, frozenThroughIndex() + 1);
  return { from, to, writeFrom, slots: to - writeFrom + 1 };
}

// Zestaw uznajemy za wczytany, gdy w podmienialnej części zakresu siedzą wyłącznie jego hasła.
// Dni zamrożone (rozegrane) celowo pomijamy — po podmianie w trakcie miesiąca zostają tam
// hasła z poprzedniej wersji zestawu i to jest w porządku.
function isSetLoaded(set) {
  const { to, writeFrom, slots } = setPlan(set);
  if (slots <= 0) return true; // cały zakres już rozegrany — nie ma czego wczytywać
  const rows = db.prepare(
    'SELECT word FROM words WHERE order_index >= ? AND order_index <= ?'
  ).all(writeFrom, to);
  if (rows.length !== slots) return false;
  const inSet = new Set(set.words);
  return rows.every(r => inSet.has(r.word));
}

function setSummary(set) {
  const { from, to, writeFrom, slots } = setPlan(set);
  return {
    id: set.id,
    label: set.label,
    starts_on: set.starts_on,
    word_count: set.words.length,
    from_index: from,
    to_index: to,
    from_date: dateForIndex(from),
    to_date: dateForIndex(to),
    write_from_index: writeFrom,
    write_from_date: dateForIndex(writeFrom),
    frozen_days: Math.max(0, writeFrom - from),
    replaceable_days: Math.max(0, slots),
    is_loaded: isSetLoaded(set)
  };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── STREFA CZASOWA (Europe/Warsaw) ──
function warsawParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

// Dzisiejsza data w Warszawie jako 'YYYY-MM-DD'
function todayWaw() {
  const p = warsawParts();
  return `${p.y}-${p.mo}-${p.d}`;
}

// Odwrotność warsawParts: epoch ms odpowiadający podanej godzinie ściennej w
// Europe/Warsaw dla danej daty (Y-M-D). Iteracyjnie koryguje różnicę stref (CET/CEST),
// aż warsawParts(wynik) faktycznie pokaże żądaną godzinę — zbiega w 1-2 krokach.
function warsawWallTimeToMs(y, m, d, hour) {
  const wantedUtc = Date.UTC(y, m - 1, d, hour, 0, 0);
  let guessMs = wantedUtc;
  for (let i = 0; i < 3; i++) {
    const p = warsawParts(new Date(guessMs));
    const shownUtc = Date.UTC(Number(p.y), Number(p.mo) - 1, Number(p.d), Number(p.h), Number(p.mi), Number(p.s));
    const diff = wantedUtc - shownUtc;
    if (diff === 0) break;
    guessMs += diff;
  }
  return guessMs;
}

// ── DNI ROBOCZE / NUMER HASŁA ──
// Weekend rozpoznajemy z daty kalendarzowej (na północach UTC — DST nie ma znaczenia).
function isWeekendStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6; // niedziela / sobota
}

// Ile dni roboczych (pon–pt) minęło od WORD_START do dateStr włącznie
function businessDaysElapsed(dateStr) {
  const [sy, sm, sd] = WORD_START.split('-').map(Number);
  const [ey, em, ed] = dateStr.split('-').map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  if (end < cur) return 0;
  let n = 0;
  while (cur <= end) {
    const dow = new Date(cur).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
    cur += 86400000;
  }
  return n;
}

function isoFromUTC(t) {
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// Poprzedni dzień roboczy przed dateStr (pon → poprzedni pt)
function previousBusinessDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  do { t -= 86400000; } while ([0, 6].includes(new Date(t).getUTCDay()));
  return isoFromUTC(t);
}

// Pierwszy dzień roboczy w dniu dateStr lub po nim
function firstBusinessDayOnOrAfter(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  while ([0, 6].includes(new Date(t).getUTCDay())) t += 86400000;
  return isoFromUTC(t);
}

// Data (YYYY-MM-DD), w którą wypadnie hasło o danym numerze — odwrotność businessDaysElapsed.
function dateForIndex(n) {
  if (!Number.isInteger(n) || n < 1) return null;
  const [y, m, d] = WORD_START.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  let count = 0;
  for (let i = 0; i < 20000; i++) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      count++;
      if (count === n) return isoFromUTC(t);
    }
    t += 86400000;
  }
  return null;
}

// Godzina, o której pojawia się nowe hasło (czasu Warszawy). Do tej godziny wisi wczorajsze.
const NEW_WORD_HOUR = parseInt(process.env.WORDLE_NEW_WORD_HOUR, 10) || 8;

// Które hasło jest teraz aktualne i w jakiej fazie:
//  - 'live'    : hasło dnia gra się (08:00 → północ) — można wpisywać
//  - 'expired' : północ → 08:00, wisi jeszcze wczorajsze hasło, ale wpisywanie zamknięte
//  - 'weekend' : sobota/niedziela — przerwa
// Zwraca { phase, index, date } (index/date = null poza dniami z hasłem).
function activePuzzle() {
  const p = warsawParts();
  const today = `${p.y}-${p.mo}-${p.d}`;
  const hour = Number(p.h);

  if (isWeekendStr(today)) {
    return { phase: 'weekend', index: null, date: null };
  }
  if (hour >= NEW_WORD_HOUR) {
    const n = businessDaysElapsed(today);
    return { phase: 'live', index: n >= 1 ? n : null, date: today };
  }
  // 00:00–08:00 w dzień roboczy: wisi jeszcze hasło poprzedniego dnia roboczego, ale zamknięte
  const prev = previousBusinessDay(today);
  const n = businessDaysElapsed(prev);
  return { phase: 'expired', index: n >= 1 ? n : null, date: prev };
}

// Numer aktualnie pokazywanego hasła (do rankingu dnia / panelu admina). null gdy brak.
function currentPuzzleIndex() {
  return activePuzzle().index;
}

// Najwyższy zużyty indeks hasła — do liczenia zapasu w puli
function supplyIndex() {
  const idx = currentPuzzleIndex();
  return idx !== null ? idx : businessDaysElapsed(todayWaw());
}

// Aktualnie pokazywane hasło (żywe LUB wygasłe — do wyświetlenia; null w weekend/przerwie)
function currentWord() {
  const idx = currentPuzzleIndex();
  if (!idx) return null;
  return db.prepare('SELECT * FROM words WHERE order_index = ?').get(idx) || null;
}

// ── SEZON (miesiąc kalendarzowy) ──
function currentSeasonId() {
  const p = warsawParts();
  return `${p.y}-${p.mo}`; // 'YYYY-MM'
}
function seasonMonthLabel(id) {
  const [y, m] = id.split('-').map(Number);
  return `${MONTHS_PL[m - 1]} ${y}`;
}
function seasonLabel() {
  return seasonMonthLabel(currentSeasonId());
}
function isTestPeriod() {
  return currentSeasonId() < CONTEST_START;
}
// Granice bieżącego sezonu jako daty 'YYYY-MM-DD' [first, nextFirst)
function seasonBounds() {
  const p = warsawParts();
  const first = `${p.y}-${p.mo}-01`;
  let y = Number(p.y), m = Number(p.mo) + 1;
  if (m > 12) { m = 1; y++; }
  const nextFirst = `${y}-${String(m).padStart(2, '0')}-01`;
  return { first, nextFirst };
}

function seasonInfo() {
  const ap = activePuzzle();
  const idx = ap.index;
  const supply = supplyIndex();
  const maxIndex = db.prepare('SELECT MAX(order_index) AS m FROM words').get().m || 0;
  const hasWord = idx !== null && !!db.prepare('SELECT 1 FROM words WHERE order_index = ?').get(idx);
  return {
    season_id: currentSeasonId(),
    season_label: seasonLabel(),
    is_test: isTestPeriod(),
    contest_start: CONTEST_START,
    phase: ap.phase,
    day_number: idx,
    is_weekend: ap.phase === 'weekend',
    new_word_hour: NEW_WORD_HOUR,
    remaining_words: db.prepare('SELECT COUNT(*) AS c FROM words WHERE order_index > ?').get(supply).c,
    total_words: db.prepare('SELECT COUNT(*) AS c FROM words').get().c,
    max_index: maxIndex,
    supply_exhausted: idx !== null && idx > maxIndex,
    has_word_today: hasWord,
    speed_bonus_places: SPEED_BONUS_PLACES // publiczny znacznik: brak pola = działa stara wersja serwera
  };
}

// Streak/rekord ograniczone do bieżącego sezonu (0, jeśli gracz nie grał jeszcze w tym miesiącu)
function effectiveStreaks(player) {
  return player.season === currentSeasonId()
    ? { current: player.current_streak, best: player.best_streak }
    : { current: 0, best: 0 };
}

// Punkty gracza w bieżącym sezonie (suma z gier tego miesiąca)
function seasonPoints(playerId) {
  const { first, nextFirst } = seasonBounds();
  return Number(db.prepare(
    'SELECT COALESCE(SUM(points), 0) AS p FROM games WHERE player_id = ? AND played_on >= ? AND played_on < ?'
  ).get(playerId, first, nextFirst).p);
}

// Ilu graczy odgadło już dzisiejsze hasło (do liczenia wolnych miejsc premiowanych)
function winnersToday(wordId) {
  return Number(db.prepare(
    `SELECT COUNT(*) AS c FROM games WHERE word_id = ? AND status = 'won'`
  ).get(wordId).c);
}

// ── OCENA ZGADYWANIA (standard Wordle, obsługa powtórzeń) ──
function evaluateGuess(guess, answer) {
  const n = answer.length;
  const res = new Array(n).fill('gray');
  const counts = {};
  for (const ch of answer) counts[ch] = (counts[ch] || 0) + 1;
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) { res[i] = 'green'; counts[guess[i]]--; }
  }
  for (let i = 0; i < n; i++) {
    if (res[i] === 'green') continue;
    const c = guess[i];
    if (counts[c] > 0) { res[i] = 'yellow'; counts[c]--; }
  }
  return res;
}

// Zbiorczy status każdej litery na klawiaturze (green > yellow > gray)
function keyboardStatuses(guesses, answer) {
  const rank = { gray: 0, yellow: 1, green: 2 };
  const map = {};
  guesses.forEach(g => {
    const statuses = evaluateGuess(g, answer);
    for (let i = 0; i < g.length; i++) {
      const c = g[i], s = statuses[i];
      if (!map[c] || rank[s] > rank[map[c]]) map[c] = s;
    }
  });
  return map;
}

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

// Buduje pełny stan gry dla gracza na dziś (bez zdradzania hasła, dopóki gra trwa)
function buildGameState(player) {
  const info = seasonInfo();
  const word = currentWord();

  const eff = effectiveStreaks(player);
  const base = {
    season_id: info.season_id,
    season_label: info.season_label,
    is_test: info.is_test,
    phase: info.phase,
    day_number: info.day_number,
    is_weekend: info.is_weekend,
    supply_exhausted: info.supply_exhausted,
    new_word_hour: info.new_word_hour,
    remaining_words: info.remaining_words,
    total_words: info.total_words,
    stats: {
      current_streak: eff.current,
      best_streak: eff.best,
      season_points: seasonPoints(player.id)
    }
  };

  if (!word) {
    return { ...base, has_word: false };
  }

  const live = info.phase === 'live';
  const maxAttempts = maxAttemptsFor(word.word.length);
  const game = db.prepare(
    'SELECT * FROM games WHERE player_id = ? AND word_id = ?'
  ).get(player.id, word.id);

  const guessList = game ? JSON.parse(game.guesses) : [];
  const rows = guessList.map(g => ({
    guess: g,
    statuses: evaluateGuess(g, word.word)
  }));
  const rawStatus = game ? game.status : 'not_started';
  const finished = rawStatus === 'won' || rawStatus === 'lost';
  // Po godzinie 00:00 (faza 'expired') wpisywanie jest zamknięte — niedokończoną grę
  // pokazujemy jako 'expired' i odsłaniamy hasło. Na żywo działa normalnie.
  const status = (!live && !finished) ? 'expired' : rawStatus;
  const playable = live && (rawStatus === 'not_started' || rawStatus === 'in_progress');

  return {
    ...base,
    has_word: true,
    playable,
    word_length: word.word.length,
    max_attempts: maxAttempts,
    guesses: rows,
    attempts_used: guessList.length,
    status,
    keyboard: keyboardStatuses(guessList, word.word),
    points_today: game ? game.points : 0,
    // Bonus za szybkość: moje miejsce (jeśli wygrałem) i ile premiowanych miejsc jeszcze wolnych.
    win_place: game && game.status === 'won' ? game.win_place : null,
    speed_bonus: game ? Number(game.speed_bonus || 0) : 0,
    speed_bonus_places: SPEED_BONUS_PLACES,
    speed_spots_left: Math.max(0, SPEED_BONUS_PLACES - winnersToday(word.id)),
    answer: (finished || !live) ? word.word : null
  };
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

app.get('/api/me', authPlayer, (req, res) => {
  const { player } = req;
  const eff = effectiveStreaks(player);
  res.json({
    id: player.id,
    nickname: player.nickname,
    current_streak: eff.current,
    best_streak: eff.best,
    season_points: seasonPoints(player.id)
  });
});

// GET /api/wordle/today — stan dzisiejszej rozgrywki gracza
app.get('/api/wordle/today', authPlayer, (req, res) => {
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.id);
  res.json(buildGameState(player));
});

// POST /api/wordle/guess — dopisz próbę { guess }
app.post('/api/wordle/guess', authPlayer, (req, res) => {
  const ap = activePuzzle();
  if (ap.phase !== 'live') {
    const msg = ap.phase === 'weekend'
      ? 'Weekend — hasła gramy od poniedziałku do piątku'
      : `Wpisywanie zamknięte o północy — nowe hasło o ${NEW_WORD_HOUR}:00`;
    return res.status(400).json({ error: msg });
  }
  const word = currentWord();
  if (!word) return res.status(400).json({ error: 'Brak hasła w puli na dziś' });

  const answer = word.word;
  const maxAttempts = maxAttemptsFor(answer.length);
  const guess = String(req.body.guess || '').trim().toUpperCase();

  if (guess.length !== answer.length) {
    return res.status(400).json({ error: `Hasło ma ${answer.length} liter` });
  }
  if (!/^[A-Z]+$/.test(guess)) {
    return res.status(400).json({ error: 'Dozwolone są tylko litery A–Z' });
  }
  // Nie-słowa odrzucamy zanim policzymy próbę — nieudana walidacja nie zużywa podejścia.
  if (guess !== answer && !isAllowedGuess(guess)) {
    return res.status(400).json({ error: 'Nie ma takiego słowa — wpisz istniejące słowo', invalid_word: true });
  }

  const result = transaction(() => {
    let game = db.prepare('SELECT * FROM games WHERE player_id = ? AND word_id = ?').get(req.player.id, word.id);

    if (!game) {
      db.prepare(`
        INSERT INTO games (player_id, word_id, word_index, guesses, status, played_on)
        VALUES (?, ?, ?, '[]', 'in_progress', ?)
      `).run(req.player.id, word.id, word.order_index, todayWaw());
      game = db.prepare('SELECT * FROM games WHERE player_id = ? AND word_id = ?').get(req.player.id, word.id);
    }

    if (game.status !== 'in_progress') {
      return { locked: true };
    }

    const guesses = JSON.parse(game.guesses);
    if (guesses.length >= maxAttempts) {
      return { locked: true };
    }

    guesses.push(guess);
    const attemptsUsed = guesses.length;
    const won = guess === answer;
    const lost = !won && attemptsUsed >= maxAttempts;
    let status = 'in_progress';
    let points = 0;
    let winPlace = null;
    let speedBonus = 0;

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.id);
    // Streak jest liczony w obrębie sezonu (miesiąca). Jeśli gracz nie grał jeszcze w tym
    // sezonie, startuje od zera — to daje automatyczny reset 1. dnia miesiąca.
    const season = currentSeasonId();
    const sameSeason = player.season === season;
    const prevStreak = sameSeason ? player.current_streak : 0;
    const prevBest = sameSeason ? player.best_streak : 0;
    const prevLastIdx = sameSeason ? player.last_word_index : 0;

    if (won || lost) {
      status = won ? 'won' : 'lost';

      let newStreak;
      if (won) {
        // Indeksy haseł pomijają weekendy, więc pt→pn to wciąż kolejne numery — seria trwa.
        newStreak = (prevLastIdx === word.order_index - 1) ? prevStreak + 1 : 1;
        const base = (maxAttempts - attemptsUsed + 1) * POINTS_PER_ATTEMPT_STEP;
        const lengthBonus = LENGTH_BONUS_PER_LETTER * answer.length;
        const streakBonus = Math.min(newStreak * STREAK_BONUS_PER_DAY, STREAK_BONUS_CAP);
        // Bonus za szybkość — liczymy, ilu graczy trafiło hasło przede mną (jesteśmy
        // w transakcji, a baza jest jednowątkowa, więc miejsca nie zdublują się).
        const winnersBefore = db.prepare(
          `SELECT COUNT(*) AS c FROM games WHERE word_id = ? AND status = 'won'`
        ).get(word.id).c;
        winPlace = Number(winnersBefore) + 1;
        speedBonus = speedBonusFor(winPlace);
        points = base + lengthBonus + streakBonus + speedBonus;
      } else {
        newStreak = 0;
      }

      const bestStreak = Math.max(prevBest, newStreak);
      db.prepare(`
        UPDATE players
        SET current_streak = ?, best_streak = ?, last_word_index = ?, season = ?,
            total_points = total_points + ?, total_wins = total_wins + ?
        WHERE id = ?
      `).run(newStreak, bestStreak, word.order_index, season, points, won ? 1 : 0, player.id);

      db.prepare(`
        UPDATE games SET guesses = ?, status = ?, attempts_used = ?, points = ?,
               win_place = ?, speed_bonus = ?, finished_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(guesses), status, attemptsUsed, points, winPlace, speedBonus, game.id);
    } else {
      db.prepare('UPDATE games SET guesses = ?, attempts_used = ? WHERE id = ?')
        .run(JSON.stringify(guesses), attemptsUsed, game.id);
    }

    return { locked: false };
  });

  if (result.locked) {
    return res.status(400).json({ error: 'Dzisiejsza gra jest już zakończona' });
  }

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.id);
  res.json(buildGameState(player));
});

// GET /api/season — publiczny status sezonu (do nagłówka)
app.get('/api/season', (req, res) => {
  res.json(seasonInfo());
});

// GET /api/leaderboard?season=YYYY-MM|all&highlight=ID
// Domyślnie bieżący sezon (miesiąc). Konkretny 'YYYY-MM' = historyczny leaderboard danego
// miesiąca; 'all' = wszystkie sezony razem. Zwraca też listę dostępnych miesięcy (do wyboru).
app.get('/api/leaderboard', (req, res) => {
  const highlightId = parseInt(req.query.highlight, 10) || null;
  const curSeason = currentSeasonId();
  const q = req.query.season;
  let target;
  if (q === 'all') target = 'all';
  else if (/^\d{4}-\d{2}$/.test(q || '')) target = q;
  else target = curSeason;

  let dateFilter = '';
  if (target !== 'all') {
    const [y, m] = target.split('-').map(Number);
    let ny = y, nm = m + 1;
    if (nm > 12) { nm = 1; ny++; }
    const first = `${target}-01`;
    const nextFirst = `${ny}-${String(nm).padStart(2, '0')}-01`;
    dateFilter = `AND g.played_on >= '${first}' AND g.played_on < '${nextFirst}'`;
  }

  // Streak pokazujemy tylko dla bieżącego sezonu (dla miesięcy historycznych go nie
  // przechowujemy) — w innych widokach kolumna serii jest pusta.
  const isCurrent = target === curSeason;
  const streakSelect = isCurrent ? 'CASE WHEN p.season = ? THEN p.current_streak ELSE 0 END' : 'NULL';
  const params = isCurrent ? [curSeason] : [];

  const rows = db.prepare(`
    SELECT
      p.id, p.nickname,
      ${streakSelect} AS streak,
      COALESCE(SUM(g.points), 0) AS points,
      COUNT(g.id) AS games_played,
      SUM(CASE WHEN g.status = 'won' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.status = 'won' THEN g.attempts_used ELSE 0 END) AS won_attempts
    FROM players p
    LEFT JOIN games g ON g.player_id = p.id ${dateFilter}
    GROUP BY p.id
    HAVING games_played > 0
    ORDER BY points DESC, wins DESC, games_played ASC
  `).all(...params);

  const list = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    nickname: r.nickname,
    total_points: Number(r.points),
    streak: r.streak === null ? null : Number(r.streak),
    games_played: Number(r.games_played),
    wins: Number(r.wins),
    avg_attempts: r.wins > 0 ? Math.round((Number(r.won_attempts) / Number(r.wins)) * 10) / 10 : null,
    is_me: highlightId ? r.id === highlightId : false
  }));

  // Lista miesięcy, w których cokolwiek rozegrano (+ zawsze bieżący sezon), do selektora historii
  const seasons = db.prepare(`SELECT DISTINCT substr(played_on, 1, 7) AS s FROM games ORDER BY s DESC`).all().map(r => r.s);
  if (!seasons.includes(curSeason)) seasons.unshift(curSeason);
  seasons.sort().reverse();
  const availableSeasons = seasons.map(s => ({ id: s, label: seasonMonthLabel(s), is_current: s === curSeason }));

  res.json({
    leaderboard: list,
    total_players: list.length,
    season: target,
    season_label: target === 'all' ? 'Wszystkie sezony' : seasonMonthLabel(target),
    current_season: curSeason,
    available_seasons: availableSeasons
  });
});

// GET /api/wordle/daily — ranking dzisiejszego hasła (kto najlepiej trafił dziś)
app.get('/api/wordle/daily', (req, res) => {
  const highlightId = parseInt(req.query.highlight, 10) || null;
  const day = currentPuzzleIndex();
  const word = currentWord();

  if (!word) {
    return res.json({ day_number: day, has_word: false, is_weekend: isWeekendStr(todayWaw()), entries: [], total: 0 });
  }

  // Zwycięzcy najpierw (mniej prób = wyżej), potem przegrani. Punkty jako rozstrzygnięcie remisu.
  const rows = db.prepare(`
    SELECT g.status, g.attempts_used, g.points, g.win_place, g.speed_bonus, p.id AS player_id, p.nickname
    FROM games g
    JOIN players p ON p.id = g.player_id
    WHERE g.word_index = ? AND g.status IN ('won', 'lost')
    ORDER BY
      (g.status = 'won') DESC,
      CASE WHEN g.status = 'won' THEN g.attempts_used ELSE 999 END ASC,
      g.points DESC
  `).all(word.order_index);

  const entries = rows.map((r, i) => ({
    rank: i + 1,
    nickname: r.nickname,
    status: r.status,
    attempts_used: Number(r.attempts_used),
    points: Number(r.points),
    win_place: r.status === 'won' && r.win_place ? Number(r.win_place) : null,
    speed_bonus: Number(r.speed_bonus || 0),
    is_me: highlightId ? r.player_id === highlightId : false
  }));

  const inProgress = db.prepare(`
    SELECT COUNT(*) AS c FROM games WHERE word_index = ? AND status = 'in_progress'
  `).get(word.order_index).c;

  res.json({
    day_number: day,
    has_word: true,
    entries,
    total: entries.length,
    in_progress: Number(inProgress),
    speed_bonus_places: SPEED_BONUS_PLACES,
    speed_spots_left: Math.max(0, SPEED_BONUS_PLACES - winnersToday(word.id))
  });
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

// GET /api/admin/words — lista haseł + status sezonu.
// UWAGA: treść przyszłych i dzisiejszego hasła NIE jest wysyłana — admin też gra, więc
// nie może ich przypadkiem zobaczyć (ani w tabeli, ani w devtools). Odsłonić można
// pojedyncze hasło świadomie: GET /api/admin/word/:id/reveal.
app.get('/api/admin/words', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const words = db.prepare('SELECT id, word, order_index FROM words ORDER BY order_index ASC').all();
  const ap = activePuzzle();
  const idx = ap.index;
  // W fazie 'expired' (po północy) hasło dnia jest już odsłonięte graczom, więc i tu jest jawne.
  const pastThreshold = idx === null ? supplyIndex() + 1 : (ap.phase === 'expired' ? idx + 1 : idx);
  const withStatus = words.map(w => {
    const played = db.prepare('SELECT COUNT(*) AS c FROM games WHERE word_id = ?').get(w.id).c;
    const isPast = w.order_index < pastThreshold;
    return {
      id: w.id,
      order_index: w.order_index,
      date: dateForIndex(w.order_index),
      word: isPast ? w.word : null, // rozegrane hasła są już jawne
      hidden: !isPast,
      length: w.word.length,
      max_attempts: maxAttemptsFor(w.word.length),
      is_current: idx !== null && w.order_index === idx,
      is_past: isPast,
      games_played: Number(played)
    };
  });
  res.json({ words: withStatus, season: seasonInfo(), word_start: WORD_START });
});

// GET /api/admin/word/:id/reveal — świadome odsłonięcie jednego ukrytego hasła
app.get('/api/admin/word/:id/reveal', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const word = db.prepare('SELECT word FROM words WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!word) return res.status(404).json({ error: 'Hasło nie istnieje' });
  res.json({ word: word.word });
});

// POST /api/admin/word — dodaj lub zaktualizuj hasło { id?, word, order_index }
app.post('/api/admin/word', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { id } = req.body;
  const word = toAsciiUpper(String(req.body.word || '').trim());
  const orderIndex = parseInt(req.body.order_index, 10);

  if (!/^[A-Z]{3,12}$/.test(word)) {
    return res.status(400).json({ error: 'Hasło: 3–12 liter A–Z (bez polskich znaków i spacji)' });
  }
  if (!Number.isInteger(orderIndex) || orderIndex < 1) {
    return res.status(400).json({ error: 'Podaj poprawny numer dnia (order_index ≥ 1)' });
  }

  const clash = db.prepare('SELECT id FROM words WHERE order_index = ? AND id IS NOT ?').get(orderIndex, id || null);
  if (clash) {
    return res.status(400).json({ error: `Numer dnia ${orderIndex} jest już zajęty przez inne hasło` });
  }

  try {
    if (id) {
      const existing = db.prepare('SELECT * FROM words WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Hasło nie istnieje' });
      db.prepare('UPDATE words SET word = ?, order_index = ? WHERE id = ?')
        .run(word, orderIndex, id);
    } else {
      db.prepare('INSERT INTO words (word, order_index) VALUES (?, ?)')
        .run(word, orderIndex);
    }
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ten numer dnia jest już zajęty' });
    }
    throw e;
  }

  DICTIONARY.add(word); // nowe hasło ma być zawsze dozwolone jako zgadywane słowo
  res.json({ success: true });
});

// DELETE /api/admin/word/:id
app.delete('/api/admin/word/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const wordId = parseInt(req.params.id, 10);
  const word = db.prepare('SELECT * FROM words WHERE id = ?').get(wordId);
  if (!word) return res.status(404).json({ error: 'Hasło nie istnieje' });

  const played = db.prepare('SELECT COUNT(*) AS c FROM games WHERE word_id = ?').get(wordId).c;
  if (played > 0) {
    return res.status(400).json({ error: 'Nie można usunąć — to hasło ma już rozegrane gry' });
  }

  db.prepare('DELETE FROM words WHERE id = ?').run(wordId);
  res.json({ success: true });
});

// GET /api/admin/sets — gotowe zestawy haseł do wczytania jednym kliknięciem
app.get('/api/admin/sets', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ sets: loadWordSets().map(setSummary) });
});

// POST /api/admin/sets/:id/load — wczytaj zestaw do puli od jego pierwszego dnia roboczego.
// Podmiana jest bezpieczna także w trakcie miesiąca: dni już rozegrane oraz hasło dnia
// bieżącego zostają nietknięte, nadpisywane są wyłącznie przyszłe, jeszcze niezagrane sloty.
// Dzięki temu można poprawić zestaw po starcie sezonu, nie psując wyników z rozegranych dni.
app.post('/api/admin/sets/:id/load', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const set = loadWordSets().find(s => s.id === req.params.id);
  if (!set) return res.status(404).json({ error: 'Nie ma takiego zestawu' });

  const { from, to, writeFrom, slots } = setPlan(set);
  if (slots <= 0) {
    return res.status(400).json({
      error: `Nie ma czego podmieniać — cały zestaw (dni #${from}–#${to}) jest już rozegrany`
    });
  }

  // Hasła, które zostają na zamrożonych dniach — nie chcemy ich powtórzyć w nowej części.
  const kept = db.prepare(
    'SELECT word FROM words WHERE order_index >= ? AND order_index < ?'
  ).all(from, writeFrom).map(r => r.word);
  const keptSet = new Set(kept);

  const candidates = set.words.filter(w => !keptSet.has(w));
  if (candidates.length < slots) {
    return res.status(400).json({
      error: `Za mało nowych haseł — ${candidates.length} do obsadzenia ${slots} dni`
    });
  }
  const chosen = shuffle(candidates).slice(0, slots);

  const replaced = transaction(() => {
    // Kasujemy tylko to, czego nikt nie tknął — gry trzymają referencję do words.id.
    const removed = db.prepare(`
      DELETE FROM words
      WHERE order_index >= ?
        AND id NOT IN (SELECT word_id FROM games WHERE word_id IS NOT NULL)
    `).run(writeFrom).changes;
    const insert = db.prepare('INSERT INTO words (word, order_index) VALUES (?, ?)');
    chosen.forEach((w, i) => insert.run(w, writeFrom + i));
    return Number(removed);
  });

  for (const w of set.words) DICTIONARY.add(w); // hasła zawsze dozwolone jako zgadywane słowa

  res.json({
    success: true,
    loaded: chosen.length,
    unused: set.words.length - chosen.length,
    replaced,
    kept: kept.length,
    kept_from_index: kept.length ? from : null,
    kept_to_index: kept.length ? writeFrom - 1 : null,
    kept_from_date: kept.length ? dateForIndex(from) : null,
    kept_to_date: kept.length ? dateForIndex(writeFrom - 1) : null,
    from_index: writeFrom,
    to_index: to,
    from_date: dateForIndex(writeFrom),
    to_date: dateForIndex(to)
  });
});

// GET /api/admin/players
app.get('/api/admin/players', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const players = db.prepare(`
    SELECT id, nickname, total_points, total_wins, current_streak, best_streak, created_at, last_seen
    FROM players
    ORDER BY total_points DESC
  `).all();
  res.json({ players });
});

// DELETE /api/admin/player/:id
app.delete('/api/admin/player/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const playerId = parseInt(req.params.id, 10);
  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  transaction(() => {
    db.prepare('DELETE FROM games WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
  });

  res.json({ success: true, deleted: player.nickname });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── CODZIENNE POWIADOMIENIE NA DISCORDA ──
// O NOTIFY_HOUR (domyślnie 8:00 czasu Warszawy) leci webhook z linkiem do gry.
// Weekendy pomijamy — wtedy nie ma hasła. Webhook trzymamy w .env (repo jest publiczne).
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const APP_URL = process.env.APP_URL || 'https://frog03-21535.wykr.es/';
const NOTIFY_HOUR = parseInt(process.env.DISCORD_NOTIFY_HOUR, 10) || NEW_WORD_HOUR;

// Ostatni dzień (YYYY-MM-DD), za który powiadomienie już poszło — chroni przed dublem
// przy restarcie serwera w ciągu dnia.
let lastNotifiedDate = null;

async function sendDiscordNotification() {
  if (!DISCORD_WEBHOOK_URL) return { skipped: 'brak DISCORD_WEBHOOK_URL' };

  const idx = businessDaysElapsed(todayWaw());
  const payload = {
    content: '🟩 **Office Wordle** — nowe hasło dnia jest już dostępne!',
    embeds: [{
      title: idx >= 1 ? `Hasło #${idx}` : 'Zagraj teraz',
      url: APP_URL,
      description: `Masz czas do północy. ⚡ Pierwsze ${SPEED_BONUS_PLACES} osób, które dziś trafią, dostaje bonus (+${SPEED_BONUS_PLACES}…+1 pkt). Powodzenia!\n${APP_URL}`,
      color: 0x6aaa64,
      footer: { text: `Sezon: ${seasonLabel()}` }
    }]
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  return { sent: true, index: idx };
}

// Tykamy co minutę zamiast liczyć setTimeout do 8:00 — odporne na DST i na drift.
function startDiscordScheduler() {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('Discord: brak DISCORD_WEBHOOK_URL — powiadomienia wyłączone');
    return;
  }

  // Start po godzinie powiadomienia = dzisiejsze uznajemy za wysłane (nie spamujemy przy restarcie).
  if (Number(warsawParts().h) >= NOTIFY_HOUR) lastNotifiedDate = todayWaw();

  setInterval(async () => {
    const today = todayWaw();
    if (today === lastNotifiedDate) return;
    if (Number(warsawParts().h) < NOTIFY_HOUR) return;
    if (isWeekendStr(today)) { lastNotifiedDate = today; return; }

    lastNotifiedDate = today; // ustawiamy przed wysyłką — błąd sieci nie ma powtarzać się co minutę
    try {
      await sendDiscordNotification();
      console.log(`Discord: powiadomienie wysłane (${today})`);
    } catch (err) {
      console.error('Discord: nie udało się wysłać powiadomienia —', err.message);
    }
  }, 60_000);

  console.log(`Discord: powiadomienia włączone, codziennie o ${String(NOTIFY_HOUR).padStart(2, '0')}:00 (pon–pt, Europe/Warsaw)`);
}

// POST /api/admin/discord-test — ręczne wysłanie powiadomienia (do sprawdzenia webhooka)
app.post('/api/admin/discord-test', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const result = await sendDiscordNotification();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
//    Double Move oraz Shield (obrona — blokuje najbliższy Freeze/Curse).
//  • Wydarzenie kooperacyjne: gracze dorzucają punkty do wspólnej puli; po przekroczeniu
//    progu rusza event „bossowy", a po jego ukończeniu kontrybutorzy dostają nagrody.

const SL_BOARD_COLS = 7;                     // szerokość planszy w polach
const SL_BOARD_ROWS = 7;                     // wysokość planszy w polach
const SL_BOARD_SIZE = SL_BOARD_COLS * SL_BOARD_ROWS;  // 49 pól (indeks 0..48), potem pętla
const SL_POINTS_PER_PIP = 2;           // punkty za każde oczko rzutu
const SL_POINTS_PER_TILE = 1;          // punkty za każde przebyte pole (postęp)
const SL_POINTS_PER_LAP = 50;          // bonus za każde ukończone okrążenie

// Koszty power-upów (w punktach). Shield jest droższy od Freeze/Curse — to kontra
// na cudzy atak, więc ma kosztować więcej niż sam atak, ale zostaje w zasięgu
// kilku dni zbierania (dzienny ruch to ~10–30 pkt).
const SL_POWERUP_COSTS = { freeze: 30, curse: 50, double_move: 40, shield: 70 };
const SL_POWERUP_TYPES = Object.keys(SL_POWERUP_COSTS);
const SL_CURSE_VARIANTS = 3;           // liczba losowych wariantów klątwy (efekty TBD)
// Typy ataków, które Shield potrafi zablokować (zużywa się przy pierwszym z nich).
const SL_SHIELD_BLOCKS = ['freeze', 'curse'];

// ── WYDARZENIE KOOPERACYJNE (co-op) ──
const SL_COOP_THRESHOLD = parseInt(process.env.SNAKES_COOP_THRESHOLD, 10) || 300;
// Pula nagród = próg × mnożnik. >1 oznacza, że wspólny wysiłek zwraca się z nawiązką.
const SL_COOP_REWARD_MULTIPLIER = Number(process.env.SNAKES_COOP_REWARD_MULTIPLIER || 1.5);
// 'proportional' = proporcjonalnie do wkładu (domyślnie — kto dołożył więcej, dostaje więcej),
// 'flat' = po równo między wszystkich kontrybutorów.
const SL_COOP_REWARD_SPLIT = (process.env.SNAKES_COOP_REWARD_SPLIT || 'proportional').toLowerCase();

// ── KNOCKBACK (wypychanie z zajętego pola) ──
const SL_KNOCKBACK_TILES = 5;

// Ile ruchów (rzutów) dziennie ma każdy gracz. Freeze blokuje JEDEN z nich (nie cały
// dzień); Double Move nadal oznacza dwie kostki w JEDNYM z tych ruchów, nie osobny slot.
const SL_DAILY_ROLLS = 2;

// ── OKNO CO-OP + KARA ──
// Cykliczne "okno" na osiągnięcie progu puli, zakotwiczone w konkretnym dniu tygodnia
// i godzinie (czasu Warszawy) — domyślnie start wtorek 13:00. Okno trwa WINDOW_DAYS
// (domyślnie 7) i ROZLICZA SIĘ (kara, jeśli próg nie padł) GAP_HOURS przed kolejnym
// startem (domyślnie 4h) — czyli domyślnie: start wt. 13:00, rozliczenie wt. 09:00
// (tydzień później), 4h przerwy na obejrzenie wyników, kolejny start wt. 13:00.
// Ponieważ WINDOW_DAYS to pełne dni, dzień tygodnia startu nigdy nie dryfuje.
const SL_COOP_WINDOW_DAYS = Number(process.env.SNAKES_COOP_WINDOW_DAYS || 7);
const SL_COOP_WINDOW_MS = SL_COOP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const SL_COOP_GAP_HOURS = Number(process.env.SNAKES_COOP_GAP_HOURS || 4);
const SL_COOP_GAP_MS = SL_COOP_GAP_HOURS * 60 * 60 * 1000;
const SL_COOP_PENALTY = parseInt(process.env.SNAKES_COOP_PENALTY, 10) || 100;
// Dzień tygodnia (0=niedziela..6=sobota, JS getUTCDay) i godzina PIERWSZEGO okna —
// używane tylko raz, do zakotwiczenia cyklu #1; każdy kolejny cykl liczy się od niego.
const SL_COOP_START_DOW = Number(process.env.SNAKES_COOP_START_DOW ?? 2); // wtorek
const SL_COOP_START_HOUR = Number(process.env.SNAKES_COOP_START_HOUR ?? 13);

// ── SCHEMAT (addytywny, CREATE IF NOT EXISTS — nie rusza tabel Wordle) ──
db.exec(`
  -- Stan gracza w Wężach i Drabinach
  CREATE TABLE IF NOT EXISTS sl_state (
    player_id         INTEGER PRIMARY KEY REFERENCES players(id),
    abs_pos           INTEGER DEFAULT 0,   -- łączny przebyty dystans (pól od startu)
    laps              INTEGER DEFAULT 0,   -- ukończone okrążenia
    balance           INTEGER DEFAULT 0,   -- punkty do wydania w sklepie
    total_points      INTEGER DEFAULT 0,   -- suma zdobytych punktów (leaderboard)
    last_move_date    TEXT,                -- YYYY-MM-DD (Europe/Warsaw) ostatniego ruchu
    has_avatar        INTEGER DEFAULT 0,   -- 1 = ma zdjęcie profilowe (wymagane do gry)
    avatar_updated_at DATETIME,            -- kiedy ostatnio wgrał/zmienił zdjęcie
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Konfiguracja wspólnej planszy: typ pola i (dla węża/drabiny) cel skoku.
  CREATE TABLE IF NOT EXISTS sl_board (
    position INTEGER PRIMARY KEY,       -- 0..SL_BOARD_SIZE-1
    kind     TEXT NOT NULL,             -- 'ladder' | 'snake' | 'bonus'
    target   INTEGER,                   -- pole docelowe (ladder/snake), NULL dla bonus
    value    INTEGER DEFAULT 0          -- punkty bonusowe (bonus), 0 dla ladder/snake
  );

  -- Dziennik ruchów — blokada „SL_DAILY_ROLLS ruchów dziennie" przez
  -- UNIQUE(player_id, move_date, move_seq): move_seq numeruje kolejne ruchy tego
  -- samego dnia (1, 2, ...), więc każdy z dziennych ruchów dostaje własny wiersz.
  CREATE TABLE IF NOT EXISTS sl_moves (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id  INTEGER REFERENCES players(id),
    move_date  TEXT NOT NULL,           -- YYYY-MM-DD (Europe/Warsaw)
    move_seq   INTEGER NOT NULL DEFAULT 1, -- który to ruch danego dnia (1, 2, ...)
    rolls      TEXT DEFAULT '[]',       -- JSON: rzucone wartości (1 lub 2 przy Double Move)
    from_abs   INTEGER,
    to_abs     INTEGER,
    points     INTEGER DEFAULT 0,
    note       TEXT,                    -- np. 'frozen', 'ladder', 'snake', 'bonus'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, move_date, move_seq)
  );

  -- Ekwipunek power-upów (ile sztuk danego typu ma gracz).
  CREATE TABLE IF NOT EXISTS sl_inventory (
    player_id INTEGER REFERENCES players(id),
    type      TEXT NOT NULL,            -- 'freeze' | 'curse' | 'double_move' | 'shield'
    qty       INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, type)
  );

  -- Aktywne efekty power-upów oczekujące na „następną turę" celu.
  -- Shield leży tu jako 'pending' aż do momentu, w którym zablokuje cudzy atak.
  CREATE TABLE IF NOT EXISTS sl_effects (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    target_player_id INTEGER REFERENCES players(id),
    source_player_id INTEGER REFERENCES players(id),
    type             TEXT NOT NULL,     -- 'freeze' | 'curse' | 'double_move' | 'shield'
    variant          INTEGER,           -- dla 'curse': 1..3 (który wariant); inaczej NULL
    status           TEXT DEFAULT 'pending',  -- 'pending' | 'consumed' | 'blocked'
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    consumed_at      DATETIME
  );

  -- Klucz-wartość na ustawienia trybu (rozmiar planszy do migracji, przełączniki Discorda…)
  CREATE TABLE IF NOT EXISTS sl_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Wydarzenie kooperacyjne: jedna aktywna „edycja" (cykl) zbiórki naraz.
  CREATE TABLE IF NOT EXISTS sl_coop (
    cycle        INTEGER PRIMARY KEY,
    threshold    INTEGER NOT NULL,
    total        INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'collecting', -- 'collecting' | 'event_active' | 'completed'
    reward_pool  INTEGER DEFAULT 0,
    started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    triggered_at DATETIME,
    completed_at DATETIME
  );

  -- Wkłady graczy do puli (per cykl) — na ich podstawie liczymy nagrody.
  CREATE TABLE IF NOT EXISTS sl_coop_contributions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle      INTEGER NOT NULL,
    player_id  INTEGER REFERENCES players(id),
    amount     INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Dziennik aktywności (ruchy + sklep + wpłaty do puli + knockback) — widoczny dla
  -- wszystkich, do przeglądania "kto co zrobił którego dnia" w prawej kolumnie UI.
  CREATE TABLE IF NOT EXISTS sl_activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id  INTEGER REFERENCES players(id),
    type       TEXT NOT NULL,   -- 'roll' | 'shop_buy' | 'shop_use' | 'coop_contribute' | 'knockback'
    detail     TEXT NOT NULL,
    day        TEXT NOT NULL,   -- YYYY-MM-DD wg Europe/Warsaw (do grupowania/filtrowania)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// sl_moves: stare wdrożenia mają UNIQUE(player_id, move_date) — blokadę na WYŁĄCZNIE
// jeden ruch dziennie. Przy więcej niż jednym ruchu dziennie druga wstawka wywaliłaby
// błąd unikalności, więc trzeba przebudować tabelę (SQLite nie zmienia constraintów
// przez ALTER). Bezpieczne: to tylko dziennik/log, nie trzyma stanu gry (to sl_state).
(function migrateSlMovesUniqueConstraint() {
  const ddl = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='sl_moves'`).get();
  if (!ddl || !ddl.sql.includes('UNIQUE(player_id, move_date)') || ddl.sql.includes('move_seq')) return;
  transaction(() => {
    db.exec(`
      CREATE TABLE sl_moves_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id  INTEGER REFERENCES players(id),
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

// Zapisuje wpis do dziennika aktywności. Wołane z ruchu, sklepu, wpłat do puli i knockbacku.
function slLogActivity(playerId, type, detail) {
  db.prepare('INSERT INTO sl_activity (player_id, type, detail, day) VALUES (?, ?, ?, ?)')
    .run(playerId, type, detail, todayWaw());
}

// Etykiety power-upów do czytelnych wpisów w dzienniku i na Discordzie.
const SL_POWERUP_LABELS = { freeze: 'Freeze', curse: 'Curse', double_move: 'Double Move', shield: 'Shield' };

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

// ── UKŁAD PLANSZY 7×7 ──
// Drabiny ciągną w górę, węże w dół, pola bonusowe dają punkty bez przesunięcia.
// Rozkład dobrany pod 49 pól: 4 drabiny / 4 węże / 5 bonusów (~27% pól to pola specjalne).
// Żaden cel skoku nie ląduje na innym polu specjalnym (brak reakcji łańcuchowych).
const SL_LADDERS = [               // [from, to] — to > from
  [3, 17], [8, 24], [21, 39], [28, 44]
];
const SL_SNAKES = [                // [from, to] — to < from
  [12, 2], [19, 7], [36, 20], [45, 29]
];
const SL_BONUSES = [               // [position, points]
  [5, 15], [11, 20], [23, 25], [34, 30], [41, 35]
];

function slSeedBoardRows() {
  const insert = db.prepare('INSERT INTO sl_board (position, kind, target, value) VALUES (?, ?, ?, ?)');
  for (const [from, to] of SL_LADDERS) insert.run(from, 'ladder', to, 0);
  for (const [from, to] of SL_SNAKES) insert.run(from, 'snake', to, 0);
  for (const [pos, val] of SL_BONUSES) insert.run(pos, 'bonus', null, val);
}

// ── MIGRACJA ROZMIARU PLANSZY ──
// Plansza schudła ze 100 do 49 pól. Pozycji graczy NIE zerujemy — skalujemy je
// proporcjonalnie (abs_pos × nowy/stary), więc każdy zostaje mniej więcej tam, gdzie był
// (ten sam procent okrążenia), a punkty, salda i ekwipunek zostają nietknięte.
// Migracja jest idempotentna: znacznik `board_size` w sl_meta pilnuje, by poszła raz.
// Bump przy KAŻDEJ zmianie SL_LADDERS/SL_SNAKES/SL_BONUSES — wymusza reseed na już
// działających wdrożeniach, żeby zmiana układu (nie tylko rozmiaru) też dotarła.
const SL_BOARD_LAYOUT_VERSION = 2;

function slMigrateBoard() {
  const rows = db.prepare('SELECT COUNT(*) AS c, MAX(position) AS m FROM sl_board').get();
  const stored = slMetaGet('board_size');

  // Świeża instalacja — po prostu zaszczep planszę.
  if (Number(rows.c) === 0) {
    transaction(() => slSeedBoardRows());
    slMetaSet('board_size', SL_BOARD_SIZE);
    slMetaSet('board_layout_version', SL_BOARD_LAYOUT_VERSION);
    console.log(`Snakes & Ladders: plansza zaseedowana ${SL_BOARD_COLS}×${SL_BOARD_ROWS} (${SL_LADDERS.length} drabin, ${SL_SNAKES.length} węży, ${SL_BONUSES.length} bonusów)`);
    return;
  }

  // Stary rozmiar: z metadanych, a gdy ich nie ma (baza sprzed tej wersji) — z układu pól.
  const oldSize = stored ? Number(stored) : (Number(rows.m) >= SL_BOARD_SIZE ? 100 : SL_BOARD_SIZE);
  if (oldSize === SL_BOARD_SIZE) {
    slMetaSet('board_size', SL_BOARD_SIZE);
  } else {
    const scaled = transaction(() => {
      let n = 0;
      for (const st of db.prepare('SELECT player_id, abs_pos FROM sl_state').all()) {
        const newAbs = Math.round(Number(st.abs_pos) * SL_BOARD_SIZE / oldSize);
        db.prepare('UPDATE sl_state SET abs_pos = ?, laps = ? WHERE player_id = ?')
          .run(newAbs, Math.floor(newAbs / SL_BOARD_SIZE), st.player_id);
        n++;
      }
      db.exec('DELETE FROM sl_board');
      slSeedBoardRows();
      return n;
    });
    slMetaSet('board_size', SL_BOARD_SIZE);
    slMetaSet('board_layout_version', SL_BOARD_LAYOUT_VERSION);
    console.log(`Snakes & Ladders: MIGRACJA planszy ${oldSize} → ${SL_BOARD_SIZE} pól, przeskalowano pozycje ${scaled} graczy (punkty i ekwipunek bez zmian)`);
    return;
  }

  // Rozmiar bez zmian — ale sam UKŁAD (które pola są czym) mógł się zmienić w kodzie.
  // sl_board nie trzyma stanu gracza (to robi sl_state), więc reseed jest tu bezpieczny:
  // nie rusza pozycji, punktów ani ekwipunku nikogo — zmienia tylko co stoi na której kratce.
  const storedLayout = Number(slMetaGet('board_layout_version') || 0);
  if (storedLayout !== SL_BOARD_LAYOUT_VERSION) {
    transaction(() => {
      db.exec('DELETE FROM sl_board');
      slSeedBoardRows();
    });
    slMetaSet('board_layout_version', SL_BOARD_LAYOUT_VERSION);
    console.log(`Snakes & Ladders: układ planszy zaktualizowany (wersja ${SL_BOARD_LAYOUT_VERSION}) — ${SL_LADDERS.length} drabin, ${SL_SNAKES.length} węży, ${SL_BONUSES.length} bonusów`);
  }
}
slMigrateBoard();

function slBoardMap() {
  const map = {};
  for (const t of db.prepare('SELECT position, kind, target, value FROM sl_board').all()) {
    map[t.position] = t;
  }
  return map;
}

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

function d6() {
  return 1 + Math.floor(Math.random() * 6);
}

// Pola na planszy = abs_pos zwinięty do 0..SL_BOARD_SIZE-1
function slTileOf(absPos) {
  return ((absPos % SL_BOARD_SIZE) + SL_BOARD_SIZE) % SL_BOARD_SIZE;
}

// URL zdjęcia profilowego gracza — z parametrem wersji (data ostatniej zmiany), żeby
// przeglądarki od razu widziały nowe zdjęcie po re-uploadzie, a nie stare z cache'u.
// null, gdy gracz jeszcze nie wgrał zdjęcia (avatar_updated_at puste).
function slAvatarUrl(playerId, avatarUpdatedAt) {
  if (!avatarUpdatedAt) return null;
  const v = Date.parse(avatarUpdatedAt.replace(' ', 'T') + 'Z') || Date.now();
  return `/avatars/${playerId}.jpg?v=${v}`;
}

// ── SHIELD ──
// Aktywna tarcza = wpis 'shield' w sl_effects ze statusem 'pending'. Zużywa się
// w momencie, w którym ktoś rzuca na gracza Freeze albo Curse: atak nie dochodzi
// do skutku (zapisujemy go jako 'blocked'), a tarcza znika.
function slActiveShield(playerId) {
  return db.prepare(
    `SELECT * FROM sl_effects WHERE target_player_id = ? AND type = 'shield' AND status = 'pending' ORDER BY id LIMIT 1`
  ).get(playerId) || null;
}

function slHasShield(playerId) {
  return !!slActiveShield(playerId);
}

// ── STUB KLĄTWY ──
// Klątwa ma 3 losowe warianty. Wariant losujemy w momencie RZUCENIA klątwy i
// zapisujemy w sl_effects.variant. Faktyczna logika efektu jest CELOWO zostawiona
// jako placeholder do uzupełnienia — patrz TODO niżej. Wywoływana, gdy cel wykonuje
// swój następny ruch (klątwa „na następną turę").
function applyCurseEffect(variant, ctx) {
  // ctx = { targetPlayerId, sourcePlayerId, state, rolls, movement }
  // `movement` można zmodyfikować (np. cofnąć, wyzerować postęp) — zwróć zmieniony obiekt.
  switch (variant) {
    case 1:
      // TODO(klątwa #1): zaimplementuj efekt wariantu 1 (np. „połowa punktów z ruchu").
      break;
    case 2:
      // TODO(klątwa #2): zaimplementuj efekt wariantu 2 (np. „cofnij o X pól").
      break;
    case 3:
      // TODO(klątwa #3): zaimplementuj efekt wariantu 3 (np. „pomiń pola bonusowe").
      break;
    default:
      break;
  }
  // Placeholder: na razie klątwa nie zmienia ruchu — tylko zostaje odnotowana.
  return ctx.movement;
}

// Rozstrzyga efekt pola dla JUŻ WYLICZONEJ pozycji lądowania (drabina/wąż/bonus).
// Współdzielona przez zwykły ruch (slStepMove) i knockback — wypchnięci gracze
// TEŻ odpalają węże/drabiny/bonusy swojego nowego pola, tak jak przy zwykłym rzucie.
function slResolveTileEffect(landedAbs, board) {
  let abs = landedAbs;
  let tilePoints = 0;
  let note = null;
  const landed = slTileOf(abs);
  const tile = board[landed];
  if (tile) {
    if (tile.kind === 'ladder' || tile.kind === 'snake') {
      // Skok na planszy przekładamy na zmianę abs_pos (drabina w górę, wąż w dół),
      // zachowując bieżące okrążenie jako bazę.
      const base = abs - landed;
      abs = base + tile.target;
      if (abs < 0) abs = 0; // nie schodzimy poniżej startu
      note = tile.kind;
    } else if (tile.kind === 'bonus') {
      tilePoints += tile.value;
      note = 'bonus';
    }
  }
  return { abs, tilePoints, note };
}

// Wykonuje pojedynczy krok ruchu o `roll` pól, uwzględniając węże/drabiny/bonusy.
// Zwraca { absAfter, tilePoints, note } dla tego kroku.
function slStepMove(absBefore, roll, board) {
  const resolved = slResolveTileEffect(absBefore + roll, board);
  return { absAfter: resolved.abs, tilePoints: resolved.tilePoints, note: resolved.note };
}

// ── KNOCKBACK ──
// Znajduje gracza (poza wykluczonymi) stojącego na danym polu — po numerze pola
// (abs_pos modulo rozmiar planszy), bo to WSPÓLNA, zapętlona plansza.
function slFindOccupant(tile, excludeIds) {
  const rows = db.prepare(`
    SELECT s.player_id, s.abs_pos, p.nickname
    FROM sl_state s JOIN players p ON p.id = s.player_id
  `).all();
  return rows.find(r => !excludeIds.has(r.player_id) && slTileOf(r.abs_pos) === tile) || null;
}

// Gracz, który ląduje na zajętym polu, wypycha okupanta o SL_KNOCKBACK_TILES pól
// wstecz (liczone od WŁASNEJ pozycji okupanta, nie od pola lądowania). Dno planszy
// (pole 0) jest twarde: cofnięcie poniżej zera przycinamy do 0, bez zawijania pętli.
// Pole, na którym wypchnięty gracz WYLĄDOWAŁ, odpala węża/drabinę/bonus normalnie
// (slResolveTileEffect) — jeśli to przerzuci go na KOLEJNE zajęte pole, kaskada leci
// dalej stamtąd. Każde wypchnięcie trafia też do dziennika aktywności ofiary.
function slApplyKnockback(rollerPlayerId, landingAbsPos, board, rollerNickname) {
  const pushedIds = new Set([rollerPlayerId]);
  const chain = [];
  let targetTile = slTileOf(landingAbsPos);
  for (let i = 0; i < 200; i++) { // bezpiecznik przeciw pętli nieskończonej
    const occ = slFindOccupant(targetTile, pushedIds);
    if (!occ) break;
    const fromAbs = Number(occ.abs_pos);
    const rawTarget = Math.max(0, fromAbs - SL_KNOCKBACK_TILES);
    const clamped = fromAbs - SL_KNOCKBACK_TILES < 0;
    const resolved = slResolveTileEffect(rawTarget, board);
    const toAbs = resolved.abs;
    const bonusPoints = resolved.tilePoints;

    db.prepare(`
      UPDATE sl_state
      SET abs_pos = ?, laps = ?, balance = balance + ?, total_points = total_points + ?
      WHERE player_id = ?
    `).run(toAbs, Math.floor(toAbs / SL_BOARD_SIZE), bonusPoints, bonusPoints, occ.player_id);

    const entry = {
      player_id: occ.player_id,
      nickname: occ.nickname,
      from_tile: slTileOf(fromAbs),
      to_tile: slTileOf(toAbs),
      clamped,
      tile_effect: resolved.note,
      bonus_points: bonusPoints
    };
    chain.push(entry);

    const bits = [`z pola ${entry.from_tile} → ${entry.to_tile}`];
    if (clamped) bits.push('(dno planszy)');
    if (resolved.note === 'ladder') bits.push('🪜 i wjechał na drabinę!');
    if (resolved.note === 'snake') bits.push('🐍 i zjechał wężem niżej!');
    if (resolved.note === 'bonus') bits.push(`⭐ +${bonusPoints} pkt bonusu`);
    slLogActivity(occ.player_id, 'knockback', `💥 Wypchnięty przez ${rollerNickname} ${bits.join(' ')}`);

    pushedIds.add(occ.player_id);
    if (fromAbs === toAbs) break; // brak realnej zmiany pozycji — koniec kaskady
    targetTile = slTileOf(toAbs);
  }
  return chain;
}



// Buduje publiczny opis planszy (do rysowania w UI).
function slBoardPayload() {
  const tiles = db.prepare('SELECT position, kind, target, value FROM sl_board ORDER BY position').all();
  return { size: SL_BOARD_SIZE, cols: SL_BOARD_COLS, rows: SL_BOARD_ROWS, tiles };
}

// Pozycje wszystkich graczy na wspólnej planszy (widoczne dla każdego).
// TYLKO gracze ze zdjęciem profilowym — bez zdjęcia nie widać ich na planszy i nie da
// się ich wskazać jako celu power-upa (has_avatar = 1 w WHERE). To lustrzane odbicie
// bramki na rzut (patrz POST /api/snakes/roll): kto nie wgrał zdjęcia, ten "nie gra".
function slPlayersPayload(meId) {
  const rows = db.prepare(`
    SELECT s.player_id, p.nickname, s.abs_pos, s.laps, s.total_points, s.balance, s.last_move_date, s.rolls_today, s.avatar_updated_at
    FROM sl_state s JOIN players p ON p.id = s.player_id
    WHERE s.has_avatar = 1
    ORDER BY s.total_points DESC, s.abs_pos DESC
  `).all();
  const today = todayWaw();
  // Jedno zapytanie na wszystkie tarcze zamiast N zapytań w pętli.
  const shielded = new Set(db.prepare(
    `SELECT DISTINCT target_player_id AS id FROM sl_effects WHERE type = 'shield' AND status = 'pending'`
  ).all().map(r => r.id));
  return rows.map(r => {
    const rollsUsedToday = r.last_move_date === today ? Number(r.rolls_today) : 0;
    return {
      player_id: r.player_id,
      nickname: r.nickname,
      avatar_url: slAvatarUrl(r.player_id, r.avatar_updated_at),
      tile: slTileOf(r.abs_pos),
      abs_pos: Number(r.abs_pos),
      laps: Number(r.laps),
      total_points: Number(r.total_points),
      moved_today: rollsUsedToday >= SL_DAILY_ROLLS,
      rolls_used_today: rollsUsedToday,
      rolls_remaining_today: Math.max(0, SL_DAILY_ROLLS - rollsUsedToday),
      has_shield: shielded.has(r.player_id),
      is_me: meId ? r.player_id === meId : false
    };
  });
}

// Oczekujące efekty na danym graczu (do pokazania „co Cię czeka w następnej turze").
function slPendingEffects(playerId) {
  return db.prepare(`
    SELECT e.type, e.variant, p.nickname AS source_nickname
    FROM sl_effects e LEFT JOIN players p ON p.id = e.source_player_id
    WHERE e.target_player_id = ? AND e.status = 'pending'
    ORDER BY e.id
  `).all(playerId).map(e => ({
    type: e.type,
    variant: e.variant == null ? null : Number(e.variant),
    source_nickname: e.source_nickname
  }));
}

function slLeaderboard(meId) {
  const rows = db.prepare(`
    SELECT s.player_id, p.nickname, s.total_points, s.laps, s.abs_pos, s.balance
    FROM sl_state s JOIN players p ON p.id = s.player_id
    ORDER BY s.total_points DESC, s.laps DESC, s.abs_pos DESC
  `).all();
  return rows.map((r, i) => ({
    rank: i + 1,
    player_id: r.player_id,
    nickname: r.nickname,
    total_points: Number(r.total_points),
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

// Wstawia nowy cykl co-op zakotwiczony w podanej chwili (epoch ms) jako started_at.
function slCoopInsertCycle(cycle, startMs) {
  db.prepare(`
    INSERT INTO sl_coop (cycle, threshold, started_at) VALUES (?, ?, datetime(?, 'unixepoch'))
  `).run(cycle, SL_COOP_THRESHOLD, Math.floor(startMs / 1000));
  return db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
}

// Najbliższa chwila (epoch ms) odpowiadająca SL_COOP_START_DOW/HOUR w Europe/Warsaw,
// licząc od teraz — używana WYŁĄCZNIE do zakotwiczenia zupełnie pierwszego cyklu.
function slCoopFirstAnchorMs() {
  const p = warsawParts();
  let y = Number(p.y), m = Number(p.mo), d = Number(p.d);
  for (let i = 0; i < 8; i++) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === SL_COOP_START_DOW) {
      const candidateMs = warsawWallTimeToMs(y, m, d, SL_COOP_START_HOUR);
      if (candidateMs > Date.now()) return candidateMs;
    }
    const next = new Date(Date.UTC(y, m - 1, d) + 86400000);
    y = next.getUTCFullYear(); m = next.getUTCMonth() + 1; d = next.getUTCDate();
  }
  return Date.now(); // nie powinno się zdarzyć — 8 dni pokrywa pełny tydzień
}

// Epoch ms startu danego cyklu. SQLite CURRENT_TIMESTAMP/datetime() są w UTC bez 'Z' —
// trzeba to jawnie dopisać przy parsowaniu.
function slCoopCycleStartMs(coop) {
  return Date.parse(coop.started_at.replace(' ', 'T') + 'Z');
}

// Zwraca bieżący cykl co-op, w razie potrzeby doszczepiając kolejne — cykle są
// zakotwiczone w stałym harmonogramie tygodniowym (patrz SL_COOP_* wyżej), więc
// dzień/godzina startu NIGDY nie dryfuje, niezależnie od tego, kiedy faktycznie
// wykona się ten insert. Pętla "dogania" ewentualne przespane okna (np. po dłuższym
// downtime serwera) — dociąga tyle cykli, ile trzeba, aż trafi na aktualnie trwający.
function slCurrentCoop() {
  let coop = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
  if (!coop) {
    coop = slCoopInsertCycle(1, slCoopFirstAnchorMs());
  }
  let guard = 0;
  while (Date.now() >= slCoopCycleStartMs(coop) + SL_COOP_WINDOW_MS && guard++ < 1000) {
    coop = slCoopInsertCycle(coop.cycle + 1, slCoopCycleStartMs(coop) + SL_COOP_WINDOW_MS);
  }
  return coop;
}

function slCoopContributors(cycle) {
  return db.prepare(`
    SELECT c.player_id, p.nickname, SUM(c.amount) AS amount
    FROM sl_coop_contributions c JOIN players p ON p.id = c.player_id
    WHERE c.cycle = ?
    GROUP BY c.player_id
    ORDER BY amount DESC
  `).all(cycle).map(r => ({
    player_id: r.player_id,
    nickname: r.nickname,
    amount: Number(r.amount)
  }));
}

// Chwila rozliczenia (kara, jeśli próg nie padł) — GAP_HOURS przed kolejnym startem.
function slCoopResolveMs(coop) {
  return slCoopCycleStartMs(coop) + SL_COOP_WINDOW_MS - SL_COOP_GAP_MS;
}

function slCoopPayload(meId) {
  const coop = slCurrentCoop();
  const contributors = slCoopContributors(coop.cycle);
  const mine = meId ? (contributors.find(c => c.player_id === meId) || { amount: 0 }).amount : 0;
  const total = Number(coop.total);
  const threshold = Number(coop.threshold);
  const nextStartMs = slCoopCycleStartMs(coop) + SL_COOP_WINDOW_MS;
  return {
    cycle: Number(coop.cycle),
    total,
    threshold,
    percent: Math.min(100, Math.round((total / Math.max(1, threshold)) * 100)),
    status: coop.status,
    goal_met: !!coop.triggered_at, // próg padł kiedykolwiek w tym cyklu (nawet jeśli dalej trwa walka z bossem)
    reward_pool: Number(coop.reward_pool) || Math.round(threshold * SL_COOP_REWARD_MULTIPLIER),
    reward_split: SL_COOP_REWARD_SPLIT,
    my_contribution: mine,
    contributors,
    window_days: SL_COOP_WINDOW_DAYS,
    gap_hours: SL_COOP_GAP_HOURS,
    resolve_at: new Date(slCoopResolveMs(coop)).toISOString(),
    next_start_at: new Date(nextStartMs).toISOString(),
    penalty_amount: SL_COOP_PENALTY
  };
}

// ── STUB EVENTU BOSSOWEGO ──
// Wołane, gdy pula przekroczy próg. Tu ma wylądować właściwa mechanika wydarzenia
// (HP bossa, tury, obrażenia od rzutów graczy, faza itd.).
function startCoopBossEvent(coop) {
  // TODO(boss #1): zainicjuj bossa dla cyklu `coop.cycle` — np. HP = f(threshold),
  // tabela sl_coop_boss, faza, czas trwania. Na razie event tylko zmienia status.
  return { started: true, cycle: Number(coop.cycle) };
}

// Wołane przy zamykaniu eventu (na razie ręcznie przez admina — patrz endpoint niżej).
// Docelowo powinno sprawdzać warunek zwycięstwa bossa.
function resolveCoopBossEvent(coop) {
  // TODO(boss #2): sprawdź warunek zwycięstwa (HP bossa <= 0 / limit czasu) i zwróć wynik.
  // Placeholder: event zawsze uznajemy za wygrany, żeby dało się przetestować wypłatę nagród.
  return { defeated: true, cycle: Number(coop.cycle) };
}

// Podział nagród: 'proportional' (domyślnie) — wg udziału w puli; 'flat' — po równo.
// Zwraca listę { player_id, nickname, amount } (bez zapisu do bazy).
function slCoopRewardSplit(contributors, rewardPool) {
  if (!contributors.length) return [];
  if (SL_COOP_REWARD_SPLIT === 'flat') {
    const each = Math.floor(rewardPool / contributors.length);
    return contributors.map(c => ({ ...c, reward: each }));
  }
  const total = contributors.reduce((a, c) => a + c.amount, 0) || 1;
  return contributors.map(c => ({ ...c, reward: Math.round(rewardPool * (c.amount / total)) }));
}

// ── ROZLICZENIE OKNA CO-OP (kara za niedobitkę) ──
// Wołane co minutę (patrz scheduler niżej). Działa TYLKO gdy bieżący cykl wciąż zbiera
// ('collecting') i minęła jego chwila rozliczenia (GAP_HOURS przed kolejnym startem).
// Jeśli próg już padł kiedykolwiek (status poszedł dalej niż 'collecting'), zegar
// rozliczenia nic tu nie robi — ten cykl idzie swoją dotychczasową ścieżką (walka
// z bossem → wypłata nagród przez admina), a wpłaty do puli są WCIĄŻ możliwe
// (patrz endpoint /coop/contribute — to jest "backup mechanizm" na zawsze otwartą
// zbiórkę). Kolejny cykl i tak otworzy się automatycznie o zaplanowanej porze
// (slCurrentCoop), niezależnie od tego, czy tu doszło do kary.
function slResolveCoopMiss(cycle) {
  return transaction(() => {
    const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
    if (!fresh || fresh.status !== 'collecting') return null; // już rozstrzygnięte/próg padł

    const players = db.prepare('SELECT player_id FROM sl_state').all();
    const upd = db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?');
    for (const p of players) upd.run(SL_COOP_PENALTY, p.player_id);

    db.prepare(`UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE cycle = ?`)
      .run(fresh.cycle);

    return {
      cycle: Number(fresh.cycle),
      total: Number(fresh.total),
      threshold: Number(fresh.threshold),
      players_affected: players.length
    };
  });
}

// ══ DISCORD — SZYNA ZDARZEŃ ══
// Zdarzenia gry lecą przez jedną szynę: każdy typ ma własny przełącznik, trzymany
// w sl_meta (klucz 'discord_events'), więc da się je włączać/wyłączać z panelu admina
// bez restartu. Webhook bierzemy z SNAKES_DISCORD_WEBHOOK_URL, a gdy go nie ma —
// z DISCORD_WEBHOOK_URL (ten sam, co Wordle). Wysyłka jest „fire & forget":
// błąd Discorda nigdy nie wywraca ruchu gracza.
const SL_DISCORD_WEBHOOK_URL = process.env.SNAKES_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
const SNAKES_URL = (process.env.APP_URL || 'https://frog03-21535.wykr.es/').replace(/\/+$/, '') + '/snakes';

// Domyślnie ON to rzeczy „warte pingu": ataki, tarcze, węże/drabiny, kamienie milowe
// co-opu i dzienne podsumowanie. Codzienny wynik każdego rzutu i Double Move są
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
  coop_window_result: true,
  leaderboard_daily:  true
};

const SL_EVENT_LABELS = {
  roll_result:        'Wynik dziennego rzutu',
  tile_landing:       'Wejście na węża / drabinę',
  powerup_freeze:     'Użycie Freeze (kto na kogo)',
  powerup_curse:      'Użycie Curse (kto na kogo)',
  shield_block:       'Shield zablokował atak',
  double_move:        'Użycie Double Move',
  knockback:          'Wypchnięcie z zajętego pola (i efekt domina)',
  coop_milestone:     'Pula co-op przekroczyła próg',
  coop_completed:     'Wydarzenie co-op ukończone (nagrody wypłacone)',
  coop_window_result: 'Koniec okna co-op — cel nieosiągnięty, kara nałożona',
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
  const coop = slCoopPayload(null);
  const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
  const lines = top.map((p, i) => `${medals[i]} **${p.nickname}** — ${p.total_points} pkt (okr. ${p.laps}, pole ${p.tile})`);
  return {
    content: '🐍 **Office Snakes & Ladders — podsumowanie dnia**',
    embeds: [{
      title: 'Ranking',
      url: SNAKES_URL,
      description: `${lines.join('\n')}\n\n🎲 Ruch dziś wykonało: **${movedToday}** ${movedToday === 1 ? 'osoba' : 'osób'}\n🤝 Pula co-op: **${coop.total}/${coop.threshold}** (${coop.percent}%)`,
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

// ── SCHEDULER OKNA CO-OP ──
// Działa ZAWSZE (niezależnie od webhooka Discorda) — kara punktowa to realny efekt
// w grze, nie tylko powiadomienie. slEmit sam pomija wysyłkę, gdy webhook nie jest
// skonfigurowany, więc bezpiecznie wołamy go bezwarunkowo. Tick co minutę + jedno
// sprawdzenie od razu przy starcie, żeby samo-naprawić się po restarcie serwera,
// który przespał moment zamknięcia okna (analogicznie do harmonogramu Wordle/Discorda).
function slEmitCoopWindowResult(outcome) {
  slEmit('coop_window_result', () => ({
    content: '❌ **Cel co-op tego okna NIE został osiągnięty.**',
    embeds: [{
      title: `Edycja #${outcome.cycle} — kara`,
      url: SNAKES_URL,
      description: `Pula zatrzymała się na **${outcome.total}/${outcome.threshold}** pkt.\n` +
        `Każdy gracz traci **${SL_COOP_PENALTY} pkt** (dotyczy ${outcome.players_affected} ${outcome.players_affected === 1 ? 'osoby' : 'osób'}). Nowe okno (${SL_COOP_WINDOW_DAYS} dni) właśnie się rozpoczyna.`,
      color: 0xE85D4A
    }]
  }));
}

function startCoopWindowScheduler() {
  const tick = () => {
    const coop = slCurrentCoop(); // dogania przespane okna, jeśli trzeba
    if (coop.status !== 'collecting') return;
    if (Date.now() < slCoopResolveMs(coop)) return;
    const outcome = slResolveCoopMiss(coop.cycle);
    if (outcome) slEmitCoopWindowResult(outcome);
  };
  tick();
  setInterval(tick, 60_000);
  console.log(`Snakes/Co-op: start ${SL_COOP_START_DOW}/${SL_COOP_START_HOUR}:00, okno ${SL_COOP_WINDOW_DAYS} dni, rozliczenie ${SL_COOP_GAP_HOURS}h przed kolejnym startem, kara: ${SL_COOP_PENALTY} pkt/gracza`);
}
startCoopWindowScheduler();

// Pełny stan gry dla gracza (wszystko, czego potrzebuje UI w jednym zapytaniu).
function slBuildState(playerId) {
  const st = slEnsureState(playerId);
  const today = todayWaw();
  const rollsUsedToday = st.last_move_date === today ? Number(st.rolls_today) : 0;
  const rollsRemainingToday = Math.max(0, SL_DAILY_ROLLS - rollsUsedToday);
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
      daily_rolls: SL_DAILY_ROLLS,
      can_roll: rollsRemainingToday > 0 && !!st.has_avatar,
      has_shield: slHasShield(playerId),
      has_avatar: !!st.has_avatar,
      avatar_url: slAvatarUrl(playerId, st.avatar_updated_at)
    },
    inventory: slInventory(playerId),
    pending_effects: slPendingEffects(playerId),
    leaderboard: slLeaderboard(playerId),
    shop: SL_POWERUP_TYPES.map(type => ({ type, cost: SL_POWERUP_COSTS[type] })),
    coop: slCoopPayload(playerId),
    server_date: today
  };
}

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
    coop: slCoopPayload(null)
  });
});

// GET /api/snakes/activity?date=YYYY-MM-DD&limit=150 — publiczny dziennik aktywności
// (ruchy, sklep, wpłaty do puli, knockback) do przeglądania w prawej kolumnie UI.
// Bez filtra dnia zwraca po prostu najnowsze wpisy ze wszystkich dni.
app.get('/api/snakes/activity', (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
  const limit = Math.min(300, Math.max(1, parseInt(req.query.limit, 10) || 150));

  const rows = date
    ? db.prepare(`
        SELECT a.id, a.player_id, p.nickname, a.type, a.detail, a.day, a.created_at
        FROM sl_activity a JOIN players p ON p.id = a.player_id
        WHERE a.day = ? ORDER BY a.id DESC LIMIT ?
      `).all(date, limit)
    : db.prepare(`
        SELECT a.id, a.player_id, p.nickname, a.type, a.detail, a.day, a.created_at
        FROM sl_activity a JOIN players p ON p.id = a.player_id
        ORDER BY a.id DESC LIMIT ?
      `).all(limit);

  const dates = db.prepare('SELECT DISTINCT day FROM sl_activity ORDER BY day DESC LIMIT 60').all().map(r => r.day);

  res.json({
    entries: rows.map(r => ({
      id: r.id,
      player_id: r.player_id,
      nickname: r.nickname,
      type: r.type,
      detail: r.detail,
      date: r.day,
      created_at: r.created_at
    })),
    dates
  });
});

// POST /api/snakes/roll — jedyny dzienny ruch gracza (rzut kostką).
app.post('/api/snakes/roll', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const nickname = req.player.nickname;
  const today = todayWaw();
  const board = slBoardMap();

  // Bramka: bez zdjęcia profilowego nie da się zagrać. Sprawdzana przed transakcją,
  // żeby nawet nie próbować rzutu — klient i tak trzyma gracza na ekranie uploadu.
  if (!slEnsureState(playerId).has_avatar) {
    return res.status(403).json({ error: 'Wgraj najpierw zdjęcie profilowe, żeby móc zagrać.', avatar_required: true });
  }

  const result = transaction(() => {
    const st = slEnsureState(playerId);
    // rolls_today liczy się dla dnia zapisanego w last_move_date — inny dzień = licznik
    // efektywnie na zero, bez potrzeby osobnego resetu o północy.
    const rollsUsedToday = st.last_move_date === today ? Number(st.rolls_today) : 0;
    if (rollsUsedToday >= SL_DAILY_ROLLS) return { locked: true };
    const moveSeq = rollsUsedToday + 1;

    // Zbierz oczekujące efekty na tym graczu (tarcza nie jest efektem na turę — pomijamy).
    const pending = db.prepare(
      `SELECT * FROM sl_effects WHERE target_player_id = ? AND status = 'pending' ORDER BY id`
    ).all(playerId);
    const freeze = pending.find(e => e.type === 'freeze');
    const curse = pending.find(e => e.type === 'curse');
    const doubleMove = pending.find(e => e.type === 'double_move');

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
      db.prepare('UPDATE sl_state SET last_move_date = ?, rolls_today = ? WHERE player_id = ?')
        .run(today, moveSeq, playerId);
      slLogActivity(playerId, 'roll', `❄️ Zamrożony — ruch ${moveSeq}/${SL_DAILY_ROLLS} dzisiaj przepadł.`);
      return { frozen: true, source: freeze.source_player_id, rolls_used_today: moveSeq };
    }

    // DOUBLE MOVE: dwa rzuty w jednej turze.
    const rolls = doubleMove ? [d6(), d6()] : [d6()];
    if (doubleMove) consume(doubleMove.id);

    // Sekwencyjnie wykonaj kroki (każdy rzut oddzielnie, by węże/drabiny/bonusy
    // z każdego lądowania zadziałały poprawnie także przy podwójnym ruchu).
    let abs = Number(st.abs_pos);
    const from_abs = abs;
    let tilePoints = 0;
    const notes = [];
    for (const roll of rolls) {
      const step = slStepMove(abs, roll, board);
      abs = step.absAfter;
      tilePoints += step.tilePoints;
      if (step.note) notes.push(step.note);
    }

    // CURSE: wariant wylosowany przy rzuceniu; efekt to STUB (placeholder do uzupełnienia).
    let movement = { from_abs, to_abs: abs, tilePoints };
    if (curse) {
      movement = applyCurseEffect(Number(curse.variant), {
        targetPlayerId: playerId,
        sourcePlayerId: curse.source_player_id,
        state: st,
        rolls,
        movement
      }) || movement;
      consume(curse.id);
      notes.push(`curse${curse.variant}`);
      abs = movement.to_abs;
      tilePoints = movement.tilePoints;
    }

    // ── KNOCKBACK: jeśli roller wylądował na zajętym polu, wypycha okupanta(ów) ──
    // Sprawdzane na OSTATECZNYM polu lądowania tej tury (po drabinach/wężach/klątwie,
    // po obu rzutach przy Double Move) — nie na każdym pośrednim kroku.
    const knockback = slApplyKnockback(playerId, abs, board, nickname);
    if (knockback.length) notes.push('knockback');

    // ── PUNKTACJA ──
    const pipPoints = rolls.reduce((a, r) => a + r, 0) * SL_POINTS_PER_PIP;
    const distance = Math.max(0, abs - from_abs);
    const progressPoints = distance * SL_POINTS_PER_TILE;
    const oldLaps = Math.floor(from_abs / SL_BOARD_SIZE);
    const newLaps = Math.floor(abs / SL_BOARD_SIZE);
    const lapPoints = Math.max(0, newLaps - oldLaps) * SL_POINTS_PER_LAP;
    const earned = pipPoints + progressPoints + lapPoints + tilePoints;

    db.prepare(`
      INSERT INTO sl_moves (player_id, move_date, move_seq, rolls, from_abs, to_abs, points, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(playerId, today, moveSeq, JSON.stringify(rolls), from_abs, abs, earned, notes.join(',') || null);

    db.prepare(`
      UPDATE sl_state
      SET abs_pos = ?, laps = ?, balance = balance + ?, total_points = total_points + ?, last_move_date = ?, rolls_today = ?
      WHERE player_id = ?
    `).run(abs, newLaps, earned, earned, today, moveSeq, playerId);

    slLogActivity(playerId, 'roll',
      `🎲 ${rolls.join('+')} → pole ${slTileOf(abs)} (+${earned} pkt)${notes.length ? ' [' + notes.join(', ') + ']' : ''} (ruch ${moveSeq}/${SL_DAILY_ROLLS})`);

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
      double_move: !!doubleMove,
      knockback,
      rolls_used_today: moveSeq
    };
  });

  if (result.locked) {
    return res.status(400).json({ error: `Wykorzystałeś już dzisiejsze ${SL_DAILY_ROLLS} ruchy — wróć jutro (doba wg czasu Warszawy).` });
  }

  // ── ZDARZENIA DISCORD ──
  if (result.frozen) {
    slEmit('roll_result', () => `❄️ **${nickname}** próbował rzucić, ale jest zamrożony — tura przepada.`);
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
    if (result.double_move) {
      slEmit('double_move', () => `⏩ **${nickname}** użył Double Move — dwa rzuty (${result.rolls.join(' + ')}) i pole **${result.to_tile}**.`);
    }
    if (result.knockback && result.knockback.length) {
      const extraFor = k => k.clamped ? ' (dno planszy)'
        : k.tile_effect === 'ladder' ? ' 🪜 i wjechał na drabinę!'
        : k.tile_effect === 'snake' ? ' 🐍 i zjechał wężem niżej!'
        : k.tile_effect === 'bonus' ? ` ⭐ +${k.bonus_points} pkt bonusu`
        : '';
      slEmit('knockback', () => result.knockback.map((k, i) => i === 0
        ? `💥 **${nickname}** wylądował na polu **${k.from_tile}** i wypchnął **${k.nickname}** → pole **${k.to_tile}**${extraFor(k)}.`
        : `↳ efekt domina: **${k.nickname}** też wypchnięty → pole **${k.to_tile}**${extraFor(k)}.`
      ).join('\n'));
    }
  }

  res.json({ move: result, state: slBuildState(playerId) });
});

// POST /api/snakes/shop/buy { type } — kup power-up za punkty.
app.post('/api/snakes/shop/buy', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const type = String(req.body.type || '');
  if (!SL_POWERUP_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Nieznany power-up' });
  }
  const cost = SL_POWERUP_COSTS[type];

  const out = transaction(() => {
    const st = slEnsureState(playerId);
    if (st.balance < cost) return { poor: true, balance: st.balance };
    db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?').run(cost, playerId);
    slAddPowerup(playerId, type, 1);
    slLogActivity(playerId, 'shop_buy', `🛒 Kupił ${SL_POWERUP_LABELS[type]} (-${cost} pkt)`);
    return { poor: false };
  });

  if (out.poor) {
    return res.status(400).json({ error: `Za mało punktów — koszt ${cost}, masz ${out.balance}.` });
  }
  res.json({ success: true, state: slBuildState(playerId) });
});

// POST /api/snakes/shop/use { type, target_player_id? } — użyj power-up z ekwipunku.
// Freeze/Curse wymagają celu (innego gracza). Double Move i Shield działają na siebie.
// Jeśli cel ma aktywny Shield, atak zostaje ZABLOKOWANY: tarcza znika, atak nie działa
// (power-up atakującego i tak się zużywa — ryzyko wpisane w atak).
app.post('/api/snakes/shop/use', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const nickname = req.player.nickname;
  const type = String(req.body.type || '');
  if (!SL_POWERUP_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Nieznany power-up' });
  }
  const needsTarget = SL_SHIELD_BLOCKS.includes(type); // freeze / curse
  let targetId = playerId;
  let targetNick = nickname;

  if (needsTarget) {
    targetId = parseInt(req.body.target_player_id, 10);
    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Wskaż gracza, na którego użyjesz power-upa.' });
    }
    if (targetId === playerId) {
      return res.status(400).json({ error: 'Freeze i Curse rzucasz na INNEGO gracza.' });
    }
    const target = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Nie ma takiego gracza.' });
    targetNick = target.nickname;
    slEnsureState(targetId); // upewnij się, że cel ma stan gry
  }

  const out = transaction(() => {
    const inv = slInventory(playerId);
    if (inv[type] <= 0) return { none: true };

    // Shield można trzymać tylko jeden naraz — drugi byłby wyrzuceniem punktów.
    if (type === 'shield' && slHasShield(playerId)) return { already: true };

    slAddPowerup(playerId, type, -1);

    // TARCZA CELU: przechwytuje Freeze/Curse zanim staną się efektem na turę.
    if (needsTarget) {
      const shield = slActiveShield(targetId);
      if (shield) {
        db.prepare(`UPDATE sl_effects SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(shield.id);
        db.prepare(`
          INSERT INTO sl_effects (target_player_id, source_player_id, type, variant, status, consumed_at)
          VALUES (?, ?, ?, ?, 'blocked', CURRENT_TIMESTAMP)
        `).run(targetId, playerId, type, null);
        return { none: false, blocked: true };
      }
    }

    // Curse: losujemy wariant (1..SL_CURSE_VARIANTS) w momencie użycia — efekt to stub.
    const variant = type === 'curse' ? (1 + Math.floor(Math.random() * SL_CURSE_VARIANTS)) : null;

    db.prepare(`
      INSERT INTO sl_effects (target_player_id, source_player_id, type, variant)
      VALUES (?, ?, ?, ?)
    `).run(targetId, playerId, type, variant);

    return { none: false, blocked: false, variant };
  });

  if (out.none) {
    return res.status(400).json({ error: 'Nie masz tego power-upa w ekwipunku.' });
  }
  if (out.already) {
    return res.status(400).json({ error: 'Masz już aktywną tarczę — poczekaj, aż coś zablokuje.' });
  }

  // ── DZIENNIK AKTYWNOŚCI (obie strony, gdy dotyczy) ──
  const label = SL_POWERUP_LABELS[type];
  if (out.blocked) {
    slLogActivity(playerId, 'shop_use', `${label} na ${targetNick} zablokowany tarczą`);
    slLogActivity(targetId, 'shop_use', `🛡️ Zablokował ${label} od ${nickname} tarczą`);
  } else if (needsTarget) {
    slLogActivity(playerId, 'shop_use', `Użył ${label} na ${targetNick}`);
    slLogActivity(targetId, 'shop_use', `${nickname} rzucił na Ciebie ${label}${out.variant ? ` (wariant ${out.variant})` : ''}`);
  } else {
    slLogActivity(playerId, 'shop_use', `Użył ${label}`);
  }

  // ── ZDARZENIA DISCORD ──
  if (out.blocked) {
    slEmit('shield_block', () =>
      `🛡️ **${targetNick}** zablokował tarczą ${type === 'freeze' ? 'Freeze' : 'Curse'} od **${nickname}**! Tarcza zużyta.`);
  } else if (type === 'freeze') {
    slEmit('powerup_freeze', () => `❄️ **${nickname}** zamroził **${targetNick}** — następna tura celu przepada.`);
  } else if (type === 'curse') {
    slEmit('powerup_curse', () => `💀 **${nickname}** rzucił klątwę (wariant ${out.variant}) na **${targetNick}**.`);
  } else if (type === 'shield') {
    slEmit('shield_block', () => `🛡️ **${nickname}** aktywował tarczę — najbliższy Freeze/Curse się od niego odbije.`);
  }

  res.json({
    success: true,
    applied_to: targetId,
    blocked: !!out.blocked,
    curse_variant: out.variant, // dla klątwy: który wariant został wylosowany (efekt TBD)
    state: slBuildState(playerId)
  });
});

// GET /api/snakes/players — lekka lista graczy do wyboru celu power-upa.
app.get('/api/snakes/players', authPlayer, (req, res) => {
  res.json({ players: slPlayersPayload(req.player.id) });
});

// POST /api/snakes/coop/contribute { amount } — dorzuć punkty do wspólnej puli.
app.post('/api/snakes/coop/contribute', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const nickname = req.player.nickname;
  const amount = parseInt(req.body.amount, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Podaj dodatnią liczbę punktów.' });
  }

  const out = transaction(() => {
    const st = slEnsureState(playerId);
    if (st.balance < amount) return { poor: true, balance: st.balance };

    // Wpłaty są ZAWSZE możliwe — nawet po osiągnięciu progu, w trakcie walki z bossem
    // czy po jej rozstrzygnięciu. To świadomy "backup mechanizm": pula nigdy nie jest
    // zablokowana dla chętnych. Wpłaty po starcie eventu po prostu dokładają się do puli
    // (na poczet kolejnej edycji) i NIE wyzwalają bossa drugi raz (patrz triggered_at).
    const coop = slCurrentCoop();

    db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?').run(amount, playerId);
    db.prepare('INSERT INTO sl_coop_contributions (cycle, player_id, amount) VALUES (?, ?, ?)')
      .run(coop.cycle, playerId, amount);
    db.prepare('UPDATE sl_coop SET total = total + ? WHERE cycle = ?').run(amount, coop.cycle);
    slLogActivity(playerId, 'coop_contribute', `🤝 Dorzucił ${amount} pkt do puli (edycja #${coop.cycle})`);

    const updated = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle);
    let triggered = false;
    // Próg przekroczony PIERWSZY RAZ w tym cyklu → rusza event bossowy (mechanika = stub).
    if (!updated.triggered_at && Number(updated.total) >= Number(updated.threshold)) {
      const rewardPool = Math.round(Number(updated.threshold) * SL_COOP_REWARD_MULTIPLIER);
      db.prepare(`
        UPDATE sl_coop SET status = 'event_active', reward_pool = ?, triggered_at = CURRENT_TIMESTAMP
        WHERE cycle = ?
      `).run(rewardPool, updated.cycle);
      startCoopBossEvent(updated);
      triggered = true;
    }
    return { poor: false, triggered, cycle: Number(updated.cycle), total: Number(updated.total), threshold: Number(updated.threshold) };
  });

  if (out.poor) {
    return res.status(400).json({ error: `Za mało punktów — masz ${out.balance}.` });
  }

  if (out.triggered) {
    slEmit('coop_milestone', () => ({
      content: '🤝 **Pula co-op osiągnęła próg!**',
      embeds: [{
        title: `Wydarzenie #${out.cycle} rusza!`,
        url: SNAKES_URL,
        description: `Wspólnie uzbieraliście **${out.total}/${out.threshold}** pkt. Ostatnią cegiełkę dorzucił **${nickname}**.\nBoss się budzi… 👹`,
        color: 0xF5C842
      }]
    }));
  }

  res.json({ success: true, triggered: !!out.triggered, state: slBuildState(playerId) });
});

// ── ENDPOINTY ADMINA (Snakes) ──

// GET /api/snakes/admin/settings?password= — konfiguracja zdarzeń + stan co-opu
app.get('/api/snakes/admin/settings', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({
    events: slEventsConfig(),
    labels: SL_EVENT_LABELS,
    defaults: SL_EVENT_DEFAULTS,
    webhook_configured: !!SL_DISCORD_WEBHOOK_URL,
    summary_hour: SL_SUMMARY_HOUR,
    board: { size: SL_BOARD_SIZE, cols: SL_BOARD_COLS, rows: SL_BOARD_ROWS },
    powerup_costs: SL_POWERUP_COSTS,
    coop: { ...slCoopPayload(null), reward_multiplier: SL_COOP_REWARD_MULTIPLIER }
  });
});

// GET /api/snakes/admin/players — lista graczy z ich stanem w Snakes & Ladders
// (tylko ci, którzy mieli już z grą kontakt — sl_state powstaje leniwie przy pierwszym
// zapytaniu o stan). Do wyboru gracza w akcjach admina niżej.
app.get('/api/snakes/admin/players', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const today = todayWaw();
  const rows = db.prepare(`
    SELECT s.player_id, p.nickname, s.abs_pos, s.laps, s.balance, s.total_points, s.last_move_date, s.rolls_today
    FROM sl_state s JOIN players p ON p.id = s.player_id
    ORDER BY p.nickname COLLATE NOCASE ASC
  `).all();
  res.json({
    players: rows.map(r => {
      const rollsUsedToday = r.last_move_date === today ? Number(r.rolls_today) : 0;
      return {
        player_id: r.player_id,
        nickname: r.nickname,
        tile: slTileOf(r.abs_pos),
        laps: Number(r.laps),
        balance: Number(r.balance),
        total_points: Number(r.total_points),
        last_move_date: r.last_move_date,
        rolls_used_today: rollsUsedToday,
        daily_rolls: SL_DAILY_ROLLS,
        moved_today: rollsUsedToday >= SL_DAILY_ROLLS
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
    db.prepare('DELETE FROM sl_coop_contributions WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_activity WHERE player_id = ?').run(playerId);
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

// POST /api/snakes/admin/coop/complete { password } — zamknij wydarzenie i wypłać nagrody.
// Docelowo domknie je sama mechanika bossa; na razie robi to admin (patrz stuby wyżej).
app.post('/api/snakes/admin/coop/complete', (req, res) => {
  if (!checkAdmin(req, res)) return;

  const out = transaction(() => {
    const coop = slCurrentCoop();
    if (coop.status !== 'event_active') return { notActive: true, status: coop.status };

    const outcome = resolveCoopBossEvent(coop);
    if (!outcome.defeated) return { notDefeated: true };

    const contributors = slCoopContributors(coop.cycle);
    const rewardPool = Number(coop.reward_pool) || Math.round(Number(coop.threshold) * SL_COOP_REWARD_MULTIPLIER);
    const payouts = slCoopRewardSplit(contributors, rewardPool);

    for (const p of payouts) {
      db.prepare(
        'UPDATE sl_state SET balance = balance + ?, total_points = total_points + ? WHERE player_id = ?'
      ).run(p.reward, p.reward, p.player_id);
    }
    db.prepare(`UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE cycle = ?`)
      .run(coop.cycle);

    return { notActive: false, cycle: Number(coop.cycle), reward_pool: rewardPool, payouts };
  });

  if (out.notActive) {
    return res.status(400).json({ error: `Żadne wydarzenie nie trwa (status: ${out.status}).` });
  }
  if (out.notDefeated) {
    return res.status(400).json({ error: 'Boss jeszcze nie pokonany.' });
  }

  slEmit('coop_completed', () => ({
    content: '🏆 **Wydarzenie co-op ukończone!**',
    embeds: [{
      title: `Boss #${out.cycle} pokonany`,
      url: SNAKES_URL,
      description: `Pula nagród: **${out.reward_pool}** pkt (podział: ${SL_COOP_REWARD_SPLIT === 'flat' ? 'po równo' : 'proporcjonalnie do wkładu'}).\n\n` +
        out.payouts.map(p => `• **${p.nickname}** — wkład ${p.amount} → nagroda **+${p.reward}** pkt`).join('\n'),
      color: 0xC8F135
    }]
  }));

  res.json({ success: true, ...out });
});

// Strona gry
app.get('/snakes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'snakes.html'));
});

// Panel admina trybu Snakes (przełączniki zdarzeń Discorda, co-op)
app.get('/snakes/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'snakes-admin.html'));
});

app.listen(PORT, () => {
  console.log(`Office Wordle — Serwer na http://localhost:${PORT}`);
  // Znacznik wersji w logach — po deployu widać w `pm2 logs`, czy wstał nowy kod.
  console.log(`Bonus za szybkość: pierwsze ${SPEED_BONUS_PLACES} osób dnia (+${SPEED_BONUS_PLACES}…+1 pkt)`);
  startDiscordScheduler();
});
