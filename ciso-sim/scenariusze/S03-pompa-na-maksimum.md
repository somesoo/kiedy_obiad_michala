# S03. Pompa na maksimum

| | |
|---|---|
| **Firmy** | wodociągi (PWiK „Wodnik") — pierwszy test kampanii |
| **Rodzaj** | OT: zmiana parametrów procesu przez wystawiony do internetu panel HMI; haktywiści |
| **Trudność** | ★★ |
| **Czas gry / realny** | 10 dni (pierwsze 12 h gęsto) / 25 min |
| **Zegary** | **CSIRT INFRASTRUKTURA** 24 h / 72 h / miesiąc · **sanepid** (jakość wody — natychmiast, gdy zagrożenie) · policja · media/Telegram (od pierwszej godziny) |
| **Inspiracja** | włamania do stacji uzdatniania wody w 2025 r. opisane w raporcie ABW (m.in. zmiany ciśnienia i parametrów filtracji, zmiana PIN-ów; przyczyny — słabe hasła i systemy wystawione do internetu); materiały publikowane przez prorosyjskie grupy |
| **Cele** | E4 (nieznane zasoby), E12 (bezpieczeństwo ludzi ponad IT), E6, E8 (integrator), E10 |

## Warunki wyzwolenia

- Skrypt kampanii wodociągów, okno m. 2–4, **jeśli** panel HMI dalej jest w internecie
  (gracz go nie znalazł i nie zamknął). Jeśli zamknął — scenariusz zmienia się w wariant
  „próba" (faza 0B).
- Silnik: sprawca `haktywista` przez wektor `uslugi`.

## Prawda

Integrator przy modernizacji stacji (2022) wystawił panel HMI na publiczny adres z
przekierowaniem portu „żeby móc zdalnie pomóc". Domyślny login, PIN 4-cyfrowy niezmieniony.
Grupa haktywistów znalazła go wyszukiwarką urządzeń internetowych. W sobotę o 6:40 zmieniła
nastawy: czas płukania filtrów na maksimum, ciśnienie w strefie na maksimum, wyłączyła dwa
alarmy, zmieniła PIN, nagrała ekran i wrzuciła film na Telegram z flagą i podpisem.
Dozowanie chloru jest na osobnym sterowniku bez dostępu z HMI (napastnik próbował — bez
skutku). **Druga furtka**: stacja inżynierska integratora ma zainstalowane narzędzie zdalnej
pomocy z niezmienionym hasłem — napastnik o niej nie wie, ale ktoś inny może się dowiedzieć.

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `ekspozycja` + `inwentaryzacja` (znane ≥ 85%) albo `moje_cert` przeczytany | panel znaleziony i zamknięty → **wariant 0B** (próba logowania widoczna w logach routera, bez skutków) |
| `moje_cert` bez godzin na raport | raport w skrzynce mówi o „usłudze VNC/HMI wystawionej na porcie …" — sygnał, którego nikt nie przeczytał (debrief to pokaże) |
| `ot_monitoring` | alert o zmianie nastaw w 2 min (zamiast „kierownik stacji zauważy rano") |
| `bcp` (procedury pracy ręcznej) | przejście na sterowanie ręczne w 20 min |
| polityka OT + umowa z integratorem z wymaganiami | integrator ma obowiązek reakcji i współpracy (umowa), dokumentacja dostępów istnieje |
| nic | kierownik stacji zauważa o 7:30 na obchodzie, że pompa „wyje" |

## Przebieg

### Faza 0B — wariant „próba" (gracz zamknął panel wcześniej)

Logi bramy: 400 prób logowania na zamknięty już port z adresów VPS-ów. Telegram: grupa
publikuje listę „celów w Polsce", jest na niej Wasza miejscowość. Decyzje: przegląd, czy
**nic więcej** nie jest wystawione; zgłoszenie (dobrowolne, ale cenne dla sektora) do CSIRT
INFRASTRUKTURA; rozmowa z integratorem o drugiej furtce. **Scenariusz kończy się sukcesem**
— i to jest lekcja: najtańsza obrona to wiedzieć, co masz w internecie.

### Faza 1 — T+0 (sobota 7:30): „pompa wyje"

Kierownik stacji dzwoni: ciśnienie w sieci za wysokie, filtry płuczą się non stop, na
panelu nie da się zalogować („zmieniony PIN?"). Mieszkańcy z wyższej strefy zgłaszają
pęknięte węże ogrodowe.

**Co gracz wie:** zmiana nastaw (pewne); ktoś z zewnątrz (prawdopodobne); jakość wody — nie
wiadomo; zasięg — nie wiadomo.

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Bezpieczeństwo procesu najpierw**: kierownik przełącza na sterowanie ręczne / lokalne, przywraca bezpieczne nastawy z szafy (lokalny panel operatorski) | 20 min (z BCP) / 1,5 h (bez) | ciśnienie wraca do normy; awarie sieci ograniczone | ✅ |
| **Pobranie próbek wody** i kontakt z laboratorium / sanepidem (czy parametry jakości są w normie) | 1 h | wiedza, czy trzeba komunikatu „nie pić" | ✅ |
| Odłączenie stacji od internetu (fizycznie: kabel z routera/modemu) | 10 min (ktoś na miejscu) | zamyka panel i — przy okazji — drugą furtkę (integrator) | ✅ |
| Najpierw diagnoza „co się stało" przez zdalne logowanie do HMI | 1 h | proces dalej w złych nastawach | ❌ ludzie i proces przed informatyką |
| Telefon do integratora, „niech sprawdzi zdalnie" | 30 min | integrator łączy się… przez tę samą drugą furtkę; napastnik (inny) mógłby to zobaczyć | ⚠️ integrator tak, ale **na miejscu** albo przez kontrolowany kanał |

### Faza 2 — T+2 h: film na Telegramie

Lokalny dziennikarz przysyła link: film z ekranu Waszego HMI, z logo spółki widocznym
w rogu, 14 tys. wyświetleń. Wójt dzwoni do prezesa: „Mamy zatrutą wodę?".

| Opcja | Ocena |
|---|---|
| **Komunikat dla mieszkańców** (strona, SMS-y gminy, profil): incydent, sterowanie ręczne, wyniki badań wody o 14:00, numer telefonu; **jeśli** badania wskażą problem — komunikat sanitarny we współpracy z sanepidem | ✅ prawda i konkret |
| „Atak został odparty, woda jest bezpieczna" — przed wynikami badań | ❌ jeśli wyniki będą złe — katastrofa zaufania; nawet jeśli dobre — kłamstwo co do „odparcia" |
| Milczenie do poniedziałku | ❌ panika, plotki, wójt traci zaufanie do spółki |
| Briefing dla wójta / urzędu gminy (właściciel spółki) w ciągu godziny | ✅ |

### Faza 3 — T+3 h … T+24 h: zgłoszenia i dowody

| Opcja | Ocena |
|---|---|
| **Wczesne ostrzeżenie do CSIRT INFRASTRUKTURA** (podmiot kluczowy, zakłócenie usługi kluczowej) | ✅ |
| Zawiadomienie policji (i — przy podejrzeniu działania obcego państwa — informacja dla ABW przez kanał CSIRT) | ✅ |
| Zabezpieczenie dowodów: zrzut konfiguracji HMI/PLC, logi routera, film z Telegrama (zapis, link, data), zdjęcia ekranów | ✅ |
| Przywrócenie panelu do internetu „bo integrator musi mieć dostęp" | ❌ |

### Faza 4 — T+1 … T+5 dni: druga furtka i porządki

Integrator przyjeżdża w poniedziałek. Gracz decyduje o zakresie przeglądu:

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Inwentaryzacja wszystkiego, co jest dostępne z internetu** (moje.cert.pl/Artemis + skan + przegląd umów z integratorami) | 16 h | **znajduje drugą furtkę** (narzędzie zdalnej pomocy na stacji inżynierskiej) i kamerę z domyślnym hasłem | ✅ |
| Tylko zmiana PIN-u na HMI i zamknięcie przekierowania | 2 h | druga furtka zostaje → **powrót** (inna grupa) w m. +2 | ⚠️ |
| Zdalny dostęp dla integratora: **brama z MFA, dostęp na żądanie, nagrywanie sesji, osobne konto na osobę** | 40 h + 15 tys. zł | — | ✅ |
| Zakaz jakiegokolwiek zdalnego dostępu | 0 zł | integrator przyjeżdża na każdą awarię (koszty, czas reakcji 4–8 h) — tarcie, ale dopuszczalne w małej spółce | ⚠️ |
| Aktywne skanowanie sieci OT „żeby zobaczyć, co tam jest" | 2 h | 15% szans na zawieszenie sterownika (realna przypadłość starszych PLC) | ❌ tylko pasywnie i z automatykiem |

### Faza 5 — T+10 dni: zgłoszenie, lekcje, budżet

Zgłoszenie 72 h i raport końcowy. **Okno na budżet**: zarząd po filmie na Telegramie jest
gotów dać pieniądze (mandat +15, możliwy wniosek nadzwyczajny). Gracz wybiera, co z tym
zrobi: segmentacja OT, monitoring OT, BCP, umowa z integratorem. Debrief pokazuje, że
**najwięcej dała rzecz za 0 zł** (wiedzieć, co jest w internecie).

## Zegary i obowiązki

- CSIRT INFRASTRUKTURA: 24 h / 72 h / miesiąc (podmiot kluczowy, sektor woda).
- Sanepid: przy podejrzeniu pogorszenia jakości wody — niezwłocznie (procedury sanitarne;
  szczegóły poza zakresem gry 🔵).
- RODO: nie dotyczy (brak danych osobowych w HMI) — gra pyta, gracz ma odpowiedzieć „nie" z
  uzasadnieniem.

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 20 | proces i ludzie najpierw (sterowanie ręczne, bezpieczne nastawy) |
| 10 | badanie wody przed komunikatem o bezpieczeństwie |
| 10 | fizyczne odcięcie od internetu |
| 15 | prawdziwy komunikat dla mieszkańców + briefing dla wójta |
| 10 | wczesne ostrzeżenie do CSIRT INFRASTRUKTURA |
| 5 | dowody (w tym film z Telegrama) |
| 15 | pełna inwentaryzacja ekspozycji → znalezienie drugiej furtki |
| 10 | kontrolowany zdalny dostęp integratora (albo świadoma rezygnacja) |
| 5 | brak aktywnego skanowania OT |

## Debrief

- **To nie był wyrafinowany atak.** Panel w internecie, domyślne hasło. Według raportu ABW
  właśnie słabe hasła i systemy wystawione do internetu były główną przyczyną włamań do
  stacji uzdatniania wody w Polsce w 2025 r.
- **Nie da się zamknąć drzwi, o których się nie wie.** Darmowy skan (moje.cert.pl, skaner
  Artemis CERT Polska) pokazałby ten panel. Raport bez godzin na przeczytanie — nie.
- **W OT kolejność jest inna niż w IT:** najpierw bezpieczeństwo procesu i ludzi, potem
  dowody, potem informatyka. Dlatego procedury pracy ręcznej są kontrolą bezpieczeństwa.
- **Haktywiści chcą rozgłosu.** Film na Telegramie jest częścią ataku — odpowiedzią jest
  szybka, prawdziwa komunikacja.
- **Integrator to Twój łańcuch dostaw.** Jego wygoda (stały dostęp) to Twoja ekspozycja.
- Źródła: raport ABW (2025) w relacjach RISI, The Record, Security Affairs; komunikaty
  Łukasiewicz–PIT; CERT Polska (błędna konfiguracja urządzenia dostępnego z internetu).

## Warianty

- **Oczyszczalnia ścieków** (po przejęciu, m. ~10): ten sam wzorzec, skutki środowiskowe
  (zrzut do rzeki) — inne instytucje (ochrona środowiska) 🔵.
- **Ciepłownia małej gminy** (kampania gminy jako wątek): zmiana temperatury zasilania zimą.

## Pytania do dyskusji

1. Czy wiecie, które Wasze urządzenia są widoczne z internetu? Kiedy ostatnio sprawdzaliście?
2. Kto ma zdalny dostęp do Waszych systemów sterowania i jak się loguje?
3. Czy operator potrafi prowadzić proces ręcznie? Kiedy ostatnio to robił?
