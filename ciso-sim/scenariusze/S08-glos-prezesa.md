# S08. Głos prezesa

| | |
|---|---|
| **Firmy** | fabryka (Metalpol — główny), sklep (CEO z funduszu), bank spółdzielczy (prezes zarządu) |
| **Rodzaj** | oszustwo „na prezesa" z klonowaniem głosu (deepfake) i presją poufności |
| **Trudność** | ★ |
| **Czas gry / realny** | 2 dni / 15 min |
| **Zegary** | **bank** (godziny), policja |
| **Inspiracja** | rosnąca liczba oszustw z użyciem klonowanego głosu i wideo przedstawicieli zarządu (ostrzeżenia banków i policji); klasyczny schemat „poufny, pilny przelew" |
| **Cele** | E2, E9 (procedura kontra autorytet), E10, kultura organizacyjna |

## Prawda

Prezes Metalpolu jest na targach w Hanowerze (wiadomo z LinkedIna firmy). Przestępcy mają
nagrania jego głosu z wywiadu dla lokalnej telewizji i z webinaru na YouTube. Dyrektor
finansowa dostaje na WhatsAppie (nowy numer, zdjęcie prezesa) wiadomość głosową: „Pani
Bożeno, sprawa ściśle poufna, negocjujemy przejęcie dostawcy stali przed konkurencją,
potrzebna zaliczka dziś do 15:00, 1 184 000 zł, dane dostanie Pani od mecenasa. Proszę nikomu
nie mówić, nawet zarządowi — giełdowa sprawa." Potem mail od „mecenasa" z kancelarii
(domena podobna do prawdziwej kancelarii z Warszawy) z danymi rachunku i „umową NDA".

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| procedura płatności z zasadą „dwie osoby + oddzwonienie na znany numer; **żadnych wyjątków dla zarządu**", zatwierdzona przez zarząd | dyrektor finansowa dzwoni na znany numer prezesa → prezes nic nie wie → **udaremnione** |
| „hasło dnia"/słowo-klucz zarządu do pilnych dyspozycji (karta wprowadzona wcześniej) | „mecenas" nie zna słowa → udaremnione |
| `szkolenia` z modułem o deepfake'ach dla finansów i zarządu | dyrektor finansowa nabiera podejrzeń (60%) i dzwoni do Ciebie |
| wyjątki od procedur dla zarządu (karta z m. 1–3: „prezes nie musi…") | dyrektor finansowa uznaje, że prezes może pominąć procedurę → **przelew wychodzi** |

## Przebieg

### Faza 1 — T+0 (wtorek 11:20): telefon od dyrektor finansowej (jeśli ma wątpliwości)

„Dostałam od prezesa wiadomość głosową, to na pewno jego głos, ale prosi o poufność. Czy
mogę z Panem/Panią w ogóle o tym rozmawiać?"

| Opcja | Ocena |
|---|---|
| **„Dobrze, że Pani dzwoni. Proszę zadzwonić do prezesa na numer, który Pani ma zapisany od lat — nie na ten z WhatsAppa. Do tego czasu nic nie płacimy."** | ✅ |
| „Głos się zgadza, to pewnie prawda" | ❌ klonowanie głosu z kilkunastu sekund nagrania jest dziś łatwo dostępne |
| Oddzwonić na numer z WhatsAppa | ❌ odbierze przestępca (albo nikt, bo „jest na spotkaniu") |
| Napisać do prezesa maila | ⚠️ wolno; jeśli skrzynka prezesa jest przejęta (wariant) — odpisze przestępca |

### Faza 1′ — wariant: przelew wyszedł (T+0 = 16:40, prezes dzwoni z Hanoweru „jaki przelew?")

Przechodzi w wyścig z czasem jak S01: **bank natychmiast**, zawiadomienie, dowody (nagranie
głosowe, numer, maile z nagłówkami, domena „kancelarii"), zgłoszenie podszywającej się
domeny do CERT Polska (Lista Ostrzeżeń) i do prawdziwej kancelarii. Dyrektor finansowa
w szoku — karta „wsparcie, nie kara" (jak w S01).

### Faza 2 — T+2 h: po udaremnieniu (albo po stracie)

| Decyzja | Koszt | Ocena |
|---|---|---|
| **Krótkie ostrzeżenie dla działów finansów, zakupów, sekretariatu**: schemat, przykład (zanonimizowany), zasada „głos to nie dowód" | 2 h | ✅ (kolejna próba przyjdzie w ciągu tygodnia — w grze: 70%) |
| **Zarząd zatwierdza na piśmie**: procedura płatności obowiązuje także zarząd; żadna dyspozycja „poufna" nie omija drugiej osoby | mandat −3 (prezes lubi swobodę) | ✅ najważniejsza zmiana |
| **Słowo-klucz / procedura weryfikacji** dla pilnych dyspozycji zarządu (oddzwonienie, hasło, potwierdzenie w drugim kanale) | 4 h | ✅ |
| Ograniczenie publikowanych materiałów z głosem prezesa | — | ❌ nierealne i niepotrzebne — obrona to procedura, nie ukrywanie się |
| Zgłoszenie do CERT Polska (domena „kancelarii", numer) | 30 min | ✅ |
| Docenienie dyrektor finansowej publicznie (jeśli zadzwoniła) | 0 | ✅ kultura: „lepiej zapytać 10 razy niż raz zapłacić" |

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 30 | weryfikacja przez znany kanał (albo bank natychmiast w wariancie straty) |
| 20 | procedura obejmuje zarząd — zatwierdzona na piśmie |
| 15 | ostrzeżenie działów narażonych |
| 15 | słowo-klucz / procedura weryfikacji pilnych dyspozycji |
| 10 | zgłoszenie do CERT Polska |
| 10 | kultura: docenienie zgłoszenia / wsparcie zamiast kary |

## Debrief

- **Głos i obraz przestały być dowodem tożsamości.** Obrona nie jest techniczna — to
  procedura, której **nikt** nie może pominąć, także prezes.
- **Poufność i pośpiech to sygnały ostrzegawcze**, nie powody do pominięcia procedury.
- **Wyjątki dla zarządu** (karta wcześniej w kampanii) wracają tutaj jako koszt — debrief
  łączy te dwie decyzje.
- **Prezes jest najczęściej podszywaną osobą w firmie** — dlatego jego zgoda na procedurę
  jest najważniejsza.

## Warianty

- **Sklep**: „CEO" na wideorozmowie (krótkiej, „słaby zasięg") prosi o przelew do „kancelarii
  przy transakcji funduszu". Dochodzi presja: „fundusz nie może się dowiedzieć".
- **Bank**: podszycie pod prezesa zarządu wobec pracownika oddziału — dyspozycja wypłaty
  z rachunku klienta „VIP" (oszustwo na klienta). DORA: czy to incydent ICT? (zwykle nie —
  to oszustwo; udokumentuj klasyfikację).
- **Odwrotny wariant**: deepfake prezesa w mediach społecznościowych ogłasza zwolnienia
  grupowe (dezinformacja; zalążek Z07).

## Pytania do dyskusji

1. Czy prezes Waszej firmy może zlecić przelew „z pominięciem procedury"? Czy powinien?
2. Jak zweryfikowalibyście, że to naprawdę on, jeśli dzwoni z obcego numeru?
3. Czy osoba z finansów, która wstrzymała przelew „prezesa", zostałaby pochwalona czy zganiona?
