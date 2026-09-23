// ── SEZONY PLANSZY ──
// Każdy plik boards/<id>.js to jeden sezon: kształt planszy, drabiny, węże, bonusy
// i motyw. Plik to CZYSTE DANE — logika pól (co robi drabina, bonus…) zostaje w server.js,
// więc sezon da się odpalić ponownie za rok bez ryzyka, że „stary" plik ma starą logikę.
//
// Moduł nie dotyka bazy (to robi server.js), dlatego nie jest fabryką jak lib/boss.js.
// Pliki czytamy RAZ przy starcie: zmiana pliku wchodzi po restarcie serwera.
//
// Format (patrz boards/default.js):
//   name     — nazwa pokazywana graczom
//   theme    — null albo nazwa pliku public/themes/<theme>.css
//   effects  — lista efektów frontu, np. ['leaves'] (front dostaje klasy fx-<nazwa>)
//   grid     — { cols, rows }: siatka, na której leżą pola
//   path     — pola W KOLEJNOŚCI RUCHU, każde [kolumna, wiersz od góry]; długość = liczba
//              pól. path[0] = start, ostatnie = meta, potem pętla wraca na start.
//   loop     — opcjonalne punkty [x, y] (w tych samych jednostkach, mogą wychodzić poza
//              siatkę o < 1), którędy rysować strzałkę meta → start; brak = prosta linia
//   ladders  — [[z, na], …], na > z
//   snakes   — [[z, na], …], na < z
//   bonuses  — [[pole, pkt], …]
//   forks    — [[z, wygrana, przegrana, [oczka], [x, y]?], …]: ROZWIDLONA drabina. Kto na
//              nią wejdzie, rzuca jeszcze raz: wynik z listy oczek = pole „wygrana", inaczej
//              pole „przegrana". Oba cele muszą być dalej niż start drabiny. Opcjonalny
//              punkt [x, y] (środek, w kratkach) to WĘZEŁ: drabina idzie pojedynczo z pola
//              startowego do węzła, a stamtąd rozchodzi się na dwie. Bez węzła front rysuje
//              dwie osobne drabiny prosto z pola startowego.
//
// Opcjonalne, wyłącznie wygląd (patrz boards/halloween.js):
//   layout     — 'grid' (domyślnie) albo 'free'. W 'free' współrzędne pól mogą być
//                UŁAMKOWE: pole to kwadrat 1×1 zaczepiony w [x, y], tak samo jak kratka,
//                tylko nie musi leżeć w siatce. Dzięki temu droga może iść po krzywej,
//                a nie tylko zygzakiem po kratkach. Zamiast „każda kratka raz" walidacja
//                pilnuje wtedy, żeby żadne dwa pola nie stały bliżej niż FREE_MIN_GAP.
//   tile       — skala pola w układzie 'free' (0.5–1, domyślnie 0.9 kratki)
//   road       — 'smooth' = droga rysowana gładką krzywą przez środki pól zamiast łamanej;
//                przy `closed: true` meta łączy się z startem tą samą drogą (tor zamknięty)
//   closed     — patrz wyżej
//   links      — 'drawn' = drabina ze szczeblami i falujący wąż zamiast prostych kresek
//   loop_label — [x, y] w jednostkach siatki: gdzie postawić podpis „nowe okrążenie"
//   marks      — { ladder, snake, bonus }: znaczki na polach (domyślnie 🪜 🐍 ⭐)
//   confetti   — lista emoji do konfetti po rzucie
//   pawn       — 'circle' (domyślnie) albo 'bat': okrągłe zdjęcie ze skrzydłami
//   events     — mechaniki sezonowe (logika w lib/seasonal.js), wszystkie opcjonalne:
//     cauldron:        { drop: [pola], ladle: pole, amount } — na polach `drop` kocioł
//                      zabiera `amount` coins (także na minus), chochla zgarnia całą pulę
//     trick_or_treat:  { tiles: [pola], weekdays: [1–5] } — drzwi czynne tylko w te dni
//                      (1 = poniedziałek); 50/50 cukierek (pkt / 🍬) albo psikus
//     candy:           { per_day, max_on_board } — cukierki rozsypane po zwykłych polach
//   Pola zdarzeń nie mogą być startem, polem drabiny/węża/bonusu ani siebie nawzajem.
//   ghost_after_days — gracz, który przepuścił tyle PEŁNYCH dni roboczych bez rzutu,
//                stoi na planszy jako duch (półprzezroczysty, w prześcieradle). Sam wygląd.
//   decor      — [{ kind, at: [x, y], size, flip? }]: dekoracje pod planszą. `kind` to
//                nazwa rysunku z biblioteki frontu (SL_DECOR w public/snakes.js), `at` to
//                ŚRODEK w jednostkach siatki, `size` to szerokość w kratkach.

