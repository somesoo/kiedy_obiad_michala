# 01. Wizja i założenia

## Jednym zdaniem

Gracz zostaje osobą odpowiedzialną za cyberbezpieczeństwo w polskiej organizacji (od
gminnych wodociągów po elektrociepłownię) i przez 24 miesiące gry — od wejścia w życie
nowelizacji KSC do pierwszego obowiązkowego audytu — **buduje odporność firmy pod presją
budżetu, ludzi, zarządu, regulatora i prawdziwych w swojej naturze ataków.**

## Dla kogo

1. **Biuro (~15 osób), jak Snakes** — ludzie bez wykształcenia w IT. Mają zrozumieć, *dlaczego*
   dział bezpieczeństwa „przeszkadza", ile to kosztuje i co się dzieje, gdy go nie ma.
2. **IT i administratorzy** — znają narzędzia, nie znają zarządu, prawa i pieniędzy.
3. **Kierownicy i zarządy** — KSC wprost wymaga od kierownika podmiotu corocznego szkolenia
   i nakłada na niego osobistą odpowiedzialność finansową. Gra może być takim „szkoleniem,
   które się pamięta" (do sprawdzenia: czy da się ją uznać za element szkolenia — patrz
   `14-samoewaluacja.md`, pytania otwarte).
4. **Studenci, osoby zmieniające branżę** — gra jako mapa zawodu (role, narzędzia, płace, prawo).

Konsekwencja: **dwa poziomy języka.** Każde pojęcie ma krótkie wyjaśnienie „po ludzku"
(dymek), a szczegół techniczny jest dla chętnych. Nikt nie musi wiedzieć, co to SIEM, żeby
zagrać dobrze — musi zrozumieć, że „centralne logi bez ludzi, którzy je czytają, nic nie dają".

## Cele edukacyjne (co gracz ma wynieść)

Każdy cel ma mechanikę, która go uczy — gra nie mówi tego w tekście, gracz to *przeżywa*.

| # | Cel | Mechanika, która go uczy |
|---|---|---|
| E1 | Bezpieczeństwo to zarządzanie ryzykiem, nie stan „bezpieczny" | ryzyko nigdy nie spada do zera; incydent zdarza się także dobrym graczom; ocena za jakość decyzji, nie za szczęście |
| E2 | Podstawy (MFA, łatki, kopie offline, inwentaryzacja) dają najwięcej za najmniej | symulacja: higiena tnie straty kilkukrotnie za ułamek ceny „dużych" narzędzi |
| E3 | Narzędzie bez ludzi i procesu to ozdoba | **godziny zespołu** jako druga waluta; zmęczenie alertami; abonament płacony, gdy wdrożenie się ślizga |
| E4 | Nie da się chronić tego, o czym się nie wie | **mgła wojny**: shadow IT, nieznane zasoby, kontrole chronią tylko znane |
| E5 | Wcześniejsze wykrycie = tańszy incydent | koszt opanowania rośnie z etapem ataku (8 h vs 120 h + firma DFIR) |
| E6 | Regulacje mają zegary i adresatów | 24 h / 72 h / miesiąc (KSC), 72 h (RODO), 4 h od klasyfikacji (DORA) — tykają w trakcie incydentu |
| E7 | Odpowiedzialność jest osobista, zarząd nie może jej „oddać IT" | mandat zarządu; kara dla kierownika podmiotu; szkolenie zarządu jako obowiązek |
| E8 | Łańcuch dostaw to Twoje ryzyko, choć nie Twój kod | incydenty u dostawców, które spadają na gracza jako administratora danych |
| E9 | Bezpieczeństwo ma koszt dla ludzi (tarcie) | wskaźnik tarcia; za ostre kontrole → shadow IT i bunt; SSO jako kontrola, która tarcie zmniejsza |
| E10 | Komunikacja jest częścią reakcji | decyzje komunikacyjne w incydencie (pracownicy, klienci, media, CSIRT, UODO) mają wagę równą technicznym |
| E11 | Papier ≠ bezpieczeństwo, ale papier też jest wymagany | „polityka na półce" daje punkty zgodności i prawie zero ochrony; audyt pyta o dowody |
| E12 | Ciągłość działania to też bezpieczeństwo | powódź, awaria chmury, wygasły certyfikat — dostępność jako pełnoprawny cel |

## Filary projektu (zasady, których się trzymamy)

1. **Realizm w naturze, kompresja w czasie.** Mechanizmy mają działać jak w rzeczywistości
   (ceny, zegary, okresy wypowiedzenia, zależności), ale gra kompresuje częstotliwość zdarzeń
   (ok. ×3 — 24 miesiące gry niosą ryzyko kilku lat). Bez kompresji w połowie kampanii nic by
   się nie działo. Kompresja jest **jawna** — mówimy o niej w samouczku i w debriefie.
2. **Ocena decyzji, nie wyniku.** Jak w pokerze: dobra decyzja może przegrać z losem. Gra
   zapisuje, co gracz WIEDZIAŁ w chwili decyzji, i ocenia decyzję na tle tej wiedzy
   (`11-ocena-i-debrief.md`). Bez tego gra uczyłaby hazardu albo cynizmu.
3. **Nie ma jednej słusznej strategii.** Symulacja (`proto/`) pilnuje, żeby kilka różnych
   podejść było sensownych, a kilka typowych błędów — kosztownych.
