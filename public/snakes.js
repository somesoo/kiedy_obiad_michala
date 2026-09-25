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

// ── HISTORIA AKTYWNOŚCI (prawa kolumna) ──
const ACTIVITY_ICONS = { roll: '🎲', shop_buy: '🛒', shop_use: '⚡', curse_fired: '💀', knockback: '💥', avatar: '🖼️', boss_hit: '⚔️', bonus_grant: '🏦', boss_reward: '🏆', season_event: '🎃' };

// Które bloki dziennika są rozwinięte — po `ref`, który jest stały między odświeżeniami.
const activityOpen = new Set();

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

  // ── GRUPOWANIE PO TURZE ──
  // Wszystkie wpisy z jednego rzutu mają wspólny `ref` (patrz slNewTurnRef na serwerze)
  // i przychodzą obok siebie, bo lista jest sortowana po id. Zbijamy je w jeden blok:
  // rzut robi za nagłówek, reszta (klątwa, zbicia, kaskada, trafienie bossa) wcina się
  // pod nim. Wcześniej to była ściana jednakowych wierszy z tą samą godziną i różnymi
  // nickami — nie dało się zobaczyć, gdzie kończy się jedna tura.
  //
  // Kolejność PODLINIJEK zostaje taka, jak przyszły z serwera (malejąco po id), bo to
  // właśnie ona czyta się chronologicznie: klątwa (zapisana po rzucie) ląduje tuż pod
  // nagłówkiem, a kaskada zbić — zapisywana odwrotnie, patrz slApplyKnockback — wraca
  // do właściwej kolejności. Nie sortuj tego rosnąco „dla porządku".
  const groups = [];
  for (const e of data.entries) {
    const prev = groups[groups.length - 1];
    if (prev && e.ref && prev.ref === e.ref) prev.entries.push(e);
    else groups.push({ ref: e.ref || null, entries: [e] });
  }

  let lastDay = null;
  let html = '';
  // `hideNick` — podlinijki należące do gracza z nagłówka nie powtarzają jego nicku
  // („kanat 6 → pole 33" / „⚔️ atak na bossa"), ale cudze ZAWSZE go mają, bo bez niego
  // nie wiadomo, kogo dotyczą (paulinka wypchnięta, witold rzucił klątwę).
  const renderRow = (e, sub, hideNick) => {
    const time = new Date(e.created_at.replace(' ', 'T') + 'Z')
      .toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
    const icon = e.icon || ACTIVITY_ICONS[e.type] || '•';
    // Treść prawie każdego wpisu zaczyna się od własnego emoji, a obok stoi jeszcze
    // kolumna z ikoną typu — wychodziło „🎲 kanat 🎲 6 → pole 40". Ucinamy ten wiodący
    // emoji, bo ikona z gutteru mówi to samo i trzyma pion. Wpisy bez emoji (np. trafienie
    // bossa) zostają nietknięte, więc ⚔️ dalej ma co pokazywać.
    // To zmiana WYŁĄCZNIE wizualna: predykat „to mój wpis" liczy się niżej z `player_id`,
    // nigdy z treści — patrz komentarz poniżej.
    const text = String(e.detail).replace(/^\p{Extended_Pictographic}️?\s*/u, '');
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
    return `
      <div class="activity-entry${sub ? ' is-sub' : ''}${mine ? ' is-me' : ''}${curseFired ? ' is-curse-fired' : ''}"${curseFired ? ' title="Klątwa odpaliła"' : mine ? ' title="Twoja akcja"' : ''}>
        <span class="activity-time mono">${sub ? '' : time}</span>
        <span class="activity-icon">${icon}</span>
        <span class="activity-body">${hideNick ? '' : `<strong>${esc(e.nickname)}</strong> `}${esc(text)}</span>
      </div>`;
  };

  // Rząd malutkich awatarów w zwiniętym nagłówku bloku — „kogo to dotyczy" bez czytania.
  // Lista graczy pochodzi WYŁĄCZNIE z `player_id` wpisów w bloku, nigdy z treści: pasek
  // nie może pokazać nikogo, kogo nie widać już jako nicku po rozwinięciu (Freeze, klątwy).
  const isMe = id => Number(id) === Number(state.playerId);
  const renderFaces = entries => {
    const seen = new Set();
    const people = [];
    for (const e of entries) {
      if (seen.has(Number(e.player_id))) continue;
      seen.add(Number(e.player_id));
      people.push(e);
    }
    if (!people.length) return '';
    // Przy karze bossa to cała ekipa — kilkanaście kółek nie mieści się w wąskiej kolumnie.
    const MAX = 6;
    const faces = people.slice(0, MAX).map(p => {
      const cls = `activity-face${isMe(p.player_id) ? ' is-me' : ''}`;
      return p.avatar_url
        ? `<img class="${cls}" src="${esc(p.avatar_url)}" alt="${esc(p.nickname)}" title="${esc(p.nickname)}" data-player-id="${Number(p.player_id)}" loading="lazy" />`
        : `<span class="${cls} is-initial" title="${esc(p.nickname)}">${esc(String(p.nickname || '?').charAt(0).toUpperCase())}</span>`;
    }).join('');
    const more = people.length > MAX ? `<span class="activity-face is-more">+${people.length - MAX}</span>` : '';
    return `<span class="activity-faces">${faces}${more}</span>`;
  };

  // Zwijany blok: nagłówek + awatary widać zawsze, szczegóły dopiero po kliknięciu.
  // Awatary idą osobnym rzędem POD tekstem nagłówka, a nie obok niego — w wąskiej
  // kolumnie obok tekstu zjadały mu miejsce i nagłówek łamał się na cztery linie.
  // Stan „rozwinięty" żyje w activityOpen (po `ref`), bo lista przerysowuje się co 10 s
  // przez innerHTML — bez tego rozwinięty blok zwijałby się sam pod palcem.
  const renderBlock = (ref, headHtml, facesHtml, bodyHtml, classes) => {
    const open = activityOpen.has(ref);
    return `
      <div class="activity-turn is-collapsible${open ? ' is-open' : ''}${classes}" data-ref="${esc(ref)}">
        <div class="activity-turn-head" role="button" tabindex="0" aria-expanded="${open}" title="${open ? 'Zwiń' : 'Pokaż szczegóły'}">
          ${headHtml}<span class="activity-chevron" aria-hidden="true">▸</span>
          ${facesHtml ? `<div class="activity-faces-row">${facesHtml}</div>` : ''}
        </div>
        <div class="activity-turn-body">${bodyHtml}</div>
      </div>`;
  };

  for (const g of groups) {
    const first = g.entries[0];
    if (first.date !== lastDay) {
      html += `<div class="activity-day">${esc(first.date)}</div>`;
      lastDay = first.date;
    }

    // Pojedynczy wpis (zakup, awatar) — bez ramki, jak dotąd.
    if (g.entries.length === 1) {
      html += renderRow(first, false, false);
      continue;
    }

    const hasMe = g.entries.some(e => isMe(e.player_id));

    // ── ROZLICZENIE BOSSA ── (kamień milowy, wygrana, kara) — wpis na gracza, wszystkie
    // o tym samym. Nagłówek to podsumowanie; po rozwinięciu każdy widzi swoją kwotę.
    if (String(g.ref).startsWith('boss:')) {
      const sorted = g.entries.slice().sort((a, b) => a.id - b.id);
      const texts = sorted.map(e => String(e.detail));
      // Kara i kamień milowy mają identyczną treść u wszystkich — pokazujemy ją raz.
      // Przy wygranej kwoty są różne, więc zostaje wspólny początek („Boss pokonany").
      const summary = texts.every(t => t === texts[0]) ? texts[0] : texts[0].split(' — ')[0];
      const headHtml = renderRow({
        ...sorted[0],
        detail: `${summary} · ${sorted.length} os.`,
        // Ikona z treści (🎯 próg / 🏆 wygrana / 💥 kara), a nie ogólne 🏆 typu — w zwiniętym
        // bloku to jedyna wskazówka, czy boss dał, czy zabrał.
        icon: (summary.match(/^\p{Extended_Pictographic}\uFE0F?/u) || [])[0],
        // Nagłówek nie jest niczyim wpisem — „to ja" świeci na awatarze i w szczegółach.
        player_id: null
      }, false, true);
      const body = sorted.map(e => renderRow(e, true, false)).join('');
      html += renderBlock(g.ref, headHtml, renderFaces(sorted), body,
        `${hasMe ? ' has-me' : ''} is-boss-block`);
      continue;
    }

    // ── TURA ── Nagłówkiem jest wpis o rzucie; gdy moderacja go ukryła, jego miejsce
    // zajmuje pierwszy skutek, żeby blok dalej miał co pokazać po zwinięciu.
    const headIdx = g.entries.findIndex(e => e.type === 'roll');
    // Skutki układamy narracyjnie: najpierw co odmieniło ten rzut (klątwa), potem kogo
    // zbił, na końcu ile oberwał boss. WEWNĄTRZ każdego rodzaju sortujemy ROSNĄCO po `id`,
    // czyli chronologicznie — blok ma się czytać z góry na dół, odwrotnie niż sama lista
    // dni (ta zostaje od najnowszych). Dlatego serwer zapisuje kaskadę zbić po kolei,
    // a nie od końca (patrz slApplyKnockback).
    const order = { curse_fired: 1, knockback: 2, boss_hit: 3 };
    const subs = g.entries
      .filter((_, i) => i !== headIdx)
      .sort((a, b) => ((order[a.type] || 9) - (order[b.type] || 9)) || (a.id - b.id));
    const head = headIdx >= 0 ? g.entries[headIdx] : subs.shift();
    const mineTurn = isMe(head.player_id);
    // Awatary pokazują INNYCH graczy, których tura dotknęła (zbici, rzucający klątwę) —
    // autor rzutu i tak stoi z nickiem w nagłówku. Trafienie bossa to tylko ⚔️ na końcu.
    const others = subs.filter(e => Number(e.player_id) !== Number(head.player_id));
    const bossMark = subs.some(e => e.type === 'boss_hit')
      ? '<span class="activity-mark" title="Atak na bossa">⚔️</span>' : '';
    const body = subs.map(e => renderRow(e, true,
      Number(e.player_id) === Number(head.player_id))).join('');
    html += renderBlock(g.ref, renderRow(head, false, false), renderFaces(others) + bossMark, body,
      `${mineTurn ? ' is-my-turn' : ''}${hasMe && !mineTurn ? ' has-me' : ''}`);
  }
  list.innerHTML = html;
}

