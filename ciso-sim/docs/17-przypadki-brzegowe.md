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

## 17.3. Wyniki po poprawkach (20 ziaren; po trzeciej rundzie — 17.7)

**Wynik kampanii** = ½ Indeks Odporności + ½ Jakość Decyzji (ważona), z sufitem za decyzje
nie do obrony (`11-…`). „Sufit" = w ilu kampaniach wynik został ucięty.

| Strategia | Straty | Audyt /60 | Mandat | Zaufanie działów | Jakość decyzji | Odwołany | Sufit | Indeks | **Wynik** |
|---|---|---|---|---|---|---|---|---|---|
| **mądry** | 112 tys. | 57 | 60 | 0,60 | 90% | 0/20 | 0/20 | 927 | **912** |
| rozsądny | 270 tys. | 47 | 52 | 0,63 | 91% | 0/20 | 0/20 | 859 | 882 |
| pracoholik | 284 tys. | 44 | 53 | 0,59 | 88% | 0/20 | 0/20 | 845 | 861 |
| wszystko naraz | 236 tys. | 49 | 62 | 0,56 | 86% | 0/20 | 0/20 | 859 | 860 |
| odmawiający (`porownaj-style.js`) | 163 tys. | 51 | 24 | 0,01 | 70% | 0/20 | 0/20 | 818 | 760 |
| potakiwacz | 184 tys. | 40 | 50 | 0,75 | 62% | 0/20 | **12/20** | 695 | 651 |
| paranoik | 343 tys. | 29 | 45 | 0,38 | 62% | 0/20 | 0/20 | 599 | 611 |
| losowy | 650 tys. | 33 | 18 | 0,24 | 43% | 6/20 | 7/20 | 535 | 497 |
| **kłamca** | 154 tys. | 32 | 34 | **0,16** | 74% | 0/20 | **20/20** | 385 | **385** |
| odkładacz | 834 tys. | 21 | 19 | 0,28 | 35% | 1/20 | 3/20 | 395 | 376 |
| skąpiec | 1,01 mln | 25 | 0 | 0,23 | 24% | **20/20** | 2/20 | 372 | 308 |
| bierny (`porownaj-style.js`) | 1,34 mln | 15 | 0 | 0,31 | 14% | — | 0/20 | 152 | 147 |

Niezmienniki (brak NaN, wskaźniki w zakresach, mnożniki ≤ 4, `znane` w (0, 1]) — **OK dla
wszystkich strategii**. Silnik bez wyjątków także dla firm skrajnych (1 osoba; 50 000 osób;
cały katalog w 1. miesiącu).

## 17.4. Co zostawiam świadomie (i dlaczego)

- **Potakiwacz ma mandat jak najlepszy gracz.** To jest prawda o organizacjach: uprzejmość
  jest nagradzana, dopóki nic nie wybuchnie. Gra tego nie ukrywa — pokazuje to w debriefie
  i nie liczy mandatu do wyniku.
