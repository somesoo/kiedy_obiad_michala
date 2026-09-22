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
  curse:       { icon: '💀', name: 'Curse',       desc: 'Klątwa — 1 z 8 losowych wariantów (odwrotny ruch, rozdwojona kostka, kradzież coins, droższe zakupy i inne). Jaka — nie wie nikt, także Ty, dopóki nie odpali. Najwyżej 2 klątwy naraz na jednym graczu.', targeted: true },
  double_move: { icon: '⏩', name: 'Extra Move',  desc: 'Dokłada Ci jeden ruch ponad dzienny limit — do wykonania od razu po użyciu.', targeted: false },
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

// ── WYMUSZONE ODŚWIEŻENIE PO WDROŻENIU ──
// Otwarta karta gra kodem, który wczytała rano — wdrożenie niczego jej nie podmienia.
// Serwer dokleja do każdej odpowiedzi API nagłówek X-App-Version (skrót plików frontu),
// a my znamy własną wersję z adresu, pod którym ten skrypt został wczytany (?v=…, patrz
// ASSET_VERSION w server.js). Różnica = na serwerze jest nowszy front → przeładowujemy.
// document.currentScript działa tylko podczas pierwszego wykonania skryptu, stąd stała.
const SL_CLIENT_VERSION = (() => {
  try { return new URL(document.currentScript.src).searchParams.get('v'); } catch { return null; }
})();
let slReloadScheduled = false;

// Przeładowanie nie może zabrać graczowi tego, co właśnie robi: trwającego rzutu/zakupu,
// otwartego wyboru celu, okna zdjęcia ani kwoty wpisywanej w polu wpłaty. Wtedy tylko
// odkładamy — kolejna odpowiedź API (polling co 10 s) sprawdzi jeszcze raz.
function slSafeToReload() {
  if (state.busy || state.pendingUse) return false;
  const overlay = document.getElementById('avatar-overlay');
  if (overlay && overlay.style.display !== 'none' && overlay.style.display !== '') return false;
  const amount = document.getElementById('coop-amount');
  if (amount && (amount.value || document.activeElement === amount)) return false;
  return true;
}

function slCheckAppVersion(serverVersion) {
  // Bez wersji po którejś stronie (stary serwer, strona bez ?v=) nie ma czego porównywać.
  if (!serverVersion || !SL_CLIENT_VERSION || serverVersion === SL_CLIENT_VERSION) return;
  if (slReloadScheduled || !slSafeToReload()) return;
  // Bezpiecznik na pętlę: jeśli po przeładowaniu dalej dostajemy stary kod (np. jakiś
  // pośrednik trzyma stary HTML), nie przeładowujemy w kółko — raz na wersję serwera.
  const key = 'snakes-reloaded-for';
  try {
    if (sessionStorage.getItem(key) === serverVersion) return;
    sessionStorage.setItem(key, serverVersion);
  } catch { /* tryb prywatny — trudno, bez bezpiecznika */ }
  slReloadScheduled = true;
  showToast('🔄 Wgrano nową wersję gry — odświeżam stronę…');
  setTimeout(() => location.reload(), 1500);
}

