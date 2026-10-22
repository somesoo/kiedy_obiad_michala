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
