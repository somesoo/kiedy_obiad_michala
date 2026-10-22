# Linia Obrony (ciso-sim) — notatki dla Claude

Osobna gra w tym repo: symulator osoby odpowiedzialnej za cyberbezpieczeństwo w polskiej
organizacji. **Nie jest częścią Snakes** — nie importuje niczego z `../server.js` ani `../lib/`
(wzorce się kopiuje, nie współdzieli). Start: `README.md`, potem `docs/01…20` (silnik gry: `docs/18-silnik-ruchow.md`, nowa kampania: `docs/20-nowa-kampania.md`).

Stan: projekt + dane + silnik miesiąca + działy-agenci + reżyser + **silnik ruchów bez quizu**
+ **dwie grywalne kampanie w terminalu** („Wodnik” — wodociągi, „Gmina Brzozów Wielki”) + 12
scenariuszy (S01, S03, S07 jako incydenty bez drzewa) + testy. Serwera, logowania i frontu w
przeglądarce jeszcze **nie ma** (roadmapa: `docs/13-roadmapa.md`).

Decyzje właściciela (13.10.2026): odbiorcy — biuro; pierwsza kampania — wodociągi; **tempo
gracza** (bez limitu „jeden ruch dziennie", gracz sam zamyka miesiąc); na koniec okresu
raporty innych działów; algorytmy uczące się na aktualnym problemie firmy; merytorykę oceni CISO;
**gra nie może być w żadnym stopniu quizem** — pełna dowolność ruchów i kolejności, każdą zmianę
można przejrzeć, przetestować i wycofać (`docs/18-…`).

## Zasady

- **Liczby żyją w `data/*.js`**, dokumenty mówią DLACZEGO. Zmieniasz liczbę — popraw opis
  w `docs/04-…` / `docs/07-…` / `docs/09-…` (jak cennik w regulaminie Snakes).
- **Każdy fakt prawny ma status** w `docs/02-realia-polskie.md`: ✅ potwierdzone, 🟡 do
  potwierdzenia w Dz.U., 🔵 uproszczenie gry. Scenariusz nie może używać faktu prawnego,
  którego tam nie ma. Nie zmieniaj 🟡 na ✅ bez tekstu aktu albo komunikatu organu.
- **Firmy, osoby, produkty w grze są fikcyjne.** Prawdziwe incydenty tylko jako inspiracja
  w debriefie, ze źródłem, bez przypisywania winy.
- **Wszystko po polsku**, komentarze tłumaczą DLACZEGO (jak w całym repo).
- **Mgła wojny**: prawda silnika (`campaign_state`) nigdy nie trafia do frontu — tylko
  oszacowania (`campaign_view`). To jak „atak nie nazywa celu" w Snakes.
- **Rejestr, nie liczniki**: każda zmiana wskaźnika ma wiersz z przyczyną i zrzutem wiedzy
  gracza; debrief i Jakość praktyki czytają rejestr.
- **Gra o bezpieczeństwie musi być bezpieczna**: logowanie hasłem (scrypt), sesje z
  wygasaniem, limity prób, brak domyślnego hasła admina, hasła nigdy w URL. Nie kopiuj
  `/api/register` ani `checkAdmin` z Snakes (`docs/12-…`, 12.3).
- **Ta gra ma mieć testy** (`node --test` na czystym silniku) — w odróżnieniu od reszty repo.
- **Algorytmy działów i reżysera** (`docs/15-…`): deterministyczne, każdy podsystem ma WŁASNY
  strumień losowości (silnik, działy, reżyser) — dołożenie losowania w jednym nie może przesunąć
  „pogody" w innym. Każdy wybór loguje powód (`k.log`). Reżyser **nie zmienia skuteczności
  kontroli gracza**, wybiera tylko spośród prawdopodobnych zdarzeń i moment w oknie.
- **Test obciążeniowy nie wypada przed swoim sygnałem** (S03 po ostrzeżeniu CERT) — „żadnych gotcha".
- **Bez quizu** (`docs/18-…`): nigdzie — w ruchach (`data/ruchy.js`), czasownikach spraw ani akcjach
  incydentów — nie ma pól `ocena`/`pkt` (walidatory i test to sprawdzają). Praktykę ocenia
  `proto/zasady.js` na historii ruchów (`k.historia`) i stanie; każda zasada ma wagę, cel
  i „dlaczego". Ruch jest dostępny zawsze, chyba że jest obiektywny powód — i wtedy
  `dostepny()` zwraca go po polsku. Nowy ruch: wpis w `data/ruchy.js` (albo parametry/usterki/
  test/pilot kontroli w `data/kontrole.js`), zasada w `proto/zasady.js`, jeśli ma oceniać praktykę.
- **Prawda ukryta, wiedza zdobywana**: jakość wdrożeń, usterki, dryf (strumień `wdrozenia`),
  niezgodność z OT, fakty świata (`k.fakty`). Automaty widzą tylko to, co gracz (`apiAuto`).
- **Incydent bez drzewa** (`proto/incydent.js`): akcje w dowolnej kolejności, czas płynie
  (`dynamika`), zasady na końcu; zasady „nie rób X" z `tylko_gdy_dzialal`. Przygotowanie
  z kampanii zmienia `start`. Niepodjęty incydent toczy się bez gracza przy zamknięciu miesiąca.
- **Sprawy** (`proto/sprawy.js`): każda ma termin, rozstrzygnięcie domyślne, ≥ 2 czasowniki
  i tani uczciwy (bez złotówek, ≤ 8 h) — walidator kampanii. Kłamstwo to ruch albo odpowiedź
  (`nieuczciwe` w ruchu, `a.klamstwo` w sprawie), rejestr `k.klamstwa`.
- **Reguły z przypadków brzegowych** (`docs/17-…`, 17.5–17.8): żaden mnożnik nie rośnie
  przyrostowo bez sufitu (rejestr `k.ryzyka`); wynik to **Wynik kampanii** (½ Indeks Odporności
  + ½ Jakość praktyki), nie mandat; koszty reagowania nie idą z budżetu; sygnały bywają
  fałszywe, szacunki mają błąd; **kara musi trafić w wynik**; wynik liczy się z prawdy, nie
  z wykrycia (ekspozycja, prawdziwa skuteczność kontroli, sufity `BRAMKI`); każde narzędzie
  wykrywające ma `martwe_pola`; uczciwa opcja ma cenę, inaczej nieuczciwa nie jest pokusą;
  ujawnienie kłamstwa (`ujawnij`) uderza we współpracę. Kampania jest skończona i kończy się
  **audytem zamykającym** z dowodami (przegląd/test w ostatnim roku, próbki usterek).
- **Skończone zasoby i decyzje w każdym okresie** (`docs/18-…`, 18.12): projekty w toku zjadają
  godziny gracza (`Z.koordynacja`), ponad 3 naraz — godziny zespołu (`Z.karaWip`); sprawy
  cykliczne (`data/cykliczne.js`, `proto/cykl.js`) powstają ze STANU firmy, losowanie tylko
  ze strumienia `k.rnd.cykl`. Skutek decyzji, który trwa (helpdesk po odejściu, zastępstwo),
  idzie przez `a.hUtrata`/`a.kosztStaly`/`a.bonusGodzin`, nie przez stałe w kodzie.
- **Doradztwo** (`docs/18-…`, 18.13; `proto/doradztwo.js`): doradca tylko odsłania i wycenia,
  nie zmienia skuteczności kontroli. Wycena przez `K.coJesli` — na kopiach stanu, bez ruszania
  kampanii i strumieni losowości (test to pilnuje). Losowanie: `k.rnd.doradztwo`.
- **Kampania = KOMPLETNY plik wejściowy** (`data/kampanie/<id>.js`, wzorce: `wodociagi.js`,
  `gmina.js`; lista kontrolna: `docs/20-nowa-kampania.md`). Nic w `proto/` nie może zakładać
  konkretnej kampanii: id działów, faktów i spraw, ruchy tylko tej organizacji, odpowiedzi
  automatów **każdego stylu** (`automaty.{madry,laik,potakiwacz,skapiec,klamca}`), zasady spraw
  (`zasady` / `sprawy_bez_zasady`), odstępstwa dla cennika (`odstepstwa`), przygotowanie do
  incydentów (`przygotowanie`) — wszystko w pliku. **Walidator `kontraktKampanii` pilnuje
  kompletności**: kampania z brakiem nie wystartuje, a testy „każda kampania" obejmują każdy
  plik z `data/kampanie/` bez wymieniania go. Nie „dopisuj w silniku na szybko" — rozszerz
  kontrakt i oba pliki-wzorce. Incydent: `kampania`, `automaty.{wzorcowo,laik}`, ≥ 2
  `odstepstwa`. Inna organizacja z tym samym incydentem = `warianty[id]` w pliku kampanii.
- **Cennik złych decyzji jest dla każdej kampanii** (`proto/cennik.js --kampania=<id>`): ogólne
  (`OGOLNE`) + incydent (także „bez przygotowania") + kampania. Nowa mechanika, w której da się
  źle zdecydować, dostaje odstępstwo w cenniku (`docs/20-…`, 20.3).
- **Zapis gry = lista akcji** (`k.akcje`: `ruch`, `sprawa`, `inc_start`, `inc`, `inc_czekaj`,
  `inc_koniec`, `zamknij`), wczytanie = odtworzenie z ziarna (`wykonajAkcje`). Nowa akcja gracza
  musi przechodzić przez `RU.wykonaj`/`SP.odpowiedz`/funkcje incydentu w `proto/kampania.js`
  i trafiać do `k.akcje`, inaczej zapis przestanie odtwarzać stan. Nowe losowanie — tylko
  z właściwego strumienia `k.rnd.*`. Plik zapisu pamięta kampanię (`kampania`).
- **Lab SIEM/SOAR** (`lab/`, `docs/21-…`, odnoga `ciso-siem-soar`): incydent obsługiwany w zewnętrznym
  SIEM-ie i SOAR-ze właściciela, każdy gracz = tenant (MSSP). Akcje techniczne tylko jako playbooki
  (podpisane HMAC wywołania), wiedza tylko w SIEM-ie (ustalenia wpisywane, nie wybierane), podpowiedzi
  kosztują zegar. Co trafia do tenanta (logi, dokumenty) **wynika z kampanii** — widoczność źródeł
  w `scenariusze/<id>-*.lab.js`. Silnik incydentu się nie zmienia; lab woła `K.incydent*`. Sesja =
  parametry + operacje (odtwarzalna), strumień losowości labu osobny. Prawda (konto, adres) nigdy
  w `/gra/*` — tylko trener (`/admin`). Serwer bez sekretów ze środowiska nie wstaje.
- **Forma CTF — flagi** (`proto/zewnetrzne.js`, `data/zewnetrzne.js`, `docs/21-…`, 21.11): w grze połączonej
  z systemem (`opcje.zewnetrzne`, CLI `--tenant --klucz`) wdrożenie SIEM/SOAR/MDR po projekcie czeka
  w stanie „konfiguracja" na flagi `LO{…}` z tenanta gracza, a incydent z plikiem `.lab.js` prowadzi się
  tylko w labie (sesja z zapisu gracza → flaga wyniku → `K.wynikLabu`). Flaga = podpis Ed25519 (gra ma
  tylko klucz publiczny), przypięta do tenanta, jednorazowa, w zapisie (`flaga`, `inc_lab`). Bez
  `opcje.zewnetrzne` nic się nie zmienia — testy i automaty grają jak dotąd.

## Narzędzia

```bash
node ciso-sim/proto/symulacja.js <firma> [N]      # porównanie strategii (Monte Carlo)
node ciso-sim/proto/rozegraj.js S01 [--kontrole=a,b] [--naprawione=fakt] [--auto=wzorcowo|bezczynnie] [--kampania=gmina]
                                                 # incydent w terminalu + walidacja pliku
node ciso-sim/proto/kampania.js [--kampania=gmina] [--zapis=plik.json] | --auto=madry|rozsadny|odmawiajacy|bierny [--seed=N] [--szczegoly]
node ciso-sim/proto/porownaj-style.js [--kampania=gmina]   # 4 style gry × 20 ziaren (wyniki → docs/16-…, 19-…)
node ciso-sim/proto/brzegowe.js [N] [--kampania=gmina]     # strategie-prowokacje + niezmienniki (→ docs/17-…)
node ciso-sim/proto/cennik.js [N] [--kampania=gmina]  # koszt JEDNEGO odstępstwa w dobrej grze (→ docs/17-…, 17.10)
LAB_ADMIN_TOKEN=… LAB_SIEM_TOKEN=… LAB_SOAR_SECRET=… node ciso-sim/lab/serwer.js   # lab SIEM/SOAR (docs/21-…)
LAB_URL=… LAB_TOKEN=<token gracza> node ciso-sim/lab/gracz.js                         # gracz w terminalu
node ciso-sim/lab/flaga.js klucze|wydaj|sprawdz                                    # flagi CTF (docs/21-…, 21.11)
node ciso-sim/proto/kampania.js --tenant=ala --klucz=flagi.pub.pem --zapis=ala.json   # gra połączona z SIEM/SOAR
node --test ciso-sim/test/*.test.js              # testy (uruchamiaj po KAŻDEJ zmianie proto/ i data/)
```

Test migawki Monte Carlo (`test/prototyp.test.js`) celowo pęka przy każdej zmianie danych
zagrożeń/kontroli/silnika: przelicz, zaktualizuj liczby w teście i opisz zmianę w `docs/14-…`.
Po zmianie danych: `node --check` na plikach i przebieg symulacji dla 2–3 firm; po zmianie
incydentu `.incydent.js` — `rozegraj.js <id> --auto=wzorcowo` i `--auto=bezczynnie` (walidator
pliku + czy bezczynność nie zalicza zasad); po zmianie ruchów, spraw albo zasad — `brzegowe.js`
(niezmienniki, fuzzer) i `cennik.js`. Wyniki ważnych przebiegów zapisuj w `proto/wyniki-<data>.txt`
i wnioski w `docs/14-samoewaluacja.md`.

## Kalibracja (stan 13.10.2026)

Firma bez ochrony: ~1,6 poważnego incydentu na 2 lata gry (kompresja czasu ok. ×3 — celowo).
Znany problem: strategia „mała firma" (MSP + higiena + EDR) wygrywa wartością oczekiwaną
prawie wszędzie — przeciwwagi opisane w `docs/14-…`, 14.2. Próg „poważny" = 100 tys. zł
(do zmiany na względny).
