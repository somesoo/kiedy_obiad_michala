// ── LABORATORIUM PRZYPADKÓW BRZEGOWYCH (silnik ruchów) ──
// „Test penetracyjny" własnej gry: automaty z celowo głupimi albo cwanymi strategiami
// i sprawdzanie niezmienników. Pytania: czy da się grę oszukać? czy absurdalna gra daje
// absurdalny (a nie dobry) wynik? czy coś wycieka zza mgły wojny? czy liczby się nie rozjeżdżają?
// Fuzzer („losowy") gra losowymi ruchami z losowymi parametrami — przy pełnej dowolności ruchów
// to on pilnuje, że żadna kombinacja nie rozsypuje modelu.
//   node ciso-sim/proto/brzegowe.js [liczba_ziaren]
// Wyniki i decyzje: docs/17-przypadki-brzegowe.md.

const K = require('./kampania');
const S = require('./silnik');
const RU = require('./ruchy');
const SP = require('./sprawy');
const I = require('./incydent');
const KONTROLE = require('../data/kontrole');

// Mądry z podmienionymi odpowiedziami (sprawy) i dodatkowymi ruchami.
const zMadrego = ({ sprawa, ruchy, filtr, playbook } = {}) => ({
  ruchy: (k, A) => {
    const A2 = filtr ? { ...A, ruch: (id, p = {}) => { const r = filtr(id, p, k); return r ? A.ruch(r[0], r[1]) : null; } } : A;
    K.madreRuchy(k, A2);
    ruchy?.(k, A2);
  },
  sprawa: (k, s, A) => (sprawa && sprawa(k, s, A)) || K.madraSprawa(k, s, A),
  incydent: (k, A) => {
    const inc = k.incydent;
    const plan = playbook ? playbook(inc.id, inc.s, K.PLAYBOOK[inc.id](inc.s)) : K.PLAYBOOK[inc.id](inc.s);
    for (const a of plan) { if (!k.incydent) return; A.inc(a); }
  },
});

