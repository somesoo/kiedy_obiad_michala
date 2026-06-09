# PROMPT DLA CLAUDE CODE
## "Kiedy Michał idzie na obiad?" — biurowa aplikacja do obstawiania

---

Zbuduj pełną aplikację webową do codziennego obstawiania godziny, o której Michał pójdzie na obiad. Aplikacja ma działać jako biurowy icebreaker — powinna wyglądać jak prawdziwa bukmacherka, nie jak formularz zrobiony przez stażystę.

---

## STACK TECHNOLOGICZNY

- **Backend:** Node.js + Express
- **Baza danych:** SQLite (plik lokalny, bez instalacji serwera)
- **Frontend:** Vanilla HTML/CSS/JS (bez frameworków)
- **Port:** 3000
- **Deploy:** Linux Oracle 8.10 — przygotuj `ecosystem.config.js` dla PM2 i `install.sh`

---

## STRUKTURA PROJEKTU

```
michal-obiad/
├── server.js
├── package.json
├── ecosystem.config.js
├── install.sh
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── db/
    └── (tworzony automatycznie)
```

---

## MECHANIKA GRY

### Waluta
Monety nazywają się **install.sh** (skrót: `ish`). Każdy nowy gracz startuje z **100 install.sh**.

### Cykl dzienny
- Każdego dnia od **10:00 do 12:00** gracze mogą obstawiać godzinę obiadu Michała.
- O **12:00 bukmacheria zamyka się** — brak nowych zakładów.
- Michał (admin) o dowolnej porze po 12:00 klika "Michał wrócił z obiadu" i podaje dokładną godzinę wyjścia.
- System rozlicza zakłady i wyświetla wyniki.

### Obstawianie
- Gracz wybiera **przedział 15-minutowy** (np. 12:00–12:15, 12:15–12:30, ..., 14:45–15:00).
- Gracz stawia dowolną liczbę **install.sh** ze swojego salda (minimum 5, maksimum całe saldo).
- Jeden gracz może postawić tylko **jeden zakład dziennie**.
- Widać, ile monet łącznie postawiono na każdy przedział (parimutuel style).

### Algorytm rozliczenia nagród

Stosuj **system parimutuel** (jak na wyścigach konnych — pula wspólna):

```
PULA CAŁKOWITA = suma wszystkich zakładów z danego dnia

WYGRYWAJĄCY PRZEDZIAŁ = ten 15-minutowy slot, w który trafił Michał

PULA DLA WYGRANYCH = PULA CAŁKOWITA × 0.90
(10% idzie do "banku biurowego" — wyświetlaj go jako Easter egg)

DLA KAŻDEGO WYGRYWAJĄCEGO GRACZA:
  wypłata = (zakład_gracza / suma_zakładów_wygrywających) × PULA_DLA_WYGRANYCH
  
  Zaokrąglaj w dół do całkowitych install.sh.
  Reszta z zaokrąglania trafia do banku biurowego.
```

**Przypadek brzegowy — nikt nie trafił:**
Jeśli żaden gracz nie obstawił wygrywającego slotu, cała pula trafia do **banku biurowego** (kumuluje się na przyszłe wydarzenia specjalne).

**Minimalny zwrot:** Wygrywający zawsze dostaje co najmniej tyle, ile postawił (nie traci, jeśli wygrał).

**Bankrut:** Gracz z saldem 0 dostaje jednorazowy zastrzyk **20 install.sh** z banku biurowego (welfare system — żeby nikt nie wypadł z gry całkowicie).

---

## BAZA DANYCH (SQLite)

### Tabela `players`
```sql
CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT UNIQUE NOT NULL,
  balance INTEGER DEFAULT 100,
  current_streak INTEGER DEFAULT 0,   -- ile dni z rzędu trafił
  best_streak INTEGER DEFAULT 0,      -- rekord passy
  total_wins INTEGER DEFAULT 0,       -- łączna liczba trafień
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabela `bets`
```sql
CREATE TABLE bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),
  bet_date TEXT NOT NULL,           -- format YYYY-MM-DD
  slot TEXT NOT NULL,               -- format "12:00-12:15"
  amount INTEGER NOT NULL,
  placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, bet_date)       -- jeden zakład na gracza na dzień
);
```

### Tabela `results`
```sql
CREATE TABLE results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_date TEXT UNIQUE NOT NULL,
  winning_slot TEXT NOT NULL,       -- format "12:30-12:45"
  actual_time TEXT NOT NULL,        -- dokładna godzina np. "12:37"
  total_pool INTEGER NOT NULL,
  winners_count INTEGER NOT NULL,
  confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabela `bank`
