# 07. Zagrożenia i model ataku

Liczby: `data/zagrozenia.js`. Implementacja referencyjna: `proto/symulacja.js`.

## 7.1. Etapy ataku (uproszczone taktyki MITRE ATT&CK)

```
  [próba] ──► DOSTĘP ──► ESKALACJA ──► RUCH ──► CEL
             (Initial    (Persistence,  (Lateral   (Impact /
              Access,     Privilege      Movement,  Exfiltration)
              Execution)  Escalation,    Discovery,
                          Cred. Access)  Collection)
```

| Etap | Co to znaczy po ludzku | Koszt opanowania, jeśli wykryjemy tutaj |
|---|---|---|
| **Dostęp** | ktoś ma przyczółek: zainfekowany komputer, przejęte konto | ~5 tys. zł + 8 h (reinstalacja, reset hasła) |
| **Eskalacja** | ma uprawnienia admina na maszynie, wykradł hasła, utrwalił się | ~25 tys. zł + 40 h |
| **Ruch** | chodzi po sieci, zna domenę, wie, gdzie są kopie i dane | ~90 tys. zł + 120 h + zwykle firma DFIR |
| **Cel** | szyfruje, wynosi dane, zmienia nastawy, wysyła przelew | **skutek** (patrz 7.5) |

To jest sedno lekcji E5: ta sama obrona wydana na wcześniejsze wykrycie jest warta wielokrotnie
więcej. Mediana czasu przebywania intruza niewykrytego (dwell time) w raportach branżowych
to ok. 10–11 dni — silnik ma zbliżone tempo dla ransomware (tygodnie od dostępu do celu).

**Nieudane opanowanie** (35% bez gotowości, mniej z planem/retainerem/MDR): myślimy, że
problem zniknął, a intruz zostaje. W grze to jedna z najmocniejszych scen („to ten sam
napastnik, który był tu w marcu").

## 7.2. Wektory dostępu

| Wektor | Przykład z życia | Skala z… | Główne kontrole |
|---|---|---|---|
| **Phishing** | załącznik „faktura", link do fałszywego logowania, QR (quishing) | ludźmi | poczta, świadomość, utwardzenie, EDR, MFA |
| **Poświadczenia** | hasło z infostealera lub wycieku, password spraying na VPN/M365 | ludźmi | MFA, SSO, monitoring wycieków (moje.cert.pl) |
| **Podatność** | aktywnie wykorzystywany błąd w VPN/firewallu/aplikacji | zasobami | łatanie, skaner, ASM, NGFW, WAF |
| **Usługi wystawione** | RDP, panel HMI, kamera, NAS z domyślnym hasłem | zasobami | porządek z ekspozycją, ASM, moje.cert.pl |
| **Dostawca** | zdalny dostęp integratora, zainfekowana aktualizacja, wyciek u SaaS | profilem | dostawcy, PAM, segmentacja |
| **Insider** | były pracownik z aktywnym kontem, pracownik wynoszący bazę | ludźmi | JML, DLP, PAM |
| **BEC** | „zmiana rachunku" od kontrahenta, „pilny przelew" od prezesa (głos/wideo deepfake) | ludźmi | procedura płatności, poczta, świadomość |
| **DDoS** | zalew ruchu, wymuszenie „zapłać albo położymy sklep" | profilem (tylko firmy żyjące z sieci) | WAF / anty-DDoS |

Parametry (λ — próby na miesiąc, p — szansa, że próba da dostęp bez żadnej kontroli) są
dobrane do firmy referencyjnej (~250 osób, ~330 zasobów) w **kompresji czasu** (patrz `03-…`).

## 7.3. Sprawcy

| Sprawca | Zachowanie | Skrytość | Cel | Gdzie częściej |
|---|---|---|---|---|
| **Pospolite złośliwe oprogramowanie** | adware, koparki — hałas | normalna | brak (wygasa: 10%/tydz.) | wszędzie |
| **Broker dostępu / infostealer** | zbiera przyczółki i hasła, **sprzedaje** (2%/tydz. zamienia się w ransomware) | normalna | sprzedaż dostępu | wszędzie |
| **Afiliant ransomware** | szybki: tygodnie od dostępu do szyfrowania; w 60% kradnie dane przed szyfrowaniem (podwójne wymuszenie) | normalna | szyfrowanie (+ wyciek) | produkcja, zdrowie, samorządy |
| **Grupa wymuszająca bez szyfrowania** | kradnie i szantażuje publikacją | 0,9 | wyciek | dane osobowe, SaaS, sklepy |
| **Grupa państwowa (APT)** | wolno, cicho, długo; szpiegostwo i przygotowanie sabotażu | **0,5** | szpiegostwo / sabotaż | energetyka, administracja, dostawcy ICT |
| **Haktywiści** | szybko i głośno; wystawione HMI, DDoS, nagrania na Telegramie | 1,2 (łatwiej ich zobaczyć) | sabotaż „na pokaz" | wodociągi, OT, samorządy |
| **Insider** | zaczyna od etapu „ruch" (ma legalny dostęp) | 0,8 | wyciek | wszędzie |
| **Oszust BEC** | jeden ruch, natychmiastowy skutek | — | przelew | biura rachunkowe, gminy, firmy z dużymi płatnościami |

Profil firmy mnoży wagi sprawców (`data/firmy.js`, pole `sprawcy`). Przykład: wodociągi
×3 haktywiści, energetyka ×4 APT.

**Kampanie świata** (warstwa wspólna dla wszystkich graczy, `09-…`): co jakiś czas silnik
włącza „falę" — np. masowe wykorzystanie podatności w popularnym VPN-ie (podatność ×5 na
4 tygodnie dla firm z tym VPN-em), kampania phishingowa podszywająca się pod KSeF, fala
DDoS haktywistów na samorządy przed wyborami. Fale zapowiadają się w briefingu (ostrzeżenia
CERT) — **uważny gracz ma czas zareagować**.

