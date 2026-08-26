// ── STATE ──
let state = {
  playerId: null,
  token: null,
  nickname: null,
  game: null,        // ostatni stan z /api/snakes/state
  busy: false,
  pendingUse: null,  // typ power-upa czekający na wybór celu
  pushFlash: null,   // Set<player_id> aktualnie podświetlanych wypchnięć (animacja)
};

const POWERUP_META = {
  freeze:      { icon: '❄️', name: 'Freeze',      desc: 'Zatrzymuje wybranego gracza w jego następnej turze.', targeted: true },
  curse:       { icon: '💀', name: 'Curse',       desc: 'Klątwa — 1 z 3 losowych wariantów (efekty w przygotowaniu).', targeted: true },
  double_move: { icon: '⏩', name: 'Double Move',  desc: 'Twój następny ruch to dwa rzuty naraz.', targeted: false },
  shield:      { icon: '🛡️', name: 'Shield',       desc: 'Obrona: blokuje najbliższy Freeze lub Curse wymierzony w Ciebie, po czym znika.', targeted: false },
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
  renderCoop(g);
}

// ── STATY ──
function renderStats(g) {
  document.getElementById('user-balance-display').textContent = `💰 ${g.me.balance} pkt`;
  document.getElementById('stat-points').textContent = g.me.total_points;
  document.getElementById('stat-balance').textContent = g.me.balance;
  document.getElementById('stat-tile').textContent = g.me.tile;
  document.getElementById('stat-laps').textContent = g.me.laps;
  const shieldEl = document.getElementById('shield-status');
  if (shieldEl) {
    shieldEl.innerHTML = g.me.has_shield
      ? '🛡️ <strong>Tarcza aktywna</strong> — zablokuje najbliższy Freeze/Curse'
      : '';
  }
}

// ── PLANSZA (serpentyna 7×7, pętla) ──
// Wymiary bierzemy z serwera (board.cols/rows), więc zmiana rozmiaru planszy
// po stronie backendu nie wymaga ruszania frontu.
function renderBoard(g) {
  const area = document.getElementById('board-area');
  const size = g.board.size;
  const cols = g.board.cols || 7;
  const rows = g.board.rows || Math.ceil(size / cols);

  // mapy: pole -> kafel specjalny, pole -> gracze
  const special = {};
  g.board.tiles.forEach(t => { special[t.position] = t; });
  const pawns = {};
  g.players.forEach(p => { (pawns[p.tile] = pawns[p.tile] || []).push(p); });

  let cells = '';
  // Wiersze od góry: najwyższy indeks u góry, serpentyna jak w klasycznej planszy.
  for (let rowFromTop = 0; rowFromTop < rows; rowFromTop++) {
    const boardRow = rows - 1 - rowFromTop;
    const leftToRight = boardRow % 2 === 0;
    for (let c = 0; c < cols; c++) {
      const col = leftToRight ? c : (cols - 1 - c);
      const idx = boardRow * cols + col;
      if (idx >= size) { cells += `<div class="sl-cell sl-cell-empty"></div>`; continue; }
      cells += renderCell(idx, special[idx], pawns[idx]);
    }
  }

  area.innerHTML = `
    <div class="sl-board-wrap">
      <div class="sl-board" style="--cols:${cols};--rows:${rows}">${cells}</div>
      ${renderConnectors(g, cols, rows)}
    </div>
    ${renderLegend()}`;
}

// Środek pola w procentach szerokości/wysokości planszy (serpentyna jak w renderBoard).
function tileCenter(idx, cols, rows) {
  const boardRow = Math.floor(idx / cols);
  const posInRow = idx % cols;
  const col = boardRow % 2 === 0 ? posInRow : (cols - 1 - posInRow);
  const rowFromTop = rows - 1 - boardRow;
  return {
    x: ((col + 0.5) / cols) * 100,
    y: ((rowFromTop + 0.5) / rows) * 100
  };
}

