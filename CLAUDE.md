# Kiedy obiad Michała — notatki dla Claude

Biurowe gry dla ~15 osób. Jeden plik `server.js` (~4900 linii, Express), front to czysty
JS/HTML/CSS w `public/` — **bez bundlera i bez kroku budowania**. Baza: SQLite przez
`node:sqlite`. Wdrożenie: pm2 na małym VPS-ie, właściciel przeładowuje ręcznie.

**Nie ma testów, lintera ani CI.** Każda zmiana musi być sprawdzona ręcznie (patrz
„Jak testować"). To główny powód, dla którego duże refaktory są tu złym pomysłem.

## Co jest w środku

| Obszar | Gdzie | Stan |
|---|---|---|
| **Snakes & Ladders** (prefiks `sl*`) | ~74% `server.js`, `public/snakes*` | **aktywna gra, tu idzie cała praca** |
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
flaga ustawiana **w tej samej transakcji** co zmiana). Sześć z nich już się wykonało na
produkcji i jest martwych.

**Wyjątek:** `convertLegacyContributionsToDamage` **nie jest jednorazowa** — jej flaga trzyma
numer cyklu, więc odpala się raz na każdy nowy cykl bossa. To żywa logika, nie migracja.

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
- Zawsze `node --check server.js` i `node --check public/snakes.js`. Skrypt panelu admina
  siedzi inline w `snakes-admin.html` — trzeba go wyciąć, żeby sprawdzić składnię.
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
- **Regulamin w `snakes.html` ma zaszyte na sztywno stałe sterowane przez `.env`** (godziny
  gry, przelicznik punktów, kary). Zmiana zmiennej sprawia, że zasady kłamią.
