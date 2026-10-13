# 04. Narzędzia, procesy i usługi (katalog kontroli)

**Liczby żyją w `data/kontrole.js`.** Ten dokument mówi, co każda kontrola robi „po ludzku",
dlaczego ma takie parametry i jaką pułapkę gra ma pokazać. Kto zmienia liczby w danych,
poprawia opis tutaj (i odwrotnie).

Ceny: PLN netto, poziom 2026, **orientacyjne** (rząd wielkości dla firmy ~250 osób). Przed
premierą — kalibracja na 3–5 realnych ofertach na kategorię (`02-…`, punkt 8).

## 4.1. Jak czytać kontrolę w grze

Każda kontrola ma sześć cech, które gracz widzi na karcie:

1. **Koszt wdrożenia** (PLN + godziny + minimalny czas) i **utrzymania** (PLN/mies. + h/mies.).
2. **Co robi** w modelu ataku: *zapobiega* (dostęp początkowy), *utrudnia* (kolejne etapy),
   *wykrywa* (szansa tygodniowa), *przyspiesza odtworzenie*.
3. **Wymagania** — bez nich działa na 30% (SOAR bez SIEM-a, MDR bez EDR-a, testy DR bez kopii).
4. **Zależność od inwentaryzacji** — chroni tylko znane zasoby.
5. **Alerty** — ile pracy generuje (i czy jest to praca dla nas, czy dla usługodawcy).
6. **Tarcie** — ile przeszkadza ludziom (może być ujemne: SSO).

Na karcie zawsze jest też **„dlaczego to ważne"** (1 zdanie) i **pułapka** (1 zdanie).

## 4.2. Tabela zbiorcza

