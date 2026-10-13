# 09. Firmy i kampanie

Wszystkie firmy, osoby i miejscowości są **fikcyjne**. Parametry liczbowe: `data/firmy.js`.
Każda kampania ma:
- **profil** (sektor, status KSC, CSIRT, regulacje, ludzie, budżet),
- **dług po poprzedniku** (ukryty stan na start — część widać w briefingu, część trzeba odkryć),
- **postacie** (zarząd i kluczowe osoby — osobowości wpływają na mandat),
- **oś kampanii**: 4–6 **testów obciążeniowych** (zdarzeń skryptowanych z oknem czasowym;
  dokładny miesiąc losuje się w oknie) + **zdarzenia rozwoju biznesu**,
- **warunki dobrego wyniku** (poza indeksem odporności — `11-…`).

Kolejność odblokowywania (ścieżka kariery, `10-…`): samouczek → wodociągi / gmina / sklep →
szpital / fabryka / software house → bank / elektrociepłownia.

---

## 0. Samouczek: Biuro Rachunkowe „Saldo" (30 osób)

**Rola gracza:** współwłaściciel/ka biura, która „zna się na komputerach". Nie ma działu IT,
jest firma z zewnątrz na godziny.

- **Status KSC:** brak (gra to wyjaśnia: nie każdy podlega KSC — ale RODO i tajemnica klientów
  tak). CSIRT: NASK (zgłoszenia dobrowolne).
- **Dług:** wspólne hasło do KSeF i bankowości w Excelu; NAS z kopią w tej samej sieci;
  prezes czyta pocztę na prywatnym telefonie.
- **Kampania: 6 miesięcy** (skrócona). Testy:
  1. (m. 1–2) **S01 „Faktura z nowym numerem konta"** — BEC na płatności klienta.
  2. (m. 3–4) Fałszywy mail „KSeF: wymagana ponowna autoryzacja" (phishing) — zalążek Z04.
  3. (m. 5–6) Ransomware na NAS-ie (jeśli kopie nie są offline — boli).
- **Uczy:** MFA, procedury płatności, kopii offline, że outsourcing godzin (MSP) jest normalny,
  że darmowe rzeczy (moje.cert.pl, biała lista VAT) istnieją.

---

## 1. Wodociągi: PWiK „Wodnik" sp. z o.o. (64 osoby, gmina ~30 tys. mieszkańców)

**Rola gracza:** informatyk na pół etatu, któremu prezes po raporcie ABW (2025) powierza
„wdrożenie tego NIS2".

