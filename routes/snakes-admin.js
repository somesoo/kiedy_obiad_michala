// ══ PANEL ADMINA SNAKES — trasy /api/snakes/admin/* ══
// Ustawienia (Discord, godziny gry), sezony, gracze (statystyki, ekwipunek, efekty, cofnięcie
// ruchu, usunięcie), reset gry i wyłączone cofanie dnia. Każda trasa zaczyna od checkAdmin:
// GET/DELETE biorą ?password=, POST bierze {password} w ciele.
//
// Trasy admina od bossa, kostiumów i skinów wsparcia mieszkają w swoich modułach
// (lib/boss.js, lib/costumes.js), a od dziennika w lib/activity.js.
//
// PIĘĆ ŚCIEŻEK COFANIA musi zostać spójnych (CLAUDE.md): cofnięcie dnia (slRollbackDay —
// trasa wyłączona stałą SL_DAY_ROLLBACK_ENABLED, ale funkcja żyje), cofnięcie ruchu,
// cofnięcie nagród bossa, reset gry i wyczyszczenie gracza. Cztery z nich są tutaj —
// dokładając coś, co zapisuje punkty albo coins, sprawdź wszystkie.

module.exports = function registerSnakesAdminRoutes(deps) {
  const {
    app, checkAdmin, slEventsConfig, SL_EVENT_LABELS, SL_EVENT_DEFAULTS,
    SL_DISCORD_WEBHOOK_URL, SL_SUMMARY_HOUR, slBoardSize, slCurrentBoard, SL_POWERUP_COSTS,
    SL_POWERUP_LABELS, slPlayHours, boss, db, SL_PLAY_META_START, SL_PLAY_META_END,
    SL_PLAY_META_WEEKENDS, transaction, slMetaSet, costumes, seasonal, slEmit, seasons,
    slCloseSeasonAndInstall, slInstallBoard, SNAKES_URL, slPostDiscord, slBoardPayload,
    todayWaw, slDailyRollsFor, slTileOf, crowning, slEnsureState, SL_DAILY_ROLLS,
    slSetEventsConfig, SL_MAX_EXTRA_ROLLS, slSeasonMoveFloor, slInventory,
    SL_POWERUP_TYPES
  } = deps;

  // GET /api/snakes/admin/settings?password= — konfiguracja zdarzeń + stan co-opu
  app.get('/api/snakes/admin/settings', (req, res) => {
    if (!checkAdmin(req, res)) return;
    res.json({
      events: slEventsConfig(),
      labels: SL_EVENT_LABELS,
      defaults: SL_EVENT_DEFAULTS,
      webhook_configured: !!SL_DISCORD_WEBHOOK_URL,
      summary_hour: SL_SUMMARY_HOUR,
      board: (b => ({ id: b.id, name: b.name, size: slBoardSize(), cols: b.cols, rows: b.rows }))(slCurrentBoard()),
      powerup_costs: SL_POWERUP_COSTS,
      // Panel pokazuje koszty pod nazwami, które widzi gracz — inaczej admin czytałby
      // surowy klucz `double_move`, gdy reszta gry mówi o nim „Extra Move".
      powerup_labels: SL_POWERUP_LABELS,
      play_hours: slPlayHours(),
      boss_enabled: boss.slBossEnabled(),
      // null = boss wyłączony; panel czyta to jako „nie ma czym sterować" (patrz renderInfo).
      coop: boss.slBossEnabled() ? boss.slCoopPayload(null) : null
    });
  });

  // POST /api/snakes/admin/play-hours { password, start, end, weekends } albo { password, reset: true }
  // Okno, w którym wolno rzucać (godziny czasu Warszawy, `end` wyłącznie, 24 = do północy).
  // Głównie na testy: 0–24 z weekendami zdejmuje blokadę całkiem. `reset` wraca do okna
  // z env (SNAKES_PLAY_*_HOUR). Liczba dziennych ruchów się nie zmienia — dalej liczy się
  // po dniu kalendarzowym, więc szersze okno nie daje nikomu dodatkowych rzutów.
  app.post('/api/snakes/admin/play-hours', (req, res) => {
    if (!checkAdmin(req, res)) return;
    if (req.body.reset === true) {
      db.prepare('DELETE FROM sl_meta WHERE key IN (?, ?, ?)')
        .run(SL_PLAY_META_START, SL_PLAY_META_END, SL_PLAY_META_WEEKENDS);
    } else {
      const start = Number(req.body.start);
      const end = Number(req.body.end);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 1 || end > 24) {
        return res.status(400).json({ error: 'Godziny muszą być liczbami całkowitymi: początek 0–23, koniec 1–24.' });
      }
      if (start >= end) {
        return res.status(400).json({ error: 'Koniec okna musi być później niż początek.' });
      }
      transaction(() => {
        slMetaSet(SL_PLAY_META_START, start);
        slMetaSet(SL_PLAY_META_END, end);
        slMetaSet(SL_PLAY_META_WEEKENDS, req.body.weekends ? '1' : '0');
      });
    }
    const hours = slPlayHours();
    console.log(`Snakes/Admin: okno gry ${hours.start}:00–${hours.end}:00${hours.weekends ? ' z weekendami' : ' (pon–pt)'}${hours.custom ? '' : ' — domyślne'}`);
    res.json({ success: true, play_hours: hours });
  });

  // POST /api/snakes/admin/reset { password } — twardy reset CAŁEJ gry Snakes do stanu
  // zerowego: każdy gracz wraca na pole 0 z saldem/punktami 0, ekwipunkiem power-upów
  // wyczyszczonym i bez oczekujących efektów (Freeze/Curse/Shield/Extra Move). Historia
  // ruchów i dziennik aktywności są kasowane, a pula co-op wraca do świeżej edycji #1
  // z bazowym progiem/czasem (patrz slCurrentCoop). Gracze i ich AWATARY
  // (pionki) NIE są ruszane — konta w Snakes zostają, tylko ich postęp w grze wraca do zera.
  // Wordle jest kompletnie nietknięte (osobne tabele). Nieodwracalne — potwierdzenie
  // (i podwójne potwierdzenie w UI) leży po stronie panelu admina.
  app.post('/api/snakes/admin/reset', (req, res) => {
    if (!checkAdmin(req, res)) return;

    const out = transaction(() => {
      const playersAffected = Number(db.prepare('SELECT COUNT(*) AS c FROM sl_state').get().c);
      db.exec(`
        UPDATE sl_state SET abs_pos = 0, laps = 0, balance = 0, total_points = 0,
          last_move_date = NULL, rolls_today = 0, last_move_at = NULL;
        DELETE FROM sl_moves;
        DELETE FROM sl_inventory;
        DELETE FROM sl_effects;
        DELETE FROM sl_activity;
        DELETE FROM sl_points_log;
      `);
      // ŚCIEŻKA COFANIA #4 — wszystko po bossie (cykle, obrażenia, rejestr wypłat) kasuje
      // moduł, żeby lista tabel do wyczyszczenia mieszkała tam, gdzie te tabele powstają.
      boss.slResetBossData();
      costumes.slResetCostumes(); // reset = zerowe konto, więc i szafa pusta (poza skinami wsparcia)
      seasonal.resetAll();
      // sl_coop pusty → następne wywołanie slCurrentCoop() samo założy świeżą edycję #1,
      // zakotwiczoną od teraz (dokładnie jak przy zupełnie nowej instalacji).
      return { players_affected: playersAffected, coop: boss.slCoopPayload(null) };
    });

    slEmit('coop_completed', () => '🔄 **Admin zresetował grę Snakes & Ladders** — wszyscy wracają na start z zerowym kontem.');

    res.json({ success: true, ...out });
  });

  // GET /api/snakes/admin/seasons?password= — lista sezonów z boards/ (tylko poprawne
  // pliki; błędne lądują w logu przy starcie) i to, który jest aktywny.
  app.get('/api/snakes/admin/seasons', (req, res) => {
    if (!checkAdmin(req, res)) return;
    res.json({ active: slCurrentBoard().id, seasons: seasons.list() });
  });

  // POST /api/snakes/admin/season { password, board, close? } — przełącza sezon planszy.
  // Domyślnie (close ≠ false) ZAMYKA poprzedni sezon: ranking idzie do archiwum, podium
  // dostaje medale, a wszyscy zaczynają od zera (slCloseSeasonAndInstall). Z close: false
  // tylko zmienia planszę — wszyscy na pole 0, reszta zostaje. Ruchów sprzed zmiany
  // nie da się już cofnąć (patrz slResetPositionsToStart). Ponowne włączenie AKTYWNEGO
  // sezonu też resetuje pozycje — to świadome: „zacznijmy sezon od nowa".
  app.post('/api/snakes/admin/season', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const season = seasons.get(String(req.body.board || ''));
    if (!season) return res.status(404).json({ error: 'Nie ma takiego sezonu (albo jego plik ma błąd — patrz logi serwera).' });

    const previous = slCurrentBoard().id;
    // Domyślnie przełączenie ZAMYKA sezon (archiwum, medale, wszyscy od zera). Bez zamykania
    // — tylko w razie pomyłki albo testów: sama zmiana planszy, wszystko inne zostaje.
    const close = req.body.close !== false;
    let moved, closure = null, candyPrize = null;
    if (close) {
      const out = slCloseSeasonAndInstall(season);
      moved = out.moved;
      closure = out.closure;
      candyPrize = out.candyPrize;
      console.log(`Snakes/Admin: sezon ${previous} ZAMKNIĘTY (#${closure.id}, ${closure.players} graczy w archiwum) → ${season.id} (${season.size} pól), wszyscy od zera`);
    } else {
      moved = slInstallBoard(season, true, true);
      console.log(`Snakes/Admin: sezon ${previous} → ${season.id} (${season.size} pól), ${moved} graczy na polu 0 (bez zamykania)`);
    }
    // Sezon z własnym bossem (special_boss) wystawia go OD RAZU, a nie przy kolejnej edycji.
    // Po zamknięciu to no-op (nowy cykl już jest bossem sezonu), bez zamknięcia — zwraca wpłaty.
    boss.slEnsureSpecialBoss();

    let content;
    if (closure) {
      const medal = ['🥇', '🥈', '🥉'];
      const podium = closure.podium.map(p => `${medal[p.place - 1]} **${p.nickname}** (${p.total_points} pkt)`).join('\n');
      // Łowca cukierków (sezon z events.candy.prize) — nagroda to kostium, więc nick jawnie.
      const hunters = candyPrize && candyPrize.winners.length
        ? candyPrize.winners.map(id => (db.prepare('SELECT nickname FROM players WHERE id = ?').get(id) || {}).nickname).filter(Boolean)
        : [];
      const hunt = hunters.length
        ? `\n🍬 Najwięcej cukierków (${candyPrize.candies}): ${hunters.map(n => `**${n}**`).join(', ')} — nagroda czeka w garderobie!` : '';
      content = `🏆 **Koniec sezonu ${closure.name}!**` + (podium ? `\n${podium}` : '') + hunt
        + `\n\n🗺️ **Startuje nowy sezon: ${season.name}.** Wszyscy od zera: punkty, coins, okrążenia i ekwipunek. Kostiumy zostają.\n${SNAKES_URL}`;
    } else {
      content = `🗺️ **Nowa plansza: ${season.name}!** Wszyscy startują od pola 0 — punkty i coins zostają.`;
    }
    slPostDiscord({ content }).catch(err => console.error('Snakes/Discord [season]:', err.message));

    res.json({ success: true, active: season.id, players_moved: moved, closure, board: slBoardPayload() });
  });

  // GET /api/snakes/admin/players — lista graczy z ich stanem w Snakes & Ladders
  // (tylko ci, którzy mieli już z grą kontakt — sl_state powstaje leniwie przy pierwszym
  // zapytaniu o stan). Do wyboru gracza w akcjach admina niżej.
  app.get('/api/snakes/admin/players', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const today = todayWaw();
    const rows = db.prepare(`
      SELECT s.player_id, p.nickname, s.abs_pos, s.laps, s.balance, s.total_points, s.last_move_date, s.rolls_today,
             s.extra_rolls, s.extra_rolls_date
      FROM sl_state s JOIN players p ON p.id = s.player_id
      ORDER BY p.nickname COLLATE NOCASE ASC
    `).all();
    res.json({
      players: rows.map(r => {
        const rollsUsedToday = r.last_move_date === today ? Number(r.rolls_today) : 0;
        const dailyRolls = slDailyRollsFor(r, today);
        return {
          player_id: r.player_id,
          nickname: r.nickname,
          tile: slTileOf(r.abs_pos),
          laps: Number(r.laps),
          balance: Number(r.balance),
          total_points: Number(r.total_points),
          last_move_date: r.last_move_date,
          rolls_used_today: rollsUsedToday,
          daily_rolls: dailyRolls,
          moved_today: rollsUsedToday >= dailyRolls
        };
      }),
      today
    });
  });

  // DELETE /api/snakes/admin/players/:id — usuwa gracza WYŁĄCZNIE z trybu Snakes.
  // Kasuje jego stan, ekwipunek, dziennik ruchów, aktywne/przychodzące efekty i wpłaty
  // do puli co-op. Konto (players) i dane Wordle zostają nietknięte — to ten sam login,
  // więc gracz może dalej grać w Wordle, a w Snakes wystartuje od zera przy następnym
  // wejściu (sl_state tworzy się leniwie).
  app.delete('/api/snakes/admin/players/:id', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const playerId = parseInt(req.params.id, 10);
    const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

    transaction(() => {
      db.prepare('DELETE FROM sl_moves WHERE player_id = ?').run(playerId);
      db.prepare('DELETE FROM sl_inventory WHERE player_id = ?').run(playerId);
      db.prepare('DELETE FROM sl_effects WHERE target_player_id = ? OR source_player_id = ?').run(playerId, playerId);
      boss.slClearPlayerBossData(playerId); // ŚCIEŻKA COFANIA #5 — wkłady i wypłaty bossa
      costumes.slClearPlayerCostumes(playerId);
      seasonal.clearPlayer(playerId);
      crowning.clearPlayer(playerId);
      db.prepare('DELETE FROM sl_activity WHERE player_id = ?').run(playerId);
      db.prepare('DELETE FROM sl_points_log WHERE player_id = ?').run(playerId);
      db.prepare('DELETE FROM sl_state WHERE player_id = ?').run(playerId);
    });

    res.json({ success: true, deleted: player.nickname });
  });

  // POST /api/snakes/admin/players/:id/grant-move { password, date? } — oddaje graczowi
  // JEDEN dodatkowy ruch danego dnia (domyślnie dziś, wg czasu Warszawy) — z SL_DAILY_ROLLS
  // dostępnych ruchów cofa licznik zużycia o jeden i kasuje ostatni zapisany ruch z tego
  // dnia. NIE cofa punktów/pozycji z ruchów już wykonanych — to dodatkowa szansa, nie
  // cofnięcie. Wołane wielokrotnie odda kolejne sloty (aż do pełnego dziennego limitu).
  app.post('/api/snakes/admin/players/:id/grant-move', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const playerId = parseInt(req.params.id, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : todayWaw();

    const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

    const result = transaction(() => {
      const st = slEnsureState(playerId);
      if (st.last_move_date !== date) return { already_full: true };
      const used = Number(st.rolls_today);
      if (used <= 0) return { already_full: true };
      db.prepare('DELETE FROM sl_moves WHERE player_id = ? AND move_date = ? AND move_seq = ?')
        .run(playerId, date, used);
      db.prepare('UPDATE sl_state SET rolls_today = ? WHERE player_id = ?').run(used - 1, playerId);
      return { already_full: false, rolls_used_today: used - 1 };
    });

    if (result.already_full) {
      return res.status(400).json({ error: `${player.nickname} ma już pełny limit ruchów na ${date}.` });
    }
    res.json({ success: true, nickname: player.nickname, date, rolls_used_today: result.rolls_used_today, daily_rolls: SL_DAILY_ROLLS });
  });

  // POST /api/snakes/admin/settings { password, events: { typ: bool } } — przełącz zdarzenia
  app.post('/api/snakes/admin/settings', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const events = slSetEventsConfig(req.body.events);
    res.json({ success: true, events });
  });

  // POST /api/snakes/admin/discord-test { password } — testowy strzał w webhooka
  app.post('/api/snakes/admin/discord-test', async (req, res) => {
    if (!checkAdmin(req, res)) return;
    if (!SL_DISCORD_WEBHOOK_URL) {
      return res.status(400).json({ error: 'Brak webhooka — ustaw SNAKES_DISCORD_WEBHOOK_URL lub DISCORD_WEBHOOK_URL w .env' });
    }
    try {
      await slPostDiscord({ content: '🐍 Test webhooka Office Snakes & Ladders — działa!' });
      res.json({ success: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // POST /api/snakes/admin/coop/complete { password, force? } — zamknij wydarzenie i wypłać
  // nagrody ręcznie. Normalnie robi to sama mechanika bossa (HP=0 przy rzucie/ataku, albo
  // timeout w schedulerze) — ten endpoint to głównie fallback na wypadek utkniętego eventu.
  // `force: true` domyka event NAWET jeśli boss żyje (bez premii za pokonanie — jak timeout).
  // Trasy admina od bossa (coop/complete, coop/config, coop/boss, coop/toggle,
  // coop/revert-rewards) mieszkają w lib/boss.js (registerRoutes).

  // GET /api/snakes/admin/moves?date=&player_id= — ruchy (nie dziennik) do podglądu:
  // z czego, na co, ile punktów. Stąd widać np. gracza, który zrobił ich dziś podejrzanie dużo.
  app.get('/api/snakes/admin/moves', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
    const playerId = req.query.player_id ? parseInt(req.query.player_id, 10) : null;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));

    const where = [];
    const args = [];
    if (date) { where.push('m.move_date = ?'); args.push(date); }
    if (Number.isInteger(playerId)) { where.push('m.player_id = ?'); args.push(playerId); }
    const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const moves = db.prepare(`
      SELECT m.id, m.player_id, p.nickname, m.move_date, m.move_seq, m.rolls,
             m.from_abs, m.to_abs, m.points, m.note, m.created_at
      FROM sl_moves m JOIN players p ON p.id = m.player_id
      ${sql} ORDER BY m.id DESC LIMIT ?
    `).all(...args, limit).map(m => ({ ...m, from_tile: slTileOf(m.from_abs), to_tile: slTileOf(m.to_abs) }));

    // Ile ruchów kto zrobił w wybranym dniu — od razu widać przekroczenia limitu.
    const perPlayer = db.prepare(`
      SELECT p.nickname, COUNT(*) AS moves, SUM(m.points) AS points
      FROM sl_moves m JOIN players p ON p.id = m.player_id
      ${sql} GROUP BY m.player_id, p.nickname ORDER BY moves DESC
    `).all(...args);

    res.json({
      success: true, moves, per_player: perPlayer,
      daily_max: SL_DAILY_ROLLS + SL_MAX_EXTRA_ROLLS,
      days: db.prepare('SELECT DISTINCT move_date FROM sl_moves ORDER BY move_date DESC LIMIT 60').all().map(r => r.move_date)
    });
  });

  // ── COFNIĘCIE CAŁEGO DNIA GRY ──
  // Kasuje wszystko, co wydarzyło się danego dnia, i stawia graczy tam, gdzie stali o 8:00.
  // Pozycję startową bierzemy z `from_abs` PIERWSZEGO ruchu gracza tego dnia — to dokładnie
  // pole, z którego zaczynał, zanim cokolwiek dziś rzucił. Punkty z tego dnia (a więc i
  // monety, bo rzut dolicza je do obu) odejmujemy, z podłogą na zerze.
  // Czego to NIE robi (świadomie):
  //   • nie zwraca monet wydanych w sklepie ani na ataki — kupione power-upy zostają
  //     w ekwipunku, wydane monety przepadają,
  //   • nie odkręca monet ukradzionych przy wypchnięciu/klątwie — kwota była przycinana do
  //     salda ofiary, więc realnie zabrana wartość nigdzie nie została zapisana,
  //   • nie kasuje oczekujących Freeze/Curse — atak padł, cel dowie się przy swoim ruchu.
  // Uwaga na wypchniętych: gracz, którego ktoś dziś zbił ZANIM sam zdążył rzucić, wróci na
  // pole sprzed swojego pierwszego rzutu, czyli już po wypchnięciu (a gracz, który dziś
  // wcale nie rzucał, zostaje tam, gdzie go zbito) — wypchnięcia nie mają w bazie zapisu
  // pozycji sprzed, więc tego jednego nie da się odtworzyć automatycznie. Takich graczy
  // zwracamy w `pushed_not_restored`, żeby dało się ich poprawić ręcznie z panelu.
  function slRollbackDay(date) {
    return transaction(() => {
      const movers = db.prepare(`
        SELECT m.player_id, p.nickname, SUM(m.points) AS points, COUNT(*) AS moves
        FROM sl_moves m JOIN players p ON p.id = m.player_id
        WHERE m.move_date = ? GROUP BY m.player_id, p.nickname
      `).all(date);

      const firstOfDay = db.prepare(`
        SELECT from_abs FROM sl_moves WHERE player_id = ? AND move_date = ?
        ORDER BY move_seq ASC, id ASC LIMIT 1
      `);
      // Saldo bez przycinania do zera — patrz „Cofnij ruch" (undo-move): MAX(0, …) drukowało
      // coins, a tutaj do tego przed revertami bossa i sezonu niżej.
      const restore = db.prepare(`
        UPDATE sl_state
        SET abs_pos = ?, laps = ?, total_points = MAX(0, total_points - ?), balance = balance - ?,
            rolls_today = 0, last_move_date = NULL, last_move_at = NULL
        WHERE player_id = ?
      `);

      const details = [];
      for (const m of movers) {
        const startAbs = Number(firstOfDay.get(m.player_id, date).from_abs);
        const pts = Number(m.points);
        restore.run(startAbs, Math.floor(startAbs / slBoardSize()), pts, pts, m.player_id);
        details.push({
          player_id: m.player_id, nickname: m.nickname, moves: Number(m.moves),
          points_removed: pts, back_to_tile: slTileOf(startAbs)
        });
      }

      // Kto dziś oberwał wypchnięciem, a sam nie rzucał — jego pozycji nie mamy z czego
      // odtworzyć. Zbieramy listę do zgłoszenia adminowi, ZANIM skasujemy dziennik.
      const pushedNotRestored = db.prepare(`
        SELECT DISTINCT a.player_id, p.nickname
        FROM sl_activity a JOIN players p ON p.id = a.player_id
        WHERE a.day = ? AND a.type = 'knockback' AND a.detail LIKE '%Wypchnięty%'
          AND a.player_id NOT IN (SELECT player_id FROM sl_moves WHERE move_date = ?)
      `).all(date, date).map(r => r.nickname);

      // Gracze bez ruchów, ale z licznikiem/slotami z tego dnia (np. kupili Extra Move
      // i nie zdążyli go zużyć) — też wracają do czystego limitu.
      db.prepare(`UPDATE sl_state SET rolls_today = 0, last_move_date = NULL, last_move_at = NULL WHERE last_move_date = ?`).run(date);
      db.prepare(`UPDATE sl_state SET extra_rolls = 0, extra_rolls_date = NULL WHERE extra_rolls_date = ?`).run(date);

      const moves = db.prepare('DELETE FROM sl_moves WHERE move_date = ?').run(date);
      // Rozbicie punktów z tego dnia znika razem z ruchami — inaczej kategorie zostałyby
      // z punktami, których w total_points już nie ma, i pula „sprzed podziału" zeszłaby
      // na minus. Kasujemy po `day`, bo dokładnie po to ta kolumna jest.
      db.prepare('DELETE FROM sl_points_log WHERE day = ?').run(date);
      // ŚCIEŻKA COFANIA #1 — wypłaty i kary bossa z tego dnia wracają na konta, a obrażenia
      // zadane tego dnia wracają bossowi na pasek (o ile walka wciąż trwa).
      const bossBack = boss.slRevertBossDay(date);
      seasonal.revertDay(date);
      const activity = db.prepare('DELETE FROM sl_activity WHERE day = ?').run(date);

      return {
        date,
        players: details.length,
        moves_deleted: moves.changes,
        activity_deleted: activity.changes,
        points_removed: details.reduce((a, d) => a + d.points_removed, 0),
        boss_payouts_reverted: bossBack.payouts_reverted,
        boss_hp_restored: bossBack.hp_restored,
        pushed_not_restored: pushedNotRestored,
        details
      };
    });
  }

  // ── COFANIE DNIA: WYŁĄCZONE ──
  // Funkcja czeka na przebudowę i do tego czasu jest zablokowana — świadoma decyzja
  // właściciela, nie awaria. Powody, dla których lepiej jej teraz nie używać:
  //   • odejmuje za dużo coins: rzut dopisuje do salda `earned - curseCoinSteal`, a cofanie
  //     zdejmuje pełne `earned` z obu kolumn, więc kto był pod klątwą Kieszonkowiec, traci
  //     50 coins za dużo (`sl_moves` nie pamięta dziś tej różnicy),
  //   • nie odkręca coins ukradzionych przy wypchnięciu ani wydanych w sklepie,
  //   • gracza, którego ktoś tego dnia zbił, a on sam nie rzucał, trzeba poprawić ręcznie,
  //   • od czasu przebudowy bossa dotyka też wypłat, kar i HP (slRevertBossDay), więc pomyłka
  //     kosztuje więcej niż kiedyś.
  // `slRollbackDay` ZOSTAJE nietknięta — przebudowa ma od czego wyjść, a przy okazji wołają
  // ją narzędzia bossa. Odblokowanie to zmiana tej jednej stałej na `true`.
  const SL_DAY_ROLLBACK_ENABLED = false;

  // POST /api/snakes/admin/day/rollback { password, date? } — cofa cały dzień gry do stanu
  // z 8:00 (domyślnie dzisiejszy, wg czasu Warszawy). Patrz slRollbackDay po szczegóły tego,
  // co wraca, a co zostaje. Nieodwracalne — potwierdzenie leży po stronie panelu.
  // Blokada siedzi TUTAJ, a nie tylko w panelu: trasa jest wystawiona na świat i schowanie
  // przycisku niczego by nie zamknęło.
  app.post('/api/snakes/admin/day/rollback', (req, res) => {
    if (!checkAdmin(req, res)) return;
    if (!SL_DAY_ROLLBACK_ENABLED) {
      return res.status(503).json({
        error: 'Cofanie dnia jest wyłączone — funkcja czeka na przebudowę (m.in. odejmuje za dużo coins po klątwie Kieszonkowiec i nie odkręca kradzieży przy wypchnięciu). Do pojedynczych poprawek użyj „Cofnij ostatni ruch" albo ręcznej edycji gracza.',
        disabled: true
      });
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : todayWaw();
    // Dzień z ruchami sprzed zmiany sezonu odpada w całości: ich from_abs to pole na innej
    // planszy (patrz slResetPositionsToStart). Częściowe cofnięcie dnia byłoby gorsze niż żadne.
    const preSeason = db.prepare('SELECT COUNT(*) AS c FROM sl_moves WHERE move_date = ? AND id <= ?')
      .get(date, slSeasonMoveFloor()).c;
    if (Number(preSeason) > 0) {
      return res.status(409).json({ error: `Tego dnia (${date}) zmienił się sezon planszy — ruchy sprzed zmiany stały na innej planszy, więc dnia nie da się cofnąć.` });
    }
    const out = slRollbackDay(date);
    console.log(`Snakes/Admin: cofnięto dzień ${date} — ${out.players} graczy, ${out.moves_deleted} ruchów, ${out.points_removed} pkt odjęte`);
    res.json({ success: true, ...out });
  });

  // POST /api/snakes/admin/players/:id/stats { password, balance?, total_points? } — ręczna
  // korekta salda (monet) i/lub sumy punktów gracza. Wartości ustawiane WPROST (nie delta),
  // bo panel pokazuje obok aktualne liczby. Nie rusza pozycji na planszy ani ekwipunku.
  app.post('/api/snakes/admin/players/:id/stats', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const playerId = parseInt(req.params.id, 10);

    // Każde pole osobno opcjonalne — panel wysyła tylko to, co admin faktycznie zmienił.
    const num = (v) => (v != null ? parseInt(v, 10) : null);
    const balance = num(req.body.balance);
    const totalPoints = num(req.body.total_points);
    const tile = num(req.body.tile);
    const laps = num(req.body.laps);
    const rollsToday = num(req.body.rolls_today);
    const extraRolls = num(req.body.extra_rolls);

    const bad = (v, min, max, label) =>
      v != null && (!Number.isInteger(v) || v < min || (max != null && v > max)) ? label : null;
    const err = bad(balance, 0, null, 'Coins muszą być liczbą całkowitą ≥ 0.')
      || bad(totalPoints, 0, null, 'Punkty muszą być liczbą całkowitą ≥ 0.')
      || bad(tile, 0, slBoardSize() - 1, `Pole musi być z zakresu 0–${slBoardSize() - 1}.`)
      || bad(laps, 0, null, 'Okrążenia muszą być liczbą całkowitą ≥ 0.')
      || bad(rollsToday, 0, null, 'Zużyte rzuty muszą być liczbą całkowitą ≥ 0.')
      || bad(extraRolls, 0, SL_MAX_EXTRA_ROLLS, `Dodatkowe sloty: 0–${SL_MAX_EXTRA_ROLLS}.`);
    if (err) return res.status(400).json({ error: err });

    if ([balance, totalPoints, tile, laps, rollsToday, extraRolls].every(v => v == null)) {
      return res.status(400).json({ error: 'Nie podano żadnej zmiany.' });
    }

    const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

    const out = transaction(() => {
      const st = slEnsureState(playerId);
      const today = todayWaw();

      // Pozycja na planszy to para (okrążenie, pole) — trzymana jako jedna liczba abs_pos.
      // Admin podaje ją tak, jak ją widzi w UI, więc składamy z powrotem tutaj.
      const nextTile = tile != null ? tile : slTileOf(Number(st.abs_pos));
      const nextLaps = laps != null ? laps : Number(st.laps);
      const nextAbs = nextLaps * slBoardSize() + nextTile;

      // Licznik zużytych rzutów liczy się dla dnia z last_move_date — ustawiając go ręcznie
      // trzeba przypiąć go do DZIŚ, inaczej zmiana nie miałaby żadnego skutku.
      const nextRolls = rollsToday != null ? rollsToday : (st.last_move_date === today ? Number(st.rolls_today) : 0);
      const nextMoveDate = rollsToday != null ? (nextRolls > 0 ? today : null) : st.last_move_date;

      db.prepare(`
        UPDATE sl_state SET
          balance = ?, total_points = ?, abs_pos = ?, laps = ?,
          rolls_today = ?, last_move_date = ?,
          extra_rolls = ?, extra_rolls_date = ?
        WHERE player_id = ?
      `).run(
        balance != null ? balance : Number(st.balance),
        totalPoints != null ? totalPoints : Number(st.total_points),
        nextAbs, nextLaps,
        nextRolls, nextMoveDate,
        extraRolls != null ? extraRolls : Number(st.extra_rolls || 0),
        extraRolls != null ? (extraRolls > 0 ? today : null) : st.extra_rolls_date,
        playerId
      );
      return slAdminPlayerDetail(playerId);
    });

    res.json({ success: true, nickname: player.nickname, player: out });
  });

  // GET /api/snakes/admin/player/:id?password= — komplet tego, co o graczu wie tryb Snakes:
  // stan, ekwipunek, oczekujące na niego efekty, ostatnie ruchy i wpisy w dzienniku.
  // Jeden strzał zamiast pięciu — panel otwiera ten szczegół po kliknięciu w gracza.
  function slAdminPlayerDetail(playerId) {
    const st = slEnsureState(playerId);
    const today = todayWaw();
    const p = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    const rollsUsedToday = st.last_move_date === today ? Number(st.rolls_today) : 0;
    return {
      player_id: playerId,
      nickname: p ? p.nickname : null,
      tile: slTileOf(Number(st.abs_pos)),
      abs_pos: Number(st.abs_pos),
      laps: Number(st.laps),
      balance: Number(st.balance),
      total_points: Number(st.total_points),
      rolls_used_today: rollsUsedToday,
      daily_rolls: slDailyRollsFor(st, today),
      extra_rolls: st.extra_rolls_date === today ? Number(st.extra_rolls || 0) : 0,
      max_extra_rolls: SL_MAX_EXTRA_ROLLS,
      last_move_date: st.last_move_date,
      has_avatar: !!st.avatar_updated_at,
      inventory: slInventory(playerId),
      effects: db.prepare(`
        SELECT e.id, e.type, e.variant, e.created_at, p2.nickname AS source_nickname
        FROM sl_effects e LEFT JOIN players p2 ON p2.id = e.source_player_id
        WHERE e.target_player_id = ? AND e.status = 'pending' ORDER BY e.id
      `).all(playerId),
      moves: db.prepare(`
        SELECT id, move_date, move_seq, rolls, from_abs, to_abs, points, note, created_at
        FROM sl_moves WHERE player_id = ? ORDER BY id DESC LIMIT 15
      `).all(playerId).map(m => ({ ...m, from_tile: slTileOf(m.from_abs), to_tile: slTileOf(m.to_abs) })),
      activity: db.prepare(`
        SELECT id, type, detail, day, created_at FROM sl_activity
        WHERE player_id = ? ORDER BY id DESC LIMIT 15
      `).all(playerId)
    };
  }

  app.get('/api/snakes/admin/player/:id', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const playerId = parseInt(req.params.id, 10);
    const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });
    res.json({ success: true, player: slAdminPlayerDetail(playerId) });
  });

  // POST /api/snakes/admin/players/:id/inventory { password, type, qty|delta } — ustawia
  // stan ekwipunku wprost (`qty`) albo zmienia go o `delta` (przyciski +/- w panelu).
  app.post('/api/snakes/admin/players/:id/inventory', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const playerId = parseInt(req.params.id, 10);
    const type = String(req.body.type || '');
    const qty = req.body.qty != null ? parseInt(req.body.qty, 10) : null;
    const delta = req.body.delta != null ? parseInt(req.body.delta, 10) : null;

    if (!SL_POWERUP_TYPES.includes(type)) {
      return res.status(400).json({ error: `Nieznany power-up. Dostępne: ${SL_POWERUP_TYPES.join(', ')}.` });
    }
    if (qty == null && delta == null) return res.status(400).json({ error: 'Podaj qty albo delta.' });
    if (qty != null && (!Number.isInteger(qty) || qty < 0)) {
      return res.status(400).json({ error: 'Liczba sztuk musi być liczbą całkowitą ≥ 0.' });
    }
    if (delta != null && !Number.isInteger(delta)) {
      return res.status(400).json({ error: 'Zmiana musi być liczbą całkowitą.' });
    }

    const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

    const out = transaction(() => {
      slEnsureState(playerId);
      const current = slInventory(playerId)[type];
      const next = Math.max(0, qty != null ? qty : current + delta);
      db.prepare(`
        INSERT INTO sl_inventory (player_id, type, qty) VALUES (?, ?, ?)
        ON CONFLICT(player_id, type) DO UPDATE SET qty = excluded.qty
      `).run(playerId, type, next);
      return slAdminPlayerDetail(playerId);
    });

    res.json({ success: true, nickname: player.nickname, type, player: out });
  });

  // POST /api/snakes/admin/players/:id/effects/clear { password, effect_id? } — kasuje
  // oczekujące na graczu efekty (Freeze/Curse/Shield). Bez `effect_id` zdejmuje wszystkie.
  // Efekt znika bez śladu w dzienniku — to narzędzie naprawcze, nie ruch w grze.
  app.post('/api/snakes/admin/players/:id/effects/clear', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const playerId = parseInt(req.params.id, 10);
    const effectId = req.body.effect_id != null ? parseInt(req.body.effect_id, 10) : null;

    const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

    const out = transaction(() => {
      const del = effectId != null
        ? db.prepare(`DELETE FROM sl_effects WHERE id = ? AND target_player_id = ? AND status = 'pending'`).run(effectId, playerId)
        : db.prepare(`DELETE FROM sl_effects WHERE target_player_id = ? AND status = 'pending'`).run(playerId);
      return { cleared: del.changes, player: slAdminPlayerDetail(playerId) };
    });

    res.json({ success: true, nickname: player.nickname, ...out });
  });

  // POST /api/snakes/admin/players/:id/undo-move { password } — cofa OSTATNI ruch gracza
  // naprawdę: wraca na pole sprzed niego (from_abs), odejmuje zdobyte w nim punkty i monety
  // oraz oddaje zużyty slot, żeby dało się rzucić jeszcze raz. To coś innego niż „Dodaj ruch",
  // które tylko oddaje slot i zostawia zdobycze — tu ruch znika, jakby go nie było.
  // Odkręca też obrażenia, które ten rzut zadał bossowi (wkład znika, HP wraca — patrz
  // slRevertBossDamageForRef). Nie odkręca za to reszty skutków ubocznych: kogo wtedy
  // wypchnął ani komu ukradł monety — tego wiersz ruchu nie pamięta.
  app.post('/api/snakes/admin/players/:id/undo-move', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const playerId = parseInt(req.params.id, 10);

    const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Gracz nie istnieje' });

    const out = transaction(() => {
      const move = db.prepare('SELECT * FROM sl_moves WHERE player_id = ? ORDER BY id DESC LIMIT 1').get(playerId);
      if (!move) return { none: true };
      // Ruch z poprzedniego sezonu: from_abs wskazuje pole na innej planszy.
      if (Number(move.id) <= slSeasonMoveFloor()) return { before_season: true };

      const st = slEnsureState(playerId);
      const fromAbs = Number(move.from_abs);
      const pts = Number(move.points);
      const sameDay = st.last_move_date === move.move_date;
      const nextRolls = sameDay ? Math.max(0, Number(st.rolls_today) - 1) : Number(st.rolls_today);

      // Kocioł, psikusy i cukierki tego ruchu (ten sam `ref`) — z własnego rejestru.
      seasonal.revertRef(`move:${move.id}`);

      // Saldo BEZ przycinania do zera (CLAUDE.md, „Dwie waluty"): dawne MAX(0, balance - ?)
      // kasowało dług po bossie i wydane w międzyczasie coins, czyli drukowało je — gracz
      // z −50, który rzucił +12 i dostał cofnięcie, lądował na 0 zamiast na −50. Bez
      // przycięcia kolejność względem revertRef wyżej też przestaje mieć znaczenie.
      db.prepare(`
        UPDATE sl_state SET abs_pos = ?, laps = ?, total_points = MAX(0, total_points - ?),
          balance = balance - ?, rolls_today = ?
        WHERE player_id = ?
      `).run(fromAbs, Math.floor(fromAbs / slBoardSize()), pts, pts, nextRolls, playerId);

      db.prepare('DELETE FROM sl_moves WHERE id = ?').run(move.id);
      // Ruch ma własne wiersze rozbicia oznaczone kolumną "ref" — kasujemy dokładnie je, żeby
      // cofnięcie jednego ruchu nie ruszyło pozostałych z tego samego dnia.
      // UWAGA: string składamy w JS, a NIE w SQL-u przez ('move:' || ?). node:sqlite binduje
      // liczbę JS jako REAL, więc taka konkatenacja daje 'move:16.0' zamiast 'move:16'
      // i warunek po cichu nie trafia w nic — cofnięty ruch zostawiłby swoje punkty
      // w rozbiciu, mimo że total_points już ich nie ma.
      db.prepare('DELETE FROM sl_points_log WHERE ref = ?').run(`move:${move.id}`);
      // ŚCIEŻKA COFANIA #2 — ten sam `ref` niesie obrażenia zadane bossowi tym rzutem.
      const bossBack = boss.slRevertBossDamageForRef(`move:${move.id}`);
      return {
        none: false, move_date: move.move_date, move_seq: Number(move.move_seq),
        points_removed: pts, back_to_tile: slTileOf(fromAbs),
        boss_hp_restored: bossBack.hp_restored, player: slAdminPlayerDetail(playerId)
      };
    });

    if (out.none) return res.status(400).json({ error: 'Ten gracz nie ma żadnego zapisanego ruchu.' });
    if (out.before_season) return res.status(409).json({ error: 'Ostatni ruch tego gracza był jeszcze na planszy poprzedniego sezonu — nie da się go cofnąć.' });
    res.json({ success: true, nickname: player.nickname, ...out });
  });

  return {

  };
};
