require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123michal';

const STARTING_BALANCE = 1000;
const MIN_BET = 10;
const WELFARE_AMOUNT = 150;
const ODDS_REF_STAKE = 50; // referencyjna stawka do wyliczania kursów na kartach meczów (= domyślna stawka w UI)
const BANK_SEED = 100; // bonus z banku dokładany do puli każdego rynku — wypłacany tylko, gdy ktoś trafił

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'michal.db'));

// Jeśli baza jeszcze nie ma tabeli "matches" — to stara baza z gry "obiad Michała".
// Mundial to nowy rozdział, więc czyścimy stare tabele przed zbudowaniem nowego schematu.
const hasMatchesTable = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' AND name='matches'`
).get();
if (!hasMatchesTable) {
  db.exec(`
    DROP TABLE IF EXISTS bets;
    DROP TABLE IF EXISTS results;
    DROP TABLE IF EXISTS players;
    DROP TABLE IF EXISTS bank;
  `);
}

// Inicjalizacja schematu bazy
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    balance INTEGER DEFAULT ${STARTING_BALANCE},
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round TEXT NOT NULL,
    position INTEGER NOT NULL,
    team_a TEXT,
    team_b TEXT,
    placeholder_a TEXT,
    placeholder_b TEXT,
    kickoff_at TEXT NOT NULL,
    score_a INTEGER,
    score_b INTEGER,
    winner TEXT,
    finished INTEGER DEFAULT 0,
    UNIQUE(round, position)
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id),
    match_id INTEGER REFERENCES matches(id),
    bet_type TEXT NOT NULL,
    guess_score_a INTEGER,
    guess_score_b INTEGER,
    guess_winner TEXT,
    amount INTEGER NOT NULL,
    payout INTEGER,
    placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, match_id, bet_type)
  );

  CREATE TABLE IF NOT EXISTS bank (
    id INTEGER PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bet_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id),
    match_id INTEGER REFERENCES matches(id),
    bet_type TEXT NOT NULL,
    withdrawn_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, match_id, bet_type)
  );

  INSERT OR IGNORE INTO bank VALUES (1, 0, CURRENT_TIMESTAMP);
