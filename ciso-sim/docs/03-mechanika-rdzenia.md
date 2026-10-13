# 03. Mechanika rdzenia

## 3.1. Dwa zegary

| Zegar | Jednostka | Kiedy | Co gracz robi |
|---|---|---|---|
| **Strategiczny** | 1 tura = 1 miesiąc gry | zawsze | budżet, godziny, projekty, ludzie, polityki, dostawcy, raport dla zarządu |
| **Operacyjny (incydent)** | 1 decyzja = 15 min – 12 h gry | gdy „dzwoni telefon" | triage, izolacja, eskalacja, zgłoszenia, komunikacja, odtwarzanie |

Kampania: **24 tury** (kwiecień 2026 – marzec 2028). Tura strategiczna to ok. 10–20 minut
realnego czasu. **Tempo wybiera gracz** — miesiąc kończy się przyciskiem „Zamknij miesiąc",
bez limitu dziennego (decyzja właściciela; szczegóły i skutki: `15-…`, 15.7).

## 3.2. Pętla miesiąca

```
 ┌─ 1. BRIEFING ────────────────────────────────────────────────────────┐
 │ wiadomości (świat), ostrzeżenia CERT/CSIRT, prośby biznesu, kalendarz│
 │ regulacyjny, stan projektów, „co wiemy o sobie" (mgła wojny)         │
 │ RAPORTY DZIAŁÓW z poprzedniego okresu (agenci, 15-…)                 │
 ├─ 2. DECYZJE ─────────────────────────────────────────────────────────┤
 │ budżet (PLN) → zakupy, umowy, rekrutacje                             │
 │ godziny → kolejka: utrzymanie / alerty / projekty / IT (priorytety)  │
 │ skrzynka decyzji: 2–5 kart (wniosek biznesu, wyjątek od polityki,    │
 │ dostawca bez MFA, prośba o dostęp, oferta ubezpieczyciela…)          │
 ├─ 3. SYMULACJA MIESIĄCA (4 tygodnie) ────────────────────────────────┤
 │ próby ataków → dostępy → postęp intruzów / wykrycia                  │
 │ alerty → triage (godziny) → jakość operacji                          │
 │ projekty zbierają godziny → wdrożenia                                │
 │ zdarzenia biznesowe i skryptowane                                    │
 │   └─ INCYDENT? → tryb operacyjny (3.7)                               │
 ├─ 4. RAPORT DLA ZARZĄDU (co kwartał; co miesiąc — notatka) ──────────┤
 │ gracz wybiera, CO pokazuje i JAK (metryki, ryzyka, prośby)           │
 │ → mandat, budżet na kolejny okres                                    │
 ├─ 5. PODSUMOWANIE: rejestr zdarzeń miesiąca, zmiany wskaźników ───────┤
 └─ 6. DZIAŁY I REŻYSER: działy uczą się z odpowiedzi gracza i planują   ┘
      kolejny okres; reżyser diagnozuje „aktualny problem", aktualizuje
      model gracza, przeciwnika i rytm, dobiera karty na następny miesiąc
```

