# S01. Faktura z nowym numerem konta

| | |
|---|---|
| **Firmy** | biuro rachunkowe (samouczek), gmina (wariant: wykonawca drogi), fabryka (dostawca stali), wodociągi (dostawca chemii) |
| **Rodzaj** | BEC — przejęta skrzynka kontrahenta, przechwycony wątek, fałszywy rachunek |
| **Trudność** | ★ (samouczek) |
| **Czas gry / realny** | ok. 3 dni (T+0 … T+72 h) / 15–20 min |
| **Zegary** | **bank** (liczą się godziny), policja, RODO 72 h (jeśli przejęta jest NASZA skrzynka), KSC (rzadko: tylko podmioty objęte i tylko gdy incydent poważny) |
| **Inspiracja** | powszechny wzorzec oszustw „na zmianę rachunku" (ostrzeżenia banków, CERT Polska); wycieki danych z serwisów fakturowych w 2026 r. zwiększają wiarygodność takich maili |
| **Cele** | E2 (proste procedury), E6 (zegary), E10 (komunikacja), E9 (procedura vs pośpiech) |

## Warunki wyzwolenia

- Silnik: udany wektor `bec` (albo skrypt kampanii: samouczek m. 1–2, gmina m. 2–5).
- Kwota zależna od firmy: biuro — **38 600 zł** (płatność klienta biura, którą biuro realizuje
  w jego imieniu), gmina — **486 200 zł** (rata za remont drogi), fabryka — **1 184 000 zł**,
  wodociągi — **92 300 zł**.

## Prawda

Skrzynka pocztowa kontrahenta (realnego dostawcy, z którym firma pracuje od lat) została
przejęta 3 tygodnie temu przez phishing (fałszywe logowanie do poczty, brak MFA u
kontrahenta). Przestępca czytał korespondencję, poczekał na wątek o płatności i odpisał
**w tym samym wątku** z prawdziwej skrzynki: „W związku ze zmianą banku prosimy o wpłatę na
nowy rachunek, aktualna faktura w załączniku". PDF ma nowy numer rachunku. Ustawił regułę
w skrzynce kontrahenta, która chowa odpowiedzi od naszej firmy.

