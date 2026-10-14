# „Linia Obrony" — symulator osoby odpowiedzialnej za cyberbezpieczeństwo

> Tytuł roboczy. Nawiązuje do modelu „trzech linii obrony" z ładu korporacyjnego. Gracz jest
> drugą linią: nie programuje firewalla, tylko **decyduje, zabiega o budżet, buduje polityki
> i odpowiada przed zarządem, regulatorem i ludźmi, gdy coś pójdzie źle.**

Osobna aplikacja (nie część Snakes). Leży w tym repo, bo korzysta z doświadczeń i części
wzorców `kiedy_obiad_michala` (patrz [`docs/12-architektura-i-reuzycie.md`](docs/12-architektura-i-reuzycie.md)),
ale ma własny serwer, własną bazę, własny design i **logowanie hasłem**.

## Po co ta gra

Pokazać na własnej skórze, że cyberbezpieczeństwo w firmie to **zarządzanie ryzykiem
przy ograniczonych pieniądzach, ludziach i cierpliwości zarządu**, a nie kupowanie
pudełek. Że regulacje (KSC/NIS2, RODO, DORA, KRI) mają realne zegary i realne kary. Że
dostawca może Cię położyć, choć nic nie zrobiłeś źle. Że najgorsze decyzje zapadają o 2:00
w nocy, bez pełnej wiedzy, a ich jakość ocenia się po tym, co wiedziałeś wtedy, a nie po
tym, jak się skończyło.

## Stan (13.10.2026)

| Co | Stan |
|---|---|
| Projekt gry (ten folder `docs/`) | **wersja 0.1, do dyskusji** |
| Realia polskie (prawo, CSIRT-y, incydenty) | zweryfikowane na 13.10.2026 w źródłach wtórnych, z listą rzeczy do potwierdzenia w Dz.U. |
| Scenariusze incydentów | 12 pełnych + 32 zalążki (`scenariusze/`); S01, S03 i S07 jako incydenty bez drzewa decyzji (`*.incydent.js`), grywalne w terminalu |
| Dane liczbowe (kontrole, zagrożenia, firmy) | `data/*.js`, pierwsza kalibracja |
| Prototyp symulacji (Monte Carlo) | `proto/symulacja.js` — działa, wyniki w `proto/wyniki-*.txt` |
| Działy jako uczące się agenty + reżyser | `docs/15-…`, `proto/dzialy.js`, `proto/rezyser.js` |
| **Kampania „Wodnik” (wodociągi) — grywalna w terminalu**, własne tempo, zapis/wczytanie | `docs/16-…`, `proto/kampania.js` |
| **Kampania „Gmina Brzozów Wielki” — grywalna** (`--kampania=gmina`): bez OT, Pzp, grant w kartonach, wybory, incydent S07 | `docs/19-…`, `data/kampanie/gmina.js`, `scenariusze/S07-konto.incydent.js` |
| **Silnik ruchów — gra bez quizu**: dowolne ruchy z parametrami, cykl życia kontroli, sprawy, incydenty bez drzewa, ocena zasadami | `docs/18-…`, `proto/ruchy.js`, `sprawy.js`, `incydent.js`, `zasady.js` |
| **Skończone zasoby i decyzje w każdym okresie**: koordynacja projektów, odnowienia, certyfikaty, koniec wsparcia, zmiany firmy; **doradztwo** z raportem „od największej poprawy" | `docs/18-…` (18.12–18.13), `proto/cykl.js`, `proto/doradztwo.js`, `data/cykliczne.js`, `data/doradztwo.js` |
| Testy automatyczne | `test/` — `node --test ciso-sim/test/*.test.js` |
| Serwer, logowanie, front w przeglądarce | **nie ma** — patrz roadmapa |

## Mapa dokumentów

