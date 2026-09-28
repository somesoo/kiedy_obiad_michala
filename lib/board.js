// ══ SILNIK PLANSZY — aktywny sezon, pola, efekty lądowania, ruch, rozstaje, zbicia ══
// Wszystko, co wie, JAK plansza działa, niezależnie od tego, jak wygląda. Kształt, drabiny,
// węże, bonusy i motyw żyją w plikach boards/<id>.js (lib/seasons.js); ten moduł tylko
// je wykonuje. Nowy sezon to nowy plik — tu zmienia się kod tylko przy NOWYM RODZAJU pola
// albo nowej regule ruchu.
//
// Aktywny sezon to jedyny zmienny stan: czyta się go przez slCurrentBoard(), a podmienia
// przez slSetBoard() (instalacja i zamknięcie sezonu w server.js). Nigdy nie przekazuj
// samego obiektu sezonu „na zapas" — po zmianie sezonu byłby nieaktualny.
//
// Rozmiar planszy ZAWSZE przez slBoardSize(), nigdy ze stałej. Rozstaje (`shared`) to dwa
// numery w jednym miejscu — porównujemy MIEJSCA (slSpotOf), nie numery.
//
// Uwaga przy zbiciach: cofanie dnia szuka ofiar przez detail LIKE '%Wypchnięty%', więc
// słowa „Wypchnięty" nie wolno zmieniać, a wpis zbijającego celowo mówi „Zbiłeś".

const seasons = require('./seasons');

