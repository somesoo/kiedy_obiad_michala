# Linia Obrony (ciso-sim) — notatki dla Claude

Osobna gra w tym repo: symulator osoby odpowiedzialnej za cyberbezpieczeństwo w polskiej
organizacji. **Nie jest częścią Snakes** — nie importuje niczego z `../server.js` ani `../lib/`
(wzorce się kopiuje, nie współdzieli). Start: `README.md`, potem `docs/01…14`.

Stan: projekt + dane + prototyp Monte Carlo + 12 scenariuszy + rozgrywacz terminalowy.
Silnika gry, serwera i frontu jeszcze **nie ma** (roadmapa: `docs/13-roadmapa.md`).

## Zasady

- **Liczby żyją w `data/*.js`**, dokumenty mówią DLACZEGO. Zmieniasz liczbę — popraw opis
  w `docs/04-…` / `docs/07-…` / `docs/09-…` (jak cennik w regulaminie Snakes).
- **Każdy fakt prawny ma status** w `docs/02-realia-polskie.md`: ✅ potwierdzone, 🟡 do
  potwierdzenia w Dz.U., 🔵 uproszczenie gry. Scenariusz nie może używać faktu prawnego,
  którego tam nie ma. Nie zmieniaj 🟡 na ✅ bez tekstu aktu albo komunikatu organu.
- **Firmy, osoby, produkty w grze są fikcyjne.** Prawdziwe incydenty tylko jako inspiracja
  w debriefie, ze źródłem, bez przypisywania winy.
- **Wszystko po polsku**, komentarze tłumaczą DLACZEGO (jak w całym repo).
- **Mgła wojny**: prawda silnika (`campaign_state`) nigdy nie trafia do frontu — tylko
  oszacowania (`campaign_view`). To jak „atak nie nazywa celu" w Snakes.
- **Rejestr, nie liczniki**: każda zmiana wskaźnika ma wiersz z przyczyną i zrzutem wiedzy
  gracza; debrief i Jakość Decyzji czytają rejestr.
- **Gra o bezpieczeństwie musi być bezpieczna**: logowanie hasłem (scrypt), sesje z
  wygasaniem, limity prób, brak domyślnego hasła admina, hasła nigdy w URL. Nie kopiuj
  `/api/register` ani `checkAdmin` z Snakes (`docs/12-…`, 12.3).
- **Ta gra ma mieć testy** (`node --test` na czystym silniku) — w odróżnieniu od reszty repo.

## Narzędzia

```bash
node ciso-sim/proto/symulacja.js <firma> [N]      # porównanie strategii (Monte Carlo)
node ciso-sim/proto/rozegraj.js S01 [--kontrole=a,b] [--auto=najlepsza|najgorsza]
                                                 # scenariusz w terminalu + walidacja pliku
```

Po zmianie danych: `node --check` na plikach i przebieg symulacji dla 2–3 firm; po zmianie
scenariusza `.dane.js` — `rozegraj.js --auto=najlepsza` (walidator pilnuje, żeby najlepsza
ścieżka dawała dokładnie 100 pkt). Wyniki ważnych przebiegów zapisuj w `proto/wyniki-<data>.txt`
i wnioski w `docs/14-samoewaluacja.md`.

## Kalibracja (stan 13.10.2026)

Firma bez ochrony: ~1,6 poważnego incydentu na 2 lata gry (kompresja czasu ok. ×3 — celowo).
Znany problem: strategia „mała firma" (MSP + higiena + EDR) wygrywa wartością oczekiwaną
prawie wszędzie — przeciwwagi opisane w `docs/14-…`, 14.2. Próg „poważny" = 100 tys. zł
(do zmiany na względny).
