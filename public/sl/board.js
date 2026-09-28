// Snakes — RYSOWANIE PLANSZY: pola z board.path, droga, łączniki, zdarzenia sezonowe na
// polach, pionki. Kształt przychodzi z pliku sezonu (boards/<id>.js) w payloadzie, wygląd
// z board.view (czytany przez slBoardView z domyślnymi) — front nie zna żadnej planszy na
// sztywno. Siatka BEZ gapów (odstęp to margin na .sl-cell), bo gap rozjechałby drogę
// i łączniki z kafelkami (slGridPoint). renderBoard podmienia innerHTML #board-area, więc
// warstwy, które mają przeżyć odświeżenie (efekty sezonu), żyją poza nią.
// Pionek na planszy i podgląd w garderobie składa JEDNA funkcja slPawnHtml.
// Kolejność skryptów i zasady ładowania: patrz nagłówek sl/art-effects.js.

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
