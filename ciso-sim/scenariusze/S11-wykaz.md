# S11. Wykaz

| | |
|---|---|
| **Firmy** | każda kampania z podmiotem kluczowym/ważnym albo „do ustalenia" (wodociągi, gmina, szpital, sklep, software house, fabryka, elektrociepłownia) |
| **Rodzaj** | regulacyjny i etyczny: spóźniony wpis do wykazu + incydent, który nie został zgłoszony, a powinien |
| **Trudność** | ★★ |
| **Czas gry / realny** | 7 dni / 20 min |
| **Zegary** | wpis do wykazu (termin minął 3.10.2026), zgłoszenie incydentu (terminy minęły), presja zarządu |
| **Inspiracja** | realny kalendarz: 6 miesięcy na wniosek o wpis do wykazu podmiotów kluczowych i ważnych minęło 3.10.2026; samoidentyfikacja jako zasada; ochrona sygnalistów |
| **Cele** | E6, E7 (odpowiedzialność kierownika), E11, uczciwość wobec regulatora |

## Warunki wyzwolenia

- Skrypt: **m. 7** (październik 2026 — dokładnie „dziś" w realnym kalendarzu).
- Część A startuje, jeśli gracz **nie** złożył wniosku o wpis do 3.10.2026 (m. 6–7).
- Część B startuje, jeśli w m. 4–6 silnik wylosował incydent, który spełniał kryteria
  poważnego, a gracz go nie zgłosił (albo nie ocenił). Jeśli gracz wszystko zrobił —
  scenariusz jest krótkim „sprawdzianem" (karta z pochwałą zarządu i pytaniem kontrolnym).

## Prawda

**A.** Prezes w kwietniu uznał, że „ten NIS2 to dla dużych" i nie przekazał sprawy dalej.
Spółka spełnia przesłanki (sektor + wielkość). Wniosek nie został złożony.

**B.** We wrześniu ransomware zaszyfrował serwer jednego działu (np. rozliczeń w wodociągach)
— przestój 2 dni, przywrócone z kopii, część klientów nie dostała faktur na czas, dane
osobowe na serwerze. IT „ogarnęło po cichu". Według kryteriów (wpływ na usługę, skala,
dane) — incydent prawdopodobnie poważny; dane — naruszenie RODO z oceną ryzyka.

## Przebieg

### Faza 1 — T+0: nowy radca prawny pyta

Nowy radca prawny (zatrudniony po głośnych wyciekach jesienią 2026) przegląda zgodność:
„Czy jesteśmy w wykazie? I co to był za incydent we wrześniu, o którym słyszałem na korytarzu?"

| Opcja | Ocena |
|---|---|
| **Sprawdzenie statusu w S46 i rzetelna samoidentyfikacja** (sektor, wielkość — z danymi finansowymi) | ✅ |
| „Nie dotyczy nas" bez analizy | ❌ |
| Zebranie faktów o incydencie wrześniowym (logi, notatki IT, czas, skutki) | ✅ |

### Faza 2 — T+1 dzień: prezes nie chce

