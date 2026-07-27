require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123michal';

// Pierwszy dzień sezonu (hasło o order_index = 1 gra w tym dniu, kolejne w kolejnych dniach).
// Numer dnia liczymy jako liczbę dni od SEASON_START w strefie Europe/Warsaw + 1.
const SEASON_START = process.env.WORDLE_SEASON_START || '2026-07-27';

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

// Numer dnia sezonu (1-based): ile pełnych dni minęło od SEASON_START + 1.
// Liczymy na "północach UTC" dat kalendarzowych, więc DST nie przesuwa wyniku.
function seasonDayNumber() {
  const today = todayWaw();
  const start = Date.UTC(...SEASON_START.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  const now = Date.UTC(...today.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  return Math.floor((now - start) / 86400000) + 1;
}

// Hasło na dziś = to o order_index równym numerowi dnia sezonu
function currentWord() {
  const day = seasonDayNumber();
  if (day < 1) return null;
  return db.prepare('SELECT * FROM words WHERE order_index = ?').get(day) || null;
}

function remainingWordsCount() {
  const day = seasonDayNumber();
  return db.prepare('SELECT COUNT(*) AS c FROM words WHERE order_index > ?').get(day).c;
}

function seasonInfo() {
  const day = seasonDayNumber();
  const maxIndex = db.prepare('SELECT MAX(order_index) AS m FROM words').get().m || 0;
  const word = currentWord();
  return {
    day_number: day,
    remaining_words: remainingWordsCount(),
    total_words: db.prepare('SELECT COUNT(*) AS c FROM words').get().c,
    max_index: maxIndex,
    season_over: day > maxIndex && maxIndex > 0,
    has_word_today: !!word
  };
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

  const base = {
    day_number: info.day_number,
    remaining_words: info.remaining_words,
    total_words: info.total_words,
    season_over: info.season_over,
    stats: {
      current_streak: player.current_streak,
      best_streak: player.best_streak,
      total_points: player.total_points
    }
  };

  if (!word) {
    return { ...base, has_word: false };
  }

  const maxAttempts = maxAttemptsFor(word.word.length);
  const game = db.prepare(
    'SELECT * FROM games WHERE player_id = ? AND word_id = ?'
  ).get(player.id, word.id);

  const guessList = game ? JSON.parse(game.guesses) : [];
  const rows = guessList.map(g => ({
    guess: g,
    statuses: evaluateGuess(g, word.word)
  }));
  const status = game ? game.status : 'not_started';
  const finished = status === 'won' || status === 'lost';

  return {
    ...base,
    has_word: true,
    word_length: word.word.length,
    max_attempts: maxAttempts,
    hint: word.hint,
    guesses: rows,
    attempts_used: guessList.length,
    status,
    keyboard: keyboardStatuses(guessList, word.word),
    points_today: game ? game.points : 0,
    answer: finished ? word.word : null
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
  res.json({
    id: player.id,
    nickname: player.nickname,
    current_streak: player.current_streak,
    best_streak: player.best_streak,
    total_points: player.total_points
  });
});

// GET /api/wordle/today — stan dzisiejszej rozgrywki gracza
app.get('/api/wordle/today', authPlayer, (req, res) => {
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.id);
  res.json(buildGameState(player));
});

// POST /api/wordle/guess — dopisz próbę { guess }
app.post('/api/wordle/guess', authPlayer, (req, res) => {
  const word = currentWord();
  if (!word) return res.status(400).json({ error: 'Dziś nie ma hasła — sezon zakończony lub jeszcze się nie zaczął' });

  const answer = word.word;
  const maxAttempts = maxAttemptsFor(answer.length);
  const guess = String(req.body.guess || '').trim().toUpperCase();

  if (guess.length !== answer.length) {
    return res.status(400).json({ error: `Hasło ma ${answer.length} liter` });
  }
  if (!/^[A-Z]+$/.test(guess)) {
    return res.status(400).json({ error: 'Dozwolone są tylko litery A–Z' });
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

    if (won || lost) {
      status = won ? 'won' : 'lost';

      let newStreak;
      if (won) {
        newStreak = (player.last_word_index === word.order_index - 1)
          ? player.current_streak + 1
          : 1;
        const base = (maxAttempts - attemptsUsed + 1) * POINTS_PER_ATTEMPT_STEP;
        const lengthBonus = LENGTH_BONUS_PER_LETTER * answer.length;
        const streakBonus = Math.min(newStreak * STREAK_BONUS_PER_DAY, STREAK_BONUS_CAP);
        points = base + lengthBonus + streakBonus;
      } else {
        newStreak = 0;
      }

      const bestStreak = Math.max(player.best_streak, newStreak);
      db.prepare(`
        UPDATE players
        SET current_streak = ?, best_streak = ?, last_word_index = ?,
            total_points = total_points + ?, total_wins = total_wins + ?
        WHERE id = ?
      `).run(newStreak, bestStreak, word.order_index, points, won ? 1 : 0, player.id);

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

// GET /api/leaderboard?period=all|week|month
app.get('/api/leaderboard', (req, res) => {
  const highlightId = parseInt(req.query.highlight, 10) || null;
  const period = ['all', 'week', 'month'].includes(req.query.period) ? req.query.period : 'all';

  let dateFilter = '';
  if (period === 'week') {
    // Ostatnie 7 dni (włącznie z dziś), po played_on (data w Warszawie)
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 6);
    const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    dateFilter = `AND g.played_on >= '${from}'`;
  } else if (period === 'month') {
    const p = warsawParts();
    dateFilter = `AND g.played_on >= '${p.y}-${p.mo}-01'`;
  }

  const rows = db.prepare(`
    SELECT
      p.id, p.nickname, p.current_streak,
      COALESCE(SUM(g.points), 0) AS points,
      COUNT(g.id) AS games_played,
      SUM(CASE WHEN g.status = 'won' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN g.status = 'won' THEN g.attempts_used ELSE 0 END) AS won_attempts
    FROM players p
    LEFT JOIN games g ON g.player_id = p.id ${dateFilter}
    GROUP BY p.id
    HAVING games_played > 0 OR ? = 'all'
    ORDER BY points DESC, wins DESC, games_played ASC
  `).all(period);

  const list = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    nickname: r.nickname,
    total_points: Number(r.points),
    streak: r.current_streak,
    games_played: Number(r.games_played),
    wins: Number(r.wins),
    avg_attempts: r.wins > 0 ? Math.round((Number(r.won_attempts) / Number(r.wins)) * 10) / 10 : null,
    is_me: highlightId ? r.id === highlightId : false
  }));

  res.json({ leaderboard: list, total_players: list.length, period });
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
  const day = seasonDayNumber();
  const withStatus = words.map(w => {
    const played = db.prepare('SELECT COUNT(*) AS c FROM games WHERE word_id = ?').get(w.id).c;
    return {
      ...w,
      length: w.word.length,
      max_attempts: maxAttemptsFor(w.word.length),
      is_current: w.order_index === day,
      is_past: w.order_index < day,
      games_played: Number(played)
    };
  });
  res.json({ words: withStatus, season: seasonInfo(), season_start: SEASON_START });
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
