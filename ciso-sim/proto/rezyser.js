// ── REŻYSER (diagnoza, model gracza, rytm, przeciwnik adaptacyjny) ──
// Projekt: docs/15-dzialy-i-rezyser.md, 15.6. Reżyser zna PRAWDĘ (silnik), ale gracz widzi
// tylko jego wybory — obserwacje, sprawy i zdarzenia. Zasady: deterministyczny (własny strumień
// losowości), wyjaśnialny (każdy wybór ma powód w rejestrze), uczciwy (nie rusza skuteczności
// kontroli gracza; wybiera tylko spośród prawdopodobnych zdarzeń i ich moment w oknie).

const S = require('./silnik');

const CELE = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12'];
// Bayesian Knowledge Tracing — parametry jak w klasycznych systemach tutorskich.
const BKT = { start: 0.2, s: 0.1, g: 0.2, l: 0.15 };
// Waga skutku wektora dla diagnozy (wodociągi: usługi wystawione = sterowanie procesem).
const WAGA_WEKTORA = { phishing: 1, poswiadczenia: 1, podatnosc: 1.2, uslugi: 1.6, dostawca: 1.3, insider: 0.8, bec: 1, ddos: 0.3 };
const ETA_PRZECIWNIKA = 0.8;

function nowyRezyser() {
  return {
    napiecie: 0,
    spokojneMiesiace: 0,
    bkt: Object.fromEntries(CELE.map(c => [c, BKT.start])),
    ostatnioCel: {},                 // cel → miesiąc ostatniego sprawdzenia (odstępy)
    wagi: {},                        // przeciwnik: wektor → waga (start 1)
    odpalone: new Set(),             // zdarzenia skryptowe, które już były
    pominiete: new Set(),            // zdarzenia, którym nie wypadła szansa
    uzyteObserwacje: {},             // obserwacja → miesiąc pokazania
    diagnoza: [],
  };
}

// ── DIAGNOZA: „aktualny problem firmy" z prawdziwego stanu ──
function diagnoza(k) {
  const st = k.st;
  const presja = S.presjaWektorow(st);
  const p = [];
  for (const [w, v] of Object.entries(presja)) {
    // v = oczekiwane udane dostępy / mies. → przeliczone na „rocznie" i ważone skutkiem
    p.push({ id: w, wynik: v * 12 * (WAGA_WEKTORA[w] || 1), powod: `${(v * 12).toFixed(2)} udanych dostępów/rok (${w})` });
  }
  const dziala = id => S.dziala(st, id);
  const zam = id => st.zamowione.has(id);
  if (!dziala('backup') && !zam('backup')) {
    p.push({ id: 'odtwarzanie', wynik: 0.25 * st.firma.koszt_dnia / 60000, powod: 'brak kopii offline przy kosztownym przestoju' });
  }
  if (!dziala('edr') && !dziala('mdr')) {
    const intruzi = st.intruzi.filter(x => x.etap !== 'dostep').length;
    p.push({ id: 'wykrywanie', wynik: 0.2 + 0.25 * intruzi, powod: `brak wykrywania; intruzi poza etapem dostępu: ${intruzi}` });
  }
  if (!k.flagi.wpis && st.m <= 7) p.push({ id: 'zgodnosc', wynik: 0.15 * st.m, powod: 'brak wpisu do wykazu, termin 3.10.2026' });
  if (!zam('szbi') && st.m >= 5 && st.m <= 13) p.push({ id: 'zgodnosc', wynik: 0.1 * (st.m - 3), powod: 'SZBI niewdrożony, termin 3.04.2027' });
  const ukryte = Object.values(k.dzialy).reduce((a, d) => a + d.ukryte.length, 0);
  if (ukryte) p.push({ id: 'dostawcy', wynik: 0.12 * ukryte, powod: `${ukryte} obejść działów, o których nie wiesz` });
  if (k.wskazniki.morale < 40) p.push({ id: 'ludzie', wynik: 0.6, powod: 'niskie morale zespołu' });
  p.sort((a, b) => b.wynik - a.wynik);
  k.rezyser.diagnoza = p;
  return p;
}

