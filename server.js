require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 31535;
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
// Snakes & Ladders trzyma swoje dane (sl_*) we własnym pliku, dołączonym pod schemat
// „snakes" — fizycznie osobno od Wordle, ale w jednej transakcji/połączeniu, więc
// JOIN-y z tabelą players nadal działają bez zmian w resztcie zapytań.
db.exec(`ATTACH DATABASE '${path.join(dbDir, 'snakes.db').replace(/'/g, "''")}' AS snakes`);

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

// (Snakes & Ladders) Dodaje `days` DNI ROBOCZYCH (pon–pt, czasu Warszawy) do danej
// chwili — weekendy są całkowicie pomijane, więc licznik "nie płynie" w sobotę/niedzielę.
// Używane do terminu pokonania bossa w wydarzeniu co-op (patrz slFinishBossEvent).
function addBusinessDaysMs(fromMs, days) {
  let ms = fromMs;
  let remaining = days;
  while (remaining > 0) {
    ms += 24 * 60 * 60 * 1000;
    const p = warsawParts(new Date(ms));
    if (!isWeekendStr(`${p.y}-${p.mo}-${p.d}`)) remaining--;
  }
  return ms;
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

// Twardy, jednorazowy koniec CAŁEJ gry (nie dobowy reset) — po tej chwili wpisywanie jest
// zablokowane NA STAŁE, niezależnie od dnia tygodnia/godziny, a UI pokazuje ranking końcowy
// zamiast planszy. Domyślnie 2026-08-31 16:00 czasu Warszawy (offset +02:00 — CEST latem);
// jeśli trzeba to kiedyś przesunąć/wyłączyć, nadpisz WORDLE_GAME_END_AT w .env (puste = brak końca).
const GAME_END_AT = process.env.WORDLE_GAME_END_AT || '2026-08-31T16:00:00+02:00';
function gameHasEnded() {
  return !!GAME_END_AT && Date.now() >= Date.parse(GAME_END_AT);
}

// Które hasło jest teraz aktualne i w jakiej fazie:
//  - 'live'    : hasło dnia gra się (08:00 → północ) — można wpisywać
//  - 'expired' : północ → 08:00, wisi jeszcze wczorajsze hasło, ale wpisywanie zamknięte
//  - 'weekend' : sobota/niedziela — przerwa
//  - 'ended'   : gra zakończona na stałe (patrz GAME_END_AT) — wpisywanie zablokowane na zawsze
// Zwraca { phase, index, date } (index/date = null poza dniami z hasłem).
function activePuzzle() {
  if (gameHasEnded()) {
    return { phase: 'ended', index: null, date: null };
  }
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
// Po zakończeniu gry (GAME_END_AT) sezon zamraża się na miesiącu, w którym gra się skończyła —
// nie ma "przełączenia" na kolejny miesiąc, ranking końcowy zostaje na stałe.
function currentSeasonId() {
  const p = gameHasEnded() ? warsawParts(new Date(Date.parse(GAME_END_AT))) : warsawParts();
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
  const id = currentSeasonId();
  const [y, m] = id.split('-').map(Number);
  const first = `${id}-01`;
  let ny = y, nm = m + 1;
  if (nm > 12) { nm = 1; ny++; }
  const nextFirst = `${ny}-${String(nm).padStart(2, '0')}-01`;
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
    is_ended: ap.phase === 'ended',
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
    is_ended: info.is_ended,
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
    const msg = ap.phase === 'ended'
      ? 'Gra zakończona — dziękujemy za udział! Zobacz ranking końcowy.'
      : ap.phase === 'weekend'
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
    return res.json({
      day_number: day, has_word: false,
      is_weekend: isWeekendStr(todayWaw()),
      is_ended: activePuzzle().phase === 'ended',
      entries: [], total: 0
    });
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
// Typy ataków, które Shield potrafi zablokować (zużywa się przy pierwszym z nich).
const SL_SHIELD_BLOCKS = ['freeze', 'curse'];

// ── KLĄTWA — 7 losowych wariantów ──
// Wariant losujemy w momencie RZUCENIA klątwy (sl_effects.variant) i odpalamy go na
// NASTĘPNYM ruchu ofiary. Warianty 1/2/5 zmieniają SPOSÓB poruszania się, więc muszą
// zadziałać PRZED odpaleniem węży/drabin/bonusów (patrz slCurseAdjustRoll + invertBoard
// w slResolveTileEffect) — inaczej gracz lądowałby na złym polu. Warianty 3/4/6/7
// działają PO wyliczeniu ruchu (patrz obsługa w POST /api/snakes/roll).
const SL_CURSE_VARIANTS = 8;
const SL_CURSE_COIN_STEAL = 50; // ile monet zabiera Kieszonkowiec (wariant 3)
// Drożyzna (wariant 8) jako JEDYNA klątwa nie odpala się na ruchu, tylko przy najbliższym
// zakupie w sklepie — podbija jego cenę o ten mnożnik i dopiero wtedy się zużywa.
const SL_CURSE_PRICE_VARIANT = 8;
const SL_CURSE_PRICE_MARKUP = 1.5;
const SL_CURSE_LABELS = {
  1: '↩️ Odwrotny Ruch',
  2: '➗ Rozdwojona Kostka',
  3: '💰 Kieszonkowiec',
  4: '📉 Chciwość',
  5: '🔀 Odwrócone Zasady',
  6: '🌀 Chaos',
  7: '🚫 Bez Bonusu',
  8: '🧾 Drożyzna'
};
const SL_CURSE_DESCRIPTIONS = {
  1: 'kość cofa zamiast pchać do przodu (np. rzut 4 = 4 pola W TYŁ)',
  2: 'rzut liczy się w połowie, w dół (rzut 5 = ruch o 2 pola)',
  3: `traci ${SL_CURSE_COIN_STEAL} monet na rzecz tego, kto rzucił klątwę`,
  4: 'połowa punktów zdobytych tym ruchem przepada',
  5: 'na ten ruch drabiny i węże działa się od drugiego końca — ze szczytu drabiny zjeżdżasz na dół, z ogona węża wjeżdżasz do góry',
  6: 'po wylądowaniu losowy doskok o 1–3 pola w dowolną stronę',
  7: 'pole bonusowe na ten ruch nie działa',
  8: `najbliższy zakup w sklepie kosztuje o ${Math.round((SL_CURSE_PRICE_MARKUP - 1) * 100)}% więcej`
};

// Warianty 1/2 zmieniają wartość kości PRZED ruchem — reszta rzutów nie rusza.
function slCurseAdjustRoll(variant, roll) {
  if (variant === 1) return -roll;               // Odwrotny Ruch
  if (variant === 2) return Math.floor(roll / 2); // Rozdwojona Kostka (w dół)
  return roll;
}

// ── WYDARZENIE KOOPERACYJNE (co-op) ──
const SL_COOP_THRESHOLD = parseInt(process.env.SNAKES_COOP_THRESHOLD, 10) || 300;
// Pula nagród = próg × mnożnik. >1 oznacza, że wspólny wysiłek zwraca się z nawiązką.
const SL_COOP_REWARD_MULTIPLIER = Number(process.env.SNAKES_COOP_REWARD_MULTIPLIER || 1.5);
// 'proportional' = proporcjonalnie do wkładu (domyślnie — kto dołożył więcej, dostaje więcej),
// 'flat' = po równo między wszystkich kontrybutorów.
const SL_COOP_REWARD_SPLIT = (process.env.SNAKES_COOP_REWARD_SPLIT || 'proportional').toLowerCase();

// ── KNOCKBACK (wypychanie z zajętego pola) ──
// Ile monet traci wypchnięty gracz na rzecz tego, kto go zbił.
const SL_KNOCKBACK_COIN_STEAL = 20;
// O ile pól cofa się wypchnięty gracz — losowo z tego zakresu, osobne losowanie dla
// KAŻDEJ ofiary (także w kaskadzie), z twardym progiem na polu 0 bieżącego okrążenia
// (patrz slApplyKnockback): okrążenia wypchnięcie nie zabiera.
const SL_KNOCKBACK_TILES_BACK_MIN = 3;
const SL_KNOCKBACK_TILES_BACK_MAX = 6;

// Ile ruchów (rzutów) dziennie ma każdy gracz na starcie dnia. Freeze blokuje JEDEN
// z nich (nie cały dzień), a Double Move DOKŁADA jeden ruch ponad ten limit — od ręki,
// w momencie użycia (patrz POST /api/snakes/shop/use i slDailyRollsFor).
const SL_DAILY_ROLLS = 3;
// Ile slotów PONAD dzienny limit można w sumie dołożyć Double Move'ami w ciągu jednego
// dnia. Bez tego sufitu Double Move był dziurą w ekonomii: każdy rzut daje punkty, punkty
// są walutą sklepu, więc gracz z zapasem monet kupował kolejne Double Move'y i rzucał
// w kółko (zdarzyło się 31 ruchów jednego dnia). Twardy limit dnia to
// SL_DAILY_ROLLS + SL_MAX_EXTRA_ROLLS = 5 rzutów.
const SL_MAX_EXTRA_ROLLS = 2;
// Między ruchami NIE MA odstępu — gracz sam decyduje, jak rozłożyć swoje trzy rzuty
// w ciągu dnia (choćby wszystkie pod rząd). Jedyne ograniczenie to okno godzin biurowych.

// ── GODZINY BIUROWE ──
// To gra biurowa: rzucać można wyłącznie w oknie SL_PLAY_START_HOUR–SL_PLAY_END_HOUR
// (czasu Warszawy, dni robocze). Po 16:00 niewykorzystane ruchy przepadają.
const SL_PLAY_START_HOUR = Number(process.env.SNAKES_PLAY_START_HOUR || 8);
const SL_PLAY_END_HOUR = Number(process.env.SNAKES_PLAY_END_HOUR || 16);

// Czy w danej chwili okno gry jest otwarte (dzień roboczy + godzina w zakresie).
function slOfficeOpenAt(ms = Date.now()) {
  const p = warsawParts(new Date(ms));
  if (isWeekendStr(`${p.y}-${p.mo}-${p.d}`)) return false;
  const h = Number(p.h);
  return h >= SL_PLAY_START_HOUR && h < SL_PLAY_END_HOUR;
}

// Najbliższa chwila (epoch ms), w której okno gry jest otwarte: samo `fromMs`, jeśli
// właśnie trwa, inaczej godzina otwarcia najbliższego dnia roboczego. Dni przeglądamy
// od kotwicy w południe, żeby zmiana czasu (CET/CEST) nie przesunęła nam doby.
function slNextOpenMs(fromMs = Date.now()) {
  if (slOfficeOpenAt(fromMs)) return fromMs;
  const p0 = warsawParts(new Date(fromMs));
  let anchor = warsawWallTimeToMs(Number(p0.y), Number(p0.mo), Number(p0.d), 12);
  for (let i = 0; i < 14; i++) {
    const p = warsawParts(new Date(anchor));
    const openMs = warsawWallTimeToMs(Number(p.y), Number(p.mo), Number(p.d), SL_PLAY_START_HOUR);
    if (!isWeekendStr(`${p.y}-${p.mo}-${p.d}`) && openMs > fromMs) return openMs;
    anchor += 24 * 60 * 60 * 1000;
  }
  return fromMs;
}

// Godzina zamknięcia okna dla dnia, w którym wypada `ms` (epoch ms).
function slOfficeCloseMs(ms = Date.now()) {
  const p = warsawParts(new Date(ms));
  return warsawWallTimeToMs(Number(p.y), Number(p.mo), Number(p.d), SL_PLAY_END_HOUR);
}

// ── ESKALACJA TRUDNOŚCI CO-OP ──
// JEDNA FAZA: boss walczy ZAWSZE — nie ma już zbiórki/progu poprzedzającej walkę. Gdy
// jeden cykl się rozstrzyga (wygrana albo czas minął), KOLEJNY boss budzi się OD RAZU,
// z góry naliczonym HP i terminem (patrz slCoopInsertCycle/startCoopBossEvent). Termin
// to DOMYŚLNIE tyle DNI ROBOCZYCH od startu (weekendy nie liczą się do odliczania — patrz
// addBusinessDaysMs), ale admin może w każdej chwili nadpisać go na konkretną godzinę
// w panelu (patrz POST /api/snakes/admin/coop/config, pole deadline_at) — działa to
// zawsze, nie tylko przy zakładaniu cyklu. "Próg" (threshold) zostaje jako WEWNĘTRZNY
// suwak trudności: skaluje HP bossa i pulę nagród (patrz SL_BOSS_HP_MULTIPLIER,
// SL_COOP_REWARD_MULTIPLIER), ale nie ma już żadnej zbiórki punktów do niego —
// zmienia się wyłącznie między cyklami:
//   • wygrana: próg × GROWTH (trudniej), czas × SHRINK, ale nie mniej niż MIN_TIME_DAYS
//   • przegrana (czas minął, boss przeżył): próg i czas łagodnieją o RELIEF_FACTOR,
//     ale nigdy poniżej/powyżej wartości bazowej (BASE) — to tylko "odbicie", nie reset.
const SL_COOP_BASE_TIME_DAYS = Number(process.env.SNAKES_COOP_BASE_TIME_DAYS || 5);
const SL_COOP_MIN_TIME_DAYS = Number(process.env.SNAKES_COOP_MIN_TIME_DAYS || 2);
const SL_COOP_THRESHOLD_GROWTH = Number(process.env.SNAKES_COOP_THRESHOLD_GROWTH || 1.2);
const SL_COOP_TIME_SHRINK = Number(process.env.SNAKES_COOP_TIME_SHRINK || 0.8);
const SL_COOP_RELIEF_FACTOR = Number(process.env.SNAKES_COOP_RELIEF_FACTOR || 0.9); // próg ×0.9, czas ÷0.9

// ── WALKA Z BOSSEM ──
// Losowy biurowy boss z paskiem HP walczy ZAWSZE — każdy nowy cykl budzi go od razu
// (patrz slCoopInsertCycle). KAŻDY rzut kostką (nie tylko atakującego) w trakcie eventu
// zadaje mu darmowe obrażenia — więc zwykłe granie już "walczy". Dodatkowo każdy może
// dobić bossa ręcznym atakiem za monety — realny sposób na wydawanie salda poza sklepem,
// nie tylko nagroda na końcu. Każde trafienie (rzutem lub ręcznym atakiem) jest liczone
// per gracz (patrz sl_coop_contributions — teraz trzyma OBRAŻENIA, nie wpłaty), do
// podziału nagród. Pokonanie bossa PRZED terminem wypłaca atakującym pulę nagród + premię
// za "zabicie" ponad nią; jeśli czas minie, a boss przeżyje, NIE MA żadnej nagrody, a boss
// jeszcze "atakuje" i zabiera monety (patrz slFinishBossEvent) — realna stawka za
// niedobicie na czas, nie tylko brak bonusu.
const SL_BOSS_NAMES = [
  'Ksero-Golem', 'Duch Deadline\'u', 'Hydra Niekończących Się Maili',
  'Excel Behemot', 'Automat do Kawy Zła', 'Syndrom Poniedziałku', 'Rozdzielacz Wi-Fi Zagłady'
];
const SL_BOSS_HP_MULTIPLIER = Number(process.env.SNAKES_BOSS_HP_MULTIPLIER || 2); // HP = próg × to
const SL_BOSS_DICE_DAMAGE_MULT = Number(process.env.SNAKES_BOSS_DICE_DAMAGE_MULT || 3); // dmg = suma oczek × to
const SL_BOSS_ATTACK_COST = parseInt(process.env.SNAKES_BOSS_ATTACK_COST, 10) || 20;    // koszt ręcznego ataku (monety)
const SL_BOSS_ATTACK_DAMAGE = parseInt(process.env.SNAKES_BOSS_ATTACK_DAMAGE, 10) || 45; // obrażenia ręcznego ataku
const SL_BOSS_DEFEAT_BONUS = parseInt(process.env.SNAKES_BOSS_DEFEAT_BONUS, 10) || 60;   // bonus pkt/monet na kontrybutora za zabicie
// Jeśli boss NIE zostanie pokonany na czas, "atakuje" i zabiera tyle monet KAŻDEMU
// graczowi (nie tylko kontrybutorom) — realna stawka za zignorowanie walki, nie tylko
// łagodniejszy próg na następną rundę. Nigdy nie schodzi poniżej salda gracza (0 min).
const SL_BOSS_TIMEOUT_PENALTY = parseInt(process.env.SNAKES_BOSS_TIMEOUT_PENALTY, 10) || 50;

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
    position INTEGER PRIMARY KEY,       -- 0..SL_BOARD_SIZE-1
    kind     TEXT NOT NULL,             -- 'ladder' | 'snake' | 'bonus'
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
    rolls      TEXT DEFAULT '[]',       -- JSON: rzucone wartości (1 lub 2 przy Double Move)
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

  -- Wydarzenie kooperacyjne: jedna aktywna „edycja" (cykl) walki z bossem naraz. Kolumna
  -- "total" zostaje z dawnego mechanizmu zbiórki i dziś jest nieużywana. 'collecting' to STARY
  -- status (sprzed przejścia na jedną, ciągłą fazę walki — patrz "ESKALACJA TRUDNOŚCI
  -- CO-OP" wyżej); nowe wiersze zawsze startują jako 'event_active' (patrz
  -- slCoopInsertCycle), a legacy-wiersze ze starym statusem aktywuje jednorazowa
  -- migracja przy starcie (patrz activateLegacyCollectingCycles).
  CREATE TABLE IF NOT EXISTS snakes.sl_coop (
    cycle            INTEGER PRIMARY KEY,
    threshold        INTEGER NOT NULL,
    total            INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'event_active', -- 'collecting' (legacy) | 'event_active' | 'completed'
    reward_pool      INTEGER DEFAULT 0,
    started_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    triggered_at     DATETIME,
    completed_at     DATETIME,
    boss_name        TEXT,
    boss_max_hp      INTEGER DEFAULT 0,
    boss_hp          INTEGER DEFAULT 0,
    boss_defeated_at DATETIME,
    time_limit_days  INTEGER DEFAULT 5,   -- dni robocze na pokonanie TEGO bossa
    boss_deadline_at DATETIME             -- policzone przy wybudzeniu (patrz addBusinessDaysMs)
  );

  -- Wkłady graczy do puli (per cykl) — na ich podstawie liczymy nagrody.
  CREATE TABLE IF NOT EXISTS snakes.sl_coop_contributions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle      INTEGER NOT NULL,
    player_id  INTEGER,
    amount     INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Dziennik aktywności (ruchy + sklep + wpłaty do puli + knockback) — widoczny dla
  -- wszystkich, do przeglądania "kto co zrobił którego dnia" w prawej kolumnie UI.
  CREATE TABLE IF NOT EXISTS snakes.sl_activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id  INTEGER,
    type       TEXT NOT NULL,   -- 'roll' | 'shop_buy' | 'shop_use' | 'knockback' | 'boss_hit'
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
// Dokładny moment ostatniego ruchu — sam w sobie niczego nie blokuje (odstęp między
// ruchami zniknął), zostaje jako ślad w danych i pod ewentualne statystyki.
ensureColumn('sl_state', 'last_move_at', 'DATETIME');
// Dodatkowe ruchy PONAD dzienny limit, przyznane przez Double Move (patrz
// slDailyRollsFor). Ważne wyłącznie w dniu z extra_rolls_date — nazajutrz licznik
// jest ignorowany, więc niewykorzystane sloty przepadają razem z resztą limitu.
ensureColumn('sl_state', 'extra_rolls', 'INTEGER DEFAULT 0');
ensureColumn('sl_state', 'extra_rolls_date', 'TEXT');

// sl_coop: dołóż kolumny bossa dla wdrożeń sprzed walki z bossem.
ensureColumn('sl_coop', 'boss_name', 'TEXT');
ensureColumn('sl_coop', 'boss_max_hp', 'INTEGER DEFAULT 0');
ensureColumn('sl_coop', 'boss_hp', 'INTEGER DEFAULT 0');
ensureColumn('sl_coop', 'boss_defeated_at', 'DATETIME');
ensureColumn('sl_coop', 'time_limit_days', 'INTEGER DEFAULT 5');
ensureColumn('sl_coop', 'boss_deadline_at', 'DATETIME');
// Moment wybudzenia bossa — sam w sobie niczego nie rozstrzyga (o przegranej decyduje
// boss_deadline_at), ale bez niego nie da się narysować paska „ile czasu zostało",
// bo termin liczy się w DNIACH ROBOCZYCH i długość walki w zegarze bywa różna.
ensureColumn('sl_coop', 'boss_started_at', 'DATETIME');
// Kolumna z dawnego mechanizmu zbiórki (termin, po którym boss budził się sam) —
// nieużywana od przejścia na jedną, ciągłą fazę walki. Zostaje w schemacie
// nietknięta (unikamy DROP COLUMN na SQLite), po prostu nic już do niej nie pisze.
ensureColumn('sl_coop', 'collect_deadline_at', 'DATETIME');

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
function slLogActivity(playerId, type, detail) {
  db.prepare('INSERT INTO sl_activity (player_id, type, detail, day) VALUES (?, ?, ?, ?)')
    .run(playerId, type, detail, todayWaw());
}

// Odmiana „obrażenie/obrażenia/obrażeń" — dziennik czyta się jak zdanie, więc liczba
// mnoga musi się zgadzać (1 obrażenie, 24 obrażenia, 45 obrażeń, ale 12 obrażeń).
function slDamageWord(n) {
  const abs = Math.abs(n);
  if (abs === 1) return 'obrażenie';
  const last = abs % 10;
  const lastTwo = abs % 100;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'obrażenia' : 'obrażeń';
}

// Jednolita treść wpisu o trafieniu bossa: „atak na bossa — 24 obrażenia (kość)".
// `source` mówi, skąd poszło uderzenie (kość / monety / admin / wpłata).
function slBossHitEntry(damage, source) {
  return `atak na bossa — ${damage} ${slDamageWord(damage)} (${source})`;
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

// Losuje siłę pojedynczego wypchnięcia (w polach) z zakresu SL_KNOCKBACK_TILES_BACK_MIN..MAX.
function slKnockbackTilesBack() {
  const span = SL_KNOCKBACK_TILES_BACK_MAX - SL_KNOCKBACK_TILES_BACK_MIN + 1;
  return SL_KNOCKBACK_TILES_BACK_MIN + Math.floor(Math.random() * span);
}

// Ile ruchów ma DZIŚ dany gracz: bazowy limit plus dodatkowe sloty kupione Double
// Move'em. Dodatki liczą się tylko w dniu, w którym power-up został użyty — inny dzień
// (albo pusta data) znaczy zero, więc kolumny nie trzeba zerować o północy. `st` to
// wiersz sl_state (wystarczą kolumny extra_rolls i extra_rolls_date).
function slDailyRollsFor(st, today) {
  const extra = st && st.extra_rolls_date === today ? Number(st.extra_rolls || 0) : 0;
  return SL_DAILY_ROLLS + Math.max(0, extra);
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

// Rozstrzyga efekt pola dla JUŻ WYLICZONEJ pozycji lądowania (drabina/wąż/bonus).
// Współdzielona przez zwykły ruch (slStepMove), knockback i klątwę „Chaos" — każdy,
// kto ląduje na nowym polu (nawet nie przez normalny rzut), odpala jego efekt tak samo.
// `invertBoard` (klątwa „Odwrócone Zasady") sprawia, że drabiny działają jak węże i
// odwrotnie na TEN JEDEN ruch: cel odbija się względem pola lądowania (2×landed - target),
// więc drabina w górę o X pól staje się zjazdem w dół o X pól, i vice versa.
// Przy ODWRÓCONYCH ZASADACH (klątwa 5) szukamy połączenia, które normalnie KOŃCZY się na
// danym polu — bo na ten ruch przechodzi się je w drugą stronę, z celu do źródła.
// Gdyby po edycji planszy w adminie dwa połączenia celowały w to samo pole, wygrywa to
// o najniższym numerze pola, żeby wynik był powtarzalny, a nie zależny od kolejności klucza.
function slReverseLink(board, tile) {
  let found = null;
  for (const key of Object.keys(board)) {
    const t = board[key];
    if (t.kind !== 'ladder' && t.kind !== 'snake') continue;
    if (Number(t.target) !== tile) continue;
    if (!found || Number(t.position) < Number(found.position)) found = t;
  }
  return found;
}

function slResolveTileEffect(landedAbs, board, invertBoard = false) {
  let abs = Math.max(0, landedAbs); // nie schodzimy poniżej startu (np. klątwa Odwrotny Ruch)
  let tilePoints = 0;
  let note = null;
  const landed = slTileOf(abs);
  const base = abs - landed;   // pole 0 bieżącego okrążenia — skok liczymy względem niego
  const tile = board[landed];

  // ODWRÓCONE ZASADY: nie liczymy żadnego lustra, tylko przechodzimy TO SAMO połączenie od
  // drugiego końca. Staniesz na ogonie węża (na jego celu) — wjeżdżasz do głowy; staniesz
  // na szczycie drabiny — zjeżdżasz na dół. Oba końce są prawdziwymi polami planszy, więc
  // z definicji nie da się wyjechać poza nią ani zmienić okrążenia — żadnego przycinania.
  // Wejście od „normalnej" strony (dół drabiny, głowa węża) na ten ruch nic nie robi:
  // połączenie po odwróceniu po prostu się tam nie zaczyna.
  const reverse = invertBoard ? slReverseLink(board, landed) : null;

  if (reverse) {
    abs = base + Number(reverse.position);
    note = reverse.kind === 'ladder' ? 'snake' : 'ladder'; // drabina od góry to zjazd, i odwrotnie
  } else if (tile && !invertBoard && (tile.kind === 'ladder' || tile.kind === 'snake')) {
    // Skok na planszy przekładamy na zmianę abs_pos (drabina w górę, wąż w dół),
    // zachowując bieżące okrążenie jako bazę.
    abs = base + tile.target;
    if (abs < 0) abs = 0; // nie schodzimy poniżej startu
    note = tile.kind;
  } else if (tile && tile.kind === 'bonus') {
    // Bonusów klątwa nie dotyczy — działają tak samo w obie strony.
    tilePoints += tile.value;
    note = 'bonus';
  }
  return { abs, tilePoints, note };
}

// Wykonuje pojedynczy krok ruchu o `roll` pól, uwzględniając węże/drabiny/bonusy.
// Zwraca { absAfter, tilePoints, note } dla tego kroku.
function slStepMove(absBefore, roll, board, invertBoard = false) {
  const resolved = slResolveTileEffect(absBefore + roll, board, invertBoard);
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

// Gracz, który ląduje na zajętym polu, wypycha okupanta o losowe
// SL_KNOCKBACK_TILES_BACK_MIN..MAX pól do tyłu (losowane osobno dla każdej ofiary)
// — ale najdalej na pole 0 BIEŻĄCEGO okrążenia: cofnięcie nigdy nie przenosi
// ofiary na poprzednią pętlę ani nie odbiera jej okrążenia. Do tego zabiera mu
// SL_KNOCKBACK_COIN_STEAL
// monet (maks. tyle, ile ofiara ma na koncie) i oddaje je temu, kto akurat spowodował
// TO konkretne wypchnięcie — tak samo jak każdy inny zarobek w grze (rzut kostką, nagroda
// za bossa, pole bonusowe), skradzione monety liczą się RÓWNIEŻ jako punkty do rankingu,
// nie tylko saldo do wydania w sklepie. Przy kaskadzie zbijający to nie zawsze roller:
// gdy wypchnięty gracz sam wyląduje na kimś, to ON staje się "zbijającym" dla kolejnej
// ofiary w łańcuchu.
// Pole, na które trafia ofiara, odpala węża/drabinę/bonus normalnie (slResolveTileEffect)
// — jeśli to przerzuci ją na KOLEJNE zajęte pole, kaskada leci dalej stamtąd. Każde
// wypchnięcie trafia też do dziennika aktywności ofiary (i zbijającego, przy kradzieży).
// Pole 0 (start planszy/okrążenia) jest bezpieczne — stojących tam graczy NIE da się
// wypchnąć, więc kaskada urywa się, gdy trafi na kogoś stojącego akurat na starcie.
function slApplyKnockback(rollerPlayerId, landingAbsPos, board, rollerNickname) {
  const pushedIds = new Set([rollerPlayerId]);
  const chain = [];
  let targetTile = slTileOf(landingAbsPos);
  let pusherId = rollerPlayerId;
  let pusherNickname = rollerNickname;
  for (let i = 0; i < 200; i++) { // bezpiecznik przeciw pętli nieskończonej
    if (targetTile === 0) break; // pole 0 jest bezpieczne — nikogo stamtąd nie wypychamy
    const occ = slFindOccupant(targetTile, pushedIds);
    if (!occ) break;
    const fromAbs = Number(occ.abs_pos);
    // Siła wypchnięcia jest losowa przy każdym zbiciu — patrz slKnockbackTilesBack().
    // Cofnięcie zatrzymuje się na polu 0 BIEŻĄCEGO okrążenia: wypchnięcie nigdy nie
    // zabiera całego okrążenia. Gracz tuż po starcie kolejnej pętli (np. pole 2) ląduje
    // na polu 0 tej pętli, a nie na końcówce poprzedniej — dlatego do dziennika i do
    // odpowiedzi trafia tilesBack, czyli faktyczne cofnięcie po przycięciu, nie samo
    // wylosowanie.
    const lapStartAbs = fromAbs - slTileOf(fromAbs);
    const knockedAbs = Math.max(lapStartAbs, fromAbs - slKnockbackTilesBack());
    const tilesBack = fromAbs - knockedAbs;
    const resolved = slResolveTileEffect(knockedAbs, board);
    const toAbs = resolved.abs;
    const bonusPoints = resolved.tilePoints;

    const victimRow = db.prepare('SELECT balance FROM sl_state WHERE player_id = ?').get(occ.player_id);
    const stolen = Math.min(SL_KNOCKBACK_COIN_STEAL, Math.max(0, Number(victimRow.balance)));

    db.prepare(`
      UPDATE sl_state
      SET abs_pos = ?, laps = ?, balance = balance + ?, total_points = total_points + ?
      WHERE player_id = ?
    `).run(toAbs, Math.floor(toAbs / SL_BOARD_SIZE), bonusPoints - stolen, bonusPoints, occ.player_id);

    if (stolen > 0) {
      db.prepare('UPDATE sl_state SET balance = balance + ?, total_points = total_points + ? WHERE player_id = ?')
        .run(stolen, stolen, pusherId);
    }

    const entry = {
      player_id: occ.player_id,
      nickname: occ.nickname,
      from_tile: slTileOf(fromAbs),
      to_tile: slTileOf(toAbs),
      tiles_back: tilesBack,
      tile_effect: resolved.note,
      bonus_points: bonusPoints,
      coins_stolen: stolen,
      stolen_by: pusherNickname
    };
    chain.push(entry);

    const bits = [`z pola ${entry.from_tile} → ${entry.to_tile} (-${tilesBack} pól)`];
    if (resolved.note === 'ladder') bits.push('🪜 i wjechał na drabinę!');
    if (resolved.note === 'snake') bits.push('🐍 i zjechał wężem niżej!');
    if (resolved.note === 'bonus') bits.push(`⭐ +${bonusPoints} pkt bonusu`);
    if (stolen > 0) bits.push(`💰 stracił ${stolen} monet na rzecz ${pusherNickname}`);
    slLogActivity(occ.player_id, 'knockback', `💥 Wypchnięty przez ${pusherNickname} ${bits.join(' ')}`);
    if (stolen > 0) {
      slLogActivity(pusherId, 'knockback', `💰 Zbiłeś ${occ.nickname} i zgarnąłeś ${stolen} monet!`);
    }

    pushedIds.add(occ.player_id);
    pusherId = occ.player_id;
    pusherNickname = occ.nickname;
    if (fromAbs === toAbs) break; // brak realnej zmiany pozycji — koniec kaskady
    targetTile = slTileOf(toAbs);
  }
  return chain;
}

// ── MIGRACJA (jednorazowa): retroaktywne dogranie punktów za kradzieże przy
// wypchnięciu sprzed naprawy total_points wyżej w slApplyKnockback — do tej pory
// skradzione monety trafiały tylko na balance, nigdy na total_points (ranking).
// Nie ma osobnej, ustrukturyzowanej tabeli z historią kradzieży — jedyny ślad to
// wolny tekst w sl_activity ("💰 Zbiłeś X i zgarnąłeś N monet!"), więc parsujemy
// go regexem. Zabezpieczone znacznikiem w sl_meta — leci raz, kolejne restarty
// serwera to no-op (patrz też migracja układu planszy wyżej, ten sam wzorzec).
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

// ── MIGRACJA (jednorazowa): Double Move przestał być efektem czekającym na następną
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
          '⏩ Double Move wrócił do ekwipunku — nowe zasady: daje dodatkowy ruch od ręki, nie dwie kostki w turze.');
      }
    });
    console.log(`Snakes: oddano ${stale.length} niewykorzystanych Double Move do ekwipunku (nowe zasady)`);
  }
  slMetaSet('double_move_instant_migrated', '1');
})();


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
  return rows.map(r => {
    const rollsUsedToday = r.last_move_date === today ? Number(r.rolls_today) : 0;
    const dailyRolls = slDailyRollsFor(r, today);
    return {
      player_id: r.player_id,
      nickname: r.nickname,
      avatar_url: slAvatarUrl(r.player_id, r.avatar_updated_at),
      tile: slTileOf(r.abs_pos),
      abs_pos: Number(r.abs_pos),
      laps: Number(r.laps),
      total_points: Number(r.total_points),
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

// Oczekujące efekty na danym graczu (do pokazania „co Cię czeka").
// FREEZE JEST TU CELOWO POMINIĘTY: ofiara nie ma prawa wiedzieć, że jest zamrożona,
// dopóki nie kliknie „Rzuć" i sama się nie przekona (patrz POST /api/snakes/roll).
// Freeze widzi wyłącznie ten, kto go rzucił — w dzienniku ma własny wpis, ale bez celu,
// więc reszta stołu wie tylko TYLE, że ktoś kogoś zamroził.
function slPendingEffects(playerId) {
  return db.prepare(`
    SELECT e.type, e.variant, p.nickname AS source_nickname
    FROM sl_effects e LEFT JOIN players p ON p.id = e.source_player_id
    WHERE e.target_player_id = ? AND e.status = 'pending' AND e.type != 'freeze'
    ORDER BY e.id
  `).all(playerId).map(e => ({
    type: e.type,
    // WARIANT KLĄTWY CELOWO NIE WYCHODZI NA ZEWNĄTRZ: cel ma wiedzieć, że coś na nim
    // wisi i od kogo, ale nie CO — inaczej wystarczyłoby zajrzeć w odpowiedź API, żeby
    // rozbroić całą niespodziankę. Wariant ujawnia się dopiero, gdy klątwa odpali
    // (na ruchu albo — przy Drożyźnie — przy zakupie).
    variant: null,
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

// Domyślny próg dla NOWYCH cykli — admin może go podmienić na stałe (patrz
// POST /api/snakes/admin/coop/config), bez tego trzeba by grzebać w .env i restartować.
// Zmiana dotyczy tylko przyszłych cykli; bieżący ma już swój próg zapisany w wierszu.
function slCoopDefaultThreshold() {
  const override = parseInt(slMetaGet('coop_threshold_override'), 10);
  return Number.isInteger(override) && override > 0 ? override : SL_COOP_THRESHOLD;
}

// ── WYŁĄCZNIK BOSSA ──
// Cała walka z bossem chodzi na jednym przełączniku trzymanym w sl_meta, więc da się ją
// zgasić i zapalić z panelu admina bez deployu. Wyłączony boss znika kompletnie: payload
// dla UI jest pusty (panel i punkt regulaminu się chowają), rzuty nie zadają obrażeń,
// ręczny atak odpada, scheduler nie rozlicza terminów, a nowe cykle się nie zakładają.
// Domyślnie WŁĄCZONY — na produkcji gasi go jednorazowa migracja (patrz
// shutDownBossAndRevertRewards), więc świeża instalacja dostaje bossa normalnie.
function slBossEnabled() {
  return slMetaGet('boss_enabled') !== '0';
}

// Zapala/gasi bossa. Przy gaszeniu domykamy trwającą walkę BEZ rozliczenia (nikt nie
// dostaje nagrody ani kary — walka po prostu przestaje istnieć), przy zapalaniu startuje
// świeży cykl z nowym bossem i nowym terminem. Bez tego po ponownym włączeniu odżyłby
// stary cykl z terminem dawno po czasie i pierwszy tik schedulera ukarałby wszystkich
// za przegraną, której nikt nie miał szans rozegrać.
function slSetBossEnabled(on) {
  return transaction(() => {
    slMetaSet('boss_enabled', on ? '1' : '0');
    if (!on) {
      const closed = db.prepare(`
        UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE status = 'event_active'
      `).run();
      return { enabled: false, closed_cycles: closed.changes };
    }
    const last = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
    if (last && last.status === 'event_active') return { enabled: true, cycle: Number(last.cycle), boss_name: last.boss_name };
    const next = slCoopInsertCycle(
      last ? Number(last.cycle) + 1 : 1,
      slCoopDefaultThreshold(),
      SL_COOP_BASE_TIME_DAYS
    );
    return { enabled: true, cycle: Number(next.cycle), boss_name: next.boss_name };
  });
}

// Wstawia nowy cykl co-op — rusza NATYCHMIAST (started_at = teraz, domyślnie w schemacie)
// i OD RAZU budzi bossa (jedna faza — patrz komentarz "ESKALACJA TRUDNOŚCI CO-OP" wyżej):
// żadnej zbiórki, żadnego czekania. `threshold` to wyłącznie suwak trudności — skaluje
// HP bossa i pulę nagród (patrz startCoopBossEvent), `timeLimitDays` to domyślny czas na
// pokonanie GO, który admin może potem w każdej chwili nadpisać na konkretną godzinę
// (patrz POST /api/snakes/admin/coop/config).
function slCoopInsertCycle(cycle, threshold, timeLimitDays) {
  const rewardPool = Math.round(threshold * SL_COOP_REWARD_MULTIPLIER);
  db.prepare(`
    INSERT INTO sl_coop (cycle, threshold, time_limit_days, status, reward_pool, triggered_at)
    VALUES (?, ?, ?, 'event_active', ?, CURRENT_TIMESTAMP)
  `).run(cycle, threshold, timeLimitDays, rewardPool);
  const coop = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
  startCoopBossEvent(coop);
  return db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
}

// Zwraca bieżący cykl co-op — wystarczy ostatni wiersz; jeśli baza jest zupełnie pusta, zakłada świeży cykl #1
// z wartościami bazowymi (próg z ewentualnego override'u admina, czas z SL_COOP_BASE_TIME_DAYS).
function slCurrentCoop() {
  const coop = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
  if (coop) return coop;
  return slCoopInsertCycle(1, slCoopDefaultThreshold(), SL_COOP_BASE_TIME_DAYS);
}

// Ranking atakujących w cyklu — `amount` to teraz SUMA ZADANYCH OBRAŻEŃ (od rzutów
// kostką i ręcznych ataków), nie wpłata do puli (zbiórki już nie ma). Nazwa tabeli
// (sl_coop_contributions) została ze starego mechanizmu, ale wiersze wstawiane są
// dziś przy każdym trafieniu bossa (patrz POST /api/snakes/roll i /coop/attack).
function slCoopAttackers(cycle) {
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

// Zwraca null, gdy boss jest wyłączony — UI po stronie gracza i panel admina czytają to
// jako „nie ma czego pokazywać". Sprawdzenie jest PRZED slCurrentCoop(), bo tamto samo
// zakłada nowy cykl, gdy tabela jest pusta — wyłączony boss nie ma prawa się tak wskrzesić.
function slCoopPayload(meId) {
  if (!slBossEnabled()) return null;
  const coop = slCurrentCoop();
  const attackers = slCoopAttackers(coop.cycle);
  const mine = meId ? (attackers.find(c => c.player_id === meId) || { amount: 0 }).amount : 0;
  const threshold = Number(coop.threshold);

  // Poprzednia edycja (jeśli już się rozstrzygnęła) — do krótkiego podsumowania "co się
  // stało ostatnio i dlatego trudność jest taka, jaka jest" w UI zaraz po sukcesji.
  let previousResult = null;
  if (coop.cycle > 1) {
    const prev = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle - 1);
    if (prev && prev.completed_at) {
      previousResult = {
        cycle: Number(prev.cycle),
        boss_name: prev.boss_name,
        defeated: !!prev.boss_defeated_at,
        reward_pool: Number(prev.reward_pool),
        bonus: prev.boss_defeated_at ? SL_BOSS_DEFEAT_BONUS : 0,
        timeout_penalty: prev.boss_defeated_at ? 0 : SL_BOSS_TIMEOUT_PENALTY
      };
    }
  }

  return {
    cycle: Number(coop.cycle),
    status: coop.status,
    // `threshold` nie jest już nigdzie zbierany od graczy — to czysto wewnętrzny suwak
    // trudności (skaluje HP bossa i pulę nagród), zostawiony w payloadzie na potrzeby
    // panelu admina (patrz GET /api/snakes/admin/settings).
    threshold,
    default_threshold: slCoopDefaultThreshold(),
    reward_pool: Number(coop.reward_pool) || Math.round(threshold * SL_COOP_REWARD_MULTIPLIER),
    reward_split: SL_COOP_REWARD_SPLIT,
    my_damage: mine,
    attackers,
    time_limit_days: Number(coop.time_limit_days),
    previous_result: previousResult,
    timeout_penalty: SL_BOSS_TIMEOUT_PENALTY,
    // Realna kara DLA MNIE, gdyby event skończył się porażką TERAZ — pomniejszona o to,
    // ile obrażeń już zadałem w tym cyklu (patrz slFinishBossEvent). Kto nie walczył,
    // widzi tu pełne timeout_penalty.
    my_timeout_penalty: Math.max(0, SL_BOSS_TIMEOUT_PENALTY - mine),
    // Konkretne liczby na "co będzie, jak wygracie/przegracie" — żeby UI mógł pokazać
    // realną karę/nagrodę zamiast ogólnikowego opisu (patrz slCoopNextDifficulty).
    next_on_win: slCoopNextDifficulty(coop, true),
    next_on_loss: slCoopNextDifficulty(coop, false),
    // Boss walczy ZAWSZE (jedna faza — nie ma już zbiórki poprzedzającej), więc ten
    // obiekt jest tu praktycznie zawsze (null tylko w teoretycznym momencie tuż po
    // INSERT, zanim startCoopBossEvent zdąży dopisać HP — patrz slCoopInsertCycle).
    boss: coop.boss_name ? {
      name: coop.boss_name,
      hp: Math.max(0, Number(coop.boss_hp)),
      max_hp: Number(coop.boss_max_hp),
      percent: Math.max(0, Math.min(100, Math.round((Number(coop.boss_hp) / Math.max(1, Number(coop.boss_max_hp))) * 100))),
      defeated: !!coop.boss_defeated_at,
      active: coop.status === 'event_active',
      deadline_at: coop.boss_deadline_at ? new Date(coop.boss_deadline_at.replace(' ', 'T') + 'Z').toISOString() : null,
      started_at: coop.boss_started_at
        ? new Date(coop.boss_started_at.replace(' ', 'T') + 'Z').toISOString()
        : (coop.boss_deadline_at
            ? new Date(Date.parse(coop.boss_deadline_at.replace(' ', 'T') + 'Z') - Number(coop.time_limit_days) * 86400000).toISOString()
            : null),
      time_limit_days: Number(coop.time_limit_days),
      attack_cost: SL_BOSS_ATTACK_COST,
      attack_damage: SL_BOSS_ATTACK_DAMAGE,
      dice_damage_mult: SL_BOSS_DICE_DAMAGE_MULT,
      defeat_bonus: SL_BOSS_DEFEAT_BONUS
    } : null
  };
}

// ── WALKA Z BOSSEM ──
// Wołane od razu przy założeniu nowego cyklu (patrz slCoopInsertCycle) — boss budzi się
// natychmiast, nie ma już żadnej zbiórki, po której miałby czekać. Losuje bossa, ustawia
// mu HP proporcjonalne do progu (suwaka trudności) i liczy termin pokonania —
// coop.time_limit_days DNI ROBOCZYCH od teraz (weekendy nie liczą się do odliczania,
// patrz addBusinessDaysMs). `coop` musi mieć aktualne `threshold`/`time_limit_days`/`cycle`.
function startCoopBossEvent(coop) {
  const name = SL_BOSS_NAMES[Math.floor(Math.random() * SL_BOSS_NAMES.length)];
  const maxHp = Math.round(Number(coop.threshold) * SL_BOSS_HP_MULTIPLIER);
  const deadlineMs = addBusinessDaysMs(Date.now(), Number(coop.time_limit_days));
  db.prepare(`
    UPDATE sl_coop SET boss_name = ?, boss_max_hp = ?, boss_hp = ?,
                       boss_started_at = CURRENT_TIMESTAMP, boss_deadline_at = datetime(?, 'unixepoch')
    WHERE cycle = ?
  `).run(name, maxHp, maxHp, Math.floor(deadlineMs / 1000), coop.cycle);
  return { started: true, cycle: Number(coop.cycle), boss_name: name, boss_max_hp: maxHp, deadline_ms: deadlineMs };
}

// Warunek zwycięstwa: HP bossa spadło do zera (od rzutów graczy lub ręcznych ataków —
// patrz obsługa w POST /api/snakes/roll i /api/snakes/coop/attack).
function resolveCoopBossEvent(coop) {
  return { defeated: Number(coop.boss_hp) <= 0, cycle: Number(coop.cycle) };
}

// Podział nagród: 'proportional' (domyślnie) — wg zadanych obrażeń; 'flat' — po równo.
// Zwraca listę { player_id, nickname, amount } (bez zapisu do bazy).
function slCoopRewardSplit(attackers, rewardPool) {
  if (!attackers.length) return [];
  if (SL_COOP_REWARD_SPLIT === 'flat') {
    const each = Math.floor(rewardPool / attackers.length);
    return attackers.map(c => ({ ...c, reward: each }));
  }
  const total = attackers.reduce((a, c) => a + c.amount, 0) || 1;
  return attackers.map(c => ({ ...c, reward: Math.round(rewardPool * (c.amount / total)) }));
}

// Próg/czas KOLEJNEJ edycji na podstawie wyniku tej: wygrana = trudniej i szybciej
// (× GROWTH / × SHRINK); przegrana (czas minął) = odrobinę łatwiej (RELIEF_FACTOR)
// — "delikatna pomoc", żeby ekipa mogła się odbić, a nie utknąć na niemożliwym progu.
// W obie strony trzymamy się widełek [BASE .. wynik poprzedniej edycji] — porażka
// nigdy nie schodzi PONIŻEJ progu bazowego ani nie wydłuża czasu PONAD bazowy.
function slCoopNextDifficulty(coop, defeated) {
  const threshold = Number(coop.threshold);
  const timeLimit = Number(coop.time_limit_days);
  const base = slCoopDefaultThreshold();
  if (defeated) {
    // Trudniej: zaokrąglenia ZAWSZE w stronę większej trudności (próg w górę, czas w
    // dół), żeby zaokrąglenie nigdy przypadkiem nie ułatwiło kolejnej edycji.
    return {
      threshold: Math.ceil(threshold * SL_COOP_THRESHOLD_GROWTH),
      time_limit_days: Math.max(SL_COOP_MIN_TIME_DAYS, Math.floor(timeLimit * SL_COOP_TIME_SHRINK))
    };
  }
  // Łatwiej: zaokrąglenia ZAWSZE w stronę większej ulgi (próg w dół, czas w górę) —
  // inaczej przy małych wartościach czasu (dni) zaokrąglenie potrafi "utknąć" i ulga
  // z porażki nigdy realnie nie nadejdzie.
  return {
    threshold: Math.max(base, Math.floor(threshold * SL_COOP_RELIEF_FACTOR)),
    time_limit_days: Math.min(SL_COOP_BASE_TIME_DAYS, Math.ceil(timeLimit / SL_COOP_RELIEF_FACTOR))
  };
}

// Zamyka event bossowy, wypłaca nagrody/karę i OD RAZU otwiera kolejną edycję (trudniejszą
// po wygranej, odrobinę łagodniejszą po porażce — patrz slCoopNextDifficulty; nowy boss
// budzi się natychmiast, patrz slCoopInsertCycle). Wołane automatycznie, gdy HP bossa
// spadnie do zera (zwykły rzut lub ręczny atak), albo gdy minie termin (scheduler niżej),
// a boss wciąż żyje. Pokonanie bossa wypłaca KAŻDEMU, kto zadał mu choć jedno trafienie
// (rzutem kostką lub ręcznym atakiem — patrz slCoopAttackers), pulę nagród
// (próg × SL_COOP_REWARD_MULTIPLIER, podział wg SL_COOP_REWARD_SPLIT proporcjonalnie do
// zadanych obrażeń) + SL_BOSS_DEFEAT_BONUS na KAŻDEGO atakującego ponad pulę — punkty I
// monety naraz (reward dolicza się do obu, patrz UPDATE niżej).
// Nie pokonanie na czas = PRZEGRANA: nagrody NIE MA, a boss "atakuje" i zabiera do
// SL_BOSS_TIMEOUT_PENALTY monet KAŻDEMU graczowi (nie tylko tym, którzy walczyli) —
// realna stawka za bierność. Ci, którzy walczyli, mają jednak karę pomniejszoną o to,
// ile obrażeń zadali w TYM cyklu (zadał obrażenia warte 30 → traci 20; zadał więcej niż
// pełna kara → nic nie traci) — jedyna ulga za udział w walce, gdy się nie uda.
function slFinishBossEvent(coop, defeated) {
  const attackers = slCoopAttackers(coop.cycle);
  const rewardPool = Number(coop.reward_pool) || Math.round(Number(coop.threshold) * SL_COOP_REWARD_MULTIPLIER);
  const bonus = defeated ? SL_BOSS_DEFEAT_BONUS : 0;
  const payouts = defeated
    ? slCoopRewardSplit(attackers, rewardPool).map(p => ({ ...p, reward: p.reward + bonus }))
    : attackers.map(c => ({ ...c, reward: 0 }));

  for (const p of payouts) {
    if (!p.reward) continue;
    db.prepare('UPDATE sl_state SET balance = balance + ?, total_points = total_points + ? WHERE player_id = ?')
      .run(p.reward, p.reward, p.player_id);
  }

  let playersPenalized = 0;
  if (!defeated) {
    const damageByPlayer = new Map(attackers.map(c => [c.player_id, c.amount]));
    const allPlayers = db.prepare('SELECT player_id, balance FROM sl_state').all();
    const upd = db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?');
    for (const p of allPlayers) {
      const discount = damageByPlayer.get(p.player_id) || 0;
      const penalty = Math.max(0, SL_BOSS_TIMEOUT_PENALTY - discount);
      const taken = Math.min(penalty, Math.max(0, Number(p.balance)));
      if (taken > 0) {
        upd.run(taken, p.player_id);
        playersPenalized++;
      }
    }
  }

  db.prepare(`
    UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP, boss_hp = 0
      ${defeated ? ", boss_defeated_at = CURRENT_TIMESTAMP" : ''}
    WHERE cycle = ?
  `).run(coop.cycle);

  const next = slCoopNextDifficulty(coop, defeated);
  const nextCoop = slCoopInsertCycle(coop.cycle + 1, next.threshold, next.time_limit_days);

  return {
    cycle: Number(coop.cycle), boss_name: coop.boss_name, reward_pool: rewardPool, bonus, payouts, defeated,
    timeout_penalty: defeated ? 0 : SL_BOSS_TIMEOUT_PENALTY,
    players_attacked: playersPenalized,
    next_cycle: { cycle: Number(nextCoop.cycle), threshold: next.threshold, time_limit_days: next.time_limit_days }
  };
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
  const coop = slCoopPayload(null);
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

// ── SCHEDULER TERMINU BOSSA ──
// Jedna faza, jeden zegar: jeśli minie boss_deadline_at, a boss wciąż żyje, rozliczamy to
// jak przegraną (patrz slFinishBossEvent) i OD RAZU startuje kolejna, łagodniejsza edycja
// z nowym bossem. Jeśli boss padł wcześniej w grze, status jest już 'completed' i ten kod
// nigdy się nie odpala — brak podwójnego rozliczenia. Działa ZAWSZE (niezależnie od
// webhooka) — slEmit sam pomija wysyłkę, gdy webhook nie jest skonfigurowany. Tick co
// minutę + raz od razu przy starcie (samo-naprawa po restarcie, także po tym, jak admin
// ustawi termin w przeszłości przez /admin/coop/config — patrz tam).
function slResolveBossTimeout(cycle) {
  return transaction(() => {
    const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
    if (!fresh || fresh.status !== 'event_active') return null;
    if (!fresh.boss_deadline_at) return null;
    if (Date.now() < Date.parse(fresh.boss_deadline_at.replace(' ', 'T') + 'Z')) return null;
    return slFinishBossEvent(fresh, Number(fresh.boss_hp) <= 0);
  });
}

function slEmitBossTimeout(outcome) {
  slEmit('coop_completed', () => ({
    content: outcome.defeated ? '🏆 **Boss pokonany!**' : '💥 **Czas minął — boss zaatakował!**',
    embeds: [{
      title: `Edycja #${outcome.cycle} — ${outcome.boss_name}`,
      url: SNAKES_URL,
      description: (outcome.defeated
        ? `Atakujący dzielą pulę **${outcome.reward_pool} pkt** + premię za zabicie **${outcome.bonus} pkt/os.**`
        : `Nie zdążyliście dobić bossa na czas. Nagrody nie ma. Boss zabrał do **${outcome.timeout_penalty} monet** każdemu graczowi (walczącym pomniejszone o zadane obrażenia; dotyczy ${outcome.players_attacked} ${outcome.players_attacked === 1 ? 'osoby' : 'osób'}).`
      ) + `\n\n➡️ Edycja #${outcome.next_cycle.cycle} rusza od razu: **${outcome.next_cycle.time_limit_days}** dni roboczych na pokonanie kolejnego bossa.`,
      color: outcome.defeated ? 0x53D06B : 0xE85D4A
    }]
  }));
}

function startCoopBossDeadlineScheduler() {
  const tick = () => {
    if (!slBossEnabled()) return;
    const coop = slCurrentCoop();
    if (coop.status !== 'event_active') return;
    const outcome = slResolveBossTimeout(coop.cycle);
    if (outcome) slEmitBossTimeout(outcome);
  };
  tick();
  setInterval(tick, 60_000);
  console.log(`Snakes/Co-op: eskalacja trudności — próg ×${SL_COOP_THRESHOLD_GROWTH} i czas ×${SL_COOP_TIME_SHRINK} po wygranej (min. ${SL_COOP_MIN_TIME_DAYS} dni robocze), ulga ×${SL_COOP_RELIEF_FACTOR} po porażce.`);
}
// ── COFANIE NAGRÓD BOSSA ──
// Nagrody za pokonanie bossa NIE mają własnego rejestru — slFinishBossEvent doliczał je
// wprost do salda i punktów gracza. Da się je jednak odtworzyć CO DO GROSZA, bo liczyły
// się z danych, które w bazie zostały: puli cyklu i wkładu każdego atakującego
// (sl_coop_contributions po rozliczeniu cyklu już się nie zmienia). Puszczamy więc tę samą
// matematykę co przy wypłacie (slCoopRewardSplit + premia za zabicie) i odejmujemy wynik.
// Bierzemy WYŁĄCZNIE cykle wygrane (boss_defeated_at) — przegrane nic nie wypłaciły.
// Kary z przegranych walk NIE wracają: przy zabieraniu monet kwota była przycinana do
// salda gracza, więc realnie zabrana wartość nigdzie nie została zapisana i nie da się jej
// wiernie odtworzyć. Odejmowanie ma podłogę na zerze — kto zdążył wydać nagrodę, schodzi
// do zera, ale nie na minus.
function slRevertBossRewards() {
  const cycles = db.prepare(`
    SELECT * FROM sl_coop WHERE completed_at IS NOT NULL AND boss_defeated_at IS NOT NULL
  `).all();

  const takeBack = new Map();
  for (const c of cycles) {
    const rewardPool = Number(c.reward_pool) || Math.round(Number(c.threshold) * SL_COOP_REWARD_MULTIPLIER);
    for (const p of slCoopRewardSplit(slCoopAttackers(c.cycle), rewardPool)) {
      const reward = p.reward + SL_BOSS_DEFEAT_BONUS;
      if (reward > 0) takeBack.set(p.player_id, (takeBack.get(p.player_id) || 0) + reward);
    }
  }

  const upd = db.prepare(`
    UPDATE sl_state SET balance = MAX(0, balance - ?), total_points = MAX(0, total_points - ?)
    WHERE player_id = ?
  `);
  for (const [playerId, amount] of takeBack) upd.run(amount, amount, playerId);

  return {
    cycles: cycles.length,
    players: takeBack.size,
    total: [...takeBack.values()].reduce((a, b) => a + b, 0)
  };
}

// ── MIGRACJA (jednorazowa): WYŁĄCZENIE BOSSA + COFNIĘCIE TEGO, CO ROZDAŁ ──
// Wersja „awaryjny hamulec": po deployu produkcja sama gasi bossa i oddaje punkty oraz
// monety, które wypłacił za pokonane walki. Flaga w sl_meta pilnuje, żeby stało się to
// DOKŁADNIE RAZ — inaczej każdy restart zabierałby graczom kolejną porcję punktów, a
// admin nie mógłby już nigdy włączyć bossa z panelu (kolejny restart znów by go zgasił).
// Wpisy o walce znikają z dziennika, bo dotyczą czegoś, czego po cofnięciu już nie ma;
// sl_coop i sl_coop_contributions ZOSTAJĄ jako ślad po tym, co i komu odjęto.
(function shutDownBossAndRevertRewards() {
  const FLAG = 'boss_shutdown_revert_done';
  if (slMetaGet(FLAG)) return;

  transaction(() => {
    slMetaSet(FLAG, new Date().toISOString());
    const undone = slRevertBossRewards();
    const closed = db.prepare(`
      UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE status = 'event_active'
    `).run();
    const wiped = db.prepare(`DELETE FROM sl_activity WHERE type = 'boss_hit'`).run();
    slMetaSet('boss_enabled', '0');
    console.log(
      `Snakes/Boss: WYŁĄCZONY. Cofnięto ${undone.total} pkt i monet od ${undone.players} ` +
      `${undone.players === 1 ? 'gracza' : 'graczy'} (${undone.cycles} rozliczonych walk), ` +
      `domknięto ${closed.changes} trwającą walkę, usunięto ${wiped.changes} wpisów z dziennika. ` +
      `Włączyć z powrotem można z panelu admina.`
    );
  });
})();

// ── MIGRACJA (jednorazowa): edycje, które utknęły w starym statusie 'collecting' (sprzed
// przejścia na jedną fazę — boss walczy zawsze, patrz komentarz "ESKALACJA TRUDNOŚCI
// CO-OP" wyżej), budzimy natychmiast — dostają swojego bossa i normalny termin na
// pokonanie, tak jakby właśnie wystartowała ich edycja. Przy wyłączonym bossie nie ma
// czego budzić — cykl czeka na ewentualne włączenie z panelu.
(function activateLegacyCollectingCycles() {
  if (!slBossEnabled()) return;
  const rows = db.prepare(`SELECT * FROM sl_coop WHERE status = 'collecting'`).all();
  for (const row of rows) {
    const rewardPool = Math.round(Number(row.threshold) * SL_COOP_REWARD_MULTIPLIER);
    db.prepare(`
      UPDATE sl_coop SET status = 'event_active', reward_pool = ?, triggered_at = CURRENT_TIMESTAMP
      WHERE cycle = ?
    `).run(rewardPool, row.cycle);
    const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(row.cycle);
    const info = startCoopBossEvent(fresh);
    console.log(`Snakes/Co-op: edycja #${row.cycle} przełączona ze starej zbiórki na walkę — budzi się ${info.boss_name}`);
  }
})();

// ── MIGRACJA (jednorazowa): WPŁATY Z CZASÓW ZBIÓRKI → OBRAŻENIA ──
// Kasa wrzucona do puli, zanim boss wstał, nie może po prostu wyparować: przeliczamy ją
// 1:1 na obrażenia i od razu je bossowi zadajemy. Wiersze sl_coop_contributions sprzed
// `boss_started_at` to WŁAŚNIE tamte wpłaty (trafienia z walki są zapisywane dopiero po
// wybudzeniu bossa, więc mają późniejsze created_at) — dlatego rozpoznajemy je po czasie,
// a nie po statusie cyklu. Dzięki temu migracja działa tak samo, gdy boss wstał już przy
// poprzednim restarcie, jak i gdy budzi się dopiero teraz.
// Same wiersze zostają nietknięte — liczą się dalej jako wkład do podziału nagród
// (patrz slCoopAttackers), zmienia się tylko to, że boss faktycznie to oberwał.
// Flaga w sl_meta pilnuje, żeby odliczyć je DOKŁADNIE RAZ na cykl; HP nie schodzi poniżej
// 1, bo dobicie ma pójść normalną drogą (rzut/atak gracza → nagrody, patrz slFinishBossEvent).
(function convertLegacyContributionsToDamage() {
  if (!slBossEnabled()) return;
  const FLAG = 'coop_legacy_contrib_damage_cycle';
  const coop = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
  if (!coop || coop.status !== 'event_active' || !coop.boss_started_at) return;
  if (String(slMetaGet(FLAG) || '') === String(coop.cycle)) return;

  transaction(() => {
    const legacy = db.prepare(`
      SELECT player_id, SUM(amount) AS amount
      FROM sl_coop_contributions
      WHERE cycle = ? AND created_at < ?
      GROUP BY player_id
    `).all(coop.cycle, coop.boss_started_at);

    slMetaSet(FLAG, coop.cycle); // ustawiamy ZAWSZE — nawet gdy nie było wpłat, żeby nie liczyć dwa razy
    const total = legacy.reduce((a, r) => a + Number(r.amount), 0);
    if (total <= 0) return;

    const newHp = Math.max(1, Number(coop.boss_hp) - total);
    db.prepare('UPDATE sl_coop SET boss_hp = ? WHERE cycle = ?').run(newHp, coop.cycle);
    for (const r of legacy) {
      slLogActivity(r.player_id, 'boss_hit', slBossHitEntry(Number(r.amount), 'wpłata'));
    }
    console.log(`Snakes/Co-op: wpłaty z przygotowań (${total}) zadane jako obrażenia — ${coop.boss_name} ma ${newHp}/${coop.boss_max_hp} HP`);
  });
})();

startCoopBossDeadlineScheduler();

// Pełny stan gry dla gracza (wszystko, czego potrzebuje UI w jednym zapytaniu).
function slBuildState(playerId) {
  const st = slEnsureState(playerId);
  const today = todayWaw();
  const isWeekend = isWeekendStr(today);
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
      office_start_hour: SL_PLAY_START_HOUR,
      office_end_hour: SL_PLAY_END_HOUR,
      office_closes_at: officeOpen ? new Date(slOfficeCloseMs()).toISOString() : null,
      next_move_at: new Date(slNextOpenMs()).toISOString(),
      can_roll: rollsRemainingToday > 0 && !!st.has_avatar && !isWeekend && officeOpen,
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
  if (isWeekendStr(today)) {
    return res.status(400).json({ error: 'W weekend nie gramy — wróć w poniedziałek.', is_weekend: true });
  }

  // Bramka: gra biurowa — rzucamy tylko w godzinach pracy (czasu Warszawy).
  if (!slOfficeOpenAt()) {
    return res.status(400).json({
      error: `Rzucamy tylko w godzinach ${SL_PLAY_START_HOUR}:00–${SL_PLAY_END_HOUR}:00 — to gra biurowa.`,
      office_closed: true,
      next_open: new Date(slNextOpenMs()).toISOString()
    });
  }

  const result = transaction(() => {
    const st = slEnsureState(playerId);
    // rolls_today liczy się dla dnia zapisanego w last_move_date — inny dzień = licznik
    // efektywnie na zero, bez potrzeby osobnego resetu o północy.
    const rollsUsedToday = st.last_move_date === today ? Number(st.rolls_today) : 0;
    const dailyRolls = slDailyRollsFor(st, today); // limit bazowy + sloty z Double Move
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
      slLogActivity(playerId, 'roll', `❄️ Zamrożony${freezeSourceNick ? ` przez ${freezeSourceNick}` : ''} — ruch ${moveSeq}/${SL_DAILY_ROLLS} dzisiaj przepadł.`);
      if (freeze.source_player_id) {
        slLogActivity(freeze.source_player_id, 'shop_use', `❄️ Twój Freeze na ${nickname} właśnie odpalił!`);
      }
      return { frozen: true, source: freeze.source_player_id, source_nickname: freezeSourceNick, rolls_used_today: moveSeq };
    }

    // Jedna kostka na turę. (Double Move nie dokłada tu drugiego rzutu — daje osobny,
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
    for (const roll of effectiveRolls) {
      const step = slStepMove(abs, roll, board, invertBoard);
      abs = step.absAfter;
      tilePoints += step.tilePoints;
      if (step.note) notes.push(step.note);
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
        const jitteredTile = Math.min(SL_BOARD_SIZE - 1, Math.max(0, landedTile + jitter));
        const resolved = slResolveTileEffect(base + jitteredTile, board);
        abs = resolved.abs;
        tilePoints += resolved.tilePoints;
        if (resolved.note) notes.push(resolved.note);
      } else if (curseVariant === 7) {
        tilePoints = 0; // BEZ BONUSU: pole bonusowe tego ruchu nie liczy się
      }
    }

    // ── KNOCKBACK: jeśli roller wylądował na zajętym polu, wypycha okupanta(ów) ──
    // Sprawdzane na OSTATECZNYM polu lądowania tej tury (po drabinach/wężach/klątwie,
    // po obu rzutach przy Double Move) — nie na każdym pośrednim kroku.
    const knockback = slApplyKnockback(playerId, abs, board, nickname);
    if (knockback.length) notes.push('knockback');

    // ── PUNKTACJA ── (pipPoints liczone od SUROWYCH rzutów, nie od skorygowanych
    // klątwą — gracz i tak wyrzucił tyle oczek, klątwa psuje tylko ruch/zdobycz)
    const pipPoints = rolls.reduce((a, r) => a + r, 0) * SL_POINTS_PER_PIP;
    const distance = Math.max(0, abs - from_abs);
    const progressPoints = distance * SL_POINTS_PER_TILE;
    const oldLaps = Math.floor(from_abs / SL_BOARD_SIZE);
    const newLaps = Math.floor(abs / SL_BOARD_SIZE);
    const lapPoints = Math.max(0, newLaps - oldLaps) * SL_POINTS_PER_LAP;
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

    db.prepare(`
      INSERT INTO sl_moves (player_id, move_date, move_seq, rolls, from_abs, to_abs, points, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(playerId, today, moveSeq, JSON.stringify(rolls), from_abs, abs, earned, notes.join(',') || null);

    db.prepare(`
      UPDATE sl_state
      SET abs_pos = ?, laps = ?, balance = balance + ?, total_points = total_points + ?, last_move_date = ?, rolls_today = ?, last_move_at = CURRENT_TIMESTAMP
      WHERE player_id = ?
    `).run(abs, newLaps, earned - curseCoinSteal, earned, today, moveSeq, playerId);

    slLogActivity(playerId, 'roll',
      `🎲 ${rolls.join('+')} → pole ${slTileOf(abs)} (+${earned} pkt)${notes.length ? ' [' + notes.join(', ') + ']' : ''} (ruch ${moveSeq}/${SL_DAILY_ROLLS})`);
    if (curseVariant) {
      slLogActivity(playerId, 'roll',
        `💀 Klątwa ${SL_CURSE_LABELS[curseVariant]}: ${SL_CURSE_DESCRIPTIONS[curseVariant]}${curseCoinSteal > 0 ? ` (-${curseCoinSteal} monet)` : ''}`);
    }

    // ── SZTURM NA BOSSA: jeśli trwa event bossowy, KAŻDY rzut zadaje mu obrażenia —
    // normalna gra już "walczy", bez dodatkowej akcji. Liczone od SUROWYCH rzutów.
    let bossHit = null;
    const coopNow = slBossEnabled() ? slCurrentCoop() : null;
    if (coopNow && coopNow.status === 'event_active' && Number(coopNow.boss_hp) > 0) {
      const dmg = rolls.reduce((a, r) => a + r, 0) * SL_BOSS_DICE_DAMAGE_MULT;
      const newHp = Math.max(0, Number(coopNow.boss_hp) - dmg);
      db.prepare('UPDATE sl_coop SET boss_hp = ? WHERE cycle = ?').run(newHp, coopNow.cycle);
      db.prepare('INSERT INTO sl_coop_contributions (cycle, player_id, amount) VALUES (?, ?, ?)')
        .run(coopNow.cycle, playerId, dmg);
      slLogActivity(playerId, 'boss_hit', slBossHitEntry(dmg, 'kość'));
      bossHit = { damage: dmg, boss_name: coopNow.boss_name, hp_left: newHp, max_hp: Number(coopNow.boss_max_hp), defeated: false };
      if (newHp <= 0) {
        const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coopNow.cycle);
        bossHit.defeated = true;
        bossHit.victory = slFinishBossEvent(fresh, true);
      }
    }

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
      boss_hit: bossHit,
      rolls_used_today: moveSeq
    };
  });

  if (result.locked) {
    return res.status(400).json({ error: `Wykorzystałeś już dzisiejsze ${result.daily_rolls} ruchy — wróć jutro między ${SL_PLAY_START_HOUR}:00 a ${SL_PLAY_END_HOUR}:00 (albo dołóż sobie ruch Double Move'em).` });
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
    if (result.knockback && result.knockback.length) {
      const extraFor = k => (k.tile_effect === 'ladder' ? ' 🪜 i wjechał na drabinę!'
        : k.tile_effect === 'snake' ? ' 🐍 i zjechał wężem niżej!'
        : k.tile_effect === 'bonus' ? ` ⭐ +${k.bonus_points} pkt bonusu`
        : '') + (k.coins_stolen ? ` 💰 -${k.coins_stolen} monet na rzecz ${k.stolen_by}` : '');
      slEmit('knockback', () => result.knockback.map((k, i) => i === 0
        ? `💥 **${nickname}** wylądował na polu **${k.from_tile}** i wypchnął **${k.nickname}** → pole **${k.to_tile}**${extraFor(k)}.`
        : `↳ efekt domina: **${k.nickname}** też wypchnięty → pole **${k.to_tile}**${extraFor(k)}.`
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
            description: `Ostateczny cios (${result.boss_hit.damage} obr.) zadał **${nickname}**. Kontrybutorzy dzielą **${result.boss_hit.victory.reward_pool} pkt** + premię za zabicie **${result.boss_hit.victory.bonus} pkt/os.**`,
            color: 0x53D06B
          }]
        }));
      }
      // Pojedyncze trafienia bossa (bez finału) celowo NIE lecą na Discorda — spamowałyby
      // kanał przy każdym rzucie podczas eventu.
    }
  }

  res.json({ move: result, state: slBuildState(playerId) });
});

// POST /api/snakes/shop/buy { type } — kup power-up za punkty.
app.post('/api/snakes/shop/buy', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const nickname = req.player.nickname;
  const type = String(req.body.type || '');
  if (!SL_POWERUP_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Nieznany power-up' });
  }
  const baseCost = SL_POWERUP_COSTS[type];
  const priceCurseLabel = SL_CURSE_LABELS[SL_CURSE_PRICE_VARIANT];

  const out = transaction(() => {
    const st = slEnsureState(playerId);

    // KLĄTWA DROŻYZNA: czeka w kolejce jak każda inna, ale odpala się dopiero TUTAJ —
    // przy pierwszym zakupie po jej rzuceniu. Podbija cenę i zużywa się WYŁĄCZNIE przy
    // udanym zakupie: gdy graczowi zabraknie punktów, klątwa zostaje na kolejną próbę
    // (inaczej dałoby się ją zdjąć klikaniem „Kup" bez grosza przy duszy).
    const priceCurse = db.prepare(`
      SELECT id, source_player_id FROM sl_effects
      WHERE target_player_id = ? AND type = 'curse' AND status = 'pending' AND variant = ?
      ORDER BY id LIMIT 1
    `).get(playerId, SL_CURSE_PRICE_VARIANT);
    const cost = priceCurse ? Math.ceil(baseCost * SL_CURSE_PRICE_MARKUP) : baseCost;

    if (st.balance < cost) return { poor: true, balance: st.balance, cost, cursed: !!priceCurse };

    db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?').run(cost, playerId);
    slAddPowerup(playerId, type, 1);
    if (priceCurse) {
      db.prepare(`UPDATE sl_effects SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(priceCurse.id);
    }
    // TARCZA NIE ZOSTAWIA ŚLADU W DZIENNIKU — ani przy zakupie, ani przy użyciu (patrz
    // /shop/use). Cała jej wartość polega na tym, że atakujący nie wie, czy trafi w mur:
    // gdyby feed pokazywał „kupił Shield", wszyscy po prostu omijaliby tego gracza.
    // Saldo innych graczy nie jest publiczne (patrz slLeaderboard), więc brak wpisu
    // naprawdę niczego nie zdradza.
    if (type !== 'shield') {
      slLogActivity(playerId, 'shop_buy',
        `🛒 Kupił ${SL_POWERUP_LABELS[type]} (-${cost} pkt)${priceCurse ? ` — klątwa ${priceCurseLabel} podbiła cenę o ${cost - baseCost}` : ''}`);
    }
    // Ten wpis jest publiczny, a przy zakupie tarczy zdradziłby ją okrężną drogą: „ktoś
    // przepłacił", a w feedzie ani śladu zakupu — czyli kupił Shield. Świadomy koszt:
    // rzucający klątwę traci powiadomienie w tym jednym przypadku, ale tarcza zostaje
    // szczelna. Kupujący i tak widzi klątwę u siebie w toaście.
    if (priceCurse && priceCurse.source_player_id && type !== 'shield') {
      slLogActivity(priceCurse.source_player_id, 'shop_use',
        `🧾 Twoja klątwa ${priceCurseLabel} odpaliła — ${nickname} przepłacił o ${cost - baseCost} pkt!`);
    }
    return { poor: false, cost, cursed: !!priceCurse, extra: cost - baseCost };
  });

  if (out.poor) {
    // Cena z klątwy nie jest zagadką w momencie, w którym zaczyna boleć — mówimy wprost,
    // czemu w sklepie widniało mniej.
    return res.status(400).json({
      error: `Za mało punktów — koszt ${out.cost}${out.cursed ? ` (klątwa ${priceCurseLabel}: +${Math.round((SL_CURSE_PRICE_MARKUP - 1) * 100)}%)` : ''}, masz ${out.balance}.`,
      price_curse: out.cursed ? { label: priceCurseLabel, cost: out.cost, base_cost: baseCost } : null
    });
  }

  // Klątwa ujawnia się dokładnie w chwili, w której zadziałała — tak jak każda inna.
  // Wyjątek: zakup tarczy zostaje niewidoczny nawet wtedy, bo komunikat nazwałby power-up
  // (a sama kwota i tak by go zdradziła). Kupujący widzi klątwę u siebie w toaście.
  if (out.cursed && type !== 'shield') {
    slEmit('powerup_curse', () =>
      `🧾 **${nickname}** wpadł na klątwę **${priceCurseLabel}** — za ${SL_POWERUP_LABELS[type]} zapłacił ${out.cost} zamiast ${baseCost} pkt.`);
  }

  res.json({
    success: true,
    cost: out.cost,
    base_cost: baseCost,
    price_curse: out.cursed ? { label: priceCurseLabel, extra: out.extra } : null,
    state: slBuildState(playerId)
  });
});

// POST /api/snakes/shop/use { type, target_player_id? } — użyj power-up z ekwipunku.
// Freeze/Curse wymagają celu (innego gracza). Double Move i Shield działają na siebie.
// Jeśli cel ma aktywny Shield, atak zostaje ZABLOKOWANY: tarcza znika, atak nie działa
// (power-up atakującego i tak się zużywa — ryzyko wpisane w atak).
// Freeze, Curse i Shield lądują w sl_effects i czekają na swój moment; Double Move jako
// jedyny działa NATYCHMIAST — dokłada ruch do dzisiejszej puli, do wykonania od razu.
app.post('/api/snakes/shop/use', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const nickname = req.player.nickname;
  const today = todayWaw();
  const type = String(req.body.type || '');
  if (!SL_POWERUP_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Nieznany power-up' });
  }

  // Double Move daje ruch OD RAZU, więc poza oknem gry nie ma czego dać — zamiast
  // spalić power-up na ruch, którego i tak nie da się wykonać, odmawiamy użycia.
  // (Freeze/Curse/Shield celowo bez tej bramki: one czekają na swój moment.)
  if (type === 'double_move') {
    if (isWeekendStr(today)) {
      return res.status(400).json({ error: 'W weekend nie gramy — zostaw Double Move na poniedziałek.', is_weekend: true });
    }
    if (!slOfficeOpenAt()) {
      return res.status(400).json({
        error: `Double Move daje ruch od ręki, a biuro jest zamknięte — użyj go między ${SL_PLAY_START_HOUR}:00 a ${SL_PLAY_END_HOUR}:00.`,
        office_closed: true
      });
    }
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

    // Double Move ma dzienny sufit (SL_MAX_EXTRA_ROLLS) — sprawdzamy go PRZED zużyciem
    // sztuki, żeby odbity użytkownik nie stracił przedmiotu za nic.
    const stBefore = type === 'double_move' ? slEnsureState(playerId) : null;
    const extraToday = stBefore && stBefore.extra_rolls_date === today ? Number(stBefore.extra_rolls || 0) : 0;
    if (type === 'double_move' && extraToday >= SL_MAX_EXTRA_ROLLS) {
      return { capped: true, max_extra: SL_MAX_EXTRA_ROLLS, daily_max: SL_DAILY_ROLLS + SL_MAX_EXTRA_ROLLS };
    }

    slAddPowerup(playerId, type, -1);

    // DOUBLE MOVE: nie czeka na następną turę — od razu dokłada JEDEN ruch ponad
    // dzienny limit, do wykonania natychmiast (przycisk „Rzuć" odblokowuje się w tej
    // samej odpowiedzi). Dodatkowe sloty żyją tylko dziś: extra_rolls_date pilnuje, żeby
    // niewykorzystane przepadły o północy razem z resztą limitu.
    if (type === 'double_move') {
      db.prepare('UPDATE sl_state SET extra_rolls = ?, extra_rolls_date = ? WHERE player_id = ?')
        .run(extraToday + 1, today, playerId);
      return { none: false, blocked: false, variant: null, extra_roll: true };
    }

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

    // Curse: losujemy wariant (patrz SL_CURSE_LABELS) już TERAZ, w momencie rzucenia —
    // ale celowo NIE zdradzamy go celowi. Efekt (i jego opis) ujawnia się dopiero, gdy
    // klątwa faktycznie odpali na następnym ruchu ofiary (patrz POST /api/snakes/roll).
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
  if (out.capped) {
    return res.status(400).json({
      error: `Dziś wykorzystałeś już ${out.max_extra} dodatkowe ruchy z Double Move — dzienny limit to ${out.daily_max} rzutów. Sztuka została w ekwipunku, użyjesz jej jutro.`
    });
  }

  // ── DZIENNIK AKTYWNOŚCI (obie strony, gdy dotyczy) ──
  // Freeze dostaje wpis BEZ CELU: stół ma wiedzieć, że ktoś zamroził kogoś (bo to zmienia
  // rachuby), ale na kogo padło — wie tylko rzucający. Ofiara nie dostaje własnego wpisu
  // i nie widzi Freeze'a w swoim panelu (patrz slPendingEffects); dowie się dopiero, gdy
  // kliknie „Rzuć" (wtedy POST /api/snakes/roll dopisuje obu stronom pełną wersję).
  const label = SL_POWERUP_LABELS[type];
  if (out.blocked) {
    slLogActivity(playerId, 'shop_use', `${label} na ${targetNick} zablokowany tarczą`);
    slLogActivity(targetId, 'shop_use', `🛡️ Zablokował ${label} od ${nickname} tarczą`);
  } else if (type === 'freeze') {
    slLogActivity(playerId, 'shop_use', `❄️ Użył Freeze — kogo zamroził, okaże się przy jego następnym ruchu`);
  } else if (out.extra_roll) {
    slLogActivity(playerId, 'shop_use', `⏩ Użył ${label} — dodatkowy ruch do wykonania od razu`);
  } else if (needsTarget) {
    slLogActivity(playerId, 'shop_use', `Użył ${label} na ${targetNick}`);
    slLogActivity(targetId, 'shop_use', `${nickname} rzucił na Ciebie ${label}${type === 'curse' ? ' — zobaczysz jaka, dopiero gdy odpali' : ''}`);
  } else if (type === 'shield') {
    // Cisza — tarcza ujawnia się WYŁĄCZNIE wtedy, gdy coś zablokuje (gałąź out.blocked
    // wyżej dopisuje wpis obu stronom). Inaczej cały jej sens znika.
  } else {
    slLogActivity(playerId, 'shop_use', `Użył ${label}`);
  }

  // ── ZDARZENIA DISCORD ──
  // Freeze celowo nie ma tu emisji — dopiero gdy odpali (patrz POST /api/snakes/roll).
  if (out.blocked) {
    slEmit('shield_block', () =>
      `🛡️ **${targetNick}** zablokował tarczą ${type === 'freeze' ? 'Freeze' : 'Curse'} od **${nickname}**! Tarcza zużyta.`);
  } else if (type === 'curse') {
    slEmit('powerup_curse', () => `💀 **${nickname}** rzucił klątwę na **${targetNick}** — jaką, przekonacie się na jego następnym ruchu.`);
  } else if (out.extra_roll) {
    slEmit('double_move', () => `⏩ **${nickname}** użył Double Move — dołożył sobie ruch ponad dzienny limit i rzuca od razu.`);
  }

  res.json({
    success: true,
    applied_to: targetId,
    blocked: !!out.blocked,
    extra_roll: !!out.extra_roll, // Double Move: ruch dołożony do dzisiejszej puli, do wykonania od ręki
    curse_variant: out.variant, // wylosowany wariant (patrz SL_CURSE_LABELS) — efekt ujawnia się dopiero, gdy odpali
    state: slBuildState(playerId)
  });
});

// GET /api/snakes/players — lekka lista graczy do wyboru celu power-upa.
app.get('/api/snakes/players', authPlayer, (req, res) => {
  res.json({ players: slPlayersPayload(req.player.id) });
});

// POST /api/snakes/coop/attack — ręczny atak na bossa za monety (SL_BOSS_ATTACK_COST).
// Nie wymaga bycia kontrybutorem — to dodatkowy, opcjonalny sposób na wydawanie salda
// w trakcie eventu, poza sklepem power-upów. Jeśli dobija bossa, od razu wypłaca nagrody
// (patrz slFinishBossEvent) — identycznie jak wtedy, gdy dobicie przychodzi ze zwykłego rzutu.
app.post('/api/snakes/coop/attack', authPlayer, (req, res) => {
  const playerId = req.player.id;
  const nickname = req.player.nickname;

  const out = transaction(() => {
    const st = slEnsureState(playerId);
    if (!slBossEnabled()) return { notActive: true };
    const coop = slCurrentCoop();
    if (coop.status !== 'event_active' || Number(coop.boss_hp) <= 0) return { notActive: true };
    if (st.balance < SL_BOSS_ATTACK_COST) return { poor: true, balance: st.balance };

    db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?').run(SL_BOSS_ATTACK_COST, playerId);
    const newHp = Math.max(0, Number(coop.boss_hp) - SL_BOSS_ATTACK_DAMAGE);
    db.prepare('UPDATE sl_coop SET boss_hp = ? WHERE cycle = ?').run(newHp, coop.cycle);
    db.prepare('INSERT INTO sl_coop_contributions (cycle, player_id, amount) VALUES (?, ?, ?)')
      .run(coop.cycle, playerId, SL_BOSS_ATTACK_DAMAGE);
    slLogActivity(playerId, 'boss_hit', slBossHitEntry(SL_BOSS_ATTACK_DAMAGE, 'monety'));

    let victory = null;
    if (newHp <= 0) {
      const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle);
      victory = slFinishBossEvent(fresh, true);
    }
    return {
      notActive: false, poor: false, boss_name: coop.boss_name,
      damage: SL_BOSS_ATTACK_DAMAGE, hp_left: newHp, max_hp: Number(coop.boss_max_hp), victory
    };
  });

  if (out.notActive) {
    return res.status(400).json({ error: 'Żaden boss aktualnie nie walczy.' });
  }
  if (out.poor) {
    return res.status(400).json({ error: `Za mało monet — atak kosztuje ${SL_BOSS_ATTACK_COST}, masz ${out.balance}.` });
  }

  if (out.victory) {
    slEmit('coop_completed', () => ({
      content: `🏆 **${out.boss_name} pokonany!**`,
      embeds: [{
        title: `Edycja #${out.victory.cycle}`,
        url: SNAKES_URL,
        description: `Ostateczny cios zadał **${nickname}**. Kontrybutorzy dzielą **${out.victory.reward_pool} pkt** + premię za zabicie **${out.victory.bonus} pkt/os.**`,
        color: 0x53D06B
      }]
    }));
  }
  // Uwaga: pojedyncze ataki (jak pojedyncze rzuty) NIE lecą na Discorda — tylko finał
  // eventu (pokonanie / koniec czasu), żeby nie zasypywać kanału.

  res.json({ success: true, damage: out.damage, hp_left: out.hp_left, max_hp: out.max_hp, defeated: !!out.victory, state: slBuildState(playerId) });
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
    boss_enabled: slBossEnabled(),
    // null = boss wyłączony; panel czyta to jako „nie ma czym sterować" (patrz renderInfo).
    coop: slBossEnabled() ? { ...slCoopPayload(null), reward_multiplier: SL_COOP_REWARD_MULTIPLIER } : null
  });
});

