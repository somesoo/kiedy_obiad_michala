# 08. Łańcuch dostaw — szacowanie ryzyka dostawców

> „Możesz zrobić wszystko dobrze i i tak paść, bo padł ktoś, komu zaufałeś."
> W 2026 r. wyciek z jednego dostawcy oprogramowania dla przychodni dotknął — według
> kontrolerów UODO — ok. 18,8 mln osób i ponad 12 tys. placówek. Każda z nich była
> administratorem danych i każda miała własne obowiązki.

## 8.1. Po co osobna mechanika

W większości gier „dostawca" to tło. Tutaj to pełnoprawny system, bo:
- KSC wymaga zarządzania ryzykiem łańcucha dostaw (część SZBI) i daje państwu narzędzie
  wobec **dostawców wysokiego ryzyka**,
- DORA wymaga **rejestru informacji** o umowach ICT i strategii wyjścia,
- RODO czyni administratora odpowiedzialnym za wybór procesora (art. 28),
- w praktyce małe firmy nie mają siły negocjacyjnej wobec dużych dostawców.

## 8.2. Dostawca w grze

Każda firma ma 8–20 dostawców (lista w profilu kampanii). Dostawca ma:

| Cecha | Widoczna? | Znaczenie |
|---|---|---|
| **Rola** (HIS/EDM, ERP, chmura, MSP, integrator OT, księgowość, poczta, druk, sprzątanie z kartą dostępu…) | tak | |
| **Krytyczność** 1–5 (ile procesów stoi bez niego) | tak (do oceny przez gracza — BIA) | skutek awarii |
| **Dostęp** (brak / dane / zdalny do systemów / uprzywilejowany / fizyczny) | częściowo — „zdalny dostęp integratora" bywa nieudokumentowany | wektor ataku |
| **Dane** (brak / zwykłe / osobowe / szczególnej kategorii / tajemnica) | tak | skutek wycieku, RODO |
| **Zastępowalność** (dni do zmiany dostawcy) | do oceny | strategia wyjścia |
| **Prawdziwy poziom bezpieczeństwa** 0–100 | **nie** | szansa incydentu u dostawcy |
| **Deklarowany poziom** (ankieta) | tak | zwykle zawyżony (+0…+40) |
| **Umowa**: klauzule bezpieczeństwa, termin zgłaszania incydentów, prawo audytu, umowa powierzenia, SLA, wyjście | tak | co możesz wyegzekwować |
| **Podwykonawcy** (dostawcy dostawcy, „4th party") | **nie**, do ujawnienia | ukryta koncentracja |
| **Kraj / powiązania** | tak | ryzyko DWR, sankcje |

## 8.3. Szacowanie ryzyka dostawcy (wzór gry)

```
Ryzyko = Szansa × Skutek

Szansa  = (100 − poziom_dostawcy)/100 × ekspozycja_dostępu × (1 − kontrole_kompensujące)
          ekspozycja_dostępu: brak 0,1 · dane 0,4 · zdalny 0,7 · uprzywilejowany 1,0
          kontrole_kompensujące: PAM, MFA dla dostawcy, segmentacja, nagrywanie sesji, okna dostępu

Skutek  = krytyczność × koszt_dnia × dni_do_zastąpienia
        + wartość_danych × (zwykłe 0,5 · osobowe 1 · szczególne 3 · tajemnica 2) zł/rekord
        + skutki regulacyjne (RODO, KSC — jeśli incydent u dostawcy jest incydentem u nas)
```

Gracz **nie zna** `poziom_dostawcy` — zna przedział. Przedział zawęża się metodami oceny:

| Metoda | Koszt | Zawężenie przedziału | Uwagi |
|---|---|---|---|
| Ankieta (krótka, 20 pytań, ukierunkowana) | 4 h | ±25 | dostawca odpowiada optymistycznie |
| Ankieta „pełna" (200 pytań) | 12 h | ±25 (!) | tyle samo wiedzy co krótka, więcej pracy obu stron — lekcja |
| Prośba o dowody (polityka MFA, raport z pentestu, certyfikat) | 6 h | ±15 | dostawca może odmówić |
| Certyfikat ISO 27001 / raport SOC 2 / TISAX | 2 h (sprawdzenie zakresu!) | ±15 | **zakres certyfikatu** bywa wąski — sprawdzenie zakresu to osobna decyzja |
| Audyt u dostawcy (prawo audytu w umowie) | 20–60 tys. zł + 30 h | ±5 | bez klauzuli w umowie — niemożliwy |
| Monitoring zewnętrzny (ASM dostawcy, wycieki, moje.cert.pl dla jego domen — jeśli dostawca się zgodzi) | 2 h/mies. | ±10 w czasie | wykrywa pogorszenie |
| Incydent u dostawcy | „za darmo" | dokładne | najdroższa metoda |

## 8.4. Decyzje wobec dostawcy

1. **Akceptuj** (zapisane w rejestrze ryzyk, z właścicielem).
2. **Ogranicz dostęp**: PAM, MFA dla kont dostawcy, dostęp „na żądanie" w oknach czasowych,
   nagrywanie sesji, segmentacja. Najczęściej najlepszy stosunek efektu do kosztu.
3. **Renegocjuj umowę**: klauzule (zgłaszanie incydentów w 24 h — żebyś zdążył z własnymi
   72 h; prawo audytu; wymogi MFA/EDR; umowa powierzenia; ubezpieczenie dostawcy; wyjście).
   Siła negocjacyjna zależy od wielkości firmy i rynku dostawcy (mała przychodnia vs duży
   dostawca SaaS — prawie zero).
4. **Plan B**: alternatywny dostawca, procedury ręczne, eksport danych (strategia wyjścia — DORA).
5. **Zmień dostawcę**: koszt migracji, czas, ryzyko migracji.
6. **Wspólne działanie**: kilku klientów razem (np. przychodnie w zrzeszeniu, gminy w związku)
   — większa siła; mechanika multiplayer (gracze z tym samym dostawcą w grze biurowej).

## 8.5. Ryzyko koncentracji

- **Dostawca dla wielu**: jeden SaaS, jeden MSP, jedna chmura, jedno zrzeszenie bankowe —
  incydent dotyka wszystkich naraz. W multiplayerze biurowym gracze mogą mieć tego samego
  dostawcę i zobaczyć to na własnej skórze.
- **Ukryci podwykonawcy**: dostawca HIS korzysta z chmury X i MSP Y; incydent u Y wyłącza
  Twój szpital. Ujawnienie podwykonawców to element ankiety/audytu.
- **Pojedynczy punkt awarii**: jedyny integrator SCADA w regionie, jeden informatyk z umowy
  zlecenia, jedno konto administratora domeny.

## 8.6. Dostawca wysokiego ryzyka (DWR)

Mechanizm KSC: minister może w drodze decyzji uznać dostawcę sprzętu lub oprogramowania za
dostawcę wysokiego ryzyka; podmioty kluczowe i ważne nie mogą wprowadzać nowych produktów
takiego dostawcy i muszą wycofać istniejące w określonym terminie (utrzymanie dozwolone dla
ciągłości). Stan: według MC w sierpniu 2026 żadnej decyzji jeszcze nie wydano; przepisy są
przedmiotem postępowania w TK (🟡, patrz `02-…`).

**W grze**: zdarzenie kampanii (losowe, ok. 30% kampanii) — „wszczęto postępowanie wobec
producenta Waszych kamer / routerów / falowników". Gracz ma:
- policzyć, ile urządzeń ma (wymaga inwentaryzacji!),
- zaplanować wymianę w terminie (budżet, przetarg w sektorze publicznym),
- zarządzać ryzykiem do czasu wymiany (segmentacja, odcięcie od internetu, monitoring).
Gracz z dobrą inwentaryzacją i rejestrem dostawców przechodzi to tanio — bez niej to chaos.

## 8.7. Przykładowe łańcuchy dostaw w kampaniach

| Firma | Krytyczni dostawcy (fikcyjni, typowi) | Pułapka startowa |
|---|---|---|
| Wodociągi | integrator SCADA, dostawca systemu bilingowego, operator telekomunikacyjny (łącza do przepompowni), MSP | integrator ma stały dostęp przez TeamViewer na stacji inżynierskiej |
| Szpital | dostawca HIS, dostawca EDM/PACS, laboratorium zewnętrzne, serwis aparatury, MSP | zdalny dostęp dostawcy HIS bez MFA; laboratorium ma kopię danych pacjentów |
| Gmina | dostawca systemów dziedzinowych (podatki, kadry), ePUAP/obsługa, MSP, firma od strony BIP | jeden dostawca obsługuje 40 gmin w województwie — koncentracja |
| Sklep | chmura, bramka płatności, firma kurierska (API), agencja marketingowa (dostęp do CRM), dostawca czatu | agencja ma konto admina w panelu sklepu |
| Software house | chmura, repozytorium kodu, CI/CD, biblioteki open source, podwykonawcy (freelancerzy B2B) | freelancer z dostępem do produkcji, który już nie pracuje |
| Fabryka | producent maszyn (zdalny serwis), integrator MES, dostawca ERP, OEM (klient wymagający TISAX) | modem 4G producenta maszyn w szafie |
| Bank spółdzielczy | bank zrzeszający / dostawca systemu centralnego, dostawca bankowości internetowej, operator kart | rejestr umów ICT niekompletny; brak strategii wyjścia |
| Elektrociepłownia | producent DCS/SCADA, serwis turbin, operator OZE (spółka zależna), telekom | farmy OZE z routerami na domyślnych hasłach |

## 8.8. Rejestr dostawców — co gracz utrzymuje

Ekran „Dostawcy": lista z krytycznością, dostępem, danymi, oceną (przedział), umową
(klauzule ✓/✗), datą ostatniej oceny, ryzykiem w PLN/rok i decyzją. Rejestr jest jednocześnie:
- dowodem na audycie KSC (S12),
- wymaganym rejestrem informacji (DORA — kampania bankowa),
- wejściem do trybu incydentu (S04: „czy mamy w umowie termin zgłoszenia?").
