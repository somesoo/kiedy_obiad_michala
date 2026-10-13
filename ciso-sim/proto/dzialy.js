// ── DZIAŁY JAKO AGENCI (półinteligentne: użyteczność + nauka ze wzmocnieniem) ──
// Projekt: docs/15-dzialy-i-rezyser.md. Każdy dział ma cele, obciążenie, zaufanie do
// bezpieczeństwa, świadomość (z zapominaniem) i dwie wyuczone wartości: ile „opłaca się"
// pytać, a ile obejść zasady. Uczy się z tego, jak gracz odpowiada — bez skryptu.
//
// Losowość: WŁASNY strumień (k.rnd.dzialy), żeby decyzje działów nie przesuwały „pogody"
// silnika i odwrotnie.

const INICJATYWY = require('../data/dzialy');

const ETA = 0.3;            // tempo nauki (średnia ruchoma nagród)
const BETA = 2;             // jak mocno wartości wyuczone przeważają nad resztą
const PROG_AKTYWNOSCI = 0.25;
const PROG_ZAPOWIEDZI = 0.4;   // zaufanie, od którego dział mówi o planach
const PROG_SZCZEROSCI = 0.6;   // zaufanie, od którego przyznaje się do obejść

const przytnij = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sigmoid = x => 1 / (1 + Math.exp(-x));

function noweDzialy(def) {
  const out = {};
  for (const [id, d] of Object.entries(def.dzialy)) {
    out[id] = {
      id, ...d,
      swiadomoscBazowa: d.swiadomosc,
      zmeczenie: 0,
      obciazenieBiezace: 0,
      Q: { pytaj: 0, obejdz: 0.3 },   // na starcie obejście „wydaje się" szybsze — jak w życiu
      ukryte: [],                     // { ini, m } — obejścia, o których gracz nie wie
      karencja: {},                   // ini → miesiąc, od którego można wrócić
      pilnoscExtra: {},               // ini → dodatkowa pilność po „odłóż"
      plan: null,                     // zapowiedziana inicjatywa na kolejny okres
      pamiec: [],                     // ostatnie zdarzenia działu (do raportów)
      kpiOstatnie: null,
      zdarzeniaOkresu: [],            // co dział zrobił w tym okresie (do raportu)
    };
  }
  return out;
}

// Ryzyko inicjatywy w jednej liczbie (do oceny opcji i diagnozy reżysera).
function ciezarRyzyka(ini) {
  const r = ini.ryzyko || {};
  let s = 0;
  for (const mn of Object.values(r.wektory || {})) s += Math.log(mn);
  return s + (r.nieznane || 0) / 20;
}

// Użyteczność inicjatywy dla działu: cele × korzyść × presja pracy + szum.
function uzytecznosc(d, ini, rnd) {
  let u = 0;
  for (const [cel, v] of Object.entries(ini.korzysc)) u += (d.cele[cel] || 0) * v;
  return u * (1 + d.obciazenieBiezace) / 2 + (rnd() - 0.5) * 0.2;
}

// Koniec okresu: dział wybiera, co zrobi w następnym (i czy o tym powie).
function zaplanuj(k, d) {
  const rnd = k.rnd.dzialy;
  // Po odmowie potrzeba nie znika — raport mówi „szukamy innej drogi" i czasem to prawda.
  // Dawniej odmowa kasowała inicjatywę razem z ryzykiem: „Nie" było jedyną decyzją o zerowym
  // ryzyku, a gracz odmawiający wszystkiego miał najmniejszą ekspozycję w grze (docs/17-…, 17.6).
  if (d.poOdmowie) {
    const id = d.poOdmowie;
    d.poOdmowie = null;
    const ini = INICJATYWY[id];
    const p = przytnij(0.15 + 0.6 * ini.pilnosc - 0.4 * d.swiadomosc - (k.flagi.polityka_zakupow ? 0.3 : 0), 0.05, 0.75);
    if (rnd() < p) {
      zastosujRyzyko(k, ini.ryzyko, 1, `${d.id}:${id}`, 'obejscie', true);
      d.ukryte.push({ ini: id, m: k.st.m, poOdmowie: true });
      d.zdarzeniaOkresu.push({ rodzaj: 'obejscie', ini: id });
      k.log('dzial', `${d.nazwa}: po odmowie „${ini.nazwa}" i tak wchodzi — po cichu (P=${p.toFixed(2)})`);
    }
  }
  if (rnd() > d.aktywnosc * (1 + d.obciazenieBiezace)) { d.plan = null; return; }
  let best = null, bestU = PROG_AKTYWNOSCI;
  for (const id of d.inicjatywy) {
    const ini = INICJATYWY[id];
    if (!ini || (d.karencja[id] || 0) > k.st.m || !ini.warunek(k)) continue;
    if (k.zrobione.has(`${d.id}:${id}`) && ini.karencja >= 99) continue;
    const u = uzytecznosc(d, ini, rnd);
    if (u > bestU) { bestU = u; best = id; }
  }
  d.plan = best;
}

