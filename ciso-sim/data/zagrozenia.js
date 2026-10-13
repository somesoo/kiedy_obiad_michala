// ── MODEL ZAGROŻEŃ: wektory, sprawcy, skutki ──
// Liczby dla silnika i proto/symulacja.js. Opis i uzasadnienie: docs/07-zagrozenia-i-model-ataku.md.
//
// Skala odniesienia: firma średnia (~250 osób) BEZ inwestycji w bezpieczeństwo ponad
// „standard" (antywirus, filtr poczty z pakietu biurowego, firewall z routera operatora).
// Profil firmy mnoży częstotliwości (docs/09-firmy-kampanie.md, data/firmy.js).
//
// Kalibracja: brak tu „prawdziwych" danych na firmę — są wskaźniki branżowe (CERT Polska,
// raporty ubezpieczycieli, M-Trends: mediana dwell time ~10–11 dni). Dlatego cel kalibracji
// jest JAKOŚCIOWY i sprawdzany symulacją: firma bez ochrony ma ~1 poważny incydent na
// 2 lata, higiena ucina to kilkukrotnie, a narzędzia bez ludzi dają mniej, niż kosztują.

// Próby na miesiąc (λ) i szansa, że próba da dostęp, gdy NIC jej nie blokuje (p).
// „Próba" to nie każdy spam — to kampania/skan, który realnie dociera do celu.
const WEKTORY = {
  phishing:     { nazwa: 'Phishing / złośliwy załącznik',          lambda: 4,    p: 0.008, skala: 'ludzie' },
  poswiadczenia:{ nazwa: 'Skradzione lub odgadnięte hasła',        lambda: 2,    p: 0.005, skala: 'ludzie' },
  podatnosc:    { nazwa: 'Podatność urządzenia brzegowego (VPN, firewall, aplikacja)', lambda: 1, p: 0.008, skala: 'zasoby' },
  uslugi:       { nazwa: 'Usługa wystawiona do internetu (RDP, HMI, panel) ze słabym hasłem', lambda: 3, p: 0.003, skala: 'zasoby' },
  dostawca:     { nazwa: 'Przez dostawcę (zdalny dostęp, aktualizacja, SaaS)', lambda: 0.05, p: 0.2 },
  insider:      { nazwa: 'Insider (pracownik, były pracownik)',    lambda: 0.02, p: 0.5, skala: 'ludzie' },
  bec:          { nazwa: 'Wyłudzenie płatności (BEC, „zmiana rachunku", „na prezesa")', lambda: 2, p: 0.008, skala: 'ludzie' },
  // DDoS liczy się tylko u firm, które żyją z internetu: domyślny mnożnik w profilu = 0.
  ddos:         { nazwa: 'DDoS / wymuszenie DDoS',                 lambda: 0.2,  p: 0.6, domyslnie: 0 },
};

// Firma referencyjna, do której odnoszą się λ. Mniejsza firma dostaje mniej prób,
// większa więcej — pierwiastkowo, nie liniowo (patrz proto/symulacja.js).
const SKALA_ODNIESIENIA = { ludzie: 250, zasoby: 330 };

// Kto stoi za udanym dostępem, zależnie od wektora. Profil firmy może przeważyć wagi
// (np. wodociągi: haktywiści na usługach wystawionych; energetyka: APT).
const SPRAWCY_WEKTORA = {
  phishing:      { pospolity: 0.5, broker: 0.3, ransomware: 0.1, kradziez: 0.05, apt: 0.05 },
  poswiadczenia: { pospolity: 0.2, broker: 0.4, ransomware: 0.2, kradziez: 0.2 },
  podatnosc:     { pospolity: 0.2, ransomware: 0.4, broker: 0.25, apt: 0.15 },
  uslugi:        { pospolity: 0.3, haktywista: 0.3, ransomware: 0.25, broker: 0.15 },
  dostawca:      { ransomware: 0.4, kradziez: 0.4, apt: 0.2 },
  insider:       { insider: 1 },
  bec:           { bec: 1 },
  ddos:          { ddos: 1 },
};

