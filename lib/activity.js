// ══ DZIENNIK AKTYWNOŚCI (sl_activity) — zapis, tury, moderacja widoku ══
// Publiczny log gry (prawa kolumna w Snakes) i narzędzia admina do sterowania tym, co z niego
// widać. Fabryka jak lib/boss.js: dostaje bazę i helpery z server.js.
//
// Dwie zasady, na których to stoi (szczegóły w CLAUDE.md, „Ukryta informacja"):
//  • wpis jest PUBLICZNY, więc atak nie nazywa celu nigdzie, a predykat „to mój wpis" to
//    zawsze player_id — nigdy dopasowanie po treści,
//  • wszystko z jednego rzutu dzieli klucz tury (slNewTurnRef), żeby front zwinął to w blok.
//
// Moderacja niczego nie kasuje ani nie nadpisuje w "detail" (parsują go narzędzia cofania):
// widoczność liczy się przy każdym odczycie, a podmieniony tekst idzie do "public_detail".

module.exports = function createActivityModule(deps) {
  const {
    db, todayWaw, slMetaGet, slMetaSet, slAvatarUrl, app, checkAdmin
  } = deps;

  function slLogActivity(playerId, type, detail, ref = null) {
    db.prepare('INSERT INTO sl_activity (player_id, type, detail, day, ref) VALUES (?, ?, ?, ?, ?)')
      .run(playerId, type, detail, todayWaw(), ref);
  }

  // Świeży klucz tury. Licznik + znacznik czasu, a nie numer ruchu: po „Cofnij ostatni ruch"
  // gracz rzuca jeszcze raz z tym samym numerem, a stare wpisy w dzienniku zostają — przy
  // kluczu z numeru obie tury skleiłyby się w jeden blok.
  let slTurnSeq = 0;
  function slNewTurnRef(playerId) {
    return `turn:${playerId}:${Date.now()}:${++slTurnSeq}`;
  }

  // ══ MODERACJA WIDOKU DZIENNIKA ══
  // Dziennik jest publiczny (GET /api/snakes/activity nie wymaga logowania), a admin ma
  // decydować, CO Z NIEGO WIDAĆ — nie kasować zapisu. Dlatego nic tu niczego nie usuwa
  // ani nie nadpisuje: widoczność liczy się przy KAŻDYM odczycie z trzech warstw, więc
  // każdą decyzję da się cofnąć jednym kliknięciem, a wpis w bazie zostaje nietknięty.
  //
  // Dwie NIEZALEŻNE osie:
  //   • czy widać — nadpisanie wpisu > reguła 'hide' > domyślna widoczność typu > widoczne
  //   • jaki tekst — public_detail wpisu > tekst z reguły 'redact' > oryginalny detail
  // Rozdzielenie osi daje sensowne kombinacje, np. „pokaż mimo reguły, ale z innym tekstem".

  // Typy wpisów, którymi da się sterować hurtem. Klucz musi się zgadzać z tym, co wpisuje
  // slLogActivity; wartość to etykieta dla panelu.
  const SL_ACTIVITY_TYPES = {
    roll:      'Rzuty kostką',
    shop_buy:  'Zakupy w sklepie',
    shop_use:  'Użycie power-upów',
    // Osobny typ, a nie 'roll'/'shop_use', bo front podświetla te wpisy obu stronom klątwy
    // (ofierze i rzucającemu) — a wolno mu to robić tylko po polach wpisu, nigdy po treści.
    curse_fired: 'Odpalone klątwy',
    knockback: 'Wypychanie z pola',
    boss_hit:  'Walka z bossem',
    avatar:    'Zmiana zdjęcia profilowego',
    bonus_grant: 'Doładowania coins od admina',
    boss_reward: 'Rozliczenie walki z bossem',
    // Kocioł, cukierek albo psikus, cukierki (lib/seasonal.js) — wpisy w bloku tury.
    season_event: 'Wydarzenia sezonu',
    // Rzut od Prezesa za przyjście do biura (lib/office.js) — publiczny, żeby całe biuro
    // widziało, kto przyszedł i odebrał.
    office_bonus: 'Rzut od Prezesa (bonus za biuro)'
  };

  // Widoczność typów — ten sam wzorzec co przełączniki Discorda (patrz slEventsConfig):
  // jeden klucz w sl_meta z JSON-em, domyślnie WSZYSTKO widoczne, więc bez decyzji admina
  // dziennik wygląda dokładnie jak przed wprowadzeniem moderacji.
  function slActivityTypesConfig() {
    let stored = {};
    try {
      stored = JSON.parse(slMetaGet('activity_types_visible') || '{}');
    } catch {
      stored = {};
    }
    const cfg = {};
    for (const key of Object.keys(SL_ACTIVITY_TYPES)) {
      cfg[key] = typeof stored[key] === 'boolean' ? stored[key] : true;
    }
    return cfg;
  }

  function slSetActivityTypesConfig(patch) {
    const cfg = slActivityTypesConfig();
    for (const [key, val] of Object.entries(patch || {})) {
      if (key in SL_ACTIVITY_TYPES) cfg[key] = !!val;
    }
    slMetaSet('activity_types_visible', JSON.stringify(cfg));
    return cfg;
  }

  // Komplet ustawień moderacji na JEDNO żądanie — ładowany raz i podawany dalej, żeby nie
  // odpytywać bazy o reguły przy każdym wierszu.
  function slActivityModeration() {
    return {
      types: slActivityTypesConfig(),
      rules: db.prepare('SELECT * FROM sl_activity_rules ORDER BY id').all()
    };
  }

  // Predykat SQL „ten wpis jest ukryty". Idzie do SQL, a nie do JS, bo współpracuje
  // z LIMIT-em (inaczej trzeba by pobierać z zapasem i dociąć w pamięci) oraz z listą dni.
  // Cała warstwa reguł mieści się w jednym skorelowanym EXISTS — każdy wymiar dopasowania
  // jest wyrażalny w SQL. `match_text` NIGDY nie jest wklejany do zapytania, tylko wiązany
  // jako parametr; ESCAPE sprawia, że % i _ wpisane przez admina znaczą same siebie.
  function slActivityHiddenSql(mod, alias = 'a') {
    const hiddenTypes = Object.keys(mod.types).filter(t => !mod.types[t]);
    // UWAGA: musi być IS, nie = . Domyślnie visibility jest NULL, a `NULL = 'hidden'` daje
    // w SQL nie fałsz, tylko NULL — całe wyrażenie robi się NULL i `WHERE NOT (…)` wycina
    // WSZYSTKIE wpisy. Operator IS w SQLite porównuje bezpiecznie względem NULL-a.
    const parts = [`${alias}.visibility IS 'hidden'`];
    const args = [];

    const auto = [];
    if (hiddenTypes.length) {
      auto.push(`${alias}.type IN (${hiddenTypes.map(() => '?').join(', ')})`);
      args.push(...hiddenTypes);
    }
    auto.push(`EXISTS (
      SELECT 1 FROM sl_activity_rules r
      WHERE r.enabled = 1 AND r.action = 'hide'
        AND (r.match_type      IS NULL OR r.match_type = ${alias}.type)
        AND (r.match_player_id IS NULL OR r.match_player_id = ${alias}.player_id)
        AND (r.match_day_from  IS NULL OR ${alias}.day >= r.match_day_from)
        AND (r.match_day_to    IS NULL OR ${alias}.day <= r.match_day_to)
        AND (r.match_text      IS NULL OR ${alias}.detail LIKE '%' || REPLACE(REPLACE(r.match_text, '\\', '\\\\'), '%', '\\%') || '%' ESCAPE '\\')
    )`);

    // Warstwy automatyczne (typ + reguły) liczą się TYLKO wtedy, gdy wpis nie ma własnego
    // nadpisania — 'shown' przypina go widocznym mimo wszystko.
    parts.push(`(${alias}.visibility IS NULL AND (${auto.join(' OR ')}))`);
    return { sql: `(${parts.join(' OR ')})`, args };
  }

  // Powód ukrycia/podmiany — wyłącznie do pokazania adminowi, dlaczego wpis wygląda tak,
  // jak wygląda. Liczone w JS na już pobranym wierszu, bo to opis, nie filtr.
  function slActivityRuleMatches(rule, row) {
    if (!rule.enabled) return false;
    if (rule.match_type && rule.match_type !== row.type) return false;
    if (rule.match_player_id != null && Number(rule.match_player_id) !== Number(row.player_id)) return false;
    if (rule.match_day_from && row.day < rule.match_day_from) return false;
    if (rule.match_day_to && row.day > rule.match_day_to) return false;
    if (rule.match_text && !String(row.detail).includes(rule.match_text)) return false;
    return true;
  }

  // Treść pokazywana graczom: nadpisanie wpisu bije regułę, reguła bije oryginał.
  // Zwraca też, skąd wzięła się podmiana — panel pokazuje to przy wierszu.
  function slActivityPublicDetail(row, mod) {
    if (row.public_detail != null) return { detail: row.public_detail, redacted_by: 'wpis' };
    const rule = mod.rules.find(r => r.action === 'redact' && r.replacement && slActivityRuleMatches(r, row));
    if (rule) return { detail: rule.replacement, redacted_by: `reguła #${rule.id}` };
    return { detail: row.detail, redacted_by: null };
  }

  // Dlaczego wpis jest niewidoczny (albo null, gdy jest widoczny).
  function slActivityHiddenBy(row, mod) {
    if (row.visibility === 'hidden') return 'wpis';
    if (row.visibility === 'shown') return null;
    const rule = mod.rules.find(r => r.action === 'hide' && slActivityRuleMatches(r, row));
    if (rule) return `reguła #${rule.id}`;
    if (mod.types[row.type] === false) return 'typ';
    return null;
  }

  // JEDYNA ścieżka odczytu dziennika dla graczy. Woła ją i publiczny endpoint, i podgląd
  // w panelu admina — dzięki temu „Podgląd gracza" nie może się rozjechać z tym, co gracze
  // naprawdę widzą. Lista dni jest bramkowana TYM SAMYM predykatem, inaczej dzień ukryty
  // co do wpisu i tak świeciłby w rozwijanym wyborze daty.
  function slPublicActivity({ date = null, limit = 150 } = {}) {
    const mod = slActivityModeration();
    const hidden = slActivityHiddenSql(mod);
    const where = [`NOT ${hidden.sql}`];
    const args = [...hidden.args];
    if (date) { where.push('a.day = ?'); args.push(date); }

    const rows = db.prepare(`
      SELECT a.id, a.player_id, p.nickname, a.type, a.detail, a.public_detail, a.day, a.created_at, a.ref,
             s.avatar_updated_at
      FROM sl_activity a JOIN players p ON p.id = a.player_id
      LEFT JOIN sl_state s ON s.player_id = a.player_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.id DESC LIMIT ?
    `).all(...args, Math.min(300, Math.max(1, limit)));

    const dates = db.prepare(`
      SELECT DISTINCT a.day FROM sl_activity a
      WHERE NOT ${hidden.sql}
      ORDER BY a.day DESC LIMIT 60
    `).all(...hidden.args).map(r => r.day);

    return {
      entries: rows.map(r => ({
        id: r.id,
        player_id: r.player_id,
        nickname: r.nickname,
        type: r.type,
        detail: slActivityPublicDetail(r, mod).detail,
        date: r.day,
        created_at: r.created_at,
        ref: r.ref,
        // Do rzędu awatarów w zwiniętym bloku. Bierze się WYŁĄCZNIE z `player_id` wpisu,
        // więc nie pokazuje nikogo, kogo nie widać już jako nicku w rozwiniętym bloku.
        avatar_url: slAvatarUrl(r.player_id, r.avatar_updated_at)
      })),
      dates
    };
  }


  // GET /api/snakes/activity?date=YYYY-MM-DD&limit=150 — publiczny dziennik aktywności
  // (ruchy, sklep, wpłaty do puli, knockback) do przeglądania w prawej kolumnie UI.
  // Bez filtra dnia zwraca po prostu najnowsze wpisy ze wszystkich dni.
  app.get('/api/snakes/activity', (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
    const limit = parseInt(req.query.limit, 10) || 150;
    // Cała treść przechodzi przez moderację widoku — endpoint jest publiczny (bez tokenu),
    // więc to JEDYNE miejsce decydujące, co biuro widzi (patrz slPublicActivity).
    res.json(slPublicActivity({ date, limit }));
  });

  // ── STEROWANIE HISTORIĄ ──
  // Dziennik aktywności i ruchy do przeglądania oraz kasowania z panelu. Filtry są
  // opcjonalne i składają się ze sobą (data + gracz + typ), więc jednym zapytaniem da się
  // zejść od „wszystko z dziś" do „tylko wypchnięcia tego jednego gracza".
  // Kasowanie dotyczy WYŁĄCZNIE dziennika — to log, nie stan gry, więc usunięcie wpisu
  // niczego nie cofa (od cofania są undo-move i rollback dnia).
  function slAdminActivityFilter(query) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : null;
    const playerId = query.player_id ? parseInt(query.player_id, 10) : null;
    const type = query.type ? String(query.type) : null;
    const where = [];
    const args = [];
    if (date) { where.push('a.day = ?'); args.push(date); }
    if (Number.isInteger(playerId)) { where.push('a.player_id = ?'); args.push(playerId); }
    if (type) { where.push('a.type = ?'); args.push(type); }
    return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args, date, playerId, type };
  }

  // Admin widzi WSZYSTKO — także wpisy ukryte przed graczami — bo to jego pulpit moderacji.
  // Do każdego wiersza dokładamy stan widoku: czy widać, jaka treść idzie do graczy i KTO
  // o tym zdecydował (wpis / reguła #N / typ), żeby dało się kliknąć w przyczynę.
  app.get('/api/snakes/admin/activity', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const f = slAdminActivityFilter(req.query);
    const mod = slActivityModeration();

    const rows = db.prepare(`
      SELECT a.id, a.player_id, p.nickname, a.type, a.detail, a.public_detail, a.visibility, a.day, a.created_at
      FROM sl_activity a JOIN players p ON p.id = a.player_id
      ${f.sql} ORDER BY a.id DESC LIMIT ?
    `).all(...f.args, limit);

    const entries = rows.map(r => {
      const hiddenBy = slActivityHiddenBy(r, mod);
      const pub = slActivityPublicDetail(r, mod);
      return {
        ...r,
        visible: !hiddenBy,
        hidden_by: hiddenBy,
        effective_detail: pub.detail,
        redacted_by: pub.redacted_by
      };
    });

    const total = db.prepare(`SELECT COUNT(*) AS c FROM sl_activity a ${f.sql}`).get(...f.args).c;

    res.json({
      success: true,
      entries,
      total: Number(total),
      shown: entries.length,
      hidden_shown: entries.filter(e => !e.visible).length,
      // Do wypełnienia filtrów w panelu — dni i typy, które faktycznie w bazie są.
      days: db.prepare('SELECT DISTINCT day FROM sl_activity ORDER BY day DESC LIMIT 60').all().map(r => r.day),
      types: db.prepare('SELECT DISTINCT type FROM sl_activity ORDER BY type').all().map(r => r.type)
    });
  });

  // POST /api/snakes/admin/activity/:id/visibility { password, visibility?, public_detail? } —
  // nadpisanie POJEDYNCZEGO wpisu, najwyższa warstwa moderacji.
  //   visibility: 'hidden' (ukryj mimo wszystko) | 'shown' (pokaż mimo reguł) | null (wróć pod reguły)
  //   public_detail: tekst dla graczy | null (przywróć oryginał)
  // Pola są niezależne — podaje się tylko te, które faktycznie się zmienia.
  app.post('/api/snakes/admin/activity/:id/visibility', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const id = parseInt(req.params.id, 10);
    const hasVisibility = 'visibility' in req.body;
    const hasDetail = 'public_detail' in req.body;
    const visibility = req.body.visibility == null ? null : String(req.body.visibility);
    const publicDetail = req.body.public_detail == null ? null : String(req.body.public_detail).trim();

    if (hasVisibility && visibility !== null && !['shown', 'hidden'].includes(visibility)) {
      return res.status(400).json({ error: "visibility musi być 'shown', 'hidden' albo null." });
    }
    if (hasDetail && publicDetail !== null && (!publicDetail || publicDetail.length > 300)) {
      return res.status(400).json({ error: 'Podmieniona treść musi mieć od 1 do 300 znaków (albo null, żeby wrócić do oryginału).' });
    }
    if (!hasVisibility && !hasDetail) {
      return res.status(400).json({ error: 'Nie podano żadnej zmiany.' });
    }

    const row = db.prepare('SELECT * FROM sl_activity WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Nie ma takiego wpisu.' });

    if (hasVisibility) db.prepare('UPDATE sl_activity SET visibility = ? WHERE id = ?').run(visibility, id);
    if (hasDetail) db.prepare('UPDATE sl_activity SET public_detail = ? WHERE id = ?').run(publicDetail, id);

    const fresh = db.prepare(`
      SELECT a.id, a.player_id, p.nickname, a.type, a.detail, a.public_detail, a.visibility, a.day, a.created_at
      FROM sl_activity a JOIN players p ON p.id = a.player_id WHERE a.id = ?
    `).get(id);
    const mod = slActivityModeration();
    const hiddenBy = slActivityHiddenBy(fresh, mod);
    const pub = slActivityPublicDetail(fresh, mod);

    res.json({
      success: true,
      entry: { ...fresh, visible: !hiddenBy, hidden_by: hiddenBy, effective_detail: pub.detail, redacted_by: pub.redacted_by }
    });
  });

  // POST /api/snakes/admin/activity/visibility/bulk { password, action, date?, player_id?, type? } —
  // nieniszczący następca kasowania hurtem: ustawia nadpisanie na WSZYSTKICH wpisach
  // pasujących do filtra. `action`: 'hide' | 'show' | 'clear' (zdejmij nadpisanie i wróć
  // pod reguły). Pusty filtr jest dozwolony — nic nie ginie, wszystko da się cofnąć.
  app.post('/api/snakes/admin/activity/visibility/bulk', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const action = String(req.body.action || '');
    if (!['hide', 'show', 'clear'].includes(action)) {
      return res.status(400).json({ error: "action musi być 'hide', 'show' albo 'clear'." });
    }
    const f = slAdminActivityFilter(req.body);
    const visibility = action === 'hide' ? 'hidden' : action === 'show' ? 'shown' : null;

    const upd = db.prepare(`
      UPDATE sl_activity SET visibility = ?
      WHERE id IN (SELECT a.id FROM sl_activity a ${f.sql})
    `).run(visibility, ...f.args);

    res.json({ success: true, action, changed: upd.changes, date: f.date, player_id: f.playerId, type: f.type });
  });

  // GET/POST /api/snakes/admin/activity/types — domyślna widoczność CAŁYCH kategorii wpisów.
  // Najszersza warstwa: wyłączenie typu chowa go graczom wszędzie, ale reguły i nadpisania
  // pojedynczych wpisów nadal mogą go przywrócić.
  app.get('/api/snakes/admin/activity/types', (req, res) => {
    if (!checkAdmin(req, res)) return;
    res.json({ success: true, types: slActivityTypesConfig(), labels: SL_ACTIVITY_TYPES });
  });

  app.post('/api/snakes/admin/activity/types', (req, res) => {
    if (!checkAdmin(req, res)) return;
    res.json({ success: true, types: slSetActivityTypesConfig(req.body.types), labels: SL_ACTIVITY_TYPES });
  });

  // GET /api/snakes/admin/activity/rules — reguły wraz z licznikiem: ilu wpisów każda
  // DZIŚ dotyczy. Bez tego licznika admin dodaje regułę w ciemno i nie wie, co właśnie zniknęło.
  app.get('/api/snakes/admin/activity/rules', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const mod = slActivityModeration();
    const rows = db.prepare(`
      SELECT a.id, a.player_id, a.type, a.detail, a.day, a.visibility, a.public_detail FROM sl_activity a
    `).all();
    const players = db.prepare('SELECT id, nickname FROM players').all();
    const nickById = new Map(players.map(p => [p.id, p.nickname]));

    res.json({
      success: true,
      rules: mod.rules.map(r => ({
        ...r,
        enabled: !!r.enabled,
        player_nickname: r.match_player_id != null
          ? (nickById.get(Number(r.match_player_id)) || '(gracz usunięty)')
          : null,
        matches: rows.filter(row => slActivityRuleMatches({ ...r, enabled: 1 }, row)).length
      })),
      types: SL_ACTIVITY_TYPES,
      players: players.map(p => ({ player_id: p.id, nickname: p.nickname }))
    });
  });

  // POST /api/snakes/admin/activity/rules { password, id?, ... } — dodaje regułę albo
  // (gdy podano `id`) zmienia istniejącą. Puste pola dopasowania znaczą „dowolne", więc
  // reguła bez żadnego z nich łapie cały dziennik — to świadomie dozwolone, bo odwracalne.
  app.post('/api/snakes/admin/activity/rules', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const id = req.body.id != null ? parseInt(req.body.id, 10) : null;
    const action = String(req.body.action || 'hide');
    const str = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
    const replacement = str(req.body.replacement);
    const matchType = str(req.body.match_type);
    const matchPlayerId = req.body.match_player_id != null && String(req.body.match_player_id) !== ''
      ? parseInt(req.body.match_player_id, 10) : null;
    const dayFrom = str(req.body.match_day_from);
    const dayTo = str(req.body.match_day_to);
    const matchText = str(req.body.match_text);
    const note = str(req.body.note);
    const enabled = req.body.enabled == null ? 1 : (req.body.enabled ? 1 : 0);

    if (!['hide', 'redact'].includes(action)) {
      return res.status(400).json({ error: "action musi być 'hide' albo 'redact'." });
    }
    if (action === 'redact' && !replacement) {
      return res.status(400).json({ error: 'Reguła podmieniająca treść wymaga tekstu zastępczego.' });
    }
    if (matchType && !(matchType in SL_ACTIVITY_TYPES)) {
      return res.status(400).json({ error: `Nieznany typ wpisu. Dostępne: ${Object.keys(SL_ACTIVITY_TYPES).join(', ')}.` });
    }
    for (const [label, day] of [['od', dayFrom], ['do', dayTo]]) {
      if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return res.status(400).json({ error: `Data „${label}" musi mieć format YYYY-MM-DD.` });
      }
    }
    if (dayFrom && dayTo && dayFrom > dayTo) {
      return res.status(400).json({ error: 'Data „od" jest późniejsza niż „do".' });
    }
    if (matchPlayerId != null && !Number.isInteger(matchPlayerId)) {
      return res.status(400).json({ error: 'Nieprawidłowy gracz.' });
    }

    if (id != null) {
      const exists = db.prepare('SELECT id FROM sl_activity_rules WHERE id = ?').get(id);
      if (!exists) return res.status(404).json({ error: 'Nie ma takiej reguły.' });
      db.prepare(`
        UPDATE sl_activity_rules SET enabled = ?, action = ?, replacement = ?, match_type = ?,
          match_player_id = ?, match_day_from = ?, match_day_to = ?, match_text = ?, note = ?
        WHERE id = ?
      `).run(enabled, action, replacement, matchType, matchPlayerId, dayFrom, dayTo, matchText, note, id);
      return res.json({ success: true, id, updated: true });
    }

    const ins = db.prepare(`
      INSERT INTO sl_activity_rules (enabled, action, replacement, match_type, match_player_id,
        match_day_from, match_day_to, match_text, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(enabled, action, replacement, matchType, matchPlayerId, dayFrom, dayTo, matchText, note);

    res.json({ success: true, id: Number(ins.lastInsertRowid), updated: false });
  });

  // DELETE /api/snakes/admin/activity/rules/:id — kasuje regułę. Wpisy, które chowała,
  // wracają natychmiast: nic w nich nie było zapisane.
  app.delete('/api/snakes/admin/activity/rules/:id', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const del = db.prepare('DELETE FROM sl_activity_rules WHERE id = ?').run(parseInt(req.params.id, 10));
    if (!del.changes) return res.status(404).json({ error: 'Nie ma takiej reguły.' });
    res.json({ success: true, deleted: 1 });
  });

  // GET /api/snakes/admin/activity/preview — dziennik DOKŁADNIE tak, jak widzą go gracze.
  // Woła tę samą funkcję co endpoint publiczny, więc podgląd nie może kłamać.
  app.get('/api/snakes/admin/activity/preview', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
    const view = slPublicActivity({ date, limit: parseInt(req.query.limit, 10) || 150 });
    const totalAll = db.prepare(
      `SELECT COUNT(*) AS c FROM sl_activity a ${date ? 'WHERE a.day = ?' : ''}`
    ).get(...(date ? [date] : [])).c;
    res.json({ success: true, ...view, total_all: Number(totalAll), hidden_count: Number(totalAll) - view.entries.length });
  });

  app.delete('/api/snakes/admin/activity/:id', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const id = parseInt(req.params.id, 10);
    const del = db.prepare('DELETE FROM sl_activity WHERE id = ?').run(id);
    if (!del.changes) return res.status(404).json({ error: 'Nie ma takiego wpisu.' });
    res.json({ success: true, deleted: 1 });
  });

  // POST /api/snakes/admin/activity/purge { password, date?, player_id?, type? } — kasuje
  // WSZYSTKIE wpisy pasujące do filtra. Pusty filtr czyści cały dziennik, więc wymagamy
  // wtedy jawnego `confirm_all`, żeby nie dało się tego zrobić przypadkiem.
  app.post('/api/snakes/admin/activity/purge', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const f = slAdminActivityFilter(req.body);
    if (!f.sql && req.body.confirm_all !== true) {
      return res.status(400).json({ error: 'Pusty filtr wyczyściłby cały dziennik — dodaj filtr albo confirm_all: true.' });
    }
    const del = db.prepare(`DELETE FROM sl_activity WHERE id IN (SELECT a.id FROM sl_activity a ${f.sql})`).run(...f.args);
    res.json({ success: true, deleted: del.changes, date: f.date, player_id: f.playerId, type: f.type });
  });

  return {
    slLogActivity,
    slNewTurnRef
  };
};
