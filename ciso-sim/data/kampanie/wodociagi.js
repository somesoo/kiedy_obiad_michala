// ── KAMPANIA: PWiK „Wodnik" sp. z o.o. (Rzecznów) ──
// Pierwsza kampania gry (decyzja właściciela 13.10.2026). Opis fabularny i uzasadnienia:
// docs/16-kampania-wodociagi.md; silnik ruchów: docs/18-silnik-ruchow.md. Liczbowy profil
// firmy: data/firmy.js → wodociagi. Wszystko fikcyjne: spółka, gmina Rzecznów, ludzie,
// integrator „AquaSter".
//
// Nie ma tu kart z odpowiedziami. Kampania opisuje ŚWIAT: działy (agenci), fakty do odkrycia,
// obserwacje (co ludzie mówią), sprawy z terminami (co trzeba rozstrzygnąć) i oś zdarzeń.
// Gracz w każdej chwili może zagrać dowolny ruch (data/ruchy.js + cykl życia kontroli
// z data/kontrole.js); praktykę oceniają zasady (proto/zasady.js).

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

  // ── FAKTY ŚWIATA (prawda silnika; gracz je ODKRYWA, docs/18-…, 18.2) ──
  // prawda: true/false albo liczba = szansa (losowana na starcie z mgły)
  // wektory: mnożniki, dopóki fakt jest prawdą i nie został naprawiony
  // po_naprawie: mnożniki po naprawie (gdy profil firmy już zawiera ekspozycję, np. usługi ×3)
  // jak się odkrywa: widoczne_z_internetu (przegląd ekspozycji), dostep_zdalny (przegląd dostępów),
  //   na_obiekcie (obchód stacji), zna: id działu (rozmowa, gdy dział Ci ufa), odkrywa_wdrozenie
  // naprawa: ruch, który to zamyka — doradca poleca go w raporcie (proto/doradztwo.js)
  // widoczny_od_sprawy: doradca może to znaleźć dopiero, gdy sprawa się pojawiła (przejęcie)
  fakty: {
    hmi_wystawiony: { opis: 'panel HMI stacji uzdatniania dostępny z internetu (przekierowanie portu u integratora)',
      prawda: true, widoczne_z_internetu: true, pilne: true, po_naprawie: { uslugi: 0.45 }, odkrywa_wdrozenie: ['moje_cert', 'ekspozycja', 'asm'],
      naprawa: { ruch: 'odetnij_hmi' } },
    narzedzie_zdalne_integratora: { opis: 'narzędzie zdalnej pomocy integratora na stacji inżynierskiej, ze stałym hasłem',
      prawda: true, dostep_zdalny: true, pilne: true, wektory: { dostawca: 1.3, uslugi: 1.15 }, naprawa: { ruch: 'usun_narzedzie_zdalne' } },
    pin_domyslny: { opis: 'PIN-y sterowników i paneli niezmienione od montażu (zna je pół powiatu)',
      prawda: true, na_obiekcie: true, zna: 'produkcja', wektory: { uslugi: 1.1 }, odkrywa_wdrozenie: ['inwentaryzacja'], naprawa: { ruch: 'zmien_pin' } },
    kopia_scada_u_integratora: { opis: 'projekty SCADA i programy sterowników są tylko na laptopie integratora',
      prawda: true, zna: 'produkcja', ciaglosc: true, naprawa: { ruch: 'wdroz:backup', p: { zakres: 'biuro_ot', nosnik: 'offline' } } },
    oczyszczalnia_intruz: { opis: 'w sieci przejmowanej oczyszczalni od miesięcy siedzi broker dostępu', prawda: 0.6, widoczny_od_sprawy: 'S_przejecie' },
  },

  // ── DECYZJE CYKLICZNE (data/cykliczne.js, proto/cykl.js) ──
  // Certyfikaty i domeny: `pierwszy` — miesiąc kampanii, `co` — okres w miesiącach, `auto` — da
  // się odnawiać automatycznie (TLS). Bez ewidencji część wygasa „po cichu" (nikt nie wiedział).
  certyfikaty: [
    { id: 'ebok_tls', nazwa: 'certyfikat TLS e-BOK', pierwszy: 5, co: 12, auto: true,
      skutek: { opis: 'mieszkańcy widzą „połączenie niebezpieczne", płatności online stoją, telefony do BOK', reputacja: -3, pln: 4000, dzial: { bok: { zaufanie: -0.1 } } } },
    { id: 'vpn_tls', nazwa: 'certyfikat bramy VPN (terenowcy, integrator)', pierwszy: 9, co: 12, auto: true,
      skutek: { opis: 'terenowcy i integrator bez dostępu — ktoś „tymczasowo" otworzy coś bokiem', mandat: -2, pln: 6000,
        dzial: { siec: { zaufanie: -0.1 }, produkcja: { zaufanie: -0.1 } }, presja: ['produkcja', 'zdalny_integrator', 0.3] } },
    { id: 'domena', nazwa: 'domena wodnik-rzecznow.pl (poczta i strona)', pierwszy: 11, co: 12, auto: false,
      skutek: { opis: 'poczta i strona przestają działać na dwa dni, a domenę próbuje wykupić ktoś obcy', reputacja: -6, mandat: -4, pln: 15000 } },
    { id: 'podpis_prezesa', nazwa: 'kwalifikowany podpis elektroniczny prezesa', pierwszy: 14, co: 24, auto: false,
      skutek: { opis: 'zarząd nie podpisze w terminie dokumentów urzędowych i umów', mandat: -3 } },
  ],
  // Koniec wsparcia producenta: `wektory` — ryzyko, dopóki nikt nic nie zrobi; `ot` — zmiana na stacji.
  koniec_wsparcia: [
    { id: 'win10_inz', nazwa: 'system stacji inżynierskich SCADA', m: 7, ot: true, wektory: { podatnosc: 1.3, uslugi: 1.1 }, pln: 28000, h: 14, pln_wsparcie: 9000,
      opis: 'Stacje inżynierskie SCADA działają na systemie po końcu wsparcia; płatne łatki rozszerzone drożeją, a nowsza wersja wymaga zgody producenta SCADA.' },
    { id: 'serwer_fk', nazwa: 'serwer systemu finansowo-księgowego', m: 10, ot: false, wektory: { podatnosc: 1.2 }, pln: 18000, h: 10, pln_wsparcie: 7000,
      opis: 'System operacyjny serwera księgowości wychodzi ze wsparcia producenta w tym miesiącu.' },
    { id: 'router_przepomp', nazwa: 'routery w przepompowniach', m: 16, ot: true, wektory: { podatnosc: 1.2, uslugi: 1.15 }, pln: 22000, h: 12, pln_wsparcie: 6000,
      opis: 'Producent routerów w przepompowniach kończy wydawanie aktualizacji dla tej serii.' },
  ],

  // ── OBSERWACJE (informacja, nie pytanie; reżyser wybiera je według diagnozy) ──
  // wymuszona: [od, do] — pojawia się w pierwszym miesiącu okna (jeśli warunek); inaczej okno
  // dla reżysera. odkrywa: fakt, który obserwacja ujawnia. flaga: znacznik dla zasad.
  obserwacje: {
    O_status: { od: 'Zarząd', okno: [1, 1], wymuszona: true, problemy: ['zgodnosc'], cele: ['E6', 'E7'],
      tresc: 'Prezes: „Kolega z innych wodociągów mówi, że NIS2 jest dla dużych. My mamy 64 osoby. Podlegamy czy nie?"' },
    O_cert: { od: 'CERT Polska / CSIRT INFRASTRUKTURA', okno: [2, 2], wymuszona: true, problemy: ['uslugi'], cele: ['E4'], flaga: 'ostrzezenie_cert',
      tresc: 'Ostrzeżenie dla sektora wodnego: grupy prorosyjskie wyszukują w internecie panele HMI i sterowniki z domyślnymi hasłami. Zalecenie: natychmiast sprawdzić, co jest widoczne z internetu.' },
    O_wykaz: { od: 'Radca prawny', okno: [7, 7], wymuszona: true, warunek: k => !k.flagi.wpis, problemy: ['zgodnosc'], cele: ['E6', 'E7'],
      tresc: 'Nowy radca prawny pyta, czy jesteśmy w wykazie podmiotów kluczowych i ważnych. Nie jesteśmy. Prezes: „Kary i tak są od 2028, po co się wychylać?"' },
    O_audyt: { od: 'Rada nadzorcza / radca prawny', okno: [21, 21], wymuszona: true, problemy: ['zgodnosc'], cele: ['E6', 'E7'], flaga: 'audyt_zapowiedziany',
      tresc: 'Rada nadzorcza zleca niezależny audyt bezpieczeństwa na koniec kampanii (za 2–3 miesiące). Audytor poprosi o dowody: rejestr ryzyk z datami przeglądów, protokoły testów, listy szkoleń. ' +
        'Członek zarządu: „Dopiszcie, co trzeba, z datami wstecz. Wszyscy tak robią."' },
    O_kopie_ot: { od: 'Kierownik stacji', okno: [2, 12], problemy: ['odtwarzanie', 'dostawcy'], cele: ['E12', 'E8'], odkrywa: 'kopia_scada_u_integratora',
      tresc: '„Projekty wizualizacji i programy sterowników ma integrator na laptopie. Jak coś padnie, przyjedzie i wgra."' },
    O_rachunki: { od: 'Główna księgowa', okno: [2, 12], problemy: ['bec'], cele: ['E2'],
      tresc: '„Kontrahenci czasem przysyłają nowe numery kont mailem. Wpisujemy i płacimy, tak było zawsze."' },
    O_haslo_poczta: { od: 'Dział Sieci i Kanalizacji', okno: [2, 14], problemy: ['poswiadczenia', 'phishing', 'bec'], cele: ['E2', 'E9'],
      tresc: 'Kierownik sieci: „Terenowcy logują się do poczty i VPN z telefonów, samym hasłem. Jedno hasło na wszystko, łatwiej zapamiętać."' },
    O_praca_reczna: { od: 'Operator zmiany', okno: [3, 14], problemy: ['odtwarzanie', 'uslugi'], cele: ['E12', 'E5'],
      tresc: '„Gdyby SCADA padła, to… no, prowadzilibyśmy ręcznie. Chyba. Nikt tego nie ćwiczył od lat."' },
    O_pol_etatu: { od: 'Ty (notatka)', okno: [3, 18], problemy: ['ludzie', 'wykrywanie'], cele: ['E3'],
      tresc: 'Masz pół etatu na całe IT i bezpieczeństwo. Lokalna firma oferuje administrację na godziny; vCISO kosztuje ok. 12 tys. zł/mies.' },
    O_antywirus: { od: 'Ty (notatka)', okno: [4, 18], problemy: ['wykrywanie', 'phishing'], cele: ['E3', 'E5'],
      tresc: 'Na komputerach jest darmowy antywirus. Producent SCADA ma listę rozwiązań EDR zgodnych ze stacjami inżynierskimi — „po teście".' },
    O_siec_plaska: { od: 'Ty (notatka)', okno: [6, 20], problemy: ['uslugi', 'odtwarzanie'], cele: ['E12', 'E5'],
      tresc: 'Komputer w BOK może połączyć się z panelem operatorskim stacji. Oddzielenie sieci OT: ok. 90 tys. zł i 300 h pracy.' },
    O_lista_obecnosci: { od: 'Kadry i Administracja', okno: [3, 20], problemy: ['phishing', 'bec'], cele: ['E2', 'E10'],
      tresc: 'Kadry: „Czy w tym roku robimy to szkolenie z bezpieczeństwa? Trzeba mieć listę obecności."' },
    O_kierownik_szkolenie: { od: 'Zarząd', okno: [3, 9], problemy: ['zgodnosc'], cele: ['E7'],
      tresc: 'Ustawa wymaga, żeby kierownik podmiotu raz w roku przeszedł szkolenie z cyberbezpieczeństwa. Prezes: „Nie mam czasu."' },
    O_szbi: { od: 'Zarząd', okno: [5, 12], problemy: ['zgodnosc'], cele: ['E11', 'E1'],
      tresc: 'Do 3.04.2027 trzeba wdrożyć system zarządzania bezpieczeństwem informacji. Realnie trwa to ok. pół roku.' },
    O_router: { od: 'Ty (notatka)', okno: [3, 16], problemy: ['podatnosc'], cele: ['E2', 'E12'],
      tresc: 'Router brzegowy ma oprogramowanie sprzed dwóch lat. Systemu SCADA „nie wolno ruszać".' },
    O_zakupy: { od: 'Prezes', okno: [4, 20], problemy: ['dostawcy', 'uslugi'], cele: ['E9', 'E11'],
      warunek: k => Object.values(k.dzialy).some(d => d.ukryte.some(u => u.odkryte)) || k.m >= 8,
      tresc: '„Kolejne narzędzia i urządzenia pojawiają się bez Twojej wiedzy. Da się to uporządkować bez blokowania pracy?"' },
  },

  // ── SPRAWY Z PLIKU KAMPANII (proto/sprawy.js: rodzaj „scenariusz") ──
  // czasownik: { opis, param, h, pln | koszt(k, p, a, s), dostepny(k, p, a, s), wykonaj(k, p, a, s) → tekst, zamyka }
  // domyslnie(k, a, s) → tekst — co się dzieje, gdy nikt nic nie zrobi do terminu
  // zapobiegnieta(k, a) → tekst — sprawa w ogóle nie trafia do gracza (np. procedura zadziałała)
  sprawy: {
    S_budzet2027: {
      tytul: 'Budżet bezpieczeństwa na 2027', od: 'Zarząd', termin: 0, problemy: ['zgodnosc', 'ludzie'], cele: ['E1', 'E7'],
      tresc: 'Zgromadzenie wspólników (gmina) zatwierdza plan na 2027. Prezes pyta, ile potrzebujesz i dlaczego.',
      czasowniki: {
        wniosek: {
          opis: 'Wniosek budżetowy: kwota i na czym go opierasz',
          param: { kwota: { opis: 'zł na 2027', liczba: [60000, 600000] }, uzasadnienie: { opis: 'podstawa', wartosci: ['ryzyko', 'potrzeby', 'tyle_co_rok', 'straszenie'] } },
          h: 6,
          dostepny: (k, p, a) => (p.uzasadnienie === 'ryzyko' && !a.dziala('ryzyko') ? 'bez rejestru ryzyk nie masz liczb w złotówkach — wdroż szacowanie ryzyka albo oprzyj wniosek na potrzebach' : null),
          // Ile zarząd uzna za wiarygodne przy danym uzasadnieniu — prośba ponad to „przesadza".
          wykonaj: (k, p, a) => {
            const wiarygodne = { ryzyko: 260000, potrzeby: 200000, tyle_co_rok: 120000, straszenie: 150000 }[p.uzasadnienie];
            const kw = Number(p.kwota);
            a.wskaznik('mandat', { ryzyko: 4, potrzeby: 1, tyle_co_rok: 0, straszenie: -6 }[p.uzasadnienie] + (kw > wiarygodne * 1.2 ? -2 : 0));
            a.flaga('wniosek_budzetowy', p.uzasadnienie);
            const przyznano = a.przyznajBudzet(2027, Math.min(kw, wiarygodne));
            return `Przyznano ${przyznano.toLocaleString('pl-PL')} zł${kw > wiarygodne * 1.2 ? ' — zarząd uznał wniosek za przesadzony' : ''}.`;
          },
        },
        bez_wniosku: { opis: 'Nie składać wniosku — niech zarząd zdecyduje sam', wykonaj: (k, p, a) => { const x = a.przyznajBudzet(2027, 120000); return `Zarząd przyznał ${x.toLocaleString('pl-PL')} zł (tyle co w tym roku).`; } },
      },
      domyslnie: (k, a) => { a.przyznajBudzet(2027, 120000); return 'bez wniosku — tyle co w tym roku'; },
    },

    S_przejecie: {
      tytul: 'Przejmujemy oczyszczalnię z gminy sąsiedniej', od: 'Zarząd', termin: 1, problemy: ['uslugi', 'dostawcy'], cele: ['E4', 'E8'],
      tresc: 'Od stycznia „Wodnik" przejmuje oczyszczalnię ścieków gminy Lipno. Mają własną SCADA, dwóch ludzi i „informatyka z urzędu". Zarząd chce połączyć sieci do końca przyszłego miesiąca.',
      czasowniki: {
        przeglad: {
          opis: 'Przegląd bezpieczeństwa oczyszczalni przed połączeniem (zasoby, dostępy, ślady włamań)', h: 40, pln: 20000, zamyka: false,
          dostepny: (k, p, a, s) => (s.dane.przeglad ? 'przegląd już zrobiony' : null),
          wykonaj: (k, p, a, s) => {
            s.dane.przeglad = true; a.flaga('oczyszczalnia_sprawdzona', true);
            const f = a.fakt('oczyszczalnia_intruz');
            if (f.prawda) { f.znany = true; f.naprawiony = true; return 'Znaleziono i usunięto brokera dostępu, który od miesięcy siedział w sieci oczyszczalni.'; }
            return 'Sieć oczyszczalni czysta; urządzenia trafiają do ewidencji.';
          },
        },
        polacz: { opis: 'Połączyć sieci teraz (przez zaporę, jeśli segmentacja działa)', h: 4, wykonaj: (k, p, a, s) => polaczOczyszczalnie(k, a, s) },
        odloz: {
          opis: 'Nie łączyć sieci, dopóki nie będzie przeglądu — oczyszczalnia pracuje osobno', h: 4,
          wykonaj: (k, p, a) => { a.wskaznik('mandat', -2); a.flaga('oczyszczalnia_odlozona', true); return 'Zarząd niezadowolony: „po co przejmowaliśmy, skoro nie łączymy?".'; },
        },
      },
      domyslnie: (k, a, s) => `zarząd łączy sieci bez czekania — ${polaczOczyszczalnie(k, a, s)}`,
    },

    S_umowa_integratora: {
      tytul: 'Odnowienie umowy z integratorem SCADA', od: 'Kierownik stacji', termin: 0, problemy: ['dostawcy', 'uslugi'], cele: ['E8'],
      tresc: 'Umowa serwisowa z AquaSter kończy się w marcu. Kierownik stacji chce przedłużyć „jak zawsze".',
      czasowniki: {
        negocjuj: {
          opis: 'Przedłużyć z klauzulami bezpieczeństwa (każda to rozmowa i ustępstwo)',
          param: { klauzule: { opis: 'wybrane klauzule', lista: ['mfa_konta', 'zgloszenia_24h', 'kopie_u_nas', 'prawo_audytu', 'zakaz_przekierowan'],
            pomoc: ['mfa_konta: MFA i osobne konta na osobę', 'zgloszenia_24h: zgłaszanie incydentów w 24 h', 'kopie_u_nas: aktualne kopie projektów u nas',
              'prawo_audytu: prawo do audytu', 'zakaz_przekierowan: zakaz przekierowań portów i narzędzi zdalnych bez zgody'] } },
          koszt: (k, p) => ({ h: 2 * String(p.klauzule || '').split(',').filter(Boolean).length }),
          wykonaj: (k, p, a) => {
            const kl = String(p.klauzule).split(',').map(x => x.trim());
            const mn = { mfa_konta: { dostawca: 0.85 }, zgloszenia_24h: { dostawca: 0.95 }, prawo_audytu: { dostawca: 0.95 }, zakaz_przekierowan: { uslugi: 0.9, dostawca: 0.9 } };
            for (const x of kl) for (const [w, v] of Object.entries(mn[x] || {})) a.wektor(w, v);
            if (kl.includes('kopie_u_nas')) { a.napraw('kopia_scada_u_integratora'); a.flaga('kopie_ot_umowa', true); }
            a.flaga('umowa_integratora', kl.length >= 3); a.flaga('klauzule_integratora', kl.length);
            a.dzial('produkcja', { zaufanie: kl.length <= 3 ? 0.05 : -0.05 });
            return `Umowa przedłużona z klauzulami: ${kl.join(', ')}.${kl.length > 3 ? ' Integrator kręci nosem, kierownik stacji też.' : ''}`;
          },
        },
        przedluz: { opis: 'Przedłużyć jak zawsze', wykonaj: () => 'Przedłużona bez zmian. Spokój teraz.' },
      },
      domyslnie: () => 'kierownik stacji przedłuża jak zawsze',
    },

    S_ubezpieczenie: {
      tytul: 'Oferta: ubezpieczenie cyber', od: 'Broker ubezpieczeniowy', termin: 2, problemy: ['odtwarzanie'], cele: ['E1'],
      tresc: 'Polisa 2 mln zł za ok. 5 000 zł/mies. Ankieta: „Czy wszystkie konta mają MFA? Czy macie EDR na stacjach i serwerach? Czy kopie są offline?" Podpisuje zarząd — na Twoje słowo.',
      czasowniki: {
        ankieta: {
          opis: 'Wypełnić ankietę (każda odpowiedź to oświadczenie)',
          param: { mfa: { opis: 'wszystkie konta mają MFA', wartosci: ['tak', 'nie'] }, edr: { opis: 'EDR na stacjach i serwerach', wartosci: ['tak', 'nie'] },
            kopie: { opis: 'kopie offline', wartosci: ['tak', 'nie'] } },
          koszt: (k, p) => (p.mfa === 'tak' && p.edr === 'tak' && p.kopie === 'tak' ? { h: 2, msc: 5000 } : { h: 2 }),
          wykonaj: (k, p, a) => {
            const prawda = {
              mfa: a.dziala('mfa') && a.obiekt('mfa').param.zakres === 'wszyscy',
              edr: a.dziala('edr'),
              kopie: a.dziala('backup') && a.obiekt('backup').param.nosnik === 'offline',
            };
            const falsz = Object.keys(prawda).filter(x => p[x] === 'tak' && !prawda[x]);
            if (falsz.length) {
              a.flaga('klamstwo_ankieta', true);
              a.klamstwo({ wobec: 'ubezpieczyciel', wykrywalnosc: 0.9, tekst: `ankieta ubezpieczyciela: „tak" przy ${falsz.join(', ')} — nieprawda` });
            }
            if (p.mfa === 'tak' && p.edr === 'tak' && p.kopie === 'tak') { a.wdrozZeSprawy('ubezpieczenie'); return 'Polisa podpisana, działa od przyszłego miesiąca.'; }
            if (!a.czyFlaga('ubezpieczenie_ponowione')) { a.flaga('ubezpieczenie_ponowione', true); a.zaplanujSprawe('S_ubezpieczenie', 6); }
            return 'Ubezpieczyciel: bez wszystkich trzech nie ma polisy. Wrócimy do rozmowy za pół roku.';
          },
        },
        odrzuc: { opis: 'Nie teraz', wykonaj: () => 'Oferta odrzucona.' },
      },
      domyslnie: () => 'oferta wygasła',
    },

    S_dwr: {
      tytul: 'Postępowanie wobec producenta Waszych routerów', od: 'Komunikat ministerstwa', termin: 4, problemy: ['dostawcy', 'zgodnosc'], cele: ['E4', 'E8'],
      tresc: 'Wszczęto postępowanie w sprawie uznania producenta popularnych routerów za dostawcę wysokiego ryzyka. Używacie ich w przepompowniach. Decyzja — za kilka miesięcy.',
      czasowniki: {
        lista: {
          opis: 'Lista urządzeń tego producenta (z ewidencji — albo chodzenie po przepompowniach)', zamyka: false,
          koszt: (k, p, a) => ({ h: a.dziala('inwentaryzacja') ? 2 : 20 }),
          dostepny: (k, p, a, s) => (s.dane.lista ? 'lista już jest' : null),
          wykonaj: (k, p, a, s) => { s.dane.lista = true; return a.dziala('inwentaryzacja') ? 'Z ewidencji: 14 routerów w 11 przepompowniach.' : 'Trzy dni jeżdżenia po przepompowniach: 14 routerów (dwa „zapomniane").'; },
        },
        plan: {
          opis: 'Plan wymiany w budżecie na wypadek decyzji', h: 4, zamyka: false,
          dostepny: (k, p, a, s) => (!s.dane.lista ? 'najpierw lista urządzeń' : s.dane.plan ? 'plan już jest' : null),
          wykonaj: (k, p, a, s) => { s.dane.plan = true; return 'Plan wymiany gotowy (ok. 30 tys. zł).'; },
        },
        odetnij: {
          opis: 'Do czasu decyzji: bez dostępu do routerów z internetu', h: 4, zamyka: false,
          dostepny: (k, p, a, s) => (!s.dane.lista ? 'najpierw lista urządzeń' : s.dane.odciete ? 'już zrobione' : null),
          wykonaj: (k, p, a, s) => { s.dane.odciete = true; a.wektor('uslugi', 0.95); return 'Zarządzanie routerami tylko z sieci firmowej.'; },
        },
      },
      domyslnie: (k, a, s) => {
        a.flaga('dwr_rozstrzygniete', { lista: !!s.dane.lista, plan: !!s.dane.plan });
        if (a.rnd() >= 0.5) return 'producent nie został uznany za dostawcę wysokiego ryzyka — tym razem';
        if (s.dane.plan) { a.wydajPrzymusowo(30000); return 'producent uznany za DWR — wymiana według planu'; }
        a.wydajPrzymusowo(45000); a.wskaznik('mandat', -4);
        return 'producent uznany za DWR — wymiana w panice, drożej i z przestojami';
      },
    },

    S_wodomierze: {
      tytul: 'Inteligentne wodomierze', od: 'BOK i zarząd', termin: 2, problemy: ['dostawcy', 'poswiadczenia'], cele: ['E8', 'E11'],
      tresc: 'BOK z zarządem wybrał system zdalnego odczytu 9 000 wodomierzy (radio + chmura dostawcy). Dane godzinowe o zużyciu — „przyda się do wykrywania wycieków". Start za dwa miesiące.',
      czasowniki: {
        srodki: {
          opis: 'Włączyć się w projekt z wybranymi środkami',
          param: { srodki: { opis: 'środki', lista: ['dpia', 'ocena_dostawcy', 'umowa_powierzenia', 'mfa_dostawcy', 'minimalizacja'],
            pomoc: ['dpia: ocena skutków dla ochrony danych (dane godzinowe zdradzają, kiedy ktoś jest w domu) — 16 h', 'ocena_dostawcy: 8 h',
              'umowa_powierzenia: z terminem zgłaszania naruszeń — 4 h', 'mfa_dostawcy: MFA na kontach dostawcy — 2 h', 'minimalizacja: dane dobowe zamiast godzinowych — 4 h'] } },
          koszt: (k, p) => ({ h: String(p.srodki || '').split(',').filter(Boolean).reduce((x, s) => x + ({ dpia: 16, ocena_dostawcy: 8, umowa_powierzenia: 4, mfa_dostawcy: 2, minimalizacja: 4 }[s.trim()] || 0), 0) }),
          wykonaj: (k, p, a) => skutkiWodomierzy(a, String(p.srodki).split(',').map(x => x.trim())),
        },
        bez_udzialu: { opis: 'Projekt biznesowy — nie mieszam się', wykonaj: (k, p, a) => skutkiWodomierzy(a, []) },
      },
      domyslnie: (k, a) => `projekt rusza bez bezpieczeństwa — ${skutkiWodomierzy(a, [])}`,
    },

    S_emerytura: {
      tytul: 'Kierownik stacji odchodzi na emeryturę', od: 'Kadry i Administracja', termin: 3, problemy: ['ludzie', 'odtwarzanie'], cele: ['E12'],
      tresc: 'Marek Lis za 3 miesiące przechodzi na emeryturę. Zna hasła, nastawy i „gdzie co jest". Następca jest z zewnątrz.',
      czasowniki: {
        srodki: {
          opis: 'Przygotować odejście',
          param: { srodki: { opis: 'środki', lista: ['dokumentacja', 'zmiana_hasel', 'konta_imienne', 'przekazanie_z_integratorem'],
            pomoc: ['dokumentacja: nastawy, dostępy, „gdzie co jest" — 12 h', 'zmiana_hasel: wszystkie hasła po przekazaniu — 6 h',
              'konta_imienne: konta imienne dla następcy — 4 h', 'przekazanie_z_integratorem: wspólny obchód z integratorem — 8 h'] } },
          koszt: (k, p) => ({ h: String(p.srodki || '').split(',').filter(Boolean).reduce((x, s) => x + ({ dokumentacja: 12, zmiana_hasel: 6, konta_imienne: 4, przekazanie_z_integratorem: 8 }[s.trim()] || 0), 0) }),
          wykonaj: (k, p, a) => skutkiEmerytury(a, String(p.srodki).split(',').map(x => x.trim())),
        },
        po_swojemu: { opis: 'Niech przekaże następcy „po swojemu"', h: 1, wykonaj: (k, p, a) => skutkiEmerytury(a, []) },
      },
      domyslnie: (k, a) => `kierownik odchodzi „po swojemu" — ${skutkiEmerytury(a, [])}`,
    },

    S_falszywy_komunikat: {
      tytul: '„Woda w Rzecznowie skażona — nie pić!"', od: 'Media społecznościowe', termin: 0, problemy: ['reputacja'], cele: ['E10'],
      tresc: 'W lokalnej grupie krąży „komunikat spółki" z logo: skażenie wody, nie pić do odwołania. Ludzie wykupują wodę butelkowaną. Wyniki badań są w normie.',
      czasowniki: {
        dementi: {
          opis: 'Dementi wybranymi kanałami',
          param: { kanaly: { opis: 'kanały', lista: ['strona', 'sms_gminy', 'media', 'wyniki_badan'],
            pomoc: ['strona: komunikat na stronie i w BOK', 'sms_gminy: SMS przez system gminy', 'media: lokalne media i radio', 'wyniki_badan: publikacja wyników badań z sanepidem'] } },
          koszt: (k, p) => ({ h: 1 + 1.5 * String(p.kanaly || '').split(',').filter(Boolean).length }),
          wykonaj: (k, p, a) => {
            const n = String(p.kanaly).split(',').filter(Boolean).length;
            a.wskaznik('reputacja', Math.min(4, n)); if (n >= 3) a.wskaznik('mandat', 2);
            a.flaga('dementi_kanaly', n);
            return n >= 3 ? 'Fałszywka zgaszona w kilka godzin.' : 'Dementi poszło, ale część ludzi dalej wierzy w „skażenie".';
          },
        },
        zgloszenie: { opis: 'Zgłosić fałszywkę do platformy i CERT Polska', h: 1, zamyka: false, wykonaj: (k, p, a) => { a.flaga('falszywka_zgloszona', true); return 'Zgłoszone.'; } },
      },
      domyslnie: (k, a) => { a.wskaznik('reputacja', -10); return 'cisza wygląda jak potwierdzenie — reputacja w dół'; },
    },

    S_noc_integrator: {
      tytul: '„Dzień dobry, AquaSter, potrzebujemy hasła do panelu"', od: 'Telefon ze stacji, 22:10', termin: 0, problemy: ['uslugi', 'dostawcy'], cele: ['E8', 'E2'],
      tresc: 'Operator nocnej zmiany dzwoni do Ciebie: „serwis integratora" prosi o aktualne hasło do panelu HMI, „bo robimy zdalną aktualizację". Podać?',
      // Procedura i ludzie rozstrzygają to bez Ciebie: brama (integrator nie prosi o hasła),
      // świadoma zmiana albo umowa z zakazem przekazywania haseł.
      zapobiegnieta: (k, a) => (a.dziala('brama_dostepu') ? 'operator: „integrator łączy się tylko przez bramę — rozłączyłem się"'
        : a.dzialObiekt('produkcja').swiadomosc >= 0.45 ? 'operator sam oddzwonił do integratora na znany numer — to było oszustwo' : null),
      czasowniki: {
        oddzwon: { opis: 'Hasła nigdy przez telefon: oddzwonić do integratora na znany numer i zgłosić próbę', h: 2,
          wykonaj: (k, p, a) => { a.dzial('produkcja', { swiadomosc: 0.15, zaufanie: 0.05 }); return 'Integrator nic nie wie. Zgłoszone do CSIRT INFRASTRUKTURA; zmiana dostaje zasadę na kartce przy telefonie.'; } },
        odmow: { opis: 'Odmówić i iść spać', h: 0.5, wykonaj: () => 'Odmówione. Nikt nie wie, kto dzwonił.' },
        podaj: { opis: 'Niech poda — to przecież integrator', wykonaj: (k, p, a) => { podanieHasla(a); return 'Hasło podane.'; } },
      },
      // Bez Twojej decyzji operator decyduje sam — pół na pół.
      domyslnie: (k, a) => (a.rnd() < 0.5 ? (podanieHasla(a), 'operator podał hasło') : 'operator odmówił na własną rękę'),
    },

    // ── ZMIANY FIRMY: rozwój, cięcia, odejścia (w każdej organizacji, nie tylko w tej) ──
    S_rozbudowa: {
      tytul: 'Nowe osiedle Zielone Wzgórze: trzy przepompownie i nowe stanowiska', od: 'Zarząd', termin: 1, problemy: ['uslugi', 'zasoby'], cele: ['E4'],
      tresc: 'Gmina oddaje osiedle: 3 nowe przepompownie z telemetrią po 4G (od wykonawcy sieci) i 10 stanowisk w BOK na nowych mieszkańców. Start za miesiąc.',
      czasowniki: {
        wlacz: { opis: 'Włączyć od pierwszego dnia w procesy: ewidencja, konfiguracja z szablonu, MFA, kopie (szybciej z ewidencją)',
          koszt: (k, p, a) => ({ h: a.dziala('inwentaryzacja') ? 4 : 12 }),
          wykonaj: (k, p, a) => { a.zasoby(13); a.ryzyko('rozbudowa', { uslugi: 1.15 }, 0.2, 'rozbudowa'); return 'Nowe urządzenia w ewidencji i w procesach od pierwszego dnia; telemetria przez prywatny APN.'; } },
        przez_msp: { opis: 'Zlecić włączenie firmie administrującej (MSP)', h: 2, pln: 5000,
          dostepny: (k, p, a) => (a.dziala('msp') ? null : 'nie masz firmy administrującej (MSP)'),
          wykonaj: (k, p, a) => { a.zasoby(13); a.ryzyko('rozbudowa', { uslugi: 1.15 }, 0.3, 'rozbudowa'); return 'MSP włącza nowe stanowiska; telemetrię konfiguruje wykonawca według Twoich wymagań.'; } },
        nic: { opis: 'Niech wykonawca i BOK zrobią po swojemu', h: 0, wykonaj: (k, p, a) => skutkiRozbudowy(a) },
      },
      domyslnie: (k, a) => skutkiRozbudowy(a),
    },

    S_ciecie: {
      tytul: 'Gmina tnie dotację — zarząd tnie budżety', od: 'Zarząd', termin: 0, problemy: ['budzet'], cele: ['E1'],
      tresc: 'Gmina obniża dopłatę do taryfy. Zarząd tnie wszystkie budżety o 20% do końca roku. „Bezpieczeństwo też — chyba że Pan/Pani pokaże, czego nie możemy ruszyć."',
      czasowniki: {
        przyjmij: { opis: 'Przyjąć cięcie (sam wycofasz to, co najmniej ważne)', h: 0,
          wykonaj: (k, p, a) => { const b = a.budzetMn(0.8); return `Budżet roku −20% (teraz ${Math.round(b / 1000)} tys. zł); kolejny rok startuje od tej kwoty.`; } },
        argumentuj: { opis: 'Pokazać zarządowi ryzyko w złotówkach (z rejestrem ryzyk działa najlepiej)', h: 4,
          wykonaj: (k, p, a) => {
            const mn = a.dziala('ryzyko') ? 0.95 : k.wskazniki.mandat >= 50 ? 0.88 : 0.8;
            const b = a.budzetMn(mn);
            return mn > 0.9 ? `Rejestr ryzyk przekonał zarząd: cięcie tylko 5% (budżet ${Math.round(b / 1000)} tys. zł).`
              : mn > 0.8 ? 'Zarząd Ci ufa: cięcie 12%.' : 'Bez liczb trudno bronić — cięcie 20%, jak wszystkim.';
          } },
        zaproponuj: { opis: 'Samemu wskazać cięcia (−15% zamiast −20%; zarząd docenia)', h: 3,
          wykonaj: (k, p, a) => { a.budzetMn(0.85); a.wskaznik('mandat', 2); return 'Zarząd przyjął Twoją listę: −15%. Wycofaj teraz to, co zaproponowałeś (x wycofaj:…).'; } },
      },
      domyslnie: (k, a) => { a.budzetMn(0.8); return 'cięcie 20% weszło bez dyskusji'; },
    },

    S_odejscie: {
      tytul: 'Pani Jola z IT odchodzi z końcem miesiąca', od: 'Kadry i Administracja', termin: 1, problemy: ['ludzie'], cele: ['E3'],
      tresc: 'Druga połowa IT (helpdesk, konta, drukarki, „wszystko, co się zepsuje") odchodzi do większej firmy. Zostaje 20 h miesięcznie pracy, którą ktoś musi robić.',
      czasowniki: {
        zatrudnij: { opis: 'Rekrutacja następczyni na pół etatu (3 miesiące luki — wtedy helpdesk jest Twój; potem 5500 zł/mies. z budżetu)', h: 8,
          koszt: (k, p, a) => ({ h: 8, msc: 5500 }),
          wykonaj: (k, p, a) => { a.hUtrata(20, 3, 'helpdesk do czasu zatrudnienia'); a.kosztStaly(5500, 3, 'pół etatu helpdesku'); return 'Rekrutacja ruszyła. Do czasu zatrudnienia helpdesk spada na Ciebie.'; } },
        msp: { opis: 'Przenieść helpdesk do firmy administrującej (MSP)',
          koszt: (k, p, a) => ({ h: 4, msc: a.dziala('msp') || k.obiekty.msp?.stan === 'projekt' ? 3000 : 10000 }),
          wykonaj: (k, p, a) => {
            if (!a.dziala('msp') && k.obiekty.msp?.stan !== 'projekt') a.wdrozZeSprawy('msp');
            a.cena('msp', 1.4);
            return 'Helpdesk przechodzi do MSP (umowa rozszerzona o ok. 40%).';
          } },
        przejmij: { opis: 'Przejąć jej pracę samemu (−20 h miesięcznie na bezpieczeństwo, na stałe)', h: 0,
          wykonaj: (k, p, a) => { a.hUtrata(20, 999, 'helpdesk po odejściu'); return 'Od teraz drukarki i konta są Twoje.'; } },
      },
      domyslnie: (k, a) => { a.hUtrata(20, 999, 'helpdesk po odejściu'); return 'nikt nic nie zrobił — jej praca spadła na Ciebie (−20 h/mies.)'; },
    },
  },

  // ── OŚ KAMPANII (reżyser wybiera moment w oknie) ──
  // typ: incydent (scenariusze/<id>-*.incydent.js) · sprawa (sprawy powyżej) · termin · fala · final
  zdarzenia: [
    { id: 'S03', typ: 'incydent', okno: [3, 5], ciezar: 1.0, cele: ['E4', 'E12', 'E6', 'E10'],
      // Okno startuje miesiąc PO ostrzeżeniu CERT (m. 2): gracz musi mieć uczciwą szansę zareagować.
      opis: 'haktywiści na panelu HMI stacji (próba w logach, jeśli panel już zamknięty)' },
    { id: 'S01', typ: 'incydent', okno: [3, 6], ciezar: 0.6, cele: ['E2', 'E6', 'E10'],
      opis: 'BEC: dostawca chemii „zmienia rachunek" (92 300 zł)' },
    { id: 'S_noc_integrator', typ: 'sprawa', okno: [3, 15], ciezar: 0.3 },
    { id: 'S_budzet2027', typ: 'sprawa', okno: [8, 8], ciezar: 0.3 },
    { id: 'S_przejecie', typ: 'sprawa', okno: [9, 9], ciezar: 0.5 },
    { id: 'S_ubezpieczenie', typ: 'sprawa', okno: [10, 16], ciezar: 0.2 },
    { id: 'S_umowa_integratora', typ: 'sprawa', okno: [12, 12], ciezar: 0.3 },
    { id: 'T_szbi', typ: 'termin', okno: [13, 13], ciezar: 0.3, opis: '3.04.2027 — termin wdrożenia obowiązków (SZBI)' },
    { id: 'S_dwr', typ: 'sprawa', okno: [14, 14], ciezar: 0.4, szansa: 0.3 },
    { id: 'S_wodomierze', typ: 'sprawa', okno: [15, 16], ciezar: 0.3 },
    { id: 'F_haktywisci2', typ: 'fala', okno: [15, 20], ciezar: 0.8, opis: 'druga fala haktywistów: DDoS na e-BOK i próba na przepompownię' },
    { id: 'S_emerytura', typ: 'sprawa', okno: [17, 17], ciezar: 0.3 },
    { id: 'S_falszywy_komunikat', typ: 'sprawa', okno: [19, 21], ciezar: 0.6 },
    // Zmiany firmy (rozwój, cięcia, odejścia) — decyzje, których nie da się „odhaczyć" na starcie.
    { id: 'S_rozbudowa', typ: 'sprawa', okno: [10, 13], ciezar: 0.3 },
    { id: 'S_odejscie', typ: 'sprawa', okno: [11, 16], ciezar: 0.3 },
    { id: 'S_ciecie', typ: 'sprawa', okno: [15, 18], ciezar: 0.4 },
    // 🔵 Podmiot ważny nie ma ustawowego audytu okresowego — audyt zamykający kampanię zleca rada
    // nadzorcza (docs/02-…). Kampania ma skończoną liczbę miesięcy i zawsze kończy się audytem.
    { id: 'A_kontrola', typ: 'final', okno: [23, 24], ciezar: 0.8,
      opis: 'audyt zamykający zlecony przez radę nadzorczą (niezależny audytor, porównuje deklaracje z rzeczywistością)' },
  ],
};