// ── API ──
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (state.token) opts.headers['X-Token'] = state.token;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  slCheckAppVersion(r.headers.get('X-App-Version'));
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
    g.board.id,
    g.players.map(p => [p.player_id, p.abs_pos, p.total_points]),
    g.me.abs_pos, g.me.balance, g.me.total_points, g.me.rolls_remaining_today,
    // has_shield wystarczy: to jedyny efekt, o którym gracz ma prawo wiedzieć, zanim
    // odpali. Freeze i Curse celowo NIE są w sygnaturze — przerysowanie panelu w chwili
    // trafienia byłoby samo w sobie sygnałem, że coś na graczu wisi.
    g.me.can_roll, g.me.has_shield,
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
const ACTIVITY_ICONS = { roll: '🎲', shop_buy: '🛒', shop_use: '⚡', curse_fired: '💀', knockback: '💥', avatar: '🖼️', boss_hit: '⚔️', bonus_grant: '🏦', boss_reward: '🏆' };

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
    // Wyróżniamy wpisy DOTYCZĄCE MOJEGO PIONKA — po player_id wpisu, nigdy po treści.
    // To nie jest wybór estetyczny, tylko warunek bezpieczeństwa: serwer celowo zapisuje
    // wpis obu stronom wszędzie tam, gdzie obie strony mają wiedzieć (klątwa rzucona na
    // mnie, tarcza, Freeze W MOMENCIE ODPALENIA), a Freeze przy rzucaniu NIE dostaje wpisu
    // dla ofiary — bo cel ma się nie dowiedzieć, że jest zamrożony, dopóki nie kliknie
    // „Rzuć". Dopasowywanie po nicku w tekście podświetliłoby „ktoś użył Freeze" u ofiary
    // i rozwaliło całą mechanikę ukrycia. Po player_id nie wycieka nic.
    //
    // Number() po OBU stronach jest konieczne: state.playerId bywa stringiem z localStorage
    // (patrz loadAuth), a liczbą dopiero po loginSuccess — gołe === dałoby false przy
    // pierwszym renderze po odświeżeniu strony.
    const mine = Number(e.player_id) === Number(state.playerId);
    // Odpalona klątwa świeci na zielono OBU stronom: serwer zapisuje osobny wpis ofierze
    // i rzucającemu, więc każdy z nich ma „swój" (po player_id). Typ wpisu, nie jego
    // treść — z tego samego powodu co wyżej.
    const curseFired = mine && e.type === 'curse_fired';
    html += `
      <div class="activity-entry${mine ? ' is-me' : ''}${curseFired ? ' is-curse-fired' : ''}"${curseFired ? ' title="Klątwa odpaliła"' : mine ? ' title="Twoja akcja"' : ''}>
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
  applySeason(g.board);
  renderStats(g);
  renderBoard(g);
  renderShop(g);
  renderLeaderboard(g);
  renderRollButton(g);
  renderCoop(g);
}

// ── SEZON PLANSZY ──
// Motyw sezonu (public/themes/<theme>.css) i efekty doklejamy DOPIERO tutaj, z payloadu,
// a nie na sztywno w snakes.html — zmiana sezonu w panelu admina przełącza wygląd
// otwartych kart przy najbliższym odświeżeniu, bez przeładowania strony.
// Efekty (np. liście) to klasy fx-<nazwa> na <body>; warstwy efektów muszą żyć POZA
// #board-area, bo renderBoard podmienia jej innerHTML i zresetowałby animacje.
let slSeasonKey = null;
function applySeason(board) {
  const key = [board.id, board.theme || '', (board.effects || []).join(',')].join('|');
  if (key === slSeasonKey) return;
  slSeasonKey = key;

  const body = document.body;
  [...body.classList].filter(c => c.startsWith('season-') || c.startsWith('fx-'))
    .forEach(c => body.classList.remove(c));
  body.classList.add(`season-${board.id}`);
  (board.effects || []).forEach(e => body.classList.add(`fx-${e}`));

  let link = document.getElementById('season-theme');
  if (board.theme) {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = 'season-theme';
      document.head.appendChild(link);
    }
    link.href = `/themes/${board.theme}.css`;
  } else if (link) {
    link.remove();
  }

  const sub = document.getElementById('board-season-name');
  if (sub) sub.textContent = `${board.name} · ${board.size} pól · wszystkie pionki na jednej pętli`;
}

// ── STATY ──
function renderStats(g) {
  document.getElementById('user-balance-display').textContent = `💰 ${g.me.balance} coins`;
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

// ── PLANSZA (kształt z pliku sezonu, pętla) ──
// Front nie zna żadnego kształtu na sztywno: serwer przysyła `board.path` — współrzędne
// [kolumna, wiersz od góry] każdego pola w kolejności ruchu (plik boards/<sezon>.js).
// Kafelki stoją w CSS gridzie cols×rows dokładnie tam, gdzie każe path, a pod nimi SVG
// rysuje drogę przez ich środki — to ona pokazuje zakręty, start, metę i pętlę.
//
// Środek kratki liczymy jako (c + 0.5) / cols. To jest DOKŁADNIE środek kafelka tylko
// dlatego, że grid nie ma gapów, a odstęp między kafelkami robi `margin` na .sl-cell
// (symetryczny, więc środek elementu zostaje w środku kratki). Dodanie column-gap albo
// row-gap rozjechałoby łączniki z kafelkami.
function slGridPoint(board, c, r) {
  return { x: ((c + 0.5) / board.cols) * 100, y: ((r + 0.5) / board.rows) * 100 };
}

function tileCenter(idx, board) {
  const [c, r] = board.path[idx];
  return slGridPoint(board, c, r);
}

// Łamana przez punkty (w %) z zaokrąglonymi narożnikami: w każdym załamaniu linia kończy
// się `radius` przed wierzchołkiem i dochodzi do następnego odcinka łukiem (Q). Promień
// przycinamy do połowy krótszego odcinka, więc dwa zakręty jeden nad drugim (koniec
// wiersza serpentyny) składają się w równe „U", a nie zachodzą na siebie.
function slRoundedPath(pts, radius) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], b = pts[i + 1];
    const la = Math.hypot(a.x - p.x, a.y - p.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    // Punkt w środku prostej (albo zdublowany) nie jest zakrętem — idziemy dalej.
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    if (!la || !lb || Math.abs(cross) < 1e-6) { d += ` L ${p.x} ${p.y}`; continue; }
    const r = Math.min(radius, la / 2, lb / 2);
    const p1 = { x: p.x + (a.x - p.x) / la * r, y: p.y + (a.y - p.y) / la * r };
    const p2 = { x: p.x + (b.x - p.x) / lb * r, y: p.y + (b.y - p.y) / lb * r };
    d += ` L ${p1.x} ${p1.y} Q ${p.x} ${p.y} ${p2.x} ${p2.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last.x} ${last.y}`;
}

// Punkty strzałki pętli meta → start. Plik sezonu może podać `loop` (punkty pośrednie
// w jednostkach kratek, także lekko POZA siatką), żeby strzałka obiegła planszę zamiast
// przecinać pola. Bez `loop` — prosto z mety na start.
function slLoopPoints(board) {
  const pts = [tileCenter(board.size - 1, board)];
  for (const [c, r] of board.loop || []) pts.push(slGridPoint(board, c, r));
  pts.push(tileCenter(0, board));
  return pts;
}

// Ile miejsca zostawić wokół siatki na strzałkę pętli, która wychodzi poza kratki.
// Liczymy w kratkach, a potem jako ułamek CAŁEJ szerokości (siatka + zapas), bo procenty
// w `inset` odnoszą się do kontenera, nie do samej siatki.
function slBoardInsets(board) {
  let l = 0, r = 0, t = 0, b = 0;
  for (const [c, rr] of board.loop || []) {
    l = Math.max(l, -0.5 - c);
    r = Math.max(r, c - (board.cols - 0.5));
    t = Math.max(t, -0.5 - rr);
    b = Math.max(b, rr - (board.rows - 0.5));
  }
  const w = board.cols + l + r, h = board.rows + t + b;
  // + kilka pikseli na grubość linii i etykietę pętli, która siedzi na linii.
  const pct = (v, total) => v > 0 ? `calc(${(v / total) * 100}% + 14px)` : '0px';
  return `top:${pct(t, h)};right:${pct(r, w)};bottom:${pct(b, h)};left:${pct(l, w)}`;
}

function renderBoard(g) {
  const area = document.getElementById('board-area');
  const board = g.board;

  // mapy: pole -> kafel specjalny, pole -> gracze
  const special = {};
  board.tiles.forEach(t => { special[t.position] = t; });
  const pawns = {};
  g.players.forEach(p => { (pawns[p.tile] = pawns[p.tile] || []).push(p); });

  let cells = '';
  board.path.forEach(([c, r], idx) => {
    cells += renderCell(idx, special[idx], pawns[idx], `grid-column:${c + 1};grid-row:${r + 1}`, board.size);
  });

  area.innerHTML = `
    <div class="sl-board-wrap">
      <div class="sl-board-stage" style="${slBoardInsets(board)}">
        ${renderTrack(board)}
        <div class="sl-board" style="--cols:${board.cols};--rows:${board.rows}">${cells}</div>
        ${renderConnectors(board)}
      </div>
    </div>
    ${renderLegend(board)}`;
}

// Droga pod kafelkami + przerywana strzałka pętli meta → start z podpisem.
function renderTrack(board) {
  const pts = board.path.map((_, i) => tileCenter(i, board));
  const radius = 0.5 * Math.min(100 / board.cols, 100 / board.rows);
  const loopPts = slLoopPoints(board);

  // Podpis pętli: na środku najdłuższego POZIOMEGO odcinka (tam jest miejsce na tekst),
  // a gdy takiego nie ma — na środku najdłuższego w ogóle.
  let best = null;
  for (let i = 0; i < loopPts.length - 1; i++) {
    const a = loopPts[i], b = loopPts[i + 1];
    const horiz = Math.abs(a.y - b.y) < 1e-6;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const score = (horiz ? 1000 : 0) + len;
    if (!best || score > best.score) best = { score, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const lapTxt = board.lap_points ? ` +${board.lap_points} pkt` : '';

  return `
    <svg class="sl-track" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="sl-track-road" d="${slRoundedPath(pts, radius)}" />
      <path class="sl-track-loop" d="${slRoundedPath(loopPts, radius)}" />
    </svg>
    <span class="sl-loop-label" style="left:${best.x}%;top:${best.y}%">↻ nowe okrążenie${lapTxt}</span>`;
}

// Widoczne połączenia start→koniec dla KAŻDEGO węża i KAŻDEJ drabiny.
// Drabina: prosta, jasnozielona linia ze szczeblami (dasharray) i grotem u góry.
// Wąż: czerwona, wygięta krzywa z „głową" (kółkiem) na polu docelowym.
// Dzięki temu od razu widać, dokąd prowadzi każde pole — bez najeżdżania myszą.
function renderConnectors(board) {
  const links = board.tiles.filter(t => t.kind === 'ladder' || t.kind === 'snake');
  if (!links.length) return '';

  const parts = links.map(t => {
    const a = tileCenter(t.position, board);
    const b = tileCenter(t.target, board);
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
    + renderLinkDots(links, board);
}

// Kropki na początku i końcu każdego połączenia. Świadomie w HTML, nie w SVG:
// warstwa SVG jest rozciągana (preserveAspectRatio="none"), więc <circle> zrobiłby się
// elipsą, gdy kafelki są prostokątne. Element HTML pozycjonowany procentowo zostaje kołem.
function renderLinkDots(links, board) {
  const dots = links.map(t => {
    const a = tileCenter(t.position, board);
    const b = tileCenter(t.target, board);
    const kind = t.kind === 'ladder' ? 'ladder' : 'snake';
    return `
      <span class="sl-dot sl-dot-start sl-dot-${kind}" style="left:${a.x}%;top:${a.y}%"></span>
      <span class="sl-dot sl-dot-end sl-dot-${kind}" style="left:${b.x}%;top:${b.y}%"></span>`;
  }).join('');
  return `<div class="sl-link-dots" aria-hidden="true">${dots}</div>`;
}

function renderCell(idx, sp, players, posStyle, size) {
  let cls = 'sl-cell';
  // Start ma własny kolor: niżej nie da się spaść (serwer przycina ruch do pola 0).
  // Ostatnie pole to meta okrążenia — stąd pętla wraca na start.
  let idxLabel = String(idx);
  if (idx === 0) { cls += ' sl-cell-start'; idxLabel = '0 · START'; }
  else if (idx === size - 1) { cls += ' sl-cell-finish'; idxLabel = `${idx} 🏁`; }
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
    // Natywny title zniknął: nie da się w nim zrobić wielowierszowej rozpiski punktów.
    // Dane dla dymka jadą w data-* i są czytane dopiero przy najechaniu (patrz slTipShow).
    return `
      <span class="sl-pawn-wrap${meCls}${shieldCls}${pushCls}" data-tip-player="${p.player_id}">
        <img class="sl-pawn-avatar" src="${p.avatar_url}" alt="${esc(p.nickname)}" loading="lazy" />
        ${shieldBadge}
      </span>`;
  }).join('');
  return `
    <div class="${cls}" style="${posStyle}">
      <span class="sl-idx">${idxLabel}</span>
      ${mark}
      <div class="sl-pawns">${pawnsHtml}</div>
    </div>`;
}

function renderLegend(board) {
  return `
    <div class="sl-legend">
      <span class="sl-legend-start">■ start — niżej nie spadniesz</span>
      <span>🏁 meta — potem pętla na start (+${board.lap_points} pkt)</span>
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
    // Żadnej wzmianki o Freeze ani o klątwie — serwer w ogóle nie zdradza nam, że coś
    // na nas wisi. Dowiadujemy się dopiero po kliknięciu.
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
    // Kamień milowy pada najwyżej trzy razy na całą walkę, więc wart jest osobnej linijki
    // — także wtedy, gdy przekroczył go darmowy rzut, a nie czyjaś wpłata.
    for (const ms of (m.boss_hit.milestones || [])) {
      noteTxt.push(`🎯 Próg ${ms.percent}% zbity! +${ms.points} pkt dla ${ms.paid} wpłacających.`);
    }
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
          <span class="shop-cost mono">${item.cost} coins</span>
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
      ? `${res.price_curse.label}! Kupiono ${POWERUP_META[type].name} za ${res.cost} coins zamiast ${res.base_cost} (+${res.price_curse.extra}) — klątwa zdjęta.`
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
      // Extra Move działa od ręki — stan już przyszedł z dodatkowym slotem, więc
      // przycisk „Rzuć" jest w tym momencie odblokowany.
      showToast(`⏩ Dodatkowy ruch gotowy — rzucaj! (${state.game.me.rolls_remaining_today}/${state.game.me.daily_rolls} na dziś)`);
    } else if (type === 'curse') {
      // Bez wariantu — serwer go nie wysyła. Rzucający dowie się, co wylosował, gdy klątwa odpali.
      showToast('💀 Klątwa rzucona! Jaka — okaże się, gdy odpali.');
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


// ── WALKA Z BOSSEM ──
// Jedna, ciągła faza — boss walczy ZAWSZE, więc panel zawsze pokazuje to samo: kto to,
// ile ma HP, ile czasu zostało na pokonanie go i kto już go trafił. Dwa paski w jednym
// rzędzie: pasek HP (zadane obrażenia) i pod nim cienki pasek czasu (narasta do terminu,
// który admin ustawia w panelu — patrz updateBossTimeBar).
function slCoopChipsHtml(c) {
  // Lista pokazuje WPŁACONE COINS, a nie sumę obrażeń — bo to od wpłaty liczy się
  // nagroda. Obrażenia z kości są darmowe, więc ktoś, kto tylko rzucał, stałby wysoko
  // w rankingu wkładu, nic nie ryzykując. Kogo nie ma na liście, ten nie wpłacił.
  // Kolejność jest tą samą, którą rozliczenie liczy podium, więc medale na chipach nie
  // mogą się rozminąć z tym, co realnie wypłaci gra (patrz payout_plan w lib/boss.js).
  const plan = c.payout_plan || [];
  if (!plan.length) {
    return `<div class="coop-chips"><span class="text-muted small">Nikt jeszcze nie wpłacił — bądź pierwszy!</span></div>`;
  }
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return `<div class="coop-chips">` + plan.map(x =>
    `<span class="coop-chip${Number(x.player_id) === Number(state.playerId) ? ' is-me' : ''}${x.podium_place ? ` is-p${x.podium_place}` : ''}" ` +
    `title="wpłacone coins → ${x.points} pkt przy zwycięstwie">` +
    `${medals[x.podium_place] || ''}${esc(x.nickname)}<span class="coop-amt mono">${x.coins}</span></span>`
  ).join('') + `</div>`;
}

// ── HUD BOSSA: LICZBY ZAMIAST ZDAŃ ──
// Panel mówił wszystko pełnymi zdaniami jedną drobną czcionką, więc liczby, które coś
// znaczą (+18 pkt, 24 coins do bonusu, 982 wobec normy 504), tonęły w tekście. Teraz
// każda z nich jest kafelkiem: etykieta nad dużą liczbą, kolor mówi „dobrze/źle".
// Kafelki mają STAŁY rozmiar (patrz .hud-tile), więc etykieta ma być pełnym, krótkim
// opisem („Zwrot coins", „Pkt za progi HP"), a nie skrótem — skróty typu „Kamienie"
// czy „Próg 50%" okazały się nieczytelne. Dłuższe wyjaśnienie siedzi w title.
function slHudTile(label, value, opts = {}) {
  const cls = opts.tone ? ` is-${opts.tone}` : '';
  const title = opts.title ? ` title="${esc(opts.title)}"` : '';
  return `<div class="hud-tile${cls}"${title}><span class="hud-label">${label}</span><span class="hud-value mono">${value}</span></div>`;
}

// Kafelek „zadania" — CO zrobić i CO za to dostaniesz („Wpłać jeszcze 24 coins → +40 pkt"),
// z mini paskiem postępu na dole. Samo „Bonus 26/50" nie mówiło, że chodzi o wpłatę.
function slHudQuest(label, value, have, need, title) {
  const pct = need > 0 ? Math.max(0, Math.min(100, (have / need) * 100)) : 0;
  return `<div class="hud-tile hud-quest" title="${esc(title)}">` +
    `<span class="hud-label">${label}</span>` +
    `<span class="hud-value mono">${value}</span>` +
    `<div class="hud-quest-bar"><div class="hud-quest-fill" style="width:${pct}%"></div></div></div>`;
}

function slHudSection(caption, tilesHtml, extraCls = '') {
  return `<div class="hud-section${extraCls ? ' ' + extraCls : ''}"><div class="hud-caption">${caption}</div><div class="hud-tiles">${tilesHtml}</div></div>`;
}

// ── CO DOSTANĘ JA ── („łup")
// Wcześniej stało tu wyłącznie „Pokonacie bossa — nagroda. Nie zdążycie — kara.", bez
// ani jednej liczby, więc największe wydarzenie w grze nie dawało się z niczym porównać.
function slCoopLootHtml(c) {
  const r = c.my_reward;
  if (!r || !c.boss) return '';
  // UWAGA na różnicę: `r.fighter_points` to ile ryczałtu MAM (czyli 0, dopóki nie przekroczę
  // progu), a `c.boss.fighter_points` to STAWKA. Zachęta musi pokazywać stawkę — inaczej
  // gracz poniżej progu czyta „dorzuć, żeby złapać +0 pkt" i zachęta działa odwrotnie.
  const rate = c.boss.fighter_points;
  const perCoin = String(c.boss.points_per_coin).replace('.', ',');
  const refundPct = Math.round(c.boss.refund_rate * 100);

  const tiles = [];
  if (c.my_coins <= 0) {
    tiles.push(slHudTile('Wpłaciłeś', '0', { title: 'Nagrody dostają wyłącznie ci, którzy wpłacą coins — rzuty kostką są darmowe.' }));
    tiles.push(slHudTile('Pkt za każdy coin', `+${perCoin}`, { title: `Przy wygranej: ${perCoin} pkt za każdy wpłacony coin i ${refundPct}% wpłaty z powrotem.` }));
  } else {
    const parts = [`${r.contrib_points} za wpłatę`];
    if (r.fighter_points > 0) parts.push(`${r.fighter_points} za udział`);
    if (r.podium_points > 0) parts.push(`${r.podium_points} za ${r.podium_place}. miejsce`);
    tiles.push(slHudTile('Wpłaciłeś', c.my_coins, { title: 'Coins wpłacone na tego bossa' }));
    tiles.push(slHudTile('Pkt za wygraną', `+${r.points}`, { tone: 'good', title: `Tyle punktów dostaniesz, jeśli boss padnie: ${parts.join(' + ')}` }));
    tiles.push(slHudTile('Zwrot coins', r.refund, { tone: 'good', title: `Jeśli boss padnie, wraca Ci ${refundPct}% wpłaty w coins` }));
    if (r.podium_place > 0) {
      const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[r.podium_place] || '';
      tiles.push(slHudTile(`${r.podium_place}. miejsce wpłat`, `${medal}+${r.podium_points}`, { tone: 'gold', title: 'Premia za podium wpłat, wypłacana przy wygranej' }));
    }
  }
  if (r.milestones_earned > 0) {
    // „Kamienie" nic nie mówiło. To punkty za progi HP (75/50/25%) — już wpłynęły na konto.
    tiles.push(slHudTile('Pkt za progi HP', `+${r.milestones_earned}`, { tone: 'good', title: 'Punkty za zbicie bossa do 75% / 50% / 25% HP — już są na Twoim koncie, niezależnie od wyniku walki' }));
  }
  if (!r.qualified) {
    const missing = r.coins_to_qualify;
    tiles.push(slHudQuest(
      c.my_coins > 0 ? `Dorzuć ${missing} coins` : `Wpłać ${r.fighter_min} coins`,
      `+${rate} pkt`,
      c.my_coins, r.fighter_min,
      `Bonus za udział: kto wpłaci co najmniej ${r.fighter_min} coins, dostaje przy wygranej +${rate} pkt. Masz ${c.my_coins}/${r.fighter_min}.`
    ));
  }
  return slHudSection('💰 Twój łup', tiles.join(''));
}

// ── JAK NAM IDZIE ──
// Czy idziecie na wygraną: ile trzeba zdejmować dziennie i ile realnie zdjęliście.
// To jedyny mechanizm koordynacji, jaki ta gra ma.
// „Ostatnio w ciągu dnia" było niezrozumiałe: pokazywało NAJŚWIEŻSZY dzień z obrażeniami,
// czyli zwykle dzisiejszy, niedokończony. Stąd dwa nazwane dni: dziś (w toku) i poprzedni
// dzień roboczy (zamknięty — tylko on jest oceniany wobec normy na czerwono/zielono).
function slCoopPaceHtml(c) {
  const p = c.pace;
  if (!p || !c.boss || !c.boss.active) return '';
  const dd = day => day ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : '';
  const how = `Obrażenia wszystkich graczy razem: rzuty kostką (oczka × ${c.boss.dice_damage_mult}) i wpłaty coins (1 coin = 1 obrażenie).`;
  const tiles = [];
  // Stary serwer nie przysyła today/prev_day — wtedy zostaje sama norma i dni.
  if (p.today) {
    // Dzisiejszy dzień trwa, więc „za mało" nie jest jeszcze porażką — zielony dopiero,
    // gdy norma już pękła, a poza tym neutralny.
    tiles.push(slHudTile('Obrażenia dziś', p.today.amount, {
      tone: p.today.amount >= p.needed_per_day ? 'good' : null,
      title: `Dzisiaj, dzień w toku. ${how}`
    }));
  }
  if (p.prev_day) {
    const ok = p.prev_day.amount >= p.needed_per_day;
    tiles.push(slHudTile(`Obrażenia ${dd(p.prev_day.day)}`, `${p.prev_day.amount}${ok ? ' ✓' : ' ⚠️'}`, {
      tone: ok ? 'good' : 'bad',
      title: `Poprzedni dzień roboczy — ${ok ? 'norma zrobiona' : 'poniżej normy'}. ${how}`
    }));
  }
  tiles.push(slHudTile('Potrzeba dziennie', `~${p.needed_per_day}`, {
    title: `Tyle obrażeń dziennie trzeba zdejmować, żeby zdążyć: zostało ${c.boss.hp} HP na ${p.days_left} ${p.days_left === 1 ? 'dzień roboczy' : 'dni robocze'}`
  }));
  // Bez kafelka „dni do końca" — to samo mówi licznik w pasku czasu, a ten kafelek był
  // tym, który spychał HUD do drugiego rzędu.
  tiles.push(slCoopNextMilestoneTile(c));
  return slHudSection('⚔️ Tempo ekipy', tiles.join(''));
}

// Kamienie milowe siedzą NA PASKU HP jako znaczniki — to te same progi, które gracz
// widzi, patrząc na HP, więc osobny wiersz tylko je powtarzał i zabierał wysokość.
// Etykieta w dymku mówi, CZEGO brakuje: „75% (za 747)" czytało się jak cena albo punkty,
// a to jest liczba OBRAŻEŃ, które dzielą ekipę od progu.
function slCoopMilestoneMarks(c) {
  if (!c.milestones || !c.boss) return '';
  const max = Math.max(1, c.boss.max_hp);
  return c.milestones.map(m => {
    const title = m.reached
      ? `${m.percent}% zaliczone — każdy, kto wtedy już wpłacił, dostał +${m.points} pkt`
      : `${m.percent}%: jeszcze ${c.boss.hp - m.hp_at} obrażeń → +${m.points} pkt od ręki dla każdego, kto już wpłacił`;
    return `<span class="boss-ms${m.reached ? ' is-done' : ''}" style="left:${(m.hp_at / max) * 100}%" title="${esc(title)}">` +
      `<span class="boss-ms-tag">${m.reached ? '✓' : `${m.percent}%`}</span></span>`;
  }).join('');
}

// Najbliższy niezaliczony próg jako kafelek — pasek pokazuje GDZIE, kafelek ILE i ZA CO.
// „Próg 50%" nie mówił, co się stanie po jego zbiciu — etykieta podaje nagrodę wprost.
function slCoopNextMilestoneTile(c) {
  if (!c.milestones || !c.boss) return '';
  const next = c.milestones.find(m => !m.reached);
  if (!next) return slHudTile('Progi HP', 'wszystkie ✓', { tone: 'good', title: 'Wszystkie kamienie milowe (75/50/25% HP) już zaliczone' });
  const left = c.boss.hp - next.hp_at;
  return slHudTile(`Do +${next.points} pkt (${next.percent}% HP)`, `${left} obr.`, {
    tone: 'gold',
    title: `Zbijcie bossowi jeszcze ${left} HP (do ${next.percent}%), a każdy, kto już wpłacił, dostanie od ręki +${next.points} pkt`
  });
}

// ── REAKCJA NA TRAFIENIE ──
// Panel przerysowuje się co 10 s. Jeśli od ostatniego razu HP spadło, pasek miga
// i wyskakuje „−N" — boss przestaje wyglądać jak statyczna tabelka. Pamiętamy HP per
// cykl: nowy boss (inny cykl) albo pierwszy render po wczytaniu strony nie migają.
let slLastBossHp = null;
function slBossHitDelta(c) {
  const key = `${c.cycle}`;
  const prev = slLastBossHp && slLastBossHp.key === key ? slLastBossHp.hp : null;
  slLastBossHp = { key, hp: c.boss.hp };
  return prev !== null && c.boss.hp < prev ? prev - c.boss.hp : 0;
}

// ── OGŁOSZENIE: NOWA MECHANIKA BOSSA, FAZA TESTÓW ──
// Ludzie wracają do gry, w której nagrody liczą się inaczej niż wczoraj, a przegrana
// potrafi zbić saldo pod kreskę — muszą się o tym dowiedzieć ZANIM wpłacą, a nie
// z dziennika po fakcie. Baner siedzi nad planszą, znika po kliknięciu ✕ i wraca, gdy
// podbijemy BOSS_NOTICE_VERSION (kolejna zmiana stawek = kolejne ogłoszenie).
//
// Stan „zamknięte" trzymamy w localStorage: to wygoda konkretnej przeglądarki, a nie
// dane gry — nie ma czego trzymać na serwerze. Dostęp opakowany w try/catch, bo
// w trybie prywatnym albo przy zablokowanych danych stron samo sięgnięcie rzuca
// wyjątkiem i wywróciłoby cały render panelu.
const BOSS_NOTICE_VERSION = 'v2-2026-09';
const BOSS_NOTICE_KEY = 'snakes-boss-notice-' + BOSS_NOTICE_VERSION;

function bossNoticeDismissed() {
  try { return localStorage.getItem(BOSS_NOTICE_KEY) === '1'; } catch { return false; }
}
function dismissBossNotice() {
  try { localStorage.setItem(BOSS_NOTICE_KEY, '1'); } catch { /* tryb prywatny — trudno */ }
  const el = document.getElementById('boss-notice');
  if (el) el.style.display = 'none';
}

function slRenderBossNotice(c) {
  const el = document.getElementById('boss-notice');
  if (!el) return;
  // Boss wyłączony albo baner zamknięty — nie ma o czym ogłaszać.
  if (!c || !c.boss || bossNoticeDismissed()) {
    el.style.display = 'none';
    return;
  }
  const b = c.boss;
  const perCoin = String(b.points_per_coin).replace('.', ',');
  el.style.display = '';
  el.innerHTML = `
    <button class="boss-notice-close" id="boss-notice-close" title="Zamknij">✕</button>
    <div class="boss-notice-title">🧪 Nowa mechanika bossa — faza testów</div>
    <div class="boss-notice-body">
      <p><strong>Nagrody dostają teraz wyłącznie ci, którzy wpłacą coins.</strong>
      Rzuty kostką nadal ranią bossa za darmo i zdejmują większość HP, ale nic za nie nie ma —
      bo nic nie ryzykują.</p>
      <p>Za wpłatę: <strong>${perCoin} pkt</strong> za każdy coin,
      <strong>${Math.round(b.refund_rate * 100)}% wpłaty z powrotem</strong>,
      <strong>+${b.fighter_points} pkt</strong> ryczałtu od <strong>${b.fighter_min_coins} coins</strong>
      i podium wpłat <strong>+${b.podium_points.join(' / +')} pkt</strong>.
      Do tego <strong>kamienie milowe</strong> przy 75%, 50% i 25% HP:
      <strong>+${b.milestone_points} pkt od ręki</strong> dla każdego, kto już wpłacił —
      im wcześniej się dorzucisz, tym więcej progów złapiesz.</p>
      <p class="boss-notice-warn">⚠️ Jak nie zdążycie na czas, boss zabiera
      <strong>${c.timeout_penalty} coins KAŻDEMU</strong> — płasko, bez zniżki za wpłatę
      i bez względu na stan konta. <strong>Saldo może zejść pod kreskę.</strong></p>
      <p class="boss-notice-foot">To faza testów — stawki i trudność będą jeszcze krążone
      na podstawie tego, jak pójdzie. Szczegóły w regulaminie niżej; zgłaszajcie, co nie gra.</p>
    </div>`;
}

// ── REGULAMIN Z PRAWDZIWYMI LICZBAMI ──
// Punkt regulaminu o bossie składamy ze stawek przysłanych przez serwer, zamiast trzymać
// je zaszyte w HTML-u. Wcześniej były wpisane na sztywno i każda zmiana .env sprawiała,
// że zasady zaczynały kłamać — a gracz nie miał jak się zorientować, że czyta nieprawdę.
function slRenderBossRules(c) {
  const el = document.getElementById('rules-boss-text');
  if (!el || !c.boss) return;
  const b = c.boss;
  const pct = n => String(Math.round(n * 100)).replace('.', ',');
  const perCoin = String(b.points_per_coin).replace('.', ',');
  el.innerHTML =
    `Boss walczy <strong>cały czas</strong> — jedna, ciągła faza: bijecie mu HP. Widać to na ` +
    `<strong>dwóch paskach</strong> pod planszą: ile obrażeń już zadaliście i ile czasu zostało ` +
    `do terminu. Obrażenia idą z dwóch źródeł: <strong>każdy Twój rzut kostką rani go za darmo</strong> ` +
    `(oczka × ${b.dice_damage_mult}, bez dodatkowej akcji — zwykłe granie już walczy), ` +
    `a dodatkowo możesz <strong>wpłacić coins: 1 coin = 1 obrażenie</strong>, dowolną kwotę ze swojego salda. ` +
    `<strong>Nagrody dostają WYŁĄCZNIE ci, którzy wpłacili</strong> — rzuty są darmowe, więc nic nie ryzykują. ` +
    `<strong>Pokonacie go na czas</strong>, a każdy wpłacający dostaje: <strong>${perCoin} pkt</strong> za każdy ` +
    `wpłacony coin, <strong>${pct(b.refund_rate)}% wpłaty z powrotem</strong> w coins, ` +
    `<strong>+${b.fighter_points} pkt</strong> ryczałtu za udział (od <strong>${b.fighter_min_coins} coins</strong> wzwyż) ` +
    `oraz podium wpłat: <strong>+${b.podium_points.join(' / +')} pkt</strong> za trzy pierwsze miejsca. ` +
    `Do tego <strong>kamienie milowe</strong>: gdy HP bossa spada poniżej 75%, 50% i 25%, każdy, kto do tej pory ` +
    `wpłacił choć coina, dostaje <strong>+${b.milestone_points} pkt</strong> od ręki — więc im wcześniej się dorzucisz, ` +
    `tym więcej progów złapiesz. <strong>Nie zdążycie do terminu</strong> — wpłacone coins przepadają, ` +
    `a boss zabiera <strong>${c.timeout_penalty} coins</strong> KAŻDEMU graczowi, bez zniżki za wpłatę ` +
    `i bez względu na saldo (można zejść pod kreskę; z długu wychodzisz normalną grą, ale sklep i wpłaty są wtedy zablokowane). ` +
    `Tak czy inaczej kolejny boss staje od razu — po wygranej mocniejszy, po przegranej łagodniejszy.`;
}

// ── POPRZEDNI BOSS ── trzecia sekcja HUD-u (obok łupu i tempa).
// Jedna linijka „pokonany — dostałeś +X pkt" nie odpowiadała na pytanie, które gracze
// faktycznie zadają: CO DOKŁADNIE dostałem albo ile mi zabrał. Tu jest pełna rozpiska
// z rejestru wypłat, łącznie z kamieniami milowymi, które wpadły jeszcze w trakcie walki.
// Trzy różne zakończenia, nie dwa. „Nie pokonany" nie znaczy automatycznie „zaatakował":
// walkę domkniętą administracyjnie (wyłącznik bossa, wdrożenie) nikt nie przypłacił,
// więc ogłaszanie przy niej straty 50 coins byłoby zwykłym kłamstwem.
function slCoopPrevBossHtml(pr) {
  if (!pr) return '';
  const m = pr.mine; // brak przy starym serwerze — wtedy tylko wynik i suma
  // Wynik jako odznaka, jak ekran końca rundy. „Remis" to walka domknięta bez rozliczenia.
  const badge = pr.defeated
    ? `<span class="hud-badge is-good" title="Boss pokonany przed terminem">🏆 Zwycięstwo</span>`
    : !pr.settled
      ? `<span class="hud-badge" title="Walka domknięta administracyjnie — bez nagród i bez kar, nikt nic nie stracił">⚪ Remis</span>`
      : `<span class="hud-badge is-bad" title="Nie zdążyliście — boss zabrał ${pr.timeout_penalty} coins każdemu">💀 Porażka</span>`;

  // Poprzedni boss to zamknięta historia, więc zamiast kafelków dostaje JEDNĄ linijkę liczb
  // pod odznaką — tylko dzięki temu cały HUD mieści się w jednym rzędzie obok łupu i tempa.
  const stats = [];
  const stat = (txt, tone, title) =>
    stats.push(`<span class="prev-stat${tone ? ' is-' + tone : ''}"${title ? ` title="${esc(title)}"` : ''}>${txt}</span>`);
  let note = '';
  if (m) {
    const totalPts = m.contrib_points + m.fighter_points + m.podium_points + m.milestone_points;
    const pts = [];
    if (m.contrib_points) pts.push(`${m.contrib_points} za wpłatę`);
    if (m.fighter_points) pts.push(`${m.fighter_points} za udział`);
    if (m.podium_points) pts.push(`${m.podium_points} za podium`);
    if (m.milestone_points) pts.push(`${m.milestone_points} za progi HP`);
    // Przy przegranej wpłata przepada — gracz ma to zobaczyć obok kary, bo razem to jego strata.
    const lost = pr.settled && !pr.defeated;
    if (m.paid_coins > 0) stat(lost ? `${m.paid_coins} coins przepadło` : `${m.paid_coins} wpłacone`, lost ? 'bad' : null);
    if (totalPts > 0) stat(`+${totalPts} pkt`, 'good', pts.join(' + '));
    if (m.refund > 0) stat(`+${m.refund} coins zwrotu`, 'good', 'Coins, które wróciły z wpłaty');
    if (m.penalty > 0) stat(`−${m.penalty} coins kary`, 'bad', 'Coins zabrane za przegraną');
    if (!stats.length) {
      note = m.damage > 0 ? `Tylko kostka (${m.damage} obr.) — bez wpłaty bez nagrody`
        : pr.settled ? 'Nie brałeś udziału' : 'Nie brałeś udziału · nikt nic nie stracił';
    }
  } else if (pr.defeated && (pr.my_points > 0 || pr.my_refund > 0)) {
    stat(`+${pr.my_points} pkt`, 'good');
    stat(`+${pr.my_refund} coins zwrotu`, 'good');
  } else if (pr.my_penalty > 0) {
    stat(`−${pr.my_penalty} coins kary`, 'bad');
  }

  return `<div class="hud-section hud-prev">
      <div class="hud-caption" title="Poprzedni boss · #${pr.cycle} ${esc(pr.boss_name)}">⏮ Poprzedni boss · #${pr.cycle} ${esc(pr.boss_name)}</div>
      <div class="coop-prev-head">${badge}${note ? `<span class="coop-prev-note">${note}</span>` : ''}</div>
      ${stats.length ? `<div class="prev-stats mono">${stats.join('<span class="prev-sep">·</span>')}</div>` : ''}
    </div>`;
}

// Jeden zwarty pasek pod planszą (nie karta z sekcjami) — plansza ma dostać jak
// najwięcej miejsca w pionie. Górny rząd: boss, pasek HP (z kamieniami milowymi i HP
// w środku), pasek czasu (z licznikiem w środku), odznaka kary, wpłata. Pod spodem trzy
// sekcje HUD-u (łup, tempo ekipy, poprzedni boss), a na dole wyśrodkowana lista wpłat.
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
    slRenderBossNotice(null); // zgaszony boss chowa też ogłoszenie o przebudowie
    return;
  }
  el.style.display = '';
  if (rulesItem) rulesItem.style.display = '';

  const b = c.boss;
  // Licznik czasu siedzi W ŚRODKU paska czasu — pasek pokazuje proporcję, liczba dokładkę.
  // Obok licznika kara: to jest dokładnie to, co się stanie, gdy ten pasek się wyczerpie,
  // więc tu jest jej miejsce (jako odznaka w górnym rzędzie ściskała pasek HP na wąskich
  // ekranach). #coop-deadline zostaje tym samym elementem, który co sekundę przepisuje
  // updateCoopDeadline — kara jest obok niego, nie w nim, żeby jej nie nadpisał.
  const penaltyTitle = `Nie zdążycie do terminu — boss zabiera ${c.my_timeout_penalty} coins KAŻDEMU graczowi, także tym, którzy wpłacili. Bez zniżki i bez względu na saldo: można zejść pod kreskę.`;
  const penaltyHtml = `<span class="boss-bar-penalty">· potem −${c.my_timeout_penalty} coins każdemu 💀</span>`;
  const timeBarHtml = b.deadline_at
    ? `<div class="boss-time-bar" id="boss-time-bar" data-from="${esc(b.started_at || '')}" data-until="${esc(b.deadline_at)}" title="${esc(penaltyTitle)}"><div class="boss-time-fill"></div><span class="boss-bar-label"><span class="mono" id="coop-deadline" data-until="${esc(b.deadline_at)}">⏳ –</span>${penaltyHtml}</span></div>`
    : `<div class="boss-time-bar" title="${esc(penaltyTitle)}"><span class="boss-bar-label">${c.time_limit_days}d na pokonanie ${penaltyHtml}</span></div>`;
  const hit = slBossHitDelta(c);

  // Wpłata jest dowolnej wysokości (1 coin = 1 obrażenie), więc zamiast przycisku
  // z ryczałtem mamy pole kwoty. Przy przerysowaniu panelu (co 10 s) trzeba zachować to,
  // co gracz właśnie wpisuje — inaczej kwota znika mu spod palców.
  const amountEl = document.getElementById('coop-amount');
  const keepAmount = amountEl ? amountEl.value : '';
  const keepFocus = !!amountEl && document.activeElement === amountEl;
  const actionHtml =
    `<input type="number" id="coop-amount" min="1" step="1" max="${g.me.balance}" placeholder="coins" />
     <button class="btn-primary" id="btn-coop-give" ${g.me.balance > 0 ? '' : 'disabled'}>Wpłać</button>`;

  const prevHtml = slCoopPrevBossHtml(c.previous_result);

  el.innerHTML = `
    <div class="coop-row-main">
      <span class="coop-emoji">👹</span>
      <span class="coop-name">${esc(b.name)}</span>
      <div class="coop-bar-flex">
        <div class="boss-hp${hit ? ' is-hit' : ''}" title="HP bossa — znaczniki to kamienie milowe">
          <div class="boss-hp-fill" style="width:${b.percent}%"></div>
          ${slCoopMilestoneMarks(c)}
          <span class="boss-bar-label mono">${b.hp} / ${b.max_hp} HP</span>
          ${hit ? `<span class="boss-hit-float mono">−${hit}</span>` : ''}
        </div>
        ${timeBarHtml}
      </div>
      <div class="coop-actions">${actionHtml}</div>
    </div>
    <div class="hud-sections">
      ${slCoopLootHtml(c)}
      ${slCoopPaceHtml(c)}
      ${prevHtml}
    </div>
    <div class="hud-foot">${slCoopChipsHtml(c)}</div>`;

  if (keepAmount || keepFocus) {
    const fresh = document.getElementById('coop-amount');
    if (fresh) {
      fresh.value = keepAmount;
      if (keepFocus) fresh.focus();
    }
  }
  updateCoopDeadline();

  // Regulamin i baner lecą NA KOŃCU i w try/catch — to dodatki do panelu, a nie panel.
  // Wcześniej szły przed `el.innerHTML` i wystarczyło, że serwer przyśle payload bez
  // któregoś z nowych pól (np. gdy front pojedzie przed backendem), żeby wyjątek zabił
  // CAŁY blok bossa: gracz nie widział ani paska HP, ani pola wpłaty, i nic mu nie
  // mówiło dlaczego.
  try {
    slRenderBossRules(c);
    slRenderBossNotice(c);
  } catch (e) {
    console.error('Snakes: nie udało się złożyć opisu bossa —', e);
  }
}

