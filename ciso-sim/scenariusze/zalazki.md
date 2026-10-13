# Zalążki scenariuszy (kolejka do rozpisania)

Każdy zalążek ma: firmy, istotę (co się dzieje i jakie jest napięcie), lekcję, kotwicę
w realiach. Rozpisanie = pełny plik w formacie z `README.md`. Kolejność rozpisywania —
wg kampanii, które powstają najpierw (`docs/13-roadmapa.md`).

Oznaczenia: **[skrypt]** — test obciążeniowy kampanii; **[silnik]** — może go wylosować
silnik; **[świat]** — fala w warstwie wspólnej (wielu graczy naraz).

---

### Z01. Zero-day w VPN-ie [świat]
**Firmy:** wszystkie z VPN-em danego producenta. **Istota:** piątek 16:30 — CERT Polska
ostrzega o aktywnie wykorzystywanej podatności w popularnym VPN-ie; łatka jest, ale wymaga
restartu, a 300 osób pracuje zdalnie. Wyłączyć VPN na weekend? Łatać w nocy? I najważniejsze:
**po łatce szukać śladów kompromitacji** (bo napastnicy weszli przed łatką i zostawili
furtki). **Lekcja:** łatka nie usuwa intruza; urządzenia brzegowe to wektor nr 1 ostatnich lat.

### Z02. Credential stuffing [silnik]
**Firmy:** sklep. **Istota:** tydzień przed S06 — powolne testowanie haseł z wycieków;
sygnał w logach, którego nikt nie ogląda. **Lekcja:** sygnały przed dużym incydentem.

### Z03. Infostealer na prywatnym laptopie [silnik]
**Firmy:** wszystkie (wariant uczelni/urzędu). **Istota:** pracownik loguje się do poczty
firmowej z domowego laptopa dziecka; infostealer kradnie sesję i hasło; dane trafiają na
forum; dwa miesiące później ktoś loguje się VPN-em. **Kotwica:** wyciek danych z uczelni
w 2026 r. przez przejęte dane logowania. **Lekcja:** MFA, dostęp warunkowy (tylko urządzenia
zarządzane), monitoring wycieków (moje.cert.pl).

### Z04. „KSeF: wymagana ponowna autoryzacja" [świat]
**Firmy:** biuro (samouczek), wszystkie księgowości. **Istota:** fala phishingu podszywającego
się pod KSeF i Ministerstwo Finansów; strona wyłudza dane do uwierzytelnienia; przestępca
wystawia fałszywe faktury w imieniu firmy. **Kotwica:** obowiązkowy KSeF od 2026 r.
**Lekcja:** nowe systemy = nowe przynęty; uprawnienia KSeF jako „klucze do królestwa".

### Z05. Shadow AI [silnik/skrypt sklep m. 12–16]
**Firmy:** sklep, software house, szpital. **Istota:** marketing wkleja eksport bazy
klientów do publicznego czatu AI „żeby zrobić segmentację"; lekarz wkleja opis przypadku
z danymi. Zakazać? Kupić narzędzie firmowe? **Lekcja:** zakaz bez alternatywy przenosi
problem do prywatnych kont; polityka AI + narzędzie + szkolenie; RODO (przekazanie danych).

### Z06. MFA fatigue [silnik]
**Firmy:** wszystkie z MFA push. **Istota:** pracownik o 23:00 dostaje 40 powiadomień
„zatwierdź logowanie", w końcu klika, żeby przestało. **Lekcja:** dopasowanie numeru,
limity, zgłaszanie dziwnych próśb; MFA to nie koniec drogi.

### Z07. Fałszywy komunikat [świat]
**Firmy:** gmina, wodociągi, elektrociepłownia, fabryka. **Istota:** przejęte konto w mediach
społecznościowych albo deepfake publikuje „komunikat": skażenie wody, zwolnienia grupowe,
ewakuacja. **Kotwica:** fałszywy komunikat opublikowany w serwisie agencji prasowej (2024).
**Lekcja:** dezinformacja jako cel ataku; zabezpieczenie kont komunikacyjnych (MFA, właściciel),
szybkie dementi wieloma kanałami.

### Z08. Kod QR na parkingu [silnik]
**Firmy:** gmina (parkomaty), szpital (parking), sklep. **Istota:** naklejki z fałszywym kodem
QR płatności. **Lekcja:** quishing omija filtry poczty; fizyczne kontrole też są bezpieczeństwem.

### Z09. Skimmer w koszyku [skrypt sklep m. 5–7]
**Firmy:** sklep. **Istota:** skrypt marketingowy z zewnętrznej domeny przejęty → wstrzyknięty
kod kradnie dane kart z formularza. **Lekcja:** łańcuch dostaw front-endu, CSP, integralność
skryptów, PCI DSS 4.0 (wymogi wobec skryptów płatności).

