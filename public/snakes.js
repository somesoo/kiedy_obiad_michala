// ── STATE ──
let state = {
  playerId: null,
  token: null,
  nickname: null,
  game: null,        // ostatni stan z /api/snakes/state
  busy: false,
  pendingUse: null,  // typ power-upa czekający na wybór celu
};

const POWERUP_META = {
  freeze:      { icon: '❄️', name: 'Freeze',      desc: 'Zatrzymuje wybranego gracza w jego następnej turze.', targeted: true },
  curse:       { icon: '💀', name: 'Curse',       desc: 'Klątwa — 1 z 3 losowych wariantów (efekty w przygotowaniu).', targeted: true },
  double_move: { icon: '⏩', name: 'Double Move',  desc: 'Twój następny ruch to dwa rzuty naraz.', targeted: false },
};

const TILE_ICON = { ladder: '🪜', snake: '🐍', bonus: '⭐' };

// ── STORAGE (te same klucze co Wordle — jedno konto) ──
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
  state.playerId = Number(id);
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
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('user-nick-display').textContent = '';
  document.getElementById('user-balance-display').textContent = '';
});

// ── APP MAIN ──
function startApp() {
  loadState();
  setInterval(updateCountdown, 1000);
}

async function loadState() {
  try {
    state.game = await api('GET', '/api/snakes/state');
    renderAll();
    updateCountdown();
  } catch (e) {
    console.error('Błąd ładowania gry:', e);
  }
}

function renderAll() {
  const g = state.game;
  if (!g) return;
  renderStats(g);
  renderBoard(g);
  renderShop(g);
  renderLeaderboard(g);
  renderRollButton(g);
  renderEffectsHint(g);
}

// ── STATY ──
function renderStats(g) {
  document.getElementById('user-balance-display').textContent = `💰 ${g.me.balance} pkt`;
  document.getElementById('stat-points').textContent = g.me.total_points;
  document.getElementById('stat-balance').textContent = g.me.balance;
  document.getElementById('stat-tile').textContent = g.me.tile;
  document.getElementById('stat-laps').textContent = g.me.laps;
}

// ── PLANSZA (serpentyna 10×10, pętla) ──
function renderBoard(g) {
  const area = document.getElementById('board-area');
  const size = g.board.size;
  const cols = 10;
  const rows = Math.ceil(size / cols);

  // mapy: pole -> kafel specjalny, pole -> gracze
  const special = {};
  g.board.tiles.forEach(t => { special[t.position] = t; });
  const pawns = {};
  g.players.forEach(p => { (pawns[p.tile] = pawns[p.tile] || []).push(p); });

  let html = `<div class="sl-board" style="--cols:${cols}">`;
  // Wiersze od góry: najwyższy indeks u góry, serpentyna jak w klasycznej planszy.
  for (let rowFromTop = 0; rowFromTop < rows; rowFromTop++) {
    const boardRow = rows - 1 - rowFromTop;
    const leftToRight = boardRow % 2 === 0;
    for (let c = 0; c < cols; c++) {
      const col = leftToRight ? c : (cols - 1 - c);
      const idx = boardRow * cols + col;
      if (idx >= size) { html += `<div class="sl-cell sl-cell-empty"></div>`; continue; }
      html += renderCell(idx, special[idx], pawns[idx], g);
    }
  }
  html += `</div>`;
  html += renderLegend();
  area.innerHTML = html;
}

function renderCell(idx, sp, players, g) {
  let cls = 'sl-cell';
  let mark = '';
  if (sp) {
    cls += ` sl-${sp.kind}`;
    if (sp.kind === 'ladder') mark = `<span class="sl-mark" title="Drabina → ${sp.target}">🪜</span>`;
    else if (sp.kind === 'snake') mark = `<span class="sl-mark" title="Wąż → ${sp.target}">🐍</span>`;
    else if (sp.kind === 'bonus') mark = `<span class="sl-mark" title="Bonus +${sp.value} pkt">⭐</span>`;
  }
  const pawnsHtml = (players || []).map(p => {
    const meCls = p.is_me ? ' sl-pawn-me' : '';
    const initials = esc(p.nickname.slice(0, 2).toUpperCase());
    return `<span class="sl-pawn${meCls}" title="${esc(p.nickname)} (okr. ${p.laps})">${initials}</span>`;
  }).join('');
  return `
    <div class="${cls}">
      <span class="sl-idx">${idx}</span>
      ${mark}
      <div class="sl-pawns">${pawnsHtml}</div>
    </div>`;
}

function renderLegend() {
  return `
    <div class="sl-legend">
      <span>🪜 drabina — w górę</span>
      <span>🐍 wąż — w dół</span>
      <span>⭐ bonus — punkty</span>
      <span class="sl-legend-me">■ Twój pionek</span>
    </div>`;
}

