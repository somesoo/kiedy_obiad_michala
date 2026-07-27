// ── STATE ──
let state = {
  playerId: null,
  token: null,
  nickname: null,
  game: null,        // ostatni stan z /api/wordle/today
  current: '',       // aktualnie wpisywany wiersz
  period: 'all',     // filtr leaderboardu
  busy: false,
  shake: false,
};

// ── STORAGE ──
function saveAuth(id, token, nickname) {
  localStorage.setItem('wordle_player_id', id);
  localStorage.setItem('wordle_token', token);
  localStorage.setItem('wordle_nickname', nickname);
}
function loadAuth() {
  state.playerId = localStorage.getItem('wordle_player_id');
  state.token = localStorage.getItem('wordle_token');
  state.nickname = localStorage.getItem('wordle_nickname');
}
function clearAuth() {
  ['wordle_player_id', 'wordle_token', 'wordle_nickname'].forEach(k => localStorage.removeItem(k));
  state.playerId = state.token = state.nickname = null;
}

// ── API ──
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
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
      loginSuccess(me.id, state.token, me.nickname);
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
    saveAuth(data.player_id, data.token, nick);
    state.token = data.token;
    const me = await api('GET', '/api/me');
    loginSuccess(me.id, data.token, me.nickname);
  } catch (e) {
    errEl.textContent = e.message;
  }
});

function loginSuccess(id, token, nickname) {
  state.playerId = id;
  state.token = token;
  state.nickname = nickname;
  saveAuth(id, token, nickname);

  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('main-content').style.display = 'grid';
  document.getElementById('user-nick-display').textContent = nickname;
  document.getElementById('btn-logout').style.display = 'inline-block';

  startApp();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  clearAuth();
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-nick').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('user-nick-display').textContent = '';
  document.getElementById('user-points-display').textContent = '';
});

// ── APP MAIN ──
function startApp() {
  loadGame();
  loadLeaderboard();
  setInterval(updateCountdown, 1000);
}

async function loadGame() {
  try {
    const game = await api('GET', '/api/wordle/today');
    state.game = game;
    state.current = '';
    renderPoints(game.stats.total_points);
    renderSeason(game);
    renderGame();
    updateCountdown();
  } catch (e) {
    console.error('Błąd ładowania gry:', e);
  }
}

// ── POINTS / SEASON ──
function renderPoints(pts) {
  document.getElementById('user-points-display').textContent = `⭐ ${pts} pkt`;
}

function renderSeason(g) {
  document.getElementById('season-remaining').textContent = g.remaining_words;
  document.getElementById('day-number').textContent = `#${g.day_number}`;
  const total = g.total_words || 1;
  const done = Math.max(0, Math.min(total, total - g.remaining_words));
  const pct = Math.round((done / total) * 100);
  document.getElementById('season-progress-fill').style.width = pct + '%';
  document.getElementById('season-sub').textContent =
    g.season_over ? 'Sezon zakończony 🏁' : `Rozegrano ${done} z ${total} haseł`;
}

// ── GAME RENDER ──
function isPlayable(g) {
  return g && g.has_word && !g.season_over &&
    (g.status === 'not_started' || g.status === 'in_progress');
}

function renderGame() {
  const area = document.getElementById('game-area');
  const g = state.game;
  const hintBadge = document.getElementById('hint-badge');

  if (!g) { area.innerHTML = ''; return; }

  if (g.season_over) {
    hintBadge.textContent = '';
    area.innerHTML = renderSeasonOver(g);
    return;
  }
  if (!g.has_word) {
    hintBadge.textContent = '';
    area.innerHTML = `<div class="empty-state">Dziś nie ma hasła. Zajrzyj innego dnia! 🗓️</div>`;
    return;
  }

  hintBadge.textContent = g.hint ? `💡 ${g.hint}` : '';

  const finished = g.status === 'won' || g.status === 'lost';
  const board = renderBoard(g);
  const keyboard = finished ? '' : renderKeyboard(g);
  const review = finished ? renderReview(g) : '';

  area.innerHTML = `
    <div class="board-meta">
      <span>Hasło ma <strong>${g.word_length}</strong> liter · <strong>${g.max_attempts}</strong> prób</span>
    </div>
    ${board}
    ${review}
    ${keyboard}
  `;
}

function renderBoard(g) {
  const rows = [];
  const guesses = g.guesses || [];
  const finished = g.status === 'won' || g.status === 'lost';

  for (let r = 0; r < g.max_attempts; r++) {
    let tiles = '';
    let isCurrentRow = false;
    if (r < guesses.length) {
      const row = guesses[r];
      for (let c = 0; c < g.word_length; c++) {
        tiles += `<div class="tile tile-${row.statuses[c]} filled">${esc(row.guess[c])}</div>`;
      }
    } else if (r === guesses.length && !finished) {
      isCurrentRow = true;
      for (let c = 0; c < g.word_length; c++) {
        const ch = state.current[c] || '';
        tiles += `<div class="tile ${ch ? 'active' : ''}">${esc(ch)}</div>`;
      }
    } else {
      for (let c = 0; c < g.word_length; c++) tiles += `<div class="tile"></div>`;
    }
    const shakeCls = (isCurrentRow && state.shake) ? ' shake' : '';
    rows.push(`<div class="tile-row${shakeCls}" style="grid-template-columns:repeat(${g.word_length},1fr)">${tiles}</div>`);
  }
  return `<div class="board">${rows.join('')}</div>`;
}

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','BACK']
];

