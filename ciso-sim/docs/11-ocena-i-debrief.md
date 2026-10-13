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

**Wynik kampanii** (to, co wygrywa i trafia do rankingu biurowego) = **½ Indeks Odporności +
½ Jakość Decyzji × 1000**, z sufitem za decyzje nie do obrony (11.2a). Dawniej ranking szedł
po samej Jakości Decyzji, a gracz widział Indeks jako „wynik" — i kłamca miał w nim tyle co
gracz rozsądny (`17-…`, 17.6). Sam Indeks nie wystarcza: dobra technika (EDR, kopie) ratuje
skutki mimo złych decyzji. Sama Jakość Decyzji też nie: nie widzi, czy firma przetrwała.

## 11.2. Indeks Odporności

```
IO = 1000 × Σ wagi × składowe (każda 0–1)
```

| Składowa | Waga | 1,0 gdy | 0 gdy |
|---|---|---|---|
| Straty zrealizowane vs gracz bierny w tej samej „pogodzie" | 0,15 | straty ≤ 10% referencji | ≥ referencja |
| **Ekspozycja**: oczekiwane straty w roku PO kampanii, z końcowego stanu firmy, vs bierny | 0,20 | ≤ 10% referencji | ≥ referencja |
| Skutki niefinansowe (zakłócenia uzdatniania/przepompowni od 50 tys. zł) | 0,15 | zero | 3 i więcej |
| Zgodność (wynik kontroli) | 0,15 | audyt bez niezgodności głównych | brak SZBI / brak wpisu |
| Reputacja (koniec kampanii) | 0,10 | ≥ startowa | „wskazanie palcem", wyciek bez rzetelnej komunikacji |
| Dojrzałość (10 kluczowych kontroli działa) | 0,10 | wszystkie | żadna |
| Ludzie (morale) | 0,05 | zespół cały i zdrowy | wypalenie |
| Biznes (część próśb działów, która doszła do skutku) | 0,10 | działy dostają „tak, ale bezpiecznie" | wszystko blokowane albo odkładane |

Zmiany po przypadkach brzegowych (`17-…`): „koszt vs budżet" usunięty (przy twardym budżecie
wynosił 1,0 u każdego), nowa składowa „biznes", a straty zrealizowane oddały część wagi
ekspozycji. **Ekspozycja to odpowiedź na „szczęście"**: przy 2–5 incydentach na kampanię
straty zrealizowane to w dużej mierze los, a ryzyko, które jeszcze nie wybuchło — kłamstwo,
ukryte obejście działu, wyjątek dla zarządu, intruz, którego nie wykryto — nic nie kosztowało.
Ekspozycja liczy je z PRAWDY silnika (40 przebiegów roku po kampanii, te same ziarna dla
każdego gracza; przeciwnik bez wyuczonych wag, bo to miara postawy firmy). Implementacja:
`indeksOdpornosci` i `ekspozycja` w `proto/kampania.js`.

### 11.2a. Sufity — decyzje, których żaden dobry wynik nie równoważy

| Decyzja | Sufit (Indeks i Wynik kampanii) |
|---|---|
| Nieprawdziwe oświadczenie wobec ubezpieczyciela (ankieta) | 650 |
| Komunikat „woda bezpieczna" bez wyników badań (S03) | 650 |
| Odwołanie przez zarząd (mandat 0) | 500 |

Liczone **z prawdy, wykryte czy nie**. W życiu takie decyzje kończą karierę osoby
odpowiedzialnej za bezpieczeństwo niezależnie od reszty dorobku, więc kilka punktów kary
byłoby kłamstwem gry. Podsumowanie mówi wprost: „bez tego: 869, wynik ograniczony do 650,
bo…". Lista: `BRAMKI` w `proto/kampania.js`.

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

Wynik: odsetek „punktów jakości" zdobytych z możliwych, **z wagą decyzji** (`jakoscDecyzji`
w `proto/kampania.js`): karta może podać `waga`, obowiązkowa domyślnie 2, reszta 1 (ankieta
ubezpieczyciela: 4); decyzje scenariusza ważone punktami rubryki (10 pkt = waga 1). Bez wag
kłamstwo w ankiecie było 1/68 wyniku — tyle co odpowiedź na prośbę o czat AI.

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
