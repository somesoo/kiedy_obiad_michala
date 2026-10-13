// ── S01 jako DANE — wzorzec formatu scenariusza dla silnika ──
// Opis do czytania: S01-faktura-z-nowym-numerem.md. Ten plik to ten sam scenariusz
// w postaci, którą rozumie silnik (i prototyp: node ciso-sim/proto/rozegraj.js S01).
// Jak plansze w Snakes: CZYSTE DANE, logika w silniku. Treść trafia do HTML — front
// zawsze przepuszcza ją przez esc().
//
// Format (walidacja: proto/rozegraj.js → waliduj()):
//   id, tytul, firmy[], zegary[]            — zegar: { id, nazwa, start: id fazy, godzin }
//   start(stan) → id fazy                    — wybór wejścia zależnie od przygotowania gracza
//   starty[]                                 — wszystkie fazy, które `start` może zwrócić
//   fazy: { [id]: { czas_h, opis, wiedza: [[fakt, pewnosc]], opcje: [...] } }
//     pewnosc: 'pewne' | 'prawdopodobne' | 'nie wiadomo'
//     opcja: { id, tekst, czas_h, h, pln, mandat, ocena, pkt, dlaczego, skutek, dalej }
//       ocena: 'dobra' | 'dopuszczalna' | 'blad'; pkt — punkty rubryki (suma najlepszej
//       ścieżki = 100); skutek — zmiana stanu scenariusza; dalej — id fazy albo 'koniec'
//   zakonczenia: [{ warunek(stan), tytul, opis }] — pierwsze pasujące
//   debrief: [zdania]

