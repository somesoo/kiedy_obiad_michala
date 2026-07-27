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
    hint TEXT,
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

// ── SEED HASEŁ ──
// Hasła wczytujemy z slowa.json (jeśli istnieje), zamieniamy polskie znaki na ASCII
// i TASUJEMY — order_index przydzielany losowo, więc hasła dnia lecą w losowej kolejności.
const FALLBACK_WORDS = [
  { word: 'KAWA', hint: 'Poranny rytuał w kuchni' },
  { word: 'BIURO', hint: 'Tu spędzasz 8 godzin dziennie' },
  { word: 'LAPTOP', hint: 'Twoje główne narzędzie pracy' },
  { word: 'PROJEKT', hint: 'Deadline już goni' },
  { word: 'ZEBRANIE', hint: 'Mogło być mailem' }
];

function loadSeedWords() {
  const file = path.join(__dirname, 'slowa.json');
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const words = raw
        .map(w => ({ word: toAsciiUpper(w.word).replace(/[^A-Z]/g, ''), hint: w.hint || null }))
        .filter(w => w.word.length >= 3);
      if (words.length) return words;
    } catch (e) {
      console.error('Nie udało się wczytać slowa.json:', e.message);
    }
  }
  return FALLBACK_WORDS.map(w => ({ word: toAsciiUpper(w.word), hint: w.hint }));
}

const seedCount = db.prepare('SELECT COUNT(*) AS c FROM words').get().c;
if (seedCount === 0) {
  const insertWord = db.prepare('INSERT INTO words (word, hint, order_index) VALUES (?, ?, ?)');
  shuffle(loadSeedWords()).forEach((w, i) => insertWord.run(w.word, w.hint, i + 1));
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

// Poprzedni dzień roboczy przed dateStr (pon → poprzedni pt)
function previousBusinessDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  do { t -= 86400000; } while ([0, 6].includes(new Date(t).getUTCDay()));
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
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
    has_word_today: hasWord
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
    hint: word.hint,
    guesses: rows,
    attempts_used: guessList.length,
    status,
    keyboard: keyboardStatuses(guessList, word.word),
    points_today: game ? game.points : 0,
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
        points = base + lengthBonus + streakBonus;
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
        UPDATE games SET guesses = ?, status = ?, attempts_used = ?, points = ?, finished_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(guesses), status, attemptsUsed, points, game.id);
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
    SELECT g.status, g.attempts_used, g.points, p.id AS player_id, p.nickname
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
    is_me: highlightId ? r.player_id === highlightId : false
  }));

  const inProgress = db.prepare(`
    SELECT COUNT(*) AS c FROM games WHERE word_index = ? AND status = 'in_progress'
  `).get(word.order_index).c;

  res.json({ day_number: day, has_word: true, entries, total: entries.length, in_progress: Number(inProgress) });
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

// GET /api/admin/words — lista haseł + status sezonu
app.get('/api/admin/words', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const words = db.prepare('SELECT * FROM words ORDER BY order_index ASC').all();
  const idx = currentPuzzleIndex();
  const pastThreshold = idx !== null ? idx : supplyIndex() + 1;
  const withStatus = words.map(w => {
    const played = db.prepare('SELECT COUNT(*) AS c FROM games WHERE word_id = ?').get(w.id).c;
    return {
      ...w,
      length: w.word.length,
      max_attempts: maxAttemptsFor(w.word.length),
      is_current: idx !== null && w.order_index === idx,
      is_past: w.order_index < pastThreshold,
      games_played: Number(played)
    };
  });
  res.json({ words: withStatus, season: seasonInfo(), word_start: WORD_START });
});

// POST /api/admin/word — dodaj lub zaktualizuj hasło { id?, word, hint, order_index }
app.post('/api/admin/word', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { id } = req.body;
  const word = toAsciiUpper(String(req.body.word || '').trim());
  const hint = String(req.body.hint || '').trim() || null;
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
      db.prepare('UPDATE words SET word = ?, hint = ?, order_index = ? WHERE id = ?')
        .run(word, hint, orderIndex, id);
    } else {
      db.prepare('INSERT INTO words (word, hint, order_index) VALUES (?, ?, ?)')
        .run(word, hint, orderIndex);
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

app.listen(PORT, () => {
  console.log(`Office Wordle — Serwer na http://localhost:${PORT}`);
});