- **Status KSC:** **kluczowy** (woda pitna). CSIRT: **INFRASTRUKTURA** (od 30.06.2026).
- **Budżet:** 120 tys. zł/rok + możliwy nabór na program dla wodociągów (🟡 kwoty nieznane).
- **Ludzie:** prezes (inżynier sanitarny, pragmatyk, boi się „kompromitacji w gazecie"),
  główna księgowa (CFO-de-facto, liczy każdą złotówkę), kierownik stacji uzdatniania (zna
  SCADA, nie ufa „informatykom"), integrator SCADA „AquaSter" (zewnętrzny, ma swoje dostępy).
- **Dług:** panel HMI stacji wystawiony do internetu przez integratora; PIN do sterowników
  niezmieniony od montażu; jeden informatyk na pół etatu; kopia konfiguracji SCADA tylko na
  laptopie integratora.
- **Oś kampanii:**
  | Okno | Test | Co sprawdza |
  |---|---|---|
  | m. 2–4 | **S03 „Pompa na maksimum"** (haktywiści na HMI) | ekspozycja, OT, tryb ręczny, CSIRT sektorowy |
  | m. 5–7 | Termin samorejestracji (3.10.2026) — **S11 „Wykaz"** | samoidentyfikacja, S46 |
  | m. 8–12 | Awaria zasilania przepompowni + próba phishingu „od integratora" | BCP, weryfikacja dostawcy |
  | m. 12–14 | Termin SZBI (3.04.2027) | zgodność |
  | m. 15–20 | Druga fala haktywistów (DDoS na BOK + próba na przepompownię) | segmentacja, monitoring OT |
  | m. 24 | **S12 „Audyt"** | dowody |
- **Rozwój biznesu:** przejęcie oczyszczalni z sąsiedniej gminy (m. ~10) — nowa sieć OT do
  zintegrowania („przejęcie" — zalążek Z15); inteligentne wodomierze (m. ~16) — nowa
  powierzchnia ataku i dane osobowe.
- **Dobry wynik:** zero zmian parametrów procesu bez wykrycia; HMI poza internetem do m. 3;
  integrator z dostępem przez bramę z MFA i nagrywaniem; plan pracy ręcznej przećwiczony.

---

## 2. Gmina: Urząd Gminy Brzozów Wielki (82 etaty)

**Rola gracza:** informatyk urzędu (jedyny etatowy), z „przydziałem cyber" od sekretarza.

- **Status KSC:** **do ustalenia** (🟡 urząd gminy ≥ 50 etatów — pierwsza decyzja gry).
  CSIRT: **NASK**. Regulacje: **KRI** (Dz.U. 2024 poz. 773), RODO (limit kary 100 tys. zł),
  **Pzp** (zakupy > 130 tys. zł netto = przetarg).
- **Ludzie:** wójt (polityk, myśli kadencją i wyborami), sekretarz gminy (twój przełożony,
  przeciążony), skarbnik (kontrasygnata — anty-BEC!), kierownik USC, radni (komisja budżetowa
  co kwartał — mandat zależy też od nich).
- **Dług:** grant „Cyberbezpieczny Samorząd" rozliczony sprzętem, który leży w kartonach
  (NGFW, serwer kopii) — **realny wzorzec**; konto byłego sekretarza aktywne; drugi informatyk
  z umowy zlecenia, 2 dni w tygodniu, ma dostęp admina z domu.
- **Mechaniki specjalne:** budżet uchwala rada (wniosek = sesja rady, koszt mandatu u wójta);
  **Pzp** opóźnia zakupy (2–4 mies., odwołanie do KIO 10% szans); limit kary UODO dla JSFP;
  kierownik podmiotu = wójt (kara do 100% wynagrodzenia — 🟡).
- **Oś kampanii:**
  | Okno | Test |
  |---|---|
  | m. 1–2 | Decyzja o statusie KSC + rozpakowanie kartonów (wdrożenie sprzętu z grantu) |
  | m. 2–5 | **S01 wariant gminny**: „wykonawca drogi zmienia rachunek" (BEC na fakturę 480 tys. zł) |
  | m. 6–9 | **S07 „Konto byłego pracownika"** (były sekretarz / zleceniobiorca) |
  | m. 10–14 | Wybory (uzupełniające / referendum — zalążek Z18): DDoS na BIP, fałszywe komunikaty |
  | m. 15–20 | Ransomware u dostawcy systemu dziedzinowego dla 40 gmin (S04 wariant) |
  | m. 24 | S12 „Audyt" (KRI + KSC) |
- **Dobry wynik:** sprzęt z grantu działa (nie leży), BEC zatrzymany przez skarbnika, konta
  zgodne z kadrami, ciągłość obsługi mieszkańców przy awarii dostawcy.

---

## 3. Szpital: SP ZOZ w Zalesiu (640 osób, szpital powiatowy)

**Rola gracza:** kierownik działu informatyki (6 osób IT, w tym 1 „od bezpieczeństwa").

- **Status KSC:** **kluczowy**. CSIRT: **CeZ**. Regulacje: RODO (dane szczególnej kategorii),
  dokumentacja medyczna, wyroby medyczne; JSFP (limit kary UODO).
- **Budżet:** 350 tys. zł/rok; kontrakt z NFZ nie rośnie z potrzebami IT; dyrektor ma 20
  innych pilnych wydatków (realne napięcie: rezonans vs EDR).
- **Ludzie:** dyrektor (lekarz-menedżer, chroni ciągłość leczenia), z-ca ds. lecznictwa
  (sprzeciwia się wszystkiemu, co spowalnia lekarzy), naczelna pielęgniarka (sojusznik — zna
  procedury papierowe), dostawca HIS „MediSoft" (zdalny dostęp bez MFA), IOD (zewnętrzny).
- **Dług:** RTG na Windows 7 bez wsparcia producenta; kopia HIS w tej samej domenie;
  TeamViewer dostawcy HIS bez MFA; lekarze dzielą jedno konto na oddziale („bo logowanie
  trwa 40 sekund").
- **Oś kampanii:**
  | Okno | Test |
  |---|---|
  | m. 2–5 | Phishing „e-ZLA / P1" na lekarzy + wspólne konta (zalążek Z28) |
  | m. 4–8 | **S04 „Dostawca, któremu ufaliśmy"** (wyciek u dostawcy EDM) |
  | m. 9–14 | **S02 „Piątek, 23:47"** (ransomware w HIS) — kulminacja |
  | m. 15–20 | Kontrola UODO po S04/S02 + audyt na żądanie organu |
  | m. 24 | S12 „Audyt" |
- **Oś zdrowia** (osobna od pieniędzy): odwołane zabiegi, przekierowane karetki, opóźnione
  wyniki. Gra pokazuje, że w szpitalu **ciągłość opieki** jest celem nadrzędnym i decyzje IT
  się w nią wpisują.
- **Dobry wynik:** procedury papierowe przećwiczone; kopie offline przetestowane (odtworzenie
  HIS < 72 h); zero przekierowań karetek z powodu IT; zgłoszenia w terminach (CeZ + UODO).

---

## 4. Sklep: SklepMax.pl S.A. (140 osób, e-commerce z marketplace'em)

**Rola gracza:** pierwszy „Head of Security" w firmie (po przejęciu sklepu przez fundusz).

- **Status KSC:** **do ustalenia** (internetowa platforma handlowa — marketplace może być
  podmiotem ważnym; sam sklep — nie). To świetna pierwsza decyzja: gracz musi zrozumieć różnicę.
- **Regulacje:** RODO (1,4 mln klientów), PCI DSS (karty — choć płatności przez bramkę),
  DSA (marketplace).
- **Ludzie:** CEO (z funduszu, liczy EBITDA, „bezpieczeństwo to koszt"), CTO (zwolennik
  „ship fast"), Head of Marketing (chce danych i narzędzi AI), fundusz (rada nadzorcza:
  pyta o ryzyko przed sprzedażą spółki — due diligence).
- **Dług:** klucze do chmury w repozytorium sprzed 3 lat; panel admina bez MFA; stara wersja
  sklepu na subdomenie „beta".
- **Oś kampanii:**
  | Okno | Test |
  |---|---|
  | m. 2–4 | Credential stuffing na konta klientów (zalążek Z02) |
  | m. 5–7 | Skimmer JS w koszyku przez skrypt marketingowy (zalążek Z09) |
  | m. 8 (listopad 2026) | **S06 „Czarny piątek"** (DDoS + wymuszenie + credential stuffing) |
  | m. 12–16 | Shadow AI w marketingu (zalążek Z05) |
  | m. 18–22 | **Due diligence** przed sprzedażą spółki (raport ryzyk dla inwestora) |
  | m. 24 | audyt (PCI / ISO zamiast KSC, jeśli nie podlega) |
- **Dobry wynik:** Czarny piątek bez przestoju > 2 h; zero wycieku kart; uczciwy raport
  w due diligence (ukrycie ryzyka = kara przy transakcji).

---

## 5. Software house: Kodex Systems sp. z o.o. (210 osób, SaaS dla przychodni)

**Rola gracza:** CISO w firmie, która jest **dostawcą** dla innych — odwrotna perspektywa
łańcucha dostaw.

- **Status KSC:** **ważny** (usługi zarządzane ICT B2B — 🟡 kwalifikacja). CSIRT: **Cyfra**.
- **Regulacje:** RODO jako **podmiot przetwarzający** (zgłaszanie naruszeń klientom), umowy
  z klientami (część to podmioty kluczowe — przenoszą na Ciebie swoje wymagania), ISO 27001
  (wymóg przetargów).
- **Ludzie:** CEO-założyciel (programista, „u nas nigdy nic się nie stało"), Head of
  Engineering (szybkość dostarczania), Head of Sales (obiecuje klientom wszystko w ankietach
  bezpieczeństwa), DPO, 3 duzi klienci (sieć przychodni, szpital, gmina) z audytami.
- **Dług:** programiści z pełnym dostępem do produkcji; testowa baza = kopia produkcyjna
  z PESEL-ami; jeden klucz API dzielony przez wszystkich klientów.
- **Oś kampanii:**
  | Okno | Test |
  |---|---|
  | m. 1–3 | 40 ankiet bezpieczeństwa od klientów naraz (po fali wycieków 2026) — co odpowiadasz? |
  | m. 4–8 | **S05 „Klucz w repozytorium"** — kulminacja: wyciek z naszej chmury |
  | m. 9–12 | Audyt klienta (szpital — podmiot kluczowy) |
  | m. 13–18 | Kompromitacja biblioteki open source w łańcuchu budowania (zalążek Z10) |
  | m. 19–24 | Certyfikacja ISO 27001 + przetarg wymagający jej |
- **Dobry wynik:** procesor zawiadamia klientów szybko i rzetelnie; brak danych produkcyjnych
  w testach; uczciwe ankiety (Sales vs prawda — karta etyczna).

---

## 6. Fabryka: Metalpol S.A. (450 osób, części dla motoryzacji, Tier-2)

**Rola gracza:** kierownik IT/OT security (nowe stanowisko, wymuszone przez klientów).

- **Status KSC:** **ważny** (produkcja pojazdów — podsektor). CSIRT: **NASK**.
- **Regulacje:** **TISAX** (wymóg niemieckich OEM — utrata certyfikatu = utrata kontraktów),
  umowy z karami za przestój dostaw (just-in-time).
- **Ludzie:** prezes (właściciel rodzinnej firmy, ufa ludziom, nie procedurom), dyrektor
  produkcji (każda minuta przestoju linii to pieniądze — przeciwnik łatania), dyrektor
  finansowy, automatyk-weteran (zna każdy sterownik, nie zna haseł), OEM (klient: audyt TISAX).
- **Dług:** płaska sieć (biuro i linie w jednej podsieci); zdalny serwis producenta maszyn
  przez modem 4G w szafie; admin domeny = konto prezesa.
- **Oś kampanii:**
  | Okno | Test |
  |---|---|
  | m. 2–4 | „Pilny przelew dla nowego dostawcy stali" od prezesa (deepfake głosu) — **S08** |
  | m. 5–8 | Audyt TISAX klienta |
  | m. 9–14 | **S09 „Linia stoi"** (ransomware przez płaską sieć do OT) — kulminacja |
  | m. 15–20 | Przejęcie mniejszej firmy (narzędziownia) — zalążek Z15 |
  | m. 24 | S12 „Audyt" (KSC podmiot ważny — na żądanie, jeśli był incydent) |
- **Dobry wynik:** segmentacja IT/OT przed S09 (linia staje na godziny, nie tygodnie); kary
  umowne zminimalizowane komunikacją z klientem; TISAX utrzymany.

---

## 7. Bank Spółdzielczy Nadwarciański (180 osób)

**Rola gracza:** szef bezpieczeństwa (kierownik komórki bezpieczeństwa), raportujący do
zarządu banku i nadzorowany przez KNF.

- **Status:** **DORA** (KSC — 🟡 lex specialis). CSIRT: **KNF**.
- **Mechaniki specjalne:** **rejestr umów ICT** (DORA) jako wymóg; klasyfikacja incydentu
  wg kryteriów DORA (zegar 4 h od klasyfikacji); **ryzyko koncentracji** — system centralny
  u banku zrzeszającego/dostawcy wspólnego dla kilkudziesięciu banków; rekomendacje KNF;
  oszustwa na klientach (fałszywi „pracownicy banku" — ochrona klientów jako część reputacji).
- **Ludzie:** prezes zarządu (konserwatywny, boi się KNF bardziej niż hakerów), rada
  nadzorcza (spółdzielcy z regionu), compliance officer, dostawca systemu centralnego.
- **Oś kampanii:**
  | Okno | Test |
  |---|---|
  | m. 1–4 | Uzupełnienie rejestru informacji DORA (ujawnia ukrytych podwykonawców) |
  | m. 5–9 | Fala oszustw „na pracownika banku" na klientach (spoofing numeru) |
  | m. 10–14 | **Awaria u dostawcy systemu centralnego** (zalążek Z16 — DORA, klasyfikacja) |
  | m. 15–20 | Przejęcie konta pracownika i próba przelewów wewnętrznych |
  | m. 24 | inspekcja KNF zamiast audytu KSC |

---

## 8. Elektrociepłownia: „Ciepło-Mróz" S.A. (380 osób; kampania zaawansowana)

**Rola gracza:** dyrektor ds. bezpieczeństwa IT/OT w spółce miejskiej z zależną spółką OZE.

- **Status KSC:** **kluczowy**. Zgłoszenia: CSIRT NASK, przy ataku państwowym zaangażowanie
  CSIRT GOV/ABW (🟡 szczegóły właściwości). Infrastruktura krytyczna.
- **Mechaniki specjalne:** **sezon grzewczy** (zimą każda godzina przestoju ma oś „ciepło dla
  ludzi"); APT ×4; **polecenie zabezpieczające** (🟡) jako możliwe zdarzenie; wyłączenie
  wojenne w polisie; współpraca ze służbami (informacje niejawne — gracz dostaje tylko część).
- **Ludzie:** prezes (z nominacji samorządu), dyrektor techniczny (DCS, turbiny), spółka
  OZE (30 farm, mała i zaniedbana), służby (kontakt „który dzwoni, kiedy chce").
- **Dług:** farmy OZE z routerami na domyślnych hasłach; stacja inżynierska OT z dostępem do
  internetu „do aktualizacji".
- **Oś kampanii:**
  | Okno | Test |
  |---|---|
  | m. 3–6 | Rekonesans APT wykryty przez honeypot / NDR (albo niewykryty) |
  | m. 7–9 | Ostrzeżenie służb o kampanii wobec sektora (informacja częściowa) |
  | **m. 9 (grudzień 2026)** | **S10 „Między świętami"** — wiper w IT i OT w okresie świątecznym, mróz |
  | m. 12–18 | Odbudowa, polecenie zabezpieczające, inwestycje (budżet po incydencie) |
  | m. 19–24 | Drugi rekonesans (napastnik wraca), audyt |
- **Dobry wynik:** EDR na wszystkich serwerach przed m. 9 (lekcja z 29.12.2025), segmentacja
  OZE, ciepło bez przerwy > 4 h, rzetelna współpraca z CSIRT.

---

## 9. Warstwa wspólna: świat gry (multiplayer biurowy)

Wszystkie kampanie w jednej rozgrywce biurowej żyją w **jednym świecie**:
- **Kalendarz realny** (terminy KSC, KSeF, sezon grzewczy, Czarny piątek, wybory),
- **Fale**: masowa podatność w VPN, kampania phishingowa „KSeF", fala haktywistów, wyciek
  u popularnego SaaS (ten sam dla kilku graczy),
- **Wymiana informacji**: gracz, który wykrył kampanię i **podzielił się wskaźnikami** (IoC)
  w „ISAC-u" gry, podnosi szansę wykrycia u innych (+ punkty za współpracę). Kto tylko bierze,
  dostaje mniej (reputacja w ISAC-u).
- **Wspólny dostawca**: dwóch graczy z tym samym dostawcą może się skrzyknąć do renegocjacji
  umowy (8.4, punkt 6).
