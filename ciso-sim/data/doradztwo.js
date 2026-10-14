// ── DORADZTWO: zlecenie tematu firmie zewnętrznej ──
// Każdy CISO może kupić czyjś czas i oczy: test penetracyjny, audyt OT, ocenę luk. Doradca
// widzi rzeczy, których gracz nie widzi (prawda silnika — z szansą zależną od firmy),
// i oddaje raport z rekomendacjami POLICZONYMI w modelu: o ile spadają oczekiwane straty
// w roku, jeśli zrobisz dokładnie to (proto/doradztwo.js). Pierwsza pozycja to największa
// poprawa obecnej sytuacji — z gotowym poleceniem do wykonania.
//
// Ceny i czasy to 🔵 uproszczenia gry na poziomie polskiego rynku MŚP w 2026 r. (rzędy
// wielkości: test penetracyjny z zewnątrz 15–30 tys. zł, audyt OT 30–60 tys. zł, ocena luk
// w średniej spółce 40–80 tys. zł). Skalują się z wielkością firmy (pierwiastek z liczby osób).
//
// Pola tematu:
//   nazwa, mies (czas realizacji), pln, h (Twoje godziny: brief, wywiady, odbiór)
//   dzialy      — obciążenie ludzi (wywiady, dostęp do stacji)
//   kontrole    — co doradca ocenia (brak → rekomendacja wdrożenia; działa → usterki, dryf, ustawienia)
//   fakty(f, k) — które fakty świata może znaleźć (k: kampania — np. dział OT z jej pliku)
//   obejscia(ini) — których obejść działów szuka (wywiady, skany)
//   testuje     — kontrole, które doradca TESTUJE (wynik liczy się jako test — dowód dla audytu)
//   ot          — sprawdza zgodność wariantów OT z producentem SCADA (jak pilotaż)
//   obowiazki   — przegląd obowiązków prawnych z terminami

const TEMATY = {
  ogolny: {
    nazwa: 'Ocena dojrzałości i luk w całej organizacji', mies: 3, pln: 45000, h: 12,
    dzialy: { wszystkie: { zmeczenie: 0.05 } },
    kontrole: ['inwentaryzacja', 'mfa', 'backup', 'weryfikacja_platnosci', 'plan_ir', 'bcp', 'patch', 'edr', 'segmentacja', 'szkolenia', 'msp', 'ryzyko', 'szbi'],
    fakty: () => true, obejscia: () => true, glebokosc: 0.6, obowiazki: true,
  },
  ekspozycja: {
    nazwa: 'Test penetracyjny z internetu i przegląd dostępu zdalnego', mies: 1, pln: 22000, h: 4,
    kontrole: ['ekspozycja', 'brama_dostepu', 'mfa', 'patch'],
    fakty: f => f.widoczne_z_internetu || f.dostep_zdalny, obejscia: ini => !!(ini.ryzyko?.wektory?.uslugi || ini.ryzyko?.wektory?.dostawca),
  },
  ot: {
    nazwa: 'Audyt bezpieczeństwa OT/SCADA (stacja, przepompownie, dostęp integratora)', mies: 2, pln: 38000, h: 10,
    dzialy: { produkcja: { zmeczenie: 0.1 } },
    kontrole: ['segmentacja', 'brama_dostepu', 'inwentaryzacja', 'backup', 'bcp', 'patch'],
    fakty: (f, k) => f.na_obiekcie || f.widoczne_z_internetu || f.dostep_zdalny || (!!k.def.dzial_ot && f.zna === k.def.dzial_ot), obejscia: ini => !!ini.ryzyko?.wektory?.uslugi, ot: true,
  },
  ciaglosc: {
    nazwa: 'Ciągłość działania: kopie, odtwarzanie i praca ręczna (z testem odtworzenia)', mies: 2, pln: 26000, h: 8,
    dzialy: { produkcja: { zmeczenie: 0.05 } },
    kontrole: ['backup', 'bcp', 'plan_ir'], testuje: ['backup', 'bcp', 'plan_ir'], fakty: f => f.ciaglosc,
  },
  dostep: {
    nazwa: 'Tożsamość i dostęp: konta, MFA, uprawnienia, konta dostawców', mies: 1, pln: 16000, h: 6,
    kontrole: ['mfa', 'mfa_fido', 'jml', 'brama_dostepu'], fakty: f => f.dostep_zdalny,
    obejscia: ini => !!ini.ryzyko?.wektory?.poswiadczenia,
  },
  dostawcy: {
    nazwa: 'Łańcuch dostaw: integrator, usługi w chmurze, umowy', mies: 2, pln: 20000, h: 6,
    kontrole: ['dostawcy', 'brama_dostepu'], fakty: f => f.dostep_zdalny || !!f.widoczny_od_sprawy,
    obejscia: ini => !!ini.ryzyko?.wektory?.dostawca,
  },
  zgodnosc: {
    nazwa: 'Luka zgodności KSC/NIS2: obowiązki, dokumenty, terminy', mies: 2, pln: 28000, h: 8,
    kontrole: ['szbi', 'ryzyko', 'plan_ir', 'szkolenia'], obowiazki: true,
  },
  ludzie: {
    nazwa: 'Kultura i obejścia: wywiady w działach', mies: 1, pln: 14000, h: 6,
    dzialy: { wszystkie: { zmeczenie: 0.03 } },
    kontrole: ['szkolenia', 'weryfikacja_platnosci'], obejscia: () => true,
  },
  platnosci: {
    nazwa: 'Procesy finansowe i wyłudzenia (BEC)', mies: 1, pln: 12000, h: 4,
    dzialy: { finanse: { zmeczenie: 0.05 } },
    kontrole: ['weryfikacja_platnosci', 'mfa'], obejscia: ini => !!ini.ryzyko?.wektory?.bec,
  },
};

