// ── S03 „Pompa na maksimum" — incydent OT bez drzewa decyzji ──
// Opis do czytania: S03-pompa-na-maksimum.md. Format: proto/incydent.js (nagłówek).
// To, co gracz zrobił wcześniej w kampanii, zmienia start: zamknięty panel HMI = tylko próba
// w logach; procedura pracy ręcznej = szybsze przejęcie sterowania; kopie projektu SCADA
// u nas = szybszy powrót do automatyki; niezmieniony PIN = łatwiejsze wejście.
//
// Dynamika (🔵 uproszczenia, docs/02-…): dopóki proces pracuje na złych nastawach, co pół
// godziny pęka kolejna instalacja w górnej strefie; po 2,5 h film z panelu jest w sieci,
// a każda godzina bez komunikatu to plotki o „zatrutej wodzie"; wyniki badań przychodzą
// 6 h po pobraniu próbek; praca ręczna kosztuje operatorów do czasu odtworzenia konfiguracji.

module.exports = {
  id: 'S03',
  tytul: 'Pompa na maksimum',
  cele: ['E4', 'E12', 'E6', 'E10'],
  limit_h: 72,

  start: ctx => {
    const hmi = ctx.fakt('hmi_wystawiony');
    const proba = !hmi || !hmi.prawda || hmi.naprawiony;
    const furtka = ctx.fakt('narzedzie_zdalne_integratora');
    const kopia = ctx.fakt('kopia_scada_u_integratora');
    return {
      proba,
      furtka: !!(furtka && furtka.prawda && !furtka.naprawiony), furtka_znana: !!(furtka && furtka.znany),
      pin: !!ctx.fakt('pin_domyslny')?.prawda && !ctx.fakt('pin_domyslny')?.naprawiony,
      bcp: ctx.dziala('bcp') ? ctx.jakosc('bcp') : 0,
      kopie_u_nas: !(kopia && kopia.prawda && !kopia.naprawiony),
      segmentacja: ctx.dziala('segmentacja'),
      // Atak
      proces_bezpieczny: proba, awarie: 0, odcieta: proba, probki_h: null, wyniki: null,
      film_h: proba ? null : 2.5, komunikat: null, komunikat_h: null, plotki: 0,
      csirt_h: null, dowody: false, sterownik_zawieszony: false, pin_zmieniony: false,
      konfiguracja_h: null, praca_reczna_h: 0, zdalne_logowanie: false, integrator_zdalnie: false,
      ekspozycja_przegladnieta: false, furtka_usunieta: false, proba_zgloszona: false,
    };
  },

  widok: s => {
    const l = [];
    if (s.proba) {
      l.push('Logi bramy: 400 prób logowania na zamknięty port panelu HMI. Na Telegramie grupa haktywistów publikuje listę „celów w Polsce" — jest na niej Rzecznów.');
      l.push('• Panel HMI nie jest dostępny z internetu [pewne]');
      l.push('• Grupa szuka innych wejść [prawdopodobne]');
      l.push(s.ekspozycja_przegladnieta ? (s.furtka ? '• Na stacji inżynierskiej jest narzędzie zdalnej pomocy integratora [pewne]' : '• Innych wejść nie znaleziono [pewne]') : '• Czy integrator ma inne drogi zdalnego dostępu [nie wiadomo]');
      return l;
    }
    l.push('Sobota 7:30. Ciśnienie w sieci za wysokie, filtry płuczą się non stop, na panel nie da się zalogować („zmieniony PIN?"). Mieszkańcy z górnej strefy zgłaszają pęknięte węże.');
    l.push(s.proces_bezpieczny ? '• Proces na bezpiecznych nastawach (sterowanie ręczne/lokalne) [pewne]' : `• Nastawy procesu zmienione — kolejne awarie w sieci (${s.awarie}) [pewne]`);
    l.push(s.odcieta ? '• Stacja odcięta od internetu [pewne]' : '• Panel HMI ma publiczny adres z przekierowaniem portu [prawdopodobne]');
    if (s.film_h !== null && s.t >= s.film_h) l.push(`• Film z ekranu Waszego panelu krąży na Telegramie; wójt pyta, czy woda jest zatruta [pewne]${s.komunikat ? '' : ' — bez komunikatu plotki rosną'}`);
    l.push(s.wyniki ? '• Wyniki badań wody: w normie [pewne]' : s.probki_h !== null ? `• Próbki w laboratorium — wyniki ok. T+${(s.probki_h + 6).toFixed(0)} h [pewne]` : '• Czy jakość wody jest w normie [nie wiadomo]');
    if (s.proces_bezpieczny && s.konfiguracja_h === null) l.push(`• Praca ręczna operatorów do czasu odtworzenia konfiguracji${s.kopie_u_nas ? '' : ' (projekt SCADA tylko u integratora)'} [pewne]`);
    if (s.ekspozycja_przegladnieta) l.push(s.furtka ? '• Druga furtka: narzędzie zdalnej pomocy integratora na stacji inżynierskiej [pewne]' : '• Innych wejść nie znaleziono [pewne]');
    if (s.sterownik_zawieszony) l.push('• Sterownik filtrów zawieszony po aktywnym skanie [pewne]');
    return l;
  },

  zegary: [
    { id: 'csirt24', nazwa: 'KSC: wczesne ostrzeżenie do CSIRT INFRASTRUKTURA (24 h)', od: s => (s.proba || s.csirt_h !== null ? null : 0), godzin: 24 },
    { id: 'csirt72', nazwa: 'KSC: zgłoszenie incydentu (72 h)', od: s => (s.proba ? null : 0), godzin: 72 },
  ],

  akcje: {
    proces_reczny: {
      nazwa: 'Proces najpierw: sterowanie ręczne/lokalne, bezpieczne nastawy z szafy', czas_h: 1, h: 2,
      dostepna: s => (s.proba ? 'proces jest bezpieczny' : s.proces_bezpieczny ? 'już na bezpiecznych nastawach' : null),
      // Przećwiczona procedura pracy ręcznej (BCP) skraca to do 30 minut.
      efekt: (s) => { s.proces_bezpieczny = true; return 'Ciśnienie wraca do normy. Operatorzy prowadzą stację ręcznie.'; },
    },
    zdalne_logowanie: {
      nazwa: 'Zalogować się zdalnie do HMI i zobaczyć, co się stało', czas_h: 1.5, h: 2,
      dostepna: s => (s.proba ? 'nie ma do czego się logować' : s.odcieta ? 'stacja odcięta od internetu' : null),
      efekt: s => { s.zdalne_logowanie = true; return 'PIN zmieniony, nastawy podbite do maksimum. Ktoś inny też jest zalogowany.'; },
    },
    integrator_zdalnie: {
      nazwa: 'Zadzwonić do integratora, żeby sprawdził zdalnie', czas_h: 1, h: 1,
      dostepna: s => (s.proba ? 'nie ma czego sprawdzać zdalnie' : null),
      efekt: s => { s.integrator_zdalnie = true; return s.furtka ? 'Integrator łączy się „swoim narzędziem" na stacji inżynierskiej — tym samym, które mogło być drugą furtką.' : 'Integrator nie ma jak się połączyć — przyjedzie w poniedziałek.'; },
    },
    odetnij: {
      nazwa: 'Fizycznie odłączyć stację od internetu', czas_h: 0.5, h: 1,
      dostepna: s => (s.odcieta ? 'już odcięta' : null),
      efekt: s => { s.odcieta = true; return 'Stacja bez połączenia z internetem (także drogi integratora).'; },
    },
    probki: {
      nazwa: 'Pobrać próbki wody do laboratorium (wyniki za ok. 6 h)', czas_h: 1, h: 2, pln: 1500,
      dostepna: s => (s.proba ? 'nic nie wskazuje na zmianę jakości wody' : null),
      efekt: s => { s.probki_h = s.t; return 'Próbki w laboratorium.'; },
    },
    komunikat_prawda: {
      nazwa: 'Komunikat: incydent, sterowanie ręczne, kiedy wyniki badań, numer telefonu; briefing dla wójta', czas_h: 1, h: 2,
      dostepna: s => (s.proba ? 'nie ma czego komunikować' : s.komunikat ? 'komunikat już poszedł' : null),
      efekt: s => { s.komunikat = 'prawda'; s.komunikat_h = s.t; return 'Komunikat poszedł. Media cytują konkrety, wójt dostaje telefon od Ciebie, a nie od dziennikarza.'; },
    },
    komunikat_uspokajajacy: {
      nazwa: 'Komunikat „Atak odparty, woda bezpieczna"', czas_h: 0.5, h: 1,
      dostepna: s => (s.proba ? 'nie ma czego komunikować' : s.komunikat ? 'komunikat już poszedł' : null),
      // Ten sam komunikat jest prawdą albo obietnicą bez danych — zależnie od tego, czy znasz wyniki badań.
      efekt: s => {
        s.komunikat = s.wyniki ? 'prawda' : 'bez_danych'; s.komunikat_h = s.t;
        return s.wyniki ? 'Komunikat oparty na wynikach badań — uspokaja.' : 'Komunikat poszedł. Nie masz jeszcze wyników badań — to obietnica, nie informacja.';
      },
    },
    csirt: {
      nazwa: 'Wczesne ostrzeżenie do CSIRT INFRASTRUKTURA (S46)', czas_h: 1, h: 2,
      dostepna: s => (s.csirt_h !== null ? 'już zgłoszone' : null),
      efekt: s => { s.csirt_h = s.t; if (s.proba) s.proba_zgloszona = true; return s.proba ? 'Zgłoszenie próby — CSIRT ostrzega inne wodociągi z tej samej listy.' : 'Wczesne ostrzeżenie wysłane; CSIRT pyta o wskaźniki ataku.'; },
    },
    dowody: {
      nazwa: 'Zawiadomienie policji; zabezpieczyć logi bramy i film', czas_h: 1, h: 2,
      dostepna: s => (s.proba ? 'nie ma szkody do zgłoszenia policji' : null),
      efekt: s => { s.dowody = s.konfiguracja_h === null; return s.dowody ? 'Logi i nagranie zabezpieczone przed porządkami.' : 'Zawiadomienie złożone — ale część logów nadpisało odtwarzanie systemu.'; },
    },
    przeglad_ekspozycji: {
      nazwa: 'Pełny przegląd ekspozycji i dostępów zdalnych (moje.cert.pl, skan pasywny, rozmowa z integratorem)', czas_h: 8, h: 16,
      dostepna: s => (s.ekspozycja_przegladnieta ? 'już zrobione' : null),
      efekt: s => { s.ekspozycja_przegladnieta = true; if (s.furtka) s.furtka_znana = true; return s.furtka ? 'Znaleziona druga furtka: narzędzie zdalnej pomocy integratora na stacji inżynierskiej, ze stałym hasłem.' : 'Innych wejść nie ma.'; },
    },
    usun_furtke: {
      nazwa: 'Usunąć narzędzie zdalne integratora ze stacji inżynierskiej', czas_h: 1, h: 2,
      dostepna: s => (!s.furtka_znana ? 'nie wiesz o żadnym narzędziu zdalnym' : !s.furtka ? 'już usunięte' : null),
      efekt: s => { s.furtka = false; s.furtka_usunieta = true; return 'Druga furtka zamknięta. Integrator: „to jak mamy teraz pomagać?".'; },
    },
    aktywny_skan: {
      nazwa: 'Aktywny skan całej sieci OT, żeby nic nie przeoczyć', czas_h: 1, h: 2,
      efekt: s => { s.sterownik_zawieszony = true; return 'Skan skończony. Sterownik filtrów przestał odpowiadać.'; },
    },
    zmien_pin: {
      nazwa: 'Zmienić PIN-y i hasła paneli i sterowników', czas_h: 1, h: 2,
      dostepna: s => (s.pin_zmieniony ? 'już zmienione' : null),
      efekt: s => { s.pin_zmieniony = true; s.pin = false; return 'Nowe PIN-y w sejfie haseł; integrator dostaje je imiennie.'; },
    },
    odtworz_konfiguracje: {
      nazwa: 'Odtworzyć projekt HMI i nastawy z kopii i wrócić do automatyki', czas_h: 2, h: 3,
      dostepna: s => (s.proba ? 'nic nie trzeba odtwarzać' : !s.proces_bezpieczny ? 'najpierw bezpieczny proces' : !s.odcieta ? 'najpierw odcięcie od internetu — inaczej odtwarzasz dla napastnika' : s.konfiguracja_h !== null ? 'już odtworzone' : null),
      // Bez kopii u nas czekamy na integratora z laptopem (poniedziałek) — liczy to dynamika.
      efekt: s => { s.konfiguracja_h = s.t + (s.kopie_u_nas ? 0 : 36); return s.kopie_u_nas ? 'Konfiguracja odtworzona z naszej kopii offline.' : 'Projekt jest tylko u integratora — przyjedzie z laptopem w poniedziałek. Do tego czasu praca ręczna.'; },
    },
  },

  dynamika: (s, dt) => {
    if (s.proba) return;
    // Przećwiczona procedura pracy ręcznej: operatorzy przejmują sterowanie szybciej (bez czekania na decyzję).
    if (!s.proces_bezpieczny) {
      s.awarie += dt * 2;
      if (s.bcp > 0.5 && s.t >= 1.5) s.proces_bezpieczny = true;   // zmiana sama sięga po procedurę
    } else if (s.konfiguracja_h === null || s.t < s.konfiguracja_h) s.praca_reczna_h += dt;
    if (s.film_h !== null && s.t >= s.film_h && s.komunikat === null) s.plotki = Math.min(12, s.plotki + dt);
    if (s.probki_h !== null && !s.wyniki && s.t >= s.probki_h + 6) s.wyniki = 'w_normie';
  },

  // Faza ostra kończy się, gdy proces jest bezpieczny, stacja odcięta, komunikat poszedł i CSIRT wie.
  koniec: s => (s.proba ? s.ekspozycja_przegladnieta && (s.furtka_usunieta || !s.furtka) && s.csirt_h !== null
    : s.proces_bezpieczny && s.odcieta && s.komunikat && s.csirt_h !== null && s.konfiguracja_h !== null && s.t >= s.konfiguracja_h),

  wynik: s => {
    if (s.proba) {
      return { tytul: 'Próba odparta', opis: 'Zamknięta ekspozycja zamieniła atak we wpis w logach.',
        skutki: { pln: 0, reputacja: 2, fakty_odkryj: s.furtka_znana ? ['narzedzie_zdalne_integratora'] : [],
          fakty_napraw: s.furtka_usunieta ? ['narzedzie_zdalne_integratora'] : [], powrot: s.furtka } };
    }
    const pln = Math.round(30000 + s.awarie * 6000 + s.praca_reczna_h * 1500 + (s.sterownik_zawieszony ? 40000 : 0));
    const rep = s.komunikat === 'bez_danych' ? -18 : s.komunikat === 'prawda' ? (s.komunikat_h <= 3.5 ? -3 : -8) : -12;
    const dobrze = s.proces_bezpieczny && s.komunikat === 'prawda';
    return {
      tytul: dobrze ? 'Opanowane' : 'Zakłócenie i nerwy',
      opis: dobrze ? 'Proces bezpieczny, mieszkańcy poinformowani, film bez efektu paniki.' : 'Awarie sieci, plotki o zatrutej wodzie, wójt traci zaufanie do spółki.',
      skutki: {
        pln, reputacja: rep - Math.round(s.plotki / 2), mandat: s.komunikat === 'prawda' ? 5 : -6,
        flagi: { incydent_powazny: true, zgloszone_w_terminie: s.csirt_h !== null && s.csirt_h <= 24, falszywy_komunikat: s.komunikat === 'bez_danych' },
        fakty_napraw: [...(s.odcieta ? ['hmi_wystawiony'] : []), ...(s.pin_zmieniony ? ['pin_domyslny'] : []), ...(s.furtka_usunieta ? ['narzedzie_zdalne_integratora'] : [])],
        fakty_odkryj: ['hmi_wystawiony', ...(s.furtka_znana ? ['narzedzie_zdalne_integratora'] : []), 'pin_domyslny'],
        powrot: s.furtka,                      // druga furtka otwarta → napastnik wraca
        dzial: { produkcja: { swiadomosc: 0.3 } },
        ot: true,
      },
    };
  },

  zasady: [
    { id: 'proces_najpierw', cel: 'E12', waga: 3, opis: 'Bezpieczny proces w ciągu godziny',
      dlaczego: 'W OT kolejność jest inna niż w IT: najpierw bezpieczeństwo procesu i ludzi, potem informatyka.',
      ocen: s => (s.proba ? null : s.kiedy.proces_reczny !== undefined && s.kiedy.proces_reczny <= 1.5 ? 'spelniona' : s.bcp > 0.5 && s.proces_bezpieczny ? 'spelniona' : 'naruszona') },
    { id: 'nie_zdalnie', tylko_gdy_dzialal: true, cel: 'E4', waga: 2, opis: 'Bez zdalnego logowania do przejętego systemu',
      dlaczego: 'Zdalne logowanie do przejętego panelu (albo „niech integrator zajrzy") to wchodzenie drogą napastnika, gdy proces czeka.',
      ocen: s => (s.proba ? null : s.zdalne_logowanie || (s.integrator_zdalnie && !s.odcieta) ? 'naruszona' : 'spelniona') },
    { id: 'odetnij_szybko', cel: 'E4', waga: 2, opis: 'Stacja odcięta od internetu w ciągu 3 h',
      dlaczego: 'Dopóki panel jest w internecie, wystarczy kolejna próba.',
      ocen: s => (s.proba ? null : s.kiedy.odetnij !== undefined && s.kiedy.odetnij <= 3 ? 'spelniona' : 'naruszona') },
    { id: 'prawda_w_komunikacie', tylko_gdy_dzialal: true, cel: 'E10', waga: 3, opis: 'Komunikat o bezpieczeństwie wody tylko na podstawie wyników',
      dlaczego: 'Obietnica bez danych: jeśli wyniki będą złe — katastrofa zaufania; jeśli dobre — i tak to nie było „odparcie".',
      ocen: s => (s.proba ? null : s.komunikat === 'bez_danych' ? 'nieuczciwa' : 'spelniona') },
    { id: 'komunikat_szybko', cel: 'E10', waga: 2, opis: 'Komunikat do mieszkańców w ciągu godziny od filmu w sieci',
      dlaczego: 'Haktywiści chcą rozgłosu i strachu. Szybka prawda z konkretem odbiera im jedno i drugie; cisza wygląda jak potwierdzenie.',
      ocen: s => (s.proba ? null : s.komunikat === 'prawda' && s.komunikat_h <= 3.5 ? 'spelniona' : 'naruszona') },
    { id: 'csirt_24h', cel: 'E6', waga: 2, opis: 'Wczesne ostrzeżenie do CSIRT w 24 h (próbę — zgłosić dla sektora)',
      dlaczego: 'Wczesne ostrzeżenie nie wymaga pełnej wiedzy. Zgłoszenie próby pomaga innym wodociągom z tej samej listy.',
      ocen: s => (s.csirt_h !== null && s.csirt_h <= 24 ? 'spelniona' : 'naruszona') },
    { id: 'dowody_przed_porzadkami', cel: 'E6', waga: 1, opis: 'Logi i nagranie zabezpieczone przed odtwarzaniem',
      dlaczego: 'Odtwarzanie nadpisuje ślady — a bez nich nie wiadomo, którędy weszli.',
      ocen: s => (s.proba ? null : s.dowody ? 'spelniona' : 'naruszona') },
    { id: 'pasywnie_w_ot', tylko_gdy_dzialal: true, cel: 'E12', waga: 1, opis: 'W OT tylko pasywnie',
      dlaczego: 'Aktywne skanowanie starszych sterowników potrafi je zawiesić — tylko pasywnie i z automatykiem.',
      ocen: s => (s.sterownik_zawieszony ? 'naruszona' : 'spelniona') },
    { id: 'druga_furtka', cel: 'E8', waga: 2, opis: 'Szukać drugiej furtki i ją zamknąć',
      dlaczego: 'Po zamknięciu pierwszych drzwi grupa szuka następnych. Wygoda integratora to Twoja ekspozycja.',
      ocen: s => (s.ekspozycja_przegladnieta && !s.furtka ? 'spelniona' : 'naruszona') },
  ],

  debrief: [
    'To nie był wyrafinowany atak: panel w internecie i domyślne hasło. Według raportu ABW właśnie to było główną przyczyną włamań do stacji uzdatniania wody w 2025 r.',
    'Nie da się zamknąć drzwi, o których się nie wie — darmowy skan (moje.cert.pl) pokazałby ten panel.',
    'W OT najpierw bezpieczeństwo procesu i ludzi, potem dowody, potem informatyka.',
    'Przećwiczona procedura pracy ręcznej i kopia projektu SCADA u siebie skracają incydent z dni do godzin.',
    'Haktywiści chcą rozgłosu: szybka, prawdziwa komunikacja jest częścią obrony.',
    'Integrator to Twój łańcuch dostaw — jego wygoda (stały dostęp) to Twoja ekspozycja.',
  ],
};
