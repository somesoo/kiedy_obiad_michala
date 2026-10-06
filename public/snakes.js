// Snakes — RDZEŃ FRONTU: stan, API, logowanie, odświeżanie w tle, zdjęcie profilowe,
// sezon, garderoba, statystyki, rzut, sklep, wybór celu, odliczanie. Reszta w public/sl/*.js
// (plansza, dziennik, boss, ranking, biblioteki rysunków). Ten plik ładuje się OSTATNI,
// bo na końcu woła init() — patrz nagłówek sl/art-effects.js.

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
    g.coop ? [g.coop.status, g.coop.attackers.length, g.coop.boss ? g.coop.boss.hp : null] : null,
    // Zamknięcie sezonu: nowe zakładki w rankingu, medale i podium do obejrzenia.
    (g.seasons_archive || []).length, g.crowning ? g.crowning.closure_id : null
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
    // Bonus za biuro poza podpisem stanu: zmienia się, gdy ktoś wchodzi do sieci biura
    // albo odbiera go na innym urządzeniu, a reszta stanu może stać w miejscu.
    state.officeBonus = g.office_bonus || null;
    slRenderOfficeBonus();
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

// ── WIĘKSZY PODGLĄD PIONKA NA HOVER ──
// Delegacja na document (nie na poszczególnych <img>) — pionki i miniatury w wyborze
// celu są re-renderowane co chwilę, więc listenery wpięte bezpośrednio w nie
// znikałyby przy każdym odświeżeniu.
// Podgląd pokazuje CAŁY pionek — kształt nakładki, czapkę, skrzydła, gadżet — a nie gołe
// kwadratowe zdjęcie. Składa go ta sama slPawnHtml co planszę, z danych gracza, ale BEZ
// ducha: prześcieradło nieaktywnego chowa nakładkę, a podgląd ma pokazać pełny kostium.
// Pionek bez gracza w danych (przymiarka w garderobie) jest po prostu klonowany.
const AVATAR_HOVER_SELECTOR = '.sl-pawn-avatar, .target-avatar, .my-avatar-thumb, img.activity-face';
const AVATAR_HOVER_W = 260, AVATAR_HOVER_H = 210;

function positionAvatarHoverPreview(x, y) {
  const el = document.getElementById('avatar-hover-preview');
  const pad = 18, w = AVATAR_HOVER_W, h = AVATAR_HOVER_H;
  let left = x + pad, top = y + pad;
  if (left + w > window.innerWidth) left = x - w - pad;
  if (top + h > window.innerHeight) top = y - h - pad;
  el.style.left = Math.max(4, left) + 'px';
  el.style.top = Math.max(4, top) + 'px';
}

// Id gracza, do którego należy miniatura — każde miejsce trzyma je trochę inaczej.
function avatarHoverPlayerId(img) {
  if (img.matches('.my-avatar-thumb')) return state.playerId;
  const holder = img.closest('[data-tip-player], .target-row[data-id], [data-player-id]');
  if (!holder) return null;
  return Number(holder.dataset.tipPlayer || holder.dataset.id || holder.dataset.playerId) || null;
}

function avatarHoverHtml(img) {
  const g = state.game;
  const id = avatarHoverPlayerId(img);
  const p = g && id && (g.players || []).find(x => x.player_id === id);
  if (p) return slPawnHtml(p, { noTip: true, batDefault: g.board ? slBoardView(g.board).pawn === 'bat' : false });
  const wrap = img.closest('.sl-pawn-wrap');
  if (!wrap) return null;
  const clone = wrap.cloneNode(true);
  clone.removeAttribute('title');
  return clone.outerHTML;
}

