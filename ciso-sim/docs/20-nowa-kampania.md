# 20. Nowa kampania: plik wejściowy, który pokrywa wszystko

Uwaga właściciela (14.10.2026) po dodaniu gminy: „zobacz, o ile rzeczy muszę dopytać, kiedy
tworzysz nową kampanię — zapominasz". Rzeczywiście: po pierwszej wersji gminy trzeba było
osobno dopominać się o cennik złych decyzji, automaty innych stylów i zasady praktyki dla
spraw kampanii. Przyczyna nie leżała w gminie, tylko w silniku: część tych rzeczy siedziała
w kodzie (`proto/`) z identyfikatorami Wodnika, więc nowa kampania dostawała je „przy okazji"
albo wcale, a nic tego nie sprawdzało.

Teraz obowiązuje zasada: **kampania to kompletny plik wejściowy symulacji, a silnik jest
generyczny**. Wszystko, czego potrzebują gra, automaty, laboratoria (`brzegowe.js`,
`porownaj-style.js`) i cennik, jest w `data/kampanie/<id>.js`. Kompletność pilnuje walidator
**`kontraktKampanii`** (`proto/kampania.js`): kampania z brakiem nie wystartuje
(`nowaKampania` rzuca błąd z listą braków), a testy „każda kampania" (`test/prototyp.test.js`)
biorą każdy plik z `data/kampanie/` bez wymieniania go z nazwy.

## 20.1. Lista kontrolna pliku kampanii

Kolejność jak w plikach-wzorcach (`wodociagi.js`, `gmina.js`). Każdy punkt ma w walidatorze
wiersz z powodem — ta lista jest jego opisem po ludzku.

| # | Pole | Co musi być | Kto tego używa |
|---|---|---|---|
| 1 | `firma` | profil z `data/firmy.js` (OT, status KSC, ludzie, budżet) | silnik, walidacja |
| 2 | `tytul`, `rola`, `start {rok, miesiac}`, `miesiecy`, `h_gracza`, `wstep` (≥ 2 zdania) | ramy kampanii | gra, raport |
| 3 | `wskazniki {mandat, reputacja, morale}`, `budzet` na pierwszy rok | punkt wyjścia | silnik |
| 4 | `reakcja_na_ostrzezenie` + `reakcja_dlaczego` | ruchy, które są sensowną reakcją na ostrzeżenie dla sektora | zasada „reakcja" |
| 5 | `dzial_ot` (tylko firma z OT) | dział, który prowadzi sieć przemysłową | przegląd OT, doradca „OT" |
| 6 | `dzialy` (≥ 3, w tym **`zarzad`, `kadry`, `finanse`**) z `nazwa, szef, osobowosc, cele, kpi` | agenci działów | raport dla zarządu, przegląd kont, S01 |
| 7 | `fakty` (≥ 2): każdy z **drogą odkrycia** (`widoczne_z_internetu`, `zna`, `konta`, `na_obiekcie`…) i **drogą naprawy** (`naprawa {ruch, p, po}`, `naprawia_wdrozenie` albo `bez_naprawy: 'dlaczego'`) | ukryte drzwi świata | mądry zamyka znane fakty generycznie, skąpiec też (darmowe naprawy) |
| 8 | `ruchy` kampanii (opcjonalne): `nazwa, kategoria, wykonaj`, bez `ocena`/`pkt` | ruchy, które mają sens tylko tu (Wodnik: odcięcie HMI) | lista ruchów |
| 9 | `kupione`, `na_starcie`, `warianty` (opcjonalne) | sprzęt z grantu, zastane ustawienia, inne dane incydentu | silnik, incydent |
| 10 | `obserwacje`: jedna **wymuszona w m. 1**, jedna z `flaga: 'ostrzezenie_cert'`, jedna z `flaga: 'audyt_zapowiedziany'` | punkt wyjścia, sygnał dla sektora, pokusa dat wstecznych | zasady, odstępstwa ogólne |
| 11 | `certyfikaty` (≥ 2), `koniec_wsparcia` (≥ 1) | decyzje cykliczne | `data/cykliczne.js` |
| 12 | `zdarzenia` (oś): ≥ 1 `incydent`, **dokładnie 1** `final` (audyt zamykający), `termin` SZBI dla podmiotu w KSC, każda `fala` ze `skutek(k, a)` | oś kampanii | silnik, reżyser |
| 13 | `przygotowanie[incydent]`: `ruchy` (prefiksy ruchów, które zmieniają start incydentu), opcjonalnie `sprawy` | co znaczy „być przygotowanym" | cennik („bez przygotowania") |
| 14 | `sprawy` kampanii (≥ 3) | decyzje tej organizacji | gra |
| 15 | `automaty.{madry, laik, potakiwacz, skapiec, klamca}.sprawy[sid]` dla **każdej** sprawy kampanii | jak gra każdy styl | automaty, laboratoria |
| 16 | `automaty.laik.obserwacje[id]` dla **każdej** obserwacji (`[]` = słyszy i nic nie robi) | laik reaguje na to, co widzi | rozsądny laik |
| 17 | `automaty.madry.ruchy(k, A)` (opcjonalne) | ruchy mądrego, które mają sens tylko tu | mądry |
| 18 | `zasady` dla każdej sprawy kampanii **albo** powód w `sprawy_bez_zasady` | ocena praktyki | `proto/zasady.js` → `zasadyKampanii` |
| 19 | `odstepstwa`: co najmniej jedno na **każdą** sprawę kampanii | cennik złych decyzji | `proto/cennik.js` |