// Początek okresu: dział realizuje plan — pyta (karta dla gracza) albo obchodzi po cichu.
function wykonajPlan(k, d) {
  if (!d.plan) return null;
  const id = d.plan;
  const ini = INICJATYWY[id];
  d.plan = null;
  const rnd = k.rnd.dzialy;
  const pilnosc = ini.pilnosc + (d.pilnoscExtra[id] || 0);
  const zapowiedziane = d.zapowiedzialo === id;
  const polityka = k.flagi.polityka_zakupow ? 1 : 0;
  const x = BETA * (d.Q.pytaj - d.Q.obejdz) + 1.5 * d.swiadomosc + 2 * polityka
    - 1 * pilnosc + 0.5 * d.zaufanie - 0.3 * d.zmeczenie + (zapowiedziane ? 0.3 : 0);
  const pPytaj = sigmoid(x);
  const pyta = rnd() < pPytaj;
  d.karencja[id] = k.st.m + (ini.karencja || 6);
  k.zrobione.add(`${d.id}:${id}`);
  const powod = `P(pytaj)=${pPytaj.toFixed(2)} [Q pytaj ${d.Q.pytaj.toFixed(2)} / obejdź ${d.Q.obejdz.toFixed(2)}, ` +
    `zaufanie ${d.zaufanie.toFixed(2)}, świadomość ${d.swiadomosc.toFixed(2)}, pilność ${pilnosc.toFixed(2)}]`;
  if (pyta) return { typ: 'pytanie', dzial: d.id, ini: id, powod };
  // Obejście: ryzyko wchodzi do silnika od razu, gracz nic nie wie. Tylko obejście dokłada
  // urządzenia POZA ewidencją — przy zgodzie bezpieczeństwo wie, co powstało.
  zastosujRyzyko(k, ini.ryzyko, 1, `${d.id}:${id}`, 'obejscie', true);
  d.ukryte.push({ ini: id, m: k.st.m });
  d.zdarzeniaOkresu.push({ rodzaj: 'obejscie', ini: id });
  return { typ: 'obejscie', dzial: d.id, ini: id, powod };
}

// ── REJESTR RYZYK DZIAŁÓW ──
// Klucz „dział:inicjatywa" → { wektory, ulamek, zrodlo, nieznane }. Mnożniki wektorów liczy się
// z rejestru OD NOWA przy każdej zmianie (mnozniki()), zamiast mnożyć je przyrostowo.
// Dlaczego: przypadki brzegowe z 13.10.2026 — ten sam dział trzeci raz „wprowadzał czat AI"
// i ryzyko insidera rosło ×23; a cofanie dzieleniem (legalizacja, kara) rozjeżdżało się
// z sufitami. Teraz powtórka tej samej inicjatywy przez ten sam dział nie mnoży ryzyka
// (to dalej jeden czat w jednym dziale), a legalizacja/kara tylko zmieniają ułamek.
// `ulamki` (opcjonalnie): osobny ułamek na każdy wektor — warunki „tak, ale" składane przez gracza
// redukują KONKRETNE wektory (brama z MFA tnie usługi, osobne konta — dostawcę), docs/18-….
function zastosujRyzyko(k, ryzyko, ulamek, klucz, zrodlo, nieznane = false, ulamki = null) {
  if (!ryzyko) return;
  const r = k.ryzyka[klucz] || (k.ryzyka[klucz] = { wektory: ryzyko.wektory || {}, ulamek: 0, nieznane: 0, zrodlo });
  if (ulamki) r.ulamki = ulamki; else { r.ulamek = Math.max(r.ulamek, ulamek); delete r.ulamki; }
  r.zrodlo = zrodlo;
  if (nieznane && ryzyko.nieznane) { const n = ryzyko.nieznane * ulamek; dodajNieznane(k, n); r.nieznane += n; }
}

