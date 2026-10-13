# S10. Między świętami

| | |
|---|---|
| **Firmy** | elektrociepłownia („Ciepło-Mróz" S.A. + spółka zależna z farmami OZE) — kampania zaawansowana |
| **Rodzaj** | atak państwowy: wiper udający ransomware w IT, próba na stacji inżynierskiej OT, unieruchomienie routerów farm OZE; okres świąteczny, mróz |
| **Trudność** | ★★★★ |
| **Czas gry / realny** | 14 dni + epilog (3 mies.) / 45 min |
| **Zegary** | **CSIRT** (NASK; przy ataku państwowym — współpraca z CSIRT GOV/ABW 🟡) 24 h / 72 h / miesiąc, operator sieci dystrybucyjnej, **oś ciepła** (temperatura w mieszkaniach), władze miasta, służby, media; możliwe **polecenie zabezpieczające** 🟡 |
| **Inspiracja** | skoordynowany atak z 29 grudnia 2025 r. na co najmniej 30 farm wiatrowych i fotowoltaicznych, dużą elektrociepłownię i firmę produkcyjną; zerwana łączność OZE z operatorami; w elektrociepłowni **EDR zatrzymał destrukcję na ponad 100 maszynach**; atrybucja do grup powiązanych z rosyjskim wywiadem; „byliśmy bardzo blisko blackoutu"; stawką ciepło dla ok. 500 tys. osób. W styczniu 2026 r. — śledztwo ws. ataku na ciepłownię w małej miejscowości |
| **Cele** | E5, E12 (ciepło dla ludzi), E3 (EDR jako ostatnia linia), E8, E10, współpraca z państwem |

## Warunki wyzwolenia

Skrypt kampanii energetycznej: **grudzień 2026** (m. 9), między 27 a 30 grudnia. Rekonesans
z m. 3–6 i ostrzeżenie służb z m. 7–9 to sygnały, które gracz mógł (nie musiał) wykorzystać.

## Prawda

Grupa państwowa jest w sieci od 4 miesięcy (wejście: podatność w urządzeniu brzegowym
spółki OZE, potem zaufane połączenie VPN spółka-matka). Przygotowała:
1. **wiper w IT** (udaje ransomware, ale nie da się odszyfrować — celem jest zniszczenie)
   rozsyłany przez GPO z przejętego kontrolera domeny,
2. **próbę na stacji inżynierskiej DCS** (stacja ma dostęp do internetu „do aktualizacji" —
   dług z profilu): wgranie zmodyfikowanej konfiguracji,
3. **unieruchomienie routerów 30 farm OZE** (domyślne hasła, podatne oprogramowanie) —
   zerwanie łączności z operatorem sieci.

Start: 29 grudnia, 7:10 (mróz −14°C, połowa zespołu na urlopie).

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `edr` na wszystkich serwerach i stacjach IT (≥ 95% znanych) w trybie blokowania | wiper zatrzymany na większości maszyn (**jak w realnym ataku**); zniszczone ~10% zamiast ~80% |
| `segmentacja` + stacja inżynierska **bez internetu**, zmiany DCS tylko z autoryzacją | próba na DCS nie dochodzi do skutku |
| `ot_monitoring` | alert o nietypowym połączeniu do stacji inżynierskiej w m. 8 (sygnał przed atakiem) |
| `deception` / `ndr` | rekonesans wykryty w m. 3–6 → możliwe usunięcie napastnika przed grudniem (scenariusz w wariancie „próba") |
| zmiana haseł i aktualizacja routerów OZE (zadanie z przeglądu dostawców / spółki zależnej) | farmy zachowują łączność |
| plan IR z grafikiem dyżurów na święta + `retainer_ir` | ludzie i DFIR dostępni w 2 h, nie „po Nowym Roku" |
| `bcp` (praca lokalna/ręczna bloków, łączność zastępcza z OSD) | ciepło bez przerwy |

## Przebieg

### Faza 1 — T+0 (29.12, 7:10): „serwery padają jeden po drugim"

Dyżurny IT: komputery w biurze restartują się z komunikatem okupowym; EDR (jeśli jest) zgłasza
setki blokad. Dyspozytor ciepłowni: „Stacja inżynierska sama coś ładuje". Spółka OZE: „Nie
widzimy farm".

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Ciepło najpierw**: dyspozytor przechodzi na sterowanie lokalne/ręczne bloków; **fizyczne odłączenie stacji inżynierskiej** od sieci | 20 min | proces stabilny | ✅ |
| **Odcięcie IT od OT i od internetu; odcięcie VPN do spółki OZE** | 30 min | zatrzymuje rozprzestrzenianie | ✅ |
| Przywracanie serwerów IT od razu | — | wiper wciąż aktywny (GPO) — zniszczy przywrócone | ❌ |
| Wyłączenie EDR „bo spowalnia przy tylu alertach" | — | ❌❌ (pułapka z katalogu: agent wyłączony na „wolnym" serwerze) |

### Faza 2 — T+1 h: ludzie, państwo, miasto

| Opcja | Ocena |
|---|---|
| **Ściągnięcie kluczowych osób z urlopów** (grafik dyżurów świątecznych, jeśli jest) | ✅ |
| **Wczesne ostrzeżenie do CSIRT** + informacja, że wzorzec wskazuje na atak destrukcyjny na infrastrukturę krytyczną (prawdopodobne zaangażowanie CSIRT GOV/ABW) | ✅ w pierwszej godzinie — inni w sektorze mogą być celem tego samego dnia |
| **Operator sieci dystrybucyjnej**: informacja o utracie łączności z farmami OZE, procedury | ✅ |
| **Władze miasta** (właściciel spółki, zarządzanie kryzysowe): stan, ryzyko dla ciepła, plan | ✅ |
| Czekać z CSIRT, aż „będzie pewność, że to atak" | ❌ |

### Faza 3 — T+4 h … T+48 h: współpraca i informacje częściowe

Pojawia się zespół CSIRT/służb. Część informacji o sprawcy jest **niejawna** — gracz dostaje
tylko wskazówki (wskaźniki, techniki), bez pełnego obrazu. To prawdziwe i frustrujące.

| Opcja | Ocena |
|---|---|
| **Pełna współpraca**: dostęp do logów, obrazów, próbek; wspólny kanał; jedna osoba kontaktowa | ✅ |
| Ograniczanie dostępu służbom „bo to nasza sieć i nasze tajemnice" | ❌ (w realu współpraca z CSIRT to warunek szybkiego ostrzeżenia innych) |
| **Wymiana wskaźników z sektorem** (ISAC / CSIRT — inne ciepłownie i OZE) | ✅ w multiplayerze: +wykrywanie u innych graczy |
| Publiczne przypisanie ataku konkretnemu państwu przez spółkę | ❌ atrybucja to rola państwa; spółka mówi o faktach |
| Ubezpieczyciel: zgłoszenie szkody (uwaga: **wyłączenie działań wojennych/państwowych** w polisie — spór, prawnik) | ✅ zgłosić; ⚠️ przygotować się na spór |

### Faza 4 — T+2 … T+14 dni: odbudowa i polecenie zabezpieczające

**Zdarzenie** (🟡 mechanizm): minister wydaje **polecenie zabezpieczające** — np. odłączenie
stacji inżynierskich od internetu we wszystkich podmiotach sektora, zmiana haseł urządzeń
brzegowych OZE w 72 h. Gracz, który już to zrobił, ma spokój; inny — wyścig.

| Decyzja | Ocena |
|---|---|
| Odbudowa domeny od zera (nowy las AD), przegląd każdego połączenia IT–OT, stacja inżynierska bez internetu (aktualizacje przez kontrolowaną strefę pośrednią) | ✅ |
| Spółka OZE: wymiana/aktualizacja routerów, hasła unikalne, monitoring, VPN do spółki-matki z MFA i segmentacją | ✅ |
| **Budżet po incydencie**: zarząd daje 2× — gracz wybiera inwestycje (monitoring OT, NDR, honeypoty, zespół 24/7) | ✅ (dobrze wybrane = etap 4) |
| Komunikacja publiczna: ciepło było/nie było zagrożone, co zrobiono, współpraca z państwem; bez szczegółów technicznych pomagających napastnikom | ✅ |

### Epilog — 3 miesiące później

Napastnik **wraca** (próba przez innego dostawcę — serwis turbin). Gracz z honeypotami
i monitoringiem OT widzi to w tydzień. Inny gracz — dopiero przy kolejnym ataku.

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 15 | ciepło najpierw: sterowanie lokalne, odłączenie stacji inżynierskiej |
| 10 | odcięcie IT/OT/internet/VPN OZE |
| 5 | EDR pozostawiony włączony mimo „spowolnienia" |
| 15 | CSIRT w pierwszej godzinie |
| 10 | OSD + władze miasta |
| 15 | pełna współpraca z CSIRT/służbami + wymiana z sektorem |
| 10 | odbudowa „od zera", stacja inżynierska bez internetu |
| 10 | naprawa spółki OZE (łańcuch dostaw wewnątrz grupy) |
| 10 | komunikacja publiczna bez atrybucji i bez szczegółów dla napastnika |

## Debrief

- **Prawdziwy wzorzec z 29.12.2025**: atak w okresie świątecznym, przy mrozie, na wiele
  podmiotów naraz. W elektrociepłowni EDR zatrzymał zniszczenie na ponad 100 maszynach —
  narzędzie, które działa nawet wtedy, gdy ludzi brakuje.
- **Atak państwowy chce zniszczenia, nie pieniędzy.** „Ransomware" bywa przykrywką dla wipera.
  Nie ma kogo pytać o deszyfrator.
- **Spółka zależna i dostawcy to droga do serca firmy.** Routery farm OZE na domyślnych
  hasłach i zaufany VPN do spółki-matki.
- **Stacja inżynierska z internetem** to otwarte drzwi do sterowania procesem.
- **Wymiana informacji** w pierwszych godzinach chroni innych w sektorze — to obowiązek
  i odpowiedzialność, nie tylko formalność.
- Źródła: CERT Polska (raport o ataku na sektor energii), ESET, wypowiedzi ministrów
  (styczeń 2026) w relacjach Spidersweb, gramwzielone.pl, android.com.pl.

## Pytania do dyskusji

1. Kto ma dyżur w Waszej firmie między świętami a Nowym Rokiem i czy ma uprawnienia do decyzji?
2. Czy spółki zależne i dostawcy są połączeni z Waszą siecią? Jak?
3. Czy Wasz EDR blokuje, czy tylko alarmuje? Kto może go wyłączyć?