// ── Skutki spraw złożonych (wspólne dla czasownika i rozstrzygnięcia domyślnego) ──
// Rozbudowa „po swojemu": urządzenia poza ewidencją, telemetria z publicznym IP od wykonawcy.
function skutkiRozbudowy(a) {
  a.nieznane(13);
  a.ryzyko('rozbudowa', { uslugi: 1.15 }, 1, 'rozbudowa');
  return 'Wykonawca podłączył telemetrię po swojemu (publiczne IP, domyślne hasła); nowe stanowiska są poza ewidencją.';
}
function polaczOczyszczalnie(k, a, s) {
  a.flaga('oczyszczalnia_polaczona', true);
  const zapora = a.dziala('segmentacja') || a.dziala('ngfw');
  a.nieznane(s.dane.przeglad ? 2 : 12);
  a.wektor('uslugi', s.dane.przeglad ? 1.02 : zapora ? 1.05 : 1.2);
  const f = a.fakt('oczyszczalnia_intruz');
  if (f.prawda && !f.naprawiony && (!zapora || a.rnd() < 0.5)) { a.intruz({ kto: 'broker', etap: 'dostep', wektor: 'uslugi' }); f.naprawiony = true; }
  return s.dane.przeglad ? 'sieci połączone po przeglądzie.' : `sieci połączone bez przeglądu${zapora ? ' (przez zaporę)' : ''}.`;
}
function skutkiWodomierzy(a, wybrane) {
  const ma = x => wybrane.includes(x);
  const dost = (ma('ocena_dostawcy') ? 0.6 : 1) * (ma('umowa_powierzenia') ? 0.8 : 1);
  a.wektor('dostawca', 1 + 0.3 * dost);
  a.wektor('poswiadczenia', 1 + 0.1 * (ma('mfa_dostawcy') ? 0.2 : 1));
  if (ma('dpia')) { a.flaga('dpia_wodomierze', true); a.dzial('bok', { swiadomosc: 0.1, zaufanie: 0.05 }); }
  if (ma('minimalizacja')) { a.flaga('minimalizacja_wodomierze', true); a.dzial('bok', { zaufanie: -0.03 }); }
  a.flaga('wodomierze_srodki', wybrane);
  return wybrane.length ? `wodomierze ruszają ze środkami: ${wybrane.join(', ')}.` : 'wodomierze ruszają bez oceny dostawcy i danych.';
}
function skutkiEmerytury(a, wybrane) {
  const ma = x => wybrane.includes(x);
  if (!ma('dokumentacja')) { a.flaga('wiedza_utracona', true); a.oslabObiekt('bcp', 0.7); }
  if (!ma('zmiana_hasel')) { a.wektor('insider', 1.15); a.wektor('uslugi', 1.1); }
  if (ma('przekazanie_z_integratorem')) a.dzial('produkcja', { swiadomosc: 0.1 });
  a.flaga('emerytura_srodki', wybrane);
  return wybrane.length ? `przekazanie: ${wybrane.join(', ')}.` : 'wiedza i hasła odchodzą razem z człowiekiem.';
}
function podanieHasla(a) {
  a.wektor('uslugi', 1.3);
  a.intruz({ kto: 'haktywista', etap: 'eskalacja', wektor: 'uslugi' });
  a.flaga('haslo_podane', true);
}