**Wartości w `automaty.<styl>.sprawy[sid]`:** lista decyzji `[{ v, p }]` (pierwsza dostępna
wygrywa), funkcja `(k, s, A) → lista`, `'madry'` (jak mądry) albo `null` (**świadomie** bez
odpowiedzi — rozstrzyga termin). Brak klucza to błąd: tak wyglądało „zapominanie".

**Zasada sprawy (deklaratywnie):** `{ sprawa, id, waga, cel, opis, dlaczego, wybierz?, kazda?,
ocena(e, k) → true | false | null }`. `wybierz` dobiera wpisy historii (domyślnie odpowiedź
gracza na tę sprawę), `ocena` mówi, czy praktyka była dobra; `null` = nie oceniamy.

**Odstępstwo kampanii (deklaratywnie):** `{ sprawa: sid, v, p }` (jedna zła odpowiedź; `v: null`
= nie odpowiadać), `{ sprawy: { sid: { v, p }, … } }` (kilka naraz, np. „kartony na później,
a na kontrolę oświadczenie, że działa") albo `{ ruchy(k, A), filtr(id, p) }` (zmiana ruchów).

## 20.2. Plik incydentu (`scenariusze/<id>-*.incydent.js`)

Oprócz zegara, akcji, dynamiki, zasad i debriefu (`18-…`, 18.8) plik musi mieć:

- `kampania` — w której kampanii incydent gra się domyślnie (`rozegraj.js` bez `--kampania`),
- `automaty: { wzorcowo: s => [...], laik: s => [...] }` — plany akcji zależne od stanu startu
  (np. `s.proba`, `s.udaremnione`): test sprawdza, że używają tylko istniejących akcji,
  także przy odwróconych flagach,
- `odstepstwa: { nazwa: (plan, s) => plan }` (≥ 2) — typowe błędy w prowadzeniu incydentu.

Inna organizacja z tym samym incydentem = `warianty[id]` w pliku kampanii, nie kopia incydentu.

## 20.3. Cennik złych decyzji — dla każdej kampanii, bez kodu

`node ciso-sim/proto/cennik.js [N] [--kampania=<id>]` liczy, ile kosztuje **jedno** odstępstwo od
dobrej praktyki w grze mądrego (różnica Wyniku na tych samych ziarnach). Odstępstwa mają trzy
źródła, więc nowa kampania dostaje cennik od razu:

1. **ogólne** (`proto/cennik.js`, `OGOLNE`): to, co jest w każdej organizacji — upiększone
   raporty, dokumenty wstecz, „cały katalog naraz", bez testów, odmowa każdej prośby…
   (pozycje `tylko_ot` tylko w firmach z OT);
2. **incydent** (plik incydentu, `odstepstwa`): każde także w wariancie „bez przygotowania +",
   bo przygotowany mądry ich nie popełnia (atak zamienia się w próbę), oraz samo
   „bez przygotowania do X" z pola `przygotowanie` kampanii;
3. **kampania** (plik kampanii, `odstepstwa`): zła odpowiedź na każdą sprawę.

Test „każde odstępstwo naprawdę zmienia grę" pilnuje, żeby odstępstwa kampanii i incydentu
nie były martwe (na 6 ziarnach przynajmniej raz zmieniają akcje mądrego). Ogólne mogą nie
dotyczyć danej kampanii — wtedy cennik pokazuje 0 i to też jest informacja (np. mądry wdraża
EDR tak późno, że „EDR zostaje w trybie wykrywaj" nie zdąży nic zmienić — 17.10).

## 20.4. Co silnik robi sam (i czego plik NIE musi mieć)

- sprawy cykliczne (odnowienie umowy, certyfikat, koniec wsparcia, zalew alertów, kolejka
  projektów) — `data/cykliczne.js`, wspólne dla wszystkich kampanii, z odpowiedziami automatów
  w silniku. Zmiany firmy (rozbudowa, cięcie budżetu, odejście z IT) są sprawami kampanii
  (Wodnik), bo ich treść zależy od organizacji — nowa kampania pisze własne;
- ruchy OT i warianty parametrów OT — znikają w firmie bez OT (`rozwiazParam`, `dopasujParam`);
- zamówienia publiczne (próg Pzp) — z profilu firmy;
- generyczne zamykanie znanych faktów przez mądrego (z pola `naprawa`) i przez skąpca (gdy
  naprawa jest darmowa);
- zasady ogólne (`proto/zasady.js`), a zasady kampanii w tym samym miejscu listy
  (`zasadyKampanii`), więc kolejność oceny się nie zmienia.

## 20.5. Jak dodać kampanię (kolejność pracy)

1. Profil w `data/firmy.js`, projekt w `09-…`, fakty prawne ze statusem w `02-…`.
2. Skopiować wzorzec (`gmina.js` dla firmy bez OT, `wodociagi.js` z OT) i wypełnić 20.1.
3. `node -e "const K=require('./ciso-sim/proto/kampania');console.log(K.walidujKampanie(K.pelnaDefinicja('<id>')))"`
   — pusta lista albo braki z powodami.
4. `node --test ciso-sim/test/*.test.js` — testy „każda kampania" obejmą nowy plik same
   (kolejność stylów, kłamca pod sufitem, niezmienniki, mądry odpowiada na każdą sprawę,
   plany incydentów, żywe odstępstwa).
5. `porownaj-style.js`, `brzegowe.js`, `cennik.js` z `--kampania=<id>`; wyniki w
   `proto/wyniki-*-<id>-<data>.txt`, opis w `docs/<nr>-kampania-<id>.md`.

## 20.6. „Symulacja genetyczna"?

Prośbę przeczytałem jako „generyczna" (jeden silnik, kampanie jako dane). Jeśli chodziło
o **algorytm genetyczny** — populacja strategii krzyżowanych i mutowanych w poszukiwaniu
takich, które oszukują ocenę (wysoki Wynik przy złej praktyce) — to naturalny następny krok
po tym porządku: przestrzeń strategii to dziś `zMadrego({ sprawa, ruchy, filtr, playbook })`
plus odstępstwa z cennika, a funkcją przystosowania byłby Wynik kampanii. Takie „ewoluujące
prowokacje" znajdowałyby dziury w balansie, których ręcznie napisane strategie z 17.1 nie trafią.