```sql
CREATE TABLE bank (
  id INTEGER PRIMARY KEY,
  balance INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- wstaw jeden wiersz: INSERT INTO bank VALUES (1, 0, CURRENT_TIMESTAMP)
```

---

## API ENDPOINTS

```
POST /api/register          — rejestracja pseudonimu, zwraca player_id + token (localStorage)
GET  /api/me                — dane gracza (saldo, historia zakładów, pozycja w rankingu)
GET  /api/today             — dzisiejsze zakłady (sloty + ile monet na każdym)
POST /api/bet               — postaw zakład { slot, amount }
GET  /api/leaderboard       — ranking graczy wg salda; parametr ?highlight=<player_id>
                              zwraca TOP 10 + pozycję podanego gracza jeśli poza TOP 10
                              pola: rank, nickname, balance, is_me (bool), streak
GET  /api/history           — ostatnie 7 dni wyników
POST /api/admin/result      — [ADMIN] wpisz wynik dnia { actual_time, password }
GET  /api/bank              — stan banku biurowego
```

**Autoryzacja:** Prosty token UUID generowany przy rejestracji, przechowywany w localStorage. Bez JWT, bez sesji — to biurowa gra, nie bank.

**Admin password:** Hardcoded w pliku `.env` jako `ADMIN_PASSWORD`. Domyślnie `michal123`.

---

## DESIGN — STYL WIZUALNY

> Kluczowe: aplikacja ma wyglądać jak **bukmacherka z charakterem**, nie jak kolejny dashboard zrobiony przez AI. Inspiracja: energetyka starego totalizatora sportowego połączona z nowoczesnością.

### Paleta kolorów
```css
:root {
  --bg:           #0D0D0D;    /* prawie czarny — główne tło */
  --surface:      #161616;    /* karty, panele */
  --surface-alt:  #1E1E1E;    /* hover, drugie tło */
  --accent:       #C8F135;    /* limonkowa zieleń — główny akcent */
  --accent-dim:   #8AAA20;    /* przyciemniony akcent */
  --muted:        #444444;    /* linie, obramowania */
  --text-primary: #F0F0F0;
  --text-muted:   #777777;
  --danger:       #E85D4A;    /* przegrana / zamknięte */
  --gold:         #F5C842;    /* wygrana, bank */
}
```

### Typografia
- **Nagłówki:** `'Space Grotesk'` (Google Fonts) — bold, techniczny, nie generyczny
- **Dane, liczby:** `'JetBrains Mono'` (Google Fonts) — monospace dla liczb i slotów
- **Body:** `'Inter'` (Google Fonts)

### Layout strony głównej

Strona używa **dwukolumnowego układu** na desktop (≥900px). Na mobile kolumny stackują się pionowo — leaderboard idzie NA DÓŁ (gra jest priorytetem na małym ekranie).

```
┌─────────────────────────────────────────────────────────────────┐
│  KIEDY MICHAŁ?                    [twój nick]  [💰 340 ish]     │  ← sticky header
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  zakłady zamykają się za 1h 23m      │  ← countdown bar
├────────────────────────────────────┬────────────────────────────┤
│                                    │  LEADERBOARD               │
│  DZISIAJ · ŚRODA 12 CZERWCA        │  ────────────────────────  │
│  Łączna pula: 885 ish              │  🥇 Kacper       340 ish   │
│                                    │  🥈 Ola          280 ish   │
│  WYBIERZ SLOT                      │  🥉 Bartek       195 ish   │
│  ┌──────┐ ┌──────┐ ┌──────┐        │  4. Zuzia        160 ish   │
│  │12:00 │ │12:15 │ │12:30 │  ...   │  5. Marek        120 ish   │
│  │▓▓▓▓▓ │ │▓▓    │ │▓▓▓▓▓▓│        │  6. Ania         100 ish   │
│  │ 240  │ │  85  │ │ 320  │        │  7. [ty]  →      100 ish   │  ← wyróżniony
│  └──────┘ └──────┘ └──────┘        │  ...                       │
│                                    │  ────────────────────────  │
│  Stawiam: [████░░░░] 50 ish        │  OSTATNIE WYNIKI           │
│  na slot: 12:30–12:45              │  12 cze · 12:30 ✓  3 traf. │
│  [Postaw zakład]                   │  11 cze · 13:00 ✓  1 traf. │
│                                    │  10 cze · brak trafień     │
│                                    │  9 cze  · 12:45 ✓  2 traf. │
└────────────────────────────────────┴────────────────────────────┘
```