| Kontrola | CSF | Wdrożenie | Utrzymanie / mies. | Tarcie | Najważniejszy efekt |
|---|---|---|---|---|---|
| MFA dla wszystkich | Chroń | 5 tys. + 80 h | 6 h | 3 | −85% przejęć haseł |
| Klucze FIDO2 (admini, zarząd) | Chroń | 6 tys. + 30 h | 2 h | 1 | odporność na phishing AiTM |
| Utwardzenie (CIS, LAPS, makra) | Chroń | 160 h | 8 h | 3 | eskalacja −35% |
| Porządek z ekspozycją | Chroń | 40 h | 4 h | 1 | usługi wystawione −80% |
| moje.cert.pl | Rozpoznaj | 8 h | 4 h | 0 | darmowy skan i alerty |
| Proces JML | Chroń | 60 h | 10 h | 1 | insider −45% |
| PAM | Chroń | 120 tys. + 200 h | 4 tys. + 16 h | 4 | eskalacja −40%, dostawcy −40% |
| SSO | Chroń | 30 tys. + 120 h | 12 zł/os. + 8 h | **−2** | mniej haseł, jedno odcięcie |
| Inwentaryzacja (CMDB + skan) | Rozpoznaj | 15 tys. + 100 h | 1,5 tys. + 12 h | 0 | odkrywa shadow IT |
| Skaner podatności | Rozpoznaj | 5 tys. + 40 h | 1,8 tys. + 16 h | 0 | podatności −30% |
| Zarządzanie poprawkami | Chroń | 10 tys. + 60 h | 5 zł/stan. + 30 h | 2 | podatności −60% |
| ASM (powierzchnia ataku) | Rozpoznaj | 16 h | 5 tys. + 8 h | 0 | ekspozycja −35% |
| Ochrona poczty (+DMARC) | Chroń | 3 tys. + 40 h | 10 zł/os. + 6 h | 1 | phishing −45%, BEC −30% |
| Świadomość + symulacje | Chroń | 4 tys. + 40 h | 6 zł/os. + 10 h | 1 | phishing −30%, zgłoszenia od ludzi |
| Procedura zmiany rachunku | Chroń | 16 h | 4 h | 1 | **BEC −85% za 0 zł** |
| EDR | Wykrywaj | 5 tys. + 80 h | 25 zł/stan. + 20 h | 1 | utrudnia wszystko, wykrywa 12–40%/tydz. |
| SIEM (komercyjny) | Wykrywaj | 40 tys. + 300 h | 18 tys. + 60 h | 0 | korelacja, ale 45 alertów/100 zasobów |
| SIEM open source | Wykrywaj | 8 tys. + 450 h | 2,5 tys. + 90 h | 0 | jak wyżej, taniej w PLN, drożej w h |
| SOAR | Reaguj | 30 tys. + 200 h | 12 tys. + 20 h | 0 | −50% pracy przy alertach, wymaga SIEM + planu IR |
| MDR / SOC 24/7 | Wykrywaj | 10 tys. + 60 h | 45 zł/stan. (min. 9 tys.) + 10 h | 0 | −85% triage, wykrywanie 24/7, wymaga EDR |
| NDR / IDS | Wykrywaj | 60 tys. + 120 h | 6 tys. + 24 h | 0 | ruch boczny, urządzenia bez agenta |
| Honeypoty | Wykrywaj | 20 tys. + 60 h | 1 tys. + 4 h | 0 | prawie zero fałszywych alarmów |
| Plan IR + playbooki | Reaguj | 80 h | 4 h | 0 | gotowość +0,25 |
| Ćwiczenia z zarządem | Reaguj | 24 h | 8 h | 0 | gotowość +0,2, mandat |
| Retainer DFIR | Reaguj | 8 h | 6 tys. | 0 | gotowość +0,25, gwarantowany przyjazd |
| Kopie 3-2-1-1-0 | Odtwarzaj | 25 tys. + 80 h | 3 tys. + 10 h | 0 | przestój ×0,4 |
| Testy odtworzenia | Odtwarzaj | 40 h | 14 h | 1 | przestój ×0,6 |
| BCP | Odtwarzaj | 100 h | 6 h | 0 | przestój ×0,75 |
| Segmentacja | Chroń | 90 tys. + 300 h | 1 tys. + 12 h | 2 | ruch boczny −50% |
| NGFW | Chroń | 80 tys. + 80 h | 2,5 tys. + 8 h | 1 | ekspozycja −30% |
| WAF + anty-DDoS | Chroń | 2 tys. + 30 h | 4 tys. + 6 h | 0 | DDoS −80% |
| DLP | Chroń | 40 tys. + 160 h | 18 zł/os. + 30 h | **5** | insider −30%, dużo alertów |
| CSPM + sekrety w repo | Chroń | 5 tys. + 60 h | 5 tys. + 12 h | 1 | chmura i klucze |
| Monitoring OT | Wykrywaj | 220 tys. + 160 h | 6 tys. + 16 h | 0 | widzi sterowniki |
| MSP (pakiet godzin) | Zarządzaj | 8 h | 7 tys. | 0 | **+40 h/mies.** |
| vCISO | Zarządzaj | 8 h | 12 tys. + 4 h | 0 | +16 h, mandat |
| SZBI | Zarządzaj | 60 tys. + 400 h | 30 h | 1 | zgodność KSC |
| Szacowanie ryzyka | Zarządzaj | 80 h | 10 h | 0 | zgodność, wiedza |
| Bezpieczeństwo dostawców | Zarządzaj | 120 h | 16 h | 1 | dostawcy −30% |
| Ubezpieczenie cyber | Zarządzaj | 20 h | 5 tys. | 0 | pokrywa 60% szkody do limitu — **jeśli ankieta była prawdziwa** |

## 4.3. Kontrole po kolei — co gra ma pokazać

### Tożsamość (najczęstsze drzwi)