function renderKeyboard(g) {
  const kb = g.keyboard || {};
  const rowsHtml = KEYBOARD_ROWS.map(row => {
    const keys = row.map(k => {
      if (k === 'ENTER') return `<button class="key key-wide" data-key="ENTER">Enter</button>`;
      if (k === 'BACK') return `<button class="key key-wide" data-key="BACK">⌫</button>`;
      const st = kb[k] ? ` key-${kb[k]}` : '';
      return `<button class="key${st}" data-key="${k}">${k}</button>`;
    }).join('');
    return `<div class="key-row">${keys}</div>`;
  }).join('');
  return `<div class="keyboard" id="keyboard">${rowsHtml}</div>`;
}

function renderReview(g) {
  const won = g.status === 'won';
  const answerLine = won
    ? `<div class="review-headline win">🎉 Odgadnięte!</div>`
    : `<div class="review-headline lose">Koniec prób. Hasło to: <span class="mono answer">${esc(g.answer)}</span></div>`;
  const pointsLine = won
    ? `<div class="review-points">+${g.points_today} pkt dzisiaj</div>`
    : `<div class="review-points muted">0 pkt — seria wyzerowana</div>`;

  return `
    <div class="review-panel ${won ? 'win' : 'lose'}">
      ${answerLine}
      ${pointsLine}
      <div class="review-stats">
        <div class="stat"><span class="stat-num">${g.stats.current_streak}</span><span class="stat-lbl">🔥 streak</span></div>
        <div class="stat"><span class="stat-num">${g.stats.best_streak}</span><span class="stat-lbl">rekord serii</span></div>
        <div class="stat"><span class="stat-num">${g.stats.total_points}</span><span class="stat-lbl">⭐ punkty</span></div>
      </div>
      <button class="btn-primary btn-share" id="btn-share">📋 Udostępnij wynik</button>
      <div class="next-word-timer text-muted small">Nowe hasło za <span class="mono" id="next-word-timer">–</span></div>
    </div>
  `;
}

function renderSeasonOver(g) {
  return `
    <div class="season-over">
      <div class="season-over-emoji">🏁</div>
      <h3>Sezon zakończony!</h3>
      <p class="text-muted">Wszystkie hasła rozegrane. Sprawdź ostateczny ranking w tabeli liderów.</p>
      <div class="review-stats">
        <div class="stat"><span class="stat-num">${g.stats.best_streak}</span><span class="stat-lbl">rekord serii</span></div>
        <div class="stat"><span class="stat-num">${g.stats.total_points}</span><span class="stat-lbl">⭐ punkty</span></div>
      </div>
    </div>
  `;
}

// ── INPUT (fizyczna klawiatura) ──
document.addEventListener('keydown', e => {
  if (document.getElementById('main-content').style.display === 'none') return;
  if (!isPlayable(state.game)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.key === 'Enter') { submitGuess(); e.preventDefault(); }
  else if (e.key === 'Backspace') { popLetter(); e.preventDefault(); }
  else if (/^[a-zA-Z]$/.test(e.key)) { pushLetter(e.key.toUpperCase()); }
});

// ── INPUT (klawiatura ekranowa) ──
document.getElementById('game-area').addEventListener('click', e => {
  const key = e.target.closest('.key');
  if (key) {
    const k = key.dataset.key;
    if (k === 'ENTER') submitGuess();
    else if (k === 'BACK') popLetter();
    else pushLetter(k);
    return;
  }
  const share = e.target.closest('#btn-share');
  if (share) shareResult();
});

function pushLetter(ch) {
  const g = state.game;
  if (!isPlayable(g)) return;
  if (state.current.length >= g.word_length) return;
  state.current += ch;
  renderGame();
}

function popLetter() {
  if (!state.current.length) return;
  state.current = state.current.slice(0, -1);
  renderGame();
}

async function submitGuess() {
  const g = state.game;
  if (!isPlayable(g) || state.busy) return;
  if (state.current.length !== g.word_length) {
    triggerShake();
    return;
  }
  const guess = state.current;
  state.busy = true;
  try {
    const updated = await api('POST', '/api/wordle/guess', { guess });
    const wasFinished = g.status === 'won' || g.status === 'lost';
    state.game = updated;
    state.current = '';
    renderPoints(updated.stats.total_points);
    renderSeason(updated);
    renderGame();
    if (!wasFinished && updated.status === 'won') {
      showConfetti();
      showToast(`🎉 Brawo! +${updated.points_today} pkt`);
      loadLeaderboard();
    } else if (!wasFinished && updated.status === 'lost') {
      showToast(`Koniec prób — hasło to ${updated.answer}`);
      loadLeaderboard();
    }
  } catch (e) {
    showToast(e.message);
    triggerShake();
  } finally {
    state.busy = false;
  }
}