function toggleActivityBlock(headEl) {
  const block = headEl.closest('.activity-turn.is-collapsible');
  if (!block) return;
  const ref = block.dataset.ref;
  const open = !block.classList.contains('is-open');
  if (open) activityOpen.add(ref); else activityOpen.delete(ref);
  block.classList.toggle('is-open', open);
  headEl.setAttribute('aria-expanded', String(open));
  headEl.title = open ? 'Zwiń' : 'Pokaż szczegóły';
}

// Delegacja na liście, a nie listener na każdym bloku — lista przerysowuje się co 10 s.
document.getElementById('activity-list').addEventListener('click', e => {
  const head = e.target.closest('.activity-turn-head');
  if (head) toggleActivityBlock(head);
});
document.getElementById('activity-list').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const head = e.target.closest('.activity-turn-head');
  if (!head) return;
  e.preventDefault();
  toggleActivityBlock(head);
});


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
  // Garderobę przerysowujemy tylko, gdy jest otwarta — inaczej i tak jej nie widać.
  if (document.getElementById('wardrobe').style.display === 'flex') renderCostumes(g);
  document.getElementById('btn-wardrobe').hidden = !!slBoardView(g.board).shop_at;
  renderLeaderboard(g);
  renderRollButton(g);
  renderCoop(g);
  renderBossChip(g);
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

// ── EFEKTY SEZONU ──
// Warstwa leży w kolumnie planszy, ale POZA #board-area: renderBoard podmienia innerHTML
// planszy przy każdej zmianie stanu i zresetowałby animacje w pół lotu. Tu budujemy ją
// raz na sezon (applySeason wychodzi wcześniej, gdy sezon się nie zmienił).
// Efekt, którego front nie zna, jest po prostu pomijany.
const SL_EFFECTS = {
  // Nietoperze przelatują od czasu do czasu przez planszę — różne tory, wysokości
  // i opóźnienia, żeby nie leciały kluczem.
  bats: () => [0, 1, 2, 3, 4].map(i => `
    <svg class="fx-bat fx-bat-${i}" viewBox="0 0 64 32" aria-hidden="true">
      <path d="M32 14 C29 8 26 8 24 12 C20 4 10 2 0 8 C8 10 12 16 12 22 C16 18 20 18 22 22 C25 18 28 18 30 20 L32 24 L34 20 C36 18 39 18 42 22 C44 18 48 18 52 22 C52 16 56 10 64 8 C54 2 44 4 40 12 C38 8 35 8 32 14 Z"/>
    </svg>`).join(''),
  // Mgła: dwa szerokie, rozmyte pasy dryfujące u dołu planszy w przeciwne strony.
  fog: () => '<div class="fx-fog fx-fog-a"></div><div class="fx-fog fx-fog-b"></div>',
};

function renderSeasonEffects(effects) {
  const host = document.querySelector('.col-game');
  if (!host) return;
  let layer = document.getElementById('season-fx');
  const html = effects.map(e => (SL_EFFECTS[e] ? SL_EFFECTS[e]() : '')).join('');
  if (!html) { if (layer) layer.remove(); return; }
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'season-fx';
    layer.className = 'season-fx';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
  }
  layer.innerHTML = html;
}

// ── SKLEP Z KOSTIUMAMI ──
// Zakładka slotu jest stanem strony (nie serwera) — przeżywa odświeżanie co 10 s, bo
// renderCostumes czyta ją stąd, zamiast zaczynać zawsze od „Czapki".
let slCostumeTab = 'hat';

function renderCostumes(g) {
  const box = document.getElementById('costume-shop');
  if (!box || !g.costumes) return;
  const c = g.costumes;
  // Podgląd = mój pionek złożony TĄ SAMĄ funkcją co na planszy (slPawnHtml), tylko duży —
  // wszystkie dodatki są w procentach boku pionka, więc skalują się razem z nim.
  const me = { player_id: g.me.player_id, nickname: 'Ty', avatar_url: g.me.avatar_url, is_me: true, costume: c.worn };
  const worn = c.slots.map(sl => {
    const it = c.items.find(i => i.slot === sl.id && i.worn);
    return `<div class="wardrobe-worn-row"><span class="text-muted">${esc(sl.label)}</span><span>${it ? `${it.icon} ${esc(it.name)}` : '—'}</span></div>`;
  }).join('');
  const tabs = c.slots.map(sl => `<button class="costume-tab${sl.id === slCostumeTab ? ' is-active' : ''}" data-slot="${sl.id}">${esc(sl.label)}</button>`).join('');
  const items = c.items.filter(i => i.slot === slCostumeTab).map(i => {
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

// ── BOSS: kafelek z HP + panel w okienku ──
// Pełny panel bossa zajmował pas pod planszą; zwinięty do kafelka w pasku oddaje planszy
// tę wysokość, więc pola i pionki (z kostiumami) są większe. Stan „otwarte" żyje w DOM
// (atrybut hidden na #coop-pop), bo okienko leży poza przerysowywaną planszą.
function renderBossChip(g) {
  const chip = document.getElementById('boss-chip');
  const c = g.coop;
  renderSpecialBossTeaser(c);
  if (!c || !c.boss) { chip.hidden = true; slToggleCoopPop(false); return; }
  const b = c.boss;
  const sp = c.special_boss && c.special_boss.active ? c.special_boss : null;
  chip.hidden = false;
  chip.classList.toggle('is-low', b.percent <= 25);
  chip.classList.toggle('is-special', !!sp);
  chip.innerHTML = `
    <span class="boss-chip-name">${sp ? esc(sp.emoji) : '👹'} ${esc(b.name)}</span>
    <span class="boss-chip-bar"><span class="boss-chip-fill" style="width:${b.percent}%"></span></span>
    <span class="boss-chip-hp mono">${b.hp}/${b.max_hp}</span>
    <span class="boss-chip-arrow" aria-hidden="true">▾</span>`;
  chip.title = `${b.name}: ${b.hp}/${b.max_hp} HP — kliknij, żeby zobaczyć walkę i wpłacić coins`;
}
// Zapowiedź bossa sezonowego (np. Dynia Zagłady): pigułka obok kafelka z odliczaniem
// do ataku. Widać ją od `announce_from`, także zanim ten boss w ogóle się pojawi —
// po to jest zapowiedź.
function renderSpecialBossTeaser(c) {
  let el = document.getElementById('special-boss-teaser');
  const sp = c && c.special_boss;
  if (!sp) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('span');
    el.id = 'special-boss-teaser';
    el.className = 'special-boss-teaser';
    const chip = document.getElementById('boss-chip');
    chip.parentNode.insertBefore(el, chip);
  }
  const when = new Date(sp.attack_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'short', day: 'numeric', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  el.dataset.until = sp.attack_at;
  el.title = sp.active
    ? `${sp.name} to teraz boss. Jeśli przeżyje do ${when}, zaatakuje wszystkich.`
    : `${sp.name} nadciąga — pojawi się jako następny boss i zaatakuje ${when}.`;
  el.innerHTML = `${esc(sp.emoji)} ${sp.active ? 'atak' : `${esc(sp.name)} nadciąga · atak`} <span class="mono" id="special-boss-countdown"></span>`;
  updateSpecialBossCountdown();
}
function updateSpecialBossCountdown() {
  const el = document.getElementById('special-boss-teaser');
  const out = document.getElementById('special-boss-countdown');
  if (!el || !out) return;
  const ms = Date.parse(el.dataset.until) - Date.now();
  if (ms <= 0) { out.textContent = 'teraz!'; return; }
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  out.textContent = d > 0 ? `za ${d}d ${h}h` : `za ${h}h ${m}m`;
}
setInterval(updateSpecialBossCountdown, 30000);

function slToggleCoopPop(open) {
  const pop = document.getElementById('coop-pop');
  const chip = document.getElementById('boss-chip');
  const next = open == null ? pop.hidden : open;
  pop.hidden = !next;
  chip.setAttribute('aria-expanded', String(next));
  chip.classList.toggle('is-open', next);
}
document.getElementById('boss-chip').addEventListener('click', () => slToggleCoopPop());
document.getElementById('coop-pop-close').addEventListener('click', () => slToggleCoopPop(false));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeWardrobe();
  slToggleCoopPop(false);
  slBoardPeek(false);
});

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
  // Dzień drzwi z `hide_bonuses`: dynie (pola bonusowe) są zdjęte — rysujemy je jak zwykłe
  // pola, bo serwer i tak nic na nich dziś nie wypłaca.
  const bonusesOff = !!(g.season_events && g.season_events.trick_or_treat && g.season_events.trick_or_treat.bonuses_off);
  board.tiles.forEach(t => { if (!(bonusesOff && t.kind === 'bonus')) special[t.position] = t; });
  const pawns = {};
  g.players.forEach(p => { (pawns[p.tile] = pawns[p.tile] || []).push(p); });
  // Rozstaje: dwa numery w jednym miejscu. Rysujemy JEDNO pole (pod mniejszym numerem)
  // z pionkami z obu, a drugi numer pomijamy — inaczej dwa kafelki leżałyby na sobie.
  const sharedWith = {};
  for (const [a, b] of board.shared || []) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    sharedWith[lo] = hi;
    sharedWith[hi] = null; // null = nie rysuj
    pawns[lo] = [...(pawns[lo] || []), ...(pawns[hi] || [])];
  }

  const view = slBoardView(board);
  const free = view.layout === 'free';
  const events = slEventTiles(g.season_events);
  let cells = '';
  board.path.forEach(([c, r], idx) => {
    // Układ 'free': pole nie siedzi w kratce, tylko stoi absolutnie w punkcie z pliku.
    // Szerokość i wysokość to ułamek kratki (view.tile), wyśrodkowany w jej kwadracie
    // 1×1 — dzięki temu slGridPoint (środek = c + 0.5) trafia w środek pola tak samo
    // jak w siatce, a droga i łączniki nie wymagają osobnej matematyki.
    const pos = free
      ? `left:${((c + (1 - view.tile) / 2) / board.cols) * 100}%;top:${((r + (1 - view.tile) / 2) / board.rows) * 100}%;`
        + `width:${(view.tile / board.cols) * 100}%;height:${(view.tile / board.rows) * 100}%`
      : `grid-column:${c + 1};grid-row:${r + 1}`;
    if (sharedWith[idx] === null) return;
    cells += renderCell(idx, special[idx], pawns[idx], pos, board, events[idx], sharedWith[idx]);
  });

  area.innerHTML = `
    <div class="sl-board-wrap${free ? ' is-free' : ''}">
      <div class="sl-board-stage" style="${slBoardInsets(board)}">
        ${renderDecor(board)}
        ${renderTrack(board)}
        <div class="sl-board${free ? ' sl-board-free' : ''}" style="--cols:${board.cols};--rows:${board.rows}">${cells}</div>
        ${renderConnectors(board)}
        ${renderPotLabel(board, g.season_events)}
        ${renderShopHut(board)}
      </div>
    </div>
    ${renderLegend(board, g.season_events)}`;
}