// POST /api/snakes/admin/reset { password } — twardy reset CAŁEJ gry Snakes do stanu
// zerowego: każdy gracz wraca na pole 0 z saldem/punktami 0, ekwipunkiem power-upów
// wyczyszczonym i bez oczekujących efektów (Freeze/Curse/Shield/Double Move). Historia
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
      DELETE FROM sl_coop_contributions;
      DELETE FROM sl_coop;
    `);
    // sl_coop pusty → następne wywołanie slCurrentCoop() samo założy świeżą edycję #1,
    // zakotwiczoną od teraz (dokładnie jak przy zupełnie nowej instalacji).
    return { players_affected: playersAffected, coop: slCoopPayload(null) };
  });

  slEmit('coop_completed', () => '🔄 **Admin zresetował grę Snakes & Ladders** — wszyscy wracają na start z zerowym kontem.');

  res.json({ success: true, ...out });
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

// POST /api/snakes/admin/coop/complete { password, force? } — zamknij wydarzenie i wypłać
// nagrody ręcznie. Normalnie robi to sama mechanika bossa (HP=0 przy rzucie/ataku, albo
// timeout w schedulerze) — ten endpoint to głównie fallback na wypadek utkniętego eventu.
// `force: true` domyka event NAWET jeśli boss żyje (bez premii za pokonanie — jak timeout).
app.post('/api/snakes/admin/coop/complete', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const force = !!req.body.force;

  const out = transaction(() => {
    if (!slBossEnabled()) return { notActive: true, status: 'wyłączony' };
    const coop = slCurrentCoop();
    if (coop.status !== 'event_active') return { notActive: true, status: coop.status };

    const outcome = resolveCoopBossEvent(coop);
    if (!outcome.defeated && !force) return { notDefeated: true };

    const result = slFinishBossEvent(coop, outcome.defeated);
    return { notActive: false, ...result };
  });

  if (out.notActive) {
    return res.status(400).json({ error: `Żadne wydarzenie nie trwa (status: ${out.status}).` });
  }
  if (out.notDefeated) {
    return res.status(400).json({ error: 'Boss jeszcze nie pokonany (dodaj force:true, żeby zamknąć mimo to — bez nagrody, jak przy przegranej).' });
  }

  slEmit('coop_completed', () => ({
    content: '🏆 **Wydarzenie co-op ukończone (ręcznie przez admina)!**',
    embeds: [{
      title: `Edycja #${out.cycle} — ${out.boss_name}${out.defeated ? ' pokonany' : ' (event zamknięty bez pokonania)'}`,
      url: SNAKES_URL,
      description: (out.defeated
        ? `Pula nagród: **${out.reward_pool}** pkt${out.bonus ? ` + premia za zabicie **${out.bonus}** pkt/os.` : ''} (podział: ${SL_COOP_REWARD_SPLIT === 'flat' ? 'po równo' : 'proporcjonalnie do wkładu'}).\n\n` +
          out.payouts.map(p => `• **${p.nickname}** — wkład ${p.amount} → nagroda **+${p.reward}** pkt`).join('\n')
        : `Nagrody nie ma, wpłacona kasa przepada. Boss zaatakował — zabrał do **${out.timeout_penalty} monet** każdemu graczowi, kontrybutorom pomniejszone o wkład (${out.players_attacked}).`
      ),
      color: 0xC8F135
    }]
  }));

  res.json({ success: true, ...out });
});

