'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  MECHANIKI SEZONOWE — kocioł, cukierek albo psikus, polowanie na cukierki
// ══════════════════════════════════════════════════════════════════════════════
// Plik sezonu (boards/<id>.js → `events`) mówi, GDZIE i JAK; tu jest logika. Sezon bez
// `events` nie ma żadnej z tych mechanik i ten moduł nic nie robi.
//
// Fabryka jak lib/boss.js: helpery ze server.js przychodzą w `deps` (jeden uchwyt bazy,
// brak cyklu importów). Aktywną planszę czytamy przez `getSeason()` przy KAŻDYM wywołaniu,
// bo admin może przełączyć sezon w trakcie działania serwera.
//
// ── LĄDOWANIE ──
// Zdarzenie odpala WYŁĄCZNIE gracz, który rzucał, na polu, na którym WYLĄDOWAŁ (po
// drabinie, wężu i rozwidleniu, przed wypychaniem). Wypchnięci nic nie płacą i nic nie
// zbierają — nie rzucali, więc nie „weszli" na pole. Każde pole ma najwyżej jedno
// zdarzenie (pilnuje tego walidacja w lib/seasons.js), a cukierki sypią się tylko na
// zwykłe pola — więc lądowanie nigdy nie rozstrzyga dwóch rzeczy naraz.
//
// ── REJESTR I COFANIE ──
// Każda zmiana punktów, coins i cukierków ma wiersz w `sl_season_ledger` z `ref`
// ('move:<id>') i `day`. Cofanie CZYTA rejestr, nigdy nie przelicza wzorem — tak jak
// sl_boss_payouts. Ruch zapisuje efekty dopiero, gdy zna swoje id: resolveLanding() tylko
// ROZSTRZYGA (i ewentualnie przesuwa pionek), a zapis robi zwrócone apply(ref).
//
// Kocioł nie trzyma salda. Pula to minus suma coins z wierszy kotła, więc nie może się
// rozjechać z tym, kto ile wrzucił i wyjął — i żadna ścieżka cofania nie musi jej poprawiać.
//
// ── DWIE WALUTY ──
// Kocioł tylko PRZELEWA coins między graczami (wrzucone = wyjęte), niczego nie drukuje.
// Cukierek (treat) daje wyłącznie PUNKTY, nigdy coins. Psikus i kocioł zabierają coins
// BEZ przycinania do salda — można zejść pod kreskę, tak jak po przegranej z bossem.