// ── ZDARZENIA SEZONOWE NA POLACH (lib/seasonal.js) ──
// Mapa pole → { kind, icon, title }. Pola zdarzeń nigdy nie są polami specjalnymi
// (pilnuje walidacja planszy), więc znaczek zdarzenia ma wolne miejsce na polu.
function slEventTiles(ev) {
  const out = {};
  if (!ev) return out;
  if (ev.cauldron) {
    ev.cauldron.drop.forEach(t => {
      out[t] = { kind: 'drop', icon: '🧪', title: `Kocioł: zabiera ${ev.cauldron.amount} coins (także na minus) — w kotle ${ev.cauldron.pot}` };
    });
    out[ev.cauldron.ladle] = { kind: 'ladle', icon: '🥄', title: `Chochla: zgarniasz cały kocioł — teraz ${ev.cauldron.pot} coins` };
  }
  if (ev.trick_or_treat) {
    // Bez `weekdays` drzwi są otwarte codziennie — wtedy nie ma czego wypisywać.
    const days = (ev.trick_or_treat.weekdays || []).map(d => ['pon', 'wt', 'śr', 'czw', 'pt'][d - 1]).join(' i ');
    const st = ev.trick_or_treat.stakes;
    const odds = st ? `cukierek (+${st.treat} pkt albo 🍬) lub psikus (−${st.trick} coins albo duch cofa)` : 'punkty albo psikus';
    ev.trick_or_treat.tiles.forEach(t => {
      out[t] = ev.trick_or_treat.active
        ? { kind: 'door', active: true, icon: '🚪', title: `Cukierek albo psikus! 50/50: ${odds}.` }
        : { kind: 'door', active: false, icon: '🚪', title: `Cukierek albo psikus — drzwi otwierają się tylko w: ${days}.` };
    });
  }
  if (ev.candy) {
    ev.candy.tiles.forEach(t => { if (!out[t]) out[t] = { kind: 'candy', icon: '🍬', title: 'Cukierek! Stań tu, żeby go zebrać.' }; });
  }
  return out;
}

// Garderoba na planszy (view.shop_at = środek w kratkach): gotycka szafa z lustrem na
// lewych drzwiach i uchylonymi prawymi, zza których widać wiszący strój. Klik → openWardrobe.
function renderShopHut(board) {
  const at = slBoardView(board).shop_at;
  if (!at) return '';
  return `<button class="sl-shop-hut" style="left:${(at[0] / board.cols) * 100}%;top:${(at[1] / board.rows) * 100}%" title="Garderoba — kostiumy dla Twojego pionka">
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <ellipse class="wr-glow" cx="40" cy="50" rx="38" ry="26"/>
      <path class="wr-body" d="M14 74 L14 22 Q14 8 40 4 Q66 8 66 22 L66 74 Z"/>
      <path class="wr-crest" d="M34 7 Q40 -2 46 7 Q40 4 34 7 Z"/>
      <path class="wr-inside" d="M41 20 L63 20 L63 70 L41 70 Z"/>
      <path class="wr-hanger" d="M52 24 Q52 21 54 21 Q56 21 56 23 M46 29 L54 25 L62 29"/>
      <path class="wr-dress" d="M48 29 L60 29 L58 36 L63 62 L45 62 L50 36 Z"/>
      <path class="wr-door" d="M17 20 L39 20 L39 70 L17 70 Z"/>
      <ellipse class="wr-mirror" cx="28" cy="40" rx="7.5" ry="12.5"/>
      <path class="wr-shine" d="M24 33 Q25 29 28 28"/>
      <path class="wr-door-open" d="M63 20 L74 15 L74 75 L63 70 Z"/>
      <circle class="wr-knob" cx="36" cy="46" r="1.3"/>
      <rect class="wr-foot" x="15" y="73" width="7" height="4" rx="1"/>
      <rect class="wr-foot" x="58" y="73" width="7" height="4" rx="1"/>
      <rect class="wr-sign" x="10" y="62" width="60" height="11" rx="3"/>
      <text class="wr-sign-text" x="40" y="70.2" text-anchor="middle">GARDEROBA</text>
    </svg>
  </button>`;
}

// Pula kotła wypisana przy namalowanym kotle (dekoracja 'cauldron' z pliku sezonu).
function renderPotLabel(board, ev) {
  if (!ev || !ev.cauldron) return '';
  const pot = slBoardView(board).decor.find(d => d.kind === 'cauldron');
  if (!pot) return '';
  return `<span class="sl-pot-label" style="left:${(pot.at[0] / board.cols) * 100}%;top:${((pot.at[1] + 0.9) / board.rows) * 100}%"
    title="Tyle zgarnie chochla na polu ${ev.cauldron.ladle}">🧪 ${ev.cauldron.pot} coins</span>`;
}

// Ustawienia wyglądu z pliku sezonu (lib/seasons.js → view). Stary serwer albo plansza
// bez nich = klasyczny wygląd, więc front działa z każdym payloadem.
function slBoardView(board) {
  return Object.assign({
    layout: 'grid', tile: 0.9, road: 'straight', closed: false, links: 'simple', pawn: 'circle', ghost_after_days: null,
    fork_junctions: {}, shop_at: null,
    loop_label: null, marks: null, confetti: null, decor: []
  }, board.view || {});
}

function slMarks(board) {
  return Object.assign({ ladder: '🪜', snake: '🐍', bonus: '⭐' }, slBoardView(board).marks || {});
}