// Widoczne połączenia start→koniec dla KAŻDEGO węża i KAŻDEJ drabiny.
// Drabina: prosta, jasnozielona linia ze szczeblami (dasharray) i grotem u góry.
// Wąż: czerwona, wygięta krzywa z „głową" (kółkiem) na polu docelowym.
// Dzięki temu od razu widać, dokąd prowadzi każde pole — bez najeżdżania myszą.
function renderConnectors(g, cols, rows) {
  const links = g.board.tiles.filter(t => t.kind === 'ladder' || t.kind === 'snake');
  if (!links.length) return '';

  const parts = links.map(t => {
    const a = tileCenter(t.position, cols, rows);
    const b = tileCenter(t.target, cols, rows);
    const cls = t.kind === 'ladder' ? 'sl-link-ladder' : 'sl-link-snake';
    const title = t.kind === 'ladder'
      ? `Drabina: ${t.position} → ${t.target}`
      : `Wąż: ${t.position} → ${t.target}`;

    let path;
    if (t.kind === 'ladder') {
      path = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    } else {
      // Wygięcie prostopadłe do odcinka — wąż ma się „wić", a nie iść prosto.
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = 12; // siła wygięcia
      path = `M ${a.x} ${a.y} Q ${mx + (-dy / len) * k} ${my + (dx / len) * k} ${b.x} ${b.y}`;
    }
    return `
      <g class="${cls}">
        <title>${title}</title>
        <path d="${path}" />
      </g>`;
  }).join('');

  return `<svg class="sl-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${parts}</svg>`
    + renderLinkDots(links, cols, rows);
}

// Kropki na początku i końcu każdego połączenia. Świadomie w HTML, nie w SVG:
// warstwa SVG jest rozciągana (preserveAspectRatio="none"), więc <circle> zrobiłby się
// elipsą, gdy kafelki są prostokątne. Element HTML pozycjonowany procentowo zostaje kołem.
function renderLinkDots(links, cols, rows) {
  const dots = links.map(t => {
    const a = tileCenter(t.position, cols, rows);
    const b = tileCenter(t.target, cols, rows);
    const kind = t.kind === 'ladder' ? 'ladder' : 'snake';
    return `
      <span class="sl-dot sl-dot-start sl-dot-${kind}" style="left:${a.x}%;top:${a.y}%"></span>
      <span class="sl-dot sl-dot-end sl-dot-${kind}" style="left:${b.x}%;top:${b.y}%"></span>`;
  }).join('');
  return `<div class="sl-link-dots" aria-hidden="true">${dots}</div>`;
}

function renderCell(idx, sp, players) {
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
    const shieldCls = p.has_shield ? ' sl-pawn-shielded' : '';
    const pushCls = (state.pushFlash && state.pushFlash.has(p.player_id)) ? ' sl-pawn-pushed' : '';
    const shieldBadge = p.has_shield ? `<span class="sl-pawn-shield">🛡️</span>` : '';
    const initials = esc(p.nickname.slice(0, 2).toUpperCase());
    const tip = `${esc(p.nickname)} (okr. ${p.laps})${p.has_shield ? ' — chroniony tarczą' : ''}`;
    return `<span class="sl-pawn${meCls}${shieldCls}${pushCls}" title="${tip}">${initials}${shieldBadge}</span>`;
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
      <span class="sl-legend-ladder">━ 🪜 drabina — w górę</span>
      <span class="sl-legend-snake">〜 🐍 wąż — w dół</span>
      <span>⭐ bonus — punkty</span>
      <span>🛡️ gracz z tarczą</span>
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
    if (res.move.knockback && res.move.knockback.length) flashKnockback(res.move.knockback);
  } catch (e) {
    showToast(e.message);
  } finally {
    state.busy = false;
  }
}

