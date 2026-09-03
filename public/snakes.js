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
  freeze:      { icon: '❄️', name: 'Freeze',      desc: 'Zatrzymuje wybranego gracza w jego następnej turze. Cel nic nie widzi — reszta stołu wie tylko, że użyłeś Freeze, nie na kim.', targeted: true },
  curse:       { icon: '💀', name: 'Curse',       desc: 'Klątwa — 1 z 8 losowych wariantów (odwrotny ruch, rozdwojona kostka, kradzież monet, droższe zakupy i inne). Cel dowie się, jaka, dopiero gdy odpali.', targeted: true },
  double_move: { icon: '⏩', name: 'Double Move',  desc: 'Dokłada Ci jeden ruch ponad dzienny limit — do wykonania od razu po użyciu.', targeted: false },
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
  if (!r.ok) {
    // Doklejamy pełną odpowiedź do błędu — niektóre odmowy niosą dane, na których
    // nam zależy (np. 409 z prawdziwą pozycją i świeżym stanem przy rzucie).
    const err = new Error(data.error || 'Błąd serwera');
    err.status = r.status;
    err.data = data;
    throw err;
  }
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
async function startApp() {
  await loadState();
  if (state.game && !state.game.me.has_avatar) {
    showAvatarOverlay();
  } else {
    loadActivity();
  }
  setInterval(updateCountdown, 1000);
  setInterval(pollState, SL_POLL_MS);
  // Powrót do karty = natychmiastowe dociągnięcie stanu, bez czekania na tik.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollState(); });
}

// ── ODŚWIEŻANIE W TLE ──
// Snakes jest asynchroniczne: wypchnięcia, Freeze/Curse i wpłaty do wspólnej puli
// robią inni gracze, w dowolnym momencie. Bez tego plansza pokazywałaby stan sprzed
// wypchnięcia aż do przeładowania strony — a gracz rzucałby „z pola", na którym już
// nie stoi (serwer i tak liczy od prawdziwej pozycji, patrz weryfikacja przy rzucie).
const SL_POLL_MS = 10000;
let pollInFlight = false;

// Skrót stanu — przerysowujemy TYLKO, gdy faktycznie coś się zmieniło. Inaczej co 10 s
// gubilibyśmy kwotę wpisaną w zbiórce, focus i pozycję scrolla w dzienniku.
function stateSignature(g) {
  return JSON.stringify([
    g.players.map(p => [p.player_id, p.abs_pos, p.total_points]),
    g.me.abs_pos, g.me.balance, g.me.total_points, g.me.rolls_remaining_today,
    g.me.can_roll, g.me.has_shield,
    g.pending_effects.map(e => e.type),
    g.inventory,
    g.coop ? [g.coop.status, g.coop.attackers.length, g.coop.boss ? g.coop.boss.hp : null] : null
  ]);
}

async function pollState() {
  // Nie wchodzimy w drogę trwającej akcji ani otwartym modalom (wybór celu, awatar),
  // i nie odpytujemy serwera, gdy karta siedzi w tle.
  if (pollInFlight || state.busy || state.pendingUse) return;
  if (!state.game || !state.token || document.hidden) return;
  const avatarOverlay = document.getElementById('avatar-overlay');
  if (avatarOverlay && avatarOverlay.style.display !== 'none') return;
  pollInFlight = true;
  try {
    const g = await api('GET', '/api/snakes/state');
    const prev = state.game;
    if (!prev || stateSignature(g) === stateSignature(prev)) return;
    // Pozycja zmieniła się bez naszego rzutu (rzut idzie przez roll(), a wtedy
    // state.busy blokuje polling) — czyli ktoś nas wypchnął.
    const pushedMeanwhile = prev.me.abs_pos !== g.me.abs_pos;
    state.game = g;
    renderAll();
    updateCountdown();
    loadActivity(document.getElementById('activity-date').value || null);
    if (pushedMeanwhile) {
      flashKnockback([{ player_id: state.playerId }]);
      showToast(`💥 Ktoś Cię wypchnął — stoisz teraz na polu ${g.me.tile}. Kolejny rzut liczy się stąd.`);
    }
  } catch (e) {
    console.error('Odświeżanie stanu w tle nie powiodło się:', e);
  } finally {
    pollInFlight = false;
  }
}

// ── ZDJĘCIE PROFILOWE (wymagane, żeby zagrać — i wymienialne w każdej chwili) ──
// Kadruje wgrany plik do kwadratu (cover-crop, jak object-fit:cover) i eksportuje
// jako JPEG przez <canvas> — trzyma przesyłany rozmiar małym niezależnie od tego,
// jak duże zdjęcie wgra użytkownik, i gwarantuje, że serwer zawsze dostaje realny JPEG.
let avatarBlob = null;
let avatarOverlayMandatory = true; // false = otwarty dobrowolnie do zmiany — wolno zamknąć bez uploadu

