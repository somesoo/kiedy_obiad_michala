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
//
// EKONOMIA (analiza z września 2026, symulacja 12 graczy × 3 rzuty dziennie): przy 48
// polach akcja trafiała się w co trzecim rzucie, a punkty szły prawie wyłącznie z oczek
// i postępu. Dlatego plansza ma 40 pól, z których ~70% coś robi, a każda akcja jest
// MAŁA. Kostka zostaje 1–6. Mniej pól znaczy częstsze zbicia, więc razem z tą zmianą
// zbicie zabiera 10 coins zamiast 20 (SL_KNOCKBACK_COIN_STEAL w server.js).

const COLS = 20;
const ROWS = 11;
const TILES = 40;

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
  // Przy 40 polach odstęp środków to ≥ 1,2 kratki, więc pole może być prawie pełną kratką.
  tile: 0.95,
  road: 'smooth',
  closed: true,
  links: 'drawn',
  path: buildPath(),

  // Z mety (pole 39) na start (0) droga idzie sama, bo tor jest zamknięty — kropkowana
  // linia okrążenia to tylko krótka „linia mety" między nimi. Podpis stoi w lewym górnym
  // rogu (zaczepiony lewą krawędzią), nad chorągiewką META: nad samym startem przycinałaby
  // go górna krawędź planszy.
  loop: [],
  loop_label: [-0.3, -0.18],

  // Okrążenie daje mniej niż na klasycznej planszy (50): przy 40 polach wypada częściej,
  // a przy 50 byłoby jedną piątą całego zarobku i ważyłoby więcej niż wszystkie akcje razem.
  lap_points: 30,

  // Łączniki wybrane tak, żeby żaden nie przechodził przez inne pole ani przez mostek
  // (luz ≥ 0,7 kratki — sprawdzone skryptem liczącym odległość odcinka od środków pól).
  ladders: [[9, 22], [28, 34]],
  // ROZWIDLONA drabina nad przewężeniem. Zwykła 3 → 23 omijałaby cały dół prawej pętli
  // (+20 pól) i byłaby za mocna. Wejście na 3 to dodatkowy rzut: 3 albo 6 = górą na 23,
  // cokolwiek innego = krótsza odnoga na 6, tuż za mostek. Średnio ~+8 zamiast +20.
  // Węzeł [9.6, 2.4] to miejsce, z którego pień i obie odnogi mijają wszystkie pola
  // i mostek z największym zapasem (~0,7 kratki).
  forks: [[3, 23, 6, [3, 6], [9.6, 2.4]]],
  // Pajęcza nić (24 → 7) spada pionowo tuż przy mostku, zaraz obok szczytu drabiny 9 → 22.
  snakes: [[21, 10], [24, 7], [37, 26]],
  // Dynie zamiast gwiazdek: DUŻO i MAŁO. Dziesięć dyń po 3–8 pkt (razem 45) zamiast pięciu
  // po 10–25 (90) — akcja ma się trafiać często, ale żadne pole nie może ważyć więcej niż
  // jeden dobry rzut. Dynie nie stoją na celach łączników (pilnuje walidacja).
  bonuses: [[2, 4], [5, 3], [11, 5], [14, 4], [17, 6], [19, 3], [27, 8], [31, 5], [35, 4], [39, 3]],

  // Mechaniki sezonowe (logika: lib/seasonal.js). Działają CODZIENNIE i obok siebie:
  // wcześniej drzwi były tylko we wtorki i czwartki i zdejmowały wtedy dynie, więc w te
  // dni akcji na planszy było MNIEJ, a nie więcej.
  events: {
    // KOCIOŁ: na polach `drop` zabiera 5 coins (także na minus), chochla na 30 — tuż
    // przy namalowanym kotle — zgarnia wszystko, co się uzbierało.
    cauldron: { drop: [8, 16, 25, 36], ladle: 30, amount: 5 },
    // CUKIEREK ALBO PSIKUS: bez `weekdays` = drzwi otwarte codziennie. Stawki mniejsze niż
    // domyślne (15/5/15), bo drzwi stoją na sześciu polach, a nie na czterech co drugi dzień.
    // Pola 7 i 23 to cele łączników — tam drzwi mogą stać (to zdarzenie, nie pole specjalne).
    trick_or_treat: { tiles: [7, 13, 23, 29, 33, 38], treat_points: 8, candy_points: 3, trick_coins: 8 },
    // POLOWANIE NA CUKIERKI: 3 dziennie na losowych zwykłych polach (zostało ich 12),
    // najwyżej 6 naraz.
    candy: { per_day: 3, max_on_board: 6 },
  },

  // BOSS SEZONU: Dynia Zagłady jest JEDYNYM bossem całej Nocy Duchów — pojawia się od razu
  // po włączeniu sezonu i trwa do nocy Halloween (31.10, 20:00). HP = 1100 × dni robocze do
  // ataku: ekipa robi dziś ~1000 HP dziennie przy sporych wpłatach, więc bez wpłat się nie
  // da, a z nimi — na styk. Przejście na 40 pól tego nie zmienia: kostka dalej 1–6, więc
  // obrażenia z rzutów są te same, a dochód w coins (~40 dziennie)
  // prawie ten sam. Sezon włączony 1.10 → 22 dni robocze → 24 200 HP.
  special_boss: { name: 'Dynia Zagłady', emoji: '🎃', attack_at: '10-31 20', hp_per_workday: 1100 },

  // Garderoba (sklep z kostiumami) jako szafa z lustrem w lewym dolnym rogu.
  shop_at: [0.75, 10.0],

  marks: { ladder: '🪜', snake: '🐍', bonus: '🎃' },
  confetti: ['🎃', '👻', '🦇', '🍬', '🕸️'],
  // Kto przepuści dwa pełne dni robocze bez rzutu, straszy na planszy jako duch.
  ghost_after_days: 2,

  // Dekoracje: środek [x, y] w kratkach, `size` = szerokość w kratkach. Stoją POD drogą
  // i łącznikami. Rozmieszczone w pustych miejscach: wnętrza pętli, pas nad i pod
  // przewężeniem, rogi.
  decor: [
    // Księżyc przesunięty w lewo: nad przewężeniem stoi węzeł rozwidlonej drabiny.
    { kind: 'moon', at: [8.1, 1.05], size: 2.0 },
    { kind: 'ghost', at: [12.4, 1.3], size: 1.0 },

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
    { kind: 'pumpkin', at: [19.05, 10.15], size: 1.25, flip: true },
    { kind: 'web', at: [19.25, 0.75], size: 1.7 },
    { kind: 'candles', at: [7.9, 9.9], size: 1.0 },
    { kind: 'candles', at: [12.1, 9.9], size: 1.0, flip: true },
  ],
};
