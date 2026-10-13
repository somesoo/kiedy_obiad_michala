# 05. Polityki i procedury

## 5.1. Mechanika: polityka ma dwa poziomy

Każdy dokument w grze ma dwa niezależne wskaźniki:

| | **Istnienie** (papier) | **Adopcja** (życie) 0–100% |
|---|---|---|
| Daje | punkty **zgodności** (audyt: „czy jest") | **ochronę** (silnik: kontrole działają × adopcja) i punkty audytu za **dowody** |
| Koszt | godziny napisania + zatwierdzenie przez zarząd (mandat) | komunikacja, szkolenie, egzekwowanie technicznie, przeglądy — godziny ciągłe |
| Spada, gdy | — (papier nie spada) | brak przeglądu, wyjątki bez końca, tarcie bez wyjaśnienia, zmiany w firmie |

**Polityka na półce** = istnieje, adopcja < 30%. Audyt wyłapuje ją pytaniem o dowody
(„pokażcie ostatni przegląd uprawnień", „kto zatwierdził ten wyjątek i do kiedy").

Zakup **gotowego kompletu polityk** („pakiet NIS2 za 9 900 zł") to legalna opcja: szybko
podnosi istnienie, ale adopcja startuje od 5% i dokumenty nie pasują do firmy (np. procedura
odnosi się do działu, którego nie ma) — audytor to zauważy.

## 5.2. Wyjątki

Każda polityka może mieć **wyjątki** (karta decyzji). Wyjątek ma właściciela, uzasadnienie
i **termin**. Wyjątek bez terminu po 6 miesiącach staje się „stałym wyjątkiem" i obniża
adopcję. Rejestr wyjątków to jeden z dowodów na audycie — i jedna z najlepszych lekcji gry:
bezpieczeństwo umiera przez wyjątki, nie przez brak polityk.

## 5.3. Katalog dokumentów (polskie nazwy z praktyki)

Kolumna **„Wymóg"** mówi, skąd w realu bierze się potrzeba dokumentu (nie jest to
wyczerpująca analiza prawna; patrz statusy w `02-…`).

| Dokument | Wymóg | Co włącza w grze | Typowa pułapka |
|---|---|---|---|
| **Polityka bezpieczeństwa informacji** (dokument nadrzędny SZBI) | KSC (SZBI), KRI, ISO 27001 | warunek SZBI; ustala role i zasady akceptacji ryzyka | podpisana przez poprzedni zarząd, nikt jej nie czytał |
| **Metodyka szacowania ryzyka** + **rejestr ryzyk** | KSC, ISO 27001, DORA | kontrola `ryzyko`; ryzyka z właścicielami z biznesu | macierz 5×5, w której wszystko jest „średnie" |
| **Procedura zarządzania incydentami** (z klasyfikacją, eskalacją i zgłaszaniem: CSIRT 24/72 h/miesiąc, UODO 72 h) | KSC, RODO, DORA | kontrola `plan_ir`; skraca czas decyzji w trybie incydentu | brak kryteriów „incydentu poważnego" → zgłoszenie za późno albo wszystko jako poważne |
| **Plan ciągłości działania (BCP)** i **plan odtwarzania (DRP)** | KSC (ciągłość), DORA, ISO 22301 | kontrole `bcp`, `dr_test` | plan bez priorytetów usług i bez procedur papierowych |
| **Polityka kontroli dostępu** (najmniejsze uprawnienia, przeglądy uprawnień) | KSC, ISO 27001, KRI | PAM, przeglądy kwartalne | przegląd uprawnień „wszyscy zatwierdzeni" w 5 minut |
| **Procedura JML** (przyjęcie, zmiana stanowiska, odejście) | ISO 27001, RODO | kontrola `jml` | kadry nie informują IT; konta „na zastępstwo" bez końca |
| **Polityka uwierzytelniania** (MFA, hasła, klucze) | KSC (uwierzytelnianie wieloskładnikowe jako środek), ISO 27001 | warunek MFA dla „wszyscy" | wymuszanie zmiany hasła co 30 dni zamiast MFA (przestarzała praktyka) |
| **Polityka kopii zapasowych** (3-2-1-1-0, RPO/RTO) | KSC, KRI, DORA | kontrole `backup`, `dr_test` | RTO zapisane, nigdy nie zmierzone |
| **Polityka zarządzania podatnościami i poprawkami** (SLA: krytyczne np. 7 dni, brzegowe 72 h) | KSC, ISO 27001 | kontrola `patch` | SLA bez wyjątków dla systemów, których nie da się łatać → fikcja |
| **Polityka bezpieczeństwa dostawców** (+ wzór klauzul umownych, ankieta, prawo audytu, zgłaszanie incydentów, wyjście z umowy) | KSC (łańcuch dostaw), DORA (rejestr umów ICT), RODO (umowy powierzenia) | kontrola `dostawcy`, `08-…` | ankieta 200 pytań, wszystko „tak" |
| **Umowy powierzenia przetwarzania (art. 28 RODO)** | RODO | warunek w kampaniach z danymi; S04/S05 | wzór z internetu bez terminu zgłoszenia naruszenia przez procesora |
| **Rejestr czynności przetwarzania** + **DPIA** dla ryzykownych przetwarzań | RODO | warunek zgodności RODO | rejestr z 2018 r. |
| **Polityka klasyfikacji informacji** | ISO 27001, KRI | warunek sensownego DLP | 5 poziomów, nikt nie oznacza dokumentów |
| **Regulamin korzystania z zasobów IT** (akceptowalne użycie) | prawo pracy, ISO 27001 | podstawa do działań wobec pracownika (S07) | nie podpisany przez nowych pracowników |
| **Polityka pracy zdalnej / urządzeń prywatnych (BYOD)** | ISO 27001 | MDM, VPN, dostęp warunkowy | prezes czyta pocztę na prywatnym telefonie bez blokady |
| **Polityka logowania i monitorowania** (co, ile przechowujemy, kto ma dostęp) | KSC, ISO 27001, RODO (monitoring pracowników — Kodeks pracy) | SIEM ma podstawę i retencję | logi 7 dni; incydent wykryty po 3 tygodniach — nie ma czego analizować |
| **Polityka kryptografii** (szyfrowanie dysków, TLS, klucze) | KSC, ISO 27001 | kradzież laptopa = brak naruszenia RODO, jeśli dysk zaszyfrowany | klucze odzyskiwania w Excelu na pulpicie |
| **Procedura zarządzania zmianą** | ISO 27001, DORA | mniej awarii „własnych" | zmiany w piątek o 16:00 bez planu wycofania |
| **Procedura weryfikacji zmiany rachunku bankowego** | dobre praktyki; biała lista VAT | kontrola `weryfikacja_platnosci` | „tym razem pilne, bez procedur" |
| **Polityka bezpieczeństwa OT** (zdalny dostęp integratorów, zmiany konfiguracji, segmentacja) | KSC (sektory OT), IEC 62443 | kampanie wodociągów, fabryki, elektrociepłowni | „modem 4G w szafie dla serwisu" |
| **Polityka korzystania z narzędzi AI** | RODO, tajemnica przedsiębiorstwa, AI Act (obowiązki wg ról) | zalążek Z05 (shadow AI) | zakaz bez alternatywy → ludzie używają prywatnych kont |
| **Polityka szkoleń i świadomości** (w tym coroczne szkolenie kierownika podmiotu) | **KSC — szkolenie kierownika raz w roku** | kontrola `szkolenia`; zadanie roczne zarządu | szkolenie zarządu „przesunięte na przyszły kwartał" przez cały rok |
| **Plan komunikacji kryzysowej** (kto mówi, do kogo, szablony) | dobre praktyki; KSC/RODO (zawiadomienia) | lepsze decyzje komunikacyjne w incydencie | rzecznik pierwszy raz widzi szablon w trakcie kryzysu |

## 5.4. Procedury operacyjne (playbooki) — gotowe klocki do trybu incydentu

Playbook to procedura dla konkretnego rodzaju incydentu. W grze daje **skrócone czasy
decyzji** i **mniej błędów** w trybie incydentu (np. bez playbooka ransomware gracz musi
w trakcie ustalić, kto decyduje o odłączeniu sieci — kosztuje to 1–3 h gry).

Pierwsza paczka playbooków (odpowiada scenariuszom):
1. Ransomware (izolacja, zachowanie dowodów, decyzja o okupie, odtwarzanie, zgłoszenia)
2. Przejęcie konta pocztowego / BEC (blokada, reguły skrzynki, bank — recall przelewu, policja)
3. Wyciek danych (ustalenie zakresu, RODO 72 h, zawiadomienie osób, monitoring publikacji)
4. Incydent u dostawcy (umowa, informacje od dostawcy, nasze obowiązki jako administratora)
5. DDoS / wymuszenie DDoS
6. Incydent OT (bezpieczeństwo ludzi przede wszystkim, tryb ręczny, integrator, CSIRT sektorowy)
7. Insider / konto byłego pracownika (HR, prawnik, dowody, art. 267 kk)
8. Dezinformacja / podszycie (deepfake, fałszywy komunikat)
9. Podatność aktywnie wykorzystywana (ostrzeżenie CERT → ocena ekspozycji → łatka → **szukanie
   śladów kompromitacji po łatce**)

## 5.5. Jak polityka wpływa na silnik (dla programisty)

- Kontrole typu `proces` z `data/kontrole.js` mają skuteczność × **adopcja** odpowiadającej
  polityki (np. `jml` × adopcja „Procedury JML").
- Adopcja rośnie o `godziny_komunikacji / (ludzie × 0,05)` punktów (do kalibracji), spada o
  2 pkt/mies. bez przeglądu i o `tarcie × 0,5` pkt/mies., gdy tarcie > 50.
- Wyjątki: każdy aktywny wyjątek obniża skuteczność kontroli o udział zasobów/osób, których
  dotyczy (wyjątek „zarząd bez MFA" = 5 osób, ale 30% wartości dla atakującego — waga
  kont uprzywilejowanych ×6).
- Na audycie (S12) dokument ma ocenę: `istnieje` (0/1) × 30% + `adopcja` × 50% + `dowody` × 20%
  (dowody = wpisy w rejestrze: przeglądy, testy, szkolenia, zatwierdzenia wyjątków).