module.exports = function createSeasonalModule(deps) {
  const {
    db, transaction,
    slLogActivity, slLogPoints, slEmit,
    todayWaw, isWeekendStr,
    getSeason, tileOf, boardSize
  } = deps;

  const TREAT_POINTS = 15;       // „cukierek" z drzwi: punkty do rankingu
  const TREAT_CANDY_POINTS = 5;  // „cukierek" jako 🍬 do polowania + drobne punkty
  const TRICK_COINS = 15;        // „psikus: zgniłe jajo"
  const TRICK_SCARE_TILES = 3;   // „psikus: duch cię przestraszył" — cofnięcie o tyle pól

  function initSchema() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS snakes.sl_season_ledger (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        board      TEXT NOT NULL,             -- sezon, w którym to się stało
        player_id  INTEGER,                   -- NULL = wpis po wyczyszczonym graczu (kocioł)
        kind       TEXT NOT NULL,             -- cauldron_drop | cauldron_take | treat | treat_candy | trick_egg | trick_scare | candy
        points     INTEGER DEFAULT 0,         -- ile dopisano do "total_points"
        coins      INTEGER DEFAULT 0,         -- ile dopisano do "balance" (ujemne = zabrano)
        candies    INTEGER DEFAULT 0,         -- ile cukierków do polowania
        tile       INTEGER,
        day        TEXT,
        ref        TEXT,                      -- 'move:<id>' — po nim cofa "Cofnij ruch"
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS snakes.idx_season_ledger_ref ON sl_season_ledger(ref);
      CREATE TABLE IF NOT EXISTS snakes.sl_candies (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        board         TEXT NOT NULL,          -- cukierek należy do planszy; po zmianie sezonu znika
        tile          INTEGER NOT NULL,
        spawn_day     TEXT NOT NULL,
        collected_by  INTEGER,
        collected_ref TEXT,
        collected_at  DATETIME
      );
    `);
  }

  function events() {
    const s = getSeason();
    return (s && s.events) || null;
  }

  // Warszawski dzień tygodnia 1–7 (1 = poniedziałek) z daty 'YYYY-MM-DD'.
  function weekdayOf(day) {
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  function trickActive(day) {
    const ev = events();
    return !!(ev && ev.trick_or_treat && ev.trick_or_treat.weekdays.includes(weekdayOf(day)));
  }

  // Dzień drzwi z `hide_bonuses`: pola bonusowe (dynie) nie działają. Czyta to
  // slResolveTileEffect — dla rzucającego i dla wypchniętych tak samo.
  function bonusesOff(day = todayWaw()) {
    const ev = events();
    return !!(ev && ev.trick_or_treat && ev.trick_or_treat.hide_bonuses && trickActive(day));
  }

  function cauldronPot() {
    const row = db.prepare(`
      SELECT -COALESCE(SUM(coins), 0) AS pot FROM sl_season_ledger
      WHERE board = ? AND kind IN ('cauldron_drop', 'cauldron_take')
    `).get(getSeason().id);
    return Math.max(0, Number(row.pot));
  }

  // Pola, na które nie wolno sypać cukierków: start, każde pole specjalne i każde pole
  // zdarzenia. Cukierek na takim polu oznaczałby dwa zdarzenia przy jednym lądowaniu.
  function blockedTiles() {
    const s = getSeason();
    const out = new Set([0]);
    for (const t of s.tiles) out.add(t.position);
    const ev = s.events || {};
    if (ev.cauldron) { ev.cauldron.drop.forEach(p => out.add(p)); out.add(ev.cauldron.ladle); }
    if (ev.trick_or_treat) ev.trick_or_treat.tiles.forEach(p => out.add(p));
    return out;
  }

  function candiesOnBoard() {
    // tile > 0: wiersz z tile = -1 to tylko znacznik „dziś już sypało" (patrz niżej),
    // a nie cukierek — nie może zajmować miejsca w limicie max_on_board.
    return db.prepare('SELECT id, tile FROM sl_candies WHERE board = ? AND collected_by IS NULL AND tile > 0')
      .all(getSeason().id);
  }

  // Codzienny wysyp cukierków — leniwie, przy pierwszym zajrzeniu do gry w dzień roboczy.
  // Sufit `max_on_board` pilnuje, żeby nikt nie zbierał kilku naraz tylko dlatego, że
  // przez tydzień nikt nie grał. Flaga to para (plansza, dzień), więc zmiana sezonu
  // w środku dnia sypie od razu na nowej planszy.
  function ensureCandySpawn() {
    const ev = events();
    if (!ev || !ev.candy) return;
    const today = todayWaw();
    if (isWeekendStr(today)) return;
    const board = getSeason().id;
    transaction(() => {
      const done = db.prepare('SELECT 1 FROM sl_candies WHERE board = ? AND spawn_day = ? LIMIT 1').get(board, today);
      if (done) return;
      const lying = candiesOnBoard();
      const room = Math.max(0, ev.candy.max_on_board - lying.length);
      const blocked = blockedTiles();
      lying.forEach(c => blocked.add(c.tile));
      const free = [];
      for (let t = 1; t < boardSize(); t++) if (!blocked.has(t)) free.push(t);
      const n = Math.min(ev.candy.per_day, room, free.length);
      const ins = db.prepare('INSERT INTO sl_candies (board, tile, spawn_day) VALUES (?, ?, ?)');
      for (let i = 0; i < n; i++) {
        const k = Math.floor(Math.random() * free.length);
        ins.run(board, free.splice(k, 1)[0], today);
      }
      // Znacznik dnia także wtedy, gdy nie było miejsca — inaczej każde zapytanie
      // próbowałoby sypać od nowa.
      if (n === 0) ins.run(board, -1, today);
    });
  }

  function ledger(playerId, kind, { points = 0, coins = 0, candies = 0, tile = null, ref = null, day = null } = {}) {
    db.prepare(`
      INSERT INTO sl_season_ledger (board, player_id, kind, points, coins, candies, tile, day, ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(getSeason().id, playerId, kind, points, coins, candies, tile, day || todayWaw(), ref);
    if (points || coins) {
      db.prepare('UPDATE sl_state SET total_points = total_points + ?, balance = balance + ? WHERE player_id = ?')
        .run(points, coins, playerId);
    }
    // Punkty z wydarzeń mają własną kategorię w rozbiciu — z tym samym `ref`, więc
    // „Cofnij ruch" skasuje je razem z resztą rozbicia tego ruchu.
    if (points) slLogPoints(playerId, 'season', points, ref, day || todayWaw());
  }

  function candyCount(playerId) {
    return Number(db.prepare(
      'SELECT COALESCE(SUM(candies), 0) AS c FROM sl_season_ledger WHERE board = ? AND player_id = ?'
    ).get(getSeason().id, playerId).c);
  }

  // Rozstrzyga zdarzenie na polu lądowania. NIC nie zapisuje — zwraca nowe `abs` (psikus
  // potrafi cofnąć pionek, a to musi się stać przed wypychaniem i przed zapisem ruchu),
  // opis dla odpowiedzi i apply(ref), które zapisze efekty, gdy ruch dostanie swoje id.
  function resolveLanding({ playerId, landedAbs, day, turnRef }) {
    const none = { abs: landedAbs, result: null, apply: () => {} };
    const ev = events();
    if (!ev) return none;
    const tile = tileOf(landedAbs);
    if (tile === 0) return none;

    // ── KOCIOŁ ──
    if (ev.cauldron && ev.cauldron.drop.includes(tile)) {
      const amount = ev.cauldron.amount;
      return {
        abs: landedAbs,
        result: { kind: 'cauldron_drop', tile, coins: -amount },
        apply: ref => {
          ledger(playerId, 'cauldron_drop', { coins: -amount, tile, ref, day });
          slLogActivity(playerId, 'season_event', `🧪 Kocioł zabrał ${amount} coins — w kotle jest teraz ${cauldronPot()}`, turnRef);
        }
      };
    }
    if (ev.cauldron && ev.cauldron.ladle === tile) {
      return {
        abs: landedAbs,
        // Kwotę liczymy w apply, na świeżo — w tej samej transakcji, tuż przed zapisem.
        result: { kind: 'cauldron_take', tile, coins: cauldronPot() },
        apply: ref => {
          const pot = cauldronPot();
          if (pot > 0) {
            ledger(playerId, 'cauldron_take', { coins: pot, tile, ref, day });
            slLogActivity(playerId, 'season_event', `🥄 Zgarnął chochlą cały kocioł: +${pot} coins!`, turnRef);
          } else {
            slLogActivity(playerId, 'season_event', '🥄 Sięgnął chochlą do kotła… pusto', turnRef);
          }
        }
      };
    }

    // ── CUKIEREK ALBO PSIKUS ── (tylko w dni z `weekdays`; w inne drzwi są zamknięte)
    if (ev.trick_or_treat && ev.trick_or_treat.tiles.includes(tile) && trickActive(day)) {
      const candyOn = !!ev.candy;
      const r = Math.random();
      if (r < 0.5) {
        // CUKIEREK: punkty albo — gdy trwa polowanie — 🍬 z drobnymi punktami.
        const withCandy = candyOn && r < 0.25;
        const pts = withCandy ? TREAT_CANDY_POINTS : TREAT_POINTS;
        return {
          abs: landedAbs,
          result: { kind: withCandy ? 'treat_candy' : 'treat', tile, points: pts, candies: withCandy ? 1 : 0 },
          apply: ref => {
            ledger(playerId, withCandy ? 'treat_candy' : 'treat', { points: pts, candies: withCandy ? 1 : 0, tile, ref, day });
            slLogActivity(playerId, 'season_event', withCandy
              ? `🍭 Cukierek albo psikus → cukierek! +🍬 i +${pts} pkt`
              : `🍭 Cukierek albo psikus → cukierek! +${pts} pkt`, turnRef);
          }
        };
      }
      if (r < 0.75) {
        return {
          abs: landedAbs,
          result: { kind: 'trick_egg', tile, coins: -TRICK_COINS },
          apply: ref => {
            ledger(playerId, 'trick_egg', { coins: -TRICK_COINS, tile, ref, day });
            slLogActivity(playerId, 'season_event', `🥚 Cukierek albo psikus → psikus! Zgniłe jajo: -${TRICK_COINS} coins`, turnRef);
          }
        };
      }
      // PSIKUS: duch straszy i pionek cofa się — ale nie przez start okrążenia.
      const lapStart = landedAbs - tile;
      const scaredAbs = Math.max(lapStart, landedAbs - TRICK_SCARE_TILES);
      return {
        abs: scaredAbs,
        result: { kind: 'trick_scare', tile, to_tile: tileOf(scaredAbs) },
        apply: ref => {
          ledger(playerId, 'trick_scare', { tile, ref, day });
          slLogActivity(playerId, 'season_event', `👻 Cukierek albo psikus → psikus! Duch przestraszył go z pola ${tile} na ${tileOf(scaredAbs)}`, turnRef);
        }
      };
    }

    // ── CUKIEREK NA POLU ──
    if (ev.candy) {
      const candy = db.prepare('SELECT id FROM sl_candies WHERE board = ? AND tile = ? AND collected_by IS NULL LIMIT 1')
        .get(getSeason().id, tile);
      if (candy) {
        return {
          abs: landedAbs,
          result: { kind: 'candy', tile, candies: 1 },
          apply: ref => {
            db.prepare('UPDATE sl_candies SET collected_by = ?, collected_ref = ?, collected_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(playerId, ref, candy.id);
            ledger(playerId, 'candy', { candies: 1, tile, ref, day });
            slLogActivity(playerId, 'season_event', `🍬 Znalazł cukierka na polu ${tile}! (ma już ${candyCount(playerId)})`, turnRef);
          }
        };
      }
    }
    return none;
  }

  // Discord — po zatwierdzeniu ruchu. Tylko rzeczy warte pingu: pełna chochla i psikusy.
  function emitFor(result, nickname) {
    if (!result) return;
    if (result.kind === 'cauldron_take' && result.coins >= 20) {
      slEmit('tile_landing', () => `🥄 **${nickname}** zgarnął chochlą cały kocioł — **+${result.coins} coins**!`);
    } else if (result.kind === 'trick_scare') {
      slEmit('tile_landing', () => `👻 **${nickname}** zapukał do drzwi, a tam duch — cofka na pole **${result.to_tile}**.`);
    }
  }

  // ── COFANIE ──
  // Odwraca wiersze rejestru (punkty i coins dokładnie o tyle, ile dopisały), oddaje
  // cukierki na planszę i kasuje wiersze. Rozbicie punktów (sl_points_log) kasuje wołający
  // po tym samym `ref` — tak robi już „Cofnij ruch".
  function revertRows(rows) {
    const upd = db.prepare('UPDATE sl_state SET total_points = total_points - ?, balance = balance - ? WHERE player_id = ?');
    for (const r of rows) {
      if (r.player_id != null && (r.points || r.coins)) upd.run(Number(r.points), Number(r.coins), r.player_id);
      if (r.ref) {
        db.prepare('UPDATE sl_candies SET collected_by = NULL, collected_ref = NULL, collected_at = NULL WHERE collected_ref = ?').run(r.ref);
      }
      db.prepare('DELETE FROM sl_season_ledger WHERE id = ?').run(r.id);
    }
    return rows.length;
  }
  // ŚCIEŻKA COFANIA #2 — cofnięcie ruchu.
  function revertRef(ref) {
    return revertRows(db.prepare('SELECT * FROM sl_season_ledger WHERE ref = ?').all(ref));
  }
  // ŚCIEŻKA COFANIA #1 — cofnięcie dnia (sl_points_log tego dnia kasuje slRollbackDay).
  function revertDay(day) {
    return revertRows(db.prepare('SELECT * FROM sl_season_ledger WHERE day = ?').all(day));
  }
  // ŚCIEŻKA COFANIA #4 — reset gry.
  function resetAll() {
    db.exec('DELETE FROM sl_season_ledger; DELETE FROM sl_candies;');
  }
  // ŚCIEŻKA COFANIA #5 — wyczyszczenie gracza. Jego wiersze kotła ZOSTAJĄ, tylko bez
  // gracza: skasowanie wrzutki zmniejszyłoby pulę (coins znikają), a skasowanie wyjęcia
  // POWIĘKSZYŁOBY ją — czyli wydrukowało coins dla następnego z chochlą.
  function clearPlayer(playerId) {
    db.prepare(`UPDATE sl_season_ledger SET player_id = NULL WHERE player_id = ? AND kind IN ('cauldron_drop', 'cauldron_take')`).run(playerId);
    db.prepare('DELETE FROM sl_season_ledger WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_candies WHERE collected_by = ?').run(playerId);
  }

  // Cukierki wszystkich graczy w bieżącym sezonie — do rankingu, jednym zapytaniem.
  // null = sezon bez polowania (ranking wtedy w ogóle nie pokazuje kolumny cukierków).
  function candyMap() {
    const ev = events();
    if (!ev || !ev.candy) return null;
    const map = new Map();
    for (const r of db.prepare(`
      SELECT player_id, SUM(candies) AS c FROM sl_season_ledger
      WHERE board = ? AND candies > 0 AND player_id IS NOT NULL GROUP BY player_id
    `).all(getSeason().id)) map.set(r.player_id, Number(r.c));
    return map;
  }

  // Stan do UI. null = sezon bez mechanik.
  function payload(playerId) {
    const ev = events();
    if (!ev) return null;
    ensureCandySpawn();
    const board = getSeason().id;
    const out = {};
    if (ev.cauldron) out.cauldron = { drop: ev.cauldron.drop, ladle: ev.cauldron.ladle, amount: ev.cauldron.amount, pot: cauldronPot() };
    if (ev.trick_or_treat) {
      out.trick_or_treat = {
        tiles: ev.trick_or_treat.tiles, weekdays: ev.trick_or_treat.weekdays,
        active: trickActive(todayWaw()), bonuses_off: bonusesOff()
      };
    }
    if (ev.candy) {
      const ranking = db.prepare(`
        SELECT l.player_id, p.nickname, SUM(l.candies) AS c
        FROM sl_season_ledger l JOIN players p ON p.id = l.player_id
        WHERE l.board = ? AND l.candies > 0
        GROUP BY l.player_id ORDER BY c DESC, MIN(l.id) ASC
      `).all(board).map((r, i) => ({ rank: i + 1, player_id: r.player_id, nickname: r.nickname, candies: Number(r.c), is_me: r.player_id === playerId }));
      out.candy = {
        tiles: candiesOnBoard().map(c => c.tile),
        mine: candyCount(playerId),
        ranking
      };
    }
    return out;
  }

  return {
    initSchema, resolveLanding, emitFor, payload, ensureCandySpawn, bonusesOff, candyMap,
    revertRef, revertDay, resetAll, clearPlayer,
  };
};
