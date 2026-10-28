// „Klasyka" — sezon 3 (listopad 2026): powrót do układu pierwszego sezonu „Snakes Game".
//
// Kształt, drabiny, węże i bonusy są DOKŁADNIE te z boards/default.js (serpentyna 7×7,
// 49 pól). Przepisane tutaj, a nie wzięte przez require: plik to zapis sezonu, więc
// poprawka w default.js nie może po cichu przesunąć pól w trwającej grze.
//
// Bez `special_boss` — wraca zwykła rotacja bossów z eskalacją: wygrana podnosi próg
// następnego (×1,2, mniej czasu), przegrana go obniża (×0,9, więcej czasu), patrz
// slCoopNextDifficulty w lib/boss.js. Bez `events`, więc nie ma kotła, drzwi ani cukierków.
//
// Kostiumy: własny zestaw (po 3 w każdym slocie, `season: 'klasyka'` w lib/costumes.js)
// i skin wsparcia Złoty wieniec laurowy. Kostiumy z Nocy Duchów da się nosić, ale nie kupić.
//
// EKONOMIA: 49 pól to ~10% rzadsze zbicia niż na 40 polach Nocy Duchów, a zbicie zostaje
// przy 10 coins (SL_KNOCKBACK_COIN_STEAL), czyli taniej niż w pierwszym sezonie (20).
// Okrążenie trwa dłużej, więc premia za nie (domyślne SL_POINTS_PER_LAP) wpada rzadziej.

const COLS = 7;
const ROWS = 7;

// Serpentyna od dołu: wiersz 0 (dół) idzie w prawo, wiersz 1 w lewo itd. `path` trzyma
// [kolumna, wiersz OD GÓRY], bo tak liczy CSS grid — stąd ROWS - 1 - boardRow.
const path = [];
for (let i = 0; i < COLS * ROWS; i++) {
  const boardRow = Math.floor(i / COLS);
  const posInRow = i % COLS;
  const col = boardRow % 2 === 0 ? posInRow : COLS - 1 - posInRow;
  path.push([col, ROWS - 1 - boardRow]);
}

module.exports = {
  name: 'Klasyka · sezon 3',
  // GOTOWY (28.10.2026, decyzja właściciela) — produkcja przełącza się na niego na koniec
  // października. Od teraz zmiana liczby pól albo numeracji to ruszanie żywej gry: potrzebna
  // migracja (serwer krzyczy w logu, gdy liczba pól aktywnego sezonu bez `testing` się zmieni).
  testing: false,
  theme: null,
  effects: [],
  grid: { cols: COLS, rows: ROWS },
  path,
  // Powrót z mety (48, prawy górny róg) na start (0, lewy dolny): prawą krawędzią w dół
  // i dołem w lewo, POZA planszą — inaczej strzałka pętli przecinałaby pola.
  loop: [[6.75, 0], [6.75, 6.75], [0, 6.75]],
  // Rozkład z pierwszego sezonu: 4 drabiny / 4 węże / 5 bonusów (~27% pól to pola specjalne).
  ladders: [[3, 17], [8, 24], [21, 39], [28, 44]],   // [z, na] — na > z
  snakes:  [[12, 2], [19, 7], [36, 20], [45, 29]],   // [z, na] — na < z
  bonuses: [[5, 15], [11, 20], [23, 25], [34, 30], [41, 35]], // [pole, pkt]
};
