# 14. Samoewaluacja — co jest mocne, co słabe, co sprawdzić

Ten dokument jest krytyczną oceną całego projektu w wersji 0.1. Ma pomóc zdecydować, co
robić dalej, a nie bronić tego, co już napisane.

## 14.1. Jak weryfikowałem realia

- **Źródła**: wyszukiwanie w sieci (13.10.2026) — omówienia kancelarii (Traple Konarski
  Podrecki, SPCG, DSK), wydawnictw prawniczych (Wolters Kluwer, LEX), firm doradczych (Grant
  Thornton, KPMG, Crowe), komunikaty gov.pl, raport CERT Polska, media branżowe (CyberDefence24,
  CRN, ITwiz) i ogólne.
- **Ograniczenie**: środowisko, w którym pracowałem, **nie pozwalało pobrać pełnych tekstów**
  stron (blokada sieci) — opierałem się na streszczeniach wyników wyszukiwania. Dlatego
  wszystko, gdzie źródła się różniły albo było jedno źródło, ma w `02-…` status 🟡.
- **Najważniejsze rozbieżności** znalezione po drodze (i dlaczego to ważne):
  - kara dla kierownika: **600%** (wcześniejszy projekt, wciąż w publicystyce) vs **300%**
    (nowsze omówienia, art. 73a ust. 4) — gra przyjmuje 300% z 🟡;
  - sprawozdanie końcowe „miesiąc od 24 h" vs „miesiąc od 72 h" — gra liczy od 72 h z 🟡;
  - zakres JST w KSC (urząd gminy ≥ 50 etatów?) — gra robi z tego decyzję gracza;
  - status CSIRT-u dla energetyki — nie znalazłem;
  - terminy DORA (4 h / 24 h) — z mojej wiedzy, nie potwierdzone w wynikach.
- **Wniosek**: przed pokazaniem gry komukolwiek spoza biura trzeba przejść listę z `02-…`,
  punkt 8, na tekstach aktów. Najlepiej z prawnikiem od cyberbezpieczeństwa (1–2 dni pracy).

## 14.2. Wyniki symulacji (proto/symulacja.js, 2000 przebiegów, 24 miesiące)

Pełne wyniki: `proto/wyniki-2026-10-13.txt`. Wycinek dla firmy referencyjnej (Metalpol, 450 osób):

| Strategia | Wydatki | Straty | Razem | Razem P90 | Poważne / 2 lata | P(≥1 poważny) | Uwagi |
|---|---|---|---|---|---|---|---|
| nic | 23 tys. | 3,67 mln | 3,70 mln | 9,22 mln | 1,63 | 80% | |
| papier (SZBI, ryzyko, dostawcy, plan IR) | 79 tys. | 3,20 mln | 3,28 mln | 8,52 mln | 1,54 | 78% | ochrona −13% |
| narzędzia bez ludzi | 1,43 mln | 0,44 mln | 1,86 mln | 2,31 mln | 0,82 | 57% | 2 narzędzia niewdrożone, 7 mies. poślizgu |
| mała firma (MSP + higiena + EDR) | 0,71 mln | 0,29 mln | **0,99 mln** | 1,51 mln | 0,33 | 28% | najtańsza w sumie |
| higiena (+1 etat, bez EDR) | 0,90 mln | 0,56 mln | 1,46 mln | 2,64 mln | 0,55 | 42% | |
| higiena + EDR + MDR + SZBI | 2,14 mln | 0,16 mln | 2,30 mln | 2,88 mln | 0,21 | 19% | najmniej poważnych |
| własny SOC (+4 etaty) | 3,57 mln | 0,16 mln | 3,73 mln | 4,30 mln | 0,22 | 20% | ochrona jak MDR, +1,4 mln |

### Wnioski, które **potwierdzają** założenia gry

1. **Higiena tnie straty kilkukrotnie za ułamek ceny** (E2). We wszystkich 9 firmach.
2. **Sam papier daje mało** (−5…−15% strat; E11). W małych organizacjach projekt SZBI zjada
   godziny jedynej osoby: biuro rachunkowe — 40 miesięcy łącznego poślizgu projektów, gmina — 21.
3. **Narzędzia bez ludzi** (E3): w małych firmach 4–5 kupionych narzędzi **nigdy się nie
   wdraża** w 24 miesiące (a abonament leci); w gminie 19 miesięcy z zalewem alertów.
   Jednocześnie redukcja strat jest realna — głównie dzięki EDR, który blokuje bez ludzi.
