// ── CENNIK ZŁYCH DECYZJI (dla każdej kampanii) ──
// Ile kosztuje JEDNO odstępstwo od dobrej praktyki w dobrej grze? Gracz mądry gra normalnie,
// a w jednym miejscu robi inaczej. Różnica Wyniku kampanii na tych samych ziarnach to „cena"
// tego odstępstwa (docs/17-…, 17.7–17.9; docs/20-…).
//
// Odstępstwa mają trzy źródła — dzięki temu każda nowa kampania dostaje cennik bez kodu:
//   1) OGÓLNE (tu): ruchy i rodzaje spraw, które są w każdej organizacji,
//   2) INCYDENT (plik incydentu, `odstepstwa`): błędy w prowadzeniu incydentu z osi kampanii;
//      także w grze „bez przygotowania do incydentu" (`przygotowanie` w pliku kampanii),
//      bo dobrze przygotowany gracz często ich w ogóle nie popełnia (atak zamienia się w próbę),
//   3) KAMPANIA (plik kampanii, `odstepstwa`): zła odpowiedź na każdą sprawę tej kampanii.
//   node ciso-sim/proto/cennik.js [liczba_ziaren] [--kampania=gmina]

const K = require('./kampania');
const I = require('./incydent');
const SP = require('./sprawy');
const KONTROLE = require('../data/kontrole');
// Leniwie: kontrakt kampanii (kampania.js) czyta stąd sprawyOdstepstwa, a brzegowe ładuje kampanię —
// import na górze dałby cykl i pusty zMadrego.
const zMadrego = o => require('./brzegowe').zMadrego(o);

const bez = (...ids) => (id, p) => (ids.some(x => id === x || (x.endsWith(':') && id.startsWith(x))) ? null : [id, p]);
const zamien = (cel, p2) => (id, p) => (id === cel ? [id, { ...p, ...p2 }] : [id, p]);

const OGOLNE = {
  'upiększone raporty dla zarządu': { filtr: (id, p) => (id === 'raport_zarzadowi' ? [id, { styl: 'upiekszony' }] : [id, p]) },
  'dokumenty z datą wsteczną': { ruchy: (k, A) => { if (k.flagi.audyt_zapowiedziany) A.ruch('dokumenty_wstecz'); } },
  'cały katalog zamówiony w 1. miesiącu': { ruchy: (k, A) => { if (k.st.m === 1) for (const x of KONTROLE) A.ruch(`wdroz:${x.id}`); } },
  'kopie nigdy nie testowane': { filtr: bez('test:backup') },
  'żadnych przeglądów ani testów': { filtr: bez('przeglad:', 'test:', 'napraw:') },
  'EDR zostaje w trybie „wykrywaj"': { filtr: bez('zmien:edr') },
  'MFA bez zarządu (bez akceptacji ryzyka)': { filtr: zamien('wdroz:mfa', { zakres: 'bez_zarzadu' }) },
  'SZBI z pudełka': { filtr: (id, p) => (id === 'wdroz:szbi' ? [id, { sposob: 'z_pudelka' }] : [id, p]) },
  'bez szkolenia kierownika': { filtr: bez('szkolenie_kierownika') },
  'bez rozpoznania (skan, obchód, dostępy, konta)': { filtr: bez('skan_ekspozycji', 'przeglad_ot', 'przeglad_dostepow', 'przeglad_kont', 'wdroz:moje_cert') },
  'odmowa każdej prośby działu': { sprawa: (k, s) => (s.rodzaj === 'prosba' ? { v: 'odmowa' } : undefined) },
  'kara za każde odkryte obejście': { sprawa: (k, s) => (s.rodzaj === 'odkrycie' ? { v: 'ukarz' } : undefined) },
  'sygnały od ludzi ignorowane': { sprawa: (k, s) => (s.rodzaj === 'sygnal' ? { v: 'zignoruj' } : undefined) },
  'koniec wsparcia: „zostawić jak jest"': { sprawa: (k, s) => (s.sid === 'C_eol' ? { v: 'zostaw' } : undefined) },
  'certyfikaty odnawiane ręcznie co rok': { sprawa: (k, s) => (s.sid === 'C_certyfikat' ? { v: 'odnow' } : undefined) },
  'umowy przedłużane bez negocjacji': { sprawa: (k, s) => (s.sid === 'C_odnowienie' ? { v: 'przedluz' } : undefined) },
  // Wniosek budżetowy: ta sama kwota co u mądrego, ale „bo NIS2 i hakerzy" zamiast ryzyka.
  'budżet „bo NIS2 i hakerzy"': {
    sprawa: (k, s, A) => {
      if (!SP.czasowniki(k, s).wniosek?.param?.uzasadnienie) return undefined;
      const d = K.madraSprawa(k, s, A);
      return d?.v === 'wniosek' ? { v: 'wniosek', p: { ...d.p, uzasadnienie: 'straszenie' } } : undefined;
    },
  },
  // Tylko tam, gdzie jest sieć przemysłowa.
  'EDR na stacje OT bez pilotażu': { tylko_ot: true, filtr: zamien('wdroz:edr', { zakres: 'z_ot' }) },
  'aktywny skan OT przy inwentaryzacji': { tylko_ot: true, filtr: (id, p) => (id === 'wdroz:inwentaryzacja' ? [id, { metoda_ot: 'aktywna' }] : [id, p]) },
};

