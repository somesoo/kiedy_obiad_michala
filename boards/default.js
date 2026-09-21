// Plansza podstawowa — klasyczna serpentyna 7×7 (49 pól), z którą gra wystartowała.
// Każdy plik w boards/ to jeden SEZON: kształt planszy, drabiny, węże, bonusy i motyw.
// Admin przełącza sezon w panelu; przy zmianie wszyscy wracają na pole 0 (punkty i coins
// zostają). Format i walidacja: lib/seasons.js.

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
  name: 'Klasyczna 7×7',
  theme: null,
  effects: [],
  grid: { cols: COLS, rows: ROWS },
  path,
  // Powrót z mety (48, prawy górny róg) na start (0, lewy dolny): prawą krawędzią w dół
  // i dołem w lewo, POZA planszą — inaczej strzałka pętli przecinałaby pola.
  loop: [[6.75, 0], [6.75, 6.75], [0, 6.75]],
  // Rozkład dobrany pod 49 pól: 4 drabiny / 4 węże / 5 bonusów (~27% pól to pola specjalne).
  // Żaden cel skoku nie ląduje na innym polu specjalnym (brak reakcji łańcuchowych).
  ladders: [[3, 17], [8, 24], [21, 39], [28, 44]],   // [z, na] — na > z
  snakes:  [[12, 2], [19, 7], [36, 20], [45, 29]],   // [z, na] — na < z
  bonuses: [[5, 15], [11, 20], [23, 25], [34, 30], [41, 35]], // [pole, pkt]
};
