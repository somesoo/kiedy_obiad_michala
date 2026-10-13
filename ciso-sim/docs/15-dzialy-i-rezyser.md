# 15. Działy firmy i Reżyser — algorytmy, które się uczą

> Decyzja właściciela (13.10.2026): na koniec każdego okresu firma raportuje, co robiły
> **inne działy**, a gra ma się dostosowywać do aktualnego problemu firmy algorytmami
> „półinteligentnymi" — takimi, które uczą się na tym, co dzieje się w tej konkretnej
> rozgrywce.

## 15.1. Po co

W prawdziwej firmie osoba od bezpieczeństwa **nie jest jedynym graczem**. Księgowość zmienia
bank, dział techniczny zamawia modemy do przepompowni, obsługa klienta kupuje nowy e-BOK,
kadry zatrudniają sezonowych pracowników — każdy z własnymi celami, terminami i cierpliwością
do „tych z IT". Większość ryzyk rodzi się właśnie tam. Gra bez tego byłaby pasjansem:
gracz kontra statyczna firma.

Dlatego są dwie warstwy „inteligencji":

| Warstwa | Kto | Co robi | Czego się uczy |
|---|---|---|---|
| **Działy** | agenci z celami (finanse, produkcja, sieć, obsługa klienta, kadry, zarząd) | co okres podejmują własne inicjatywy; pytają bezpieczeństwo o zdanie albo działają po cichu; raportują | czy opłaca się pytać (zaufanie, nawyk konsultacji), świadomość (z zapominaniem), zmęczenie zasadami |
| **Reżyser** | jeden na kampanię | diagnozuje „aktualny problem firmy", układa zdarzenia i obserwacje, pilnuje rytmu, steruje przeciwnikiem | co gracz już umie (model gracza), skąd napastnicy mają najłatwiej (przeciwnik adaptacyjny) |

## 15.2. Zasady konstrukcyjne (nie do złamania)

1. **Deterministyczne z ziarna.** Każdy podsystem ma własny strumień losowości (świat, działy,
   przeciwnik, reżyser). Ta sama kampania z tym samym ziarnem i tymi samymi decyzjami daje to
   samo. Bez tego nie ma „tej samej pogody" do porównań ani oceny decyzji (`11-…`).