// Kto robi: tania firma widzi mniej i myli się w szacunkach; renomowana — drożej, dokładniej.
const WYKONAWCY = {
  lokalna: { nazwa: 'mała lokalna firma', pln: 0.6, wykrywa: 0.55, blad: 0.4 },
  renomowana: { nazwa: 'renomowana firma doradcza', pln: 1.5, wykrywa: 0.9, blad: 0.1 },
};
// Tryb pilny: dwa razy szybciej, półtora raza drożej.
const TRYBY = { zwykly: { pln: 1 }, pilny: { pln: 1.5 } };

// Zalecane ustawienia wdrożeń (tak doradca pisze rekomendację: konkretnie, z parametrami).
const ZALECANE_PARAMETRY = {
  inwentaryzacja: { metoda_ot: 'pasywna' }, mfa: { zakres: 'wszyscy', metoda: 'numer' }, backup: { zakres: 'biuro_ot', nosnik: 'offline' },
  weryfikacja_platnosci: { sposob: 'uzgodniona' }, szbi: { sposob: 'doradca' }, patch: { zakres_ot: 'z_producentem' },
  szkolenia: { forma: 'program' }, edr: { zakres: 'biuro_serwery', tryb: 'wykrywaj' }, segmentacja: { zakres: 'tylko_ot' }, msp: { umowa: 'z_wymaganiami' },
};
// Ustawienia działających kontroli, które doradca każe poprawić: [kontrola, parametr, wartość, warunek].
const POPRAWKI_USTAWIEN = [
  ['mfa', 'zakres', 'wszyscy', o => o.param.zakres !== 'wszyscy'],
  ['backup', 'nosnik', 'offline', o => o.param.nosnik !== 'offline'],
  ['backup', 'zakres', 'biuro_ot', (o, k) => k.st.firma.ot && o.param.zakres !== 'biuro_ot'],
  ['szkolenia', 'forma', 'program', o => o.param.forma !== 'program'],
  ['edr', 'tryb', 'blokuj', (o, k) => o.param.tryb === 'wykrywaj' && k.st.m - (o.dzialaOd ?? k.st.m) >= 2],
];

module.exports = { TEMATY, WYKONAWCY, TRYBY, ZALECANE_PARAMETRY, POPRAWKI_USTAWIEN };
