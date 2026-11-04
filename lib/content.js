// Teksty i zasady edytowane z panelu admina (Snakes i Wordle), po polsku i po angielsku.
//
// Dawniej regulamin, opis logowania, pasek pod nagłówkiem i stopka były zaszyte w HTML-u,
// więc każda poprawka przecinka wymagała wdrożenia, a godziny gry i cennik Extra Move
// kłamały po każdej zmianie w panelu (patrz „Znane, niezałatane" w CLAUDE.md). Teraz:
//  • domyślna treść każdej sekcji siedzi TUTAJ (DEFAULTS), w obu językach — HTML ma tylko
//    puste miejsce z `data-content="<klucz>"`, więc nie ma dwóch źródeł prawdy,
//  • admin może nadpisać dowolną sekcję w dowolnym języku (tabela content_texts); puste
//    nadpisanie = powrót do domyślnej,
//  • liczby wstawiają się same ze zmiennych `{nazwa}` (godziny, ceny, stawki) — nadpisany
//    tekst też z nich korzysta, więc nie zaczyna kłamać po zmianie ustawień.
//
// Format to mały, BEZPIECZNY markdown: najpierw całość jest escapowana, dopiero potem
// zamieniamy znaczniki na tagi z zamkniętej listy. Admin nie wstawi więc żadnego HTML-a —
// to ważne, bo strona gry i panel żyją pod jednym adresem (tokeny graczy w localStorage).
//
// Fabryka jak reszta modułów: zmienne podaje server.js funkcjami (czytamy je przy każdym
// żądaniu, bo okno gry zmienia się w panelu bez restartu).

