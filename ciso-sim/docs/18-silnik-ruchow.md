# 18. Silnik ruchów — gra bez quizu

Stan: 13.10.2026. Decyzja właściciela: „gra nie może być w żadnym stopniu quizem. Gracz ma
pełną dowolność, co i jak robi i w jakiej kolejności; w każdym momencie może zagrać każdy
ruch; to, co zrobił, może potem przejrzeć, przetestować i wycofać; wszystko ma zależności
z resztą wskaźników i akcji".

Ten dokument zastępuje model kart z odpowiedziami a/b/c (`15-…`, `16-…`, `17-…` opisują jego
historię). Kod: `proto/ruchy.js`, `proto/sprawy.js`, `proto/incydent.js`, `proto/zasady.js`,
`proto/kampania.js`.

## 18.1. Co było quizem i dlaczego to źle

| Element | Jak działał | Dlaczego to quiz |
|---|---|---|
| Karty katalogowe („Antywirus czy EDR?") | 2–4 gotowe odpowiedzi, każda z oceną dobra/dopuszczalna/błąd | gracz zgaduje, co myśli autor; ruch istnieje tylko wtedy, gdy reżyser pokaże kartę |
| Zakup z listy (`z`) | jedyny „wolny" ruch — bez parametrów, bez skutków ubocznych | wdrożenie = przycisk; nie ma „jak", nie ma pilotażu, nie ma pomyłki we wdrożeniu |
| Scenariusze S01/S03 | drzewo faz, w każdej 2–3 opcje | kolejność narzucona; nie da się zrobić dwóch rzeczy naraz ani wrócić |
| Jakość Decyzji | odsetek opcji z etykietą „dobra" | ocenia dopasowanie do klucza, a nie praktykę |

## 18.2. Zasady nowego silnika

1. **Każdy ruch jest dostępny zawsze**, o ile pozwalają na to zasoby i fizyka świata. Jeśli nie
   pozwalają, gra mówi DLACZEGO („EDR wymaga…", „nie wiesz jeszcze, że panel jest w internecie",
   „brak 12 h w tym miesiącu"). Nie ma ruchów, które „pojawiają się", bo reżyser tak chciał.
2. **Nie ma opcji z etykietą.** Ruchy mają parametry (zakres, tryb, sposób), a skutki wynikają
   z modelu. Dobrą praktykę oceniają **zasady** sprawdzane na historii ruchów (18.7) — tak jak
   audytor albo doświadczony CISO patrzy na to, co zrobiono, a nie na to, co zaznaczono.
3. **Zmiana ma cykl życia**: projekt → (pilotaż) → działa → przegląd / test / naprawa / zmiana
   parametrów → wycofanie. Każdy etap kosztuje i każdy coś odsłania.
4. **Prawda jest ukryta, wiedzę się zdobywa.** Wdrożona kontrola ma prawdziwą jakość i ukryte
   usterki (kopia, która się nie odtwarza; EDR wyłączony na „wolnym" serwerze). Gracz widzi je
   dopiero po przeglądzie albo teście — albo po incydencie.
5. **Świat ma fakty, które się odkrywa** (panel HMI w internecie, narzędzie zdalne integratora,
   PIN domyślny). Część ruchów wymaga wiedzy o fakcie (nie zamkniesz drzwi, o których nie wiesz).
6. **Sprawy zamiast kart.** Działy, zarząd, dostawcy i świat przynoszą sprawy z terminem.
   Odpowiedź to czasownik z parametrami (np. „tak, ale" z WYBRANYMI warunkami), a sprawa, której
   nie ruszysz, rozstrzyga się sama w terminie — według stanu firmy.
7. **Incydent to czas, nie drzewo.** Zegar, stan, akcje w dowolnej kolejności, dynamika
   (pieniądze odpływają, film się rozchodzi, terminy biegną).
8. **Zapis = lista ruchów**, odtworzenie z ziarna (jak dotąd). Każdy ruch przechodzi przez jeden
   dyspozytor `wykonaj(k, akcja)`.

## 18.3. Obiekty: co gracz zmienił w firmie

`k.obiekty[id kontroli]` — jedna instancja na kontrolę z katalogu (`data/kontrole.js`):

| Pole | Znaczenie | Gracz widzi? |
|---|---|---|
| `stan` | `projekt` · `dziala` · `wycofany` | tak |
| `param` | wybrane parametry (zakres, tryb, sposób…) | tak |
| `jakosc` | 0–1, prawdziwa skuteczność wdrożenia (sposób, pilotaż, dryf) | **nie** — tylko przedział, zawężany przeglądem/testem |
| `usterki` | ukryte wady wylosowane przy wdrożeniu | tylko te odkryte |
| `ostPrzeglad`, `ostTest` | miesiące — dowody dla audytu | tak |

Jakość trafia do silnika przez `st.konf[id]` (18.6): mnoży skuteczność, a usterki i parametry
zmieniają pokrycie konkretnych wektorów (MFA z wyjątkiem dla zarządu chroni gorzej przed BEC),
wykrywanie/utrudnianie (EDR w trybie „tylko wykrywaj") albo odtwarzanie (kopia, która się nie
odtwarza). **Dryf**: bez przeglądu jakość spada co miesiąc (konfiguracja się rozjeżdża, wyjątki
rosną) — narzędzie bez opieki staje się dekoracją.

## 18.4. Ruchy

Ruch = `{ id, param }`. Dostępność liczy `dostepny(k, ruch)` → `null` albo powód.

**Cykl życia kontroli** (dla każdej z ~40 kontroli z katalogu):

| Ruch | Co robi | Zależności |
|---|---|---|
| `wdroz:<id>` | zleca projekt z parametrami | budżet roku, godziny gracza, `wymaga` z katalogu (bez nich działa na 30%) |
| `pilotaz:<id>` | próba na jednej stacji (OT) | ujawnia niezgodność z SCADA przed wdrożeniem; bez pilotażu wdrożenie na OT może wywołać awarię procesu |
| `przeglad:<id>` | przegląd konfiguracji | zawęża wiedzę o jakości, znajduje część usterek, zeruje dryf; dowód dla audytu |
| `test:<id>` | test praktyczny (odtworzenie kopii, symulacja phishingu, ćwiczenie planu…) | znajduje usterki, których przegląd nie widzi; mocniejszy dowód |
| `napraw:<id>` | usuwa odkrytą usterkę | tylko odkryte usterki |
| `zmien:<id>` | zmienia parametry działającej kontroli | np. EDR: wykrywaj → blokuj; MFA: usunięcie wyjątku |
| `wycofaj:<id>` | wycofanie zmiany | abonament płaci się jeszcze miesiąc; koszty wdrożenia przepadają; znika tarcie |

**Ruchy spoza katalogu** (`data/ruchy.js`): rozpoznanie (skan ekspozycji, przegląd dostępów
zdalnych, polowanie na intruzów), działania OT (odcięcie panelu od internetu, zmiana PIN-ów,
usunięcie narzędzia zdalnego), ludzie (rozmowa z działem, szkolenie działu), zarząd (raport,
wniosek budżetowy, akceptacja ryzyka), obowiązki (analiza statusu KSC, wpis S46, szkolenie
kierownika), audyt (plan naprawczy, sprint dowodów) — **i ruchy nieuczciwe** (upiększony raport,
dokumenty z datą wsteczną). Nieuczciwość nie jest „złą odpowiedzią" w karcie; to ruch jak każdy
inny, z rejestrem kłamstw i skutkami (`17-…`, 17.7).

## 18.5. Sprawy

Skrzynka spraw: `k.sprawy` — każda ma źródło, termin, czasowniki i **rozstrzygnięcie domyślne**.

| Sprawa | Czasowniki (z parametrami) | Domyślnie w terminie |
|---|---|---|
| Prośba działu | `zgoda` · `warunki(lista)` · `alternatywa` · `odmowa` | odłożona (dział naciska, potem obchodzi) |
| Odkryte obejście | `legalizuj(warunki)` · `wylacz` · `ukarz` · `akceptuj_ryzyko` | zostaje, bez właściciela |
| Sygnał od ludzi | `zbadaj` · `zbadaj_zewnetrznie` · `przekaz_mdr` | nikt nie sprawdził |
| Oferta ubezpieczyciela | `ankieta(odpowiedzi pytanie po pytaniu)` · `odrzuc` | oferta wygasa |
| Budżet na rok | `wniosek(kwota, uzasadnienie)` | tyle co w tym roku |
| Przejęcie oczyszczalni | ruchy przeglądu/izolacji · `odloz_polaczenie` · `polacz` | sieci połączone |
| Umowa z integratorem | `negocjuj(klauzule)` · `przedluz` | przedłużona bez zmian |
| Wodomierze, emerytura kierownika, DWR | środki składane z listy | projekt rusza z pełnym ryzykiem |
| Telefon „integratora" w nocy | `podaj` · `oddzwon` · `odmow` | — (rozstrzyga operator: procedura i szkolenie decydują, czy w ogóle zadzwoni do Ciebie) |

Warunki „tak, ale" są **składane**: każda inicjatywa działu ma 2–4 środki (brama z MFA, osobne
konta, nagrywanie sesji, prywatny APN…), każdy z własnym kosztem i redukcją KONKRETNYCH
wektorów. Gracz wybiera zestaw; dział ocenia ciężar (więcej warunków = mniejsze zadowolenie).

**Obserwacje** (reżyser): to, co ludzie mówią i co widać (księgowa o rachunkach, kierownik
stacji o kopiach u integratora, ostrzeżenie CERT). Informacja, nie pytanie — czasem odsłania
fakt świata. Reżyser wybiera je według diagnozy aktualnego problemu (jak dotąd karty).

## 18.6. Silnik miesiąca — co się zmienia

`st.konf[id] = { jakosc, pokrycie: {wektor: 0..1}, utrudnia, wykrywa, odtwarzanie }` — mnożniki
skuteczności z obiektów. Brak `konf` = 1, więc Monte Carlo strategii liczy dokładnie tak jak
wcześniej (test migawki). `wycofaj(st, id)` i `st.wypowiedzenia` — abonament kończy się po
okresie wypowiedzenia. Fakty świata działają przez mnożniki wektorów (`k.fakty` → `modStale`).

## 18.7. Ocena: zasady zamiast klucza odpowiedzi

`proto/zasady.js` — każda zasada sprawdza historię ruchów i stan, np.:

- inwentaryzacja przed aktywnym skanem i przed wdrożeniami na OT,
- pilotaż przed wdrożeniem agenta/łatek na stacjach OT,
- test odtworzenia kopii w ciągu kwartału od wdrożenia i potem co pół roku,
- reakcja na ostrzeżenie dla sektora w ciągu miesiąca,
- prośby działów rozstrzygnięte przed terminem, odmowa tylko z alternatywą,
- odkryte obejście: legalizacja albo wyłączenie z rozmową, nie kara,
- każdy sygnał od ludzi sprawdzony,
- wyjątek tylko z akceptacją ryzyka przez zarząd,
- terminy ustawowe (wpis, SZBI, szkolenie kierownika),
- przegląd lub test każdej kluczowej kontroli co najmniej raz w roku,
- przegląd przejmowanej sieci przed połączeniem,
- uczciwość wobec ubezpieczyciela, audytora i zarządu (naruszenie = −1),
- w incydencie: zasady scenariusza (bank w 1 h, proces najpierw, prawda w komunikacie…).

**Jakość praktyki** = Σ waga × wynik / Σ waga (spełniona 1, naruszona 0, nieuczciwość −1).
Każda ocena ma moment i „dlaczego" — to idzie do debriefu i do modelu gracza (BKT reżysera).
Wynik kampanii = ½ Indeks Odporności + ½ Jakość praktyki, z sufitami (`11-…`).

Nie ma odpowiedzi „poprawnej". Są skutki (silnik) i praktyka (zasady). Dwie różne drogi mogą
dać ten sam wynik; ta sama decyzja w innej kolejności — inny.

## 18.8. Incydent bez drzewa

`proto/incydent.js` + `scenariusze/*.incydent.js`: `stan0`, zegary, **akcje** (każda: czas,
godziny, koszt, `wymaga(s)` → powód, `efekt(s)`), **dynamika(s, dt)** (co dzieje się z upływem
godzin), `wynik(s)` → skutki dla kampanii, zasady scenariusza, debrief. Gracz wykonuje akcje
w dowolnej kolejności, może czekać, zakończyć fazę ostrą albo dojść do limitu czasu. To, co
zrobił wcześniej w kampanii (kopie, procedury, segmentacja, plan), zmienia stan startowy.

## 18.8a. Słownik zależności (przykłady, które gra liczy)

| Jeśli… | …to |
|---|---|
| nie ma inwentaryzacji | kontrole „na zasobach" chronią tylko znane (jak dotąd); lista routerów dla DWR to 20 h zamiast 2 h |
| EDR na OT bez pilotażu i stacja jest niezgodna | awaria procesu (koszt, reputacja, zaufanie stacji); wycofanie zakresu OT ją kończy |
| kopia nigdy nie testowana | z szansą z katalogu nie odtworzy się, gdy będzie potrzebna |
| MFA z wyjątkiem dla zarządu bez akceptacji ryzyka | gorsze pokrycie BEC/poświadczeń i niezgodność na audycie |
| procedura płatności „zarządzeniem" | szybciej, ale dział obchodzi ją przy pilnych płatnościach (niższa jakość) |
| panel HMI nieodkryty | nie da się go odciąć — najpierw skan ekspozycji albo moje.cert.pl |
| procedura weryfikacji dostawców + szkolenie stacji | nocny telefon „integratora" kończy operator, bez Ciebie |
| ujawnione kłamstwo | współpraca: zarząd, działy, ubezpieczyciel, audytor (`17-…`, 17.7) |

## 18.9. Jak się w to gra (terminal, `proto/kampania.js`)

```bash
node ciso-sim/proto/kampania.js --zapis=moja.json     # gra; zapis po każdym ruchu, ponowne uruchomienie wczytuje
node ciso-sim/proto/rozegraj.js S03 --kontrole=bcp,backup --naprawione=hmi_wystawiony   # sam incydent „przy stole"
```

W miesiącu gracz robi, co chce i ile chce (do limitu godzin i budżetu roku), w dowolnej
kolejności; miesiąc zamyka sam (`n`).

| Komenda | Co |
|---|---|
| `b`, `r`, `w` | briefing (obserwacje, raport IT, wynik incydentu), raporty działów, co wiemy (zasoby, fakty, luki) |
| `m [kategoria\|szukaj]` | wszystkie ruchy — także niedostępne, z powodem („brak godzin…", „najpierw wdrożenie") |
| `x <ruch> k=v …` | ruch: `x wdroz:edr zakres=biuro_serwery tryb=wykrywaj`, `x test:backup`, `x zmien:edr tryb=blokuj`, `x wycofaj:edr`, `x rozmowa dzial=produkcja` |
| `o` | moje wdrożenia: stan, parametry, przedział skuteczności (zawęża go przegląd/test), znane usterki |
| `p` | doradztwo (18.13): cennik tematów dla tej firmy, zlecenia w toku, raporty z rekomendacjami; zlecenie: `x zlec_doradcy temat=ot firma=renomowana tryb=zwykly` |
| `s`, `a <nr> <czasownik> k=v …` | skrzynka spraw i odpowiedź: `a 1 warunki warunki=brama,konta` |
| `i` | incydent: numer/id akcji w dowolnej kolejności, `c <h>` czekaj, `k` koniec fazy ostrej |
| `d`, `q` | dziennik (prowadzący), zapisz i wyjdź |

## 18.10. Wyniki na nowym silniku (20 ziaren, `proto/wyniki-*-2026-10-13.txt`)

Stan po 18.12–18.13 (koordynacja projektów, decyzje cykliczne, doradztwo) i uogólnieniu automatów pod drugą kampanię (`19-…`).

| Strategia | Straty | Audyt /60 | Morale | Praktyka | Indeks | **Wynik** | Uwagi |
|---|---|---|---|---|---|---|---|
| mądry (rozpoznanie, „tanie i ważne", ≤ 3 projekty naraz, pilotaże, testy, decyzje cykliczne) | 193 tys. | 55 | 32 | 95% | 867 | **910** | |
| odmawiający (mądre ruchy, odmowa każdej prośbie) | 250 tys. | 55 | — | 76% | 777 | 767 | zaufanie działów 0,01 |
| pracoholik (przeglądy co miesiąc, polowanie, szkolenia) | 360 tys. | 54 | 16 | 69% | 734 | 711 | wypalenie |
| **laik z doradcą** (robi tylko to, co mówi raport doradcy) | 448 tys. | 43 | 52 | 54% | 706 | **624** | 18.13 |
| wszystko naraz (cały katalog w m. 1) | 952 tys. | 19 | 23 | 76% | 447 | 591 | 18.12 — z 16 zamówień działają 2–4 |
| skąpiec (tylko to, co nie kosztuje złotówek) | 665 tys. | 25 | 75 | 62% | 535 | 578 | |
| rozsądny laik (wdraża to, o czym słyszy, domyślnie) | 455 tys. | 38 | 75 | 50% | 592 | 547 | 17 ukrytych obejść, awarie OT, certyfikaty wygasają |
| paranoik | 494 tys. | 10 | 65 | 48% | 348 | 416 | |
| potakiwacz | 221 tys. | 37 | 50 | 66% | 330 | 330 | sufit w 20/20 |
| losowy (fuzzer) | 968 tys. | 18 | 46 | 24% | 348 | 306 | niezmienniki OK |
| kłamca | 169 tys. | 41 | 24 | 53% | 250 | **250** | odwołany w 18/20 |
| bierny / odkładacz | 1,70 mln | 10 | 72 | 0% | 131 | 66 | odwołany w 20/20 |

Cennik pojedynczych odstępstw w grze mądrego: `17-…`, 17.8–17.9.

## 18.11. Decyzje i świadome uproszczenia

- **Skąpiec wygrywa z rozsądnym laikiem** (578 vs 547). To nie błąd: procesy bez narzędzi
  (inwentaryzacja, procedura płatności, rozmowy, szkolenie kierownika) wygrywają z narzędziami
  bez procesu (EDR na OT bez pilotażu, kopie bez testów, „tak, ale" z każdym warunkiem). To jest
  lekcja, której gra ma uczyć.
- **S03 przygotowanego gracza to tylko próba** — odstępstwa w samym incydencie kosztują wtedy 0.
  W cenniku liczymy je u gracza bez rozpoznania (panel HMI otwarty → prawdziwy atak).
- **Szkolenie kierownika** kosztuje w cenniku ~0 — odpowiedzialność osobista kierownika nie jest
  modelowana (🔵 uproszczenie, `02-…`). Zasada je ocenia, wynik prawie nie.
- **Pół etatu nie udźwignie programu**: bez MSP z wymaganiami projekty stoją w kolejce do godzin
  zespołu. Mądry ma limit trzech projektów naraz — to realizm, nie podpowiedź.
- **Wypalenie** (morale < 25): limit godzin ×0,7 i słabsze wdrożenia (×0,85) — pracoholizm nie
  może być strategią dominującą.
- **Automaty widzą tylko to, co gracz** (`apiAuto`): fakty znane, wiedza o obiektach — nie prawdę.

## 18.12. Skończone zasoby: dlaczego „wszystko naraz" nie działa

Pytanie właściciela (13.10.2026): jak strategia „wszystko naraz" mogła mieć 780 punktów, skoro
zasoby są skończone, a decyzje przychodzą w każdym okresie?

**Co robiła.** W 1. miesiącu zamawiała cały katalog. Przechodziło to, na co starczyło budżetu
roku: 16 tanich kontroli za 61 tys. zł z 90 tys. Każde zamówienie kosztowało gracza tylko 2 h
planowania, a zespół wdrażał projekty po kolei przez 14 miesięcy. Model nie znał trzech rzeczy,
które w życiu zabijają taki plan — dlatego wynik był za dobry.

**Co doszło** (`proto/zasoby.js`):

1. **Koordynacja projektów w toku**: każdy projekt co miesiąc zjada **2 h gracza** (dostawca,
   harmonogram, odbiory, zmiany zakresu), zanim gracz zrobi cokolwiek nowego. 16 projektów to
   32 z 40 godzin — nie zostaje czasu na nic innego, a nadgodziny palą morale.
2. **Przełączanie kontekstu**: zespół, który ciągnie naraz więcej niż 3 wdrożenia, traci 8%
   godzin za każde ponad trzy (najwyżej 40%) — 🔵 uproszczenie reguły znanej z zarządzania
   projektami: równoległa praca nie skraca kolejki, tylko ją rozmywa. Nagłówek miesiąca pokazuje,
   ile czasu zespół traci.
3. **Decyzje w każdym okresie** (`data/cykliczne.js`, `proto/cykl.js`) — skrzynka spraw dostaje
   sprawy ze STANU firmy, nie ze skryptu:
   - **odnowienia umów** w rocznicę: przedłużyć (+8% indeksacji), negocjować (z wynikami
     przeglądów/testów −10% i naprawa znanej usterki w ramach umowy; bez dowodów +5%), przetarg na
     innego dostawcę (−20%, ale wdrożenie od nowa: nowa jakość, nowe usterki, zero historii),
     wypowiedzieć; brak decyzji = automatyczne przedłużenie z podwyżką,
   - **certyfikaty i domeny** (e-BOK, VPN, domena, podpis kwalifikowany prezesa): odnowić,
     zautomatyzować TLS raz na zawsze, oddać MSP; **bez inwentaryzacji ok. 35% z nich wygasa
     „po cichu"** — nikt nie wiedział, że istnieją, aż przestały działać,
   - **koniec wsparcia producenta** (stacje inżynierskie SCADA, serwer księgowości, routery
     w przepompowniach): wymiana (na stacjach z pilotażem albo „od razu" z ryzykiem awarii),
     izolacja (wymaga segmentacji), płatne łatki na rok (sprawa wraca), akceptacja zarządu
     albo „zostaw" (ryzyko w rejestrze),
   - **proces bez właściciela**: alerty leżą od dwóch miesięcy → zatrudnić, zlecić MDR, stroić
     reguły; zespół nie nadąża (4+ projekty albo projekt od pół roku) → MSP, rekrutacja,
     priorytety z zarządem (wstrzymanie ostatniego projektu), nadgodziny zespołu,
   - **zmiany firmy** (kampania): rozbudowa o nowe osiedle (włączyć w procesy od pierwszego dnia
     albo wykonawca „po swojemu" = urządzenia poza ewidencją), cięcie budżetu o 20% (przyjąć,
     bronić rejestrem ryzyk, samemu zaproponować cięcia), odejście osoby z IT (rekrutacja
     z kosztem stałym, przeniesienie do MSP, „przejmę sam" = −20 h co miesiąc na zawsze).

   Mądry ma decyzję w skrzynce w ok. 21 z 24 miesięcy (test pilnuje ≥ 18).
4. **Zasady**: najwyżej 5 wdrożeń w toku naraz; koniec wsparcia ma decyzję; certyfikaty na czas;
   odnowienie to decyzja, nie automat; alerty mają właściciela; zmiany firmy z bezpieczeństwem
   przy stole.

**Wynik**: „wszystko naraz" spada z 780 do **591** (Indeks z 744 do 447). Z 16 zamówionych
kontroli do końca kampanii działają 2–4, morale spada do 23. Odstępstwo „cały katalog w 1.
miesiącu" w grze mądrego kosztuje **−309** punktów — więcej niż kłamstwo w ankiecie
ubezpieczyciela. Lekcja: **szybciej kończy ten, kto zaczyna mniej naraz**.

## 18.13. Doradztwo: kup czyjś czas i oczy

Każdy CISO może zlecić temat firmie zewnętrznej (`x zlec_doradcy temat=… firma=… tryb=…`,
cennik i raporty: `p`; dane: `data/doradztwo.js`, silnik: `proto/doradztwo.js`).

| Temat | Czas (zwykły / pilny) | Cena lokalna / renomowana* | Co robi |
|---|---|---|---|
| `ogolny` — ocena dojrzałości i luk | 3 / 1 mies. | 27 / 68 tys. zł | wszystko płycej (60% głębokości) + obowiązki prawne |
| `ekspozycja` — pentest z internetu, dostęp zdalny | 1 / 0 mies. | 13 / 33 tys. zł | fakty widoczne z internetu, dostępy zdalne |
| `ot` — audyt OT/SCADA | 2 / 1 mies. | 23 / 57 tys. zł | stacja, PIN-y, integrator + zgodność wariantów OT z producentem (jak pilotaż) |
| `ciaglosc` — kopie, odtwarzanie, praca ręczna | 2 / 1 mies. | 16 / 39 tys. zł | **testuje** kopie, BCP i plan (liczy się jako test — dowód dla audytu) |
| `dostep`, `dostawcy`, `zgodnosc`, `ludzie`, `platnosci` | 1–2 / 0–1 mies. | 7–42 tys. zł | konta i MFA; integrator i umowy; KSC/NIS2; obejścia działów (wywiady); BEC |

\* dla Wodnika (64 osoby); cena skaluje się z pierwiastkiem liczby pracowników, tryb pilny ×1,5.
🔵 Rzędy wielkości z polskiego rynku MŚP 2026, nie cennik konkretnej firmy (`02-…`).

**Wykonawca to decyzja**: lokalna firma znajduje ok. 55% tego, co jest do znalezienia, a jej
szacunki mają błąd ±40% (kolejność rekomendacji bywa zła); renomowana — 90% i ±10%, za 2,5×
cenę. Zlecenie kosztuje budżet roku — w 2026 r. pełna ocena od renomowanej firmy się nie mieści.

**Raport** przychodzi pod koniec miesiąca realizacji i:
1. **odkrywa** ukryte rzeczy z prawdy silnika (fakty świata, usterki, rozjechaną konfigurację,
   obejścia działów — te trafiają do skrzynki jako odkrycia),
2. **wycenia** każdą możliwą poprawę na modelu: ekspozycja (oczekiwane straty w roku, 150
   przebiegów na wspólnych ziarnach) przed i po zmianie, zakłócenie dostaw wody liczone jak
   dzień przychodu. Wycena idzie na kopiach stanu (`coJesli`) — nie rusza kampanii ani losowości,
3. **układa rekomendacje od największej poprawy obecnej sytuacji** — pierwsza oznaczona
   „★ NAJWIĘKSZA POPRAWA", każda z kosztem i **gotowym poleceniem** (`x odetnij_hmi`,
   `x wdroz:edr zakres=biuro_serwery tryb=wykrywaj`, „skrzynka → legalizuj warunki=…"),
4. osobno wypisuje **obowiązki prawne** z terminami (nie zmniejszają strat, ale mają karę).

Przykład (ocena luk, renomowana firma, m. 4): ★ zamknąć panel HMI (−89 tys. zł/rok, 4 h) →
EDR (−83 tys.) → kopia SCADA u nas (−61 tys.) → segmentacja OT (−59 tys.) → BCP → MFA; obowiązki:
wpis do wykazu (m. 6), SZBI, rejestr ryzyk, zgłaszanie incydentów, szkolenie kierownika.

**Zasada**: najważniejsza rekomendacja wykonana w ciągu 3 miesięcy („raport nie do szuflady" —
zapłacony raport, którego nikt nie wdrożył, to też dowód dla audytora, że o ryzyku wiedziano).
Zlecenie pentestu albo audytu OT w miesiącu ostrzeżenia CERT liczy się jako reakcja.

**Ile to daje**: laik, który robi WYŁĄCZNIE to, co mówi raport (pentest lokalnej firmy w m. 1,
ocena luk w m. 2, druga ocena od renomowanej w m. 11), ma **624** pkt wobec **547** laika
działającego sam — ale daleko za mądrym (910). Doradca odpowiada „co" i „w jakiej kolejności";
nie prowadzi za gracza spraw działów, incydentów, testów i przeglądów.
