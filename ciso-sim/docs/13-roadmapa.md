# 13. Roadmapa budowy

Zasada: **najpierw grywalny rdzeń, potem treść, na końcu szlif.** Każdy etap kończy się czymś,
w co da się zagrać albo co da się pokazać ludziom z biura.

## Etap A — Projekt i prototyp (TERAZ)

- [x] Wizja, realia polskie, mechanika, katalogi, firmy, etapy, ocena, architektura (`docs/`)
- [x] Dane liczbowe v1 (`data/`)
- [x] Prototyp Monte Carlo i pierwsza kalibracja (`proto/`)
- [x] 12 pełnych scenariuszy + zalążki (`scenariusze/`)
- [ ] **Przegląd przez właściciela** — decyzje z `14-samoewaluacja.md` (pytania otwarte)
- [ ] Weryfikacja 🟡 w tekstach aktów (`02-…`, punkt 8)

## Etap B — „Gra papierowa" (1–2 tygodnie)

Przed kodem UI — sprawdzić, czy to jest **zabawne**:
- [ ] Rozegrać S01 i S02 jako grę fabularną przy stole (prowadzący czyta z pliku scenariusza,
      grupa decyduje). Zmierzyć: czas, zrozumiałość, emocje, gdzie ludzie się nudzą.
- [ ] Rozegrać 6 miesięcy kampanii wodociągów na arkuszu (decyzje miesięczne + proto liczący
      miesiąc). Czy decyzje są ciekawe? Czy gracz ma za mało/za dużo kart?
- [ ] Poprawki w mechanice i scenariuszach.

## Etap C — Szkielet aplikacji (2–3 tygodnie)

- [ ] `ciso-sim/package.json`, `server.js`, baza, migracje z flagami
- [ ] `lib/auth.js` — logowanie hasłem, sesje, limity, role, zaproszenia (z testami)
- [ ] `lib/engine/*` — silnik z `proto/` jako moduły czyste, **z testami `node --test`**
- [ ] Walidator plików danych i scenariuszy (jak `lib/seasons.js`)
- [ ] Kopie bazy (`lib/backups.js` z repo)
- [ ] Panel admina: użytkownicy, zaproszenia, podgląd kampanii

## Etap D — Pierwsza grywalna kampania (3–4 tygodnie)

- [ ] Samouczek „Biuro Rachunkowe Saldo" (6 miesięcy) od początku do końca
- [ ] Ekrany: Pulpit, Decyzje, Budżet i godziny, Kontrole, Dziennik
- [ ] Tryb incydentu dla S01 (BEC) — zegar, wiedza, decyzje, komunikacja, debrief
- [ ] Rejestr + debrief + raport końcowy (wersja minimalna)
- [ ] Testy z 3–5 osobami z biura → poprawki

## Etap E — Pełna kampania i zarząd (4–6 tygodni)

- [ ] Kampania wodociągów (24 mies.) z testami obciążeniowymi S03, S11, S12
- [ ] Zarząd: raport kwartalny, osobowości, mandat, akceptacja ryzyka
- [ ] Polityki z adopcją i wyjątkami; ludzie z rekrutacją i morale; dostawcy z oceną
- [ ] Jakość Decyzji (rubryki + Monte Carlo w tle)
- [ ] Nowy design (identyfikacja wizualna, ilustracje firm)

## Etap F — Multiplayer biurowy i kolejne kampanie

- [ ] Świat wspólny: fale, ISAC, wspólni dostawcy
- [ ] Ranking (Jakość Decyzji → Indeks Odporności)
- [ ] Kampanie: gmina, szpital, sklep (+ scenariusze z kolejki)
- [ ] Tryb prowadzący (szkolenie grupowe)

## Etap G — Zaawansowane

- [ ] Kampanie: software house, fabryka, bank, elektrociepłownia
- [ ] Tryb vCISO (kilka firm naraz)
- [ ] Edytor scenariuszy w panelu (dla trenerów)
- [ ] Eksport raportu końcowego do PDF
- [ ] Wersja angielska? (tylko jeśli będzie potrzeba — prawo jest polskie)

## Co jest ryzykiem dla harmonogramu

- Pisanie treści (scenariusze, karty decyzji, rubryki) to **więcej pracy niż kod**. Każda
  kampania potrzebuje ~60–100 kart decyzji i 4–6 scenariuszy.
- Kalibracja: bez testów z ludźmi łatwo zrobić grę albo zbyt łatwą, albo frustrującą.
- Prawo się zmienia (rozporządzenia wykonawcze do KSC dopiero wychodzą) — `02-…` wymaga
  przeglądu co kwartał.
