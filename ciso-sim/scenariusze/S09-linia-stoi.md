# S09. Linia stoi

| | |
|---|---|
| **Firmy** | fabryka (Metalpol S.A., Tier-2 motoryzacji) — kulminacja kampanii |
| **Rodzaj** | ransomware w IT przenoszący się przez płaską sieć na stacje HMI/inżynierskie linii produkcyjnych |
| **Trudność** | ★★★ |
| **Czas gry / realny** | 21 dni / 35 min |
| **Zegary** | **klient OEM** (umowa: powiadomienie o zakłóceniu dostaw niezwłocznie; kary za przestój linii klienta), **CSIRT NASK** 24 h / 72 h / miesiąc (podmiot ważny), UODO 72 h (jeśli dane pracowników), TISAX (powiadomienie klienta o incydencie), ubezpieczyciel |
| **Inspiracja** | ataki ransomware na zakłady produkcyjne w Europie i w Polsce; typowa ścieżka: phishing/VPN → domena → płaska sieć → stacje HMI z Windows |
| **Cele** | E3, E5, E12, E10 (klient B2B), E1 |

## Prawda

Wejście: przejęte hasło do VPN kierownika zmiany (infostealer na prywatnym laptopie, MFA
brak). Napastnik przez 9 dni rozpoznawał sieć, przejął konto admina domeny (konto prezesa
z uprawnieniami admina — dług z profilu), w niedzielę o 23:00 zaszyfrował serwery biurowe,
ERP, MES **i — przez płaską sieć — 14 stacji HMI i 3 stacje inżynierskie** z Windows na
liniach. Sterowniki PLC działają, ale bez HMI operatorzy nie widzą procesu; linie zatrzymane
bezpiecznie przez automatykę (to dobra wiadomość, której nikt jeszcze nie zna).
Wyniesiono 60 GB z serwera plików (rysunki techniczne klienta OEM — **tajemnica klienta**,
dane kadrowe).

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `segmentacja` (IT/OT rozdzielone, strefa przemysłowa z bramą) | HMI nietknięte → **linie pracują na zapasach z MES w trybie ręcznym**; przestój produkcji: godziny, nie tygodnie |
| `mfa` na VPN | wektor zamknięty — scenariusz startuje z innym wektorem (phishing), 2–3 tyg. później |
| `edr` na serwerach i stacjach HMI (z akceptacją producenta maszyn!) | szyfrowanie zatrzymane na części; wcześniejszy alert |
| złote obrazy stacji HMI + kopie projektów PLC/HMI (u siebie, nie tylko u integratora) | odtworzenie HMI w 1–2 dni zamiast 7–10 |
| `bcp` z priorytetami linii dla OEM | wiadomo, którą linię ratować najpierw |
| umowa z OEM przeczytana (klauzula powiadomienia) | lepsza pozycja przy karach |

## Przebieg

### Faza 1 — T+0 (poniedziałek 5:40): „ekrany na liniach mówią po angielsku"

