// ── STATE ──
let state = {
  playerId: null,
  token: null,
  nickname: null,
  balance: 0,
  matches: [],
  winnerSelection: {},   // { [matchId]: 'A' | 'B' }
  leaderboardInterval: null,
  mainInterval: null,
};

const MONTHS_PL = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];

// ── STORAGE ──
function saveAuth(id, token, nickname) {
  localStorage.setItem('mundial_player_id', id);
  localStorage.setItem('mundial_token', token);
  localStorage.setItem('mundial_nickname', nickname);
}

function loadAuth() {
  state.playerId = localStorage.getItem('mundial_player_id');
  state.token = localStorage.getItem('mundial_token');
  state.nickname = localStorage.getItem('mundial_nickname');
}

function clearAuth() {
  ['mundial_player_id', 'mundial_token', 'mundial_nickname'].forEach(k => localStorage.removeItem(k));
  state.playerId = state.token = state.nickname = null;
}

// ── API ──
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['X-Token'] = state.token;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Błąd serwera');
  return data;
}

// ── INIT ──
async function init() {
  loadAuth();
  if (state.token) {
    try {
      const me = await api('GET', '/api/me');
      loginSuccess(me.id, state.token, me.nickname, me.balance, me);
      return;
    } catch {
      clearAuth();
    }
  }
  document.getElementById('login-overlay').style.display = 'flex';
}

// ── LOGIN ──
document.getElementById('login-nick').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const nick = document.getElementById('login-nick').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!nick) { errEl.textContent = 'Wpisz nick'; return; }

  try {
    const data = await api('POST', '/api/register', { nickname: nick });
    const me = await fetchMe(data.token);
    saveAuth(data.player_id, data.token, me.nickname);
    state.token = data.token;
    loginSuccess(data.player_id, data.token, me.nickname, me.balance, me);
  } catch (e) {
    errEl.textContent = e.message;
  }
});

async function fetchMe(token) {
  const r = await fetch('/api/me', { headers: { 'X-Token': token } });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}

function loginSuccess(id, token, nickname, balance, me) {
  state.playerId = id;
  state.token = token;
  state.nickname = nickname;
  state.balance = balance;

  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('main-content').style.display = 'grid';

  document.getElementById('user-nick-display').textContent = nickname;
  updateBalanceDisplay(balance);
  document.getElementById('btn-logout').style.display = 'inline-block';

  if (me.welfare_received) showWelfareToast(me.welfare_received);
  if (me.balance === 0) showRipNotice(nickname);

  startApp();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  clearAuth();
  clearInterval(state.leaderboardInterval);
  clearInterval(state.mainInterval);
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-nick').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('user-nick-display').textContent = '';
  document.getElementById('user-balance-display').textContent = '';
});

// ── APP MAIN LOOP ──
function startApp() {
  loadMatches();
  loadLeaderboard();
  loadBank();

  // Uwaga: celowo brak automatycznego odświeżania meczów/banku/leaderboardu —
  // podmiana innerHTML w trakcie wpisywania wyniku przez gracza kasowała
  // wpisywaną wartość (np. 4:0 wracało do domyślnego 1:1). Dane odświeżają
  // się teraz tylko na starcie i po akcjach (np. po postawieniu zakładu).

  setInterval(updateCountdown, 1000);
}

// ── MATCHES ──
async function loadMatches() {
  try {
    const data = await api('GET', '/api/matches');
    state.matches = data.matches;
    renderMatches(state.matches);
    renderRecentResults(state.matches);
    updateCountdown();
  } catch (e) {
    console.error('Błąd ładowania meczów:', e);
  }
}

function teamLabel(m, side) {
  const team = side === 'A' ? m.team_a : m.team_b;
  const placeholder = side === 'A' ? m.placeholder_a : m.placeholder_b;
  return team || placeholder || '???';
}

function statusInfo(m) {
  if (m.finished) return { cls: 'done', text: 'ROZLICZONY' };
  if (m.available) return { cls: 'open', text: 'OTWARTE' };
  if (!m.team_a || !m.team_b) return { cls: 'locked', text: 'DRUŻYNY NIEZNANE' };
  return { cls: 'locked', text: 'ZAMKNIĘTE' };
}

function formatKickoff(str) {
  const [datePart, timePart] = str.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  return `${d} ${MONTHS_PL[mo - 1]}, ${timePart}`;
}