// ── DEKORACJE SEZONU ──
// Plik sezonu mówi tylko CO i GDZIE (`kind`, środek, szerokość w kratkach), a rysunki
// siedzą tutaj. Payload nigdy nie niesie znaczników SVG — nieznany `kind` jest pomijany,
// więc przez plik planszy nie da się wstrzyknąć niczego do strony.
// Każdy rysunek ma własny viewBox i zachowuje proporcje (nie rozciąga się z planszą jak
// warstwa drogi), a kolory biorą się z klas `d-*`, które ustawia motyw.
const SL_DECOR = {
  moon: { vb: '0 0 120 100', svg: `
    <circle class="d-moon-halo" cx="60" cy="50" r="46"/>
    <circle class="d-moon" cx="60" cy="50" r="34"/>
    <circle class="d-moon-crater" cx="48" cy="40" r="7"/>
    <circle class="d-moon-crater" cx="70" cy="60" r="9"/>
    <circle class="d-moon-crater" cx="72" cy="36" r="4"/>
    <circle class="d-moon-crater" cx="50" cy="64" r="3.5"/>
    <path class="d-silhouette" d="M20 30 q6 -7 11 0 q2 -5 5 -1 q3 -4 5 1 q5 -7 11 0 q-6 1 -9 6 q-2 -3 -4 1 q-2 -4 -4 0 q-3 -5 -9 -1 z"/>
    <path class="d-silhouette" d="M84 72 q4 -5 8 0 q1.5 -3.5 3.5 -.7 q2 -2.8 3.5 .7 q3.5 -5 8 0 q-4.5 .7 -6.5 4.3 q-1.5 -2 -3 .7 q-1.5 -2.8 -3 0 q-2 -3.6 -6.5 -.7 z"/>` },
  ghost: { vb: '0 0 60 80', svg: `
    <path class="d-ghost" d="M30 4 C14 4 8 18 8 32 L8 70 L15 63 L22 71 L30 63 L38 71 L45 63 L52 70 L52 32 C52 18 46 4 30 4 Z"/>
    <ellipse class="d-ghost-eye" cx="23" cy="30" rx="4" ry="6"/>
    <ellipse class="d-ghost-eye" cx="37" cy="30" rx="4" ry="6"/>
    <ellipse class="d-ghost-eye" cx="30" cy="45" rx="5" ry="6"/>` },
  house: { vb: '0 -10 120 120', svg: `
    <path class="d-hill" d="M0 110 Q20 88 60 90 Q100 88 120 110 Z"/>
    <path class="d-silhouette" d="M24 96 L24 52 L14 52 L38 22 L50 36 L50 16 L44 16 L58 -2 L72 16 L66 16 L66 40 L82 26 L106 54 L96 54 L96 96 Z"/>
    <path class="d-silhouette" d="M56 -2 L58 -8 L60 -2 Z"/>
    <rect class="d-window" x="31" y="58" width="9" height="12" rx="1"/>
    <rect class="d-window d-window-b" x="54" y="22" width="8" height="11" rx="4"/>
    <rect class="d-window d-window-c" x="80" y="60" width="9" height="12" rx="1"/>
    <rect class="d-window d-window-b" x="62" y="52" width="8" height="10" rx="1"/>
    <path class="d-door" d="M44 96 L44 78 Q50 70 56 78 L56 96 Z"/>
    <path class="d-silhouette" d="M96 70 L112 70 L112 96 L96 96 Z"/>
    <path class="d-silhouette" d="M100 70 L100 58 L106 58 L106 70 Z"/>` },
  tree: { vb: '0 0 100 120', svg: `
    <path class="d-silhouette" d="M46 120 L48 78 C40 70 26 66 14 52 C26 60 36 62 44 66 C40 54 32 44 30 30 C38 44 44 52 48 60 L50 34 C46 26 44 18 46 8 C50 18 52 26 53 34 C58 26 66 20 78 16 C68 24 60 32 56 44 L55 62 C62 52 74 46 90 44 C76 50 64 58 56 70 L54 120 Z"/>
    <path class="d-silhouette" d="M20 120 Q50 108 80 120 Z"/>` },
  tomb: { vb: '0 0 60 70', svg: `
    <path class="d-stone" d="M10 68 L10 26 C10 10 50 10 50 26 L50 68 Z"/>
    <path class="d-stone-line" d="M20 30 L40 30 M22 38 L38 38 M24 46 L36 46"/>
    <path class="d-grass" d="M4 68 Q30 60 56 68 Z"/>` },
  'tomb-cross': { vb: '0 0 60 80', svg: `
    <path class="d-stone" d="M25 78 L25 30 L10 30 L10 20 L25 20 L25 4 L35 4 L35 20 L50 20 L50 30 L35 30 L35 78 Z"/>
    <path class="d-grass" d="M6 78 Q30 70 54 78 Z"/>` },
  fence: { vb: '0 0 160 40', svg: `
    <path class="d-fence" d="M4 22 L156 22 M4 34 L156 34 M10 40 L10 10 L6 14 M10 10 L14 14 M30 40 L30 8 L26 12 M30 8 L34 12 M50 40 L50 10 L46 14 M50 10 L54 14 M70 40 L70 8 L66 12 M70 8 L74 12 M90 40 L90 10 L86 14 M90 10 L94 14 M110 40 L110 8 L106 12 M110 8 L114 12 M130 40 L130 10 L126 14 M130 10 L134 14 M150 40 L150 8 L146 12 M150 8 L154 12"/>` },
  cauldron: { vb: '0 0 120 100', svg: `
    <ellipse class="d-glow" cx="60" cy="30" rx="44" ry="18"/>
    <circle class="d-bubble" cx="46" cy="22" r="5"/>
    <circle class="d-bubble d-bubble-b" cx="66" cy="16" r="4"/>
    <circle class="d-bubble d-bubble-c" cx="78" cy="24" r="3"/>
    <path class="d-fire" d="M34 98 Q38 84 44 92 Q48 78 54 90 Q60 74 66 90 Q72 78 76 92 Q82 84 86 98 Z"/>
    <path class="d-pot" d="M18 36 L102 36 Q106 42 98 44 Q104 86 60 88 Q16 86 22 44 Q14 42 18 36 Z"/>
    <ellipse class="d-brew" cx="60" cy="38" rx="40" ry="6"/>
    <path class="d-pot" d="M30 84 L24 96 L32 96 L38 86 Z M90 84 L96 96 L88 96 L82 86 Z"/>` },
  pumpkin: { vb: '0 0 100 90', svg: `
    <ellipse class="d-glow d-glow-orange" cx="50" cy="56" rx="48" ry="34"/>
    <path class="d-stem" d="M46 20 Q44 8 52 2 L56 6 Q50 12 54 22 Z"/>
    <ellipse class="d-pumpkin" cx="30" cy="54" rx="22" ry="30"/>
    <ellipse class="d-pumpkin" cx="70" cy="54" rx="22" ry="30"/>
    <ellipse class="d-pumpkin d-pumpkin-mid" cx="50" cy="54" rx="24" ry="33"/>
    <path class="d-carve" d="M28 44 L38 36 L42 48 Z M72 44 L62 36 L58 48 Z M46 54 L50 48 L54 54 Z"/>
    <path class="d-carve" d="M24 64 Q50 86 76 64 L70 64 L66 70 L60 64 L54 71 L48 64 L42 71 L36 64 L30 70 Z"/>` },
  web: { vb: '0 0 100 100', svg: `
    <path class="d-web" d="M100 0 L0 100 M100 0 L30 100 M100 0 L65 100 M100 0 L0 30 M100 0 L0 65
      M100 20 Q84 16 80 0 M100 42 Q72 34 62 0 M100 64 Q58 52 44 0 M100 86 Q42 70 24 0"/>
    <path class="d-web" d="M76 28 L76 44"/>
    <circle class="d-spider" cx="76" cy="48" r="4.5"/>
    <path class="d-web" d="M71 45 L66 42 M71 49 L65 50 M81 45 L86 42 M81 49 L87 50"/>` },
  candles: { vb: '0 0 60 60', svg: `
    <ellipse class="d-glow d-glow-orange" cx="30" cy="22" rx="26" ry="18"/>
    <rect class="d-candle" x="12" y="30" width="9" height="26" rx="2"/>
    <rect class="d-candle" x="26" y="22" width="9" height="34" rx="2"/>
    <rect class="d-candle" x="40" y="34" width="8" height="22" rx="2"/>
    <path class="d-flame" d="M16.5 30 Q12 24 16.5 18 Q21 24 16.5 30 Z"/>
    <path class="d-flame d-flame-b" d="M30.5 22 Q26 16 30.5 10 Q35 16 30.5 22 Z"/>
    <path class="d-flame d-flame-c" d="M44 34 Q40 28 44 22 Q48 28 44 34 Z"/>` },
};

function renderDecor(board) {
  const view = slBoardView(board);
  if (!view.decor.length) return '';
  const items = view.decor.map(d => {
    const sprite = SL_DECOR[d.kind];
    if (!sprite) return '';
    const [, , vw, vh] = sprite.vb.split(' ').map(Number);
    // Szerokość w % szerokości sceny, a wysokość z proporcji rysunku (aspect-ratio) —
    // dekoracja nie spłaszcza się, gdy plansza jest szersza albo węższa.
    return `<svg class="sl-decor sl-decor-${d.kind}${d.flip ? ' is-flipped' : ''}" viewBox="${sprite.vb}"
      style="left:${(d.at[0] / board.cols) * 100}%;top:${(d.at[1] / board.rows) * 100}%;width:${(d.size / board.cols) * 100}%;aspect-ratio:${vw}/${vh}"
      aria-hidden="true">${sprite.svg}</svg>`;
  }).join('');
  return `<div class="sl-decor-layer" aria-hidden="true">${items}</div>`;
}