**MFA.** Najtańsza z dużych kontroli. Gra pokazuje trzy realne słabości: *MFA fatigue*
(push bez numeru — użytkownik w końcu klika „zatwierdź"), *SIM swap* (SMS dla prezesa),
*AiTM* (fałszywa strona pośrednicząca kradnie sesję mimo MFA). Odpowiedź: dopasowanie numeru,
FIDO2 dla najważniejszych, polityki dostępu warunkowego. I najtrudniejsze: **wyjątki dla
zarządu** — karta decyzji, która wraca.

**JML (joiner–mover–leaver).** Proces, nie narzędzie. Konto byłego pracownika to jeden
z najczęstszych realnych wektorów w małych firmach i urzędach (scenariusz S07). Kluczowa
zależność: **kadry** — bez spięcia z działem kadr proces nie istnieje.

**PAM.** Drogi, uciążliwy, bardzo skuteczny przeciw ruchowi bocznemu i dostawcom z dostępem
zdalnym. Pułapka: „konto awaryjne" poza PAM-em.

**SSO.** Jedyna kontrola, która **zmniejsza tarcie** — gra nagradza łączenie jej z MFA.

### Zasoby i podatności

**Inwentaryzacja.** Bez niej każda kontrola „na zasobach" ma dziury (`pokrycie = znane × wdrożone`).
To jest mechanika lekcji E4. W debriefie gra pokazuje, ile incydentów przyszło przez zasoby,
których nie było na liście.

**Zarządzanie poprawkami.** Najwięcej godzin w utrzymaniu (30 h/mies. dla ~330 zasobów),
bo to jest prawda: łatanie to praca ciągła, z oknami serwisowymi i negocjacjami z biznesem.
Systemy „nietykalne" (HIS, SCADA, ERP, aparat RTG na Windows 7) — osobne karty z
kompensującymi kontrolami (segmentacja, wirtualne łatanie, monitoring).

**moje.cert.pl.** Realna, darmowa usługa CERT Polska (skaner Artemis, alerty o wyciekach
haseł w domenie, Lista Ostrzeżeń, widok infrastruktury zewnętrznej). Gra celowo stawia ją
**obok** płatnego ASM: gracz, który najpierw sięgnie po darmowe, oszczędza budżet. Raport bez
godzin na przeczytanie nic nie daje — 4 h/mies.

### Poczta i ludzie

**Ochrona poczty.** Sandbox, filtry, DMARC/SPF/DKIM. Pułapka: DMARC latami na `p=none`.

**Świadomość.** Gra rozróżnia **szkolenie zgodnościowe** (raz w roku, test) od **programu**
(krótkie, częste, symulacje, łatwe zgłaszanie, bez zawstydzania). Tylko program daje efekt
*wykrywania* (użytkownicy zgłaszają podejrzane maile → szansa wykrycia na etapie dostępu).
Publiczne zawstydzanie „klikaczy" — karta decyzji, która zabija zgłaszanie.

**Procedura zmiany rachunku.** Najlepszy stosunek efektu do kosztu w całej grze:
oddzwonienie na numer z kartoteki (nie z maila), sprawdzenie w **białej liście VAT**,
zasada dwóch par oczu dla nowych rachunków. Pułapka: prezes, który dzwoni „tym razem bez
procedur". Scenariusze S01 i S08.

### Wykrywanie i reagowanie

**EDR.** Według symulacji **najsilniejsza pojedyncza dźwignia** po higienie — bo działa
także wtedy, gdy nikt nie patrzy (blokuje, izoluje). Realny przykład: w ataku na polską
energetykę 29.12.2025 EDR zatrzymał destrukcję na ponad 100 maszynach elektrociepłowni.
Pułapki: tryb „tylko wykrywaj" po wdrożeniu, wyłączony agent na „wolnym" serwerze, brak
pokrycia na zasobach spoza ewidencji.

**SIEM.** Centralne logi i korelacja. Gra pokazuje dwie prawdy naraz: (1) bez SIEM-a nie
zrekonstruujesz incydentu i nie napiszesz rzetelnego zgłoszenia, (2) SIEM bez ludzi to
**najdroższy sposób na posiadanie logów, których nikt nie czyta**. Pierwsze 3 miesiące — 2×
alertów; strojenie kosztuje godziny. Wariant **open source** (np. Wazuh): licencja 0 zł,
ale 450 h wdrożenia i 90 h/mies. — i ryzyko, że wiedza odejdzie z jedną osobą.

**SOAR.** Automatyzacja playbooków. Wymaga SIEM-a **i** planu IR (bez spisanych procesów
nie ma czego automatyzować). Zdejmuje połowę pracy przy alertach. Dla małej firmy — prawie
zawsze za wcześnie (etap 4+ w `10-…`).

**MDR / SOC jako usługa.** Ktoś patrzy 24/7. Wymaga EDR. Zdejmuje 85% triage. Pułapka: dzwonią
o 3:00 — po Twojej stronie musi ktoś odebrać i **mieć prawo podjąć decyzję** (izolacja serwera
produkcyjnego to decyzja biznesowa). Według symulacji: w firmie średniej daje podobną ochronę
jak własny SOC za ~60% kosztu (patrz `14-…`).

**NDR / IDS.** Widzi to, czego EDR nie widzi (drukarki, IoT, OT, urządzenia sieciowe) —
tylko tam, gdzie ma czujnik.

**Honeypoty / konta-pułapki.** Tanie, prawie bez fałszywych alarmów. Alert z pułapki traktuje
się jak pożar. Dobry ruch „etapu 3–4".

**Plan IR, ćwiczenia, retainer DFIR.** Trzy składniki gotowości. Gra pokazuje typowe
porażki: plan w PDF-ie na zaszyfrowanym serwerze; telefony tylko w Outlooku; zarząd, który
pierwszy raz słyszy pytanie o okup o 2:00 w nocy; firma DFIR bez umowy, która w trakcie fali
ransomware „może przyjechać w czwartek".

### Odtwarzanie

**Kopie 3-2-1-1-0** (3 kopie, 2 nośniki, 1 poza siedzibą, 1 niezmienialna/offline, 0 błędów
w teście). Pułapka: kopia na NAS-ie w tej samej domenie — szyfruje się razem z resztą.
**Testy odtworzenia**: pierwszy test zwykle wykrywa problem — gra nagradza to (lepiej na
teście niż w incydencie). **BCP**: procedury papierowe, priorytety usług, kto decyduje —
to nie jest dokument IT (szpital, wodociągi).

### Sieć, chmura, dane, OT

**Segmentacja.** Drogi projekt, wielka zmiana w skutkach ransomware (ruch boczny −50%).
Pułapka: wyjątek „any-any dla integratora".

**NGFW, WAF/anty-DDoS.** Brzeg. Pułapka: sam firewall/VPN to urządzenie brzegowe z
podatnościami — masowe wykorzystanie podatności w urządzeniach brzegowych to realny wzorzec
lat 2024–2026 (zalążek Z01).

**DLP.** Najwyższe tarcie w katalogu, sens tylko z klasyfikacją danych. Blokuje fakturę,
przepuszcza bazę klientów — jeśli wdrożone bez przygotowania.

**CSPM + skan sekretów.** Chmura i repozytoria. Klucz w publicznym repo żyje sekundy, zanim
znajdzie go bot. Odpowiedź to **rotacja**, nie tylko alert (scenariusz S05).

**Monitoring OT.** Pasywnie, z inżynierem procesu. Aktywne skanowanie sieci OT potrafi
zawiesić sterownik — to karta decyzji w kampanii wodociągów i fabryki.

### Godziny z zewnątrz i zarządzanie

**MSP.** Pakiet godzin od zewnętrznego administratora — w małych firmach często jedyna droga.
Ryzyko: MSP ma uprawnienia u wszystkich klientów naraz (wzorzec Kaseya VSA 2021).

**vCISO.** Ktoś, kto zna przepisy i rozmawia z zarządem, na część etatu.

**SZBI, ryzyko, dostawcy.** Wymagane przez KSC. Dają **zgodność**, a ochronę — pośrednio
(przez lepsze decyzje i mniej niespodzianek). Symulacja pokazuje, że sam papier tnie straty
o kilka procent; to jest lekcja E11 i gra jej nie łagodzi. Pułapka: kupiony komplet „polityk
pod NIS2" bez dowodów stosowania — audyt to wyłapie.

**Ubezpieczenie cyber.** Pokrywa część szkody, **pod warunkiem prawdziwej ankiety** (MFA,
EDR, kopie offline). Kłamstwo w ankiecie = odmowa wypłaty (zdarzenie w trybie incydentu).
Wyłączenia: działania wojenne / ataki państwowe (realny spór w branży) — w kampanii
energetycznej to ma znaczenie.

## 4.4. Zależności (drzewo technologii)

```
inwentaryzacja ──► (pokrycie) EDR, łatki, utwardzenie, skaner
MFA ──► FIDO2, PAM, ubezpieczenie
EDR ──► MDR, ubezpieczenie
kopie ──► testy DR, ubezpieczenie
plan IR ──► ćwiczenia, SOAR
SIEM ──► SOAR, threat hunting (etap 5)
szacowanie ryzyka ──► SZBI (pełne), bezpieczeństwo dostawców
klasyfikacja danych (polityka) ──► DLP
segmentacja ──► monitoring OT ma sens
```

Gracz może kupić kontrolę bez wymagań — gra pozwala, bo w życiu też się da. Karta ostrzega,
a kontrola działa na 30%.

## 4.5. Czego jeszcze brakuje w katalogu (na kolejne iteracje)

- Threat intelligence (płatna vs darmowa: CERT Polska, CSIRT sektorowy, ISAC) i **wymiana
  informacji** (mechanika multiplayer).
- Threat hunting (etap 5; wymaga SIEM + ludzi L3).
- Pentest zewnętrzny / wewnętrzny / red team (jako „zakup wiedzy" — odsłania mgłę wojny).
- Bezpieczeństwo aplikacji (SAST/DAST, przegląd kodu) — kampania software house.
- Zarządzanie urządzeniami mobilnymi (MDM), BYOD.
- Klasyfikacja danych (polityka + narzędzie).
- Szyfrowanie dysków (kradzież laptopa — zalążek).
- Polityka i narzędzia AI (shadow AI — zalążek Z05).
