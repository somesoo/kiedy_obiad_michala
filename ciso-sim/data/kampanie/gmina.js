// ── KAMPANIA: Urząd Gminy Brzozów Wielki ──
// Druga kampania gry. Projekt: docs/09-firmy-kampanie.md (sekcja 2), opis i wyniki:
// docs/19-kampania-gmina.md; silnik ruchów: docs/18-silnik-ruchow.md. Liczbowy profil:
// data/firmy.js → gmina. Wszystko fikcyjne: gmina, ludzie, dostawcy, webmaster.
//
// Format jak w data/kampanie/wodociagi.js: kampania opisuje ŚWIAT (działy, fakty, obserwacje,
// sprawy z terminami, oś zdarzeń), a nie odpowiedzi. Różnice wobec Wodnika:
//   • nie ma sieci przemysłowej (OT) — ruchy i warianty OT znikają,
//   • jednostka publiczna: zamówienia ponad próg Pzp idą przez przetarg (proto/ruchy.js),
//   • sprzęt z grantu leży w kartonach (`kupione`) — płacisz tylko pracą, a operator programu
//     kontroluje trwałość projektu,
//   • budżet uchwala rada, wójt myśli kadencją, skarbnik kontrasygnuje każdą płatność.

const dz = (zaufanie, swiadomosc) => ({ zaufanie, swiadomosc });