const fs = require('fs');
const path = require('path');

const BOARDS_DIR = path.join(__dirname, '..', 'boards');
const DEFAULT_ID = 'default';
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const MIN_TILES = 10;
// Najmniejsza odległość środków pól w układzie 'free' (w kratkach). Poniżej tego pola
// nachodziłyby na siebie i pionki stałyby „między" polami.
const FREE_MIN_GAP = 0.95;
const MAX_DECOR = 40;

const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Zwraca listę błędów (pusta = plik poprawny). Walidujemy ostro, bo zły plik oznaczałby
// graczy stojących na nieistniejącym polu albo węża prowadzącego poza planszę — lepiej,
// żeby sezon w ogóle nie pojawił się na liście, niż żeby wpadł na produkcję.
function validate(b) {
  const errors = [];
  if (!b || typeof b !== 'object') return ['plik nie eksportuje obiektu'];
  if (typeof b.name !== 'string' || !b.name.trim()) errors.push('brak "name"');
  if (b.theme != null && !(typeof b.theme === 'string' && ID_RE.test(b.theme))) {
    errors.push('"theme" musi być null albo nazwą pliku (a-z, 0-9, -)');
  }
  if (b.effects != null && !(Array.isArray(b.effects) && b.effects.every(e => typeof e === 'string' && ID_RE.test(e)))) {
    errors.push('"effects" musi być listą nazw (a-z, 0-9, -)');
  }

  const g = b.grid || {};
  if (!isInt(g.cols) || !isInt(g.rows) || g.cols < 1 || g.rows < 1) {
    errors.push('"grid" musi mieć całkowite cols i rows ≥ 1');
    return errors; // bez siatki reszty nie da się sprawdzić
  }

  if (!Array.isArray(b.path) || b.path.length < MIN_TILES) {
    errors.push(`"path" musi mieć co najmniej ${MIN_TILES} pól`);
    return errors;
  }
  if (b.layout != null && b.layout !== 'grid' && b.layout !== 'free') {
    errors.push('"layout" musi być "grid" albo "free"');
  }
  const free = b.layout === 'free';
  const seen = new Set();
  b.path.forEach((p, i) => {
    const ok = Array.isArray(p) && (free ? isNum(p[0]) && isNum(p[1]) : isInt(p[0]) && isInt(p[1]));
    if (!ok || p[0] < 0 || p[0] > g.cols - 1 || p[1] < 0 || p[1] > g.rows - 1) {
      errors.push(`path[${i}] poza siatką ${g.cols}×${g.rows}: ${JSON.stringify(p)}`);
      return;
    }
    if (free) return; // odstępy sprawdzamy niżej, parami
    const key = `${p[0]},${p[1]}`;
    if (seen.has(key)) errors.push(`path[${i}] powtarza kratkę ${key}`);
    seen.add(key);
  });
  if (free && !errors.length) {
    for (let i = 0; i < b.path.length; i++) {
      for (let j = i + 1; j < b.path.length; j++) {
        const d = Math.hypot(b.path[i][0] - b.path[j][0], b.path[i][1] - b.path[j][1]);
        if (d < FREE_MIN_GAP) errors.push(`pola ${i} i ${j} stoją za blisko (${d.toFixed(2)} < ${FREE_MIN_GAP} kratki)`);
      }
    }
  }
  if (b.tile != null && !(isNum(b.tile) && b.tile >= 0.5 && b.tile <= 1)) errors.push('"tile" musi być liczbą 0.5–1');
  if (b.road != null && b.road !== 'straight' && b.road !== 'smooth') errors.push('"road" musi być "straight" albo "smooth"');
  if (b.links != null && b.links !== 'simple' && b.links !== 'drawn') errors.push('"links" musi być "simple" albo "drawn"');
  if (b.pawn != null && b.pawn !== 'circle' && b.pawn !== 'bat') errors.push('"pawn" musi być "circle" albo "bat"');
  if (b.ghost_after_days != null && !(isInt(b.ghost_after_days) && b.ghost_after_days >= 1)) errors.push('"ghost_after_days" musi być liczbą całkowitą ≥ 1');
  if (b.loop_label != null && !(Array.isArray(b.loop_label) && isNum(b.loop_label[0]) && isNum(b.loop_label[1]))) {
    errors.push('"loop_label" musi być punktem [x, y]');
  }
  // Znaczki i konfetti lądują w HTML-u (przez esc() na froncie), ale i tak trzymamy je
  // krótkie — to mają być pojedyncze emoji, nie teksty.
  const shortStr = (v) => typeof v === 'string' && v.length > 0 && v.length <= 8;
  if (b.marks != null) {
    if (typeof b.marks !== 'object' || Array.isArray(b.marks)) errors.push('"marks" musi być obiektem');
    else for (const [k, v] of Object.entries(b.marks)) {
      if (!['ladder', 'snake', 'bonus'].includes(k) || !shortStr(v)) errors.push(`marks.${k}: dozwolone ladder/snake/bonus z krótkim znaczkiem`);
    }
  }
  if (b.confetti != null && !(Array.isArray(b.confetti) && b.confetti.length && b.confetti.every(shortStr))) {
    errors.push('"confetti" musi być niepustą listą krótkich znaczków');
  }
  if (b.decor != null) {
    if (!Array.isArray(b.decor) || b.decor.length > MAX_DECOR) errors.push(`"decor" musi być listą (max ${MAX_DECOR})`);
    else b.decor.forEach((d, i) => {
      const ok = d && typeof d.kind === 'string' && ID_RE.test(d.kind)
        && Array.isArray(d.at) && isNum(d.at[0]) && isNum(d.at[1])
        && isNum(d.size) && d.size > 0 && d.size <= Math.max(g.cols, g.rows)
        && (d.flip == null || typeof d.flip === 'boolean');
      if (!ok) errors.push(`decor[${i}]: potrzebne kind (a-z, 0-9, -), at [x, y] i size > 0`);
    });
  }

  if (b.loop != null && !(Array.isArray(b.loop) && b.loop.every(p => Array.isArray(p) && isNum(p[0]) && isNum(p[1])))) {
    errors.push('"loop" musi być listą punktów [x, y]');
  }

  const size = b.path.length;
  const inBoard = (v) => isInt(v) && v >= 0 && v < size;
  const occupied = new Map(); // pole -> co na nim stoi (drabina/wąż/bonus)
  const claim = (pos, what) => {
    if (pos === 0) errors.push(`${what}: start (pole 0) musi zostać zwykłym polem`);
    if (occupied.has(pos)) errors.push(`${what}: pole ${pos} jest już zajęte (${occupied.get(pos)})`);
    occupied.set(pos, what);
  };
  const targets = [];

  for (const [key, label, up] of [['ladders', 'drabina', true], ['snakes', 'wąż', false]]) {
    const list = b[key] || [];
    if (!Array.isArray(list)) { errors.push(`"${key}" musi być listą`); continue; }
    for (const pair of list) {
      const [from, to] = Array.isArray(pair) ? pair : [];
      const what = `${label} ${JSON.stringify(pair)}`;
      if (!inBoard(from) || !inBoard(to)) { errors.push(`${what}: pole poza planszą 0–${size - 1}`); continue; }
      if (up ? to <= from : to >= from) { errors.push(`${what}: ${up ? 'drabina musi prowadzić w górę' : 'wąż musi prowadzić w dół'}`); continue; }
      claim(from, what);
      targets.push([to, what]);
    }
  }
  const forks = b.forks || [];
  if (!Array.isArray(forks)) errors.push('"forks" musi być listą');
  else for (const f of forks) {
    const [from, win, lose, faces, junction] = Array.isArray(f) ? f : [];
    if (junction != null && !(Array.isArray(junction) && isNum(junction[0]) && isNum(junction[1]))) {
      errors.push(`rozwidlenie ${JSON.stringify(f)}: węzeł musi być punktem [x, y]`); continue;
    }
    const what = `rozwidlenie ${JSON.stringify(f)}`;
    if (!inBoard(from) || !inBoard(win) || !inBoard(lose)) { errors.push(`${what}: pole poza planszą 0–${size - 1}`); continue; }
    if (win <= from || lose <= from || win === lose) { errors.push(`${what}: oba cele muszą być dalej niż start i różne od siebie`); continue; }
    const okFaces = Array.isArray(faces) && faces.length > 0 && faces.length < 6
      && faces.every(v => isInt(v) && v >= 1 && v <= 6) && new Set(faces).size === faces.length;
    if (!okFaces) { errors.push(`${what}: oczka to niepusta lista 1–6 bez kompletu (inaczej nie ma rozwidlenia)`); continue; }
    claim(from, what);
    targets.push([win, what], [lose, what]);
  }
  const bonuses = b.bonuses || [];
  if (!Array.isArray(bonuses)) errors.push('"bonuses" musi być listą');
  else for (const pair of bonuses) {
    const [pos, pts] = Array.isArray(pair) ? pair : [];
    const what = `bonus ${JSON.stringify(pair)}`;
    if (!inBoard(pos) || !isInt(pts) || pts <= 0) { errors.push(`${what}: pole poza planszą albo punkty ≤ 0`); continue; }
    claim(pos, what);
  }
  // Zdarzenia sezonowe: każde pole ma najwyżej JEDNO zdarzenie i nie leży na polu
  // specjalnym — inaczej lądowanie musiałoby rozstrzygać dwie rzeczy naraz.
  const ev = b.events;
  if (ev != null) {
    if (typeof ev !== 'object' || Array.isArray(ev)) errors.push('"events" musi być obiektem');
    else {
      const evTiles = new Map();
      const claimEv = (pos, what) => {
        if (!inBoard(pos) || pos === 0) { errors.push(`${what}: pole ${pos} poza planszą albo start`); return; }
        if (occupied.has(pos)) errors.push(`${what}: pole ${pos} jest już polem specjalnym (${occupied.get(pos)})`);
        if (evTiles.has(pos)) errors.push(`${what}: pole ${pos} ma już zdarzenie (${evTiles.get(pos)})`);
        evTiles.set(pos, what);
      };
      if (ev.cauldron != null) {
        const c = ev.cauldron;
        if (!c || !Array.isArray(c.drop) || !c.drop.length || !isInt(c.ladle) || !isInt(c.amount) || c.amount <= 0) {
          errors.push('events.cauldron: potrzebne drop [pola], ladle (pole) i amount > 0');
        } else {
          c.drop.forEach(pos => claimEv(pos, 'kocioł'));
          claimEv(c.ladle, 'chochla');
        }
      }
      if (ev.trick_or_treat != null) {
        const t = ev.trick_or_treat;
        if (!t || !Array.isArray(t.tiles) || !t.tiles.length || !Array.isArray(t.weekdays) || !t.weekdays.length
            || !t.weekdays.every(d => isInt(d) && d >= 1 && d <= 5)) {
          errors.push('events.trick_or_treat: potrzebne tiles [pola] i weekdays [1–5]');
        } else t.tiles.forEach(pos => claimEv(pos, 'cukierek albo psikus'));
      }
      if (ev.candy != null) {
        const c = ev.candy;
        if (!c || !isInt(c.per_day) || c.per_day < 1 || !isInt(c.max_on_board) || c.max_on_board < c.per_day) {
          errors.push('events.candy: potrzebne per_day ≥ 1 i max_on_board ≥ per_day');
        }
      }
    }
  }

  // Cel skoku nie może być polem specjalnym — inaczej reakcje łańcuchowe (drabina na
  // węża na drabinę…), których slResolveTileEffect świadomie nie obsługuje.
  for (const [to, what] of targets) {
    if (occupied.has(to)) errors.push(`${what}: cel ${to} jest polem specjalnym (${occupied.get(to)})`);
  }
  return errors;
}

