# Angielskie zestawy haseł Wordle (dla innego biura)

Zwykłe, „codzienne" angielskie słowa (5–9 liter, same A–Z), po jednym zestawie na miesiąc:
listopad 2026 – luty 2027. Ten katalog **nie** jest czytany przez serwer — zestawy wczytuje
się tylko z `sets/`, więc nasza instancja dalej gra po polsku.

## Jak odpalić na innej instancji

1. Na tamtym serwerze **zamień zawartość `sets/`** na pliki z `sets-en/` (polskie zestawy usuń,
   inaczej wczytają się te, które pasują datą).
2. Świeża baza (`db/` puste) i zwykły start — zestawy wczytają się same od dzisiaj
   (`autoloadSets` w `lib/wordle.js`). W logu: `Wordle: zestaw … wczytany przy starcie`.
3. W panelu Wordle, karta „Teksty i zasady", popraw wersję EN (i PL, jeśli ktoś gra po
   polsku) — domyślne teksty mówią, że hasła są **polskie**. Komunikat o nieistniejącym
   słowie w wersji EN też wspomina „Polish" (`public/i18n/en-wordle.js`).

## Zasady, których pilnują te pliki

- **Liczba haseł = liczba dni roboczych miesiąca** (pon–pt). Silnik daje zestawowi tyle
  kolejnych dni roboczych, ile ma haseł, licząc od `starts_on` — nadmiarowe słowa wylewają się
  na następny miesiąc i blokują jego zestaw przy starcie, a za mało = dziura na koniec miesiąca.
  Święta się nie liczą osobno (silnik ich nie zna).
- Każde hasło przechodzi tę samą heurystykę co zgadywane słowa (`looksLikeWord`), więc da się
  je też wpisać jako próbę. Słowa nie powtarzają się między miesiącami.
- Zgadywane słowa angielskie nie mają słownika — przechodzą przez heurystykę „wygląda jak
  słowo". Prawie wszystkie zwykłe słowa przechodzą, ale bardzo spółgłoskowe (np. STRENGTH,
  ponad 85% spółgłosek) zostaną odrzucone. Dlatego takich nie ma wśród haseł.
- Kolejne miesiące: nowy plik `RRRR-MM.json` z `starts_on` = pierwszy dzień miesiąca i
  dokładnie tyloma hasłami, ile ten miesiąc ma dni roboczych.