function renderMatches(matches) {
  const container = document.getElementById('matches-list');
  let html = '';
  let lastRound = null;

  matches.forEach(m => {
    if (m.round !== lastRound) {
      html += `<div class="round-heading">${esc(m.round)}</div>`;
      lastRound = m.round;
    }
    html += renderMatchCard(m);
  });

  container.innerHTML = html || '<div class="text-muted small">Brak meczów</div>';

  // Po przerysowaniu odtwórz podgląd możliwej wygranej dla meczów z wybraną drużyną
  Object.keys(state.winnerSelection).forEach(id => updateWinnerQuote(parseInt(id, 10)));
}

function renderMatchCard(m) {
  const st = statusInfo(m);
  const teamsHtml = (m.team_a && m.team_b)
    ? `${esc(m.team_a)} <span class="text-muted">–</span> ${esc(m.team_b)}`
    : `<span class="placeholder">${esc(teamLabel(m,'A'))} – ${esc(teamLabel(m,'B'))}</span>`;
  const scoreHtml = m.finished ? `<span class="match-score">${m.score_a}:${m.score_b}</span>` : '';

  return `
    <div class="match-card ${m.finished ? 'finished' : ''} ${!m.available && !m.finished ? 'locked' : ''}" id="match-${m.id}">
      <div class="match-head">
        <div class="match-teams">${teamsHtml}${scoreHtml}</div>
        <div class="match-meta">
          <span class="match-kickoff">${formatKickoff(m.kickoff_at)}</span>
          <span class="match-status ${st.cls}">${st.text}</span>
        </div>
      </div>
      <div class="markets">
        ${renderScoreMarket(m)}
        ${renderWinnerMarket(m)}
      </div>
    </div>
  `;
}

function pendingPayoutNote(b) {
  if (!b.potential_payout) return 'oczekuje na wynik';
  // Zakład na zwycięzcę ma kurs zamrożony w chwili postawienia — wygrana jest pewna co do coina.
  // Zakład na wynik gra w puli (parimutuel), więc kwota jest szacunkiem stanu obecnego.
  if (b.locked_odds) {
    return `wygrana przy trafieniu: ${b.potential_payout} coins <span class="mono">(x${Number(b.locked_odds).toFixed(2)} 🔒)</span>`;
  }
  const mult = (b.potential_payout / b.amount).toFixed(2);
  return `możliwa wygrana ~${b.potential_payout} coins <span class="mono">(x${mult})</span>`;
}

function poolLabel(total, seed, count) {
  const seedPart = seed ? ` <span class="pool-seed" title="bonus z banku biurowego — wypłacany, gdy ktoś trafi">+${seed}🏦</span>` : '';
  return `pula ${total}${seedPart} · ${count} zakł.`;
}

function renderScoreMarket(m) {
  const pool = poolLabel(m.score_market.total, m.score_market.bank_seed, m.score_market.count);

  let body;
  if (m.my_score_bet) {
    const b = m.my_score_bet;
    let cls = '';
    let payoutNote = 'oczekuje na wynik';
    if (m.finished) {
      cls = b.payout > 0 ? 'won' : 'lost';
      payoutNote = b.payout > 0 ? `✓ +${b.payout} coins` : '✗ przegrany';
    } else {
      payoutNote = pendingPayoutNote(b);
    }
    const withdrawBtn = m.available && !b.withdraw_used
      ? `<button class="withdraw-btn" data-action="withdraw-bet" data-bet="${b.id}">Wycofaj</button>`
      : (m.available && b.withdraw_used ? `<span class="withdraw-used-note">wycofanie wykorzystane</span>` : '');
    body = `
      <div class="my-bet-badge ${cls}">
        <span>Twój typ: <span class="mono">${b.guess_score_a}:${b.guess_score_b}</span> · ${b.amount} coins</span>
        <span>${payoutNote}</span>
        ${withdrawBtn}
      </div>
      <div class="market-error" id="score-error-${m.id}"></div>
    `;
  } else if (m.available) {
    body = `
      <div class="score-inputs">
        <input type="number" id="score-a-${m.id}" min="0" max="20" value="1" />
        <span class="sep">:</span>
        <input type="number" id="score-b-${m.id}" min="0" max="20" value="1" />
      </div>
      <div class="stake-row">
        <input type="number" id="score-amount-${m.id}" min="10" value="50" />
        <button data-action="bet-score" data-match="${m.id}">Stawiam</button>
      </div>
      <div class="market-error" id="score-error-${m.id}"></div>
    `;
  } else {
    body = `<div class="market-locked-note">Niedostępny</div>`;
  }

  return `
    <div class="market">
      <div class="market-title"><span>WYNIK</span><span class="market-pool">${pool}</span></div>
      ${body}
    </div>
  `;
}