4. **EDR to najsilniejsza pojedyncza dźwignia po higienie** — różnica „mała firma" vs
   „higiena" to w dużej mierze EDR. Zgodne z realnym przypadkiem z 29.12.2025 (EDR zatrzymał
   niszczenie na 100+ maszynach elektrociepłowni).
5. **Energetyka (APT ×4)**: wykrywanie ma większą wartość niż gdzie indziej — „higiena" bez
   wykrywania zostawia 1,5 mln strat, MDR ucina je do 0,34 mln.
6. **Po higienie pierwsze miejsce strat zajmuje insider** (brak JML w strategiach) — naturalny
   „następny krok", który gra może podpowiedzieć.
7. **Ogon ryzyka (P90)** jest 2,5× średniej przy braku ochrony i tylko 1,2–1,5× przy dobrej —
   to jest argument dla zarządu, który gra ma pokazywać (bezpieczeństwo jako redukcja
   zmienności, nie tylko średniej).

### Wnioski, które są **problemem** do rozwiązania

1. **„Mała firma" (MSP + higiena + EDR) wygrywa wartością oczekiwaną prawie wszędzie**, także
   w firmach średnich. Częściowo to prawda (to w praktyce dobra rada dla wielu polskich firm),
   ale w grze grozi **strategią dominującą**. Przeciwwagi, które trzeba wbudować:
   - **zgodność**: podmioty kluczowe/ważne muszą mieć SZBI, ryzyko, dostawców, plan IR —
     „mała firma" nie zda audytu (S12),
   - **testy obciążeniowe** kampanii celują w konkretne luki (segmentacja OT w fabryce,
     dostawcy w szpitalu, wykrywanie w energetyce),
   - **limit MSP**: pakiet godzin ma sufit i MSP sam jest ryzykiem (Z23),
   - **zarząd patrzy na P90 i na liczbę poważnych incydentów**, nie tylko na średnią.
2. **Kompresja czasu**: firma bez ochrony ma 1,6 poważnego incydentu na 2 lata gry (80%
   szans na co najmniej jeden). W realu to raczej kilka lat. Świadomie zostawiam ok. ×3 —
   ale gra **musi to mówić** (samouczek i debrief), inaczej uczy przesadnego strachu.
3. **Próg „poważny" = 100 tys. zł** jest stały — dla biura rachunkowego to dużo, dla
   elektrociepłowni nic. Do zmiany na próg względny (np. % rocznego przychodu albo dni
   przestoju).
4. **Skala firmy**: częstotliwości rosną potęgowo z liczbą ludzi/zasobów — zgadywane.
   Szpital wychodzi „najgorzej" (2 poważne / 2 lata) — co może być prawdą (ochrona zdrowia
   jest częstym celem), ale bez danych to tylko hipoteza.
5. **Godziny w biurze rachunkowym**: nawet „mała firma" ma tam 14 miesięcy łącznego poślizgu
   wdrożeń — dla 30 osób plan jest wciąż za ciężki albo pakiet MSP za mały. Do kalibracji
   z kimś, kto na co dzień obsługuje małe firmy.

## 14.3. Słabości modelu (świadome i nieświadome)

| Słabość | Skutek | Co zrobić |
|---|---|---|
| Kontrole działają niezależnie (mnożenie) | przeszacowanie łączenia podobnych narzędzi | korelacje w parach (EDR+MDR tego samego dostawcy) |
| Napastnik nie adaptuje się do obrony | gra „liniowa": więcej kontroli = zawsze lepiej | w etapie 4–5: napastnik zmienia wektor na najsłabszy |
| Koszty skutków to rząd wielkości | wyniki finansowe są ilustracją, nie wyceną | konsultacja z ubezpieczycielem / raportami szkód; zawsze pokazywać przedziały |
| Jedno tempo triage (15 min/alert) | brak różnicy L1/L2, brak jakości alertów | typy alertów (szum / sygnał) i jakość reguł |
| Skuteczność utrzymania liczona globalnie | niedobór godzin osłabia wszystkie kontrole równo | priorytety utrzymania wybierane przez gracza |
| MDR zawsze „jakość 1" | MDR jest idealny | jakość dostawcy MDR jako ukryta cecha (i dostawca w rejestrze!) |
| Brak modelu kosztu tarcia w pieniądzach | tarcie nie boli w wynikach | produktywność −x% przy tarciu > 50 |
| Prototyp nie ma mgły wojny | wszystko wie | mgła jest w projekcie silnika (`03-…`), nie w proto — trzeba ją zbudować i przetestować osobno |
| Scenariusze dzielone na „dobra/zła" opcja | bywa szkolne | dodać więcej opcji ⚠️ z prawdziwymi kompromisami; rubryki z ekspertem |