Pętla jest **grywalna w prototypie**: `proto/kampania.js` (kampania „Wodnik", `16-…`).

## 3.3. Zasoby i waluty

Lekcja ze Snakes (`CLAUDE.md` w repo głównym): **rozdzielone waluty są fundamentem, nie
szczegółem.** Tam coins i punkty chronią przed pętlą farmienia; tutaj rozdział PLN / godziny
/ mandat chroni przed „kupieniem bezpieczeństwa".

### Twarde (wydaje się je i znikają)

| Zasób | Skąd | Na co | Uwagi |
|---|---|---|---|
| **Budżet (PLN)** | roczny budżet bezpieczeństwa uchwalony przez zarząd (styczeń; na start kampanii — kwiecień, pro rata) + wnioski nadzwyczajne + granty (sektor publiczny) | wdrożenia, abonamenty, usługi, pensje nowych etatów, szkolenia, audyty, kary, okupy | nie przechodzi na kolejny rok (realne „wydaj albo stracisz" w budżetach); w sektorze publicznym zakup > 130 tys. zł netto = przetarg (opóźnienie) |
| **Godziny (h/mies.)** | etaty bezpieczeństwa × 120 h + godziny oddawane przez IT + godziny kupione (MSP, vCISO, retainer) | utrzymanie kontroli, triage alertów, projekty, obsługa incydentów, audyty, szkolenia | **najważniejsza waluta gry**. Nie da się ich kupić szybko (rekrutacja trwa miesiące). Nadgodziny do +30% kosztem morale. |

### Miękkie (wskaźniki 0–100, zmieniają się od decyzji i zdarzeń)

| Wskaźnik | Rośnie, gdy | Spada, gdy | Skutek |
|---|---|---|---|
| **Mandat zarządu** | rzetelny raport, wcześnie wykryty incydent, zdany audyt, ćwiczenia z zarządem, dotrzymane terminy projektów, trafne ostrzeżenie | wymuszanie kontroli z tarciem, fałszywe alarmy eskalowane do zarządu, poślizgi, incydent źle prowadzony, „straszenie" bez danych, przemilczenie ryzyka, które potem wybuchło | przy niskim mandacie wnioski budżetowe przepadają, zarząd forsuje wyjątki („prezes bez MFA"); przy 0 — gracz zostaje **odwołany** (koniec kampanii) |
| **Tarcie** | kontrole i polityki uciążliwe dla ludzi (suma `tarcie` z katalogu, z wagą wdrożenia) | SSO, passwordless, dobra komunikacja, szkolenia „po ludzku", konsultacja z działami przed wdrożeniem | wysokie tarcie → **shadow IT** (ukryty wzrost nieznanych zasobów, prywatne konta w chmurze, „obejścia"), spadek produktywności (mały, ale widoczny w przychodach), spadek mandatu |
| **Morale zespołu** | normalne godziny, szkolenia i certyfikaty, docenienie po incydencie, sensowne narzędzia | nadgodziny, dyżury, zalew alertów, praca „do szuflady", obwinianie | niskie → odejścia (z okresem wypowiedzenia — gracz ma 1–3 mies. ostrzeżenia), błędy w triage |
| **Reputacja** | sprawna, uczciwa komunikacja incydentu; certyfikaty; dobre wyniki audytów | wyciek w mediach, opóźnione/ukryte zawiadomienie, **publiczne „wskazanie palcem"** przez państwo (doktryna z 10.2026), przestój widoczny dla klientów | przychody (utrata klientów), trudniejsza rekrutacja, warunki ubezpieczenia |
| **Zgodność** | wdrożone obowiązki KSC/RODO/DORA/KRI **z dowodami** | brak wpisu, spóźnione zgłoszenia, brak szkolenia kierownika, przegląd SZBI po terminie | wynik audytu; ryzyko kar (od 2028 realne) |

### Wskaźniki techniczne (częściowo ukryte — patrz mgła wojny)

| Wskaźnik | Co znaczy |
|---|---|
| **Znane zasoby** | jaka część prawdziwych zasobów jest w ewidencji (start: 65–90%) |
| **Pokrycie** kontroli | dla kontroli „na zasobach" (EDR, łatki): znane × wdrożone |
| **Dług podatności** | lista znanych podatności z wiekiem; krytyczne po SLA = rosnące ryzyko |
| **Jakość operacji** | godziny triage / potrzeba triage (zmęczenie alertami) |
| **Gotowość reagowania** | plan IR, ćwiczenia, retainer, MDR, SOAR (suma, sufit 0,8) |
| **Odporność odtwarzania** | kopie offline, testy DR, BCP, segmentacja (mnożnik przestoju) |
| **Dojrzałość CSF** | 0–5 na każdą z 6 funkcji (`10-etapy-rozwoju.md`) |

## 3.4. Mgła wojny — co gracz widzi, a co jest prawdą

Każdy wskaźnik techniczny ma dwie wartości: **prawdziwą** (silnik) i **oszacowaną** (ekran).
Szacunek ma przedział, który zawęża się, gdy gracz *kupi wiedzę*.

| Niewiadoma | Prawda w silniku | Jak się dowiedzieć |
|---|---|---|
| Ile mamy zasobów i jakich | `znane` < 1 | inwentaryzacja, skan sieci, ASM, moje.cert.pl, audyt |
| Jakie mamy podatności | lista z CVSS i ekspozycją | skaner, pentest, ostrzeżenia CERT |
| Czy ktoś już jest w środku | lista intruzów (mogą być **od startu kampanii** — dziedzictwo po poprzedniku) | wykrycie, threat hunting, kompromitacja ujawniona z zewnątrz (CERT, media, okup) |
| Czy dostawca jest bezpieczny | prawdziwy poziom dostawcy ≠ deklaracja w ankiecie | ankieta (tania, kłamie), audyt dostawcy (drogi), certyfikat (średnio), incydent (najdroższy) |
| Jak podatni są ludzie | odsetek klikających (z szumem) | symulacje phishingu (pomiar z błędem, spada po szkoleniach) |
| Czy kopie się odtworzą | `dziala` / `nie dziala` dla każdej kopii | test odtworzenia (pierwszy często się nie udaje — i dobrze) |
| Czy polityka jest przestrzegana | adopcja 0–100% | audyt wewnętrzny, kontrola techniczna, rozmowy |

**Zasada uczciwości:** każda niewiadoma ma sygnały, które uważny gracz mógł zobaczyć
(np. „dziwne logowania z zagranicy" w briefingu, prośba działu o „szybkie otwarcie portu").
Debrief zawsze je pokazuje.