// Ustawia ułamek wprost (legalizacja = resztka, kara = 0). Urządzenia wracają do ewidencji.
// `zwrotNieznanych`: jaka część urządzeń poza ewidencją wraca do ewidencji (warunek „w ewidencji").
function ustawRyzyko(k, klucz, ulamek, zrodlo, ulamki = null, zwrotNieznanych = 1) {
  const r = k.ryzyka[klucz];
  if (!r) return;
  if (r.nieznane) { const n = r.nieznane * (ulamek <= 0 ? 1 : zwrotNieznanych); dodajNieznane(k, -n); r.nieznane -= n; }
  if (ulamek <= 0) { delete k.ryzyka[klucz]; return; }
  if (ulamki) r.ulamki = ulamki; else { r.ulamek = ulamek; delete r.ulamki; }
  r.zrodlo = zrodlo;
}

const SUFIT_RYZYKA = 3;      // działy razem nie potroją żadnego wektora — dalej to już absurd modelu
function mnozniki(k) {
  const out = {};
  for (const r of Object.values(k.ryzyka)) {
    for (const [w, mn] of Object.entries(r.wektory)) out[w] = (out[w] ?? 1) * (1 + (mn - 1) * (r.ulamki?.[w] ?? r.ulamek));
  }
  for (const w of Object.keys(out)) out[w] = Math.min(SUFIT_RYZYKA, out[w]);
  return out;
}

// Nowe urządzenia poza ewidencją obniżają „znane" (silnik chroni tylko znane zasoby).
function dodajNieznane(k, n) {
  const st = k.st;
  const prawdziwe = st.zasobyZnane / st.znane;
  st.znane = przytnij(st.zasobyZnane / (prawdziwe + n), 0.3, 0.98);
}

const NAGRODY = { zgoda: 1.0, warunki: 0.6, warunki_wolno: 0.1, alternatywa: 0.0, odmowa: -0.8, odloz: -0.5,
  obejscie_niewykryte: 1.0, legalizacja: -0.2, wylaczenie: -0.6, kara: -1.5, incydent: -2.0 };

function ucz(d, akcja, r) {
  d.Q[akcja] += ETA * (r - d.Q[akcja]);
  if (akcja === 'pytaj') d.zaufanie = przytnij(d.zaufanie + 0.1 * r);
}