## 14.4. Ryzyka projektu

| Ryzyko | Prawdopodobieństwo | Wpływ | Jak ograniczyć |
|---|---|---|---|
| **Treść jest droższa niż kod** (karty, scenariusze, rubryki) | wysokie | wysoki | szablony, generowanie wariantów, gra papierowa przed kodem, kolejność kampanii |
| **Prawo się zmienia** (rozporządzenia wykonawcze do KSC dopiero wychodzą; TK w sprawie DWR) | wysokie | średni | fakty prawne w jednym pliku (`02-…`) ze statusem; przegląd co kwartał |
| **Gracze biorą liczby z gry za poradę** | średnie | wysoki | stopka „to nie porada", przedziały zamiast liczb, debrief odsyła do źródeł |
| **Za trudne dla biura** (15 osób bez IT) | średnie | wysoki | samouczek, dwa poziomy języka, tryb „podpowiedzi", krótsze kampanie |
| **Za proste dla specjalistów** | średnie | średni | tryb ekspert (bez podpowiedzi, mgła gęstsza, kampanie zaawansowane) |
| **Nudne miesiące** między incydentami | średnie | wysoki | skrzynka decyzji z napięciem, fale świata, multiplayer, kompresja |
| **Strach zamiast sprawczości** | średnie | średni | każdy scenariusz ma ścieżkę „udaremnione" dla przygotowanych (S01, S03, S05, S07, S08) |
| **Etyka realnych incydentów** | niskie | wysoki | firmy fikcyjne; realne tylko w debriefie, ze źródłem, bez przypisywania winy |
| **Bezpieczeństwo samej gry** | niskie, jeśli zrobione dobrze | bardzo wysoki (kompromitacja) | `12-…`, 12.4; przegląd bezpieczeństwa przed premierą |

## 14.5. Ryzyka dydaktyczne (gra może nauczyć czegoś złego)

- **„Papier nic nie daje" → „po co zgodność"**. Gra musi pokazać, że dokumenty są wymagane
  i że dobre (żywe) polityki prowadzą do lepszych decyzji — dlatego audyt (S12) i adopcja.
- **Opcja zapłaty okupu** istnieje, bo istnieje w życiu. Debrief zawsze wyjaśnia, dlaczego
  zwykle jest złym wyborem — ale gra nie moralizuje w trakcie.
- **„Bezpieczeństwo = narzędzia"** — przeciwdziała temu waluta godzin i polityki.
- **„Bezpieczeństwo = dział IT"** — przeciwdziała temu zarząd, mandat, kierownik podmiotu
  i decyzje biznesowe w scenariuszach.
- **Obwinianie ludzi** — każdy scenariusz z błędem ludzkim ma kartę „kara czy wsparcie" i
  pokazuje skutki dla zgłaszania.

## 14.6. Co uważam za najmocniejsze w projekcie

1. **Kalendarz kampanii = prawdziwy kalendarz KSC** (kwiecień 2026 → audyt kwiecień 2028).
   Gra jest aktualna dziś i będzie przez najbliższe 2 lata.
2. **Godziny jako waluta** — najbardziej realistyczny element; nikt w grach o bezpieczeństwie
   tego dobrze nie pokazuje.
3. **Jakość decyzji vs wynik** — odróżnia tę grę od „klikania w pudełka".
4. **Łańcuch dostaw z obu stron** (S04 klient, S05 dostawca).
5. **Polskie, konkretne mechanizmy** (S46, CSIRT-y sektorowe, biała lista VAT, KSeF, moje.cert.pl,
   Pzp, limit kar UODO dla JSFP, zastrzeżenie PESEL, sygnaliści) — nie da się tego mieć w
   zagranicznej grze.
6. **Prototyp jako narzędzie projektowe** — już wyłapał nierealistyczną kalibrację (pierwsza
   wersja: 19 poważnych incydentów na 2 lata) i pokazał strategię dominującą.

## 14.7. Pytania do właściciela — odpowiedzi z 13.10.2026

