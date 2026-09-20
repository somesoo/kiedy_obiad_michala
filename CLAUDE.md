# Kiedy obiad Michała — notatki dla Claude

Biurowe gry dla ~15 osób. `server.js` (~3970 linii, Express) + `lib/boss.js` (walka
z bossem), front to czysty JS/HTML/CSS w `public/` — **bez bundlera i bez kroku
budowania**. Baza: SQLite przez `node:sqlite`. Wdrożenie: pm2 na małym VPS-ie, właściciel
przeładowuje ręcznie.

`lib/boss.js` jest **fabryką**: `require('./lib/boss')({ db, transaction, … })` dostaje
helpery ze `server.js` zamiast importować je z powrotem (inaczej byłby cykl importów,
a przy jednym pliku bazy dwa uchwyty to „database is locked"). Podpięcie jest w jednym
miejscu — szukaj `const boss = require('./lib/boss')`. Moduł sam zakłada swoje tabele
(`initSchema`), odpala migracje, rejestruje trasy i scheduler terminu.

**Nie ma testów, lintera ani CI.** Każda zmiana musi być sprawdzona ręcznie (patrz
„Jak testować"). To główny powód, dla którego duże refaktory są tu złym pomysłem.

## Co jest w środku

| Obszar | Gdzie | Stan |
|---|---|---|
| **Snakes & Ladders** (prefiks `sl*`) | większość `server.js`, `public/snakes*` | **aktywna gra, tu idzie cała praca** |
| **Walka z bossem** (co-op) | `lib/boss.js`, panel w `public/snakes.js` | wydzielona z `server.js`; przebudowana mechanika nagród |
| **Wordle po polsku** | ~20% `server.js`, `public/app.js`, `index.html` | **zakończony 2026-08-31** przez `GAME_END_AT`; `gameHasEnded()` zwraca `true`, gra jest trwale zablokowana. Nie inwestuj tu czasu bez wyraźnej prośby. |
| bukmacherka mundialowa | — | usunięta, został tylko `DROP TABLE` i ~540 linii martwego CSS w `style.css` |

Baza: `db/michal.db` z **`ATTACH`** `db/snakes.db` jako schemat `snakes`. Katalog `db/`
jest w `.gitignore` — baza produkcyjna żyje tylko na serwerze.

## Dwie waluty — to jest fundament, nie szczegół

- `sl_state.total_points` — **ranking**, nie da się ich wydać.
- `sl_state.balance` — **coins**, portfel na sklep i wpłaty dla bossa.

Rzut dopisuje tę samą liczbę do obu. Rozdzielenie jest **celowe i nośne**: cała ochrona
przed pętlą farmienia na nim stoi. Coins mogą z gry tylko wypływać, punkty tylko rosnąć.
Jeśli kiedykolwiek jakaś zmiana zacznie *drukować* coins, to jest błąd — jedyny wyjątek
to świadome, jednorazowe doładowanie od admina zamknięte flagą.

Nazewnictwo w UI: waluta to **zawsze „coins"**, ranking to **„pkt"**. Nie „monety",
nie „saldo" — te nazwy zostały zunifikowane i nie wracamy do nich.

**Saldo może być UJEMNE** — przegrana z bossem zabiera płaskie 50 coins bez przycinania
do stanu konta. Dług blokuje sklep i wpłaty (wszędzie jest warunek „stać cię?"), a wychodzi
się z niego normalną grą. Nie dorzucaj nigdzie `MAX(0, balance …)` przy odejmowaniu —
to by tę karę po cichu rozbroiło.

## Nagrody za bossa — dlaczego są takie, a nie inne

**„Walczący" to ten, kto WPŁACIŁ COINS.** Rzuty kostką nadal ranią bossa (oczka × 3)
i zdejmują większość HP, ale **nie dają żadnej nagrody** — są darmowe, więc nic nie
ryzykują, a gdyby płaciły, nagroda za bossa byłaby tylko mnożnikiem do zwykłego grania.

Cztery strumienie, wszystkie liczone z wpłaconych coins (`slCoopPayoutPlan` — **jedna**
funkcja obsługuje i rozliczenie, i podgląd „ile mi wpadnie" w panelu, żeby UI nie mogło
obiecać czegoś innego, niż wypłaci gra):

1. `contrib` — 0,7 pkt za coin + **zwrot 50% wpłaty** (procent, NIE kwota — patrz niżej),
2. `fighter` — ryczałt +40 pkt od progu 50 coins (płaski, bo ma ciągnąć do udziału),
3. `podium` — +40/+25/+15 pkt za trzy największe wpłaty,
4. `milestone` — +15 pkt przy 75%, 50% i 25% HP, **wypłacane od ręki**, wszystkim, którzy
   wpłacili DO TEJ PORY. Stąd premia za wczesne dorzucenie się: kto dopłaci po ostatnim
   progu, nie łapie żadnego.

**Zwrot MUSI być procentem, nie kwotą.** Dawne `min(50, wpłata)` zabetonowało budżet całej
ekipy: pierwsze 50 coins wracało w całości (a kara i tak wynosiła 50, więc wpłata 50 była
darmowa w obu scenariuszach), a każdy coin powyżej 50 nie wracał wcale. Nikomu nie opłacało
się wpłacić więcej niż 50 i bossa arytmetycznie nie dało się ubić.

**Podłoga ulgi po przegranej to UŁAMEK bazy** (`SL_COOP_RELIEF_FLOOR`), nie sama baza.
Wcześniej było `max(base, …)`, czyli ulga nie robiła nic: próg wracał do bazy i stał tam
na zawsze. Jeśli baza była nie do ubicia, gra wpadała w nieskończoną pętlę przegranych.

## Ukryta informacja — łatwo zepsuć, trudno zauważyć

Freeze i Curse mają się ujawniać **dopiero przy odpaleniu**. Dziennik aktywności jest
**publiczny**, więc obowiązuje zasada:

> Atak nie nazywa celu **nigdzie** — ani w dzienniku, ani na Discordzie, ani w payloadzie.

Cel nie dostaje własnego wpisu i nie widzi nic w swoim stanie gry. Wyjątek: blokada tarczą
— atak przepadł, więc nie ma już czego kryć, i tam obie strony są nazwane.

Konsekwencja przy pisaniu kodu: **nigdy nie podświetlaj ani nie filtruj po treści wpisu**.
Predykat „to mój wpis" to zawsze `entry.player_id`. Dopasowanie po nicku w tekście
natychmiast wysypałoby sekret Freeze'a.

## Pięć ścieżek cofania — muszą zostać spójne

Dodając cokolwiek, co zapisuje punkty lub coins, sprawdź wszystkie pięć:

1. cofnięcie całego dnia (`slRollbackDay`) — kasuje po `day`
2. cofnięcie ostatniego ruchu (`/admin/players/:id/undo-move`) — kasuje po `ref = move:<id>`
3. cofnięcie nagród bossa (`slRevertBossRewards`)
4. reset całej gry (`/admin/reset`)
5. wyczyszczenie gracza

Dotyczy to zwłaszcza `sl_points_log` (rozbicie punktów na kategorie). Licznik trzymany
na `sl_state` rozjechałby się po cichu — dlatego jest osobna tabela kasowalna po dniu
i po ruchu.

**Boss ma własny rejestr: `sl_boss_payouts`.** Każda wypłata i każda kara ma tam wiersz
(`kind`, `points`, `coins`, `day`, `cycle`). Cofanie **CZYTA ten rejestr, nigdy nie
przelicza wzorem** — dzięki temu zmiana stawek nie psuje cofania starych cykli, a kara
(dawniej przycinana do salda i nigdzie niezapisywana) jest wreszcie odwracalna. Wiersz
z `player_id = NULL` to znacznik przekroczonego kamienia milowego: musi powstać nawet
wtedy, gdy nie ma komu zapłacić, inaczej ten sam próg odpala się w kółko.

`sl_coop_contributions` ma `day` i `ref` (`move:<id>`) — dzięki temu cofnięcie dnia
i cofnięcie ruchu **oddają bossowi zabrane HP**. Wcześniej nie dało się tego zrobić
w ogóle. Wszystkie pięć ścieżek woła gotowe funkcje modułu: `slRevertBossDay`,
`slRevertBossDamageForRef`, `slRevertBossRewards`, `slResetBossData`,
`slClearPlayerBossData`.

## Pułapki, w które już wdepnęliśmy

- **SQL i NULL:** `a.visibility = 'hidden'` daje NULL, nie fałsz, gdy kolumna jest NULL —
  `WHERE NOT (…)` wycina wtedy WSZYSTKO. Używaj `IS`.
- **`node:sqlite` binduje liczbę JS jako REAL.** `'move:' || ?` z liczbą `16` daje
  `'move:16.0'`, nie `'move:16'` — warunek po cichu nie trafia w nic. Składaj string w JS
  i binduj jako tekst.
- **Backtick w komentarzu SQL wewnątrz `db.exec(\`…\`)` urywa template literal** i psuje
  cały plik. W komentarzach SQL pisz `"nazwa_kolumny"`, nie w backtickach.
- **Cofanie dnia parsuje `detail LIKE '%Wypchnięty%'`**, żeby znaleźć wypchniętych.
  Zmiana tego słowa w `slApplyKnockback` po cichu psuje rollback. Nowy wpis dla
  *zbijającego* celowo mówi „Zbiłeś", żeby się w to nie łapał.
- **`backfillKnockbackPoints` celowo szuka słowa „monet", nie „coins"** — czyta wpisy
  sprzed przemianowania waluty. To nie jest przeoczenie.
- **Redakcja wpisów pisze do `public_detail`**, nigdy do `detail` — bo `detail` jest
  parsowany przez narzędzia wyżej.

## Migracje przy starcie

Jednorazowe IIFE zabezpieczone flagą w `sl_meta` (wzorzec: `if (slMetaGet(FLAG)) return;`,
flaga ustawiana **w tej samej transakcji** co zmiana). Większość już się wykonała na
produkcji i jest martwa. Migracje bossa przeniosły się do `lib/boss.js`
(`runStartupMigrations`).

**Wyjątek:** przeliczanie wpłat z czasów zbiórki na obrażenia **nie jest jednorazowe** —
jego flaga trzyma numer cyklu, więc odpala się raz na każdy nowy cykl bossa. To żywa
logika, nie migracja.

**Usunięta:** `shutDownBossAndRevertRewards` — awaryjny hamulec, który gasił bossa i cofał
rozdane przez niego punkty. Zniknął razem z przebudową mechaniki, bo gasił bossa także na
**każdej świeżej instalacji**. Cofanie nagród nie zniknęło: przeniosło się do trasy
`POST /api/snakes/admin/coop/revert-rewards`, czyli da się je uruchomić kiedykolwiek,
a nie raz w życiu przy starcie.

**W jej miejsce: `relaunchBossOnce`** (flaga `boss_relaunch_v2_done`). Produkcja miała
`boss_enabled = '0'` po tamtym hamulcu, więc sam deploy by bossa nie zapalił. Ta migracja
robi to raz: ustawia `coop_threshold_override` **wprost** (w `sl_meta` mógł siedzieć stary
override, który po cichu przebiłby nowy default z kodu), domyka przeterminowaną walkę
**bez nagród i bez kar** — inaczej pierwszy tik schedulera rozliczyłby ją jako przegraną
i zabrał wszystkim po 50 coins za walkę, której nikt nie miał szans rozegrać — i startuje
świeży cykl. Flaga pilnuje, żeby **świadome wyłączenie bossa z panelu zostało wyłączeniem**:
kolejny restart go nie wskrzesza.

Nazwa flagi niesie **wersję mechaniki**. Kolejna przebudowa, która ma wystartować bossa od
nowa = podbicie numeru (`boss_relaunch_v3_done`); stara flaga zostaje i niczego nie blokuje.
Ten sam wzorzec ma baner w UI (`BOSS_NOTICE_VERSION` w `public/snakes.js`) — podbicie
wersji sprawia, że ogłoszenie wraca wszystkim, także tym, którzy zamknęli poprzednie.

## Jak testować

Nie ma testów automatycznych, więc: świeża baza, serwer na porcie testowym, `curl`.

```bash
rm -rf db && mkdir -p db
PORT=31535 ADMIN_PASSWORD=123michal node server.js &
curl -s -X POST localhost:31535/api/register -H 'Content-Type: application/json' -d '{"nickname":"Ala"}'
# ... scenariusze przez curl, token leci w nagłówku X-Token
rm -rf db   # na koniec
```

- Rzut wymaga **zdjęcia profilowego**; serwer sprawdza magiczne bajty JPEG (`FF D8`),
  więc do testów wystarczy sztuczny plik z poprawnym nagłówkiem.
- Boss bywa domyślnie wyłączony — włącz przez `POST /api/snakes/admin/coop/toggle`.
- Admin: GET/DELETE biorą `?password=`, POST bierze `{password}` w ciele.
- Zawsze `node --check server.js`, `node --check lib/boss.js` i `node --check public/snakes.js`.
  Skrypt panelu admina siedzi inline w `snakes-admin.html` — trzeba go wyciąć, żeby
  sprawdzić składnię.
- **Rzuty działają tylko w oknie gry** (pon–pt, 8:00–16:00). Testując w weekend, podnieś
  serwer z atrapą zegara: `node --require faketime.js server.js`, gdzie preload nadpisuje
  `global.Date` klasą przesuniętą o stałą różnicę. Nie modyfikuj do tego kodu projektu.
- Bossa najszybciej ustawia się w dowolnym stanie przez `POST /api/snakes/admin/coop/boss`
  z `{hp}`, a przegraną wymusza `POST /api/snakes/admin/coop/config` z `deadline_at`
  w przeszłości (rozlicza się od razu, bez czekania na tik schedulera).
- Testując front, uruchamiaj **prawdziwą funkcję wyciętą z pliku** na atrapie DOM, zamiast
  odtwarzać jej logikę w teście — inaczej testujesz swoją kopię, nie kod, który pojedzie.

## Konwencje

- **Cały tekst dla użytkownika po polsku**, łącznie z komunikatami błędów i Discordem.
- **Komentarze tłumaczą DLACZEGO**, nie co robi kod — i to jest tu cenne. Przy przenoszeniu
  kodu zabieraj je ze sobą.
- Front: `esc()` na wszystkim, co wchodzi do HTML; klasa `is-me` oznacza „to ja"
  (pionek, ranking, chipy bossa, wpisy w dzienniku); `showToast()` do informacji zwrotnej.
- Panel gracza odświeża się co 10 s — przy przerysowaniu trzeba zachowywać to, co użytkownik
  właśnie wpisuje (patrz pole wpłaty dla bossa).

## Znane, niezałatane

- **Cofanie dnia i ruchu zabiera za dużo coins.** Rzut dopisuje do salda
  `earned - curseCoinSteal`, a oba narzędzia odejmują pełne `earned` z obu kolumn. Kto był
  pod klątwą Kieszonkowiec, traci 50 coins za dużo. `sl_moves` nie pamięta dziś tej różnicy.
- **Scheduler Discorda Wordle loguje „powiadomienie wysłane"**, choć wywołanie jest
  zakomentowane.
- **~540 z 1397 linii `public/style.css` to martwy kod** po bukmacherce, ładowany na
  wszystkich stronach. Do tego `.lb-row`, `.lb-rank`, `.lb-nick` i `:root` są zdefiniowane
  po dwa razy — pierwszy zestaw jest w całości nadpisywany, więc zmiany w nim nie działają.
- **Regulamin w `snakes.html` ma zaszyte na sztywno godziny gry (8:00–16:00)** w trzech
  miejscach. Zmiana `SNAKES_PLAY_*_HOUR` sprawia, że zasady kłamią. Punkt o bossie jest
  już wolny od tego problemu — składa go `slRenderBossRules()` ze stawek przysłanych
  w payloadzie, więc jest dobrym wzorcem na resztę.
