# 17. Przypadki brzegowe — „test penetracyjny" własnej gry

Stan: 13.10.2026. Narzędzie: `node ciso-sim/proto/brzegowe.js [ziarna]` — automaty z celowo
głupimi albo cwanymi strategiami + sprawdzanie niezmienników. Wyniki surowe:
`proto/wyniki-brzegowe-2026-10-13.txt`. Każdy znaleziony absurd ma test w `test/prototyp.test.js`.

## 17.1. Strategie-prowokacje

| Strategia | Co robi | Pytanie |
|---|---|---|
| **mądry** | rozsądne odpowiedzi + kupuje podstawy w kolejności „tanie i ważne najpierw", pilnuje budżetu | czy gra jest wygrywalna przy twardych limitach? |
| rozsądny | najlepsza opcja w każdej karcie, „tak, ale bezpiecznie" działom | punkt odniesienia |
| **potakiwacz** | „tak" na wszystko, w kartach opcja najmilsza zarządowi | czy uprzejmość wygrywa z bezpieczeństwem? |
| **wszystko naraz** | w 1. miesiącu zamawia cały katalog | czy da się „kupić" bezpieczeństwo? |
| **odkładacz** | wszystko „odłóż", obowiązkowe — pierwsza opcja | czy bezczynność się opłaca? |
| **skąpiec** | zawsze najtańsza opcja | czy oszczędzanie na wszystkim się opłaca? |
| **kłamca** | kłamie w ankiecie ubezpieczyciela, wyjątek MFA dla zarządu, polityki „z pudełka" | czy kłamstwo się opłaca? |
| **pracoholik** | zawsze opcja z największą liczbą godzin | czy da się pracować 200 h w miesiącu, który ma 40? |
| **paranoik** | bada każdy sygnał, poza tym tylko obowiązkowe | czy sygnały zdradzają prawdę? |
| **losowy** | losowe decyzje i zakupy | fuzzing niezmienników |

## 17.2. Co znalazło laboratorium (przed poprawkami) i co z tym zrobiłem

| # | Absurd | Przyczyna | Poprawka | Test |
|---|---|---|---|---|
| 1 | Ryzyko insidera **×23**, usług ×9 | ten sam dział powtarzał „czat AI"/„laptopy z marketu", a mnożniki mnożyły się bez sufitu; cofanie dzieleniem rozjeżdżało się | **rejestr ryzyk** `dział:inicjatywa` (powtórka nie mnoży), mnożniki liczone od nowa, sufit ×3 dla działów i ×4 łącznie | niezmienniki |
| 2 | **„Zawsze odpowiedź a)" = 82% jakości decyzji** | w danych dobra opcja stała pierwsza we wszystkich 25 kartach | **tasowanie opcji** (własny strumień losowości; zapis/odtworzenie dalej działa) | „zawsze pierwsza nie wygrywa" |
| 3 | **Bezczynność = 100% jakości decyzji** (paranoik) | oceniano tylko podjęte decyzje | **brak decyzji też jest oceniany**: pominięta karta dotycząca TOP-2 problemów = błąd, sygnał/odkrycie bez reakcji = błąd, drugie „odłóż" tej samej sprawy = błąd | indeks |
| 4 | Kupno całego katalogu: **wydatki 7× budżet, bez odwołania** | budżet nie był limitem, kara −2/mies. | **twardy budżet**: zakup tylko w ramach budżetu roku (+10%), liczony z abonamentami do grudnia; kara za przekroczenie proporcjonalna | limity |
| 5 | **80 h pracy w miesiącu, który ma 40 h** | godziny kart bez limitu | **limit nadgodzin** 150%; morale −1 za każde 4 h ponad etat; incydent może przekroczyć (nadgodziny), zwykła karta — nie | limity |
| 6 | **Potakiwacz miał najwyższy mandat w grze** | zgody dawały mandat bez sufitu, incydenty mandatu nie ruszały | zgoda +0,25 (max +0,5/mies.), **poważny incydent −8**, wejście „za Twoją zgodą" −4, **kwartalna ocena zarządu** (wdrożenia, spokojny kwartał, terminy) | indeks |
| 7 | **Mandat ≠ wynik**: potakiwacz i mądry kończą z podobnym mandatem | zarząd nie widzi ryzyka, dopóki nie wybuchnie — to akurat realne | wynikiem jest **Indeks Odporności** (`11-…`), mandat zostaje „nastrojem zarządu" | indeks |
| 8 | **Odmawiający wszystkiego > rozsądny** w indeksie | indeks nie widział kosztu blokowania biznesu | składowa **„biznes"** (część próśb działów, która doszła do skutku) | — |
| 9 | **Kłamstwa darmowe** | ankieta bez skutku; wyjątek MFA bez wpływu na ryzyko | kłamstwo = **brak wypłaty** przy szkodzie (silnik) + weryfikacja przy odnowieniu (~5%/mies.: polisa wypowiedziana, mandat −8); wyjątek MFA: poświadczenia ×1,15, BEC ×1,25 | — |
| 10 | **Sygnał = pewny intruz** (przeciek zza mgły) | karta „sygnał" powstawała tylko przy prawdziwym intruzie | **fałszywe alarmy** (5–15%/dział/mies.); zbadanie fałszywego to dalej dobra decyzja | mgła wojny |
| 11 | **Środek przedziału „ile mamy zasobów" = prawda** | przedział symetryczny wokół prawdziwej liczby | **stały błąd szacunku** kampanii (±25%), maleje po inwentaryzacji | mgła wojny |
| 12 | **Gracz, który wykrywa więcej, płacił mandatem** | koszty reagowania liczyły się do budżetu bezpieczeństwa | koszty reagowania idą z **rezerwy firmy** (osobne pole w silniku) | — |
| 13 | Obowiązkowa karta **bez taniego wyjścia** (przejęcie oczyszczalni, wodomierze) → bez budżetu gracz musiał wybrać błąd | brak środkowej opcji | dopisane opcje środkowe + **reguła walidatora**: obowiązkowa karta ma opcję niebłędną bez zakupów, ≤ 8 h | walidacja danych |
| 14 | **„Poważny incydent" w 100% kampanii, także u najlepszych** | druga fala haktywistów była zawsze poważna | trzy wyniki fali: odparta / drobne zakłócenie (panel zamknięty, sieć płaska) / poważne | — |
| 15 | Przeciwnik reagował na **szum** (1 udana na 2 próby → waga ×2) | surowa częstość | wygładzenie (a priori ~1%), zapominanie wag, sufit po normalizacji | niezmienniki |
| 16 | Kontrola liczona w m. 23 **ignorowała ostatni miesiąc** | wynik w chwili zdarzenia | kontrola liczona zawsze na koniec | — |
| 17 | Szkolenie kierownika z 2026 **zaliczało rok 2027** | flaga bez roku | flaga per rok; kontrola sprawdza rok przed nią (albo bieżący) | — |
| 18 | SZBI „w toku" w terminie = to samo co zaniechanie | termin patrzył tylko na wdrożone | wdrożenie w toku = mniejsza kara; karta mówi, że SZBI trwa ~pół roku | — |
| 19 | Budżet przyznawany w pełni przy mandacie bliskim zera | brak zależności | przyznana kwota × zaufanie zarządu (0,6–1,2) | — |
| 20 | Firma z 0 osób i 0 komputerów „traciła" 195 tys. zł | wektor dostawcy nie skaluje się z niczym | **walidator profilu firmy** (zły profil nie wchodzi do gry) | walidacja danych |

