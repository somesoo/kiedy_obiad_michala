# S04. Dostawca, któremu ufaliśmy

| | |
|---|---|
| **Firmy** | szpital (kampania), przychodnia POZ (wariant samodzielny), gmina (dostawca systemu dziedzinowego) |
| **Rodzaj** | wyciek danych u dostawcy SaaS (podmiot przetwarzający); my jesteśmy administratorem |
| **Trudność** | ★★ |
| **Czas gry / realny** | 30 dni / 25 min |
| **Zegary** | **UODO 72 h** (od stwierdzenia — kiedy to jest?), zawiadomienie pacjentów, CSIRT CeZ (czy to nasz incydent poważny?), umowa z dostawcą (termin powiadomienia) |
| **Inspiracja** | wyciek z dostawcy oprogramowania EDM dla przychodni (sierpień 2026; wg kontrolerów UODO ok. 18,8 mln osób, ponad 12 tys. placówek; dostęp do infrastruktury chmurowej) i atak na innego dostawcę oprogramowania medycznego przez SQL injection (sierpień 2026); zapowiedź kontroli UODO u administratorów |
| **Cele** | E8 (łańcuch dostaw), E6, E10, E11 (umowa powierzenia jako realne narzędzie) |

## Warunki wyzwolenia

- Szpital: skrypt kampanii, okno m. 4–8. Gmina: m. 15–20 (dostawca systemu podatkowego).
- Multiplayer: **ten sam dostawca** (fikcyjny „MedChmura sp. z o.o.") u kilku graczy naraz —
  każdy dostaje ten scenariusz tego samego dnia.

## Prawda

Dostawca systemu EDM „MedChmura" (używany przez szpital do części ambulatoryjnej i przez
1 900 przychodni w kraju) miał w chmurze zasobnik z kopiami baz klientów dostępny przez
klucz, który wyciekł z laptopa programisty (infostealer). Grupa wymuszająca pobrała kopie
z ostatnich 4 miesięcy. Dla szpitala: **42 300 pacjentów poradni** (PESEL, dane kontaktowe,
rozpoznania ICD-10, recepty). Dostawca wie od 2 dni, wysłał klientom maila „incydent
bezpieczeństwa, trwa analiza, nie stwierdzono wpływu na działanie systemu".

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `dostawcy` + umowa powierzenia z **terminem powiadomienia (24 h) i obowiązkiem współpracy** | dostawca musi dać informacje; gracz dostaje listę rekordów w T+30 h zamiast T+9 dni |
| umowa powierzenia „z internetu" bez terminu | dostawca „analizuje"; gracz działa na domysłach |
| rejestr dostawców z krytycznością i danymi | gracz od razu wie, jakie kategorie danych dostawca przetwarza (oszczędza 4 h) |
| plan B dla EDM (procedury, eksport) | możliwość odcięcia integracji bez paraliżu poradni |
| IOD (wewnętrzny lub z umową z czasem reakcji) | szybsza ocena ryzyka i treść zgłoszenia |

## Przebieg

### Faza 1 — T+0 (środa 10:00): mail od dostawcy + wiadomość w mediach

Mail od dostawcy (ogólnikowy) + artykuł w portalu branżowym: „Hakerzy twierdzą, że mają dane
milionów pacjentów MedChmury". Na forum przestępców — próbka, w której widać nazwy placówek.