// POST /api/snakes/admin/coop/config { password, threshold?, deadline_at? } — kontrola
// admina nad co-opem/bossem. `threshold` to czysto wewnętrzny suwak trudności (skaluje
// HP i pulę nagród NASTĘPNYCH edycji, patrz slCoopDefaultThreshold) — boss BIEŻĄCEGO
// cyklu ma już HP przyznane przy wybudzeniu, więc to nigdy go nie przeskalowuje z
// mocą wsteczną. `deadline_at` ustawia DOKŁADNY termin (data+godzina, ISO) pokonania
// AKTYWNEGO bossa — działa zawsze w trakcie walki (czyli praktycznie zawsze, bo boss
// walczy w jednej, ciągłej fazie) i może być zmieniany dowolną liczbę razy. Jeśli nowy
// termin już minął, event rozlicza się od razu (tak samo jak scheduler zrobiłby to
// w ciągu minuty) — admin nie czeka na tick.
app.post('/api/snakes/admin/coop/config', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const threshold = req.body.threshold != null ? parseInt(req.body.threshold, 10) : null;
  const deadlineAt = req.body.deadline_at != null ? String(req.body.deadline_at) : null;
  const deadlineMs = deadlineAt != null ? Date.parse(deadlineAt) : null;

  if (threshold != null && (!Number.isInteger(threshold) || threshold <= 0)) {
    return res.status(400).json({ error: 'Próg musi być dodatnią liczbą całkowitą.' });
  }
  if (deadlineAt != null && !Number.isFinite(deadlineMs)) {
    return res.status(400).json({ error: 'Nieprawidłowa data/godzina terminu.' });
  }

  const out = transaction(() => {
    if (!slBossEnabled()) return { notActive: true, status: 'wyłączony' };
    const coop = slCurrentCoop();

    // Walidacja PRZED jakimkolwiek zapisem — żeby błąd na jednym polu nie zostawił
    // drugiego już zacommitowanego (transaction() commituje też przy zwykłym return).
    if (deadlineMs != null && coop.status !== 'event_active') {
      return { notActive: true, cycle: Number(coop.cycle), status: coop.status };
    }

    if (threshold != null) {
      slMetaSet('coop_threshold_override', threshold); // dotyczy tylko przyszłych cykli
    }

    let deadlineChanged = false;
    let resolved = null;
    if (deadlineMs != null) {
      db.prepare(`UPDATE sl_coop SET boss_deadline_at = datetime(?, 'unixepoch') WHERE cycle = ?`)
        .run(Math.floor(deadlineMs / 1000), coop.cycle);
      deadlineChanged = true;
      if (deadlineMs <= Date.now()) {
        const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle);
        resolved = slFinishBossEvent(fresh, Number(fresh.boss_hp) <= 0);
      }
    }

    return {
      notActive: false, cycle: Number(coop.cycle), threshold_changed: threshold != null,
      deadline_changed: deadlineChanged, resolved, coop: slCoopPayload(null)
    };
  });

  if (out.notActive) {
    return res.status(400).json({ error: `Nie ma czego ustawiać — boss nie walczy teraz (status: ${out.status}).` });
  }

  if (out.resolved) slEmitBossTimeout(out.resolved);

  res.json({ success: true, ...out });
});