## 17.3. Wyniki po poprawkach (20 ziaren; Indeks Odporności — `11-…`)

| Strategia | Straty | Audyt /60 | Mandat | Jakość decyzji | Odwołany | **Indeks** |
|---|---|---|---|---|---|---|
| **mądry** | 91 tys. | 54 | 58 | 81% | 0/20 | **923** |
| kłamca | 177 tys. | 39 | 52 | 85% | 0/20 | 867 |
| rozsądny | 216 tys. | 41 | 55 | 87% | 0/20 | 864 |
| wszystko naraz | 275 tys. | 43 | 65 | 82% | 0/20 | 839 |
| pracoholik | 215 tys. | 36 | 46 | 82% | 0/20 | 831 |
| potakiwacz | 375 tys. | 32 | 54 | 46% | 0/20 | 759 |
| paranoik | 372 tys. | 23 | 47 | 47% | 0/20 | 677 |
| losowy | 587 tys. | 32 | 24 | 44% | 4/20 | 548 |
| odkładacz | 882 tys. | 17 | 25 | 29% | 1/20 | 479 |
| skąpiec | 949 tys. | 25 | 2 | 24% | **18/20** | 336 |

Niezmienniki (brak NaN, wskaźniki w zakresach, mnożniki ≤ 4, `znane` w (0, 1]) — **OK dla
wszystkich strategii**. Silnik bez wyjątków także dla firm skrajnych (1 osoba; 50 000 osób;
cały katalog w 1. miesiącu).

## 17.4. Co zostawiam świadomie (i dlaczego)

- **Potakiwacz ma mandat jak najlepszy gracz.** To jest prawda o organizacjach: uprzejmość
  jest nagradzana, dopóki nic nie wybuchnie. Gra tego nie ukrywa — pokazuje to w debriefie
  i nie liczy mandatu do wyniku.
- **Kłamca ≈ rozsądny w indeksie** (867 vs 864, w granicach szumu), ale ma niższy mandat
  (52 vs 55) i niższą jakość decyzji (85% vs 87%). Kłamstwo nic nie daje i czasem dużo kosztuje — wystarczy.
- **Odmawiający ma mniej strat niż rozsądny** (krótkoterminowo „nie" jest bezpieczne), ale
  niższy indeks (biznes), mandat bliski 30 i zaufanie działów ~0. Tak to wygląda w życiu.
- **„Wszystko naraz" nie jest katastrofą** — budżet zatrzymuje zakupy, więc kończy się zwykłą
  złą priorytetyzacją (kupuje po kolei z katalogu, a nie to, co najważniejsze).
- **Gracz rozsądny przegrywa z mądrym** wyłącznie przez kolejność zakupów — to jest dokładnie
  umiejętność, której gra ma uczyć (priorytety przy ograniczonym budżecie).

## 17.5. Reguły projektowe, które z tego wynikają

1. Każda **obowiązkowa karta ma uczciwe wyjście bez pieniędzy** (walidator).
2. **Kolejność opcji jest zawsze tasowana**; dane mogą stawiać dobrą opcję gdziekolwiek.
3. **Brak decyzji jest decyzją** i jest oceniany.
4. **Żaden mnożnik nie rośnie przyrostowo bez sufitu** — stan liczony od nowa z rejestru.
5. **Wynik ≠ mandat.** Wynik to skutki (Indeks Odporności), mandat to zasób w grze.
6. **Koszty reagowania nie obciążają budżetu bezpieczeństwa** — skuteczność nie może karać.
7. **Każda karta-sygnał może być fałszywa; każdy szacunek ma błąd** — inaczej mgła przecieka.
8. **Każda nowa strategia-prowokacja trafia do `brzegowe.js`**, a każdy absurd — do testów.
