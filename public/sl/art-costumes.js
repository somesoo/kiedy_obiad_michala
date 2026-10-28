// Snakes — RYSUNKI KOSTIUMÓW (SL_COSTUME_ART) i kształty nakładek (SL_COSTUME_SHAPES).
// Katalog (id, slot, nazwa, cena, sezon) żyje TYLKO na serwerze w lib/costumes.js, rysunki
// TYLKO tutaj — payload niesie wyłącznie id, a nieznane id jest pomijane. Nowy kostium =
// wpis w katalogu na serwerze + rysunek tutaj pod tym samym id.
// Kolejność skryptów i zasady ładowania: patrz nagłówek sl/art-effects.js.

// ── PĘDZEL: kostiumy „malowane" (od Klasyki) ──
// Pierwsze kostiumy Klasyki były płaskimi plamami koloru z kreską i wyglądały jak z Painta.
// Te są malowane: światło z lewej-góry (gradienty), faktura (dzianina, filc, kratka na
// czapeczce żołędzia), połysk i cień. Gradienty i wzory siedzą RAZ w dokumencie
// (SL_COSTUME_DEFS, wstrzykiwane na dole pliku razem z kształtami nakładek), a rysunki
// sięgają po nie klasami c-* (fill: url(#slg-…) w snakes.css). Gradienty liczą się od
// pudełka kształtu (objectBoundingBox), więc jeden pasuje do liścia, rogala i parasola.
// Uwaga: gradient od pudełka nie działa na prostej poziomej/pionowej kresce (pudełko ma
// zerową grubość), dlatego kreski (gałązki, trzonki) mają zwykły kolor.
// Definicje NIE mogą leżeć w elemencie z display:none (Chrome ich wtedy nie rysuje) —
// stąd osobny niewidoczny <svg> 0×0, a nie <defs> w samym kostiumie (sklep bywa schowany).