// Gracz odpowiedział na pytanie działu.
// Odpowiedź gracza na prośbę działu (sprawa, proto/sprawy.js). Przy „warunkach" sprawa podaje
// policzone ułamki ryzyka na wektor i nagrodę działu (więcej warunków = mniejsze zadowolenie).
function odpowiedz(k, karta, odpowiedzId, { ulamki = null, nagroda = null } = {}) {
  const d = k.dzialy[karta.dzial];
  const ini = INICJATYWY[karta.ini];
  let r = nagroda ?? NAGRODY[odpowiedzId];
  const klucz = `${d.id}:${karta.ini}`;
  if (odpowiedzId === 'zgoda') zastosujRyzyko(k, ini.ryzyko, 1, klucz, 'zgoda');
  if (odpowiedzId === 'warunki') zastosujRyzyko(k, ini.ryzyko, 1, klucz, 'warunki', false, ulamki);
  const odlozenia = d.odlozenia?.[karta.ini] || 0;
  if (odpowiedzId === 'odloz') {
    d.odlozenia = d.odlozenia || {};
    d.odlozenia[karta.ini] = odlozenia + 1;
    d.pilnoscExtra[karta.ini] = (d.pilnoscExtra[karta.ini] || 0) + 0.3;
    d.karencja[karta.ini] = k.st.m + 1;           // wróci szybko
    k.zrobione.delete(`${d.id}:${karta.ini}`);
    d.plan = karta.ini;
  }
  if (odpowiedzId === 'odmowa') { d.zmeczenie = przytnij(d.zmeczenie + 0.15); d.poOdmowie = karta.ini; }
  // Statystyka dla Indeksu Odporności (składowa „biznes"): ile próśb zablokowano.
  const sd = k.statDzialow || (k.statDzialow = { pytania: 0, zablokowane: 0 });
  if (odpowiedzId !== 'odloz' || !odlozenia) sd.pytania++;
  sd.zablokowane += { odmowa: 1, alternatywa: 0.5, odloz: 0.5 }[odpowiedzId] || 0;
  // Blokowanie biznesu ma cenę polityczną: kierownik działu idzie z tym do prezesa,
  // a wskaźnik działu się pogarsza. Zgoda — odwrotnie (małe plusy).
  let polityka = { zgoda: 0.25, warunki: 0, alternatywa: -0.5, odmowa: -1.5, odloz: odlozenia ? -1.5 : -0.5 }[odpowiedzId] || 0;
  // Zgody nie „farmią" mandatu: najwyżej +0,5 na miesiąc z wszystkich działów razem
  // (przypadek brzegowy: potakiwacz miał najwyższy mandat w grze, mimo 2× większych strat).
  if (polityka > 0) {
    polityka = Math.min(polityka, Math.max(0, 0.5 - (k.mandatZDzialow || 0)));
    k.mandatZDzialow = (k.mandatZDzialow || 0) + polityka;
  }
  if (k.wskazniki) k.wskazniki.mandat = Math.max(0, Math.min(100, k.wskazniki.mandat + polityka));
  if (odpowiedzId === 'odmowa' || odpowiedzId === 'odloz') d.kpiDodatek = (d.kpiDodatek || 0) + 1;
  ucz(d, 'pytaj', r);
  d.zdarzeniaOkresu.push({ rodzaj: 'odpowiedz', ini: karta.ini, odpowiedz: odpowiedzId });
  return r;
}

// Gracz odkrył obejście i coś z nim zrobił (sprawa „odkrycie", proto/sprawy.js):
//   legalizacja (z warunkami) · wylaczenie (bez szukania winnych) · kara · akceptacja · zostaw
function odpowiedzOdkrycie(k, karta, odpowiedzId, { ulamki = null, zwrotNieznanych = 1 } = {}) {
  const d = k.dzialy[karta.dzial];
  d.ukryte = d.ukryte.filter(u => u !== karta.obej && !(u.ini === karta.obej.ini && u.m === karta.obej.m));
  const klucz = `${d.id}:${karta.ini}`;
  if (odpowiedzId === 'legalizacja') {
    // Ryzyko spada do tego, co zostaje po wybranych warunkach; urządzenia wchodzą do ewidencji.
    ustawRyzyko(k, klucz, 1, 'legalizacja', ulamki, zwrotNieznanych);
    ucz(d, 'obejdz', NAGRODY.legalizacja);
    d.zaufanie = przytnij(d.zaufanie + 0.05);
  } else if (odpowiedzId === 'wylaczenie') {
    // Wyłączone, ale z rozmową: dział nie jest ukarany, potrzeba zostaje (wróci jako prośba).
    ustawRyzyko(k, klucz, 0);
    ucz(d, 'obejdz', NAGRODY.wylaczenie);
    d.zaufanie = przytnij(d.zaufanie - 0.03);
    d.pilnoscExtra[karta.ini] = (d.pilnoscExtra[karta.ini] || 0) + 0.3;
    k.zrobione.delete(`${d.id}:${karta.ini}`); d.karencja[karta.ini] = k.st.m + 1;
  } else if (odpowiedzId === 'akceptacja') {
    // Zarząd przyjmuje ryzyko: obejście zostaje, ale ma właściciela.
    ucz(d, 'obejdz', NAGRODY.legalizacja);
    d.zaufanie = przytnij(d.zaufanie + 0.02);
    if (k.ryzyka[klucz]) k.ryzyka[klucz].zrodlo = 'akceptacja';
  } else if (odpowiedzId === 'kara') {
    ustawRyzyko(k, klucz, 0);
    ucz(d, 'obejdz', NAGRODY.kara);
    d.zaufanie = przytnij(d.zaufanie - 0.2);
    for (const inny of Object.values(k.dzialy)) if (inny !== d) inny.zaufanie = przytnij(inny.zaufanie - 0.05);
  }
}