## 7.4. Wykrywanie

Tygodniowa szansa wykrycia intruza na etapie *e*:

```
P(wykrycie) = min(0,95; [1 − (1 − baza_e) × Π_k (1 − wykrywa_k,e × skut_k × jakość_k)] × skrytość)
skut_k  = ułamek utrzymania × (0,3 jeśli brak wymagań) × (znane zasoby, jeśli kontrola „na zasobach")
jakość_k = jakość operacji (triage) dla narzędzi własnych; 1 dla usług (MDR ma swoich ludzi)
```

Bazowa szansa bez narzędzi: dostęp 5% (antywirus, czujny użytkownik), eskalacja 2%, ruch 4%.

**Źródła wykrycia** w grze mają nazwę (ważne dla debriefu i dla zgłoszeń): „EDR zablokował
proces", „MDR dzwoni", „użytkownik zgłosił maila", „CERT Polska informuje o komunikacji
z serwerem C2 z Waszego IP", „bank pyta o nietypowy przelew", „dziennikarz pyta o dane
na forum", „żądanie okupu na drukarkach". Wykrycie z zewnątrz = zawsze późno i zawsze
kosztuje reputację.

## 7.5. Skutki (kwoty bazowe; silnik skaluje profilem)

| Skutek | Liczy się z | Co modyfikuje |
|---|---|---|
| **Szyfrowanie** | dni przestoju (baza 20) × koszt dnia + odbudowa (150 tys. + 400 zł/zasób) | kopie ×0,4, testy DR ×0,6, BCP ×0,75, segmentacja ×0,7, EDR ×0,8, gotowość −30% |
| **Wyciek** | obsługa 80 tys. + 1 zł/rekord + utrata 1% przychodu + kara UODO (25% szans; 2 zł/rekord, max 4 mln; **JSFP max 100 tys.**) | szybkość zgłoszenia, jakość komunikacji (w trybie incydentu) |
| **Szpiegostwo** | 300 tys. + 1% przychodu (kontrakty, przewaga) | zwykle wykrywane z zewnątrz (CSIRT GOV) |
| **Sabotaż** | 2 dni przestoju + 100 tys.; w OT — **zdarzenie bezpieczeństwa ludzi** (osobna oś oceny) | tryb ręczny, segmentacja, BCP |
| **Wyciek przez insidera** | 150 tys. + 0,5% przychodu | JML, DLP, dowody (sprawa karna) |
| **BEC** | średnio 200 tys. (rozrzut 80–520 tys.) | 20% szans odzysku (+ gotowość), jeśli bank zablokuje szybko — w trybie incydentu decyduje czas zgłoszenia do banku |
| **DDoS** | 12 h przestoju sprzedaży | WAF/anty-DDoS −70% |

Ubezpieczenie odejmuje 60% szkody powyżej 50 tys. (do limitu), jeśli ankieta była prawdziwa.

**Skutki niefinansowe** (osobne osie oceny, nie da się ich „przeliczyć na złotówki"):
- zdrowie i życie (szpital: odwołane zabiegi, przekierowane karetki; wodociągi: jakość wody),
- dostępność usług publicznych (gmina: zasiłki, akty stanu cywilnego; elektrociepłownia: ciepło
  w mrozie),
- zaufanie (reputacja, „wskazanie palcem").

## 7.6. Granice modelu (świadome uproszczenia)

- Każdy intruz to jedna „ścieżka"; brak wielu równoległych technik jednego sprawcy.
- Brak modelowania konkretnych CVE i produktów (świadomie — gra ma się nie starzeć co miesiąc).
- Kontrole działają multiplikatywnie i niezależnie (w życiu bywają skorelowane — np. EDR i MDR
  od tego samego dostawcy mają te same ślepe plamy).
- Brak adaptacji napastnika do obrony (w etapie 5 gry: „napastnik czyta Twoje ogłoszenia
  o pracę i dobiera techniki" — pomysł na później).
- Kwoty skutków to rząd wielkości, nie wycena aktuarialna. Kalibracja: `14-…`.