module.exports = {
  firma: 'gmina',
  tytul: 'Gmina Brzozów Wielki',
  start: { rok: 2026, miesiac: 4 },              // M1 = kwiecień 2026 (wejście w życie nowelizacji KSC)
  miesiecy: 24,
  rola: 'jedyny etatowy informatyk urzędu, z „przydziałem cyber" od sekretarza',
  wstep: [
    'Urząd Gminy Brzozów Wielki: 82 etaty, 14 tysięcy mieszkańców, USC, podatki, inwestycje, obsługa rady gminy.',
    'Jesteś jedynym etatowym informatykiem. Drugi, pan Darek, pracuje z umowy zlecenia dwa dni w tygodniu.',
    'W serwerowni stoją kartony z grantu „Cyberbezpieczny Samorząd": zapora i serwer kopii. Rozliczone, niepodłączone.',
    'Sekretarz gminy: „Wójt mówi, że ta nowa ustawa nas nie dotyczy. Sprawdź to — i niech nas nie było w gazecie przed wyborami."',
  ],
  wskazniki: { mandat: 40, reputacja: 55, morale: 60 },
  budzet: { 2026: 45000 },                       // 60 tys./rok, od kwietnia pro rata
  h_gracza: 40,

  // Sprzęt kupiony wcześniej (grant): wdrożenie bez zakupu (proto/ruchy.js → kupione), a
  // subskrypcje (sygnatury zapory, licencja kopii) opłacone z grantu do 15. miesiąca kampanii.
  // Potem sprawa G_licencje: przedłużyć z budżetu gminy, zostać przy wersji podstawowej albo zrezygnować.
  kupione: { ngfw: { licencja_mies: 15 }, backup: { licencja_mies: 15 } },
  // Kontrole działające od startu (z profilu firmy) i ich ustawienia: szkolenie „odhaczane"
  // e-learningiem raz w roku, bo tak rozliczono grant.
  na_starcie: { szkolenia: { forma: 'elearning' } },

  // Ten sam incydent w innej organizacji (proto/incydent.js → kontekst.wariant).
  warianty: {
    S01: { kwota: 480000, kontrahent: 'wykonawca przebudowy drogi gminnej', placi: 'Księgowa referatu finansowego' },
  },

  // Reakcja na ostrzeżenie CERT o wyłudzeniach w samorządach (zasada w proto/zasady.js).
  reakcja_na_ostrzezenie: ['wdroz:weryfikacja_platnosci', 'wdroz:mfa', 'przeglad_dostepow', 'skan_ekspozycji', 'zlec_doradcy', 'szkolenie_dzialu'],
  reakcja_dlaczego: 'Ostrzeżenie z nazwą Twojego sektora to sygnał do działania od razu — wyłudzenia na „zmianę rachunku" wykonawcy to w samorządach wzorzec, nie wyjątek.',

  // ── DZIAŁY (agenci, docs/15-…) ──
  dzialy: {
    zarzad: {
      nazwa: 'Wójt', szef: 'Wójt Bogdan Rataj',
      osobowosc: 'polityk, myśli kadencją; boi się kolejki przed urzędem i artykułu w lokalnym portalu bardziej niż hakerów',
      cele: { reputacja: 1.0, spokoj: 0.8, koszt: 0.6, zgodnosc: 0.3 },
      ...dz(0.45, 0.15), aktywnosc: 0.25,
      inicjatywy: ['kamera_monitoring', 'czat_ai'],
      kpi: { nazwa: 'skargi mieszkańców', baza: 6, lepiej: 'mniej' },
      obciazenie: { 1: 0.3, 2: 0.3 },                     // przed wyborami uzupełniającymi
    },
    kadry: {
      nazwa: 'Sekretariat i Kadry', szef: 'Sekretarz gminy Anna Żak',
      osobowosc: 'Twoja przełożona; przeciążona, ale rzetelna — o odejściach dowiadujesz się od niej „przy kawie"',
      cele: { terminy: 0.8, zgodnosc: 0.6, wygoda: 0.5 },
      ...dz(0.55, 0.3), aktywnosc: 0.3,
      inicjatywy: ['poczta_prywatna_radnych', 'laptopy_market', 'praca_zdalna'],
      kpi: { nazwa: 'uchwały po terminie', baza: 1, lepiej: 'mniej' },
      obciazenie: { 11: 0.3, 12: 0.4 },                   // sesje budżetowe
    },
    finanse: {
      nazwa: 'Skarbnik i Referat Finansowy', szef: 'Skarbnik gminy Teresa Kos',
      osobowosc: 'kontrasygnuje każdą płatność; jeśli ją przekonasz, będzie najlepszą strażniczką procedur',
      cele: { koszt: 0.9, terminy: 0.9, zgodnosc: 0.6 },
      ...dz(0.4, 0.25), aktywnosc: 0.25,
      inicjatywy: ['zdalny_dostawca', 'praca_zdalna', 'czat_ai'],
      kpi: { nazwa: 'płatności po terminie', baza: 2, lepiej: 'mniej' },
      obciazenie: { 1: 0.4, 2: 0.4, 3: 0.3, 10: 0.3, 11: 0.4, 12: 0.4 }, // sprawozdania, projekt budżetu
    },
    podatki: {
      nazwa: 'Referat Podatków i Opłat', szef: 'Kierowniczka Jolanta Brzezińska',
      osobowosc: 'zna każdego płatnika z nazwiska; system podatkowy to dla niej „ten od dostawcy"',
      cele: { terminy: 0.8, klienci: 0.6, wygoda: 0.6 },
      ...dz(0.4, 0.15), aktywnosc: 0.35,
      inicjatywy: ['zdalny_dostawca', 'dysk_prywatny', 'czat_ai'],
      kpi: { nazwa: 'decyzje podatkowe po terminie', baza: 3, lepiej: 'mniej' },
      obciazenie: { 1: 0.4, 2: 0.4, 3: 0.3, 5: 0.2, 9: 0.2, 11: 0.2 }, // wymiar i raty
    },
    usc: {
      nazwa: 'USC i Obsługa Mieszkańców', szef: 'Kierownik USC Piotr Malec',
      osobowosc: 'chce krótszych kolejek i e-usług; szybko wdraża nowinki, PESEL-e wpisuje wszędzie',
      cele: { klienci: 0.9, terminy: 0.7, wygoda: 0.5 },
      ...dz(0.45, 0.2), aktywnosc: 0.4,
      inicjatywy: ['formularz_online', 'dysk_prywatny', 'laptopy_market'],
      kpi: { nazwa: 'czas oczekiwania w kolejce (min)', baza: 25, lepiej: 'mniej' },
      obciazenie: { 6: 0.3, 7: 0.3, 8: 0.3 },             // śluby, wakacje, dowody przed wyjazdami
    },
    inwestycje: {
      nazwa: 'Referat Inwestycji i Gospodarki Komunalnej', szef: 'Kierownik Rafał Sowa',
      osobowosc: 'drogi, kanalizacja, place zabaw; z wykonawcami na „ty", faktury przychodzą mailem',
      cele: { terminy: 0.9, koszt: 0.5, wygoda: 0.6 },
      ...dz(0.35, 0.1), aktywnosc: 0.35,
      inicjatywy: ['kamera_monitoring', 'formularz_online', 'dysk_prywatny'],
      kpi: { nazwa: 'inwestycje po terminie', baza: 2, lepiej: 'mniej' },
      obciazenie: { 5: 0.3, 6: 0.3, 7: 0.3, 8: 0.3, 9: 0.3 }, // sezon budowlany
    },
  },

  // ── FAKTY ŚWIATA (prawda silnika; gracz je ODKRYWA) ──
  // Pola jak w wodociagi.js; dodatkowo: konta/uprawnienia (odkrywa przegląd kont z kadrami),
  // naprawia_wdrozenie (fakt zamyka samo wdrożenie kontroli).
  fakty: {
    zleceniobiorca_admin: { opis: 'informatyk z umowy zlecenia ma uprawnienia administratora domeny i łączy się z domu pulpitem zdalnym, bez MFA',
      prawda: true, dostep_zdalny: true, uprawnienia: true, pilne: true, zna: 'kadry',
      wektory: { insider: 1.4, poswiadczenia: 1.2 }, odkrywa_wdrozenie: ['pam', 'jml'], naprawa: { ruch: 'ogranicz_dostep_zleceniobiorcy' } },
    konto_bylego_sekretarza: { opis: 'konto byłego sekretarza gminy (odszedł rok temu) jest aktywne — poczta, obieg dokumentów, udziały',
      prawda: true, konta: true, wektory: { insider: 1.15, poswiadczenia: 1.15 }, odkrywa_wdrozenie: ['jml', 'sso'], naprawa: { ruch: 'zamknij_konta' } },
    bip_stary_cms: { opis: 'Biuletyn Informacji Publicznej na systemie bez aktualizacji od trzech lat (u lokalnego webmastera)',
      prawda: true, widoczne_z_internetu: true, pilne: true, wektory: { podatnosc: 1.25, ddos: 1.3 },
      odkrywa_wdrozenie: ['moje_cert', 'ekspozycja', 'skaner_podatnosci'], naprawa: { ruch: 'aktualizuj_bip' } },
    tunel_dostawcy: { opis: 'dostawca systemu podatkowo-księgowego ma stały tunel do serwera urzędu, z jednym kontem dla wszystkich serwisantów (obsługuje 40 gmin)',
      prawda: true, dostep_zdalny: true, wektory: { dostawca: 1.35 }, naprawia_wdrozenie: ['brama_dostepu'],
      naprawa: { ruch: 'wdroz:brama_dostepu' } },
  },

  // ── RUCHY TEJ KAMPANII (format data/ruchy.js) ──
  ruchy: {
    ogranicz_dostep_zleceniobiorcy: {
      nazwa: 'Zleceniobiorca IT: konto imienne bez admina domeny, uprawnienia tylko na czas zlecenia, dostęp przez VPN z MFA',
      kategoria: 'ludzie', h: 6,
      dostepny: (k, p, a) => a.faktDoNaprawy('zleceniobiorca_admin', 'nie wiesz, jakie uprawnienia ma zleceniobiorca — najpierw przegląd dostępów zdalnych albo kont'),
      wykonaj: (k, p, a) => {
        a.napraw('zleceniobiorca_admin');
        a.dzial('kadry', { zaufanie: 0.03 });
        return 'Pan Darek ma teraz konto imienne; uprawnienia administratora dostaje na czas zlecenia, przez VPN z drugim składnikiem. Burknął, ale podpisał.';
      },
    },
    aktualizuj_bip: {
      nazwa: 'BIP: aktualizacja systemu albo przeniesienie na utrzymywaną platformę (umowa z terminami łatek)',
      kategoria: 'rozpoznanie', h: 8, pln: 6000,
      dostepny: (k, p, a) => a.faktDoNaprawy('bip_stary_cms', 'nie wiesz, w jakim stanie jest BIP — najpierw przegląd ekspozycji'),
      wykonaj: (k, p, a) => { a.napraw('bip_stary_cms'); return 'BIP na utrzymywanej platformie; webmaster ma w umowie łatki w 14 dni.'; },
    },
  },

  // ── DECYZJE CYKLICZNE (data/cykliczne.js) ──
  certyfikaty: [
    { id: 'bip_tls', nazwa: 'certyfikat TLS strony urzędu i BIP', pierwszy: 4, co: 12, auto: true,
      skutek: { opis: 'mieszkańcy widzą „połączenie niebezpieczne" na BIP; ogłoszenia o przetargach wiszą za ostrzeżeniem', reputacja: -3, pln: 2000, dzial: { inwestycje: { zaufanie: -0.05 } } } },
    { id: 'domena', nazwa: 'domena urzędu (poczta i strona)', pierwszy: 8, co: 12, auto: false,
      skutek: { opis: 'poczta urzędu i strona przestają działać na dwa dni, a domenę próbuje wykupić ktoś obcy', reputacja: -6, mandat: -4, pln: 8000 } },
    { id: 'podpis_skarbnika', nazwa: 'kwalifikowany podpis skarbnika (sprawozdania budżetowe, bankowość)', pierwszy: 9, co: 24, auto: false,
      skutek: { opis: 'sprawozdania budżetowe idą po terminie, przelewy czekają na drugą osobę', mandat: -4, dzial: { finanse: { zaufanie: -0.1 } } } },
    { id: 'ezd_tls', nazwa: 'certyfikat systemu obiegu dokumentów (dostęp z delegatur i od radnych)', pierwszy: 13, co: 12, auto: true,
      skutek: { opis: 'obieg dokumentów nie działa spoza urzędu — ktoś wysyła skany prywatną pocztą', mandat: -2, presja: ['kadry', 'poczta_prywatna_radnych', 0.3] } },
  ],
  koniec_wsparcia: [
    { id: 'stanowiska_usc', nazwa: 'system operacyjny stanowisk USC', m: 5, ot: false, wektory: { podatnosc: 1.2, phishing: 1.05 }, pln: 24000, h: 16, pln_wsparcie: 8000,
      opis: 'Stanowiska USC działają na systemie po końcu wsparcia producenta; płatne łatki rozszerzone drożeją z roku na rok.' },
    { id: 'serwer_domeny', nazwa: 'kontroler domeny urzędu', m: 10, ot: false, wektory: { podatnosc: 1.25, poswiadczenia: 1.1 }, pln: 16000, h: 12, pln_wsparcie: 6000,
      opis: 'System operacyjny kontrolera domeny wychodzi ze wsparcia producenta w tym miesiącu.' },
    { id: 'system_podatkowy', nazwa: 'stara wersja systemu podatkowego', m: 16, ot: false, wektory: { podatnosc: 1.15, dostawca: 1.1 }, pln: 30000, h: 20, pln_wsparcie: 7000,
      opis: 'Dostawca kończy wsparcie wersji zainstalowanej w urzędzie; nowa działa w jego chmurze (umowa powierzenia!).' },
  ],

  // ── OBSERWACJE (informacja, nie pytanie; reżyser wybiera je według diagnozy) ──
  obserwacje: {
    O_status: { od: 'Wójt', okno: [1, 1], wymuszona: true, problemy: ['zgodnosc'], cele: ['E6', 'E7'],
      tresc: 'Wójt: „Wójt z sąsiedniej gminy mówi, że ta ustawa jest dla dużych miast. My mamy 82 etaty. Podlegamy czy nie?"' },
    O_cert: { od: 'CERT Polska', okno: [2, 2], wymuszona: true, problemy: ['bec', 'phishing'], cele: ['E2', 'E4'], flaga: 'ostrzezenie_cert',
      tresc: 'Ostrzeżenie dla samorządów: fala wyłudzeń na „zmianę rachunku wykonawcy" — przestępcy przejmują skrzynki firm budowlanych i piszą w trwających wątkach o płatnościach. Zalecenie: zmiana rachunku tylko po weryfikacji telefonicznej na znany numer i w wykazie podatników VAT; drugi składnik logowania do poczty.' },
    O_wykaz: { od: 'Radca prawny', okno: [7, 7], wymuszona: true, warunek: k => !k.flagi.wpis, problemy: ['zgodnosc'], cele: ['E6', 'E7'],
      tresc: 'Radca prawny: „Urząd gminy od 50 etatów jest w ustawie. Termin wpisu do wykazu minął w październiku. Wójt pyta, czy kary już są."' },
    O_audyt: { od: 'Komisja rewizyjna rady', okno: [21, 21], wymuszona: true, problemy: ['zgodnosc'], cele: ['E6', 'E7'], flaga: 'audyt_zapowiedziany',
      tresc: 'Komisja rewizyjna zleca na koniec kadencji niezależny audyt zgodności z KRI i ustawą o KSC (za 2–3 miesiące): rejestr ryzyk, dowody przeglądów i testów, szkolenia. ' +
        'Ktoś z kierownictwa: „Dopiszmy, co trzeba, z datami wstecz. Radni i tak nie sprawdzą."' },
    O_rachunki: { od: 'Skarbnik', okno: [2, 8], problemy: ['bec'], cele: ['E2'],
      tresc: '„Wykonawcy przysyłają zmiany rachunków mailem, referat wpisuje. Ja kontrasygnuję zgodność z planem wydatków — nie numer konta."' },
    O_zleceniobiorca: { od: 'Sekretarz gminy', okno: [2, 10], problemy: ['insider', 'poswiadczenia'], cele: ['E4', 'E9'],
      tresc: '„Pan Darek czasem robi coś wieczorem z domu, ma swoje hasło do wszystkiego. Niezawodny, tylko ostatnio kłóci się z wójtem o fakturę."' },
    O_haslo_poczta: { od: 'USC i Obsługa Mieszkańców', okno: [2, 12], problemy: ['poswiadczenia', 'phishing', 'bec'], cele: ['E2', 'E9'],
      tresc: '„Logujemy się do poczty z domu samym hasłem. To samo hasło co do ePUAP, łatwiej zapamiętać."' },
    O_kopie: { od: 'Ty (notatka)', okno: [2, 10], problemy: ['odtwarzanie'], cele: ['E12'],
      tresc: 'Serwer kopii z grantu stoi w kartonie. Kopie robią się na dysk USB w szufladzie sekretariatu — od marca nikt go nie zmieniał.' },
    O_radni: { od: 'Biuro Rady', okno: [3, 14], problemy: ['phishing', 'bec'], cele: ['E2', 'E9'],
      tresc: '„Radni dostają projekty uchwał na prywatne skrzynki. Jeden z nich dostał wczoraj »pilną uchwałę do podpisu« z linkiem, którego nikt od nas nie wysyłał."' },
    O_bip: { od: 'Mieszkaniec (e-mail)', okno: [3, 12], problemy: ['podatnosc', 'uslugi'], cele: ['E4'],
      tresc: '„Na Waszym BIP-ie, w ogłoszeniu o przetargu na drogę, pojawia się czasem reklama kasyna. To tak ma być?"' },
    O_praca_reczna: { od: 'USC i Obsługa Mieszkańców', okno: [3, 14], problemy: ['odtwarzanie', 'uslugi'], cele: ['E12', 'E5'],
      tresc: '„Gdyby system padł, to… przyjmujemy na papierze? Nie mamy druków od lat. Nikt tego nie ćwiczył."' },
    O_pol_etatu: { od: 'Ty (notatka)', okno: [3, 18], problemy: ['ludzie', 'wykrywanie'], cele: ['E3'],
      tresc: 'Jesteś jedynym etatowym informatykiem. Lokalna firma IT obsługuje kilka gmin w powiecie „na godziny"; zapytanie powyżej progu to przetarg.' },
    O_kierownik_szkolenie: { od: 'Wójt', okno: [3, 9], problemy: ['zgodnosc'], cele: ['E7'],
      tresc: 'Ustawa wymaga, żeby kierownik podmiotu raz w roku przeszedł szkolenie z cyberbezpieczeństwa. Wójt: „Ja jestem wójtem, nie informatykiem."' },
    O_szbi: { od: 'Radca prawny', okno: [5, 12], problemy: ['zgodnosc'], cele: ['E11', 'E1'],
      tresc: 'KRI od lat wymaga systemu zarządzania bezpieczeństwem informacji; ustawa o KSC daje termin 3.04.2027. „Mamy politykę z 2014 roku, w segregatorze."' },
    O_lista_obecnosci: { od: 'Sekretariat i Kadry', okno: [3, 20], problemy: ['phishing', 'bec'], cele: ['E2', 'E10'],
      tresc: '„E-learning z bezpieczeństwa mamy odhaczony, jest certyfikat. Czy to wystarczy na kontrolę?"' },
    O_wybory: { od: 'Komisarz wyborczy', okno: [10, 10], wymuszona: true, problemy: ['ddos', 'reputacja'], cele: ['E10', 'E4'],
      tresc: 'Za dwa miesiące wybory uzupełniające do rady i referendum w sprawie spalarni odpadów. Sąsiednie gminy przy referendach miały DDoS na BIP i fałszywe komunikaty o „zmianie lokalu".' },
  },

  // ── SPRAWY (decyzje z terminem; tanie uczciwe wyjście zawsze jest — walidator) ──
  sprawy: {
    G_kartony: {
      tytul: 'Kartony z grantu „Cyberbezpieczny Samorząd"', od: 'Sekretarz gminy', termin: 1, problemy: ['odtwarzanie', 'uslugi'], cele: ['E12', 'E4'],
      tresc: 'W serwerowni stoją: zapora nowej generacji i serwer kopii zapasowych, kupione z grantu w 2025 r. Rozliczone, niepodłączone. Trwałość projektu kontroluje operator programu.',
      czasowniki: {
        wlasnymi_silami: { opis: 'Uruchomić własnymi siłami (zespół, kilkadziesiąt godzin)', h: 4,
          wykonaj: (k, p, a) => { for (const id of ['ngfw', 'backup']) if (!a.dziala(id) && k.obiekty[id]?.stan !== 'projekt') a.wdrozZeSprawy(id, true); return 'Projekty ruszają: zapora i serwer kopii. Kartony do śmieci za dwa miesiące.'; } },
        z_firma: { opis: 'Zlecić uruchomienie lokalnej firmie IT (poniżej progu Pzp; szybciej, mniej godzin zespołu)', h: 2, pln: 9000,
          wykonaj: (k, p, a) => { for (const id of ['ngfw', 'backup']) if (!a.dziala(id) && k.obiekty[id]?.stan !== 'projekt') a.wdrozZeSprawy(id, true, 0.4); return 'Firma uruchamia zaporę i serwer kopii; zespół tylko odbiera prace.'; } },
        pozniej: { opis: 'Później — teraz są pilniejsze rzeczy', h: 0, wykonaj: () => 'Kartony stoją dalej.' },
      },
      domyslnie: () => 'kartony stoją dalej',
    },

    G_licencje: {
      tytul: 'Licencje z grantu wygasają: zapora i kopie', od: 'Dostawca sprzętu', termin: 0, problemy: ['odtwarzanie', 'uslugi'], cele: ['E1', 'E12'],
      tresc: k => `Subskrypcje opłacone z grantu kończą się w tym miesiącu: sygnatury i aktualizacje zapory (${(2500).toLocaleString('pl-PL')} zł/mies.) oraz licencja oprogramowania kopii (${(3000).toLocaleString('pl-PL')} zł/mies.). Bez nich sprzęt działa, ale coraz gorzej.`,
      czasowniki: {
        przedluz: { opis: 'Przedłużyć obie licencje z budżetu gminy (pełna cena)', koszt: () => ({ h: 1, msc: 5500 }),
          wykonaj: (k, p, a) => { for (const id of ['ngfw', 'backup']) { k.st.ceny[id] = 1; a.odnowiono(id); } return 'Przedłużone na rok — od teraz to stały koszt budżetu.'; } },
        podstawowa: { opis: 'Wersja podstawowa: kopie z licencją, zapora bez subskrypcji ochrony (sygnatury IPS i filtr stron wygasają)', koszt: () => ({ h: 2, msc: 3000 }),
          wykonaj: (k, p, a) => { k.st.ceny.backup = 1; a.odnowiono('backup'); a.oslabObiekt('ngfw', 0.6); return 'Kopie z licencją; zapora filtruje ruch, ale nie rozpoznaje już nowych zagrożeń.'; } },
        zrezygnuj: { opis: 'Nie przedłużać — sprzęt zostaje, licencje wygasają', h: 0,
          wykonaj: (k, p, a) => licencjeWygasly(a) },
      },
      domyslnie: (k, a) => licencjeWygasly(a),
    },

    G_kontrola_grantu: {
      tytul: 'Kontrola trwałości projektu grantowego', od: 'Operator programu', termin: 1, problemy: ['zgodnosc'], cele: ['E7', 'E1'],
      tresc: 'Operator programu zapowiada kontrolę: czy sprzęt kupiony z grantu jest używany zgodnie z wnioskiem (zapora, serwer kopii). Za brak trwałości grozi korekta finansowa.',
      czasowniki: {
        pokaz: { opis: 'Pokazać działające wdrożenia (konfiguracja, raporty z kopii)', h: 4, wykonaj: (k, p, a) => kontrolaGrantu(k, a, false) },
        wyjasnij: { opis: 'Złożyć wyjaśnienia z harmonogramem uruchomienia (pomaga, jeśli projekty naprawdę trwają)', h: 6, wykonaj: (k, p, a) => kontrolaGrantu(k, a, true) },
      },
      domyslnie: (k, a) => kontrolaGrantu(k, a, false),
    },

    G_skarbnik: {
      tytul: 'Skarbnik: „co ja właściwie mam sprawdzać przy kontrasygnacie?"', od: 'Skarbnik gminy', termin: 2, problemy: ['bec'], cele: ['E2'],
      tresc: 'Skarbnik kontrasygnuje każdą płatność, ale sprawdza zgodność z planem wydatków, nie rachunek odbiorcy. Pyta, czy da się to zmienić bez paraliżu referatu.',
      czasowniki: {
        rozszerz: { opis: 'Kontrasygnata obejmuje rachunek: przy zmianie — telefon na numer z umowy i sprawdzenie w wykazie podatników VAT', h: 3,
          wykonaj: (k, p, a) => { a.flaga('weryfikacja_rachunku', a.miesiac()); a.dzial('finanse', { swiadomosc: 0.15, zaufanie: 0.05 }); return 'Skarbnik wpisała to do instrukcji obiegu dokumentów. „Jeden telefon — to nie paraliż."'; } },
        szkolenie: { opis: 'Krótkie szkolenie referatu finansowego z wyłudzeń, bez zmiany procedury', h: 2,
          wykonaj: (k, p, a) => { a.dzial('finanse', { swiadomosc: 0.1 }); return 'Referat wie więcej. Procedura bez zmian.'; } },
        bez_zmian: { opis: 'Zostawić, jak jest', h: 0, wykonaj: () => 'Bez zmian.' },
      },
      domyslnie: () => 'bez zmian',
    },

    S_budzet2027: {
      tytul: 'Projekt budżetu 2027: wniosek do wójta, potem komisja budżetowa rady', od: 'Wójt / Skarbnik', termin: 0, problemy: ['zgodnosc', 'ludzie'], cele: ['E1', 'E7'],
      tresc: 'Projekt budżetu na 2027 wójt przedstawia radzie w listopadzie. Skarbnik pyta, ile potrzebujesz na bezpieczeństwo i jak to uzasadnisz przed komisją budżetową.',
      czasowniki: {
        wniosek: {
          opis: 'Wniosek budżetowy: kwota i na czym go opierasz',
          param: { kwota: { opis: 'zł na 2027', liczba: [30000, 300000] }, uzasadnienie: { opis: 'podstawa', wartosci: ['ryzyko', 'potrzeby', 'tyle_co_rok', 'straszenie'] } },
          h: 6,
          dostepny: (k, p, a) => (p.uzasadnienie === 'ryzyko' && !a.dziala('ryzyko') ? 'bez rejestru ryzyk nie masz liczb w złotówkach — wdroż szacowanie ryzyka albo oprzyj wniosek na potrzebach' : null),
          wykonaj: (k, p, a) => {
            const wiarygodne = { ryzyko: 120000, potrzeby: 90000, tyle_co_rok: 60000, straszenie: 70000 }[p.uzasadnienie];
            const kw = Number(p.kwota);
            a.wskaznik('mandat', { ryzyko: 4, potrzeby: 1, tyle_co_rok: 0, straszenie: -6 }[p.uzasadnienie] + (kw > wiarygodne * 1.2 ? -2 : 0));
            a.flaga('wniosek_budzetowy', p.uzasadnienie);
            const przyznano = a.przyznajBudzet(2027, Math.min(kw, wiarygodne));
            return `Rada uchwaliła ${przyznano.toLocaleString('pl-PL')} zł${kw > wiarygodne * 1.2 ? ' — komisja uznała wniosek za przesadzony' : ''}.`;
          },
        },
        bez_wniosku: { opis: 'Nie składać wniosku — niech skarbnik wpisze tyle co zawsze', wykonaj: (k, p, a) => { const x = a.przyznajBudzet(2027, 60000); return `W budżecie ${x.toLocaleString('pl-PL')} zł (tyle co w tym roku).`; } },
      },
      domyslnie: (k, a) => { a.przyznajBudzet(2027, 60000); return 'bez wniosku — tyle co w tym roku'; },
    },

    G_wybory: {
      tytul: 'Wybory uzupełniające i referendum: BIP i komunikaty pod presją', od: 'Sekretarz gminy', termin: 1, problemy: ['ddos', 'reputacja'], cele: ['E10', 'E4'],
      tresc: 'Za dwa miesiące głosowanie. Przy poprzednich referendach w regionie BIP-y padały pod DDoS, a w sieci krążyły fałszywe „komunikaty urzędu" o zmianie lokali.',
      czasowniki: {
        przygotuj: { opis: 'Przygotować się: ochrona przed DDoS u dostawcy strony, statyczna kopia BIP, procedura komunikatów z sekretarzem, kontakt z CSIRT NASK', h: 8, pln: 2500,
          wykonaj: (k, p, a) => { a.flaga('wybory_przygotowane', true); return 'Gotowe: ochrona u dostawcy, kopia BIP, procedura i numery w telefonie.'; } },
        procedura: { opis: 'Tylko procedura komunikatów i kontakt z CSIRT (bez ochrony strony)', h: 3,
          wykonaj: (k, p, a) => { a.flaga('wybory_procedura', true); return 'Procedura spisana; strona bez zmian.'; } },
        nic: { opis: 'Nic — „u nas nikt nie będzie atakował"', h: 0, wykonaj: () => 'Bez zmian.' },
      },
      domyslnie: () => 'bez przygotowań',
    },

    G_dostawca: {
      tytul: 'Dostawca systemu podatkowo-księgowego zaszyfrowany — 40 gmin bez systemu', od: 'Dostawca (komunikat) / Referat Podatków', termin: 0, problemy: ['dostawcy', 'odtwarzanie'], cele: ['E8', 'E12'],
      tresc: 'Dostawca systemu dziedzinowego: „padliśmy ofiarą ataku ransomware, przywracamy systemy, prosimy o cierpliwość". Podatki i księgowość stoją. Jego tunel do naszego serwera jest otwarty.',
      czasowniki: {
        odetnij: { opis: 'Odciąć połączenia dostawcy do sieci urzędu (do czasu wyjaśnień)', zamyka: false,
          koszt: (k, p, a) => ({ h: a.dziala('brama_dostepu') ? 1 : 3 }),
          dostepny: (k, p, a, s) => (s.dane.odciete ? 'już odcięte' : null),
          wykonaj: (k, p, a, s) => { s.dane.odciete = true; return a.dziala('brama_dostepu') ? 'Dostęp dostawcy wyłączony jednym kliknięciem w bramie.' : 'Tunel zamknięty na zaporze — trzeba było szukać, którędy idzie.'; } },
        tryb_awaryjny: { opis: 'Tryb awaryjny: przyjmowanie wpłat i deklaracji na papierze / w arkuszu, wpisy po powrocie systemu', zamyka: false,
          koszt: (k, p, a) => ({ h: a.dziala('bcp') ? 2 : 6 }),
          dostepny: (k, p, a, s) => (s.dane.awaryjny ? 'już działa' : null),
          wykonaj: (k, p, a, s) => { s.dane.awaryjny = true; return a.dziala('bcp') ? 'Plan ciągłości: referaty wiedzą, co robić na papierze.' : 'Referaty improwizują — działa, ale z błędami do poprawy później.'; } },
        zadaj_informacji: { opis: 'Pismo do dostawcy jako podmiotu przetwarzającego: czy dane mieszkańców wyciekły, co z kopią, kiedy powrót', h: 1, zamyka: false,
          dostepny: (k, p, a, s) => (s.dane.info ? 'pismo już wysłane' : null),
          wykonaj: (k, p, a, s) => { s.dane.info = true; return 'Dostawca odpowiada po dwóch dniach: „wyciek możliwy, analiza trwa". Masz podstawę do oceny naruszenia.'; } },
        zglos_csirt: { opis: 'Zgłoszenie do CSIRT NASK (incydent u dostawcy wpływa na usługi urzędu)', h: 1, zamyka: false,
          dostepny: (k, p, a, s) => (s.dane.csirt ? 'już zgłoszone' : null),
          wykonaj: (k, p, a, s) => { s.dane.csirt = true; return 'Zgłoszone. CSIRT koordynuje informacje dla wszystkich 40 gmin.'; } },
        zamknij: { opis: 'Zamknąć sprawę: system dostawcy wraca', h: 0, wykonaj: (k, p, a, s) => skutkiDostawcy(k, a, s) },
      },
      domyslnie: (k, a, s) => skutkiDostawcy(k, a, s),
    },
  },

  // ── AUTOMATY (laboratoria i testy; gracz ich nie widzi) — odpowiedzi na sprawy tej kampanii ──
  automaty: {
    madry: {
      sprawy: {
        G_kartony: () => [{ v: 'z_firma' }, { v: 'wlasnymi_silami' }],
        G_licencje: () => [{ v: 'przedluz' }, { v: 'podstawowa' }, { v: 'zrezygnuj' }],
        G_kontrola_grantu: (k, s, A) => [A.dziala('ngfw') && A.dziala('backup') ? { v: 'pokaz' } : { v: 'wyjasnij' }, { v: 'pokaz' }],
        G_skarbnik: () => [{ v: 'rozszerz' }],
        S_budzet2027: (k, s, A) => [A.dziala('ryzyko') ? { v: 'wniosek', p: { kwota: 120000, uzasadnienie: 'ryzyko' } } : { v: 'wniosek', p: { kwota: 90000, uzasadnienie: 'potrzeby' } }],
        G_wybory: () => [{ v: 'przygotuj' }, { v: 'procedura' }],
        G_dostawca: (k, s) => [!s.dane.odciete ? { v: 'odetnij' } : !s.dane.awaryjny ? { v: 'tryb_awaryjny' } : !s.dane.info ? { v: 'zadaj_informacji' } : !s.dane.csirt ? { v: 'zglos_csirt' } : { v: 'zamknij' }],
      },
    },
    laik: {
      // Laik: wpisuje „najwyższy" status na wszelki wypadek, wdraża to, o czym słyszy.
      obserwacje: {
        O_status: [['wpis_s46', { status: 'kluczowy' }]], O_cert: [['wdroz:mfa']], O_rachunki: [['wdroz:weryfikacja_platnosci']],
        O_haslo_poczta: [['wdroz:mfa']], O_kopie: [['wdroz:backup']], O_praca_reczna: [['wdroz:bcp']], O_pol_etatu: [['wdroz:msp', { umowa: 'standardowa' }]],
        O_kierownik_szkolenie: [['szkolenie_kierownika']], O_szbi: [['wdroz:szbi']], O_audyt: [['plan_naprawczy']], O_wybory: [['wdroz:ngfw']],
      },
      sprawy: {
        G_kartony: [{ v: 'wlasnymi_silami' }], G_kontrola_grantu: [{ v: 'pokaz' }], G_licencje: [{ v: 'przedluz' }, { v: 'zrezygnuj' }], G_skarbnik: [{ v: 'szkolenie' }],
        S_budzet2027: [{ v: 'wniosek', p: { kwota: 80000, uzasadnienie: 'potrzeby' } }], G_wybory: [{ v: 'procedura' }],
        G_dostawca: (k, s) => [!s.dane.awaryjny ? { v: 'tryb_awaryjny' } : { v: 'zamknij' }],
      },
    },
  },

  // ── OŚ KAMPANII (reżyser wybiera moment w oknie) ──
  zdarzenia: [
    { id: 'G_kartony', typ: 'sprawa', okno: [1, 1], ciezar: 0.2 },
    { id: 'G_skarbnik', typ: 'sprawa', okno: [2, 4], ciezar: 0.2 },
    // Okno startuje PO ostrzeżeniu CERT (m. 2) — uczciwa szansa na reakcję.
    { id: 'S01', typ: 'incydent', okno: [3, 6], ciezar: 0.7, cele: ['E2', 'E6', 'E10'],
      opis: 'BEC: „wykonawca przebudowy drogi zmienia rachunek" (480 000 zł)' },
    { id: 'S07', typ: 'incydent', okno: [6, 9], ciezar: 0.8, cele: ['E4', 'E9', 'E11'],
      opis: 'zleceniobiorca IT po sporze o fakturę blokuje konta urzędników (próba w dziennikach, jeśli dostęp odebrany wcześniej)' },
    { id: 'S_budzet2027', typ: 'sprawa', okno: [8, 8], ciezar: 0.3 },
    { id: 'G_kontrola_grantu', typ: 'sprawa', okno: [9, 11], ciezar: 0.4 },
    { id: 'G_wybory', typ: 'sprawa', okno: [10, 10], ciezar: 0.3 },
    { id: 'F_wybory', typ: 'fala', okno: [12, 12], ciezar: 0.7, opis: 'głosowanie: DDoS na BIP i fałszywe komunikaty o zmianie lokali', skutek: (k, a) => falaWybory(k, a) },
    { id: 'T_szbi', typ: 'termin', okno: [13, 13], ciezar: 0.3, opis: '3.04.2027 — termin wdrożenia obowiązków (SZBI)' },
    { id: 'G_licencje', typ: 'sprawa', okno: [15, 15], ciezar: 0.2 },
    { id: 'G_dostawca', typ: 'sprawa', okno: [15, 19], ciezar: 0.6 },
    // 🔵 Audyt zamykający zleca komisja rewizyjna rady na koniec kadencji (docs/02-…).
    { id: 'A_kontrola', typ: 'final', okno: [23, 24], ciezar: 0.8,
      opis: 'audyt zamykający zlecony przez komisję rewizyjną (niezależny audytor, KRI i KSC, porównuje deklaracje z rzeczywistością)' },
  ],
};