### Z10. Złośliwa biblioteka [skrypt software house m. 13–18]
**Firmy:** software house. **Istota:** popularna biblioteka open source przejęta przez
złośliwego opiekuna; kompilacja z backdoorem trafia do 300 klientów. **Lekcja:** SBOM,
przypinanie wersji, przegląd zależności, odpowiedzialność producenta oprogramowania.

### Z11. Wygasły certyfikat [silnik]
**Firmy:** wszystkie. **Istota:** poniedziałek 8:00 — nie działa e-rejestracja/BIP/sklep,
bo wygasł certyfikat TLS, o którym wiedziała osoba, która odeszła. **Lekcja:** dostępność
to też bezpieczeństwo; inwentaryzacja obejmuje certyfikaty i domeny; ryzyko jednej osoby.

### Z12. Powódź [skrypt / silnik — rzadkie]
**Firmy:** gmina, wodociągi, szpital, fabryka (południe Polski). **Istota:** serwerownia
w piwnicy; woda wchodzi w nocy. **Kotwica:** powódź we wrześniu 2024 r. **Lekcja:** BCP,
DR poza lokalizacją, priorytety usług; bezpieczeństwo informacji ≠ tylko hakerzy.

### Z13. Awaria chmury dostawcy poczty [świat]
**Firmy:** wszystkie. **Istota:** globalna awaria usług pocztowych/tożsamości na 9 godzin.
Nie Twoja wina, Twój problem. **Lekcja:** zależności, kanały awaryjne (lista telefonów na
papierze), komunikacja bez poczty.

### Z14. Kradzież laptopa [silnik]
**Firmy:** wszystkie. **Istota:** laptop kierowniczki kadr skradziony z samochodu. Czy to
naruszenie RODO do zgłoszenia? **Zależy od szyfrowania dysku** (i gdzie są klucze
odzyskiwania). **Lekcja:** szyfrowanie zamienia incydent w drobiazg.

### Z15. Przejęcie z intruzem w środku [skrypt fabryka m. 15–20, wodociągi m. ~10]
**Firmy:** fabryka, wodociągi, sklep. **Istota:** zarząd kupuje mniejszą firmę; gracz dostaje
kartę „due diligence bezpieczeństwa przed podpisaniem" (koszt, czas, opór zarządu). Po
przyłączeniu sieci okazuje się, że w przejętej firmie od miesięcy jest broker dostępu.
**Lekcja:** odziedziczone ryzyko; najpierw ocena i izolacja, potem połączenie.

### Z16. Awaria systemu centralnego [skrypt bank m. 10–14]
**Firmy:** bank spółdzielczy. **Istota:** dostawca systemu centralnego dla kilkudziesięciu
banków ma 14-godzinną awarię (nie atak). DORA: czy to poważny incydent ICT? Klasyfikacja wg
kryteriów, zegar 4 h od klasyfikacji 🟡, komunikacja z klientami (bankomaty, karty).
**Lekcja:** ryzyko koncentracji; DORA dotyczy też awarii, nie tylko ataków; strategia wyjścia.

### Z17. Zakłócanie GPS [świat]
**Firmy:** logistyka (kampania przyszła), elektrociepłownia (synchronizacja czasu), wodociągi
(telemetria). **Istota:** zakłócanie/fałszowanie sygnału GNSS w regionie Bałtyku;
telematyka floty pokazuje statki „na lotnisku", systemy synchronizowane czasem z GPS się
rozjeżdżają. **Lekcja:** zależność od GNSS, alternatywne źródła czasu.

### Z18. Wybory [skrypt gmina m. 10–14]
**Firmy:** gmina. **Istota:** przed wyborami/referendum: DDoS na BIP, fałszywe komunikaty
o zmianie lokali wyborczych, phishing na członków komisji. **Lekcja:** procesy wyborcze
jako cel; współpraca z CSIRT NASK; komunikacja z mieszkańcami.

### Z19. Sabotaż admina przed odejściem [silnik]
**Firmy:** gmina, fabryka. **Istota:** administrator w konflikcie z zarządem zostawia
„bombę logiczną" (zaplanowane usunięcie kopii). **Lekcja:** zasada dwóch par oczu dla kont
uprzywilejowanych, PAM, kopie niezmienialne, offboarding w konflikcie.

### Z20. „Nasza aplikacja zwraca token po samym loginie" [skrypt software house]
**Firmy:** software house. **Istota:** badacz bezpieczeństwa zgłasza, że w aplikacji dla
pacjentów rejestracja istniejącego loginu zwraca token tego konta (przejęcie konta bez
hasła). Jak przyjąć zgłoszenie (polityka ujawniania podatności), jak naprawić, czy były
nadużycia (logi), komu zgłosić. **Kotwica:** ten sam błąd istnieje w grze-matce tego repo
(`/api/register` w Snakes) — „lekcja z własnego podwórka" (`docs/12-…`). **Lekcja:**
odpowiedzialne ujawnianie, security.txt, bezpieczeństwo w projektowaniu.