const opanowanie = (r, cele) => (cele?.length ? cele.reduce((a, c) => a + (r.bkt[c] ?? BKT.start), 0) / cele.length : 0.5);

// Model gracza: aktualizacja po ocenionej decyzji (dobra = poprawna odpowiedź).
function poDecyzji(k, cele, ocena) {
  const r = k.rezyser;
  for (const c of cele || []) {
    if (!(c in r.bkt)) continue;
    const P = r.bkt[c];
    const dobrze = ocena === 'dobra';
    const pp = dobrze ? (P * (1 - BKT.s)) / (P * (1 - BKT.s) + (1 - P) * BKT.g)
      : ocena === 'blad' ? (P * BKT.s) / (P * BKT.s + (1 - P) * (1 - BKT.g)) : P;
    r.bkt[c] = pp + (1 - pp) * BKT.l;
    r.ostatnioCel[c] = k.st.m;
  }
}

// ── PLAN MIESIĄCA: zdarzenia skryptowe + obserwacje ──
function zaplanujMiesiac(k) {
  const r = k.rezyser;
  const rnd = k.rnd.rezyser;
  const m = k.st.m;
  const def = k.def;
  const zdarzenia = [];
  const powody = [];

  // 1) Zdarzenia skryptowe — moment w oknie zależy od rytmu.
  let ciezkieWMiesiacu = 0;
  for (const z of def.zdarzenia) {
    if (r.odpalone.has(z.id) || r.pominiete.has(z.id)) continue;
    const [od, doM] = z.okno;
    if (m < od || m > doM) continue;
    if (z.warunek && !z.warunek(k)) { r.pominiete.add(z.id); continue; }
    if (z.szansa !== undefined && m === od && rnd() >= z.szansa) {
      r.pominiete.add(z.id); powody.push(`${z.id}: nie wypadło (szansa ${z.szansa})`); continue;
    }
    let teraz, powod;
    if (m === doM) { teraz = true; powod = 'koniec okna'; }
    else if (r.napiecie > 1.2) { teraz = false; powod = `napięcie ${r.napiecie.toFixed(2)} — przesuwam w oknie`; }
    else if (r.spokojneMiesiace >= 2) { teraz = true; powod = '2 spokojne miesiące — przyspieszam'; }
    else if (ciezkieWMiesiacu + (z.ciezar || 0) > 1.2) { teraz = false; powod = 'w tym miesiącu już jest ciężkie zdarzenie'; }
    else { teraz = rnd() < 1 / (doM - m + 1) + 0.15; powod = teraz ? 'losowo w oknie' : 'czeka w oknie'; }
    powody.push(`${z.id}: ${teraz ? 'TERAZ' : 'później'} (${powod})`);
    if (teraz) {
      r.odpalone.add(z.id);
      ciezkieWMiesiacu += z.ciezar || 0;
      zdarzenia.push(z);
    }
  }

  // 2) Obserwacje (informacja, nie pytanie — docs/18-…): wymuszone w pierwszym miesiącu okna +
  //    najwyżej dwie wybrane według diagnozy aktualnego problemu i słabych celów gracza.
  const obserwacje = [];
  const diag = diagnoza(k);
  const top = diag[0]?.wynik || 1;
  const trafnosc = o => Math.max(0, ...diag.filter(p => o.problemy?.includes(p.id)).map(p => p.wynik / top));
  const kandydaci = [];
  for (const [id, o] of Object.entries(def.obserwacje || {})) {
    if (r.uzyteObserwacje[id] !== undefined) continue;
    const [od, doM] = o.okno;
    if (m < od || m > doM || (o.warunek && !o.warunek(k))) continue;
    if (o.wymuszona) { if (m === od) obserwacje.push({ id, powod: 'wymuszona w oknie' }); continue; }
    const odstep = (o.cele || []).some(e => r.ostatnioCel[e] !== undefined && m - r.ostatnioCel[e] < 2) ? 0.5 : 1;
    const wynik = (0.5 * trafnosc(o) + 0.3 * (1 - opanowanie(r, o.cele)) + 0.2 * (m === doM ? 1 : rnd())) * odstep;
    kandydaci.push({ id, wynik, powod: `trafność ${trafnosc(o).toFixed(2)}, opanowanie celów ${opanowanie(r, o.cele).toFixed(2)}` });
  }
  kandydaci.sort((a, b) => b.wynik - a.wynik);
  for (const o of kandydaci.slice(0, Math.max(0, 2 - obserwacje.length))) obserwacje.push(o);
  for (const o of obserwacje) r.uzyteObserwacje[o.id] = m;

  k.log('rezyser', `Diagnoza: ${diag.slice(0, 3).map(p => `${p.id} (${p.wynik.toFixed(2)}: ${p.powod})`).join('; ') || '—'}`);
  for (const p of powody) k.log('rezyser', `Zdarzenie ${p}`);
  for (const o of obserwacje) k.log('rezyser', `Obserwacja ${o.id}: ${o.powod}`);
  return { zdarzenia, obserwacje };
}