Brygadzista: wszystkie linie stoją, na ekranach operatorskich żądanie okupu. Dyrektor
produkcji: „Za 6 godzin klient potrzebuje dostawy, mają linię just-in-time".

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Potwierdzić bezpieczny stan maszyn i ludzi** (automatyk: czy PLC zatrzymały procesy bezpiecznie; żadnych ręcznych restartów „na ślepo") | 30 min | wiedza: PLC działają, linie bezpieczne | ✅ |
| **Odcięcie sieci**: internet, VPN, połączenia między biurem a halą (tam, gdzie się da — w płaskiej sieci to wyłączenie przełączników) | 1 h | zatrzymuje dalsze szyfrowanie | ✅ |
| „Restartujemy stacje HMI i jedziemy" | 1 h | zaszyfrowane nie wstaną; restart niszczy dowody | ❌ |
| Najpierw telefon do OEM | 15 min | dobrze, ale za wcześnie, by mówić konkrety | ⚠️ (faza 2) |

### Faza 2 — T+2 h: sztab, klient, priorytety

| Opcja | Ocena |
|---|---|
| **Sztab**: prezes, produkcja, logistyka, finanse, IT/OT, prawnik, komunikacja | ✅ |
| **Telefon do OEM (zakupy + jakość)** przed terminem dostawy: incydent, bezpieczny stan, szacunek, co robimy, kiedy kolejna informacja; zapytanie o zapasy po ich stronie | ✅ (umowa i relacja; przy dobrej komunikacji OEM często pomaga — zapasy, alternatywne dostawy) |
| Ukrywanie przed OEM („awaria maszyny") | ❌ TISAX i umowa wymagają powiadomienia; wyjdzie przy dostawie |
| **Priorytet: linia dla OEM** — odtworzenie jednej stacji HMI z obrazu / reinstalacja z projektów (jeśli są) na odizolowanym segmencie | ✅ |
| Wczesne ostrzeżenie do **CSIRT NASK** | ✅ (24 h) |
| Ubezpieczyciel + DFIR (retainer albo z listy ubezpieczyciela) | ✅ |
| Zawiadomienie o przestępstwie | ✅ |

### Faza 3 — T+8 h … T+3 dni: okup i odtwarzanie

Żądanie: **3,5 mln zł**, „+ publikacja rysunków Waszego klienta".

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Odtwarzanie bez płacenia**: HMI z obrazów/projektów (integrator na miejscu), ERP/MES z kopii offline (jeśli są), praca ręczna (karty zleceń, ręczna wysyłka) | wg przygotowania: 3–12 dni | ciągłość odzyskiwana etapami | ✅ |
| Płacimy (prywatna spółka — decyzja zarządu; sprawdzić sankcje, ubezpieczyciela) | 3,5 mln zł | deszyfrator wolny i zawodny (w grze: 70% danych odzyskane w 6 dni — **nie szybciej** niż dobre kopie), dane i tak mogą wyciec, ryzyko powtórki | ⚠️/❌ (debrief: płacenie bywa rozważane, gdy nie ma kopii — dlatego kopie są tańsze niż okup) |
| **Powiadomienie OEM o wycieku jego rysunków** (tajemnica klienta — umowa NDA, TISAX) | — | trudna rozmowa, ale obowiązek | ✅ |
| **UODO 72 h** — dane kadrowe na serwerze plików | — | ✅ |
| Odtwarzanie „w tej samej domenie, z tymi samymi kontami" | szybciej o 2 dni | napastnik wraca w 30% wariantów | ❌ |

### Faza 4 — T+5 … T+21 dni: kary, klient, odbudowa

| Decyzja | Ocena |
|---|---|
| Rozmowa z OEM o karach umownych: dokumentacja działań, plan naprawczy, harmonogram — dobra komunikacja z fazy 2 obniża kary (w grze: −50%) | ✅ |
| **Segmentacja IT/OT jako warunek ponownego połączenia** (choćby tymczasowa: osobne VLAN-y, zapora z białą listą) | ✅ |
| Konto admina domeny ≠ konto prezesa; PAM; MFA na VPN | ✅ |
| Raport końcowy (CSIRT NASK), audyt TISAX nadzwyczajny (zdarzenie) | ✅ |
| „Wracamy do normalności" bez zmian w sieci | ❌ powtórka (S09-epilog) |

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 15 | bezpieczeństwo maszyn i ludzi najpierw |
| 10 | odcięcie sieci bez niszczenia dowodów |
| 15 | wczesna, prawdziwa komunikacja z OEM |
| 10 | priorytet linii dla OEM (BCP) |
| 10 | CSIRT NASK w 24 h + UODO w 72 h |
| 10 | powiadomienie OEM o wycieku jego danych |
| 10 | decyzja o okupie udokumentowana (sankcje, ubezpieczyciel, zarząd) |
| 20 | odbudowa z segmentacją i nowymi poświadczeniami |

## Debrief

- **Płaska sieć zamienia incydent biurowy w zatrzymanie produkcji.** Segmentacja IT/OT to
  najważniejsza kontrola w fabryce.
- **PLC zwykle przeżywają — ludzie bez HMI nie widzą procesu.** Złote obrazy stacji HMI
  i kopie projektów u siebie skracają przestój z tygodni do dni.
- **Klient B2B wybacza incydent szybciej niż milczenie.** W łańcuchu just-in-time komunikacja
  to element ciągłości działania.
- **Konto prezesa jako admin domeny** — wygoda, która oddaje firmę napastnikowi.
- **Okup kontra kopie**: zapłata rzadko przyspiesza odtworzenie bardziej niż dobre kopie
  i nie cofa wycieku.

## Pytania do dyskusji

1. Czy komputer w biurze może połączyć się z panelem operatorskim na hali?
2. Gdzie są kopie projektów sterowników i paneli — u Was czy tylko u integratora?
3. Kto dzwoni do klienta, gdy linia stanie, i co mówi w pierwszych 2 godzinach?