// Cienki pasek pod paskiem HP w bloku bossa: ile czasu bossa jeszcze ZOSTAŁO.
// MALEJE od pełna do zera, tak samo jak HP — oba paski czyta się tak samo („ile jeszcze"),
// a wyścig widać od razu: czas nie może skończyć się przed HP. Wcześniej narastał i dwa
// paski obok siebie szły w przeciwne strony. Element powstaje na nowo przy każdym
// renderCoop, więc dane niesie w atrybutach, a nie w domknięciu.
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
  const left = total > 0 ? Math.max(0, Math.min(total, until - now)) : 0;
  bar.querySelector('.boss-time-fill').style.width = (total > 0 ? (left / total) * 100 : 0) + '%';
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

// Delegacja, bo baner jest przerysowywany co 10 s razem z panelem — listener wpięty
// wprost w przycisk ✕ zniknąłby przy pierwszym odświeżeniu.
// Sprawdzenie na null jest KONIECZNE: przy starym, zacache'owanym snakes.html tego
// elementu jeszcze nie ma, a `null.addEventListener` wywaliłoby cały skrypt w połowie —
// czyli zepsułoby CAŁĄ grę, a nie tylko baner.
const bossNoticeEl = document.getElementById('boss-notice');
if (bossNoticeEl) {
  bossNoticeEl.addEventListener('click', e => {
    if (e.target.closest('#boss-notice-close')) dismissBossNotice();
  });
}