document.addEventListener('mouseover', e => {
  const img = e.target.closest(AVATAR_HOVER_SELECTOR);
  if (!img || !img.src) return;
  // Duży podgląd w garderobie jest już duży — drugi nad nim tylko zasłaniałby przyciski.
  if (img.closest('.costume-preview')) return;
  const box = document.getElementById('avatar-hover-preview');
  const pawn = avatarHoverHtml(img);
  // Gracz spoza listy (np. bez zdjęcia na planszy) — zostaje samo zdjęcie, ale okrągłe.
  box.innerHTML = pawn || `<span class="sl-pawn-wrap"><img class="sl-pawn-avatar" src="${esc(img.src)}" alt="" /></span>`;
  positionAvatarHoverPreview(e.clientX, e.clientY);
  box.style.display = 'flex';
});
document.addEventListener('mousemove', e => {
  const preview = document.getElementById('avatar-hover-preview');
  if (preview.style.display !== 'none') positionAvatarHoverPreview(e.clientX, e.clientY);
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

// ── STAN GRY I PEŁNE PRZERYSOWANIE ──
async function loadState() {
  try {
    state.game = await api('GET', '/api/snakes/state');
    // Status bonusu za biuro przychodzi tylko w tym stanie (serwer potrzebuje adresu
    // z żądania) — odpowiedzi rzutu i sklepu go nie niosą, więc trzymamy go osobno.
    state.officeBonus = state.game.office_bonus || null;
    renderAll();
    slRenderOfficeBonus();
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
  // Garderobę przerysowujemy tylko, gdy jest otwarta — inaczej i tak jej nie widać.
  if (document.getElementById('wardrobe').style.display === 'flex') renderCostumes(g);
  document.getElementById('btn-wardrobe').hidden = !!slBoardView(g.board).shop_at;
  renderLeaderboard(g);
  renderRollButton(g);
  renderCoop(g);
  renderBossChip(g);
  slRenderSeasonRules(g);
  slMaybeCrown(g);
}

// ── BONUS ZA PRZYJŚCIE DO BIURA ── (lib/office.js)
// Okienko wyskakuje raz; „Później" chowa je do końca dnia (na tym urządzeniu), ale przycisk
// przy „Rzuć kostką" zostaje, dopóki bonus czeka. localStorage tylko na wygodę — bez niego
// okienko po prostu wróci przy kolejnym odświeżeniu stanu.
const OFFICE_LATER_KEY = 'sl_office_later';

function slOfficeLaterToday() {
  try { return localStorage.getItem(OFFICE_LATER_KEY) === (state.game && state.game.server_date); }
  catch (e) { return false; }
}

function slRenderOfficeBonus() {
  const ob = state.officeBonus;
  const available = !!(ob && ob.available);
  document.getElementById('btn-office-chip').hidden = !available;
  const overlay = document.getElementById('office-overlay');
  const show = available && !slOfficeLaterToday();
  if (show && overlay.style.display !== 'flex') overlay.style.display = 'flex';
  if (!show && overlay.style.display === 'flex') overlay.style.display = 'none';
}

async function slClaimOfficeBonus() {
  if (state.busy) return;
  state.busy = true;
  try {
    const res = await api('POST', '/api/snakes/office-bonus/claim');
    state.game = res.state;
    state.officeBonus = res.office_bonus || null;
    renderAll();
    slRenderOfficeBonus();
    showToast(res.granted === 'roll'
      ? `🏢 Dodatkowy ruch gotowy — rzucaj! (${state.game.me.rolls_remaining_today}/${state.game.me.daily_rolls} na dziś)`
      : '🏢 Dzisiejsze dodatkowe ruchy już masz — Extra Move czeka w ekwipunku na jutro.');
  } catch (e) {
    // Np. wyszedł z biura z otwartą kartą albo odebrał już na innym urządzeniu.
    showToast('❌ ' + e.message);
    state.officeBonus = null;
    slRenderOfficeBonus();
  } finally {
    state.busy = false;
  }
}

document.getElementById('btn-office-claim').addEventListener('click', () => slClaimOfficeBonus());
document.getElementById('btn-office-chip').addEventListener('click', () => slClaimOfficeBonus());
document.getElementById('btn-office-later').addEventListener('click', () => {
  try { localStorage.setItem(OFFICE_LATER_KEY, state.game && state.game.server_date); } catch (e) { /* tylko wygoda */ }
  document.getElementById('office-overlay').style.display = 'none';
});

// ── ZASADY MECHANIK SEZONOWYCH ── (kocioł, drzwi, cukierki; lib/seasonal.js)
// Jak regulamin bossa: składany ze stawek z payloadu, bo każdy sezon ma inne (albo żadne).
// Dawniej zasady w ogóle o nich nie mówiły i gracze nie wiedzieli, co dają.
function slRenderSeasonRules(g) {
  const li = document.getElementById('rules-season');
  if (!li) return;
  const ev = g.season_events;
  const parts = [];
  if (ev && ev.cauldron) {
    const c = ev.cauldron;
    parts.push(`<strong>🧪 Kocioł.</strong> Staniesz na polu z kotłem (${c.drop.join(', ')}) — wrzucasz do niego `
      + `<strong>${c.amount} coins</strong> (także gdy przez to zejdziesz na minus). Staniesz na chochli 🥄 (pole ${c.ladle}) — `
      + `<strong>zgarniasz wszystko, co jest w kotle</strong> (teraz ${c.pot} coins). Kocioł tylko przelewa coins między graczami, punktów nie daje.`);
  }
  if (ev && ev.trick_or_treat) {
    const t = ev.trick_or_treat, st = t.stakes;
    parts.push(`<strong>🚪 Cukierek albo psikus.</strong> Drzwi na polach ${t.tiles.join(', ')}: pół na pół `
      + `cukierek (<strong>+${st.treat} pkt</strong> albo 🍬 i <strong>+${st.candy} pkt</strong>) lub psikus `
      + `(zgniłe jajo <strong>−${st.trick} coins</strong> albo duch cofa Cię o 3 pola).`);
  }
  if (ev && ev.candy) {
    const c = ev.candy;
    parts.push(`<strong>🍬 Polowanie na cukierki.</strong> Codziennie na planszy pojawiają się nowe cukierki. `
      + `Staniesz na polu z cukierkiem — zbierasz go i dostajesz <strong>+${c.points} pkt</strong>. `
      + (c.prize
        ? `Kto na koniec sezonu ma <strong>najwięcej cukierków</strong>, dostaje nagrodę: <strong>${esc(c.prize.icon)} ${esc(c.prize.name)}</strong> (przy remisie — każdy z czołówki).`
        : 'Liczbę zebranych cukierków widać w rankingu.'));
  }
  // Zdarzenie odpala tylko rzucający — wypchnięty przez kogoś nic nie płaci i nic nie zbiera.
  if (parts.length) parts.push('Wszystko to działa tylko na polu, na którym <strong>sam wylądujesz</strong> po rzucie — wypchnięcie przez kogoś niczego nie odpala.');
  li.hidden = !parts.length;
  li.querySelector('.rules-season-text').innerHTML = parts.join(' ');
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

  renderSeasonEffects(board.effects || []);
}

// ── SKLEP Z KOSTIUMAMI ──
// Zakładka slotu jest stanem strony (nie serwera) — przeżywa odświeżanie co 10 s, bo
// renderCostumes czyta ją stąd, zamiast zaczynać zawsze od „Czapki".
let slCostumeTab = 'hat';
// Numer do BLIK-a: dociągany dopiero po kliknięciu „Pokaż numer" (nie jedzie w stanie
// gry odświeżanym co 10 s). Raz pokazany zostaje odsłonięty do przeładowania strony.
let slSupporterPhone = null;

// Karta skina wsparcia (zakładka „Golden Carrot"): nie ma ceny w coins, tylko instrukcję BLIK.
function slSupporterCard(i, c) {
  const season = i.season_active
    ? `<span class="costume-season">🗓️ Skin sezonowy · ${esc(i.season_name)}</span>`
    : `<span class="costume-season is-past">🗓️ Sezon ${esc(i.season_name)} · już niedostępny</span>`;
  let body;
  if (i.owned) {
    body = `<span class="costume-owned-tag">w szafie · dzięki za wsparcie! 💛</span>`
      + (i.worn
        ? `<button class="btn-ghost costume-off" data-slot="${i.slot}">Zdejmij</button>`
        : `<button class="btn-primary costume-wear" data-slot="${i.slot}" data-item="${i.id}">Załóż</button>`);
  } else if (!c.supporter_open) {
    body = `<span class="costume-missing">Wsparcie jeszcze nieuruchomione.</span>`;
  } else {
    const phone = slSupporterPhone
      ? `<span class="supporter-phone mono">${esc(slSupporterPhone)}</span>`
      : `<button class="btn-ghost supporter-reveal">👁️ Pokaż numer</button>`;
    body = `<span class="costume-price costume-price-pln mono">${i.pln} zł · BLIK</span>
      <div class="supporter-howto">
        Wyślij BLIK-a na ${i.pln} zł na numer: ${phone}
        <span class="text-muted">W tytule wpisz swój nick. Twórca dopisze skin ręcznie, gdy zobaczy przelew.</span>
      </div>`;
  }
  return `
      <div class="costume-item is-supporter${i.worn ? ' is-worn' : ''}${i.owned ? ' is-owned' : ''}">
        <span class="costume-icon">${i.icon}</span>
        <span class="costume-name">${esc(i.name)}</span>
        ${season}
        ${body}
      </div>`;
}

function renderCostumes(g) {
  const box = document.getElementById('costume-shop');
  if (!box || !g.costumes) return;
  const c = g.costumes;
  const hasSupporter = c.items.some(i => i.supporter);
  if (slCostumeTab === 'supporter' && !hasSupporter) slCostumeTab = 'hat';
  // Podgląd = mój pionek złożony TĄ SAMĄ funkcją co na planszy (slPawnHtml), tylko duży —
  // wszystkie dodatki są w procentach boku pionka, więc skalują się razem z nim.
  const me = { player_id: g.me.player_id, nickname: 'Ty', avatar_url: g.me.avatar_url, is_me: true, costume: c.worn };
  const worn = c.slots.map(sl => {
    const it = c.items.find(i => i.slot === sl.id && i.worn);
    return `<div class="wardrobe-worn-row"><span class="text-muted">${esc(sl.label)}</span><span>${it ? `${it.icon} ${esc(it.name)}` : '—'}</span></div>`;
  }).join('');
  const tabs = c.slots.map(sl => `<button class="costume-tab${sl.id === slCostumeTab ? ' is-active' : ''}" data-slot="${sl.id}">${esc(sl.label)}</button>`).join('')
    + (hasSupporter ? `<button class="costume-tab costume-tab-supporter${slCostumeTab === 'supporter' ? ' is-active' : ''}" data-slot="supporter">Golden Carrot</button>` : '');
  // Skiny wsparcia mieszkają tylko w swojej zakładce (nie w „Czapce"), żeby nie mieszać
  // ceny w coins z ceną w złotówkach na jednej liście.
  const items = slCostumeTab === 'supporter'
    ? `<div class="supporter-intro">Skin za wsparcie twórcy gry — jeden na sezon, tylko wygląd, w grze nic nie daje.</div>`
      + c.items.filter(i => i.supporter).map(i => slSupporterCard(i, c)).join('')
    : c.items.filter(i => i.slot === slCostumeTab && !i.supporter).map(i => {
    let btn;
    // Kostium to rzecz, na którą się ODKŁADA — zamiast samego wyszarzonego przycisku
    // pokazujemy, ile już uzbierałeś i ile brakuje.
    let saving = '';
    if (!i.owned) {
      const have = Math.max(0, Number(g.me.balance) || 0);
      const can = have >= i.price;
      btn = `<button class="btn-primary costume-buy" data-item="${i.id}" ${can ? '' : 'disabled'}>Kup</button>`;
      if (!can) {
        saving = `<div class="costume-saving" title="Uzbierane ${have} z ${i.price} coins">
            <span class="costume-saving-bar" style="width:${Math.round((have / i.price) * 100)}%"></span>
          </div>
          <span class="costume-missing">brakuje ${i.price - have} coins</span>`;
      }
    }
    else if (i.worn) btn = `<button class="btn-ghost costume-off" data-slot="${i.slot}">Zdejmij</button>`;
    else btn = `<button class="btn-primary costume-wear" data-slot="${i.slot}" data-item="${i.id}">Załóż</button>`;
    // Nakładka zmienia kształt pionka, a tego emoji nie pokaże — w tej zakładce ikoną jest
    // miniatura mojego pionka w danej nakładce (ta sama funkcja co na planszy). Bez „is-me",
    // żeby obrys miał kolor nakładki, a nie ten sam akcent na każdej karcie.
    const icon = i.slot === 'overlay' && g.me.avatar_url && SL_COSTUME_SHAPES[i.id]
      ? `<span class="costume-mini">${slPawnHtml({ ...me, is_me: false, costume: { overlay: i.id } }, { noTip: true })}</span>`
      : i.icon;
    return `
      <div class="costume-item${i.worn ? ' is-worn' : ''}${i.owned ? ' is-owned' : ''}">
        <span class="costume-icon">${icon}</span>
        <span class="costume-name">${esc(i.name)}</span>
        ${i.season && !i.season_active ? `<span class="costume-season is-past">🗓️ z sezonu ${esc(i.season_name)}</span>` : ''}
        ${i.owned ? '<span class="costume-owned-tag">w szafie</span>' : `<span class="costume-price mono">${i.price} coins</span>`}
        ${saving}
        ${btn}
      </div>`;
  }).join('');
  box.innerHTML = `
    <div class="wardrobe-body">
      <div class="wardrobe-hero">
        <div class="costume-preview">${g.me.avatar_url ? slPawnHtml(me, { noTip: true }) : ''}</div>
        <div class="wardrobe-worn">${worn}</div>
        <div class="wardrobe-balance mono">💰 ${g.me.balance} coins</div>
      </div>
      <div class="wardrobe-shop">
        <div class="costume-tabs">${tabs}</div>
        <div class="costume-list">${items}</div>
      </div>
    </div>`;
}

function openWardrobe() {
  if (!state.game) return;
  // Z chatki na planszy da się wejść także z podglądu na telefonie. Przy prawdziwym
  // pełnym ekranie (Android) przeglądarka rysuje tylko #board-sheet, a garderoba leży poza
  // nim — byłaby otwarta, ale niewidoczna. Najpierw zamykamy podgląd.
  slBoardPeek(false);
  renderCostumes(state.game);
  document.getElementById('wardrobe').style.display = 'flex';
}
function closeWardrobe() { document.getElementById('wardrobe').style.display = 'none'; }
document.getElementById('btn-wardrobe').addEventListener('click', openWardrobe);
document.getElementById('wardrobe-close').addEventListener('click', closeWardrobe);
// Klik w tło (poza kartą) zamyka — jak w każdym oknie.
document.getElementById('wardrobe').addEventListener('click', e => { if (e.target.id === 'wardrobe') closeWardrobe(); });
// Chatka na planszy — delegacja, bo #board-area przerysowuje się przy każdej zmianie stanu.
document.getElementById('board-area').addEventListener('click', e => { if (e.target.closest('.sl-shop-hut')) openWardrobe(); });

// ── PODGLĄD PLANSZY NA TELEFONIE ── (CSS: .board-sheet)
// Otwarcie przełącza tylko klasę na <body>. Tam, gdzie się da (Android), prosimy dodatkowo
// o pełny ekran i blokadę orientacji w poziomie — wtedy obrót z CSS nie jest potrzebny, bo
// ekran sam jest poziomy. iOS tego nie obsługuje i zostaje przy obrocie z CSS; błędy są
// ignorowane, bo to tylko wygoda, nie warunek działania.
function slBoardPeek(open) {
  const was = document.body.classList.contains('board-open');
  if (open === was) return;
  document.body.classList.toggle('board-open', open);
  slTipHide();
  const sheet = document.getElementById('board-sheet');
  if (open) {
    if (sheet.requestFullscreen && window.matchMedia('(pointer: coarse)').matches) {
      sheet.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
        .catch(() => {});
    }
  } else if (document.fullscreenElement) {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
    document.exitFullscreen().catch(() => {});
  }
}
document.getElementById('btn-board-peek').addEventListener('click', () => slBoardPeek(true));
document.getElementById('board-sheet-close').addEventListener('click', () => slBoardPeek(false));
// Wyjście z pełnego ekranu gestem systemowym (wstecz) zamyka też podgląd.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) slBoardPeek(false); });

document.getElementById('costume-shop').addEventListener('click', async e => {
  const tab = e.target.closest('.costume-tab');
  if (tab) { slCostumeTab = tab.dataset.slot; if (state.game) renderCostumes(state.game); return; }
  if (e.target.closest('.supporter-reveal')) {
    try {
      slSupporterPhone = (await api('GET', '/api/snakes/costumes/supporter-phone')).phone;
      if (state.game) renderCostumes(state.game);
    } catch (err) {
      showToast(err.message);
    }
    return;
  }
  const buy = e.target.closest('.costume-buy');
  const wear = e.target.closest('.costume-wear');
  const off = e.target.closest('.costume-off');
  if (!buy && !wear && !off) return;
  if (state.busy) return;
  state.busy = true;
  try {
    const res = buy
      ? await api('POST', '/api/snakes/costumes/buy', { item: buy.dataset.item })
      : await api('POST', '/api/snakes/costumes/wear', { slot: (wear || off).dataset.slot, item: wear ? wear.dataset.item : null });
    state.game = res.state;
    renderAll();
    if (buy) {
      const it = res.state.costumes.items.find(i => i.id === res.item);
      showToast(`🪞 Kupiono i założono: ${it ? `${it.icon} ${it.name}` : 'kostium'} (-${res.price} coins)`);
      loadActivity(document.getElementById('activity-date').value || null);
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    state.busy = false;
  }
});

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

// ── KIEDY NASTĘPNY DZIEŃ GRY ──
// „jutro" albo „w poniedziałek" (po piątku, a z blokadą weekendów także w sobotę), z godziną
// otwarcia. Termin liczy serwer (next_day_open_at, pomija dni bez gry), tu tylko słowa.
const SL_WEEKDAY_WHEN = ['w niedzielę', 'w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę'];
function slWarsawDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date(ms)); // YYYY-MM-DD
}
function slNextPlayDay(g) {
  const at = Date.parse(g.me.next_day_open_at || '');
  if (!at) return { day: 'jutro', full: 'jutro' };
  const [y, m, d] = slWarsawDate(at).split('-').map(Number);
  const [ty, tm, td] = slWarsawDate(Date.now()).split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  const day = days === 1 ? 'jutro' : SL_WEEKDAY_WHEN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { day, full: `${day} o ${g.me.office_start_hour}:00` };
}
// Biuro zamknięte NA DZIŚ (po godzinach), a nie jeszcze przed otwarciem: najbliższe
// otwarcie wypada innego dnia. Wtedy niewykorzystane ruchy już przepadły.
function slClosedForToday(g) {
  return !g.me.office_open && slWarsawDate(Date.parse(g.me.next_move_at)) !== slWarsawDate(Date.now());
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
      btn.textContent = `✅ Ruchy wykorzystane — wróć ${slNextPlayDay(g).day}`;
    } else if (slClosedForToday(g)) {
      btn.textContent = `🏢 Na dziś koniec — wróć ${slNextPlayDay(g).full}`;
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
    // Rozwidlona drabina: zanim pokażemy końcowy stan, stawiamy pionek na polu rozwidlenia
    // i dajemy graczowi „rzucić" o odnogę. Wynik rozstrzygnął już serwer (tak jak każdy
    // rzut) — przycisk tylko go odsłania, więc nie da się niczego podejrzeć ani przerzucić.
    // `state.busy` trzyma odświeżanie w tle z dala, dopóki okno jest otwarte.
    if (res.move.fork && res.move.fork.at_tile != null) {
      renderBoard(slBoardWithMeAt(g, res.move.fork.at_tile));
      await slForkDiceModal(res.move.fork, g.board);
    }
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

// Kopia stanu sprzed rzutu z moim pionkiem przestawionym na `tile` — do narysowania
// planszy „w połowie ruchu" (stoję na rozwidleniu, jeszcze przed rzutem o odnogę).
function slBoardWithMeAt(g, tile) {
  const copy = JSON.parse(JSON.stringify(g));
  copy.players.forEach(p => { if (p.is_me) p.tile = tile; });
  copy.me.tile = tile;
  return copy;
}

// Oczka kostki jako siatka 3×3: które z dziewięciu miejsc świecą dla danej wartości.
const SL_DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function slDieFace(v) {
  return Array.from({ length: 9 }, (_, i) => `<span class="die-pip${SL_DIE_PIPS[v].includes(i) ? ' is-on' : ''}"></span>`).join('');
}

// Okno rozwidlonej drabiny: duża kostka i przycisk „Rzuć". Po kliknięciu kostka przez
// chwilę losuje (szybko zmienia ścianki i się trzęsie), zatrzymuje się na wyniku
// z serwera, pokazuje werdykt i zamyka się sama. Zwraca Promise — rzut czeka na nią,
// zanim narysuje końcową pozycję.
function slForkDiceModal(fork, board) {
  const tile = board.tiles.find(t => t.kind === 'fork' && t.position === fork.at_tile);
  const faces = tile ? tile.faces : [];
  const win = tile ? tile.target : fork.to_tile;
  const lose = tile ? tile.alt_target : fork.to_tile;
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'overlay fork-modal';
    el.innerHTML = `
      <div class="fork-card" role="dialog" aria-modal="true" aria-labelledby="fork-title">
        <div class="fork-title" id="fork-title">🪜 Rozwidlona drabina!</div>
        <div class="fork-rule">Wyrzuć <strong>${faces.join(' albo ')}</strong> → idziesz górą na pole <strong>${win}</strong><br>
          cokolwiek innego → krótsza odnoga na pole <strong>${lose}</strong></div>
        <div class="fork-die" aria-live="polite">${slDieFace(1 + Math.floor(Math.random() * 6))}</div>
        <div class="fork-verdict"></div>
        <button class="btn-primary fork-roll">🎲 Rzuć</button>
      </div>`;
    document.body.appendChild(el);
    const die = el.querySelector('.fork-die');
    const btn = el.querySelector('.fork-roll');
    const verdict = el.querySelector('.fork-verdict');
    btn.focus();
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Losuję…';
      die.classList.add('is-rolling');
      // Ścianki zwalniają jak prawdziwa kostka: najpierw szybko, potem coraz wolniej.
      const delays = [60, 60, 60, 70, 70, 80, 90, 110, 130, 160, 200, 250];
      let last = 0;
      const step = i => {
        if (i >= delays.length) {
          die.classList.remove('is-rolling');
          die.innerHTML = slDieFace(fork.roll);
          die.classList.add(fork.win ? 'is-win' : 'is-lose');
          verdict.innerHTML = fork.win
            ? `Wypadło <strong>${fork.roll}</strong> — idziesz górą na pole <strong>${fork.to_tile}</strong>! 🎉`
            : `Wypadło <strong>${fork.roll}</strong> — krótsza odnoga, pole <strong>${fork.to_tile}</strong>.`;
          btn.textContent = 'Idę dalej';
          btn.disabled = false;
          const close = () => { el.remove(); resolve(); };
          btn.onclick = close;
          setTimeout(close, 2600);
          return;
        }
        let v;
        do { v = 1 + Math.floor(Math.random() * 6); } while (v === last);
        last = v;
        die.innerHTML = slDieFace(v);
        setTimeout(() => step(i + 1), delays[i]);
      };
      step(0);
    }, { once: true });
  });
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
  const se = m.season_event;
  if (se) {
    const txt = {
      cauldron_drop: `🧪 Kocioł zabrał ${-se.coins} coins!`,
      cauldron_take: se.coins > 0 ? `🥄 Zgarnąłeś chochlą cały kocioł: +${se.coins} coins!` : '🥄 Chochla… ale kocioł był pusty.',
      treat: `🍭 Cukierek! +${se.points} pkt`,
      treat_candy: `🍭 Cukierek! +🍬 i +${se.points} pkt`,
      trick_egg: `🥚 Psikus! Zgniłe jajo: ${se.coins} coins`,
      trick_scare: `👻 Psikus! Duch przestraszył Cię na pole ${se.to_tile}`,
      candy: se.points ? `🍬 Znalazłeś cukierka! +${se.points} pkt` : '🍬 Znalazłeś cukierka!',
    }[se.kind];
    if (txt) noteTxt.push(txt);
  }
  if (m.fork) {
    noteTxt.push(m.fork.win
      ? `🪜🎲 rozwidlona drabina: wypadło ${m.fork.roll} — idziesz górą na pole ${m.fork.to_tile}!`
      : `🪜🎲 rozwidlona drabina: wypadło ${m.fork.roll} — krótsza odnoga, pole ${m.fork.to_tile}.`);
  }
  if (m.curse_variant) {
    noteTxt.push(`💀 Klątwa: ${esc(m.curse_label)}!${m.curse_coin_steal ? ` (-${m.curse_coin_steal} 💰)` : ''}`);
  }
  if (m.knockback && m.knockback.length) {
    const names = m.knockback.map(k => esc(k.nickname)).join(', ');
    // Łup liczymy tylko z MOICH zbić — dalsze w kaskadzie robią wypchnięci, nie ja,
    // i to oni dostają swoje punkty i coins. Moje to pierwsze i każde inne o tym samym
    // `stolen_by` (po psikusie zbijam drugi raz, na polu, na które przestraszył mnie duch).
    const mine = m.knockback.filter(k => k.stolen_by === m.knockback[0].stolen_by);
    const coins = mine.reduce((a, k) => a + (k.coins_stolen || 0), 0);
    const pts = mine.reduce((a, k) => a + (k.points_won || 0), 0);
    noteTxt.push(`💥 wypchnąłeś: ${names}!${pts > 0 ? ` (+${pts} pkt${coins > 0 ? `, +${coins} 💰 zabranych` : ''})` : ''}`);
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
// `item.cost` to cena, którą gracz REALNIE zapłaci — serwer dolicza do niej Drożyznę,
// jeśli na graczu wisi (patrz slShopPayload). Wcześniej witryna rysowała cenę bazową,
// a kasa brała 1,5×: gracz z 80 coins klikał Shielda „za 70" i dostawał „za mało,
// koszt 105". Cena przekreślona pokazuje, ile to kosztowało przed klątwą.
function renderShop(g) {
  const list = document.getElementById('shop-list');
  const curse = g.shop_price_curse;
  const note = document.getElementById('shop-curse-note');
  if (note) {
    // `curse.label` niesie już własną ikonę (SL_CURSE_LABELS), więc NIE dokładamy drugiej.
    note.innerHTML = curse
      ? `<strong>${esc(curse.label)}</strong> — Twój najbliższy zakup jest droższy o ${curse.markup_percent}%. Klątwa znika po nim.`
      : '';
    note.style.display = curse ? '' : 'none';
  }

  list.innerHTML = g.shop.map(item => {
    const meta = POWERUP_META[item.type];
    const owned = g.inventory[item.type] || 0;
    const full = item.max_owned != null && owned >= item.max_owned;
    const canBuy = g.me.balance >= item.cost && !full;
    const canUse = owned > 0;
    const bumped = item.base_cost != null && item.cost > item.base_cost;
    let costHtml = bumped
      ? `<s class="shop-cost-old">${item.base_cost}</s> <span class="shop-cost-up">${item.cost}</span> coins`
      : `${item.cost} coins`;
    // Extra Move: cena z miejsca w rankingu. Kolor mówi, czy taniej (zielona), czy drożej
    // (czerwona) niż zwykle; wyjaśnienie jest w dymku, a nie w opisie karty.
    if (item.rank_prices) {
      const base = item.rank_prices.mid;
      const tone = item.base_cost < base ? 'is-cheaper' : item.base_cost > base ? 'is-pricier' : '';
      costHtml = `<span class="shop-cost-rank ${tone}" tabindex="0" data-price-tip="double_move">${costHtml}</span>`;
    }
    return `
      <div class="shop-item">
        <div class="shop-top">
          <span class="shop-name">${meta.icon} ${meta.name}</span>
          <span class="shop-cost mono">${costHtml}</span>
        </div>
        <div class="shop-desc text-muted small">${meta.desc}</div>
        <div class="shop-actions">
          <button class="btn-ghost shop-buy" data-type="${item.type}" ${canBuy ? '' : 'disabled'}${full ? ` title="Masz już ${item.max_owned} — więcej nie da się trzymać"` : ''}>Kup</button>
          <button class="btn-primary shop-use" data-type="${item.type}" ${canUse ? '' : 'disabled'}>Użyj${owned ? ` (${owned})` : ''}</button>
        </div>
      </div>`;
  }).join('');
}

// Dymek przy cenie Extra Move: skąd ta kwota. Cena wynika z BIEŻĄCEGO miejsca w rankingu
// (serwer: slPowerupBaseCost) — bez wyjaśnienia skacząca cena wyglądałaby na błąd.
function slExtraMovePriceTip() {
  const item = state.game && state.game.shop ? state.game.shop.find(i => i.type === 'double_move') : null;
  if (!item || !item.rank_prices) return '';
  const rp = item.rank_prices;
  const tiers = [
    ...rp.top.map((c, i) => [i + 1, `${i + 1}. miejsce`, c]),
    [4, `4.–${rp.mid_until}. miejsce`, rp.mid],
    [rp.mid_until + 1, `${rp.mid_until + 1}. i dalej`, rp.low],
  ];
  const mine = (from) => item.rank && (from === item.rank || (from === 4 && item.rank >= 4 && item.rank <= rp.mid_until) || (from === rp.mid_until + 1 && item.rank > rp.mid_until));
  const rows = tiers.map(([from, label, c]) =>
    `<div class="sl-tip-row${mine(from) ? ' is-mine' : ''}"><span class="sl-tip-lbl">${label}</span><span class="sl-tip-val mono">${c} coins</span></div>`).join('');
  const verdict = item.base_cost < rp.mid ? 'goniącym jest taniej' : item.base_cost > rp.mid ? 'czołówka płaci więcej' : 'cena zwykła';
  return `<div class="sl-tip-head">Extra Move · ${item.rank ? `jesteś ${item.rank}.` : 'nowy gracz'}<span class="sl-tip-total mono">${verdict}</span></div>`
    + rows
    + `<div class="sl-tip-empty">Cena zależy od bieżącego miejsca w rankingu — żeby łatwiej było gonić liderów. Awansujesz, a następna sztuka kosztuje więcej.</div>`;
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
    // Cena, którą gracz widzi — serwer wstrzyma zakup, jeśli policzy inną (Extra Move
    // kosztuje tyle, ile wynika z BIEŻĄCEGO miejsca w rankingu).
    const shown = state.game && state.game.shop ? state.game.shop.find(i => i.type === type) : null;
    const res = await api('POST', '/api/snakes/shop/buy', { type, expected_cost: shown ? shown.cost : undefined });
    state.game = res.state;
    renderAll();
    showToast(res.price_curse
      ? `${res.price_curse.label}! Kupiono ${POWERUP_META[type].name} za ${res.cost} coins zamiast ${res.base_cost} (+${res.price_curse.extra}) — klątwa zdjęta.`
      : `🛒 Kupiono: ${POWERUP_META[type].name}`);
    loadActivity(document.getElementById('activity-date').value || null);
  } catch (e) {
    // Zakup wstrzymany przez świeżo odsłoniętą Drożyznę — NIC nie zostało kupione ani
    // pobrane z konta. Serwer dosyła świeży stan z podniesionymi cenami: przerysowujemy
    // sklep, żeby gracz zobaczył nowe kwoty, i zostawiamy mu decyzję jeszcze raz.
    if (e.data && (e.data.price_curse_revealed || e.data.price_changed)) {
      state.game = e.data.state;
      renderAll();
      showToast(e.data.error);
      loadActivity(document.getElementById('activity-date').value || null);
    } else {
      showToast(e.message);
    }
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
  } else if (g && g.me.rolls_remaining_today > 0 && slClosedForToday(g)) {
    // Po godzinach dzisiejsze ruchy nie czekają (przepadają o północy, a do zamknięcia
    // biura i tak nie da się ich użyć). Odliczanie na trzy dni wyglądałoby jak awaria.
    textEl.textContent = `🏢 Biuro zamknięte — na dziś koniec gry. Wracamy ${slNextPlayDay(g).full}.`;
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
    const next = g ? slNextPlayDay(g) : null;
    textEl.textContent = next && next.day !== 'jutro'
      ? `🔒 Ruchy wykorzystane — nowe ${next.full}`
      : `🔒 Ruchy wykorzystane — nowe za ${fmtHMS(toNext)}`;
  }
  if (barEl) barEl.style.width = ((1 - toNext / 86400) * 100) + '%';
  if (g) renderRollButton(g);
  updateCoopDeadline();
}

// ── CONFETTI ──
function showConfetti(custom = null) {
  const container = document.getElementById('confetti-container');
  // Sezon może mieć własne konfetti (np. dynie i duchy) — patrz `confetti` w pliku planszy.
  const seasonal = state.game && state.game.board && slBoardView(state.game.board).confetti;
  const icons = custom || seasonal || ['🎉', '⭐', '🐍', '🪜'];
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
