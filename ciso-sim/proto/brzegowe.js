// ── LABORATORIUM PRZYPADKÓW BRZEGOWYCH ──
// „Test penetracyjny" własnej gry: automaty z celowo głupimi albo cwanymi strategiami
// i sprawdzanie niezmienników. Pytania: czy da się grę oszukać? czy absurdalna gra daje
// absurdalny (a nie dobry) wynik? czy coś wycieka zza mgły wojny? czy liczby się nie rozjeżdżają?
//   node ciso-sim/proto/brzegowe.js [liczba_ziaren]
// Wyniki i decyzje: docs/17-przypadki-brzegowe.md.

const K = require('./kampania');
const D = require('./dzialy');
const S = require('./silnik');
const KONTROLE = require('../data/kontrole');

const dobra = c => Math.max(0, c.opcje.findIndex(o => o.ocena === 'dobra'));
const odp = (c, x) => c.opcje.findIndex(o => o.odpowiedz === x);
const koszt = o => (o.pln || 0) + 300 * (o.h || 0);

const STRATEGIE = {
  // Punkty odniesienia.
  rozsadny: K.AUTO.rozsadny,
  madry: K.AUTO.madry,
  // „Tak" na wszystko, co mówią działy; w kartach — opcja najmilsza zarządowi (mandat).
  potakiwacz: {
    karta: c => {
      if (c.zrodlo === 'dzial') return odp(c, 'zgoda');
      if (c.zrodlo === 'odkrycie') return odp(c, 'zostaw');
      // Przy remisie — dobra opcja: potakiwacz ma testować uprzejmość, nie kłamać przypadkiem.
      let best = dobra(c);
      c.opcje.forEach((o, j) => { if ((o.mandat || 0) > (c.opcje[best].mandat || 0)) best = j; });
      return best;
    },
    scen: o => Math.max(0, o.findIndex(x => x.ocena === 'dobra')),
  },
  // Kupuje cały katalog w pierwszym miesiącu.
  wszystko_naraz: {
    miesiac: k => { if (k.st.m === 1) for (const x of KONTROLE) K.zlecRecznie(k, x.id); },
    karta: c => (c.zrodlo === 'dzial' ? odp(c, 'warunki') : dobra(c)),
    scen: o => Math.max(0, o.findIndex(x => x.ocena === 'dobra')),
  },
  // Wszystko „odłóż", poza obowiązkowymi (pierwsza opcja).
  odkladacz: {
    karta: c => (c.zrodlo === 'dzial' ? odp(c, 'odloz') : c.obowiazkowa ? 0 : null),
    scen: () => 0,
  },
  // Wybiera najtańszą opcję (PLN + godziny), wszystko inne jak rozsądny.
  skapiec: {
    karta: c => { let b = 0; c.opcje.forEach((o, j) => { if (koszt(o) < koszt(c.opcje[b])) b = j; }); return b; },
    scen: o => { let b = 0; o.forEach((x, j) => { if ((x.h || 0) < (o[b].h || 0)) b = j; }); return b; },
  },
  // Kłamie, gdzie się da (ankieta ubezpieczeniowa, wyjątki, papier zamiast procesu).
  klamca: {
    karta: c => {
      const kl = c.opcje.findIndex(o => o.flagi && (o.flagi.klamstwo_ankieta || o.flagi.wyjatek_mfa_zarzad || o.flagi.polityki_z_pudelka));
      if (kl >= 0) return kl;
      return c.zrodlo === 'dzial' ? odp(c, 'warunki') : dobra(c);
    },
    scen: o => Math.max(0, o.findIndex(x => x.ocena === 'dobra')),
  },
  // „Tak, ale bezpiecznie" ZAWSZE — także gdy to kosztuje 200 h w miesiącu, który ma 40 h.
  pracoholik: {
    karta: c => (c.zrodlo === 'dzial' ? odp(c, 'warunki') : (() => { let b = dobra(c); c.opcje.forEach((o, j) => { if ((o.h || 0) > (c.opcje[b].h || 0)) b = j; }); return b; })()),
    scen: o => Math.max(0, o.findIndex(x => x.ocena === 'dobra')),
  },
  // Bada każdy sygnał i nic poza tym (czy sygnały zdradzają prawdę?).
  paranoik: {
    karta: c => (c.zrodlo === 'sygnal' ? 0 : c.obowiazkowa ? dobra(c) : null),
    scen: o => Math.max(0, o.findIndex(x => x.ocena === 'dobra')),
  },
  // Losowe wszystko + losowe zakupy (fuzzing niezmienników).
  losowy: (() => {
    let r = S.mulberry32(99);
    return {
      reset: seed => { r = S.mulberry32(seed * 7919); },
      miesiac: k => { if (r() < 0.3) K.zlecRecznie(k, KONTROLE[Math.floor(r() * KONTROLE.length)].id); },
      karta: c => (r() < 0.2 && !c.obowiazkowa ? null : Math.floor(r() * c.opcje.length)),
      scen: o => Math.floor(r() * o.length),
    };
  })(),
};

