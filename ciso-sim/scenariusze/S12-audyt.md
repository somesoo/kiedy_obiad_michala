# S12. Audyt

| | |
|---|---|
| **Firmy** | finał kampanii każdego podmiotu kluczowego (wodociągi, szpital, elektrociepłownia, gmina — jeśli kluczowa); dla podmiotów ważnych — audyt na żądanie organu po poważnym incydencie; sklep — audyt PCI/ISO; bank — inspekcja KNF |
| **Rodzaj** | finał: dowody zamiast deklaracji |
| **Trudność** | ★★ (trudność zależy od całej kampanii) |
| **Czas gry / realny** | 5 dni audytu + 30 dni planu naprawczego / 30 min |
| **Zegary** | termin pierwszego audytu podmiotów kluczowych: **3.04.2028** (m. 24) |
| **Inspiracja** | obowiązek audytu bezpieczeństwa systemu informacyjnego (co najmniej raz na 3 lata; pierwszy w 24 miesiące), wymóg niezależności audytora |
| **Cele** | E11 (papier vs życie), podsumowanie wszystkich celów |

## Jak działa finał

Audyt **czyta rejestr kampanii** (`docs/03-…`, 3.10). Nie da się „przygotować w tydzień" —
dowody albo powstawały przez 2 lata, albo ich nie ma. To jest ostatnia, najmocniejsza lekcja:
**bezpieczeństwo to proces, którego ślady zostają.**

## Faza 0 — wybór audytora (m. 18–22, wcześniej!)

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| Niezależna firma audytorska z uprawnieniami (wg ustawy) | 60–120 tys. zł | audyt ważny | ✅ |
| Firma, która wdrażała nam SZBI („znają nas, będzie taniej") | 40 tys. zł | **audyt nieważny** (wymóg niezależności) — wychodzi przy przekazaniu sprawozdania | ❌ |
| Audyt wewnętrzny „na próbę" 3 miesiące wcześniej | 40 h | lista luk z czasem na naprawę | ✅ (sprytne) |

## Przebieg audytu (5 dni gry)

Audytor prosi o dowody w 10 obszarach. Gracz wybiera z rejestru, co pokazuje. Gra ocenia
każdy obszar: **zgodny / niezgodność drobna / niezgodność główna / spostrzeżenie**.

| # | Obszar | Audytor pyta o… | Dowody z rejestru, które „zaliczają" |
|---|---|---|---|
| 1 | **SZBI i ład** | polityka nadrzędna, role, przegląd zarządczy w ostatnim roku | `szbi` wdrożony; przegląd roczny w rejestrze; protokół z zarządem |
| 2 | **Szacowanie ryzyka** | metodyka, rejestr ryzyk, właściciele, decyzje (w tym akceptacje) | `ryzyko` + przeglądy; akceptacje ryzyka zarządu z datami |
| 3 | **Incydenty** | procedura, klasyfikacja, rejestr wszystkich incydentów, zgłoszenia i ich terminy | rejestr incydentów z trybu operacyjnego; czasy zgłoszeń; S11 rozwiązany uczciwie |
| 4 | **Ciągłość działania** | BCP, DRP, testy odtworzenia z wynikami (RTO zmierzone) | `bcp`, `dr_test` z wynikami (także nieudanymi + poprawkami!) |
| 5 | **Łańcuch dostaw** | rejestr dostawców, oceny, klauzule, przeglądy | `dostawcy`; oceny; umowy z klauzulami |
| 6 | **Dostęp i tożsamość** | MFA, przeglądy uprawnień, JML, konta uprzywilejowane | `mfa` (%), `jml`, przeglądy kwartalne, PAM; **rejestr wyjątków z terminami** |
| 7 | **Podatności i łatki** | proces, SLA, dowody łatania, wyjątki z kontrolami kompensującymi | `patch`, `skaner_podatnosci`, SLA dotrzymane |
| 8 | **Logowanie i monitorowanie** | co logujecie, ile trzymacie, kto patrzy | `siem`/`mdr`/`edr` + jakość operacji |
| 9 | **Szkolenia** | program dla pracowników, **coroczne szkolenie kierownika podmiotu** | `szkolenia`; szkolenia zarządu w 2026 i 2027 |
| 10 | **Wykaz i formalności** | wpis do wykazu, punkt kontaktowy, dane aktualne | wpis (w terminie / spóźniony z wyjaśnieniem) |

### Pokusy w trakcie audytu (karty)

| Karta | Ocena |
|---|---|
| „Dopiszmy z datą wsteczną protokół z przeglądu, którego nie było" | ❌❌ fałszowanie dokumentacji; wykryte (40%) = katastrofa (mandat 0, możliwa odpowiedzialność) |
| „Pokażmy tylko udane testy DR" | ❌ audytor ceni nieudany test z naprawą bardziej niż „wszystko zawsze działa" |
| „Przyznajmy się do luki i pokażmy plan" | ✅ niezgodność z planem naprawczym ≠ katastrofa |
| „Zaprośmy audytora na kolację" | ❌ |

## Po audycie — plan naprawczy (30 dni)

Gracz dostaje sprawozdanie (w grze: liczba niezgodności głównych/drobnych, spostrzeżenia)
i układa **plan naprawczy** z kontroli i polityk (koszt, godziny, terminy). Plan trafia do
zarządu — ostatni raport kampanii.

## Rubryka (100 pkt) — składowa „Zgodność" w Indeksie Odporności

| Pkt | Za co |
|---|---|
| 10 | niezależny audytor wybrany na czas |
| 60 | 6 pkt za każdy z 10 obszarów (zgodny 6, drobna 4, główna 1, brak dowodów 0) |
| 15 | uczciwość (żadnej sfałszowanej dokumentacji, pokazane także nieudane testy) |
| 15 | sensowny plan naprawczy (priorytety wg ryzyka, realne terminy) |

## Debrief (podsumowanie kampanii)

- Audyt nie ocenia, czy mieliście szczęście, tylko czy **zarządzaliście** ryzykiem.
- Dowody powstają w trakcie pracy: przeglądy, testy, decyzje, wyjątki z terminami. Firma,
  która „robiła bezpieczeństwo", zdaje audyt prawie przy okazji.
- Nieudany test DR z naprawą jest lepszym dowodem dojrzałości niż brak testów.
- Raport końcowy kampanii łączy wynik audytu z Indeksem Odporności i Jakością Decyzji (`docs/11-…`).

## Warianty

- **Podmiot ważny po poważnym incydencie**: audyt na żądanie organu w m. +3 po incydencie —
  krótszy, skupiony na obszarze incydentu.
- **Bank (DORA)**: inspekcja KNF — rejestr informacji o dostawcach ICT, klasyfikacja
  incydentów, testy odporności.
- **Sklep / software house**: audyt certyfikujący ISO 27001 albo PCI DSS — podobne obszary,
  inna stawka (kontrakty, przetargi).

## Pytania do dyskusji

1. Gdyby audytor przyszedł jutro, jakie dowody pokazalibyście w każdym z 10 obszarów?
2. Kiedy ostatnio coś „nie zadziałało na teście" i co z tym zrobiliście?
3. Czy zarząd ma udokumentowane decyzje o akceptacji ryzyka?
