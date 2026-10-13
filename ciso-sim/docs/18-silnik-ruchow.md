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
| `s`, `a <nr> <czasownik> k=v …` | skrzynka spraw i odpowiedź: `a 1 warunki warunki=brama,konta` |
| `i` | incydent: numer/id akcji w dowolnej kolejności, `c <h>` czekaj, `k` koniec fazy ostrej |
| `d`, `q` | dziennik (prowadzący), zapisz i wyjdź |

## 18.10. Wyniki na nowym silniku (20 ziaren, `proto/wyniki-*-2026-10-13.txt`)

| Strategia | Straty | Audyt /60 | Praktyka | Indeks | **Wynik** | Uwagi |
|---|---|---|---|---|---|---|
| mądry (rozpoznanie, „tanie i ważne", pilotaże, testy, przeglądy, warunki) | 230 tys. | 59 | 95% | 933 | **941** | |
| wszystko naraz (cały katalog w m. 1, domyślne parametry) | 390 tys. | 29 | 82% | 744 | 780 | kolejka projektów, budżet, brak dowodów |
| pracoholik (przeglądy co miesiąc, polowanie, szkolenia) | 226 tys. | 55 | 73% | 808 | 771 | morale 17 → wypalenie |
| odmawiający (mądre ruchy, odmowa każdej prośbie) | 315 tys. | 58 | 72% | 824 | 774 | zaufanie działów 0,01 |
| skąpiec (tylko to, co nie kosztuje złotówek) | 323 tys. | 23 | 72% | 718 | 721 | |
| rozsądny laik (wdraża to, o czym słyszy, domyślnie) | 557 tys. | 39 | 52% | 622 | 573 | 16 ukrytych obejść, awarie OT |
| paranoik (tylko polowanie i sygnały) | 482 tys. | 10 | 58% | 397 | 488 | |
| potakiwacz (wyjątki dla zarządu, zgoda na wszystko, dokumenty wstecz) | 240 tys. | 38 | 58% | 325 | 325 | sufit w 20/20 |
| losowy (fuzzer) | 959 tys. | 17 | 24% | 330 | 297 | niezmienniki OK |
| kłamca (mądry + upiększone raporty, ankieta, dokumenty wstecz) | 229 tys. | 47 | 42% | 250 | **250** | odwołany w 18/20 |
| bierny / odkładacz | 1,77 mln | 10 | 0% | 129 | 65 | odwołany w 20/20 |

Cennik pojedynczych odstępstw w grze mądrego: `17-…`, 17.8.

## 18.11. Decyzje i świadome uproszczenia

- **Skąpiec wygrywa z rozsądnym laikiem** (721 vs 573). To nie błąd: procesy bez narzędzi
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
