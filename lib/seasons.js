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

const fs = require('fs');
const path = require('path');

const BOARDS_DIR = path.join(__dirname, '..', 'boards');
const DEFAULT_ID = 'default';
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const MIN_TILES = 10;

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
  const seen = new Set();
  b.path.forEach((p, i) => {
    if (!Array.isArray(p) || !isInt(p[0]) || !isInt(p[1])
        || p[0] < 0 || p[0] >= g.cols || p[1] < 0 || p[1] >= g.rows) {
      errors.push(`path[${i}] poza siatką ${g.cols}×${g.rows}: ${JSON.stringify(p)}`);
      return;
    }
    const key = `${p[0]},${p[1]}`;
    if (seen.has(key)) errors.push(`path[${i}] powtarza kratkę ${key}`);
    seen.add(key);
  });

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
  const bonuses = b.bonuses || [];
  if (!Array.isArray(bonuses)) errors.push('"bonuses" musi być listą');
  else for (const pair of bonuses) {
    const [pos, pts] = Array.isArray(pair) ? pair : [];
    const what = `bonus ${JSON.stringify(pair)}`;
    if (!inBoard(pos) || !isInt(pts) || pts <= 0) { errors.push(`${what}: pole poza planszą albo punkty ≤ 0`); continue; }
    claim(pos, what);
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
    tiles
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
