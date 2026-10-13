// ── CENNIK ZŁYCH DECYZJI (silnik ruchów) ──
// Ile kosztuje JEDNO odstępstwo od dobrej praktyki w dobrej grze? Gracz mądry gra normalnie,
// a w jednym miejscu robi inaczej (pomija pilotaż, nie testuje kopii, kłamie w ankiecie,
// loguje się zdalnie do przejętego panelu…). Różnica Wyniku kampanii na tych samych ziarnach
// to „cena" tego odstępstwa. Przy pełnej dowolności ruchów nie ma „złej opcji w karcie" —
// są odstępstwa od praktyki i ich skutki w modelu (docs/17-…, 17.7–17.8; docs/18-…).
//   node ciso-sim/proto/cennik.js [liczba_ziaren]

const K = require('./kampania');
const { zMadrego } = require('./brzegowe');

const bez = (...ids) => (id, p) => (ids.some(x => id === x || (x.endsWith(':') && id.startsWith(x))) ? null : [id, p]);
const ODSTEPSTWA = {
  'kłamstwo w ankiecie ubezpieczyciela': { sprawa: (k, s) => (s.sid === 'S_ubezpieczenie' ? { v: 'ankieta', p: { mfa: 'tak', edr: 'tak', kopie: 'tak' } } : undefined) },
  'dokumenty z datą wsteczną': { ruchy: (k, A) => { if (k.flagi.audyt_zapowiedziany) A.ruch('dokumenty_wstecz'); } },
  'upiększone raporty dla zarządu': { filtr: (id, p) => (id === 'raport_zarzadowi' ? [id, { styl: 'upiekszony' }] : [id, p]) },
  'S03: komunikat „woda bezpieczna" bez wyników': { playbook: (id, s, plan) => (id === 'S03' && !s.proba ? ['proces_reczny', 'komunikat_uspokajajacy', ...plan.filter(a => !a.startsWith('komunikat'))] : plan) },
  'S03: zdalne logowanie do przejętego panelu': { playbook: (id, s, plan) => (id === 'S03' && !s.proba ? ['zdalne_logowanie', ...plan] : plan) },
  'S03: aktywny skan sieci OT w trakcie': { playbook: (id, s, plan) => (id === 'S03' && !s.proba ? [...plan, 'aktywny_skan'] : plan) },
  'S01: mail do przejętej skrzynki': { playbook: (id, s, plan) => (id === 'S01' ? ['mail_kontrahent', ...plan] : plan) },
  'S01: najpierw szukanie winnych': { playbook: (id, s, plan) => (id === 'S01' && !s.udaremnione ? ['zebranie', ...plan] : plan) },
  'nocny telefon: podać hasło': { sprawa: (k, s) => (s.sid === 'S_noc_integrator' ? { v: 'podaj' } : undefined) },
  'przejęcie: połączyć bez przeglądu': { sprawa: (k, s) => (s.sid === 'S_przejecie' ? { v: 'polacz' } : undefined) },
  'EDR na stacje OT bez pilotażu': { filtr: (id, p) => (id === 'wdroz:edr' ? [id, { ...p, zakres: 'z_ot' }] : [id, p]) },
  'aktywny skan OT przy inwentaryzacji': { filtr: (id, p) => (id === 'wdroz:inwentaryzacja' ? [id, { metoda_ot: 'aktywna' }] : [id, p]) },
  'kopie nigdy nie testowane': { filtr: bez('test:backup') },
  'żadnych przeglądów ani testów': { filtr: bez('przeglad:', 'test:', 'napraw:') },
  'EDR zostaje w trybie „wykrywaj"': { filtr: bez('zmien:edr') },
  'MFA bez zarządu (bez akceptacji ryzyka)': { filtr: (id, p) => (id === 'wdroz:mfa' ? [id, { ...p, zakres: 'bez_zarzadu' }] : [id, p]) },
  'brak rozpoznania (skan, obchód, dostępy)': { filtr: bez('skan_ekspozycji', 'przeglad_ot', 'przeglad_dostepow', 'wdroz:moje_cert') },
  'odmowa każdej prośby działu': { sprawa: (k, s) => (s.rodzaj === 'prosba' ? { v: 'odmowa' } : undefined) },
  'kara za każde odkryte obejście': { sprawa: (k, s) => (s.rodzaj === 'odkrycie' ? { v: 'ukarz' } : undefined) },
  'sygnały od ludzi ignorowane': { sprawa: (k, s) => (s.rodzaj === 'sygnal' ? { v: 'zignoruj' } : undefined) },
  'SZBI z pudełka': { filtr: (id, p) => (id === 'wdroz:szbi' ? [id, { sposob: 'z_pudelka' }] : [id, p]) },
  'bez szkolenia kierownika': { filtr: bez('szkolenie_kierownika') },
  'budżet „bo NIS2 i hakerzy"': { sprawa: (k, s) => (s.sid === 'S_budzet2027' ? { v: 'wniosek', p: { kwota: 400000, uzasadnienie: 'straszenie' } } : undefined) },
  'wodomierze bez udziału bezpieczeństwa': { sprawa: (k, s) => (s.sid === 'S_wodomierze' ? { v: 'bez_udzialu' } : undefined) },
  'emerytura „po swojemu"': { sprawa: (k, s) => (s.sid === 'S_emerytura' ? { v: 'po_swojemu' } : undefined) },
  // Decyzje cykliczne i zmiany firmy (docs/18-…, 18.12).
  'koniec wsparcia: „zostawić jak jest"': { sprawa: (k, s) => (s.sid === 'C_eol' ? { v: 'zostaw' } : undefined) },
  'certyfikaty odnawiane ręcznie co rok': { sprawa: (k, s) => (s.sid === 'C_certyfikat' ? { v: 'odnow' } : undefined) },
  'umowy przedłużane bez negocjacji': { sprawa: (k, s) => (s.sid === 'C_odnowienie' ? { v: 'przedluz' } : undefined) },
  'rozbudowa „po swojemu" wykonawcy': { sprawa: (k, s) => (s.sid === 'S_rozbudowa' ? { v: 'nic' } : undefined) },
  'cięcie budżetu bez argumentów': { sprawa: (k, s) => (s.sid === 'S_ciecie' ? { v: 'przyjmij' } : undefined) },
  'odejście z IT: „przejmę sam"': { sprawa: (k, s) => (s.sid === 'S_odejscie' ? { v: 'przejmij' } : undefined) },
  'cały katalog zamówiony w 1. miesiącu': { ruchy: (k, A) => { if (k.st.m === 1) for (const x of require('../data/kontrole')) A.ruch(`wdroz:${x.id}`); } },
};

