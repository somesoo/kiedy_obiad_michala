# 19. Kampania „Gmina Brzozów Wielki" (Urząd Gminy, 82 etaty)

Druga grywalna kampania (13.10.2026, prośba właściciela: „czas na nowe firmy — weź jedną
i dodaj"). Projekt fabularny był gotowy w `09-…` (sekcja 2); tu — co z niego weszło do gry,
czym gmina różni się od Wodnika i co pokazały przebiegi.

```bash
node ciso-sim/proto/kampania.js --kampania=gmina --zapis=gmina.json   # gra (zapis pamięta kampanię)
node ciso-sim/proto/kampania.js --kampania=gmina --auto=madry --szczegoly
node ciso-sim/proto/rozegraj.js S07                                    # incydent przy stole (wariant gminny)
node ciso-sim/proto/rozegraj.js S01 --kampania=gmina                   # BEC: 480 tys. zł, kontrasygnata skarbnika
node ciso-sim/proto/porownaj-style.js --kampania=gmina                 # 4 style × 20 ziaren
node ciso-sim/proto/brzegowe.js 20 --kampania=gmina                    # strategie-prowokacje + niezmienniki
```

Dane: `data/kampanie/gmina.js`, profil `data/firmy.js → gmina`, nowy incydent
`scenariusze/S07-konto.incydent.js`. Wszystko fikcyjne: gmina, ludzie, dostawcy, webmaster.

## 19.1. Dlaczego gmina

- **Najbliżej odbiorcy** (biuro): urząd to praca biurowa — poczta, obieg dokumentów, kolejka
  przy okienku, przelewy do wykonawców. Każdy grający zna te sytuacje.
- **Inne mechaniki niż Wodnik**, więc druga kampania sprawdza, czy silnik jest ogólny:
  brak OT, zamówienia publiczne, grant ze sprzętem w kartonach, budżet uchwalany przez radę,
  wójt myślący kadencją, CSIRT NASK zamiast CSIRT INFRASTRUKTURA.
- **Realne wzorce** z `02-…` (✅/🟡): urząd gminy od 50 etatów w KSC, KRI, limit kar UODO
  dla jednostek publicznych, próg Pzp, program „Cyberbezpieczny Samorząd".

## 19.2. Sytuacja na start (kwiecień 2026)

82 etaty, 14 tys. mieszkańców. Gracz: **jedyny etatowy informatyk**; drugi — zleceniobiorca,
2 dni w tygodniu, z uprawnieniami administratora domeny „z domu". Budżet bezpieczeństwa:
**60 tys. zł/rok** (45 tys. do końca 2026) — o połowę mniej niż w Wodniku.

**Status w KSC — pierwsza decyzja gry.** Wójt słyszał, że „ustawa jest dla dużych miast".
Prawda gry: urząd gminy od 50 etatów to **podmiot ważny** (🟡, do potwierdzenia w załączniku
ustawy — `02-…`). Gracz ustala to analizą statusu; laik wpisuje „kluczowy na wszelki wypadek"
i traci punkt w zasadzie „prawidłowy status".

**Dług:** sprzęt z grantu (zapora nowej generacji, serwer kopii) w kartonach; aktywne konto
byłego sekretarza; zleceniobiorca z adminem domeny bez MFA; BIP na nieaktualizowanym systemie;
stały tunel dostawcy systemu podatkowo-księgowego z jednym kontem dla 40 gmin.

## 19.3. Ludzie i działy

| Dział | Szef | Czego chce | Inicjatywy |
|---|---|---|---|
| Wójt (`zarzad`) | Wójt Bogdan Rataj | reputacja, spokój przed wyborami | monitoring miejski z aplikacją, czat AI |
| Sekretariat i Kadry | Sekretarz Anna Żak (Twoja przełożona) | terminy, zgodność | materiały dla radnych na prywatne skrzynki, laptopy z marketu, praca zdalna |
| Skarbnik i Referat Finansowy | Skarbnik Teresa Kos | koszt, terminy | stały dostęp dostawcy systemu dziedzinowego, praca zdalna, czat AI |
| Referat Podatków i Opłat | Kierowniczka Jolanta Brzezińska | terminy, płatnicy | stały dostęp dostawcy, prywatny dysk, czat AI |
| USC i Obsługa Mieszkańców | Kierownik Piotr Malec | krótsze kolejki, e-usługi | darmowy formularz online z PESEL-em, prywatny dysk, laptopy |
| Referat Inwestycji | Kierownik Rafał Sowa | terminy budów | monitoring miejski, formularz online, prywatny dysk |

Nowe inicjatywy (wspólny katalog `data/dzialy.js`, każda z warunkami „tak, ale"):
`zdalny_dostawca`, `formularz_online`, `poczta_prywatna_radnych`, `kamera_monitoring`.

## 19.4. Co jest inne w silniku (dla każdej przyszłej kampanii)

| Mechanika | Jak działa | Gdzie |
|---|---|---|
| **Firma bez OT** | ruchy i pilotaże OT znikają z listy; wariant OT (np. EDR `z_ot`) jest niedostępny z powodem; parametry „…_ot" przyjmują `bez_ot`; temat doradztwa „OT" — niedostępny | `proto/ruchy.js` (`rozwiazParam`, `dopasujParam`) |
| **Zamówienia publiczne** | umowa ponad 130 tys. zł netto (wdrożenie + 24 mies. abonamentu) = przetarg 2–4 mies., odwołanie do KIO +2 (10%); projekt czeka bez godzin zespołu, ale zjada koordynację | `PROG_PZP`, `przetarg` |
| **Sprzęt kupiony wcześniej** | `kupione`: wdrożenie bez zakupu, tylko pracą; licencje z grantu do 15. miesiąca | `data/kampanie/gmina.js` |
| **Kontrole zastane** | kontrola z profilu (gmina: szkolenia e-learningiem) ma obiekt — można ją przejrzeć, zmienić, wycofać | `nowaKampania` |
| **Ruchy kampanii** | plik kampanii dodaje własne ruchy (np. ograniczenie dostępu zleceniobiorcy, aktualizacja BIP) | `def.ruchy` |
| **Fakt zamykany wdrożeniem** | `naprawia_wdrozenie` (brama dla dostawców zamyka stały tunel dostawcy) | `poWdrozeniu` |
| **Warianty incydentów** | ten sam incydent, inne dane (S01: kwota 480 tys. zł, wykonawca drogi) i inne skróty (kontrasygnata skarbnika jako procedura) | `kontekst.wariant` |
| **Fale z własnym skutkiem** | `skutek` w zdarzeniu typu fala (głosowanie: DDoS na BIP i dezinformacja) | `zamknijMiesiac` |
| **Kampania = kompletny plik** | odpowiedzi automatów **każdego stylu** na sprawy kampanii (`automaty`), zasady spraw (`zasady`), odstępstwa dla cennika, przygotowanie do incydentów; generyczna naprawa znanych faktów (`naprawa`, `po`). Kompletność pilnuje kontrakt (`20-…`) | `kontraktKampanii`, `odpowiedzStylu`, `zasadyKampanii` |

Nowe ruchy wspólne: **przegląd kont** z kadrami (odkrywa martwe konta i nadmiarowe uprawnienia)
i **wyłączenie martwych kont** — najtańsza kontrola w grze, potrzebna w każdej organizacji.

## 19.5. Oś kampanii

| Mies. | Zdarzenie | Lekcja |
|---|---|---|
| 1 | **Status KSC** (obserwacja) + **kartony z grantu** (sprawa: własnymi siłami / lokalna firma / później) | samoidentyfikacja; sprzęt w kartonach nie chroni |
| 2 | **Ostrzeżenie CERT**: wyłudzenia „zmiana rachunku wykonawcy" w samorządach | reakcja w miesiąc |
| 2–4 | **Skarbnik**: „co mam sprawdzać przy kontrasygnacie?" — rozszerzyć o rachunek (telefon + wykaz VAT) | procedura bez paraliżu |
| 3–6 | **S01** wariant gminny: 480 tys. zł; kontrasygnata z rachunkiem albo procedura z katalogu — udaremnione | BEC, bank w pierwszej godzinie |
| 6–9 | **S07** (nowy): zleceniobiorca po sporze blokuje konta urzędników | odebrać dostęp → dowody → przywracać; nie płacić |
| 8 | **Projekt budżetu 2027** przez wójta i komisję budżetową | ryzyko w złotówkach |
| 9–11 | **Kontrola trwałości grantu**: działa → bez uwag; projekty trwają + wyjaśnienia → zalecenia; kartony → korekta 60 tys. zł | trwałość projektu |
| 10 → 12 | **Wybory uzupełniające i referendum** (sprawa przygotowań) → **fala**: DDoS na BIP, fałszywe „zmiany lokali" | komunikacja kryzysowa przed, nie w trakcie |
| 13 | Termin SZBI (3.04.2027) | KRI + KSC |
| 15 | **Licencje z grantu wygasają**: przedłużyć z budżetu / wersja podstawowa / zrezygnować | koszt całkowity grantu |
| 15–19 | **Dostawca systemu dziedzinowego zaszyfrowany** (40 gmin): odciąć tunel, tryb awaryjny, pismo do podmiotu przetwarzającego, CSIRT | łańcuch dostaw, ciągłość obsługi mieszkańców |
| 21 → 23–24 | Zapowiedź audytu (komisja rewizyjna, KRI + KSC) → **audyt zamykający** | dowody zamiast deklaracji |

Do tego decyzje cykliczne (`18-…`, 18.12): certyfikat BIP (m. 4), domena (m. 8), podpis
skarbnika (m. 9), obieg dokumentów (m. 13); koniec wsparcia: stanowiska USC (m. 5), kontroler
domeny (m. 10), stara wersja systemu podatkowego (m. 16); odnowienia umów; alerty i kolejka.

## 19.6. S07 „Konto byłego zleceniobiorcy" (incydent bez drzewa)

Poniedziałek 7:40: nikt nie może się zalogować, kolejka przy okienkach. Zleceniobiorca, któremu
w piątek wypowiedziano umowę, nadal ma administratora domeny. Dopóki ma dostęp: po 4 h kasuje
udziały referatów, po 8 h czyści dzienniki; ostrzeżony telefonem — od razu.

13 akcji w dowolnej kolejności, m.in.: odebrać dostęp, zabezpieczyć dzienniki, odblokować konta
(przed odebraniem dostępu — zablokuje znowu), przywrócić z kopii, obsługa na papierze, komunikat
dla mieszkańców, CSIRT NASK, zawiadomienie, **telefon do sprawcy**, **zapłacić sporną fakturę**
(działa „na chwilę" — uprawnienia zostają), ocena RODO, przegląd wszystkich kont, rozmowa z wójtem.

9 zasad (kolejność, dowody w 4 h, bez konfrontacji, bez płacenia, CSIRT w 24 h, mieszkańcy
w 2 h, przegląd wszystkich kont, RODO, wójt). Przygotowanie zmienia start: **uprawnienia odebrane
wcześniej, JML albo PAM = tylko próba w dziennikach**.

| Przebieg (`rozegraj.js S07`) | Wynik |
|---|---|
| wzorcowo | opanowane, 6 h przestoju, ok. 4 tys. zł, wszystkie zasady spełnione |
| bezczynnie | 24 h przestoju, 80 tys. zł, dane utracone, sprawca zostaje w sieci (insider ×1,6) |
| uprawnienia odebrane wcześniej | próba w dziennikach |

## 19.7. Wyniki (20 ziaren, `proto/wyniki-*-gmina-2026-10-14.txt`)

| Strategia | Straty | Audyt /60 | Mandat | Praktyka | Indeks | **Wynik** | Uwagi |
|---|---|---|---|---|---|---|---|
| **mądry** | 276 tys. | 53 | 58 | 94% | 827 | **885** | |
| pracoholik | 155 tys. | 43 | 54 | 94% | 766 | 851 | morale 15 — wypalenie kosztuje za mało (`17-…`, 17.10) |
| odmawiający | 234 tys. | 53 | 36 | 74% | 746 | 743 | zaufanie działów 0,01 |
| wszystko naraz | 465 tys. | 20 | 29 | 79% | 616 | 703 | budżet gminy zatrzymuje „cały katalog" szybciej niż w Wodniku |
| skąpiec | 278 tys. | 18 | 9 | 60% | 525 | 558 | odwołany 4/20 |
| laik z doradcą | 511 tys. | 27 | 16 | 47% | 581 | 528 | doradztwo drogie przy 60 tys. zł/rok |
| rozsądny laik | 855 tys. | 28 | 21 | 48% | 495 | 486 | 17 ukrytych obejść |
| paranoik | 516 tys. | 13 | 0 | 47% | 341 | 407 | odwołany 20/20 |
| losowy (fuzzer) | 806 tys. | 19 | 1 | 32% | 366 | 354 | niezmienniki OK |
| potakiwacz | 362 tys. | 38 | 14 | 66% | 340 | 340 | sufit 20/20 |
| kłamca | 239 tys. | 35 | 1 | 47% | 250 | **250** | odwołany 19/20 |
| bierny / odkładacz | 793 tys. | 13 | 0 | 0% | 233 | 117 | odwołany 20/20 |

Tabela po porządkach z 14.10 (kampania jako kompletny plik, `20-…`): automaty rozstrzygają
najpierw pilne sprawy, skąpiec zamyka znane fakty, gdy naprawa jest darmowa (wcześniej:
skąpiec 497 i odwołany 20/20, pracoholik 593).

**Wnioski:**
1. **Kolejność stylów jak w Wodniku** — silnik jest ogólny, a nie dostrojony do jednej kampanii.
2. **Gmina jest twardsza dla oszczędnych i biernych.** S01 to 480 tys. zł, kontrola grantu
   karze kartony, a mandat zależy od wójta przed wyborami: paranoik jest odwołany w każdym
   przebiegu, skąpiec w co piątym (w Wodniku — nigdy).
3. **Pierwsza wersja mądrego była odwołana** (wynik 500): abonamenty sprzętu z grantu
   (5,5 tys. zł/mies.) zjadały cały budżet gminy. W życiu grant zwykle obejmował licencje na
   czas projektu — stąd licencje do 15. miesiąca i sprawa o ich przedłużenie (🔵).
4. **Kartony zjadają limit pracy w toku**: uruchomienie zapory i serwera kopii zajmuje dwa
   z trzech miejsc na projekty, więc MFA w pierwszym półroczu wypada u mądrego w części
   przebiegów. Tańszy wariant (lokalna firma, 9 tys. zł) skraca to — realny wybór.
5. **Doradztwo w gminie słabiej się opłaca** (laik z doradcą 529 wobec 487): ten sam cennik przy
   budżecie o połowę mniejszym. Do zbalansowania razem z resztą (decyzja właściciela: balans później).

## 19.8. Świadome uproszczenia (🔵) i do potwierdzenia (🟡)

- 🟡 Urząd gminy od 50 etatów = podmiot ważny (`02-…`, „Samorządy").
- 🔵 Korekta finansowa za brak trwałości grantu: 60 tys. zł (30 tys. przy wyjaśnieniach
  i trwających wdrożeniach); licencje z grantu do 15. miesiąca.
- 🔵 Czasy przetargu 2–4 mies. i odwołanie do KIO 10% (próg 130 tys. zł netto — ✅).
- 🟡 Przestępstwa z S07 (niszczenie danych, zakłócanie pracy systemu) — w grze bez numerów
  artykułów; do potwierdzenia brzmienia w kodeksie karnym przed użyciem w debriefie.
- 🔵 Projekt budżetu przedstawiany radzie w listopadzie (w grze m. 8).

## 19.9. Co dalej w tej kampanii

- Debrief i raport końcowy z perspektywy wójta (kadencja, wybory).
- Wariant S04 jako pełny incydent zamiast sprawy (dostawca dziedzinowy).
- ~~Cennik odstępstw dla gminy~~ — zrobione (19.10).

## 19.10. Cennik złych decyzji w gminie (20 ziaren, `proto/wyniki-cennik-gmina-2026-10-14.txt`)

Cennik liczy się teraz z pliku kampanii (`20-…`, 20.3): 7 odstępstw gminy, 3 z S07 i 2 z S01
(każde także „bez przygotowania"), do tego ogólne. Mądry bez odstępstw: 885.

| Odstępstwo | ΔWynik | Komentarz |
|---|---|---|
| upiększone raporty dla zarządu | −620 | jak w Wodniku: najdroższe |
| dokumenty z datą wsteczną | −545 | |
| **kartony „na później", a na kontrolę oświadczenie, że działa** | **−345** | nowa pokusa gminy: „oświadczenie" przy kontroli trwałości grantu to kłamstwo wobec operatora programu (wykrywalność 0,6) |
| cały katalog zamówiony w 1. miesiącu | −137 | |
| bez przygotowania + S01: najpierw szukanie winnych | −66 | |
| bez przygotowania + S07: zapłata za „odblokowanie" | −58 | |
| bez przygotowania + S07: odblokowanie kont przed odebraniem dostępu | −50 | kolejność ma znaczenie (19.6) |
| bez przygotowania do S01 / S07 | −27 / −20 | przygotowanie = kontrasygnata z rachunkiem / przegląd kont, JML, PAM |
| dostawca zaszyfrowany: tylko czekać | −22 | |
| wybory: bez przygotowań | −15 | |
| kartony z grantu „na później" (bez kłamstwa) | −9 | **zwłoka kosztuje mało, kłamstwo, które ją przykrywa — dużo** |
| kontrasygnata bez sprawdzania rachunku | −8 | mądry ma i tak procedurę płatności |
| licencje z grantu: zrezygnować | −3 | do balansu: sprzęt bez sygnatur powinien boleć bardziej |
| bez rozpoznania (skan, obchód, dostępy, konta) | +2 | do balansu: fakty gminy odkrywają się innymi kanałami |

Odstępstwa samego S07 (bez „bez przygotowania") są w cenniku na 0: przygotowany mądry ma
odebrane uprawnienia zleceniobiorcy i S07 jest tylko próbą.