// Deklaracja z pliku kampanii → strategia: { sprawa: sid, v, p } albo { sprawy: { sid: { v, p } } }
// (kilka decyzji naraz, np. kartony „na później" i potem oświadczenie); v: null = nie odpowiadać.
const decyzja = d => (d.v === null ? { v: '—' } : { v: d.v, p: d.p || {} });
function zDeklaracji(o) {
  const mapa = typeof o.sprawa === 'string' ? { [o.sprawa]: o } : o.sprawy;
  if (!mapa) return o;
  return { ...o, sprawa: (k, s) => (mapa[s.sid] ? decyzja(mapa[s.sid]) : undefined) };
}

// Przygotowanie do incydentu (z pliku kampanii) jako filtr ruchów + odpowiedzi w sprawach.
function bezPrzygotowania(prz) {
  return {
    filtr: bez(...(prz.ruchy || [])),
    sprawa: (k, s) => (prz.sprawy?.[s.sid] ? { v: prz.sprawy[s.sid].v ?? '—', p: prz.sprawy[s.sid].p || {} } : undefined),
  };
}
const polacz = (a, b) => ({
  filtr: a.filtr && b.filtr ? (id, p) => { const r = a.filtr(id, p); return r ? b.filtr(r[0], r[1]) : null; } : a.filtr || b.filtr,
  sprawa: a.sprawa && b.sprawa ? (k, s, A) => a.sprawa(k, s, A) ?? b.sprawa(k, s, A) : a.sprawa || b.sprawa,
  ruchy: a.ruchy || b.ruchy,
  playbook: a.playbook || b.playbook,
});

// Wszystkie odstępstwa dla kampanii: { nazwa: { zrodlo, o } }.
function odstepstwa(defId) {
  const def = K.pelnaDefinicja(defId);
  const firma = require('../data/firmy')[def.firma];
  const out = {};
  for (const [n, o] of Object.entries(OGOLNE)) if (!o.tylko_ot || firma.ot) out[n] = { zrodlo: 'ogólne', o };
  for (const z of def.zdarzenia.filter(x => x.typ === 'incydent')) {
    const inc = I.wczytaj(z.id), prz = def.przygotowanie?.[z.id];
    for (const [n, f] of Object.entries(inc.odstepstwa || {})) {
      const playbook = (id, s, plan) => (id === z.id ? f(plan, s) : plan);
      out[`${z.id}: ${n}`] = { zrodlo: `incydent ${z.id}`, o: { playbook } };
      if (prz) out[`bez przygotowania + ${z.id}: ${n}`] = { zrodlo: `incydent ${z.id}`, o: polacz(bezPrzygotowania(prz), { playbook }) };
    }
    if (prz) out[`bez przygotowania do ${z.id}`] = { zrodlo: `incydent ${z.id}`, o: bezPrzygotowania(prz) };
  }
  for (const [n, o] of Object.entries(def.odstepstwa || {})) out[n] = { zrodlo: 'kampania', o: zDeklaracji(o) };
  return out;
}

async function cennik(N = 10, defId = 'wodociagi', wypisz = console.log) {
  const baza = {};
  for (let seed = 1; seed <= N; seed++) baza[seed] = await K.indeksOdpornosci(await K.grajAuto('madry', seed, false, () => {}, false, defId));
  const wiersze = [];
  for (const [nazwa, { zrodlo, o }] of Object.entries(odstepstwa(defId))) {
    let dW = 0, dIO = 0, dJD = 0;
    for (let seed = 1; seed <= N; seed++) {
      const io = await K.indeksOdpornosci(await K.grajAuto(zMadrego(o), seed, false, () => {}, false, defId));
      dW += io.kampania - baza[seed].kampania; dIO += io.wynik - baza[seed].wynik; dJD += io.jd - baza[seed].jd;
    }
    wiersze.push({ nazwa, zrodlo, dW: dW / N, dIO: dIO / N, dJD: (100 * dJD) / N });
  }
  wiersze.sort((a, b) => a.dW - b.dW);
  wypisz(`Kampania: ${defId}. Mądry bez odstępstw: Wynik ${Math.round(Object.values(baza).reduce((a, x) => a + x.kampania, 0) / N)} (${N} ziaren)`);
  wypisz(`${'odstępstwo od praktyki'.padEnd(70)} ${'źródło'.padEnd(12)} ΔWYNIK   ΔIndeks  ΔPraktyka(pp)`);
  for (const w of wiersze) wypisz(`${w.nazwa.padEnd(70)} ${w.zrodlo.padEnd(12)} ${w.dW.toFixed(0).padStart(6)} ${w.dIO.toFixed(0).padStart(9)} ${w.dJD.toFixed(1).padStart(13)}`);
  return wiersze;
}

if (require.main === module) {
  const N = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 10);
  const kampania = (process.argv.find(a => a.startsWith('--kampania=')) || '=wodociagi').split('=')[1];
  cennik(N, kampania).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { cennik, odstepstwa, OGOLNE, zDeklaracji, bezPrzygotowania };
