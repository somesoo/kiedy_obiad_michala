# 02. Realia polskie — prawo, instytucje, incydenty

Stan wiedzy: **13 października 2026**. Gra ma być „możliwie bliska prawdziwej", więc ten
dokument jest jej fundamentem i **musi być utrzymywany**. Każdy fakt ma status:

- ✅ **potwierdzone** — zgodne w kilku niezależnych źródłach (w tym rządowych lub kancelaryjnych),
- 🟡 **do potwierdzenia w Dz.U.** — źródła wtórne się różnią albo to jedno źródło,
- 🔵 **uproszczenie gry** — świadomie upraszczamy; debrief mówi to wprost.

Zasada: zanim gra pójdzie do ludzi, wszystkie 🟡 sprawdzamy w tekście jednolitym ustawy
(ISAP / eli.gov.pl) i w komunikatach Ministerstwa Cyfryzacji (gov.pl/cyfryzacja, cyber.gov.pl).
To nie jest porada prawna — gra mówi to w stopce każdego ekranu z prawem.

---

## 1. Ustawa o krajowym systemie cyberbezpieczeństwa (KSC) po nowelizacji — wdrożenie NIS2

### Kalendarz (fundament kalendarza kampanii)

| Data | Co | Status |
|---|---|---|
| 23.01.2026 | uchwalenie nowelizacji (ustawa z 23 stycznia 2026) | ✅ |
| 19.02.2026 | podpis Prezydenta | ✅ |
| 2.03.2026 | ogłoszenie, **Dz.U. 2026 poz. 252** | ✅ |
| **3.04.2026** | **wejście w życie** | ✅ |
| **3.10.2026** | koniec 6 miesięcy na **wniosek o wpis do wykazu podmiotów kluczowych i ważnych** (dla tych, którzy spełniali przesłanki w dniu wejścia w życie); kto zaczął spełniać później — 6 miesięcy od spełnienia | ✅ |
| 3.04.2027 | koniec 12 miesięcy na wdrożenie obowiązków (SZBI, środki zarządzania ryzykiem) | ✅ (zgodne źródła) |
| 3.04.2028 | termin **pierwszego audytu** podmiotów kluczowych (24 miesiące) | ✅ |
| od ~4.04.2028 | możliwe administracyjne kary pieniężne za część obowiązków (2 lata „okresu ochronnego") | 🟡 |

**Jak to wchodzi do gry:** kampania startuje w kwietniu 2026 (miesiąc 1) i kończy się w marcu
2028 (miesiąc 24) audytem. Dzisiejsza data realna (październik 2026) wypada w miesiącu 7 —
dokładnie wtedy, gdy minął termin samorejestracji. Scenariusz S11 („Wykaz") gra na tym wprost.

### Kogo dotyczy

- **Samoidentyfikacja**: podmiot sam ocenia, czy jest kluczowy lub ważny (sektor z załączników,
  wielkość przedsiębiorstwa, miejsce świadczenia usług). Wpis do wykazu jest **deklaratoryjny** —
  status wynika z ustawy, a nie z wpisu. ✅ Wniosek składa się przez system **S46**. ✅
- **Progi wielkości (z NIS2)** 🟡 *(zasada unijna, szczegóły do sprawdzenia w ustawie)*: średnie
  przedsiębiorstwo = od 50 osób albo ponad 10 mln EUR obrotu i sumy bilansowej; duże = od 250
  osób albo ponad 50 mln EUR obrotu (43 mln EUR sumy bilansowej). Duże w sektorach z załącznika I
  → zwykle **kluczowe**; średnie w załączniku I oraz średnie i duże w załączniku II → zwykle
  **ważne**. Część podmiotów niezależnie od wielkości (np. administracja publiczna, DNS,
  kwalifikowani dostawcy usług zaufania).
- **Samorządy** 🟡: według źródeł wtórnych sektor „podmioty publiczne" obejmuje JST częściowo —
  na poziomie gminy **urząd gminy od 50 etatów**, na poziomie powiatu starostwo; **szkoły wyłączone**.
  Do potwierdzenia w załączniku nr 1. W grze: gmina zaczyna ze statusem „do ustalenia" — decyzja
  gracza (i jej uzasadnienie) jest częścią oceny.
- **Szacunkowa skala** 🟡: w komercyjnych poradnikach pada ~42 000 firm w 18 sektorach.
  W grze używamy tylko jako tła („jesteś jednym z kilkudziesięciu tysięcy").

### Obowiązki, które gra modeluje

| Obowiązek | Gra | Status |
|---|---|---|
| **SZBI** (system zarządzania bezpieczeństwem informacji): szacowanie ryzyka, środki techniczne i organizacyjne, polityki, ciągłość działania, łańcuch dostaw, przegląd co najmniej raz w roku | kontrola `szbi` + polityki z `05-…`; przegląd roczny jako zadanie cykliczne | ✅ (w zarysie) |
| **Zgłaszanie incydentów poważnych**: wczesne ostrzeżenie do **24 h** od wykrycia, zgłoszenie do **72 h**, sprawozdanie końcowe do **1 miesiąca**; do właściwego CSIRT (sektorowego / NASK / GOV / MON) przez S46 | zegary w trybie incydentu; ocena za terminowość i jakość | ✅ (terminy) / 🟡 (od czego liczy się miesiąc: źródła podają raz „od 24 h", raz „od 72 h" — w grze liczymy **od zgłoszenia 72 h**, debrief to opisuje) |
| **Klasyfikacja**: nie każde zdarzenie jest incydentem poważnym | decyzja „czy to poważny?" z kryteriami (skala, czas, skutki dla usług) — błąd w obie strony kosztuje | ✅ |
| **Szkolenie kierownika**: kierownik podmiotu (i osoba, której powierzył obowiązki) — **raz w roku kalendarzowym**, udokumentowane | zadanie roczne zarządu; brak = ryzyko kary dla kierownika i spadek mandatu | ✅ |
| **Audyt** podmiotu kluczowego: co najmniej raz na 3 lata, pierwszy w ciągu 24 miesięcy; audytor niezależny (nie ten, kto wdrażał SZBI lub obsługiwał incydenty) | finał kampanii (scenariusz S12); niezależność audytora to decyzja (tańszy „swój" audytor = audyt nieważny) | ✅ |
| Podmiot **ważny**: audyt na żądanie organu (np. po poważnym incydencie) | zdarzenie po incydencie | ✅ |
| **Pełnomocnik / punkt kontaktowy** dla organów i CSIRT | rola w zespole; brak = opóźnione zgłoszenia | 🟡 (nazewnictwo w ustawie) |
| **Dostawcy wysokiego ryzyka (DWR)**: minister może uznać dostawcę za DWR; skutek — zakaz wprowadzania nowych produktów, wycofanie istniejących w terminie (utrzymanie dozwolone dla ciągłości) | zdarzenie kampanii (S-zalążek „Decyzja o DWR"); według MC na sierpień 2026 **żaden dostawca nie został jeszcze uznany**; przepisy zaskarżone do TK | ✅ (mechanizm) / 🟡 (stan TK) |
| **Polecenie zabezpieczające** (w sytuacji incydentu krytycznego minister może wydać polecenie) | zdarzenie w scenariuszu energetycznym | 🟡 (procedura) |

### Kary

| Kto | Do ilu | Status |
|---|---|---|
| Podmiot **kluczowy** | do **10 mln EUR** albo **2%** całkowitego rocznego światowego obrotu (wyższa) | ✅ |
| Podmiot **ważny** | do **7 mln EUR** albo **1,4%** obrotu (wyższa) | ✅ |
| **Kierownik podmiotu** (osobiście) | do **300%** wynagrodzenia (art. 73a ust. 4); w podmiotach publicznych do **100%** | 🟡 — wcześniejszy projekt mówił o 600% i ta liczba krąży w publicystyce; nowsze omówienia podają 300% |
| Szczególne naruszenia (np. polecenia zabezpieczające) | w omówieniach pojawia się kwota 100 mln zł | 🟡 |

**W grze:** kara dla kierownika podmiotu to osobny wskaźnik w raporcie końcowym — prezes,
który zignorował szkolenie i odrzucał wnioski, „płaci" z własnej kieszeni. To najmocniejszy
argument mandatowy gracza („Panie prezesie, to dotyczy Pana osobiście").

### CSIRT-y i organy (dokąd gracz zgłasza)

| Zespół | Dla kogo | Status |
|---|---|---|
| **CSIRT NASK** (CERT Polska) | m.in. podmioty prywatne bez CSIRT-u sektorowego, JST, obywatele | ✅ |
| **CSIRT GOV** (ABW) | administracja rządowa, infrastruktura krytyczna, ataki państwowe | ✅ |
| **CSIRT MON** | wojsko i podmioty resortu obrony | ✅ |
| **CSIRT KNF** | sektor finansowy (w grze: bank spółdzielczy — obok DORA) | ✅ |
| **CSIRT CeZ** (Centrum e-Zdrowia) | ochrona zdrowia (w grze: szpital) | ✅ |
| **CSIRT INFRASTRUKTURA** (Ministerstwo Infrastruktury, ustanowiony 30.06.2026) | transport, woda pitna, ścieki (w grze: wodociągi, logistyka) | ✅ |
| **CSIRT Cyfra** (Ministerstwo Cyfryzacji, zarządzenie nr 15 z 30.06.2026) | infrastruktura cyfrowa, usługi ICT B2B (w grze: software house) — zadania od osiągnięcia zdolności operacyjnej | ✅ |
| CSIRT dla energetyki | nie znaleziono potwierdzenia ustanowienia — w grze: energetyka zgłasza do CSIRT NASK, a atak państwowy angażuje CSIRT GOV | 🟡 |
| **CBZC** (Centralne Biuro Zwalczania Cyberprzestępczości) + prokuratura | zawiadomienie o przestępstwie | ✅ |
| **UODO** | naruszenia ochrony danych osobowych | ✅ |

🔵 Gra upraszcza sieć zależności do: „właściwy CSIRT" (jeden na firmę, podany w profilu) +
UODO + policja/CBZC + (dla banku) KNF. Złe skierowanie zgłoszenia kosztuje czas, nie punkty —
tak jak w życiu.

---

## 2. RODO i polska ustawa o ochronie danych

| Fakt | Gra | Status |
|---|---|---|
| Zgłoszenie naruszenia do **Prezesa UODO bez zbędnej zwłoki, do 72 h** od stwierdzenia (art. 33) | zegar równoległy do zegara KSC — to są **dwa różne zgłoszenia** do dwóch instytucji | ✅ |
| Zawiadomienie osób, gdy wysokie ryzyko (art. 34) | decyzja komunikacyjna; brak = kara i reputacja | ✅ |
| Podmiot przetwarzający (procesor) zawiadamia administratora bez zbędnej zwłoki (art. 33 ust. 2) | software house (S05): Twoi klienci mają po Twoim zgłoszeniu 72 h | ✅ |
| Kara do 20 mln EUR / 4% obrotu; dla jednostek sektora finansów publicznych w PL do **100 000 zł** | limit dla szpitala i gminy w silniku | ✅ (limit 100 tys. — ustawa o ochronie danych osobowych z 2018 r.) |
| Spóźnione zgłoszenie jest samo w sobie karane (np. Toyota Bank Polska — 78 tys. zł za zgłoszenie po terminie) | lekcja w debriefie S11 | ✅ (źródło: bank.pl / legiscope — 🟡 data decyzji) |
| Największa kara UODO: Poczta Polska, ponad 27 mln zł (udostępnienie danych z rejestru PESEL) | tło | ✅ |
| UODO: ponad 22 tys. zgłoszeń naruszeń w 2025 r. | tło | 🟡 |
| Kontrole UODO po dużych wyciekach u dostawców (2026) — rachunek ponoszą też administratorzy (przychodnie) | S04 | ✅ (zapowiedź kontroli) |

---

## 3. DORA (sektor finansowy)

| Fakt | Gra | Status |
|---|---|---|
| Rozporządzenie (UE) 2022/2554 stosowane **wprost od 17.01.2025** | kampania bankowa | ✅ |
| Nadzór w PL: **KNF**; zgłoszenia poważnych incydentów ICT przez system KNF | zegar DORA | ✅ |
| Zgłaszane są tylko **poważne** incydenty ICT (klasyfikacja: liczba klientów, czas, zasięg, utrata danych, krytyczność usług, skutki ekonomiczne) | decyzja klasyfikacyjna | ✅ |
| Trzy etapy: zgłoszenie wstępne, raport pośredni, raport końcowy; terminy w rozp. delegowanym 2025/301 — **wstępne do 4 h od klasyfikacji jako poważny, nie później niż 24 h od wykrycia**; pośredni do 72 h; końcowy do miesiąca | zegar „4 h" | 🟡 (terminy z tekstu RTS — zweryfikować) |
| **Rejestr informacji** o umowach z zewnętrznymi dostawcami ICT | zadanie kampanii; dług „rejestr w Excelu" | ✅ |
| **TLPT** (testy penetracyjne pod kątem zagrożeń) dla wskazanych przez KNF | bank spółdzielczy raczej nie jest wskazany — gra to wyjaśnia | ✅ (mechanizm) |
| Polska ustawa o operacyjnej odporności cyfrowej (przepisy krajowe wokół DORA) | status do sprawdzenia | 🟡 |
| Relacja KSC↔DORA: dla sektora finansowego DORA jest *lex specialis* | profil banku: „KSC: nie (DORA)" | 🟡 (szczegóły wyłączeń) |
| Bank spółdzielczy w zrzeszeniu (np. SGB, BPS) korzysta ze wspólnej infrastruktury IT — ryzyko koncentracji | mechanika łańcucha dostaw | ✅ (model biznesowy) |

---

## 4. Sektor publiczny: KRI, Pzp, granty

| Fakt | Gra | Status |
|---|---|---|
| **Krajowe Ramy Interoperacyjności** — rozporządzenie RM z 21.05.2024, **Dz.U. 2024 poz. 773**, w mocy od 23.05.2024 (zastąpiło rozporządzenie z 2012) | wymogi dla gminy; w praktyce JST zlecają audyty „zgodnie z KRI i KSC" | ✅ |
| Wymóg SZBI w KRI (dawniej § 20 z odwołaniem do norm PN-ISO/IEC 27001) | 🟡 — sprawdzić brzmienie w wersji 2024 | 🟡 |
| **Prawo zamówień publicznych**: próg stosowania ustawy **130 000 zł netto**; powyżej — przetarg, tygodnie–miesiące | gmina i szpital: zakup powyżej progu trwa 2–4 miesiące gry (odwołania do KIO jako zdarzenie losowe) | ✅ (próg) / 🔵 (czasy) |
| **Cyberbezpieczny Samorząd** (FERC, środki UE): 2 807 JST uprawnionych (2 477 gmin, 314 powiatów, 16 województw), dla gmin 200–850 tys. zł; umowy podpisane do końca 2024; realizacja do **30.06.2026** | dług gminy: „grant rozliczony sprzętem w kartonach" — rozliczony, ale niewdrożony | ✅ |
| Program dla wodociągów („Cyberbezpieczne Wodociągi") | wspomniany przez ministra; szczegóły nieznane | 🟡 — w grze jako „możliwy nabór", bez kwot |
| Kierownik jednostki sektora finansów publicznych = kierownik podmiotu w rozumieniu KSC | wójt/burmistrz/dyrektor SP ZOZ jako adresat kary | ✅ |

---

## 5. Inne realne mechanizmy, z których gra korzysta

| Mechanizm | W grze | Status |
|---|---|---|
| **KSeF**: obowiązkowy od 1.02.2026 dla dużych (sprzedaż > 200 mln zł), od 1.04.2026 dla pozostałych, od 1.01.2027 dla najmniejszych; do końca 2026 bez kar za błędy | nowe „klucze do królestwa" (uprawnienia/tokeny/certyfikaty KSeF) w biurze rachunkowym i firmach; zmiana wzorców oszustw fakturowych | ✅ (daty) |
| **Biała lista podatników VAT** (wykaz rachunków): płatność > 15 000 zł na rachunek spoza wykazu → brak kosztu podatkowego i solidarna odpowiedzialność za VAT | procedura anty-BEC: weryfikacja w wykazie jako realny, darmowy krok | ✅ |
| **Mechanizm podzielonej płatności** | tło do BEC | ✅ |
| **moje.cert.pl** (CERT Polska): darmowy skan domen skanerem **Artemis**, alerty o wyciekach haseł w domenie, sprawdzenie ochrony **Listą Ostrzeżeń**, widok infrastruktury zewnętrznej; ponad 20 tys. użytkowników | kontrola `moje_cert` za 0 zł — gra ma pokazać, że część rzeczy jest darmowa | ✅ |
| **Kodeks pracy — okres wypowiedzenia**: 2 tygodnie (staż < 6 mies.), 1 miesiąc (do 3 lat), 3 miesiące (od 3 lat) | rekrutacja „senior od zaraz" nie istnieje: 2–4 mies. szukania + do 3 mies. wypowiedzenia | ✅ |
| Narzut pracodawcy na pensję (ZUS itp.) ok. 20% | koszt etatu | ✅ (rząd wielkości) |

---

## 6. Krajobraz zagrożeń — liczby i prawdziwe incydenty (inspiracje scenariuszy)

### Liczby

- **CERT Polska, raport za 2025**: 658 320 zgłoszeń → **260 783 unikalne incydenty** (rekord);
  ok. **97%** to oszustwa komputerowe (phishing, fałszywe inwestycje). ✅ (wzrost r/r — sprzeczne
  liczby w mediach, nie używamy)
- Polska w 2025 r. wysoko w światowych statystykach wykryć ransomware (jedno źródło: 1. miejsce,
  6% globalnych wykryć). 🟡
- Wydatki państwa na cyberbezpieczeństwo w 2026: ponad 5 mld zł (wypowiedź wicepremiera). 🟡

### Incydenty — co się stało i jaki scenariusz z tego robimy

| Kiedy | Co | Lekcja dla gry | Scenariusz |
|---|---|---|---|
| 2023 (grudzień) | **ALAB** (laboratoria): kradzież danych pacjentów, żądanie okupu, publikacja | dane medyczne wyciekają w paczkach, szantaż trwa miesiącami | S02, S04 |
| 2024 (maj) | **PAP** — fałszywy komunikat o mobilizacji opublikowany w serwisie agencji | dezinformacja jako cel ataku | zalążek Z07 |
| 2024 (wrzesień) | **powódź** na południu Polski (Kotlina Kłodzka, Nysa) | serwerownia w piwnicy; BCP i DR to też bezpieczeństwo | zalążek Z12 |
| 2025 (luty–wrzesień) | **stacje uzdatniania wody**: Tolkmicko, Małdyty, Sierakowo, Szczytno, Jabłonna Lacka (raport ABW). Zmiana parametrów (ciśnienie, filtracja), zmiana PIN-ów; przyczyny: **słabe hasła i systemy wystawione do internetu**; w sierpniu 2025 powstrzymana próba wobec wodociągów dużego miasta | OT wystawione do internetu, integrator, brak inwentaryzacji | **S03** |
| 2025 (29 grudnia) | **atak na energetykę**: co najmniej 30 farm wiatrowych i PV, duża elektrociepłownia, firma produkcyjna; zerwana łączność OZE z operatorami; w elektrociepłowni **EDR zatrzymał destrukcję na ponad 100 maszynach**; atrybucja: grupy powiązane z rosyjskim wywiadem (ESET: Sandworm); „byliśmy bardzo blisko blackoutu" (min. cyfryzacji); stawką ciepło dla ~500 tys. osób | wiper w okresie świątecznym, mróz, EDR jako ostatnia linia | **S10** |
| 2026 (styczeń) | ciepłownia w Rucianem-Nidzie — śledztwo prokuratury | małe podmioty też są celem | S10 (wariant) |
| 2026 (marzec) | **fala ransomware w ochronie zdrowia**: Szpital Wojewódzki w Szczecinie (7/8.03, dokumentacja papierowa, pomoc WOT, żądanie okupu w milionach USD wg relacji), Bonifraterskie Centrum Medyczne (13.03), „Eskulap" Racibórz (24.03), Świętokrzyskie Centrum Rehabilitacji (31.03) — 4 ataki w 25 dni | ransomware w szpitalu: procedury papierowe, ciągłość opieki | **S02** |
| 2026 (kwiecień) | **Uniwersytet Warszawski** — dane studentów i pracowników w darknecie, wejście przejętymi danymi logowania | MFA, infostealery | S-zalążek Z03 |
| 2026 | **Fakturownia** — incydent dotyczący wszystkich kont (NIP, adresy, e-maile, w części rachunki/IBAN) | SaaS u dostawcy; BEC na bazie wycieku | **S01** (tło), S04 |
| 2026 (sierpień) | **MyDr** (oprogramowanie EDM dla przychodni): wg kontrolerów UODO ok. **18,8 mln osób** i ponad **12 tys. placówek**; dostęp do infrastruktury chmurowej (AWS); PESEL, kontakty, dane o zdrowiu; śledztwo CBZC i prokuratury; skutki ponoszą też przychodnie jako administratorzy | dostawca SaaS = ryzyko klienta; podmiot przetwarzający | **S04**, **S05** |
| 2026 (sierpień) | **Medyc** (Qbusoft): SQL injection w API aplikacji (22–23.08) | bezpieczeństwo aplikacji u dostawcy | S05 (wariant) |
| 2026 (wrzesień) | **ENEL-MED** — cyberatak zidentyfikowany 24.09, przerwany | wczesne wykrycie | tło |
| 2026 (6 października) | **NFZ** — naruszenie obejmujące dane **11,1 mln osób** | skala w sektorze publicznym | tło |
| 2026 (październik) | wakacje.pl (dane paszportowe), Legimi (dane 183 autorów) | różne skale | tło |
| 2026 (październik) | **„nowa doktryna"** (min. cyfryzacji, Cyber24 Days): państwo będzie pomagać, ale też **publicznie wskazywać firmy, które się nie zabezpieczyły** | mechanika „wskazanie palcem" — reputacja | S-mechanika w `03-…` |

Uwaga etyczna: **żadna z tych organizacji nie występuje w grze z nazwy.** Debrief może
powiedzieć „scenariusz inspirowany atakami na stacje uzdatniania wody w 2025 r. (raport ABW)",
ale nie przypisuje winy i nie odtwarza szczegółów, których nie podano publicznie.

---

## 7. Normy i ramy, na których opieramy model (nie prawo, ale „język branży")

- **NIST CSF 2.0** (2024) — sześć funkcji: Govern, Identify, Protect, Detect, Respond, Recover.
  Gra używa ich jako osi dojrzałości (`10-etapy-rozwoju.md`). Polskie nazwy w grze: Zarządzaj,
  Rozpoznaj, Chroń, Wykrywaj, Reaguj, Odtwarzaj.
- **ISO/IEC 27001:2022** (i polska PN-EN ISO/IEC 27001) — SZBI, załącznik A (93 zabezpieczenia
  w 4 grupach). Certyfikacja jako opcja (wymóg klientów software house'u).
- **ISO 22301** — ciągłość działania.
- **MITRE ATT&CK** — taktyki i techniki ataku; etapy w silniku to uproszczone taktyki.
- **NIST SP 800-61 rev. 3** (2025) — obsługa incydentów, spójna z CSF 2.0 (fazy reagowania w scenariuszach).
- **TISAX** — wymóg klientów motoryzacyjnych (Metalpol).
- **PCI DSS 4.0** — karty płatnicze (SklepMax).
- **IEC 62443** — bezpieczeństwo systemów przemysłowych (wodociągi, fabryka, elektrociepłownia).
- **CIS Controls v8 / IG1** — „higiena" w grze to w przybliżeniu IG1.

---

## 8. Lista kontrolna weryfikacji przed premierą

1. Tekst jednolity KSC po nowelizacji: art. 11 (zgłoszenia — od czego liczy się miesiąc),
   art. 15 (audyt, niezależność), art. 73 i 73a (kary, w tym kierownik: 300% czy inaczej),
   załączniki 1 i 2 (sektory; JST — próg 50 etatów?), przepisy przejściowe (od kiedy kary).
2. Rozporządzenia wykonawcze do KSC (progi incydentu poważnego dla sektorów).
3. KRI 2024 — brzmienie wymogów bezpieczeństwa informacji.
4. DORA: rozporządzenia 2025/301 i 2025/302 — terminy; status polskiej ustawy.
5. Aktualna lista CSIRT-ów sektorowych (energetyka?).
6. Stan postępowania w TK w sprawie dostawców wysokiego ryzyka.
7. Ceny i płace (`06-…`, `data/kontrole.js`) — 3–5 realnych ofert na każdą kategorię.

## Źródła (stan na 13.10.2026; wtórne — do zastąpienia aktami prawnymi)

- ITwiz: „Nowelizacja ustawy o KSC zaczyna obowiązywać — rusza harmonogram wdrożenia NIS2 w Polsce"
- Wolters Kluwer: „NIS2: analiza nowelizacji UKSC 2026, obowiązki i kary"
- Traple Konarski Podrecki: FAQ UKSC; „Wpis do wykazu podmiotów kluczowych i ważnych…"; „Jakie są konsekwencje niedostosowania się do przepisów UKSC"
- LEX: „Wpis do wykazu podmiotów kluczowych i ważnych — obowiązki, terminy, kary po nowelizacji UKSC"
- Grant Thornton: „NIS2 i UKSC — jest podpis Prezydenta: terminy, obowiązki"; „Program Cyberbezpieczny Samorząd"
- gov.pl: „30 czerwca 2026 r. — kolejny krok we wzmacnianiu krajowego systemu cyberbezpieczeństwa" (CSIRT INFRASTRUKTURA); „Ministerstwo Cyfryzacji tworzy CSIRT Cyfra"; „Cyberbezpieczny Samorząd"; „Bezpieczne domeny dzięki narzędziu moje.cert.pl"
- CERT Polska: Raport roczny 2025 (cert.pl/uploads/docs/Raport_CP_2025.pdf); moje.cert.pl
- RISI / The Record / Security Affairs / Łukasiewicz PIT: ataki na stacje uzdatniania wody 2025 (raport ABW)
- Spidersweb, gramwzielone.pl, android.com.pl: atak na energetykę 29.12.2025 (CERT Polska, ESET)
- CyberDefence24, CRN, iMagazine: ataki na szpitale 2026
- mp.pl, Bezprawnik, Demagog, Spidersweb: wyciek MyDr 2026; prawo.pl: Medyc
- Spidersweb (10.2026): „nowa doktryna" — wskazywanie niezabezpieczonych firm
- bank.pl, legiscope.com, nowybiuletyn.uodo.gov.pl: kary i statystyki UODO
- eli.gov.pl: Dz.U. 2024 poz. 773 (KRI)
- legiscope.com, bankoweabc.pl, KNF: DORA w Polsce
- Crowe, KPMG, podatki.biz: KSeF — terminy
- Security Magazine, doradcy365.pl, legalgeek.pl, prostetorodo.pl: kary dla kierownika (300% vs 600%)