// Niezmienniki — każde naruszenie to błąd modelu, nie „ciekawy wynik".
function sprawdz(k, nazwa, seed) {
  const bledy = [];
  const liczby = { ...k.wskazniki, straty: k.st.w.straty, wydatki: k.st.w.wydatki, znane: k.st.znane };
  for (const [n, v] of Object.entries(liczby)) if (!Number.isFinite(v)) bledy.push(`${n} = ${v}`);
  for (const n of ['mandat', 'reputacja', 'morale']) if (k.wskazniki[n] < 0 || k.wskazniki[n] > 100) bledy.push(`${n} poza 0–100`);
  if (k.st.znane <= 0 || k.st.znane > 1) bledy.push(`znane = ${k.st.znane}`);
  if (k.st.w.straty < 0 || k.st.w.wydatki < 0) bledy.push('ujemne straty/wydatki');
  for (const [w, v] of Object.entries(k.st.mod.wektory)) if (v > 4 || v < 0.1) bledy.push(`mnożnik ${w} = ${v.toFixed(2)}`);
  for (const d of Object.values(k.dzialy)) {
    for (const n of ['zaufanie', 'swiadomosc', 'zmeczenie']) if (!(d[n] >= 0 && d[n] <= 1)) bledy.push(`${d.id}.${n} = ${d[n]}`);
  }
  return bledy.map(b => `[${nazwa} #${seed}] ${b}`);
}

async function main() {
  const N = Number(process.argv[2] || 10);
  const cicho = () => {};
  const wszystkieBledy = [];
  console.log('strategia        straty  wydatki  audyt mandat rep morale zauf. ukryte  maxMnoż  h/mies(maks)  karty/mies(maks)  JD   odwołany  sufit  INDEKS  WYNIK');
  for (const [nazwa, strat] of Object.entries(STRATEGIE)) {
    const a = { straty: 0, wyd: 0, audyt: 0, man: 0, rep: 0, mor: 0, zauf: 0, ukr: 0, mnoz: 0, h: 0, karty: 0, jd: 0, odw: 0, io: 0, sufit: 0, wk: 0 };
    for (let seed = 1; seed <= N; seed++) {
      strat.reset?.(seed);
      let maxH = 0, maxKart = 0;
      const obs = { ...strat, karta: (c, k) => { maxKart = Math.max(maxKart, k.karty.length); return strat.karta(c, k); } };
      const oryg = K.zamknijMiesiac;
      let k;
      try {
        k = await K.grajAuto({ ...obs, miesiac: kk => { maxH = Math.max(maxH, kk.hKart); strat.miesiac?.call(strat, kk); } }, seed, false, cicho, false);
      } catch (e) { wszystkieBledy.push(`[${nazwa} #${seed}] WYJĄTEK: ${e.message}`); continue; }
      maxH = Math.max(maxH, ...k.decyzje.map(() => 0));
      wszystkieBledy.push(...sprawdz(k, nazwa, seed));
      const dz = Object.values(k.dzialy);
      a.straty += k.st.w.straty; a.wyd += k.st.w.wydatki; a.audyt += k.kontrola?.wynik || 0;
      a.man += k.wskazniki.mandat; a.rep += k.wskazniki.reputacja; a.mor += k.wskazniki.morale;
      a.zauf += dz.reduce((x, d) => x + d.zaufanie, 0) / dz.length;
      a.ukr += dz.reduce((x, d) => x + d.ukryte.filter(u => !u.odkryte).length, 0);
      a.mnoz = Math.max(a.mnoz, ...Object.values(k.st.mod.wektory), 1);
      a.h = Math.max(a.h, k.maxHKart || 0);
      a.karty = Math.max(a.karty, maxKart);
      a.jd += K.jakoscDecyzji(k);
      a.odw += k.wskazniki.mandat <= 0 ? 1 : 0;
      const io = await K.indeksOdpornosci(k);
      a.io += io.wynik; a.wk += io.kampania; a.sufit += io.bramki.length ? 1 : 0;
    }
    const t = v => (v / N / 1000).toFixed(0).padStart(6) + 'k';
    console.log(nazwa.padEnd(15), t(a.straty), t(a.wyd), (a.audyt / N).toFixed(0).padStart(5), (a.man / N).toFixed(0).padStart(6),
      (a.rep / N).toFixed(0).padStart(3), (a.mor / N).toFixed(0).padStart(6), (a.zauf / N).toFixed(2).padStart(5), (a.ukr / N).toFixed(1).padStart(6),
      a.mnoz.toFixed(2).padStart(8), String(Math.round(a.h)).padStart(13), String(a.karty).padStart(17),
      ((100 * a.jd) / N).toFixed(0).padStart(4) + '%', `${a.odw}/${N}`.padStart(8), `${a.sufit}/${N}`.padStart(6), String(Math.round(a.io / N)).padStart(7), String(Math.round(a.wk / N)).padStart(6));
  }
  console.log(wszystkieBledy.length ? `\nNARUSZENIA NIEZMIENNIKÓW (${wszystkieBledy.length}):\n${[...new Set(wszystkieBledy)].slice(0, 40).join('\n')}` : '\nNiezmienniki: OK');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { STRATEGIE, sprawdz };
