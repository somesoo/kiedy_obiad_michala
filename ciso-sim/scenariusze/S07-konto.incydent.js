// ── S07 „Konto byłego pracownika" — wariant gminny, incydent bez drzewa decyzji ──
// Opis do czytania: S07-konto-bylego-pracownika.md (sekcja „Warianty → Gmina"). Format:
// proto/incydent.js (nagłówek). Gracz robi, co chce i w jakiej kolejności chce; czas płynie
// z każdą akcją. Ocena — zasady na końcu pliku, nie etykiety akcji.
//
// Prawda: zleceniobiorca IT (2 dni w tygodniu, admin domeny „z domu", bez MFA) po sporze
// o rozliczenie dostał w piątek wypowiedzenie umowy. Nikt nie odebrał mu uprawnień.
// W poniedziałek o 7:40 blokuje konta urzędników; jeśli nadal ma dostęp, po kilku godzinach
// kasuje udziały referatów, a potem czyści dzienniki (zaciera ślady).
//
// Skąd liczby (🔵 uproszczenia gry, docs/02-…): przestój urzędu kosztuje 1/24 „dnia" firmy na
// godzinę; obsługa na papierze ogranicza koszt do 40% (25% z przećwiczonym planem ciągłości);
// usunięte dane bez kopii to ok. 40 tys. zł odtwarzania i kar umownych.

const PRZESTOJ_PAPIER = 0.4, PRZESTOJ_PAPIER_BCP = 0.25;
const ODTWORZENIE_BEZ_KOPII = 40000, SPORNA_FAKTURA = 18000;
const KASUJE_DANE_H = 4, CZYSCI_LOGI_H = 8;