// Gładka krzywa (Catmull-Rom zamieniony na krzywe Béziera) przez punkty od `from` do `to`.
// Styczne liczymy z SĄSIADÓW w pełnej liście — także spoza odcinka — więc dwa kawałki
// tej samej drogi (patrz mostek niżej) stykają się bez załamania. Przy torze zamkniętym
// sąsiedzi zawijają się przez metę na start.
function slSmoothPath(pts, from, to, closed) {
  const n = pts.length;
  const at = (i) => closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M ${at(from).x} ${at(from).y}`;
  for (let i = from; i < to; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  }
  return d;
}

// Droga pod kafelkami + przerywana strzałka pętli meta → start z podpisem.
function renderTrack(board) {
  const view = slBoardView(board);
  const pts = board.path.map((_, i) => tileCenter(i, board));
  const radius = 0.5 * Math.min(100 / board.cols, 100 / board.rows);
  const loopPts = slLoopPoints(board);
  const lapTxt = board.lap_points ? ` +${board.lap_points} pkt` : '';

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
  // Podpis w miejscu wskazanym przez plik sezonu jest zaczepiony LEWĄ krawędzią, nie
  // środkiem: szerokość napisu jest w pikselach, a plansza skaluje się z ekranem, więc
  // wyśrodkowany przy brzegu wystawałby poza nią na węższych monitorach.
  if (view.loop_label) best = slGridPoint(board, view.loop_label[0], view.loop_label[1]);

  let road;
  if (view.road === 'smooth') {
    // Droga w DWÓCH kawałkach rysowanych po kolei, każdy z własnym obrzeżem. Tam, gdzie
    // tor przecina sam siebie (ósemka), drugi kawałek kładzie się obrzeżem NA pierwszy —
    // wygląda to jak mostek nad drogą, a nie jak rozlana plama w miejscu skrzyżowania.
    const n = pts.length;
    const half = Math.floor(n / 2);
    const end = view.closed ? n : n - 1; // przy torze zamkniętym ostatni odcinek wraca na start
    road = [[0, half], [half, end]].map(([a, b]) => {
      const d = slSmoothPath(pts, a, b, view.closed);
      return `
        <path class="sl-track-edge" d="${d}" />
        <path class="sl-track-road" d="${d}" />
        <path class="sl-track-dash" d="${d}" />`;
    }).join('');
  } else {
    road = `<path class="sl-track-road" d="${slRoundedPath(pts, radius)}" />`;
  }

  return `
    <svg class="sl-track" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${road}
      <path class="sl-track-loop" d="${slRoundedPath(loopPts, radius)}" />
    </svg>
    <span class="sl-loop-label${view.loop_label ? ' is-anchored' : ''}" style="left:${best.x}%;top:${best.y}%">↻ nowe okrążenie${lapTxt}</span>`;
}

// Widoczne połączenia start→koniec dla KAŻDEGO węża i KAŻDEJ drabiny.
// Drabina: prosta, jasnozielona linia ze szczeblami (dasharray) i grotem u góry.
// Wąż: czerwona, wygięta krzywa z „głową" (kółkiem) na polu docelowym.
// Dzięki temu od razu widać, dokąd prowadzi każde pole — bez najeżdżania myszą.
function renderConnectors(board) {
  // Rozwidlona drabina rysuje się jak drabina do celu „wygranej" — krótsza odnoga
  // (przegrana) prowadzi prawie zawsze wzdłuż samej drogi, więc druga drabina tylko by ją
  // zasłoniła. Obie odnogi opisuje etykietka na drabinie (renderForkLabels).
  const links = board.tiles.filter(t => t.kind === 'ladder' || t.kind === 'snake' || t.kind === 'fork');
  if (!links.length) return '';
  const drawn = slBoardView(board).links === 'drawn';

  // Rozwidlona drabina to TRZY odcinki: pień z pola startowego do węzła i dwie gałęzie
  // z węzła — do celu „wygranej" i „przegranej". Bez węzła w pliku sezonu: dwie drabiny
  // prosto z pola startowego.
  const segs = [];
  for (const t of links) {
    if (t.kind !== 'fork') { segs.push({ t, a: tileCenter(t.position, board), b: tileCenter(t.target, board) }); continue; }
    const start = tileCenter(t.position, board);
    const j = slForkJunction(t, board);
    if (j) segs.push({ t, a: start, b: j, trunk: true });
    segs.push({ t, a: j || start, b: tileCenter(t.target, board), branch: 'win' });
    segs.push({ t, a: j || start, b: tileCenter(t.alt_target, board), branch: 'lose' });
  }

  const parts = segs.map(({ t, a, b, branch }) => {
    const up = t.kind !== 'snake';
    const cls = up ? `sl-link-ladder${t.kind === 'fork' ? ` sl-link-fork${branch ? ` is-${branch}` : ''}` : ''}` : 'sl-link-snake';
    const title = t.kind === 'fork' ? slForkTitle(t)
      : t.kind === 'ladder' ? `Drabina: ${t.position} → ${t.target}`
      : `Wąż: ${t.position} → ${t.target}`;

    if (drawn) return `<g class="${cls} is-drawn"><title>${title}</title>${up ? slDrawnLadder(a, b, board) : slDrawnSnake(a, b)}</g>`;

    let path;
    if (up) {
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
    + renderLinkDots(links, board) + renderForkNodes(board);
}

function slForkTitle(t) {
  return `Rozwidlona drabina: rzuć jeszcze raz — ${t.faces.join(' lub ')} → pole ${t.target}, inaczej → pole ${t.alt_target}`;
}

// Węzeł rozwidlonej drabiny w % sceny (albo null, gdy plik sezonu go nie podaje).
// Współrzędne węzła to ŚRODEK w kratkach, tak jak `at` dekoracji.
function slForkJunction(t, board) {
  const j = slBoardView(board).fork_junctions[t.position];
  return j ? { x: (j[0] / board.cols) * 100, y: (j[1] / board.rows) * 100 } : null;
}

// Kółko z kostką w miejscu, gdzie drabina się rozwidla. Podpowiedź po najechaniu jest
// celowo „po informatycznemu" — to dokładnie ta reguła, którą liczy serwer
// (slResolveTileEffect), zapisana jak kod.
function renderForkNodes(board) {
  return board.tiles.filter(t => t.kind === 'fork').map(t => {
    const j = slForkJunction(t, board) || tileCenter(t.position, board);
    const others = [1, 2, 3, 4, 5, 6].filter(v => !t.faces.includes(v));
    const code = `const d = rzutKostka(); // 1–6\n`
      + `if ([${t.faces.join(', ')}].includes(d)) idzNaPole(${t.target});\n`
      + `else idzNaPole(${t.alt_target}); // ${others.join(', ')}`;
    return `<span class="sl-fork-node" style="left:${j.x}%;top:${j.y}%" tabindex="0" aria-label="${esc(slForkTitle(t))}">🎲
      <span class="sl-fork-code" role="tooltip"><span class="sl-fork-code-head">rozwidlenie.js</span><code>${esc(code).replace(/\n/g, '<br>')}</code></span>
    </span>`;
  }).join('');
}

// ── ŁĄCZNIKI „RYSOWANE" (links: 'drawn') ──
// Warstwa SVG jest rozciągana (preserveAspectRatio="none"), więc „prostopadle" i „stała
// szerokość" liczymy w jednostkach KRATEK, a dopiero potem przeliczamy na procenty sceny.
// Inaczej drabina biegnąca w poprzek szerokiej planszy byłaby dwa razy grubsza niż pionowa.
function slToCells(p, board) { return { x: (p.x / 100) * board.cols, y: (p.y / 100) * board.rows }; }
function slToPct(p, board) { return { x: (p.x / board.cols) * 100, y: (p.y / board.rows) * 100 }; }

// Drabina: dwie szyny i szczeble co ~0,45 kratki. Końce przycięte, żeby nie wchodziła
// w środek pola, na którym stoi pionek.
function slDrawnLadder(aPct, bPct, board) {
  const a = slToCells(aPct, board), b = slToCells(bPct, board);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const nx = -uy, ny = ux;
  const W = 0.17, TRIM = 0.3;
  const P = (along, side) => slToPct({ x: a.x + ux * along + nx * side, y: a.y + uy * along + ny * side }, board);
  const rail = (side) => { const p = P(TRIM, side), q = P(len - TRIM, side); return `M ${p.x} ${p.y} L ${q.x} ${q.y}`; };
  let rungs = '';
  const count = Math.max(2, Math.floor((len - 2 * TRIM) / 0.45));
  for (let i = 0; i <= count; i++) {
    const along = TRIM + ((len - 2 * TRIM) * i) / count;
    const p = P(along, -W), q = P(along, W);
    rungs += ` M ${p.x} ${p.y} L ${q.x} ${q.y}`;
  }
  return `<path class="sl-ladder-rungs" d="${rungs}" /><path class="sl-ladder-rail" d="${rail(-W)} ${rail(W)}" />`;
}

// Wąż: fala wzdłuż odcinka, najszersza w środku i zwężająca się ku końcom (obwiednia
// sin), żeby głowa i ogon trafiały dokładnie w pola. Rysowany dwa razy — gruby ciemny
// „brzuch" pod spodem i cieńszy grzbiet w kolorze — daje to obrys bez filtrów SVG.
function slDrawnSnake(aPct, bPct) {
  const dx = bPct.x - aPct.x, dy = bPct.y - aPct.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const waves = Math.max(1.5, Math.round(len / 9) + 0.5);
  const amp = Math.min(2.4, 0.6 + len / 22);
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const u = i / 48;
    const off = amp * Math.sin(u * waves * 2 * Math.PI) * Math.sin(u * Math.PI);
    pts.push(`${aPct.x + dx * u + nx * off} ${aPct.y + dy * u + ny * off}`);
  }
  const d = `M ${pts.join(' L ')}`;
  return `<path class="sl-snake-belly" d="${d}" /><path class="sl-snake-back" d="${d}" />`;
}

// Kropki na początku i końcu każdego połączenia. Świadomie w HTML, nie w SVG:
// warstwa SVG jest rozciągana (preserveAspectRatio="none"), więc <circle> zrobiłby się
// elipsą, gdy kafelki są prostokątne. Element HTML pozycjonowany procentowo zostaje kołem.
function renderLinkDots(links, board) {
  const dots = links.map(t => {
    const a = tileCenter(t.position, board);
    const b = tileCenter(t.target, board);
    const kind = t.kind === 'snake' ? 'snake' : 'ladder';
    // Rozwidlenie ma dwa końce — kropka także na celu krótszej odnogi.
    const alt = t.kind === 'fork' ? tileCenter(t.alt_target, board) : null;
    return `
      <span class="sl-dot sl-dot-start sl-dot-${kind}" style="left:${a.x}%;top:${a.y}%"></span>
      <span class="sl-dot sl-dot-end sl-dot-${kind}" style="left:${b.x}%;top:${b.y}%"></span>
      ${alt ? `<span class="sl-dot sl-dot-end sl-dot-${kind}" style="left:${alt.x}%;top:${alt.y}%"></span>` : ''}`;
  }).join('');
  return `<div class="sl-link-dots" aria-hidden="true">${dots}</div>`;
}