// ── Skutki spraw złożonych (wspólne dla czasownika i rozstrzygnięcia domyślnego) ──
// 🔵 Korekta finansowa za brak trwałości: w grze 60 tys. zł (połowa — przy wiarygodnym
// harmonogramie trwających wdrożeń). Zasady programu grantowego — docs/02-….
function kontrolaGrantu(k, a, wyjasnienia) {
  const dzialaja = a.dziala('ngfw') && a.dziala('backup');
  const trwaja = ['ngfw', 'backup'].every(id => a.dziala(id) || k.obiekty[id]?.stan === 'projekt');
  if (dzialaja) { a.wskaznik('mandat', 3); a.flaga('grant_trwalosc', 'ok'); return 'Kontrola bez uwag: sprzęt działa, konfiguracja i raporty z kopii są.'; }
  if (trwaja && wyjasnienia) { a.wskaznik('mandat', -1); a.flaga('grant_trwalosc', 'harmonogram'); return 'Zalecenia pokontrolne: dokończyć uruchomienie w 3 miesiące. Bez korekty.'; }
  const kwota = wyjasnienia || trwaja ? 30000 : 60000;
  a.strata(kwota, 'grant'); a.wskaznik('mandat', -8); a.wskaznik('reputacja', -4);
  a.flaga('grant_trwalosc', 'korekta');
  k.raportIT.push(`Kontrola grantu: korekta finansowa ${kwota.toLocaleString('pl-PL')} zł — sprzęt z grantu nie był używany.`);
  return `nieprawidłowość: korekta finansowa ${kwota.toLocaleString('pl-PL')} zł; lokalny portal pisze o „kartonach za 100 tysięcy"`;
}