**Co gracz wie:** incydent u dostawcy (pewne); nasze dane w wycieku (prawdopodobne — nazwa
szpitala w próbce? gracz musi sprawdzić); zakres — nie wiadomo.

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Formalne żądanie informacji od dostawcy** (na podstawie umowy powierzenia, art. 28 RODO): zakres, kategorie, liczba osób, czas, środki — z terminem | 1 h | z dobrą umową — odpowiedź w 24 h | ✅ |
| Sprawdzenie próbki z forum (czy są tam nasi pacjenci) — **przez IOD/prawnika, bez pobierania danych na służbowy komputer z niezaufanych źródeł** | 2 h | potwierdzenie „nasze dane są w wycieku" → **stwierdzenie naruszenia** | ✅ |
| Pobranie całej paczki z forum „żeby sprawdzić" | 3 h | ryzyko złośliwego oprogramowania, wątpliwe prawnie, przetwarzanie skradzionych danych | ❌ |
| Czekać na oficjalną informację od dostawcy | 0 | zegar RODO i tak biegnie od chwili, gdy masz rozsądne podstawy | ❌ |
| Odcięcie integracji z dostawcą (API, VPN) i rotacja haseł/kluczy wspólnych | 2 h | jeśli napastnik ma też dostęp do integracji — zamykasz drogę do szpitala | ✅ |

### Faza 2 — T+6 h: kiedy zaczyna się nasze 72 h?

Gra stawia pytanie wprost (karta edukacyjna): **administrator stwierdza naruszenie, gdy ma
rozsądny stopień pewności, że do niego doszło** — tu: próbka z nazwą szpitala + komunikat
dostawcy. Zegar UODO startuje teraz, nie po raporcie dostawcy.

| Opcja | Ocena |
|---|---|
| **Zgłoszenie wstępne do UODO** w 72 h z tym, co wiemy (dostawca, kategorie, szacunek liczby, środki), z zapowiedzią uzupełnienia | ✅ |
| Uznać, że „to naruszenie dostawcy, nie nasze" | ❌ dostawca jest procesorem — odpowiedzialność za zgłoszenie i zawiadomienie osób ciąży na administratorze |
| Ustalić z innymi placówkami wspólne stanowisko (multiplayer / izba lekarska / związek) | ✅ jako uzupełnienie, nie zamiast własnego zgłoszenia |

### Faza 3 — T+24 h … T+72 h: CSIRT? pacjenci? personel?

| Pytanie | Dobra odpowiedź | Ocena |
|---|---|---|
| Czy to **incydent poważny** w rozumieniu KSC u nas? | Ocena: usługa szpitala działa; incydent dotyczy poufności danych u dostawcy. Według kryteriów (skala, skutki) — **prawdopodobnie tak dla dostawcy, u nas do oceny**; bezpieczniej złożyć wczesne ostrzeżenie do CSIRT CeZ z opisem, niż przegapić termin. Udokumentuj ocenę. | ✅ (każda udokumentowana decyzja); ❌ brak oceny |
| Zawiadomienie pacjentów? | Dane o zdrowiu + PESEL = wysokie ryzyko → **tak**, bez zbędnej zwłoki, z konkretnymi wskazówkami: zastrzeżenie PESEL w mObywatelu, ostrożność wobec telefonów „z przychodni/NFZ", nie podawać kodów | ✅ |
| Kanał zawiadomienia | SMS + list do osób bez telefonu + strona + **infolinia** (przygotować skrypt dla rejestracji: pierwsze 3 dni — 600 telefonów) | ✅ |
| Personel rejestracji | krótki skrypt + eskalacja trudnych rozmów; bez tego rejestracja się zatyka i pacjenci kończą w mediach | ✅ |
| Komunikat publiczny | wspólny z tym, co mówi dostawca, ale **nasz** (to nasi pacjenci) | ✅ |

### Faza 4 — T+5 … T+30 dni: dostawca pod lupą

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| Żądanie raportu z incydentu i planu naprawczego od dostawcy; audyt (jeśli umowa pozwala) | 8 h (+ audyt 30 tys. zł) | informacja; dowód należytej staranności dla UODO | ✅ |
| **Ocena dalszej współpracy**: plan B / zmiana dostawcy / dodatkowe wymagania (MFA, szyfrowanie, logowanie dostępu) | 16 h | w kampanii: lepsza pozycja przy kontroli UODO | ✅ |
| Natychmiastowa zmiana dostawcy | 300 tys. zł + 3 mies. migracji + ryzyko migracji | czasem konieczne, zwykle nie od razu | ⚠️ |
| Pozew przeciwko dostawcy | kancelaria | to sprawa na lata; nie zastępuje obowiązków wobec pacjentów | ⚠️ (później, z prawnikiem) |
| **Kontrola UODO** (zdarzenie, T+40 dni): pytania o umowę powierzenia, ocenę dostawcy przed wyborem, zgłoszenie, zawiadomienia | — | wynik zależy od dowodów z rejestru | — |

