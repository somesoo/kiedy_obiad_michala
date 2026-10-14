# Scenariusze incydentów

Scenariusz = **tryb operacyjny** gry (zegar godzinowy): coś się dzieje, gracz decyduje pod
presją czasu i niepełnej wiedzy, a zegary regulacyjne tykają. Scenariusz jest **danymi**:
Markdown do czytania i rozgrywki „papierowej", a wersja grywalna to plik
`SNN-nazwa.incydent.js` — **incydent bez drzewa decyzji** (wzorce: `S01-faktura.incydent.js`,
`S03-pompa.incydent.js`; format i walidacja: `proto/incydent.js`, projekt: `docs/18-…`, 18.8).

**Format grywalny (od silnika ruchów).** Nie ma faz z opcjami ✅/⚠️/❌. Plik ma: `start(ctx)`
(stan zależny od tego, co gracz zrobił wcześniej w kampanii), `akcje` (każda: czas, godziny,
koszt, `dostepna(s)` → powód, `efekt(s)` — bez ocen; walidator odrzuca akcję z `ocena`),
`dynamika(s, dt)` (co dzieje się z upływem godzin), `zegary`, `koniec`, `wynik(s)`, **`zasady`**
(ocena praktyki: każda z wagą, celem i „dlaczego"; `tylko_gdy_dzialal` dla zasad „nie rób X")
i `debrief`. Gracz robi akcje w dowolnej kolejności, czeka albo kończy fazę ostrą. Tabele opcji
w plikach `.md` poniżej to materiał do rozgrywki papierowej i źródło zasad, nie klucz odpowiedzi.

Wszystkie firmy, osoby i nazwy produktów w scenariuszach są **fikcyjne**. Inspiracje z
prawdziwych zdarzeń są opisane w debriefie, bez przypisywania winy.

## Indeks

| # | Tytuł | Rodzaj | Firmy | Trudność | Czas gry | Inspiracja |
|---|---|---|---|---|---|---|
| [S01](S01-faktura-z-nowym-numerem.md) (+ [incydent](S01-faktura.incydent.js)) | Faktura z nowym numerem konta | BEC / przejęta skrzynka | biuro, gmina, fabryka, wodociągi | ★ | 3 dni | powszechny wzorzec; wycieki z SaaS fakturowych 2026 |
| [S02](S02-piatek-2347.md) | Piątek, 23:47 | ransomware, ciągłość opieki | szpital | ★★★ | 30 dni | fala ataków na szpitale, marzec 2026 |
| [S03](S03-pompa-na-maksimum.md) (+ [incydent](S03-pompa.incydent.js)) | Pompa na maksimum | OT, haktywiści | wodociągi | ★★ | 10 dni | stacje uzdatniania wody 2025 (raport ABW) |
| [S04](S04-dostawca-ktoremu-ufalismy.md) | Dostawca, któremu ufaliśmy | wyciek u dostawcy SaaS | szpital, przychodnia, gmina | ★★ | 30 dni | wyciek z dostawcy EDM, sierpień 2026 |
| [S05](S05-klucz-w-repozytorium.md) | Klucz w repozytorium | wyciek z chmury, podmiot przetwarzający | software house | ★★★ | 30 dni | wycieki z chmury dostawców 2026 |
| [S06](S06-czarny-piatek.md) | Czarny piątek | DDoS z wymuszeniem + przejęcia kont | sklep | ★★ | 4 dni | wzorce RDoS i credential stuffing |
| [S07](S07-konto-bylego-pracownika.md) (+ [incydent, wariant gminny](S07-konto.incydent.js)) | Konto byłego pracownika | insider, JML | fabryka, gmina, sklep | ★★ | 14 dni | powszechny wzorzec |
| [S08](S08-glos-prezesa.md) | Głos prezesa | deepfake, „na prezesa" | fabryka, sklep, bank | ★ | 2 dni | rosnąca liczba oszustw z klonowaniem głosu |
| [S09](S09-linia-stoi.md) | Linia stoi | ransomware IT→OT, kary umowne | fabryka | ★★★ | 21 dni | ataki ransomware na produkcję |
| [S10](S10-miedzy-swietami.md) | Między świętami | wiper, APT, infrastruktura krytyczna | elektrociepłownia | ★★★★ | 14 dni + epilog | atak na energetykę 29.12.2025 |
| [S11](S11-wykaz.md) | Wykaz | regulacje, etyka, sygnalista | wszystkie podlegające KSC | ★★ | 7 dni | termin wpisu 3.10.2026 |
| [S12](S12-audyt.md) | Audyt | finał kampanii, dowody | wszystkie kluczowe | ★★ | 5 dni | pierwszy audyt KSC do 3.04.2028 |
| [Zalążki](zalazki.md) | ~30 pomysłów do rozpisania | różne | różne | — | — | — |

## Format scenariusza

```
# SNN. Tytuł
Tabela: firmy · rodzaj · trudność · czas gry/realny · zegary · inspiracja · cele (E1–E12 z docs/01)

## Warunki wyzwolenia     — kiedy silnik/kampania odpala scenariusz (skrypt albo wynik silnika)
## Prawda                 — stan ukryty: co się naprawdę stało (gracz NIE widzi do debriefu)
## Stan zależny od przygotowania — jak kontrole/polityki gracza zmieniają przebieg
## Przebieg               — fazy z czasem gry (T+…), w każdej:
     Co gracz wie (fakty z pewnością: pewne / prawdopodobne / plotka)
     Decyzje: tabela | opcja | koszt (czas gry, h, PLN, mandat) | skutek | ocena ✅ ⚠️ ❌ |
## Zegary i obowiązki     — KSC / RODO / DORA / umowy / ubezpieczyciel: kiedy startują
## Komunikacja            — odbiorcy, elementy dobrej wiadomości, pułapki
## Zakończenia            — warianty wyniku i od czego zależą
## Rubryka                — punkty jakości decyzji (sumuje się do 100)
## Debrief                — lekcje, „jak to wygląda w realu", źródła
## Warianty               — różnice per firma
## Pytania do dyskusji    — tryb prowadzący
```

### Konwencje

- **Ocena opcji**: ✅ dobra praktyka · ⚠️ dopuszczalna, z kosztem · ❌ błąd. Rubryka mówi
  DLACZEGO — to idzie do debriefu, więc pisz zdania, które się da przeczytać graczowi.
- **Koszt czasu gry** jest ważny: decyzja „zbierzmy więcej informacji" przesuwa zegary.
- **Pewność faktów**: każdy fakt w „Co gracz wie" ma znacznik — gracz uczy się działać
  na niepełnych danych i aktualizować obraz.
- **Brak „gotcha"**: każdy zły skutek musi mieć sygnał, który można było zauważyć.
- **Prawo**: tylko z `docs/02-realia-polskie.md`; jeśli scenariusz potrzebuje nowego faktu
  prawnego — najpierw dopisz go tam ze statusem weryfikacji.