4. **Polskie realia, fikcyjne firmy.** Prawo, organy, CSIRT-y, programy, ceny, płace — polskie
   i aktualne. Firmy i osoby — zmyślone. Prawdziwe incydenty są *inspiracją* scenariusza,
   opisaną w debriefie ze źródłem; nigdy nie przypisujemy w grze winy realnej firmie.
5. **Ukryta informacja jak w życiu.** Nie widzisz całej sieci, nie wiesz, czy dostawca
   kłamie w ankiecie, nie wiesz, czy intruz już jest w środku. Wiedzę się kupuje (inwentaryzacja,
   pentest, audyt, threat hunting) — za pieniądze i godziny.
6. **Szacunek dla gracza.** Żadnych „gotcha" bez szansy: każde zagrożenie ma sygnały, które
   uważny gracz mógł zobaczyć. Debrief zawsze pokazuje, gdzie te sygnały były.
7. **Bezpieczeństwo samej gry.** Gra o bezpieczeństwie z dziurą w logowaniu to kompromitacja.
   Hasła, sesje, limity prób, nagłówki — robione porządnie (`12-architektura-i-reuzycie.md`).

## Czym gra NIE jest

- **Nie jest grą hakerską (CTF).** Gracz nie wpisuje komend i nie łamie haseł. Techniczne
  szczegóły są tłem decyzji, nie zadaniem.
- **Nie jest kursem prawa ani przygotowaniem do certyfikatu.** Upraszcza przepisy tam, gdzie
  trzeba, i mówi o tym wprost. Nie jest poradą prawną.
- **Nie jest reklamą produktów.** Narzędzia są kategoriami (EDR, SIEM), a przykłady produktów,
  jeśli w ogóle, tylko jako ilustracja w dymku — zawsze kilka obok siebie, w tym open source.
- **Nie straszy dla samego straszenia.** Ma pokazać, że da się to robić dobrze.

## Doświadczenie gracza — jak to wygląda w praktyce

**Własne tempo (decyzja właściciela, 13.10.2026).** Nie ma limitu „jeden ruch dziennie"
jak w Snakes: gracz sam zamyka miesiąc, kiedy jest gotowy, i może przejść kampanię w jeden
wieczór albo rozłożyć ją na tygodnie (stan zapisuje się po każdej decyzji). Miesiąc gry to: briefing (wiadomości, ostrzeżenia CERT, prośby biznesu), skrzynkę decyzji i
kalendarz projektów, a na koniec poprzedniego okresu — **raporty innych działów** (co
zrobiły, co planują, jak widzą bezpieczeństwo; `15-…`). Gracz rozdziela budżet i godziny,
odpowiada działom, zatwierdza albo odrzuca wnioski, pisze krótki raport dla zarządu. Kilka razy w kampanii **dzwoni telefon**: incydent przełącza grę
na zegar godzinowy — każda decyzja przesuwa czas, a zegary CSIRT/UODO tykają. Jeden miesiąc
gry ≈ jedna sesja 10–20 minut; incydent ≈ 15–30 minut.

**Odbiorcy na start: biuro** (decyzja właściciela) — kampania pierwsza: wodociągi (`16-…`).

**Multiplayer biurowy (opcjonalny).** Wszyscy gracze żyją w tym samym „krajobrazie
zagrożeń": ta sama fala phishingu, ta sama podatność w VPN-ie, ten sam dostawca SaaS
padający u kilku graczy naraz. Kto zgłosi wskaźniki do wspólnego CSIRT-u/ISAC-a, podnosi
wykrywanie innych (i dostaje za to punkty) — realna lekcja o wymianie informacji. Ranking
nie jest „kto ma więcej pieniędzy", tylko indeks odporności i jakość decyzji.

**Sesja szkoleniowa (tryb prowadzący).** Prowadzący (trener, CISO firmy) odpala scenariusz
dla grupy przy jednym ekranie, grupa głosuje nad decyzjami, a debrief jest rozmową. To jest
tryb dla zarządów — 60–90 minut, jeden scenariusz z `scenariusze/`.

## Najważniejsze decyzje projektowe (i dlaczego)

| Decyzja | Dlaczego |
|---|---|
| Kampania = 24 miesiące, start kwiecień 2026 | dokładnie tyle trwa droga od wejścia w życie nowelizacji KSC (3.04.2026) do terminu pierwszego audytu podmiotów kluczowych (3.04.2028). Kalendarz gry = prawdziwy kalendarz obowiązków. |
| Dwie waluty twarde: **PLN** i **godziny** | w realu ograniczeniem częściej są ludzie niż pieniądze. Jedna waluta pozwoliłaby „kupić bezpieczeństwo". |
| Dwie waluty miękkie: **mandat zarządu** i **tarcie** | bez nich gra nie pokaże polityki: wymuszenie MFA kosztuje zaufanie, a złe raportowanie — budżet na przyszły rok. |
| Rejestry zdarzeń zamiast liczników | jak w Snakes (`sl_points_log`, `sl_boss_payouts`): każdy wpływ na wskaźnik ma wiersz z przyczyną. Debrief i ocena decyzji czytają rejestr, nie przeliczają wzorem. |
| Scenariusze skryptowane + silnik losowy | sama losowość dałaby kampanie nudne albo absurdalne. Każda kampania ma „testy obciążeniowe" (zdarzenia skryptowane z oknem czasowym), których przebieg zależy od przygotowania; między nimi działa silnik losowy. |
| Fikcyjne firmy w prawdziwym kraju | możemy pokazać prawdziwe mechanizmy (S46, CSIRT CeZ, biała lista VAT) bez ryzyka zniesławienia i bez dezaktualizacji, gdy realna firma coś zmieni. |