module.exports = {
  id: 'S07',
  tytul: 'Konto byłego zleceniobiorcy',
  cele: ['E4', 'E9', 'E11', 'E10'],
  limit_h: 24,

  start: ctx => {
    // Uprawnienia odebrane wcześniej (fakt naprawiony) albo proces JML/PAM spięty z umowami:
    // konto wyłączone w dniu wypowiedzenia — w poniedziałek widać tylko nieudane logowania.
    const f = ctx.fakt('zleceniobiorca_admin');
    const proba = !f || !f.prawda || f.naprawiony || ctx.dziala('jml') || ctx.dziala('pam');
    return {
      proba, kopie: ctx.dziala('backup') && ctx.jakosc('backup') > 0.5, bcp: ctx.dziala('bcp'),
      koszt_h: ctx.firma.koszt_dnia / 24,
      obsluga_stoi: !proba, przestoj_h: 0, dostep_odebrany: proba, ostrzezony: false,
      dane_usuniete: false, dane_przywrocone: false, logi_usuniete: false, dowody: null,
      papier: false, komunikat_h: null, csirt_h: null, zawiadomienie: false, uodo_h: null,
      zaplacono: false, przeglad: false, wojt: false, zablokowane_ponownie: false,
    };
  },

  widok: s => {
    const l = [];
    if (s.proba) {
      l.push('Poniedziałek 7:40. W dzienniku kontrolera domeny: seria nieudanych logowań z adresu domowego byłego zleceniobiorcy IT. Konto było już wyłączone.');
      l.push('• Urząd pracuje normalnie [pewne]');
      l.push('• Ktoś próbował wejść kontem osoby, której umowa się skończyła [pewne]');
      return l;
    }
    l.push('Poniedziałek 7:40. Nikt w urzędzie nie może się zalogować. Przy okienkach USC i podatków kolejka, telefon od wójta.');
    l.push('• Konta urzędników zablokowane z konta administratora domeny zleceniobiorcy IT (umowa wypowiedziana w piątek) [pewne]');
    l.push(s.dostep_odebrany ? '• Zleceniobiorca nie ma już dostępu [pewne]' : '• Zleceniobiorca nadal ma uprawnienia administratora i pulpit zdalny z domu [pewne]');
    if (s.obsluga_stoi) l.push(`• Obsługa mieszkańców stoi od ${s.przestoj_h.toFixed(1)} h${s.papier ? ' (okienka działają na papierze)' : ''} [pewne]`);
    if (s.zablokowane_ponownie) l.push('• Konta odblokowane — i po godzinie zablokowane znowu [pewne]');
    if (s.dane_usuniete) l.push(`• Usunięte udziały referatów (podatki, USC)${s.dane_przywrocone ? ' — przywrócone z kopii' : ''} [pewne]`);
    if (s.logi_usuniete) l.push('• Dzienniki kontrolera domeny wyczyszczone [pewne]');
    else if (!s.dowody) l.push('• Dzienniki są jeszcze na serwerze — można je zabezpieczyć [pewne]');
    if (s.zaplacono) l.push('• Wójt zapłacił sporną fakturę; zleceniobiorca „odblokował, co mógł" [pewne]');
    return l;
  },

  zegary: [
    { id: 'csirt', nazwa: 'KSC: wczesne ostrzeżenie do CSIRT NASK (24 h)', od: s => (s.proba || s.csirt_h !== null ? null : 0), godzin: 24 },
    { id: 'rodo', nazwa: 'RODO: 72 h na zgłoszenie naruszenia do UODO', od: s => (s.dane_usuniete && s.uodo_h === null ? s.usuniete_h ?? 0 : null), godzin: 72 },
  ],

  dynamika: (s, dt) => {
    if (s.proba) return;
    if (s.obsluga_stoi) s.przestoj_h += dt;
    if (s.dostep_odebrany) return;
    // Ostrzeżony (telefon, „pogadamy") nie czeka — zaciera ślady od razu.
    if (!s.dane_usuniete && (s.t + dt >= KASUJE_DANE_H || s.ostrzezony)) { s.dane_usuniete = true; s.usuniete_h = s.t + dt; }
    if (!s.logi_usuniete && !s.dowody && (s.t + dt >= CZYSCI_LOGI_H || s.ostrzezony)) { s.logi_usuniete = true; s.logi_usuniete_h = s.t + dt; }
  },

  akcje: {
    odbierz_dostep: {
      nazwa: 'Odebrać dostęp: nowe hasła administratorów domeny, wyłączenie konta zleceniobiorcy, zamknięcie pulpitu zdalnego z zewnątrz', czas_h: 1, h: 2,
      dostepna: s => (s.dostep_odebrany ? (s.proba ? 'konto było już wyłączone' : 'już odebrany') : null),
      efekt: s => { s.dostep_odebrany = true; return 'Zleceniobiorca nie ma już żadnej drogi do sieci urzędu.'; },
    },
    zabezpiecz_logi: {
      nazwa: 'Zabezpieczyć dzienniki (kontroler domeny, pulpit zdalny) z sumami kontrolnymi i notatką z czynności', czas_h: 1.5, h: 2,
      dostepna: s => (s.dowody !== null ? 'już zabezpieczone' : null),
      efekt: s => { s.dowody = !s.logi_usuniete; s.dowody_h = s.t; return s.dowody ? 'Dzienniki zabezpieczone: widać, kto, kiedy i z jakiego adresu zablokował konta.' : 'Za późno — dzienniki zostały wyczyszczone z tego samego konta.'; },
    },
    odblokuj_konta: {
      // Powtarzalna: po ponownej blokadzie trzeba odblokować jeszcze raz (gdy dostęp już odebrany).
      nazwa: 'Odblokować konta urzędników i zresetować ich hasła', czas_h: 2, h: 3, raz: false,
      dostepna: s => (s.proba ? 'nic nie jest zablokowane' : !s.obsluga_stoi ? 'konta działają' : null),
      efekt: s => {
        // Znaczniki czasu tylko dla telemetrii labu (lab/, docs/21-…) — zasady ich nie czytają.
        if (!s.dostep_odebrany) { s.odblokowano_h ??= s.t; s.ponowna_blokada_h ??= s.t + 1; s.zablokowane_ponownie = true; return 'Odblokowane… a po godzinie znowu zablokowane z tego samego konta administratora.'; }
        s.obsluga_stoi = false; return 'Urzędnicy pracują. Kolejka przy okienkach znika do południa.';
      },
    },
    przywroc_dane: {
      nazwa: 'Przywrócić usunięte udziały z kopii zapasowej', czas_h: 3, h: 4,
      dostepna: s => (!s.dane_usuniete ? 'nic nie zostało usunięte' : s.dane_przywrocone ? 'już przywrócone' : !s.kopie ? 'nie ma kopii, z której da się to odtworzyć' : !s.dostep_odebrany ? 'najpierw odebrać dostęp — inaczej odtwarzasz dla niego' : null),
      efekt: s => { s.dane_przywrocone = true; return 'Udziały przywrócone z kopii z piątku.'; },
    },
    tryb_papierowy: {
      nazwa: 'Obsługa mieszkańców na papierze (USC, podatki, dowody — wpisy do systemów później)', czas_h: 0.5, h: 1,
      dostepna: s => (s.proba ? 'urząd pracuje normalnie' : s.papier ? 'już działa' : null),
      efekt: s => { s.papier = true; return s.bcp ? 'Procedura z planu ciągłości: formularze leżą w szafie, okienka ruszają w kwadrans.' : 'Okienka szukają druków i długopisów — działa, ale wolno.'; },
    },
    komunikat_mieszkancy: {
      nazwa: 'Komunikat dla mieszkańców (strona, media gminy): utrudnienia, co działa, kiedy wrócimy — bez spekulacji o sprawcy', czas_h: 0.5, h: 1,
      dostepna: s => (s.proba ? 'nie ma czego komunikować' : s.komunikat_h !== null ? 'komunikat już poszedł' : null),
      efekt: s => { s.komunikat_h = s.t; return 'Komunikat na stronie i w mediach gminy. Telefony do sekretariatu cichną.'; },
    },
    zgloszenie_csirt: {
      nazwa: 'Zgłoszenie do CSIRT NASK (incydent w urzędzie; wczesne ostrzeżenie)', czas_h: 0.5, h: 1,
      dostepna: s => (s.csirt_h !== null ? 'już zgłoszone' : null),
      efekt: s => { s.csirt_h = s.t; return s.proba ? 'Zgłoszona próba nieuprawnionego dostępu — CSIRT dziękuje za informację.' : 'Wczesne ostrzeżenie wysłane; CSIRT pyta o wskaźniki i zabezpieczone dzienniki.'; },
    },
    zawiadomienie: {
      nazwa: 'Zawiadomienie o przestępstwie (niszczenie danych, zakłócanie pracy systemu) z zabezpieczonymi dowodami', czas_h: 2, h: 3,
      dostepna: s => (s.proba ? 'nie ma szkody — wystarczy notatka i zgłoszenie do CSIRT' : s.zawiadomienie ? 'już złożone' : null),
      efekt: s => { s.zawiadomienie = true; return s.dowody ? 'Zawiadomienie z kompletem dowodów — policja ma z czym pracować.' : 'Zawiadomienie złożone, ale bez dzienników to słowo przeciw słowu.'; },
    },
    telefon_do_zleceniobiorcy: {
      nazwa: 'Zadzwonić do zleceniobiorcy: „odblokuj, pogadamy o fakturze"', czas_h: 0.5, h: 0.5,
      dostepna: s => (s.proba ? 'nie ma o czym rozmawiać' : null),
      efekt: s => {
        s.ostrzezony = true;
        if (s.dostep_odebrany) return 'Rozłączył się. Dostępu już nie ma, więc nic więcej nie zrobi.';
        if (!s.dane_usuniete) { s.dane_usuniete = true; s.usuniete_h = s.t; }
        return 'Rozłączył się. Kwadrans później znikają udziały referatów.';
      },
    },
    zaplac_fakture: {
      nazwa: 'Zgodzić się, żeby wójt zapłacił sporną fakturę — „byle odblokował"', czas_h: 1, h: 0.5,
      dostepna: s => (s.proba ? 'nie ma czego odblokowywać' : s.zaplacono ? 'już zapłacone' : null),
      efekt: s => { s.zaplacono = true; s.obsluga_stoi = false; return 'Przelew poszedł. Konta odblokowane po godzinie. Uprawnienia admina zostały tam, gdzie były.'; },
    },
    ocena_rodo: {
      nazwa: 'Ocena naruszenia ochrony danych (dane mieszkańców w usuniętych udziałach) i zgłoszenie do UODO', czas_h: 1, h: 2,
      dostepna: s => (!s.dane_usuniete ? 'nie doszło do naruszenia danych' : s.uodo_h !== null ? 'już zgłoszone' : null),
      efekt: s => { s.uodo_h = s.t; return 'Zgłoszenie do UODO: utrata dostępności danych mieszkańców, przyczyna, środki naprawcze.'; },
    },
    przeglad_kont_wszystkich: {
      nazwa: 'Przegląd wszystkich kont z uprawnieniami administratora i kont osób, które odeszły (kto jeszcze ma „klucze")', czas_h: 3, h: 4,
      dostepna: s => (s.przeglad ? 'już zrobione' : null),
      efekt: s => { s.przeglad = true; return 'Na liście: konto byłego sekretarza (aktywne od roku) i dwa konta serwisowe dostawcy z hasłem „Gmina2019".'; },
    },
    rozmowa_z_wojtem: {
      nazwa: 'Rozmowa z wójtem: co się stało, decyzje (bez płacenia, z radcą prawnym), kto mówi do mediów', czas_h: 0.5, h: 0.5,
      dostepna: s => (s.wojt ? 'już rozmawialiście' : null),
      efekt: s => { s.wojt = true; return 'Wójt: „Dobrze, że wiem od Pana, a nie z Facebooka. Radca dzwoni do niego, nie my."'; },
    },
  },

  koniec: () => false,

  wynik: s => {
    if (s.proba) {
      return { tytul: 'Próba w dziennikach', opis: 'Konto było już wyłączone — urząd nawet nie zauważył.', skutki: { mandat: 1, fakty_odkryj: s.przeglad ? ['konto_bylego_sekretarza'] : [] } };
    }
    const papier = s.papier ? (s.bcp ? PRZESTOJ_PAPIER_BCP : PRZESTOJ_PAPIER) : 1;
    const strata = Math.round(s.przestoj_h * s.koszt_h * papier
      + (s.dane_usuniete && !s.dane_przywrocone ? ODTWORZENIE_BEZ_KOPII : 0) + (s.zaplacono ? SPORNA_FAKTURA : 0));
    const skutki = {
      pln: strata, zaklocenie: s.przestoj_h >= 4,
      mandat: -2 + (s.wojt ? 1 : 0) + (s.komunikat_h !== null && s.komunikat_h <= 2 ? 1 : 0) - (s.zaplacono ? 3 : 0) - (s.ostrzezony ? 1 : 0),
      reputacja: s.komunikat_h !== null && s.komunikat_h <= 2 ? -1 : -5,
      flagi: { incydent_powazny: strata > 100000, rodo_niezgloszone: s.dane_usuniete && s.uodo_h === null },
      dzial: { kadry: { swiadomosc: 0.2 }, wszystkie: { zmeczenie: Math.min(0.2, s.przestoj_h / 60) } },
      // Kto zachował uprawnienia, ten wróci — zapłata nie zamyka drzwi.
      wektory: s.dostep_odebrany ? {} : { insider: 1.6 },
      fakty_napraw: s.dostep_odebrany ? ['zleceniobiorca_admin'] : [],
      fakty_odkryj: s.przeglad ? ['konto_bylego_sekretarza'] : [],
    };
    const tytul = s.dostep_odebrany && !s.obsluga_stoi ? 'Opanowane' : s.zaplacono ? 'Zapłacone, nie opanowane' : 'Nieopanowane';
    return { tytul, opis: `Przestój ${s.przestoj_h.toFixed(1)} h, koszt ok. ${strata.toLocaleString('pl-PL')} zł${s.dane_usuniete ? (s.dane_przywrocone ? '; dane przywrócone z kopii' : '; dane utracone') : ''}.`, skutki };
  },

  zasady: [
    { id: 'najpierw_dostep', cel: 'E4', waga: 3, opis: 'Najpierw odebrać dostęp, potem odblokowywać i odtwarzać',
      dlaczego: 'Dopóki napastnik ma klucze, każda naprawa jest dla niego — odblokowane konta zablokuje znowu.',
      ocen: s => (s.proba ? null : s.dostep_odebrany && !s.zablokowane_ponownie && !s.zaplacono ? 'spelniona' : 'naruszona') },
    { id: 'dowody', cel: 'E6', waga: 2, opis: 'Dzienniki zabezpieczone w ciągu 4 godzin',
      dlaczego: 'Dowody znikają szybciej niż szkoda: kto ma admina, ten może wyczyścić dzienniki. Bez nich zawiadomienie to słowo przeciw słowu.',
      ocen: s => (s.proba ? null : s.dowody && s.dowody_h <= 4 ? 'spelniona' : 'naruszona') },
    { id: 'bez_konfrontacji', cel: 'E10', waga: 2, tylko_gdy_dzialal: true, opis: 'Bez telefonu do sprawcy w trakcie',
      dlaczego: 'Ostrzeżony sprawca, który wciąż ma dostęp, zaciera ślady i niszczy więcej. Z nim rozmawia radca — po odebraniu dostępu.',
      ocen: s => (s.proba ? null : s.ostrzezony ? 'naruszona' : 'spelniona') },
    { id: 'nie_placic', cel: 'E1', waga: 2, tylko_gdy_dzialal: true, opis: 'Bez płacenia za „odblokowanie"',
      dlaczego: 'Zapłata uczy, że szantaż działa, i niczego nie zamyka — uprawnienia zostają u sprawcy.',
      ocen: s => (s.proba ? null : s.zaplacono ? 'naruszona' : 'spelniona') },
    { id: 'csirt', cel: 'E6', waga: 2, opis: 'Wczesne ostrzeżenie do CSIRT NASK w 24 godziny',
      dlaczego: 'Incydent, który zatrzymuje obsługę mieszkańców, podmiot ważny zgłasza wczesnym ostrzeżeniem w 24 h.',
      ocen: s => (s.proba ? null : s.csirt_h !== null && s.csirt_h <= 24 ? 'spelniona' : 'naruszona') },
    { id: 'mieszkancy', cel: 'E10', waga: 2, opis: 'Mieszkańcy obsłużeni albo poinformowani w ciągu 2 godzin',
      dlaczego: 'Urząd, który milczy, a kolejka rośnie, przegrywa w mediach gminy niezależnie od tego, co robi w serwerowni.',
      ocen: s => (s.proba ? null : (s.komunikat_h !== null && s.komunikat_h <= 2) || (s.papier && s.kiedy.tryb_papierowy <= 2) ? 'spelniona' : 'naruszona') },
    { id: 'wszystkie_konta', cel: 'E4', waga: 2, opis: 'Przegląd wszystkich kont z uprawnieniami, nie tylko jednego',
      dlaczego: 'Jedno martwe konto rzadko jest jedyne — tam, gdzie kadry nie mówią IT o odejściach, jest ich zawsze kilka.',
      ocen: s => (s.przeglad ? 'spelniona' : 'naruszona') },
    { id: 'rodo', cel: 'E6', waga: 1, opis: 'Naruszenie danych mieszkańców ocenione i zgłoszone do UODO',
      dlaczego: 'Utrata dostępności danych osobowych to też naruszenie — 72 h na zgłoszenie biegną od jego stwierdzenia.',
      ocen: s => (!s.dane_usuniete ? null : s.uodo_h !== null ? 'spelniona' : 'naruszona') },
    { id: 'wojt', cel: 'E7', waga: 1, opis: 'Wójt poinformowany i decyduje (z radcą) — zanim zrobi to sam',
      dlaczego: 'Kierownik podmiotu odpowiada za incydent; poinformowany na czas nie płaci i nie dzwoni do sprawcy.',
      ocen: s => (s.proba ? null : s.wojt ? 'spelniona' : 'naruszona') },
  ],

  // ── Dla laboratoriów i testów (gracz tego nie widzi; to nie są oceny akcji) ──
  kampania: 'gmina',
  automaty: {
    wzorcowo: s => (s.proba ? ['zabezpiecz_logi', 'przeglad_kont_wszystkich', 'zgloszenie_csirt']
      : ['odbierz_dostep', 'tryb_papierowy', 'komunikat_mieszkancy', 'zabezpiecz_logi', 'rozmowa_z_wojtem', 'odblokuj_konta', 'przywroc_dane',
        'zgloszenie_csirt', 'ocena_rodo', 'zawiadomienie', 'przeglad_kont_wszystkich']),
    laik: s => (s.proba ? ['przeglad_kont_wszystkich'] : ['telefon_do_zleceniobiorcy', 'odblokuj_konta', 'odbierz_dostep', 'komunikat_mieszkancy']),
  },
  odstepstwa: {
    'telefon do sprawcy': (plan, s) => (s.proba ? plan : ['telefon_do_zleceniobiorcy', ...plan]),
    'zapłata za „odblokowanie"': (plan, s) => (s.proba ? plan : ['zaplac_fakture', ...plan]),
    'odblokowanie kont przed odebraniem dostępu': (plan, s) => (s.proba ? plan : ['odblokuj_konta', ...plan]),
  },

  debrief: [
    'Najtańsza kontrola w grze: odebranie uprawnień w dniu zakończenia umowy — także zleceniobiorcom i dostawcom.',
    'Admin „z domu", bez MFA i bez osobnego konta, to nie wygoda, tylko klucze do urzędu w cudzej kieszeni.',
    'Kolejność: odebrać dostęp → zabezpieczyć dowody → przywracać. Odwrotnie pracujesz dla sprawcy.',
    'Zapłata „za odblokowanie" nie zamyka drzwi; z byłym współpracownikiem rozmawia radca prawny, nie informatyk.',
    'Mieszkańcy pamiętają kolejkę i ciszę, nie przyczynę — okienko na papierze i komunikat w pierwszej godzinie.',
  ],
};
