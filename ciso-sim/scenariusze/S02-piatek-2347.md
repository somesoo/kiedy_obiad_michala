# S02. Piątek, 23:47

| | |
|---|---|
| **Firmy** | szpital (SP ZOZ w Zalesiu) — kulminacja kampanii |
| **Rodzaj** | ransomware z kradzieżą danych (podwójne wymuszenie), ciągłość opieki |
| **Trudność** | ★★★ |
| **Czas gry / realny** | 30 dni (najgęściej pierwsze 72 h) / 30–45 min |
| **Zegary** | **CSIRT CeZ**: 24 h / 72 h / miesiąc · **UODO**: 72 h · zawiadomienie o przestępstwie · ubezpieczyciel (jeśli polisa) · media (pierwszy telefon ~7:00) |
| **Inspiracja** | cztery ataki ransomware na polskie placówki ochrony zdrowia w 25 dni (marzec 2026), m.in. szpital wojewódzki przeszedł na dokumentację papierową, z pomocą wojska przy odtwarzaniu; wcześniej wycieki danych laboratoriów (2023) |
| **Cele** | E5, E6, E10, E12, E1 (decyzja o okupie), E7 (rola dyrektora) |

## Warunki wyzwolenia

- Skrypt kampanii (okno m. 9–14) **albo** silnik: intruz sprawcy `ransomware` doszedł do celu.
- Termin w piątek wieczorem/nocą (realny wzorzec: ataki w weekendy i święta, gdy dyżury są
  najsłabsze).

## Prawda