// Krótkie podświetlenie pionków, które zostały wypchnięte tym rzutem — pulsują
// przez ~1.6s, żeby wypchnięcie (i efekt domina) było widoczne na planszy.
function flashKnockback(chain) {
  state.pushFlash = new Set(chain.map(k => k.player_id));
  renderBoard(state.game);
  setTimeout(() => {
    state.pushFlash = null;
    if (state.game) renderBoard(state.game);
  }, 1600);
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
  if (m.knockback && m.knockback.length) {
    const names = m.knockback.map(k => esc(k.nickname)).join(', ');
    noteTxt.push(`💥 wypchnąłeś: ${names}!`);
  }

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
    if (res.blocked) {
      showToast(`🛡️ Cel miał tarczę — atak zablokowany! Power-up przepadł.`);
    } else if (type === 'curse') {
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

// ── WYDARZENIE KOOPERACYJNE ──
// Wspólna pula widoczna dla wszystkich: pasek postępu, lista kontrybutorów
// i pole do dorzucenia własnych punktów. Po przekroczeniu progu rusza event bossowy.
function renderCoop(g) {
  const c = g.coop;
  if (!c) return;
  const el = document.getElementById('coop-panel');
  if (!el) return;

  const splitLabel = c.reward_split === 'flat' ? 'po równo' : 'proporcjonalnie do wkładu';
  const chips = c.contributors.length
    ? `<div class="coop-chips">` + c.contributors.map(x =>
        `<span class="coop-chip${x.player_id === state.playerId ? ' is-me' : ''}">${esc(x.nickname)}<span class="coop-amt mono">${x.amount}</span></span>`
      ).join('') + `</div>`
    : `<div class="coop-chips"><span class="text-muted small">Nikt jeszcze nic nie dorzucił — bądź pierwszy!</span></div>`;

  let action;
  if (c.status === 'collecting') {
    action = `
      <div class="coop-form">
        <input type="number" id="coop-amount" min="1" step="1" placeholder="ile pkt?" />
        <button class="btn-primary" id="btn-coop-give" ${g.me.balance > 0 ? '' : 'disabled'}>Dorzuć</button>
      </div>`;
  } else if (c.status === 'event_active') {
    action = `<div class="coop-event">👹 <strong>Boss się obudził!</strong> Wydarzenie trwa — zbiórka zamknięta.</div>`;
  } else {
    action = `<div class="coop-event">🏆 Wydarzenie ukończone. Nowa zbiórka wkrótce.</div>`;
  }

  const deadline = c.status === 'collecting'
    ? `<span class="coop-deadline mono" id="coop-deadline" data-until="${esc(c.window_ends_at)}">⏳ –</span>`
    : '';

  el.innerHTML = `
    <div class="coop-head">
      <span class="coop-title">🤝 WSPÓLNA PULA <span class="coop-cycle text-muted">· edycja #${c.cycle}</span></span>
      <span class="coop-total mono">${c.total} / ${c.threshold} (${c.percent}%)</span>
    </div>
    <div class="coop-bar"><div class="coop-bar-fill" style="width:${c.percent}%"></div></div>
    <div class="coop-body">
      <div class="coop-sub text-muted small">
        Nagrody: <strong>${c.reward_pool} pkt</strong> · podział ${splitLabel} · Twój wkład: <strong>${c.my_contribution}</strong>
        ${deadline ? `· kara za niedobicie: <strong>-${c.penalty_amount} pkt</strong>/gracza` : ''}
      </div>
      ${action}
    </div>
    ${deadline}
    ${chips}`;
  updateCoopDeadline();
}

// Odświeża licznik czasu do zamknięcia okna co-op (wołane co sekundę z updateCountdown).
function updateCoopDeadline() {
  const el = document.getElementById('coop-deadline');
  if (!el) return;
  const until = Date.parse(el.dataset.until);
  const secs = Math.max(0, Math.round((until - Date.now()) / 1000));
  const days = Math.floor(secs / 86400);
  const rest = secs % 86400;
  const daysTxt = days > 0 ? `${days}d ` : '';
  el.textContent = `⏳ okno zamyka się za: ${daysTxt}${fmtHMS(rest)}`;
}

document.getElementById('coop-panel').addEventListener('click', e => {
  if (e.target.closest('#btn-coop-give')) contributeCoop();
});
document.getElementById('coop-panel').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'coop-amount') contributeCoop();
});

async function contributeCoop() {
  if (state.busy) return;
  const input = document.getElementById('coop-amount');
  const amount = parseInt(input && input.value, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    showToast('Podaj dodatnią liczbę punktów.');
    return;
  }
  state.busy = true;
  try {
    const res = await api('POST', '/api/snakes/coop/contribute', { amount });
    state.game = res.state;
    renderAll();
    if (res.triggered) {
      showConfetti();
      showToast('👹 Próg osiągnięty — boss się budzi! Wydarzenie wystartowało.');
    } else {
      showToast(`🤝 Dorzucono ${amount} pkt do wspólnej puli.`);
    }
  } catch (e) {
    showToast(e.message);
  } finally {
    state.busy = false;
  }
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
  updateCoopDeadline();
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