function oddsTag(odds) {
  return (odds === null || odds === undefined) ? '' : `<span class="odds-tag mono">x${odds.toFixed(2)}</span>`;
}

function renderPoolSplit(m) {
  if (m.finished || !m.team_a || !m.team_b) return '';
  const a = m.winner_market.total_a;
  const b = m.winner_market.total_b;
  const total = a + b;
  const widthA = total > 0 ? Math.round((a / total) * 100) : 50;
  return `
    <div class="pool-split">
      <div class="pool-split-bar"><div class="pool-split-a" style="width:${widthA}%"></div></div>
      <div class="pool-split-labels">
        <span>${esc(teamLabel(m, 'A'))} · <span class="mono">${a}</span> ${oddsTag(m.winner_market.odds_a)}</span>
        <span>${oddsTag(m.winner_market.odds_b)} <span class="mono">${b}</span> · ${esc(teamLabel(m, 'B'))}</span>
      </div>
    </div>
  `;
}

function renderWinnerMarket(m) {
  const poolTotal = m.winner_market.total_a + m.winner_market.total_b;
  const pool = poolLabel(poolTotal, null, m.winner_market.count);

  let body;
  if (m.my_winner_bet) {
    const b = m.my_winner_bet;
    const pickName = b.guess_winner === 'A' ? teamLabel(m, 'A') : teamLabel(m, 'B');
    let cls = '';
    let payoutNote = 'oczekuje na wynik';
    if (m.finished) {
      cls = b.payout > 0 ? 'won' : 'lost';
      payoutNote = b.payout > 0 ? `✓ +${b.payout} coins` : '✗ przegrany';
    } else {
      payoutNote = pendingPayoutNote(b);
    }
    const withdrawBtn = m.available && !b.withdraw_used
      ? `<button class="withdraw-btn" data-action="withdraw-bet" data-bet="${b.id}">Wycofaj</button>`
      : (m.available && b.withdraw_used ? `<span class="withdraw-used-note">wycofanie wykorzystane</span>` : '');
    body = `
      <div class="my-bet-badge ${cls}">
        <span>Twój typ: <span class="mono">${esc(pickName)}</span> · ${b.amount} coins</span>
        <span>${payoutNote}</span>
        ${withdrawBtn}
      </div>
      ${renderPoolSplit(m)}
      <div class="market-error" id="winner-error-${m.id}"></div>
    `;
  } else if (m.available) {
    const sel = state.winnerSelection[m.id];
    body = `
      <div class="winner-buttons">
        <button class="winner-btn ${sel === 'A' ? 'selected' : ''}" data-action="pick-winner" data-match="${m.id}" data-side="A">
          <span class="winner-name">${esc(teamLabel(m, 'A'))}</span>${oddsTag(m.winner_market.odds_a)}
        </button>
        <button class="winner-btn ${sel === 'B' ? 'selected' : ''}" data-action="pick-winner" data-match="${m.id}" data-side="B">
          <span class="winner-name">${esc(teamLabel(m, 'B'))}</span>${oddsTag(m.winner_market.odds_b)}
        </button>
      </div>
      ${renderPoolSplit(m)}
      <div class="stake-row">
        <input type="number" id="winner-amount-${m.id}" min="10" value="50" data-quote-match="${m.id}" />
        <button data-action="bet-winner" data-match="${m.id}">Stawiam</button>
      </div>
      <div class="quote-note" id="winner-quote-${m.id}"></div>
      <div class="market-error" id="winner-error-${m.id}"></div>
    `;
  } else {
    body = `
      ${renderPoolSplit(m)}
      <div class="market-locked-note">Niedostępny</div>
    `;
  }

  return `
    <div class="market">
      <div class="market-title"><span>ZWYCIĘZCA</span><span class="market-pool">${pool}</span></div>
      ${body}
    </div>
  `;
}

// ── EVENT DELEGATION FOR MATCH CARDS ──
document.getElementById('matches-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'withdraw-bet') {
    withdrawBet(parseInt(btn.dataset.bet, 10));
    return;
  }

  const matchId = parseInt(btn.dataset.match, 10);

  if (action === 'pick-winner') {
    state.winnerSelection[matchId] = btn.dataset.side;
    const card = document.getElementById(`match-${matchId}`);
    card.querySelectorAll('.winner-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    updateWinnerQuote(matchId);
  } else if (action === 'bet-score') {
    placeScoreBet(matchId);
  } else if (action === 'bet-winner') {
    placeWinnerBet(matchId);
  }
});