// `mandatory` = true (domyślnie): ekran blokujący grę, bez możliwości zamknięcia (brak
// zdjęcia). `mandatory` = false: dobrowolna zmiana już istniejącego zdjęcia — gra zostaje
// widoczna pod spodem, pojawia się ✕, a podgląd startuje od AKTUALNEGO zdjęcia gracza.
function showAvatarOverlay(mandatory = true) {
  avatarOverlayMandatory = mandatory;
  avatarBlob = null;
  document.getElementById('avatar-overlay-close').style.display = mandatory ? 'none' : 'block';
  document.getElementById('avatar-overlay-title').textContent = mandatory ? 'Dodaj zdjęcie' : 'Zmień zdjęcie';
  document.getElementById('avatar-overlay-sub').textContent = mandatory
    ? 'Żeby zagrać, potrzebujesz zdjęcia — Twojego albo dowolnego innego. Będzie widoczne jako okrągły awatar na wspólnej planszy; najedź na niego myszką, żeby zobaczyć większy podgląd i nick.'
    : 'Wybierz nowe zdjęcie — zastąpi poprzednie wszędzie, gdzie się pojawiasz (plansza, wybór celu).';
  document.getElementById('avatar-error').textContent = '';
  document.getElementById('avatar-file').value = '';
  document.getElementById('btn-avatar-upload').disabled = true;

  const preview = document.getElementById('avatar-preview');
  const myUrl = state.game && state.game.me.avatar_url;
  if (!mandatory && myUrl) {
    preview.src = myUrl;
    preview.classList.add('has-img');
  } else {
    preview.removeAttribute('src');
    preview.classList.remove('has-img');
  }

  if (mandatory) document.getElementById('main-content').style.display = 'none';
  document.getElementById('avatar-overlay').style.display = 'flex';
}

function hideAvatarOverlay() {
  document.getElementById('avatar-overlay').style.display = 'none';
  document.getElementById('main-content').style.display = 'grid';
}

document.getElementById('btn-change-avatar').addEventListener('click', () => showAvatarOverlay(false));
document.getElementById('avatar-overlay-close').addEventListener('click', () => {
  if (!avatarOverlayMandatory) hideAvatarOverlay();
});

// ── WIĘKSZY PODGLĄD ZDJĘCIA NA HOVER ──
// Delegacja na document (nie na poszczególnych <img>) — pionki i miniatury w wyborze
// celu są re-renderowane co chwilę, więc listenery wpięte bezpośrednio w nie
// znikałyby przy każdym odświeżeniu. Działa dla każdego .sl-pawn-avatar / .target-avatar,
// niezależnie kiedy powstał.
const AVATAR_HOVER_SELECTOR = '.sl-pawn-avatar, .target-avatar, .my-avatar-thumb';

function positionAvatarHoverPreview(x, y) {
  const el = document.getElementById('avatar-hover-preview');
  const pad = 18, w = 180, h = 180;
  let left = x + pad, top = y + pad;
  if (left + w > window.innerWidth) left = x - w - pad;
  if (top + h > window.innerHeight) top = y - h - pad;
  el.style.left = Math.max(4, left) + 'px';
  el.style.top = Math.max(4, top) + 'px';
}

document.addEventListener('mouseover', e => {
  const img = e.target.closest(AVATAR_HOVER_SELECTOR);
  if (!img || !img.src) return;
  document.getElementById('avatar-hover-img').src = img.src;
  positionAvatarHoverPreview(e.clientX, e.clientY);
  document.getElementById('avatar-hover-preview').style.display = 'block';
});
document.addEventListener('mousemove', e => {
  const preview = document.getElementById('avatar-hover-preview');
  if (preview.style.display === 'block') positionAvatarHoverPreview(e.clientX, e.clientY);
});
document.addEventListener('mouseout', e => {
  if (!e.target.closest(AVATAR_HOVER_SELECTOR)) return;
  document.getElementById('avatar-hover-preview').style.display = 'none';
});

function resizeImageToJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Nie udało się przetworzyć zdjęcia.')), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie udało się wczytać pliku jako obrazek.')); };
    img.src = url;
  });
}

