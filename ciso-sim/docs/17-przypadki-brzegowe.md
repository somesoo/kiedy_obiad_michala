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

## 17.3. Wyniki po poprawkach (20 ziaren; po drugiej rundzie — 17.6)

**Wynik kampanii** = ½ Indeks Odporności + ½ Jakość Decyzji (ważona), z sufitem za decyzje
nie do obrony (`11-…`). „Sufit" = w ilu kampaniach wynik został ucięty.

| Strategia | Straty | Audyt /60 | Mandat | Jakość decyzji | Odwołany | Sufit | Indeks | **Wynik** |
|---|---|---|---|---|---|---|---|---|
| **mądry** | 113 tys. | 54 | 62 | 89% | 0/20 | 0/20 | 911 | **900** |
| rozsądny | 239 tys. | 41 | 54 | 90% | 0/20 | 0/20 | 838 | 868 |
| pracoholik | 240 tys. | 41 | 54 | 89% | 0/20 | 0/20 | 843 | 865 |
| wszystko naraz | 287 tys. | 43 | 64 | 85% | 0/20 | 0/20 | 829 | 841 |
| potakiwacz | 184 tys. | 38 | 54 | 66% | 0/20 | 0/20 | 869 | 767 |
| odmawiający (`porownaj-style.js`) | 163 tys. | 45 | 26 | 69% | 0/20 | 0/20 | 803 | 746 |
| **kłamca** | 177 tys. | 39 | 52 | 85% | 0/20 | **20/20** | 644 | **650** |
| paranoik | 372 tys. | 23 | 47 | 61% | 0/20 | 0/20 | 576 | 592 |
| losowy | 540 tys. | 30 | 21 | 44% | 4/20 | 2/20 | 551 | 503 |
| odkładacz | 882 tys. | 17 | 25 | 36% | 1/20 | 0/20 | 410 | 383 |
| skąpiec | 892 tys. | 24 | 1 | 23% | **17/20** | 1/20 | 360 | 296 |
| bierny (`porownaj-style.js`) | 1,25 mln | 13 | 1 | 16% | — | 0/20 | 148 | 155 |

Niezmienniki (brak NaN, wskaźniki w zakresach, mnożniki ≤ 4, `znane` w (0, 1]) — **OK dla
wszystkich strategii**. Silnik bez wyjątków także dla firm skrajnych (1 osoba; 50 000 osób;
cały katalog w 1. miesiącu).

## 17.4. Co zostawiam świadomie (i dlaczego)

- **Potakiwacz ma mandat jak najlepszy gracz.** To jest prawda o organizacjach: uprzejmość
  jest nagradzana, dopóki nic nie wybuchnie. Gra tego nie ukrywa — pokazuje to w debriefie
  i nie liczy mandatu do wyniku.
- **Potakiwacz ma wysoki Indeks Odporności (869)**, bo EDR i kopie łapią większość tego, co
  wpuścił. To prawda o skutkach — dobra technika wybacza sporo. Ale **Wynik kampanii** (767)
  liczy też decyzje i stawia go za rozsądnym.
- **Odmawiający ma najmniejszą ekspozycję z aktywnych graczy** (karze każde odkryte obejście,
  a kara zeruje ryzyko), ale biznes 0%, mandat 26, zaufanie działów 0,01 i Wynik 746. „Nie"
  jest krótkoterminowo bezpieczne — tak to wygląda w życiu.
- **„Wszystko naraz" nie jest katastrofą** — budżet zatrzymuje zakupy, więc kończy się zwykłą
  złą priorytetyzacją (kupuje po kolei z katalogu, a nie to, co najważniejsze).
- **Rozsądny nie ma EDR-u w 16 na 20 kampanii**: każde „tak, ale bezpiecznie" kosztuje godziny
  i pieniądze, a automat nie liczy budżetu. Gracz rozsądny przegrywa z mądrym — to jest dokładnie
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
9. **Kara musi trafić w wynik.** Konsekwencja tylko w mandacie (albo innym wskaźniku spoza
   wyniku) jest dla wyniku niewidoczna.
10. **Wynik liczy się z prawdy, nie z wykrycia.** Kłamstwo i ukryte obejście ciążą, nawet jeśli
    nikt ich nie znalazł (sufity, ekspozycja). W trakcie gry jest mgła, na koniec rachunek.
11. **Decyzje nie do obrony mają sufit, nie punkty karne.** Żaden dobry wynik ich nie równoważy.
12. **Każde narzędzie ma martwe pola.** Nowa kontrola wykrywająca musi powiedzieć, czego nie widzi.
13. **Uczciwa opcja musi mieć cenę**, inaczej nieuczciwa nie jest pokusą, tylko pomyłką.