Afiliant ransomware wszedł **5 tygodni temu** przez konto dostawcy HIS (zdalny dostęp przez
narzędzie zdalnej pomocy **bez MFA**; hasło z infostealera na laptopie serwisanta). Przez dwa
tygodnie rozpoznawał sieć, przejął konto administratora domeny, w ubiegły weekend wyniósł
**ok. 380 GB** (skany dokumentacji, eksporty z HIS, kadry). W piątek o 23:30 uruchomił
szyfrowanie przez zasady grup (GPO) na wszystkich maszynach z Windows w domenie, w tym na
serwerze kopii, który jest w tej samej domenie. Aparatura medyczna działa (ma własne systemy),
ale nie przesyła wyników do HIS. Laboratorium i RTG/PACS — zaszyfrowane serwery pośredniczące.

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `mfa` u dostawców / PAM dla dostępu zdalnego | **scenariusz w ogóle nie startuje tą drogą** (silnik wylosuje inny wektor — zwykle później i słabszy) |
| `edr` (pokrycie ≥ 80%) | szyfrowanie zatrzymane na części maszyn (zaszyfrowane ~35% zamiast ~90%); wcześniejszy alert o narzędziach ataku (jeśli ktoś je czytał — patrz jakość operacji) |
| `mdr` | telefon z MDR o 23:52 („izolujemy hosty?") — zysk 1–2 h i mniejsza skala |
| `backup` offline + `dr_test` | HIS odtworzony w 2–4 dni zamiast 2–3 tygodni |
| `bcp` (procedury papierowe przećwiczone) | brak przekierowań karetek po pierwszych 6 h; oś zdrowia prawie bez strat |
| `plan_ir` + `cwiczenia` | dyrektor wie, czego się od niego oczekuje; krótsze decyzje (−1 h na fazę) |
| `retainer_ir` | firma DFIR na miejscu w 4–6 h zamiast „w poniedziałek po południu" |
| `segmentacja` | aparatura i PACS w osobnej strefie — część oddziałów pracuje normalnie |
| ubezpieczenie z prawdziwą ankietą | pokrycie kosztów DFIR i odtworzenia |

## Przebieg

### Faza 1 — T+0 (23:47): telefon z SOR

Dyżurny informatyk (Ty pod telefonem albo osoba z zespołu — zależy od grafiku dyżurów):
„Na SOR-ze HIS nie działa, na ekranach jakaś kartka po angielsku, drukarki drukują to samo."

**Co gracz wie:** komunikat okupu (pewne); skala — nie wiadomo; czy dalej trwa — nie wiadomo.

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Odcięcie: wyłączenie łącza do internetu i rozłączenie przełączników rdzeniowych między strefami** (nie wyłączanie komputerów!) | 30 min, wymaga osoby na miejscu | zatrzymuje szyfrowanie tam, gdzie jeszcze trwa; zachowuje pamięć RAM do analizy | ✅ |
| Wyłączanie komputerów z prądu „żeby nie szyfrowało" | 1 h | zatrzymuje szyfrowanie, ale **niszczy dowody w pamięci** (klucze, procesy) | ⚠️ |
| Najpierw zadzwonić do dyrektora i czekać na decyzję | 45 min | szyfrowanie trwa dalej | ❌ odcięcie to decyzja techniczna, którą plan IR powinien dawać dyżurnemu |
| Próba „wyczyszczenia" zaszyfrowanych stacji i uruchomienia HIS z kopii od razu | 2 h | kopia też zaszyfrowana (ta sama domena) albo — gorzej — przywrócona do sieci z aktywnym napastnikiem | ❌ |

### Faza 2 — T+1 h: sztab i pacjenci

**Co gracz wie:** zaszyfrowane: HIS, laboratorium (serwer pośredni), PACS (serwer), kadry,
serwer kopii (pewne); napastnik miał admina domeny (prawdopodobne); dane wyniesione — nie
wiadomo (notatka o okupie twierdzi, że tak).

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Zwołanie sztabu kryzysowego**: dyrektor, z-ca ds. lecznictwa, naczelna pielęgniarka, IT, rzecznik, prawnik/IOD | 1 h | jedna decyzja zamiast dziesięciu sprzecznych | ✅ |
| **Uruchomienie procedur papierowych** (BCP): formularze, ręczne zlecenia badań, kurierzy z wynikami | 30 min (z BCP) / 3 h (bez) | ciągłość opieki | ✅ |
| Rekomendacja dyrektorowi: **czasowe ograniczenie przyjęć planowych i powiadomienie dyspozytora medycznego** o ograniczonej wydolności (decyzja medyczna — dyrektora) | — | mniej ryzyka dla pacjentów; koszt finansowy i wizerunkowy | ✅ (rekomendacja; decyduje dyrektor) |
| „Damy radę normalnie, rano HIS wróci" | 0 | przy braku kopii offline HIS nie wróci przez dni; ryzyko dla pacjentów | ❌ |

**Oś zdrowia** (osobny wskaźnik): każda godzina bez BCP po T+3 h = zdarzenia niepożądane
(opóźnione wyniki, pomyłki w podawaniu leków przy braku dokumentacji). Gra pokazuje je jako
liczbę — bez dramatyzowania, ale bez ukrywania.

### Faza 3 — T+2 h … T+8 h: pomoc z zewnątrz i dowody

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Wczesne ostrzeżenie do CSIRT CeZ** (przez S46 / kanał alarmowy) | 30 min | spełnia 24 h; CSIRT może wesprzeć (wskaźniki, kontakty, ocena); informacja dla sektora | ✅ już w nocy — ostrzeżenie może być krótkie i niepełne |
| Czekanie z CSIRT „aż będziemy wiedzieć więcej" | — | ryzyko przekroczenia 24 h; sektor nie dostaje ostrzeżenia | ❌ |
| Wezwanie firmy DFIR (retainer: przyjazd 4–6 h; bez umowy: szukanie po nocy, przyjazd w poniedziałek, 900 zł/h) | wg umowy | analiza, zakres, bezpieczne odtwarzanie | ✅ |
| Zgłoszenie do ubezpieczyciela **przed** wezwaniem firm zewnętrznych spoza listy | 20 min | inaczej częściowa odmowa | ✅ jeśli polisa |
| Zawiadomienie o przestępstwie (policja / CBZC, prokuratura) | 1 h | wymagane; może dać dostęp do wsparcia | ✅ |
| Prośba o wsparcie przez CSIRT / wojewodę (w realnym ataku w 2026 r. pomagało wojsko) 🟡 tryb | 1 h | dodatkowe ręce do odtwarzania | ⚠️ zależy od skali, ale warto zapytać |
| Zachowanie dowodów: obrazy dysków kluczowych serwerów, logi z kontrolerów domeny, zrzut zapory | 4 h DFIR | bez tego nie wiesz, co wyniesiono → nie wiesz, kogo zawiadomić | ✅ |
| Reset wszystkich haseł natychmiast, w tym admina domeny, zanim wiemy, jak wszedł | 2 h | jeśli napastnik ma inną furtkę (konto dostawcy) — wraca; jeśli nie — pomaga | ⚠️ najpierw zamknij drzwi wejściowe (konto dostawcy), potem resetuj z zaplanowaną kolejnością (dwukrotny reset kont usług Kerberos itp. — szczegół techniczny w dymku) |

### Faza 4 — T+8 h (sobota rano): media i okup

7:05 dzwoni lokalny portal: „Pacjenci piszą, że nie ma wyników. To atak hakerski?"
W skrzynce okupowej: żądanie **2,4 mln zł** w kryptowalucie, 72 h, „inaczej publikujemy
dane pacjentów". Próbka: 30 skanów kart informacyjnych.

| Opcja (komunikacja) | Ocena |
|---|---|
| **Krótki, prawdziwy komunikat**: incydent bezpieczeństwa, szpital pracuje w trybie awaryjnym, pacjenci w stanie zagrożenia życia są przyjmowani, planowe — kontakt telefoniczny; zgłoszone do właściwych instytucji; kolejna informacja o 14:00 | ✅ |
| „Awaria techniczna serwera" | ❌ prawda wyjdzie w ciągu doby (próbki na forum), reputacja −30 |
| Brak komentarza | ⚠️ media napiszą same; reputacja −10 |

| Opcja (okup) | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Nie płacimy**; odtwarzamy z tego, co mamy; przygotowujemy się na publikację (zawiadomienia, infolinia) | — | czas odtworzenia zależy od kopii; publikacja danych prawdopodobna | ✅ domyślna rekomendacja (brak gwarancji, finansowanie przestępczości, ryzyko sankcji, wtórne ataki na płacących) |
| Negocjacje „na zwłokę" przez firmę DFIR (bez zamiaru płacenia), żeby zyskać czas i informacje (np. zakres wykradzionych danych) | 20 h DFIR | więcej wiedzy o zakresie | ⚠️ dopuszczalne, decyzja zarządu, z prawnikiem |
| Płacimy | 2,4 mln zł | **SP ZOZ wydaje środki publiczne** — wydatek wątpliwy prawnie (dyscyplina finansów publicznych 🟡), brak gwarancji usunięcia danych, klucz deszyfrujący zwykle wolny i zawodny; reputacja | ❌ dla podmiotu publicznego; gra nie blokuje opcji, ale debrief tłumaczy dlaczego |

### Faza 5 — T+24 h … T+72 h: UODO, pacjenci, odtwarzanie

**Co gracz wie (po analizie DFIR):** wyniesiono dane ok. **96 tys. pacjentów** (w tym dane
o zdrowiu, PESEL) i **640 pracowników** (prawdopodobne → pewne w T+60 h).

| Opcja | Ocena |
|---|---|
| **Zgłoszenie do Prezesa UODO w 72 h** — nawet niepełne (art. 33 dopuszcza uzupełnianie); opis, kategorie, przybliżona liczba, środki | ✅ |
| Czekanie z UODO na „pełny obraz" (DFIR mówi: 10 dni) | ❌ termin to 72 h od stwierdzenia; spóźnienie jest samo w sobie naruszeniem |
| **Zgłoszenie do CSIRT CeZ w 72 h** (pełne) — to inne zgłoszenie niż do UODO | ✅ |
| **Zawiadomienie pacjentów** (wysokie ryzyko — dane o zdrowiu, PESEL): list/SMS/strona, co wyciekło, co robić (np. **zastrzeżenie numeru PESEL w mObywatelu**, czujność na „telefon ze szpitala", alerty BIK), infolinia | ✅ |
| Komunikat ogólny bez zawiadomień indywidualnych | ⚠️/❌ zależnie od skali — przy danych o zdrowiu raczej ❌ |
| Odtwarzanie **w czystym środowisku** (nowa domena / odbudowa kontrolerów, kopie sprawdzone pod kątem utrwalenia napastnika, wszystkie poświadczenia nowe, dostęp dostawcy odcięty do czasu MFA) | ✅ wolniej, ale napastnik nie wraca |
| Szybkie odtworzenie „jak było" (te same konta, ta sama domena) | ❌ 60% szans na powtórny atak w ciągu miesiąca (w grze: S02-epilog) |

### Faza 6 — T+30 dni: raport końcowy i lekcje

Sprawozdanie końcowe do CSIRT CeZ (do miesiąca — 🟡 od którego zgłoszenia, gra liczy od
72 h). Gracz składa je z klocków: przyczyna (konto dostawcy bez MFA), zakres, skutki,
działania, lekcje. Następnie wybiera **lekcje → zadania** (MFA dla dostawców, PAM, kopie
offline, segmentacja PACS, BCP przećwiczony).

T+45 dni: dane pojawiają się na stronie wycieków grupy. Gracz, który przygotował infolinię
i komunikację, ma spokojny dzień. Gracz, który nie zawiadomił pacjentów, ma kryzys medialny
i kontrolę UODO.

## Zegary i obowiązki

| Zegar | Start | Termin | Kto |
|---|---|---|---|
| Wczesne ostrzeżenie KSC | wykrycie (T+0) | 24 h | CSIRT CeZ |
| Zgłoszenie KSC | wykrycie | 72 h | CSIRT CeZ |
| Sprawozdanie końcowe KSC | (gra: zgłoszenie 72 h) | 1 miesiąc | CSIRT CeZ |
| Zgłoszenie naruszenia RODO | stwierdzenie naruszenia (T+~8 h, gdy okup twierdzi o kradzieży; najpóźniej przy potwierdzeniu) | 72 h | Prezes UODO |
| Zawiadomienie osób | wysokie ryzyko | bez zbędnej zwłoki | pacjenci, pracownicy |
| Ubezpieczyciel | wykrycie | „niezwłocznie" (umowa) | ubezpieczyciel |

Uwaga dydaktyczna: **kiedy „stwierdzono" naruszenie RODO?** Gra przyjmuje: w chwili, gdy
gracz ma rozsądne podstawy (notatka okupowa z próbką danych). Czekanie na „pewność" od DFIR
jest błędem — debrief to tłumaczy.

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 12 | odcięcie sieci bez niszczenia dowodów (< 1 h) |
| 12 | sztab + BCP (< 2 h) |
| 8 | rekomendacja ograniczenia przyjęć planowych i powiadomienia dyspozytora |
| 10 | wczesne ostrzeżenie do CSIRT CeZ (< 24 h; premia < 8 h) |
| 10 | zgłoszenie UODO w 72 h |
| 8 | zawiadomienie pacjentów z konkretnymi wskazówkami |
| 10 | prawdziwa komunikacja publiczna |
| 10 | brak płacenia okupu przez podmiot publiczny / decyzja zarządu udokumentowana |
| 10 | odtwarzanie w czystym środowisku, zamknięcie wektora (dostawca) przed powrotem do sieci |
| 10 | raport końcowy z rzeczywistą przyczyną + lekcje zamienione na zadania |

## Debrief

- **Ransomware to nie „awaria IT", tylko kryzys organizacji.** Najważniejsze decyzje
  (przyjęcia, dyspozytor, komunikacja, okup) podejmuje dyrektor. Rola IT/bezpieczeństwa:
  dać mu fakty i opcje w zrozumiałej formie, szybko.
- **Wektor: dostęp zdalny dostawcy bez MFA** — jeden z najczęstszych w ochronie zdrowia.
  Napastnik był w środku tygodniami; z EDR-em i kimś, kto czyta alerty, zobaczyłbyś go w fazie
  „ruch".
- **Kopie w tej samej domenie szyfrują się razem z resztą.** Kopia offline/niezmienialna
  i przećwiczone odtworzenie to różnica między 3 dniami a 3 tygodniami.
- **Dwa zgłoszenia, dwie instytucje, dwa zegary**: CSIRT CeZ (KSC) i UODO (RODO). Oba można
  złożyć niepełne i uzupełniać.
- **Okup**: brak gwarancji, finansowanie przestępczości, ryzyko sankcji, a w podmiocie
  publicznym — wydatek ze środków publicznych z wątpliwą podstawą (🟡 do konsultacji prawnej).
- **Zastrzeżenie PESEL** (mObywatel / urząd gminy) to realna, prosta wskazówka dla osób,
  których dane wyciekły.
- Jak w realu: w marcu 2026 r. kilka placówek w Polsce przeszło przez ten scenariusz w ciągu
  miesiąca; jeden szpital pracował na dokumentacji papierowej, a do odtwarzania systemów
  dołączyli żołnierze. Źródła: CyberDefence24, CRN, iMagazine (2026); CSIRT CeZ.

## Warianty

- **Szpital bez długu „dostawca bez MFA"** (gracz zamknął to wcześniej): wektor = phishing
  na lekarza (Z-zalążek „e-ZLA"), napastnik wolniejszy, EDR ma więcej szans.
- **Okres świąteczny** (grudzień): mniej personelu IT, firma DFIR zajęta (+12 h przyjazdu).
- **Przychodnia (POZ, 40 osób)**: bez SOR-u, ale z e-receptami i zwolnieniami (P1, ZUS) —
  skala mniejsza, obowiązki te same.

## Pytania do dyskusji

1. Kto w szpitalu ma prawo o 23:50 zdecydować o odłączeniu sieci? Czy ta osoba o tym wie?
2. Czy procedury papierowe istnieją i czy ktoś je ćwiczył w tym roku?
3. Co powiedzielibyście dziennikarzowi o 7:05?
4. Czy dostawcy z dostępem zdalnym mają MFA? Skąd to wiecie?