**Leaderboard — prawa kolumna, sticky:**
- `position: sticky; top: 64px` (klei się do góry przy scrollowaniu, pod headerem)
- `max-height: calc(100vh - 80px); overflow-y: auto` — jeśli graczy jest wielu, sam się scrolluje
- Odświeża się **co 15 sekund** (osobny fetch, nie blokuje reszty strony)
- Wiersz zalogowanego gracza zawsze wyróżniony: tło `--accent` 12% opacity, nick w kolorze `--accent`
- Jeśli zalogowany gracz jest poza TOP 10 — leaderboard pokazuje TOP 9 + separator "···" + wiersz gracza z jego aktualną pozycją (np. `#14`)
- Medale tylko dla TOP 3: `🥇 🥈 🥉` — reszta to zwykłe numery
- Zmiana salda po rozliczeniu: animowany "ticker" — liczba scrolluje się do nowej wartości (CSS counter animation)
- Kolumna salda wyrównana do prawej, monospace font (`JetBrains Mono`)
- Pod tabelą: mały licznik `[N] graczy w grze`

### Szczegóły UI

**Sloty czasu:**
- Grid 15-minutowych bloków od 12:00 do 15:00 (13 slotów)
- Każdy slot pokazuje: godzinę + łączną kwotę monet na nim
- Wysokość słupka = wizualna proporcja względem największego slotu (mini barchart)
- Kliknięty slot: obramowanie `--accent`, delikatne tło `accent` 10% opacity
- Po zamknięciu (po 12:00): sloty szare, nieaktywne, komunikat "Bukmacheria zamknięta"

**Pasek countdown:**
- Pokazuje czas do zamknięcia zakładów (jeśli przed 12:00)
- Lub czas od zamknięcia (jeśli po 12:00, czekamy na wynik Michała)
- Thin progress bar pod headerem

**Formularz zakładu:**
- Suwak od 5 do max (całe saldo gracza)
- Pole numeryczne zsynchronizowane z suwakiem
- Przycisk: "Stawiam [X] install.sh na [slot]"
- Po potwierdzeniu — animowany konfetti z emoji 🍽️

**Panel admina:**
- Ukryta ścieżka `/admin` — prosty formularz z hasłem
- Wpisz dokładną godzinę wyjścia Michała (time picker)
- Przycisk "Zamknij dzień i rozlicz"
- Wyświetla podgląd wyników przed finalnym zatwierdzeniem

**Wyniki dnia:**
- Po rozliczeniu pojawia się "breaking news" banner
- Wygrywający slot podświetlony złotem
- Lista wygranych graczy + ile dostali
- Przegrani: blade wyświetlenie ich slotu z ❌

**Stan banku biurowego:**
- Małe licznik w footerze: "🏦 Bank biurowy: X install.sh"
- Tooltip/modal po kliknięciu z historią wpłat do banku

### Animacje (subtelne, celowe)
- Liczby salda: animowany "roll" przy zmianie (cyfry przelatują)
- Slot po postawieniu zakładu: krótki pulse w kolorze `--accent`
- Wyniki: poszczególne karty wlatują z góry z opóźnieniem (staggered)
- NIE: nie rób parallax, particle effects ani innych ozdobników

---

## PANEL ADMINA `/admin`