async function contributeToBoss() {
  if (state.busy) return;
  const input = document.getElementById('coop-amount');
  const amount = parseInt(input && input.value, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    showToast('Podaj dodatnią liczbę coins.');
    return;
  }
  state.busy = true;
  try {
    const res = await api('POST', '/api/snakes/coop/contribute', { amount });
    state.game = res.state;
    if (input) input.value = '';
    renderAll();
    // Trasa zwraca `victory` (cały wynik rozliczenia), a nie `defeated` — wcześniej front
    // pytał o `defeated`, którego w odpowiedzi nigdy nie było, więc dobicie bossa wpłatą
    // przechodziło bez konfetti i bez słowa o nagrodzie.
    if (res.victory) {
      const mine = (res.victory.payouts || []).find(p => p.player_id === state.playerId);
      showConfetti();
      showToast(mine
        ? `🏆 Twoja wpłata dobiła bossa! Dostajesz +${mine.points} pkt i ${mine.refund} coins z powrotem.`
        : '🏆 Twoja wpłata dobiła bossa! Nagrody rozliczone.');
    } else if (res.milestones && res.milestones.length) {
      const ms = res.milestones[res.milestones.length - 1];
      showToast(`🎯 Zbiliście bossa do ${ms.percent}%! Kamień milowy: +${ms.points} pkt dla wpłacających.`);
    } else {
      showToast(`💰 Wpłacono ${amount} coins = ${amount} obrażeń (bossowi zostało ${res.hp_left}/${res.max_hp}).`);
    }
    loadActivity(document.getElementById('activity-date').value || null);
  } catch (e) {
    showToast(e.message);
  } finally {
    state.busy = false;
  }
}

