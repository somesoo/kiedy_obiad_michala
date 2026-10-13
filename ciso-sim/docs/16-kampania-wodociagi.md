# 16. Kampania „Woda z Rzecznowa" (PWiK „Wodnik")

Pierwsza kampania gry (decyzja właściciela, 13.10.2026). **Grywalna w terminalu**:

```bash
node ciso-sim/proto/kampania.js --zapis=moja-gra.json      # własne tempo; q = zapisz i wyjdź
node ciso-sim/proto/kampania.js --auto=madry --szczegoly     # podgląd: co robią działy i reżyser
node ciso-sim/proto/porownaj-style.js                       # 4 style gry × 20 ziaren
```

Dane: `data/kampanie/wodociagi.js`. Wszystko fikcyjne (spółka, gmina Rzecznów, Lipno, ludzie,
integrator „AquaSter").

## 16.1. Sytuacja na start (kwiecień 2026)

PWiK „Wodnik" sp. z o.o.: 64 osoby, woda dla 30 tys. mieszkańców, stacja uzdatniania,
dwie hydrofornie, 11 przepompowni ścieków. Właściciel: gmina. Gracz: **informatyk na pół
etatu**, któremu prezes po raporcie ABW (2025) powierza „ten NIS2" — 40 h miesięcznie na
bezpieczeństwo, budżet 90 tys. zł do końca 2026 r.

**Status w KSC — pierwsza decyzja gry i pierwsza poprawka projektu.** W wersji 0.1 dokumentów
wodociągi były „kluczowe". Przy rozpisywaniu kampanii okazało się, że to błąd w świetle reguł
NIS2: 64 osoby to **średnie** przedsiębiorstwo, a średnie w sektorze z załącznika I to co do
zasady **podmiot ważny** (kluczowy byłby jako duży albo dawny operator usługi kluczowej —
🟡 do potwierdzenia w ustawie). Poprawione w `data/firmy.js` i tu. Skutki dla kampanii:
obowiązki zgłaszania i SZBI są te same, ale nadzór jest „po fakcie", a **audyt przychodzi na
żądanie organu po poważnym incydencie** — finał kampanii (A_kontrola) jest kontrolą, której
wynik zależy od tego, co gracz robił przez 2 lata.

## 16.2. Ludzie i działy (agenci — `docs/15-…`)

| Dział | Szef | Czego chce | Startowe zaufanie | Typowe inicjatywy |
|---|---|---|---|---|
| Zarząd | Prezes Tadeusz Wrona | spokój, reputacja, koszt | 0,50 | tania kamera, czat AI |
| Finanse | Halina Sosnowska (gł. księgowa) | koszt, terminy | 0,40 | zmiana banku, praca zdalna, czat AI |
| Stacja Uzdatniania | Marek Lis (kierownik) | ciągłość, wygoda | 0,25 | **stały dostęp integratora**, pendrive od integratora |
| Sieć i Kanalizacja | Zbigniew Kruk | ciągłość, „widzieć na telefonie" | 0,35 | **modemy 4G z publicznym IP**, wspólne konto sezonowych |
| BOK i Rozliczenia | Agnieszka Mróz | klienci, nowinki | 0,45 | **e-BOK w chmurze**, czat AI, laptopy z marketu |
| Kadry | Ewa Wilk | terminy, przepisy | 0,50 | konto wspólne, laptopy, czat AI |

Obciążenie działów zależy od pory roku (upały: stacja i sieć; styczeń–marzec: finanse;
okresy rozliczeń: BOK; maj–czerwiec: kadry i sezonowi) i rośnie po incydentach. Wysokie
obciążenie = więcej inicjatyw i większa pokusa skrótów.

## 16.3. Oś kampanii

| Mies. | Kalendarz | Zdarzenie (okno) | Lekcja | Inspiracja |
|---|---|---|---|---|
| 1 | IV 2026 | **Czy podlegamy KSC?** (obow.) | samoidentyfikacja, status ważny | nowelizacja KSC 3.04.2026 |
| 2 | V 2026 | **Ostrzeżenie CERT/CSIRT**: haktywiści szukają paneli HMI (obow.) | sygnał → działanie tego samego dnia | ostrzeżenia dla sektora wodnego 2025 |
| 3–5 | VI–VIII | **S03 „Pompa na maksimum"** — wariant „próba", jeśli panel zamknięty | ekspozycja, proces najpierw, komunikacja | raport ABW o 5 stacjach (2025) |
| 3–6 | | **S01 „Faktura z nowym numerem"** — dostawca chemii, 92 300 zł | procedura płatności, bank w godzinach | wzorzec BEC |
| 7 | X 2026 | **Wykaz** (jeśli brak wpisu) | spóźniony wpis lepszy niż żaden | termin 3.10.2026 |
| 8 | XI | **Budżet 2027** (obow.) | ryzyko w złotówkach → lepsza decyzja zarządu | |
| 9 | XII | **Przejęcie oczyszczalni Lipno** (obow.) | due diligence przed połączeniem sieci | wzorzec M&A |
| 12 | III 2027 | **Odnowienie umowy z integratorem** (obow.) | klauzule bezpieczeństwa | |
| 13 | IV 2027 | **Termin SZBI** (3.04.2027) | | KSC |
| 14 | V | Postępowanie wobec producenta routerów (30%) | inwentaryzacja jako warunek | mechanizm DWR |
| 15–16 | | **Inteligentne wodomierze** (obow.) | dane godzinowe = dane osobowe; ocena dostawcy | |
| 15–20 | | **Druga fala haktywistów** | segmentacja, odcięcie HMI, BCP | |
| 17 | VIII | **Kierownik stacji na emeryturę** (obow.) | ryzyko jednej osoby, zmiana haseł | |
| 19–21 | | **Fałszywy komunikat „woda skażona"** | dementi w 30 minut | dezinformacja (PAP 2024) |
| 21–22 | XII 2027–I 2028 | **Za dwa miesiące audyt** (obserwacja obow.) — ruchy: plan naprawczy, sprint dowodów albo dokumenty z datą wsteczną | uczciwy plan wygrywa z fałszywką | |
| 23–24 | II–III 2028 | **Audyt zamykający** (🔵 zleca rada nadzorcza; 10 obszarów; wykrywa kłamstwa, po pierwszym — rozszerzona próba) | dowody zamiast deklaracji | audyt KSC |

Wiersze „(obow.)" to dziś sprawy w skrzynce albo obserwacje — **nie podpowiadają ruchów**.
Wszystko inne (inwentaryzacja, MFA, procedura płatności, kopie konfiguracji SCADA, plan IR,
MSP, EDR, segmentacja, łatki, szkolenia, SZBI, rozpoznanie, odcięcie panelu…) gracz robi sam,
kiedy chce, z katalogu ruchów (`18-…`). Reżyser dobiera tylko **obserwacje** (co mówią ludzie:
księgowa o rachunkach, kierownik stacji o kopiach u integratora, ostrzeżenie CERT) według
aktualnego problemu firmy i tego, czego gracz jeszcze nie opanował.

**Fakty świata** (prawda losowana na starcie, odkrywana ruchami — `wodociagi.js`, `fakty`):
panel HMI stacji widoczny z internetu (pilne; odkrywa go skan ekspozycji albo moje.cert.pl),
narzędzie zdalne integratora ze stałym hasłem, domyślny PIN sterowników (inwentaryzacja,
obchód OT), kopia konfiguracji SCADA tylko na laptopie integratora, intruz w sieci oczyszczalni
(60% — wychodzi przy przeglądzie przed połączeniem). Zamknięty panel HMI zamienia S03 w próbę
w logach; procedura płatności udaremnia S01.

**Poprawka po pierwszych przebiegach:** S03 mógł wypaść w tym samym miesiącu co ostrzeżenie
CERT, czyli bez uczciwej szansy na reakcję (łamało to filar „żadnych gotcha", `01-…`). Okno
przesunięte na m. 3–5.

## 16.4. Jak wygląda miesiąc

Bez kolejności i bez limitu ruchów — tylko godziny gracza (40 h + do 50% nadgodzin) i budżet
roku (komendy: `18-…`, 18.9).

1. **Nagłówek i briefing** (`b`): budżet roku, godziny, mandat, reputacja, morale; obserwacje
   miesiąca; raport IT (wdrożenia, awarie, wykrycia, „bez Twojego udziału"); wynik incydentu.
2. **Raporty działów** (`r`): co zrobili, co planują (jeśli Ci ufają), jak widzą bezpieczeństwo.
3. **Skrzynka spraw** (`s`, `a`): prośby działów (zgoda / warunki z listy / alternatywa /
   odmowa / odłóż), odkryte obejścia, sygnały od ludzi, sprawy kampanii — każda z terminem
   i rozstrzygnięciem domyślnym.
4. **Ruchy** (`m`, `x`): wdrożenia z parametrami, pilotaże, przeglądy, testy, naprawy, zmiany,
   wycofania; rozpoznanie, OT, ludzie, zarząd, prawo, audyt.
5. **Moje wdrożenia** (`o`) i **co wiemy** (`w`): przedział skuteczności, znane usterki, zasoby
   (ewidencja vs szacunek), fakty, luki.
6. **Incydent** (`i`): akcje w dowolnej kolejności, czekanie, koniec fazy ostrej.
7. **Zamknij miesiąc** (`n`), kiedy chcesz.

## 16.5. Co pokazało 20 przebiegów na styl gry (`proto/wyniki-kampania-wodociagi-2026-10-13.txt`)

Stan po silniku ruchów (`18-…`): pełna dowolność ruchów, ocena praktyki zasadami, audyt
zamykający z dowodami.

| Styl | Straty | Wydatki | Audyt /60 | Zaufanie działów | Ukryte obejścia | Zakłócenia wody | Reputacja | Mandat | Poważny incydent | Praktyka | Indeks | **Wynik** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **mądry** (rozpoznanie, „tanie i ważne", pilotaże, testy, warunki) | **230 tys.** | 493 tys. | **59** | **0,84** | 0,1 | 0,1 | 59 | **67** | 35% | 95% | **933** | **941** |
| odmawiający (mądre ruchy, odmowa + kara za obejścia) | 315 tys. | 475 tys. | 58 | **0,01** | 2,3 | 0,2 | 58 | 35 | 50% | 72% | 824 | 774 |
| rozsądny laik (wdraża to, o czym słyszy, domyślnie) | 557 tys. | 356 tys. | 39 | 0,44 | 16,3 | 1,6 | 45 | 27 | 95% | 52% | 622 | 573 |
| bierny (nic; sprawy same, incydenty bez niego) | **1,77 mln** | 14 tys. | **10** | 0,35 | 13,8 | **3,3** | **17** | **0** | 100% | 0% | 129 | 65 |

Wynik kampanii = ½ Indeks + ½ Jakość praktyki, z sufitami (`11-…`). Pozostałe strategie
(potakiwacz, kłamca, skąpiec, pracoholik, fuzzer…) — `18-…`, 18.10; ile kosztuje pojedyncze
odstępstwo — `17-…`, 17.8.

**Co się zmieniło względem kart.** Rozsądny laik spadł z 882 na 573: dawniej dostawał „dobre
opcje" z kart, teraz sam musi wiedzieć, że trzeba zrobić rozpoznanie, pilotaż i test kopii.
Wdraża dużo i z dobrymi intencjami, ale EDR na OT bez pilotażu wywołuje awarie, kopie nigdy nie
są sprawdzone, a „tak, ale" z każdym warunkiem zniechęca działy (16 ukrytych obejść). Między
dobrym CISO a laikiem jest teraz prawdziwa przepaść — i o to chodziło.

Wnioski:
1. **Bierność to katastrofa, ale nie z powodu „hakerów z filmów".** Kilkanaście obejść działów
   (modemy 4G, dostęp integratora, kamery, czaty AI, wspólne konta), dziesiątki urządzeń poza
   ewidencją, przeciwnik, który po kilku miesiącach przesuwa próby na usługi wystawione
   (waga ×2) i dostawców (×1,9). Sama „tło-statystyka" silnika tego nie pokazywała — dopiero
   działy i reżyser.
2. **Odmawianie wszystkiego daje podobne bezpieczeństwo krótkoterminowo, ale kosztuje
   politycznie**: zaufanie działów spada do zera w ~rok, mandat do ok. 30 (z 50 na starcie).
   Pierwsza wersja modelu tego nie widziała — „odmawiający" wychodził *lepiej* niż „rozsądny".
   Poprawka: blokowanie biznesu kosztuje mandat (kierownik idzie do prezesa), a dział, który
   boi się kary, ukrywa się lepiej. To jest realna dynamika i lekcja E9.
3. **Budżet jest twardy, więc wygrywa kolejność zakupów.** Pierwsza wersja pozwalała
   „rozsądnemu" wydać 758 tys. zł przy ok. 530 tys. przyznanych. Teraz zakup przechodzi tylko
   w ramach budżetu roku (+10%, z abonamentem do grudnia), a „mądry" — te same odpowiedzi, ale
   podstawy kupowane w kolejności „tanie i ważne najpierw" — ma ponad dwa razy mniejsze straty
   i lepszy audyt. Bierny traci mandat do zera (odwołanie). To jest umiejętność, której gra ma
   uczyć: priorytety przy ograniczonym budżecie.
4. **W małej spółce wodnej rachunek w złotówkach nie przemawia za bezpieczeństwem.**
   Monte Carlo samego tła daje dla strategii „nic" ok. 275 tys. zł kosztów, mniej niż jakikolwiek
   program ochrony. To prawdziwy problem małych przedsiębiorstw komunalnych (i powód, dla
   którego realnie się nie zabezpieczają). Prawdziwa stawka jest gdzie indziej: **woda dla
   30 tys. ludzi, obowiązek prawny, odpowiedzialność kierownika, zaufanie mieszkańców i ogon
   ryzyka**. Dlatego raport końcowy stawia obok pieniędzy: zakłócenia procesu, wynik kontroli,
   reputację i mandat — i dlatego Indeks Odporności (`11-…`) waży skutki niefinansowe.

## 16.6. Co dalej w tej kampanii (kolejka)

- Podpowiedź priorytetów („trzy najtańsze ruchy na Twój największy problem") — tryb łatwy.
- Raport kwartalny dla zarządu (`03-…`, 3.8) — dziś kwartalna ocena liczona automatycznie, bez karty dla gracza.
- S11 i S12 jako pełne scenariusze danych (dziś: karta „Wykaz" i kontrola liczona z rejestru).
- Oczyszczalnia Lipno jako druga sieć OT z własnym działem po przejęciu.
- Debrief miesiąca: „co reżyser wybrał i dlaczego" w języku gracza (dziś tylko `d` — dziennik).
- Druga kampania: gmina albo szpital (scenariusze S02, S04 już są).
