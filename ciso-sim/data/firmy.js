// ── FIRMY (archetypy kampanii) ──
// Liczbowy profil każdej firmy, którą gracz może prowadzić. Opis, fabuła, ludzie, dług
// po poprzedniku i przebieg kampanii: docs/09-firmy-kampanie.md. Wszystkie firmy są
// FIKCYJNE — inspiracje z prawdziwych zdarzeń opisuje dokument, a nie nazwy tutaj.
//
// Pola:
//   status_ksc     — 'kluczowy' | 'wazny' | 'brak' | 'do_ustalenia' (gracz sam to ocenia —
//                    samoidentyfikacja to jedna z pierwszych decyzji gry)
//   csirt          — dokąd zgłasza incydenty (w grze: zegar 24 h / 72 h / miesiąc)
//   regulacje      — co go dotyczy poza KSC
//   zasoby         — stacje i serwery ZNANE na starcie; `znane` = jaka część prawdziwych
//                    zasobów jest w ewidencji (reszta to shadow IT i „zapomniane")
//   koszt_dnia     — strata za dzień pełnego przestoju IT (PLN), już z zależnością od IT
//   przychod_rok   — do skutków reputacyjnych (utrata klientów = % przychodu)
//   rekordy        — liczba osób, których dane trzyma (skutki wycieku, RODO)
//   wektory        — mnożniki λ z data/zagrozenia.js (profil ekspozycji)
//   sprawcy        — mnożniki wag sprawców (np. APT dla energetyki)
//   budzet_rok     — roczny budżet bezpieczeństwa na start (PLN, bez pensji etatów)
//   zespol         — { fte: etaty bezpieczeństwa, h_it: godziny/mies., które oddaje IT }
//   na_starcie     — kontrole, które już są (często w złym stanie — patrz `dlug`)
//   dlug           — dziedzictwo po poprzedniku; każda pozycja to ukryty stan na start