- **Potakiwacz fałszuje dokumenty w 12/20 kampanii** — bo przed audytem wybiera opcję
  najmilszą zarządowi, a członek zarządu prosi właśnie o daty wsteczne. Nie poprawiałem tego
  w automacie: to jest lekcja („potakiwanie kończy się podpisem pod cudzym kłamstwem").
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
14. **Kłamstwo to osobna kategoria, nie „błąd"**: `nieuczciwe: { wobec, wykrywalnosc }` w danych,
    rejestr `k.klamstwa`, −1 w Jakości Decyzji, sufit wyniku, a po ujawnieniu — skutki dla
    współpracy (zarząd, działy, ubezpieczyciel, audytor). Walidator pilnuje ocen i adresata.
15. **Gra jest skończona i kończy się audytem zamykającym**, który porównuje deklaracje
    z rzeczywistością. Każda pokusa „na skróty" ma swój moment rozliczenia.
16. **Karta może mieć kilka dobrych odpowiedzi** — różnią się kosztem, godzinami i ryzykiem
    na lata. Automaty biorą najtańszą w skali roku (`dobraNajtansza`), żywy gracz wybiera sam.

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

## 17.7. Trzecia runda: ile kosztuje zła decyzja i czy kłamstwo ma prawdziwe skutki

Pytania właściciela (13.10.2026): „nie ma zawsze jednej najlepszej decyzji — jak wygląda strata
za złe?" oraz „kłamca nadal wysoko — może odbicie na współpracy albo obowiązkowy audyt po
ostatnim sezonie; gra ma mieć skończoną liczbę iteracji".

**Co znalazłem.**
1. **Każda z 25 kart miała dokładnie jedną dobrą odpowiedź.** Gra była quizem „zgadnij, co
   myśli autor", a nie decyzjami z kompromisami. Teraz 6 kart ma dwie dobre drogi: EDR sam albo
   z usługą MDR; MFA z aplikacją albo z kluczami FIDO dla zarządu i księgowości; administrator
   z zewnątrz albo pół etatu u nas; plan reagowania sam albo z retainerem; kopie OT u nas albo
   u integratora na naszym nośniku; SZBI z doradcą albo z vCISO. Różnią się kosztem na lata —
   przy budżecie 120–220 tys. zł/rok MDR z minimum 9 tys. zł/mies. to zobowiązanie, które
   rozsadza kolejne budżety (pierwszy przebieg: mandat wszystkich graczy spadł o połowę, bo
   automaty brały drogie drogi losowo; teraz biorą najtańszą rocznie).
2. **Etat nie liczył się do budżetu** przy zakupie (tylko w silniku po fakcie). Poprawione.
3. **Kłamstwo po ujawnieniu kosztowało tylko mandat.** Teraz ujawnienie uderza we wszystkich,
   z którymi gracz pracuje (funkcja `ujawnij`): zarząd — mandat −15 i kolejny budżet ×0,7;
   działy — zaufanie −0,3 i Q(pytaj) −0,5, czyli przestają pytać i częściej obchodzą zasady;
   ubezpieczyciel — polisa wypowiedziana; audytor — rozszerzona próba.
4. **Nie było momentu rozliczenia.** Kampania jest skończona (24 miesiące), a ostatnim krokiem
   jest teraz **audyt zamykający** (🔵 zleca go rada nadzorcza — `02-…`). Audytor wykrywa każde
   nieujawnione kłamstwo z prawdopodobieństwem z danych (deklaracje techniczne 0,9, dokumenty
   z datą wsteczną 0,6). Po pierwszej nieprawdzie nie wierzy już deklaracjom: każda drobna
   niezgodność staje się główną.
5. **Nowa pokusa przed audytem** (`K_przed_audytem`, m. 21–22, obowiązkowa): uczciwy plan
   naprawczy (audytor uznaje najwyżej dwa obszary „w toku"), sprint zespołu (uczciwy, ale kosztem
   ludzi) albo dokumenty z datą wsteczną. Fałszywka, której nie wykryto, POPRAWIA audyt — dlatego
   jest pokusą. Wykryta zamienia audyt w katastrofę.

**Cennik złych decyzji** (`proto/cennik.js`): gracz mądry gra normalnie, a w jednej karcie wybiera
najgorszą opcję; różnica Wyniku kampanii na tych samych 10 ziarnach (`proto/wyniki-cennik-2026-10-13.txt`):

| Rodzaj decyzji | Przykład | Koszt (Wynik, na 1000) |
|---|---|---|
| **Nieuczciwość** | „tak" wszędzie w ankiecie ubezpieczyciela | **−469** |
| **Nieuczciwość** | dokumenty z datą wsteczną przed audytem | **−409** |
| Błąd z trwałym skutkiem | integrator dostaje hasło przez telefon | −80 |
| Błąd z trwałym skutkiem | przejęcie oczyszczalni: „łączymy sieci od razu" | −20 |
| Błąd naprawialny | „Prezes ma rację — KSC nas nie dotyczy" (karta „Wykaz" daje drugą szansę) | −13 |
| Błąd naprawialny | ignorowanie ostrzeżenia CERT (gdy panel i tak zostanie zamknięty) | −10 |
| Dopuszczalna zamiast dobrej | jedno e-szkolenie zamiast programu | −5 |

Zera w surowym wyniku (EDR, SZBI, łatki, segmentacja) to artefakt pomiaru: mądry przy braku
budżetu i tak wybiera tam opcję słabszą, a brakującą kontrolę dokupuje później z listy priorytetów.

**Dlaczego zwykły błąd kosztuje tylko 5–20 punktów — i to jest zamierzone.** Kampania ma ~65
decyzji. Pojedynczy błąd da się naprawić później (nowa karta, zakup, druga szansa) i realnie
rzadko kładzie program bezpieczeństwa — ryzyko jest jak plasterki sera, liczy się suma. Dziesięć
błędów to już −100…−200. Kłamstwa naprawić się nie da: kosztuje tyle co dwadzieścia błędów.

**Wynik:** kłamca z 650 na **385** (sufit w 20/20, zaufanie działów 0,16 zamiast 0,63, audyt 32/60).
Jest za graczem losowym (497) i tuż obok odkładacza (376). Rozsądny: 882, mądry: 912.