const slN = v => Math.round(v * 100) / 100;
const slT = (x, y, rot = 0, s = 1) => `transform="translate(${slN(x)} ${slN(y)}) rotate(${slN(rot)}) scale(${slN(s)})"`;
const slStops = stops => stops.map(([c, o, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
const slRadial = (id, stops, cx = 0.35, cy = 0.3, r = 0.8) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${slStops(stops)}</radialGradient>`;
const slLinear = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${slStops(stops)}</linearGradient>`;

// Ziarno filmu na zdjęciu: kropki w jednostkach kształtu nakładki (0..1), stąd drobne liczby.
// Kafelek 0,23 × 0,23 z kropkami w „losowych" miejscach (stałe ziarno), żeby nie układały się
// w widoczną kratkę.
const slGrainDots = Array.from({ length: 22 }, (_, i) =>
  `<circle cx="${(((i * 7919) % 230) / 1000).toFixed(3)}" cy="${(((i * 104729) % 230) / 1000).toFixed(3)}" r=".0035" fill="${i % 3 ? '#fff' : '#000'}" fill-opacity=".28"/>`).join('');

const SL_COSTUME_DEFS = [
  slRadial('slg-wine', [['#E8677A', 0], ['#A8203A', 0.45], ['#5A0A17', 1]]),
  slLinear('slg-wine-band', [['#7A1424', 0], ['#3E0610', 1]]),
  slRadial('slg-mustard', [['#FBD77F', 0], ['#DDA032', 0.5], ['#93600F', 1]]),
  slLinear('slg-mustard-cuff', [['#E8B048', 0], ['#B57A19', 0.6], ['#7E4F0A', 1]]),
  slRadial('slg-cream', [['#FFFFFF', 0], ['#F3ECDC', 0.5], ['#C7B996', 1]]),
  slLinear('slg-leaf-red', [['#FF9A6C', 0], ['#D9362A', 0.5], ['#8C1712', 1]], 0, 0, 1, 1),
  slLinear('slg-leaf-orange', [['#FFD685', 0], ['#F08A2A', 0.5], ['#A9480E', 1]], 0, 0, 1, 1),
  slLinear('slg-leaf-yellow', [['#FFF4B0', 0], ['#F2C23E', 0.55], ['#A87810', 1]], 0, 0, 1, 1),
  slLinear('slg-gold', [['#FFF8D0', 0], ['#FFD45A', 0.3], ['#D99A1E', 0.7], ['#8A5A0A', 1]], 0, 0, 1, 1),
  slRadial('slg-gold-dot', [['#FFFBE0', 0], ['#F0BE48', 0.55], ['#8A5A0A', 1]]),
  slRadial('slg-nut', [['#EBB57A', 0], ['#A8682E', 0.5], ['#5A3412', 1]]),
  slLinear('slg-cap', [['#9A7650', 0], ['#4A3218', 1]]),
  slRadial('slg-berry', [['#FFB0A0', 0], ['#D6202E', 0.5], ['#6E0A16', 1]], 0.35, 0.3, 0.7),
  slRadial('slg-ruby', [['#FFD0DA', 0], ['#E0284B', 0.45], ['#6A0A1E', 1]], 0.35, 0.3, 0.75),
  slLinear('slg-feather', [['#FFFFFF', 0], ['#F3F5F9', 0.45], ['#C3CCDB', 1]]),
  slLinear('slg-feather-cream', [['#FFFEF8', 0], ['#F0E8D4', 0.55], ['#B5A585', 1]]),
  slRadial('slg-monarch', [['#FFC96A', 0], ['#F38A1C', 0.55], ['#B6500A', 1]], 0.85, 0.5, 0.95),
  slLinear('slg-canopy-a', [['#3FA078', 0], ['#1E6B4C', 0.6], ['#0E3E2B', 1]]),
  slLinear('slg-canopy-b', [['#62BD93', 0], ['#2A7D5A', 0.6], ['#145036', 1]]),
  slRadial('slg-drop', [['#FFFFFF', 0, 0.95], ['#BDE6FF', 0.4, 0.85], ['#4FA8E8', 1, 0.8]], 0.35, 0.4, 0.75),
  slLinear('slg-ceramic', [['#FFFFFF', 0], ['#F4EEE2', 0.3], ['#D9CDB4', 0.75], ['#A3937A', 1]], 0, 0, 1, 0),
  slLinear('slg-terracotta', [['#EE8C62', 0], ['#B8502E', 0.6], ['#7E3018', 1]], 0, 0, 1, 0),
  slRadial('slg-crema', [['#E8BC88', 0], ['#A0602C', 0.5], ['#4A2510', 1]], 0.5, 0.5, 0.6),
  slRadial('slg-bake', [['#FFE09A', 0], ['#E8A040', 0.45], ['#9A5516', 1]], 0.4, 0.3, 0.8),
  slLinear('slg-icing', [['#FFFFFF', 0], ['#F6F1E8', 0.7], ['#DCD2C0', 1]]),
  slLinear('slg-film', [['#333', 0], ['#111', 0.5], ['#050505', 1]], 0, 0, 1, 0),
  slRadial('slg-vignette', [['#000', 0.5, 0], ['#000', 0.85, 0.4], ['#000', 1, 0.75]], 0.5, 0.5, 0.62),
  slRadial('slg-vignette-warm', [['#7A2E00', 0.5, 0], ['#7A2E00', 1, 0.55]], 0.5, 0.5, 0.62),
  slRadial('slg-vignette-frost', [['#E6F7FF', 0.4, 0], ['#E6F7FF', 0.78, 0.5], ['#FFFFFF', 1, 0.9]], 0.5, 0.5, 0.6),
  slLinear('slg-ice', [['#FFFFFF', 0, 0.98], ['#D6F0FF', 0.45, 0.9], ['#86C6F0', 1, 0.8]], 0, 0, 1, 1),
  slRadial('slg-lolly-pink', [['#FFD0E6', 0], ['#FF4FA3', 0.5], ['#A3155E', 1]]),
  slRadial('slg-lolly-yellow', [['#FFF8C8', 0], ['#FFC93C', 0.5], ['#B07A0A', 1]]),
  slRadial('slg-lolly-blue', [['#D4F4FF', 0], ['#3FC4F5', 0.5], ['#0E6A8F', 1]]),
  slRadial('slg-candy-violet', [['#EDD6FF', 0], ['#9B4FE0', 0.5], ['#4E1A80', 1]]),
  slRadial('slg-candy-green', [['#E0FFD2', 0], ['#4FC83F', 0.5], ['#1E6A14', 1]]),
  slLinear('slg-gloss', [['#FFFFFF', 0, 0.8], ['#FFFFFF', 1, 0]]),
  slLinear('slg-stick', [['#FFFFFF', 0], ['#D8D2C6', 1]], 0, 0, 1, 0),
  `<pattern id="slp-knit" width="2.2" height="2" patternUnits="userSpaceOnUse"><path d="M0.2 0.2 L1.1 1.8 L2 0.2" fill="none" stroke="#000" stroke-opacity=".2" stroke-width=".45"/></pattern>`,
  `<pattern id="slp-rib" width="1.8" height="4" patternUnits="userSpaceOnUse"><rect width=".7" height="4" fill="#000" fill-opacity=".2"/></pattern>`,
  `<pattern id="slp-felt" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx=".6" cy=".8" r=".35" fill="#fff" fill-opacity=".1"/><circle cx="2.1" cy="2.2" r=".3" fill="#000" fill-opacity=".14"/><circle cx="2.4" cy=".5" r=".2" fill="#fff" fill-opacity=".08"/></pattern>`,
  `<pattern id="slp-cap" width="1.3" height="1.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 H1.3 M0 0 V1.3" stroke="#2A1505" stroke-opacity=".6" stroke-width=".35"/></pattern>`,
  `<pattern id="slp-cane" width="4.4" height="4.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4.4" height="4.4" fill="#FFF7F9"/><rect width="2.1" height="4.4" fill="#E0284B"/></pattern>`,
  `<pattern id="slp-grain" width=".23" height=".23" patternUnits="userSpaceOnUse">${slGrainDots}</pattern>`,
].join('');

// ── Drobne kształty, z których składają się kostiumy ──
// Liść (podstawa w 0,0, czubek w górę na −10) z żyłkami.
const SL_LEAF = 'M0 0 C-3 -2 -3.6 -6.4 0 -10 C3.6 -6.4 3 -2 0 0 Z';
const SL_LEAF_SLIM = 'M0 0 C-2.1 -2.4 -2.3 -6.6 0 -10 C2.3 -6.6 2.1 -2.4 0 0 Z';
const SL_LEAF_VEINS = 'M0 0 L0 -9.2 M0 -2.6 L-1.7 -4.3 M0 -3.6 L1.7 -5.3 M0 -5.3 L-1.5 -6.9 M0 -6.5 L1.3 -7.9';
function slLeaf(x, y, rot, s, tone, slim = false) {
  return `<g ${slT(x, y, rot, s)}><path class="c-aleaf c-aleaf-${tone}" d="${slim ? SL_LEAF_SLIM : SL_LEAF}"/><path class="c-vein" d="${SL_LEAF_VEINS}"/></g>`;
}
// Liść klonu (ogonek w dół, środek w 0,0, ~20 jednostek wysokości).
const SL_MAPLE = 'M0 9.5 L0.4 5.2 C2.6 6.4 5.6 6.6 8.2 5.4 L6.8 3.6 C8.4 2.6 9.6 1.2 10.2 -0.6 L8 -0.6 C8.6 -2.4 8.6 -4 8.2 -5.2 L5.6 -3.6 L5 -5.2 L3 -2.4 C3.4 -4.8 3.4 -7 2.6 -8.4 L1.4 -7.4 L0 -10.4 L-1.4 -7.4 L-2.6 -8.4 C-3.4 -7 -3.4 -4.8 -3 -2.4 L-5 -5.2 L-5.6 -3.6 L-8.2 -5.2 C-8.6 -4 -8.6 -2.4 -8 -0.6 L-10.2 -0.6 C-9.6 1.2 -8.4 2.6 -6.8 3.6 L-8.2 5.4 C-5.6 6.6 -2.6 6.4 -0.4 5.2 Z';
const SL_MAPLE_VEINS = 'M0 9.5 L0 -9 M0 4.2 L7.6 -0.4 M0 4.2 L-7.6 -0.4 M0 2 L4.6 -6.2 M0 2 L-4.6 -6.2 M0 6 L5.6 5 M0 6 L-5.6 5';
function slMaple(x, y, rot, s, tone) {
  return `<g ${slT(x, y, rot, s)}><path class="c-twig" d="M0 9 L0.5 13"/><path class="c-aleaf c-aleaf-${tone}" d="${SL_MAPLE}"/><path class="c-vein" d="${SL_MAPLE_VEINS}"/></g>`;
}
function slAcorn(x, y, rot, s) {
  const cap = 'M-2.7 0.8 C-3 -1.9 3 -1.9 2.7 0.8 C1.2 1.5 -1.2 1.5 -2.7 0.8 Z';
  return `<g ${slT(x, y, rot, s)}><ellipse class="c-nut" cx="0" cy="2.4" rx="2.1" ry="2.8"/><ellipse class="c-shine" cx="-.8" cy="2.2" rx=".45" ry="1.1"/>`
    + `<path class="c-acorn-cap" d="${cap}"/><path class="c-acorn-tex" d="${cap}"/><path class="c-twig" d="M0 -1.2 Q.3 -2.5 1.3 -2.9"/></g>`;
}
function slBerries(x, y, s) {
  return `<g ${slT(x, y, 0, s)}>` + [[-1.1, 0.4], [1.1, 0.5], [0, -1.2]].map(([bx, by]) =>
    `<circle class="c-berry" cx="${bx}" cy="${by}" r="1.25"/><circle class="c-shine" cx="${slN(bx - 0.4)}" cy="${slN(by - 0.4)}" r=".3"/>`).join('') + '</g>';
}
// Pióro: od dutki (0,0) do czubka (len,0), z rdzeniem i lekko asymetryczną chorągiewką.
function slFeather(x, y, rot, len, w, cls) {
  const L = slN(len);
  return `<g ${slT(x, y, rot)}><path class="${cls}" d="M0 0 C${slN(len * 0.25)} ${slN(-w)} ${slN(len * 0.75)} ${slN(-w * 1.05)} ${L} 0 C${slN(len * 0.78)} ${slN(w * 0.8)} ${slN(len * 0.3)} ${slN(w * 0.8)} 0 0 Z"/>`
    + `<path class="c-quill" d="M0 0 Q${slN(len * 0.5)} ${slN(-w * 0.12)} ${slN(len * 0.94)} 0"/></g>`;
}
function slSparkle(x, y, s, late = false) {
  return `<g ${slT(x, y, 0, s)}><path class="c-sparkle${late ? ' c-sparkle-late' : ''}" d="M0 -4 Q.5 -.5 4 0 Q.5 .5 0 4 Q-.5 .5 -4 0 Q-.5 -.5 0 -4 Z"/></g>`;
}
// Spirala lizaka: od środka na zewnątrz, `turns` obrotów.
function slSpiral(cx, cy, r, turns = 2.2) {
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * turns * 2 * Math.PI;
    const rr = (i / 48) * r;
    pts.push(`${slN(cx + rr * Math.cos(a))} ${slN(cy + rr * Math.sin(a))}`);
  }
  return `M${pts.join(' L')}`;
}
// Płatek śniegu: sześć ramion z gałązkami.
function slSnowflake(cx, cy, r, rot = 0) {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = ((rot + k * 60) * Math.PI) / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    d += `M${slN(cx)} ${slN(cy)} L${slN(cx + ux * r)} ${slN(cy + uy * r)} `;
    for (const f of [0.45, 0.72]) {
      const bx = cx + ux * r * f, by = cy + uy * r * f, bl = r * (f === 0.45 ? 0.32 : 0.22);
      for (const sgn of [1, -1]) {
        const b = a + sgn * (Math.PI / 3.2);
        d += `M${slN(bx)} ${slN(by)} L${slN(bx + Math.cos(b) * bl)} ${slN(by + Math.sin(b) * bl)} `;
      }
    }
  }
  return d.trim();
}
// Punkt i kierunek (w stopniach) na krzywej Béziera trzeciego stopnia.
function slBez(p, t) {
  const u = 1 - t;
  const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
  const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
  const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
  const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
  return { x, y, a: (Math.atan2(dy, dx) * 180) / Math.PI };
}
// Gałązka z liśćmi wzdłuż krzywej: liście patrzą do przodu i na zmianę na boki.
function slBranch(curve, n, from, to, make) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const b = slBez(curve, from + ((to - from) * i) / Math.max(1, n - 1));
    s += make(b.x, b.y, b.a + 90 + (i % 2 ? 38 : -38), i);
  }
  return s;
}
const slMirrorCurve = c => c.map(([x, y]) => [40 - x, y]);
// Nakładki: rysunek dopasowany do kształtu zdjęcia (pionek zajmuje 2,76..37,24 warstwy).
const SL_SHAPE_TF = 'transform="translate(2.759 2.759) scale(34.483)"';
const slOnShape = (d, cls) => `<path class="${cls}" ${SL_SHAPE_TF} d="${d}"/>`;
const SL_SHAPE_FILM = 'M0.1 0.04 Q0.5 -0.01 0.9 0.04 Q0.99 0.5 0.9 0.96 Q0.5 1.01 0.1 0.96 Q0.01 0.5 0.1 0.04 Z';
const SL_SHAPE_LEAF = 'M0.96 0.04 C1.04 0.6 0.7 1 0.06 0.94 C0 0.4 0.3 -0.02 0.96 0.04 Z';
const SL_SHAPE_HEX = 'M0.25 0.03 L0.75 0.03 L1 0.5 L0.75 0.97 L0.25 0.97 L0 0.5 Z';
function slIcicle(x, len, w) {
  const y = 3.6;
  return `<path class="c-ice" d="M${slN(x - w)} ${y} L${slN(x + w)} ${y} C${slN(x + w * 0.6)} ${slN(y + len * 0.45)} ${slN(x + 0.35)} ${slN(y + len * 0.8)} ${slN(x)} ${slN(y + len)} C${slN(x - 0.35)} ${slN(y + len * 0.8)} ${slN(x - w * 0.6)} ${slN(y + len * 0.45)} ${slN(x - w)} ${y} Z"/>`
    + `<path class="c-ice-shine" d="M${slN(x - w * 0.35)} ${slN(y + 0.6)} L${slN(x - 0.12)} ${slN(y + len * 0.7)}"/>`;
}
function slDrop(x, y, s) {
  return `<g ${slT(x, y, 0, s)}><path class="c-drop" d="M0 -2.6 C.9 -.9 1.6 .2 1.6 1 A1.6 1.6 0 0 1 -1.6 1 C-1.6 .2 -.9 -.9 0 -2.6 Z"/><ellipse class="c-shine" cx="-.55" cy=".7" rx=".35" ry=".6"/></g>`;
}
function slPompom(cx, cy, r) {
  let s = '';
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * 2 * Math.PI;
    s += `<circle class="c-pompom" cx="${slN(cx + Math.cos(a) * r * 0.8)}" cy="${slN(cy + Math.sin(a) * r * 0.8)}" r="${slN(r * 0.34)}"/>`;
  }
  return s + `<circle class="c-pompom" cx="${cx}" cy="${cy}" r="${slN(r * 0.86)}"/><path class="c-pompom-fluff" d="M${slN(cx - r * 0.4)} ${slN(cy - r * 0.1)} l.6 -.5 M${slN(cx + r * 0.1)} ${slN(cy - r * 0.4)} l.5 .4 M${slN(cx + r * 0.3)} ${slN(cy + r * 0.25)} l-.6 .3 M${slN(cx - r * 0.2)} ${slN(cy + r * 0.35)} l.4 .5"/>`
    + `<ellipse class="c-shine" cx="${slN(cx - r * 0.35)}" cy="${slN(cy - r * 0.35)}" rx="${slN(r * 0.28)}" ry="${slN(r * 0.18)}" transform="rotate(-35 ${slN(cx - r * 0.35)} ${slN(cy - r * 0.35)})"/>`;
}

