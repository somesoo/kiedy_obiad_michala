// ── INICJATYWY DZIAŁÓW ──
// To, co działy firmy robią z WŁASNEJ woli, żeby osiągnąć swoje cele — i co rodzi ryzyko,
// jeśli zrobią to bez bezpieczeństwa. Algorytm wyboru i uczenia: proto/dzialy.js,
// opis: docs/15-dzialy-i-rezyser.md. Wzorce są ogólne; kampania wybiera, które działy
// w danej firmie mogą je podjąć (pole `dzialy` dopasowuje się do id działów kampanii).
//
// Pola:
//   korzysc      — wkład w cele działu (ciaglosc, koszt, wygoda, terminy, klienci, zgodnosc,
//                  reputacja, spokoj); wejście funkcji użyteczności
//   pilnosc      — 0..1, jak „na wczoraj" (obniża szansę, że dział zapyta)
//   ryzyko       — skutek w silniku, gdy zrobione BEZ bezpieczeństwa:
//                    wektory: mnożniki λ (silnik.mod.wektory), nieznane: +zasoby poza ewidencją
//   warunki      — środki „tak, ale…", które gracz SKŁADA (docs/18-…): każdy { id, opis, h, pln,
//                  opoznienie (okresy), redukcja: {wektor: jaka część ryzyka znika}, nieznane: jaka część
//                  urządzeń poza ewidencją wchodzi do ewidencji, wymaga: id kontroli, która musi działać,
//                  zamiast: id kontroli, która — jeśli działa — zastępuje koszt warunku }
//   alternatywa  — co gracz może zaproponować przy odmowie (bez niej odmowa boli dział bardziej)
//   warunek(k)   — kiedy możliwa (k = kampania: k.m, k.miesiacKal, k.flagi…)
//   karencja     — po ilu okresach dział może wrócić z tym samym (99 = raz)
//   cele         — cele edukacyjne (docs/01-…), które sprawdza ta sytuacja

