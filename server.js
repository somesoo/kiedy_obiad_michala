require('dotenv').config();
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123michal';

// Upewnij się że folder db istnieje
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'michal.db'));

// Inicjalizacja schematu bazy
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    balance INTEGER DEFAULT 100,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id),
    bet_date TEXT NOT NULL,
    slot TEXT NOT NULL,
    amount INTEGER NOT NULL,
    placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, bet_date)
  );

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_date TEXT UNIQUE NOT NULL,
    winning_slot TEXT NOT NULL,
    actual_time TEXT NOT NULL,
    total_pool INTEGER NOT NULL,
    winners_count INTEGER NOT NULL,
    michal_comment TEXT,
    nearest_win INTEGER DEFAULT 0,
    confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bank (
    id INTEGER PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO bank VALUES (1, 0, CURRENT_TIMESTAMP);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pomocnicze — aktualna data w Europe/Warsaw
function todayWaw() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

// Aktualna godzina w Warsaw jako "HH:MM"
function nowTimeWaw() {
  return new Date().toLocaleTimeString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// Generuj sloty 10:30–14:30 (co 15 min, ostatni slot: 14:15-14:30)
function generateSlots() {
  const slots = [];
  let h = 10, m = 30;
  while (h < 14 || (h === 14 && m <= 15)) {
    const pad = n => String(n).padStart(2, '0');
    const endM = m + 15;
    const endH = endM >= 60 ? h + 1 : h;
    const endMNorm = endM >= 60 ? endM - 60 : endM;
    slots.push(`${pad(h)}:${pad(m)}-${pad(endH)}:${pad(endMNorm)}`);
    m += 15;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

const ALL_SLOTS = generateSlots();

// Aktualne minuty w strefie Warsaw
function nowMinsWaw() {
  const wawStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const waw = new Date(wawStr);
  return waw.getHours() * 60 + waw.getMinutes();
}

// Czy konkretny slot jest jeszcze dostępny do obstawiania (start slotu jeszcze nie minął)
function isSlotAvailable(slotStr) {
  const startStr = slotStr.split('-')[0];
  const [sh, sm] = startStr.split(':').map(Number);
  return nowMinsWaw() < sh * 60 + sm;
}

// Czy jest przynajmniej jeden slot do obstawienia
function hasAvailableSlots() {
  return ALL_SLOTS.some(isSlotAvailable);
}

// Wyznacz slot który zawiera podaną godzinę (np. "12:37" → "12:30-12:45")
function timeToSlot(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const slotStart = Math.floor(m / 15) * 15;
  const slotEnd = slotStart + 15;
  const pad = n => String(n).padStart(2, '0');
  const endH = slotEnd >= 60 ? h + 1 : h;
  const endM = slotEnd >= 60 ? slotEnd - 60 : slotEnd;
  return `${pad(h)}:${pad(slotStart)}-${pad(endH)}:${pad(endM)}`;
}

// Dystans od godziny do slotu w minutach (0 = trafiony)
// Uwaga: slot [start, end) — end jest wyłączne, więc 12:15 należy do 12:15-12:30, nie do 12:00-12:15
function slotDistance(slotStr, actualMins) {
  const [startStr, endStr] = slotStr.split('-');
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (actualMins >= startMins && actualMins < endMins) return 0;
  if (actualMins < startMins) return startMins - actualMins;
  // +1 żeby granica slotu (np. 12:15 dla 12:00-12:15) nie miała dystansu 0
  return actualMins - endMins + 1;
}

// Znajdź zwycięskie zakłady — najpierw dokładne trafienie, potem najbliższy slot
// Zwraca zawsze kogoś jeśli są jakiekolwiek zakłady
function findWinningBets(allBets, actualTime) {
  if (allBets.length === 0) return { bets: [], isNearestWin: false, winningSlot: null };

  const exactSlot = timeToSlot(actualTime);
  const exactWinners = allBets.filter(b => b.slot === exactSlot);
  if (exactWinners.length > 0) {
    return { bets: exactWinners, isNearestWin: false, winningSlot: exactSlot };
  }

  // Nikt nie trafił dokładnie — znajdź najbliższy slot z zakładami
  const [ah, am] = actualTime.split(':').map(Number);
  const actualMins = ah * 60 + am;

  const uniqueSlots = [...new Set(allBets.map(b => b.slot))];
  const withDist = uniqueSlots.map(slot => ({ slot, dist: slotDistance(slot, actualMins) }));
  const minDist = Math.min(...withDist.map(s => s.dist));
  const nearestSlots = withDist.filter(s => s.dist === minDist).map(s => s.slot);

  const nearestBets = allBets.filter(b => nearestSlots.includes(b.slot));
  // Jeśli remis dystansu — wygrywa slot z większą pulą (bardziej "zdecydowany" wybór biura)
  if (nearestSlots.length > 1) {
    const poolPerSlot = {};
    nearestBets.forEach(b => {
      poolPerSlot[b.slot] = (poolPerSlot[b.slot] || 0) + Number(b.amount);
    });
    const bestSlot = nearestSlots.reduce((a, b) => (poolPerSlot[a] >= poolPerSlot[b] ? a : b));
    return {
      bets: allBets.filter(b => b.slot === bestSlot),
      isNearestWin: true,
      winningSlot: bestSlot
    };
  }

  return { bets: nearestBets, isNearestWin: true, winningSlot: nearestSlots[0] };
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

// Welfare — jeśli saldo gracza = 0, daj 20 ish z banku
function checkAndApplyWelfare(playerId) {
  const player = db.prepare('SELECT balance FROM players WHERE id = ?').get(playerId);
  if (player.balance > 0) return null;

  const bank = db.prepare('SELECT balance FROM bank WHERE id = 1').get();
  if (bank.balance < 20) return null;

  db.prepare('UPDATE players SET balance = balance + 20 WHERE id = ?').run(playerId);
  db.prepare('UPDATE bank SET balance = balance - 20, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run();
  return 20;
}

// ──────────────────────────────────────────────
// ENDPOINTS
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
    // Zwróć istniejącego gracza (logowanie po nicku)
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

// GET /api/me
app.get('/api/me', authPlayer, (req, res) => {
  const { player } = req;

  const rank = db.prepare(
    'SELECT COUNT(*) as cnt FROM players WHERE balance > ?'
  ).get(player.balance);

  const todayBet = db.prepare(
    'SELECT * FROM bets WHERE player_id = ? AND bet_date = ?'
  ).get(player.id, todayWaw());

  const history = db.prepare(`
    SELECT b.bet_date, b.slot, b.amount, r.winning_slot, r.actual_time,
      CASE WHEN r.winning_slot = b.slot THEN 1 ELSE 0 END as won
    FROM bets b
    LEFT JOIN results r ON r.result_date = b.bet_date
    WHERE b.player_id = ?
    ORDER BY b.bet_date DESC
    LIMIT 14
  `).all(player.id);

  const welfare = checkAndApplyWelfare(player.id);
  const fresh = db.prepare('SELECT balance FROM players WHERE id = ?').get(player.id);

  res.json({
    id: player.id,
    nickname: player.nickname,
    balance: fresh.balance,
    current_streak: player.current_streak,
    best_streak: player.best_streak,
    total_wins: player.total_wins,
    rank: Number(rank.cnt) + 1,
    today_bet: todayBet || null,
    history,
    welfare_received: welfare
  });
});

// GET /api/today
app.get('/api/today', (req, res) => {
  const today = todayWaw();

  const betsPerSlot = db.prepare(`
    SELECT slot, SUM(amount) as total, COUNT(*) as count
    FROM bets WHERE bet_date = ?
    GROUP BY slot
  `).all(today);

  const slotMap = {};
  betsPerSlot.forEach(b => { slotMap[b.slot] = { total: b.total, count: b.count }; });

  const totalPool = betsPerSlot.reduce((sum, b) => sum + Number(b.total), 0);
  const totalBets = betsPerSlot.reduce((sum, b) => sum + Number(b.count), 0);

  const result = db.prepare('SELECT * FROM results WHERE result_date = ?').get(today);

  // Przed rozliczeniem — ślepy tryb: ukryj rozkład zakładów per slot
  const blind = !result;

  // Lista graczy którzy już obstawili dziś (bez slotów — tryb ślepy)
  const todayBettors = db.prepare(`
    SELECT p.nickname FROM bets b
    JOIN players p ON p.id = b.player_id
    WHERE b.bet_date = ?
    ORDER BY b.placed_at
  `).all(today).map(r => r.nickname);

  res.json({
    date: today,
    any_slot_available: hasAvailableSlots(),
    blind,
    slots: ALL_SLOTS.map(slot => ({
      slot,
      total: blind ? 0 : (slotMap[slot] ? Number(slotMap[slot].total) : 0),
      count: blind ? 0 : (slotMap[slot] ? Number(slotMap[slot].count) : 0),
      available: isSlotAvailable(slot)
    })),
    total_pool: totalPool,
    total_bets: totalBets,
    today_bettors: todayBettors,
    result: result || null,
    server_time: nowTimeWaw()
  });
});

// POST /api/bet
app.post('/api/bet', authPlayer, (req, res) => {
  const { slot, amount } = req.body;
  const today = todayWaw();

  if (!ALL_SLOTS.includes(slot)) {
    return res.status(400).json({ error: 'Nieprawidłowy slot czasu' });
  }

  if (!isSlotAvailable(slot)) {
    return res.status(400).json({ error: 'Ten slot już minął — wybierz późniejszą godzinę' });
  }

  if (!hasAvailableSlots()) {
    return res.status(400).json({ error: 'Wszystkie sloty na dziś już minęły — jutro spróbuj szczęścia' });
  }

  const amountInt = parseInt(amount, 10);
  if (!amountInt || amountInt < 5) {
    return res.status(400).json({ error: 'Minimalna stawka to 5 install.sh' });
  }

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player.id);

  if (amountInt > player.balance) {
    return res.status(400).json({
      error: `Za mało install.sh. Obecne saldo: ${player.balance} ish`
    });
  }

  // Idempotentność — sprawdź czy zakład już istnieje
  const existing = db.prepare(
    'SELECT * FROM bets WHERE player_id = ? AND bet_date = ?'
  ).get(player.id, today);

  if (existing) {
    return res.status(400).json({ error: 'Jeden zakład dziennie — to nie kasyno' });
  }

  transaction(() => {
    db.prepare(
      'INSERT INTO bets (player_id, bet_date, slot, amount) VALUES (?, ?, ?, ?)'
    ).run(player.id, today, slot, amountInt);
    db.prepare('UPDATE players SET balance = balance - ? WHERE id = ?').run(amountInt, player.id);
  });

  const newBalance = db.prepare('SELECT balance FROM players WHERE id = ?').get(player.id);
  res.json({ success: true, new_balance: newBalance.balance, slot, amount: amountInt });
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  const highlightId = parseInt(req.query.highlight, 10) || null;

  const top10 = db.prepare(`
    SELECT id, nickname, balance, current_streak, best_streak, total_wins
    FROM players
    ORDER BY balance DESC, total_wins DESC
    LIMIT 10
  `).all();

  let myEntry = null;
  if (highlightId) {
    const myRank = db.prepare(`
      SELECT COUNT(*) as rank FROM players
      WHERE balance > (SELECT balance FROM players WHERE id = ?)
    `).get(highlightId);

    const me = db.prepare('SELECT id, nickname, balance, current_streak FROM players WHERE id = ?').get(highlightId);
    if (me) {
      myEntry = { ...me, rank: Number(myRank.rank) + 1, is_me: true };
    }
  }

  const totalPlayers = db.prepare('SELECT COUNT(*) as cnt FROM players').get().cnt;

  const list = top10.map((p, i) => ({
    rank: i + 1,
    id: p.id,
    nickname: p.nickname,
    balance: p.balance,
    streak: p.current_streak,
    best_streak: p.best_streak,
    total_wins: p.total_wins,
    is_me: highlightId ? p.id === highlightId : false
  }));

  const inTop10 = highlightId && list.some(p => p.is_me);
  if (highlightId && !inTop10 && myEntry) {
    list.push({ ...myEntry, outside_top: true });
  }

  res.json({ leaderboard: list, total_players: Number(totalPlayers) });
});

// GET /api/history
app.get('/api/history', (req, res) => {
  const results = db.prepare(`
    SELECT result_date, winning_slot, actual_time, total_pool, winners_count, michal_comment
    FROM results
    ORDER BY result_date DESC
    LIMIT 7
  `).all();

  res.json({ results });
});

// GET /api/bank
app.get('/api/bank', (req, res) => {
  const bank = db.prepare('SELECT balance FROM bank WHERE id = 1').get();
  res.json({ balance: bank.balance });
});

// POST /api/admin/result
app.post('/api/admin/result', (req, res) => {
  const { actual_time, password, preview } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Złe hasło, Michale' });
  }

  if (!/^\d{2}:\d{2}$/.test(actual_time)) {
    return res.status(400).json({ error: 'Podaj godzinę w formacie HH:MM' });
  }

  const [h, m] = actual_time.split(':').map(Number);
  if (h < 10 || h > 17 || m < 0 || m > 59) {
    return res.status(400).json({ error: 'Godzina poza sensownym zakresem' });
  }

  const today = todayWaw();

  const allBets = db.prepare('SELECT * FROM bets WHERE bet_date = ?').all(today);
  const totalPool = allBets.reduce((s, b) => s + Number(b.amount), 0);

  const { bets: winnerBets, isNearestWin, winningSlot } = findWinningBets(allBets, actual_time);
  const exactSlot = timeToSlot(actual_time);

  const winnersPool = Math.floor(totalPool * 0.9);
  const bankCut = totalPool - winnersPool;
  const winnersSum = winnerBets.reduce((s, b) => s + Number(b.amount), 0);

  const payouts = winnerBets.map(b => {
    const raw = winnersSum > 0 ? Math.floor((Number(b.amount) / winnersSum) * winnersPool) : 0;
    const payout = Math.max(raw, Number(b.amount));
    return { player_id: b.player_id, amount: Number(b.amount), payout };
  });

  const actualWinnersPool = payouts.reduce((s, p) => s + p.payout, 0);
  const roundingRemainder = winnersPool > actualWinnersPool ? winnersPool - actualWinnersPool : 0;
  // Bank dostaje tylko 10% + reszta z zaokrąglania — nigdy całą pulę
  const bankTotal = allBets.length === 0 ? 0 : (bankCut + roundingRemainder);

  if (preview) {
    return res.json({
      preview: true,
      winning_slot: winningSlot || exactSlot,
      exact_slot: exactSlot,
      is_nearest_win: isNearestWin,
      actual_time,
      total_pool: totalPool,
      winners_count: winnerBets.length,
      winners_pool: winnersPool,
      bank_cut: bankTotal,
      payouts: payouts.map(p => {
        const player = db.prepare('SELECT nickname FROM players WHERE id = ?').get(p.player_id);
        return { nickname: player?.nickname, bet: p.amount, payout: p.payout };
      }),
      no_winners: false
    });
  }

  const existing = db.prepare('SELECT id FROM results WHERE result_date = ?').get(today);
  if (existing) {
    return res.status(400).json({ error: 'Wynik na dziś już wpisany' });
  }

  const komentarze = [
    'Michał twierdzi, że miał *pilne sprawy*',
    'Znowu kolejka w Żabce',
    'Spotkanie się przeciągnęło',
    'Michał mówi: "miałem spotkanie", wszyscy wiemy jak to jest',
    'Krytyczny bug na produkcji — akurat przed obiadem',
    'Ktoś zajął jego ulubiony stolik',
    'Teams call bez końca',
    'Michał był punktualny, jak zawsze (kłamstwo)',
    'PR do review czekał, obiad poczeka',
    'Deploy się wysypał, obiad się opóźnił'
  ];
  const michalComment = komentarze[Math.floor(Math.random() * komentarze.length)];

  const finalWinningSlot = winningSlot || exactSlot;

  transaction(() => {
    db.prepare(`
      INSERT INTO results (result_date, winning_slot, actual_time, total_pool, winners_count, michal_comment, nearest_win)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(today, finalWinningSlot, actual_time, totalPool, winnerBets.length, michalComment, isNearestWin ? 1 : 0);

    const winnerIds = new Set(winnerBets.map(b => b.player_id));
    payouts.forEach(p => {
      db.prepare('UPDATE players SET balance = balance + ?, total_wins = total_wins + 1 WHERE id = ?')
        .run(p.payout, p.player_id);
    });

    allBets.forEach(b => {
      const won = winnerIds.has(b.player_id);
      if (won) {
        db.prepare(`
          UPDATE players
          SET current_streak = current_streak + 1,
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
    winning_slot: finalWinningSlot,
    exact_slot: exactSlot,
    is_nearest_win: isNearestWin,
    actual_time,
    total_pool: totalPool,
    winners_count: winnerBets.length,
    michal_comment: michalComment,
    payouts: payouts.map(p => {
      const player = db.prepare('SELECT nickname FROM players WHERE id = ?').get(p.player_id);
      return { nickname: player?.nickname, bet: p.amount, payout: p.payout };
    }),
    bank_cut: bankTotal
  });
});

// GET /api/admin/today
app.get('/api/admin/today', (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Złe hasło' });
  }

  const today = todayWaw();
  const bets = db.prepare(`
    SELECT b.slot, b.amount, b.placed_at, p.nickname
    FROM bets b
    JOIN players p ON p.id = b.player_id
    WHERE b.bet_date = ?
    ORDER BY b.placed_at
  `).all(today);

  const totalPool = bets.reduce((s, b) => s + Number(b.amount), 0);
  const result = db.prepare('SELECT * FROM results WHERE result_date = ?').get(today);

  res.json({ bets, total_pool: totalPool, result: result || null, date: today });
});

// DELETE /api/admin/result — cofnij rozliczenie dnia (odwróć transakcje finansowe)
app.delete('/api/admin/result', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Złe hasło' });
  }

  const today = todayWaw();
  const result = db.prepare('SELECT * FROM results WHERE result_date = ?').get(today);
  if (!result) {
    return res.status(404).json({ error: 'Brak rozliczenia na dziś — nie ma czego cofać' });
  }

  const allBets = db.prepare('SELECT * FROM bets WHERE bet_date = ?').all(today);
  const totalPool = allBets.reduce((s, b) => s + Number(b.amount), 0);
  const winnerBets = allBets.filter(b => b.slot === result.winning_slot);
  const winnersSum = winnerBets.reduce((s, b) => s + Number(b.amount), 0);
  const winnersPool = Math.floor(totalPool * 0.9);

  // Przelicz oryginalne wypłaty żeby je cofnąć
  const payouts = winnerBets.map(b => {
    const raw = winnersSum > 0 ? Math.floor((Number(b.amount) / winnersSum) * winnersPool) : 0;
    return { player_id: b.player_id, payout: Math.max(raw, Number(b.amount)) };
  });
  const loserBets = allBets.filter(b => b.slot !== result.winning_slot);

  transaction(() => {
    // Cofnij wypłaty zwycięzcom (odejmij co dostali, ich zakład był już odjęty przy stawianiu)
    payouts.forEach(p => {
      db.prepare('UPDATE players SET balance = balance - ?, total_wins = MAX(0, total_wins - 1) WHERE id = ?')
        .run(p.payout, p.player_id);
    });
    // Zwróć przegrane zakłady przegrywającym
    loserBets.forEach(b => {
      db.prepare('UPDATE players SET balance = balance + ? WHERE id = ?')
        .run(Number(b.amount), b.player_id);
    });
    // Odejmij z banku to co do niego trafiło
    const bankCut = totalPool - winnersPool;
    const actualWinnersPool = payouts.reduce((s, p) => s + p.payout, 0);
    const roundingRemainder = winnersPool > actualWinnersPool ? winnersPool - actualWinnersPool : 0;
    const bankTotal = winnerBets.length === 0 ? totalPool : (bankCut + roundingRemainder);
    db.prepare('UPDATE bank SET balance = MAX(0, balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = 1')
      .run(bankTotal);
    // Usuń wynik
    db.prepare('DELETE FROM results WHERE result_date = ?').run(today);
  });

  res.json({ success: true, message: 'Rozliczenie cofnięte — możesz wpisać wynik ponownie' });
});

// GET /api/day-results — publiczne wyniki dnia z listą wygranych
app.get('/api/day-results', (req, res) => {
  const date = req.query.date || todayWaw();

  const result = db.prepare('SELECT * FROM results WHERE result_date = ?').get(date);
  if (!result) return res.json({ date, result: null, bets: [] });

  const allBets = db.prepare(`
    SELECT b.player_id, b.slot, b.amount, p.nickname
    FROM bets b JOIN players p ON p.id = b.player_id
    WHERE b.bet_date = ?
    ORDER BY b.amount DESC
  `).all(date);

  const totalPool = allBets.reduce((s, b) => s + Number(b.amount), 0);
  const winnerBets = allBets.filter(b => b.slot === result.winning_slot);
  const winnersSum = winnerBets.reduce((s, b) => s + Number(b.amount), 0);
  const winnersPool = Math.floor(totalPool * 0.9);

  const payoutMap = {};
  winnerBets.forEach(b => {
    const raw = winnersSum > 0 ? Math.floor((Number(b.amount) / winnersSum) * winnersPool) : 0;
    payoutMap[b.player_id] = Math.max(raw, Number(b.amount));
  });

  const bets = allBets.map(b => ({
    nickname: b.nickname,
    slot: b.slot,
    amount: Number(b.amount),
    payout: payoutMap[b.player_id] || 0,
    won: b.slot === result.winning_slot
  }));

  res.json({ date, result, bets });
});

// GET /api/admin/players — lista graczy do zarządzania
app.get('/api/admin/players', (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Złe hasło' });
  }

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
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Złe hasło' });
  }

  const playerId = parseInt(req.params.id, 10);
  const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Gracz nie istnieje' });
  }

  transaction(() => {
    db.prepare('DELETE FROM bets WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
  });

  res.json({ success: true, deleted: player.nickname });
});

// Serwuj admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Kiedy Michał? Serwer na http://localhost:${PORT}`);
});
