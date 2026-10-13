// ── DECYZJE CYKLICZNE: skrzynka spraw ze STANU firmy ──
// W prawdziwej pracy CISO coś trzeba zdecydować w każdym miesiącu: umowa się kończy,
// certyfikat wygasa, producent przestaje łatać system, alerty leżą, zespół nie nadąża.
// Te sprawy nie przychodzą ze skryptu kampanii, tylko z tego, co gracz zbudował — im więcej
// umów i narzędzi, tym więcej odnowień i właścicieli do wskazania (docs/18-…, 18.12).
// Definicje: data/cykliczne.js; dane kampanii: `certyfikaty`, `koniec_wsparcia`.
// Losowanie tylko ze strumienia `k.rnd.cykl` — nie przesuwa „pogody" innych podsystemów.

const S = require('./silnik');
const SP = require('./sprawy');
const C = require('../data/cykliczne');

const ODSTEP = 4;                 // ta sama sprawa „systemowa" (alerty, kolejka) najwyżej co 4 miesiące
const ZAPOMNIANY_BEZ_EWIDENCJI = 0.35;

const nowyCykl = () => ({ alertyMies: 0, alertyOst: -99, kolejkaOst: -99, eol: {}, wygasa: [], wygasle: [], odnowione: [] });
const otwarta = (k, sid, klucz) => k.sprawy.some(s => s.sid === sid && (klucz === undefined || s.dane?.klucz === klucz));
const otworz = (k, sid, dane) => { SP.dodajScenariuszowa(k, sid, dane); k.log('cykl', `${sid}${dane?.klucz ? ` (${dane.klucz})` : ''}: nowa sprawa w skrzynce`); };

// Początek miesiąca: co z rzeczy „co roku / co jakiś czas" przypada teraz.
function nowyMiesiac(k) {
  const st = k.st, m = st.m, c = k.cykl;
  // 1) Odnowienia umów: rocznica podpisania (abonament > 0 zł).
  for (const o of Object.values(k.obiekty)) {
    if (o.stan !== 'dziala' || !(S.kosztMiesieczny(st, o.id) > 0) || otwarta(k, 'C_odnowienie', o.id)) continue;
    if (m - (o.umowaOd ?? o.od) >= 12) otworz(k, 'C_odnowienie', { klucz: o.id });
  }
  // 2) Certyfikaty i domeny. Bez ewidencji część z nich „nie istnieje", dopóki nie wygaśnie.
  for (const ce of k.def.certyfikaty || []) {
    if (m < ce.pierwszy || (m - ce.pierwszy) % ce.co) continue;
    if ((k.flagi.certy_msp && S.dziala(st, 'msp')) || (ce.auto && k.flagi.certy_auto)) {
      c.odnowione.push({ id: ce.id, m, auto: true }); k.log('cykl', `${ce.nazwa}: odnowione automatycznie`); continue;
    }
    if (!S.dziala(st, 'inwentaryzacja') && k.rnd.cykl() < ZAPOMNIANY_BEZ_EWIDENCJI) { c.wygasa.push({ id: ce.id, m }); k.log('cykl', `${ce.nazwa}: wygasa, ale nikt o tym nie wie (brak ewidencji)`); continue; }
    otworz(k, 'C_certyfikat', { klucz: ce.id });
  }
  // 3) Koniec wsparcia producenta (i powrót sprawy po roku rozszerzonego wsparcia).
  for (const e of k.def.koniec_wsparcia || []) {
    if ((m === e.m && !c.eol[e.id]) || c.eol[e.id]?.ponownie === m) otworz(k, 'C_eol', { klucz: e.id });
  }
  // 4) Proces bez właściciela: alerty leżą od dwóch miesięcy.
  if (c.alertyMies >= 2 && m - c.alertyOst >= ODSTEP && !otwarta(k, 'C_alerty')) { c.alertyOst = m; otworz(k, 'C_alerty'); }
  // 5) Zespół nie nadąża: kolejka projektów albo projekt, który wisi od pół roku.
  if ((st.projekty.length >= 4 || st.projekty.some(p => m - p.start >= 6)) && m - c.kolejkaOst >= ODSTEP && !otwarta(k, 'C_kolejka')) { c.kolejkaOst = m; otworz(k, 'C_kolejka'); }
}

// Koniec miesiąca (po silniku): liczniki stanu i skutki rzeczy, o których nikt nie wiedział.
function koniecMiesiaca(k, a) {
  const c = k.cykl, st = k.st;
  c.alertyMies = (st.ostatni?.jakosc_ops ?? 1) < 0.8 ? c.alertyMies + 1 : 0;
  for (const w of c.wygasa.filter(x => x.m === k.mZamkniety)) {
    const ce = (k.def.certyfikaty || []).find(x => x.id === w.id);
    C.wygasCertyfikat(k, a, ce, true);
  }
  c.wygasa = c.wygasa.filter(x => x.m !== k.mZamkniety);
}

module.exports = { nowyCykl, nowyMiesiac, koniecMiesiaca, ODSTEP };
