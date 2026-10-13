# 11. Ocena i debrief

## 11.1. Dwa wyniki — i dlaczego to ważne

Gra pokazuje **dwa** wyniki obok siebie:

| Wynik | Co mierzy | Skąd |
|---|---|---|
| **Indeks Odporności** (0–1000) | jak firma naprawdę wyszła na kampanii | straty, przestoje, zdrowie/ciepło/woda, zgodność, reputacja, stan firmy na koniec |
| **Jakość Decyzji** (0–100%) | jak dobre były decyzje **przy wiedzy, którą gracz miał** | porównanie każdej decyzji z oceną ekspercką (rubryka scenariusza) i z wartością oczekiwaną w silniku |

Bez drugiego wyniku gra nagradzałaby szczęście (ktoś nic nie zrobił i akurat nic się nie
stało) i karała pecha (ktoś zrobił wszystko dobrze i padł przez dostawcę). To dokładnie ten
błąd, który w realu kończy się zwolnieniem dobrego CISO i awansem szczęściarza — gra ma go
**pokazać**, a nie powtórzyć.

Ranking biurowy: domyślnie po **Jakości Decyzji**, z Indeksem Odporności jako drugim kluczem.

## 11.2. Indeks Odporności

```
IO = 1000 × Σ wagi × składowe (każda 0–1)
```

| Składowa | Waga | 1,0 gdy | 0 gdy |
|---|---|---|---|
| Straty finansowe vs wartość referencyjna (strategia „nic" dla tej firmy w tej samej „pogodzie") | 0,25 | straty ≤ 10% referencji | ≥ referencja |
| Koszt bezpieczeństwa vs budżet (efektywność) | 0,10 | wydane ≤ budżet i dobrze ulokowane | przekroczenie albo „shelfware" |
| Skutki niefinansowe (zdrowie, woda, ciepło, usługi publiczne) | 0,20 | zero | poważne |
| Zgodność (wynik audytu S12) | 0,15 | audyt bez niezgodności głównych | brak SZBI / brak wpisu |
| Reputacja (koniec kampanii) | 0,10 | ≥ startowa | „wskazanie palcem", wyciek w mediach bez rzetelnej komunikacji |
| Dojrzałość (etap firmy na koniec) | 0,10 | etap ≥ cel kampanii | etap 0 |
| Ludzie (morale, rotacja) | 0,10 | zespół cały i zdrowy | wypalenie, odejścia |

„Ta sama pogoda": silnik przechowuje ziarno losowości kampanii i liczy na nim strategię
referencyjną. Gracz porównuje się z „jak by było, gdybyś nic nie robił" w tym samym świecie
(to samo dla strategii „higiena" jako drugi punkt odniesienia).

## 11.3. Jakość Decyzji

Każda decyzja zapisuje w rejestrze zrzut **wiedzy gracza** (co było na ekranie: oszacowania,
ostrzeżenia, stan). Ocena decyzji:

1. **Decyzje scenariuszowe** (tryb incydentu): rubryka ekspercka w pliku scenariusza
   (`scenariusze/`). Każda opcja ma ocenę: ✅ dobra praktyka / ⚠️ dopuszczalna z kosztem /
   ❌ błąd. Rubryka opisuje DLACZEGO — i to trafia do debriefu.
2. **Decyzje strategiczne** (miesiąc): wartość oczekiwana w silniku. Silnik może przeliczyć
   miesiąc w tle (Monte Carlo jak `proto/`) dla 2–3 alternatyw i porównać: czy decyzja gracza
   była w górnej części rozkładu **przy jego wiedzy** (nie przy prawdzie, której nie znał).
   Kosztowne obliczeniowo — liczone asynchronicznie po turze.
3. **Kary za ignorowanie sygnałów**: jeśli briefing zawierał wyraźne ostrzeżenie (CERT o
   podatności w Twoim VPN-ie), a gracz go nie obsłużył — decyzja „nic" jest oceniana jako błąd,
   nawet jeśli nic się nie stało.
4. **Premie za naukę**: lekcje z incydentu zamienione na zadania i wykonane.

Wynik: odsetek „punktów jakości" zdobytych z możliwych, z wagą decyzji (decyzja o okupie
waży więcej niż wybór szablonu maila).

## 11.4. Debrief incydentu (po każdym trybie operacyjnym)

Struktura (inspirowana „blameless postmortem"):
1. **Oś czasu** — co się działo naprawdę (prawda z silnika) vs co gracz wiedział (zrzut wiedzy).
2. **Gdzie były sygnały** — każdy sygnał, który można było zauważyć wcześniej, z miejscem w UI.
3. **Twoje decyzje** — każda z oceną rubryki i krótkim „dlaczego".
4. **Zegary** — terminy KSC/RODO/DORA: dotrzymane / nie, z czego wynikał poślizg.
5. **Co by zmieniło wynik** — 2–3 kontrole lub decyzje, które najbardziej zmieniłyby przebieg
   (silnik liczy kontrfaktycznie: „z kopią offline przestój 5 dni zamiast 19").
6. **Jak to wygląda w realu** — inspiracja (prawdziwy incydent, bez przypisywania winy) i
   2–4 źródła (CERT Polska, CSIRT sektorowy, UODO, raporty branżowe).
7. **Lekcje → zadania** — gracz wybiera, które lekcje zamienia w zadania (koszt: godziny).

## 11.5. Raport końcowy kampanii

Jedna strona dla gracza (i opcjonalnie do pobrania jako PDF):
- Indeks Odporności i Jakość Decyzji, porównanie z referencjami (nic / higiena),
- wykres miesięcy: wydatki, straty, etap dojrzałości, mandat, morale,
- 3 najlepsze i 3 najgorsze decyzje (z rejestru),
- „Gdyby to była prawdziwa firma" — ile realnie kosztowałby taki program bezpieczeństwa
  i jakie ryzyko zostaje (uczciwie: „nigdy zero"),
- wynik audytu (S12),
- osobiste ryzyko kierownika podmiotu (kary KSC — 🟡 wysokość),
- odznaki.

## 11.6. Tryb prowadzący (szkolenie grupowe)

- Prowadzący widzi rubrykę i „prawdę" na drugim ekranie.
- Grupa głosuje nad decyzjami; gra zapisuje rozkład głosów (ciekawsze w debriefie niż wynik).
- Debrief z pytaniami do dyskusji z pliku scenariusza.
- Opcjonalnie: lista obecności i potwierdzenie udziału (jeśli gra miałaby być elementem
  corocznego szkolenia kierownika — 🟡 czy to możliwe, patrz `14-…`).