## 17.6. Druga runda: „jakim cudem kłamca ma tak wysoki indeks?" (pytanie właściciela, 13.10.2026)

Kłamca miał indeks 867 — tyle co rozsądny (864). Kłamał naprawdę: ankieta ubezpieczyciela
w 20/20 kampanii, wyjątek MFA dla zarządu w 16/20. Rozbiór pokazał **pięć przyczyn**, a każda
z nich osobno mówiła to samo: złe i ukryte decyzje prawie nie dotykały wyniku.

| # | Przyczyna | Dlaczego zła decyzja „nic nie kosztowała" | Poprawka |
|---|---|---|---|
| 21 | **Kary za kłamstwo szły w mandat, a mandatu nie ma w indeksie** | wykryte kłamstwo: mandat −8, reputacja −3 (to drugie ≈ 3 pkt indeksu) | **bramki (sufity)**: kłamstwo wobec ubezpieczyciela i fałszywy komunikat „woda bezpieczna" → wynik najwyżej 650, odwołanie → 500. Liczone z prawdy, **wykryte czy nie** |
| 22 | **Indeks mierzył tylko to, co się wydarzyło** — przy 2–5 incydentach na kampanię głównie szczęście | ryzyko, które jeszcze nie wybuchło (kłamstwo, ukryte obejście, wyjątek), kosztowało zero | **ekspozycja**: oczekiwane straty w roku PO kampanii, liczone z końcowego stanu (40 przebiegów silnika, te same ziarna dla każdego) |
| 23 | **Jakość Decyzji nieważona** | kłamstwo w ankiecie = 1/68 wyniku, tyle co odpowiedź na prośbę o czat AI | waga karty (obowiązkowa 2, ankieta ubezpieczyciela 4); decyzje scenariusza ważone punktami rubryki |
| 24 | **„Uczciwa" odpowiedź też kupowała polisę** bez MFA/EDR/kopii | prawda nic nie kosztowała, więc kłamstwo nie było wyborem, tylko płaceniem składki za nic | uczciwa ankieta bez wymagań = **odmowa ubezpieczyciela**; teraz kłamstwo kusi, bo jest jedyną drogą do polisy |
| 25 | **EDR widział wszystko** — także insidera i logowanie do panelu HMI | potakiwacz z ×2,5 ryzyka i EDR-em miał MNIEJSZĄ ekspozycję niż mądry; jedno narzędzie unieważniało dziesiątki złych zgód | **martwe pola** w katalogu (`martwe_pola`): EDR widzi insidera w 20%, wystawione usługi w 40%, dostawcę w 60%; podobnie MDR, SIEM, utwardzenie, honeypoty, segmentacja |
| 26 | **Odmowa kasowała potrzebę** razem z ryzykiem (raport: „szukamy innej drogi" — kłamstwo modelu) | „Nie" było jedyną decyzją o zerowym ryzyku | po odmowie dział robi swoje po cichu z P = 0,15 + 0,6·pilność − 0,4·świadomość (− 0,3 z polityką zakupów) |
| 27 | **Martwa składowa** „koszt vs budżet" = 1,0 u każdego (twardy budżet) | 5% wagi rozcieńczało resztę | usunięta; straty zrealizowane 0,25 → 0,15, ekspozycja 0,20 |

Do tego **Wynik kampanii** = ½ Indeks + ½ Jakość Decyzji. Indeks to prawda o skutkach, a tę
dobra technika potrafi uratować mimo złych decyzji (potakiwacz: indeks 869). Gracz ma jednak
widzieć jeden wynik, który mówi też, JAK grał. Kłamca: z 867 na **650**. Potakiwacz: **767**
(o 133 mniej niż mądry). Rozsądny: 868.

Laboratorium miało przy okazji własny błąd. Pracoholik i potakiwacz przy remisie opcji brali
pierwszą po tasowaniu, więc czasem kłamali przypadkiem (11/20 i 6/20 kampanii z sufitem).
Teraz przy remisie biorą dobrą opcję — każda prowokacja testuje jedną cechę.

**Czego się nauczyłem:** kara, która trafia w wskaźnik spoza wyniku, nie istnieje. Ryzyko,
którego wynik nie widzi, jest darmowe. Narzędzie bez martwych pól jest srebrną kulą. Każda
z tych trzech rzeczy osobno wystarczała, żeby kłamstwo wyszło na zero.
