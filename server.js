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

app.listen(PORT, () => {
  console.log(`Office Wordle — Serwer na http://localhost:${PORT}`);
  // Znacznik wersji w logach — po deployu widać w `pm2 logs`, czy wstał nowy kod.
  console.log(`Bonus za szybkość: pierwsze ${SPEED_BONUS_PLACES} osób dnia (+${SPEED_BONUS_PLACES}…+1 pkt)`);
  startDiscordScheduler();
});