// ── PRZYCISK RZUTU ──
function renderRollButton(g) {
  const btn = document.getElementById('btn-roll');
  const frozen = g.pending_effects.some(e => e.type === 'freeze');
  if (g.me.can_roll) {
    btn.disabled = false;
    btn.textContent = frozen ? '🎲 Rzuć (uwaga: masz Freeze!)' : '🎲 Rzuć kostką';
  } else {
    btn.disabled = true;
    btn.textContent = '✅ Ruch wykonany — wróć jutro';
  }
}

document.getElementById('btn-roll').addEventListener('click', roll);

async function roll() {
  const g = state.game;
  if (!g || !g.me.can_roll || state.busy) return;
  state.busy = true;
  const btn = document.getElementById('btn-roll');
  btn.disabled = true;
  try {
    const res = await api('POST', '/api/snakes/roll', {});
    state.game = res.state;
    renderAll();
    showRollResult(res.move);
  } catch (e) {
    showToast(e.message);
  } finally {
    state.busy = false;
  }
}

function showRollResult(m) {
  const el = document.getElementById('roll-result');
  if (m.frozen) {
    el.innerHTML = `<span class="roll-frozen">❄️ Zostałeś zamrożony! Ruch przepada — tura pominięta.</span>`;
    showToast('❄️ Freeze! Ktoś Cię zatrzymał — dziś nie ruszasz się z miejsca.');
    return;
  }
  const dice = m.rolls.map(r => `🎲${r}`).join(' + ');
  const b = m.breakdown;
  const parts = [];
  parts.push(`rzut ${b.pip}`);
  if (b.progress) parts.push(`postęp ${b.progress}`);
  if (b.laps) parts.push(`okrążenie ${b.laps}`);
  if (b.bonus) parts.push(`bonus ${b.bonus}`);
  const noteTxt = [];
  if (m.notes.includes('ladder')) noteTxt.push('🪜 drabina w górę!');
  if (m.notes.includes('snake')) noteTxt.push('🐍 wąż w dół!');
  if (m.notes.includes('bonus')) noteTxt.push('⭐ pole bonusowe!');
  if (m.double_move) noteTxt.push('⏩ podwójny ruch!');
  if (m.curse_applied) noteTxt.push('💀 dopadła Cię klątwa!');

  el.innerHTML = `
    <div class="roll-line"><strong>${dice}</strong> → pole <strong>${m.to_tile}</strong></div>
    <div class="roll-earned accent">+${m.earned} pkt <span class="text-muted small">(${parts.join(' · ')})</span></div>
    ${noteTxt.length ? `<div class="roll-notes">${noteTxt.join(' ')}</div>` : ''}`;

  if (m.completed_laps > 0 || m.earned >= 40) showConfetti();
}

