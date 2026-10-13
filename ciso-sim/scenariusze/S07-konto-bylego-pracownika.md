# S07. Konto byłego pracownika

| | |
|---|---|
| **Firmy** | fabryka (handlowiec → konkurencja) — wariant główny; gmina (były sekretarz / zleceniobiorca IT); sklep (agencja marketingowa po zakończeniu umowy) |
| **Rodzaj** | insider / JML — aktywne konto osoby, która odeszła; wyniesienie danych |
| **Trudność** | ★★ |
| **Czas gry / realny** | 14 dni / 20 min |
| **Zegary** | **UODO 72 h** (dane kontaktowe osób w CRM to dane osobowe), zabezpieczenie dowodów (logi rotują!), terminy procesowe 🔵 |
| **Inspiracja** | jeden z najczęstszych realnych wzorców w małych i średnich organizacjach: brak spięcia kadr z IT |
| **Cele** | E4, E9, E11 (proces JML), prawo pracy i RODO w dochodzeniu wewnętrznym |

## Prawda (wariant fabryki)

Handlowiec Metalpolu odszedł 5 tygodni temu do konkurencji (rozwiązanie za porozumieniem,
bez okresu wypowiedzenia — „żeby było miło"). Kadry wysłały do IT maila o odejściu…
na adres byłego kierownika IT, którego skrzynka jest przekierowana donikąd. Konto VPN
i CRM działa. Przez 3 tygodnie były pracownik logował się nocą i wyeksportował: bazę
klientów (1 400 firm z osobami kontaktowymi — imiona, nazwiska, telefony, e-maile), cenniki
indywidualne, historię ofert. Konkurencja zaczęła składać klientom Metalpolu oferty
„o 3% taniej".

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `jml` spięte z kadrami | konto wyłączone w dniu odejścia → **scenariusz nie startuje**; zamiast niego karta „były pracownik próbował się logować" (log, zero skutków) |
| `sso` | jedno wyłączenie odcina wszystko (bez SSO: VPN wyłączony, CRM — nie) |
| SIEM/MDR z regułą „logowanie konta osoby nieaktywnej w HR" albo „nocne eksporty z CRM" | wykrycie po pierwszej nocy |
| `dlp` (z klasyfikacją) | alert przy eksporcie bazy klientów |
| regulamin IT podpisany + polityka monitorowania (art. 22³ KP — pracownicy poinformowani o monitoringu poczty i systemów) | dowody z monitoringu są do wykorzystania |
| logi VPN/CRM ≥ 90 dni | pełna oś czasu; bez — tylko ostatnie 7 dni |

## Przebieg

### Faza 1 — T+0: „klienci dostają oferty od konkurencji"

Dyrektor handlowy: trzech dużych klientów dostało oferty konkurencji z cenami „dziwnie
blisko naszych indywidualnych". Prosi o sprawdzenie, „czy ktoś nam nie wykradł danych".

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Przegląd kont osób, które odeszły w ostatnich 12 mies.** (porównanie listy z kadr z aktywnymi kontami we wszystkich systemach) | 6 h | znajduje konto handlowca (i 4 inne martwe konta) | ✅ |
| Od razu wyłączenie konta handlowca | 5 min | zamyka dostęp; **ale** najpierw warto zabezpieczyć dowody — logi potrafią się nadpisać | ⚠️ zabezpiecz i wyłącz w tej samej godzinie |
| Przeszukanie skrzynek obecnych handlowców „czy ktoś nie pomaga konkurencji" | 8 h | narusza zasady monitoringu, jeśli nie było poinformowania; zaufanie zespołu −; potencjalnie nielegalne | ❌ |
| Konfrontacja telefoniczna z byłym pracownikiem | 30 min | ostrzega go; kasuje ślady po swojej stronie | ❌ |

### Faza 2 — T+4 h: dowody

| Opcja | Ocena |
|---|---|
| **Zabezpieczenie logów** (VPN, CRM — kto, kiedy, co eksportował) z sumami kontrolnymi, notatka z czynności (kto, kiedy, jak) | ✅ |
| Kopia konfiguracji i list uprawnień konta | ✅ |
| Prawnik (prawo pracy / nieuczciwa konkurencja) od początku | ✅ |
| „Przyciśnięcie" byłego pracownika przez wspólnych znajomych | ❌ |

### Faza 3 — T+24 h: obowiązki

| Pytanie | Dobra odpowiedź | Ocena |
|---|---|---|
| Czy to naruszenie ochrony danych osobowych? | Tak — dane osób kontaktowych (imiona, nazwiska, telefony, e-maile służbowe) zostały pozyskane przez osobę nieuprawnioną. Ocena ryzyka: średnie (dane kontaktowe B2B, ryzyko phishingu/niechcianych ofert). **Zgłoszenie do UODO w 72 h** — zalecane przy tej skali; udokumentuj ocenę | ✅ |
| Zawiadomienie osób kontaktowych? | Raczej nie wymagane (ryzyko nie „wysokie"), ale komunikat do klientów („możecie dostać oferty powołujące się na nasze dane") to dobra praktyka i ochrona relacji | ⚠️/✅ |
| Zawiadomienie o przestępstwie | **art. 267 kk** (uzyskanie dostępu do systemu bez uprawnienia — ważne: uprawnienie wygasło z końcem zatrudnienia), naruszenie **tajemnicy przedsiębiorstwa** (ustawa o zwalczaniu nieuczciwej konkurencji) — decyzja zarządu z prawnikiem | ✅ (rekomendacja) |
| KSC | dotyczy poufności danych handlowych, nie świadczenia usług — zwykle **nie** incydent poważny; udokumentuj | ✅ |

### Faza 4 — T+3 … T+14 dni: naprawa procesu

| Decyzja | Koszt | Ocena |
|---|---|---|
| **Proces JML z kadrami**: odejście = zgłoszenie w systemie (nie mail do osoby), wyłączenie w dniu odejścia, lista systemów, potwierdzenie | 60 h + mandat (kadry) | ✅ |
| Kwartalny przegląd kont (porównanie z kadrami) | 10 h/kw. | ✅ |
| SSO dla kluczowych systemów (jedno odcięcie) | `sso` | ✅ |
| Reguła wykrywania „konto osoby nieaktywnej" i „nocny eksport" | SIEM/MDR | ✅ |
| Ograniczenie eksportu z CRM (uprawnienia, limity) | 16 h, tarcie +1 | ✅ |
| Polityka monitorowania + informacja dla pracowników (art. 22³ KP) | 20 h | ✅ (i warunek legalnych dowodów w przyszłości) |

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 15 | przegląd wszystkich kont osób, które odeszły (nie tylko jednej) |
| 15 | zabezpieczenie dowodów przed wyłączeniem / w tej samej godzinie |
| 10 | brak konfrontacji i brak nielegalnego przeszukiwania skrzynek |
| 15 | ocena RODO + zgłoszenie do UODO |
| 10 | prawnik + rekomendacja zawiadomienia (art. 267 kk, tajemnica przedsiębiorstwa) |
| 25 | proces JML z kadrami + przegląd kwartalny |
| 10 | ograniczenie eksportów / wykrywanie |

## Debrief

- **Najtańsza kontrola w grze**: spięcie kadr z IT. Konto osoby, która odeszła, to otwarte drzwi
  z kluczem, który ktoś ma w kieszeni.
- **Dowody najpierw, ale szybko.** Logi rotują; w wielu firmach VPN trzyma 7 dni.
- **Monitorowanie pracowników ma ramy prawne** (Kodeks pracy — m.in. poinformowanie o
  monitoringu poczty; RODO). Dochodzenie wewnętrzne bez tych podstaw może dać dowody, których
  nie da się użyć — i naruszyć prawo.
- **Dane kontaktowe B2B to też dane osobowe.**

## Warianty

- **Gmina**: były zleceniobiorca IT ma admina domeny „z domu"; nie kradnie, ale po sporze
  o rozliczenie **blokuje konta** urzędników w poniedziałek rano (sabotaż). Dochodzą:
  ciągłość obsługi mieszkańców, KRI, polityka (wójt vs były zleceniobiorca — znajomy radnego).
- **Sklep**: agencja marketingowa po zakończeniu współpracy ma dalej konto admina w panelu
  sklepu i dostęp do narzędzia mailingowego — wysyła „ostatni newsletter" z przeprosinami
  i… linkiem do konkurencji. Wyciek bazy mailingowej (RODO, 900 tys. adresów).

## Pytania do dyskusji

1. Ile dni mija w Waszej firmie od odejścia pracownika do wyłączenia wszystkich jego kont?
   Skąd IT się dowiaduje?
2. Czy pracownicy są poinformowani o zasadach monitorowania systemów?
3. Kto (poza IT) ma konto administratora w Waszych systemach — agencje, zleceniobiorcy, dostawcy?