// Sprawcy. `postep` = tygodniowa szansa przejścia DO danego etapu (bez kontroli).
// `skrytosc` mnoży szansę wykrycia (APT < 1). `start` = etap, od którego zaczyna
// (insider ma już legalny dostęp). `cel` = rodzaj skutku na ostatnim etapie.
// `wygasa` = tygodniowa szansa, że przyczółek umrze sam (reinstalacja, zmiana hasła,
// sprawca stracił zainteresowanie) — bez tego każda infekcja kończyłaby się katastrofą.
const SPRAWCY = {
  pospolity:  { nazwa: 'Pospolite złośliwe oprogramowanie (adware, koparka, spam-bot)', postep: {}, skrytosc: 1.0, cel: null, wygasa: 0.1 },
  ransomware: { nazwa: 'Afiliant ransomware (RaaS)', postep: { eskalacja: 0.2, ruch: 0.2, cel: 0.2 }, skrytosc: 1.0, cel: 'szyfrowanie', eksfiltracja: 0.6 },
  broker:     { nazwa: 'Broker dostępu / infostealer', postep: { eskalacja: 0.05, ruch: 0.02, cel: 0 }, skrytosc: 1.0, cel: null, sprzedaz: 0.02, wygasa: 0.04 },
  kradziez:   { nazwa: 'Grupa wymuszająca (kradzież bez szyfrowania)', postep: { eskalacja: 0.25, ruch: 0.25, cel: 0.3 }, skrytosc: 0.9, cel: 'wyciek' },
  apt:        { nazwa: 'Grupa państwowa (szpiegostwo, przygotowanie sabotażu)', postep: { eskalacja: 0.15, ruch: 0.12, cel: 0.06 }, skrytosc: 0.5, cel: 'szpiegostwo' },
  haktywista: { nazwa: 'Haktywiści (prorosyjscy, „pokazówki")', postep: { eskalacja: 0.6, ruch: 0.5, cel: 0.7 }, skrytosc: 1.2, cel: 'sabotaz' },
  insider:    { nazwa: 'Insider', postep: { cel: 0.35 }, skrytosc: 0.8, cel: 'wyciek_insider', start: 'ruch' },
  bec:        { nazwa: 'Oszust BEC', natychmiast: 'bec' },
  ddos:       { nazwa: 'DDoS', natychmiast: 'ddos' },
};

// Bazowa tygodniowa szansa wykrycia bez żadnych narzędzi (użytkownik zauważy, antywirus).
const WYKRYWANIE_BAZOWE = { dostep: 0.05, eskalacja: 0.02, ruch: 0.04, cel: 0 };

// Koszt opanowania intruza wykrytego na danym etapie (PLN zewnętrzne + godziny zespołu).
// Im później, tym drożej — to jest sedno sensu inwestowania w wykrywanie.
const OPANOWANIE = {
  dostep:    { pln: 5000,   h: 8 },
  eskalacja: { pln: 25000,  h: 40 },
  ruch:      { pln: 90000,  h: 120 },
};
// Szansa, że opanowanie się NIE uda (intruz zostaje, choć myślimy, że go nie ma).
const NIEUDANE_OPANOWANIE = 0.35;

// Skutki. Kwoty bazowe dla firmy referencyjnej; silnik skaluje je profilem.
const SKUTKI = {
  szyfrowanie: { przestoj_dni: 20, odbudowa_pln: 150000, odbudowa_na_zasob: 400 },
  wyciek:      { obsluga_pln: 80000, na_rekord: 1, kara_szansa: 0.25, kara_na_rekord: 2, kara_max: 4000000, utrata_przychodu: 0.01 },
  szpiegostwo: { obsluga_pln: 300000, utrata_przychodu: 0.01 },
  sabotaz:     { przestoj_dni: 2, obsluga_pln: 100000 },
  wyciek_insider: { obsluga_pln: 150000, utrata_przychodu: 0.005 },
  bec:         { srednia_pln: 200000, odzysk_szansa: 0.2 },
  ddos:        { przestoj_h: 12 },
};

module.exports = { SKALA_ODNIESIENIA, WEKTORY, SPRAWCY_WEKTORA, SPRAWCY, WYKRYWANIE_BAZOWE, OPANOWANIE, NIEUDANE_OPANOWANIE, SKUTKI };