| Pytanie | Decyzja |
|---|---|
| Dla kogo najpierw | **biuro** |
| Pierwsza kampania | **wodociągi** (`16-…`) |
| Weryfikacja merytoryczna | **ocenę zrobi CISO** |
| Rytm | **własne tempo gracza**, bez limitu „jeden ruch dziennie”; gracz sam zamyka okres |
| Nowe wymaganie | na koniec okresu **raporty innych działów**; algorytmy „półinteligentne”, które uczą się na aktualnym problemie firmy (`15-…`) |

Pozostałe pytania (nazwa, multiplayer od początku, hosting, nazwy produktów, realne incydenty
w debriefie, szkolenie kierownika) są nadal otwarte — poniżej w pierwotnym brzmieniu.

### Pierwotne pytania

1. **Dla kogo przede wszystkim?** Biuro (15 osób, krótkie sesje, multiplayer) czy szkolenia
   zarządów (tryb prowadzący, 60–90 min)? Rekomendacja: **biuro najpierw** (macie graczy
   i doświadczenie z Snakes), tryb prowadzący jako drugi.
2. **Pierwsza kampania po samouczku?** Rekomendacja: **wodociągi** — mała firma (łatwa do
   ogarnięcia), podmiot kluczowy (cały KSC), OT (atrakcyjne), realna inspiracja (2025),
   własny CSIRT sektorowy. Alternatywa: gmina (bliżej życia większości ludzi).
3. **Rytm**: jedna tura dziennie (jak Snakes) czy sesje po kilka tur?
4. **Multiplayer od początku** czy najpierw gra solo?
5. **Nazwa**: „Linia Obrony" (robocza) — zostaje?
6. **Weryfikacja prawna**: czy jest ktoś (prawnik/CISO), kto przejrzy `02-…` i rubryki?
7. **Szkolenie kierownika podmiotu**: czy chcemy, żeby gra mogła być elementem takiego
   szkolenia? To wymaga sprawdzenia, czego ustawa/rozporządzenia oczekują od treści szkolenia.
8. **Hosting**: ten sam VPS co Snakes (osobny proces i port)? Domena?
9. **Poziom techniczny**: czy w dymkach podajemy przykładowe nazwy produktów (np. Wazuh,
   Microsoft Defender, CrowdStrike), czy tylko kategorie?
10. **Realne incydenty w debriefie** z nazwami instytucji (jak w `02-…`) — zgoda?

## 14.8. Wnioski z drugiej iteracji (działy, reżyser, kampania „Wodnik”)

1. **Poprawka faktograficzna**: wodociągi z 64 osobami to wg reguł NIS2 podmiot **ważny**, nie
   kluczowy (w v0.1 było źle). Wyszło dopiero przy rozpisywaniu kampanii — dobry argument, żeby
   CISO przejrzał statusy wszystkich firm z `09-…` (szpital i elektrociepłownia jako duże —
   kluczowe; gmina — do ustalenia).
2. **Działy dają emergentną dynamikę bez skryptu** (`16-…`, 16.5): gracz odmawiający traci zaufanie
   działów do zera w rok; gracz bierny ma ~21 obejść i przeciwnika, który sam znajduje słabe
   miejsca. To lekcja E9, której nie dało się pokazać statyczną firmą.
3. **Pierwszy model nagradzał „odmawiaj i karz”** (najniższe straty). Brakowało dwóch realnych
   kosztów: politycznego (kierownik działu idzie do prezesa) i ukrywania się działów, które boją
   się kary. Po dodaniu „odmawiający” ma podobne straty, ale mandat 16 (blisko odwołania).
4. **Przeciwnik adaptacyjny rozbraja strategię dominującą** z 14.2: przy bierności próby
   przesuwają się na usługi wystawione (×2) i dostawców (×1,9).
5. **Uczciwość reżysera wymaga pilnowania kolejności**: S03 mógł wypaść w miesiącu ostrzeżenia,
   bez szansy na reakcję — okno przesunięte. Zasada do walidatora kampanii: test obciążeniowy
   nie może wypaść przed swoim sygnałem.
6. **W małym podmiocie komunalnym pieniądze nie uzasadniają bezpieczeństwa** (Monte Carlo „nic”
   jest najtańsze w złotówkach). Gra musi pokazywać stawkę niefinansową — i to też jest realny
   powód niedoinwestowania małych wodociągów.
7. **Automat „rozsądny” przekracza budżet** — potrzebna podpowiedź priorytetów i twardszy budżet.
   (Zrobione w trzeciej iteracji — 14.8a.)

## 14.8a. Wnioski z trzeciej iteracji (przypadki brzegowe)