// Co okres: obejścia, których nikt nie zauważył, „opłacają się" działowi; świadomość wietrzeje.
function koniecOkresu(k) {
  for (const d of Object.values(k.dzialy)) {
    for (const u of d.ukryte) if (u.m === k.st.m - 1) ucz(d, 'obejdz', NAGRODY.obejscie_niewykryte);
    d.swiadomosc = d.swiadomoscBazowa + (d.swiadomosc - d.swiadomoscBazowa) * 0.93;
    d.zmeczenie = przytnij(d.zmeczenie * 0.85 + 0.01 * (k.tarcie || 0) / 10);
  }
}

// Incydent wszedł drogą, którą otworzył dział — największa lekcja, także dla działu.
function incydentPrzezDzial(k, wektor) {
  for (const d of Object.values(k.dzialy)) {
    const winne = d.ukryte.find(u => INICJATYWY[u.ini].ryzyko?.wektory?.[wektor]);
    if (winne) {
      ucz(d, 'obejdz', NAGRODY.incydent);
      d.swiadomosc = przytnij(d.swiadomosc + 0.3);
      d.pamiec.push({ m: k.st.m, tekst: `incydent przyszedł przez ${INICJATYWY[winne.ini].nazwa}` });
      return { dzial: d.id, ini: winne.ini, zrodlo: 'obejscie' };
    }
  }
  // Wejście przez ryzyko, na które GRACZ się zgodził bez warunków — to też trzeba nazwać.
  for (const [klucz, r] of Object.entries(k.ryzyka)) {
    if (r.zrodlo === 'zgoda' && r.wektory[wektor]) {
      const [dzial, ini] = klucz.split(':');
      return { dzial, ini, zrodlo: 'zgoda' };
    }
  }
  return null;
}

// Obciążenie działu w danym miesiącu kalendarzowym + skutki ostatnich incydentów.
function ustawObciazenie(k) {
  for (const d of Object.values(k.dzialy)) {
    d.obciazenieBiezace = przytnij((d.obciazenie?.[k.miesiacKal] || 0) + (d.dodatkoweObciazenie || 0));
    d.dodatkoweObciazenie = (d.dodatkoweObciazenie || 0) * 0.5;
  }
}