// POST /api/snakes/admin/coop/boss { password, hp?, max_hp?, name?, damage?, player_id? } —
// ręczne sterowanie AKTYWNYM bossem, gdy trzeba coś podkręcić albo naprawić bez czekania
// na mechanikę. Wszystkie pola są opcjonalne i można je łączyć w jednym strzale:
//   • `max_hp` — nowe maksimum HP (pasek liczy się od niego; bieżące HP przycinamy do niego),
//   • `hp`     — bieżące HP ustawione WPROST (przycinane do 0..max_hp),
//   • `damage` — DELTA: dodatnia zabiera HP, ujemna leczy (nakłada się na `hp`, jeśli oba są),
//   • `player_id` — komu policzyć te obrażenia (dopisuje wkład do podziału nagród, tak samo
//     jak zwykłe trafienie); bez tego pola obrażenia są "od admina" i nikomu się nie liczą,
//   • `name`   — nowa nazwa bossa.
// Jeśli po zmianach HP dobije do zera, event rozlicza się OD RAZU jako wygrana (nagrody
// lecą normalną drogą — patrz slFinishBossEvent — i budzi się kolejny boss).
app.post('/api/snakes/admin/coop/boss', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const hp = req.body.hp != null ? parseInt(req.body.hp, 10) : null;
  const maxHp = req.body.max_hp != null ? parseInt(req.body.max_hp, 10) : null;
  const damage = req.body.damage != null ? parseInt(req.body.damage, 10) : null;
  const playerId = req.body.player_id != null ? parseInt(req.body.player_id, 10) : null;
  const name = req.body.name != null ? String(req.body.name).trim() : null;

  if (hp != null && (!Number.isInteger(hp) || hp < 0)) {
    return res.status(400).json({ error: 'HP musi być liczbą całkowitą ≥ 0.' });
  }
  if (maxHp != null && (!Number.isInteger(maxHp) || maxHp <= 0)) {
    return res.status(400).json({ error: 'Maksymalne HP musi być dodatnią liczbą całkowitą.' });
  }
  if (damage != null && (!Number.isInteger(damage) || damage === 0)) {
    return res.status(400).json({ error: 'Obrażenia muszą być niezerową liczbą całkowitą (ujemne leczą).' });
  }
  if (name != null && (!name || name.length > 60)) {
    return res.status(400).json({ error: 'Nazwa bossa musi mieć od 1 do 60 znaków.' });
  }
  if (playerId != null && !Number.isInteger(playerId)) {
    return res.status(400).json({ error: 'Nieprawidłowy gracz.' });
  }
  if (hp == null && maxHp == null && damage == null && name == null) {
    return res.status(400).json({ error: 'Nie podano żadnej zmiany.' });
  }

  const out = transaction(() => {
    if (!slBossEnabled()) return { notActive: true, status: 'wyłączony' };
    const coop = slCurrentCoop();
    if (coop.status !== 'event_active') return { notActive: true, status: coop.status };

    let player = null;
    if (playerId != null) {
      player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
      if (!player) return { noPlayer: true };
    }

    const nextMaxHp = maxHp != null ? maxHp : Number(coop.boss_max_hp);
    const nextName = name != null ? name : coop.boss_name;
    // Kolejność ma znaczenie: najpierw ewentualne ustawienie HP wprost, dopiero na tym
    // delta obrażeń — dzięki temu „ustaw 500 HP i od razu zbij o 100" działa w jednym strzale.
    let nextHp = hp != null ? hp : Number(coop.boss_hp);
    if (damage != null) nextHp -= damage;
    nextHp = Math.max(0, Math.min(nextMaxHp, nextHp));

    db.prepare('UPDATE sl_coop SET boss_hp = ?, boss_max_hp = ?, boss_name = ? WHERE cycle = ?')
      .run(nextHp, nextMaxHp, nextName, coop.cycle);

    // Wkład gracza dopisujemy tylko przy realnej delcie obrażeń — samo ustawienie HP
    // to korekta stanu bossa, nie czyjeś trafienie, więc nie ma komu jej przypisać.
    if (damage != null && player) {
      db.prepare('INSERT INTO sl_coop_contributions (cycle, player_id, amount) VALUES (?, ?, ?)')
        .run(coop.cycle, player.id, damage);
      slLogActivity(player.id, 'boss_hit', damage > 0
        ? slBossHitEntry(damage, 'admin')
        : `zwrot ${-damage} ${slDamageWord(damage)} (admin)`);
    }

    let resolved = null;
    if (nextHp <= 0) {
      const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle);
      resolved = slFinishBossEvent(fresh, true);
    }

    return {
      notActive: false, cycle: Number(coop.cycle), hp: nextHp, max_hp: nextMaxHp, boss_name: nextName,
      credited_to: player ? player.nickname : null, resolved, coop: slCoopPayload(null)
    };
  });

  if (out.notActive) {
    return res.status(400).json({ error: `Boss nie walczy teraz (status: ${out.status}).` });
  }
  if (out.noPlayer) {
    return res.status(404).json({ error: 'Gracz nie istnieje.' });
  }

  if (out.resolved) slEmitBossTimeout(out.resolved);

  res.json({ success: true, ...out });
});