## 3.5. Projekty, utrzymanie, alerty — jak liczą się godziny

Ta część jest już zaimplementowana w `proto/symulacja.js` i sprawdzona symulacją.

1. **Zlecenie wdrożenia**: płacisz `wdrozenie.pln` z góry, a **abonament od podpisania umowy**
   — także wtedy, gdy wdrożenie się ślizga („płacimy za SIEM od pół roku, a on dalej się
   wdraża" — klasyka).
2. **Kolejka godzin** w miesiącu, w kolejności wybranej przez gracza (domyślnie):
   **utrzymanie** czynnych kontroli → **triage alertów** → **projekty** po kolei → reszta dla IT.
   - Niedobór na utrzymanie: skuteczność wszystkich kontroli × (dane / potrzebne).
   - Niedobór na triage: **jakość operacji** = dane / potrzebne (min. 0,15) — mnoży szansę
     wykrycia przez narzędzia własne. Usługi zewnętrzne (MDR) mają własnych ludzi.
   - Projekty dostają resztę. Wdrożenie kończy się, gdy zbierze godziny i minie minimalny czas.
3. **Strojenie**: przez 3 miesiące po wdrożeniu narzędzie wykrywające daje 2× więcej alertów.
   Gracz może przeznaczyć godziny na strojenie (szybciej spada) — opcja w grze.
4. **Skala firmy**: godziny w katalogu są dla firmy referencyjnej (~330 zasobów); mniejsze i
   większe firmy skalują je potęgą 0,6 (z podłogą i sufitem).
5. **Gracz może zmienić kolejność** (np. projekty przed alertami: szybkie wdrożenia, ślepy SOC).
   To jest jedna z najważniejszych decyzji gry i nie ma jednej dobrej odpowiedzi.

## 3.6. Silnik zagrożeń (skrót — pełny model w `07-…`)

Co tydzień gry:
1. **Próby** z każdego wektora: liczba ~ Poisson(λ × profil firmy × skala). Skala: wektory
   „ludzkie" rosną z liczbą ludzi, „techniczne" z liczbą zasobów (potęgowo).
2. **Dostęp** udaje się z prawdopodobieństwem `p × Π(1 − zapobiega_k × skuteczność_k)`.
3. **Kto to jest** — losowanie sprawcy z wag wektora × profil (wodociągi: haktywiści, energetyka: APT).
4. Każdy intruz co tydzień: **wykrycie** (zależne od etapu, narzędzi, jakości operacji,
   skrytości sprawcy) → opanowanie (koszt rośnie z etapem; może się nie udać) **albo postęp**
   do kolejnego etapu (utrudniany przez kontrole) **albo wygaśnięcie** (pospolite infekcje).
5. Dojście do celu = **skutek** (szyfrowanie, wyciek, sabotaż, szpiegostwo, BEC, DDoS) i
   w grze: przełączenie w tryb incydentu z odpowiednim scenariuszem.

Na to nakładają się **zdarzenia skryptowane kampanii** (każda firma ma 4–6 „testów
obciążeniowych" w oknach czasowych; patrz `09-…`). Silnik losowy daje tło i niespodzianki,
skrypt — gwarancję, że każda kampania przećwiczy najważniejsze lekcje.

**Kompresja czasu:** wartości λ są kalibrowane tak, żeby firma bez ochrony miała w grze
poważny incydent mniej więcej raz na 1–2 lata gry (patrz `14-samoewaluacja.md`). To więcej niż
w życiu — świadomie, i gra o tym mówi.

## 3.7. Tryb incydentu (zegar operacyjny)

Incydent to scenariusz z `scenariusze/` (albo generyczny, złożony z klocków, gdy silnik
wylosuje coś bez scenariusza). Elementy ekranu:

- **Oś czasu** (T+0, T+15 min, …) i **zegary regulacyjne** odliczające realny czas gry:
  KSC 24 h / 72 h / 1 mies., RODO 72 h, DORA 4 h od klasyfikacji, umowne (klient: „powiadomienie
  w 24 h"), ubezpieczyciel („zgłoszenie szkody niezwłocznie, przed zaangażowaniem firm
  zewnętrznych — inaczej odmowa").
- **Co wiemy / czego nie wiemy** — lista faktów z poziomem pewności. Nowe fakty przychodzą
  w miarę czasu i działań (analiza, forensyka).
- **Decyzje** — 2–5 opcji na fazę. Każda ma koszt (czas gry, godziny, PLN, mandat) i skutki
  (część od razu, część ukryta do debriefu).
- **Ludzie** — kto jest dostępny (nocą, w weekend, na urlopie), kto jest zmęczony.
- **Komunikacja** — szablony: pracownicy, zarząd, klienci, media, CSIRT, UODO, policja,
  ubezpieczyciel, dostawca. Treść ma znaczenie (gra ocenia elementy: fakty, czego nie wiemy,
  co robimy, co mają zrobić odbiorcy, kiedy kolejna informacja).

Zakończenie incydentu: **raport końcowy** (gracz składa go z klocków) i **lekcje** — można je
zamienić na zadania w kolejnych turach (to podnosi ocenę: organizacja uczy się na błędach).

## 3.8. Zarząd i raportowanie

Co kwartał gracz składa **raport dla zarządu** z klocków:
- metryki (wybór: % pokrycia EDR, MFA, czas łatania krytycznych, wyniki phishingu, incydenty,
  stan projektów, zgodność z KSC, top 5 ryzyk w złotówkach),
- ryzyka (gracz wybiera, które pokazać i jak je wycenić),
- wnioski (budżet, decyzja o akceptacji ryzyka, zmiana polityki).

Zarząd ma **osobowości** (np. prezes-optymista, CFO liczący każdą złotówkę, członek zarządu
po incydencie w poprzedniej firmie). Wynik raportu zależy od:
- **trafności** (czy pokazane ryzyka były prawdziwe — silnik wie),
- **zrozumiałości** (metryki biznesowe > techniczne),
- **spójności** (raport sprzeczny z poprzednim kosztuje),
- **uczciwości** (ukryte ryzyko, które wybuchło, to duża kara mandatowa; „straszenie" bez
  danych — mała, ale kumulująca się).

**Akceptacja ryzyka** to legalny ruch: zarząd może formalnie przyjąć ryzyko (np. „nie
segmentujemy w tym roku"). Jeśli to ryzyko wybuchnie, a akceptacja była świadoma i
udokumentowana — mandat gracza **nie** spada (to decyzja zarządu). To ważna lekcja o
rozliczalności.

## 3.9. Skrzynka decyzji — rodzaje kart

Co miesiąc 2–5 kart. Część losowa, część skryptowa, część wynika z wcześniejszych decyzji.

| Rodzaj | Przykład | Napięcie |
|---|---|---|
| Wyjątek od polityki | „Prezes chce, żeby MFA go nie dotyczyło — za dużo podróżuje" | mandat vs ryzyko |
| Wniosek biznesu | „Marketing chce narzędzia AI do analizy bazy klientów — od jutra" | tarcie vs RODO/wyciek |
| Dostawca | „Integrator SCADA potrzebuje stałego zdalnego dostępu" | ciągłość vs ekspozycja |
| Ludzie | „Twój jedyny analityk dostał ofertę +40% z Warszawy" | budżet vs ciągłość zespołu |
| Oferta | „Ubezpieczyciel: polisa 5 mln, ale ankieta pyta o MFA na wszystkich kontach" | uczciwość vs koszt |
| Regulacja | „Minął termin samorejestracji. Rejestrujesz się z opóźnieniem?" | zgodność vs ekspozycja |
| Wiadomość ze świata | „CERT Polska: aktywnie wykorzystywana podatność w VPN, którego używacie" | priorytet vs plan |
| Etyka | „Kierownik działu prosi o wgląd w pocztę pracownika, którego podejrzewa" | prawo pracy, RODO, zaufanie |

Każda karta ma opcję „odłóż" — z kosztem (sprawa wraca, zwykle gorsza).

## 3.10. Rejestry (wzorzec ze Snakes)

Wszystko, co zmienia wskaźnik, zapisuje **wiersz w rejestrze** z przyczyną:
`(tura, tydzień, rodzaj, wskaźnik, zmiana, ref, opis, wiedza_gracza)`.

- `ref` łączy wpisy jednej decyzji lub jednego incydentu (jak `sl_activity.ref` w Snakes —
  front rysuje je jako blok).
- `wiedza_gracza` to zrzut tego, co gracz widział w chwili decyzji — **na tym stoi ocena
  jakości decyzji**.
- Debrief, wykresy i ocena **czytają rejestr, nigdy nie przeliczają wzorem** (zmiana stawek
  nie psuje starych kampanii — ta sama lekcja co `sl_boss_payouts`).

## 3.11. Koniec kampanii

- **Normalny**: miesiąc 24 — audyt (S12) i raport końcowy.
- **Odwołanie**: mandat = 0 (zarząd Cię zwalnia). Kampania kończy się debriefem „co
  doprowadziło do odwołania".
- **Upadłość / przejęcie zarządu komisarycznego**: straty > progu firmy (rzadkie, ale możliwe
  przy P90 w małych firmach).
- **Odejście z własnej woli**: gracz może złożyć wypowiedzenie (np. gdy zarząd odrzuca
  wszystko). To też jest wynik i też ma debrief — czasem to najlepsza decyzja.
