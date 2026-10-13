# 10. Etapy rozwoju

Trzy niezależne osie rozwoju:
1. **Dojrzałość bezpieczeństwa firmy** (etapy 0–5) — to, co gracz buduje,
2. **Rozwój biznesu firmy** — to, co biznes robi „sam", zwiększając powierzchnię ataku
   i zmieniając obowiązki,
3. **Kariera gracza** — między kampaniami.

---

## 10.1. Dojrzałość firmy — sześć etapów

Etap firmy wynika z **poziomów dojrzałości w sześciu funkcjach NIST CSF 2.0** (0–5 każda) —
nie z liczby kupionych narzędzi. Etap = najniższy poziom spośród funkcji „bramowych" dla
danego etapu (nie da się być na etapie 3 z zerowym „Odtwarzaj").

| Funkcja (CSF 2.0) | W grze | Na co patrzy poziom |
|---|---|---|
| **GV — Zarządzaj** | ład, ryzyko, polityki, role, dostawcy, raportowanie | rejestr ryzyk z właścicielami, SZBI, adopcja polityk, rejestr dostawców, szkolenie zarządu |
| **ID — Rozpoznaj** | zasoby, podatności, krytyczność | % znanych zasobów, skanowanie, BIA (krytyczność usług) |
| **PR — Chroń** | tożsamość, łatki, utwardzenie, segmentacja, świadomość | MFA %, SLA łatek, utwardzenie, segmentacja, program świadomości |
| **DE — Wykrywaj** | EDR, logi, SIEM, MDR, NDR | pokrycie EDR, retencja logów, jakość operacji, czas wykrycia |
| **RS — Reaguj** | plan IR, ćwiczenia, retainer, komunikacja | plan, ćwiczenia (ile, z kim), czas reakcji, zgłoszenia w terminie |
| **RC — Odtwarzaj** | kopie, DR, BCP | kopie offline, test odtworzenia (zmierzone RTO), BCP z procedurami ręcznymi |

### Etap 0 — **Gaszenie pożarów** („nikt tego nie robi")

- Typowy stan startowy kampanii (wodociągi, gmina, fabryka).
- Objawy: nieznane zasoby, hasła w Excelu, kopie w tej samej sieci, brak planu, zarząd nie
  wie, że jest podmiotem kluczowym.
- **Odblokowane:** szybkie wygrane (MFA, porządek z ekspozycją, moje.cert.pl, procedura
  płatności, kopia offline), samoidentyfikacja, pierwszy raport dla zarządu.
- **Zablokowane:** wnioski o duże narzędzia (zarząd: „najpierw pokaż, że panujesz nad
  podstawami" — przy niskim mandacie odrzuca SIEM/SOAR/PAM). Gracz może je kupić z bieżącego
  budżetu — gra pozwala, ale ostrzega.

### Etap 1 — **Higiena** („podstawy działają")

- **Brama:** ID ≥ 1 (znane ≥ 85%), PR ≥ 2 (MFA ≥ 90% kont, SLA łatek krytycznych), RC ≥ 1
  (kopia offline + jeden udany test).
- Odpowiada mniej więcej CIS Controls IG1.
- **Odblokowane:** EDR/MDR w pełnej skali, program świadomości, plan IR, rejestr ryzyk.
- **Nagroda gry:** zarząd zaczyna słuchać (mandat +10 jednorazowo po pierwszym raporcie
  z danymi z etapu 1).
- Według symulacji to etap, który **najbardziej obniża straty** w stosunku do kosztu.

### Etap 2 — **Zarządzanie** („wiemy, co robimy i dlaczego")

- **Brama:** GV ≥ 2 (SZBI wdrożony, rejestr ryzyk z właścicielami z biznesu, rejestr dostawców),
  RS ≥ 1 (plan IR + jedno ćwiczenie).
- To jest **minimum zgodności KSC** (termin 3.04.2027 w kampanii = m. 12–13).
- **Odblokowane:** SIEM z sensem (jest proces), ocena dostawców z prawem audytu, polisa cyber
  na dobrych warunkach, ćwiczenia z zarządem.

### Etap 3 — **Wykrywanie i reagowanie** („zobaczymy i zareagujemy")

- **Brama:** DE ≥ 3 (EDR ≥ 95% znanych, logi centralnie ≥ 90 dni, jakość operacji ≥ 0,8 przez
  3 mies. albo MDR), RS ≥ 3 (retainer albo MDR z reagowaniem, ćwiczenia co kwartał, zgłoszenia
  w terminach).
- **Odblokowane:** SOAR, honeypoty, threat intelligence z wymianą (ISAC), pentest wewnętrzny.

### Etap 4 — **Odporność** („nawet gdy padnie, wstaniemy szybko")

- **Brama:** RC ≥ 4 (zmierzone RTO kluczowych usług zgodne z BIA, DR przećwiczony end-to-end),
  PR ≥ 4 (segmentacja, PAM, OT oddzielone), GV ≥ 3 (dostawcy krytyczni z planem B).
- **Odblokowane:** red team, monitoring OT w pełni, strategia wyjścia od dostawców krytycznych.

### Etap 5 — **Proaktywność** („szukamy, zanim nas znajdą")

- **Brama:** wszystkie funkcje ≥ 4, threat hunting regularnie, metryki prowadzą decyzje.
- **Odblokowane:** threat hunting (wykrywa intruzów o niskiej skrytości — APT), deception
  na dużą skalę, „purple team", wpływ na sektor (wystąpienie na konferencji, wymiana z CSIRT).
- Realnie osiągalny w kampanii tylko dla elektrociepłowni i banku (budżet i ludzie).

### Spadek etapu

Dojrzałość **się psuje**: poziom funkcji spada, gdy przestaje być utrzymywany (przegląd SZBI
po terminie, test DR starszy niż 6 mies., odejście kluczowej osoby, wyjątki bez terminów,
shadow IT obniża „znane"). Gra pokazuje to jako „dryf" w raporcie miesięcznym.

### Drzewo „co dalej?" (podpowiedź dla gracza w briefingu)

Gra może podpowiedzieć najsłabszą funkcję i 2–3 najtańsze ruchy, które ją podniosą. W trybie
„ekspert" podpowiedzi są wyłączone.

---

## 10.2. Rozwój biznesu — wzrost zmienia ryzyko i obowiązki

Gracz nie decyduje o biznesie — **biznes decyduje sam**, a gracz dostaje skutki (i czasem
kartę „opinia bezpieczeństwa przed decyzją", której jakość wpływa na skutki). To jest odpowiedź
na „firma w rozbudowie": wzrost to nowe zasoby, nowi ludzie, nowe obowiązki.

| Zdarzenie | Skutek dla gry | Lekcja |
|---|---|---|
| **Przekroczenie progu wielkości** (50 osób / 10 mln EUR → średnia; 250 / 50 mln → duża) | zmiana statusu KSC (np. z „brak" na „ważny"); **6 miesięcy na wpis do wykazu** od spełnienia przesłanek | obowiązki rosną z firmą — trzeba to zauważyć samemu (samoidentyfikacja) |
| **Nowy oddział / zakład** | +zasoby (część poza ewidencją), nowa sieć, lokalny „admin" | rozwój bez bezpieczeństwa = shadow IT |
| **Przejęcie innej firmy (M&A)** | +zasoby o nieznanym stanie, **możliwy intruz w środku** od dnia zero; karta „due diligence bezpieczeństwa przed podpisaniem" | odziedziczone ryzyko (zalążek Z15) |
| **Migracja do chmury** | spadek części ryzyk (łatanie infrastruktury), wzrost innych (konfiguracja, klucze, tożsamość) | współodpowiedzialność (shared responsibility) |
| **Nowy produkt cyfrowy** (aplikacja, e-sklep, API) | wektory podatności i poświadczeń ×1,3; nowe dane osobowe | bezpieczeństwo w projektowaniu |
| **Praca zdalna / hybrydowa** | VPN/dostęp zdalny, urządzenia domowe | dostęp warunkowy, MDM |
| **Wejście na nowy rynek (UE / klient z Niemiec)** | wymóg TISAX / ISO 27001 / klauzule NIS2 w umowach | bezpieczeństwo jako warunek sprzedaży |
| **Wdrożenie AI w procesach** | nowe przepływy danych, ryzyko wycieku i halucynacji w decyzjach | polityka AI, ocena dostawcy |
| **Wejście na GPW / emisja** (sklep, fabryka) | obowiązki informacyjne — incydent może być informacją poufną (MAR) | komunikacja incydentu jako obowiązek wobec rynku 🟡 |
| **Restrukturyzacja / zwolnienia** | ryzyko insidera ×3 na 3 miesiące; presja na budżet | JML i nastroje |
| **Kryzys finansowy firmy** | budżet −30%, odejścia | priorytetyzacja: co utrzymać, co wyłączyć |

---

## 10.3. Kariera gracza (między kampaniami)

| Stopień | Kampanie | Co się zmienia |
|---|---|---|
| **Informatyk z przydziałem** | samouczek, wodociągi, gmina | mały budżet, mało godzin, gracz sam robi wszystko |
| **Specjalista ds. bezpieczeństwa** | sklep, software house | pierwszy zespół, rozmowy z biznesem |
| **Kierownik bezpieczeństwa** | szpital, fabryka | zespół, OT, wiele interesariuszy, kryzysy na skalę miasta |
| **CISO** | bank, elektrociepłownia | regulator branżowy, służby, APT, raport do rady |
| **vCISO dla kilku firm** (tryb końcowy) | 3 mniejsze kampanie równolegle, wspólny czas gracza | priorytetyzacja między klientami, koncentracja ryzyka |

Odblokowanie wyższego stopnia: ukończenie kampanii z indeksem odporności powyżej progu
**i** jakością decyzji powyżej progu (`11-…`). Szczęście nie wystarczy.

**Odznaki** (nie punkty — opisują styl): „Strażnik podstaw" (etap 1 do m. 6), „Zero wyjątków
bez terminu", „Raport, który zrozumiał prezes", „Zgłoszone w 6 h", „Nikt nie stracił pracy
przez zawstydzanie", „Dostawca pod kontrolą", „Spokojny Czarny piątek", „Ciepło nie zgasło".
