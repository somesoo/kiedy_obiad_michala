# 11. Ocena i debrief

## 11.1. Dwa wyniki — i dlaczego to ważne

Gra pokazuje **dwa** wyniki obok siebie:

| Wynik | Co mierzy | Skąd |
|---|---|---|
| **Indeks Odporności** (0–1000) | jak firma naprawdę wyszła na kampanii | straty, przestoje, zdrowie/ciepło/woda, zgodność, reputacja, stan firmy na koniec |
| **Jakość praktyki** (0–100%, dawniej Jakość Decyzji) | czy gracz postępował jak dobry praktyk **przy wiedzy, którą miał** | zasady sprawdzane na historii ruchów (11.3) — bez ocen przypisanych do opcji |

Bez drugiego wyniku gra nagradzałaby szczęście (ktoś nic nie zrobił i akurat nic się nie
stało) i karała pecha (ktoś zrobił wszystko dobrze i padł przez dostawcę). To dokładnie ten
błąd, który w realu kończy się zwolnieniem dobrego CISO i awansem szczęściarza — gra ma go
**pokazać**, a nie powtórzyć.

**Wynik kampanii** (to, co wygrywa i trafia do rankingu biurowego) = **½ Indeks Odporności +
½ Jakość praktyki × 1000**, z sufitem za decyzje nie do obrony (11.2a). Dawniej ranking szedł
po samej Jakości Decyzji, a gracz widział Indeks jako „wynik" — i kłamca miał w nim tyle co
gracz rozsądny (`17-…`, 17.6). Sam Indeks nie wystarcza: dobra technika (EDR, kopie) ratuje
skutki mimo złych decyzji. Sama Jakość praktyki też nie: nie widzi, czy firma przetrwała.

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
| Kłamstwo (ankieta ubezpieczyciela, dokumenty z datą wsteczną…), którego **nikt nie wykrył** | 650 |
| Kłamstwo **ujawnione** (w trakcie gry albo na audycie zamykającym) | 450; każde kolejne −100 (najniżej 250) |
| Komunikat „woda bezpieczna" bez wyników badań (S03) | 650 |
| Odwołanie przez zarząd (mandat 0) | 500 |

Kłamstwo liczy się **z prawdy**: nieujawnione też ma sufit. Ujawnione jest gorsze niż odwołanie
za słabe wyniki, bo w życiu to koniec pracy na tym stanowisku. Podsumowanie mówi to wprost:
„bez tego: 789, wynik ograniczony do 350, bo…". Lista: `BRAMKI` w `proto/kampania.js`.

### 11.2b. Wiarygodność i audyt zamykający (`17-…`, 17.7)

Opcja z polem `nieuczciwe: { wobec, wykrywalnosc }` trafia do rejestru `k.klamstwa`. Kłamstwo
wychodzi na jaw przy weryfikacji ubezpieczyciela (~5%/mies.), przy likwidacji szkody albo na
**audycie zamykającym** — obowiązkowym ostatnim kroku każdej kampanii (gra ma skończoną liczbę
miesięcy). Ujawnienie uderza we **współpracę**:

| Kto | Skutek |
|---|---|
| Zarząd | mandat −15, kolejny budżet ×0,7 |
| Działy | zaufanie −0,3, Q(pytaj) −0,5 → rzadziej pytają, częściej obchodzą zasady |
| Ubezpieczyciel | polisa wypowiedziana |
| Audytor | rozszerzona próba: drobne niezgodności liczone jako główne |

Audyt zamykający uznaje też uczciwość: plan naprawczy z właścicielami i terminami zmienia
najwyżej dwie niezgodności główne na drobne. Dokumenty z datą wsteczną, których nie wykryto
(szansa 40%), poprawiają audyt — inaczej nie byłyby pokusą.

„Ta sama pogoda": silnik przechowuje ziarno losowości kampanii i liczy na nim strategię
referencyjną. Gracz porównuje się z „jak by było, gdybyś nic nie robił" w tym samym świecie
(to samo dla strategii „higiena" jako drugi punkt odniesienia).

## 11.3. Jakość praktyki (dawniej „Jakość Decyzji")

Od silnika ruchów (`18-…`) **nie ma opcji z oceną** — ani w ruchach, ani w sprawach, ani w akcjach
incydentu. Praktykę oceniają **zasady** (`proto/zasady.js`, ~30 sztuk + zasady każdego incydentu),
sprawdzane na historii ruchów i stanie firmy — tak jak audytor albo doświadczony CISO patrzy na
to, co zrobiono, a nie na to, co zaznaczono. Przykłady:

- podstawy na czas: inwentaryzacja, MFA i kopie do 6. miesiąca, procedura płatności do 8.;
- reakcja na ostrzeżenie dla sektora w ciągu miesiąca; znane „pilne drzwi" zamknięte w miesiąc;
- pilotaż przed każdą zmianą na OT; test kopii do 3 miesięcy od wdrożenia; przegląd lub test
  każdej kluczowej kontroli w ostatnim roku; EDR przełączony na blokowanie po strojeniu;
- prośby działów: rozstrzygnięte, a „alternatywa" tylko wtedy, gdy ryzyko jest istotne;
  odkrycia bez kar; każdy sygnał sprawdzony; wyjątki z akceptacją ryzyka przez zarząd;
- prawo: wpis, status, SZBI (i to na miarę firmy), szkolenie kierownika co rok;
- sprawy kampanii: przegląd przed połączeniem sieci, klauzule w umowie, nocny telefon, dementi…;
- zachowanie: nadgodziny bez wypalenia, uczciwość (−1 za każde kłamstwo, waga 3), co najmniej
  dwa rzetelne raporty dla zarządu w roku;
- w incydencie: zasady pliku scenariusza (bank w pierwszej godzinie, proces przed śledztwem,
  komunikat tylko z danymi…). Zasady „nie rób X" liczą się tylko, gdy gracz cokolwiek zrobił.

**Jakość praktyki** = Σ waga × wynik / Σ waga (spełniona 1, naruszona 0, nieuczciwa −1). Każda
ocena ma moment i „dlaczego" — to idzie do debriefu i do modelu gracza (BKT reżysera). Nie ma
odpowiedzi „poprawnej": dwie różne drogi mogą dać ten sam wynik, ta sama decyzja w innej
kolejności — inny (np. bank po zebraniu „czyja wina" odzyskuje mniej niż bank od razu).

Wynik kampanii = ½ Indeks + ½ Jakość praktyki, z sufitami (11.2a). Dojrzałość w Indeksie liczy
się z **prawdziwej** skuteczności kluczowych kontroli (jakość wdrożenia, dryf, ukryte usterki),
a nie z „jest / nie ma".

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
- Indeks Odporności i Jakość praktyki, porównanie z referencjami (nic / higiena),
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
