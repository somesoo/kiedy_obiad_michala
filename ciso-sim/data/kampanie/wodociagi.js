// ── KAMPANIA: PWiK „Wodnik" sp. z o.o. (Rzecznów) ──
// Pierwsza kampania gry (decyzja właściciela 13.10.2026). Opis fabularny i uzasadnienia:
// docs/16-kampania-wodociagi.md. Liczbowy profil firmy: data/firmy.js → wodociagi.
// Wszystko fikcyjne: spółka, gmina Rzecznów, ludzie, integrator „AquaSter".
//
// Słownik efektów opcji (wykonuje proto/kampania.js → zastosuj()):
//   zlec: [id kontroli]      — zlecenie wdrożenia (silnik.zlec)
//   etat: n                  — nowy etat
//   h, pln                   — godziny gracza w tym miesiącu, wydatek
//   mandat, reputacja, morale — zmiany wskaźników (−/+)
//   flagi: {…}               — fakty kampanii (wpis złożony, kopie OT u nas…)
//   dzial: { id|'wszystkie': { zaufanie, swiadomosc, zmeczenie } }
//   wektory: { wektor: mnożnik }  — trwała zmiana ekspozycji (silnik.mod.wektory)
//   nieznane: n              — zasoby poza ewidencją (+) albo odkryte (−)
//   intruz: { kto, etap, wektor } — ukryty intruz w silniku (np. odziedziczony po przejęciu)
//   odkryj: true             — przegląd ujawnia ukryte obejścia działów
//   budzet: { rok: kwota }   — budżet bezpieczeństwa na rok
//   pozniej: { karta, za }   — karta wraca za `za` miesięcy
//   ocena: dobra | dopuszczalna | blad; dlaczego — do debriefu i modelu gracza
//
// Karta: { tytul, od, tresc, okno: [od, do], obowiazkowa?, warunek?(k), problemy: [...],
//          cele: [...], opcje: [...] }. `problemy` to tagi diagnozy reżysera (wektory albo
//          'odtwarzanie', 'wykrywanie', 'zgodnosc', 'ludzie', 'dostawcy').

const dz = (zaufanie, swiadomosc) => ({ zaufanie, swiadomosc });

