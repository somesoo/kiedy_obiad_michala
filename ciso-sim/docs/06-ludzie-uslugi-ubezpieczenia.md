# 06. Ludzie, usługi zewnętrzne, ubezpieczenie

## 6.1. Ludzie to najrzadszy zasób

W grze godziny są ważniejsze niż pieniądze, bo **na polskim rynku specjalistów
bezpieczeństwa brakuje**, a rekrutacja trwa miesiącami. Pieniądze można dostać po incydencie
w tydzień — człowieka nie.

### Role

| Rola | Co daje w grze | Uwagi |
|---|---|---|
| **Gracz** (osoba odpowiedzialna: od „informatyka z przydziałem" po CISO) | 60 h/mies. na pracę merytoryczną (reszta to zarząd, spotkania, raporty) | gracz też jest godzinami; nadgodziny gracza kosztują morale całego zespołu |
| **Administrator IT** (dział IT, nie bezpieczeństwa) | godziny „oddawane" bezpieczeństwu (`h_it`) | IT ma swoje priorytety; prośba o więcej godzin to karta decyzji z kosztem mandatu u dyrektora IT |
| **Analityk SOC L1** | 120 h; triage; obsługa alertów | szybko się wypala przy zalewie alertów |
| **Analityk L2 / inżynier bezpieczeństwa** | 120 h; wdrożenia, strojenie, reagowanie | kluczowy dla SIEM, EDR, SOAR |
| **Specjalista GRC** (ryzyko, zgodność, polityki) | 120 h; SZBI, audyty, dostawcy — praca „papierowa" ×1,5 wydajniej | bez niego SZBI zjada godziny inżynierów |
| **Pentester / red team** | zwykle z zewnątrz (zlecenie), rzadko etat | odsłania mgłę wojny |
| **Inżynier OT** (automatyk z wiedzą o bezpieczeństwie) | niezbędny w kampaniach OT | najtrudniejszy do znalezienia |
| **IOD (inspektor ochrony danych)** | wymagany w sektorze publicznym i przy dużej skali danych wrażliwych | może być z zewnątrz |
| **Pełnomocnik ds. cyberbezpieczeństwa / punkt kontaktowy** | kontakt z CSIRT i organem | często gracz sam |

### Płace (koszt miesięczny w grze = brutto UoP × ~1,2 narzutu)

Orientacyjne widełki z ogłoszeń 2026 (źródła wtórne: zestawienia z justjoin.it, No Fluff Jobs,
Bulldogjob; **do kalibracji na raportach płacowych**). Warszawa +20–30%; sektor publiczny
zwykle wyraźnie poniżej rynku.

| Rola | Brutto UoP / mies. | B2B / mies. (orient.) | Koszt w grze |
|---|---|---|---|
| Analityk SOC L1 (0–2 lata) | 8–12 tys. | — | ~12 tys. |
| Analityk L2 / inżynier (3–5 lat) | 15–22 tys. | 20–28 tys. | ~22 tys. |
| Specjalista GRC | 13–20 tys. | 18–25 tys. | ~19 tys. |
| Pentester / red team (3–6 lat) | 18–30 tys. | 22–38 tys. | ~30 tys. |
| Inżynier OT security | 18–28 tys. | 25–35 tys. | ~28 tys. |
| CISO (10+ lat; firma średnia) | 40–80 tys. (korporacje wyżej) | — | ~55 tys. |

Uproszczenie prototypu: `KOSZT_ETATU = 22 000 zł` dla każdego nowego etatu. Silnik gry
rozróżni role.

### Rekrutacja (realne opóźnienia)

```
decyzja ─► szukanie (L1: 1–2 mies., L2/GRC: 2–3, senior/OT: 3–5)
        ─► okres wypowiedzenia kandydata (2 tyg. / 1 mies. / 3 mies. — Kodeks pracy, wg stażu)
        ─► wdrożenie (pierwszy miesiąc: 50% wydajności)
```

- Sektor publiczny: siatka płac → szansa na znalezienie seniora ×0,4. Alternatywy: wspólny
  specjalista z sąsiednią gminą, usługa zewnętrzna, jednostka nadrzędna.
- Mała miejscowość: mniej kandydatów, praca zdalna jako karta (zwiększa pulę, wymaga dostępu
  zdalnego — nowe ryzyko).
- **Podkupowanie**: co kwartał losowanie, czy ktoś z zespołu dostaje ofertę (szansa rośnie
  z rynkową wartością i spadkiem morale). Kontroferta kosztuje budżet; odejście daje 1–3 mies.
  wypowiedzenia na przekazanie wiedzy.
- **Ryzyko jednej osoby**: kontrole z dużą wiedzą ukrytą (SIEM open source, skrypty) mają
  „właściciela" — gdy odchodzi bez dokumentacji, skuteczność spada o 50% do czasu przejęcia.

### Morale i wypalenie

- Nadgodziny (do +30% godzin) → morale −3 pkt za każde 10% ponad normę.
- Dyżury 24/7 w małym zespole (bez MDR) → stały spadek morale; gra pokazuje to jako argument
  za MDR, nie tylko „techniczny".
- Incydent → po zakończeniu karta „dzień wolny / premia / podziękowanie publiczne" (mała
  rzecz, duży efekt na morale) albo „szukanie winnych" (morale −15, zgłaszanie błędów spada).