### Z21. SIM swap prezesa [silnik]
**Firmy:** fabryka, sklep, bank. **Istota:** przestępca przejmuje numer telefonu prezesa
(duplikat karty SIM), odbiera kody SMS do bankowości i poczty. **Lekcja:** SMS to najsłabszy
drugi składnik; klucze FIDO2 dla zarządu.

### Z22. Fałszywy sklep na podobnej domenie [silnik]
**Firmy:** sklep, bank. **Istota:** domena „sklepmax-promocje.pl" z kopią sklepu; klienci
płacą i nic nie dostają; reklamacje do prawdziwego sklepu. **Lekcja:** monitoring domen,
zgłoszenie do Listy Ostrzeżeń CERT Polska, komunikacja z klientami.

### Z23. Kompromitacja MSP [świat]
**Firmy:** biuro, gmina, wodociągi (wszyscy z tym samym MSP w multiplayerze). **Istota:**
napastnik przejmuje narzędzie zdalnego zarządzania MSP i uruchamia ransomware u wszystkich
klientów w piątek wieczorem. **Kotwica:** wzorzec Kaseya VSA (2021). **Lekcja:** dostawca
z uprawnieniami admina u wszystkich to pojedynczy punkt awarii całego rynku.

### Z24. Licencja EDR wygasła [silnik — operacyjne]
**Firmy:** wszystkie z EDR. **Istota:** faktura za odnowienie utknęła w obiegu dokumentów;
agenci przestali się aktualizować 3 tygodnie temu. **Lekcja:** operacje to też umowy,
terminy i właściciele; monitorowanie samych zabezpieczeń.

### Z25. Pentest: admin domeny w 2 godziny [akcja gracza]
**Firmy:** wszystkie. **Istota:** gracz zamawia pentest wewnętrzny; raport pokazuje ścieżkę
do admina domeny w 2 godziny (stare hasło konta usługi, delegacje, drukarka z poświadczeniami).
Co naprawiasz najpierw? **Lekcja:** pentest jako zakup wiedzy (mgła wojny); priorytety.

### Z26. Postępowanie wobec dostawcy wysokiego ryzyka [świat — 30% kampanii]
**Firmy:** wodociągi, gmina, elektrociepłownia, szpital. **Istota:** wszczęto postępowanie
wobec producenta Waszych kamer/routerów/falowników; jeśli decyzja zapadnie — wymiana
w terminie. Ile urządzeń macie? (inwentaryzacja!) **Kotwica:** mechanizm DWR w KSC (🟡 stan
w TK). **Lekcja:** inwentaryzacja i rejestr dostawców jako warunek zgodności.

### Z27. Kopia w transporcie [silnik]
**Firmy:** szpital, gmina. **Istota:** dysk z kopią zapasową przewożony do drugiej lokalizacji
ginie (nieszyfrowany). **Lekcja:** szyfrowanie kopii; kopie to też dane osobowe.

### Z28. Phishing „e-ZLA / P1" i wspólne konta [skrypt szpital m. 2–5]
**Firmy:** szpital, przychodnia. **Istota:** maile podszywające się pod systemy e-zdrowia
i ZUS; lekarze na wspólnym koncie oddziałowym — nie wiadomo, kto kliknął i kto co robił
w systemie. **Lekcja:** rozliczalność (konta imienne), szybkie logowanie (karty/SSO) zamiast
wspólnych kont, szkolenia dla personelu medycznego.

### Z29. „Dzwonię z działu bezpieczeństwa banku" [skrypt bank m. 5–9]
**Firmy:** bank spółdzielczy. **Istota:** fala oszustw na klientach: podszywanie się pod numer
banku (spoofing), „przelej środki na rachunek techniczny". Bank nie jest zaatakowany —
klienci są. **Lekcja:** ochrona klientów jako część bezpieczeństwa i reputacji; komunikacja,
współpraca z operatorami i CERT Polska.

### Z30. Prompt injection w czacie obsługi klienta [silnik — przyszłość]
**Firmy:** sklep, bank. **Istota:** chatbot AI z dostępem do zamówień ujawnia dane innych
klientów po sprytnie sformułowanym pytaniu. **Lekcja:** AI jako nowa powierzchnia ataku;
uprawnienia narzędzi AI, testy, RODO.

### Z31. Skarga pracownika na monitoring [silnik]
**Firmy:** fabryka, sklep. **Istota:** DLP i monitoring poczty wdrożone bez poinformowania
pracowników; skarga do UODO i do inspekcji pracy. **Lekcja:** bezpieczeństwo w granicach
prawa pracy i RODO; tarcie ma też wymiar prawny.

### Z32. Ransomware u biura rachunkowego klienta [silnik]
**Firmy:** fabryka, sklep, gmina. **Istota:** zewnętrzne biuro księgowe/kadrowe (dostawca)
zostaje zaszyfrowane i okradzione; są tam listy płac i PESEL-e Twoich pracowników. **Lekcja:**
S04 w małej skali — umowa powierzenia, zgłoszenie, zawiadomienie pracowników.