module.exports = function createBoardModule(deps) {
  const {
    db, slBonusesOff, slLogPoints, slLogActivity, slMetaGet, SL_FIRST_SEASON_NAME
  } = deps;

  // Aktywny sezon. Startuje od domyślnego, a server.js przy starcie instaluje ten z sl_meta.
  let slBoard = seasons.get(seasons.DEFAULT_ID);
  function slCurrentBoard() { return slBoard; }
  function slSetBoard(season) { slBoard = season; }
  function slBoardSize() { return slBoard.size; }
  const SL_POINTS_PER_PIP = 2;           // punkty za każde oczko rzutu
  const SL_POINTS_PER_TILE = 1;          // punkty za każde przebyte pole (postęp)
  const SL_POINTS_PER_LAP = 50;          // bonus za każde ukończone okrążenie (domyślny)
  // Plik sezonu może nadpisać premię za okrążenie (`lap_points`) — krótsza droga znaczy
  // częstsze okrążenia, a przy 50 pkt premia zaczynała ważyć więcej niż akcje na polach.
  function slLapPoints() { return slBoard.lap_points != null ? slBoard.lap_points : SL_POINTS_PER_LAP; }
  // ── KNOCKBACK (wypychanie z zajętego pola) ──
  // Ile coins traci wypchnięty gracz na rzecz tego, kto go zbił.
  // Było 20. Symulacja 12 aktywnych graczy (wrzesień 2026) pokazała, że każdy jest zbijany
  // średnio ponad raz dziennie, a przy 20 coins zbicia przelewały między graczami POŁOWĘ
  // tego, co ktoś w ogóle zarobił (najgorsze 10% — trzy czwarte). Dla ekipy to zero, ale
  // pojedynczy gracz wiecznie stał przy pustym portfelu i nie mógł na nic odłożyć. Na
  // mniejszej planszy (Noc Duchów, 40 pól) zbić jest jeszcze więcej, stąd 10.
  const SL_KNOCKBACK_COIN_STEAL = 10;
  // Ile punktów RANKINGU dostaje zbijający — osobno od coins. Dawniej punkty były równe
  // zabranym coins, więc zbicie gracza z pustym portfelem albo w długu (po bossie) nie dawało
  // nic do rankingu, a to przypadek, nie zasługa zbijającego. Teraz: coins to przelew między
  // graczami (zależny od portfela ofiary, gra ich nie drukuje), punkty to stała nagroda za
  // samo zbicie. Obie liczby da się stroić niezależnie.
  const SL_KNOCKBACK_POINTS = 10;
  // O ile pól cofa się wypchnięty gracz — losowo z tego zakresu, osobne losowanie dla
  // KAŻDEJ ofiary (także w kaskadzie), z twardym progiem na polu 0 bieżącego okrążenia
  // (patrz slApplyKnockback): okrążenia wypchnięcie nie zabiera.
  const SL_KNOCKBACK_TILES_BACK_MIN = 3;
  const SL_KNOCKBACK_TILES_BACK_MAX = 6;

  // Wiersz sl_board w kształcie dla logiki i frontu: `faces` z tekstu "3,6" na listę liczb.
  function slBoardRow(t) {
    const out = { position: t.position, kind: t.kind, target: t.target, value: t.value };
    if (t.kind === 'fork') {
      out.alt_target = t.alt_target;
      out.faces = String(t.faces || '').split(',').filter(Boolean).map(Number);
    }
    return out;
  }

  function slBoardMap() {
    const map = {};
    for (const t of db.prepare('SELECT position, kind, target, value, alt_target, faces FROM sl_board').all()) {
      map[t.position] = slBoardRow(t);
    }
    return map;
  }

  function d6() {
    return 1 + Math.floor(Math.random() * 6);
  }

  // Losuje siłę pojedynczego wypchnięcia (w polach) z zakresu SL_KNOCKBACK_TILES_BACK_MIN..MAX.
  function slKnockbackTilesBack() {
    const span = SL_KNOCKBACK_TILES_BACK_MAX - SL_KNOCKBACK_TILES_BACK_MIN + 1;
    return SL_KNOCKBACK_TILES_BACK_MIN + Math.floor(Math.random() * span);
  }

  // Pola na planszy = abs_pos zwinięty do 0..(liczba pól - 1)
  function slTileOf(absPos) {
    const size = slBoardSize();
    return ((absPos % size) + size) % size;
  }

  // Rozstrzyga efekt pola dla JUŻ WYLICZONEJ pozycji lądowania (drabina/wąż/bonus).
  // Współdzielona przez zwykły ruch (slStepMove), knockback i klątwę „Chaos" — każdy,
  // kto ląduje na nowym polu (nawet nie przez normalny rzut), odpala jego efekt tak samo.
  // `invertBoard` (klątwa „Odwrócone Zasady") sprawia, że drabiny działają jak węże i
  // odwrotnie na TEN JEDEN ruch: cel odbija się względem pola lądowania (2×landed - target),
  // więc drabina w górę o X pól staje się zjazdem w dół o X pól, i vice versa.
  // Przy ODWRÓCONYCH ZASADACH (klątwa 5) szukamy połączenia, które normalnie KOŃCZY się na
  // danym polu — bo na ten ruch przechodzi się je w drugą stronę, z celu do źródła.
  // Gdyby po edycji planszy w adminie dwa połączenia celowały w to samo pole, wygrywa to
  // o najniższym numerze pola, żeby wynik był powtarzalny, a nie zależny od kolejności klucza.
  function slReverseLink(board, tile) {
    let found = null;
    for (const key of Object.keys(board)) {
      const t = board[key];
      if (t.kind !== 'ladder' && t.kind !== 'snake' && t.kind !== 'fork') continue;
      // Rozwidlona drabina ma DWA górne końce — z każdego z nich zjeżdża się na jej start.
      if (Number(t.target) !== tile && !(t.kind === 'fork' && Number(t.alt_target) === tile)) continue;
      if (!found || Number(t.position) < Number(found.position)) found = t;
    }
    return found;
  }

  function slResolveTileEffect(landedAbs, board, invertBoard = false) {
    // Podłoga to pole 0 CAŁEJ gry, nie bieżącego okrążenia. Klątwa Odwrotny Ruch może więc
    // ŚWIADOMIE cofnąć gracza przez start na poprzednie okrążenie — i dać mu szansę przejść
    // przez start jeszcze raz, razem z premią za okrążenie (decyzja właściciela, wrzesień 2026).
    // Zbicie i psikus mają własną podłogę okrążenia; tu jej celowo nie ma.
    let abs = Math.max(0, landedAbs);
    let tilePoints = 0;
    let note = null;
    const landed = slTileOf(abs);
    const base = abs - landed;   // pole 0 bieżącego okrążenia — skok liczymy względem niego
    const tile = board[landed];

    // ODWRÓCONE ZASADY: nie liczymy żadnego lustra, tylko przechodzimy TO SAMO połączenie od
    // drugiego końca. Staniesz na ogonie węża (na jego celu) — wjeżdżasz do głowy; staniesz
    // na szczycie drabiny — zjeżdżasz na dół. Oba końce są prawdziwymi polami planszy, więc
    // z definicji nie da się wyjechać poza nią ani zmienić okrążenia — żadnego przycinania.
    // Wejście od „normalnej" strony (dół drabiny, głowa węża) na ten ruch nic nie robi:
    // połączenie po odwróceniu po prostu się tam nie zaczyna.
    const reverse = invertBoard ? slReverseLink(board, landed) : null;

    let forkRoll = null;
    let forkAt = null; // pole rozwidlenia — front stawia tam pionek na czas animacji rzutu
    if (reverse) {
      abs = base + Number(reverse.position);
      note = reverse.kind === 'snake' ? 'ladder' : 'snake'; // drabina od góry to zjazd, i odwrotnie
    } else if (tile && !invertBoard && tile.kind === 'fork') {
      // ROZWIDLONA DRABINA: dodatkowy rzut rozstrzyga, którą odnogą się idzie. Losujemy tu,
      // na serwerze — tak jak każdy rzut — a wynik wraca w `forkRoll`, żeby ruch, dziennik
      // i front pokazały, co wypadło. Rzut rozwidlenia nie daje punktów za oczka: to tylko
      // wybór odnogi, a postęp po planszy i tak policzy się z dystansu.
      forkRoll = d6();
      forkAt = landed;
      const win = (tile.faces || []).includes(forkRoll);
      abs = base + Number(win ? tile.target : tile.alt_target);
      note = win ? 'fork_win' : 'fork_lose';
    } else if (tile && !invertBoard && (tile.kind === 'ladder' || tile.kind === 'snake')) {
      // Skok na planszy przekładamy na zmianę abs_pos (drabina w górę, wąż w dół),
      // zachowując bieżące okrążenie jako bazę.
      abs = base + tile.target;
      if (abs < 0) abs = 0; // nie schodzimy poniżej startu
      note = tile.kind;
    } else if (tile && tile.kind === 'bonus' && !slBonusesOff()) {
      // Bonusów klątwa nie dotyczy — działają tak samo w obie strony.
      // W dni drzwi „cukierek albo psikus" (hide_bonuses) bonusy są zdjęte z planszy.
      tilePoints += tile.value;
      note = 'bonus';
    }
    return { abs, tilePoints, note, forkRoll, forkAt };
  }

  // Wykonuje pojedynczy krok ruchu o `roll` pól, uwzględniając węże/drabiny/bonusy.
  // Zwraca { absAfter, tilePoints, note } dla tego kroku.
  function slStepMove(absBefore, roll, board, invertBoard = false) {
    const resolved = slResolveTileEffect(absBefore + roll, board, invertBoard);
    return { absAfter: resolved.abs, tilePoints: resolved.tilePoints, note: resolved.note, forkRoll: resolved.forkRoll, forkAt: resolved.forkAt };
  }

  // ── KNOCKBACK ──
  // MIEJSCE na planszy, a nie numer pola. Zwykle to jedno i to samo, ale rozstaje (`shared`
  // w pliku sezonu, np. 6 i 26 na ósemce Nocy Duchów) to dwa numery w jednym miejscu — kto
  // stoi na 6, stoi też „na 26" i da się go stamtąd zbić. Kanoniczny jest mniejszy numer.
  function slSpotOf(tile) {
    for (const [a, b] of slBoard.shared || []) if (tile === a || tile === b) return Math.min(a, b);
    return tile;
  }

  // Znajduje gracza (poza wykluczonymi) stojącego w danym miejscu — po numerze pola
  // (abs_pos modulo rozmiar planszy), bo to WSPÓLNA, zapętlona plansza, i po rozstajach
  // (slSpotOf). Wypchnięta ofiara cofa się potem po SWOJEJ nitce drogi, bo liczymy od jej
  // własnego abs_pos, nie od numeru, na którym stanął zbijający.
  function slFindOccupant(tile, excludeIds) {
    const rows = db.prepare(`
      SELECT s.player_id, s.abs_pos, p.nickname
      FROM sl_state s JOIN players p ON p.id = s.player_id
    `).all();
    const spot = slSpotOf(tile);
    return rows.find(r => !excludeIds.has(r.player_id) && slSpotOf(slTileOf(r.abs_pos)) === spot) || null;
  }

  // Gracz, który ląduje na zajętym polu, wypycha okupanta o losowe
  // SL_KNOCKBACK_TILES_BACK_MIN..MAX pól do tyłu (losowane osobno dla każdej ofiary)
  // — ale najdalej na pole 0 BIEŻĄCEGO okrążenia: cofnięcie nigdy nie przenosi
  // ofiary na poprzednią pętlę ani nie odbiera jej okrążenia. Do tego zabiera mu
  // SL_KNOCKBACK_COIN_STEAL
  // coins (maks. tyle, ile ofiara ma na koncie) i oddaje je temu, kto akurat spowodował
  // TO konkretne wypchnięcie. Punkty do rankingu idą OSOBNO: stałe SL_KNOCKBACK_POINTS,
  // niezależnie od tego, ile dało się zabrać. Przy kaskadzie zbijający to nie zawsze roller:
  // gdy wypchnięty gracz sam wyląduje na kimś, to ON staje się "zbijającym" dla kolejnej
  // ofiary w łańcuchu.
  // Pole, na które trafia ofiara, odpala węża/drabinę/bonus normalnie (slResolveTileEffect)
  // — jeśli to przerzuci ją na KOLEJNE zajęte pole, kaskada leci dalej stamtąd. Każde
  // wypchnięcie trafia też do dziennika aktywności ofiary (i zbijającego, przy kradzieży).
  // Pole 0 (start planszy/okrążenia) jest bezpieczne — stojących tam graczy NIE da się
  // wypchnąć, więc kaskada urywa się, gdy trafi na kogoś stojącego akurat na starcie.
  // Odmiana „pole/pola/pól" — dziennik czyta się jak zdanie, więc „-3 pól" kłuje w oczy.
  function slTilesWord(n) {
    const abs = Math.abs(n);
    if (abs === 1) return 'pole';
    const last = abs % 10;
    const lastTwo = abs % 100;
    return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'pola' : 'pól';
  }

  function slApplyKnockback(rollerPlayerId, landingAbsPos, board, rollerNickname, turnRef = null) {
    const pushedIds = new Set([rollerPlayerId]);
    const chain = [];
    // ── KOLEJNOŚĆ WPISÓW W DZIENNIKU ──
    // Zapisujemy CHRONOLOGICZNIE, w kolejności, w jakiej chcemy je przeczytać: najpierw
    // kto zbił, potem dokąd ofiara poleciała, na końcu co ją tam spotkało — i tak krok
    // po kroku przez całą kaskadę. Front rysuje turę jako blok i sortuje podlinijki
    // ROSNĄCO po `id` (patrz renderActivity), więc kolejność zapisu JEST kolejnością na
    // ekranie. Kiedyś było odwrotnie — wpisy szły od ostatniego domina, żeby płaski feed
    // `id DESC` czytał się chronologicznie. Po wprowadzeniu bloków ta sztuczka zaczęła
    // działać przeciwko nam, więc jej nie ma. Cena: w płaskim widoku panelu admina
    // kaskada czyta się od końca — to narzędzie moderacji, nie narracja.
    let targetTile = slTileOf(landingAbsPos);
    let pusherId = rollerPlayerId;
    let pusherNickname = rollerNickname;
    for (let i = 0; i < 200; i++) { // bezpiecznik przeciw pętli nieskończonej
      if (targetTile === 0) break; // pole 0 jest bezpieczne — nikogo stamtąd nie wypychamy
      const occ = slFindOccupant(targetTile, pushedIds);
      if (!occ) break;
      const fromAbs = Number(occ.abs_pos);
      // Siła wypchnięcia jest losowa przy każdym zbiciu — patrz slKnockbackTilesBack().
      // Cofnięcie zatrzymuje się na polu 0 BIEŻĄCEGO okrążenia: wypchnięcie nigdy nie
      // zabiera całego okrążenia. Gracz tuż po starcie kolejnej pętli (np. pole 2) ląduje
      // na polu 0 tej pętli, a nie na końcówce poprzedniej — dlatego do dziennika i do
      // odpowiedzi trafia tilesBack, czyli faktyczne cofnięcie po przycięciu, nie samo
      // wylosowanie.
      const lapStartAbs = fromAbs - slTileOf(fromAbs);
      const knockedAbs = Math.max(lapStartAbs, fromAbs - slKnockbackTilesBack());
      const tilesBack = fromAbs - knockedAbs;
      const resolved = slResolveTileEffect(knockedAbs, board);
      const toAbs = resolved.abs;
      const bonusPoints = resolved.tilePoints;

      const victimRow = db.prepare('SELECT balance FROM sl_state WHERE player_id = ?').get(occ.player_id);
      const stolen = Math.min(SL_KNOCKBACK_COIN_STEAL, Math.max(0, Number(victimRow.balance)));

      db.prepare(`
        UPDATE sl_state
        SET abs_pos = ?, laps = ?, balance = balance + ?, total_points = total_points + ?
        WHERE player_id = ?
      `).run(toAbs, Math.floor(toAbs / slBoardSize()), bonusPoints - stolen, bonusPoints, occ.player_id);

      // Wypchnięty mógł wylądować na polu bonusowym — to jego punkty z BONUSU, nie z kostki:
      // nie rzucał, tylko został tam przesunięty.
      slLogPoints(occ.player_id, 'bonus', bonusPoints);

      // Coins: przelew od ofiary (przycięty do jej portfela). Punkty: stała nagroda za zbicie,
      // także gdy portfel ofiary był pusty — patrz SL_KNOCKBACK_POINTS.
      const pointsWon = SL_KNOCKBACK_POINTS;
      db.prepare('UPDATE sl_state SET balance = balance + ?, total_points = total_points + ? WHERE player_id = ?')
        .run(stolen, pointsWon, pusherId);
      slLogPoints(pusherId, 'knockback', pointsWon);

      // Pole, na które gracz REALNIE został cofnięty — zanim zadziałała drabina/wąż.
      // Bez tego dziennik sklejał dwa różne ruchy w jeden i wychodziło „z pola 7 → 17
      // (-4 pola)", czyli skok DO PRZODU opisany jako cofnięcie o cztery pola.
      const knockedTile = slTileOf(knockedAbs);
      const entry = {
        player_id: occ.player_id,
        nickname: occ.nickname,
        from_tile: slTileOf(fromAbs),
        knocked_tile: knockedTile,
        to_tile: slTileOf(toAbs),
        tiles_back: tilesBack,
        tile_effect: resolved.note,
        bonus_points: bonusPoints,
        coins_stolen: stolen,
        points_won: pointsWon,
        stolen_by: pusherNickname
      };
      chain.push(entry);

      // Wypychający dostaje wpis ZAWSZE, także gdy nie było czego ukraść. Wcześniej ta linia
      // siedziała pod `if (stolen > 0)`, więc zbicie gracza z pustym portfelem nie zostawiało
      // po sobie w dzienniku ŻADNEGO śladu po stronie zbijającego — a to jego akcja i chce ją
      // u siebie zobaczyć (dziennik podświetla wpisy po player_id, patrz renderActivity).
      // UWAGA: w tym tekście nie może paść słowo „Wypchnięty". Cofanie całego dnia szuka ofiar
      // przez `detail LIKE '%Wypchnięty%'` na wpisach typu knockback (patrz /admin/day/rollback)
      // i policzyłoby zbijającego jako kogoś, kogo trzeba ręcznie przestawić na planszy.
      slLogActivity(pusherId, 'knockback', stolen > 0
        ? `💰 Zbiłeś ${occ.nickname} z pola ${entry.from_tile}: +${pointsWon} pkt i ${stolen} coins zabranych!`
        : `💥 Zbiłeś ${occ.nickname} z pola ${entry.from_tile}: +${pointsWon} pkt — coins do zabrania nie miał.`, turnRef);

      const bits = [`z pola ${entry.from_tile} → ${knockedTile} (-${tilesBack} ${slTilesWord(tilesBack)})`];
      if (resolved.note === 'bonus') bits.push(`⭐ +${bonusPoints} pkt bonusu`);
      if (stolen > 0) bits.push(`💰 stracił ${stolen} coins na rzecz ${pusherNickname}`);
      slLogActivity(occ.player_id, 'knockback', `💥 Wypchnięty przez ${pusherNickname} ${bits.join(' ')}`, turnRef);

      // Drabina i wąż to OSOBNY ruch, więc dostają własny wpis — najpierw „zbity na pole 3",
      // potem „drabina z 3 na 17". Bonus zostaje w wierszu wypchnięcia, bo nie przesuwa
      // pionka, tylko dosypuje punkty.
      if (resolved.note === 'ladder') {
        slLogActivity(occ.player_id, 'knockback', `🪜 Z pola ${knockedTile} wjechał drabiną na ${entry.to_tile}`, turnRef);
      } else if (resolved.note === 'snake') {
        slLogActivity(occ.player_id, 'knockback', `🐍 Z pola ${knockedTile} zjechał wężem na ${entry.to_tile}`, turnRef);
      } else if (resolved.forkRoll != null) {
        // Wypchnięty na rozwidloną drabinę też rzuca o odnogę — to ten sam efekt pola.
        slLogActivity(occ.player_id, 'knockback', `🪜🎲 Z pola ${knockedTile} na rozwidloną drabinę: wypadło ${resolved.forkRoll} → pole ${entry.to_tile}`, turnRef);
      }

      pushedIds.add(occ.player_id);
      pusherId = occ.player_id;
      pusherNickname = occ.nickname;
      if (fromAbs === toAbs) break; // brak realnej zmiany pozycji — koniec kaskady
      targetTile = slTileOf(toAbs);
    }

    return chain;
  }

  // Buduje publiczny opis planszy (do rysowania w UI). Front nie zna żadnego kształtu na
  // sztywno: rysuje pola tam, gdzie każe `path`, więc nowy sezon = nowy plik, bez zmian w JS.
  function slBoardPayload() {
    const tiles = db.prepare('SELECT position, kind, target, value, alt_target, faces FROM sl_board ORDER BY position').all().map(slBoardRow);
    return {
      id: slBoard.id, name: slBoard.name, theme: slBoard.theme, effects: slBoard.effects,
      size: slBoardSize(), cols: slBoard.cols, rows: slBoard.rows,
      path: slBoard.path, loop: slBoard.loop, tiles,
      view: slBoard.view,
      // Rozstaje — front rysuje każdą parę jako JEDNO pole z pionkami z obu numerów.
      shared: slBoard.shared || [],
      lap_points: slLapPoints(),
      season_prior_label: slMetaGet('season_prior_label') || SL_FIRST_SEASON_NAME
    };
  }

  return {
    slSetBoard,
    slCurrentBoard,
    slTileOf,
    slBoardSize,
    slBoardPayload,
    slBoardMap,
    d6,
    slStepMove,
    slResolveTileEffect,
    slApplyKnockback,
    SL_POINTS_PER_PIP,
    SL_POINTS_PER_TILE,
    slLapPoints
  };
};
