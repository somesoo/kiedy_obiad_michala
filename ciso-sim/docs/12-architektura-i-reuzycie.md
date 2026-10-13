# 12. Architektura i reużycie z repo

## 12.1. Założenia

- **Osobna aplikacja** w `ciso-sim/`: własny `package.json`, własny serwer, własna baza,
  własny proces pm2, własny port i ścieżka (np. `cyber.<domena>` albo `/linia`). Nic nie
  importuje z `../server.js` ani `../lib/` — to, co warto, **kopiujemy i dostosowujemy**
  (wzorce, nie zależności). Powód: Snakes ma `testing: false` i żywych graczy; nowa gra nie
  może go przypadkiem położyć ani odwrotnie.
- **Ten sam stos co reszta repo**, bo właściciel go zna i ma gdzie wdrożyć: Node 22, Express,
  SQLite przez `node:sqlite`, front czysty JS/HTML/CSS **bez bundlera i kroku budowania**.
  To ograniczenie jest dobre dla gry turowej: stan liczy serwer, front tylko rysuje.
- **Nowy design** (osobny język wizualny — „konsola SOC / gabinet zarządu"), nie motyw Snakes.

## 12.2. Co bierzemy z `kiedy_obiad_michala` (wzorce sprawdzone na produkcji)

| Wzorzec | Gdzie w repo | Po co w nowej grze |
|---|---|---|
| **Fabryka modułu** `require('./lib/x')({ db, transaction, … })` — moduł dostaje helpery, nie importuje ich z powrotem | `lib/boss.js`, `lib/shop.js`, opis w `CLAUDE.md` | silnik, kampanie, incydenty, zarząd, rejestr — każdy jako fabryka; jeden uchwyt bazy (bez „database is locked") |
| **Plik danych zamiast kodu** + walidacja przy starcie (zły plik nie trafia na listę, powód w logu) | `boards/*.js` + `lib/seasons.js` | `data/*.js`, `scenariusze/*.js` (format w `scenariusze/README.md`) — scenariusz to dane, logika w silniku |
| **Rejestry zdarzeń zamiast liczników**; cofanie i podsumowania **czytają rejestr, nie przeliczają wzorem** | `sl_points_log`, `sl_boss_payouts`, `sl_season_ledger` | rejestr kampanii (`03-…`, 3.10) — na nim stoi debrief i Jakość Decyzji |
| **`ref` grupujący wpisy jednej tury/zdarzenia**, front rysuje blok | `sl_activity.ref`, `slNewTurnRef()` | jeden incydent = jeden blok w dzienniku; jedna decyzja = jeden blok skutków |
| **Ukryta informacja**: „atak nie nazywa celu nigdzie" — ani w dzienniku, ani w payloadzie | sekcja „Ukryta informacja" w `CLAUDE.md` | mgła wojny: **payload nigdy nie niesie prawdy z silnika**, tylko oszacowania. Test: czy da się wyczytać prawdę z odpowiedzi API? |
| **Kopie zapasowe** `VACUUM INTO` + przywrócenie przez znacznik i restart | `lib/backups.js` | ten sam moduł (z nazwami plików nowej bazy) |
| **Wersjonowanie frontu** `?v=<hash>` z listy plików | `SNAKES_SCRIPTS`, `VERSIONED_ASSETS` w `server.js` | to samo — przeglądarki nie zostają przy starym JS po wdrożeniu |
| **Migracje przy starcie** z flagą w tabeli meta, flaga w tej samej transakcji | `slMetaGet/Set`, IIFE migracji | to samo, od pierwszego dnia (gra będzie zmieniać schemat) |
| **Czas Warszawy, dni robocze** (czyste funkcje) | `lib/time.js` | kalendarz realny (terminy KSC, okno gry w biurze) — kopia 1:1 |
| **Okno gry** (godziny pracy, weekendy) z panelu | `slPlayHours()` | tryb biurowy: tura dzienna tylko w godzinach pracy |
| **Panel admina** z kartami | `routes/snakes-admin.js`, `snakes-admin.html` | prowadzący: lista graczy, podgląd kampanii, reset, przełączenie fali, tryb szkolenia |
| **Odświeżanie co 10 s z zachowaniem tego, co użytkownik wpisuje** | pole wpłaty bossa | skrzynka decyzji i raport dla zarządu (gracz pisze — nie kasować) |
| **Tekst po polsku, komentarze „dlaczego"** | cały repo | to samo |

### Pułapki z repo, które przenosimy jako zasady

- `node:sqlite` binduje liczbę JS jako REAL: `'move:' || ?` z 16 → `'move:16.0'`. **Klucze
  `ref` składamy w JS i bindujemy jako tekst.**
- `a.kolumna = 'x'` z NULL daje NULL — **używać `IS`**.
- Backtick w komentarzu SQL wewnątrz `` db.exec(`…`) `` urywa template literal.
- **Nie budować stanu gracza wewnątrz `transaction()`**, jeśli stan sam otwiera transakcję
  (`BEGIN` w `BEGIN` → 500). Stan buduje się po zamknięciu transakcji.
- TDZ przy fabrykach: kod startowy woła tylko to, co podpięto wyżej.

## 12.3. Czego NIE bierzemy (i dlaczego) — gra o bezpieczeństwie musi być bezpieczna

Obecne repo jest grą biurową dla zaufanej grupy i ma uproszczenia, które w grze **o
cyberbezpieczeństwie** byłyby kompromitacją:

| W repo | Problem | W nowej grze |
|---|---|---|
| `/api/register` z istniejącym nickiem **zwraca token tego gracza** | każdy, kto zna nick, przejmuje konto (account takeover) | rejestracja ≠ logowanie; logowanie hasłem |
| Token = UUID w nagłówku, bez wygasania | wieczny token, brak wylogowania | sesja z wygasaniem, odnawianie, wylogowanie wszędzie |
| Hasło admina z env z domyślną wartością w kodzie (`'123michal'`) | domyślne hasło = hasło publiczne | brak domyślnego; serwer **nie wstaje** bez ustawionego hasła admina w produkcji |
| Admin: `GET ?password=` w URL | hasło w logach serwera, historii przeglądarki, logach proxy | admin loguje się jak gracz (rola `admin`), hasło tylko w ciele POST |
| Brak limitu prób | zgadywanie haseł | limit prób na konto i IP, opóźnienie rosnące |

Ciekawostka do wykorzystania: **ten sam błąd z rejestracją może być scenariuszem** w kampanii
software house'u („nasza aplikacja zwraca token po samym loginie" — zalążek Z20). Gra o
bezpieczeństwie z przykładem z własnego podwórka.

## 12.4. Logowanie i konta (wymagania)

- **Hasła**: `crypto.scrypt` (wbudowany w Node, bez zależności) z solą per użytkownik i
  parametrami N=2^15, r=8, p=1 (do strojenia na VPS); porównanie `crypto.timingSafeEqual`.
  Minimalna długość 12 znaków, sprawdzanie na liście najpopularniejszych haseł (lokalny plik),
  **bez** wymuszania znaków specjalnych i okresowej zmiany (zgodnie z aktualnymi zaleceniami NIST).
- **Sesje**: losowy identyfikator 32 bajty (`crypto.randomBytes`), w bazie tylko **skrót**
  (SHA-256) sesji; ciasteczko `HttpOnly; Secure; SameSite=Lax; Path=/`; wygasanie 12 h
  bezczynności / 30 dni maks.; lista aktywnych sesji i „wyloguj wszędzie".
- **Limit prób**: 5 nieudanych na konto w 15 min → opóźnienie; licznik na IP; komunikat
  błędu nie zdradza, czy konto istnieje.
- **CSRF**: ciasteczko `SameSite=Lax` + nagłówek `X-Requested-With`/token dla POST z formularzy.
- **Role**: `gracz`, `prowadzacy` (trener: tryb szkolenia, podgląd grupy), `admin`.
- **Zakładanie kont**: zaproszenie od admina (link jednorazowy z terminem) — to gra dla
  zamkniętej grupy; bez otwartej rejestracji.
- **Opcjonalnie później**: TOTP (MFA) dla admina i prowadzących — gra o MFA powinna je mieć.
- **Nagłówki**: CSP bez `unsafe-inline` dla skryptów (front bez inline JS — inaczej niż
  `snakes-admin.html`), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- **Dane osobowe**: minimum (nick, e-mail do zaproszeń opcjonalnie); retencja; możliwość
  usunięcia konta. Gra o RODO powinna być wzorem RODO.

## 12.5. Struktura aplikacji (proponowana)

```
ciso-sim/
  package.json            — express (jedyna zależność produkcyjna), skrypty
  server.js               — spinanie: Express, baza, sesje, podpięcie fabryk (cienki!)
  lib/
    auth.js               — hasła (scrypt), sesje, limity, role         [fabryka]
    time.js               — kopia z repo (czas Warszawy)
    backups.js            — kopia z repo (nowe nazwy plików)
    rng.js                — deterministyczny generator (mulberry32) + ziarno kampanii
    engine/
      threats.js          — silnik zagrożeń (z proto/symulacja.js)       [czysty, bez bazy]
      controls.js         — skuteczność, godziny, alerty                  [czysty]
      month.js            — symulacja miesiąca: łączy powyższe            [czysty]
    campaign.js           — stan kampanii, tura, decyzje, rejestr        [fabryka]
    incidents.js          — tryb incydentu: scenariusze, zegary          [fabryka]
    board.js              — zarząd: raporty, mandat, osobowości           [fabryka]
    scoring.js            — Indeks Odporności, Jakość Decyzji, debrief    [fabryka]
    world.js              — warstwa wspólna: fale, ISAC                   [fabryka]
  data/                   — kontrole, zagrożenia, firmy, polityki, dostawcy (pliki danych)
  scenariusze/            — scenariusze incydentów (pliki danych) + walidacja
  public/                 — front (kilka zwykłych <script>, kolejność jak w Snakes)
  db/                     — baza (w .gitignore)
```

**Silnik jest czysty** (bez bazy, bez Express): wejście = stan + decyzje + ziarno, wyjście =
nowy stan + wpisy rejestru. Dzięki temu:
- ten sam kod liczy grę i Monte Carlo do oceny decyzji (`11-…`),
- da się go testować bez serwera (w tym repo nie ma testów — **ta gra powinna je mieć od
  początku**, choćby `node --test` na silniku; CLAUDE.md repo mówi, że brak testów to główny
  powód, dla którego duże zmiany są tu ryzykowne).

### Baza (szkic tabel)

```
users(id, login, pass_hash, pass_salt, role, created_at, disabled)
sessions(id_hash, user_id, created_at, last_seen, expires_at, ip, ua)
login_attempts(key, count, window_start)
campaigns(id, user_id, company_id, seed, month, status, started_at, ended_at)
campaign_state(campaign_id, json)         — stan PRAWDZIWY (silnik); nigdy w payloadzie
campaign_view(campaign_id, json)          — stan WIDZIANY (oszacowania) — to idzie do frontu
ledger(id, campaign_id, month, week, kind, metric, delta, ref, note, knowledge_json)
decisions(id, campaign_id, month, card_id, option_id, ref, knowledge_json, score_json)
incidents(id, campaign_id, scenario_id, phase, clock_json, ref, status)
world_events(id, kind, starts_at, ends_at, params_json)
isac_shares(id, campaign_id, world_event_id, shared_at)
meta(key, value)                          — flagi migracji, ustawienia
```

Rozdział `campaign_state` / `campaign_view` to techniczna gwarancja mgły wojny: front
dostaje tylko `view`. Każda trasa API, która by zwracała `state`, jest błędem.

## 12.6. Front

- Ekrany: **Pulpit** (briefing, wskaźniki, kalendarz), **Decyzje** (skrzynka), **Budżet i
  godziny** (kolejka), **Kontrole** (katalog + wdrożenia), **Polityki**, **Ludzie**,
  **Dostawcy**, **Ryzyka**, **Zarząd** (raport), **Dziennik** (rejestr w blokach),
  **Incydent** (tryb operacyjny: oś czasu, zegary, wiedza, decyzje, komunikacja).
- Telefon: tryb biurowy musi działać na telefonie (decyzje miesiąca), tryb incydentu — na
  komputerze lub telefonie w orientacji pionowej (karty decyzji jedna pod drugą).
- Dostępność: kontrast, pełna obsługa klawiaturą, bez informacji przekazywanej tylko kolorem
  (zegary mają też liczby i ikony).
- `esc()` na wszystkim, co wchodzi do HTML (jak w repo) — scenariusze to pliki z treścią,
  a treść kiedyś napisze ktoś inny.

## 12.7. Wdrożenie

- Osobny proces pm2 (`ecosystem.config.js` dostanie drugą aplikację albo osobny plik),
  osobny port, reverse proxy z TLS.
- Kopie bazy jak w repo (moduł `backups.js`).
- Zmienne środowiskowe: `CISO_SIM_PORT`, `CISO_SIM_ADMIN_LOGIN`, `CISO_SIM_ADMIN_INITIAL_PASSWORD`
  (jednorazowe — wymuszona zmiana przy pierwszym logowaniu), `NODE_ENV=production`
  (włącza `Secure` na ciasteczkach i odmowę startu bez konfiguracji).
