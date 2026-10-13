# Linia Obrony (ciso-sim) — notatki dla Claude

Osobna gra w tym repo: symulator osoby odpowiedzialnej za cyberbezpieczeństwo w polskiej
organizacji. **Nie jest częścią Snakes** — nie importuje niczego z `../server.js` ani `../lib/`
(wzorce się kopiuje, nie współdzieli). Start: `README.md`, potem `docs/01…17`.

Stan: projekt + dane + silnik miesiąca + działy-agenci + reżyser + **grywalna kampania „Wodnik”
w terminalu** + 12 scenariuszy (S01, S03 jako dane) + testy. Serwera, logowania i frontu w
przeglądarce jeszcze **nie ma** (roadmapa: `docs/13-roadmapa.md`).

Decyzje właściciela (13.10.2026): odbiorcy — biuro; pierwsza kampania — wodociągi; **tempo
gracza** (bez limitu „jeden ruch dziennie", gracz sam zamyka miesiąc); na koniec okresu
raporty innych działów; algorytmy uczące się na aktualnym problemie firmy; merytorykę oceni CISO.

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
  gracza; debrief i Jakość Decyzji czytają rejestr.
- **Gra o bezpieczeństwie musi być bezpieczna**: logowanie hasłem (scrypt), sesje z
  wygasaniem, limity prób, brak domyślnego hasła admina, hasła nigdy w URL. Nie kopiuj
  `/api/register` ani `checkAdmin` z Snakes (`docs/12-…`, 12.3).
- **Ta gra ma mieć testy** (`node --test` na czystym silniku) — w odróżnieniu od reszty repo.
- **Algorytmy działów i reżysera** (`docs/15-…`): deterministyczne, każdy podsystem ma WŁASNY
  strumień losowości (silnik, działy, reżyser) — dołożenie losowania w jednym nie może przesunąć
  „pogody" w innym. Każdy wybór loguje powód (`k.log`). Reżyser **nie zmienia skuteczności
  kontroli gracza**, wybiera tylko spośród prawdopodobnych zdarzeń i moment w oknie.
- **Test obciążeniowy nie wypada przed swoim sygnałem** (S03 po ostrzeżeniu CERT) — „żadnych gotcha".
- **Reguły z przypadków brzegowych** (`docs/17-…`, 17.5): obowiązkowa karta ma tanie uczciwe
  wyjście (walidator); kolejność opcji zawsze tasowana; brak decyzji jest oceniany; żaden mnożnik
  nie rośnie przyrostowo bez sufitu (rejestr `k.ryzyka`); wynik to **Wynik kampanii** (½ Indeks
  Odporności + ½ ważona Jakość Decyzji), nie mandat; koszty reagowania nie idą z budżetu; sygnały
  bywają fałszywe, szacunki mają błąd. Po 17.6: **kara musi trafić w wynik** (nie tylko w mandat);
  wynik liczy się z prawdy, nie z wykrycia (ekspozycja, sufity `BRAMKI`); każde narzędzie
  wykrywające ma `martwe_pola`; uczciwa opcja ma cenę, inaczej nieuczciwa nie jest pokusą.
  Po 17.7: kłamstwo to `nieuczciwe: { wobec, wykrywalnosc }` w opcji (ocena zawsze „blad"),
  rejestr `k.klamstwa`; ujawnienie (`ujawnij`) uderza we współpracę (zarząd, działy, ubezpieczyciel,
  audytor). Kampania jest skończona i kończy się **audytem zamykającym**. Karta może mieć kilka
  dobrych odpowiedzi; automaty biorą najtańszą rocznie (`dobraNajtansza`).
- **Zapis gry = lista decyzji**, wczytanie = odtworzenie z ziarna. Nowa akcja gracza musi
  przechodzić przez `rozstrzygnij`/`zlecRecznie`/`zagrajZdarzenie`/`zamknijMiesiac`
  (`proto/kampania.js`) i trafiać do `k.akcje`, inaczej zapis przestanie odtwarzać stan.

## Narzędzia

```bash
node ciso-sim/proto/symulacja.js <firma> [N]      # porównanie strategii (Monte Carlo)
node ciso-sim/proto/rozegraj.js S01 [--kontrole=a,b] [--auto=najlepsza|najgorsza]
                                                 # scenariusz w terminalu + walidacja pliku
node ciso-sim/proto/kampania.js [--zapis=plik.json] | --auto=rozsadny|odmawiajacy|bierny [--seed=N] [--szczegoly]
node ciso-sim/proto/porownaj-style.js            # 4 style gry × 20 ziaren (wyniki → docs/16-…)
node ciso-sim/proto/brzegowe.js [N]              # strategie-prowokacje + niezmienniki (→ docs/17-…)
node ciso-sim/proto/cennik.js [N]                # koszt JEDNEJ złej decyzji w dobrej grze (→ docs/17-…, 17.7)
node --test ciso-sim/test/*.test.js              # testy (uruchamiaj po KAŻDEJ zmianie proto/ i data/)
```

Test migawki Monte Carlo (`test/prototyp.test.js`) celowo pęka przy każdej zmianie danych
zagrożeń/kontroli/silnika: przelicz, zaktualizuj liczby w teście i opisz zmianę w `docs/14-…`.
Po zmianie danych: `node --check` na plikach i przebieg symulacji dla 2–3 firm; po zmianie
scenariusza `.dane.js` — `rozegraj.js --auto=najlepsza` (walidator pilnuje, żeby najlepsza
ścieżka dawała dokładnie 100 pkt). Wyniki ważnych przebiegów zapisuj w `proto/wyniki-<data>.txt`
i wnioski w `docs/14-samoewaluacja.md`.

## Kalibracja (stan 13.10.2026)

Firma bez ochrony: ~1,6 poważnego incydentu na 2 lata gry (kompresja czasu ok. ×3 — celowo).
Znany problem: strategia „mała firma" (MSP + higiena + EDR) wygrywa wartością oczekiwaną
prawie wszędzie — przeciwwagi opisane w `docs/14-…`, 14.2. Próg „poważny" = 100 tys. zł
(do zmiany na względny).