// ── PO MIESIĄCU: rytm i przeciwnik ──
function poMiesiacu(k, intensywnosc) {
  const r = k.rezyser;
  r.napiecie = 0.6 * r.napiecie + intensywnosc;
  r.spokojneMiesiace = intensywnosc < 0.3 ? r.spokojneMiesiace + 1 : 0;

  // Przeciwnik: wektory, które działały, dostają więcej prób (wagi mnożnikowe, sufit 0,5–2).
  // Skuteczność wygładzona (a priori ~1% przy 10 pseudo-próbach): przy 1 udanej na 2 próby
  // waga skakała od razu do maksimum — przeciwnik reagował na szum, nie na słabość.
  const proby = k.st.ostatni?.proby || {};
  const skut = Object.entries(proby).filter(([, [n]]) => n > 0).map(([w, [n, u]]) => [w, (u + 0.1) / (n + 10)]);
  // Zapominanie: bez nowych dowodów wagi wracają w stronę 1 (napastnicy też zmieniają cele).
  for (const w of Object.keys(r.wagi)) r.wagi[w] = Math.pow(r.wagi[w], 0.9);
  if (skut.length) {
    const sr = skut.reduce((a, [, s]) => a + s, 0) / skut.length;
    for (const [w, s] of skut) r.wagi[w] = Math.min(2, Math.max(0.5, (r.wagi[w] ?? 1) * Math.exp(ETA_PRZECIWNIKA * (s - sr))));
  }
  // Rekonesans: rzeczy widoczne z internetu, o których gracz nie wie, napastnicy znajdują od razu.
  const ukryteUslugi = Object.values(k.dzialy).some(d => d.ukryte.some(u => ['modemy_4g', 'zdalny_integrator', 'kamera_tania'].includes(u.ini)));
  if (ukryteUslugi) r.wagi.uslugi = Math.min(2, (r.wagi.uslugi ?? 1) * 1.15);
  // Normalizacja do średniej 1 — przeciwnik zmienia, GDZIE próbuje, nie ILE.
  const ws = Object.keys(r.wagi);
  if (ws.length) {
    const sr = ws.reduce((a, w) => a + r.wagi[w], 0) / ws.length;
    // Po normalizacji jeszcze raz sufit — inaczej dzielenie przez średnią < 1 wypychało wagę ponad 2.
    for (const w of ws) r.wagi[w] = Math.min(2, Math.max(0.5, r.wagi[w] / sr));
  }
  const opis = ws.filter(w => Math.abs(r.wagi[w] - 1) > 0.1).map(w => `${w} ×${r.wagi[w].toFixed(2)}`).join(', ');
  if (opis) k.log('rezyser', `Przeciwnik przesuwa próby: ${opis}`);
}

module.exports = { CELE, nowyRezyser, diagnoza, poDecyzji, zaplanujMiesiac, poMiesiacu, opanowanie };