```
┌────────────────────────────────────┐
│  PANEL MICHAŁA                     │
│                                    │
│  Hasło: [____________]  [Wejdź]    │
│                                    │
│  Dzisiaj zagrano: X zakładów       │
│  Łączna pula: Y install.sh         │
│                                    │
│  O której wyszedłeś?               │
│  [12] : [37]  (HH:MM)             │
│                                    │
│  Podgląd wyników:                  │
│  • Wygrywający slot: 12:30-12:45   │
│  • Wygranych: 3 graczy             │
│  • Pula do podziału: 189 ish       │
│                                    │
│  [Zatwierdź i rozlicz dzień]       │
└────────────────────────────────────┘
```

---

## INSTALL.SH — SKRYPT INSTALACYJNY

Plik `install.sh` musi:

```bash
#!/bin/bash
# Sprawdź Node.js >= 18
# npm install
# Utwórz .env jeśli nie istnieje (z losowym ADMIN_PASSWORD jeśli nie podano)
# Zainicjalizuj bazę SQLite (uruchom migracje)
# Zainstaluj PM2 globalnie jeśli nie ma
# pm2 start ecosystem.config.js
# pm2 save
# pm2 startup (pokaż komendę do uruchomienia)
# Wyświetl: "Aplikacja działa na http://localhost:3000"
```

`ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'michal-obiad',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    restart_delay: 3000,
    max_restarts: 10
  }]
}
```

---

## EDGE CASES DO OBSŁUŻENIA

1. **Gracz próbuje obstawić po 12:00** → błąd "Bukmacheria zamknięta, jutro spróbuj szczęścia"
2. **Gracz próbuje obstawić drugi raz tego samego dnia** → błąd "Jeden zakład dziennie — to nie kasyno"
3. **Gracz ma za mało monet** → błąd "Za mało install.sh. Obecne saldo: X"
4. **Admin próbuje zamknąć dzień przed 12:00** → ostrzeżenie z potwierdzeniem
5. **Weekend / dzień bez gry** → info "Michał dzisiaj nie idzie na obiad (weekend?)" — ale gra jest dostępna jeśli admin chce
6. **Gracz z saldem 0** → automatyczny welfare 20 ish z banku, komunikat "Dostałeś 20 install.sh z kasy biurowej. Nie trać ich."
7. **Zduplikowane nickname** → błąd "Ten nick jest zajęty, wymyśl coś lepszego"
8. **Połączenie zrywa się podczas stawiania zakładu** → idempotentny endpoint (sprawdzaj czy zakład już istnieje przed zapisem)

---

## DODATKOWE SMACZKI (opcjonalne, ale mile widziane)

- **Streak badge:** Jeśli gracz trafił X dni pod rząd — badge "🔥 passa X dni"
- **Epitafium przegranej:** Przy zerowym saldzie mały komunikat "R.I.P. [nick]'s install.sh (2024-2024)"
- **Losowy komentarz Michała:** Po wpisaniu wyniku — losowa fraza wyświetlana graczom (np. "Michał twierdzi, że miał *pilne sprawy*" / "Znowu kolejka w Żabce")
- **Historia osobista:** Gracz może zobaczyć swoje wszystkie zakłady z ostatnich 14 dni
- **Najbliższy miss:** "Grałeś na 12:30, Michał wyszedł o 12:31. Mogłeś wygrać." 💔

---

## WYMAGANIA NIEFUNKCJONALNE

- Aplikacja musi działać bez internetu (wszystkie fonty przez CDN są OK, ale core działa offline)
- Brak rejestracji emailem — tylko nickname
- Brak cookies poza sessionStorage/localStorage
- Mobile-friendly — kolumny slotów zawijają się na małych ekranach
- Wszystkie kwoty wyświetlaj z jednostką: `240 ish` (nie samo `240`)
- Czas zawsze w strefie Europe/Warsaw

---

## KOLEJNOŚĆ IMPLEMENTACJI

1. Baza danych + migracje
2. API endpoints (bez autentykacji — prosty token UUID)
3. HTML szkielet strony głównej
4. CSS (paleta, typografia, grid slotów)
5. JavaScript frontendu (rejestracja, obstawianie, odświeżanie co 30s)
6. Panel admina
7. Algorytm rozliczenia z testami
8. `install.sh` i `ecosystem.config.js`
9. Sprawdź edge cases

---

Zbuduj to jako jedną spójną aplikację. Kod ma być czysty, z komentarzami po polsku tam gdzie logika jest nieoczywista. Nie twórz pliku README — kod ma mówić sam za siebie.