Prezes: „Skoro termin minął, to po co się wychylać? Kary i tak są dopiero od 2028.
A ten wrześniowy incydent — było, minęło, nikt nie wie. Nie robimy sobie problemów."

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Rzeczowa notatka do zarządu**: (1) status wynika z ustawy, wpis jest deklaratoryjny — spóźniony wniosek jest lepszy niż żaden; (2) obowiązki (SZBI do 3.04.2027, audyt) biegną niezależnie od wpisu; (3) **odpowiedzialność osobista kierownika** (kara do 300% wynagrodzenia 🟡); (4) incydent wrześniowy: rekomendacja zgłoszenia z wyjaśnieniem opóźnienia + ocena RODO | 4 h, mandat −5 krótkoterminowo | zarząd zwykle się zgadza (70% przy mandacie ≥ 40) | ✅ |
| Złożyć wniosek o wpis, ale incydent przemilczeć | — | wpis OK; incydent może wyjść (pracownik, klient, kontrola, audyt w m. 24 — S12 go znajdzie w logach) | ⚠️/❌ |
| Podporządkować się prezesowi w całości | mandat +5 teraz | ryzyko kumuluje się na graczu (współodpowiedzialność, utrata wiarygodności przy wykryciu) | ❌ |
| Jeśli zarząd odmawia mimo notatki: **zgłoszenie wewnętrzne** w trybie ustawy o ochronie sygnalistów (procedura obowiązuje u pracodawców od 50 osób; bezpieczeństwo sieci i ochrona danych w zakresie 🟡) | morale ±, mandat −20 | ochrona przed odwetem; sprawa trafia do właściwej ścieżki | ✅ (ostateczność, ale legalna i chroniona) |
| Anonimowy donos do mediów | — | kryzys, utrata zaufania, nie rozwiązuje obowiązku | ❌ |

### Faza 3 — T+2 … T+5 dni: naprawa

| Decyzja | Ocena |
|---|---|
| **Wniosek o wpis przez S46** (spóźniony, z dokumentacją samoidentyfikacji) | ✅ |
| **Zgłoszenie incydentu wrześniowego** do właściwego CSIRT z wyjaśnieniem, dlaczego teraz (brak procedury klasyfikacji — naprawiony) | ✅ |
| Ocena RODO incydentu wrześniowego; jeśli naruszenie — zgłoszenie do UODO z wyjaśnieniem opóźnienia (spóźnienie samo w sobie bywa karane — przykład kary za zgłoszenie po terminie w sektorze bankowym) | ✅ |
| **Procedura klasyfikacji incydentów** (kryteria „poważnego", kto decyduje, w jakim czasie) + rejestr wszystkich incydentów, także niezgłaszanych, z uzasadnieniem | ✅ najważniejsza zmiana systemowa |
| **Szkolenie kierownika podmiotu** (obowiązek roczny — jeśli jeszcze go nie było w 2026) | ✅ |

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 15 | rzetelna samoidentyfikacja |
| 20 | notatka do zarządu: fakty, obowiązki, odpowiedzialność osobista, rekomendacje |
| 15 | wpis do wykazu złożony |
| 15 | zgłoszenie incydentu wrześniowego (CSIRT) |
| 10 | ocena RODO i ewentualne zgłoszenie |
| 15 | procedura klasyfikacji + rejestr incydentów |
| 10 | szkolenie kierownika |

## Debrief

- **Samoidentyfikacja** oznacza, że nikt nie przyśle Ci listu „jesteś podmiotem kluczowym".
  Status wynika z ustawy; wpis tylko go potwierdza.
- **Brak kar „od jutra" nie znaczy braku obowiązków.** Okres bez kar to czas na wdrożenie,
  nie na udawanie, że ustawy nie ma.
- **Niezgłoszony incydent nie znika** — leży w logach, w pamięci ludzi, w rejestrach dostawców.
  Ujawniony później kosztuje więcej (reputacja, zaufanie regulatora, kara za opóźnienie).
- **Kierownik podmiotu odpowiada osobiście.** To najmocniejszy, uczciwy argument wobec zarządu.
- **Sygnalista** to legalna i chroniona ścieżka, gdy organizacja świadomie łamie prawo.
- Źródła: omówienia nowelizacji KSC (terminy wpisu, samoidentyfikacja, kary), ustawa o ochronie
  sygnalistów (2024), decyzje UODO o karach za spóźnione zgłoszenia.

## Pytania do dyskusji

1. Kto w Waszej organizacji ocenił, czy podlegacie KSC? Na jakiej podstawie?
2. Czy macie spisane kryteria, kiedy incydent jest „poważny"?
3. Co zrobilibyście, gdyby przełożony polecił nie zgłaszać incydentu?