function triggerShake() {
  state.shake = true;
  renderGame();
  setTimeout(() => { state.shake = false; renderGame(); }, 450);
}

// ── SHARE ──
function shareResult() {
  const g = state.game;
  if (!g || !g.guesses) return;
  const won = g.status === 'won';
  const header = `Office Wordle #${g.day_number} ${won ? g.attempts_used : 'X'}/${g.max_attempts}`;
  const emojiMap = { green: '🟩', yellow: '🟨', gray: '⬛' };
  const grid = g.guesses.map(row => row.statuses.map(s => emojiMap[s]).join('')).join('\n');
  const text = `${header}\n${grid}`;

  navigator.clipboard.writeText(text).then(
    () => showToast('📋 Wynik skopiowany — wklej na Slacku/Teams!'),
    () => showToast('Nie udało się skopiować 😕')
  );
}

// ── LEADERBOARD ──
document.getElementById('lb-filters').addEventListener('click', e => {
  const btn = e.target.closest('.lb-filter');
  if (!btn) return;
  state.period = btn.dataset.period;
  document.querySelectorAll('.lb-filter').forEach(b => b.classList.toggle('active', b === btn));
  loadLeaderboard();
});

async function loadLeaderboard() {
  try {
    const data = await api('GET', `/api/leaderboard?period=${state.period}&highlight=${state.playerId}`);
    renderLeaderboard(data);
  } catch (e) {
    console.error('Leaderboard error:', e);
  }
}

function renderLeaderboard(data) {
  const list = document.getElementById('leaderboard-list');
  document.getElementById('players-count').textContent = `${data.total_players} graczy`;

  if (!data.leaderboard.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:12px 4px">Jeszcze nikt nie zagrał w tym okresie</div>';
    return;
  }

  const header = `
    <div class="lb-head">
      <span class="lb-rank">#</span>
      <span class="lb-nick">gracz</span>
      <span class="lb-col" title="Punkty">pkt</span>
      <span class="lb-col" title="Seria">🔥</span>
      <span class="lb-col" title="Średnia liczba prób (wygrane)">avg</span>
      <span class="lb-col" title="Rozegrane dni">dni</span>
    </div>`;

  const rows = data.leaderboard.map(p => {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
    const meClass = p.is_me ? ' is-me' : '';
    const avg = p.avg_attempts != null ? p.avg_attempts.toFixed(1) : '–';
    const streak = p.streak > 0 ? `🔥${p.streak}` : '–';
    return `
      <div class="lb-row${meClass}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-nick">${esc(p.nickname)}</span>
        <span class="lb-col mono accent">${p.total_points}</span>
        <span class="lb-col mono">${streak}</span>
        <span class="lb-col mono">${avg}</span>
        <span class="lb-col mono">${p.games_played}</span>
      </div>`;
  }).join('');

  list.innerHTML = header + rows;
}

// ── COUNTDOWN (do północy w Warszawie = nowe hasło) ──
function warsawNowParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = t => Number(parts.find(p => p.type === t).value);
  return { h: get('hour'), mi: get('minute'), s: get('second') };
}

function updateCountdown() {
  const { h, mi, s } = warsawNowParts();
  const secsLeft = 24 * 3600 - (h * 3600 + mi * 60 + s);
  const hh = Math.floor(secsLeft / 3600);
  const mm = Math.floor((secsLeft % 3600) / 60);
  const ss = secsLeft % 60;
  const fmt = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const barEl = document.getElementById('countdown-bar');
  const textEl = document.getElementById('countdown-text');
  const g = state.game;

  if (g && g.season_over) {
    textEl.textContent = '🏁 Sezon zakończony — dziękujemy za grę!';
    if (barEl) barEl.style.width = '100%';
  } else {
    textEl.textContent = `⏳ Nowe hasło za ${fmt}`;
    if (barEl) barEl.style.width = ((1 - secsLeft / 86400) * 100) + '%';
  }

  const timerEl = document.getElementById('next-word-timer');
  if (timerEl) timerEl.textContent = fmt;
}

// ── CONFETTI ──
function showConfetti() {
  const container = document.getElementById('confetti-container');
  const icons = ['🎉', '⭐', '🟩', '☕'];
  for (let i = 0; i < 22; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.textContent = icons[i % icons.length];
    el.style.left = Math.random() * 100 + 'vw';
    el.style.animationDelay = (Math.random() * 0.6) + 's';
    el.style.fontSize = (16 + Math.random() * 16) + 'px';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
}

// ── TOAST ──
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-text').textContent = msg;
  t.style.display = 'block';
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.style.display = 'none'; }, 300);
  }, 3500);
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

// ── ESCAPE HTML ──
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── START ──
init();
