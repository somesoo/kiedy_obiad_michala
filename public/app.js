// ── STATE ──
let state = {
  playerId: null,
  token: null,
  nickname: null,
  game: null,        // ostatni stan z /api/wordle/today
  current: '',       // aktualnie wpisywany wiersz
  lbSeason: '',      // wybrany sezon w leaderboardzie ('' = bieżący, 'all', lub 'YYYY-MM')
  lbSeasonsLoaded: false,
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
  loadDaily();
  setInterval(updateCountdown, 1000);
}

async function loadGame() {
  try {
    const game = await api('GET', '/api/wordle/today');
    state.game = game;
    state.current = '';
    renderPoints(game.stats.season_points);
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
  // Górna wstęga z informacją o sezonie (miesiąc + reset)
  const ribbon = document.getElementById('season-ribbon');
  const testNote = g.is_test ? ' · <strong>okres testowy</strong> (konkurs od sierpnia)' : '';
  ribbon.innerHTML = `🗓️ Sezon: <strong>${esc(g.season_label)}</strong> — leaderboard i seria zerują się co miesiąc${testNote}`;

  document.getElementById('footer-season').textContent = g.season_label;

  document.getElementById('season-remaining').textContent = g.remaining_words;
  const total = g.total_words || 1;
  const done = Math.max(0, Math.min(total, total - g.remaining_words));
  const pct = Math.round((done / total) * 100);
  document.getElementById('season-progress-fill').style.width = pct + '%';
  document.getElementById('season-sub').textContent = `Rozegrano ${done} z ${total} haseł w puli`;
}

// ── GAME RENDER ──
function isPlayable(g) {
  return !!(g && g.has_word && g.playable);
}

function renderGame() {
  const area = document.getElementById('game-area');
  const g = state.game;

  if (!g) { area.innerHTML = ''; return; }

  if (!g.has_word) {
    if (g.is_weekend) {
      area.innerHTML = `
        <div class="empty-state">
          <div class="season-over-emoji">☕</div>
          <h3>Weekend — odpoczywamy!</h3>
          <p class="text-muted">Hasła gramy od poniedziałku do piątku. Nowe pojawi się w poniedziałek o ${g.new_word_hour || 8}:00. Twoja seria 🔥 czeka nienaruszona.</p>
        </div>`;
    } else if (g.supply_exhausted) {
      area.innerHTML = `
        <div class="empty-state">
          <div class="season-over-emoji">🏁</div>
          <h3>Pula haseł wyczerpana</h3>
          <p class="text-muted">Wszystkie hasła zostały rozegrane. Poproś admina o dorzucenie kolejnych!</p>
        </div>`;
    } else {
      area.innerHTML = `<div class="empty-state">Dziś nie ma hasła. Zajrzyj innego dnia! 🗓️</div>`;
    }
    return;
  }

  const finished = g.status === 'won' || g.status === 'lost';
  const expired = g.status === 'expired';
  const closed = finished || expired;
  const board = renderBoard(g);
  const keyboard = closed ? '' : renderKeyboard(g);
  const review = finished ? renderReview(g) : (expired ? renderExpired(g) : '');

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
  const closed = g.status === 'won' || g.status === 'lost' || g.status === 'expired';

  for (let r = 0; r < g.max_attempts; r++) {
    let tiles = '';
    let isCurrentRow = false;
    if (r < guesses.length) {
      const row = guesses[r];
      for (let c = 0; c < g.word_length; c++) {
        tiles += `<div class="tile tile-${row.statuses[c]} filled">${esc(row.guess[c])}</div>`;
      }
    } else if (r === guesses.length && !closed) {
      isCurrentRow = true;
      for (let c = 0; c < g.word_length; c++) {
        const ch = state.current[c] || '';
        tiles += `<div class="tile ${ch ? 'active' : ''}">${esc(ch)}</div>`;
      }
    } else {
      for (let c = 0; c < g.word_length; c++) tiles += `<div class="tile"></div>`;
    }
    const shakeCls = (isCurrentRow && state.shake) ? ' shake' : '';
    rows.push(`<div class="tile-row${shakeCls}">${tiles}</div>`);
  }
  return `<div class="board" style="--cols:${g.word_length}">${rows.join('')}</div>`;
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
  const speedLine = won && g.speed_bonus > 0
    ? `<div class="review-speed">⚡ ${g.win_place}. osoba dzisiaj — bonus +${g.speed_bonus} pkt</div>`
    : (won && g.win_place ? `<div class="review-speed muted">${g.win_place}. odgadnięcie dzisiaj — bonus za szybkość już rozdany</div>` : '');

  return `
    <div class="review-panel ${won ? 'win' : 'lose'}">
      ${answerLine}
      ${pointsLine}
      ${speedLine}
      <div class="review-stats">
        <div class="stat"><span class="stat-num">${g.stats.current_streak}</span><span class="stat-lbl">🔥 streak</span></div>
        <div class="stat"><span class="stat-num">${g.stats.best_streak}</span><span class="stat-lbl">rekord serii</span></div>
        <div class="stat"><span class="stat-num">${g.stats.season_points}</span><span class="stat-lbl">⭐ pkt w sezonie</span></div>
      </div>
      <button class="btn-primary btn-share" id="btn-share">📋 Udostępnij wynik</button>
      <div class="next-word-timer text-muted small">Nowe hasło za <span class="mono" id="next-word-timer">–</span></div>
    </div>
  `;
}

function renderExpired(g) {
  const hadGuesses = g.guesses && g.guesses.length;
  const shareBtn = hadGuesses ? `<button class="btn-primary btn-share" id="btn-share">📋 Udostępnij wynik</button>` : '';
  return `
    <div class="review-panel lose">
      <div class="review-headline lose">⏳ Czas na to hasło minął o północy. Było to: <span class="mono answer">${esc(g.answer)}</span></div>
      <div class="review-points muted">Nowe hasło pojawi się o ${g.new_word_hour || 8}:00</div>
      ${shareBtn}
      <div class="next-word-timer text-muted small">Nowe hasło za <span class="mono" id="next-word-timer">–</span></div>
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
    renderPoints(updated.stats.season_points);
    renderSeason(updated);
    renderGame();
    if (!wasFinished && updated.status === 'won') {
      showConfetti();
      const speedTxt = updated.speed_bonus > 0
        ? ` (⚡ ${updated.win_place}. dzisiaj, w tym +${updated.speed_bonus} za szybkość)`
        : '';
      showToast(`🎉 Brawo! +${updated.points_today} pkt${speedTxt}`);
      loadLeaderboard();
      loadDaily();
    } else if (!wasFinished && updated.status === 'lost') {
      showToast(`Koniec prób — hasło to ${updated.answer}`);
      loadLeaderboard();
      loadDaily();
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
document.getElementById('lb-season').addEventListener('change', e => {
  state.lbSeason = e.target.value;
  loadLeaderboard();
});

async function loadLeaderboard() {
  try {
    const q = state.lbSeason ? `&season=${encodeURIComponent(state.lbSeason)}` : '';
    const data = await api('GET', `/api/leaderboard?highlight=${state.playerId}${q}`);
    populateSeasonSelect(data);
    renderLeaderboard(data);
  } catch (e) {
    console.error('Leaderboard error:', e);
  }
}

// Selektor sezonów: bieżący miesiąc + wszystkie miesiące z historią + widok "wszystkie sezony"
function populateSeasonSelect(data) {
  const sel = document.getElementById('lb-season');
  const desired = data.season; // co faktycznie pokazujemy
  const opts = data.available_seasons.map(s =>
    `<option value="${s.is_current ? '' : s.id}">${esc(s.label)}${s.is_current ? ' (bieżący)' : ''}</option>`
  );
  opts.push(`<option value="all">Wszystkie sezony</option>`);
  sel.innerHTML = opts.join('');
  sel.value = desired === data.current_season ? '' : desired;
}

function renderLeaderboard(data) {
  const list = document.getElementById('leaderboard-list');
  document.getElementById('players-count').textContent = `${data.total_players} graczy`;

  if (!data.leaderboard.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:12px 4px">Nikt jeszcze nie zagrał w tym sezonie</div>';
    return;
  }

  list.innerHTML = data.leaderboard.map(p => {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank;
    const meClass = p.is_me ? ' is-me' : '';
    const avg = p.avg_attempts != null ? p.avg_attempts.toFixed(1) : '–';
    const streak = p.streak == null ? '🔥 –' : `🔥 ${p.streak}`;
    return `
      <div class="lb-row${meClass}">
        <span class="lb-rank">${medal}</span>
        <div class="lb-main">
          <div class="lb-top">
            <span class="lb-nick">${esc(p.nickname)}</span>
            <span class="lb-points mono">${p.total_points} <span class="lb-unit">pkt</span></span>
          </div>
          <div class="lb-stats">
            <span title="Seria (tylko bieżący sezon)">${streak}</span>
            <span title="Średnia liczba prób (wygrane)">⌀ ${avg} prób</span>
            <span title="Rozegrane dni">🗓 ${p.games_played}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── RANKING DNIA ──
async function loadDaily() {
  try {
    const data = await api('GET', `/api/wordle/daily?highlight=${state.playerId}`);
    renderDaily(data);
  } catch (e) {
    console.error('Daily ranking error:', e);
  }
}

function renderDaily(data) {
  const list = document.getElementById('daily-list');
  const countEl = document.getElementById('daily-count');

  if (!data.has_word) {
    countEl.textContent = '';
    const msg = data.is_weekend
      ? 'Weekend — ranking wróci w poniedziałek. 💤'
      : 'Dziś nie ma hasła.';
    list.innerHTML = `<div class="text-muted small" style="padding:12px 4px">${msg}</div>`;
    return;
  }

  const playing = data.in_progress ? ` · ${data.in_progress} w trakcie` : '';
  const spots = data.speed_spots_left
    ? ` · ⚡ ${data.speed_spots_left} ${pluralMiejsca(data.speed_spots_left)} z bonusem`
    : '';
  countEl.textContent = `${data.total} ukończonych${playing}${spots}`;

  if (!data.entries.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:12px 4px">Nikt jeszcze nie skończył dziś gry — bądź pierwszy i zgarnij ⚡ +5 pkt!</div>';
    return;
  }

  list.innerHTML = data.entries.map(e => {
    const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank;
    const meClass = e.is_me ? ' is-me' : '';
    const speed = e.speed_bonus > 0
      ? `<span class="daily-speed" title="${e.win_place}. odgadnięcie dzisiaj">⚡+${e.speed_bonus}</span>`
      : '';
    const detail = e.status === 'won'
      ? `<span class="daily-attempts">${e.attempts_used} ${pluralProby(e.attempts_used)}</span>${speed}<span class="daily-pts mono">+${e.points}</span>`
      : `<span class="daily-attempts lost">✗ nie trafił</span><span class="daily-pts mono">0</span>`;
    return `
      <div class="lb-row${meClass}">
        <span class="lb-rank">${medal}</span>
        <span class="daily-nick">${esc(e.nickname)}</span>
        <span class="daily-detail">${detail}</span>
      </div>`;
  }).join('');
}

function pluralMiejsca(n) {
  if (n === 1) return 'miejsce';
  const last = n % 10, teen = n % 100;
  if (last >= 2 && last <= 4 && !(teen >= 12 && teen <= 14)) return 'miejsca';
  return 'miejsc';
}

function pluralProby(n) {
  if (n === 1) return 'próba';
  const last = n % 10, teen = n % 100;
  if (last >= 2 && last <= 4 && !(teen >= 12 && teen <= 14)) return 'próby';
  return 'prób';
}

// ── COUNTDOWN (do najbliższego dnia roboczego = nowe hasło) ──
function warsawNowParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = t => Number(parts.find(p => p.type === t).value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

function fmtHMS(secs) {
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Sekundy do pojawienia się kolejnego hasła = najbliższy dzień roboczy o godzinie NEW_WORD_HOUR
function secondsUntilNextAppearance(newHour) {
  const { y, mo, d, h, mi, s } = warsawNowParts();
  const nowSec = h * 3600 + mi * 60 + s;
  const todayDow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  // Dziś dzień roboczy i jeszcze przed godziną otwarcia → dzisiejsze 08:00
  if (todayDow !== 0 && todayDow !== 6 && nowSec < newHour * 3600) {
    return newHour * 3600 - nowSec;
  }
  // W przeciwnym razie: najbliższy kolejny dzień roboczy o 08:00
  let secs = 24 * 3600 - nowSec; // do jutra 00:00
  let dow = new Date(Date.UTC(y, mo - 1, d + 1)).getUTCDay();
  while (dow === 0 || dow === 6) { secs += 24 * 3600; dow = (dow + 1) % 7; }
  return secs + newHour * 3600;
}

function secondsUntilMidnight() {
  const { h, mi, s } = warsawNowParts();
  return 24 * 3600 - (h * 3600 + mi * 60 + s);
}

function updateCountdown() {
  const g = state.game;
  const newHour = (g && g.new_word_hour) || 8;
  const toNext = secondsUntilNextAppearance(newHour);

  const barEl = document.getElementById('countdown-bar');
  const textEl = document.getElementById('countdown-text');

  if (g && g.is_weekend) {
    textEl.textContent = `💤 Weekend — nowe hasło za ${fmtHMS(toNext)}`;
  } else if (g && g.phase === 'expired') {
    textEl.textContent = `🔒 Wpisywanie zamknięte — nowe hasło za ${fmtHMS(toNext)}`;
  } else if (g && g.phase === 'live') {
    // W trakcie gry ważny jest deadline wpisywania (północ); nowe hasło i tak o 8:00
    textEl.textContent = `⏳ Wpisujesz do północy (${fmtHMS(secondsUntilMidnight())}) · nowe hasło o ${newHour}:00`;
  } else {
    textEl.textContent = `⏳ Nowe hasło za ${fmtHMS(toNext)}`;
  }
  if (barEl) barEl.style.width = ((1 - (toNext % 86400) / 86400) * 100) + '%';

  const timerEl = document.getElementById('next-word-timer');
  if (timerEl) timerEl.textContent = fmtHMS(toNext);
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
document.getElementById('btn-how-desktop').addEventListener('click', () => {
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