// Normalizuje plik do jednego kształtu, z którego korzysta server.js.
function normalize(id, b) {
  const tiles = [];
  for (const [from, to] of b.ladders || []) tiles.push({ position: from, kind: 'ladder', target: to, value: 0 });
  for (const [from, to] of b.snakes || []) tiles.push({ position: from, kind: 'snake', target: to, value: 0 });
  for (const [pos, pts] of b.bonuses || []) tiles.push({ position: pos, kind: 'bonus', target: null, value: pts });
  for (const [from, win, lose, faces] of b.forks || []) {
    tiles.push({ position: from, kind: 'fork', target: win, value: 0, alt_target: lose, faces: [...faces].sort((x, y) => x - y) });
  }
  tiles.sort((a, c) => a.position - c.position);
  return {
    id,
    name: b.name.trim(),
    theme: b.theme || null,
    effects: b.effects || [],
    cols: b.grid.cols,
    rows: b.grid.rows,
    size: b.path.length,
    path: b.path.map(p => [p[0], p[1]]),
    loop: b.loop || null,
    tiles,
    // Mechaniki sezonowe — czyta je lib/seasonal.js (null = sezon bez nich).
    events: b.events ? JSON.parse(JSON.stringify(b.events)) : null,
    // Sam wygląd — serwer tylko przekazuje to dalej w payloadzie planszy.
    view: {
      layout: b.layout || 'grid',
      tile: b.tile || 0.9,
      road: b.road || 'straight',
      closed: !!b.closed,
      links: b.links || 'simple',
      pawn: b.pawn || 'circle',
      ghost_after_days: b.ghost_after_days || null,
      loop_label: b.loop_label || null,
      marks: b.marks || null,
      confetti: b.confetti || null,
      decor: (b.decor || []).map(d => ({ kind: d.kind, at: [d.at[0], d.at[1]], size: d.size, flip: !!d.flip })),
      // Węzły rozwidlonych drabin: { pole startowe: [x, y] } — sam rysunek.
      fork_junctions: Object.fromEntries((b.forks || []).filter(f => f[4]).map(f => [f[0], [f[4][0], f[4][1]]]))
    }
  };
}

