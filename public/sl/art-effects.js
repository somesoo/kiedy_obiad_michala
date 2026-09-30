// Snakes — biblioteka EFEKTÓW SEZONU (SL_EFFECTS). Plik planszy wybiera efekty po nazwie
// (`effects: ['bats', 'fog']`), a tu żyją ich rysunki. Nowy sezon z nowym efektem = nowy
// wpis tutaj + style w public/themes/<motyw>.css. Nieznana nazwa jest pomijana.
// Skrypty frontu Snakes to zwykłe <script> bez bundlera, ładowane po kolei ze snakes.html
// (kolejność: art-*, board, activity, boss, ranking, snakes.js) i dzielące globalne nazwy.
// Kod wykonywany od razu przy ładowaniu może sięgać tylko po to, co jest w TYM pliku albo
// we wcześniejszych — funkcje z późniejszych plików istnieją dopiero po ich wczytaniu.

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
