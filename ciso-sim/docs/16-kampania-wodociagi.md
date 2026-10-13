# 16. Kampania „Woda z Rzecznowa" (PWiK „Wodnik")

Pierwsza kampania gry (decyzja właściciela, 13.10.2026). **Grywalna w terminalu**:

```bash
node ciso-sim/proto/kampania.js --zapis=moja-gra.json      # własne tempo; q = zapisz i wyjdź
node ciso-sim/proto/kampania.js --auto=rozsadny --szczegoly  # podgląd: co robią działy i reżyser
node ciso-sim/proto/porownaj-style.js                       # 3 style gry × 20 ziaren
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
| 23–24 | II–III 2028 | **Kontrola / audyt** (10 obszarów, liczone z rejestru) | dowody zamiast deklaracji | audyt KSC |

Poza osią reżyser dobiera karty z katalogu (inwentaryzacja, MFA, procedura płatności, kopie
konfiguracji SCADA, plan IR i praca ręczna, MSP, EDR, segmentacja, łatki, program świadomości,
szkolenie kierownika, SZBI, polityka zakupów, ubezpieczenie, telefon „od integratora" po hasło)
— według aktualnego problemu firmy i tego, czego gracz jeszcze nie opanował.

**Poprawka po pierwszych przebiegach:** S03 mógł wypaść w tym samym miesiącu co ostrzeżenie
CERT, czyli bez uczciwej szansy na reakcję (łamało to filar „żadnych gotcha", `01-…`). Okno
przesunięte na m. 3–5.

## 16.4. Jak wygląda miesiąc

1. **Nagłówek**: budżet roku (wydane / przyznane), Twoje godziny, mandat, reputacja, morale.
2. **Briefing**: pilne incydenty, terminy na koniec miesiąca, raport IT z poprzedniego miesiąca
   (wdrożenia, wykrycia, „nie nadążamy z alertami", projekty w toku).
3. **Raporty działów** (`r`): wskaźnik działu, co zrobili, co planują (jeśli Ci ufają), jak
   widzą bezpieczeństwo; przy wysokim zaufaniu — przyznanie się do obejść.
4. **Karty** (`k`): pytania działów, karty reżysera, odkrycia (inwentaryzacja znalazła
   obejście), sygnały od ludzi (jedyny wczesny ślad intruza bez narzędzi).
5. **Zlecenia** (`z`): cały katalog kontroli z kosztami i pułapką.
6. **Co wiemy** (`s`): ewidencja vs szacunek prawdziwej liczby zasobów (przedział zawęża się
   po inwentaryzacji), działające zabezpieczenia, status KSC.
7. **Zamknij miesiąc** (`n`), kiedy chcesz. Nierozpatrzone pytania działów = „odłóż".

## 16.5. Co pokazało 20 przebiegów na styl gry (`proto/wyniki-kampania-wodociagi-2026-10-13.txt`)

| Styl | Straty | Wydatki | Audyt /60 | Zaufanie działów | Ukryte obejścia | Zakłócenia wody | Reputacja | Mandat | Poważny incydent | Jakość decyzji |
|---|---|---|---|---|---|---|---|---|---|---|
| **rozsądny** („tak, ale bezpiecznie", dobre opcje) | 89 tys. | 758 tys. | 60 | **0,83** | 0,0 | 0,1 | 62 | 41 | 20% | 100% |
| **odmawiający** (odmowa + kara za obejścia) | 87 tys. | 661 tys. | 60 | **0,03** | 0,8 | 0,0 | 62 | **16** | 10% | 57% |
| **bierny** (tylko obowiązkowe, najgorsze opcje) | **1,62 mln** | 46 tys. | **10** | 0,32 | **21,4** | **3,7** | **7** | 19 | 100% | 9% |

Wnioski:
1. **Bierność to katastrofa, ale nie z powodu „hakerów z filmów".** Ponad 21 obejść działów
   (modemy 4G, dostęp integratora, kamery, czaty AI, wspólne konta), dziesiątki urządzeń poza
   ewidencją, przeciwnik, który po kilku miesiącach przesuwa próby na usługi wystawione
   (waga ×2) i dostawców (×1,9). Sama „tło-statystyka" silnika tego nie pokazywała — dopiero
   działy i reżyser.
2. **Odmawianie wszystkiego daje podobne bezpieczeństwo krótkoterminowo, ale kosztuje
   politycznie**: zaufanie działów spada do zera w ~rok, mandat do 16 (blisko odwołania).
   Pierwsza wersja modelu tego nie widziała — „odmawiający" wychodził *lepiej* niż „rozsądny".
   Poprawka: blokowanie biznesu kosztuje mandat (kierownik idzie do prezesa), a dział, który
   boi się kary, ukrywa się lepiej. To jest realna dynamika i lekcja E9.
3. **„Rozsądny" przekracza budżet** (758 tys. zł przy ok. 530 tys. przyznanych w 3 latach
   budżetowych) — automat nie umie priorytetyzować. Żywy gracz musi wybierać; to jest
   najważniejsza umiejętność, której gra ma uczyć, i wymaga lepszej podpowiedzi „co najpierw".
4. **W małej spółce wodnej rachunek w złotówkach nie przemawia za bezpieczeństwem.**
   Monte Carlo samego tła daje dla strategii „nic" ok. 275 tys. zł kosztów, mniej niż jakikolwiek
   program ochrony. To prawdziwy problem małych przedsiębiorstw komunalnych (i powód, dla
   którego realnie się nie zabezpieczają). Prawdziwa stawka jest gdzie indziej: **woda dla
   30 tys. ludzi, obowiązek prawny, odpowiedzialność kierownika, zaufanie mieszkańców i ogon
   ryzyka**. Dlatego raport końcowy stawia obok pieniędzy: zakłócenia procesu, wynik kontroli,
   reputację i mandat — i dlatego Indeks Odporności (`11-…`) waży skutki niefinansowe.

## 16.6. Co dalej w tej kampanii (kolejka)

- Podpowiedź priorytetów („trzy najtańsze ruchy na Twój największy problem") — tryb łatwy.
- Budżet jako twarde ograniczenie zakupów (dziś: tylko kara mandatowa za przekroczenie).
- Raport kwartalny dla zarządu (`03-…`, 3.8) — dziś tylko karta budżetowa.
- S11 i S12 jako pełne scenariusze danych (dziś: karta „Wykaz" i kontrola liczona z rejestru).
- Oczyszczalnia Lipno jako druga sieć OT z własnym działem po przejęciu.
- Debrief miesiąca: „co reżyser wybrał i dlaczego" w języku gracza (dziś tylko `d` — dziennik).
- Druga kampania: gmina albo szpital (scenariusze S02, S04 już są).