module.exports = function createContentModule(deps) {
  const { app, db, checkAdmin, snakesVars, wordleVars } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_texts (
      key        TEXT NOT NULL,
      lang       TEXT NOT NULL,
      body       TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (key, lang)
    );
  `);

  const LANGS = ['pl', 'en'];

  // ── SEKCJE ──
  // `inline` = sekcja siedzi w elemencie liniowym albo w <p> (pasek, stopka, opis logowania,
  // wstęp) — bez własnych <p>, akapity rozdziela <br>. `list_class` / `item_span` odtwarzają strukturę bocznej listy Wordle
  // (style.css: .info-list li > span). `markers` = znaczniki [[…]] wolne w tej sekcji.
  const SECTIONS = [
    {
      key: 'snakes.ribbon', game: 'snakes', inline: true,
      label: 'Pasek pod nagłówkiem',
      pl: '🐍 Jedna wspólna plansza · {ruchy} ruchy dziennie w godzinach {godziny} ({dni}) · graj bez końca i zbieraj punkty',
      en: '🐍 One shared board · {ruchy} moves a day, {godziny} ({dni}) · play forever and collect points'
    },
    {
      key: 'snakes.login', game: 'snakes', inline: true,
      label: 'Opis na ekranie logowania',
      pl: 'Podaj swój nick — to samo konto co w Office Wordle. Codziennie ({dni}) {ruchy} rzuty kostką na wspólnej planszy węży i drabin, do wykorzystania w godzinach {godziny}, kiedy chcesz.',
      en: 'Enter your nickname — it is the same account as in Office Wordle. Every day ({dni}) you get {ruchy} dice rolls on the shared snakes & ladders board, to use whenever you like during playing hours ({godziny}).'
    },
    {
      key: 'snakes.how_intro', game: 'snakes', inline: true,
      label: 'Zasady — wstęp',
      pl: 'Jedna **wspólna plansza** dla całego biura, zapętlona w nieskończoność — nie ma „mety", po ostatnim polu wracasz na start i lecisz kolejne okrążenie. Widzisz pionki wszystkich i ścigacie się o punkty. Gra toczy się w **sezonach** i co sezon plansza zmienia kształt.',
      en: 'One **shared board** for the whole office, looping forever — there is no finish line: after the last tile you go back to the start and run another lap. You see everyone\'s pawns and you race for points. The game is played in **seasons**, and every season the board changes shape.'
    },
    {
      key: 'snakes.rules', game: 'snakes', markers: ['sezon', 'boss'],
      label: 'Zasady — lista punktów',
      pl: [
        '1. **Zdjęcie profilowe — wymagane.** Zanim zagrasz, wgraj zdjęcie (swoje albo dowolne inne) — to Twój pionek na planszy, okrągły awatar widoczny dla wszystkich. Najedź na czyjeś zdjęcie myszką, żeby zobaczyć nick. Bez zdjęcia nie da się rzucić kostką.',
        '1. **{ruchy} ruchy dziennie, w godzinach {godziny}.** To gra biurowa: rzucać można wyłącznie {dni_dlugo} **między {start} a {koniec}** (czasu Warszawy). W tym oknie masz **{ruchy} rzuty kostką** i **sam decydujesz, kiedy je zużyjesz** — wszystkie pod rząd rano albo po jednym przez cały dzień, bez żadnego odstępu między nimi. Po {koniec} przycisk jest zamknięty, nawet jeśli zostały Ci ruchy — niewykorzystane rzuty przepadają wraz z końcem dnia. W sobotę i niedzielę gra stoi — jak w Wordle, w weekend nie rzucamy.',
        '1. **Drabiny i węże.** Wejdziesz na drabinę 🪜 — wskakujesz wyżej. Wdepniesz na węża 🐍 — zjeżdżasz w dół. Pola bonusowe ⭐ dają dodatkowe punkty bez ruchu. Na planszy **każdy wąż i każda drabina ma narysowaną linię** od pola startowego do docelowego: drabiny to proste, zielone linie w górę, węże to czerwone, wijące się krzywe w dół — od razu widać, dokąd prowadzą.',
        '1. **Wypychanie.** Wylądujesz na polu zajętym przez kogoś innego — wypychasz go **o losowe {zbicie_pola} pól do tyłu** — dostajesz za to **+{zbicie_pkt} pkt** do rankingu i zabierasz mu do {zbicie_coins} coins (tyle, ile ma — jeśli ma mniej, zabierasz resztę; punkty dostajesz zawsze). Wypchnięty gracz normalnie odpala węże, drabiny i bonusy na polu, na które wylądował — czasem to i tak dobry deal. Cofnięcie zatrzymuje się na polu 0 bieżącego okrążenia — wypchnięcie nie zabiera okrążenia. **Pole 0 (start)** jest bezpieczne — stojącego tam gracza nie da się wypchnąć.',
        '1. **Punkty i coins.** Za **wartość rzutu**, **pola bonusowe** oraz **postęp po planszy** (przebyty dystans i ukończone okrążenia — każde okrążenie to gruby bonus) dostajesz jednocześnie jedno i drugie: **tyle samo punktów co coins**. **Punkty** przez cały sezon się tylko kumulują i budują **leaderboard** — nie da się ich wydać. **Coins** to portfel: płacisz nimi w sklepie i wpłacasz je bossowi, więc twoje coins spadają, a punkty nigdy.',
        '1. **Power-upy (za coins, nie losowo).** W sklepie kupujesz:',
        '   - ❄️ **Freeze** — zatrzymuje wybranego gracza w jego następnej turze. **Cel nie widzi, że jest zamrożony** — przekona się dopiero, gdy kliknie „Rzuć". W dzienniku pojawia się tylko tyle, że ktoś użył Freeze; na kogo padło, wie wyłącznie rzucający.',
        '   - 💀 **Curse** — klątwa z 8 losowych wariantów, wybrana już w momencie rzucenia. **Cel nie dostaje żadnego sygnału, że jest przeklęty** — przekona się dopiero, gdy klątwa odpali: na jego następnym ruchu, a Drożyzna przy pierwszej próbie zakupu (ten zakup zostaje wstrzymany, więc nikt nie płaci ceny, której wcześniej nie widział). W dzienniku widać tylko tyle, że ktoś rzucił klątwę; na kogo — wie wyłącznie rzucający, a **jaka — nie wie nikt, także rzucający**, dopóki nie odpali. Klątwy się nie sumują w jednym ruchu: każdy ruch zdejmuje jedną, po kolei. Na jednym graczu mogą czekać **najwyżej {klatwy_cel} klątwy naraz**, w tym najwyżej jedna od Ciebie. Kolejną rzucisz, gdy któraś odpali:',
        '     - ↩️ **Odwrotny Ruch** — kość cofa zamiast pchać do przodu.',
        '     - ➗ **Rozdwojona Kostka** — rzut liczy się w połowie, w dół.',
        '     - 💰 **Kieszonkowiec** — traci {kieszonkowiec} coins na rzecz rzucającego klątwę. Kto ma mniej, oddaje cały portfel, ale zawsze co najmniej {kieszonkowiec_min} coins — nawet jeśli zejdzie przez to na minus.',
        '     - 📉 **Chciwość** — połowa punktów z tego ruchu przepada.',
        '     - 🔀 **Odwrócone Zasady** — na ten ruch drabiny i węże działa się od drugiego końca: staniesz na szczycie drabiny — zjeżdżasz nią na dół, staniesz na ogonie węża — wjeżdżasz do jego głowy. Wejście od zwykłej strony nic wtedy nie robi.',
        '     - 🌀 **Chaos** — po wylądowaniu losowy doskok o 1–3 pola.',
        '     - 🚫 **Bez Bonusu** — pole bonusowe na ten ruch nie działa.',
        '     - 🧾 **Drożyzna** — jedyna klątwa, która czeka na zakup, nie na ruch. Do czasu odpalenia **nic nie widać**: ceny w sklepie są normalne. Gdy spróbujesz coś kupić, **zakup zostaje wstrzymany** (nic nie tracisz), klątwa się ujawnia, a ceny idą w górę o {drozyzna}%. Dopiero kolejne kliknięcie kupuje — już po cenie, którą masz przed oczami. **Po zakupie ceny wracają do normy.**',
        '   - ⏩ **Extra Move** — dokłada jeden ruch ponad dzienny limit, do wykonania od razu po użyciu (ważny tylko tego dnia). Dziennie można dołożyć **najwyżej {extra_ruchy}** takie ruchy, więc absolutny sufit to **{max_ruchy} rzutów na dzień**. W ekwipunku zmieszczą się najwyżej **{extra_move_zapas}** sztuki. **Cena zależy od Twojego bieżącego miejsca w rankingu**, żeby łatwiej było gonić czołówkę: {ceny_extra_move}. Awansujesz — następna sztuka od razu kosztuje więcej.',
        '   - 🛡️ **Shield** — obrona jednorazowa: blokuje najbliższy Freeze lub Curse wymierzony w Ciebie, po czym znika. Widzisz tylko swoją tarczę — czy inni gracze ją mają, dowiesz się dopiero, gdy Twój atak się od niej odbije.',
        '   Przy Freeze i Curse wybierasz **cel** — innego gracza. Jeśli cel ma tarczę, atak przepada.',
        '1. **🟩 Wordle = darmowy Extra Move.** Od poniedziałku do piątku na [/wordle](/wordle) czeka hasło dnia. **Odgadniesz je — dostajesz Extra Move**, raz dziennie. Jeśli wygrasz w godzinach gry i masz jeszcze miejsce na dodatkowy ruch, to **+1 ruch na dziś**; jeśli nie (po zamknięciu rzutów albo przy dwóch dołożonych już ruchach), sztuka ląduje w ekwipunku na później — tak samo jak Rzut od Prezesa.',
        '1. **🎃 Mechaniki sezonu.** [[sezon]]',
        '1. **👹 Walka z bossem.** [[boss]]',
        '1. **Rywalizacja w sezonach.** Nie ma zwycięskiego pola — liczy się, kto do końca sezonu uzbiera najwięcej punktów (przy remisie wygrywa więcej okrążeń, a potem dalsze pole).',
        '1. **🏆 Koniec sezonu i medale.** Gdy sezon się kończy, najlepsza trójka staje na **podium** i dostaje medal 🥇🥈🥉, który zostaje przy nicku na zawsze. Nowy sezon **wszyscy zaczynają od zera**: zerują się punkty, coins, okrążenia i ekwipunek, więc każdy ma równe szanse. Kostiumy zostają i można je dalej nosić, ale kostiumów z poprzedniego sezonu nie da się już kupić. Wyniki starych sezonów zobaczysz w rankingu, w zakładkach nad listą.'
      ].join('\n'),
      en: [
        '1. **Profile photo — required.** Before you play, upload a photo (of yourself or anything else) — it is your pawn on the board, a round avatar everyone can see. Hover over someone\'s photo to see their nickname. Without a photo you cannot roll the dice.',
        '1. **{ruchy} moves a day, {godziny}.** It is an office game: you can roll only {dni_dlugo} **between {start} and {koniec}** (Warsaw time). In that window you have **{ruchy} dice rolls** and **you decide when to use them** — all in a row in the morning or one at a time through the day, with no gap required between them. After {koniec} the button is locked even if you have moves left — unused rolls are lost at the end of the day. On Saturday and Sunday the game stands still — just like Wordle, we don\'t roll at weekends.',
        '1. **Ladders and snakes.** Land on a ladder 🪜 — you jump up. Step on a snake 🐍 — you slide down. Bonus tiles ⭐ give extra points without moving. On the board **every snake and every ladder has a line drawn** from its start tile to its end tile: ladders are straight green lines going up, snakes are red, wiggly curves going down — you can see at a glance where they lead.',
        '1. **Knocking back.** Land on a tile occupied by someone else and you knock them **back by a random {zbicie_pola} tiles** — you get **+{zbicie_pkt} pts** for the ranking and take up to {zbicie_coins} coins from them (as much as they have — if they have less, you take what is left; you always get the points). The knocked-back player triggers snakes, ladders and bonuses on the tile they land on as usual — sometimes it is still a good deal for them. Being knocked back stops at tile 0 of the current lap — it never takes a lap away. **Tile 0 (start)** is safe — a player standing there cannot be knocked back.',
        '1. **Points and coins.** For the **value of your roll**, **bonus tiles** and **progress around the board** (distance travelled and completed laps — every lap is a big bonus) you get both at once: **as many points as coins**. **Points** only add up during the season and build the **leaderboard** — you cannot spend them. **Coins** are your wallet: you pay with them in the shop and contribute them to the boss, so your coins go down while your points never do.',
        '1. **Power-ups (bought with coins, not random).** In the shop you can buy:',
        '   - ❄️ **Freeze** — stops the chosen player on their next turn. **The target cannot see they are frozen** — they only find out when they click "Roll". The log only shows that someone used Freeze; who it hit is known only to the caster.',
        '   - 💀 **Curse** — a curse with 8 random variants, picked the moment it is cast. **The target gets no signal that they are cursed** — they only find out when the curse fires: on their next move, or for Price Hike on their first purchase attempt (that purchase is put on hold, so nobody pays a price they did not see first). The log only shows that someone cast a curse; who it targets is known only to the caster, and **which curse it is — nobody knows, not even the caster**, until it fires. Curses do not stack within one move: each move removes one, in order. **At most {klatwy_cel} curses can wait on one player at a time**, including at most one from you. You can cast another when one of them fires:',
        '     - ↩️ **Reverse Move** — the die moves you backwards instead of forwards.',
        '     - ➗ **Split Die** — the roll counts as half, rounded down.',
        '     - 💰 **Pickpocket** — loses {kieszonkowiec} coins to the player who cast the curse. Someone with less gives up their whole wallet, but always at least {kieszonkowiec_min} coins — even if that takes them below zero.',
        '     - 📉 **Greed** — half of the points from that move are lost.',
        '     - 🔀 **Reversed Rules** — for that move ladders and snakes work from the other end: stop at the top of a ladder and you slide down it, stop at a snake\'s tail and you ride up to its head. Entering from the usual end does nothing then.',
        '     - 🌀 **Chaos** — after landing you jump randomly by 1–3 tiles.',
        '     - 🚫 **No Bonus** — bonus tiles do not work for that move.',
        '     - 🧾 **Price Hike** — the only curse that waits for a purchase, not a move. Until it fires **you see nothing**: shop prices look normal. When you try to buy something, **the purchase is put on hold** (you lose nothing), the curse reveals itself and prices go up by {drozyzna}%. Only the next click buys — at the price you now see. **After the purchase prices return to normal.**',
        '   - ⏩ **Extra Move** — adds one move above the daily limit, to be used straight after activating it (valid that day only). You can add **at most {extra_ruchy}** such moves a day, so the absolute ceiling is **{max_ruchy} rolls a day**. Your inventory holds at most **{extra_move_zapas}** of them. **The price depends on your current place in the ranking**, so it is easier to chase the leaders: {ceny_extra_move}. Move up the ranking and the next one immediately costs more.',
        '   - 🛡️ **Shield** — one-time protection: blocks the next Freeze or Curse aimed at you, then disappears. You only see your own shield — whether other players have one you find out only when your attack bounces off it.',
        '   With Freeze and Curse you choose a **target** — another player. If the target has a shield, the attack is lost.',
        '1. **🟩 Wordle = a free Extra Move.** Monday to Friday a word of the day waits at [/wordle](/wordle). **Guess it and you get an Extra Move**, once a day. If you win during playing hours and still have room for an extra move, it is **+1 move today**; if not (after rolling has closed, or with two extra moves already added), it goes into your inventory for later — just like the Boss\'s Roll.',
        '1. **🎃 Season mechanics.** [[sezon]]',
        '1. **👹 Boss fight.** [[boss]]',
        '1. **Competing in seasons.** There is no winning tile — what counts is who collects the most points by the end of the season (in a tie, more laps wins, then the further tile).',
        '1. **🏆 End of season and medals.** When a season ends, the top three stand on the **podium** and get a medal 🥇🥈🥉 that stays next to their nickname forever. In the new season **everyone starts from zero**: points, coins, laps and inventory are reset, so everyone has an equal chance. Costumes stay and you can keep wearing them, but costumes from the previous season can no longer be bought. Results of past seasons are in the ranking, in the tabs above the list.'
      ].join('\n')
    },
    {
      key: 'snakes.footer', game: 'snakes', inline: true,
      label: 'Stopka',
      pl: '🐍 Nieskończona pętla · {ruchy} ruchy dziennie, {godziny} ({dni}) · punkty się kumulują',
      en: '🐍 Endless loop · {ruchy} moves a day, {godziny} ({dni}) · points keep adding up'
    },

    {
      key: 'wordle.login', game: 'wordle', inline: true,
      label: 'Opis na ekranie logowania',
      pl: 'Podaj swój nick — zaloguje Cię automatycznie, jeśli już grasz. Codziennie nowe biurowe hasło do odgadnięcia.',
      en: 'Enter your nickname — you will be logged in automatically if you already play. A new office word to guess every day.'
    },
    {
      key: 'wordle.info', game: 'wordle', list_class: 'info-list', item_span: true,
      label: 'Boczna karta „Jak to działa?"',
      pl: [
        '1. Odgadnij **hasło dnia** w jak najmniejszej liczbie prób. Hasła **mogą, ale nie muszą być z IT** (SOC, SIEM, AI…) — równie dobrze może paść zwykłe polskie słowo.',
        '1. Wpisz całe **prawdziwe słowo** i zatwierdź **Enterem**. Prób masz **długość hasła + 1** (nie-słowa są odrzucane bez straty próby).',
        '1. **Zielony** = litera na miejscu, **żółty** = jest w haśle, ale gdzie indziej, **szary** = nie ma jej wcale.',
        '1. Punkty rosną, im szybciej zgadniesz. Bonus za **długie hasła** i za **serię dni 🔥**. Przegrana zeruje serię.',
        '1. **⚡ Kto pierwszy, ten lepszy:** pierwsze {szybkosc_osoby} osób z odgadniętym hasłem dnia dostaje bonus **{szybkosc_bonusy} pkt**.',
        '1. **🎲 Extra Move w wężach:** odgadnięte hasło daje dodatkowy ruch w [Snakes Game](/snakes) — na dziś, a po zamknięciu rzutów do ekwipunku.',
        '1. Grasz **raz dziennie**, postęp zapisuje się sam. Nowe hasło o **{start}**.',
        '1. Ścigaj się w **rankingu dnia** i **tabeli liderów**. Podziel się wynikiem na Slacku 🟩🟨⬛.'
      ].join('\n'),
      en: [
        '1. Guess the **word of the day** in as few tries as possible. Words **may or may not be IT-related** (SOC, SIEM, AI…) — it can just as well be an ordinary Polish word.',
        '1. Type a whole **real word** and confirm with **Enter**. You get **word length + 1** tries (non-words are rejected without costing a try).',
        '1. **Green** = letter in the right spot, **yellow** = in the word but elsewhere, **grey** = not in the word at all.',
        '1. The faster you guess, the more points. Bonus for **long words** and for a **streak of days 🔥**. A loss resets the streak.',
        '1. **⚡ First come, first served:** the first {szybkosc_osoby} people to guess the word of the day get a bonus of **{szybkosc_bonusy} pts**.',
        '1. **🎲 Extra Move in Snakes:** a guessed word gives an extra move in [Snakes Game](/snakes) — for today, or into your inventory after rolling has closed.',
        '1. You play **once a day**, progress saves itself. New word at **{start}**.',
        '1. Compete in the **daily ranking** and the **leaderboard**. Share your result on Slack 🟩🟨⬛.'
      ].join('\n')
    },
    {
      key: 'wordle.how_intro', game: 'wordle', inline: true,
      label: 'Pełne zasady — wstęp',
      pl: 'Codziennie jedno **hasło** do odgadnięcia w jak najmniejszej liczbie prób — jak w klasycznym Wordle. Hasła **mogą, ale nie muszą być z branży IT**: czasem trafi się coś z naszego świata (bezpieczeństwo, SOC, SIEM, AI, nasze produkty), a czasem najzwyklejsze polskie słowo z zupełnie innej bajki. Nie zakładaj z góry, że dzisiejsze hasło jest „techniczne".',
      en: 'Every day there is one **word** to guess in as few tries as possible — just like classic Wordle. **The words are Polish**, and they **may or may not be IT-related**: sometimes it is something from our world (security, SOC, SIEM, AI, our products), sometimes a completely ordinary Polish word from another story altogether. Don\'t assume today\'s word is "technical".'
    },
    {
      key: 'wordle.rules', game: 'wordle',
      label: 'Pełne zasady — lista punktów',
      pl: [
        '1. **Zgadywanie.** Wpisz całe słowo o długości dzisiejszego hasła i zatwierdź **Enterem** (klawiaturą fizyczną albo ekranową). Liczba pól w rzędzie = długość hasła, a masz **długość + 1** prób (np. hasło 5-literowe → 6 prób, 9-literowe → 10 prób). Plansza dopasowuje się sama.',
        '1. **Tylko prawdziwe słowa.** Musisz wpisywać istniejące słowa — same samogłoski czy losowe ciągi liter zostaną odrzucone i **nie zużyją próby**. Chodzi o zgadywanie, nie o matematyczne przeczesywanie liter.',
        '1. **Podpowiedzi kolorami.** Po każdej próbie każda litera dostaje kolor: [[zielony:zielony]] — trafiona litera na właściwym miejscu, [[zolty:żółty]] — litera jest w haśle, ale na innej pozycji, [[szary:szary]] — litery w ogóle nie ma. Te same kolory podświetlają się na klawiaturze, żebyś wiedział, czego już próbowałeś.',
        '1. **Punktacja.** Im szybciej zgadniesz, tym więcej punktów (najwięcej za trafienie w 1. próbie, najmniej za ostatnią). Do tego **bonus za długość** hasła — dłuższe słowa są trudniejsze, więc więcej za nie dostajesz — oraz **bonus za serię**: każdy kolejny dzień z wygraną z rzędu (🔥 streak) dokłada punkty. Nieodgadnięte hasło = 0 pkt i seria wraca do zera.',
        '1. **Bonus za szybkość ⚡.** Pierwsze **{szybkosc_osoby} osób**, które danego dnia odgadną hasło, dostaje dodatkowe punkty: {szybkosc_lista}. Liczy się **moment trafienia**, a nie liczba prób — więc opłaca się zagrać z rana. W panelu po grze i w rankingu dnia zobaczysz, które to było odgadnięcie.',
        '1. **Raz dziennie.** Każde hasło grasz tylko jeden raz. Postęp zapisuje się na bieżąco — możesz odświeżyć stronę albo wrócić później i dokończyć próby. Po zakończeniu gry zobaczysz swój wynik, serię i sumę punktów.',
        '1. **Gramy w dni robocze.** Nowe hasło pojawia się w każdy dzień roboczy o **{start}** (czasu polskiego) i możesz je odgadywać **do północy** tego dnia. Między północą a {start} wisi jeszcze wczorajsze hasło, ale bez możliwości wpisywania. W weekend robimy przerwę — seria (🔥) przechodzi z piątku na poniedziałek bez zerowania.',
        '1. **Sezon = miesiąc.** Rywalizacja trwa w obrębie jednego miesiąca. 1. dnia nowego miesiąca **leaderboard, punkty i seria zerują się** — każdy zaczyna od nowa. Wyniki poprzednich miesięcy zostają dostępne jako historia w tabeli liderów.',
        '1. **Rywalizacja.** **Ranking dnia** pokazuje, kto dziś trafił najlepiej (liczy się najmniejsza liczba prób). **Tabela liderów** sumuje punkty — z widokiem All-Time, tygodniowym i miesięcznym.',
        '1. **Extra Move w wężach 🎲.** Każde odgadnięte hasło dnia daje dodatkowy ruch w [Snakes Game](/snakes). Wygrasz w godzinach rzutów i masz jeszcze miejsce na dodatkowy ruch — dostajesz **+1 ruch na dziś**. Wygrasz później (np. wieczorem) albo masz już dwa dołożone ruchy — Extra Move ląduje w ekwipunku i użyjesz go, kiedy chcesz. Nieodgadnięte hasło nie daje nic.',
        '1. **Pochwal się wynikiem.** Po grze kliknij „Udostępnij wynik" — do schowka trafi siatka emoji 🟩🟨⬛ (bez zdradzania liter), gotowa do wklejenia na Slacku czy Teams.'
      ].join('\n'),
      en: [
        '1. **Guessing.** Type a whole word as long as today\'s word and confirm with **Enter** (on your keyboard or the on-screen one). The number of boxes in a row = the word length, and you get **length + 1** tries (e.g. a 5-letter word → 6 tries, 9 letters → 10 tries). The board adjusts by itself. The words are Polish, so the keyboard has Polish letters.',
        '1. **Real words only.** You must type existing (Polish) words — vowels only or random strings of letters are rejected and **do not cost a try**. The point is guessing, not mathematically combing through letters.',
        '1. **Colour hints.** After each try every letter gets a colour: [[zielony:green]] — right letter in the right spot, [[zolty:yellow]] — the letter is in the word but in a different position, [[szary:grey]] — the letter is not in the word at all. The same colours light up on the keyboard so you know what you have already tried.',
        '1. **Scoring.** The faster you guess, the more points (most for getting it on the 1st try, least on the last one). On top of that there is a **length bonus** — longer words are harder, so you get more for them — and a **streak bonus**: every consecutive winning day (🔥 streak) adds points. An unguessed word = 0 pts and the streak goes back to zero.',
        '1. **Speed bonus ⚡.** The first **{szybkosc_osoby} people** to guess the word on a given day get extra points: {szybkosc_lista}. What counts is **the moment you guess it**, not the number of tries — so it pays to play in the morning. The after-game panel and the daily ranking show which guess yours was.',
        '1. **Once a day.** You play each word only once. Progress is saved as you go — you can refresh the page or come back later to finish your tries. When the game is over you see your result, streak and total points.',
        '1. **We play on working days.** A new word appears every working day at **{start}** (Polish time) and you can guess it **until midnight** that day. Between midnight and {start} yesterday\'s word is still shown, but you cannot type. At weekends we take a break — the streak (🔥) carries over from Friday to Monday without resetting.',
        '1. **Season = month.** The competition runs within one month. On the 1st day of a new month **the leaderboard, points and streak reset** — everyone starts again. Results of previous months stay available as history in the leaderboard.',
        '1. **Competition.** **The daily ranking** shows who did best today (fewest tries counts). **The leaderboard** adds up points — with All-Time, weekly and monthly views.',
        '1. **Extra Move in Snakes 🎲.** Every guessed word of the day gives an extra move in [Snakes Game](/snakes). Win during rolling hours with room for an extra move left — you get **+1 move today**. Win later (e.g. in the evening) or with two extra moves already added — the Extra Move goes into your inventory to use whenever you like. An unguessed word gives nothing.',
        '1. **Show off your result.** After the game click "Share result" — an emoji grid 🟩🟨⬛ (without revealing any letters) is copied to your clipboard, ready to paste into Slack or Teams.'
      ].join('\n')
    }
  ];
  const BY_KEY = new Map(SECTIONS.map(s => [s.key, s]));

  // Opisy zmiennych do panelu — admin widzi, co wolno wstawić i jaką ma dziś wartość.
  const VAR_HELP = {
    snakes: {
      godziny: 'okno gry, np. 8:00–16:00', start: 'otwarcie, np. 8:00', koniec: 'zamknięcie, np. 16:00',
      dni: 'dni gry, krótko (pon–pt / codziennie)', dni_dlugo: 'dni gry, pełnym zdaniem',
      ruchy: 'dzienny limit rzutów', extra_ruchy: 'ile Extra Move można dołożyć dziennie',
      max_ruchy: 'sufit rzutów na dzień', extra_move_zapas: 'ile Extra Move zmieści ekwipunek',
      ceny_extra_move: 'cennik Extra Move z miejsc w rankingu',
      zbicie_pola: 'o ile pól cofa zbicie', zbicie_pkt: 'pkt za zbicie', zbicie_coins: 'coins za zbicie',
      kieszonkowiec: 'coins zabierane przez Kieszonkowca', kieszonkowiec_min: 'minimum Kieszonkowca',
      klatwy_cel: 'ile klątw naraz na jednym graczu', drozyzna: 'ile % dokłada Drożyzna'
    },
    wordle: {
      start: 'godzina nowego hasła, np. 8:00', szybkosc_osoby: 'ile osób łapie bonus za szybkość',
      szybkosc_bonusy: 'bonusy za szybkość, krótko (+5 / +4 / …)', szybkosc_lista: 'bonusy za szybkość, pełnym zdaniem'
    }
  };

  function varsFor(game, lang) {
    try {
      return (game === 'wordle' ? wordleVars : snakesVars)(lang) || {};
    } catch (e) {
      // Zmienne to dodatek — błąd w jednej nie może wyłączyć całego regulaminu.
      console.error('Teksty: nie udało się policzyć zmiennych —', e.message);
      return {};
    }
  }

  // ── MARKDOWN → HTML (bezpieczny) ──
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const CHIPS = { zielony: 'green', zolty: 'yellow', szary: 'gray' };

  function inline(text, vars) {
    let s = esc(text);
    // Zmienne PO escapowaniu, a ich wartości escapujemy osobno — wartość nie wstawi tagu.
    s = s.replace(/\{([a-z_]+)\}/g, (m, name) => (vars[name] != null ? esc(vars[name]) : m));
    s = s.replace(/\[\[(zielony|zolty|szary):([^\]]+)\]\]/g, (_, c, t) => `<span class="how-chip ${CHIPS[c]}">${t}</span>`);
    // Linki tylko do ścieżek w serwisie i na http(s) — żadnego javascript:. Cudzysłów jest
    // już zamieniony na &quot;, więc atrybut się nie urwie.
    s = s.replace(/\[([^\]]+)\]\(((?:\/|https?:\/\/)[^\s)]*)\)/g, (_, t, href) => {
      const ext = !href.startsWith('/');
      return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
    });
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
    return s;
  }

  // Punkt listy ze znacznikiem [[sezon]] albo [[boss]] to miejsce na treść składaną przez
  // front ze stawek w payloadzie (slRenderSeasonRules, slRenderBossRules) — tamte funkcje
  // szukają tych samych id, co dawniej w statycznym HTML-u.
  function itemAttrs(raw, markers) {
    if (markers.includes('sezon') && raw.includes('[[sezon]]')) return ' id="rules-season" hidden';
    if (markers.includes('boss') && raw.includes('[[boss]]')) return ' id="rules-boss"';
    return '';
  }
  function fillMarkers(html) {
    return html
      .replace(/\[\[sezon\]\]/g, '<span class="rules-season-text"></span>')
      .replace(/\[\[boss\]\]/g, '<span id="rules-boss-text"></span>');
  }

  const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

  // Lista z wcięciami: każdy poziom to większe wcięcie znacznika. Linia bez znacznika
  // dokleja się do najgłębszego punktu, w którego treści mieści się jej wcięcie — tak
  // „Przy Freeze i Curse…" wraca do punktu o power-upach po zagnieżdżonej liście.
  function parseList(lines) {
    const root = { indent: -1, items: [] };
    const stack = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = line.match(LIST_RE);
      if (m) {
        const indent = m[1].length;
        const ordered = /\d/.test(m[2]);
        while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
        let list = stack[stack.length - 1];
        if (!list || list.indent < indent) {
          list = { indent, ordered, items: [] };
          const parentList = stack[stack.length - 1];
          if (parentList && parentList.items.length) {
            parentList.items[parentList.items.length - 1].parts.push(list);
          } else {
            root.items.push(list);
          }
          stack.push(list);
        }
        list.items.push({ parts: [m[3]], raw: m[3] });
      } else {
        const indent = line.match(/^\s*/)[0].length;
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
        const list = stack[stack.length - 1];
        if (!list || !list.items.length) continue;
        const item = list.items[list.items.length - 1];
        const last = item.parts[item.parts.length - 1];
        if (typeof last === 'string') item.parts[item.parts.length - 1] = last + ' ' + line.trim();
        else item.parts.push(line.trim());
        item.raw += ' ' + line.trim();
      }
    }
    return root.items;
  }

  function renderList(list, vars, opts, top) {
    const tag = list.ordered ? 'ol' : 'ul';
    const cls = top && opts.list_class ? ` class="${opts.list_class}"` : '';
    const items = list.items.map(item => {
      const body = item.parts.map(p => (typeof p === 'string'
        ? fillMarkers(inline(p, vars))
        : renderList(p, vars, opts, false))).join(' ');
      const inner = top && opts.item_span ? `<span>${body}</span>` : body;
      return `<li${itemAttrs(item.raw, opts.markers || [])}>${inner}</li>`;
    }).join('');
    return `<${tag}${cls}>${items}</${tag}>`;
  }

  function render(text, vars, opts = {}) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let cur = null;
    let blank = false;
    for (const line of lines) {
      if (!line.trim()) { blank = true; continue; }
      const isList = LIST_RE.test(line);
      // Lista ciągnie się przez puste linie, dopóki dalej są punkty albo wcięty tekst;
      // akapit kończy się na pustej linii.
      if (cur && cur.type === 'list' && (isList || /^\s/.test(line))) { cur.lines.push(line); blank = false; continue; }
      if (cur && cur.type === 'p' && !blank && !isList) { cur.lines.push(line); continue; }
      cur = { type: isList ? 'list' : 'p', lines: [line] };
      blocks.push(cur);
      blank = false;
    }
    const html = blocks.map(b => {
      if (b.type === 'list') return parseList(b.lines).map(l => renderList(l, vars, opts, true)).join('');
      const body = fillMarkers(inline(b.lines.map(l => l.trim()).join(' '), vars));
      return opts.inline ? body : `<p>${body}</p>`;
    });
    return html.join(opts.inline ? '<br>' : '');
  }

  // ── ODCZYT ──
  function overrides() {
    const out = {};
    for (const r of db.prepare('SELECT key, lang, body, updated_at FROM content_texts').all()) {
      (out[r.key] = out[r.key] || {})[r.lang] = { body: r.body, updated_at: r.updated_at };
    }
    return out;
  }

  function sourceOf(section, lang, ov) {
    const o = ov[section.key] && ov[section.key][lang];
    return o ? o.body : section[lang];
  }

  function renderedFor(game, lang) {
    const ov = overrides();
    const vars = varsFor(game, lang);
    const out = {};
    for (const s of SECTIONS) {
      if (s.game !== game) continue;
      out[s.key] = render(sourceOf(s, lang, ov), vars, s);
    }
    return out;
  }

  // ── TRASY ──
  // Publiczna: front gracza (także przed logowaniem — opis na ekranie logowania).
  app.get('/api/content/:game', (req, res) => {
    const game = req.params.game;
    if (game !== 'snakes' && game !== 'wordle') return res.status(404).json({ error: 'Nieznana gra' });
    const lang = LANGS.includes(req.query.lang) ? req.query.lang : 'pl';
    res.set('Cache-Control', 'no-cache');
    res.json({ lang, sections: renderedFor(game, lang) });
  });

  app.get('/api/content-admin', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const game = req.query.game;
    const ov = overrides();
    const sections = SECTIONS.filter(s => !game || s.game === game).map(s => ({
      key: s.key, game: s.game, label: s.label, markers: s.markers || [],
      defaults: { pl: s.pl, en: s.en },
      overrides: {
        pl: ov[s.key] && ov[s.key].pl ? ov[s.key].pl : null,
        en: ov[s.key] && ov[s.key].en ? ov[s.key].en : null
      }
    }));
    const vars = {};
    for (const g of ['snakes', 'wordle']) {
      if (game && g !== game) continue;
      const pl = varsFor(g, 'pl'), en = varsFor(g, 'en');
      vars[g] = Object.keys(VAR_HELP[g]).map(name => ({ name, help: VAR_HELP[g][name], pl: pl[name], en: en[name] }));
    }
    res.json({ sections, vars });
  });

  // body pusty albo null = usuń nadpisanie (wraca tekst domyślny).
  app.post('/api/content-admin', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const { key, lang } = req.body;
    const section = BY_KEY.get(key);
    if (!section) return res.status(400).json({ error: 'Nieznana sekcja' });
    if (!LANGS.includes(lang)) return res.status(400).json({ error: 'Nieznany język' });
    const body = req.body.body == null ? '' : String(req.body.body);
    if (body.length > 20000) return res.status(400).json({ error: 'Tekst za długi (max 20 000 znaków)' });
    if (!body.trim() || body === section[lang]) {
      db.prepare('DELETE FROM content_texts WHERE key = ? AND lang = ?').run(key, lang);
    } else {
      db.prepare(`
        INSERT INTO content_texts (key, lang, body, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key, lang) DO UPDATE SET body = excluded.body, updated_at = CURRENT_TIMESTAMP
      `).run(key, lang, body);
    }
    res.json({ ok: true, custom: !!(body.trim() && body !== section[lang]) });
  });

  // Podgląd przed zapisem — ten sam renderer co gra, więc panel nie pokaże czegoś innego.
  app.post('/api/content-admin/preview', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const section = BY_KEY.get(req.body.key);
    if (!section) return res.status(400).json({ error: 'Nieznana sekcja' });
    const lang = LANGS.includes(req.body.lang) ? req.body.lang : 'pl';
    res.json({ html: render(String(req.body.body || ''), varsFor(section.game, lang), section) });
  });

  return { render, renderedFor, SECTIONS };
};