// ── PIONEK ──
// Jedna funkcja składa pionek dla planszy i dla podglądu w sklepie kostiumów, żeby
// podgląd pokazywał DOKŁADNIE to, co zobaczą inni. Warstwy od spodu: skrzydła, zdjęcie,
// nakładka (overlay), prześcieradło ducha, czapka, gadżet, tarcza.
function slPawnHtml(p, opts = {}) {
  const costume = p.costume || {};
  const ghost = !!opts.ghost;
  const cls = ['sl-pawn-wrap'];
  if (p.is_me) cls.push('sl-pawn-me');
  if (p.has_shield) cls.push('sl-pawn-shielded');
  if (opts.pushed) cls.push('sl-pawn-pushed');
  if (ghost) cls.push('sl-pawn-ghost');
  // Nakładka zmienia samo zdjęcie (filtr), więc idzie klasą na opakowanie; duch ma
  // pierwszeństwo — nieaktywny gracz straszy prześcieradłem, a nie kostiumem.
  if (costume.overlay && !ghost && SL_COSTUME_ART.overlay[costume.overlay]) cls.push(`ov-${costume.overlay}`);
  // Nakładka zmienia też KSZTAŁT zdjęcia (czaszka, trumna, dynia…) — samo dorysowanie
  // czegoś na okrągłym zdjęciu nie odróżniało kostiumów od siebie.
  const shapeId = costume.overlay && !ghost && SL_COSTUME_SHAPES[costume.overlay] ? costume.overlay : null;
  if (shapeId) cls.push('has-shape');

  const wingKind = costume.wings && SL_COSTUME_ART.wings[costume.wings] ? costume.wings : (opts.batDefault ? 'bat_wings' : null);
  if (wingKind) cls.push('has-wings', `wings-${wingKind}`);
  if (costume.hat && SL_COSTUME_ART.hat[costume.hat]) cls.push('has-hat'); // czapka chowa uszka nietoperza
  // Każdy macha w innym rytmie (opóźnienie z player_id), żeby stado nie trzepotało jak jeden.
  const delay = `animation-delay:-${(Number(p.player_id) % 7) * 0.37}s`;
  const wingPath = wingKind ? SL_COSTUME_ART.wings[wingKind] : null;
  const wings = wingPath ? `
        <svg class="sl-pawn-wing is-left w-${wingKind}" viewBox="0 0 40 24" aria-hidden="true" style="${delay}"><path d="${wingPath}"/></svg>
        <svg class="sl-pawn-wing is-right w-${wingKind}" viewBox="0 0 40 24" aria-hidden="true" style="${delay}"><path transform="matrix(-1 0 0 1 40 0)" d="${wingPath}"/></svg>` : '';
  const overlayArt = costume.overlay && !ghost ? (SL_COSTUME_ART.overlay[costume.overlay] || '') : '';
  // Obrys kształtu leży w tej samej warstwie co rysunek nakładki. Warstwa ma inset −8%,
  // więc pionek (0..1) zajmuje w jej viewBoxie 2,76..37,24 — stąd translate + scale.
  // Obramowanie zdjęcia (to „is-me" i tarcza) musi przejść na obrys, bo clip-path by je ściął.
  const shapeTf = 'transform="translate(2.759 2.759) scale(34.483)" vector-effect="non-scaling-stroke"';
  const shapeLine = shapeId
    ? `<path class="c-shape-glow" ${shapeTf} d="${SL_COSTUME_SHAPES[shapeId]}"/><path class="c-shape-line" ${shapeTf} d="${SL_COSTUME_SHAPES[shapeId]}"/>` : '';
  const overlay = overlayArt ? `<svg class="sl-costume-overlay" viewBox="0 0 40 40" aria-hidden="true">${shapeLine}${overlayArt}</svg>` : '';
  const clip = shapeId ? ` style="clip-path:url(#sl-shape-${shapeId});-webkit-clip-path:url(#sl-shape-${shapeId})"` : '';
  const hatArt = costume.hat && SL_COSTUME_ART.hat[costume.hat];
  const hat = hatArt ? `<svg class="sl-costume-hat h-${costume.hat}" viewBox="0 0 40 32" aria-hidden="true">${hatArt}</svg>` : '';
  const gadgetArt = costume.gadget && SL_COSTUME_ART.gadget[costume.gadget];
  const gadget = gadgetArt ? `<svg class="sl-costume-gadget g-${costume.gadget}" viewBox="0 0 30 40" aria-hidden="true">${gadgetArt}</svg>` : '';
  const sheet = ghost ? `<svg class="sl-pawn-sheet" viewBox="0 0 40 44" aria-hidden="true"><path d="M20 1 C8 1 3 11 3 21 L3 43 L9 38 L14 43 L20 38 L26 43 L31 38 L37 43 L37 21 C37 11 32 1 20 1 Z"/><ellipse cx="14" cy="18" rx="3" ry="4.5"/><ellipse cx="26" cy="18" rx="3" ry="4.5"/></svg>` : '';
  const shield = p.has_shield ? `<span class="sl-pawn-shield">🛡️</span>` : '';
  const ghostTitle = ghost
    ? ` title="${esc(p.nickname)} — nie rzucał od ${p.missed_workdays >= 99 ? 'zawsze' : `${p.missed_workdays} dni roboczych`}"` : '';
  // Natywny title zniknął (poza duchem): nie da się w nim zrobić wielowierszowej rozpiski
  // punktów. Dane dla dymka jadą w data-* i są czytane dopiero przy najechaniu (slTipShow).
  const tip = opts.noTip ? '' : ` data-tip-player="${p.player_id}"`;
  return `
      <span class="${cls.join(' ')}"${tip}${ghostTitle}>${wings}
        <img class="sl-pawn-avatar" src="${p.avatar_url}" alt="${esc(p.nickname)}" loading="lazy"${clip} />${overlay}${sheet}${hat}${gadget}
        ${shield}
      </span>`;
}

// ── KOSTIUMY: rysunki ──
// Serwer (lib/costumes.js) zna tylko id, slot i cenę; tu jest wygląd. Kolory przez klasy
// c-*, żeby motyw sezonu mógł je podmienić. Nieznane id jest po prostu pomijane.
const SL_COSTUME_ART = {
  hat: {
    witch_hat: '<path class="c-hat" d="M2 28 Q20 22 38 28 Q20 33 2 28 Z"/><path class="c-hat" d="M11 26 L18 5 Q21 -1 29 3 Q23 4 22 9 L29 26 Z"/><path class="c-band" d="M11.6 22 L28.4 22 L29 26 L11 26 Z"/><rect class="c-buckle" x="18" y="22" width="4" height="4" rx=".5"/>',
    pumpkin_hat: '<ellipse class="c-pumpkin" cx="20" cy="22" rx="13" ry="9"/><path class="c-rib" d="M20 13 L20 31 M13.5 14.5 Q10 22 13.5 29.5 M26.5 14.5 Q30 22 26.5 29.5"/><path class="c-stem" d="M19 14 Q18 8 22 6 L23.5 8 Q21 10 21.5 14 Z"/><path class="c-leaf" d="M22 9 Q28 4 32 9 Q26 12 22 9 Z"/>',
    horns: '<path class="c-horn" d="M7 31 Q2 17 10 5 Q10 17 16 27 Z"/><path class="c-horn" d="M33 31 Q38 17 30 5 Q30 17 24 27 Z"/>',
    top_hat: '<rect class="c-tophat" x="11" y="3" width="18" height="22" rx="2"/><rect class="c-band-red" x="11" y="17" width="18" height="4"/><ellipse class="c-tophat" cx="20" cy="26" rx="16" ry="3.5"/>',
  },
  // Skrzydła: kształt LEWEGO skrzydła. Prawe to jego lustro zrobione w samym SVG (matrix),
  // a nie w CSS — dzięki temu animacja machania nie musi odbijać elementu i oba skrzydła
  // zginają się przy zdjęciu, a nie przeskakują na drugą stronę.
  wings: {
    bat_wings: 'M40 6 C34 2 26 0 18 2 C12 3 5 6 0 4 C3 9 4 13 2 18 C6 15 10 15 12 19 C14 15 18 14 21 18 C23 14 27 13 30 16 C32 12 36 11 40 12 Z',
    demon_wings: 'M40 5 C33 1 22 0 12 3 L0 0 L4 8 L1 14 L8 12.5 L6 21 L14 16 L16 23 L22 15.5 L26 21 L30 14 L40 12 Z',
  },
  gadget: {
    broom: '<path class="c-stick" d="M24 1 L11 29"/><path class="c-straw" d="M10 27 L2 39 L18 39 L15 28 Z"/><path class="c-band" d="M9.4 26 L15.8 27.6 L15 30 L8.6 28.6 Z"/>',
    candy_bucket: '<path class="c-handle" d="M5 19 Q15 4 25 19"/><circle class="c-candy" cx="11" cy="17" r="3"/><circle class="c-candy c-candy-b" cx="18" cy="16" r="3"/><path class="c-bucket" d="M4 19 L26 19 L22.5 39 L7.5 39 Z"/><path class="c-carve" d="M9 25 L12 22 L13.5 26 Z M21 25 L18 22 L16.5 26 Z M10 31 Q15 36 20 31 L18 31 L17 33 L15 31 L13 33 L12 31 Z"/>',
    lantern: '<path class="c-handle" d="M15 0 L15 6"/><circle class="c-glow" cx="15" cy="22" r="13"/><path class="c-lantern" d="M9 8 L21 8 L23 12 L23 32 L21 36 L9 36 L7 32 L7 12 Z"/><rect class="c-flame-box" x="10" y="13" width="10" height="18" rx="2"/><path class="c-flame" d="M15 29 Q11 24 15 17 Q19 24 15 29 Z"/>',
    spider: '<path class="c-thread" d="M15 0 L15 22"/><ellipse class="c-spider" cx="15" cy="28" rx="5" ry="6"/><circle class="c-spider" cx="15" cy="21" r="3.5"/><path class="c-legs" d="M11 25 L4 20 L2 24 M11 29 L3 29 L1 34 M19 25 L26 20 L28 24 M19 29 L27 29 L29 34 M12 32 L6 37 M18 32 L24 37"/><circle class="c-eye" cx="13.6" cy="20.5" r=".9"/><circle class="c-eye" cx="16.4" cy="20.5" r=".9"/>',
  },
  // Nakładki: filtr zdjęcia robi CSS (klasa ov-*), a tu jest to, co leży NA zdjęciu.
  // Pionek zajmuje w tym viewBoxie 2,76..37,24 (warstwa ma inset −8%). Rysunki celowo
  // wychodzą poza zdjęcie (kołnierz, piszczele, śluz): nakładka ma być widoczna z daleka,
  // na małym polu planszy, a nie tylko w podglądzie w garderobie.
  overlay: {
    zombie: '<path class="c-goo" d="M9 33.5 Q10.5 38 11.5 34 Q12.5 41.5 14.5 35 Q16 39 17.5 35.5 L17 33 Z M25 34.5 Q26.5 40.5 28 35 Q29.5 37.5 30.5 33 L29 32 Z"/>'
      + '<path class="c-bandage" d="M1.5 15.5 L15.5 1 L19.5 5 L5.5 19.5 Z"/><path class="c-bandage-line" d="M5 12 L8.5 15.5 M8.5 8.5 L12 12 M12 5 L15.5 8.5"/>'
      + '<path class="c-stitch" d="M21 11 L34 16 M24 9.5 L23 13.5 M27.5 11 L26.5 15 M31 12.5 L30 16.5 M8 27 L20 31 M11 25.5 L10 29.5 M14.5 27 L13.5 31 M17.5 28 L16.5 32"/>',
    vampire: '<path class="c-collar" d="M12.5 38 L2.5 24.5 L-3.5 7.5 L5.5 14 L9 28 Z M27.5 38 L37.5 24.5 L43.5 7.5 L34.5 14 L31 28 Z"/>'
      + '<path class="c-collar-in" d="M11.5 35.5 L4 24.5 L0 12 L6 16.5 L9 28 Z M28.5 35.5 L36 24.5 L40 12 L34 16.5 L31 28 Z"/>'
      + '<path class="c-fang" d="M14.2 28 L17.8 28 L16 36 Z M22.2 28 L25.8 28 L24 36 Z"/>'
      + '<path class="c-blood" d="M16 36.3 Q14.6 38.4 16 39.3 Q17.4 38.4 16 36.3 Z M24 36.3 Q22.6 38.4 24 39.3 Q25.4 38.4 24 36.3 Z"/>',
    skeleton: '<g class="c-bones"><path d="M1 32 L39 42.5 M39 32 L1 42.5"/></g>'
      + '<g class="c-bone-ends"><circle cx="0" cy="30.8" r="2.2"/><circle cx="1.8" cy="33.6" r="2.2"/><circle cx="40" cy="30.8" r="2.2"/><circle cx="38.2" cy="33.6" r="2.2"/>'
      + '<circle cx="0" cy="43.7" r="2.2"/><circle cx="1.8" cy="40.9" r="2.2"/><circle cx="40" cy="43.7" r="2.2"/><circle cx="38.2" cy="40.9" r="2.2"/></g>'
      + '<path class="c-bone-crack" d="M20 3.2 L18 7.5 L21 10.5 L19.5 14 M31.5 9 L28.5 11 L29.5 14"/>',
    pumpkin_frame: '<path class="c-pumpkin-rib" d="M12.5 6.5 Q5.5 20 12.5 36 M27.5 6.5 Q34.5 20 27.5 36 M17 6.2 Q14 20 17 37 M23 6.2 Q26 20 23 37"/>'
      + '<path class="c-vine" d="M22 3 Q27 -1 30 2 Q32 5 29 6 Q27 6 28 4"/>'
      + '<path class="c-leaf" d="M21.5 4 Q14 -3 9 2 Q15 6.5 21.5 4 Z"/>'
      + '<path class="c-stem" d="M18 8 Q17 0.5 21.8 -1.8 L23.6 0.4 Q20.8 2.2 21.4 8 Z"/>',
  },
};