## 6.2. Usługi zewnętrzne

| Usługa | Koszt (orient.) | Daje | Ryzyko |
|---|---|---|---|
| **MSP** (outsourcing IT) | 5–10 tys./mies. za ~40 h | godziny | dostęp do wszystkich klientów naraz; umowa bez wymagań bezpieczeństwa |
| **vCISO** | 10–25 tys./mies. | ~16 h + zarządzanie, mandat | nie wstanie o 3:00 |
| **MDR / SOC 24/7** | 40–60 zł/stanowisko/mies., minimum ~9 tys. | wykrywanie 24/7, −85% triage | wymaga EDR i decydenta po naszej stronie |
| **Retainer DFIR** | 50–150 tys./rok (godziny przedpłacone) | gwarantowany czas reakcji | bez umowy: 600–900 zł/h, „przyjedziemy w czwartek" |
| **Pentest zewnętrzny** | 25–60 tys. | odsłania podatności (mgła wojny), dowód na audyt | raport bez naprawy nic nie zmienia |
| **Pentest wewnętrzny / red team** | 80–200 tys. | odsłania ścieżki do domeny, testuje wykrywanie | wymaga dojrzałości (etap 4+) |
| **Audyt KSC** (art. 15) | 40–150 tys. | ocena zgodności, wymagany (kluczowe) | audytor nie może być tym, kto wdrażał SZBI |
| **Wdrożenie ISO 27001 + certyfikacja** | 80–200 tys. + 30–60 tys. | zgodność, reputacja, wymóg klientów | certyfikat ≠ bezpieczeństwo |
| **Kancelaria (cyber/RODO)** | 400–900 zł/h | lepsze decyzje w incydencie (zgłoszenia, komunikacja, okup) | — |
| **Firma PR kryzysowego** | 20–80 tys. za kryzys | reputacja | „spin" bez faktów kończy się gorzej |

Darmowe (realne) wsparcie, które gra pokazuje: **CERT Polska** (moje.cert.pl, ostrzeżenia,
pomoc przy incydencie dla podmiotów w jego właściwości), **CSIRT sektorowy**, programy
grantowe (sektor publiczny), wymiana informacji w sektorze (ISAC).

## 6.3. Ubezpieczenie cyber

Mechanika zbudowana na realnych praktykach rynku:

1. **Ankieta** przed polisą: MFA (na poczcie, VPN, kontach admin), EDR, kopie offline, łatanie,
   szkolenia, plan IR. Gracz odpowiada — **może skłamać**. Silnik pamięta prawdę.
2. **Składka** zależy od odpowiedzi i sektora (szpitale i JST drożej, czasem odmowa).
3. **Szkoda**: ubezpieczyciel weryfikuje ankietę. Kłamstwo → odmowa wypłaty (i spór).
   Spóźnione zgłoszenie szkody albo zaangażowanie firmy DFIR spoza listy ubezpieczyciela
   bez zgody → częściowa odmowa.
4. **Wyłączenia**: działania wojenne / ataki państwowe (spór o atrybucję — kampania
   energetyczna), kary administracyjne (zwykle nieubezpieczalne).
5. **Okup**: czy polisa go pokrywa, zależy od umowy — i to jest pytanie etyczno-prawne
   w scenariuszu S02 (sankcje wobec sprawców, brak gwarancji, finansowanie przestępczości).

Lekcja: polisa to element zarządzania ryzykiem (transfer), **nie zastępuje kontroli** — a bez
kontroli nie da się jej uczciwie kupić.