Nasza skrzynka **nie** jest przejęta (wariant trudniejszy dla kampanii z dużym długiem: jest —
patrz „Warianty").

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `weryfikacja_platnosci` (adopcja ≥ 60%) | księgowa oddzwania na numer z kartoteki → kontrahent zaprzecza → **przelew nie wychodzi**. Scenariusz startuje od fazy 2B (próba udaremniona). |
| sprawdzanie **białej listy VAT** w procedurze | nowy rachunek nie figuruje w wykazie → czerwona flaga (płatność > 15 000 zł na rachunek spoza wykazu = brak kosztu podatkowego i solidarna odpowiedzialność za VAT) |
| porównanie z fakturą w **KSeF** (od 2026) | faktura ustrukturyzowana w KSeF, wystawiona przez prawdziwego sprzedawcę, ma stary numer rachunku 🟡 *(pole rachunku w FA(3) — do potwierdzenia, czy zawsze wypełnione)* → rozbieżność z PDF-em z maila |
| `szkolenia` (program, nie test) | 40% szans, że księgowa sama zgłosi „dziwną zmianę konta" |
| `poczta` (DMARC itd.) | nie pomaga — mail przyszedł z prawdziwej, przejętej skrzynki. **Ważna lekcja**: filtry nie zatrzymają maila od prawdziwego kontrahenta. |
| nic z powyższych | przelew wychodzi. Scenariusz startuje od fazy 1 (wykrycie po 6 dniach). |

## Przebieg

### Faza 1 — T+0: „Dlaczego nie zapłaciliście?" (gdy przelew wyszedł)

Poniedziałek 9:10. Dzwoni prawdziwy kontrahent: płatność nie wpłynęła, a termin minął
w czwartek. Księgowa mówi, że zapłaciła w środę, „na nowy rachunek, który przysłaliście".
Kontrahent: „Nie zmienialiśmy rachunku".

**Co gracz wie:** przelew wyszedł 5 dni temu (pewne); na rachunek w innym banku (pewne);
skrzynka kontrahenta prawdopodobnie przejęta (prawdopodobne); nasza skrzynka? (nie wiadomo).

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Natychmiast dzwonisz do banku** (infolinia dla firm / opiekun): zgłoszenie oszustwa, prośba o kontakt z bankiem odbiorcy i blokadę środków | 15 min | szansa odzyskania zależy od czasu: po 5 dniach — mała (10–20%), ale niezerowa; bank uruchamia procedurę | ✅ pierwsza minuta należy do banku |
| Najpierw ustalasz, „czyja to wina" (zebranie z księgową i prezesem) | 2 h | szansa odzysku spada; księgowa się zamyka | ❌ szukanie winnych przed ratowaniem pieniędzy |
| Piszesz maila do kontrahenta z prośbą o wyjaśnienie | 10 min | **mail czyta przestępca** (reguła w przejętej skrzynce) — wie, że go wykryto, szybciej wyprowadza środki | ❌ nie używaj kanału, który mógł zostać przejęty |
| Prosisz prezesa o decyzję, co robić | 1 h (prezes w drodze) | opóźnienie | ⚠️ zarząd trzeba poinformować, ale nie pytać o zgodę na telefon do banku |

### Faza 2A — T+30 min: zgłoszenia i dowody

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Zawiadomienie o przestępstwie** (policja / CBZC) — z danymi przelewu, rachunkiem odbiorcy, mailami **z pełnymi nagłówkami** | 2 h | wymagane przez bank do dalszych działań; wzmacnia szansę zablokowania rachunku słupa | ✅ |
| Zabezpieczenie maila (eksport .eml z nagłówkami), PDF-a, potwierdzenia przelewu | 30 min | dowody dla policji i ubezpieczyciela | ✅ |
| Usunięcie „feralnego" maila, żeby nikt więcej się nie nabrał | 5 min | utrata dowodów | ❌ |
| Telefon do kontrahenta **na numer z kartoteki**: „Wasza skrzynka jest prawdopodobnie przejęta" | 15 min | kontrahent zabezpiecza skrzynkę; przestępca traci dostęp | ✅ (i uprzejmość, która wraca — kontrahent pamięta) |
| Zgłoszenie do **CERT Polska** (incydent.cert.pl) — rachunek słupa, domena, wzorzec | 20 min | wkład do ochrony innych; w multiplayerze: +wykrywanie innych graczy (ISAC) | ✅ (dobrowolne dla nieobjętych KSC) |
| Kontakt z ubezpieczycielem (jeśli jest polisa z klauzulą socjotechniczną) | 20 min | wiele polis wymaga niezwłocznego zgłoszenia | ✅ jeśli polisa jest |

### Faza 2B — wariant „udaremnione" (procedura zadziałała)

Księgowa oddzwoniła, kontrahent zaprzeczył. Gracz decyduje, co dalej:

| Opcja | Ocena |
|---|---|
| Poinformować kontrahenta (telefon) + CERT Polska + docenić księgową publicznie w firmie | ✅ wzmacnia kulturę zgłaszania (morale +, adopcja procedury +10%) |
| „Nic się nie stało" — zamknąć temat | ⚠️ kontrahent dalej ma przejętą skrzynkę; inni jego klienci zapłacą |

### Faza 3 — T+4 h: czy to też NASZ incydent?

**Co gracz wie:** przestępca znał szczegóły wątku (pewne) — z ich skrzynki albo z naszej?

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Przegląd naszych skrzynek**: logowania (kraje, godziny), reguły przekazywania i ukrywania, aplikacje z dostępem | 3 h (bez SIEM-a/logów — 6 h; logi poczty z ostatnich 30 dni) | ustalenie, czy nasza skrzynka czysta | ✅ |
| Założyć, że to ich problem | 0 | jeśli wariant „nasza skrzynka przejęta" — kolejne oszustwa w kolejnych tygodniach i niezgłoszone naruszenie RODO | ❌ |
| Reset haseł + wymuszenie MFA dla działu finansów od dziś | 2 h, mandat −2 (tarcie), +ochrona | ✅ (jeśli MFA nie było) |

Jeśli **nasza** skrzynka była przejęta: w skrzynce są dane osobowe (klientów biura, kontrahentów
— imiona, nazwiska, PESEL-e na umowach, rachunki) → **naruszenie ochrony danych osobowych**:
ocena ryzyka i zgłoszenie do UODO w 72 h od stwierdzenia (faza 4).

### Faza 4 — T+24 h: obowiązki i zarząd

| Decyzja | Ocena |
|---|---|
| Ocena RODO udokumentowana (nawet jeśli wynik „brak naruszenia u nas" — notatka w rejestrze naruszeń) | ✅ rozliczalność |
| Krótka notatka do zarządu: co się stało, ile, co zrobione, czego nie wiemy, co proponujesz (procedura, MFA, szkolenie finansów) — **bez szukania winnych** | ✅ mandat + |
| Księgowa „do zwolnienia dyscyplinarnego" (karta od prezesa) — sprzeciw z uzasadnieniem: brak procedury to błąd organizacji | ✅ (sprzeciw) · ❌ (zgoda: zgłaszanie spada, morale −15) |
| Klasyfikacja KSC (dla podmiotów objętych): to oszustwo finansowe bez wpływu na świadczenie usługi — zwykle **nie** incydent poważny; udokumentuj ocenę | ✅ |

## Zegary i obowiązki

- **Bank**: im szybciej, tym większa szansa na zablokowanie środków u odbiorcy (w grze:
  odzysk 60% w pierwszych 2 h od przelewu, 30% do 24 h, 10–20% do 7 dni, potem ~0) 🔵.
- **Policja / CBZC**: bez terminu, ale bank zwykle wymaga zawiadomienia.
- **RODO 72 h**: tylko jeśli ustalimy naruszenie u nas (przejęta nasza skrzynka).
- **KSC**: zwykle nie dotyczy (patrz faza 4) — gra uczy, że nie wszystko trzeba zgłaszać do CSIRT.

## Komunikacja

- **Do kontrahenta**: telefonicznie, na znany numer; potem pisemnie z nowego kanału.
- **Do zespołu finansów**: co się stało, nowa zasada od dziś („żadnej zmiany rachunku
  na podstawie maila; zawsze oddzwonienie z kartoteki + biała lista VAT + druga osoba"),
  bez nazwisk.
- **Do zarządu**: fakty, kwota, działania, czego nie wiemy, prośba (MFA, procedura).

## Zakończenia

| Wynik | Warunek |
|---|---|
| **Udaremnione** | procedura płatności zadziałała (faza 2B) |
| **Odzyskane w całości** | telefon do banku < 2 h od przelewu (rzadkie w fazie 1, możliwe w wariancie „księgowa zgłosiła wątpliwość po przelewie") |
| **Odzyskane częściowo** | bank w fazie 1 + zawiadomienie |
| **Strata** | brak szybkiego kontaktu z bankiem albo kanał mailowy do przestępcy |
| **Strata + kolejne oszustwa** | nie sprawdzono własnych skrzynek, a były przejęte |

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 25 | bank jako pierwsza czynność (czas < 30 min gry od wykrycia) |
| 10 | brak kontaktu przez przejęty kanał |
| 10 | zabezpieczenie dowodów (nagłówki, PDF, potwierdzenie) |
| 10 | zawiadomienie o przestępstwie |
| 10 | ostrzeżenie kontrahenta telefonicznie |
| 15 | sprawdzenie własnych skrzynek |
| 10 | udokumentowana ocena RODO / KSC |
| 10 | brak szukania winnych; procedura zamiast zwolnienia |

## Debrief

- **Dlaczego to działa na przestępców:** mail przychodzi z **prawdziwego** adresu kontrahenta,
  w **prawdziwym** wątku. Żaden filtr pocztowy tego nie zatrzyma. Zatrzymuje to wyłącznie
  **procedura poza pocztą**.
- **Trzy darmowe zabezpieczenia**: oddzwonienie na numer z kartoteki, sprawdzenie rachunku
  w białej liście VAT (i tak opłaca się podatkowo przy kwotach > 15 000 zł), druga osoba
  zatwierdzająca nowy rachunek. Od 2026 r. dochodzi porównanie z fakturą w KSeF.
- **Godziny, nie dni**: w życiu szansa na zatrzymanie środków spada z każdą godziną —
  przestępcy przelewają je dalej (rachunki „słupów", kryptowaluty).
- **Kultura**: księgowa, która się pomyliła, jest najlepszym świadkiem i przyszłym
  ambasadorem procedury. Zwolnienie jej uczy wszystkich, żeby następnym razem ukrywać.
- Źródła do debriefu: ostrzeżenia banków o fałszywych zmianach rachunków; CERT Polska
  (zgłaszanie incydentów, Lista Ostrzeżeń); wykaz podatników VAT (Ministerstwo Finansów).

## Warianty

- **Gmina**: kwota 486 200 zł, faktura od wykonawcy drogi. Kontrasygnata **skarbnika** to
  naturalna „druga para oczu" — w gminie z dobrą kulturą skarbnik zatrzymuje przelew. Kara
  UODO ograniczona (JSFP), ale wójt ma kłopot polityczny (radni, lokalne media).
- **Fabryka**: 1 184 000 zł, „dostawca stali" — przechodzi w S08, jeśli prezes „potwierdza"
  przelew głosem (deepfake).
- **Nasza skrzynka przejęta** (kampanie z długiem „brak MFA w finansach"): faza 3 odkrywa
  reguły przekazywania od 5 tygodni → naruszenie RODO, zgłoszenie do UODO, przegląd, które
  dane wyszły.

## Pytania do dyskusji

1. Kto w Waszej firmie może zmienić rachunek kontrahenta w systemie? Na jakiej podstawie?
2. Ile czasu zajęłoby Wam dodzwonienie się do banku w sprawie oszustwa? Czy macie ten numer
   zapisany poza komputerem?
3. Co by się stało z osobą, która się pomyliła? Czy chcielibyście, żeby następnym razem
   powiedziała od razu?
