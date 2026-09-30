// Snakes — biblioteka DEKORACJI PLANSZY (SL_DECOR). Plik planszy stawia je po nazwie
// (`view.decor: [{ kind, at, size }]`), payload niesie tylko nazwę i pozycję — NIGDY
// znaczników, więc przez bazę nie da się niczego wstrzyknąć. Nowy sezon z nowymi ozdobami
// = nowe wpisy tutaj (+ kolory w public/themes/<motyw>.css). Nieznany `kind` jest pomijany.
// Kolejność skryptów i zasady ładowania: patrz nagłówek sl/art-effects.js.

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
