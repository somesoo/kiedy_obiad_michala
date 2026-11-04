// Słownik PL → EN wspólny dla Snakes i Wordle (logowanie, nagłówek, błędy serwera).
// Klucz = polski tekst DOKŁADNIE taki, jaki trafia na stronę (białe znaki nie mają
// znaczenia). {nazwa} = miejsce na liczbę, nick itp. — w tłumaczeniu wstawia się to samo.
// Klucz z tagami (<strong>…) tłumaczy cały element „mieszany" naraz. Wiodące emoji,
// liczby i kropki na brzegach tekstu silnik obcina sam, więc klucze zwykle ich nie mają.
// Brakujące tłumaczenia pokazuje w konsoli i18nMissing() (tylko w wersji EN).
I18N.add({
  // ── nagłówek, logowanie, wspólne ──
  'Zasady': 'Rules',
  'Jak to działa?': 'How does it work?',
  'wyloguj': 'log out',
  'ładowanie...': 'loading...',
  'Dołącz do gry': 'Join the game',
  'np. Kacper_dev': 'e.g. Kacper_dev',
  'Wchodzę w to': "I'm in",
  'Wpisz nick': 'Enter a nickname',
  'Błąd serwera': 'Server error',
  'made with ❤️ i poranną kawą': 'made with ❤️ and morning coffee',
  'Zamknij': 'Close',
  'pkt': 'pts',
  'coins': 'coins',
  'jutro': 'tomorrow',
  'dzisiaj': 'today',
  'teraz!': 'now!',

  // ── błędy serwera (server.js) ──
  'Brak tokenu': 'Missing token',
  'Nieznany token': 'Unknown token',
  'Nick za krótki — minimum 2 znaki': 'Nickname too short — at least 2 characters',
  'Nick za długi — maximum 20 znaków': 'Nickname too long — at most 20 characters',
  'Ten nick jest zajęty, wymyśl coś lepszego': 'That nickname is taken, come up with something better',

  // ── dni tygodnia (odliczania, „wróć w poniedziałek") ──
  'w niedzielę': 'on Sunday',
  'w poniedziałek': 'on Monday',
  'we wtorek': 'on Tuesday',
  'w środę': 'on Wednesday',
  'w czwartek': 'on Thursday',
  'w piątek': 'on Friday',
  'w sobotę': 'on Saturday',

  // ── Wordle → Snakes (dziennik Snakes, okienka) ──
  'rozwiązuje Wordle dnia (+1 ruch na dziś)': 'solves the Wordle of the day (+1 move today)',
  'rozwiązuje Wordle dnia (Extra Move do ekwipunku)': 'solves the Wordle of the day (Extra Move to inventory)'
});