// Licencje wygasły: sprzęt zostaje, ale bez aktualizacji ochrona słabnie (zapora mocno, kopie — mniej).
function licencjeWygasly(a) {
  a.oslabObiekt('ngfw', 0.6); a.oslabObiekt('backup', 0.8);
  return 'licencje wygasły — zapora bez sygnatur, oprogramowanie kopii bez aktualizacji';
}

// Głosowanie: ochrona strony i procedura komunikatów decydują, czy fala to drobiazg czy afera.
function falaWybory(k, a) {
  const bip = k.fakty.bip_stary_cms;
  const dziurawyBip = bip?.prawda && !bip.naprawiony;
  let pln = 0, opis;
  if (k.flagi.wybory_przygotowane) {
    opis = 'Głosowanie: DDoS na BIP odbity u dostawcy, fałszywy wpis o „zmianie lokalu" zdementowany w godzinę.';
    a.wskaznik('reputacja', 2);
  } else if (k.flagi.wybory_procedura) {
    pln = 10000; opis = 'Głosowanie: BIP leżał dzień, ale dementi poszło szybko — frekwencja bez zmian.';
    a.wskaznik('reputacja', -2);
  } else {
    pln = 30000; opis = 'Głosowanie: BIP leżał trzy dni, fałszywe komunikaty o zmianie lokali krążyły bez dementi; skarga do komisarza wyborczego.';
    a.wskaznik('reputacja', -10); a.wskaznik('mandat', -6);
  }
  if (dziurawyBip) { pln += 8000; opis += ' Na nieaktualnym BIP-ie pojawił się podmieniony baner.'; a.wskaznik('reputacja', -4); }
  if (pln) { a.strata(pln, 'wybory'); k.incydenty.push({ m: k.st.m, rodzaj: 'fala: wybory (BIP i dezinformacja)', pln, zakl: pln >= 30000 }); }
  k.log('swiat', opis);
  k.raportIT.push(opis);
}