// ── DYMEK Z ROZBICIEM PUNKTÓW ──
// Jeden komponent dla pionków na planszy i wierszy rankingu. Natywny title odpadł, bo nie
// da się w nim zrobić wielowierszowej rozpiski. Dymek jest doklejany do <body>, a nie do
// elementu, na który najeżdżamy — plansza i ranking mają własne przewijanie i overflow,
// więc pozycjonowany wewnątrz nich potrafiłby zostać przycięty.
const SL_POINT_CATEGORY_LABELS = [
  ['dice',      '🎲', 'ruchy kostką'],
  ['boss',      '👹', 'walka z bossem'],
  ['knockback', '💥', 'zbicia przeciwnika'],
  ['bonus',     '⭐', 'punkty bonusowe'],
  ['pre_split', '📦', 'sprzed podziału'],
];

let slTipEl = null;

function slTipFor(playerId) {
  const g = state.game;
  if (!g) return null;
  // Ranking ma WSZYSTKICH, plansza tylko tych ze zdjęciem — dlatego szukamy najpierw tam.
  const src = (g.leaderboard || []).find(p => p.player_id === playerId)
           || (g.players || []).find(p => p.player_id === playerId);
  if (!src || !src.points_breakdown) return null;

  const b = src.points_breakdown;
  const total = Number(src.total_points) || 0;
  const rows = SL_POINT_CATEGORY_LABELS
    // Pustych kategorii nie pokazujemy — dymek ma być listą tego, co gracz faktycznie
    // zdobył, a nie tabelą zer. „Sprzed podziału" znika sama, gdy wyzeruje się historia.
    .filter(([key]) => (b[key] || 0) > 0)
    .map(([key, icon, label]) => {
      const val = b[key];
      const pct = total > 0 ? Math.round(val / total * 100) : 0;
      return `<div class="sl-tip-row">
        <span class="sl-tip-ico">${icon}</span>
        <span class="sl-tip-lbl">${label}</span>
        <span class="sl-tip-val mono">${val}</span>
        <span class="sl-tip-pct mono">${pct}%</span>
      </div>`;
    }).join('');

  return `<div class="sl-tip-head">${esc(src.nickname)}<span class="sl-tip-total mono">${total} pkt</span></div>`
    + (rows || '<div class="sl-tip-empty">Jeszcze bez punktów.</div>');
}