module.exports = {
  firma: 'wodociagi',
  tytul: 'Woda z Rzecznowa',
  start: { rok: 2026, miesiac: 4 },              // M1 = kwiecień 2026 (wejście w życie nowelizacji KSC)
  miesiecy: 24,
  rola: 'informatyk na pół etatu, od dziś także „od NIS2"',
  wstep: [
    'PWiK „Wodnik" sp. z o.o. dostarcza wodę 30 tysiącom mieszkańców gminy Rzecznów i odbiera ścieki.',
    '64 osoby, stacja uzdatniania wody, dwie hydrofornie, 11 przepompowni ścieków. Właściciel: gmina.',
    'Po raporcie ABW o włamaniach do stacji uzdatniania wody w 2025 r. prezes wezwał Cię i powiedział:',
    '„Weszła nowa ustawa. Zrób ten NIS2. Tylko żeby nas nie było w gazecie."',
  ],
  wskazniki: { mandat: 40, reputacja: 60, morale: 60 },
  budzet: { 2026: 90000 },                       // 120 tys./rok, od kwietnia pro rata
  // Godziny gracza na bezpieczeństwo (pół etatu informatyka minus bieżące IT). Dodawane do
  // godzin z profilu firmy (data/firmy.js → zespol.h_it to to, co oddają inni).
  h_gracza: 40,

  // ── DZIAŁY (agenci, docs/15-…) ──
  dzialy: {
    zarzad: {
      nazwa: 'Zarząd', szef: 'Prezes Tadeusz Wrona',
      osobowosc: 'inżynier sanitarny, pragmatyk; boi się kompromitacji w lokalnej gazecie bardziej niż hakerów',
      cele: { reputacja: 0.9, koszt: 0.6, spokoj: 0.7, zgodnosc: 0.4 },
      ...dz(0.5, 0.2), aktywnosc: 0.25,
      inicjatywy: ['kamera_tania', 'czat_ai'],
      kpi: { nazwa: 'skargi mieszkańców do gminy', baza: 4, lepiej: 'mniej' },
    },
    finanse: {
      nazwa: 'Dział Finansowo-Księgowy', szef: 'Główna księgowa Halina Sosnowska',
      osobowosc: 'liczy każdą złotówkę; jeśli ją przekonasz, będzie najlepszą strażniczką procedur',
      cele: { koszt: 0.9, terminy: 0.8, wygoda: 0.3 },
      ...dz(0.4, 0.25), aktywnosc: 0.3,
      inicjatywy: ['zmiana_banku', 'praca_zdalna', 'czat_ai'],
      kpi: { nazwa: 'płatności po terminie', baza: 2, lepiej: 'mniej' },
      obciazenie: { 1: 0.4, 2: 0.4, 3: 0.5, 12: 0.3 },   // zamknięcie roku, sprawozdania
    },
    produkcja: {
      nazwa: 'Stacja Uzdatniania Wody', szef: 'Kierownik stacji Marek Lis',
      osobowosc: 'zna każdy zawór i SCADA; nie ufa „informatykom", ufa integratorowi',
      cele: { ciaglosc: 1.0, wygoda: 0.6, koszt: 0.3 },
      ...dz(0.25, 0.15), aktywnosc: 0.35,
      inicjatywy: ['zdalny_integrator', 'pendrive_integratora', 'kamera_tania'],
      kpi: { nazwa: 'zakłócenia procesu uzdatniania', baza: 1, lepiej: 'mniej' },
      obciazenie: { 6: 0.3, 7: 0.4, 8: 0.4 },             // upały, szczyt poboru
    },
    siec: {
      nazwa: 'Dział Sieci i Kanalizacji', szef: 'Kierownik Zbigniew Kruk',
      osobowosc: 'pogotowie wodociągowe, przepompownie, awarie o 3:00 w nocy; chce widzieć wszystko na telefonie',
      cele: { ciaglosc: 0.9, wygoda: 0.5, koszt: 0.4 },
      ...dz(0.35, 0.1), aktywnosc: 0.35,
      inicjatywy: ['modemy_4g', 'konto_wspolne', 'dysk_prywatny'],
      kpi: { nazwa: 'awarie sieci', baza: 6, lepiej: 'mniej' },
      obciazenie: { 1: 0.4, 2: 0.4, 7: 0.3, 8: 0.3, 12: 0.3 },
    },
    bok: {
      nazwa: 'Biuro Obsługi Klienta i Rozliczeń', szef: 'Kierowniczka Agnieszka Mróz',
      osobowosc: 'chce nowoczesnego e-BOK-a i krótszych kolejek; szybko wdraża nowinki',
      cele: { klienci: 0.9, terminy: 0.7, wygoda: 0.5 },
      ...dz(0.45, 0.25), aktywnosc: 0.4,
      inicjatywy: ['ebok_saas', 'czat_ai', 'laptopy_market', 'dysk_prywatny'],
      kpi: { nazwa: 'reklamacje rachunków', baza: 12, lepiej: 'mniej' },
      obciazenie: { 1: 0.3, 4: 0.2, 7: 0.2, 10: 0.2 },    // okresy rozliczeń
    },
    kadry: {
      nazwa: 'Kadry i Administracja', szef: 'Specjalistka ds. kadr Ewa Wilk',
      osobowosc: 'pilnuje terminów i przepisów; IT dowiaduje się o odejściach „przy okazji"',
      cele: { terminy: 0.7, koszt: 0.5, wygoda: 0.5, zgodnosc: 0.5 },
      ...dz(0.5, 0.3), aktywnosc: 0.25,
      inicjatywy: ['konto_wspolne', 'laptopy_market', 'czat_ai'],
      kpi: { nazwa: 'otwarte rekrutacje', baza: 1, lepiej: 'mniej' },
      obciazenie: { 5: 0.3, 6: 0.3 },                     // sezonowi
    },
  },

  // ── OŚ KAMPANII (zdarzenia skryptowe; reżyser wybiera moment w oknie) ──
  zdarzenia: [
    { id: 'S03', typ: 'scenariusz', okno: [3, 5], ciezar: 1.0, cele: ['E4', 'E12', 'E6', 'E10'],
      // Okno startuje miesiąc PO ostrzeżeniu CERT (m. 2): gracz musi mieć uczciwą szansę zareagować.
      opis: 'haktywiści na panelu HMI stacji (wariant „próba", jeśli panel już zamknięty)' },
    { id: 'S01', typ: 'scenariusz', okno: [3, 6], ciezar: 0.6, cele: ['E2', 'E6', 'E10'],
      opis: 'BEC: dostawca chemii „zmienia rachunek" (92 300 zł)' },
    { id: 'K_wykaz', typ: 'karta', okno: [7, 7], ciezar: 0.5, warunek: k => !k.flagi.wpis },
    { id: 'K_budzet2027', typ: 'karta', okno: [8, 8], ciezar: 0.3 },
    { id: 'K_przejecie', typ: 'karta', okno: [9, 9], ciezar: 0.5 },
    { id: 'K_umowa_integratora', typ: 'karta', okno: [12, 12], ciezar: 0.3 },
    { id: 'T_szbi', typ: 'termin', okno: [13, 13], ciezar: 0.3,
      opis: '3.04.2027 — termin wdrożenia obowiązków (SZBI)' },
    { id: 'K_dwr', typ: 'karta', okno: [14, 14], ciezar: 0.4, szansa: 0.3 },
    { id: 'K_wodomierze', typ: 'karta', okno: [15, 16], ciezar: 0.3 },
    { id: 'F_haktywisci2', typ: 'fala', okno: [15, 20], ciezar: 0.8,
      opis: 'druga fala haktywistów: DDoS na e-BOK i próba na przepompownię' },
    { id: 'K_emerytura', typ: 'karta', okno: [17, 17], ciezar: 0.3 },
    { id: 'K_falszywy_komunikat', typ: 'karta', okno: [19, 21], ciezar: 0.6 },
    { id: 'A_kontrola', typ: 'final', okno: [23, 24], ciezar: 0.8,
      opis: 'audyt na żądanie organu (podmiot ważny po poważnym incydencie) albo przegląd roczny SZBI' },
  ],

  // ── KARTY ──
  karty: {
    K_samoidentyfikacja: {
      tytul: 'Czy podlegamy KSC?', od: 'Zarząd', okno: [1, 1], obowiazkowa: true,
      tresc: 'Prezes: „Kolega z innych wodociągów mówi, że NIS2 jest dla dużych. My mamy 64 osoby. Podlegamy czy nie?"',
      problemy: ['zgodnosc'], cele: ['E6', 'E7'],
      opcje: [
        { tekst: 'Analiza: woda pitna to sektor z załącznika, 64 osoby = średnie przedsiębiorstwo → podmiot ważny. Wniosek o wpis przez S46 do 3.10.2026.',
          h: 8, mandat: 2, flagi: { status: 'wazny', wpis: true }, ocena: 'dobra',
          dlaczego: 'Samoidentyfikacja: status wynika z ustawy (sektor + wielkość). Wpis jest deklaratoryjny, ale obowiązkowy w terminie.' },
        { tekst: 'Na wszelki wypadek zgłośmy się jako podmiot kluczowy.',
          h: 6, flagi: { status: 'kluczowy', wpis: true }, ocena: 'dopuszczalna',
          dlaczego: 'Bezpieczne prawnie, ale błędna kwalifikacja: kluczowy to zwykle duże przedsiębiorstwo albo dawny operator usługi kluczowej. Więcej obowiązków (audyt co 3 lata) bez potrzeby.' },
        { tekst: 'Prezes ma rację — nas to nie dotyczy.',
          mandat: 3, flagi: { status: 'brak' }, ocena: 'blad',
          dlaczego: 'Wielkość liczy się według progów (od 50 osób), a sektor wody jest w ustawie. Brak wpisu to ryzyko kary dla spółki i osobiście dla kierownika.' },
      ],
    },
    K_ostrzezenie_cert: {
      tytul: 'Ostrzeżenie: haktywiści skanują systemy sterowania', od: 'CERT Polska / CSIRT INFRASTRUKTURA', okno: [2, 2], obowiazkowa: true,
      tresc: 'Ostrzeżenie dla sektora wodnego: grupy prorosyjskie wyszukują w internecie panele HMI i sterowniki z domyślnymi hasłami. Zalecenie: natychmiast sprawdzić, co jest widoczne z internetu.',
      problemy: ['uslugi'], cele: ['E4'],
      opcje: [
        { tekst: 'Dziś: przegląd ekspozycji (moje.cert.pl + router stacji + pytanie do integratora o przekierowania portów).',
          h: 12, zlec: ['ekspozycja', 'moje_cert'], ocena: 'dobra',
          dlaczego: 'Ostrzeżenie z nazwą Twojego sektora to sygnał do działania tego samego dnia. Panel HMI w internecie to dokładnie ten wzorzec z 2025 r.' },
        { tekst: 'Przekażę kierownikowi stacji, niech sprawdzi.',
          h: 1, dzial: { produkcja: { swiadomosc: 0.05 } }, ocena: 'dopuszczalna',
          dlaczego: 'Kierownik nie wie, co integrator wystawił do internetu. Delegowanie bez sprawdzenia to nadzieja, nie kontrola.' },
        { tekst: 'Odnotować — mamy ważniejsze sprawy.',
          ocena: 'blad', dlaczego: 'Ignorowanie wyraźnego ostrzeżenia dla własnego sektora jest błędem niezależnie od tego, czy coś się potem stanie.' },
      ],
    },
    K_inwentaryzacja: {
      tytul: 'Co my właściwie mamy?', od: 'Ty (notatka)', okno: [1, 10],
      tresc: 'Ewidencja sprzętu to arkusz z 2019 r. Nie wiesz, ile urządzeń jest w sieci stacji i przepompowni ani kto ma do nich dostęp.',
      problemy: ['uslugi', 'podatnosc', 'wykrywanie'], cele: ['E4'],
      opcje: [
        { tekst: 'Inwentaryzacja: skan sieci biurowej, pasywny spis sieci OT z kierownikiem stacji, rejestr dostępów zewnętrznych.',
          zlec: ['inwentaryzacja'], dzial: { produkcja: { zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'Nie da się chronić tego, o czym się nie wie. W OT tylko pasywnie i z automatykiem.' },
        { tekst: 'Aktywny skan całej sieci, łącznie ze sterownikami — szybciej.',
          zlec: ['inwentaryzacja'], h: 4, dzial: { produkcja: { zaufanie: -0.15 } }, reputacja: -2, ocena: 'blad',
          dlaczego: 'Aktywne skanowanie starszych sterowników potrafi je zawiesić. Kierownik stacji to zapamięta.' },
        { tekst: 'Później, najpierw polityki.', ocena: 'dopuszczalna',
          dlaczego: 'Polityki są potrzebne, ale bez wiedzy o zasobach opisują firmę, której nie znasz.' },
      ],
    },
    K_mfa: {
      tytul: 'MFA na poczcie i zdalnym dostępie', od: 'Ty (notatka)', okno: [2, 14],
      tresc: 'Poczta w chmurze i VPN dla kierowników działają na samo hasło. Terenowcy logują się z telefonów.',
      problemy: ['poswiadczenia', 'phishing', 'bec'], cele: ['E2', 'E9'],
      opcje: [
        { tekst: 'MFA dla wszystkich, z aplikacją (dopasowanie numeru) i krótką instrukcją dla terenowców; zarząd też.',
          zlec: ['mfa'], mandat: -2, dzial: { siec: { zmeczenie: 0.1 } }, ocena: 'dobra',
          dlaczego: 'Najtańsza z dużych kontroli. Bez wyjątków dla zarządu — to ich konta są najcenniejsze.' },
        { tekst: 'MFA dla wszystkich oprócz zarządu.',
          zlec: ['mfa'], mandat: 1, flagi: { wyjatek_mfa_zarzad: true }, ocena: 'dopuszczalna',
          dlaczego: 'Wyjątek dla zarządu zostawia otwarte najcenniejsze konta (wraca w scenariuszach „na prezesa").' },
        { tekst: 'Najpierw szkolenia, MFA za rok.', ocena: 'blad',
          dlaczego: 'Szkolenie nie zastąpi drugiego składnika — przejęte hasło to wciąż otwarte drzwi.' },
      ],
    },
    K_procedura_platnosci: {
      tytul: 'Kto może zmienić rachunek kontrahenta?', od: 'Dział Finansowo-Księgowy', okno: [2, 12],
      tresc: 'Główna księgowa: „Kontrahenci czasem przysyłają nowe numery kont mailem. Wpisujemy i płacimy, tak było zawsze."',
      problemy: ['bec'], cele: ['E2'],
      opcje: [
        { tekst: 'Procedura: oddzwonienie na numer z kartoteki, sprawdzenie w białej liście VAT, druga osoba zatwierdza nowy rachunek. Uzgodnione z księgową.',
          zlec: ['weryfikacja_platnosci'], h: 4, dzial: { finanse: { zaufanie: 0.1, swiadomosc: 0.15 } }, ocena: 'dobra',
          dlaczego: 'Zero złotych, najlepszy stosunek efektu do kosztu w grze. Uzgodnienie z księgową sprawia, że procedura będzie żyła.' },
        { tekst: 'Wydać zarządzenie prezesa bez rozmowy z działem.',
          zlec: ['weryfikacja_platnosci'], dzial: { finanse: { zaufanie: -0.1, zmeczenie: 0.1 } }, ocena: 'dopuszczalna',
          dlaczego: 'Procedura jest, ale narzucona — szybciej obrośnie wyjątkami.' },
        { tekst: 'To sprawa księgowości, nie bezpieczeństwa.', ocena: 'blad',
          dlaczego: 'BEC to jeden z najczęstszych realnych ataków na firmy i JST. Filtr pocztowy nie zatrzyma maila z prawdziwej, przejętej skrzynki kontrahenta.' },
      ],
    },
    K_kopie_ot: {
      tytul: 'Kopia konfiguracji SCADA jest tylko u integratora', od: 'Stacja Uzdatniania Wody', okno: [2, 12],
      tresc: 'Kierownik stacji: „Projekty wizualizacji i programy sterowników ma integrator na laptopie. Jak coś padnie, przyjedzie i wgra."',
      problemy: ['odtwarzanie', 'dostawcy'], cele: ['E12', 'E8'],
      opcje: [
        { tekst: 'Pozyskać od integratora aktualne kopie projektów i konfiguracji, trzymać offline u nas, sprawdzać co kwartał; kopie systemów biurowych 3-2-1-1-0.',
          zlec: ['backup'], h: 10, flagi: { kopie_ot: true }, dzial: { produkcja: { zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'Jeśli laptop integratora zginie albo integrator zniknie, stacja nie ma z czego się odbudować.' },
        { tekst: 'Tylko kopie systemów biurowych.', zlec: ['backup'], ocena: 'dopuszczalna',
          dlaczego: 'Biuro ochronione, ale najważniejszy proces dalej zależy od jednego laptopa.' },
        { tekst: 'Integrator jest niezawodny, zostawmy.', ocena: 'blad',
          dlaczego: 'Pojedynczy punkt awarii w łańcuchu dostaw najważniejszej usługi.' },
      ],
    },
    K_plan_ir_bcp: {
      tytul: 'Co robimy, gdy SCADA padnie?', od: 'Ty (notatka)', okno: [3, 14],
      tresc: 'Nie ma planu reagowania ani spisanej procedury pracy ręcznej stacji. Operatorzy „wiedzą", ale nikt tego nie ćwiczył.',
      problemy: ['odtwarzanie', 'uslugi'], cele: ['E12', 'E5'],
      opcje: [
        { tekst: 'Plan reagowania (kto, kiedy, kontakty na papierze, CSIRT INFRASTRUKTURA) + procedura pracy ręcznej przećwiczona ze zmianą.',
          zlec: ['plan_ir', 'bcp'], dzial: { produkcja: { zaufanie: 0.1, swiadomosc: 0.1 } }, ocena: 'dobra',
          dlaczego: 'W OT pierwszą kontrolą bezpieczeństwa jest umiejętność bezpiecznej pracy bez systemu.' },
        { tekst: 'Kupić gotowy plan od firmy doradczej.', pln: 9000, zlec: ['plan_ir'], ocena: 'dopuszczalna',
          dlaczego: 'Plan bez ćwiczenia i bez ludzi ze stacji zostaje na półce.' },
        { tekst: 'Później.', ocena: 'dopuszczalna', dlaczego: 'Każdy miesiąc bez planu to dłuższe pierwsze godziny incydentu.' },
      ],
    },
    K_msp: {
      tytul: 'Oferta: administrator na godziny', od: 'Firma informatyczna z powiatu', okno: [3, 18],
      tresc: 'Lokalna firma oferuje 40 h administracji miesięcznie za 7 000 zł. Masz pół etatu na całe IT i bezpieczeństwo.',
      problemy: ['ludzie', 'wykrywanie'], cele: ['E3'],
      opcje: [
        { tekst: 'Bierzemy — z umową: MFA na ich kontach, osobne konta na osobę, logi dostępu, zgłaszanie incydentów w 24 h.',
          zlec: ['msp'], h: 6, ocena: 'dobra',
          dlaczego: 'W małej firmie godziny są najrzadszym zasobem. Umowa z wymaganiami ogranicza ryzyko, że MSP stanie się wektorem.' },
        { tekst: 'Bierzemy na standardowej umowie.', zlec: ['msp'], wektory: { dostawca: 1.15 }, ocena: 'dopuszczalna',
          dlaczego: 'Godziny są, ale MSP z uprawnieniami admina bez wymagań to nowy, duży wektor (wzorzec Kaseya 2021).' },
        { tekst: 'Damy radę sami.', ocena: 'dopuszczalna', dlaczego: 'Może się udać, jeśli plan jest skromny. Symulacja pokazuje, że zwykle projekty się ślizgają.' },
      ],
    },
    K_edr: {
      tytul: 'Antywirus czy EDR?', od: 'Ty (notatka)', okno: [4, 18],
      tresc: 'Na komputerach jest darmowy antywirus. Oferty EDR: ok. 25 zł/stanowisko/mies. Producent SCADA podaje listę zgodnych rozwiązań dla stacji inżynierskich.',
      problemy: ['wykrywanie', 'phishing'], cele: ['E3', 'E5'],
      opcje: [
        { tekst: 'EDR na komputerach biurowych i serwerach; na stacjach OT tylko z listy producenta, po teście na jednej stacji.',
          zlec: ['edr'], dzial: { produkcja: { zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'EDR działa nawet wtedy, gdy nikt nie patrzy — w ataku na polską energetykę 29.12.2025 zatrzymał niszczenie na ponad 100 maszynach.' },
        { tekst: 'EDR wszędzie od razu, także na stacjach OT.', zlec: ['edr'], dzial: { produkcja: { zaufanie: -0.15 } }, reputacja: -2, ocena: 'dopuszczalna',
          dlaczego: 'Niesprawdzony agent na stacji sterującej może zakłócić proces — kierownik stacji ma rację, że się boi.' },
        { tekst: 'Zostajemy przy darmowym antywirusie.', ocena: 'dopuszczalna',
          dlaczego: 'Taniej teraz, ale symulacja pokazuje, że EDR to najsilniejsza pojedyncza dźwignia po podstawach.' },
      ],
    },
    K_segmentacja: {
      tytul: 'Biuro i stacja w jednej sieci', od: 'Ty (notatka)', okno: [6, 20],
      tresc: 'Komputer w BOK może połączyć się z panelem operatorskim stacji. Oddzielenie sieci OT: ok. 90 tys. zł i 300 h pracy.',
      problemy: ['uslugi', 'odtwarzanie'], cele: ['E12', 'E5'],
      opcje: [
        { tekst: 'Projekt segmentacji: strefa OT za zaporą, jedna kontrolowana strefa pośrednia dla integratora.',
          zlec: ['segmentacja'], mandat: -3, ocena: 'dobra',
          dlaczego: 'Płaska sieć zamienia incydent w biurze w zagrożenie dla uzdatniania wody.' },
        { tekst: 'Wniosek do zarządu o finansowanie w przyszłym roku.', mandat: 1, flagi: { wniosek_segmentacja: true }, ocena: 'dopuszczalna',
          dlaczego: 'Uczciwe przy małym budżecie — pod warunkiem, że ryzyko jest zapisane i zaakceptowane przez zarząd.' },
      ],
    },
    K_szkolenia: {
      tytul: 'Program świadomości', od: 'Kadry i Administracja', okno: [3, 20],
      tresc: 'Kadry pytają, czy w tym roku robimy „to szkolenie z bezpieczeństwa", bo trzeba mieć listę obecności.',
      problemy: ['phishing', 'bec'], cele: ['E2', 'E10'],
      opcje: [
        { tekst: 'Program: krótkie moduły co kwartał, symulacje phishingu bez zawstydzania, prosty sposób zgłaszania; osobny moduł dla terenowców i księgowości.',
          zlec: ['szkolenia'], dzial: { wszystkie: { swiadomosc: 0.12 } }, ocena: 'dobra',
          dlaczego: 'Program zmienia zachowania i daje zgłoszenia od ludzi — szkolenie z listą obecności daje tylko listę.' },
        { tekst: 'Jedno szkolenie e-learningowe z testem.', pln: 3000, dzial: { wszystkie: { swiadomosc: 0.04 } }, ocena: 'dopuszczalna',
          dlaczego: 'Zgodność tak, zmiana zachowań — niewielka; wiedza wietrzeje w kilka miesięcy.' },
      ],
    },
    K_szkolenie_kierownika: {
      tytul: 'Coroczne szkolenie kierownika podmiotu', od: 'Zarząd', okno: [3, 9], powtorz_w: 12,
      tresc: 'Ustawa wymaga, żeby kierownik podmiotu raz w roku przeszedł szkolenie z cyberbezpieczeństwa i miał to udokumentowane. Prezes: „Nie mam czasu."',
      problemy: ['zgodnosc'], cele: ['E7'],
      opcje: [
        { tekst: 'Krótkie szkolenie dla zarządu z ćwiczeniem na przykładzie z sektora (2 h) + zaświadczenie.',
          h: 6, pln: 2500, mandat: 3, flagi: { szkolenie_kierownika: true }, dzial: { zarzad: { swiadomosc: 0.2 } }, ocena: 'dobra',
          dlaczego: 'Obowiązek ustawowy z osobistą odpowiedzialnością kierownika. Ćwiczenie na przykładzie z własnego sektora przekonuje lepiej niż slajdy.' },
        { tekst: 'Przesunąć na koniec roku.', pozniej: { karta: 'K_szkolenie_kierownika', za: 3 }, ocena: 'dopuszczalna',
          dlaczego: 'Można, ale obowiązek jest w roku kalendarzowym — i zwykle przesuwa się w nieskończoność.' },
      ],
    },
    K_szbi: {
      tytul: 'SZBI do 3 kwietnia 2027', od: 'Zarząd', okno: [5, 12],
      tresc: 'Do 3.04.2027 trzeba wdrożyć system zarządzania bezpieczeństwem informacji: ryzyko, polityki, ciągłość, dostawcy, przeglądy.',
      problemy: ['zgodnosc'], cele: ['E11', 'E1'],
      opcje: [
        { tekst: 'SZBI na miarę firmy: szacowanie ryzyka z kierownikami działów, krótkie polityki, rejestr dostawców; doradca na 10 dni.',
          zlec: ['szbi', 'ryzyko', 'dostawcy'], pln: 20000, dzial: { wszystkie: { zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'Ryzyko szacowane z ludźmi z działów daje właścicieli ryzyk i lepsze decyzje — i dowody na audyt.' },
        { tekst: 'Kupić komplet „polityk pod NIS2" za 9 900 zł.', pln: 9900, zlec: ['szbi'], flagi: { polityki_z_pudelka: true }, ocena: 'dopuszczalna',
          dlaczego: 'Szybko i tanio na papierze; dokumenty nie pasują do firmy i nikt ich nie stosuje — audyt zapyta o dowody.' },
        { tekst: 'Zrobię to sam, wieczorami.', zlec: ['szbi'], morale: -10, ocena: 'dopuszczalna',
          dlaczego: '400 godzin pół etatu to rok pracy, którego nie masz. Projekt się rozjedzie, a Ty się wypalisz.' },
      ],
    },
    K_wykaz: {
      tytul: 'Termin wpisu minął 3 października', od: 'Radca prawny', okno: [7, 7],
      tresc: 'Nowy radca prawny pyta, czy jesteśmy w wykazie podmiotów kluczowych i ważnych. Nie jesteśmy. Prezes: „Kary i tak są od 2028, po co się wychylać?"',
      problemy: ['zgodnosc'], cele: ['E6', 'E7'],
      opcje: [
        { tekst: 'Notatka do zarządu (status z ustawy, obowiązki biegną, odpowiedzialność kierownika) i spóźniony wniosek w S46.',
          h: 6, mandat: -3, flagi: { wpis: true, wpis_spozniony: true }, ocena: 'dobra',
          dlaczego: 'Wpis jest deklaratoryjny — spóźniony jest lepszy niż żaden; obowiązki istnieją niezależnie od wpisu.' },
        { tekst: 'Prezes ma rację, poczekajmy.', mandat: 2, ocena: 'blad',
          dlaczego: 'Status wynika z ustawy. Przemilczenie przenosi ryzyko na kierownika i na Ciebie.' },
      ],
    },
    K_budzet2027: {
      tytul: 'Budżet bezpieczeństwa na 2027', od: 'Zarząd', okno: [8, 8], obowiazkowa: true,
      tresc: 'Zgromadzenie wspólników (gmina) zatwierdza plan na 2027. Prezes pyta, ile potrzebujesz i dlaczego.',
      problemy: ['zgodnosc', 'ludzie'], cele: ['E1', 'E7'],
      opcje: [
        { tekst: 'Wniosek oparty na ryzyku: 3 największe ryzyka w złotówkach, co kupujemy, czego nie (akceptacja ryzyka) — 220 tys. zł.',
          budzet: { 2027: 220000 }, mandat: 4, ocena: 'dobra',
          dlaczego: 'Zarząd decyduje lepiej, gdy widzi ryzyko w złotówkach i wie, co świadomie akceptuje.' },
        { tekst: 'Tyle co w tym roku (120 tys. zł).', budzet: { 2027: 120000 }, ocena: 'dopuszczalna',
          dlaczego: 'Bezpieczne politycznie; może nie wystarczyć na SZBI i segmentację.' },
        { tekst: 'Prośba o 400 tys. zł „bo NIS2 i hakerzy".', budzet: { 2027: 150000 }, mandat: -6, ocena: 'blad',
          dlaczego: 'Straszenie bez danych kosztuje zaufanie — dostajesz mniej, niż przy rzeczowym wniosku.' },
      ],
    },
    K_przejecie: {
      tytul: 'Przejmujemy oczyszczalnię z gminy sąsiedniej', od: 'Zarząd', okno: [9, 9], obowiazkowa: true,
      tresc: 'Od stycznia „Wodnik" przejmuje oczyszczalnię ścieków gminy Lipno. Mają własną SCADA, dwóch ludzi i „informatyka z urzędu". Sieć łączymy w styczniu.',
      problemy: ['uslugi', 'dostawcy'], cele: ['E4', 'E8'],
      opcje: [
        { tekst: 'Przed połączeniem: przegląd bezpieczeństwa oczyszczalni (zasoby, dostępy, ślady włamań), połączenie przez zaporę dopiero po porządkach.',
          h: 40, pln: 20000, flagi: { oczyszczalnia_sprawdzona: true }, ocena: 'dobra',
          dlaczego: 'Przejmując firmę, przejmujesz też jej intruzów. Najpierw ocena i izolacja, potem połączenie.' },
        { tekst: 'Łączymy od razu, sprawdzimy po drodze.',
          nieznane: 12, wektory: { uslugi: 1.2 }, intruz: { kto: 'broker', etap: 'dostep', wektor: 'uslugi' }, ocena: 'blad',
          dlaczego: 'W przejętej sieci od miesięcy siedział broker dostępu — połączenie wpuściło go do Waszej.' },
      ],
    },
    K_umowa_integratora: {
      tytul: 'Odnowienie umowy z integratorem SCADA', od: 'Stacja Uzdatniania Wody', okno: [12, 12], obowiazkowa: true,
      tresc: 'Umowa serwisowa z AquaSter kończy się w marcu. Kierownik stacji chce przedłużyć „jak zawsze".',
      problemy: ['dostawcy', 'uslugi'], cele: ['E8'],
      opcje: [
        { tekst: 'Przedłużyć z klauzulami: MFA i osobne konta, zgłaszanie incydentów w 24 h, kopie projektów u nas, prawo audytu, zakaz przekierowań portów.',
          h: 10, wektory: { dostawca: 0.8 }, flagi: { umowa_integratora: true }, dzial: { produkcja: { zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'Umowa to jedyne realne narzędzie wobec dostawcy. Najlepszy moment na wymagania to odnowienie.' },
        { tekst: 'Przedłużyć jak zawsze.', ocena: 'dopuszczalna', dlaczego: 'Spokój teraz, brak wpływu, gdy integrator stanie się wektorem.' },
      ],
    },
    K_dwr: {
      tytul: 'Postępowanie wobec producenta Waszych routerów', od: 'Media / komunikat ministerstwa', okno: [14, 14],
      tresc: 'Wszczęto postępowanie w sprawie uznania producenta popularnych routerów za dostawcę wysokiego ryzyka. Używacie ich w przepompowniach. Ile ich jest?',
      problemy: ['dostawcy', 'zgodnosc'], cele: ['E4', 'E8'],
      opcje: [
        { tekst: 'Z ewidencji: lista urządzeń, plan wymiany w budżecie na wypadek decyzji, do tego czasu bez dostępu z internetu.',
          h: 12, ocena: 'dobra', dlaczego: 'Z inwentaryzacją to godzina pracy; bez niej — tygodnie chodzenia po przepompowniach.' },
        { tekst: 'Poczekamy na decyzję.', ocena: 'dopuszczalna', dlaczego: 'Decyzja może dać krótki termin; bez listy urządzeń plan powstaje w panice.' },
      ],
    },
    K_wodomierze: {
      tytul: 'Inteligentne wodomierze', od: 'Biuro Obsługi Klienta i Rozliczeń', okno: [15, 16], obowiazkowa: true,
      tresc: 'BOK z zarządem wybrał system zdalnego odczytu 9 000 wodomierzy (radio + chmura dostawcy). Dane godzinowe o zużyciu — „przyda się do wykrywania wycieków".',
      problemy: ['dostawcy', 'poswiadczenia'], cele: ['E8', 'E11'],
      opcje: [
        { tekst: 'Ocena skutków dla ochrony danych (dane godzinowe zdradzają, kiedy ktoś jest w domu), ocena dostawcy, umowa powierzenia, minimalizacja danych.',
          h: 24, dzial: { bok: { zaufanie: 0.1 } }, wektory: { dostawca: 1.05 }, ocena: 'dobra',
          dlaczego: 'Nowy projekt cyfrowy to nowe dane osobowe i nowy dostawca — taniej ocenić przed podpisaniem niż po.' },
        { tekst: 'Projekt biznesowy — nie mieszam się.', wektory: { dostawca: 1.3, poswiadczenia: 1.1 }, ocena: 'blad',
          dlaczego: 'Bezpieczeństwo w projektowaniu kosztuje mało; dorabiane po wdrożeniu — dużo.' },
      ],
    },
    K_emerytura: {
      tytul: 'Kierownik stacji odchodzi na emeryturę', od: 'Kadry i Administracja', okno: [17, 17], obowiazkowa: true,
      tresc: 'Marek Lis za 3 miesiące przechodzi na emeryturę. Zna hasła, nastawy i „gdzie co jest". Następca jest z zewnątrz.',
      problemy: ['ludzie', 'odtwarzanie'], cele: ['E12'],
      opcje: [
        { tekst: 'Przekazanie wiedzy: dokumentacja nastaw i dostępów, zmiana wszystkich haseł po przekazaniu, konta imienne dla następcy.',
          h: 30, flagi: { wiedza_przekazana: true }, ocena: 'dobra',
          dlaczego: 'Ryzyko jednej osoby to też bezpieczeństwo: wiedza i hasła nie mogą odejść razem z człowiekiem.' },
        { tekst: 'Niech przekaże następcy „po swojemu".', ocena: 'dopuszczalna', dlaczego: 'Część wiedzy przepadnie, a hasła zostaną te same.' },
      ],
    },
    K_falszywy_komunikat: {
      tytul: '„Woda w Rzecznowie skażona — nie pić!"', od: 'Media społecznościowe', okno: [19, 21],
      tresc: 'W lokalnej grupie krąży „komunikat spółki" z logo: skażenie wody, nie pić do odwołania. Ludzie wykupują wodę butelkowaną. Wyniki badań są w normie.',
      problemy: ['reputacja'], cele: ['E10'],
      opcje: [
        { tekst: 'Dementi w 30 minut wszystkimi kanałami (strona, SMS gminy, media), z wynikami badań i numerem telefonu; zgłoszenie fałszywki do platformy i CERT Polska.',
          h: 6, reputacja: 4, mandat: 2, ocena: 'dobra',
          dlaczego: 'Dezinformacja wygrywa czasem. Szybkie, konkretne dementi z danymi gasi ją najskuteczniej.' },
        { tekst: 'Poczekać, aż samo ucichnie.', reputacja: -10, ocena: 'blad', dlaczego: 'Cisza wygląda jak potwierdzenie.' },
      ],
    },
    K_ubezpieczenie: {
      tytul: 'Ubezpieczenie cyber', od: 'Broker ubezpieczeniowy', okno: [10, 16],
      tresc: 'Polisa 2 mln zł za ok. 5 000 zł/mies. Ankieta: „Czy wszystkie konta mają MFA? Czy macie EDR? Czy kopie są offline?"',
      problemy: ['odtwarzanie'], cele: ['E1'],
      opcje: [
        { tekst: 'Odpowiedzieć zgodnie z prawdą; kupić, jeśli warunki pozwolą.', zlec: ['ubezpieczenie'], ocena: 'dobra',
          dlaczego: 'Polisa działa tylko przy prawdziwej ankiecie.' },
        { tekst: 'Zaznaczyć „tak" wszędzie — i tak to wdrażamy.', zlec: ['ubezpieczenie'], flagi: { klamstwo_ankieta: true }, ocena: 'blad',
          dlaczego: 'Nieprawdziwa ankieta to odmowa wypłaty dokładnie wtedy, gdy polisa jest potrzebna.' },
        { tekst: 'Nie teraz.', ocena: 'dopuszczalna', dlaczego: 'Polisa to transfer ryzyka, nie obowiązek.' },
      ],
    },
    K_latki: {
      tytul: 'Łatki „kiedy będzie czas"', od: 'Ty (notatka)', okno: [3, 16],
      tresc: 'Serwery i komputery są łatane nieregularnie, router brzegowy ma oprogramowanie sprzed dwóch lat. Systemu SCADA „nie wolno ruszać".',
      problemy: ['podatnosc'], cele: ['E2', 'E12'],
      opcje: [
        { tekst: 'Proces łatania: okno serwisowe co miesiąc, krytyczne brzegowe w 72 h; SCADA — tylko poprawki zatwierdzone przez producenta, z integratorem, plus odcięcie od internetu jako kontrola kompensująca.',
          zlec: ['patch'], dzial: { produkcja: { zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'Urządzenia brzegowe to jedne z najczęściej atakowanych drzwi. Systemy „nietykalne" chroni się inaczej, ale się je chroni.' },
        { tekst: 'Łatać wszystko co tydzień, także stacje SCADA.', zlec: ['patch'], dzial: { produkcja: { zaufanie: -0.2 } }, reputacja: -2, ocena: 'dopuszczalna',
          dlaczego: 'Niezatwierdzona poprawka na stacji sterującej potrafi zatrzymać proces — kierownik stacji to zapamięta.' },
        { tekst: 'Zostawić automatyczne aktualizacje Windows i tyle.', ocena: 'blad',
          dlaczego: 'Router brzegowy i serwery bez procesu łatania zostają z publicznie znanymi dziurami.' },
      ],
    },
    K_polityka_zakupow: {
      tytul: 'Działy kupują i wdrażają „po swojemu"', od: 'Ty (notatka)', okno: [4, 20],
      warunek: k => Object.values(k.dzialy).some(d => d.ukryte.some(u => u.odkryte)) || k.m >= 8,
      tresc: 'Kolejne narzędzia i urządzenia pojawiają się bez Twojej wiedzy. Prezes pyta, czy da się to uporządkować bez blokowania pracy.',
      problemy: ['dostawcy', 'uslugi'], cele: ['E9', 'E11'],
      opcje: [
        { tekst: 'Zasada zakupów IT: każdy zakup/usługa z krótką opinią bezpieczeństwa, szybka ścieżka 48 h, lista gotowych „bezpiecznych" rozwiązań.',
          h: 12, mandat: 1, flagi: { polityka_zakupow: true }, dzial: { wszystkie: { zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'Szybka ścieżka sprawia, że pytanie się opłaca. Same zakazy przenoszą zakupy do szarej strefy.' },
        { tekst: 'Zarządzenie prezesa: zakaz zakupów IT bez zgody IT.', mandat: -2, flagi: { polityka_zakupow: true }, dzial: { wszystkie: { zmeczenie: 0.15, zaufanie: -0.05 } }, ocena: 'dopuszczalna',
          dlaczego: 'Zakaz działa na papierze, ale bez szybkiej ścieżki działy będą go obchodzić, gdy coś jest pilne.' },
      ],
    },
    K_integrator_haslo: {
      tytul: '„Dzień dobry, AquaSter, potrzebujemy hasła do panelu"', od: 'Telefon na stacji', okno: [3, 15],
      tresc: 'Operator nocnej zmiany dzwoni do Ciebie o 22:10: „serwis integratora" prosi o aktualne hasło do panelu HMI, „bo robimy zdalną aktualizację". Podać?',
      problemy: ['uslugi', 'dostawcy'], cele: ['E8', 'E2'],
      opcje: [
        { tekst: 'Zasada: hasła nigdy przez telefon; oddzwonić do integratora na znany numer. Integrator nic nie wie — zgłoszenie do CSIRT INFRASTRUKTURA.',
          h: 2, dzial: { produkcja: { swiadomosc: 0.15, zaufanie: 0.05 } }, ocena: 'dobra',
          dlaczego: 'Socjotechnika na zmianie nocnej to realny wzorzec. Weryfikacja innym kanałem kosztuje minutę.' },
        { tekst: 'Niech poda — to przecież integrator.', wektory: { uslugi: 1.3 }, intruz: { kto: 'haktywista', etap: 'eskalacja', wektor: 'uslugi' }, ocena: 'blad',
          dlaczego: 'Dzwoniący nie był integratorem. Ma teraz hasło do sterowania stacją.' },
      ],
    },
  },
};
