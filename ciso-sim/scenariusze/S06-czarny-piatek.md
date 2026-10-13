# S06. Czarny piątek

| | |
|---|---|
| **Firmy** | sklep (SklepMax.pl — e-commerce z marketplace'em) |
| **Rodzaj** | wymuszenie DDoS (RDoS) + DDoS warstwy aplikacji + przejmowanie kont klientów (credential stuffing) w najważniejszym dniu roku |
| **Trudność** | ★★ |
| **Czas gry / realny** | 4 dni (czwartek 26.11.2026 – niedziela 29.11) / 25 min |
| **Zegary** | sprzedaż (każda godzina przestoju = ~3% obrotu miesiąca w tym dniu 🔵), **UODO 72 h** (przejęte konta = naruszenie), KSC — tylko jeśli sklep/marketplace jest podmiotem ważnym (decyzja z początku kampanii), bramka płatności (jej wymagania) |
| **Inspiracja** | powszechne wzorce: wymuszenia DDoS przed szczytami sprzedaży, credential stuffing z użyciem wycieków haseł z innych serwisów, fale DDoS haktywistów na polskie serwisy |
| **Cele** | E6, E9 (MFA dla klientów vs konwersja), E10, E1 (płacić czy nie) |

## Prawda

Grupa wymuszająca wysyła w czwartek list: „2 BTC do piątku 9:00 albo położymy sklep na
Czarny piątek. Demonstracja za 10 minut." Demonstracja: 15 minut spowolnienia. Grupa ma
botnet zdolny do ataku warstwy aplikacji (żądania wyszukiwania i koszyka — drogie dla
serwera). **Niezależnie** od nich inna grupa od tygodnia testuje na stronie logowania pary
login/hasło z wycieków (credential stuffing) — 0,3% trafień (ludzie używają tych samych
haseł). W piątek, przy tłoku, przyspiesza.

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `waf_ddos` (na starcie — ale czy wszystko idzie przez CDN?) | atak wolumetryczny pochłonięty; warstwa aplikacji — zależy od reguł (godziny strojenia) |
| stary adres serwera wciąż odpowiada wprost (dług „beta.") | napastnik omija CDN — **dziura** do znalezienia w fazie 1 |
| test obciążeniowy przed szczytem | wiadomo, ile wytrzyma koszyk |
| limit prób logowania + CAPTCHA adaptacyjna + sprawdzanie haseł z wycieków | credential stuffing ×0,2 |
| MFA dla kont z zapisanymi danymi/punktami | przejęcia ×0,1 |
| `mdr`/SIEM z logami aplikacji | widać testy credential stuffingu tydzień wcześniej (sygnał!) |

## Przebieg

### Faza 1 — czwartek 14:00: list i demonstracja

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Nie płacić**; awaryjnie z dostawcą CDN: tryb „pod atakiem", reguły na wyszukiwarkę i koszyk, limity na IP/ASN, kolejka wirtualna | 12 h + 15 tys. zł (wsparcie awaryjne) | piątek w większości przetrwany | ✅ |
| Zapłacić 2 BTC | ~550 tys. zł 🔵 | 40%: atak i tak przychodzi (inna grupa / „podwyżka"); jesteś na liście płacących | ❌ |
| **Znaleźć ścieżki omijające CDN** (stare rekordy DNS, „beta.", bezpośredni adres serwera) i je zamknąć (zapora: ruch tylko z CDN) | 4 h | bez tego ochrona jest dziurawa | ✅ |
| Zgłoszenie wymuszenia (policja/CBZC, CERT Polska) | 1 h | ✅ |
| Komunikat dla zespołów (obsługa klienta, marketing): możliwe spowolnienia, skrypt odpowiedzi | 1 h | ✅ |

### Faza 2 — piątek 9:00–13:00: atak

Atak warstwy aplikacji: 40× normalny ruch na wyszukiwarkę. Równocześnie skok logowań
(credential stuffing ukryty w hałasie).

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| Kolejka wirtualna dla nowych sesji + wyłączenie kosztownych funkcji (filtry wyszukiwarki, rekomendacje) | tarcie (konwersja −8%) | sklep działa | ✅ |
| „Zwiększmy serwery" (autoskalowanie bez limitu) | rachunek za chmurę ×6; atak skaluje się szybciej | ⚠️ pomaga trochę, kosztuje dużo |
| Zablokowanie całego ruchu spoza Polski | konwersja −3% (klienci z zagranicy, VPN-y) | atak z polskich IP (przejęte routery) trwa | ⚠️ |
| **Zauważenie credential stuffingu w hałasie** (wymaga logów i kogoś, kto patrzy: jakość operacji ≥ 0,6) | — | faza 3 zaczyna się o 10:30 zamiast w niedzielę | ✅ (jeśli zauważone) |

### Faza 3 — piątek/sobota: przejęte konta

**Co gracz wie:** ok. 4 200 kont zalogowanych przez napastników (pewne po analizie);
napastnicy wymieniają punkty lojalnościowe na karty podarunkowe i zmieniają adresy dostaw
przy zamówieniach z płatnością przy odbiorze (prawdopodobne).

| Opcja | Ocena |
|---|---|
| **Reset haseł dla przejętych kont**, wylogowanie sesji, blokada wymiany punktów na 24 h, ręczna weryfikacja zmian adresów | ✅ |
| Wymuszenie resetu haseł dla **wszystkich** 1,4 mln klientów w Czarny piątek | ⚠️ bezpieczne, ale sprzedaż −20% w szczycie; decyzja zarządu |
| **Zgłoszenie do UODO w 72 h** (dostęp osób nieuprawnionych do kont = naruszenie ochrony danych: adresy, historia zamówień) | ✅ |
| „To nie nasz wyciek — hasła wyciekły gdzie indziej" | ❌ dostęp do danych naszych klientów nastąpił u nas; nasza rola: ocena ryzyka, zgłoszenie, zawiadomienie |
| Zawiadomienie poszkodowanych klientów + zwrot punktów | ✅ |
| Wprowadzenie sprawdzania haseł z wycieków przy logowaniu i MFA opcjonalnego (z zachętą: punkty za włączenie) | ✅ długofalowo |

### Faza 4 — niedziela/poniedziałek: zarząd, KSC, fundusz

| Decyzja | Ocena |
|---|---|
| Ocena KSC: jeśli marketplace jest podmiotem ważnym — czy 3 h ograniczeń dla 1,4 mln użytkowników to incydent poważny? Udokumentuj kryteria i decyzję; w razie wątpliwości — wczesne ostrzeżenie | ✅ (każda udokumentowana) |
| Raport dla CEO i funduszu: koszt ataku vs koszt ochrony, co zadziałało (CDN), co nie (dziura „beta.", brak MFA), plan | ✅ mandat + |
| Ukrycie przejęć kont w raporcie dla funduszu (due diligence w m. 18–22!) | ❌ wróci przy transakcji |

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 15 | nie płacić + zgłoszenie wymuszenia |
| 15 | zamknięcie ścieżek omijających CDN |
| 15 | kolejka/wyłączenie kosztownych funkcji zamiast nieograniczonego skalowania |
| 15 | wykrycie credential stuffingu w hałasie |
| 15 | reakcja na przejęte konta (reset, sesje, punkty, adresy) |
| 15 | UODO 72 h + zawiadomienie klientów |
| 10 | uczciwy raport dla zarządu i funduszu |

## Debrief

- **DDoS bywa zasłoną dymną.** Najdroższa część tego weekendu to nie przestój, tylko
  przejęte konta, które przeszły niezauważone w hałasie.
- **Ochrona „przez CDN" ma dziurę, jeśli serwer odpowiada też wprost.** Stare subdomeny
  i rekordy DNS to klasyka.
- **Płacenie wymuszającym** nie kupuje spokoju — kupuje miejsce na liście płacących.
- **Hasła klientów wyciekły gdzie indziej, ale konta są Twoje.** Sprawdzanie haseł z
  wycieków, limity logowań i MFA to dziś standard.
- **Bezpieczeństwo vs konwersja** to prawdziwy spór w e-commerce — gra pokazuje koszty
  obu stron.

## Pytania do dyskusji

1. Co jest dla Was „Czarnym piątkiem" (szczyt, którego nie możecie przegapić)? Jak go chronicie?
2. Czy Wasz serwis da się ominąć, łącząc się bezpośrednio z serwerem?
3. Czy klienci mogą włączyć MFA? Ilu to zrobiło?
