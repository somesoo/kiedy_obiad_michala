'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// ZAMKNIĘCIE SEZONU — archiwum rankingu, medale i ukoronowanie na podium
// ══════════════════════════════════════════════════════════════════════════════
//
// Przełączenie sezonu w panelu (z zaznaczonym „zamknij sezon") robi zdjęcie końcowego
// rankingu do archiwum, a potem server.js zeruje grę: punkty, coins, okrążenia,
// ekwipunek. Zostają kostiumy, bo to kosmetyka. Dzięki temu każdy sezon zaczyna się
// z równymi szansami, a stare wyniki żyją dalej jako medale przy nicku i ranking
// z przełącznikiem sezonów.
//
// Archiwum to ZDJĘCIE, a nie przeliczenie z logów: po zamknięciu nic go nie zmienia
// (cofanie ruchu i dnia nie sięga za granicę sezonu, patrz season_move_floor), więc
// raz przyznany medal zostaje na zawsze.
//
// Fabryka jak boss i kostiumy: helpery z server.js przychodzą w `deps`, żeby nie
// robić cyklu importów.

module.exports = function createCrowningModule(deps) {
  const { db, ensureColumn, slAvatarUrl } = deps;

  const PODIUM = 3;

  function initSchema() {
    db.exec(`
      -- Jeden wiersz na każde zamknięcie. Klucz to własne id, a nie id planszy: ten sam
      -- plik sezonu (np. Noc Duchów) można odpalić w kolejnym roku i to będzie osobny sezon.
      CREATE TABLE IF NOT EXISTS snakes.sl_season_closures (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        board      TEXT NOT NULL,             -- id pliku planszy zamkniętego sezonu
        name       TEXT NOT NULL,             -- nazwa w chwili zamknięcia (tak ją pamiętają gracze)
        players    INTEGER DEFAULT 0,
        closed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      -- Końcowy ranking. Nick jest zapisany, bo wiersz ma przetrwać wyczyszczenie gracza
      -- albo zmianę nicku; na ekranie i tak pierwszeństwo ma bieżący nick z "players".
      CREATE TABLE IF NOT EXISTS snakes.sl_season_results (
        closure_id    INTEGER NOT NULL,
        player_id     INTEGER NOT NULL,
        place         INTEGER NOT NULL,
        nickname      TEXT,
        total_points  INTEGER NOT NULL,
        laps          INTEGER DEFAULT 0,
        tile          INTEGER DEFAULT 0,
        candies       INTEGER,                -- NULL = sezon bez polowania na cukierki
        PRIMARY KEY (closure_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS snakes.idx_season_results_player ON sl_season_results(player_id, place);
    `);
    // Które zamknięcie gracz już widział jako animację (id z sl_season_closures).
    // 0 = żadnego — ale animacja i tak czeka tylko na tych, którzy są w wynikach.
    ensureColumn('sl_state', 'crowned_seen', 'INTEGER DEFAULT 0');
  }

  // Zdjęcie rankingu przed wyzerowaniem. Musi lecieć W TEJ SAMEJ transakcji co zerowanie,
  // inaczej rzut między jednym a drugim wpadłby do żadnego sezonu.
  //
  // Kto trafia do archiwum: każdy, kto w tym sezonie coś zrobił — ma punkty albo choć jeden
  // ruch od początku sezonu. Ktoś, kto tylko zajrzał (sl_state powstaje leniwie przy pierwszym
  // wejściu), nie zajmuje miejsca w rankingu i nie dostaje animacji.
  //
  // Kolejność jak w rankingu na żywo: punkty, przy remisie okrążenia i dalej pole
  // (abs_pos łączy jedno i drugie). player_id na końcu tylko dla determinizmu.
  function archiveSeason({ board, name, moveFloor, candies, tileOf }) {
    const rows = db.prepare(`
      SELECT s.player_id, p.nickname, s.total_points, s.laps, s.abs_pos
      FROM sl_state s JOIN players p ON p.id = s.player_id
      WHERE s.total_points <> 0
         OR EXISTS (SELECT 1 FROM sl_moves m WHERE m.player_id = s.player_id AND m.id > ?)
      ORDER BY s.total_points DESC, s.abs_pos DESC, s.player_id ASC
    `).all(moveFloor);

    const closureId = Number(db.prepare('INSERT INTO sl_season_closures (board, name, players) VALUES (?, ?, ?)')
      .run(board, name, rows.length).lastInsertRowid);
    const ins = db.prepare(`
      INSERT INTO sl_season_results (closure_id, player_id, place, nickname, total_points, laps, tile, candies)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rows.forEach((r, i) => ins.run(
      closureId, r.player_id, i + 1, r.nickname, Number(r.total_points), Number(r.laps), tileOf(Number(r.abs_pos)),
      candies ? (candies.get(r.player_id) || 0) : null
    ));
    return {
      id: closureId, name, players: rows.length,
      podium: rows.slice(0, PODIUM).map((r, i) => ({ place: i + 1, nickname: r.nickname, total_points: Number(r.total_points) }))
    };
  }

  function closures() {
    return db.prepare('SELECT id, board, name, players, closed_at FROM sl_season_closures ORDER BY id DESC').all()
      .map(c => ({ id: Number(c.id), board: c.board, name: c.name, players: Number(c.players), closed_at: c.closed_at }));
  }

  // Medale wszystkich graczy jednym zapytaniem — ranking buduje się dla kilkunastu osób naraz.
  // Od najstarszego sezonu, żeby rząd medali przy nicku czytał się jak historia.
  function medalsMap() {
    const map = new Map();
    for (const r of db.prepare(`
      SELECT r.player_id, r.place, c.id AS closure_id, c.name
      FROM sl_season_results r JOIN sl_season_closures c ON c.id = r.closure_id
      WHERE r.place <= ${PODIUM}
      ORDER BY c.id ASC
    `).all()) {
      if (!map.has(r.player_id)) map.set(r.player_id, []);
      map.get(r.player_id).push({ place: Number(r.place), season: r.name, closure_id: Number(r.closure_id) });
    }
    return map;
  }

  // Ranking zamkniętego sezonu. Awatar i nick bieżące (z LEFT JOIN, bo gracz mógł zostać
  // wyczyszczony), punkty i miejsca z archiwum.
  function ranking(closureId, meId) {
    const c = db.prepare('SELECT id, board, name, players, closed_at FROM sl_season_closures WHERE id = ?').get(closureId);
    if (!c) return null;
    const medals = medalsMap();
    const rows = db.prepare(`
      SELECT r.*, COALESCE(p.nickname, r.nickname) AS nick
      FROM sl_season_results r LEFT JOIN players p ON p.id = r.player_id
      WHERE r.closure_id = ? ORDER BY r.place ASC
    `).all(closureId);
    return {
      season: { id: Number(c.id), board: c.board, name: c.name, players: Number(c.players), closed_at: c.closed_at },
      leaderboard: rows.map(r => ({
        rank: Number(r.place),
        player_id: r.player_id,
        nickname: r.nick,
        total_points: Number(r.total_points),
        laps: Number(r.laps),
        tile: Number(r.tile),
        candies: r.candies == null ? null : Number(r.candies),
        medals: medals.get(r.player_id) || [],
        is_me: meId ? r.player_id === meId : false
      }))
    };
  }

  // Ukoronowanie dla gracza — tylko OSTATNIE zamknięcie i tylko dla tych, którzy w nim
  // grali. Nowy gracz (nie ma go w wynikach) nie dostaje animacji cudzego sezonu.
  // Pamięć „już widziałem" siedzi na serwerze, a nie w localStorage: animacja ma pokazać
  // się raz na osobę, a nie raz na każdą przeglądarkę i telefon.
  function crowningFor(playerId) {
    const last = db.prepare('SELECT id, name, players, closed_at FROM sl_season_closures ORDER BY id DESC LIMIT 1').get();
    if (!last) return null;
    const seen = db.prepare('SELECT crowned_seen FROM sl_state WHERE player_id = ?').get(playerId);
    if (seen && Number(seen.crowned_seen) >= Number(last.id)) return null;
    const mine = db.prepare('SELECT place, total_points FROM sl_season_results WHERE closure_id = ? AND player_id = ?')
      .get(last.id, playerId);
    if (!mine) return null;
    const podium = db.prepare(`
      SELECT r.player_id, r.place, r.total_points, r.laps, COALESCE(p.nickname, r.nickname) AS nick, s.avatar_updated_at
      FROM sl_season_results r
      LEFT JOIN players p ON p.id = r.player_id
      LEFT JOIN sl_state s ON s.player_id = r.player_id
      WHERE r.closure_id = ? AND r.place <= ${PODIUM}
      ORDER BY r.place ASC
    `).all(last.id);
    return {
      closure_id: Number(last.id),
      season_name: last.name,
      players: Number(last.players),
      podium: podium.map(r => ({
        place: Number(r.place),
        player_id: r.player_id,
        nickname: r.nick,
        avatar_url: slAvatarUrl(r.player_id, r.avatar_updated_at),
        total_points: Number(r.total_points),
        laps: Number(r.laps),
        is_me: r.player_id === playerId
      })),
      me: { place: Number(mine.place), total_points: Number(mine.total_points) }
    };
  }

  function markSeen(playerId, closureId) {
    // Sufit na ostatnim zamknięciu — inaczej wysłanie id „z przyszłości" wyłączyłoby
    // animację przyszłych sezonów.
    db.prepare(`
      UPDATE sl_state SET crowned_seen = MAX(COALESCE(crowned_seen, 0),
        MIN(?, COALESCE((SELECT MAX(id) FROM sl_season_closures), 0)))
      WHERE player_id = ?
    `).run(Math.max(0, parseInt(closureId, 10) || 0), playerId);
  }

  // ŚCIEŻKA #5 — wyczyszczenie gracza znika go też z archiwum. Miejsc innych NIE
  // przenumerowujemy: medal raz przyznany za 2. miejsce nie zmienia się w złoty tylko
  // dlatego, że admin wyczyścił kogoś z pierwszego.
  // Reset gry (ścieżka #4) archiwum NIE rusza — to zamknięta historia, nie żywa gra.
  function clearPlayer(playerId) {
    db.prepare('DELETE FROM sl_season_results WHERE player_id = ?').run(playerId);
  }

  function registerRoutes(app, { authPlayer }) {
    // GET /api/snakes/seasons/:id — ranking zamkniętego sezonu (zakładka w rankingu).
    // Token nieobowiązkowy: bez niego po prostu nikt nie jest podświetlony jako „ja",
    // tak jak w publicznym /api/snakes/board.
    app.get('/api/snakes/seasons/:id', (req, res) => {
      const token = req.headers['x-token'];
      const me = token ? db.prepare('SELECT id FROM players WHERE token = ?').get(token) : null;
      const out = ranking(parseInt(req.params.id, 10), me ? me.id : null);
      if (!out) return res.status(404).json({ error: 'Nie ma takiego sezonu.' });
      res.json(out);
    });

    // POST /api/snakes/crowning/seen { closure_id } — gracz obejrzał podium.
    app.post('/api/snakes/crowning/seen', authPlayer, (req, res) => {
      markSeen(req.player.id, req.body && req.body.closure_id);
      res.json({ success: true });
    });
  }

  return { initSchema, archiveSeason, closures, medalsMap, ranking, crowningFor, markSeen, clearPlayer, registerRoutes, PODIUM };
};
