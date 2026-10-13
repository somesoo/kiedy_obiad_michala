// ── KATALOG KONTROLI (narzędzia, procesy, usługi, projekty) ──
// Jedno źródło liczb dla silnika i prototypu symulacji (proto/symulacja.js). Dokument
// docs/04-narzedzia.md tłumaczy DLACZEGO te liczby są takie, a nie inne — kto zmienia
// wartości tutaj, poprawia też tamten opis (jak cennik w regulaminie Snakes).
//
// Ceny w PLN netto, poziom 2026, ORIENTACYJNE (widełki z rynku, nie oferta). Do kalibracji
// z prawdziwymi ofertami przed premierą — patrz docs/14-samoewaluacja.md.
//
// Pola:
//   id, nazwa, csf          — funkcja NIST CSF 2.0: GV, ID, PR, DE, RS, RC
//   typ                     — 'narzedzie' | 'proces' | 'usluga' | 'projekt'
//   wdrozenie: { pln, h, mies }  — jednorazowo: koszt, godziny zespołu, ile miesięcy trwa
//   utrzymanie: { pln, pln_na_stanowisko, pln_na_uzytkownika, pln_min, h }
//                           — co miesiąc. Godziny `h` to minimum, żeby kontrola DZIAŁAŁA;
//                             mniej godzin = proporcjonalnie mniejsza skuteczność
//                             („narzędzie bez ludzi to ozdoba").
//   wymaga                  — id kontroli, bez których ta działa na 30% (SOAR bez SIEM-a…)
//   inwentaryzacja          — true: chroni tylko ZNANE zasoby (pokrycie × znane/prawdziwe)
//   zapobiega               — { wektor: 0..1 } obniżenie szansy udanego dostępu początkowego
//   utrudnia                — { etap: 0..1 } obniżenie szansy przejścia do etapu
//   wykrywa                 — { etap: 0..1 } tygodniowa szansa wykrycia intruza na etapie
//   odtwarzanie             — { przestoj: mnożnik dni przestoju, wyciek: mnożnik skutków }
//   alerty                  — alerty / miesiąc / 100 zasobów (każdy kosztuje czas triage)
//   triage                  — jaką część triage zdejmuje z zespołu (SOAR, MDR)
//   reakcja                 — gotowość do reagowania (sumuje się, sufit 0.8)
//   godziny                 — godziny/mies., które usługa DODAJE zespołowi (MSP, vCISO)
//   odkrywa                 — jak szybko odkrywa nieznane zasoby (shadow IT)
//   zgodnosc, mandat, mnoznik_procesow — wpływ na wskaźniki zarządcze (silnik gry)
//   tarcie                  — 0..10, ile przeszkadza ludziom w pracy (→ shadow IT, mandat)
//   pulapka                 — realna pułapka, którą gra ma pokazać
//
// Wektory dostępu: phishing, poswiadczenia, podatnosc, uslugi, dostawca, insider, bec, ddos
// Etapy: dostep → eskalacja → ruch → cel   (patrz docs/07-zagrozenia-i-model-ataku.md)