// ── PODGLĄD WYGRANEJ (stawka × kurs z tablicy) ──
// Kurs z tablicy zamraża się dla zakładu w chwili postawienia — wpisywana stawka
// go nie zmienia, a późniejsze zakłady innych ruszają tylko tablicę, nie Twój kurs.
document.getElementById('matches-list').addEventListener('input', e => {
  const matchId = parseInt(e.target.dataset.quoteMatch, 10);
  if (matchId) updateWinnerQuote(matchId);
});

function updateWinnerQuote(matchId) {
  const el = document.getElementById(`winner-quote-${matchId}`);
  if (!el) return;

  const side = state.winnerSelection[matchId];
  const amountEl = document.getElementById(`winner-amount-${matchId}`);
  const amount = amountEl ? parseInt(amountEl.value, 10) : NaN;
  const m = (state.matches || []).find(x => x.id === matchId);
  const odds = m ? (side === 'A' ? m.winner_market.odds_a : m.winner_market.odds_b) : null;

  if (!side || !amount || amount < 10 || !odds) { el.textContent = ''; return; }

  const potential = Math.max(Math.floor(amount * odds), amount);
  el.innerHTML = `Wygrana przy trafieniu: <span class="mono accent">${potential} coins</span> <span class="mono">(x${odds.toFixed(2)} 🔒 przy postawieniu)</span>`;
}

async function withdrawBet(betId) {
  try {
    const res = await api('DELETE', `/api/bet/${betId}`);
    state.balance = res.new_balance;
    updateBalanceDisplay(res.new_balance);
    await loadMatches();
  } catch (e) {
    alert(e.message);
  }
}