module.exports = {
  id: 'S01',
  tytul: 'Faktura z nowym numerem konta',
  firmy: ['biuro', 'gmina', 'produkcja', 'wodociagi'],
  zegary: [
    { id: 'bank', nazwa: 'Bank: szansa zatrzymania środków spada z każdą godziną', start: 'wykrycie', godzin: 24 },
    { id: 'rodo', nazwa: 'RODO: 72 h na zgłoszenie (jeśli naruszenie u nas)', start: 'nasza_skrzynka', godzin: 72 },
  ],

  // Gracz z procedurą płatności nie traci pieniędzy — scenariusz zaczyna się od udaremnienia.
  // `starty` wymienia wszystkie możliwe wyniki `start` (walidacja liczy z nich rubrykę).
  starty: ['wykrycie', 'udaremnione'],
  start: stan => (stan.kontrole.includes('weryfikacja_platnosci') ? 'udaremnione' : 'wykrycie'),

  fazy: {
    wykrycie: {
      czas_h: 0,
      opis: 'Poniedziałek 9:10. Dzwoni kontrahent: płatność nie wpłynęła. Księgowa zapłaciła ' +
        'w środę „na nowy rachunek, który przysłaliście". Kontrahent: „Nie zmienialiśmy rachunku".',
      wiedza: [
        ['Przelew wyszedł 5 dni temu na rachunek w innym banku', 'pewne'],
        ['Skrzynka kontrahenta jest przejęta', 'prawdopodobne'],
        ['Czy nasza skrzynka jest przejęta', 'nie wiadomo'],
      ],
      opcje: [
        { id: 'bank', tekst: 'Natychmiast dzwonię do banku: zgłoszenie oszustwa, blokada u odbiorcy',
          czas_h: 0.25, h: 0.5, ocena: 'dobra', pkt: 25, skutek: { bank_po_h: 0.25 },
          dlaczego: 'Pierwsza minuta należy do banku — szansa zatrzymania środków spada z każdą godziną.',
          dalej: 'dowody' },
        { id: 'zebranie', tekst: 'Najpierw zebranie z księgową i prezesem: ustalmy, czyja to wina',
          czas_h: 2, h: 4, mandat: -2, ocena: 'blad', pkt: 0, skutek: { bank_po_h: 2.5, morale: -5 },
          dlaczego: 'Szukanie winnych przed ratowaniem pieniędzy kosztuje godziny, których nie ma.',
          dalej: 'dowody' },
        { id: 'mail', tekst: 'Piszę maila do kontrahenta z prośbą o wyjaśnienie',
          czas_h: 0.2, h: 0.2, ocena: 'blad', pkt: 0, skutek: { bank_po_h: 3, sprawca_ostrzezony: true },
          dlaczego: 'Przejętą skrzynkę czyta przestępca — wie, że go wykryto, i szybciej wyprowadza środki.',
          dalej: 'dowody' },
      ],
    },
    udaremnione: {
      czas_h: 0,
      opis: 'Księgowa oddzwoniła na numer z kartoteki — kontrahent zaprzeczył zmianie rachunku. ' +
        'Przelew nie wyszedł.',
      wiedza: [
        ['Próba oszustwa udaremniona', 'pewne'],
        ['Skrzynka kontrahenta jest przejęta', 'prawdopodobne'],
      ],
      opcje: [
        { id: 'ostrzez', tekst: 'Telefon do kontrahenta, zgłoszenie do CERT Polska, pochwała dla księgowej',
          czas_h: 1, h: 2, mandat: 2, ocena: 'dobra', pkt: 55, skutek: { udaremnione: true, morale: 5 },
          dlaczego: 'Kontrahent zabezpieczy skrzynkę, inni nie zapłacą, a zgłaszanie w firmie rośnie.',
          dalej: 'nasza_skrzynka' },
        { id: 'zamknij', tekst: 'Nic się nie stało — zamykam temat',
          czas_h: 0, h: 0, ocena: 'dopuszczalna', pkt: 20, skutek: { udaremnione: true },
          dlaczego: 'Pieniądze są bezpieczne, ale kontrahent dalej ma przejętą skrzynkę.',
          dalej: 'nasza_skrzynka' },
      ],
    },
    dowody: {
      czas_h: 0.5,
      opis: 'Bank przyjął zgłoszenie i prosi o zawiadomienie o przestępstwie. Co dalej?',
      wiedza: [['Bank wymaga zawiadomienia o przestępstwie', 'pewne']],
      opcje: [
        { id: 'komplet', tekst: 'Zawiadomienie na policję + eksport maili z nagłówkami + telefon do kontrahenta na numer z kartoteki',
          czas_h: 2, h: 3, ocena: 'dobra', pkt: 30, skutek: { zawiadomienie: true, kontrahent_ostrzezony: true },
          dlaczego: 'Dowody i zawiadomienie zwiększają szansę zablokowania rachunku „słupa"; kontrahent odcina przestępcę.',
          dalej: 'nasza_skrzynka' },
        { id: 'usun', tekst: 'Usuwam feralny mail, żeby nikt więcej się nie nabrał',
          czas_h: 0.1, h: 0.1, ocena: 'blad', pkt: 0, skutek: { dowody_utracone: true },
          dlaczego: 'Bez nagłówków policja i bank mają mniej do pracy, a ubezpieczyciel może odmówić.',
          dalej: 'nasza_skrzynka' },
      ],
    },
    nasza_skrzynka: {
      czas_h: 4,
      opis: 'Przestępca znał szczegóły wątku. Z ich skrzynki czy z naszej?',
      wiedza: [['Źródło wiedzy przestępcy', 'nie wiadomo']],
      opcje: [
        { id: 'przeglad', tekst: 'Przegląd naszych skrzynek: logowania, reguły przekazywania, aplikacje; MFA dla finansów od dziś',
          czas_h: 3, h: 5, mandat: -1, ocena: 'dobra', pkt: 25, skutek: { sprawdzone: true },
          dlaczego: 'Jeśli nasza skrzynka też jest przejęta, to naruszenie RODO i kolejne oszustwa za tydzień.',
          dalej: 'zarzad' },
        { id: 'ich_problem', tekst: 'To ich problem — nasza skrzynka na pewno jest czysta',
          czas_h: 0, h: 0, ocena: 'blad', pkt: 0, skutek: {},
          dlaczego: 'Założenie bez sprawdzenia. W co trzeciej kampanii z długiem „brak MFA" nasza skrzynka też była przejęta.',
          dalej: 'zarzad' },
      ],
    },
    zarzad: {
      czas_h: 24,
      opis: 'Prezes chce „wyciągnąć konsekwencje" wobec księgowej.',
      wiedza: [['Firma nie miała procedury zmiany rachunku', 'pewne']],
      opcje: [
        { id: 'procedura', tekst: 'Sprzeciw: to błąd organizacji. Proponuję procedurę (oddzwonienie, biała lista VAT, druga osoba) i szkolenie finansów',
          czas_h: 1, h: 2, mandat: 3, ocena: 'dobra', pkt: 20, skutek: { procedura: true },
          dlaczego: 'Osoba, która się pomyliła, będzie najlepszym ambasadorem procedury. Zwolnienie uczy wszystkich ukrywać błędy.',
          dalej: 'koniec' },
        { id: 'zwolnienie', tekst: 'Zgadzam się na zwolnienie dyscyplinarne',
          czas_h: 0, h: 0, mandat: 1, ocena: 'blad', pkt: 0, skutek: { morale: -15 },
          dlaczego: 'Problem systemowy zostaje, a kultura zgłaszania umiera.',
          dalej: 'koniec' },
      ],
    },
  },

  zakonczenia: [
    { warunek: s => s.udaremnione, tytul: 'Udaremnione', opis: 'Procedura zadziałała. Najtańsza wygrana w grze.' },
    { warunek: s => s.bank_po_h !== undefined && s.bank_po_h <= 0.5 && !s.sprawca_ostrzezony,
      tytul: 'Odzyskane częściowo', opis: 'Bank zablokował część środków u odbiorcy.' },
    { warunek: () => true, tytul: 'Strata', opis: 'Środki wyprowadzone, zanim bank zdążył zareagować.' },
  ],

  debrief: [
    'Mail przyszedł z prawdziwego adresu kontrahenta, w prawdziwym wątku — żaden filtr tego nie zatrzyma.',
    'Zatrzymuje to wyłącznie procedura poza pocztą: oddzwonienie na znany numer, biała lista VAT, druga osoba.',
    'Szansa odzyskania pieniędzy liczy się w godzinach — bank jest pierwszym telefonem.',
    'Osoba, która się pomyliła, jest najlepszym świadkiem i przyszłym ambasadorem procedury.',
  ],
};