// Odstępstwa w incydencie S03 u gracza, który nie zrobił rozpoznania (panel w internecie → atak
// zamiast próby). U mądrego S03 kończy się próbą w logach, więc same odstępstwa kosztują tam 0.
const BEZ_ROZPOZNANIA = ODSTEPSTWA['brak rozpoznania (skan, obchód, dostępy)'].filtr;
for (const n of ['S03: komunikat „woda bezpieczna" bez wyników', 'S03: zdalne logowanie do przejętego panelu', 'S03: aktywny skan sieci OT w trakcie']) {
  ODSTEPSTWA[`brak rozpoznania + ${n}`] = { filtr: BEZ_ROZPOZNANIA, playbook: ODSTEPSTWA[n].playbook };
}

async function cennik(N = 10, wypisz = console.log) {
  const baza = {};
  for (let seed = 1; seed <= N; seed++) baza[seed] = await K.indeksOdpornosci(await K.grajAuto('madry', seed, false, () => {}, false));
  const wiersze = [];
  for (const [nazwa, o] of Object.entries(ODSTEPSTWA)) {
    let dW = 0, dIO = 0, dJD = 0;
    for (let seed = 1; seed <= N; seed++) {
      const io = await K.indeksOdpornosci(await K.grajAuto(zMadrego(o), seed, false, () => {}, false));
      dW += io.kampania - baza[seed].kampania; dIO += io.wynik - baza[seed].wynik; dJD += io.jd - baza[seed].jd;
    }
    wiersze.push({ nazwa, dW: dW / N, dIO: dIO / N, dJD: (100 * dJD) / N });
  }
  wiersze.sort((a, b) => a.dW - b.dW);
  wypisz(`Mądry bez odstępstw: Wynik ${Math.round(Object.values(baza).reduce((a, x) => a + x.kampania, 0) / N)} (${N} ziaren)`);
  wypisz('odstępstwo od praktyki                                ΔWYNIK   ΔIndeks  ΔPraktyka(pp)');
  for (const w of wiersze) wypisz(`${w.nazwa.padEnd(52)} ${w.dW.toFixed(0).padStart(7)} ${w.dIO.toFixed(0).padStart(9)} ${w.dJD.toFixed(1).padStart(13)}`);
  return wiersze;
}

if (require.main === module) cennik(Number(process.argv[2] || 10)).catch(e => { console.error(e); process.exit(1); });
module.exports = { cennik, ODSTEPSTWA };