document.getElementById('avatar-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  const errEl = document.getElementById('avatar-error');
  const btn = document.getElementById('btn-avatar-upload');
  errEl.textContent = '';
  if (!file) return;
  try {
    avatarBlob = await resizeImageToJpeg(file, 320);
    const preview = document.getElementById('avatar-preview');
    preview.src = URL.createObjectURL(avatarBlob);
    preview.classList.add('has-img');
    btn.disabled = false;
  } catch (err) {
    avatarBlob = null;
    btn.disabled = true;
    errEl.textContent = err.message;
  }
});

document.getElementById('btn-avatar-upload').addEventListener('click', async () => {
  if (!avatarBlob || state.busy) return;
  const btn = document.getElementById('btn-avatar-upload');
  const errEl = document.getElementById('avatar-error');
  state.busy = true;
  btn.disabled = true;
  errEl.textContent = '';
  try {
    const r = await fetch('/api/snakes/avatar', {
      method: 'POST',
      headers: { 'X-Token': state.token, 'Content-Type': 'application/octet-stream' },
      body: avatarBlob
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Błąd serwera');
    const wasMandatory = avatarOverlayMandatory;
    state.game = data.state;
    hideAvatarOverlay();
    renderAll();
    loadActivity();
    showToast(wasMandatory ? '🖼️ Zdjęcie wgrane — możesz grać!' : '🖼️ Zdjęcie zaktualizowane!');
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false;
  } finally {
    state.busy = false;
  }
});

// ── HISTORIA AKTYWNOŚCI (prawa kolumna) ──
const ACTIVITY_ICONS = { roll: '🎲', shop_buy: '🛒', shop_use: '⚡', knockback: '💥', avatar: '🖼️', boss_hit: '⚔️' };

async function loadActivity(date) {
  try {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    const data = await api('GET', `/api/snakes/activity${q}`);
    renderActivity(data);
  } catch (e) {
    console.error('Błąd ładowania historii:', e);
  }
}

function renderActivity(data) {
  // Lista dni przebudowuje się, gdy ZESTAW dni się zmienił — nie tylko raz na życie
  // strony. Admin może ukryć cały dzień (patrz moderacja widoku na serwerze) i wtedy
  // stara lista trzymałaby datę, po wybraniu której nie ma już czego pokazać.
  const sel = document.getElementById('activity-date');
  if (sel) {
    const signature = data.dates.join(',');
    if (sel.dataset.days !== signature) {
      const keep = sel.value;
      sel.innerHTML = ['<option value="">Ostatnie</option>']
        .concat(data.dates.map(d => `<option value="${d}">${d}</option>`))
        .join('');
      sel.dataset.days = signature;
      if (keep && data.dates.includes(keep)) sel.value = keep;
    }
  }

  const list = document.getElementById('activity-list');
  if (!list) return;
  if (!data.entries.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:8px 4px">Brak aktywności.</div>';
    return;
  }

  let lastDay = null;
  let html = '';
  for (const e of data.entries) {
    if (e.date !== lastDay) {
      html += `<div class="activity-day">${esc(e.date)}</div>`;
      lastDay = e.date;
    }
    const time = new Date(e.created_at.replace(' ', 'T') + 'Z')
      .toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
    const icon = ACTIVITY_ICONS[e.type] || '•';
    html += `
      <div class="activity-entry">
        <span class="activity-time mono">${time}</span>
        <span class="activity-icon">${icon}</span>
        <span class="activity-body"><strong>${esc(e.nickname)}</strong> ${esc(e.detail)}</span>
      </div>`;
  }
  list.innerHTML = html;
}

document.getElementById('activity-date').addEventListener('change', e => loadActivity(e.target.value || null));

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
  const thumb = document.getElementById('my-avatar-thumb');
  if (thumb && g.me.avatar_url) thumb.src = g.me.avatar_url;
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
// Wysokość „szczeliny” między wierszami (sumarycznie), jako ułamek wysokości
// standardowego wiersza. Każda szczelina dzieli się na DWIE połówki — po jednej dla
// każdego z dwóch kafelków zakrętu, które się w niej stykają (kafelek KOŃCZĄCY wiersz
// poniżej i kafelek ZACZYNAJĄCY wiersz powyżej), więc oba rosną symetrycznie i spotykają
// się pośrodku szczeliny. Pozostałe kafelki (bez zakrętu) mają standardową wysokość,
// a cała szczelina między nimi zostaje pusta — to tworzy wizualną przerwę między wierszami.
const SL_ROW_GAP_FR = 0.35;
const SL_ROW_HALF_GAP_FR = SL_ROW_GAP_FR / 2;

// Geometria pola: który to wiersz/kolumna (licząc od góry planszy) i czy to kafelek
// "na zakręcie" — a jeśli tak, to której strony: EXIT (ostatni odwiedzany w wierszu,
// stąd ścieżka skacze do wiersza NAD nim) czy ENTRY (pierwszy odwiedzany w wierszu,
// TU ścieżka weszła z wiersza POD nim). To ta sama para kolumn co w klasycznym
// boustrophedon — EXIT wiersza r i ENTRY wiersza r+1 leżą w tej samej kolumnie.
function slTileGeometry(idx, cols, rows) {
  const boardRow = Math.floor(idx / cols);
  const posInRow = idx % cols;
  const leftToRight = boardRow % 2 === 0;
  const col = leftToRight ? posInRow : (cols - 1 - posInRow);
  const rowFromTop = rows - 1 - boardRow;
  const exitCol = leftToRight ? cols - 1 : 0;
  const entryCol = leftToRight ? 0 : cols - 1;
  const isExit = boardRow < rows - 1 && col === exitCol;
  const isEntry = boardRow > 0 && col === entryCol;
  return { boardRow, col, rowFromTop, isExit, isEntry, isTurn: isExit || isEntry };
}

// CSS grid-row dla danego pola. Tory idą w trójkach: standard, pół-szczelina-A,
// pół-szczelina-B, standard, ... (patrz grid-template-rows w renderBoard) —
// standardowy tor dla rowFromTop=m zaczyna się na linii 3m+1. Kafelek EXIT dokłada
// do siebie pół-szczelinę B tuż NAD sobą (w stronę wiersza, do którego skręca);
// kafelek ENTRY dokłada pół-szczelinę A tuż POD sobą (w stronę wiersza, z którego
// przyszedł) — oba rosną o tyle samo, każdy w swoją stronę, spotykając się pośrodku.
function slGridRowStyle(rowFromTop, isExit, isEntry) {
  const m = rowFromTop;
  if (isExit) return `${3 * m} / ${3 * m + 2}`;
  if (isEntry) return `${3 * m + 1} / ${3 * m + 3}`;
  return `${3 * m + 1} / ${3 * m + 2}`;
}

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
      const { isExit, isEntry, isTurn } = slTileGeometry(idx, cols, rows);
      const rowStyle = slGridRowStyle(rowFromTop, isExit, isEntry);
      if (idx >= size) { cells += `<div class="sl-cell sl-cell-empty" style="grid-row:${rowStyle}"></div>`; continue; }
      cells += renderCell(idx, special[idx], pawns[idx], rowStyle, isTurn);
    }
  }

  // grid-template-rows liczony w JS (nie w statycznym CSS): powtarza [standard, pół-szczelina,
  // pół-szczelina] dla każdej pary wierszy poza ostatnim, kończąc samym standardowym torem u góry.
  const rowTemplate = `repeat(${rows - 1}, 1fr ${SL_ROW_HALF_GAP_FR}fr ${SL_ROW_HALF_GAP_FR}fr) 1fr`;

  area.innerHTML = `
    <div class="sl-board-wrap">
      <div class="sl-board" style="--cols:${cols};grid-template-rows:${rowTemplate}">${cells}</div>
      ${renderConnectors(g, cols, rows)}
    </div>
    ${renderLegend()}`;
}

