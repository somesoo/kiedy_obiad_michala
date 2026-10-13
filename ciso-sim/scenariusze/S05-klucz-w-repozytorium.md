# S05. Klucz w repozytorium

| | |
|---|---|
| **Firmy** | software house (Kodex Systems — dostawca SaaS dla przychodni) — kulminacja kampanii |
| **Rodzaj** | wyciek z chmury przez klucz dostępowy w publicznym repozytorium; **my jesteśmy podmiotem przetwarzającym** |
| **Trudność** | ★★★ |
| **Czas gry / realny** | 30 dni / 30 min |
| **Zegary** | **klienci** (my: „bez zbędnej zwłoki"; oni: ich własne 72 h do UODO), **CSIRT Cyfra** 24 h / 72 h / miesiąc (podmiot ważny), wymuszenie (termin okupu), umowy (SLA powiadomień — często 24 h) |
| **Inspiracja** | odwrotna strona S04 — wycieki z infrastruktury chmurowej dostawców oprogramowania w 2026 r.; powszechny wzorzec wycieku sekretów do publicznych repozytoriów |
| **Cele** | E8 (bycie ogniwem łańcucha), E6, E10 (komunikacja z klientami), E9 (dane testowe), etyka (Sales vs prawda) |

## Prawda

Programista (dobry, zaufany) w piątek wieczorem wrzucił do **publicznego** repozytorium
prywatnego projektu plik konfiguracyjny skopiowany z pracy — z kluczem dostępowym do konta
chmurowego firmy (stary klucz konta technicznego z szerokimi uprawnieniami, utworzony
3 lata temu, „tymczasowo"). Bot skanujący publiczne repozytoria znalazł klucz po 4 minutach.
W sobotę rano z adresów VPN pobrano: zasobnik z **kopiami baz testowych** (które są kopią
produkcji — z PESEL-ami, „bo testerom tak łatwiej") i zasobnik z eksportami dla klientów.
Razem: dane z **312 przychodni**, ok. **2,1 mln pacjentów**. Napastnik próbował też uruchomić
maszyny do kopania kryptowalut — to wywołało alert kosztowy.

## Stan zależny od przygotowania

| Gracz ma… | Skutek |
|---|---|
| `cspm` (skan sekretów + alerty chmury) | alert o kluczu w publicznym repo w 10 min (piątek 22:10) → rotacja przed użyciem → **wariant „niemal"** (faza 0B) |
| polityka: brak danych produkcyjnych w testach (dług „testowa baza = produkcja" spłacony) | z zasobnika testowego wyciekają dane syntetyczne → skala 10× mniejsza |
| logi dostępu do zasobników włączone i trzymane ≥ 90 dni | wiadomo dokładnie, co pobrano (bez tego: zakładasz najgorsze — wszystko) |
| `mdr` / SIEM z logami chmury | alert o pobraniach w sobotę rano |
| plan IR z playbookiem „wyciek u nas jako procesora" + lista kontaktów klientów (IOD!) | zawiadomienia w godziny, nie dni |
| nic | dowiadujesz się w poniedziałek z alertu kosztowego (koparki) albo z maila z żądaniem okupu |

## Przebieg

### Faza 0B — „niemal" (gracz miał skan sekretów)

Piątek 22:10: alert. Rotacja klucza (dyżurny), sprawdzenie logów: klucz nieużyty. Decyzje:
rozmowa z programistą (bez kary — błąd ludzki, system zadziałał), usunięcie starych kluczy
z szerokimi uprawnieniami, zasada „brak długoterminowych kluczy" (role tymczasowe). Lekcja
wygrana za grosze. Koniec scenariusza (krótki debrief).

### Faza 1 — T+0 (poniedziałek 8:30): rachunek i mail

Alert kosztowy chmury (+38 000 zł za weekend) i mail na adres kontaktowy firmy: „Mamy dane
2 mln pacjentów Waszych klientów. 40 BTC w 5 dni albo publikujemy i piszemy do mediów.
Próbka w załączniku."

| Opcja | Koszt | Skutek | Ocena |
|---|---|---|---|
| **Natychmiastowe unieważnienie wszystkich kluczy konta technicznego** i przegląd innych długoterminowych kluczy | 1 h; **ryzyko**: dwa usługi produkcyjne używają tego klucza → 3 h przerwy w aplikacji dla przychodni | zamyka drzwi; przerwa usług | ✅ (przerwa to akceptowalny koszt; zapowiedz ją klientom) |
| Unieważnienie „po godzinach, żeby nie przerywać pracy przychodni" (o 18:00) | 0 h przerwy | napastnik ma 10 h więcej; w 30% wariantów pobiera kolejny zasobnik | ❌ |
| Najpierw ustalić, „czy to prawda" (analiza próbki przez cały dzień) | 6 h | drzwi otwarte | ❌ najpierw zamknij, potem analizuj |
| Zabezpieczenie logów chmury (eksport poza konto, które mogło być naruszone) | 2 h | dowody i zakres | ✅ |

### Faza 2 — T+3 h: zakres

**Co gracz wie (z logami):** pobrano 2 zasobniki (pewne); 312 przychodni (pewne);
2,1 mln rekordów, w tym dane o zdrowiu (pewne). **Bez logów**: „wszystko, do czego klucz
miał dostęp" — 1 900 klientów (najgorszy przypadek musisz założyć).

| Opcja | Ocena |
|---|---|
| **Zawiadomienie klientów-administratorów bez zbędnej zwłoki** (art. 33 ust. 2 RODO; umowy: często 24 h) — **dziś**, z tym, co wiemy, i z kontaktem do zespołu incydentowego | ✅ |
| Head of Sales: „poczekajmy do piątku, aż będziemy wiedzieć wszystko, inaczej stracimy klientów" (karta) | ❌ klienci mają SWOJE 72 h — przez naszą zwłokę złamią prawo; utrata zaufania przy ujawnieniu i tak nastąpi |
| Zawiadomienie tylko „największych" klientów | ❌ |
| **Wczesne ostrzeżenie do CSIRT Cyfra** (podmiot ważny; incydent poważny: skala, dane) | ✅ |
| Zawiadomienie o przestępstwie (CBZC) + przekazanie żądania okupu | ✅ |

### Faza 3 — T+1 dzień: klienci dzwonią

Telefon dzwoni non stop. Klienci (przychodnie) pytają: „Co mamy zrobić? Czy mamy zgłaszać do
UODO? Co powiedzieć pacjentom?"

| Opcja | Ocena |
|---|---|
| **Pakiet dla klientów**: opis incydentu, lista kategorii danych **per klient**, liczba osób per klient, gotowy wzór zgłoszenia do UODO (do wypełnienia przez administratora), wzór zawiadomienia pacjentów, FAQ, dedykowana linia | ✅ (najlepsze, co procesor może zrobić — klienci zdążą w 72 h) |
| „Zgłoszenie zrobimy za Was" | ⚠️ procesor nie zgłasza za administratora — może pomóc, ale decyzja i zgłoszenie należą do klienta |
| Ogólny komunikat bez danych per klient | ⚠️ klienci nie są w stanie ocenić swojej sytuacji |

### Faza 4 — T+3 dni: okup i media

| Opcja | Ocena |
|---|---|
| **Nie płacimy** (brak gwarancji usunięcia, dane i tak mogą wrócić, finansowanie przestępczości, ryzyko sankcji); komunikat publiczny przed publikacją przez przestępców | ✅ |
| Płacimy „żeby chronić pacjentów" | ❌ (debrief: zapłata nie cofa wycieku i nie zwalnia z obowiązków zawiadomień) |
| **Komunikat publiczny**: co się stało, kiedy, kogo dotyczy, co zrobiliśmy (unieważnienie, zawiadomienia, organy), co zmieniamy, kontakt | ✅ |
| Komunikat zrzucający winę na „pracownika, który złamał zasady" | ❌ reputacja i morale; to błąd systemu (klucz długoterminowy, dane produkcyjne w testach, brak skanu sekretów) |

### Faza 5 — T+7 … T+30 dni: naprawa i klienci

| Decyzja | Koszt | Ocena |
|---|---|---|
| **Usunięcie danych produkcyjnych ze środowisk testowych** (dane syntetyczne / zanonimizowane) | 200 h | ✅ najważniejsza lekcja tego incydentu |
| Koniec kluczy długoterminowych; role tymczasowe; zasada najmniejszych uprawnień w chmurze | 120 h | ✅ |
| Skan sekretów w repozytoriach (także prywatnych kont pracowników — polityka) | `cspm` | ✅ |
| Rozmowa z programistą: wsparcie, nie zwolnienie; wspólny przegląd „jak to się mogło stać" | 2 h | ✅ (morale; zgłaszanie błędów) |
| Program dla klientów: raport z incydentu, audyt zewnętrzny, przedłużenie umów z rabatem | 60 tys. zł | ⚠️ zależy od budżetu, poprawia retencję klientów |
| Raport końcowy do CSIRT Cyfra | 8 h | ✅ |

**Zdarzenie T+25 dni**: 3 klientów wypowiada umowy, 1 zapowiada pozew. Kontrola UODO
u Was (jako procesora) i u największego klienta.

## Rubryka (100 pkt)

| Pkt | Za co |
|---|---|
| 15 | natychmiastowe unieważnienie kluczy (mimo przerwy) |
| 5 | zabezpieczenie logów poza naruszonym kontem |
| 20 | zawiadomienie wszystkich klientów tego samego dnia |
| 15 | pakiet per klient (kategorie, liczby, wzory) |
| 10 | CSIRT Cyfra w 24 h |
| 10 | brak okupu + komunikat publiczny przed publikacją przestępców |
| 15 | usunięcie danych produkcyjnych z testów + koniec kluczy długoterminowych |
| 10 | brak obwiniania programisty; analiza systemowa |

## Debrief

- **Bycie dostawcą to bycie ogniwem cudzego bezpieczeństwa.** Twoja zwłoka łamie terminy
  Twoich klientów.
- **Dane produkcyjne w testach** mnożą skutki każdego incydentu. To dług, który „nic nie
  kosztuje", dopóki nie kosztuje wszystkiego.
- **Klucze długoterminowe z szerokimi uprawnieniami** są jak klucz do sejfu pod wycieraczką.
  Boty skanują publiczne repozytoria w sekundy.
- **Najpierw zamknij drzwi, potem licz straty** — nawet kosztem przerwy w usłudze.
- Źródła: wycieki z chmur dostawców oprogramowania (2026) w relacjach mediów; RODO art. 28,
  33 ust. 2; zasady bezpieczeństwa chmury (najmniejsze uprawnienia, krótkotrwałe poświadczenia).

## Pytania do dyskusji

1. Czy Wasze środowiska testowe zawierają prawdziwe dane osobowe?
2. Ile macie kluczy dostępowych starszych niż rok? Kto to wie?
3. Kto w firmie ma prawo zdecydować o przerwie usługi u klientów, żeby zamknąć wyciek?