async function placeScoreBet(matchId) {
  const a = parseInt(document.getElementById(`score-a-${matchId}`).value, 10);
  const b = parseInt(document.getElementById(`score-b-${matchId}`).value, 10);
  const amount = parseInt(document.getElementById(`score-amount-${matchId}`).value, 10);
  const errEl = document.getElementById(`score-error-${matchId}`);
  errEl.textContent = '';

  try {
    const res = await api('POST', '/api/bet/score', { match_id: matchId, guess_score_a: a, guess_score_b: b, amount });
    state.balance = res.new_balance;
    updateBalanceDisplay(res.new_balance);
    showConfetti();
    await loadMatches();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function placeWinnerBet(matchId) {
  const guess_winner = state.winnerSelection[matchId];
  const amount = parseInt(document.getElementById(`winner-amount-${matchId}`).value, 10);
  const errEl = document.getElementById(`winner-error-${matchId}`);
  errEl.textContent = '';

  if (!guess_winner) { errEl.textContent = 'Wybierz drużynę'; return; }

  try {
    const res = await api('POST', '/api/bet/winner', { match_id: matchId, guess_winner, amount });
    state.balance = res.new_balance;
    updateBalanceDisplay(res.new_balance);
    showConfetti();
    await loadMatches();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

// ── RECENT RESULTS ──
function renderRecentResults(matches) {
  const list = document.getElementById('history-list');
  const finished = matches.filter(m => m.finished).sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at)).slice(0, 8);

  if (!finished.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:8px 4px">Brak wyników</div>';
    return;
  }

  list.innerHTML = finished.map(m => {
    const [datePart] = m.kickoff_at.split('T');
    const [y, mo, d] = datePart.split('-').map(Number);
    return `
      <div class="history-row">
        <span class="history-date">${d} ${MONTHS_PL[mo - 1].slice(0, 3)}</span>
        <span class="history-slot mono">${esc(m.team_a)} ${m.score_a}:${m.score_b} ${esc(m.team_b)}</span>
      </div>
    `;
  }).join('');
}

// ── LEADERBOARD ──
async function loadLeaderboard() {
  try {
    const data = await api('GET', `/api/leaderboard?highlight=${state.playerId}`);
    renderLeaderboard(data);
  } catch (e) {
    console.error('Leaderboard error:', e);
  }
}

function renderLeaderboard(data) {
  const list = document.getElementById('leaderboard-list');
  const countEl = document.getElementById('players-count');
  countEl.textContent = `${data.total_players} graczy w grze`;

  let html = '';

  data.leaderboard.forEach((p) => {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
    const streakBadge = p.streak >= 2 ? `<span class="lb-streak">🔥${p.streak}</span>` : '';
    const meClass = p.is_me ? ' is-me' : '';

    html += `
      <div class="lb-row${meClass}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-nick">${esc(p.nickname)}${streakBadge}</span>
        <span class="lb-balance mono">${p.balance} coins</span>
      </div>
    `;
  });

  list.innerHTML = html;
}

// ── BANK ──
async function loadBank() {
  try {
    const data = await api('GET', '/api/bank');
    document.getElementById('bank-balance').textContent = data.balance + ' coins';
  } catch {}
}

// ── COUNTDOWN ──
// formatToParts zamiast toLocaleString('sv-SE', ...) — w przeglądarkach/silnikach z okrojonym
// ICU locale 'sv-SE' może po cichu wrócić do domyślnego formatu i rozjechać parsowanie.
function nowWawDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`);
}

function kickoffDate(str) {
  return new Date(str + ':00');
}

function updateCountdown() {
  const textEl = document.getElementById('countdown-text');
  const barEl = document.getElementById('countdown-bar');
  const matches = state.matches || [];

  if (!matches.length) { textEl.textContent = 'ładowanie...'; return; }

  const upcoming = matches.filter(m => !m.finished).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));

  if (!upcoming.length) {
    textEl.textContent = '🏆 Turniej rozliczony do końca!';
    barEl.style.width = '100%';
    return;
  }

  const next = upcoming[0];
  const now = nowWawDate();
  const target = kickoffDate(next.kickoff_at);
  const diffMs = target - now;
  const teamsLabel = (next.team_a && next.team_b) ? `${next.team_a} – ${next.team_b}` : next.round;

  if (diffMs > 0) {
    const totalSec = Math.floor(diffMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const mnt = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    const parts = [];
    if (d > 0) parts.push(d + 'd');
    if (d > 0 || h > 0) parts.push(h + 'h');
    parts.push(String(mnt).padStart(2, '0') + 'm');
    parts.push(String(sec).padStart(2, '0') + 's');
    textEl.textContent = `⏳ ${teamsLabel} za ${parts.join(' ')}`;
  } else {
    textEl.textContent = `🔒 ${teamsLabel} — zakłady zamknięte, czekamy na wynik`;
  }

  const first = kickoffDate(matches[0].kickoff_at);
  const last = kickoffDate(matches[matches.length - 1].kickoff_at);
  const span = last - first;
  const elapsed = now - first;
  const pct = span > 0 ? Math.min(100, Math.max(0, (elapsed / span) * 100)) : 0;
  barEl.style.width = pct + '%';
}

// ── BALANCE DISPLAY ──
let currentBalance = null;

function updateBalanceDisplay(balance) {
  const el = document.getElementById('user-balance-display');
  if (currentBalance !== null && currentBalance !== balance) {
    el.classList.remove('balance-rolling');
    void el.offsetWidth;
    el.classList.add('balance-rolling');
  }
  el.textContent = `💰 ${balance} coins`;
  currentBalance = balance;
}

// ── CONFETTI ──
function showConfetti() {
  const container = document.getElementById('confetti-container');
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.textContent = '⚽';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.animationDelay = (Math.random() * 0.6) + 's';
    el.style.fontSize = (16 + Math.random() * 16) + 'px';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
}

// ── WELFARE TOAST ──
function showWelfareToast(amount) {
  const t = document.getElementById('welfare-toast');
  document.getElementById('welfare-toast-text').textContent = `💸 Dostałeś ${amount} coins z kasy biurowej. Nie trać ich.`;
  t.style.display = 'block';
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.style.display = 'none'; }, 300);
  }, 4000);
}

// ── RIP NOTICE ──
function showRipNotice(nick) {
  const year = new Date().getFullYear();
  const notice = document.createElement('div');
  notice.className = 'rip-notice';
  notice.textContent = `R.I.P. ${nick}'s coins (${year}–${year})`;
  document.querySelector('.col-game').prepend(notice);
}

// ── ESCAPE HTML ──
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── HOW IT WORKS MODAL ──
document.getElementById('btn-how').addEventListener('click', () => {
  document.getElementById('how-it-works').style.display = 'flex';
});
document.getElementById('how-close').addEventListener('click', () => {
  document.getElementById('how-it-works').style.display = 'none';
});
document.getElementById('how-it-works').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

// ── START ──
init();