// ── RAPORT DZIAŁU (szablony; docs/15-…, 15.5) ──
function raport(k, d) {
  const rnd = k.rnd.dzialy;
  const lin = [];
  const kpi = Math.max(0, Math.round(d.kpi.baza * (1 + d.obciazenieBiezace) * (0.7 + rnd() * 0.6) + (d.kpiDodatek || 0)));
  d.kpiDodatek = 0;
  const obc = d.obciazenieBiezace > 0.35 ? 'wysokie' : d.obciazenieBiezace > 0.15 ? 'podwyższone' : 'normalne';
  lin.push(`W tym miesiącu: ${d.kpi.nazwa} — ${kpi} (zwykle ~${d.kpi.baza}). Obciążenie: ${obc}.`);

  for (const z of d.zdarzeniaOkresu) {
    const ini = INICJATYWY[z.ini];
    if (z.rodzaj === 'odpowiedz') {
      const t = { zgoda: `Uruchomiliśmy: ${ini.nazwa}. Dziękujemy za szybką zgodę.`,
        warunki: `Uruchamiamy ${ini.nazwa} na Waszych warunkach.`,
        alternatywa: `Zamiast „${ini.nazwa}" robimy: ${ini.alternatywa}. Nie do końca to, czego chcieliśmy.`,
        odmowa: `Nie dostaliśmy zgody na ${ini.nazwa}. Szukamy innej drogi.`,
        odloz: `Dalej czekamy na decyzję w sprawie: ${ini.nazwa}.` }[z.odpowiedz];
      if (t) lin.push(t);
    }
  }
  // Szczerość zależy od zaufania: obejścia z tego okresu.
  for (const u of d.ukryte.filter(x => x.m === k.mZamkniety)) {
    const ini = INICJATYWY[u.ini];
    if (d.zaufanie >= PROG_SZCZEROSCI) lin.push(`Przyznajemy: zrobiliśmy „${ini.nazwa}" bez konsultacji — było pilne.`);
    else if (d.zaufanie >= PROG_ZAPOWIEDZI) lin.push('Wprowadziliśmy drobne usprawnienia w narzędziach pracy.');
  }
  if (d.plan && d.zaufanie >= PROG_ZAPOWIEDZI) {
    lin.push(`W przyszłym miesiącu planujemy: ${INICJATYWY[d.plan].nazwa}.`);
    d.zapowiedzialo = d.plan;
  } else d.zapowiedzialo = null;

  const z = d.zaufanie, zm = d.zmeczenie;
  lin.push(zm > 0.35 ? 'Mamy dość ciągłych ograniczeń — praca idzie wolniej.'
    : z >= 0.7 ? 'Współpraca z bezpieczeństwem układa się dobrze.'
      : z >= 0.45 ? 'Z bezpieczeństwem jakoś się dogadujemy.'
        : z >= 0.25 ? 'Wolimy nie zawracać IT głowy drobiazgami.'
          : 'Bezpieczeństwo kojarzy nam się głównie z „nie".');
  d.zdarzeniaOkresu = [];
  return { naglowek: `${d.nazwa} — ${d.szef}`, linie: lin };
}

// Sygnały: dział z wysoką świadomością zgłasza dziwne rzeczy, które są śladami intruzów.
// To jedyna droga, którą gracz bez narzędzi może zobaczyć intruza (docs/15-…, 15.5).
function sygnaly(k) {
  const rnd = k.rnd.dzialy;
  const out = [];
  const dz = Object.values(k.dzialy);
  for (const x of k.st.intruzi) {
    if (x.etap === 'cel' || x.zgloszony) continue;
    for (const d of dz) {
      if (rnd() < d.swiadomosc * 0.12) {
        x.zgloszony = true;
        out.push({ dzial: d.id, intruz: x, tekst: SYGNALY[x.wektor] || 'Komputer w dziale dziwnie zwolnił i sam się restartuje.' });
        break;
      }
    }
  }
  return out;
}
const SYGNALY = {
  phishing: 'Ktoś dostał maila z „fakturą", otworzył załącznik i nic się nie stało — ale komputer od tego czasu dziwnie działa.',
  poswiadczenia: 'Przyszło powiadomienie o logowaniu do poczty z innego kraju. Nikt z nas tam nie był.',
  podatnosc: 'Router w biurze sam się zrestartował w nocy, a hasło administratora „przestało działać".',
  uslugi: 'Na panelu stacji ktoś był zalogowany w nocy, a operator nic nie robił.',
  dostawca: 'Integrator łączył się w niedzielę o 3:00. Twierdzi, że to nie on.',
  insider: 'Ktoś z działu kopiował duże ilości plików na pendrive po godzinach.',
};

module.exports = {
  INICJATYWY, noweDzialy, zaplanuj, wykonajPlan, odpowiedz,
  odpowiedzOdkrycie, koniecOkresu, incydentPrzezDzial, ustawObciazenie, raport, sygnaly,
  SYGNALY, zastosujRyzyko, ustawRyzyko, mnozniki, dodajNieznane, ciezarRyzyka, przytnij,
};
