# 21. SIEM i SOAR w grze: CTF + symulator CISO (odnoga `ciso-siem-soar`)

Pomysł właściciela (22.10.2026): podpiąć własnego SIEM-a i SOAR-a do „Linii Obrony" i połączyć
CTF z symulatorem CISO. Pytanie wyjściowe: **czy prowadzić graczy „za rączkę" wewnątrz SIEM-a
albo SOAR-a?** Ten dokument to rozważanie i propozycja. Kod — dopiero po odpowiedziach
z 21.9.

## 21.1. Krótka odpowiedź

**W SIEM-ie — nie. W SOAR-ze — tak, bo tam to jest realizm, nie podpowiedź.** A w obu
przypadkach z **rusztowaniem, które znika**: pomoc jest dostępna na żądanie i ma cenę.

- **SIEM** w życiu nie mówi analitykowi, co ma kliknąć. Daje alert, kontekst i dane. Lista
  kroków „wpisz to zapytanie, kliknij tamto" zamienia CTF w quiz z instrukcją, a to łamie
  fundament tej gry (`18-…`: „gra nie może być w żadnym stopniu quizem"). Gracz, który przeszedł
  ścieżkę z instrukcji, nie nauczył się szukać, tylko czytać.
- **SOAR** to z definicji „prowadzenie za rączkę": playbook proponuje kroki, człowiek
  zatwierdza. Gracz, który uruchamia playbook „zablokuj konto", robi dokładnie to, co robi SOC.
  Lekcja jest gdzie indziej: **czy ufać playbookowi** (zablokować konto prezesa w trakcie
  przelewu? odciąć panel HMI, który steruje pompą?), w jakiej kolejności i co playbook pomija.
- **Odbiorcy to biuro (~15 osób, w większości nie z bezpieczeństwa).** Goły SIEM to dla nich
  ściana. Dlatego pomoc musi istnieć, ale jako **pytania śledcze i podpowiedzi z ceną**, a nie
  jako ścieżka.

## 21.2. Dlaczego nie ścieżka krok po kroku

| Ścieżka „za rączkę" | Co się psuje |
|---|---|
| „Wpisz `user=d.nowak AND action=login`" | gracz nie wie, DLACZEGO szuka tego konta — przy następnym incydencie stoi |
| jedna poprawna kolejność | dokładnie to, co wycięliśmy z incydentów (drzewa → akcje w dowolnej kolejności, `18-…`, 18.8) |
| flaga za kliknięcie | nagradza wykonanie, nie zrozumienie; „Jakość praktyki" przestaje cokolwiek mierzyć |
| wszyscy widzą to samo | znika najciekawsze połączenie z symulatorem: SIEM pokazuje to, co gracz WCZEŚNIEJ zbudował (21.4) |

Ale **całkowity brak pomocy** też jest złym projektem dla tego odbiorcy: kto utknie
w pierwszych 10 minutach, wyłącza grę. Stąd drabina pomocy (21.3).

## 21.3. Drabina pomocy (jak w CTF: podpowiedź kosztuje)

Każdy poziom gracz wybiera sam, w dowolnym momencie. Cena to **czas na zegarze incydentu**
(nie wstyd i nie punkty „za nic"): incydent ma dynamikę (`incydent.js`), więc podpowiedź,
która zajmuje 30 minut gry, realnie pogarsza wynik — tak jak w życiu telefon do kolegi z SOC.

| Szczebel | Co gracz dostaje | Cena (zegar) | Wzorzec z życia |
|---|---|---|---|
| 0 | alert + kontekst (kto, kiedy, skąd, jaki zasób) | 0 | to, co SIEM i tak pokazuje |
| 1 | **pytanie śledcze**: „Skąd logowało się to konto w ostatnim tygodniu?" | 10 min | starszy analityk pyta, nie mówi |
| 2 | **źródło**: „to widać w logach VPN" (bez zapytania) | 20 min | „zajrzyj do VPN-a" |
| 3 | **zapisane wyszukiwanie** / gotowy dashboard | 45 min | runbook SOC |
| 4 | odpowiedź na to pytanie | 90 min + zasada „sam ustalił" nie zalicza się | eskalacja do zewnętrznego IR |

Ocena patrzy na **ustalenia**, nie na szczeble: kto doszedł z podpowiedzią 3, dalej ustalił
fakt, tylko później — i zegar to już policzył. Osobna, jawna statystyka „ile podpowiedzi"
idzie do debriefu (dla trenera), nie do Wyniku.

**Tryb trenera** (warsztaty biurowe): prowadzący może dla całej grupy odblokować szczebel 2
za darmo — zamiast „prowadzenia za rączkę" w narzędziu, prowadzenie przez człowieka.

## 21.4. Najmocniejsza część: SIEM pokazuje to, co gracz zbudował jako CISO

To jest powód, żeby łączyć CTF z symulatorem, a nie robić dwóch osobnych gier.

Symulator już modeluje **co gracz widzi**: kontrole wykrywające mają skuteczność, konfigurację
(EDR „wykrywaj"/„blokuj") i **martwe pola** (`data/kontrole.js`, `martwe_pola`: EDR nie widzi
insidera tak jak intruza z phishingu). Telemetria w SIEM-ie powinna z tego **wynikać**:

- nie wdrożyłeś EDR → w SIEM-ie nie ma logów procesów ze stacji; incydent badasz „po omacku",
- logi VPN bez MFA → widać logowanie, ale nie wiesz, czy to człowiek, czy skradzione hasło,
- brak scentralizowanych logów kont (JML, PAM) → S07 bez śladu, kto skasował dane,
- dryf i usterki kontroli (np. agent EDR wyłączony na 3 stacjach) → dziury w telemetrii, które
  gracz może zauważyć sam — i to jest ustalenie.

Czyli: **decyzje z 24 miesięcy kampanii zmieniają trudność CTF-a**. Dobry CISO dostaje
łatwiejsze śledztwo, bo kupił widoczność. To jest lekcja, której żaden zwykły CTF nie da.
Mgła wojny działa jak w grze: SIEM dostaje tylko to, co „widziałyby" działające kontrole —
nigdy prawdę silnika (`campaign_state`), tak jak front (`CLAUDE.md`, „Mgła wojny").

## 21.5. SOAR = akcje incydentu, z prawdziwymi skutkami w symulatorze

Akcje incydentów już istnieją i mają czas, koszt, kolejność i dynamikę. SOAR może je **wywołać**:

| Playbook w SOAR | Akcja w symulatorze | Pułapka do przemyślenia |
|---|---|---|
| zablokuj konto / odbierz dostęp | S07 `odbierz_dostep` | przed zabezpieczeniem logów? (`zabezpiecz_logi`) — kolejność ma znaczenie |
| izoluj host / odetnij panel | S03 `odetnij` | odcięcie HMI = proces ręczny na stacji (`proces_reczny`) |
| zablokuj nadawcę, usuń maile | S01 `usun_mail` | usuwa też dowody; nie odzyskuje pieniędzy (bank pierwszy) |
| zgłoś do CSIRT | `zgloszenie_cert` / `zgloszenie_csirt` | termin z KSC (`02-…`) |
| „przywróć z kopii" | S07 `przywroc_dane` | przed odebraniem dostępu sprawca kasuje ponownie |

Playbook **proponuje**, gracz zatwierdza — i za decyzję odpowiada gracz (zasady incydentu
oceniają jak dotąd). Zapis gry dalej jest listą akcji (`k.akcje`): akcja z SOAR-a przechodzi
przez te same funkcje (`incydentAkcja`), więc odtworzenie z ziarna działa.

## 21.6. Flagi bez quizu

CTF potrzebuje flag, ta gra zakazuje „ocen opcji". Pogodzenie:

- **Flaga = ustalony fakt, nie wybrana odpowiedź.** Gracz wpisuje to, co znalazł (konto, adres
  IP, czas pierwszego dostępu, nazwa skasowanego katalogu, kwota), serwer sprawdza z prawdą
  silnika. Nie ma listy do wyboru — jak w prawdziwym CTF.
- **Fakt odblokowuje działanie**: znasz konto sprawcy → stan incydentu dostaje ten fakt (nowe pole, np. `s.ustalenia`),
  akcja „odbierz dostęp" trafia w to konto, a nie „na ślepo we wszystkie" (dziś to jest
  `przeglad_kont_wszystkich`, 3 h). Ustalenie skraca zegar — nagroda w grze, nie punkt.
- **Zasady dalej oceniają praktykę**: „zabezpieczył dowody przed przywracaniem", „zgłosił
  w terminie" — z historii akcji, jak dziś.

## 21.7. Architektura (propozycja, bez wiązania się z konkretnym SIEM-em)

```
ciso-sim (silnik, bez zmian w zasadzie)
  └── proto/telemetria.js   — NOWE: (kampania, incydent, ziarno) → zdarzenia logów
         • deterministyczne, własny strumień k.rnd.telemetria (zasada osobnych strumieni)
         • filtr widoczności: tylko to, co widzą działające kontrole (skuteczność, martwe pola, dryf)
         • szum tła (normalny ruch biura), żeby szukanie było szukaniem
  └── lab/adapter-<siem>.js — NOWE: wysyłka do SIEM-a (format i API właściciela)
  └── lab/soar-webhook.js   — NOWE: SOAR → gra (akcja incydentu), podpis HMAC, lista dozwolonych akcji
  └── lab/flagi.js          — NOWE: sprawdzanie ustaleń z prawdą silnika (bez ujawniania jej)
```

- **Silnik nie zna SIEM-a** (jak nie zna kampanii): adapter jest wymienny, telemetria ma
  własny, neutralny format (pola zbliżone do ECS: `@timestamp`, `host.name`, `user.name`,
  `source.ip`, `event.action`, `event.outcome`).
- **Czas**: incydent liczy w godzinach gry (`s.t`). Telemetria dostaje znaczniki czasu
  „sztucznej doby" — sesja 45 minut może zawierać 24 h logów.
- **Bezpieczeństwo** (gra o bezpieczeństwie musi być bezpieczna, `12-…`): lab w izolowanej
  sieci, żadnych prawdziwych danych ani poświadczeń, webhook SOAR-a podpisany i z listą akcji
  (SOAR nie może wywołać niczego spoza katalogu akcji incydentu), konto gracza w SIEM-ie tylko
  do odczytu jego indeksu (gracze nie widzą cudzych sesji = nie ściągają flag).

## 21.8. Plan na pierwszy kawałek (MVP)

**S07 „Konto byłego zleceniobiorcy" w gminie** jako pierwszy incydent dla SIEM-a:
najkrótszy (24 h), konkretne logi (VPN, logowania do domeny, operacje na plikach, panel
administracyjny), insider = dobra lekcja martwych pól EDR, a przygotowanie z kampanii (przegląd
kont, JML, PAM) realnie zmienia to, co widać.

1. `telemetria.js` dla S07: zdarzenia + filtr widoczności + szum; test „to samo ziarno = te same logi".
2. Test: „kampania z PAM daje w SIEM-ie ślad sesji admina, bez PAM — nie" (21.4 jako test).
3. Eksport do pliku NDJSON → ręczny import do SIEM-a właściciela (zanim ruszymy API).
4. Flagi S07 (konto, źródłowy IP, czas, co skasowano) + drabina podpowiedzi (21.3).
5. SOAR: 2–3 akcje przez webhook, potem reszta.
6. Rozgrywka z 2–3 osobami z biura; pomiar: ile podpowiedzi, gdzie utknęli.

## 21.9. Pytania do właściciela (zanim powstanie kod)

1. **Jaki SIEM i jaki SOAR** (własny produkt? na czym stoi: Elastic/OpenSearch, Wazuh, Splunk,
   własny silnik)? Jak przyjmuje dane (HTTP, syslog, plik) i jaki ma język zapytań?
2. Czy SOAR ma **webhooki wychodzące** (wywołanie API gry) i ręczne zatwierdzanie kroków?
3. **Kto gra**: całe biuro (laicy, potrzebna drabina 21.3) czy osoby z IT (od szczebla 0)?
   Indywidualnie czy zespołami (CISO decyduje, analityk szuka — dwie role przy jednym incydencie)?
4. **Gdzie stoi lab**: na tym samym VPS-ie co Snakes (mały — SIEM może go zjeść) czy osobno?
5. Ile ma trwać sesja CTF: 30–45 min w przerwie czy dłuższy warsztat?
6. Czy CTF ma być **częścią kampanii** (incydent z osi gra się w SIEM-ie) czy osobnym trybem
   „zagraj incydent na stanie z mojej kampanii"? Proponuję zacząć od drugiego — prościej, a
   połączenie z 21.4 i tak działa.

## 21.10. Decyzja (22.10.2026): incydent obsługuje się w SIEM-ie i SOAR-ze — model MSSP

Właściciel: „dodać do obsługi incydentu wymagane akcje w SOAR i SIEM — człowiek sam przechodzi do
SIEM-a / SOAR-a hostowanego gdzie indziej (po HTTP)"; „zrobię MSSP w SOAR i SIEM dla każdego
gracza"; „każdy gracz będzie miał w trakcie incydentu importowane do swojego tenanta wymagane
dokumenty, na podstawie których podejmuje działania".

**Jak to pogodzić z „bez quizu":** „wymagane" jest **gdzie** robi się akcję, nie **czy** i **kiedy**.
Akcje techniczne (wyłączenie konta, zebranie dzienników, odblokowanie, przywrócenie, przegląd kont)
istnieją w labie wyłącznie jako playbooki w SOAR-ze; decyzje ludzi (wójt, komunikat, papier,
zgłoszenia, zawiadomienie) zostają w grze. Kolejność dowolna, zegar płynie, bezczynność toczy
incydent jak dotąd. Wiedzy (konto, adres, czas, co usunięto) nie podaje gra — jest w SIEM-ie.

**Co dostaje tenant gracza** (wynika z jego kampanii — 21.4):

| Kampania | SIEM na starcie | Dokumenty w sprawie |
|---|---|---|
| bez SIEM/MDR | **pusto** — dzienniki leżą na serwerach; playbook „zbierz-dzienniki" je wysyła; dziennik DC wyczyszczony wcześniej (po ok. 8 h) jest stracony | zgłoszenie, wypowiedzenie umowy, formularz CSIRT |
| z SIEM, EDR, zaporą | blokady, logowania, polecenia sprawcy (EDR bez alertu — martwe pole), ruch na 3389 | + plan ciągłości (z BCP), rejestr kopii (z kopiami) |
| po playbooku przeglądu kont | — | + eksport kont uprzywilejowanych |

Przykład (ziarno 3): ta sama gra techniczna kosztuje 46 tys. zł bez kopii i 3,9 tys. zł z kopiami
i BCP; bez SIEM-a pierwsza godzina idzie na zdobycie logów.

**Pliki:** `lab/lab.js` (rdzeń, sesja = parametry + operacje, odtwarzalna), `scenariusze/S07-konto.lab.js`
(co trafia do tenanta: dane, widoczność, szum tła, zdarzenia, dokumenty, ustalenia, playbooki),
`lab/serwer.js` (HTTP), `lab/gracz.js` (klient terminalowy), `test/lab.test.js`. Silnik incydentu
bez zmian w zachowaniu (S07 zapisuje tylko dwa znaczniki czasu dla telemetrii).

### Kontrakt integracji (to, co konfigurujesz po stronie SIEM-a i SOAR-a)

Sekrety tylko ze zmiennych środowiska, min. 24 znaki, bez wartości domyślnych: `LAB_ADMIN_TOKEN`,
`LAB_SIEM_TOKEN`, `LAB_SOAR_SECRET`; przy wypychaniu także `LAB_PUSH_SECRET`. Serwer słucha na
`LAB_HOST` (domyślnie 127.0.0.1) i `LAB_PORT` (31600) — TLS i adres publiczny daje reverse proxy.

| Kto | Wywołanie | Uwierzytelnienie | Co |
|---|---|---|---|
| prowadzący | `POST /admin/sesje` `{tenant, incydent?, seed?, kontrole?, naprawione?, kampania?, start?}` | `Bearer LAB_ADMIN_TOKEN` | zakłada sesję gracza → `{sesja, token}` (token gracza pokazywany raz) |
| prowadzący | `GET /admin/sesje`, `GET /admin/sesje/:id` (z odpowiedziami), `DELETE …` | jw. | podgląd trenera |
| gracz | `GET /gra/stan`, `POST /gra/{akcja,czekaj,ustalenie,podpowiedz,koniec}` | `Bearer <token gracza>` | decyzje w grze, ustalenia z SIEM-a, podpowiedzi |
| SIEM (pobieranie) | `GET /siem/:sesja/zdarzenia?po=N` | `Bearer LAB_SIEM_TOKEN` | NDJSON, pola zbliżone do ECS, `organization.id` = tenant; nagłówek `X-Lab-Nastepny` = kursor |
| SIEM (wypychanie) | gra → `POST LAB_SIEM_PUSH_URL` (`{tenant}` w adresie) | podpis gry (niżej) | NDJSON nowych zdarzeń po każdym ruchu |
| SOAR (wypychanie) | gra → `POST LAB_SOAR_PUSH_URL` | podpis gry | `{tenant, sesja, incydent, dokumenty[]}` — nowe dokumenty sprawy |
| SOAR | `GET /soar/:sesja/dokumenty?po=N`, `GET /soar/:sesja/playbooki` | podpis SOAR-a | dokumenty i katalog playbooków (nazwa, opis, pola) |
| SOAR | `POST /soar/:sesja/playbook` `{playbook, pola}` | podpis SOAR-a | wykonanie playbooka w grze → `{ok, tekst}` |

**Podpis** (w obie strony ten sam schemat): nagłówki `X-Lab-Czas` (sekundy unixowe) i
`X-Lab-Podpis: sha256=<hex>` = HMAC-SHA256(sekret, `"{czas}.{sesja}.{ciało}"`), ciało puste dla GET.
Okno czasu ±300 s, powtórzony podpis odrzucany (409). Gra przy wypychaniu dodaje `X-Lab-Sesja`
i `X-Lab-Tenant`. Zdarzenia mają stabilne `event.id` — wolno deduplikować.

**Playbooki S07:** `wylacz-konto {konto}` (zły cel = czas mija, nic się nie dzieje; konto urzędnika
jest nazwane), `zbierz-dzienniki`, `odblokuj-konta`, `przeglad-kont-uprzywilejowanych`,
`przywroc-z-kopii`. **Ustalenia:** konto sprawcy, adres źródłowy, pierwsze wejście (czas polski
albo UTC, ±10 min), usunięte udziały. Podpowiedzi 10/20/45/90 min zegara, zła odpowiedź 5 min.

### Uproszczenia (🔵)
- Zebranie dzienników „włącza przekazywanie" od tej chwili (w życiu to osobna konfiguracja).
- T+0 = chwila założenia sesji (logi z „wieczorów przed" mają prawdziwe daty sprzed ~3 dni);
  prowadzący może podać `start`, żeby wszyscy grali na tym samym kalendarzu.
- Jedno źródło prawdy o czasie: zegar incydentu. Gracz „przesuwa" czas swoimi akcjami, a SIEM
  dostaje logi do bieżącej chwili gry — nie płyną w czasie rzeczywistym.

### Dalej
1. Twój adapter: format zdarzeń/dokumentów pod Twój SIEM i SOAR (mapowanie pól, jeśli nie ECS).
2. S01 i S03 w labie (poczta i bank; HMI/OT — zapora, EDR na stacjach inżynierskich).
3. Gracz w przeglądarce zamiast terminala (po szkielecie aplikacji z logowaniem, `13-…`, etap C).
4. Wynik labu w kampanii: dziś lab gra incydent na przygotowanym stanie (`kontrole`, `naprawione`);
   następny krok — sesja ze stanu kampanii gracza (zapis = lista akcji, więc to tylko odtworzenie).

## 21.11. Forma CTF: wychodzisz do SIEM-a / SOAR-a, wracasz z flagą (22.10.2026)

Właściciel: „jak się połączę z SIEM-em i jak będę generował logi i alerty — to inna bajka;
zależy mi, żeby incydenty i wdrożenia SIEM/SOAR miały **obowiązek wejścia** w samego SIEM-a/SOAR-a
w systemie hostowanym gdzie indziej, gdzie będę miał generator logów"; „zróbmy formę CTF-a —
wychodząc do SIEM-a, muszę wrócić do gry z odpowiednikiem flagi".

**Zasada:** gra nie wierzy na słowo. Wdrożenie SIEM/SOAR i incydent z wersją labową kończą się
tylko flagą, którą gracz przynosi z zewnętrznego systemu. Generowanie logów i alertów należy do
systemu właściciela. Gra mówi mu, CO się stało (scenariusz i przebieg), i sprawdza, z czym gracz wraca.

### Flaga
`LO{<ładunek>.<podpis>}`, gdzie ładunek to base64url(JSON) `{ tn: tenant, z: zadanie, w: wynik, n: jednorazowy id, wyd }`,
a podpis to Ed25519 nad `LO1.<ładunek>` (`proto/zewnetrzne.js`).
- **Ed25519, nie HMAC**, bo gracz może mieć grę u siebie. Gra zna tylko klucz publiczny, a podpisuje
  system właściciela albo serwer labu, więc flagi nie da się podrobić.
- **Przypięta do tenanta**, więc nie przepiszesz jej od kolegi. **Jednorazowa**, więc nie użyjesz jej
  dwa razy. Zmiana ładunku (np. dopisanie źródeł) psuje podpis.
- W grze jest jedna komenda: `flaga LO{…}`. Zapis gry trzyma flagę, a odtworzenie sprawdza ją ponownie.
- Narzędzie dla systemu właściciela: `node ciso-sim/lab/flaga.js klucze|wydaj|sprawdz` (można je
  wołać z playbooka albo z reguły po sprawdzeniu konfiguracji w tenancie gracza).

### Gra połączona z systemem
`node ciso-sim/proto/kampania.js --kampania=gmina --tenant=ala --klucz=flagi.pub.pem --zapis=ala.json`
(klucze publiczne: systemu właściciela i serwera labu, po przecinku). Bez `--tenant` gra działa jak dotąd.

### Wdrożenia z obowiązkiem wejścia (`data/zewnetrzne.js`)

| Kontrola | Zadania w tenancie gracza (każde = jedna flaga) | Co niesie flaga |
|---|---|---|
| SIEM, SIEM open source | `zrodla`: podłączyć źródła logów; `reguly`: reguły wykrywania (≥ 3) | listę źródeł (`ad, serwery, stacje, poczta, zapora, ot`) i reguł |
| MDR | `zrodla` | listę źródeł |
| SOAR | `integracja`: alerty z SIEM-a tworzą sprawy; `playbooki` (≥ 3) | listę playbooków |

Projekt kończy się po naszej stronie (godziny, pieniądze, przetarg — jak dotąd). Kontrola przechodzi
w stan **„konfiguracja"**: nie działa, abonament leci, raport IT mówi, czego brakuje. Działać zaczyna
po ostatniej fladze. **Jakość wynika z tego, co naprawdę skonfigurowano** (🔵): pokrycie źródeł
daje 40–100% jakości, reguły i playbooki ±30%. Późniejsza flaga z większą listą podnosi jakość.
Flagi można przynieść także przed końcem projektu, wtedy konfiguracja czeka na wdrożenie.

### Incydenty z obowiązkiem wejścia
Incydent, który ma plik `scenariusze/<id>-*.lab.js`, **nie da się poprowadzić w terminalu** gry
połączonej z systemem. Prowadzący zakłada sesję labu **z zapisu gracza**
(`POST /admin/sesje {incydent, zapis}`): tenant i stan biorą się z jego gry, a widoczność logów
z jego flag SIEM-a. Bez źródła `ad` blokad kont nie ma w SIEM-ie, choć SIEM działa. Po końcu fazy
ostrej `/gra/stan` daje `koniec.flaga`, a gracz wpisuje ją w kampanii. Gra odtwarza te same akcje
silnika incydentu, więc wynik, zasady i debrief są identyczne. Flaga z innego stanu kampanii jest
odrzucana. Nieprowadzony incydent toczy się sam przy zamknięciu miesiąca: obowiązek dotyczy
miejsca, nie decyzji.

W labie wiedza też jest flagą w sensie CTF: konto sprawcy, adres, czas, usunięte udziały. Gracz
wpisuje je jako ustalenia, a jego tenant wydaje je w logach.

### Dla generatora logów właściciela
- `GET /generator/:sesja/scenariusz` (`Bearer LAB_GEN_TOKEN`): dane świata (konto, adres, udziały,
  godziny), hosty, widoczność i źródła gracza, T+0.
- `GET /generator/:sesja/przebieg?po=N`: co się stało w świecie gry, bez formatu logu (`co`:
  `logowanie_zdalne`, `masowe_wylaczenie_kont`, `usuniecie_danych`, `czyszczenie_dziennika`,
  `dostep_odebrany`, `proby_logowania`, `konta_wlaczone`, `przywrocenie_danych`…). Zdarzenia mają
  stabilne `id` i `czas`, a w przebiegu nie ma przyszłości.
- Wypychanie: `LAB_GEN_PUSH_URL` (pierwsza paczka niesie też scenariusz), z podpisem jak w 21.10.
- Wbudowane logi wzorcowe (`/siem/:sesja/zdarzenia`) zostają jako przykład i do testów. Gdy masz
  własny generator, po prostu ich nie pobierasz.

Sesja z zapisu wymaga `LAB_KLUCZ_PRYWATNY` (plik PEM, `lab/flaga.js klucze`). Klucz publiczny
z tej pary trafia do gry graczy (`--klucz=`).

## 21.12. Walidator wdrożeń i flagi z wyników SOAR-a (22.10.2026)

Właściciel: „muszę mieć skrypty — walidacje wyzwalane z gry i odpalane na SIEM/SOAR: gracz mówi
«wdrożone», sprawdź, czy poprawnie, i jak tak, to dostaje flagę"; „obsługa incydentu powinna dać
flagę w jakimś logu / wyniku analizy w SOAR".

### Wdrożenia: „wdrożone — sprawdź" → walidator → flaga
```
gra: sprawdz siem ──POST /sprawdz {tenant, kontrola}──▶ walidator (przy SIEM-ie/SOAR-ze)
                                                          ├─ skrypty sprawdzenia/ → adapter → API tenanta
                                                          └─ zaliczone: flaga (Ed25519) / niezaliczone: powody
gra ◀── { wyniki: [{ zadanie, ok, powody, flaga? }] } ── gra wnosi flagi sama (ruch `flaga`, w zapisie)
```
Gra: `node ciso-sim/proto/kampania.js --tenant=ala --klucz=flagi.pub.pem --walidator=https://walidator… --zapis=ala.json`,
w grze `sprawdz [kontrola]` (token opcjonalny: zmienna `LO_WALIDATOR_TOKEN`, nie trafia do zapisu).
Walidator: `WAL_KONFIG=konfig.json WAL_KLUCZ_PRYWATNY=flagi.pem node ciso-sim/walidator/serwer.js`.

**Skrypty** (`walidator/sprawdzenia/`, jedno zadanie gry = jeden skrypt; test pilnuje, że każde
zadanie z `data/zewnetrzne.js` ma skrypt):

| Zadanie | Co znaczy „poprawnie" | Wynik we fladze |
|---|---|---|
| `siem.zrodla` (`siem_os`, `mdr`) | źródło przysłało zdarzenie w ostatnich 24 h, zegar się zgadza; typ zmapowany na źródło gry | lista żywych źródeł (jakość SIEM-a w grze i logi w labie) |
| `siem.reguly` (`siem_os`) | ≥ 3 włączone reguły z techniką z incydentów gry (`TECHNIKI`: T1531, T1110, T1078, T1070.001, T1485, T1486, T1114, T1133); **na żywo**: walidator wstrzykuje oznaczoną próbkę zdarzeń (`walidator/proby.js`) i czeka na alert ze znacznikiem — reguła, która milczy, nie przechodzi | nazwy działających reguł |
| `soar.integracja` | na żywo: próbka → alert w SIEM-ie → sprawa w SOAR-ze ze znacznikiem; bez tego: włączona integracja i sprawa z SIEM-a z ostatnich 7 dni | — |
| `soar.playbooki` | wyłączenie konta, zebranie dzienników, izolacja hosta: włączone, ≥ 2 kroki, **krok zatwierdzenia przez człowieka** przy działaniach, które mogą zatrzymać pracę (`progi.zatwierdzenie`) | nazwy playbooków |

Każde niezaliczenie ma powód po polsku („UG-DC01: podłączone, ale nie przysyła logów", „reguła X
na próbce nie wystawiła alertu", „brak kroku zatwierdzenia"), więc gracz wie, co poprawić.

**Adaptery** (`walidator/adaptery/`): `http-json` — Twoje API opisane w konfiguracji (ścieżki z
`{tenant}`, `{od}`, nazwy pól, mapowania typów, sekrety tylko `${ENV:…}`; wzór: `walidator/konfig.przyklad.json`);
`atrapa` — SIEM i SOAR w pamięci do testów i demo (`walidator/atrapa.przyklad.json`: tenant „ala" dobrze,
„bob" z typowymi błędami — to też wzór kształtu danych). Bez zasobów `wstrzyknij` i `alerty` walidator
nie robi testu na żywo i mówi to w powodach. Własny adapter = plik z `{ siem, soar }` o tych samych metodach.

**Ochrona SIEM-a:** jedno sprawdzenie naraz na tenanta, odstęp między sprawdzeniami (`progi.odstep_s`),
próbki jawnie oznaczone (`event.dataset: lo.proba`, `labels.lo_proba`), fikcyjne konta i adresy.

### Incydent: flaga w wyniku playbooka i analizy w SOAR-ze (tryb „flagi")
Sesja labu w trybie **„flagi"** (domyślny, gdy serwer labu ma `LAB_KLUCZ_PRYWATNY`):
- **Playbook** (`POST /soar/:sesja/playbook`, podpis HMAC jak w 21.10): dobry cel → `{ ok, tekst, flaga }`.
  Flagę widać w wyniku playbooka w SOAR-ze. Gra się jeszcze nie zmienia. Zły cel → bez flagi, czas mija.
- **Analiza** (`POST /soar/:sesja/analiza {ustalenie, odpowiedz}`): gracz zapisuje ustalenie z SIEM-a
  w sprawie, a SOAR wysyła je do labu. Zgadza się → flaga w wyniku analizy. Nie zgadza się → −5 min.
  W grze ustaleń nie da się już wpisać.
- **Powrót do gry:** `flaga LO{…}` (klient `lab/gracz.js`: `f LO{…}`; HTTP: `POST /gra/flaga`). Dopiero
  wtedy dzieje się akcja (czas płynie) albo zapisuje się ustalenie. Flaga jest przypięta do tenanta
  **i do tej sesji** (odcisk parametrów), działa raz, a odrzucona przez stan („nie zdążysz",
  „już odebrany") zostaje ważna.
- 🔵 Uproszczenie: w życiu playbook działa od razu. Tu skutek czeka na powrót gracza z flagą,
  żeby ten „wyszedł do SOAR-a i wrócił" — zegar incydentu i tak liczy czas akcji.

Po końcu fazy ostrej flaga wyniku wraca do kampanii jak w 21.11.