// POST /api/snakes/admin/coop/toggle { password, enabled } — gasi albo zapala całą walkę
// z bossem (patrz slBossEnabled/slSetBossEnabled). Wyłączenie domyka trwającą walkę BEZ
// nagród i bez kar; włączenie startuje świeżą edycję z nowym bossem i nowym terminem, więc
// nikt nie obrywa za termin, który minął, gdy bossa nie było. Nie rusza punktów graczy —
// od cofania wypłaconych nagród jest osobna, jednorazowa migracja przy starcie serwera.
app.post('/api/snakes/admin/coop/toggle', (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (typeof req.body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'Podaj enabled: true albo false.' });
  }

  const out = slSetBossEnabled(req.body.enabled);

  if (out.enabled) {
    slEmit('coop_milestone', () => ({
      content: '👹 **Boss wraca do gry!**',
      embeds: [{
        title: `Edycja #${out.cycle} — ${out.boss_name}`,
        url: SNAKES_URL,
        description: 'Każdy rzut kostką go rani, a za monety można dobić go ręcznym atakiem.',
        color: 0xF5C842
      }]
    }));
  }

  res.json({
    success: true,
    boss_enabled: out.enabled,
    ...out,
    coop: slCoopPayload(null)
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
    const restore = db.prepare(`
      UPDATE sl_state
      SET abs_pos = ?, laps = ?, total_points = MAX(0, total_points - ?), balance = MAX(0, balance - ?),
          rolls_today = 0, last_move_date = NULL, last_move_at = NULL
      WHERE player_id = ?
    `);

    const details = [];
    for (const m of movers) {
      const startAbs = Number(firstOfDay.get(m.player_id, date).from_abs);
      const pts = Number(m.points);
      restore.run(startAbs, Math.floor(startAbs / SL_BOARD_SIZE), pts, pts, m.player_id);
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

    // Gracze bez ruchów, ale z licznikiem/slotami z tego dnia (np. kupili Double Move
    // i nie zdążyli go zużyć) — też wracają do czystego limitu.
    db.prepare(`UPDATE sl_state SET rolls_today = 0, last_move_date = NULL, last_move_at = NULL WHERE last_move_date = ?`).run(date);
    db.prepare(`UPDATE sl_state SET extra_rolls = 0, extra_rolls_date = NULL WHERE extra_rolls_date = ?`).run(date);

    const moves = db.prepare('DELETE FROM sl_moves WHERE move_date = ?').run(date);
    const activity = db.prepare('DELETE FROM sl_activity WHERE day = ?').run(date);

    return {
      date,
      players: details.length,
      moves_deleted: moves.changes,
      activity_deleted: activity.changes,
      points_removed: details.reduce((a, d) => a + d.points_removed, 0),
      pushed_not_restored: pushedNotRestored,
      details
    };
  });
}