let cache = null;

// Wczytuje wszystkie sezony. Błędny plik nie zatrzymuje serwera — trafia do logu
// i znika z listy. Tylko brak poprawnego `default` jest fatalny (nie ma do czego wrócić).
function loadAll() {
  const out = new Map();
  let files = [];
  try {
    files = fs.readdirSync(BOARDS_DIR).filter(f => f.endsWith('.js')).sort();
  } catch (e) {
    console.error(`Sezony: nie da się odczytać katalogu ${BOARDS_DIR}:`, e.message);
  }
  for (const file of files) {
    const id = file.slice(0, -3);
    if (!ID_RE.test(id)) {
      console.error(`Sezony: pomijam ${file} — nazwa pliku może mieć tylko a-z, 0-9 i myślniki`);
      continue;
    }
    let raw;
    try {
      raw = require(path.join(BOARDS_DIR, file));
    } catch (e) {
      console.error(`Sezony: pomijam ${file} — błąd przy wczytywaniu: ${e.message}`);
      continue;
    }
    const errors = validate(raw);
    if (errors.length) {
      console.error(`Sezony: pomijam ${file}:\n  - ${errors.join('\n  - ')}`);
      continue;
    }
    out.set(id, normalize(id, raw));
  }
  if (!out.has(DEFAULT_ID)) {
    throw new Error(`Sezony: brak poprawnego boards/${DEFAULT_ID}.js — gra nie ma planszy, na którą mogłaby wrócić`);
  }
  cache = out;
  return out;
}

function all() {
  return cache || loadAll();
}

// null, gdy takiego sezonu nie ma (albo plik jest błędny).
function get(id) {
  return all().get(id) || null;
}

function list() {
  return [...all().values()].map(s => ({ id: s.id, name: s.name, size: s.size, cols: s.cols, rows: s.rows, theme: s.theme }));
}

module.exports = { DEFAULT_ID, get, list, validate };