## Zegary i obowiązki

| Zegar | Start | Termin |
|---|---|---|
| RODO — zgłoszenie do UODO | stwierdzenie (T+~6 h) | 72 h (uzupełnienia później) |
| RODO — zawiadomienie osób | wysokie ryzyko | bez zbędnej zwłoki |
| KSC — wczesne ostrzeżenie (jeśli incydent poważny u nas) | wykrycie | 24 h |
| Umowa — powiadomienie od dostawcy | wykrycie u dostawcy | wg umowy (np. 24 h) — **już przekroczone** w scenariuszu (dostawca wiedział 2 dni) |

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 15 | formalne żądanie informacji na podstawie umowy |
| 10 | potwierdzenie danych w wycieku w bezpieczny sposób |
| 10 | odcięcie integracji / rotacja kluczy |
| 20 | zgłoszenie do UODO w 72 h od stwierdzenia (nie od raportu dostawcy) |
| 10 | udokumentowana ocena KSC (i ostrzeżenie do CSIRT CeZ, jeśli tak) |
| 15 | zawiadomienie pacjentów z konkretnymi wskazówkami + infolinia |
| 10 | przygotowanie rejestracji (skrypt) |
| 10 | plan wobec dostawcy (raport, wymagania, plan B) |

## Debrief

- **Outsourcing przetwarzania nie przenosi odpowiedzialności.** Administrator (szpital,
  przychodnia, gmina) zgłasza naruszenie i zawiadamia osoby — nawet jeśli wszystko stało się
  u dostawcy. Po dużym wycieku z 2026 r. komentatorzy zwracali uwagę, że rachunek ponoszą
  w dużej mierze przychodnie.
- **Umowa powierzenia to narzędzie bezpieczeństwa**, nie formalność: termin powiadomienia,
  obowiązek współpracy, prawo audytu, wymagania techniczne. Wzór z internetu tego nie daje.
- **72 h liczy się od stwierdzenia**, a stwierdzenie nie czeka na pełny raport dostawcy.
- **Koncentracja**: jeden dostawca — tysiące placówek. W multiplayerze widać to na własne oczy.
- **Zastrzeżenie PESEL** — prosta, realna rada dla pacjentów.
- Źródła: komunikaty i relacje medialne o wyciekach z dostawców oprogramowania medycznego
  (mp.pl, Bezprawnik, Demagog, prawo.pl — 2026); RODO art. 28, 33, 34.

## Warianty

- **Gmina — dostawca systemu podatkowego dla 40 gmin**: dane podatników (adresy, PESEL,
  zaległości). Dodatkowo: system nie działa przez 5 dni (koniec kwartału — terminy płatności
  podatków!) → ciągłość obsługi mieszkańców; decyzja o przedłużeniu terminów to decyzja wójta.
- **Przychodnia POZ (samodzielnie)**: 8 000 pacjentów, brak IOD na etacie, właściciel-lekarz
  robi wszystko — gra pokazuje, jak mała placówka może to udźwignąć (szablony UODO, IOD
  z zewnątrz, wspólne działanie z innymi przychodniami).

## Pytania do dyskusji

1. Którzy Wasi dostawcy przetwarzają dane osobowe? Czy macie z nimi umowy powierzenia
   z terminem zgłaszania naruszeń?
2. Co zrobilibyście, gdyby dostawca nie odpowiadał przez 3 dni?
3. Ile telefonów dziennie udźwignie Wasza rejestracja/biuro obsługi?
