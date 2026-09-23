// „Noc Duchów" — sezon październikowy.
//
// Kształt: znak NIESKOŃCZONOŚCI ∞. Gra od początku jest „nieskończoną pętlą", więc tu
// pętla jest dosłowna: jedna zamknięta droga w ósemkę, która przecina się pośrodku na
// mostku. Meta stoi tuż przed startem, a droga z mety płynnie wjeżdża z powrotem na start.
// Zamiast serpentyny (w prawo, w górę, w lewo…) ruch obiega dwie pętle: lewą wokół
// cmentarza i prawą wokół nawiedzonego domu.
//
// Pola nie leżą w kratkach (layout 'free'): stoją w równych odstępach NA krzywej,
// liczonych po długości łuku, więc droga jest gładka, a nie schodkowa.

const COLS = 20;
const ROWS = 11;
const TILES = 48;

// Ósemka Lissajous 1:2: x = A·sin t, y = B·sin 2t. Przecina się w środku dla t = 0 i t = π.
const A = 8.7;
const B = 4.4;
const curve = (t) => ({ x: COLS / 2 + A * Math.sin(t), y: ROWS / 2 + B * Math.sin(2 * t) });

// Start na szczycie lewej pętli (t = −π/4), ruch zgodnie z rosnącym t: najpierw w dół
// do mostka, potem dołem prawej pętli, jej szczytem z powrotem przez mostek, dołem
// i lewym brzegiem lewej pętli aż do mety tuż przed startem.
const START_T = -Math.PI / 4;

// Na skrzyżowaniu obie nitki drogi mijają się pod kątem ~90°. Gdyby pola stały tuż przy
// nim, pola z dwóch nitek nachodziłyby na siebie — dlatego wokół obu przejść przez środek
// zostawiamy przerwę (mostek) o tej długości, a pola rozkładamy równo na reszcie drogi.
const BRIDGE_GAP = 2.0;

function buildPath() {
  const STEPS = 40000;
  const samples = [];
  let len = 0;
  let prev = curve(START_T);
  for (let i = 0; i <= STEPS; i++) {
    const t = START_T + (2 * Math.PI * i) / STEPS;
    const p = curve(t);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    samples.push({ t, s: len, x: p.x, y: p.y });
    prev = p;
  }
  // Długość łuku w chwilach przejścia przez środek (t = 0 oraz t = π).
  const arcAt = (target) => {
    let best = samples[0];
    let bestD = Infinity;
    for (const smp of samples) {
      let d = ((smp.t - target) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      d = Math.min(d, 2 * Math.PI - d);
      if (d < bestD) { bestD = d; best = smp; }
    }
    return best.s;
  };
  const crossings = [arcAt(0), arcAt(Math.PI)];
  const onBridge = (s) => crossings.some(c => [c - len, c, c + len].some(cc => Math.abs(s - cc) < BRIDGE_GAP / 2));

  const step = (len - crossings.length * BRIDGE_GAP) / TILES;
  const out = [];
  let walked = 0;
  let next = 0;
  for (let i = 1; i < samples.length && out.length < TILES; i++) {
    const a = samples[i - 1], b = samples[i];
    if (onBridge((a.s + b.s) / 2)) continue;
    walked += b.s - a.s;
    if (walked >= next) {
      // Pole to kwadrat 1×1 zaczepiony w lewym górnym rogu — tak jak kratka w siatce —
      // więc środek krzywej przesuwamy o pół pola.
      out.push([+(b.x - 0.5).toFixed(3), +(b.y - 0.5).toFixed(3)]);
      next += step;
    }
  }
  return out;
}

module.exports = {
  name: 'Noc Duchów 🎃',
  theme: 'halloween',
  effects: ['bats', 'fog'],
  grid: { cols: COLS, rows: ROWS },
  layout: 'free',
  tile: 0.86,
  road: 'smooth',
  closed: true,
  links: 'drawn',
  path: buildPath(),

  // Z mety (pole 47) na start (0) droga idzie sama, bo tor jest zamknięty — kropkowana
  // linia okrążenia to tylko krótka „linia mety" między nimi. Podpis stoi w lewym górnym
  // rogu (zaczepiony lewą krawędzią), nad chorągiewką META: nad samym startem przycinałaby
  // go górna krawędź planszy.
  loop: [],
  loop_label: [-0.3, -0.18],

  // Łączniki wybrane tak, żeby żaden nie przechodził przez inne pole ani przez mostek.
  // Drabina nad przewężeniem (4 → 28) to skrót górą: omija cały dół prawej pętli.
  ladders: [[4, 28], [10, 26], [33, 41]],
  // Pajęcza nić (29 → 9) spada tuż przy mostku, zaraz po tym, jak ktoś wszedł drabiną 10.
  snakes: [[25, 12], [29, 9], [44, 31]],
  // Dynie zamiast gwiazdek. Celowo skromniej niż na klasycznej planszy (5 dyń, razem
  // 90 pkt wobec 125): przy siedmiu bonusy ważyły za dużo w stosunku do samych rzutów.
  // Droga powrotna lewej pętli (37–47) nie ma żadnej — tam rządzi wąż 44 → 31.
  bonuses: [[2, 10], [14, 20], [19, 25], [23, 15], [36, 20]],

  marks: { ladder: '🪜', snake: '🐍', bonus: '🎃' },
  // Pionek-nietoperz: zdjęcie gracza zostaje okrągłe (twarz musi być rozpoznawalna),
  // a po bokach dostaje skrzydła. Mój nietoperz ma skrzydła w kolorze „to ja".
  pawn: 'bat',
  confetti: ['🎃', '👻', '🦇', '🍬', '🕸️'],

  // Dekoracje: środek [x, y] w kratkach, `size` = szerokość w kratkach. Stoją POD drogą
  // i łącznikami. Rozmieszczone w pustych miejscach: wnętrza pętli, pas nad i pod
  // przewężeniem, rogi.
  decor: [
    { kind: 'moon', at: [10, 1.55], size: 2.6 },
    { kind: 'ghost', at: [12.6, 1.35], size: 1.05 },
    { kind: 'ghost', at: [7.35, 1.05], size: 0.8, flip: true },

    // Prawa pętla: nawiedzony dom między pionową pajęczą nicią a prawym brzegiem.
    { kind: 'house', at: [16.75, 5.35], size: 2.75 },

    // Lewa pętla: cmentarz. Drzewo w górnym klinie, nagrobki w pasie między wężem a drabiną.
    { kind: 'tree', at: [4.6, 3.35], size: 2.1 },
    { kind: 'tomb-cross', at: [3.4, 6.35], size: 0.85 },
    { kind: 'tomb', at: [4.75, 6.6], size: 0.9 },
    { kind: 'tomb', at: [6.1, 6.35], size: 0.75, flip: true },
    { kind: 'fence', at: [4.75, 7.05], size: 3.1 },

    // Pod przewężeniem bulgocze kocioł.
    { kind: 'cauldron', at: [10, 9.3], size: 2.1 },

    // Rogi.
    { kind: 'pumpkin', at: [0.95, 10.1], size: 1.4 },
    { kind: 'pumpkin', at: [19.05, 10.15], size: 1.25, flip: true },
    { kind: 'web', at: [19.25, 0.75], size: 1.7 },
    { kind: 'candles', at: [7.9, 9.9], size: 1.0 },
    { kind: 'candles', at: [12.1, 9.9], size: 1.0, flip: true },
  ],
};