// ── KOSTIUMY: rysunki ──
// Serwer (lib/costumes.js) zna tylko id, slot i cenę; tu jest wygląd. Kolory przez klasy
// c-*, żeby motyw sezonu mógł je podmienić. Nieznane id jest po prostu pomijane.
const SL_COSTUME_ART = {
  hat: {
    // ── Klasyka (sezon 3) — malowane, patrz „PĘDZEL" wyżej ──
    // Beret: filc w kolorze wina, przekrzywiony na prawo, z ogonkiem i skórzaną lamówką.
    beret: (() => {
      const body = 'M2.6 24.8 C0.6 19.2 5.4 12.4 14.8 10.2 C24.6 8 35.8 9.8 38.8 15.8 C40.8 19.8 38.2 23.6 32.8 25.4 C25.6 27.8 11.6 28 2.6 24.8 Z';
      return '<path class="c-beret-band" d="M4.2 25 C11 28 28 28.2 35.4 24.2 L35.2 27.3 C27 30.9 11 30.7 4.4 27.7 Z"/>'
        + `<path class="c-beret" d="${body}"/><path class="c-felt" d="${body}"/>`
        + '<path class="c-crease" d="M29.6 12.4 C33.8 14.4 35.8 17.8 34.2 21.8"/><path class="c-crease" d="M8 22.6 C14 24.6 24 24.4 31 22.2"/>'
        + '<path class="c-sheen" d="M7 17 C10.5 13.4 17.5 11.4 24 11.6"/>'
        + '<path class="c-beret-tab" d="M20.4 10.4 C19.8 7.8 21 6 23 5.8 C23.6 7.6 22.8 9.4 21.8 10.4 Z"/>';
    })(),
    // Czapka z pomponem: musztardowa dzianina, kremowy pas, prążkowany wywinięty brzeg.
    beanie: (() => {
      const dome = 'M5.6 23.5 C5.4 13.5 11.6 7.8 20 7.8 C28.4 7.8 34.6 13.5 34.4 23.5 Z';
      const stripe = 'M6.4 16.2 C12 14.2 28 14.2 33.6 16.2 L34.2 19.4 C28.4 17.6 11.6 17.6 5.8 19.4 Z';
      return `<path class="c-beanie" d="${dome}"/><path class="c-beanie-stripe" d="${stripe}"/><path class="c-knit" d="${dome}"/>`
        + '<path class="c-sheen" d="M9.6 13.6 C12 10.4 15.6 9 19 8.9"/>'
        + '<rect class="c-beanie-cuff" x="3.6" y="21.2" width="32.8" height="8.6" rx="3.4"/><rect class="c-rib" x="3.6" y="21.2" width="32.8" height="8.6" rx="3.4"/>'
        + '<path class="c-shade-line" d="M5.4 22.2 C14 21.2 26 21.2 34.6 22.2"/>'
        + slPompom(20, 6.4, 5);
    })(),
    // Wianek: gałązka dookoła czubka głowy, liście w trzech kolorach jesieni, żołędzie,
    // jarzębina i duży klon z przodu.
    leaf_crown: (() => {
      const left = [[2.4, 28.6], [3.2, 15], [10.6, 9.4], [20, 9.4]];
      const tones = ['red', 'orange', 'yellow'];
      const leaves = c => slBranch(c, 7, 0.06, 0.8, (x, y, r, i) => slLeaf(x, y, r, 0.55 + (i % 3) * 0.04, tones[i % 3]));
      return `<path class="c-twig c-twig-thick" d="M2.4 28.6 C3.2 15 10.6 9.4 20 9.4 C29.4 9.4 36.8 15 37.6 28.6"/>`
        + leaves(left) + leaves(slMirrorCurve(left))
        + slAcorn(6.4, 18.6, -25, 0.75) + slAcorn(33.6, 18.6, 25, 0.75)
        + slBerries(13.2, 10.4, 0.75) + slBerries(26.8, 10.4, 0.75)
        + slMaple(20, 8.6, 0, 0.62, 'red');
    })(),
    // ── Noc Duchów ──
    witch_hat: '<path class="c-hat" d="M2 28 Q20 22 38 28 Q20 33 2 28 Z"/><path class="c-hat" d="M11 26 L18 5 Q21 -1 29 3 Q23 4 22 9 L29 26 Z"/><path class="c-band" d="M11.6 22 L28.4 22 L29 26 L11 26 Z"/><rect class="c-buckle" x="18" y="22" width="4" height="4" rx=".5"/>',
    pumpkin_hat: '<ellipse class="c-pumpkin" cx="20" cy="22" rx="13" ry="9"/><path class="c-rib" d="M20 13 L20 31 M13.5 14.5 Q10 22 13.5 29.5 M26.5 14.5 Q30 22 26.5 29.5"/><path class="c-stem" d="M19 14 Q18 8 22 6 L23.5 8 Q21 10 21.5 14 Z"/><path class="c-leaf" d="M22 9 Q28 4 32 9 Q26 12 22 9 Z"/>',
    horns: '<path class="c-horn" d="M7 31 Q2 17 10 5 Q10 17 16 27 Z"/><path class="c-horn" d="M33 31 Q38 17 30 5 Q30 17 24 27 Z"/>',
    top_hat: '<rect class="c-tophat" x="11" y="3" width="18" height="22" rx="2"/><rect class="c-band-red" x="11" y="17" width="18" height="4"/><ellipse class="c-tophat" cx="20" cy="26" rx="16" ry="3.5"/>',
    // Skiny wsparcia (BLIK) — po jednym na sezon; iskierka mruga (c-sparkle), żeby było
    // widać z daleka, że to coś innego niż czapka za coins.
    supporter_crown: '<path class="c-crown" d="M6 28 L4 10 L12 18 L20 5 L28 18 L36 10 L34 28 Z"/><rect class="c-crown-band" x="5.5" y="23" width="29" height="5" rx="1"/>'
      + '<circle class="c-gem" cx="4" cy="10" r="2.2"/><circle class="c-gem" cx="20" cy="5" r="2.6"/><circle class="c-gem" cx="36" cy="10" r="2.2"/>'
      + '<circle class="c-gem-b" cx="13" cy="25.5" r="1.4"/><circle class="c-gem" cx="20" cy="25.5" r="1.6"/><circle class="c-gem-b" cx="27" cy="25.5" r="1.4"/>'
      + '<path class="c-sparkle" d="M31 0 L32 3 L35 4 L32 5 L31 8 L30 5 L27 4 L30 3 Z"/>',
    pumpkin_king_crown: '<path class="c-kcrown" d="M5 28 L3 9 L10 16 L13 5 L20 12 L27 5 L30 16 L37 9 L35 28 Z"/><rect class="c-kband" x="4.5" y="24" width="31" height="4" rx="1"/>'
      + '<circle class="c-kgem" cx="3" cy="9" r="2"/><circle class="c-kgem" cx="13" cy="5" r="2"/><circle class="c-kgem" cx="27" cy="5" r="2"/><circle class="c-kgem" cx="37" cy="9" r="2"/>'
      + '<ellipse class="c-pumpkin" cx="20" cy="19.5" rx="6" ry="4.6"/><path class="c-rib" d="M20 15 L20 24 M16.8 15.6 Q15.2 19.5 16.8 23.4 M23.2 15.6 Q24.8 19.5 23.2 23.4"/>'
      + '<path class="c-stem" d="M19.4 15.4 Q19 12.6 21 11.8 L21.8 12.8 Q20.6 13.6 20.8 15.4 Z"/>'
      + '<path class="c-kcarve" d="M17 18.6 L18.6 17.2 L19 19.2 Z M23 18.6 L21.4 17.2 L21 19.2 Z M17.4 21 Q20 23.2 22.6 21 Z"/>'
      + '<path class="c-sparkle" d="M33 0 L34 3 L37 4 L34 5 L33 8 L32 5 L29 4 L32 3 Z"/>',
    // Złoty wieniec laurowy (skin wsparcia Klasyki): dwie gałązki złotych liści, rubin z przodu.
    golden_laurel: (() => {
      const left = [[3.6, 29], [2.6, 17], [9, 9.6], [17.6, 8.6]];
      const gold = c => slBranch(c, 9, 0.04, 0.96, (x, y, r) => slLeaf(x, y, r, 0.5, 'gold', true));
      return '<path class="c-laurel-stem" d="M3.6 29 C2.6 17 9 9.6 17.6 8.6 M36.4 29 C37.4 17 31 9.6 22.4 8.6"/>'
        + gold(left) + gold(slMirrorCurve(left))
        + '<circle class="c-gold-ring" cx="20" cy="9" r="3.4"/><circle class="c-ruby" cx="20" cy="9" r="2.4"/><ellipse class="c-shine" cx="19.2" cy="8.2" rx=".8" ry=".5"/>'
        + '<circle class="c-gold-dot" cx="3.6" cy="29.2" r="1.3"/><circle class="c-gold-dot" cx="36.4" cy="29.2" r="1.3"/>'
        + slSparkle(33.5, 3, 0.85) + slSparkle(6.5, 4.5, 0.6, true);
    })(),
    // Nagroda za polowanie na cukierki (Noc Duchów): obręcz z laski cukrowej, trzy lizaki
    // ze spiralą i dwa cukierki w papierkach. Świeci jak skiny wsparcia.
    candy_hunter_prize: (() => {
      const lolly = (x, y, r, tone) => `<circle class="c-lolly c-lolly-${tone}" cx="${x}" cy="${y}" r="${r}"/>`
        + `<path class="c-swirl" d="${slSpiral(x, y, r * 0.82, 2.3)}"/>`
        + `<ellipse class="c-gloss" cx="${slN(x - r * 0.3)}" cy="${slN(y - r * 0.42)}" rx="${slN(r * 0.5)}" ry="${slN(r * 0.28)}"/>`;
      const wrapped = (x, y, tone) => `<g ${slT(x, y)}>`
        + `<path class="c-wrapper c-wrapper-${tone}" d="M-2.6 0 L-6 -2.6 Q-5 0 -6 2.6 Z M2.6 0 L6 -2.6 Q5 0 6 2.6 Z"/>`
        + '<path class="c-fold" d="M-3.4 0 L-5.4 -1.4 M-3.4 0 L-5.4 1.4 M3.4 0 L5.4 -1.4 M3.4 0 L5.4 1.4"/>'
        + `<ellipse class="c-candy-${tone}" cx="0" cy="0" rx="3.2" ry="2.5"/><ellipse class="c-gloss" cx="-.8" cy="-1" rx="1.7" ry=".75"/></g>`;
      return '<rect class="c-lolly-stick" x="9.2" y="8" width="1.5" height="15" rx=".75" transform="rotate(-12 10 15.5)"/>'
        + '<rect class="c-lolly-stick" x="19.25" y="6" width="1.5" height="17" rx=".75"/>'
        + '<rect class="c-lolly-stick" x="29.3" y="8" width="1.5" height="15" rx=".75" transform="rotate(12 30 15.5)"/>'
        + lolly(8.6, 8.4, 4.4, 'pink') + lolly(31.4, 8.4, 4.4, 'blue') + lolly(20, 5.4, 5.1, 'yellow')
        + '<rect class="c-cane" x="3.5" y="20.6" width="33" height="8.8" rx="3.8"/>'
        + '<rect class="c-gloss" x="5" y="21.2" width="30" height="3.4" rx="1.7"/>'
        + wrapped(12.4, 25, 'violet') + wrapped(27.6, 25, 'green')
        + slSparkle(36.5, 2.5, 0.8) + slSparkle(2.8, 14, 0.6, true);
    })(),
  },
  // Skrzydła: kształt LEWEGO skrzydła. Prawe to jego lustro zrobione w samym SVG (matrix),
  // a nie w CSS — dzięki temu animacja machania nie musi odbijać elementu i oba skrzydła
  // zginają się przy zdjęciu, a nie przeskakują na drugą stronę.
  wings: {
    // ── Klasyka — skrzydła MALOWANE: rysunek (zaczyna się od „<"), a nie sam kontur.
    // slPawnHtml odbija go w całości grupą i pozwala wystawać poza pudełko 40×24.
    // Anioł: trzy rzędy piór (lotki, pokrywy, puch przy ramieniu), białe z błękitnym cieniem.
    angel_wings: (() => {
      let s = '';
      for (let i = 0; i < 8; i++) s += slFeather(39 - i * 0.7, 4 + i * 1.6, 202 - i * 5.2, 31 - i * 1.6, 2.9, 'c-feather');
      for (let i = 0; i < 6; i++) s += slFeather(39.5 - i * 0.5, 5.4 + i * 1.8, 198 - i * 6, 19 - i * 1.3, 3.2, 'c-feather');
      for (let i = 0; i < 5; i++) s += slFeather(40, 5.6 + i * 2, 192 - i * 7, 10.5, 3, 'c-feather');
      return s + '<path class="c-feather" d="M40.5 3.6 C34 3 29.6 5.6 29 9.4 C30.6 12.8 35.4 14.8 40.5 14.6 Z"/>'
        + '<path class="c-feather-shade" d="M31 10.6 C33.6 12.6 36.6 13.4 40 13.4"/>';
    })(),
    // Motyl (monarcha): pomarańcz z czarnymi żyłkami i obwódką w białe kropki.
    butterfly_wings: (() => {
      const fore = 'M39.5 9.5 C30 3 16 -0.5 3.5 0.8 C1.6 1 0.6 2.6 1.4 4.4 C3.6 9.4 7.6 12.6 13 13.6 C22 14.6 32 13.6 39.5 12.4 Z';
      const hind = 'M39.5 13 C32 13.4 22 14.4 16.4 16.6 C13.4 17.8 12.6 21 14.6 22.6 C18 25 26 23.8 31.6 20.6 C35.6 18.4 38.6 16 39.5 14.6 Z';
      const dots = [[4.4, 2.6], [7, 1.9], [9.8, 1.6], [3, 5], [5.2, 4.6], [4.6, 7.6], [7.2, 9.6], [10, 11.6], [13.4, 12.6],
        [15.8, 18.6], [15.2, 21.2], [17.8, 23], [21, 23.6], [24.4, 23.2], [27.6, 22]];
      return `<path class="c-monarch" d="${hind}"/><path class="c-monarch" d="${fore}"/>`
        + '<path class="c-monarch-black" d="M3.5 0.8 C9 0.4 14 0.9 17.6 1.8 C14.4 3.2 10.6 6.6 9 11.2 C6 10 3.4 7.8 1.4 4.4 C0.6 2.6 1.6 1 3.5 0.8 Z"/>'
        + '<path class="c-monarch-vein" d="M39.5 10.4 C30 7.8 20 5 9.6 3 M39.5 11.2 C30 10 20 9.2 11 9.8 M39.5 11.9 C32 12.1 24 12.6 16 13.4 M30 8.8 C25 10 21 11.6 18.4 13.6 M23 6.4 C20 8 17.6 10.4 16.2 12.6"/>'
        + '<path class="c-monarch-vein" d="M39.5 13.6 C32 15 24 17.6 16.2 20.6 M39.5 14 C34 17 28 20 22.4 23.4 M39.5 13.3 C33 14.6 26 15.8 18 17.2 M30 15.4 C28 18.6 26.6 21 26 23.6"/>'
        + `<path class="c-monarch-edge" d="${fore}"/><path class="c-monarch-edge" d="${hind}"/>`
        + dots.map(([x, y]) => `<circle class="c-monarch-dot" cx="${x}" cy="${y}" r=".55"/>`).join('');
    })(),
    // Husaria na 11 listopada: rama w czerwonym laku ze złotymi nitami, a na niej wachlarz
    // długich piór sterczących nad głową, jak u husarza.
    hussar_wings: (() => {
      const frame = [[38.5, 23.5], [27, 16.5], [24, 1], [31, -13]];
      let s = '';
      for (let i = 11; i >= 0; i--) {
        const b = slBez(frame, 0.06 + i * 0.085);
        s += slFeather(b.x, b.y, b.a - 62 - i * 1.5, 11 + i * 0.45, 2.5, 'c-feather-cream');
      }
      s += '<path class="c-hussar-frame" d="M38.5 23.5 C27 16.5 24 1 31 -13"/><path class="c-hussar-frame-hi" d="M37.8 22.4 C27 15.6 24.2 1.2 30.4 -12.2"/>';
      for (let i = 0; i < 6; i++) {
        const b = slBez(frame, 0.1 + i * 0.17);
        s += `<circle class="c-gold-dot" cx="${slN(b.x)}" cy="${slN(b.y)}" r=".75"/>`;
      }
      return s;
    })(),
    // ── Noc Duchów ──
    bat_wings: 'M40 6 C34 2 26 0 18 2 C12 3 5 6 0 4 C3 9 4 13 2 18 C6 15 10 15 12 19 C14 15 18 14 21 18 C23 14 27 13 30 16 C32 12 36 11 40 12 Z',
    demon_wings: 'M40 5 C33 1 22 0 12 3 L0 0 L4 8 L1 14 L8 12.5 L6 21 L14 16 L16 23 L22 15.5 L26 21 L30 14 L40 12 Z',
  },
  gadget: {
    // ── Klasyka ──
    // Parasol: cztery klinowe panele w butelkowej zieleni, złoty szpic, drewniana rączka,
    // krople deszczu.
    umbrella: '<path class="c-umb-shaft" d="M15 16.6 L15 33"/>'
      + '<path class="c-umb-handle" d="M15 32.6 C15 37.8 8.6 38 8.6 33.8"/><path class="c-umb-handle-hi" d="M14.6 33.4 C14.4 36.6 10.6 37 9.6 35"/>'
      + '<path class="c-canopy-a" d="M15 3.6 C8 4.2 2.6 8.6 1 16 C3.2 14.2 6 14.4 8 16.6 C9.4 10.8 11.8 6.4 15 3.6 Z"/>'
      + '<path class="c-canopy-b" d="M15 3.6 C11.8 6.4 9.4 10.8 8 16.6 C10.2 14.6 12.8 14.6 15 16.8 C14.8 11 14.8 6.6 15 3.6 Z"/>'
      + '<path class="c-canopy-a" d="M15 3.6 C15.2 6.6 15.2 11 15 16.8 C17.2 14.6 19.8 14.6 22 16.6 C20.6 10.8 18.2 6.4 15 3.6 Z"/>'
      + '<path class="c-canopy-b" d="M15 3.6 C18.2 6.4 20.6 10.8 22 16.6 C24 14.4 26.8 14.2 29 16 C27.4 8.6 22 4.2 15 3.6 Z"/>'
      + '<path class="c-sheen" d="M4.6 11.4 C6.2 7.8 9.4 5.4 12.8 4.6"/>'
      + '<path class="c-gold-tip" d="M14.2 4 L15 0.4 L15.8 4 Z"/>'
      + '<circle class="c-gold-dot" cx="1" cy="16" r=".7"/><circle class="c-gold-dot" cx="8" cy="16.6" r=".7"/><circle class="c-gold-dot" cx="15" cy="16.8" r=".7"/><circle class="c-gold-dot" cx="22" cy="16.6" r=".7"/><circle class="c-gold-dot" cx="29" cy="16" r=".7"/>'
      + slDrop(3, 22.5, 0.8) + slDrop(26.5, 23.5, 0.9) + slDrop(22.5, 31.5, 0.7) + slDrop(5.5, 30, 0.6),
    // Kubek kawy: kremowa ceramika z terakotowym paskiem, crema z sercem, para.
    coffee: '<path class="c-steam" d="M10 12.6 C8.2 10.2 11.6 8.4 9.8 5.6 C8.6 3.8 10 2 10.8 1"/><path class="c-steam c-steam-late" d="M15.6 12.6 C13.8 10 17.4 8 15.4 5 C14.4 3.4 15.6 1.6 16.4 0.8"/>'
      + '<path class="c-mug" d="M20.6 19 C26.5 18.6 28 22 27.6 25.6 C27.2 29.6 24.6 31.6 20.2 31.8 L20.3 29.4 C23.6 29.2 25.1 27.8 25.3 25.4 C25.5 22.8 24.4 21.2 20.8 21.4 Z"/>'
      + '<path class="c-mug" d="M5 15 L21 15 C21 22 20.6 30 20 35 C19.8 37.2 18.2 38.6 16 38.6 L10 38.6 C7.8 38.6 6.2 37.2 6 35 C5.4 30 5 22 5 15 Z"/>'
      + '<path class="c-mug-band" d="M5.5 29.4 L20.5 29.4 L20.3 32 L5.7 32 Z"/>'
      + '<path class="c-sheen" d="M7.3 18 C7.5 24 7.9 29.6 8.6 34.6"/>'
      + '<ellipse class="c-mug-inner" cx="13" cy="15" rx="8" ry="1.9"/><ellipse class="c-coffee" cx="13" cy="15.4" rx="7.1" ry="1.45"/>'
      + '<path class="c-latte" d="M13 16.4 C11.2 15.6 10.6 15 11.4 14.6 C12.2 14.3 12.8 14.7 13 15 C13.2 14.7 13.8 14.3 14.6 14.6 C15.4 15 14.8 15.6 13 16.4 Z"/>',
    // Rogal świętomarciński (11 listopada): półksiężyc z przypieczonych zwojów, biały lukier
    // i posiekane orzechy.
    rogal: (() => {
      const seg = (cx, cy, rx, ry, rot) => `<ellipse class="c-rogal" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})"/>`;
      return seg(4.6, 31.4, 2.9, 4.6, 42) + seg(25.4, 31.4, 2.9, 4.6, -42)
        + seg(9.2, 26.4, 4.3, 6, 26) + seg(20.8, 26.4, 4.3, 6, -26) + seg(15, 24.4, 5.3, 6.8, 0)
        + '<path class="c-crust" d="M3.4 29.6 C4.6 30.4 5.6 31.6 6 33.2 M7.4 22.6 C9.4 24 10.6 26.4 10.6 29.4 M22.6 22.6 C20.6 24 19.4 26.4 19.4 29.4 M26.6 29.6 C25.4 30.4 24.4 31.6 24 33.2 M11.6 22.4 C13 23.8 13.6 26.4 13.4 29 M18.4 22.4 C17 23.8 16.4 26.4 16.6 29"/>'
        + '<path class="c-icing" d="M5.4 25 C7.4 21.4 10.4 19.4 15 18.4 C19.6 19.4 22.6 21.4 24.6 25 C23.6 25.6 22.8 24.4 22 25.2 C21.4 26.4 20.2 24.8 19.4 25.4 C18.6 26.8 17.4 23.6 16.4 24.6 C15.4 25.8 14.6 24 13.6 24.6 C12.6 26.2 11.6 23.8 10.6 25.4 C9.8 26.2 8.8 24.6 8 25.2 C7.2 26.2 6.2 24.6 5.4 25 Z"/>'
        + '<path class="c-sheen" d="M9 21.6 C11 20.2 13 19.6 15 19.4"/>'
        + [[10.6, 21.8, 20], [13.4, 20.6, -30], [16.4, 20.4, 50], [19.2, 21.6, 10], [12, 23, 70], [17.8, 23, -15], [15, 22.2, 35]]
          .map(([x, y, r]) => `<path class="c-nut-bit" ${slT(x, y, r)} d="M-.7 -.4 L.5 -.6 L.8 .3 L-.2 .6 Z"/>`).join('');
    })(),
    // ── Noc Duchów ──
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
    // ── Klasyka ──
    // Kino nieme: czarno-białe zdjęcie z ziarnem i winietą, między paskami taśmy filmowej.
    film_noir: (() => {
      const holes = side => Array.from({ length: 7 }, (_, i) => `<rect class="c-film-hole" x="${side}" y="${slN(0.6 + i * 6)}" width="2.8" height="3.2" rx=".6"/>`).join('');
      return slOnShape(SL_SHAPE_FILM, 'c-grain') + slOnShape(SL_SHAPE_FILM, 'c-vignette')
        + '<rect class="c-film" x="-4.4" y="-1.5" width="6.6" height="43" rx="1.2"/><rect class="c-film" x="37.8" y="-1.5" width="6.6" height="43" rx="1.2"/>'
        + holes(-2.7) + holes(39.5)
        + '<path class="c-scratch" d="M13.2 3.4 L12.4 17.6 M27.4 19 L28.6 36.4 M22 4.6 L22.3 9"/>'
        + '<circle class="c-dust" cx="9" cy="28" r=".45"/><circle class="c-dust" cx="30.5" cy="9" r=".35"/>';
    })(),
    // Jesienna ramka: zdjęcie w kształcie liścia z ciepłą winietą, gałązka z liśćmi,
    // żołędziem i jarzębiną w rogach.
    autumn_frame: slOnShape(SL_SHAPE_LEAF, 'c-vignette-warm')
      + '<path class="c-twig c-twig-thick" d="M4.8 35.2 C3 37.6 1 39.6 -1.8 41.8"/>'
      + slLeaf(3.4, 37.4, -100, 0.85, 'orange') + slLeaf(5.6, 38.6, 170, 0.75, 'yellow')
      + slMaple(11.2, 39.4, 35, 0.48, 'red') + slAcorn(-1.4, 34.6, -20, 0.8) + slBerries(8.2, 34.4, 0.7)
      + slLeaf(35.6, 4.6, 40, 0.8, 'yellow') + slLeaf(34.2, 3.4, -20, 0.65, 'red') + slMaple(39.6, 9.6, 70, 0.36, 'orange'),
    // Szron: zdjęcie-sześciokąt, mroźna winieta, sople z górnej krawędzi i płatki śniegu.
    frost: slOnShape(SL_SHAPE_HEX, 'c-vignette-frost')
      + '<path class="c-ice" d="M10.6 2.6 Q20 1.2 29.4 2.6 L29.9 4.6 Q20 3.4 10.1 4.6 Z"/>'
      + slIcicle(12.6, 4.2, 1) + slIcicle(15, 7.5, 1.2) + slIcicle(17.6, 5, 0.9) + slIcicle(20.2, 9.5, 1.3)
      + slIcicle(22.8, 5.6, 1) + slIcicle(25.2, 7.8, 1.15) + slIcicle(27.6, 4, 0.9)
      + `<path class="c-flake" d="${slSnowflake(36.6, 31.6, 4.4, 15)}"/><path class="c-flake" d="${slSnowflake(3.4, 9, 3.6)}"/>`
      + `<path class="c-flake" d="${slSnowflake(5, 34.4, 2.4, 10)}"/><path class="c-flake" d="${slSnowflake(36.8, 6.8, 2, 20)}"/>`
      + slSparkle(33.8, 37, 0.45) + slSparkle(1.6, 21, 0.4, true),
    // ── Noc Duchów ──
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
  film_noir: SL_SHAPE_FILM,      // stary ekran: prostokąt z lekko wypukłymi bokami
  autumn_frame: SL_SHAPE_LEAF,   // liść zaostrzony w prawym górnym i lewym dolnym rogu
  frost: SL_SHAPE_HEX,           // sześciokąt jak kryształek lodu, płaska góra pod sople
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
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}${SL_COSTUME_DEFS}</defs></svg>`);
})();