const STRATEGIE = {
  // Punkty odniesienia.
  madry: K.AUTO.madry,
  rozsadny: K.AUTO.rozsadny,
  // Robi to, co miłe zarządowi i działom: wyjątki dla zarządu, zgoda na wszystko, akceptacja
  // zamiast porządków, przejęcie od razu — i dokumenty „z datami wstecz", bo zarząd prosi.
  potakiwacz: zMadrego({
    filtr: (id, p) => (id === 'wdroz:mfa' ? [id, { ...p, zakres: 'bez_zarzadu' }] : id === 'wdroz:segmentacja' ? null : [id, p]),
    ruchy: (k, A) => { if (k.flagi.audyt_zapowiedziany) A.ruch('dokumenty_wstecz'); },
    sprawa: (k, s) => (s.rodzaj === 'prosba' ? { v: 'zgoda' } : s.rodzaj === 'odkrycie' ? { v: 'akceptuj' }
      : ({ S_budzet2027: { v: 'bez_wniosku' }, S_przejecie: { v: 'polacz' }, S_umowa_integratora: { v: 'przedluz' },
        S_wodomierze: { v: 'bez_udzialu' }, S_emerytura: { v: 'po_swojemu' } })[s.sid]),
  }),
  // Zamawia cały katalog w pierwszym miesiącu (domyślne parametry).
  wszystko_naraz: {
    ruchy: (k, A) => { if (k.st.m === 1) for (const x of KONTROLE) A.ruch(`wdroz:${x.id}`); },
    sprawa: K.madraSprawa, incydent: K.madryIncydent,
  },
  // Wszystko odkłada; sprawy rozstrzygają się same, incydenty toczą się bez niego.
  odkladacz: { sprawa: (k, s) => (s.rodzaj === 'prosba' ? { v: 'odloz' } : null) },
  // Tylko to, co nie kosztuje złotówek; najtańsze odpowiedzi.
  skapiec: {
    ruchy: (k, A) => {
      for (const x of KONTROLE) if (!x.wdrozenie.pln && !S.kosztMiesieczny(k.st, x.id)) A.ruch(`wdroz:${x.id}`);
      if (A.znany('hmi_wystawiony')) A.ruch('odetnij_hmi');
    },
    sprawa: (k, s, A) => (s.rodzaj === 'prosba' ? { v: 'alternatywa' } : s.rodzaj === 'odkrycie' ? { v: 'wylacz' } : s.rodzaj === 'sygnal' ? { v: 'zbadaj' }
      : ({ S_budzet2027: { v: 'bez_wniosku' }, S_przejecie: { v: 'odloz' }, S_umowa_integratora: { v: 'przedluz' }, S_ubezpieczenie: { v: 'odrzuc' },
        S_wodomierze: { v: 'bez_udzialu' }, S_emerytura: { v: 'po_swojemu' }, S_falszywy_komunikat: { v: 'dementi', p: { kanaly: 'strona' } }, S_noc_integrator: { v: 'odmow' } })[s.sid]),
    incydent: K.madryIncydent,
  },
  // Mądry, który kłamie: upiększone raporty, „tak" w ankiecie ubezpieczyciela, dokumenty wstecz.
  klamca: zMadrego({
    filtr: (id, p) => (id === 'raport_zarzadowi' ? [id, { styl: 'upiekszony' }] : [id, p]),
    ruchy: (k, A) => { if (k.flagi.audyt_zapowiedziany) A.ruch('dokumenty_wstecz'); },
    sprawa: (k, s) => (s.sid === 'S_ubezpieczenie' ? { v: 'ankieta', p: { mfa: 'tak', edr: 'tak', kopie: 'tak' } } : undefined),
  }),
  // Wszystko, co kosztuje godziny: polowanie, przeglądy co miesiąc, szkolenia działów.
  pracoholik: zMadrego({
    ruchy: (k, A) => {
      A.ruch('polowanie', { kto: 'sam' });
      for (const o of Object.values(k.obiekty)) if (o.stan === 'dziala') A.ruch(`przeglad:${o.id}`);
      for (const d of Object.keys(k.dzialy)) A.ruch('szkolenie_dzialu', { dzial: d });
    },
  }),
  // Szuka intruzów i bada każdy sygnał, poza tym nic.
  paranoik: {
    ruchy: (k, A) => A.ruch('polowanie', { kto: 'sam' }),
    sprawa: (k, s) => (s.rodzaj === 'sygnal' ? { v: 'zbadaj' } : null),
    incydent: K.madryIncydent,
  },
  // Laik, który kupuje wiedzę: sam nie wie, od czego zacząć, więc zleca doradcy test z internetu
  // i ocenę luk, a potem robi WYŁĄCZNIE to, co zaleca raport — od góry (dwie pozycje na miesiąc)
  // i obowiązki. Sprawy i incydenty prowadzi jak rozsądny laik. Pytanie: ile wart jest doradca
  // dla kogoś bez doświadczenia? (docs/18-…, 18.13)
  laik_z_doradca: {
    ruchy: (k, A) => {
      const m = k.st.m;
      if (m === 1) A.ruch('zlec_doradcy', { temat: 'ekspozycja', firma: 'lokalna', tryb: 'pilny' });
      if (m === 2) A.ruch('zlec_doradcy', { temat: 'ogolny', firma: 'lokalna', tryb: 'zwykly' });
      if (m === 11) A.ruch('zlec_doradcy', { temat: 'ogolny', firma: 'renomowana', tryb: 'zwykly' });
      let n = 0;
      for (const r of [...k.doradztwo.raporty].reverse()) {
        for (const c of [...r.obowiazki, ...r.rekomendacje]) {
          if (n >= 2) break;
          if (c.ruch && A.ruch(c.ruch, c.p || {})) n++;
        }
      }
    },
    sprawa: K.AUTO.rozsadny.sprawa,
    incydent: K.AUTO.rozsadny.incydent,
  },
  // Fuzzer: losowe ruchy, parametry, czasowniki i akcje w incydentach.
  losowy: (() => {
    let r = S.mulberry32(99);
    const los = a => a[Math.floor(r() * a.length)];
    const losParam = param => Object.fromEntries(Object.entries(param || {}).map(([n, w]) => [n, w?.length ? los(w) : undefined]));
    return {
      reset: seed => { r = S.mulberry32(seed * 7919); },
      ruchy: (k, A) => {
        for (let i = Math.floor(r() * 8); i > 0; i--) {
          const ruchy = RU.lista(k);
          const x = los(ruchy);
          const p = losParam(x.param);
          if (x.id.startsWith('zmien:')) delete p[los(Object.keys(p))];   // zmiana jednego, nie wszystkich
          A.ruch(x.id, p);
        }
      },
      sprawa: (k, s) => {
        if (r() < 0.3) return null;
        const cz = SP.czasowniki(k, s);
        const v = los(Object.keys(cz));
        const p = {};
        for (const [n, d] of Object.entries(cz[v].param || {})) {
          p[n] = d.wartosci ? los(d.wartosci) : d.lista ? d.lista.filter(() => r() < 0.5).join(',') || d.lista[0] : d.liczba ? Math.round(d.liczba[0] + r() * (d.liczba[1] - d.liczba[0])) : '';
        }
        return { v, p };
      },
      incydent: (k, A) => {
        for (let i = 0; i < 12 && k.incydent; i++) {
          if (r() < 0.15) { A.czekaj(1 + Math.floor(r() * 6)); continue; }
          A.inc(los(I.akcje(k)).id);
        }
      },
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
  // Konfiguracja kontroli w silniku: wszystko w [0, 1] — inaczej (1 − x) w silniku wychodzi ujemne.
  for (const [id, c] of Object.entries(k.st.konf)) {
    for (const v of [c.jakosc, c.utrudnia, c.wykrywa, c.odtwarzanie, ...Object.values(c.pokrycie)]) if (!(v >= 0 && v <= 1)) bledy.push(`konf ${id}: ${v}`);
    if (!S.dziala(k.st, id)) bledy.push(`konf ${id} dla niedziałającej kontroli`);
  }
  for (const o of Object.values(k.obiekty)) {
    if (o.stan === 'dziala' && !S.dziala(k.st, o.id) && o.dzialaOd !== null) bledy.push(`obiekt ${o.id} „działa", a silnik nie`);
    if (o.stan === 'wycofany' && S.dziala(k.st, o.id)) bledy.push(`obiekt ${o.id} wycofany, a silnik dalej go stosuje`);
  }
  if (k.incydent) bledy.push('kampania skończona z otwartym incydentem');
  return bledy.map(b => `[${nazwa} #${seed}] ${b}`);
}

async function main() {
  const N = Number(process.argv[2] || 10);
  const wszystkieBledy = [];
  console.log('strategia        straty  wydatki  audyt mandat rep morale zauf. ukryte  maxMnoż  awarie OT  praktyka odwołany  sufit  INDEKS  WYNIK');
  for (const [nazwa, strat] of Object.entries(STRATEGIE)) {
    const a = { straty: 0, wyd: 0, audyt: 0, man: 0, rep: 0, mor: 0, zauf: 0, ukr: 0, mnoz: 0, aw: 0, jd: 0, odw: 0, io: 0, sufit: 0, wk: 0 };
    for (let seed = 1; seed <= N; seed++) {
      let k;
      try { k = await K.grajAuto(strat, seed, false, () => {}, false); } catch (e) { wszystkieBledy.push(`[${nazwa} #${seed}] WYJĄTEK: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); continue; }
      wszystkieBledy.push(...sprawdz(k, nazwa, seed));
      const dz = Object.values(k.dzialy);
      const io = await K.indeksOdpornosci(k);
      a.straty += k.st.w.straty; a.wyd += k.st.w.wydatki; a.audyt += k.kontrola?.wynik || 0;
      a.man += k.wskazniki.mandat; a.rep += k.wskazniki.reputacja; a.mor += k.wskazniki.morale;
      a.zauf += dz.reduce((x, d) => x + d.zaufanie, 0) / dz.length;
      a.ukr += dz.reduce((x, d) => x + d.ukryte.filter(u => !u.odkryte).length, 0);
      a.mnoz = Math.max(a.mnoz, ...Object.values(k.st.mod.wektory), 1);
      a.aw += k.incydenty.filter(i => i.wlasna).length;
      a.jd += io.jd; a.odw += k.wskazniki.mandat <= 0 ? 1 : 0; a.io += io.wynik; a.wk += io.kampania; a.sufit += io.bramki.length ? 1 : 0;
    }
    const t = v => (v / N / 1000).toFixed(0).padStart(6) + 'k';
    console.log(nazwa.padEnd(15), t(a.straty), t(a.wyd), (a.audyt / N).toFixed(0).padStart(5), (a.man / N).toFixed(0).padStart(6),
      (a.rep / N).toFixed(0).padStart(3), (a.mor / N).toFixed(0).padStart(6), (a.zauf / N).toFixed(2).padStart(5), (a.ukr / N).toFixed(1).padStart(6),
      a.mnoz.toFixed(2).padStart(8), (a.aw / N).toFixed(1).padStart(10), ((100 * a.jd) / N).toFixed(0).padStart(8) + '%', `${a.odw}/${N}`.padStart(8),
      `${a.sufit}/${N}`.padStart(6), String(Math.round(a.io / N)).padStart(7), String(Math.round(a.wk / N)).padStart(6));
  }
  console.log(wszystkieBledy.length ? `\nNARUSZENIA NIEZMIENNIKÓW (${wszystkieBledy.length}):\n${[...new Set(wszystkieBledy)].slice(0, 40).join('\n')}` : '\nNiezmienniki: OK');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { STRATEGIE, sprawdz, zMadrego };