// ── SKLEP ──
function renderShop(g) {
  const list = document.getElementById('shop-list');
  list.innerHTML = g.shop.map(item => {
    const meta = POWERUP_META[item.type];
    const owned = g.inventory[item.type] || 0;
    const canBuy = g.me.balance >= item.cost;
    const canUse = owned > 0;
    return `
      <div class="shop-item">
        <div class="shop-top">
          <span class="shop-name">${meta.icon} ${meta.name}</span>
          <span class="shop-cost mono">${item.cost} pkt</span>
        </div>
        <div class="shop-desc text-muted small">${meta.desc}</div>
        <div class="shop-actions">
          <button class="btn-ghost shop-buy" data-type="${item.type}" ${canBuy ? '' : 'disabled'}>Kup</button>
          <button class="btn-primary shop-use" data-type="${item.type}" ${canUse ? '' : 'disabled'}>Użyj${owned ? ` (${owned})` : ''}</button>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('shop-list').addEventListener('click', e => {
  const buy = e.target.closest('.shop-buy');
  const use = e.target.closest('.shop-use');
  if (buy) buyPowerup(buy.dataset.type);
  else if (use) usePowerup(use.dataset.type);
});

async function buyPowerup(type) {
  if (state.busy) return;
  state.busy = true;
  try {
    const res = await api('POST', '/api/snakes/shop/buy', { type });
    state.game = res.state;
    renderAll();
    showToast(`🛒 Kupiono: ${POWERUP_META[type].name}`);
  } catch (e) {
    showToast(e.message);
  } finally {
    state.busy = false;
  }
}

function usePowerup(type) {
  const meta = POWERUP_META[type];
  if (meta.targeted) {
    openTargetPicker(type);
  } else {
    doUse(type, null);
  }
}

async function doUse(type, targetId) {
  if (state.busy) return;
  state.busy = true;
  try {
    const body = { type };
    if (targetId != null) body.target_player_id = targetId;
    const res = await api('POST', '/api/snakes/shop/use', body);
    state.game = res.state;
    renderAll();
    const meta = POWERUP_META[type];
    if (type === 'curse') {
      showToast(`💀 Klątwa (wariant ${res.curse_variant}) rzucona!`);
    } else {
      showToast(`${meta.icon} ${meta.name} użyty!`);
    }
  } catch (e) {
    showToast(e.message);
  } finally {
    state.busy = false;
  }
}

// ── WYBÓR CELU ──
function openTargetPicker(type) {
  const g = state.game;
  state.pendingUse = type;
  const meta = POWERUP_META[type];
  document.getElementById('target-title').textContent = `${meta.icon} ${meta.name} — wybierz cel`;
  document.getElementById('target-sub').textContent = meta.desc;
  const others = g.players.filter(p => p.player_id !== state.playerId);
  const list = document.getElementById('target-list');
  if (!others.length) {
    list.innerHTML = `<div class="text-muted small">Brak innych graczy do wskazania. Zaproś kogoś do gry!</div>`;
  } else {
    list.innerHTML = others.map(p => `
      <button class="target-row" data-id="${p.player_id}">
        <span class="target-nick">${esc(p.nickname)}</span>
        <span class="target-meta text-muted small">pole ${p.tile} · okr. ${p.laps} · ${p.total_points} pkt${p.moved_today ? ' · ✅ ruszył się dziś' : ''}</span>
      </button>`).join('');
  }
  document.getElementById('target-modal').style.display = 'flex';
}

document.getElementById('target-list').addEventListener('click', e => {
  const row = e.target.closest('.target-row');
  if (!row) return;
  const targetId = Number(row.dataset.id);
  const type = state.pendingUse;
  closeTargetPicker();
  doUse(type, targetId);
});

function closeTargetPicker() {
  document.getElementById('target-modal').style.display = 'none';
  state.pendingUse = null;
}
document.getElementById('target-close').addEventListener('click', closeTargetPicker);
document.getElementById('target-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTargetPicker();
});

// ── EFEKTY OCZEKUJĄCE ──
function renderEffectsHint(g) {
  const el = document.getElementById('effects-hint');
  if (!g.pending_effects.length) { el.textContent = ''; return; }
  const txt = g.pending_effects.map(e => {
    const meta = POWERUP_META[e.type];
    const from = e.source_nickname ? ` od ${esc(e.source_nickname)}` : '';
    return `${meta.icon} ${meta.name}${from}`;
  }).join(', ');
  el.innerHTML = `⚠️ Czeka Cię w następnej turze: ${txt}`;
}

// ── LEADERBOARD ──
function renderLeaderboard(g) {
  const list = document.getElementById('leaderboard-list');
  document.getElementById('players-count').textContent = `${g.leaderboard.length} graczy`;
  if (!g.leaderboard.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:12px 4px">Nikt jeszcze nie zagrał — bądź pierwszy!</div>';
    return;
  }
  list.innerHTML = g.leaderboard.map(p => {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank;
    const meClass = p.is_me ? ' is-me' : '';
    return `
      <div class="lb-row${meClass}">
        <span class="lb-rank">${medal}</span>
        <div class="lb-main">
          <div class="lb-top">
            <span class="lb-nick">${esc(p.nickname)}</span>
            <span class="lb-points mono">${p.total_points} <span class="lb-unit">pkt</span></span>
          </div>
          <div class="lb-stats">
            <span title="Ukończone okrążenia">🔁 ${p.laps}</span>
            <span title="Aktualne pole">📍 ${p.tile}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── COUNTDOWN (do północy = nowy ruch) ──
function warsawNowParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = t => Number(parts.find(p => p.type === t).value);
  return { h: get('hour'), mi: get('minute'), s: get('second') };
}

function fmtHMS(secs) {
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function secondsUntilMidnight() {
  const { h, mi, s } = warsawNowParts();
  return 24 * 3600 - (h * 3600 + mi * 60 + s);
}

function updateCountdown() {
  const g = state.game;
  const toNext = secondsUntilMidnight();
  const textEl = document.getElementById('countdown-text');
  const barEl = document.getElementById('countdown-bar');
  if (g && g.me.can_roll) {
    textEl.textContent = `🎲 Masz ruch na dziś! Kolejny za ${fmtHMS(toNext)}`;
  } else {
    textEl.textContent = `🔒 Ruch wykonany — nowy ruch za ${fmtHMS(toNext)}`;
  }
  if (barEl) barEl.style.width = ((1 - toNext / 86400) * 100) + '%';
}

// ── CONFETTI ──
function showConfetti() {
  const container = document.getElementById('confetti-container');
  const icons = ['🎉', '⭐', '🐍', '🪜'];
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

// ── HOW IT WORKS ──
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