Szczegóły: `17-przypadki-brzegowe.md`. Dziesięć automatów z celowo głupimi albo cwanymi
strategiami znalazło 20 absurdów; najważniejsze:
1. **Gra była do oszukania bez wiedzy o cyberbezpieczeństwie**: „zawsze odpowiedź a)" dawało
   82% jakości decyzji (dobra opcja stała pierwsza), a bezczynność — 100% (oceniano tylko podjęte
   decyzje). Teraz opcje są tasowane, a brak decyzji jest oceniany.
2. **Liczby nie miały sufitów**: ryzyko insidera ×23 z powtórek tych samych próśb działów,
   80 h pracy w miesiącu mającym 40 h, wydatki 7× budżet. Teraz rejestr ryzyk, limit nadgodzin,
   twardy budżet.
3. **Wynik nagradzał złe zachowania**: potakiwacz miał najwyższy mandat, odmawiający wszystkiego
   — lepszy wynik niż rozsądny, kłamstwa w ankiecie ubezpieczyciela były darmowe, a im więcej
   gracz wykrywał, tym więcej płacił z budżetu. Teraz wynik to Indeks Odporności (z kosztem
   blokowania biznesu), kłamstwo ma skutki, reagowanie idzie z rezerwy firmy.
4. **Mgła przeciekała**: karta „sygnał" była zawsze prawdziwa, a środek przedziału szacunku był
   prawdą. Teraz są fałszywe alarmy i stały błąd szacunku.
5. Po poprawkach ranking strategii jest sensowny: mądry 923 > rozsądny 864 > odmawiający 807 >
   … > odkładacz 479 > skąpiec 336 (odwołany w 18/20) > bierny 203. Uwaga na przesterowanie:
   pierwsza wersja twardego budżetu odwoływała „rozsądnego" w połowie przebiegów — dopiero
   wyłączenie kosztów reagowania z budżetu i liczenie abonamentów przy zakupie to naprawiło.

## 14.8b. Czwarta iteracja: dlaczego kłamstwo nic nie kosztowało

Pytanie właściciela: „jakim cudem kłamca ma tak wysoki indeks?". Szczegóły i tabela przyczyn:
`17-…`, 17.6. W skrócie: kary za kłamstwo trafiały w mandat, którego nie ma w wyniku; indeks
mierzył tylko zrealizowane straty (szczęście), więc ryzyko, które jeszcze nie wybuchło, było
darmowe; Jakość Decyzji nie miała wag; „uczciwa" ankieta też kupowała polisę; a EDR widział
wszystko, więc jedno narzędzie unieważniało dziesiątki złych zgód. Poprawki: sufity, ekspozycja,
wagi decyzji, martwe pola narzędzi, obejścia po odmowie, Wynik kampanii = ½ Indeks + ½ Jakość.

**Migawka Monte Carlo zmieniona świadomie** (martwe pola): firma produkcyjna, strategia
„mała firma", 200 przebiegów — straty 61,5 → 79,8 mln zł (+30%, głównie insider: EDR/MDR
przestały go „łapać"), wydatki 140,4 → 139,0 mln. Strategia „nic" bez zmian. Ranking
strategii Monte Carlo bez zmian; przewaga „małej firmy" nad „higieną" (znany problem z 14.2)
zmalała z 441 do 334 tys. zł kosztu całkowitego.

**Lekcja metodyczna:** pierwsza runda laboratorium (14.8a) sprawdzała, czy głupie strategie
dostają głupie wyniki — i dostawały. Nie sprawdzała, czy POJEDYNCZA zła decyzja w dobrej grze
jest widoczna. Kłamca grał jak rozsądny z dwoma kłamstwami — i tego nikt nie zobaczył, dopóki
właściciel nie zapytał. Następna strategia-prowokacja powinna być „rozsądny + jedna zła rzecz"
dla każdej kategorii decyzji.

## 14.9. Następne kroki (propozycja)

1. Ocena przez CISO: `02-…` (🟡), statusy firm w `09-…`, karty kampanii w `data/kampanie/wodociagi.js`.
2. Rozgrywka kampanii „Wodnik” w terminalu z 3–5 osobami z biura (`proto/kampania.js --zapis=…`).
3. Podpowiedź priorytetów dla żywego gracza (tryb łatwy) — reszta poprawek z 14.8 zrobiona (14.8a).
4. Szkielet aplikacji z logowaniem (`13-…`, etap C), z `proto/` przeniesionym do `lib/engine/`.