| Plik | Co jest w środku |
|---|---|
| [`docs/01-wizja-i-zalozenia.md`](docs/01-wizja-i-zalozenia.md) | dla kogo, cele edukacyjne, filary projektu, czego gra NIE robi |
| [`docs/02-realia-polskie.md`](docs/02-realia-polskie.md) | KSC po nowelizacji (NIS2), RODO, DORA, KRI, KSeF, CSIRT-y, organy, realne incydenty 2023–2026, status weryfikacji |
| [`docs/03-mechanika-rdzenia.md`](docs/03-mechanika-rdzenia.md) | pętla gry, dwa zegary (miesiąc i godziny incydentu), zasoby i waluty, mgła wojny, wzory |
| [`docs/04-narzedzia.md`](docs/04-narzedzia.md) | katalog kontroli: SIEM, SOAR, EDR, MDR, PAM, kopie… z cenami, godzinami i pułapkami |
| [`docs/05-polityki-i-procedury.md`](docs/05-polityki-i-procedury.md) | polityki i procedury (polskie nazwy dokumentów), „polityka na półce" vs żywa |
| [`docs/06-ludzie-uslugi-ubezpieczenia.md`](docs/06-ludzie-uslugi-ubezpieczenia.md) | zespół, płace w PL, rekrutacja i okresy wypowiedzenia, MSP/MDR/vCISO, polisa cyber |
| [`docs/07-zagrozenia-i-model-ataku.md`](docs/07-zagrozenia-i-model-ataku.md) | sprawcy, wektory, etapy ataku, wykrywanie, skutki — model silnika |
| [`docs/08-lancuch-dostaw.md`](docs/08-lancuch-dostaw.md) | szacowanie ryzyka dostawców, dostawca wysokiego ryzyka, koncentracja, umowy |
| [`docs/09-firmy-kampanie.md`](docs/09-firmy-kampanie.md) | 9 firm (wodociągi, szpital, gmina, sklep, software house, fabryka, bank spółdzielczy, elektrociepłownia + samouczek) |
| [`docs/10-etapy-rozwoju.md`](docs/10-etapy-rozwoju.md) | etapy dojrzałości firmy, rozwój biznesu (wzrost = nowe obowiązki), kariera gracza |
| [`docs/11-ocena-i-debrief.md`](docs/11-ocena-i-debrief.md) | punktacja: jakość praktyki (zasady) vs wynik, indeks odporności, sufity, audyt, raport końcowy |
| [`docs/12-architektura-i-reuzycie.md`](docs/12-architektura-i-reuzycie.md) | stos, moduły, logowanie hasłem, co bierzemy z repo, czego NIE bierzemy |
| [`docs/13-roadmapa.md`](docs/13-roadmapa.md) | etapy budowy: od prototypu tekstowego do pełnej gry |
| [`docs/14-samoewaluacja.md`](docs/14-samoewaluacja.md) | krytyczna ocena projektu, wyniki symulacji, ryzyka, decyzje właściciela |
| [`docs/15-dzialy-i-rezyser.md`](docs/15-dzialy-i-rezyser.md) | działy firmy jako agenci (inicjatywy, pytaj/obejdź, uczenie, raporty) i reżyser (diagnoza, model gracza, rytm, przeciwnik) |
| [`docs/16-kampania-wodociagi.md`](docs/16-kampania-wodociagi.md) | pierwsza kampania: ludzie, oś 24 miesięcy, wyniki stylów gry |
| [`docs/17-przypadki-brzegowe.md`](docs/17-przypadki-brzegowe.md) | „test penetracyjny" gry: strategie-prowokacje, fuzzer, znalezione absurdy, poprawki, cennik złych decyzji |
| [`docs/19-kampania-gmina.md`](docs/19-kampania-gmina.md) | druga kampania: urząd gminy — co wnosi do silnika, oś, S07, wyniki |
| [`docs/18-silnik-ruchow.md`](docs/18-silnik-ruchow.md) | silnik bez quizu: obiekty i cykl życia kontroli, ruchy, sprawy, incydent bez drzewa, zasady, komendy gry, wyniki, skończone zasoby, decyzje cykliczne, doradztwo |
| [`scenariusze/`](scenariusze/README.md) | format scenariusza, 12 pełnych scenariuszy, 32 zalążki, S01 i S03 jako incydenty (`*.incydent.js`) |
| [`data/`](data/) | liczby: kontrole, zagrożenia, firmy, inicjatywy działów, kampanie (`data/kampanie/`) |
| [`proto/`](proto/) | silnik miesiąca, Monte Carlo, działy, reżyser, kampania i scenariusze w terminalu |
| [`test/`](test/) | testy `node --test`: determinizm, zapis/odtworzenie (także fuzzera), „to nie quiz", cykl życia kontroli, kolejność w incydencie, kierunek wyników |

## Szybki start

```bash
node ciso-sim/proto/kampania.js --zapis=moja-gra.json    # zagraj kampanię „Wodnik” we własnym tempie
node ciso-sim/proto/kampania.js --kampania=gmina --zapis=gmina.json   # albo kampanię gminną
node ciso-sim/proto/kampania.js --auto=bierny --szczegoly # zobacz, co robią działy i reżyser
node --test ciso-sim/test/*.test.js                       # testy
```

### Narzędzia projektowe

```bash
node ciso-sim/proto/symulacja.js produkcja 2000   # firma: produkcja, szpital, wodociagi, gmina,
                                                 # sklep, softwarehouse, bank, energetyka, biuro
```

Wypisuje porównanie strategii (nic / papier / narzędzia bez ludzi / mała firma / higiena /
higiena+MDR / własny SOC): wydatki, straty, zły scenariusz (P90), liczba poważnych incydentów,
zmęczenie alertami, poślizg i niewdrożone projekty.

```bash
node ciso-sim/proto/rozegraj.js S01                              # zagraj incydent przy stole
node ciso-sim/proto/rozegraj.js S01 --kontrole=weryfikacja_platnosci   # z procedurą płatności
node ciso-sim/proto/rozegraj.js S03 --naprawione=hmi_wystawiony --auto=wzorcowo   # panel zamknięty wcześniej
node ciso-sim/proto/brzegowe.js 20 && node ciso-sim/proto/cennik.js 20   # strategie-prowokacje, cennik odstępstw
```

## Zasady pracy w tym folderze

Patrz [`CLAUDE.md`](CLAUDE.md) — krótko: liczby żyją w `data/`, dokumenty mówią DLACZEGO,
wszystko po polsku, każdy fakt prawny ma status weryfikacji, firmy w grze są fikcyjne.