module.exports = {
  biuro: {
    nazwa: 'Biuro Rachunkowe „Saldo" sp. z o.o.', rola: 'samouczek',
    sektor: 'usługi księgowe', status_ksc: 'brak', csirt: 'CSIRT NASK (dobrowolnie)',
    regulacje: ['RODO', 'tajemnica skarbowa klientów', 'KSeF'],
    pracownicy: 30, zasoby: { stacje: 32, serwery: 2, znane: 0.85 },
    koszt_dnia: 25000, przychod_rok: 6000000, rekordy: 9000,
    wektory: { bec: 2.0, phishing: 0.6, podatnosc: 0.3, uslugi: 0.8, ddos: 0 },
    budzet_rok: 40000, zespol: { fte: 0, h_it: 20 },
    na_starcie: [],
    dlug: ['wspólne hasło do KSeF i bankowości w pliku Excel', 'NAS z kopią w tej samej sieci',
      'prezes czyta pocztę na prywatnym telefonie'],
  },
  wodociagi: {
    nazwa: 'Przedsiębiorstwo Wodociągów i Kanalizacji „Wodnik" sp. z o.o.', rola: 'kampania',
    // 64 osoby = średnie przedsiębiorstwo w sektorze z załącznika → co do zasady podmiot WAŻNY
    // (kluczowy byłby jako duży albo dawny operator usługi kluczowej — 🟡 docs/02-…).
    sektor: 'woda pitna i ścieki', status_ksc: 'wazny', csirt: 'CSIRT INFRASTRUKTURA',
    regulacje: ['KSC', 'RODO', 'prawo wodne / sanepid'],
    pracownicy: 64, zasoby: { stacje: 45, serwery: 6, znane: 0.7 },
    koszt_dnia: 60000, przychod_rok: 28000000, rekordy: 22000,
    wektory: { uslugi: 3.0, phishing: 0.5, bec: 0.8, podatnosc: 0.8, ddos: 0.2 },
    sprawcy: { haktywista: 3.0, apt: 1.5 },
    budzet_rok: 120000, zespol: { fte: 0, h_it: 30 },
    na_starcie: [],
    ot: true,
    dlug: ['panel HMI stacji uzdatniania wystawiony do internetu przez integratora',
      'PIN do sterowników niezmieniony od montażu', 'jeden informatyk na pół etatu',
      'kopia SCADA tylko na laptopie integratora'],
  },
  gmina: {
    nazwa: 'Urząd Gminy Brzozów Wielki', rola: 'kampania',
    sektor: 'administracja publiczna (JST)', status_ksc: 'do_ustalenia', csirt: 'CSIRT NASK',
    regulacje: ['KSC (urząd gminy ≥50 etatów — do weryfikacji)', 'KRI (Dz.U. 2024 poz. 773)', 'RODO', 'Pzp'],
    pracownicy: 82, zasoby: { stacje: 90, serwery: 8, znane: 0.8 },
    koszt_dnia: 40000, przychod_rok: 0, rekordy: 14000,
    wektory: { bec: 1.5, phishing: 0.9, ddos: 0.4, uslugi: 1.2 },
    sprawcy: { haktywista: 1.5 },
    budzet_rok: 60000, zespol: { fte: 0, h_it: 40 },
    na_starcie: ['szkolenia'],
    publiczny: true,
    dlug: ['grant „Cyberbezpieczny Samorząd" rozliczony sprzętem, który leży w kartonach',
      'konto byłego sekretarza aktywne', 'informatyk z umowy zlecenia, 2 dni w tygodniu'],
  },
  szpital: {
    nazwa: 'Samodzielny Publiczny Zespół Opieki Zdrowotnej w Zalesiu', rola: 'kampania',
    sektor: 'ochrona zdrowia', status_ksc: 'kluczowy', csirt: 'CSIRT CeZ',
    regulacje: ['KSC', 'RODO (dane szczególnej kategorii)', 'dokumentacja medyczna', 'wyroby medyczne'],
    pracownicy: 640, zasoby: { stacje: 420, serwery: 40, znane: 0.65 },
    koszt_dnia: 400000, przychod_rok: 190000000, rekordy: 180000,
    wektory: { phishing: 1.4, podatnosc: 1.2, dostawca: 2.0, bec: 1.0, uslugi: 1.2 },
    sprawcy: { ransomware: 1.4 },
    budzet_rok: 350000, zespol: { fte: 1, h_it: 60 },
    na_starcie: ['backup'],
    publiczny: true,
    dlug: ['aparat RTG na Windows 7 bez wsparcia producenta', 'kopia HIS w tej samej domenie',
      'zdalny dostęp dostawcy HIS przez TeamViewer bez MFA', 'lekarze dzielą jedno konto na oddziale'],
  },
  sklep: {
    nazwa: 'SklepMax.pl S.A. (e-commerce + marketplace)', rola: 'kampania',
    sektor: 'handel internetowy', status_ksc: 'do_ustalenia', csirt: 'CSIRT NASK',
    regulacje: ['RODO', 'PCI DSS (karty)', 'KSC? (internetowa platforma handlowa — do oceny)', 'DSA'],
    pracownicy: 140, zasoby: { stacje: 150, serwery: 60, znane: 0.75 },
    koszt_dnia: 550000, przychod_rok: 210000000, rekordy: 1400000,
    wektory: { ddos: 4.0, poswiadczenia: 2.5, podatnosc: 1.5, phishing: 0.8, bec: 0.8 },
    sprawcy: { kradziez: 1.5 },
    budzet_rok: 600000, zespol: { fte: 1, h_it: 60 },
    na_starcie: ['waf_ddos'],
    chmura: true,
    dlug: ['klucze do chmury w repozytorium sprzed 3 lat', 'panel admina sklepu bez MFA',
      'stara wersja sklepu na subdomenie „beta"'],
  },
  softwarehouse: {
    nazwa: 'Kodex Systems sp. z o.o. (SaaS dla przychodni)', rola: 'kampania',
    sektor: 'usługi ICT (B2B)', status_ksc: 'wazny', csirt: 'CSIRT Cyfra',
    regulacje: ['KSC', 'RODO (podmiot przetwarzający)', 'umowy z klientami kluczowymi', 'ISO 27001 (wymóg klientów)'],
    pracownicy: 210, zasoby: { stacje: 230, serwery: 120, znane: 0.7 },
    koszt_dnia: 300000, przychod_rok: 85000000, rekordy: 4000000,
    wektory: { poswiadczenia: 1.8, podatnosc: 1.4, phishing: 1.0, dostawca: 1.5 },
    sprawcy: { kradziez: 1.6, apt: 1.2 },
    budzet_rok: 700000, zespol: { fte: 2, h_it: 80 },
    na_starcie: ['mfa', 'edr'],
    chmura: true, dostawca_dla_innych: true,
    dlug: ['programiści z pełnym dostępem do produkcji', 'testowa baza = kopia produkcyjna z PESEL-ami',
      'jeden klucz API dzielony przez wszystkich klientów'],
  },
  produkcja: {
    nazwa: 'Metalpol S.A. (części dla motoryzacji, Tier-2)', rola: 'kampania',
    sektor: 'produkcja pojazdów (podsektor)', status_ksc: 'wazny', csirt: 'CSIRT NASK',
    regulacje: ['KSC', 'RODO', 'TISAX (wymóg klientów z Niemiec)', 'umowy z karami za przestój'],
    pracownicy: 450, zasoby: { stacje: 300, serwery: 30, znane: 0.8 },
    koszt_dnia: 330000, przychod_rok: 120000000, rekordy: 5000,
    wektory: { phishing: 1.0, podatnosc: 1.0, uslugi: 1.5, bec: 1.5 },
    sprawcy: { ransomware: 1.2 },
    budzet_rok: 450000, zespol: { fte: 1, h_it: 60 },
    na_starcie: [],
    ot: true,
    dlug: ['płaska sieć: biuro i linie produkcyjne w jednej podsieci',
      'zdalny serwis producenta maszyn przez modem 4G w szafie', 'admin domeny = konto prezesa'],
  },
  bank: {
    nazwa: 'Bank Spółdzielczy Nadwarciański', rola: 'kampania',
    sektor: 'bankowość', status_ksc: 'brak (DORA jako lex specialis)', csirt: 'CSIRT KNF',
    regulacje: ['DORA', 'RODO', 'rekomendacje KNF', 'umowa zrzeszenia / IPS'],
    pracownicy: 180, zasoby: { stacje: 200, serwery: 15, znane: 0.9 },
    koszt_dnia: 250000, przychod_rok: 70000000, rekordy: 60000,
    wektory: { phishing: 1.2, bec: 1.2, dostawca: 2.5, poswiadczenia: 1.2 },
    sprawcy: { kradziez: 1.2 },
    budzet_rok: 500000, zespol: { fte: 2, h_it: 40 },
    na_starcie: ['mfa', 'backup', 'szkolenia'],
    dlug: ['system centralny u dostawcy zrzeszenia — ryzyko koncentracji',
      'rejestr umów ICT (DORA) w Excelu, niekompletny'],
  },
  energetyka: {
    nazwa: 'Miejska Elektrociepłownia „Ciepło-Mróz" S.A.', rola: 'kampania_zaawansowana',
    sektor: 'energia (ciepło i prąd)', status_ksc: 'kluczowy', csirt: 'CSIRT NASK / CSIRT GOV przy atakach państwowych',
    regulacje: ['KSC', 'prawo energetyczne', 'CER / infrastruktura krytyczna', 'RODO'],
    pracownicy: 380, zasoby: { stacje: 260, serwery: 70, znane: 0.75 },
    koszt_dnia: 800000, przychod_rok: 400000000, rekordy: 90000,
    wektory: { podatnosc: 1.5, phishing: 1.2, dostawca: 1.5, uslugi: 1.5 },
    sprawcy: { apt: 4.0, haktywista: 2.0 },
    budzet_rok: 1500000, zespol: { fte: 3, h_it: 80 },
    na_starcie: ['mfa', 'backup', 'ngfw', 'plan_ir'],
    ot: true,
    dlug: ['farmy OZE spółki zależnej z routerami z domyślnymi hasłami',
      'stacja inżynierska OT z dostępem do internetu „do aktualizacji"'],
  },
};