// Dostawca zaszyfrowany: przestój referatów, a otwarty tunel to droga dla tego samego sprawcy.
function skutkiDostawcy(k, a, s) {
  const st = k.st, d = s.dane;
  const dni = 10;
  const pln = Math.round(st.firma.koszt_dnia * 0.15 * dni * (d.awaryjny ? 0.3 : 1) * (a.dziala('bcp') ? 0.7 : 1));
  a.strata(pln, 'dostawca');
  k.incydenty.push({ m: st.m, rodzaj: 'dostawca systemu dziedzinowego zaszyfrowany', pln, zakl: !d.awaryjny });
  const tunel = k.fakty.tunel_dostawcy;
  const otwarty = tunel?.prawda && !tunel.naprawiony && !d.odciete;
  if (otwarty) a.intruz({ kto: 'ransomware', etap: 'dostep', wektor: 'dostawca' });
  a.wskaznik('mandat', d.awaryjny ? 1 : -3);
  a.wskaznik('reputacja', d.awaryjny ? 0 : -4);
  a.flaga('dostawca_odciety', !!d.odciete); a.flaga('dostawca_awaryjny', !!d.awaryjny); a.flaga('dostawca_info', !!d.info); a.flaga('dostawca_csirt', !!d.csirt);
  return `system wraca po ${dni} dniach; koszt ok. ${pln.toLocaleString('pl-PL')} zł${otwarty ? '. Tunel dostawcy był otwarty przez cały czas' : ''}`;
}