module.exports = [
  // ─── SZYBKIE WYGRANE: głównie godziny, mało pieniędzy ───
  {
    id: 'mfa', nazwa: 'MFA dla wszystkich kont (poczta, VPN, chmura)', csf: 'PR', typ: 'projekt',
    wdrozenie: { pln: 5000, h: 80, mies: 1 },
    utrzymanie: { pln_na_uzytkownika: 0, h: 6 },
    zapobiega: { poswiadczenia: 0.85, phishing: 0.35 },
    tarcie: 3,
    pulapka: 'Push bez numeru = MFA fatigue; SMS = SIM swap; AiTM kradnie sesję mimo MFA. ' +
      'Wyjątki „dla zarządu" to pierwsze konta, które wpadną.',
  },
  {
    id: 'mfa_fido', nazwa: 'Klucze FIDO2 dla adminów i zarządu', csf: 'PR', typ: 'projekt',
    wdrozenie: { pln: 6000, h: 30, mies: 1 },
    utrzymanie: { h: 2 },
    wymaga: ['mfa'],
    zapobiega: { poswiadczenia: 0.5, phishing: 0.25 },
    utrudnia: { eskalacja: 0.15 },
    tarcie: 1,
    pulapka: 'Zgubiony klucz w piątek wieczorem — bez procedury odzyskania prezes nie wejdzie do poczty.',
  },
  {
    id: 'hardening', nazwa: 'Utwardzenie stacji i serwerów (CIS, LAPS, makra, admin lokalny)', csf: 'PR', typ: 'projekt',
    wdrozenie: { pln: 0, h: 160, mies: 2 },
    utrzymanie: { h: 8 },
    inwentaryzacja: true,
    zapobiega: { phishing: 0.3 },
    utrudnia: { eskalacja: 0.35, ruch: 0.2 },
    tarcie: 3,
    pulapka: 'Zabranie praw admina lokalnego to najtańsza kontrola i najgłośniejszy bunt w firmie.',
  },
  {
    id: 'ekspozycja', nazwa: 'Porządek z usługami wystawionymi do internetu (RDP, HMI, panele)', csf: 'PR', typ: 'projekt',
    wdrozenie: { pln: 0, h: 40, mies: 1 },
    utrzymanie: { h: 4 },
    inwentaryzacja: true,
    zapobiega: { uslugi: 0.8, podatnosc: 0.2 },
    tarcie: 1,
    pulapka: 'Zamykasz to, o czym wiesz. Panel HMI postawiony przez integratora „na chwilę" nie jest na liście.',
  },
  {
    id: 'moje_cert', nazwa: 'moje.cert.pl (skaner Artemis, alerty o wyciekach, Lista Ostrzeżeń)', csf: 'ID', typ: 'usluga',
    wdrozenie: { pln: 0, h: 8, mies: 1 },
    utrzymanie: { h: 4 },
    zapobiega: { uslugi: 0.25, podatnosc: 0.1, poswiadczenia: 0.1, phishing: 0.05 },
    odkrywa: 0.15,
    tarcie: 0,
    pulapka: 'Darmowe i realne (CERT Polska). Raport nic nie da, jeśli nikt nie ma godzin, żeby go przeczytać.',
  },

  // ─── TOŻSAMOŚĆ I DOSTĘP ───
  {
    id: 'jml', nazwa: 'Proces JML (przyjęcie, zmiana, odejście) spięty z kadrami', csf: 'PR', typ: 'proces',
    wdrozenie: { pln: 0, h: 60, mies: 2 },
    utrzymanie: { h: 10 },
    zapobiega: { insider: 0.45, poswiadczenia: 0.15 },
    tarcie: 1,
    pulapka: 'Kadry wysyłają informację o odejściu tydzień po fakcie. Konto zwolnionego działa dalej.',
  },
  {
    id: 'pam', nazwa: 'PAM — sejf i nagrywanie sesji kont uprzywilejowanych', csf: 'PR', typ: 'narzedzie',
    wdrozenie: { pln: 120000, h: 200, mies: 3 },
    utrzymanie: { pln: 4000, h: 16 },
    wymaga: ['mfa'],
    zapobiega: { dostawca: 0.4, insider: 0.25 },
    utrudnia: { eskalacja: 0.4, ruch: 0.3 },
    wykrywa: { eskalacja: 0.1 },
    tarcie: 4,
    pulapka: 'Admini obchodzą PAM „awaryjnym" kontem domenowym, którego nikt nie wyłączył.',
  },
  {
    id: 'sso', nazwa: 'SSO i centralna tożsamość (jedno konto, jedno odcięcie)', csf: 'PR', typ: 'projekt',
    wdrozenie: { pln: 30000, h: 120, mies: 3 },
    utrzymanie: { pln_na_uzytkownika: 12, h: 8 },
    zapobiega: { poswiadczenia: 0.2, insider: 0.15 },
    tarcie: -2,
    pulapka: 'Jedyna kontrola, która ZMNIEJSZA tarcie — warto ją robić razem z MFA.',
  },

  // ─── PODATNOŚCI I ZASOBY ───
  {
    id: 'inwentaryzacja', nazwa: 'Inwentaryzacja zasobów (CMDB + skan sieci)', csf: 'ID', typ: 'proces',
    wdrozenie: { pln: 15000, h: 100, mies: 2 },
    utrzymanie: { pln: 1500, h: 12 },
    odkrywa: 0.6,
    tarcie: 0,
    pulapka: 'Nudne, nikt nie dostaje za to medalu, a bez tego każda inna kontrola ma dziury.',
  },
  {
    id: 'skaner_podatnosci', nazwa: 'Skaner podatności (wewnętrzny i zewnętrzny)', csf: 'ID', typ: 'narzedzie',
    wdrozenie: { pln: 5000, h: 40, mies: 1 },
    utrzymanie: { pln: 1800, h: 16 },
    inwentaryzacja: true,
    zapobiega: { podatnosc: 0.3, uslugi: 0.3 },
    odkrywa: 0.2,
    tarcie: 0,
    pulapka: 'Raport na 4000 pozycji bez priorytetów. Bez procesu łatania to tylko lista wstydu.',
  },
  {
    id: 'patch', nazwa: 'Zarządzanie poprawkami (okna serwisowe, SLA na krytyczne)', csf: 'PR', typ: 'proces',
    wdrozenie: { pln: 10000, h: 60, mies: 1 },
    utrzymanie: { pln_na_stanowisko: 5, h: 30 },
    inwentaryzacja: true,
    zapobiega: { podatnosc: 0.6, phishing: 0.15 },
    utrudnia: { eskalacja: 0.2 },
    tarcie: 2,
    pulapka: 'Systemy „których nie wolno restartować" (HIS, SCADA, ERP) to dokładnie te, które wpadają.',
  },
  {
    id: 'asm', nazwa: 'Monitoring powierzchni ataku z zewnątrz (ASM)', csf: 'ID', typ: 'usluga',
    wdrozenie: { pln: 0, h: 16, mies: 1 },
    utrzymanie: { pln: 5000, h: 8 },
    zapobiega: { uslugi: 0.35, podatnosc: 0.2 },
    odkrywa: 0.25,
    tarcie: 0,
    pulapka: 'Część tego daje za darmo moje.cert.pl — gra powinna to pokazać, zanim gracz zapłaci.',
  },

  // ─── POCZTA I LUDZIE ───
  {
    id: 'poczta', nazwa: 'Ochrona poczty (sandbox, DMARC/SPF/DKIM, baner „zewnętrzny")', csf: 'PR', typ: 'narzedzie',
    wdrozenie: { pln: 3000, h: 40, mies: 1 },
    utrzymanie: { pln_na_uzytkownika: 10, h: 6 },
    zapobiega: { phishing: 0.45, bec: 0.3 },
    wykrywa: { dostep: 0.05 },
    alerty: 6,
    tarcie: 1,
    pulapka: 'DMARC na p=none przez dwa lata, „bo boimy się, że coś nie dojdzie".',
  },
  {
    id: 'szkolenia', nazwa: 'Program świadomości + symulacje phishingu', csf: 'PR', typ: 'usluga',
    wdrozenie: { pln: 4000, h: 40, mies: 1 },
    utrzymanie: { pln_na_uzytkownika: 6, h: 10 },
    zapobiega: { phishing: 0.3, bec: 0.3, poswiadczenia: 0.1 },
    wykrywa: { dostep: 0.06 },
    tarcie: 1,
    pulapka: 'Szkolenie raz w roku z testem na 10 pytań daje zgodność, nie zmianę zachowań. ' +
      'Publiczne zawstydzanie „klikaczy" zabija zgłaszanie.',
  },
  {
    id: 'weryfikacja_platnosci', nazwa: 'Procedura zmiany rachunku (oddzwonienie z kartoteki + biała lista VAT)', csf: 'PR', typ: 'proces',
    wdrozenie: { pln: 0, h: 16, mies: 1 },
    utrzymanie: { h: 4 },
    zapobiega: { bec: 0.85 },
    tarcie: 1,
    pulapka: 'Działa, dopóki prezes nie zadzwoni do księgowej, że „tym razem pilne, bez procedur".',
  },

  // ─── WYKRYWANIE I REAGOWANIE ───
  {
    id: 'edr', nazwa: 'EDR na stacjach i serwerach', csf: 'DE', typ: 'narzedzie',
    wdrozenie: { pln: 5000, h: 80, mies: 2 },
    utrzymanie: { pln_na_stanowisko: 25, h: 20 },
    inwentaryzacja: true,
    zapobiega: { phishing: 0.3 },
    utrudnia: { eskalacja: 0.3, ruch: 0.25, cel: 0.35 },
    wykrywa: { dostep: 0.12, eskalacja: 0.25, ruch: 0.3, cel: 0.4 },
    odtwarzanie: { przestoj: 0.8 },
    alerty: 8,
    tarcie: 1,
    pulapka: 'Tryb „tylko wykrywaj" ustawiony na czas wdrożenia i nigdy nie przełączony na blokowanie. ' +
      'Na serwerze, który „spowalniał", agent wyłączony.',
  },
  {
    id: 'siem', nazwa: 'SIEM (centralne logi i korelacja)', csf: 'DE', typ: 'narzedzie',
    wdrozenie: { pln: 40000, h: 300, mies: 3 },
    utrzymanie: { pln: 18000, h: 60 },
    wykrywa: { dostep: 0.08, eskalacja: 0.2, ruch: 0.25, cel: 0.15 },
    alerty: 45,
    tarcie: 0,
    pulapka: 'Najdroższy sposób na posiadanie logów, których nikt nie czyta. Pierwsze miesiące to ' +
      'zalew fałszywych alarmów — bez strojenia zespół przestaje je otwierać.',
  },
  {
    id: 'siem_os', nazwa: 'SIEM open source (np. Wazuh) — tani w licencji, drogi w godzinach', csf: 'DE', typ: 'narzedzie',
    wdrozenie: { pln: 8000, h: 450, mies: 4 },
    utrzymanie: { pln: 2500, h: 90 },
    wykrywa: { dostep: 0.07, eskalacja: 0.18, ruch: 0.22, cel: 0.12 },
    alerty: 55,
    tarcie: 0,
    pulapka: 'Licencja 0 zł nie znaczy, że 0 zł. Kiedy odchodzi jedyna osoba, która go postawiła, umiera.',
  },
  {
    id: 'soar', nazwa: 'SOAR (automatyzacja playbooków)', csf: 'RS', typ: 'narzedzie',
    wdrozenie: { pln: 30000, h: 200, mies: 3 },
    utrzymanie: { pln: 12000, h: 20 },
    wymaga: ['siem', 'plan_ir'],
    triage: 0.5,
    reakcja: 0.15,
    tarcie: 0,
    pulapka: 'Automatyzuje proces, którego nie ma. Bez playbooków spisanych przez ludzi nie ma czego automatyzować.',
  },
  {
    id: 'mdr', nazwa: 'MDR / SOC 24/7 jako usługa', csf: 'DE', typ: 'usluga',
    wdrozenie: { pln: 10000, h: 60, mies: 1 },
    utrzymanie: { pln_na_stanowisko: 45, pln_min: 9000, h: 10 },
    wymaga: ['edr'],
    wykrywa: { dostep: 0.1, eskalacja: 0.25, ruch: 0.3, cel: 0.3 },
    triage: 0.85,
    reakcja: 0.15,
    tarcie: 0,
    pulapka: 'Dzwonią o 3:00 w nocy — i ktoś po Twojej stronie musi odebrać i mieć uprawnienia do decyzji.',
  },
  {
    id: 'ndr', nazwa: 'NDR / IDS (analiza ruchu sieciowego)', csf: 'DE', typ: 'narzedzie',
    wdrozenie: { pln: 60000, h: 120, mies: 2 },
    utrzymanie: { pln: 6000, h: 24 },
    wykrywa: { ruch: 0.25, cel: 0.15, eskalacja: 0.05 },
    alerty: 25,
    tarcie: 0,
    pulapka: 'Widzi ruch, którego EDR nie zobaczy (drukarki, IoT, OT), ale tylko tam, gdzie ma czujnik.',
  },
  {
    id: 'deception', nazwa: 'Honeypoty i konta-pułapki', csf: 'DE', typ: 'narzedzie',
    wdrozenie: { pln: 20000, h: 60, mies: 1 },
    utrzymanie: { pln: 1000, h: 4 },
    wykrywa: { ruch: 0.25, eskalacja: 0.1 },
    alerty: 1,
    tarcie: 0,
    pulapka: 'Prawie zero fałszywych alarmów — dlatego alert z pułapki trzeba traktować jak pożar.',
  },
  {
    id: 'plan_ir', nazwa: 'Plan reagowania na incydenty + playbooki + lista kontaktów', csf: 'RS', typ: 'proces',
    wdrozenie: { pln: 0, h: 80, mies: 1 },
    utrzymanie: { h: 4 },
    reakcja: 0.25,
    tarcie: 0,
    pulapka: 'Plan w PDF-ie na zaszyfrowanym serwerze. Numery telefonów tylko w Outlooku, który nie działa.',
  },
  {
    id: 'cwiczenia', nazwa: 'Ćwiczenia tabletop z zarządem (co kwartał)', csf: 'RS', typ: 'proces',
    wdrozenie: { pln: 0, h: 24, mies: 1 },
    utrzymanie: { h: 8 },
    wymaga: ['plan_ir'],
    reakcja: 0.2,
    mandat: 1,
    tarcie: 0,
    pulapka: 'Prezes pierwszy raz słyszy pytanie „płacimy okup?" o 2:00 w nocy — albo na ćwiczeniu.',
  },
  {
    id: 'retainer_ir', nazwa: 'Retainer DFIR (firma zewnętrzna, gwarantowany czas reakcji)', csf: 'RS', typ: 'usluga',
    wdrozenie: { pln: 0, h: 8, mies: 1 },
    utrzymanie: { pln: 6000, h: 1 },
    reakcja: 0.25,
    tarcie: 0,
    pulapka: 'Bez umowy w trakcie fali ransomware nikt nie przyjedzie w 4 godziny — wszyscy mają już klientów.',
  },

  // ─── ODTWARZANIE ───
  {
    id: 'backup', nazwa: 'Kopie zapasowe 3-2-1-1-0 (jedna niezmienialna/offline)', csf: 'RC', typ: 'projekt',
    wdrozenie: { pln: 25000, h: 80, mies: 1 },
    utrzymanie: { pln: 3000, h: 10 },
    odtwarzanie: { przestoj: 0.4 },
    tarcie: 0,
    pulapka: 'Kopia na tym samym NAS-ie w tej samej domenie Windows szyfruje się razem z resztą.',
  },
  {
    id: 'dr_test', nazwa: 'Testy odtworzenia (DR) co kwartał', csf: 'RC', typ: 'proces',
    wdrozenie: { pln: 0, h: 40, mies: 1 },
    utrzymanie: { h: 14 },
    wymaga: ['backup'],
    odtwarzanie: { przestoj: 0.6 },
    tarcie: 1,
    pulapka: 'Kopia, której nikt nie odtworzył, jest hipotezą. Pierwszy test zwykle się nie udaje — i dobrze, że na teście.',
  },
  {
    id: 'bcp', nazwa: 'Plan ciągłości działania (procedury papierowe, priorytety)', csf: 'RC', typ: 'proces',
    wdrozenie: { pln: 0, h: 100, mies: 2 },
    utrzymanie: { h: 6 },
    odtwarzanie: { przestoj: 0.75 },
    tarcie: 0,
    pulapka: 'Szpital bez wydrukowanych formularzy przez 3 dni nie przyjmie pacjenta. BCP to nie dokument IT.',
  },

  // ─── SIEĆ, CHMURA, DANE ───
  {
    id: 'segmentacja', nazwa: 'Segmentacja sieci (strefy, oddzielenie OT, serwerów, gości)', csf: 'PR', typ: 'projekt',
    wdrozenie: { pln: 90000, h: 300, mies: 4 },
    utrzymanie: { pln: 1000, h: 12 },
    utrudnia: { ruch: 0.5, cel: 0.2 },
    odtwarzanie: { przestoj: 0.7 },
    tarcie: 2,
    pulapka: 'Wyjątek w firewallu „any-any dla integratora" przez trzy lata unieważnia cały projekt.',
  },
  {
    id: 'ngfw', nazwa: 'Firewall nowej generacji na brzegu (z subskrypcjami)', csf: 'PR', typ: 'narzedzie',
    wdrozenie: { pln: 80000, h: 80, mies: 2 },
    utrzymanie: { pln: 2500, h: 8 },
    zapobiega: { uslugi: 0.3, podatnosc: 0.15 },
    wykrywa: { cel: 0.05 },
    alerty: 5,
    tarcie: 1,
    pulapka: 'Sam firewall to też urządzenie brzegowe z podatnościami — wymaga łatania jak wszystko inne.',
  },
  {
    id: 'waf_ddos', nazwa: 'WAF + ochrona anty-DDoS (CDN)', csf: 'PR', typ: 'usluga',
    wdrozenie: { pln: 2000, h: 30, mies: 1 },
    utrzymanie: { pln: 4000, h: 6 },
    zapobiega: { ddos: 0.8, podatnosc: 0.2, poswiadczenia: 0.15 },
    tarcie: 0,
    pulapka: 'Chroni tylko to, co idzie przez CDN — stary adres IP serwera dalej odpowiada wprost.',
  },
  {
    id: 'dlp', nazwa: 'DLP (kontrola wypływu danych)', csf: 'PR', typ: 'narzedzie',
    wdrozenie: { pln: 40000, h: 160, mies: 3 },
    utrzymanie: { pln_na_uzytkownika: 18, h: 30 },
    zapobiega: { insider: 0.3 },
    utrudnia: { cel: 0.1 },
    wykrywa: { cel: 0.15 },
    alerty: 30,
    tarcie: 5,
    pulapka: 'Bez klasyfikacji danych DLP nie wie, czego pilnuje — blokuje fakturę, przepuszcza bazę klientów.',
  },
  {
    id: 'cspm', nazwa: 'Bezpieczeństwo chmury (CSPM, skan sekretów w repozytoriach)', csf: 'PR', typ: 'narzedzie',
    wdrozenie: { pln: 5000, h: 60, mies: 1 },
    utrzymanie: { pln: 5000, h: 12 },
    zapobiega: { poswiadczenia: 0.2, podatnosc: 0.2, uslugi: 0.2 },
    wykrywa: { dostep: 0.05 },
    alerty: 10,
    tarcie: 1,
    pulapka: 'Klucz dostępowy w publicznym repo żyje sekundy, zanim znajdzie go bot. Rotacja, nie tylko alert.',
  },
  {
    id: 'ot_monitoring', nazwa: 'Monitoring sieci OT (pasywny, protokoły przemysłowe)', csf: 'DE', typ: 'narzedzie',
    wdrozenie: { pln: 220000, h: 160, mies: 4 },
    utrzymanie: { pln: 6000, h: 16 },
    wykrywa: { ruch: 0.3, cel: 0.35 },
    alerty: 8,
    tarcie: 0,
    pulapka: 'Aktywne skanowanie sieci OT potrafi zawiesić sterownik. Tylko pasywnie, z inżynierem procesu.',
  },

  // ─── GODZINY Z ZEWNĄTRZ ───
  {
    id: 'msp', nazwa: 'Zewnętrzny administrator / MSP (pakiet godzin)', csf: 'GV', typ: 'usluga',
    wdrozenie: { pln: 0, h: 8, mies: 1 },
    utrzymanie: { pln: 7000, h: 0 },
    godziny: 40,
    tarcie: 0,
    pulapka: 'MSP ma admina u wszystkich swoich klientów naraz — jego włamanie to Twoje włamanie ' +
      '(wzorzec Kaseya VSA 2021). Umowa bez wymagań bezpieczeństwa to otwarte drzwi.',
  },
  {
    id: 'vciso', nazwa: 'vCISO (CISO na część etatu, z zewnątrz)', csf: 'GV', typ: 'usluga',
    wdrozenie: { pln: 0, h: 8, mies: 1 },
    utrzymanie: { pln: 12000, h: 4 },
    godziny: 16,
    mandat: 2,
    mnoznik_procesow: 0.1,
    tarcie: 0,
    pulapka: 'Zna przepisy i rozmawia z zarządem, ale nie wstanie o 3:00 do serwera. Pełnomocnik ' +
      'wobec organu i tak musi być w firmie.',
  },

  // ─── ZARZĄDZANIE (GV) ───
  {
    id: 'szbi', nazwa: 'SZBI — system zarządzania bezpieczeństwem informacji (wymóg KSC)', csf: 'GV', typ: 'proces',
    wdrozenie: { pln: 60000, h: 400, mies: 6 },
    utrzymanie: { h: 30 },
    zgodnosc: 25,
    mnoznik_procesow: 0.15,
    tarcie: 1,
    pulapka: 'Kupiony komplet „polityk pod NIS2" z innej firmy. Audytor pyta o dowody — dowodów nie ma.',
  },
  {
    id: 'ryzyko', nazwa: 'Szacowanie ryzyka (rejestr, właściciele, przegląd)', csf: 'GV', typ: 'proces',
    wdrozenie: { pln: 0, h: 80, mies: 2 },
    utrzymanie: { h: 10 },
    zgodnosc: 10,
    odkrywa: 0.1,
    mandat: 1,
    tarcie: 0,
    pulapka: 'Macierz 5×5, w której wszystko jest „średnie". Ryzyko bez właściciela z biznesu nie ma właściciela.',
  },
  {
    id: 'dostawcy', nazwa: 'Zarządzanie bezpieczeństwem dostawców (ankiety, umowy, przeglądy)', csf: 'GV', typ: 'proces',
    wdrozenie: { pln: 0, h: 120, mies: 3 },
    utrzymanie: { h: 16 },
    zapobiega: { dostawca: 0.3 },
    zgodnosc: 10,
    tarcie: 1,
    pulapka: 'Ankieta na 200 pytań wypełniona „tak" na wszystko. Kluczowy dostawca nie odpowiada wcale.',
  },
  {
    id: 'ubezpieczenie', nazwa: 'Ubezpieczenie cyber (wymaga MFA, EDR, kopii offline)', csf: 'GV', typ: 'usluga',
    wdrozenie: { pln: 0, h: 20, mies: 1 },
    utrzymanie: { pln: 5000, h: 0 },
    wymaga: ['mfa', 'edr', 'backup'],
    ubezpieczenie: { pokrycie: 0.6, limit: 5000000 },
    tarcie: 0,
    pulapka: 'Ankieta przed polisą to oświadczenie. Kłamstwo w niej („mamy MFA wszędzie") = odmowa wypłaty.',
  },
];