2. **Wyjaśnialne.** Każdy wybór reżysera i każda inicjatywa działu zapisuje w rejestrze
   **powód** („wybrano: kampania phishingowa na księgowość — powód: 0% MFA w finansach,
   świadomość działu 0,15, cel E2 nieopanowany"). Debrief pokazuje te powody.
3. **Uczciwe.** Reżyser **nie oszukuje**: nie zmienia skuteczności kontroli gracza, nie
   tworzy ataków, którym kontrole by zapobiegły. Wybiera tylko *spośród prawdopodobnych*
   zdarzeń i ustala ich *moment* w oknie. Przeciwnik zmienia, *gdzie próbuje*, nie *ile może*.
4. **Ograniczone.** Adaptacja ma sufity (np. przeciwnik przesuwa wagi wektorów najwyżej
   0,5–2×), żeby gra nie odpłynęła od realiów.
5. **Bez modelu językowego w pętli decyzji.** Algorytmy są proste, liczbowe i testowalne
   (`node --test`). Opcjonalnie później model językowy może *przepisywać* raporty działów
   na żywszy język — dostaje fakty z silnika, nie może ich zmienić, a szablon jest zawsze
   zapasem (patrz 15.9).

## 15.3. Dział jako agent

### Stan działu

| Pole | Zakres | Znaczenie |
|---|---|---|
| `cele` | wagi 0–1 | np. ciągłość, koszt, wygoda, terminy, klienci, zgodność — każdy dział inaczej |
| `obciazenie` | 0–1 | presja pracy; rośnie przy awariach, sezonie, braku ludzi — zwiększa pokusę skrótów |
| `zaufanie` | 0–1 | do działu bezpieczeństwa; decyduje o tym, **czy pyta** i **czy mówi prawdę w raporcie** |
| `Q.pytaj`, `Q.obejdz` | ~ −2…+2 | wyuczona wartość dwóch strategii (patrz uczenie) |
| `swiadomosc` | 0–1 | wiedza i czujność; rośnie po szkoleniu i incydencie, **zapomina** z czasem |
| `zmeczenie` | 0–1 | od odmów, tarcia, długiego czekania na odpowiedź |
| `ukryte` | lista | obejścia, o których dział nie powiedział (shadow IT) |
| `pamiec` | ostatnie 6 zdarzeń | do raportów („pamiętamy, jak w maju…") |

### Pętla działu w okresie

```
1. Wybór inicjatywy (utility AI):
   U(i) = Σ_c cele_c × korzyść_i,c × (1 + obciążenie) + szum(σ = 0,1)
   kandydaci: inicjatywy z katalogu, których warunek jest spełniony i nie są w karencji
   dział działa, jeśli max U > próg aktywności działu (część miesięcy nic nie robi)

2. Ścieżka — pytać czy obejść (softmax z temperaturą):
   P(pytaj) = σ( β·(Q.pytaj − Q.obejdz) + α·świadomość + γ·adopcja_polityki_zakupów
                 − δ·pilność_i + 0,5·zaufanie − 0,3·zmęczenie )
   β = 2, α = 1,5, γ = 2, δ = 1 (do kalibracji)

3a. Pytaj → karta decyzji dla gracza („Dział X chce Y — Twoja opinia?") z opcjami:
    zgoda · zgoda z warunkami (bezpieczna wersja: godziny/PLN gracza, opóźnienie) ·
    odmowa z alternatywą · odmowa · odłóż
3b. Obejdź → efekt ryzyka od razu wchodzi do silnika (np. +ekspozycja, +nieznane zasoby),
    ale gracz o nim nie wie, dopóki: dział nie powie (zaufanie), skan/inwentaryzacja nie
    znajdzie, albo incydent nie wyjdzie tą drogą

4. Raport działu na koniec okresu (15.5)
```

### Uczenie — prosta nauka ze wzmocnieniem (bandyta dwuręki)

Po rozstrzygnięciu dział dostaje **nagrodę** `r` — z perspektywy *swoich* celów:

| Co się stało | r (przykład) |
|---|---|
| Zapytał → zgoda | +1,0 |
| Zapytał → zgoda z warunkami, szybko (≤ 1 okres) | +0,6 |
| Zapytał → zgoda z warunkami, wolno | +0,1 |
| Zapytał → odmowa z sensowną alternatywą | 0,0 |
| Zapytał → odmowa bez alternatywy | −0,8 |
| Zapytał → odłożone | −0,5 (i pilność ↑ w kolejnym okresie) |
| Obszedł → nikt nie zauważył | +1,0 |
| Obszedł → wykryte, gracz „zalegalizował" (bezpieczna wersja, bez szukania winnych) | −0,2 |
| Obszedł → wykryte, gracz ukarał | −1,5 |
| Obszedł → incydent przyszedł tą drogą | −2,0 (i świadomość +0,3) |

Aktualizacja: `Q ← Q + η·(r − Q)`, η = 0,3 (średnia ruchoma — nowsze doświadczenia ważą
więcej). Zaufanie: `zaufanie ← zaufanie + 0,1·r_pytania`, przycięte do 0–1.

**Co z tego wynika (emergentnie, bez skryptu):**
- gracz, który odmawia wszystkiego, po 3–4 okresach ma działy, które **przestają pytać**
  i robią po swojemu (shadow IT rośnie, raporty milkną) — lekcja E9,
- gracz, który daje szybkie „tak, ale bezpiecznie", buduje **nawyk konsultacji** — działy
  same przychodzą przed zakupem, a raporty mówią prawdę,
- karanie za przyznanie się uczy ukrywania (r = −1,5 za wykryte obejście bez „legalizacji").

### Świadomość — krzywa zapominania

```
po szkoleniu:     świadomość += 0,15 × jakość_programu
po incydencie w dziale: świadomość += 0,30   („okno po incydencie")
co okres:         świadomość ← świadomość_bazowa + (świadomość − bazowa) × (1 − z)
                  z = 0,05 (wiedza ze szkoleń) … 0,10 (efekt incydentu mija szybciej)
```

Świadomość działu wpływa na: szansę zgłoszenia podejrzanego maila (wykrycie na etapie
„dostęp"), podatność na BEC i phishing (mnożnik wektorów dla tego działu), skłonność
do pytania. To wprost realizuje znaną prawidłowość: jednorazowe szkolenie wietrzeje,
a gotowość do zmian jest największa tuż po incydencie.

### Wiarygodność: ujawnione kłamstwo zmienia działy

Gdy kłamstwo gracza wychodzi na jaw (`ujawnij` w `proto/kampania.js`), każdy dział traci
0,3 zaufania i 0,5 wartości Q(pytaj). To nie jest kara „z góry", tylko zwykła nauka agenta:
skoro osoba od bezpieczeństwa kręci, pytanie jej o zgodę przestaje mieć wartość — a niższe
Q(pytaj) i zaufanie to wprost mniejsze P(pytaj), czyli więcej obejść. Kłamca kończy kampanię
z zaufaniem działów 0,16 (rozsądny: 0,63) i z obejściami, o których nie wie (`17-…`, 17.7).

### Rejestr ryzyk (po przypadkach brzegowych)

Skutki inicjatyw nie mnożą się przyrostowo: każda para „dział:inicjatywa" ma wpis w rejestrze
(`k.ryzyka`: wektory, ułamek, źródło — obejście / zgoda / warunki / legalizacja). Powtórka tej
samej inicjatywy przez ten sam dział nie mnoży ryzyka, legalizacja i kara tylko zmieniają
ułamek, a mnożniki liczy się od nowa z sufitem ×3 (działy) i ×4 (łącznie z przeciwnikiem).
Zgoda daje mandat najwyżej +0,5/mies., poważny incydent zabiera 8, a wejście przez ryzyko
„za Twoją zgodą" — dodatkowe 4. Szczegóły i powody: `17-…`.

## 15.4. Katalog inicjatyw

Inicjatywa = to, co dział może zrobić z własnej woli. Dane: `data/dzialy.js`.

| Pole | Znaczenie |
|---|---|
| `dzialy` | kto może ją podjąć |
| `korzysc` | korzyść dla celów działu (wejście utility) |
| `pilnosc` | jak bardzo „na wczoraj" (zmniejsza P(pytaj)) |
| `ryzyko` | co robi w silniku, jeśli zrobiona **bez** bezpieczeństwa (mnożniki wektorów, nieznane zasoby, dostawca, dane) |
| `bezpiecznie` | wersja „z warunkami": koszt dla gracza (h, PLN), opóźnienie, resztkowe ryzyko |
| `warunek` | kiedy w ogóle możliwa (miesiąc, sezon, stan firmy, inna inicjatywa) |
| `karencja` | po ilu okresach można ją powtórzyć |

Przykłady (wodociągi): zdalny dostęp dla integratora SCADA; modemy 4G z publicznym adresem
w przepompowniach; nowy e-BOK w chmurze; sezonowi pracownicy na wspólnym koncie; prywatny
czat AI do pism; laptopy kupione w markecie „bo IT nie ma czasu"; tania kamera na terenie
stacji; praca zdalna księgowości; zmiana banku; pendrive od integratora z „nową wersją
wizualizacji"; inteligentne wodomierze (skrypt kampanii).

## 15.5. Raport działu na koniec okresu

Każdy dział oddaje krótki raport (2–5 zdań, szablony + liczby z silnika):

1. **Co zrobiliśmy** — postęp w *swoich* celach (wskaźnik biznesowy działu: awarie sieci,
   terminowość faktur, rotacja pracowników…), także skutki decyzji bezpieczeństwa
   („MFA spowolniło logowanie terenowców — 2 skargi").
2. **Co planujemy** — zapowiedź inicjatywy na następny okres. To jest **okno dla gracza**:
   można przyjść z propozycją, zanim dział zrobi coś po swojemu. Zapowiedź pojawia się tylko
   przy zaufaniu ≥ 0,4 — działy, którym nie ufasz, nie mówią o planach.
3. **Problemy** — obciążenie, ludzie, terminy.
4. **Bezpieczeństwo oczami działu** — jedno zdanie zależne od zaufania i zmęczenia
   („Dziękujemy za szybką opinię o e-BOK." / „Na odpowiedź IT czekamy trzeci tydzień.").
5. **Sygnały** — rzeczy, które dział zauważył (dziwny mail o zmianie konta, prośba integratora
   o hasło), zgłaszane z prawdopodobieństwem zależnym od świadomości. Część to prawdziwe
   ślady intruzów z silnika — **jedyna droga, którą bez narzędzi gracz może je zobaczyć**.
6. **Szczerość** — ukryte obejścia pojawiają się w raporcie przy zaufaniu ≥ 0,6 („Przyznajemy:
   w kwietniu daliśmy integratorowi TeamViewera na stacji"); przy 0,4–0,6 jako niejasna
   wzmianka; poniżej — wcale.

Raport zarządu jest inny: co rada/właściciel (gmina) oczekuje, nastroje wobec budżetu,
reakcja na raport gracza.

## 15.6. Reżyser

### Diagnoza — „aktualny problem firmy"

Co okres reżyser liczy ranking problemów z **prawdziwego** stanu (gracz go nie widzi —
widzi tylko skutki w kartach):

| Źródło problemu | Miara |
|---|---|
| Presja wektorów | oczekiwana liczba udanych dostępów / mies. z każdego wektora (analitycznie, bez losowania: `silnik.presjaWektorow`) × waga skutku |
| Luki odtwarzania | brak kopii offline / testów / BCP przy wysokim koszcie dnia przestoju |
| Luki wykrywania | brak EDR, niska jakość operacji przy obecnych intruzach |
| Obejścia działów | liczba i ciężar ukrytych inicjatyw |
| Kalendarz | odległość do terminów (wpis, SZBI, szkolenie kierownika, audyt) × brak przygotowania |
| Ludzie | wypalenie, ryzyko odejścia kluczowej osoby |

Wynik: 1–3 **problemy okresu** z liczbą i zdaniem uzasadnienia. Zapisane w rejestrze.

### Model gracza — śledzenie opanowania celów (BKT)

Dla każdego celu edukacyjnego E1–E12 (`01-…`) reżyser trzyma `P(opanowany)` i aktualizuje
je po każdej ocenionej decyzji (Bayesian Knowledge Tracing, klasyka systemów tutorskich):

```
po decyzji dobrej:  P' = P(1−s) / [P(1−s) + (1−P)g]
po decyzji złej:    P' = P·s / [P·s + (1−P)(1−g)]
potem nauka:        P ← P' + (1 − P')·l
s (pomyłka mimo wiedzy) = 0,1 · g (trafienie bez wiedzy) = 0,2 · l (nauka) = 0,15 · start P = 0,2
```

Karty i scenariusze mają przypisane cele (E-tagi). Reżyser woli sytuacje, które sprawdzają
cele o niskim `P` — ale z **odstępem** (ten sam cel najwyżej raz na 2 okresy), żeby gra nie
stała się korepetycjami z jednego tematu.

### Wybór zdarzeń i obserwacji (po silniku ruchów, `18-…`)

Reżyser **nie podsuwa już ruchów** — każdy ruch jest dostępny zawsze (`18-…`, 18.2). Wybiera
tylko to, co przychodzi z zewnątrz:

```
zdarzenia (proto/rezyser.js → zaplanujMiesiac → { zdarzenia, obserwacje }):
  skrypt kampanii, którego okno obejmuje ten miesiąc: incydenty (S01, S03), sprawy (budżet,
  przejęcie, umowa, wodomierze…), fale haktywistów, kontrola — moment w oknie wg rytmu

obserwacje (informacja, nie pytanie — „co ludzie mówią i co widać"):
  obowiązkowe: w pierwszym miesiącu swojego okna (status KSC, ostrzeżenie CERT, zapowiedź audytu)
  reszta: najwyżej 2 na miesiąc, wynik(o) = trafność w aktualny problem firmy
                                          + (1 − P(opanowany cel_o))
  obserwacja może odsłonić fakt świata (`odkrywa`) albo ustawić flagę (`flaga`)
```

Sprawy od działów (prośby, odkrycia obejść, sygnały) przychodzą od agentów działów, nie od
reżysera. Prośba ma **warunki składane** (`data/dzialy.js`, `warunki`): gracz wybiera zestaw,
resztka ryzyka na wektor = Π(1 − redukcja), a zadowolenie działu = max(0,1; 0,8 − 0,12·(n−1)
− 0,3·opóźnienie) — każdy kolejny warunek i każde opóźnienie to mniej entuzjazmu. Warunek może
wymagać działającej kontroli (MFA), a jego koszt znika, gdy kontrola „zamiast" już działa.

### Rytm (krzywa napięcia)

`napięcie ← 0,6·napięcie + intensywność_okresu` (incydent = 1,0, ciężka karta = 0,3, lekka = 0,1).
- napięcie > 1,2 → reżyser przesuwa *opcjonalne* ciężkie zdarzenia (skrypt — tylko w obrębie
  okna) i dokłada „oddech" (okno budżetowe po incydencie, pozytywny raport działu),
- napięcie < 0,3 przez 2 okresy → reżyser przyspiesza zdarzenie z okna albo wybiera kartę
  z większą stawką.

To rozwiązuje problem „nudnych miesięcy" (`14-…`) bez łamania realizmu: niczego nie
wymyśla, tylko porządkuje to, co i tak mogło się zdarzyć.

### Przeciwnik adaptacyjny (wagi mnożnikowe)

Napastnicy w realu idą tam, gdzie najłatwiej. Reżyser trzyma wagi wektorów `w_v` (start 1)
i po każdym okresie:

```
w_v ← w_v · exp( η · (udane_v / max(1, próby_v) − średnia_skuteczność) ),  η = 0,8
w_v ← przytnij(w_v, 0,5, 2,0) ; potem normalizacja do średniej 1
λ_v w silniku × w_v
```

Plus **rekonesans**: zasoby widoczne z internetu (nieznane graczowi modemy, panel HMI)
podnoszą `w_uslugi` od razu — tak, jak skanery napastników je znajdują.

Skutek dla gry: gracz, który zrobił świetne MFA i kopie, ale ignoruje dostawców, zobaczy,
jak próby przesuwają się na dostawców. To jednocześnie realistyczne i rozbraja **strategię
dominującą** („mała firma" z `14-…`) — przeciwnik szuka dziury, której ona nie łata.

### Granice adaptacji w multiplayerze

- Zdarzenia świata (fale) są wspólne i nieadaptowane.
- Adaptacja dotyczy kart, momentów w oknach i wag przeciwnika *w firmie gracza*.
- Ranking liczy się po Jakości Decyzji, która ocenia decyzję na tle wiedzy gracza — więc
  adaptacja trudności nie wypacza porównań.

## 15.7. Rytm gry: tempo gracza

**Nie ma limitu „jeden ruch dziennie".** Gracz sam kończy okres przyciskiem **„Zamknij
miesiąc"**, kiedy jest gotowy (decyzje podjęte albo świadomie odłożone). Konsekwencje:

- kampanię da się przejść w jeden wieczór albo rozłożyć na tygodnie — stan zapisuje się po
  każdej decyzji,
- **sprawy bez odpowiedzi** w terminie rozstrzygają się same (prośba: „odłożone", dział dostaje
  r = −0,5; oferta wygasa; sygnał — nikt nie sprawdził) — brak decyzji też jest decyzją,
- incydent można poprowadzić w dowolnym momencie miesiąca; **niepodjęty toczy się bez gracza**
  do limitu fazy ostrej przy zamknięciu miesiąca (świat nie czeka),
- multiplayer biurowy: świat ma wspólny kalendarz fal liczonych w **miesiącach gry**, nie
  w dniach realnych — każdy trafia na falę, gdy jego kampania do niej dojdzie.

## 15.8. Gdzie to jest w kodzie (prototyp)

| Plik | Co |
|---|---|
| `proto/silnik.js` | silnik miesiąca (wspólny z Monte Carlo); `st.konf` (skuteczność wdrożeń), `wycofaj`; `presjaWektorow` dla diagnozy |
| `proto/dzialy.js` | agenci działów: wybór inicjatywy, pytaj/obejdź, uczenie, raporty; ryzyko z ułamkami per wektor |
| `proto/rezyser.js` | diagnoza, model gracza (BKT karmiony zasadami), wybór zdarzeń i obserwacji, rytm, przeciwnik |
| `proto/ruchy.js`, `proto/sprawy.js`, `proto/incydent.js`, `proto/zasady.js` | silnik ruchów (`18-…`) |
| `proto/kampania.js` | kampania w terminalu we własnym tempie: ruchy, sprawy, incydenty → zamknij miesiąc |
| `data/dzialy.js` | katalog inicjatyw z warunkami „tak, ale" i wzorce działów |
| `data/kampanie/wodociagi.js` | kampania „Wodnik": działy, fakty świata, obserwacje, sprawy, oś 24 miesięcy |

## 15.9. Model językowy — opcja na później, z barierkami

Jeśli raporty z szablonów okażą się zbyt powtarzalne, można je przepuszczać przez model
językowy **tylko jako redaktora**: wejście = fakty z silnika (liczby, nazwy, zdarzenia) +
osobowość szefa działu; wyjście sprawdzane (czy każda liczba i nazwa z wejścia jest w tekście,
czy nie ma nowych faktów). Gdy sprawdzenie nie przejdzie albo usługa nie działa — szablon.
Model nigdy nie decyduje o stanie gry. Koszt i prywatność (raporty nie zawierają danych
graczy) do oceny przed włączeniem.