module.exports = {
  zdalny_integrator: {
    nazwa: 'stały zdalny dostęp dla integratora SCADA',
    prosba: 'Integrator chce stałego zdalnego dostępu do stacji, żeby szybciej usuwać awarie. Zainstalujemy mu narzędzie zdalnej pomocy na stacji inżynierskiej.',
    korzysc: { ciaglosc: 0.8, wygoda: 0.9 },
    pilnosc: 0.6,
    ryzyko: { wektory: { uslugi: 1.4, dostawca: 1.5 } },
    warunki: [
      { id: 'brama', opis: 'dostęp tylko przez bramę z MFA (jeśli brama dla dostawców już działa — bez dodatkowego kosztu)', h: 16, pln: 15000, zamiast: 'brama_dostepu', opoznienie: 1, redukcja: { uslugi: 0.6, dostawca: 0.4 } },
      { id: 'konta', opis: 'osobne konto na każdą osobę integratora', h: 6, redukcja: { dostawca: 0.3 } },
      { id: 'na_zadanie', opis: 'dostęp włączany na żądanie, na czas zlecenia', h: 8, redukcja: { uslugi: 0.3, dostawca: 0.2 } },
      { id: 'nagrywanie', opis: 'nagrywanie sesji i przegląd logów', h: 10, pln: 2000, redukcja: { dostawca: 0.2 } },
    ],
    alternatywa: 'serwis na miejscu do czasu bramy z MFA',
    warunek: () => true,
    karencja: 99,
    cele: ['E8', 'E4'],
  },
  modemy_4g: {
    nazwa: 'modemy 4G w przepompowniach',
    prosba: 'Kupujemy modemy 4G do przepompowni — będziemy widzieć stany na telefonie. Operator daje publiczne adresy, szybko i tanio.',
    korzysc: { ciaglosc: 0.7, wygoda: 0.6, koszt: 0.3 },
    pilnosc: 0.5,
    ryzyko: { wektory: { uslugi: 1.3 }, nieznane: 8 },
    warunki: [
      { id: 'apn', opis: 'prywatny APN operatora zamiast publicznych adresów', h: 10, pln: 6000, opoznienie: 1, redukcja: { uslugi: 0.7 } },
      { id: 'vpn', opis: 'VPN do sieci firmowej', h: 12, pln: 3000, redukcja: { uslugi: 0.5 } },
      { id: 'ewidencja', opis: 'modemy w ewidencji, zmienione hasła', h: 4, redukcja: { uslugi: 0.2 }, nieznane: 1 },
    ],
    alternatywa: 'telemetria przez istniejące łącze stacji',
    warunek: k => k.m >= 3,
    karencja: 99,
    cele: ['E4', 'E9'],
  },
  ebok_saas: {
    nazwa: 'nowy e-BOK w chmurze',
    prosba: 'Wybraliśmy nowy e-BOK w chmurze — klienci od dawna o to proszą. Umowę podpisujemy w przyszłym tygodniu.',
    korzysc: { klienci: 0.9, wygoda: 0.5 },
    pilnosc: 0.4,
    ryzyko: { wektory: { dostawca: 1.3, poswiadczenia: 1.15 } },
    warunki: [
      { id: 'ocena', opis: 'krótka ocena dostawcy (lokalizacja danych, incydenty, certyfikaty)', h: 6, opoznienie: 1, redukcja: { dostawca: 0.4 } },
      { id: 'umowa', opis: 'umowa powierzenia z terminem zgłaszania naruszeń 24 h', h: 4, redukcja: { dostawca: 0.3 } },
      { id: 'mfa_admin', opis: 'MFA dla kont administracyjnych', h: 2, redukcja: { poswiadczenia: 0.7 } },
    ],
    alternatywa: 'wybór dostawcy z listy ocenionych',
    warunek: k => k.m >= 2,
    karencja: 99,
    cele: ['E8', 'E11'],
  },
  konto_wspolne: {
    nazwa: 'wspólne konto dla pracowników sezonowych',
    prosba: 'Na lato przychodzi 6 osób do pogotowia wodociągowego. Załóżmy jedno wspólne konto, szkoda czasu na sześć.',
    korzysc: { wygoda: 0.7, terminy: 0.5 },
    pilnosc: 0.7,
    ryzyko: { wektory: { poswiadczenia: 1.2, insider: 1.3 } },
    warunki: [
      { id: 'imienne', opis: 'konta imienne z szablonu, założone w 15 minut', h: 4, redukcja: { insider: 0.8, poswiadczenia: 0.4 } },
      { id: 'wygasanie', opis: 'data wygaśnięcia kont na koniec sezonu', h: 1, redukcja: { insider: 0.3, poswiadczenia: 0.3 } },
      { id: 'mfa', opis: 'MFA także na kontach sezonowych', h: 1, wymaga: 'mfa', redukcja: { poswiadczenia: 0.6 } },
    ],
    alternatywa: 'konta imienne zakładane przez kadry z szablonu',
    warunek: k => [5, 6].includes(k.miesiacKal),
    karencja: 10,
    cele: ['E9', 'E11'],
  },
  czat_ai: {
    nazwa: 'prywatny czat AI do pism i odpowiedzi klientom',
    prosba: 'Pisma do klientów piszemy teraz z pomocą czatu AI — idzie trzy razy szybciej. Wklejamy treść reklamacji i dane klienta.',
    korzysc: { wygoda: 0.8, terminy: 0.4 },
    pilnosc: 0.3,
    ryzyko: { wektory: { insider: 1.25 } },
    warunki: [
      { id: 'narzedzie', opis: 'firmowe narzędzie AI z umową (bez trenowania na naszych danych)', h: 8, pln: 6000, opoznienie: 1, redukcja: { insider: 0.6 } },
      { id: 'zasada', opis: 'zasada: bez danych osobowych w poleceniach + 15 minut instrukcji', h: 4, redukcja: { insider: 0.4 } },
      { id: 'szablony', opis: 'szablony pism z anonimizacją', h: 4, redukcja: { insider: 0.2 } },
    ],
    alternatywa: 'zakaz danych osobowych w poleceniach, szablony pism',
    warunek: k => k.m >= 4,
    karencja: 8,
    cele: ['E9', 'E11'],
  },
  laptopy_market: {
    nazwa: 'laptopy kupione w markecie',
    prosba: 'Kupiliśmy dwa laptopy w markecie, bo IT nie miało czasu. Skonfigurujemy sami.',
    korzysc: { koszt: 0.6, terminy: 0.6 },
    pilnosc: 0.5,
    ryzyko: { wektory: { phishing: 1.08 }, nieznane: 2 },
    warunki: [
      { id: 'konfiguracja', opis: 'konfiguracja z szablonu (szyfrowanie, konto bez admina, agent ochrony)', h: 6, redukcja: { phishing: 0.7 } },
      { id: 'ewidencja', opis: 'wpis do ewidencji i do procesu łatania', h: 2, redukcja: { phishing: 0.2 }, nieznane: 1 },
    ],
    alternatywa: 'dwa laptopy z zapasu IT na tydzień',
    warunek: () => true,
    karencja: 6,
    cele: ['E4'],
  },
  kamera_tania: {
    nazwa: 'tania kamera na terenie stacji',
    prosba: 'Po kradzieży kabli zamontujemy kamerę z podglądem w aplikacji. Instalator mówi, że hasło zostawi domyślne, żeby było łatwiej.',
    korzysc: { spokoj: 0.6, koszt: 0.4, ciaglosc: 0.3 },
    pilnosc: 0.4,
    ryzyko: { wektory: { uslugi: 1.15 }, nieznane: 2 },
    warunki: [
      { id: 'siec', opis: 'osobna sieć (VLAN) dla kamery', h: 4, pln: 1500, redukcja: { uslugi: 0.5 } },
      { id: 'haslo', opis: 'zmienione hasło domyślne', h: 1, redukcja: { uslugi: 0.4 } },
      { id: 'bez_internetu', opis: 'podgląd przez VPN, bez wystawiania do internetu', h: 3, redukcja: { uslugi: 0.5 } },
      { id: 'ewidencja', opis: 'kamera w ewidencji', h: 1, nieznane: 1 },
    ],
    alternatywa: 'monitoring przez firmę ochrony z umową',
    warunek: k => k.m >= 2,
    karencja: 99,
    cele: ['E4'],
  },
  praca_zdalna: {
    nazwa: 'praca zdalna z domowych komputerów',
    prosba: 'Dwie osoby od nas będą pracować zdalnie dwa dni w tygodniu — z domowych komputerów, przez pulpit zdalny.',
    korzysc: { wygoda: 0.8, terminy: 0.3 },
    pilnosc: 0.4,
    ryzyko: { wektory: { poswiadczenia: 1.3, bec: 1.2, phishing: 1.05 } },
    warunki: [
      { id: 'laptopy', opis: 'służbowe laptopy zamiast domowych komputerów', h: 8, pln: 8000, opoznienie: 1, redukcja: { phishing: 0.8, poswiadczenia: 0.3 } },
      { id: 'vpn_mfa', opis: 'VPN z MFA, bez pulpitu zdalnego wystawionego do internetu', h: 8, wymaga: 'mfa', redukcja: { poswiadczenia: 0.7, bec: 0.6 } },
      { id: 'zasady', opis: 'zasady pracy zdalnej (blokada ekranu, domowe Wi-Fi, rozmowy o płatnościach)', h: 2, redukcja: { bec: 0.2 } },
    ],
    alternatywa: 'praca zdalna od wdrożenia MFA',
    warunek: k => k.m >= 6,
    karencja: 99,
    cele: ['E9'],
  },
  pendrive_integratora: {
    nazwa: 'pendrive od integratora',
    prosba: 'Integrator przysłał kurierem pendrive z nową wersją wizualizacji. Wgramy jutro rano na stację.',
    korzysc: { ciaglosc: 0.5, wygoda: 0.8 },
    pilnosc: 0.8,
    ryzyko: { wektory: { dostawca: 1.3 } },
    warunki: [
      { id: 'telefon', opis: 'potwierdzenie u integratora na znany numer', h: 1, redukcja: { dostawca: 0.6 } },
      { id: 'skan', opis: 'skan na odizolowanym komputerze przed wgraniem', h: 3, redukcja: { dostawca: 0.6 } },
    ],
    alternatywa: 'wgranie przez integratora na miejscu',
    warunek: k => k.m >= 3,
    karencja: 6,
    cele: ['E8'],
  },
  zmiana_banku: {
    nazwa: 'zmiana banku firmy',
    prosba: 'Zmieniamy bank na tańszy. Wyślemy kontrahentom maila z nowym numerem rachunku.',
    korzysc: { koszt: 0.7 },
    pilnosc: 0.3,
    ryzyko: { wektory: { bec: 1.3 } },
    warunki: [
      { id: 'list', opis: 'informacja listowna zamiast maila', h: 1, redukcja: { bec: 0.4 } },
      { id: 'telefon', opis: 'potwierdzenie telefoniczne u kluczowych kontrahentów', h: 2, redukcja: { bec: 0.3 } },
      { id: 'biala_lista', opis: 'aktualizacja białej listy VAT przed zmianą', h: 1, redukcja: { bec: 0.2 } },
    ],
    alternatywa: 'zmiana banku z komunikacją listowną',
    warunek: k => k.m >= 5,
    karencja: 99,
    cele: ['E2'],
  },
  dysk_prywatny: {
    nazwa: 'pliki na prywatnym dysku w chmurze',
    prosba: 'Wrzucamy pliki zespołu na darmowy dysk w chmurze, bo serwer plików jest wolny i nie działa z domu.',
    korzysc: { wygoda: 0.7 },
    pilnosc: 0.4,
    ryzyko: { wektory: { insider: 1.15, poswiadczenia: 1.1 } },
    warunki: [
      { id: 'firmowa_chmura', opis: 'firmowe miejsce w chmurze zamiast prywatnego', h: 6, pln: 2000, opoznienie: 1, redukcja: { insider: 0.6, poswiadczenia: 0.3 } },
      { id: 'mfa', opis: 'MFA na dostępie', h: 1, wymaga: 'mfa', redukcja: { poswiadczenia: 0.6 } },
      { id: 'udostepnianie', opis: 'udostępnianie tylko wewnątrz firmy', h: 1, redukcja: { insider: 0.4 } },
    ],
    alternatywa: 'szybszy dostęp do serwera plików przez VPN',
    warunek: k => k.m >= 2,
    karencja: 8,
    cele: ['E9', 'E4'],
  },
};
