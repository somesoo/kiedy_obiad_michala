# 13. Roadmapa budowy

Zasada: **najpierw grywalny rdzeń, potem treść, na końcu szlif.** Każdy etap kończy się czymś,
w co da się zagrać albo co da się pokazać ludziom z biura.

## Etap A — Projekt i prototyp (TERAZ)

- [x] Wizja, realia polskie, mechanika, katalogi, firmy, etapy, ocena, architektura (`docs/`)
- [x] Dane liczbowe v1 (`data/`)
- [x] Prototyp Monte Carlo i pierwsza kalibracja (`proto/`)
- [x] 12 pełnych scenariuszy + zalążki (`scenariusze/`)
- [x] **Decyzje właściciela** (13.10.2026): odbiorcy — biuro; pierwsza kampania — wodociągi;
      tempo — gracza (bez limitu dziennego); raporty działów co okres; algorytmy uczące się;
      ocenę merytoryczną zrobi CISO
- [x] Działy jako agenci + reżyser (`docs/15-…`, `proto/dzialy.js`, `proto/rezyser.js`)
- [x] Kampania „Wodnik” grywalna w terminalu (`docs/16-…`, `proto/kampania.js`), zapis/wczytanie
- [x] Pierwsze testy automatyczne (`node --test ciso-sim/test/*.test.js`)
- [ ] **Ocena przez CISO**: realia (`02-…`), rubryki scenariuszy, karty kampanii „Wodnik”
- [ ] Weryfikacja 🟡 w tekstach aktów (`02-…`, punkt 8)

## Etap B — „Gra papierowa" (1–2 tygodnie)

Przed kodem UI — sprawdzić, czy to jest **zabawne**:
- [ ] Rozegrać S01 i S02 jako grę fabularną przy stole (prowadzący czyta z pliku scenariusza,
      grupa decyduje). Zmierzyć: czas, zrozumiałość, emocje, gdzie ludzie się nudzą.
- [ ] Rozegrać kampanię wodociągów w terminalu (`proto/kampania.js`) z 3–5 osobami z biura —
      zamiast arkusza (prototyp już liczy miesiąc, działy i reżysera). Czy decyzje są ciekawe? Czy gracz ma za mało/za dużo kart?
- [ ] Poprawki w mechanice i scenariuszach.

## Etap C — Szkielet aplikacji (2–3 tygodnie)

- [ ] `ciso-sim/package.json`, `server.js`, baza, migracje z flagami
- [ ] `lib/auth.js` — logowanie hasłem, sesje, limity, role, zaproszenia (z testami)
- [ ] `lib/engine/*` — silnik z `proto/` jako moduły czyste, **z testami `node --test`**
- [ ] Walidator plików danych i scenariuszy (jak `lib/seasons.js`)
- [ ] Kopie bazy (`lib/backups.js` z repo)
- [ ] Panel admina: użytkownicy, zaproszenia, podgląd kampanii

## Etap D — Pierwsza grywalna kampania (3–4 tygodnie)

- [ ] Kampania „Wodnik” w przeglądarce (z `proto/kampania.js`) z krótkim wprowadzeniem;
      samouczek „Saldo” — później
- [ ] Ekrany: Pulpit, Decyzje, Budżet i godziny, Kontrole, Dziennik
- [ ] Tryb incydentu dla S01 (BEC) — zegar, wiedza, decyzje, komunikacja, debrief
- [ ] Rejestr + debrief + raport końcowy (wersja minimalna)
- [ ] Testy z 3–5 osobami z biura → poprawki

## Etap E — Pełna kampania i zarząd (4–6 tygodni)

- [ ] Kampania wodociągów: raport kwartalny, budżet jako twarde ograniczenie, S11/S12 jako dane
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
