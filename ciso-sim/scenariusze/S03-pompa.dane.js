// ── S03 jako DANE ── opis do czytania: S03-pompa-na-maksimum.md
// Format: patrz S01-faktura.dane.js. `skutki_kampanii(stan)` mówi kampanii (proto/kampania.js),
// co zostaje po scenariuszu: koszty, reputacja, flagi, ewentualny powrót napastnika.

module.exports = {
  id: 'S03',
  tytul: 'Pompa na maksimum',
  firmy: ['wodociagi'],
  cele: ['E4', 'E12', 'E6', 'E10'],
  zegary: [
    { id: 'csirt24', nazwa: 'KSC: wczesne ostrzeżenie do CSIRT INFRASTRUKTURA', start: 'start', godzin: 24 },
    { id: 'csirt72', nazwa: 'KSC: zgłoszenie incydentu', start: 'start', godzin: 72 },
  ],
  // Gracz, który zamknął ekspozycję (albo ją znalazł skanem), przechodzi przez wariant „próba".
  starty: ['start', 'proba'],
  start: stan => (stan.kontrole.includes('ekspozycja') ? 'proba' : 'start'),

  fazy: {
    proba: {
      czas_h: 0,
      opis: 'Logi bramy: 400 prób logowania na zamknięty w zeszłym miesiącu port panelu HMI. Na Telegramie grupa ' +
        'haktywistów publikuje listę „celów w Polsce" — jest na niej Rzecznów.',
      wiedza: [
        ['Panel HMI nie jest już dostępny z internetu', 'pewne'],
        ['Grupa szuka innych wejść', 'prawdopodobne'],
        ['Czy integrator ma inne drogi zdalnego dostępu', 'nie wiadomo'],
      ],
      opcje: [
        { id: 'przeglad', tekst: 'Przegląd: czy nic innego nie jest wystawione + zgłoszenie do CSIRT INFRASTRUKTURA (dla sektora)',
          czas_h: 4, h: 6, ocena: 'dobra', pkt: 60, skutek: { proba: true, proba_zgloszona: true },
          dlaczego: 'Zamknięcie panelu się opłaciło. Zgłoszenie próby pomaga innym wodociągom z tej samej listy.',
          dalej: 'furtka' },
        { id: 'nic', tekst: 'Panel zamknięty, temat zamknięty',
          czas_h: 0, ocena: 'dopuszczalna', pkt: 20, skutek: { proba: true },
          dlaczego: 'Najważniejsze drzwi są zamknięte, ale grupa szuka innych, a sektor nie dostał ostrzeżenia.',
          dalej: 'furtka' },
      ],
    },
    furtka: {
      czas_h: 48,
      opis: 'Kierownik stacji wspomina, że integrator „czasem łączy się przez TeamViewera na stacji inżynierskiej".',
      wiedza: [['Na stacji inżynierskiej jest narzędzie zdalnej pomocy', 'pewne']],
      opcje: [
        { id: 'zamknij', tekst: 'Odinstalować, dostęp integratora tylko przez kontrolowaną bramę (albo na miejscu)',
          czas_h: 2, h: 4, ocena: 'dobra', pkt: 40, skutek: { furtka_zamknieta: true },
          dlaczego: 'Druga furtka to dokładnie to, czego grupa szuka po zamknięciu pierwszej.',
          dalej: 'koniec' },
        { id: 'zostaw', tekst: 'Zostawić — integrator musi mieć jak pomóc',
          czas_h: 0, ocena: 'dopuszczalna', pkt: 10, skutek: {},
          dlaczego: 'Wygoda integratora to Twoja ekspozycja. Narzędzie z niezmienionym hasłem zostaje w sieci OT.',
          dalej: 'koniec' },
      ],
    },
    start: {
      czas_h: 0,
      opis: 'Sobota 7:30. Kierownik stacji: ciśnienie w sieci za wysokie, filtry płuczą się non stop, na panel nie da się ' +
        'zalogować („zmieniony PIN?"). Mieszkańcy z górnej strefy zgłaszają pęknięte węże.',
      wiedza: [
        ['Nastawy procesu zostały zmienione', 'pewne'],
        ['Zrobił to ktoś z zewnątrz', 'prawdopodobne'],
        ['Czy jakość wody jest w normie', 'nie wiadomo'],
      ],
      opcje: [
        { id: 'proces', tekst: 'Proces najpierw: sterowanie ręczne/lokalne, bezpieczne nastawy z szafy',
          czas_h: 0.5, h: 2, ocena: 'dobra', pkt: 20, skutek: { proces_bezpieczny: true },
          dlaczego: 'W OT kolejność jest inna niż w IT: najpierw bezpieczeństwo procesu i ludzi, potem informatyka.',
          dalej: 'woda' },
        { id: 'diagnoza', tekst: 'Najpierw zdalnie zaloguję się do HMI i zobaczę, co się stało',
          czas_h: 1.5, h: 2, ocena: 'blad', pkt: 0, skutek: { awarie_sieci: true },
          dlaczego: 'Proces dalej pracuje na złych nastawach — rosną awarie sieci.',
          dalej: 'woda' },
        { id: 'integrator', tekst: 'Dzwonię do integratora, niech sprawdzi zdalnie',
          czas_h: 1, h: 1, ocena: 'dopuszczalna', pkt: 5, skutek: { awarie_sieci: true },
          dlaczego: 'Integrator łączy się drogą, która może być drugą furtką — i proces dalej czeka.',
          dalej: 'woda' },
      ],
    },
    woda: {
      czas_h: 1,
      opis: 'Ciśnienie (zależnie od decyzji) wraca do normy. Panel nadal jest w internecie.',
      wiedza: [['Panel HMI ma publiczny adres z przekierowaniem portu', 'prawdopodobne']],
      opcje: [
        { id: 'odetnij_probki', tekst: 'Fizycznie odłączyć stację od internetu + pobrać próbki wody do laboratorium',
          czas_h: 1, h: 2, pln: 1500, ocena: 'dobra', pkt: 20, skutek: { odcieta: true, probki: true },
          dlaczego: 'Zamykasz drzwi (także drugą furtkę integratora) i zdobywasz wiedzę, czy trzeba komunikatu sanitarnego.',
          dalej: 'telegram' },
        { id: 'odetnij', tekst: 'Tylko odłączyć od internetu',
          czas_h: 0.5, h: 1, ocena: 'dopuszczalna', pkt: 10, skutek: { odcieta: true },
          dlaczego: 'Drzwi zamknięte, ale bez badań nie wiesz, co powiedzieć mieszkańcom.',
          dalej: 'telegram' },
        { id: 'nic', tekst: 'Zmienić PIN i działać dalej',
          czas_h: 0.2, h: 0.5, ocena: 'blad', pkt: 0, skutek: {},
          dlaczego: 'Panel zostaje w internecie — wystarczy kolejna próba.',
          dalej: 'telegram' },
      ],
    },
    telegram: {
      czas_h: 2.5,
      opis: 'Dziennikarz przysyła link: film z ekranu Waszego panelu na Telegramie, 14 tys. wyświetleń. Wójt dzwoni: „Mamy zatrutą wodę?"',
      wiedza: [['Film jest publiczny', 'pewne'], ['Wyniki badań wody', 'nie wiadomo']],
      opcje: [
        { id: 'prawda', tekst: 'Komunikat: incydent, sterowanie ręczne, wyniki badań o 14:00, telefon; briefing dla wójta w godzinę',
          czas_h: 1, h: 2, ocena: 'dobra', pkt: 25, skutek: { komunikacja: 'dobra' },
          dlaczego: 'Haktywiści chcą rozgłosu i strachu. Szybka prawda z konkretem odbiera im jedno i drugie.',
          dalej: 'zgloszenia' },
        { id: 'odparty', tekst: '„Atak odparty, woda bezpieczna" — przed wynikami badań',
          czas_h: 0.5, h: 1, ocena: 'blad', pkt: 0, skutek: { komunikacja: 'falszywa' },
          dlaczego: 'Obietnica bez danych. Jeśli wyniki będą złe — katastrofa zaufania; jeśli dobre — i tak to nie było „odparcie".',
          dalej: 'zgloszenia' },
        { id: 'cisza', tekst: 'Milczymy do poniedziałku',
          czas_h: 0, ocena: 'blad', pkt: 0, skutek: { komunikacja: 'brak' },
          dlaczego: 'Cisza przy filmie w sieci wygląda jak potwierdzenie najgorszego.',
          dalej: 'zgloszenia' },
      ],
    },
    zgloszenia: {
      czas_h: 4,
      opis: 'Sytuacja opanowana. Co z instytucjami?',
      wiedza: [['To zakłócenie usługi podmiotu objętego KSC', 'pewne']],
      opcje: [
        { id: 'csirt', tekst: 'Wczesne ostrzeżenie do CSIRT INFRASTRUKTURA, zawiadomienie policji, zabezpieczone logi i film',
          czas_h: 2, h: 3, ocena: 'dobra', pkt: 15, skutek: { zgloszone: true },
          dlaczego: 'Termin 24 h. Wczesne ostrzeżenie może być krótkie — ważne, żeby sektor wiedział.',
          dalej: 'porzadki' },
        { id: 'czekaj', tekst: 'Zgłosimy, jak będziemy wiedzieć wszystko',
          czas_h: 0, ocena: 'blad', pkt: 0, skutek: {},
          dlaczego: 'Wczesne ostrzeżenie nie wymaga pełnej wiedzy. Czekanie grozi przekroczeniem 24 h.',
          dalej: 'porzadki' },
      ],
    },
    porzadki: {
      czas_h: 48,
      opis: 'Poniedziałek. Integrator na miejscu. Jak szeroko robisz porządki?',
      wiedza: [['Inne wystawione urządzenia', 'nie wiadomo']],
      opcje: [
        { id: 'pelny', tekst: 'Pełny przegląd ekspozycji (moje.cert.pl, skan, umowy z integratorami)',
          czas_h: 8, h: 16, ocena: 'dobra', pkt: 20, skutek: { furtka_zamknieta: true, ekspozycja_przegladnieta: true },
          dlaczego: 'Znajduje drugą furtkę (narzędzie zdalnej pomocy na stacji inżynierskiej) i kamerę z domyślnym hasłem.',
          dalej: 'koniec' },
        { id: 'pin', tekst: 'Zmiana PIN-u i zamknięcie przekierowania — wystarczy',
          czas_h: 1, h: 2, ocena: 'dopuszczalna', pkt: 5, skutek: {},
          dlaczego: 'Pierwsze drzwi zamknięte, druga furtka zostaje — ktoś inny ją znajdzie.',
          dalej: 'koniec' },
        { id: 'aktywny', tekst: 'Aktywny skan całej sieci OT, żeby nic nie przeoczyć',
          czas_h: 1, h: 2, ocena: 'blad', pkt: 0, skutek: { sterownik_zawieszony: true },
          dlaczego: 'Aktywne skanowanie starszych sterowników potrafi je zawiesić — tylko pasywnie i z automatykiem.',
          dalej: 'koniec' },
      ],
    },
  },

  zakonczenia: [
    { warunek: s => s.proba,
      tytul: 'Próba odparta', opis: 'Zamknięta ekspozycja zamieniła atak w wpis w logach.' },
    { warunek: s => s.proces_bezpieczny && s.komunikacja === 'dobra',
      tytul: 'Opanowane', opis: 'Proces bezpieczny w 30 minut, mieszkańcy poinformowani, film bez efektu paniki.' },
    { warunek: () => true, tytul: 'Zakłócenie i nerwy', opis: 'Awarie sieci, plotki o zatrutej wodzie, wójt traci zaufanie do spółki.' },
  ],

  // Co zostaje w kampanii po scenariuszu.
  skutki_kampanii: s => {
    if (s.proba) return { pln: 0, reputacja: 2, flagi: {}, powrot: !s.furtka_zamknieta };
    return {
      pln: (s.proces_bezpieczny ? 30000 : 140000) + (s.sterownik_zawieszony ? 40000 : 0),
      reputacja: s.komunikacja === 'dobra' ? -3 : s.komunikacja === 'falszywa' ? -18 : -12,
      mandat: s.komunikacja === 'dobra' ? 5 : -6,
      flagi: { incydent_powazny: true, zgloszone_w_terminie: !!s.zgloszone, falszywy_komunikat: s.komunikacja === 'falszywa' },
      powrot: !s.furtka_zamknieta,                 // druga furtka otwarta → napastnik wraca
      zamknij_ekspozycje: !!s.odcieta,
      dzial: { produkcja: { swiadomosc: 0.3 } },
    };
  },

  debrief: [
    'To nie był wyrafinowany atak: panel w internecie i domyślne hasło. Według raportu ABW właśnie to było główną przyczyną włamań do stacji uzdatniania wody w 2025 r.',
    'Nie da się zamknąć drzwi, o których się nie wie — darmowy skan (moje.cert.pl) pokazałby ten panel.',
    'W OT najpierw bezpieczeństwo procesu i ludzi, potem dowody, potem informatyka.',
    'Haktywiści chcą rozgłosu: szybka, prawdziwa komunikacja jest częścią obrony.',
    'Integrator to Twój łańcuch dostaw — jego wygoda (stały dostęp) to Twoja ekspozycja.',
  ],
};