// POST /api/snakes/admin/day/rollback { password, date? } — cofa cały dzień gry do stanu
// z 8:00 (domyślnie dzisiejszy, wg czasu Warszawy). Patrz slRollbackDay po szczegóły tego,
// co wraca, a co zostaje. Nieodwracalne — potwierdzenie leży po stronie panelu.
app.post('/api/snakes/admin/day/rollback', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : todayWaw();
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
  const balance = req.body.balance != null ? parseInt(req.body.balance, 10) : null;
  const totalPoints = req.body.total_points != null ? parseInt(req.body.total_points, 10) : null;

  if (balance != null && (!Number.isInteger(balance) || balance < 0)) {
    return res.status(400).json({ error: 'Saldo musi być liczbą całkowitą ≥ 0.' });
  }
  if (totalPoints != null && (!Number.isInteger(totalPoints) || totalPoints < 0)) {
    return res.status(400).json({ error: 'Punkty muszą być liczbą całkowitą ≥ 0.' });
  }
  if (balance == null && totalPoints == null) {
    return res.status(400).json({ error: 'Nie podano żadnej zmiany.' });
  }

  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  const out = transaction(() => {
    const st = slEnsureState(playerId);
    const nextBalance = balance != null ? balance : Number(st.balance);
    const nextPoints = totalPoints != null ? totalPoints : Number(st.total_points);
    db.prepare('UPDATE sl_state SET balance = ?, total_points = ? WHERE player_id = ?')
      .run(nextBalance, nextPoints, playerId);
    return { balance: nextBalance, total_points: nextPoints };
  });

  res.json({ success: true, nickname: player.nickname, ...out });
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
  console.log(`Snakes: ${SL_DAILY_ROLLS} ruchy dziennie, do wykorzystania ${SL_PLAY_START_HOUR}:00–${SL_PLAY_END_HOUR}:00 (pon–pt, Europe/Warsaw), bez odstępu między ruchami`);
  startDiscordScheduler();
});