// Środek pola w procentach szerokości/wysokości planszy — uwzględnia wydłużenie
// kafelków na zakręcie, żeby linie łączników (drabiny/węże) i tak trafiały w środek
// realnie wyrenderowanego kafelka, a nie w środek "standardowej" wysokości wiersza.
function tileCenter(idx, cols, rows) {
  const { col, rowFromTop, isExit, isEntry } = slTileGeometry(idx, cols, rows);
  const totalWeight = rows + (rows - 1) * SL_ROW_GAP_FR; // suma wag = bez zmian (szczelina tylko podzielona na pół)
  const stdStart = rowFromTop * (1 + SL_ROW_GAP_FR); // suma wag torów przed tym wierszem
  let centerWeight = stdStart + 0.5;
  if (isExit) centerWeight -= SL_ROW_HALF_GAP_FR / 2;
  else if (isEntry) centerWeight += SL_ROW_HALF_GAP_FR / 2;
  return {
    x: ((col + 0.5) / cols) * 100,
    y: (centerWeight / totalWeight) * 100
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

function renderCell(idx, sp, players, rowStyle, isTurn) {
  let cls = 'sl-cell';
  if (isTurn) cls += ' sl-cell-turn';
  let mark = '';
  if (sp) {
    cls += ` sl-${sp.kind}`;
    if (sp.kind === 'ladder') mark = `<span class="sl-mark" title="Drabina → ${sp.target}">🪜</span>`;
    else if (sp.kind === 'snake') mark = `<span class="sl-mark" title="Wąż → ${sp.target}">🐍</span>`;
    else if (sp.kind === 'bonus') mark = `<span class="sl-mark" title="Bonus +${sp.value} pkt">⭐</span>`;
  }
  // Pionek = okrągłe zdjęcie profilowe; serwer zwraca w `players` WYŁĄCZNIE graczy,
  // którzy je wgrali (bez zdjęcia = nie widać na planszy), więc avatar_url zawsze jest.
  // Nick pojawia się po najechaniu myszką (natywny tooltip z title).
  const pawnsHtml = (players || []).map(p => {
    const meCls = p.is_me ? ' sl-pawn-me' : '';
    const shieldCls = p.has_shield ? ' sl-pawn-shielded' : '';
    const pushCls = (state.pushFlash && state.pushFlash.has(p.player_id)) ? ' sl-pawn-pushed' : '';
    const shieldBadge = p.has_shield ? `<span class="sl-pawn-shield">🛡️</span>` : '';
    const tip = `${esc(p.nickname)} (okr. ${p.laps})${p.has_shield ? ' — chroniony tarczą' : ''}`;
    return `
      <span class="sl-pawn-wrap${meCls}${shieldCls}${pushCls}" title="${tip}">
        <img class="sl-pawn-avatar" src="${p.avatar_url}" alt="${esc(p.nickname)}" loading="lazy" />
        ${shieldBadge}
      </span>`;
  }).join('');
  return `
    <div class="${cls}" style="grid-row:${rowStyle}">
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
  const left = g.me.rolls_remaining_today;
  if (g.me.can_roll) {
    btn.disabled = false;
    // Żadnej wzmianki o Freeze — serwer w ogóle nie zdradza nam, że ktoś nas zamroził
    // (patrz slPendingEffects). Dowiadujemy się dopiero po kliknięciu.
    const countTxt = g.me.daily_rolls > 1 ? ` (${left}/${g.me.daily_rolls})` : '';
    btn.textContent = `🎲 Rzuć kostką${countTxt}`;
  } else {
    btn.disabled = true;
    if (g.me.is_weekend) {
      btn.textContent = '🌴 Weekend — wróć w poniedziałek';
    } else if (left === 0) {
      btn.textContent = '✅ Ruchy wykorzystane — wróć jutro';
    } else if (!g.me.office_open) {
      btn.textContent = `🏢 Gramy ${g.me.office_start_hour}:00–${g.me.office_end_hour}:00 — wróć o ${g.me.office_start_hour}:00`;
    } else {
      // Zostaje już tylko brak zdjęcia profilowego — planszę i tak zasłania ekran uploadu.
      btn.textContent = '📸 Wgraj zdjęcie, żeby zagrać';
    }
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
    // `known_abs_pos` = pole, na którym mamy narysowany swój pionek. Serwer porówna je
    // ze stanem w bazie i odmówi rzutu, jeśli patrzymy na nieaktualną planszę.
    const res = await api('POST', '/api/snakes/roll', { known_abs_pos: g.me.abs_pos });
    state.game = res.state;
    renderAll();
    showRollResult(res.move);
    if (res.move.knockback && res.move.knockback.length) flashKnockback(res.move.knockback);
    loadActivity(document.getElementById('activity-date').value || null);
  } catch (e) {
    // Rzut odrzucony, bo ktoś nas wypchnął między odświeżeniami — NIE zużył ruchu.
    // Serwer dosyła świeży stan: przerysowujemy planszę i prosimy o ponowny rzut,
    // żeby gracz wiedział, z którego pola faktycznie startuje.
    if (e.data && e.data.stale_position) {
      state.game = e.data.state;
      renderAll();
      flashKnockback([{ player_id: state.playerId }]);
      showToast(`💥 Ktoś Cię wypchnął z pola ${e.data.known_tile} na ${e.data.actual_tile} — ruch NIE przepadł, rzuć jeszcze raz.`);
      loadActivity(document.getElementById('activity-date').value || null);
    } else {
      showToast(e.message);
    }
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
    const left = state.game ? state.game.me.rolls_remaining_today : 0;
    const leftTxt = left > 0 ? ` Zostało Ci jeszcze ${left} dzisiaj.` : ' To był ostatni ruch na dziś.';
    el.innerHTML = `<span class="roll-frozen">❄️ Zostałeś zamrożony! Ten ruch przepada.${leftTxt}</span>`;
    showToast(`❄️ Freeze! Ktoś Cię zatrzymał na jeden ruch.${leftTxt}`);
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
  if (m.curse_variant) {
    noteTxt.push(`💀 Klątwa: ${esc(m.curse_label)}!${m.curse_coin_steal ? ` (-${m.curse_coin_steal} 💰)` : ''}`);
  }
  if (m.knockback && m.knockback.length) {
    const names = m.knockback.map(k => esc(k.nickname)).join(', ');
    const coins = m.knockback.reduce((a, k) => a + (k.coins_stolen || 0), 0);
    noteTxt.push(`💥 wypchnąłeś: ${names}!${coins > 0 ? ` (+${coins} 💰 zabranych)` : ''}`);
  }
  if (m.boss_hit) {
    noteTxt.push(m.boss_hit.defeated
      ? `🏆 Ostateczny cios! ${esc(m.boss_hit.boss_name)} pokonany — nagrody wypłacone!`
      : `⚔️ -${m.boss_hit.damage} HP dla ${esc(m.boss_hit.boss_name)} (${m.boss_hit.hp_left}/${m.boss_hit.max_hp}).`);
  }

  el.innerHTML = `
    <div class="roll-line"><strong>${dice}</strong> → pole <strong>${m.to_tile}</strong></div>
    <div class="roll-earned accent">+${m.earned} pkt <span class="text-muted small">(${parts.join(' · ')})</span></div>
    ${noteTxt.length ? `<div class="roll-notes">${noteTxt.join(' ')}</div>` : ''}`;

  if (m.completed_laps > 0 || m.earned >= 40 || (m.boss_hit && m.boss_hit.defeated)) showConfetti();
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
    showToast(res.price_curse
      ? `${res.price_curse.label}! Kupiono ${POWERUP_META[type].name} za ${res.cost} pkt zamiast ${res.base_cost} (+${res.price_curse.extra}) — klątwa zdjęta.`
      : `🛒 Kupiono: ${POWERUP_META[type].name}`);
    loadActivity(document.getElementById('activity-date').value || null);
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
    } else if (res.extra_roll) {
      // Double Move działa od ręki — stan już przyszedł z dodatkowym slotem, więc
      // przycisk „Rzuć" jest w tym momencie odblokowany.
      showToast(`⏩ Dodatkowy ruch gotowy — rzucaj! (${state.game.me.rolls_remaining_today}/${state.game.me.daily_rolls} na dziś)`);
    } else if (type === 'curse') {
      showToast(`💀 Klątwa (wariant ${res.curse_variant}) rzucona!`);
    } else {
      showToast(`${meta.icon} ${meta.name} użyty!`);
    }
    loadActivity(document.getElementById('activity-date').value || null);
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
        <img class="target-avatar" src="${p.avatar_url}" alt="" />
        <span class="target-info">
          <span class="target-nick">${esc(p.nickname)}</span>
          <span class="target-meta text-muted small">pole ${p.tile} · okr. ${p.laps} · ${p.total_points} pkt${p.moved_today ? ' · ✅ ruszył się dziś' : ''}</span>
        </span>
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
  el.innerHTML = `⚠️ Czeka Cię: ${txt}`;
}

// ── WALKA Z BOSSEM ──
// Jedna, ciągła faza — boss walczy ZAWSZE, więc panel zawsze pokazuje to samo: kto to,
// ile ma HP, ile czasu zostało na pokonanie go i kto już go trafił. Dwa paski w jednym
// rzędzie: pasek HP (zadane obrażenia) i pod nim cienki pasek czasu (narasta do terminu,
// który admin ustawia w panelu — patrz updateBossTimeBar).
function slCoopChipsHtml(c) {
  return c.attackers.length
    ? `<div class="coop-chips">` + c.attackers.map(x =>
        `<span class="coop-chip${x.player_id === state.playerId ? ' is-me' : ''}">${esc(x.nickname)}<span class="coop-amt mono">${x.amount}</span></span>`
      ).join('') + `</div>`
    : `<div class="coop-chips"><span class="text-muted small">Nikt jeszcze nie trafił bossa — bądź pierwszy!</span></div>`;
}

// Jeden zwarty pasek pod planszą (nie karta z sekcjami) — plansza ma dostać jak
// najwięcej miejsca w pionie. Wszystko (ikona, pasek HP/czasu, staty, timer, akcja)
// w JEDNYM rzędzie; zasady + kara to jedna cienka linijka pod spodem.
function renderCoop(g) {
  const c = g.coop;
  const el = document.getElementById('coop-panel');
  if (!el) return;

  // Boss wyłączony (serwer nie przysyła wtedy coop) — chowamy i panel, i punkt regulaminu
  // o walce, żeby zasady nie opisywały czegoś, czego w grze nie ma.
  const rulesItem = document.getElementById('rules-boss');
  if (!c || !c.boss) {
    el.innerHTML = '';
    el.style.display = 'none';
    if (rulesItem) rulesItem.style.display = 'none';
    return;
  }
  el.style.display = '';
  if (rulesItem) rulesItem.style.display = '';

  const b = c.boss;
  const timerHtml = b.deadline_at
    ? `<span class="boss-timer mono" id="coop-deadline" data-until="${esc(b.deadline_at)}">⏳ –</span>`
    : `<span class="coop-stat">${c.time_limit_days}d na pokonanie</span>`;
  const timeBarHtml = b.deadline_at
    ? `<div class="boss-time-bar" id="boss-time-bar" data-from="${esc(b.started_at || '')}" data-until="${esc(b.deadline_at)}" title="Czas na pokonanie bossa"><div class="boss-time-fill"></div></div>`
    : '';

  // Wpłata jest dowolnej wysokości (1 moneta = 1 obrażenie), więc zamiast przycisku
  // z ryczałtem mamy pole kwoty. Przy przerysowaniu panelu (co 10 s) trzeba zachować to,
  // co gracz właśnie wpisuje — inaczej kwota znika mu spod palców.
  const amountEl = document.getElementById('coop-amount');
  const keepAmount = amountEl ? amountEl.value : '';
  const keepFocus = !!amountEl && document.activeElement === amountEl;
  const actionHtml =
    `<input type="number" id="coop-amount" min="1" step="1" max="${g.me.balance}" placeholder="monety" />
     <button class="btn-primary" id="btn-coop-give" ${g.me.balance > 0 ? '' : 'disabled'}>Wpłać</button>`;

  const prevTxt = c.previous_result
    ? `<span class="coop-prev">${c.previous_result.defeated
        ? `🏆 #${c.previous_result.cycle} ${esc(c.previous_result.boss_name)} pokonany`
        : `💥 #${c.previous_result.cycle} ${esc(c.previous_result.boss_name)} zaatakował, do -${c.previous_result.timeout_penalty} monet`}</span>`
    : '';

  el.innerHTML = `
    <div class="coop-row-main">
      <span class="coop-emoji">👹</span>
      <span class="coop-name">${esc(b.name)}</span>
      <div class="coop-bar-flex">
        <div class="coop-bar"><div class="coop-bar-fill boss-hp-fill" style="width:${b.percent}%"></div></div>
        ${timeBarHtml}
      </div>
      <span class="coop-stat mono">${b.hp}/${b.max_hp} HP</span>
      ${timerHtml}
      <div class="coop-actions">${actionHtml}</div>
    </div>
    <div class="coop-row-sub text-muted">
      <span>👹 Każdy rzut kostką rani bossa za darmo, a wpłata to <strong>1 moneta = 1 obrażenie</strong> (wpłacasz ile chcesz). Pokonacie go na czas — każdy, kto wpłacił, dostaje <strong>połowę wpłaty w punktach</strong> i odzyskuje do ${b.contrib_refund} monet (nie więcej, niż włożył). Nie zdążycie — wpłaty przepadają, a boss zabierze do ${c.timeout_penalty} monet każdemu (walczącym mniej — Ty stracisz ${c.my_timeout_penalty}). Tak czy siak od razu staje kolejny.${c.my_coins ? ` Wpłaciłeś dziś w tej walce: ${c.my_coins}.` : ''}</span>
      ${prevTxt}
    </div>
    ${slCoopChipsHtml(c)}`;

  if (keepAmount || keepFocus) {
    const fresh = document.getElementById('coop-amount');
    if (fresh) {
      fresh.value = keepAmount;
      if (keepFocus) fresh.focus();
    }
  }
  updateCoopDeadline();
}

// Cienki pasek pod paskiem wypełnienia w bloku bossa: ile czasu bossa już MINĘŁO.
// Narasta od zera do pełna — pełny pasek znaczy, że czas się skończył. Element powstaje
// na nowo przy każdym renderCoop, więc dane niesie w atrybutach, a nie w domknięciu.
function updateBossTimeBar() {
  const bar = document.getElementById('boss-time-bar');
  if (!bar) return; // nie ma walki — nie ma paska
  const until = Date.parse(bar.dataset.until);
  const from = Date.parse(bar.dataset.from);
  if (!Number.isFinite(until)) return;
  const now = Date.now();
  // Bez wiarygodnego początku walki nie ma z czego liczyć proporcji — zostawiamy pasek
  // pusty zamiast zgadywać skalę (sam licznik obok i tak pokazuje, ile zostało).
  const total = Number.isFinite(from) && until > from ? until - from : 0;
  const elapsed = total > 0 ? Math.max(0, Math.min(total, now - from)) : 0;
  bar.querySelector('.boss-time-fill').style.width = (total > 0 ? (elapsed / total) * 100 : 0) + '%';
  bar.classList.toggle('is-urgent', until - now <= 86400000); // ostatnia doba
}

// Odświeża licznik czasu do pokonania bossa (wołane co sekundę z updateCountdown) —
// no-op, gdy boss nie walczy (element #coop-deadline wtedy w ogóle nie istnieje).
function updateCoopDeadline() {
  updateBossTimeBar();
  const el = document.getElementById('coop-deadline');
  if (!el) return;
  const until = Date.parse(el.dataset.until);
  const secs = Math.max(0, Math.round((until - Date.now()) / 1000));
  const days = Math.floor(secs / 86400);
  const rest = secs % 86400;
  const daysTxt = days > 0 ? `${days}d ` : '';
  el.textContent = `⏳ ${daysTxt}${fmtHMS(rest)}`;
}

// Enter w polu kwoty = wpłata, żeby nie trzeba było sięgać po przycisk.
document.getElementById('coop-panel').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'coop-amount') contributeToBoss();
});

document.getElementById('coop-panel').addEventListener('click', e => {
  if (e.target.closest('#btn-coop-give')) contributeToBoss();
});

async function contributeToBoss() {
  if (state.busy) return;
  const input = document.getElementById('coop-amount');
  const amount = parseInt(input && input.value, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    showToast('Podaj dodatnią liczbę monet.');
    return;
  }
  state.busy = true;
  try {
    const res = await api('POST', '/api/snakes/coop/contribute', { amount });
    state.game = res.state;
    if (input) input.value = '';
    renderAll();
    if (res.defeated) {
      showConfetti();
      showToast('🏆 Twoja wpłata dobiła bossa! Nagrody rozliczone.');
    } else {
      showToast(`💰 Wpłacono ${amount} monet = ${amount} obrażeń (bossowi zostało ${res.hp_left}/${res.max_hp}).`);
    }
    loadActivity(document.getElementById('activity-date').value || null);
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

let openRefreshInFlight = false;

function updateCountdown() {
  const g = state.game;
  const toNext = secondsUntilMidnight();
  const textEl = document.getElementById('countdown-text');
  const barEl = document.getElementById('countdown-bar');
  if (g && g.me.can_roll) {
    const countTxt = g.me.daily_rolls > 1 ? ` (${g.me.rolls_remaining_today}/${g.me.daily_rolls})` : '';
    const closeSecs = g.me.office_closes_at
      ? Math.max(0, Math.round((Date.parse(g.me.office_closes_at) - Date.now()) / 1000))
      : null;
    textEl.textContent = closeSecs != null
      ? `🎲 Masz ruch${countTxt}! Biuro zamyka się za ${fmtHMS(closeSecs)}`
      : `🎲 Masz ruch na dziś${countTxt}! Nowa doba za ${fmtHMS(toNext)}`;
  } else if (g && g.me.is_weekend) {
    textEl.textContent = `🌴 Weekend — w Snakes nie gramy. Wracamy w poniedziałek.`;
  } else if (g && g.me.rolls_remaining_today > 0 && !g.me.office_open) {
    const waitSecs = Math.round((Date.parse(g.me.next_move_at) - Date.now()) / 1000);
    if (waitSecs <= 0) {
      // Okno otworzyło się w tle (klient tyka co sekundę, serwer o tym nie wie) —
      // dociągamy świeży stan, żeby przycisk odblokował się bez odświeżania strony.
      if (!openRefreshInFlight) {
        openRefreshInFlight = true;
        loadState().finally(() => { openRefreshInFlight = false; });
      }
      textEl.textContent = `⏳ Biuro już otwarte — odświeżam…`;
    } else {
      textEl.textContent = `🏢 Biuro zamknięte — gramy ${g.me.office_start_hour}:00–${g.me.office_end_hour}:00. Otwarcie za ${fmtHMS(waitSecs)} (${g.me.rolls_remaining_today}/${g.me.daily_rolls} ruchów czeka)`;
    }
  } else {
    textEl.textContent = `🔒 Ruchy wykorzystane — nowe za ${fmtHMS(toNext)}`;
  }
  if (barEl) barEl.style.width = ((1 - toNext / 86400) * 100) + '%';
  if (g) renderRollButton(g);
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