`);

// Drabinka mundialu — sloty czasowe w strefie Europe/Warsaw ("YYYY-MM-DDTHH:MM")
const FIXTURES = [
  { round: '1/8 finału', position: 1, team_a: 'Argentyna', team_b: 'Egipt', kickoff_at: '2026-07-07T18:00' },
  { round: '1/8 finału', position: 2, team_a: 'Szwajcaria', team_b: 'Kolumbia', kickoff_at: '2026-07-07T22:00' },
  { round: 'Ćwierćfinał', position: 1, team_a: 'Francja', team_b: 'Maroko', kickoff_at: '2026-07-09T22:00' },
  { round: 'Ćwierćfinał', position: 2, team_a: 'Hiszpania', team_b: 'Belgia', kickoff_at: '2026-07-10T21:00' },
  { round: 'Ćwierćfinał', position: 3, team_a: 'Norwegia', team_b: 'Anglia', kickoff_at: '2026-07-11T23:00' },
  { round: 'Ćwierćfinał', position: 4, placeholder_a: 'Argentyna / Egipt', placeholder_b: 'Szwajcaria / Kolumbia', kickoff_at: '2026-07-12T03:00' },
  { round: 'Półfinał', position: 1, placeholder_a: 'Francja / Maroko', placeholder_b: 'Hiszpania / Belgia', kickoff_at: '2026-07-14T21:00' },
  { round: 'Półfinał', position: 2, placeholder_a: 'Norwegia / Anglia', placeholder_b: 'Argentyna/Egipt/Szwajcaria/Kolumbia', kickoff_at: '2026-07-15T21:00' },
  { round: 'Mecz o 3. miejsce', position: 1, placeholder_a: 'Przegrany półfinału 1', placeholder_b: 'Przegrany półfinału 2', kickoff_at: '2026-07-18T23:00' },
  { round: 'Finał', position: 1, placeholder_a: 'Zwycięzca półfinału 1', placeholder_b: 'Zwycięzca półfinału 2', kickoff_at: '2026-07-19T21:00' }
];

const insertFixture = db.prepare(`
  INSERT OR IGNORE INTO matches (round, position, team_a, team_b, placeholder_a, placeholder_b, kickoff_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
FIXTURES.forEach(f => {
  insertFixture.run(
    f.round, f.position,
    f.team_a || null, f.team_b || null,
    f.placeholder_a || null, f.placeholder_b || null,
    f.kickoff_at
  );
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rozbij "teraz" na składowe daty/czasu w strefie Warsaw przez formatToParts —
// w przeciwieństwie do toLocaleString(), nie zależy od tego, czy silnik ICU zna
// dany locale (np. sv-SE) — na buildach Node z okrojonym ICU toLocaleString('sv-SE', ...)
// po cichu wraca do formatu en-US, co psuje porównania stringów.
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

// Aktualny czas w Warsaw jako "YYYY-MM-DDTHH:MM" — porównywalny leksykograficznie z kickoff_at
function nowWawStr() {
  const p = warsawParts();
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
}

function nowTimeWaw() {
  const p = warsawParts();
  return `${p.h}:${p.mi}`;
}

// Mecz można obstawiać tylko gdy obie drużyny są znane, mecz się jeszcze nie zaczął i nie jest rozliczony
function isMatchAvailable(match) {
  return !!(match.team_a && match.team_b) && !match.finished && nowWawStr() < match.kickoff_at;
}

function matchLockReason(match) {
  if (!match.team_a || !match.team_b) return 'Drużyny jeszcze nieznane — poczekaj, aż admin je uzupełni';
  if (match.finished) return 'Mecz już rozliczony';
  if (nowWawStr() >= match.kickoff_at) return 'Zakłady na ten mecz są zamknięte — mecz się zaczął';
  return 'Zakłady na ten mecz są niedostępne';
}

// Wrapper transakcji
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

// Middleware autoryzacji gracza
function authPlayer(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });
  const player = db.prepare('SELECT * FROM players WHERE token = ?').get(token);
  if (!player) return res.status(401).json({ error: 'Nieznany token' });
  db.prepare('UPDATE players SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);
  req.player = player;
  next();
}

// Welfare — jeśli saldo gracza = 0 i nie ma już żadnych oczekujących zakładów, daj zastrzyk z banku.
// Dopóki gracz ma zakłady na nierozliczonych meczach, jego pieniądze są wciąż w grze —
// zapomoga należy się dopiero, gdy po rozliczeniu wszystkiego nadal jest spłukany.
function checkAndApplyWelfare(playerId) {
  const player = db.prepare('SELECT balance FROM players WHERE id = ?').get(playerId);
  if (player.balance > 0) return null;

  const pending = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM bets b
    JOIN matches m ON m.id = b.match_id
    WHERE b.player_id = ? AND m.finished = 0
  `).get(playerId);
  if (pending.cnt > 0) return null;

  db.prepare('UPDATE players SET balance = balance + ? WHERE id = ?').run(WELFARE_AMOUNT, playerId);
  db.prepare('UPDATE bank SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(WELFARE_AMOUNT);
  return WELFARE_AMOUNT;
}

// System parimutuel — pula wspólna dzielona proporcjonalnie między trafionych, z minimalnym
// zwrotem stawki. Bank dokłada do puli trafionych bonus (seed) — wypłacany tylko, gdy ktoś trafił.
// bankCut = ile bank zabiera z rynku netto (ujemne = bank dopłaca, bo seed przewyższył prowizję).
function settleMarket(bets, isWinner, seed = 0) {
  const totalPool = bets.reduce((s, b) => s + Number(b.amount), 0);
  const winners = bets.filter(isWinner);

  if (winners.length === 0) {
    return { totalPool, winnersPool: 0, bankCut: totalPool, payouts: [], winnersCount: 0 };
  }

  const winnersPool = Math.floor(totalPool * 0.9) + seed;
  const winnersSum = winners.reduce((s, b) => s + Number(b.amount), 0);

  const payouts = winners.map(b => {
    const raw = winnersSum > 0 ? Math.floor((Number(b.amount) / winnersSum) * winnersPool) : 0;
    const payout = Math.max(raw, Number(b.amount));
    return { player_id: b.player_id, bet_id: b.id, amount: Number(b.amount), payout };
  });

  const actualWinnersPool = payouts.reduce((s, p) => s + p.payout, 0);
  const bankCut = totalPool - actualWinnersPool;

  return { totalPool, winnersPool, bankCut, payouts, winnersCount: winners.length };
}

// Kurs "na żywo" dla rynku zwycięzcy — symuluje dołożenie hipotetycznej stawki do puli
// i liczy wypłatę tą samą matematyką co settleMarket. W parimutuel kurs zmienia się
// z każdym nowym zakładem, więc to estymacja stanu obecnego, nie gwarancja.
function quoteWinner(matchId, side, stake) {
  const bets = db.prepare(`SELECT * FROM bets WHERE match_id = ? AND bet_type = 'winner'`).all(matchId);
  const totalPool = bets.reduce((s, b) => s + Number(b.amount), 0) + stake;
  const sidePool = bets.filter(b => b.guess_winner === side).reduce((s, b) => s + Number(b.amount), 0) + stake;
  const winnersPool = Math.floor(totalPool * 0.9) + BANK_SEED;
  const payout = Math.max(Math.floor((stake / sidePool) * winnersPool), stake);
  return { payout, multiplier: Math.round((payout / stake) * 100) / 100 };
}

// ──────────────────────────────────────────────
// ENDPOINTS — GRACZE
// ──────────────────────────────────────────────

// POST /api/register
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
      'INSERT INTO players (nickname, token, balance) VALUES (?, ?, ?)'
    ).run(nickname.trim(), token, STARTING_BALANCE);
    res.json({ player_id: Number(result.lastInsertRowid), token, new: true });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ten nick jest zajęty, wymyśl coś lepszego' });
    }
    throw e;
  }
});

// GET /api/me
app.get('/api/me', authPlayer, (req, res) => {
  const { player } = req;

  const rank = db.prepare(
    'SELECT COUNT(*) as cnt FROM players WHERE balance > ?'
  ).get(player.balance);

  const history = db.prepare(`
    SELECT b.id, b.bet_type, b.guess_score_a, b.guess_score_b, b.guess_winner, b.amount, b.payout, b.placed_at,
           m.round, m.team_a, m.team_b, m.score_a, m.score_b, m.winner, m.finished, m.kickoff_at
    FROM bets b
    JOIN matches m ON m.id = b.match_id
    WHERE b.player_id = ?
    ORDER BY m.kickoff_at DESC
  `).all(player.id);

  res.json({
    id: player.id,
    nickname: player.nickname,
    balance: player.balance,
    current_streak: player.current_streak,
    best_streak: player.best_streak,
    total_wins: player.total_wins,
    rank: Number(rank.cnt) + 1,
    history,
    welfare_received: null
  });
});

// GET /api/matches — publiczna lista meczów (tryb ślepy dopóki mecz nierozliczony)
app.get('/api/matches', (req, res) => {
  const token = req.headers['x-token'];
  const player = token ? db.prepare('SELECT id FROM players WHERE token = ?').get(token) : null;

  const matches = db.prepare('SELECT * FROM matches ORDER BY kickoff_at ASC').all();

  const result = matches.map(m => {
    const scoreBets = db.prepare(`SELECT * FROM bets WHERE match_id = ? AND bet_type = 'score'`).all(m.id);
    const winnerBets = db.prepare(`SELECT * FROM bets WHERE match_id = ? AND bet_type = 'winner'`).all(m.id);
    const available = isMatchAvailable(m);

    const scorePool = scoreBets.reduce((s, b) => s + Number(b.amount), 0);
    const winnerAPool = winnerBets.filter(b => b.guess_winner === 'A').reduce((s, b) => s + Number(b.amount), 0);
    const winnerBPool = winnerBets.filter(b => b.guess_winner === 'B').reduce((s, b) => s + Number(b.amount), 0);
    const winnerPool = winnerAPool + winnerBPool;

    const myScoreBet = player ? scoreBets.find(b => b.player_id === player.id) : null;
    const myWinnerBet = player ? winnerBets.find(b => b.player_id === player.id) : null;

    const withdrawUsed = type => !!(player && db.prepare(
      'SELECT id FROM bet_withdrawals WHERE player_id = ? AND match_id = ? AND bet_type = ?'
    ).get(player.id, m.id, type));

    // Ile mój postawiony zakład wypłaciłby przy obecnym stanie puli, gdyby mój typ trafił
    const potentialPayout = (bets, myBet, isWinner) => {
      if (!myBet || m.finished) return null;
      const p = settleMarket(bets, isWinner, BANK_SEED).payouts.find(x => x.bet_id === myBet.id);
      return p ? p.payout : null;
    };

    return {
      id: m.id,
      round: m.round,
      team_a: m.team_a,
      team_b: m.team_b,
      placeholder_a: m.placeholder_a,
      placeholder_b: m.placeholder_b,
      kickoff_at: m.kickoff_at,
      available,
      finished: !!m.finished,
      score_a: m.finished ? m.score_a : null,
      score_b: m.finished ? m.score_b : null,
      winner: m.finished ? m.winner : null,
      score_market: {
        count: scoreBets.length,
        total: scorePool,
        bank_seed: m.finished ? null : BANK_SEED
      },
      winner_market: {
        count: winnerBets.length,
        total_a: winnerAPool,
        total_b: winnerBPool,
        bank_seed: m.finished ? null : BANK_SEED,
        odds_a: available ? quoteWinner(m.id, 'A', ODDS_REF_STAKE).multiplier : null,
        odds_b: available ? quoteWinner(m.id, 'B', ODDS_REF_STAKE).multiplier : null,
        share_a: !m.finished && winnerPool > 0 ? Math.round((winnerAPool / winnerPool) * 100) : null
      },
      my_score_bet: myScoreBet
        ? { id: myScoreBet.id, guess_score_a: myScoreBet.guess_score_a, guess_score_b: myScoreBet.guess_score_b, amount: myScoreBet.amount, payout: myScoreBet.payout, withdraw_used: withdrawUsed('score'),
            potential_payout: potentialPayout(scoreBets, myScoreBet, b => b.guess_score_a === myScoreBet.guess_score_a && b.guess_score_b === myScoreBet.guess_score_b) }
        : null,
      my_winner_bet: myWinnerBet
        ? { id: myWinnerBet.id, guess_winner: myWinnerBet.guess_winner, amount: myWinnerBet.amount, payout: myWinnerBet.payout, withdraw_used: withdrawUsed('winner'),
            potential_payout: potentialPayout(winnerBets, myWinnerBet, b => b.guess_winner === myWinnerBet.guess_winner) }
        : null
    };
  });

  res.json({ matches: result, server_time: nowTimeWaw() });
});

// GET /api/quote/winner — podgląd możliwej wygranej dla wpisywanej stawki (kurs na żywo)
app.get('/api/quote/winner', (req, res) => {
  const matchId = parseInt(req.query.match_id, 10);
  const side = req.query.side;
  const amount = parseInt(req.query.amount, 10);

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(400).json({ error: 'Mecz nie istnieje' });
  if (!isMatchAvailable(match)) return res.status(400).json({ error: matchLockReason(match) });
  if (side !== 'A' && side !== 'B') return res.status(400).json({ error: 'Wybierz drużynę A albo B' });
  if (!Number.isInteger(amount) || amount < MIN_BET) {
    return res.status(400).json({ error: `Minimalna stawka to ${MIN_BET} coins` });
  }

  const q = quoteWinner(matchId, side, amount);
  res.json({ potential_payout: q.payout, multiplier: q.multiplier });
});

// POST /api/bet/score
app.post('/api/bet/score', authPlayer, (req, res) => {
  const { match_id, guess_score_a, guess_score_b, amount } = req.body;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
  if (!match) return res.status(400).json({ error: 'Mecz nie istnieje' });
  if (!isMatchAvailable(match)) return res.status(400).json({ error: matchLockReason(match) });

  const a = parseInt(guess_score_a, 10);
  const b = parseInt(guess_score_b, 10);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 20 || b > 20) {
    return res.status(400).json({ error: 'Podaj sensowny wynik (0-20)' });
  }

  const amountInt = parseInt(amount, 10);
  if (!amountInt || amountInt < MIN_BET) {
    return res.status(400).json({ error: `Minimalna stawka to ${MIN_BET} coins` });
  }

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.id);
  if (amountInt > player.balance) {
    return res.status(400).json({ error: `Za mało coins. Obecne saldo: ${player.balance}` });
  }

  const existing = db.prepare(
    `SELECT id FROM bets WHERE player_id = ? AND match_id = ? AND bet_type = 'score'`
  ).get(player.id, match.id);
  if (existing) return res.status(400).json({ error: 'Zakład na wynik tego meczu już postawiony' });

  transaction(() => {
    db.prepare(`
      INSERT INTO bets (player_id, match_id, bet_type, guess_score_a, guess_score_b, amount)
      VALUES (?, ?, 'score', ?, ?, ?)
    `).run(player.id, match.id, a, b, amountInt);
    db.prepare('UPDATE players SET balance = balance - ? WHERE id = ?').run(amountInt, player.id);
  });

  const fresh = db.prepare('SELECT balance FROM players WHERE id = ?').get(player.id);
  res.json({ success: true, new_balance: fresh.balance });
});

// POST /api/bet/winner
app.post('/api/bet/winner', authPlayer, (req, res) => {
  const { match_id, guess_winner, amount } = req.body;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
  if (!match) return res.status(400).json({ error: 'Mecz nie istnieje' });
  if (!isMatchAvailable(match)) return res.status(400).json({ error: matchLockReason(match) });

  if (guess_winner !== 'A' && guess_winner !== 'B') {
    return res.status(400).json({ error: 'Wybierz drużynę A albo B' });
  }

  const amountInt = parseInt(amount, 10);
  if (!amountInt || amountInt < MIN_BET) {
    return res.status(400).json({ error: `Minimalna stawka to ${MIN_BET} coins` });
  }

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.id);
  if (amountInt > player.balance) {
    return res.status(400).json({ error: `Za mało coins. Obecne saldo: ${player.balance}` });
  }

  const existing = db.prepare(
    `SELECT id FROM bets WHERE player_id = ? AND match_id = ? AND bet_type = 'winner'`
  ).get(player.id, match.id);
  if (existing) return res.status(400).json({ error: 'Zakład na zwycięzcę tego meczu już postawiony' });

  transaction(() => {
    db.prepare(`
      INSERT INTO bets (player_id, match_id, bet_type, guess_winner, amount)
      VALUES (?, ?, 'winner', ?, ?)
    `).run(player.id, match.id, guess_winner, amountInt);
    db.prepare('UPDATE players SET balance = balance - ? WHERE id = ?').run(amountInt, player.id);
  });

  const fresh = db.prepare('SELECT balance FROM players WHERE id = ?').get(player.id);
  res.json({ success: true, new_balance: fresh.balance });
});

// DELETE /api/bet/:id — wycofaj własny zakład, dopóki okno betowania jest otwarte
app.delete('/api/bet/:id', authPlayer, (req, res) => {
  const betId = parseInt(req.params.id, 10);
  const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);
  if (!bet) return res.status(404).json({ error: 'Zakład nie istnieje' });
  if (bet.player_id !== req.player.id) return res.status(403).json({ error: 'To nie jest Twój zakład' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(bet.match_id);
  if (!isMatchAvailable(match)) return res.status(400).json({ error: matchLockReason(match) });

  const alreadyWithdrawn = db.prepare(
    'SELECT id FROM bet_withdrawals WHERE player_id = ? AND match_id = ? AND bet_type = ?'
  ).get(bet.player_id, bet.match_id, bet.bet_type);
  if (alreadyWithdrawn) {
    return res.status(400).json({ error: 'Zakład na ten rynek możesz wycofać tylko raz' });
  }

  transaction(() => {
    db.prepare('DELETE FROM bets WHERE id = ?').run(bet.id);
    db.prepare('UPDATE players SET balance = balance + ? WHERE id = ?').run(bet.amount, bet.player_id);
    db.prepare(
      'INSERT INTO bet_withdrawals (player_id, match_id, bet_type) VALUES (?, ?, ?)'
    ).run(bet.player_id, bet.match_id, bet.bet_type);
  });

  const fresh = db.prepare('SELECT balance FROM players WHERE id = ?').get(bet.player_id);
  res.json({ success: true, new_balance: fresh.balance });
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  const highlightId = parseInt(req.query.highlight, 10) || null;

  const allPlayers = db.prepare(`
    SELECT id, nickname, balance, current_streak, best_streak, total_wins
    FROM players
    ORDER BY balance DESC, total_wins DESC
  `).all();

  const totalPlayers = allPlayers.length;

  const list = allPlayers.map((p, i) => ({
    rank: i + 1,
    id: p.id,
    nickname: p.nickname,
    balance: p.balance,
    streak: p.current_streak,
    best_streak: p.best_streak,
    total_wins: p.total_wins,
    is_me: highlightId ? p.id === highlightId : false
  }));

  res.json({ leaderboard: list, total_players: Number(totalPlayers) });
});

// GET /api/bank
app.get('/api/bank', (req, res) => {
  const bank = db.prepare('SELECT balance FROM bank WHERE id = 1').get();
  res.json({ balance: bank.balance });
});

// ──────────────────────────────────────────────
// ENDPOINTS — ADMIN
// ──────────────────────────────────────────────

// GET /api/admin/matches — pełny widok meczów + zakładów do panelu admina
app.get('/api/admin/matches', (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Złe hasło' });

  const matches = db.prepare('SELECT * FROM matches ORDER BY kickoff_at ASC').all();
  const result = matches.map(m => {
    const scoreBets = db.prepare(`
      SELECT b.*, p.nickname FROM bets b JOIN players p ON p.id = b.player_id
      WHERE match_id = ? AND bet_type = 'score' ORDER BY b.placed_at
    `).all(m.id);
    const winnerBets = db.prepare(`
      SELECT b.*, p.nickname FROM bets b JOIN players p ON p.id = b.player_id
      WHERE match_id = ? AND bet_type = 'winner' ORDER BY b.placed_at
    `).all(m.id);
    return { ...m, finished: !!m.finished, available: isMatchAvailable(m), score_bets: scoreBets, winner_bets: winnerBets };
  });

  res.json({ matches: result, server_time: nowWawStr() });
});

// POST /api/admin/match/:id/teams — uzupełnij/zmień drużyny w kolejnych rundach drabinki
app.post('/api/admin/match/:id/teams', (req, res) => {
  const { password, team_a, team_b } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Złe hasło' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Mecz nie istnieje' });
  if (match.finished) return res.status(400).json({ error: 'Mecz już rozliczony — nie można zmienić drużyn' });

  const a = (team_a || '').trim() || null;
  const b = (team_b || '').trim() || null;
  db.prepare('UPDATE matches SET team_a = ?, team_b = ? WHERE id = ?').run(a, b, match.id);

  res.json({ success: true });
});

// POST /api/admin/match/:id/result — wpisz wynik meczu { score_a, score_b, winner, password, preview }
app.post('/api/admin/match/:id/result', (req, res) => {
  const { password, score_a, score_b, winner, preview } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Złe hasło' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Mecz nie istnieje' });
  if (!match.team_a || !match.team_b) return res.status(400).json({ error: 'Uzupełnij najpierw obie drużyny' });
  if (match.finished && !preview) return res.status(400).json({ error: 'Wynik już wpisany dla tego meczu' });

  const scoreA = parseInt(score_a, 10);
  const scoreB = parseInt(score_b, 10);
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return res.status(400).json({ error: 'Podaj poprawny wynik meczu' });
  }
  if (winner !== 'A' && winner !== 'B') {
    return res.status(400).json({ error: 'Wskaż, kto ostatecznie awansuje/wygrywa (np. po karnych)' });
  }

  const scoreBets = db.prepare(`SELECT * FROM bets WHERE match_id = ? AND bet_type = 'score'`).all(match.id);
  const winnerBets = db.prepare(`SELECT * FROM bets WHERE match_id = ? AND bet_type = 'winner'`).all(match.id);

  const scoreRes = settleMarket(scoreBets, b => b.guess_score_a === scoreA && b.guess_score_b === scoreB, BANK_SEED);
  const winnerRes = settleMarket(winnerBets, b => b.guess_winner === winner, BANK_SEED);
  const bankTotal = scoreRes.bankCut + winnerRes.bankCut;

  const withNick = payouts => payouts.map(p => {
    const pl = db.prepare('SELECT nickname FROM players WHERE id = ?').get(p.player_id);
    return { nickname: pl?.nickname, bet: p.amount, payout: p.payout };
  });

  if (preview) {
    return res.json({
      preview: true,
      team_a: match.team_a,
      team_b: match.team_b,
      score_a: scoreA,
      score_b: scoreB,
      winner,
      score_market: {
        total_pool: scoreRes.totalPool,
        winners_pool: scoreRes.winnersPool,
        winners_count: scoreRes.winnersCount,
        bank_cut: scoreRes.bankCut,
        payouts: withNick(scoreRes.payouts)
      },
      winner_market: {
        total_pool: winnerRes.totalPool,
        winners_pool: winnerRes.winnersPool,
        winners_count: winnerRes.winnersCount,
        bank_cut: winnerRes.bankCut,
        payouts: withNick(winnerRes.payouts)
      },
      bank_total: bankTotal
    });
  }

  transaction(() => {
    db.prepare('UPDATE matches SET score_a = ?, score_b = ?, winner = ?, finished = 1 WHERE id = ?')
      .run(scoreA, scoreB, winner, match.id);

    [...scoreRes.payouts, ...winnerRes.payouts].forEach(p => {
      db.prepare('UPDATE players SET balance = balance + ?, total_wins = total_wins + 1 WHERE id = ?')
        .run(p.payout, p.player_id);
    });

    const payoutByBetId = new Map();
    [...scoreRes.payouts, ...winnerRes.payouts].forEach(p => payoutByBetId.set(p.bet_id, p.payout));

    const allBets = [...scoreBets, ...winnerBets]
      .map(b => ({ ...b, won: payoutByBetId.has(b.id) }))
      .sort((x, y) => String(x.placed_at).localeCompare(String(y.placed_at)));

    allBets.forEach(b => {
      db.prepare('UPDATE bets SET payout = ? WHERE id = ?').run(payoutByBetId.get(b.id) || 0, b.id);
      if (b.won) {
        db.prepare(`
          UPDATE players SET current_streak = current_streak + 1,
            best_streak = MAX(best_streak, current_streak + 1)
          WHERE id = ?
        `).run(b.player_id);
      } else {
        db.prepare('UPDATE players SET current_streak = 0 WHERE id = ?').run(b.player_id);
      }
    });

    db.prepare('UPDATE bank SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(bankTotal);

    const broke = db.prepare('SELECT id FROM players WHERE balance = 0').all();
    broke.forEach(p => checkAndApplyWelfare(p.id));
  });

  res.json({
    success: true,
    team_a: match.team_a,
    team_b: match.team_b,
    score_a: scoreA,
    score_b: scoreB,
    winner,
    score_market: { winners_count: scoreRes.winnersCount, payouts: withNick(scoreRes.payouts) },
    winner_market: { winners_count: winnerRes.winnersCount, payouts: withNick(winnerRes.payouts) },
    bank_cut: bankTotal
  });
});

// DELETE /api/admin/match/:id/result — cofnij rozliczenie meczu
app.delete('/api/admin/match/:id/result', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Złe hasło' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match || !match.finished) return res.status(404).json({ error: 'Brak rozliczenia dla tego meczu — nie ma czego cofać' });

  const scoreBets = db.prepare(`SELECT * FROM bets WHERE match_id = ? AND bet_type = 'score'`).all(match.id);
  const winnerBets = db.prepare(`SELECT * FROM bets WHERE match_id = ? AND bet_type = 'winner'`).all(match.id);

  const scoreRes = settleMarket(scoreBets, b => b.guess_score_a === match.score_a && b.guess_score_b === match.score_b, BANK_SEED);
  const winnerRes = settleMarket(winnerBets, b => b.guess_winner === match.winner, BANK_SEED);
  const bankTotal = scoreRes.bankCut + winnerRes.bankCut;

  transaction(() => {
    [...scoreRes.payouts, ...winnerRes.payouts].forEach(p => {
      db.prepare('UPDATE players SET balance = balance - ?, total_wins = MAX(0, total_wins - 1) WHERE id = ?')
        .run(p.payout, p.player_id);
    });
    db.prepare('UPDATE bank SET balance = MAX(0, balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(bankTotal);
    db.prepare('UPDATE matches SET score_a = NULL, score_b = NULL, winner = NULL, finished = 0 WHERE id = ?').run(match.id);
    db.prepare('UPDATE bets SET payout = NULL WHERE match_id = ?').run(match.id);
  });

  res.json({ success: true, message: 'Rozliczenie cofnięte — możesz wpisać wynik ponownie' });
});

// GET /api/admin/players — lista graczy do zarządzania
app.get('/api/admin/players', (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Złe hasło' });

  const players = db.prepare(`
    SELECT id, nickname, balance, total_wins, current_streak, created_at, last_seen
    FROM players
    ORDER BY balance DESC
  `).all();

  res.json({ players });
});

// DELETE /api/admin/player/:id — usuń gracza i jego zakłady
app.delete('/api/admin/player/:id', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Złe hasło' });

  const playerId = parseInt(req.params.id, 10);
  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

  transaction(() => {
    db.prepare('DELETE FROM bets WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM bet_withdrawals WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
  });

  res.json({ success: true, deleted: player.nickname });
});

// Serwuj admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Mundial Betting — Serwer na http://localhost:${PORT}`);
});