function slTipShow(target, playerId) {
  const html = slTipFor(playerId);
  if (!html) return;
  if (!slTipEl) {
    slTipEl = document.createElement('div');
    slTipEl.className = 'sl-tip';
    document.body.appendChild(slTipEl);
  }
  slTipEl.innerHTML = html;
  slTipEl.style.display = 'block';

  // Pozycjonowanie nad elementem, a jeśli u góry brakuje miejsca — pod nim. Wyjście poza
  // prawą krawędź okna też przycinamy, żeby dymek przy skrajnym pionku nie uciekał.
  const r = target.getBoundingClientRect();
  const t = slTipEl.getBoundingClientRect();
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - t.width - 6));
  const above = r.top - t.height - 8;
  slTipEl.style.left = `${Math.round(left)}px`;
  slTipEl.style.top = `${Math.round(above >= 6 ? above : r.bottom + 8)}px`;
}

function slTipHide() {
  if (slTipEl) slTipEl.style.display = 'none';
}

// Delegacja na document: plansza i ranking przerysowują się co 10 s, więc listenery
// wpięte w konkretne elementy ginęłyby przy każdym odświeżeniu.
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-tip-player]');
  if (el) slTipShow(el, Number(el.dataset.tipPlayer));
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest && e.target.closest('[data-tip-player]');
  if (el && !el.contains(e.relatedTarget)) slTipHide();
});
// Przewinięcie odkleiłoby dymek od pionka — prościej go schować niż przeliczać pozycję.
window.addEventListener('scroll', slTipHide, true);

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
      <div class="lb-row${meClass}" data-tip-player="${p.player_id}">
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