// Kształty nakładek w jednostkach pionka (0..1). JEDNO źródło dla przycięcia zdjęcia
// (clipPath z clipPathUnits="objectBoundingBox" wstrzykiwany raz niżej) i dla obrysu
// w slPawnHtml, więc obrys nie może się rozjechać z krawędzią zdjęcia.
const SL_COSTUME_SHAPES = {
  // Czaszka: kopuła, kości policzkowe i węższa szczęka z zębami.
  skeleton: 'M0.5 0 C0.8 0 1 0.2 1 0.46 C1 0.62 0.93 0.7 0.86 0.74 L0.84 0.88 Q0.84 0.97 0.74 0.97 L0.68 0.97 L0.66 0.91 L0.62 0.97 L0.56 0.97 L0.53 0.91 L0.5 0.97 L0.47 0.91 L0.44 0.97 L0.38 0.97 L0.34 0.91 L0.32 0.97 L0.26 0.97 Q0.16 0.97 0.16 0.88 L0.14 0.74 C0.07 0.7 0 0.62 0 0.46 C0 0.2 0.2 0 0.5 0 Z',
  // Trumna: najszersza na wysokości ramion, zwęża się ku stopom.
  vampire: 'M0.32 0 L0.68 0 L0.96 0.26 L0.7 1 L0.3 1 L0.04 0.26 Z',
  // Poszarpana twarz z odgryzionym kawałkiem w prawym górnym rogu.
  zombie: 'M0.5 0 L0.603 0.047 L0.69 0.105 L0.679 0.275 L0.748 0.302 L0.868 0.323 L0.987 0.389 L0.96 0.5 L0.968 0.607 L0.905 0.695 L0.883 0.806 L0.793 0.867 L0.697 0.91 L0.608 0.973 L0.5 0.965 L0.389 0.987 L0.3 0.914 L0.201 0.875 L0.133 0.793 L0.095 0.695 L0.022 0.609 L0.035 0.5 L0.032 0.393 L0.09 0.303 L0.109 0.188 L0.207 0.133 L0.29 0.063 L0.398 0.052 Z',
  // Dynia: szersza niż wyższa, z wcięciami między żebrami u góry i u dołu.
  pumpkin_frame: 'M0.5 0.13 C0.6 0.04 0.72 0.07 0.77 0.14 C0.93 0.12 1 0.32 1 0.53 C1 0.77 0.9 0.95 0.75 0.92 C0.68 0.99 0.58 1 0.5 0.95 C0.42 1 0.32 0.99 0.25 0.92 C0.1 0.95 0 0.77 0 0.53 C0 0.32 0.07 0.12 0.23 0.14 C0.28 0.07 0.4 0.04 0.5 0.13 Z',
};
(function slInjectCostumeShapes() {
  const defs = Object.entries(SL_COSTUME_SHAPES)
    .map(([id, d]) => `<clipPath id="sl-shape-${id}" clipPathUnits="objectBoundingBox"><path d="${d}"/></clipPath>`).join('');
  document.body.insertAdjacentHTML('beforeend',
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>`);
})();


function renderCell(idx, sp, players, posStyle, board, ev = null, twin = null) {
  const size = board.size;
  const marks = slMarks(board);
  // Pole w układzie 'free' jest małe (ułamek kratki na gęstej siatce), więc napis
  // „0 · START" by się nie zmieścił — tam start i meta dostają chorągiewkę NAD polem.
  const free = slBoardView(board).layout === 'free';
  let cls = 'sl-cell';
  let flag = '';
  // Start ma własny kolor: niżej nie da się spaść (serwer przycina ruch do pola 0).
  // Ostatnie pole to meta okrążenia — stąd pętla wraca na start.
  let idxLabel = String(idx);
  // Rozstaje: podpis „6/26" — to pole, na które wchodzi się z obu nitek drogi.
  if (twin != null) {
    cls += ' sl-cell-shared';
    idxLabel = `${idx}/${twin}`;
  }
  if (idx === 0) {
    cls += ' sl-cell-start';
    if (free) flag = '<span class="sl-flag sl-flag-start">START</span>'; else idxLabel = '0 · START';
  } else if (idx === size - 1) {
    cls += ' sl-cell-finish';
    if (free) flag = '<span class="sl-flag sl-flag-finish">🏁 META</span>'; else idxLabel = `${idx} 🏁`;
  }
  let mark = '';
  if (ev) {
    cls += ` sl-ev sl-ev-${ev.kind}${ev.kind === 'door' ? (ev.active ? ' is-open' : ' is-closed') : ''}`;
    mark = `<span class="sl-mark sl-ev-mark" title="${esc(ev.title)}">${ev.icon}</span>`;
  }
  if (sp) {
    cls += ` sl-${sp.kind}`;
    if (sp.kind === 'ladder') mark = `<span class="sl-mark" title="Drabina → ${sp.target}">${esc(marks.ladder)}</span>`;
    else if (sp.kind === 'fork') mark = `<span class="sl-mark" title="${esc(slForkTitle(sp))}">🎲</span>`;
    else if (sp.kind === 'snake') mark = `<span class="sl-mark" title="Wąż → ${sp.target}">${esc(marks.snake)}</span>`;
    else if (sp.kind === 'bonus') mark = `<span class="sl-mark" title="${twin != null ? `Rozstaje — pole ${idx} i ${twin} to jedno miejsce, stąd zbijasz z obu stron. ` : ''}Bonus +${sp.value} pkt">${esc(marks.bonus)}</span>`;
  }
  // Pionek = okrągłe zdjęcie profilowe; serwer zwraca w `players` WYŁĄCZNIE graczy,
  // którzy je wgrali (bez zdjęcia = nie widać na planszy), więc avatar_url zawsze jest.
  // Nick pojawia się po najechaniu myszką (natywny tooltip z title).
  // Małe pole (układ 'free') mieści najwyżej dwa pionki. Po zmianie sezonu WSZYSCY stoją
  // na starcie, więc bez limitu kilkanaście awatarów wylałoby się słupkiem na sąsiednie
  // pola. Przy tłoku widać jeden awatar (mój, jeśli tu stoję) i licznik „+N" z nickami
  // reszty w podpowiedzi — razem mieszczą się w szerokości pola.
  let shown = players || [];
  let overflow = '';
  if (free && shown.length > 2) {
    const ordered = [...shown].sort((a, b) => Number(!!b.is_me) - Number(!!a.is_me));
    shown = ordered.slice(0, 1);
    const rest = ordered.slice(1);
    overflow = `<span class="sl-pawn-more" title="${esc(rest.map(p => p.nickname).join(', '))}">+${rest.length}</span>`;
  }
  const view = slBoardView(board);
  const pawnsHtml = shown.map(p => slPawnHtml(p, {
    batDefault: view.pawn === 'bat',
    // Duch = gracz, który od kilku dni roboczych nie rzucał (liczy serwer). Czysty wygląd:
    // półprzezroczysty pionek w prześcieradle. Dalej da się go zbić i dalej ma swoje pole.
    ghost: !!view.ghost_after_days && p.missed_workdays >= view.ghost_after_days,
    pushed: !!(state.pushFlash && state.pushFlash.has(p.player_id)),
  })).join('') + overflow;
  return `
    <div class="${cls}" style="${posStyle}">
      ${flag}
      <span class="sl-idx">${idxLabel}</span>
      ${mark}
      <div class="sl-pawns">${pawnsHtml}</div>
    </div>`;
}

function renderLegend(board, ev = null) {
  const m = slMarks(board);
  // Na zamkniętym torze nie ma „góry" ani „dołu" — drabina to skrót do przodu, wąż cofa.
  const closed = slBoardView(board).closed;
  return `
    <div class="sl-legend">
      <span class="sl-legend-start">■ start — niżej nie spadniesz</span>
      <span>🏁 meta — potem pętla na start (+${board.lap_points} pkt)</span>
      <span class="sl-legend-ladder">━ ${esc(m.ladder)} drabina — ${closed ? 'skrót do przodu' : 'w górę'}</span>
      <span class="sl-legend-snake">〜 ${esc(m.snake)} wąż — ${closed ? 'cofa' : 'w dół'}</span>
      ${ev && ev.trick_or_treat && ev.trick_or_treat.bonuses_off
        ? `<span>${esc(m.bonus)} dziś bez bonusów — zamiast nich drzwi 🚪</span>`
        : `<span>${esc(m.bonus)} bonus — punkty</span>`}
      ${board.tiles.some(t => t.kind === 'fork') ? '<span class="sl-legend-ladder">🎲 rozwidlona drabina — rzut decyduje, którą odnogą</span>' : ''}
      ${ev && ev.cauldron ? `<span>🧪 kocioł −${ev.cauldron.amount} coins · 🥄 chochla zgarnia pulę</span>` : ''}
      ${ev && ev.trick_or_treat ? `<span>🚪 cukierek albo psikus${ev.trick_or_treat.active && ev.trick_or_treat.weekdays ? ' — dziś otwarte!' : ''}</span>` : ''}
      ${ev && ev.candy ? '<span>🍬 cukierek do zebrania</span>' : ''}
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
      candy: '🍬 Znalazłeś cukierka!',
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
    // Łup liczymy tylko z PIERWSZEGO zbicia — dalsze w kaskadzie robią wypchnięci, nie ja,
    // i to oni dostają swoje punkty i coins.
    const mine = m.knockback[0];
    const coins = mine.coins_stolen || 0;
    const pts = mine.points_won || 0;
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
// `unit` mówi, CZY liczba to punkty czy coins — te same ikony, co w statach pod zdjęciem
// (⭐ pkt / 💰 coins). Bez nich kafelek w rodzaju „2. miejsce wpłat +25" nie zdradzał,
// czy chodzi o punkty rankingowe, czy o zwrot do portfela — a to dwie zupełnie różne
// waluty. Ikona jest częścią WARTOŚCI, nie etykiety, bo to wartość ma jednostkę.
const HUD_UNITS = { pkt: '⭐', coins: '💰' };

function slHudTile(label, value, opts = {}) {
  const cls = opts.tone ? ` is-${opts.tone}` : '';
  const title = opts.title ? ` title="${esc(opts.title)}"` : '';
  const unit = HUD_UNITS[opts.unit]
    ? `<span class="hud-unit" title="${opts.unit === 'pkt' ? 'punkty rankingowe' : 'coins'}">${HUD_UNITS[opts.unit]}</span>`
    : '';
  return `<div class="hud-tile${cls}"${title}><span class="hud-label">${label}</span><span class="hud-value mono">${value}${unit}</span></div>`;
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
    tiles.push(slHudTile('Wpłaciłeś', '0', { unit: 'coins', title: 'Nagrody dostają wyłącznie ci, którzy wpłacą coins — rzuty kostką są darmowe.' }));
    tiles.push(slHudTile('Pkt za każdy coin', `+${perCoin}`, { unit: 'pkt', title: `Przy wygranej: ${perCoin} pkt za każdy wpłacony coin i ${refundPct}% wpłaty z powrotem.` }));
  } else {
    const parts = [`${r.contrib_points} za wpłatę`];
    if (r.fighter_points > 0) parts.push(`${r.fighter_points} za udział`);
    if (r.podium_points > 0) parts.push(`${r.podium_points} za ${r.podium_place}. miejsce`);
    tiles.push(slHudTile('Wpłaciłeś', c.my_coins, { unit: 'coins', title: 'Coins wpłacone na tego bossa' }));
    tiles.push(slHudTile('Pkt za wygraną', `+${r.points}`, { tone: 'good', unit: 'pkt', title: `Tyle punktów dostaniesz, jeśli boss padnie: ${parts.join(' + ')}` }));
    tiles.push(slHudTile('Zwrot coins', r.refund, { tone: 'good', unit: 'coins', title: `Jeśli boss padnie, wraca Ci ${refundPct}% wpłaty w coins` }));
    if (r.podium_place > 0) {
      const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[r.podium_place] || '';
      tiles.push(slHudTile(`${r.podium_place}. miejsce wpłat`, `${medal}+${r.podium_points}`, { tone: 'gold', unit: 'pkt', title: 'Premia za podium wpłat, wypłacana przy wygranej' }));
    }
  }
  if (r.milestones_earned > 0) {
    // „Kamienie" nic nie mówiło. To punkty za progi HP (75/50/25%) — już wpłynęły na konto.
    tiles.push(slHudTile('Pkt za progi HP', `+${r.milestones_earned}`, { tone: 'good', unit: 'pkt', title: 'Punkty za zbicie bossa do 75% / 50% / 25% HP — już są na Twoim koncie, niezależnie od wyniku walki' }));
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

  // Boss sezonu (np. Dynia Zagłady) jest JEDYNYM bossem całego sezonu — sekcja „poprzedni
  // boss" pokazywałaby walkę sprzed sezonu (albo zamkniętą przy jego włączeniu), która
  // z tym sezonem nie ma nic wspólnego. Znika, dopóki boss sezonu trwa.
  const seasonBoss = c.special_boss && c.special_boss.active ? c.special_boss : null;
  const prevHtml = seasonBoss ? '' : slCoopPrevBossHtml(c.previous_result);

  el.innerHTML = `
    <div class="coop-row-main">
      <span class="coop-emoji">${seasonBoss ? esc(seasonBoss.emoji) : '👹'}</span>
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
  ['season',    '🎃', 'wydarzenia sezonu'],
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

  const total = Number(src.total_points) || 0;
  const head = `<div class="sl-tip-head">${esc(src.nickname)}<span class="sl-tip-total mono">${total} pkt</span></div>`;
  const split = src.points_split;
  // Sezonu jeszcze nikt nie przełączał — cała gra to jeden kawałek, rozbicie jak dawniej.
  if (!split) return head + (slTipRows(src.points_breakdown, total) || '<div class="sl-tip-empty">Jeszcze bez punktów.</div>');

  // Najpierw bieżący sezon z rozbiciem (o to się teraz gra; procenty w obrębie sezonu),
  // pod nim poprzednie sezony jako JEDNA suma — ich kategorie nikogo już nie obchodzą.
  const board = g.board || {};
  const seasonName = board.name ? esc(board.name) : 'Ten sezon';
  return head
    + `<div class="sl-tip-sec">${seasonName}<span class="sl-tip-sec-total mono">${split.season.total} pkt</span></div>`
    + (slTipRows(split.season, split.season.total) || '<div class="sl-tip-empty">W tym sezonie jeszcze bez punktów.</div>')
    + (split.prior.total > 0
      ? `<div class="sl-tip-sec">${esc(board.season_prior_label || 'Wcześniej')}<span class="sl-tip-sec-total mono">${split.prior.total} pkt</span></div>`
      : '');
}

function slTipRows(b, total) {
  return SL_POINT_CATEGORY_LABELS
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
}

function slTipShow(target, playerId) {
  slTipShowHtml(target, slTipFor(playerId));
}

function slTipShowHtml(target, html) {
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
// Dymek przy cenie Extra Move: najechanie myszą albo fokus (tapnięcie na telefonie).
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-price-tip]');
  if (el) slTipShowHtml(el, slExtraMovePriceTip());
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest && e.target.closest('[data-price-tip]');
  if (el && !el.contains(e.relatedTarget)) slTipHide();
});
document.addEventListener('focusin', e => {
  const el = e.target.closest && e.target.closest('[data-price-tip]');
  if (el) slTipShowHtml(el, slExtraMovePriceTip());
});
document.addEventListener('focusout', e => {
  if (e.target.closest && e.target.closest('[data-price-tip]')) slTipHide();
});
// Przewinięcie odkleiłoby dymek od pionka — prościej go schować niż przeliczać pozycję.
window.addEventListener('scroll', slTipHide, true);

// ── LEADERBOARD ──
function renderLeaderboard(g) {
  const list = document.getElementById('leaderboard-list');
  if (!g.leaderboard.length) {
    document.getElementById('players-count').textContent = '0 graczy';
    list.innerHTML = '<div class="text-muted small" style="padding:12px 4px">Nikt jeszcze nie zagrał — bądź pierwszy!</div>';
    return;
  }
  // Polowanie na cukierki: 🍬 obok punktów, a lider polowania ma koronę. `candies` jest
  // null w sezonie bez cukierków — wtedy kolumny w ogóle nie ma.
  const hunt = g.leaderboard.some(p => p.candies != null);
  const topCandy = hunt ? Math.max(0, ...g.leaderboard.map(p => p.candies || 0)) : 0;
  const onBoard = g.season_events && g.season_events.candy ? g.season_events.candy.tiles.length : 0;
  document.getElementById('players-count').textContent = hunt
    ? `${g.leaderboard.length} graczy · 🍬 ${onBoard} na planszy` : `${g.leaderboard.length} graczy`;
  list.innerHTML = g.leaderboard.map(p => {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank;
    const meClass = p.is_me ? ' is-me' : '';
    const candy = hunt
      ? `<span class="lb-candy mono${topCandy > 0 && p.candies === topCandy ? ' is-top' : ''}" title="${topCandy > 0 && p.candies === topCandy ? 'Prowadzi w polowaniu na cukierki — kto będzie miał najwięcej na koniec października, zgarnia koronę' : 'Zebrane cukierki'}">${topCandy > 0 && p.candies === topCandy ? '👑' : ''}🍬 ${p.candies}</span>` : '';
    return `
      <div class="lb-row${meClass}" data-tip-player="${p.player_id}">
        <span class="lb-rank">${medal}</span>
        <div class="lb-main">
          <div class="lb-top">
            <span class="lb-nick">${esc(p.nickname)}</span>
            <span class="lb-right">${candy}<span class="lb-points mono">${p.total_points} <span class="lb-unit">pkt</span></span></span>
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
  // Sezon może mieć własne konfetti (np. dynie i duchy) — patrz `confetti` w pliku planszy.
  const seasonal = state.game && state.game.board && slBoardView(state.game.board).confetti;
  const icons = seasonal || ['🎉', '⭐', '🐍', '🪜'];
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
