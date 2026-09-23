'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  WALKA Z BOSSEM (co-op) — wydzielona z server.js
// ══════════════════════════════════════════════════════════════════════════════
// Moduł jest FABRYKĄ, a nie zwykłym require'em z importami: cała gra chodzi na jednym
// połączeniu `db` i na garści helperów zdefiniowanych w server.js (transaction, logowanie
// punktów i dziennika, szyna Discorda). Wstrzykujemy je przez `deps`, zamiast robić
// require w drugą stronę — inaczej powstałby cykl server → boss → server, a przy jednym
// pliku bazy dwa niezależne uchwyty to proszenie się o „database is locked".
//
// Wszystko, co tu jest, było wcześniej w server.js — komentarze przyszły razem z kodem,
// bo tłumaczą DLACZEGO, a to jest w tej grze najdroższa rzecz do odtworzenia.
//
// ── DWIE WALUTY (fundament, nie szczegół) ──
// `total_points` to ranking (nie da się wydać), `balance` to coins (portfel). Boss może
// coins tylko PALIĆ — zwrot jest zawsze ułamkiem wpłaty, więc suma wypłaconych coins jest
// arytmetycznie mniejsza od sumy wpłaconych. Punktami płaci hojnie, bo punktów nie da się
// wydać, więc nie mogą napędzić pętli „wpłać → zarób → wpłać więcej".

module.exports = function createBossModule(deps) {
  const {
    db, transaction, ensureColumn,
    slMetaGet, slMetaSet,
    slLogActivity, slLogPoints,
    slEnsureState,
    slEmit, postDiscord, snakesUrl,
    todayWaw, addBusinessDaysMs
  } = deps;

  // ── STAŁE ──────────────────────────────────────────────────────────────────
  // Bazowe HP bossa. Zeszło z 3500: przy 10 grających kość daje przez 5 dni roboczych
  // ~1575 obrażeń (3,5 oczka × 3 × 3 rzuty × 10 osób × 5 dni), a wpłaty dokładają tyle,
  // ile ekipa zdecyduje się wyłożyć. 3500 było więc nie do zdjęcia i boss tylko karał.
  // 3000 jest do ubicia, ale wymaga i frekwencji, i realnych wpłat — sam dzienny rzut
  // nie wystarczy. Gdyby okazało się za wysokie, ulga po przegranej realnie je obniża
  // (patrz SL_COOP_RELIEF_FLOOR), a admin ma suwak w panelu.
  const SL_COOP_THRESHOLD = parseInt(process.env.SNAKES_COOP_THRESHOLD, 10) || 3000;

  // Ile PUNKTÓW RANKINGOWYCH daje jeden wpłacony coin, gdy boss padnie.
  const SL_COOP_POINTS_PER_COIN = Number(process.env.SNAKES_COOP_POINTS_PER_COIN || 0.7);

  // Zwrot części wpłaty przy zwycięstwie — PROCENT, nie kwota. To jest najważniejsza
  // pojedyncza zmiana w tej przebudowie. Wcześniej było `min(50, wpłata)` i to samo w
  // sobie zabijało walkę: pierwsze 50 coins wracało w całości (a kara i tak wynosiła 50,
  // więc wpłata 50 była DARMOWA w obu scenariuszach), a każdy coin powyżej 50 nie wracał
  // wcale. Nikomu nie opłacało się wpłacić więcej niż 50, więc budżet całej ekipy był
  // zabetonowany na 50 × liczba graczy, niezależnie od zaangażowania.
  // Przy stałym procencie każdy kolejny coin jest wart tyle samo, co pierwszy.
  const SL_COOP_REFUND_RATE = Number(process.env.SNAKES_COOP_REFUND_RATE || 0.5);

  // ── KTO JEST „WALCZĄCY" ──
  // Walczący to ten, kto WPŁACIŁ COINS — nie ten, kto rzucał kostką. Rzuty ranią bossa
  // za darmo i nadal zdejmują większość HP, ale nagrody nie dotykają, bo nic nie kosztują
  // i nic nie ryzykują. Gdyby płaciły, „nagroda za bossa" byłaby po prostu mnożnikiem do
  // zwykłego grania i ranking przestałby mierzyć cokolwiek innego.
  const SL_COOP_FIGHTER_MIN_COINS = parseInt(process.env.SNAKES_COOP_FIGHTER_MIN_COINS, 10) || 50;
  // Ryczałt za samo przekroczenie progu — płaski, nie proporcjonalny. Proporcjonalny
  // premiowałby bogatych, a ten ma ciągnąć do UDZIAŁU: dołóż tyle, ile boss ci zabierze
  // przy przegranej, i jesteś w podziale. Próg 50 rymuje się z karą 50 — to jedna, łatwa
  // do zapamiętania liczba, a nie dwie.
  const SL_COOP_FIGHTER_POINTS = parseInt(process.env.SNAKES_COOP_FIGHTER_POINTS, 10) || 40;
  // Podium wpłat (1./2./3. miejsce) — rywalizacja WEWNĄTRZ kooperacji i jedyny powód,
  // dla którego lista wpłacających pod paskiem HP ma się komu oglądać.
  const SL_COOP_PODIUM_POINTS = [40, 25, 15];

  // ── KAMIENIE MILOWE ──
  // Progi HP (w procentach), po przekroczeniu których wszyscy dotychczasowi wpłacający
  // dostają NATYCHMIAST rykoszetem trochę punktów. To jest lek na największą wadę starej
  // wersji: między startem walki a rozliczeniem nie działo się DOSŁOWNIE nic przez pięć
  // dni. Płacimy wszystkim, którzy wpłacili DO TEJ PORY (a nie „od poprzedniego progu"),
  // więc kto dorzuci wcześnie, łapie wszystkie trzy — a wczesna kasa jest dla ekipy
  // najcenniejsza, bo dopiero przy niej da się zaplanować resztę walki.
  const SL_COOP_MILESTONES = [75, 50, 25];
  const SL_COOP_MILESTONE_POINTS = parseInt(process.env.SNAKES_COOP_MILESTONE_POINTS, 10) || 15;

  // ── ESKALACJA TRUDNOŚCI ──
  const SL_COOP_BASE_TIME_DAYS = Number(process.env.SNAKES_COOP_BASE_TIME_DAYS || 5);
  const SL_COOP_MIN_TIME_DAYS = Number(process.env.SNAKES_COOP_MIN_TIME_DAYS || 2);
  const SL_COOP_THRESHOLD_GROWTH = Number(process.env.SNAKES_COOP_THRESHOLD_GROWTH || 1.2);
  const SL_COOP_TIME_SHRINK = Number(process.env.SNAKES_COOP_TIME_SHRINK || 0.8);
  const SL_COOP_RELIEF_FACTOR = Number(process.env.SNAKES_COOP_RELIEF_FACTOR || 0.9);
  // PODŁOGA ulgi po przegranej, jako ułamek progu BAZOWEGO. Wcześniej podłogą był sam próg
  // bazowy (`max(base, …)`), przez co ulga nie robiła NIC: próg wracał do bazy i stał tam
  // na zawsze. Jeśli baza była nie do ubicia, gra wpadała w nieskończoną pętlę przegranych,
  // z której nie było wyjścia. Teraz porażki realnie schodzą w dół, aż do poziomu, który
  // ekipa faktycznie jest w stanie zdjąć.
  const SL_COOP_RELIEF_FLOOR = Number(process.env.SNAKES_COOP_RELIEF_FLOOR || 0.4);

  // ── BOSS ──
  const SL_BOSS_NAMES = [
    'Ksero-Golem', 'Duch Deadline\'u', 'Hydra Niekończących Się Maili',
    'Excel Behemot', 'Automat do Kawy Zła', 'Syndrom Poniedziałku', 'Rozdzielacz Wi-Fi Zagłady'
  ];
  const SL_BOSS_HP_MULTIPLIER = Number(process.env.SNAKES_BOSS_HP_MULTIPLIER || 1);
  const SL_BOSS_DICE_DAMAGE_MULT = Number(process.env.SNAKES_BOSS_DICE_DAMAGE_MULT || 3);
  // Kara za nieubicie bossa na czas: PŁASKIE -50 coins dla każdego gracza, bez żadnej
  // zniżki za wpłatę. Wpłacający tracą więc i wpłatę, i karę — i o to chodzi: dopiero
  // to czyni z wpłaty realną decyzję, a nie darmowy wykup od kary. Rekompensatą jest
  // strona nagrody, która przy wygranej jest teraz kilka razy większa niż dawniej.
  const SL_BOSS_TIMEOUT_PENALTY = parseInt(process.env.SNAKES_BOSS_TIMEOUT_PENALTY, 10) || 50;
  // Kara NIE jest przycinana do salda — gracz może zejść pod kreskę. Ujemne saldo samo
  // z siebie blokuje sklep i wpłaty (wszędzie jest warunek „stać cię?"), a wychodzi się
  // z niego normalną grą, bo rzut dopisuje coins. Świadomie: dług jest widoczny i boli,
  // ale nie wyklucza z gry.

  // ── SCHEMAT ────────────────────────────────────────────────────────────────
  // Wołane z server.js zaraz po utworzeniu reszty tabel sl_*. UWAGA na pułapkę z CLAUDE.md:
  // backtick w komentarzu SQL wewnątrz template literala urywa cały literał — dlatego
  // nazwy kolumn są tu w "cudzysłowach", nigdy w backtickach.
  function initSchema() {
    db.exec(`
      -- Jedna aktywna „edycja" (cykl) walki z bossem naraz. Kolumna "total" została po
      -- dawnym mechanizmie zbiórki i jest nieużywana; 'collecting' to STARY status sprzed
      -- przejścia na jedną, ciągłą fazę walki — nowe wiersze zawsze startują jako
      -- 'event_active' (patrz slCoopInsertCycle).
      CREATE TABLE IF NOT EXISTS snakes.sl_coop (
        cycle            INTEGER PRIMARY KEY,
        threshold        INTEGER NOT NULL,
        total            INTEGER DEFAULT 0,
        status           TEXT DEFAULT 'event_active', -- 'collecting' (legacy) | 'event_active' | 'completed'
        reward_pool      INTEGER DEFAULT 0,
        started_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        triggered_at     DATETIME,
        completed_at     DATETIME,
        boss_name        TEXT,
        boss_max_hp      INTEGER DEFAULT 0,
        boss_hp          INTEGER DEFAULT 0,
        boss_defeated_at DATETIME,
        time_limit_days  INTEGER DEFAULT 5,   -- dni robocze na pokonanie TEGO bossa
        boss_deadline_at DATETIME             -- policzone przy wybudzeniu (patrz addBusinessDaysMs)
      );

      -- Zadane obrażenia, per gracz i per cios. "source" mówi, skąd poszło uderzenie:
      -- 'coins' = wpłata z portfela (TYLKO ona liczy się do nagród), 'dice' = darmowe
      -- trafienie z rzutu. Wiersze sprzed rozdzielenia źródeł mają NULL i liczą się jak 'dice'.
      CREATE TABLE IF NOT EXISTS snakes.sl_coop_contributions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle      INTEGER NOT NULL,
        player_id  INTEGER,
        amount     INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ── REJESTR WYPŁAT I KAR ──
      -- Każda złotówka i każdy punkt, które boss komukolwiek dał albo zabrał, ma tu wiersz.
      -- Wcześniej rozliczenie robiło gołe UPDATE na sl_state i nagrody dało się cofnąć
      -- WYŁĄCZNIE przez ponowne przeliczenie ich dzisiejszym wzorem — co znaczyło, że każda
      -- zmiana stawek po cichu psuła cofanie starych cykli, a kary (przycinanej do salda)
      -- nie dało się odtworzyć w ogóle. Rejestr rozwiązuje jedno i drugie: cofanie CZYTA,
      -- zamiast liczyć.
      --
      -- "coins" dodatnie = wypłata, ujemne = zabrane (kara). "player_id" bywa NULL: taki
      -- wiersz to znacznik przekroczonego kamienia milowego, zapisywany nawet wtedy, gdy
      -- nie było komu zapłacić — bez niego ten sam próg odpalałby się w kółko.
      CREATE TABLE IF NOT EXISTS snakes.sl_boss_payouts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle      INTEGER NOT NULL,
        player_id  INTEGER,
        kind       TEXT NOT NULL,   -- 'contrib' | 'fighter' | 'podium' | 'milestone' | 'penalty'
        points     INTEGER NOT NULL DEFAULT 0,
        coins      INTEGER NOT NULL DEFAULT 0,
        detail     TEXT,            -- '75' dla kamienia milowego, '2' dla miejsca na podium
        day        TEXT NOT NULL,   -- YYYY-MM-DD (Europe/Warsaw) — do cofania dnia
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS snakes.idx_boss_payouts_cycle ON sl_boss_payouts(cycle, kind);
      CREATE INDEX IF NOT EXISTS snakes.idx_boss_payouts_day ON sl_boss_payouts(day);
    `);

    // Kolumny bossa dla wdrożeń sprzed walki z bossem.
    ensureColumn('sl_coop', 'boss_name', 'TEXT');
    ensureColumn('sl_coop', 'boss_max_hp', 'INTEGER DEFAULT 0');
    ensureColumn('sl_coop', 'boss_hp', 'INTEGER DEFAULT 0');
    ensureColumn('sl_coop', 'boss_defeated_at', 'DATETIME');
    ensureColumn('sl_coop', 'time_limit_days', 'INTEGER DEFAULT 5');
    ensureColumn('sl_coop', 'boss_deadline_at', 'DATETIME');
    ensureColumn('sl_coop', 'boss_started_at', 'DATETIME');
    ensureColumn('sl_coop', 'collect_deadline_at', 'DATETIME');
    ensureColumn('sl_coop_contributions', 'source', 'TEXT');
    // "day" i "ref" dokładamy po to, żeby obrażenia dało się cofnąć tymi samymi dwoma
    // narzędziami, co wszystko inne: całym dniem i pojedynczym ruchem. Wcześniej nie dało
    // się ani tak, ani tak — cofnięty rzut zostawiał bossowi zabrane HP po ruchu, którego
    // już nie było (przyznawał to zresztą komentarz przy undo-move).
    ensureColumn('sl_coop_contributions', 'day', 'TEXT');
    ensureColumn('sl_coop_contributions', 'ref', 'TEXT');
  }

  // ── DROBIAZGI ──────────────────────────────────────────────────────────────
  // Odmiana „obrażenie/obrażenia/obrażeń" — dziennik czyta się jak zdanie, więc liczba
  // mnoga musi się zgadzać (1 obrażenie, 24 obrażenia, 45 obrażeń, ale 12 obrażeń).
  function slDamageWord(n) {
    const abs = Math.abs(n);
    if (abs === 1) return 'obrażenie';
    const last = abs % 10;
    const lastTwo = abs % 100;
    return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'obrażenia' : 'obrażeń';
  }

  // Jednolita treść wpisu o trafieniu bossa: „atak na bossa — 24 obrażenia (kość)".
  function slBossHitEntry(damage, source) {
    return `atak na bossa — ${damage} ${slDamageWord(damage)} (${source})`;
  }

  // Odmiana „gracz/gracze/graczy" — używana w podsumowaniach na Discordzie.
  function slPlayerWord(n) {
    if (n === 1) return 'gracz';
    const last = n % 10;
    const lastTwo = n % 100;
    return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'gracze' : 'graczy';
  }

  // ── WYŁĄCZNIK BOSSA ────────────────────────────────────────────────────────
  // Cała walka chodzi na jednym przełączniku w sl_meta, więc da się ją zgasić i zapalić
  // z panelu admina bez deployu. Wyłączony boss znika kompletnie: payload dla UI jest
  // pusty, rzuty nie zadają obrażeń, ręczny atak odpada, scheduler nie rozlicza terminów,
  // a nowe cykle się nie zakładają.
  function slBossEnabled() {
    return slMetaGet('boss_enabled') !== '0';
  }

  // Domyślny próg dla NOWYCH cykli — admin może go podmienić na stałe, bez grzebania
  // w .env i restartu. Zmiana dotyczy tylko przyszłych cykli.
  function slCoopDefaultThreshold() {
    const override = parseInt(slMetaGet('coop_threshold_override'), 10);
    return Number.isInteger(override) && override > 0 ? override : SL_COOP_THRESHOLD;
  }

  // Zapala/gasi bossa. Przy gaszeniu domykamy trwającą walkę BEZ rozliczenia (nikt nie
  // dostaje nagrody ani kary), przy zapalaniu startuje świeży cykl. Bez tego po ponownym
  // włączeniu odżyłby stary cykl z terminem dawno po czasie i pierwszy tik schedulera
  // ukarałby wszystkich za przegraną, której nikt nie miał szans rozegrać.
  function slSetBossEnabled(on) {
    return transaction(() => {
      slMetaSet('boss_enabled', on ? '1' : '0');
      if (!on) {
        const closed = db.prepare(`
          UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE status = 'event_active'
        `).run();
        return { enabled: false, closed_cycles: closed.changes };
      }
      const last = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
      if (last && last.status === 'event_active') {
        return { enabled: true, cycle: Number(last.cycle), boss_name: last.boss_name };
      }
      const next = slCoopInsertCycle(
        last ? Number(last.cycle) + 1 : 1,
        slCoopDefaultThreshold(),
        SL_COOP_BASE_TIME_DAYS
      );
      return { enabled: true, cycle: Number(next.cycle), boss_name: next.boss_name };
    });
  }

  // ── CYKL ───────────────────────────────────────────────────────────────────
  // Wstawia nowy cykl — rusza NATYCHMIAST i OD RAZU budzi bossa: żadnej zbiórki, żadnego
  // czekania. `threshold` to WPROST punkty życia (SL_BOSS_HP_MULTIPLIER = 1). Kolumna
  // reward_pool została po dawnej puli nagród i nie jest już do niczego używana.
  function slCoopInsertCycle(cycle, threshold, timeLimitDays) {
    db.prepare(`
      INSERT INTO sl_coop (cycle, threshold, time_limit_days, status, triggered_at)
      VALUES (?, ?, ?, 'event_active', CURRENT_TIMESTAMP)
    `).run(cycle, threshold, timeLimitDays);
    const coop = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
    startCoopBossEvent(coop);
    return db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
  }

  // Bieżący cykl — wystarczy ostatni wiersz; przy zupełnie pustej bazie zakłada świeży #1.
  function slCurrentCoop() {
    const coop = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
    if (coop) return coop;
    return slCoopInsertCycle(1, slCoopDefaultThreshold(), SL_COOP_BASE_TIME_DAYS);
  }

  // Losuje bossa, ustawia HP proporcjonalne do progu i liczy termin — coop.time_limit_days
  // DNI ROBOCZYCH od teraz (weekendy nie liczą się do odliczania).
  function startCoopBossEvent(coop) {
    const name = SL_BOSS_NAMES[Math.floor(Math.random() * SL_BOSS_NAMES.length)];
    const maxHp = Math.round(Number(coop.threshold) * SL_BOSS_HP_MULTIPLIER);
    const deadlineMs = addBusinessDaysMs(Date.now(), Number(coop.time_limit_days));
    db.prepare(`
      UPDATE sl_coop SET boss_name = ?, boss_max_hp = ?, boss_hp = ?,
                         boss_started_at = CURRENT_TIMESTAMP, boss_deadline_at = datetime(?, 'unixepoch')
      WHERE cycle = ?
    `).run(name, maxHp, maxHp, Math.floor(deadlineMs / 1000), coop.cycle);
    return { started: true, cycle: Number(coop.cycle), boss_name: name, boss_max_hp: maxHp, deadline_ms: deadlineMs };
  }

  // Udział graczy w cyklu. `amount` to SUMA ZADANYCH OBRAŻEŃ (kości + wpłaty), a `coins`
  // to sama część kupiona za monety — i to WYŁĄCZNIE od niej liczą się nagrody.
  // Kolejność (coins malejąco, przy remisie wcześniejszy cios) wyznacza podium, więc musi
  // być deterministyczna — stąd MIN(id) jako rozstrzygnięcie remisu.
  function slCoopAttackers(cycle) {
    return db.prepare(`
      SELECT c.player_id, p.nickname,
             SUM(c.amount) AS amount,
             SUM(CASE WHEN c.source = 'coins' THEN c.amount ELSE 0 END) AS coins,
             MIN(CASE WHEN c.source = 'coins' THEN c.id ELSE NULL END) AS first_coin_id
      FROM sl_coop_contributions c JOIN players p ON p.id = c.player_id
      WHERE c.cycle = ?
      GROUP BY c.player_id
      ORDER BY coins DESC, first_coin_id ASC, c.player_id ASC
    `).all(cycle).map(r => ({
      player_id: r.player_id,
      nickname: r.nickname,
      amount: Number(r.amount),
      coins: Number(r.coins)
    }));
  }

  // Próg/czas KOLEJNEJ edycji na podstawie wyniku tej: wygrana = trudniej i szybciej,
  // przegrana = łatwiej. Podłoga ulgi to UŁAMEK bazy (patrz SL_COOP_RELIEF_FLOOR), a nie
  // sama baza — inaczej przegrane nie schodziłyby poniżej progu, który może być po prostu
  // nie do ubicia, i gra siedziałaby w pętli przegranych bez wyjścia.
  function slCoopNextDifficulty(coop, defeated) {
    const threshold = Number(coop.threshold);
    const timeLimit = Number(coop.time_limit_days);
    const base = slCoopDefaultThreshold();
    if (defeated) {
      // Trudniej: zaokrąglenia ZAWSZE w stronę większej trudności (próg w górę, czas w
      // dół), żeby zaokrąglenie nigdy przypadkiem nie ułatwiło kolejnej edycji.
      return {
        threshold: Math.ceil(threshold * SL_COOP_THRESHOLD_GROWTH),
        time_limit_days: Math.max(SL_COOP_MIN_TIME_DAYS, Math.floor(timeLimit * SL_COOP_TIME_SHRINK))
      };
    }
    // Łatwiej: zaokrąglenia ZAWSZE w stronę większej ulgi (próg w dół, czas w górę) —
    // inaczej przy małych wartościach czasu zaokrąglenie potrafi „utknąć" i ulga
    // z porażki nigdy realnie nie nadejdzie.
    const floor = Math.max(1, Math.round(base * SL_COOP_RELIEF_FLOOR));
    return {
      threshold: Math.max(floor, Math.floor(threshold * SL_COOP_RELIEF_FACTOR)),
      time_limit_days: Math.min(SL_COOP_BASE_TIME_DAYS, Math.ceil(timeLimit / SL_COOP_RELIEF_FACTOR))
    };
  }

  // ── NAGRODY ────────────────────────────────────────────────────────────────
  // Co dostaje gracz za SAMĄ WPŁATĘ, gdy boss padnie. Liczone wyłącznie z wpłaconych
  // coins — obrażenia z kości są darmowe, więc nie mają czego zwracać ani za co płacić.
  // Zwrot jest procentem wpłaty, więc z definicji zawsze mniejszy od niej: coins mogą
  // z gry tylko wypływać i pętla „wpłać, zabij, wyjdź na plusie" jest niemożliwa.
  function slCoopContribReward(coins) {
    const paid = Math.max(0, Number(coins) || 0);
    if (paid <= 0) return { points: 0, refund: 0, fighter: 0 };
    return {
      points: Math.round(paid * SL_COOP_POINTS_PER_COIN),
      refund: Math.floor(paid * SL_COOP_REFUND_RATE),
      fighter: paid >= SL_COOP_FIGHTER_MIN_COINS ? SL_COOP_FIGHTER_POINTS : 0
    };
  }

  // Pełna rozpiska wypłat dla cyklu, gdyby boss padł TERAZ. Jedno miejsce, z którego
  // korzystają i rozliczenie, i podgląd „ile mi wpadnie" w panelu gracza — inaczej te
  // dwie liczby rozjechałyby się przy pierwszej zmianie stawek, a gracz zobaczyłby
  // obietnicę, której rozliczenie nie dotrzyma.
  function slCoopPayoutPlan(attackers) {
    const contributors = attackers.filter(c => c.coins > 0); // już posortowane malejąco
    return contributors.map((c, i) => {
      const r = slCoopContribReward(c.coins);
      const podium = i < SL_COOP_PODIUM_POINTS.length ? SL_COOP_PODIUM_POINTS[i] : 0;
      return {
        player_id: c.player_id,
        nickname: c.nickname,
        coins: c.coins,
        amount: c.amount,
        contrib_points: r.points,
        fighter_points: r.fighter,
        podium_place: podium > 0 ? i + 1 : 0,
        podium_points: podium,
        points: r.points + r.fighter + podium,
        refund: r.refund
      };
    });
  }

  // ── REJESTR WYPŁAT ─────────────────────────────────────────────────────────
  // Zapisuje wypłatę/karę i JEDNOCZEŚNIE księguje ją na koncie gracza. Wszystko, co boss
  // daje albo zabiera, przechodzi przez tę jedną funkcję — dzięki temu nie da się dodać
  // nowej nagrody i zapomnieć o rejestrze, a przez to o cofaniu.
  const payPoints = () => db.prepare('UPDATE sl_state SET total_points = total_points + ? WHERE player_id = ?');
  const payCoins = () => db.prepare('UPDATE sl_state SET balance = balance + ? WHERE player_id = ?');

  function slRecordPayout(cycle, playerId, kind, points, coins, detail = null) {
    const day = todayWaw();
    db.prepare(`
      INSERT INTO sl_boss_payouts (cycle, player_id, kind, points, coins, detail, day)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cycle, playerId, kind, points, coins, detail, day);
    if (playerId == null) return; // znacznik kamienia milowego — nie ma komu księgować
    if (points !== 0) {
      payPoints().run(points, playerId);
      // Nagroda za bossa to własna kategoria w rozbiciu punktów. `ref` niesie cykl, żeby
      // dało się skasować dokładnie te wiersze przy cofaniu nagród.
      slLogPoints(playerId, 'boss', points, `cycle:${cycle}`, day);
    }
    if (coins !== 0) payCoins().run(coins, playerId);
  }

  // ── KAMIENIE MILOWE ────────────────────────────────────────────────────────
  // Które progi tego cyklu już padły — czytamy z rejestru, a nie z osobnej flagi, więc
  // cofnięcie dnia (które kasuje wiersze) samo z siebie „odbezpiecza" próg. Znacznik
  // z player_id = NULL powstaje nawet wtedy, gdy nie było komu zapłacić.
  function slMilestonesDone(cycle) {
    return new Set(
      db.prepare(`SELECT DISTINCT detail FROM sl_boss_payouts WHERE cycle = ? AND kind = 'milestone'`)
        .all(cycle).map(r => String(r.detail))
    );
  }

  // Odpala progi przekroczone tym ciosem. Płacimy WSZYSTKIM, którzy wpłacili coins w tym
  // cyklu do tej pory — nagradza to wczesne dorzucenie się, bo kto dopłaci po ostatnim
  // progu, nie łapie żadnego.
  function slCheckMilestones(coop, hpAfter) {
    const maxHp = Math.max(1, Number(coop.boss_max_hp));
    const done = slMilestonesDone(coop.cycle);
    const crossed = [];

    for (const pct of SL_COOP_MILESTONES) {
      if (done.has(String(pct))) continue;
      if (hpAfter > (maxHp * pct) / 100) continue;

      const contributors = slCoopAttackers(coop.cycle).filter(c => c.coins > 0);
      // Znacznik idzie ZAWSZE i jako pierwszy — inaczej próg bez wpłacających nie
      // zostawiłby po sobie śladu i odpaliłby ponownie przy następnym ciosie.
      slRecordPayout(coop.cycle, null, 'milestone', 0, 0, String(pct));
      for (const c of contributors) {
        slRecordPayout(coop.cycle, c.player_id, 'milestone', SL_COOP_MILESTONE_POINTS, 0, String(pct));
        slLogActivity(c.player_id, 'boss_reward',
          `🎯 ${coop.boss_name} zbity do ${pct}% — kamień milowy: +${SL_COOP_MILESTONE_POINTS} pkt dla wpłacających`);
      }
      crossed.push({ percent: pct, paid: contributors.length, points: SL_COOP_MILESTONE_POINTS });
    }
    return crossed;
  }

  // ── ZADAWANIE OBRAŻEŃ ──────────────────────────────────────────────────────
  // Jedna droga dla wszystkich trafień (kość, wpłata, ręczny cios admina): zdejmuje HP,
  // zapisuje wkład, sprawdza kamienie milowe i — gdy HP padnie do zera — rozlicza walkę.
  // Wcześniej każde ze źródeł robiło to samo na własną rękę i już raz się rozjechały.
  // `ref` pozwala cofnąć konkretny cios razem z ruchem, który go zadał.
  function slApplyBossDamage(coop, playerId, amount, source, ref = null) {
    const newHp = Math.max(0, Number(coop.boss_hp) - amount);
    db.prepare('UPDATE sl_coop SET boss_hp = ? WHERE cycle = ?').run(newHp, coop.cycle);
    if (playerId != null) {
      db.prepare(`
        INSERT INTO sl_coop_contributions (cycle, player_id, amount, source, day, ref)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(coop.cycle, playerId, amount, source === 'coins' ? 'coins' : 'dice', todayWaw(), ref);
    }

    const milestones = newHp > 0 ? slCheckMilestones(coop, newHp) : [];
    let victory = null;
    if (newHp <= 0) {
      const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle);
      victory = slFinishBossEvent(fresh, true);
    }
    return { hp_left: newHp, max_hp: Number(coop.boss_max_hp), milestones, victory };
  }

  // Obrażenia z DZIENNEGO RZUTU. Wołane z wnętrza transakcji ruchu w server.js, żeby rzut
  // i cios bossa albo zapisały się razem, albo wcale. `ref` to 'move:<id>' SKŁADANY W JS
  // i bindowany jako TEKST — node:sqlite binduje liczbę jako REAL, więc 'move:' || 16
  // dałoby w bazie 'move:16.0' i cofanie po cichu nie trafiałoby w nic (patrz CLAUDE.md).
  function slApplyDiceDamage(playerId, rolls, moveId, turnRef = null) {
    if (!slBossEnabled()) return null;
    const coop = slCurrentCoop();
    if (coop.status !== 'event_active' || Number(coop.boss_hp) <= 0) return null;

    const dmg = rolls.reduce((a, r) => a + r, 0) * SL_BOSS_DICE_DAMAGE_MULT;
    const out = slApplyBossDamage(coop, playerId, dmg, 'dice', `move:${moveId}`);
    // `turnRef` skleja ten wpis z resztą tury, żeby front narysował je jako jeden blok.
    slLogActivity(playerId, 'boss_hit', slBossHitEntry(dmg, 'kość'), turnRef);
    return {
      damage: dmg, boss_name: coop.boss_name, cycle: Number(coop.cycle),
      hp_left: out.hp_left, max_hp: out.max_hp,
      milestones: out.milestones,
      defeated: !!out.victory, victory: out.victory
    };
  }

  // ── ROZLICZENIE ────────────────────────────────────────────────────────────
  // Warunek zwycięstwa: HP bossa spadło do zera.
  function resolveCoopBossEvent(coop) {
    return { defeated: Number(coop.boss_hp) <= 0, cycle: Number(coop.cycle) };
  }

  // Zamyka walkę, wypłaca nagrody albo karę i OD RAZU otwiera kolejną edycję.
  //
  // WYGRANA płaci WYŁĄCZNIE tym, którzy wpłacili coins, i to w czterech kawałkach:
  //   • 0,7 pkt za każdy wpłacony coin,
  //   • ryczałt za udział (od progu SL_COOP_FIGHTER_MIN_COINS),
  //   • podium wpłat (1./2./3. miejsce),
  //   • zwrot części wpłaty w coins.
  // Kto walczył samymi rzutami, nie dostaje nic ponad punkty, które rzuty i tak dały —
  // bo nic nie zaryzykował. Kamienie milowe wypłaciły się już wcześniej, w trakcie walki.
  //
  // PRZEGRANA: nagrody nie ma, wpłacone coins przepadają, a boss zabiera PŁASKIE
  // SL_BOSS_TIMEOUT_PENALTY coins KAŻDEMU graczowi — bez zniżki za wpłatę i bez
  // przycinania do salda, więc można zejść pod kreskę.
  function slFinishBossEvent(coop, defeated) {
    const attackers = slCoopAttackers(coop.cycle);
    const payouts = defeated ? slCoopPayoutPlan(attackers) : [];

    for (const p of payouts) {
      if (p.contrib_points > 0 || p.refund > 0) {
        slRecordPayout(coop.cycle, p.player_id, 'contrib', p.contrib_points, p.refund);
      }
      if (p.fighter_points > 0) {
        slRecordPayout(coop.cycle, p.player_id, 'fighter', p.fighter_points, 0);
      }
      if (p.podium_points > 0) {
        slRecordPayout(coop.cycle, p.player_id, 'podium', p.podium_points, 0, String(p.podium_place));
      }
      // KAŻDA wypłata zostawia ślad w dzienniku — inaczej punkty i coins pojawiają się na
      // koncie bez śladu i gracz nie ma ŻADNEGO sposobu dowiedzieć się, ile dostał.
      // Wpis ma player_id, więc dziennik podświetli każdemu jego własną wypłatę.
      const parts = [`+${p.contrib_points} pkt za wpłatę`];
      if (p.fighter_points > 0) parts.push(`+${p.fighter_points} pkt za udział`);
      if (p.podium_points > 0) parts.push(`+${p.podium_points} pkt za ${p.podium_place}. miejsce`);
      parts.push(`zwrot ${p.refund} coins`);
      slLogActivity(p.player_id, 'boss_reward',
        `🏆 ${coop.boss_name} pokonany — za wpłatę ${p.coins} coins: ${parts.join(', ')}`);
    }

    let playersPenalized = 0;
    if (!defeated) {
      // Kara jest PŁASKA i dotyczy wszystkich — także tych, którzy wpłacili. Dawniej
      // zbijała ją własna wpłata, przez co wpłata 50 była darmowym wykupem od kary
      // i nikt nie wpłacał ani grosza więcej. Teraz wpłata jest realnym ryzykiem,
      // a rekompensuje to strona nagrody przy wygranej.
      const allPlayers = db.prepare('SELECT player_id FROM sl_state').all();
      for (const p of allPlayers) {
        slRecordPayout(coop.cycle, p.player_id, 'penalty', 0, -SL_BOSS_TIMEOUT_PENALTY);
        playersPenalized++;
        slLogActivity(p.player_id, 'boss_reward',
          `💥 ${coop.boss_name} zaatakował — zabrał ${SL_BOSS_TIMEOUT_PENALTY} coins`);
      }
    }

    db.prepare(`
      UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP, boss_hp = 0
        ${defeated ? ', boss_defeated_at = CURRENT_TIMESTAMP' : ''}
      WHERE cycle = ?
    `).run(coop.cycle);

    const next = slCoopNextDifficulty(coop, defeated);
    const nextCoop = slCoopInsertCycle(coop.cycle + 1, next.threshold, next.time_limit_days);

    return {
      cycle: Number(coop.cycle), boss_name: coop.boss_name, payouts, defeated,
      // Bilans cyklu — wprost do wglądu. coins_paid ≥ coins_refunded z definicji.
      coins_paid: attackers.reduce((a, c) => a + c.coins, 0),
      coins_refunded: payouts.reduce((a, p) => a + p.refund, 0),
      points_awarded: payouts.reduce((a, p) => a + p.points, 0),
      contributors: payouts.length,
      timeout_penalty: defeated ? 0 : SL_BOSS_TIMEOUT_PENALTY,
      players_attacked: playersPenalized,
      next_cycle: { cycle: Number(nextCoop.cycle), threshold: next.threshold, time_limit_days: next.time_limit_days }
    };
  }

  // Jeśli minie boss_deadline_at, a boss wciąż żyje, rozliczamy to jak przegraną i OD RAZU
  // startuje kolejna, łagodniejsza edycja. Jeśli boss padł wcześniej, status jest już
  // 'completed' i ten kod nigdy się nie odpala — brak podwójnego rozliczenia.
  function slResolveBossTimeout(cycle) {
    return transaction(() => {
      const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(cycle);
      if (!fresh || fresh.status !== 'event_active') return null;
      if (!fresh.boss_deadline_at) return null;
      if (Date.now() < Date.parse(fresh.boss_deadline_at.replace(' ', 'T') + 'Z')) return null;
      return slFinishBossEvent(fresh, Number(fresh.boss_hp) <= 0);
    });
  }

  // ── COFANIE ────────────────────────────────────────────────────────────────
  // Cofnięcie WSZYSTKICH nagród i kar bossa — czytane z rejestru, nigdy przeliczane.
  // Punkty mają podłogę na zerze (kto zdążył je „wydać" rankingiem, schodzi do zera),
  // coins już nie: saldo i tak może być ujemne, więc przycinanie tylko by kłamało.
  // UWAGA: cykle rozliczone PRZED wprowadzeniem rejestru nie mają tu wierszy i ta funkcja
  // ich nie ruszy. To jest w porządku — zostały już raz cofnięte jednorazową migracją.
  function slRevertBossRewards() {
    const rows = db.prepare(`
      SELECT player_id, SUM(points) AS points, SUM(coins) AS coins
      FROM sl_boss_payouts WHERE player_id IS NOT NULL GROUP BY player_id
    `).all();

    const updPoints = db.prepare('UPDATE sl_state SET total_points = MAX(0, total_points - ?) WHERE player_id = ?');
    const updCoins = db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?');
    for (const r of rows) {
      if (Number(r.points) !== 0) updPoints.run(Number(r.points), r.player_id);
      if (Number(r.coins) !== 0) updCoins.run(Number(r.coins), r.player_id);
    }

    const cycles = Number(db.prepare('SELECT COUNT(DISTINCT cycle) AS c FROM sl_boss_payouts').get().c);
    db.prepare('DELETE FROM sl_boss_payouts').run();
    // Skoro punkty za bossa wracają, rozbicie nie może dalej twierdzić, że gracz je ma.
    db.prepare(`DELETE FROM sl_points_log WHERE category = 'boss'`).run();

    return {
      cycles,
      players: rows.length,
      points: rows.reduce((a, r) => a + Number(r.points), 0),
      coins: rows.reduce((a, r) => a + Number(r.coins), 0)
    };
  }

  // ŚCIEŻKA COFANIA #1 (cały dzień). Odkręca to, co boss zrobił TEGO dnia: wypłaty i kary
  // wracają na konta, a obrażenia zadane tego dnia wracają bossowi na pasek — ale tylko
  // wtedy, gdy walka wciąż trwa. Dla cyklu już rozliczonego HP jest historią i doliczanie
  // go z powrotem tylko by ją sfałszowało.
  function slRevertBossDay(date) {
    const rows = db.prepare(`
      SELECT player_id, SUM(points) AS points, SUM(coins) AS coins
      FROM sl_boss_payouts WHERE day = ? AND player_id IS NOT NULL GROUP BY player_id
    `).all(date);
    const updPoints = db.prepare('UPDATE sl_state SET total_points = MAX(0, total_points - ?) WHERE player_id = ?');
    const updCoins = db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?');
    for (const r of rows) {
      if (Number(r.points) !== 0) updPoints.run(Number(r.points), r.player_id);
      if (Number(r.coins) !== 0) updCoins.run(Number(r.coins), r.player_id);
    }
    const payouts = db.prepare('DELETE FROM sl_boss_payouts WHERE day = ?').run(date);

    const coop = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
    let hpRestored = 0;
    if (coop && coop.status === 'event_active') {
      const dmg = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) AS a FROM sl_coop_contributions WHERE cycle = ? AND day = ?'
      ).get(coop.cycle, date).a;
      hpRestored = Number(dmg);
      if (hpRestored > 0) {
        db.prepare('UPDATE sl_coop SET boss_hp = MIN(boss_max_hp, boss_hp + ?) WHERE cycle = ?')
          .run(hpRestored, coop.cycle);
      }
    }
    const damage = db.prepare('DELETE FROM sl_coop_contributions WHERE day = ?').run(date);

    return {
      payouts_reverted: payouts.changes,
      damage_rows_deleted: damage.changes,
      hp_restored: hpRestored,
      players: rows.length
    };
  }

  // ŚCIEŻKA COFANIA #2 (pojedynczy ruch). Zabiera bossowi obrażenia zadane DOKŁADNIE tym
  // ruchem i oddaje mu HP, jeśli walka wciąż trwa. `ref` przychodzi jako gotowy tekst.
  function slRevertBossDamageForRef(ref) {
    const rows = db.prepare(
      'SELECT cycle, COALESCE(SUM(amount), 0) AS a FROM sl_coop_contributions WHERE ref = ? GROUP BY cycle'
    ).all(ref);
    let restored = 0;
    for (const r of rows) {
      const coop = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(r.cycle);
      if (coop && coop.status === 'event_active') {
        db.prepare('UPDATE sl_coop SET boss_hp = MIN(boss_max_hp, boss_hp + ?) WHERE cycle = ?')
          .run(Number(r.a), r.cycle);
        restored += Number(r.a);
      }
    }
    db.prepare('DELETE FROM sl_coop_contributions WHERE ref = ?').run(ref);
    return { hp_restored: restored };
  }

  // ŚCIEŻKA COFANIA #5 (wyczyszczenie gracza).
  function slClearPlayerBossData(playerId) {
    db.prepare('DELETE FROM sl_coop_contributions WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_boss_payouts WHERE player_id = ?').run(playerId);
  }

  // ŚCIEŻKA COFANIA #4 (reset całej gry).
  function slResetBossData() {
    db.exec(`
      DELETE FROM sl_coop_contributions;
      DELETE FROM sl_boss_payouts;
      DELETE FROM sl_coop;
    `);
  }

  // ── DISCORD ────────────────────────────────────────────────────────────────
  // Rozpiska „kto ile dostał". JEDNO miejsce, bo są TRZY ścieżki zamknięcia walki
  // (zabicie rzutem, zabicie wpłatą, ręczne zamknięcie z panelu) i wcześniej rozpiskę
  // miała tylko ostatnia z nich.
  function slBossPayoutLines(outcome) {
    const paid = outcome.payouts || [];
    if (!paid.length) return '';
    return '\n\n' + paid.map(p => {
      const medal = p.podium_place === 1 ? '🥇 ' : p.podium_place === 2 ? '🥈 ' : p.podium_place === 3 ? '🥉 ' : '• ';
      const extra = [];
      if (p.fighter_points > 0) extra.push(`udział +${p.fighter_points}`);
      if (p.podium_points > 0) extra.push(`podium +${p.podium_points}`);
      return `${medal}**${p.nickname}** — wpłata ${p.coins} → **+${p.points}** pkt` +
        (extra.length ? ` (${extra.join(', ')})` : '') + `, zwrot **${p.refund}** coins`;
    }).join('\n');
  }

  function slEmitBossTimeout(outcome) {
    slEmit('coop_completed', () => ({
      content: outcome.defeated ? '🏆 **Boss pokonany!**' : '💥 **Czas minął — boss zaatakował!**',
      embeds: [{
        title: `Edycja #${outcome.cycle} — ${outcome.boss_name}`,
        url: snakesUrl(),
        description: (outcome.defeated
          ? `Wpłacający (${outcome.contributors}) dzielą **${outcome.points_awarded} pkt** i odzyskują ` +
            `**${outcome.coins_refunded}** z wpłaconych **${outcome.coins_paid}** coins.`
          : `Nie zdążyliście dobić bossa na czas. Nagrody nie ma, wpłacone coins przepadły, ` +
            `a boss zabrał **${outcome.timeout_penalty} coins** każdemu graczowi ` +
            `(${outcome.players_attacked} ${slPlayerWord(outcome.players_attacked)}).`
        ) + slBossPayoutLines(outcome) +
          `\n\n➡️ Edycja #${outcome.next_cycle.cycle} rusza od razu: **${outcome.next_cycle.time_limit_days}** dni roboczych na pokonanie kolejnego bossa.`,
        color: outcome.defeated ? 0x53D06B : 0xE85D4A
      }]
    }));
  }

  // Ogłoszenie o przebudowie. Idzie PROSTO na webhooka, z pominięciem szyny zdarzeń —
  // tak samo jak jednorazowe doładowanie „bank się pomylił" w server.js. Powód: szyna ma
  // przełączniki per typ zdarzenia i ktoś mógł sobie wyłączyć akurat ten, a ta wiadomość
  // ma dojść raz i na pewno. Wysyłka jest po commicie i nigdy nie blokuje startu serwera:
  // jak Discord nie odpowie, boss i tak jest włączony, a flaga już ustawiona.
  function announceRelaunch(info) {
    if (!postDiscord) return;
    postDiscord({
      content: '🧪 **Boss wraca — nowa mechanika, faza testów!**',
      embeds: [{
        title: `Edycja #${info.cycle} — ${info.boss_name} (${info.max_hp} HP, ${info.time_limit_days} dni roboczych)`,
        url: snakesUrl(),
        description:
          `**Co się zmieniło:** nagrody dostają teraz WYŁĄCZNIE ci, którzy wpłacą coins — ` +
          `rzuty kostką nadal ranią bossa za darmo, ale nic za nie nie ma.\n\n` +
          `Za wpłatę dostajesz: **${SL_COOP_POINTS_PER_COIN} pkt** za każdy coin, ` +
          `**${Math.round(SL_COOP_REFUND_RATE * 100)}% wpłaty z powrotem**, ` +
          `**+${SL_COOP_FIGHTER_POINTS} pkt** ryczałtu od ${SL_COOP_FIGHTER_MIN_COINS} coins ` +
          `i podium wpłat **+${SL_COOP_PODIUM_POINTS.join('/+')} pkt**.\n` +
          `Doszły **kamienie milowe**: przy ${SL_COOP_MILESTONES.join('%, ')}% HP bossa każdy, ` +
          `kto do tej pory wpłacił, dostaje **+${SL_COOP_MILESTONE_POINTS} pkt od ręki** — ` +
          `więc im wcześniej się dorzucisz, tym więcej progów złapiesz.\n\n` +
          `⚠️ **Jak nie zdążycie**, boss zabiera **${SL_BOSS_TIMEOUT_PENALTY} coins KAŻDEMU**, ` +
          `płasko i bez zniżki za wpłatę — saldo może zejść pod kreskę.\n\n` +
          `To **faza testów**: stawki i trudność będą jeszcze krążone na podstawie tego, ` +
          `jak pójdzie. Zgłaszajcie, co nie gra.`,
        color: 0xF5C842
      }]
    }).catch(err => console.error('Snakes/Boss [relaunch]:', err.message));
  }

  function slEmitMilestones(coop, milestones) {
    for (const ms of milestones) {
      slEmit('coop_milestone', () => ({
        content: `🎯 **${coop.boss_name} zbity do ${ms.percent}%!**`,
        embeds: [{
          title: `Kamień milowy — edycja #${coop.cycle}`,
          url: snakesUrl(),
          description: ms.paid > 0
            ? `**+${ms.points} pkt** dla ${ms.paid} ${slPlayerWord(ms.paid)}, którzy już się dorzucili. ` +
              `Kto wpłaci teraz, załapie się na kolejne progi.`
            : `Nikt jeszcze nie wpłacił ani coina — kamień milowy przeszedł bez wypłaty. ` +
              `Wpłaćcie, żeby załapać się na następny.`,
          color: 0xF5C842
        }]
      }));
    }
  }

  // ── PAYLOAD DLA UI ─────────────────────────────────────────────────────────
  // Ile dmg zadała ekipa którego dnia — do linijki „wczoraj zrobiliście tyle, potrzeba
  // tyle dziennie". Bez tego gracz nie ma jak ocenić, czy idziecie na wygraną.
  function slCoopDailyDamage(cycle) {
    return db.prepare(`
      SELECT day, SUM(amount) AS amount FROM sl_coop_contributions
      WHERE cycle = ? AND day IS NOT NULL GROUP BY day ORDER BY day DESC LIMIT 7
    `).all(cycle).map(r => ({ day: r.day, amount: Number(r.amount) }));
  }

  // Poprzedni dzień roboczy przed `day` (YYYY-MM-DD) — w poniedziałek to piątek.
  // Liczone na dacie w UTC w południe, żeby zmiana czasu nie przesunęła dnia.
  function slPrevBusinessDay(day) {
    const d = new Date(day + 'T12:00:00Z');
    do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  }

  // Ile dni roboczych zostało do terminu (zaokrąglone w górę, min. 0) — do wyliczenia
  // „ile trzeba zdejmować dziennie".
  function slBusinessDaysLeft(deadlineIso) {
    if (!deadlineIso) return 0;
    const ms = Date.parse(deadlineIso) - Date.now();
    if (ms <= 0) return 0;
    let days = 0;
    let cursor = Date.now();
    const end = Date.parse(deadlineIso);
    // Liczymy dni kalendarzowe i odrzucamy weekendy — ta sama zasada, co przy wyznaczaniu
    // terminu (addBusinessDaysMs), więc obie liczby mówią o tym samym.
    while (cursor < end && days < 60) {
      const d = new Date(cursor).getUTCDay();
      if (d !== 0 && d !== 6) days++;
      cursor += 86400000;
    }
    return Math.max(1, days);
  }

  // Zwraca null, gdy boss jest wyłączony — UI czyta to jako „nie ma czego pokazywać".
  // Sprawdzenie jest PRZED slCurrentCoop(), bo tamto samo zakłada nowy cykl, gdy tabela
  // jest pusta — wyłączony boss nie ma prawa się tak wskrzesić.
  function slCoopPayload(meId) {
    if (!slBossEnabled()) return null;
    const coop = slCurrentCoop();
    const attackers = slCoopAttackers(coop.cycle);
    const plan = slCoopPayoutPlan(attackers);
    const me = meId ? attackers.find(c => c.player_id === meId) : null;
    const minePlan = meId ? plan.find(p => p.player_id === meId) : null;
    const threshold = Number(coop.threshold);

    // Poprzednia edycja (jeśli już się rozstrzygnęła) — do krótkiego podsumowania „co się
    // stało ostatnio i dlatego trudność jest taka, jaka jest".
    let previousResult = null;
    if (coop.cycle > 1) {
      const prev = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle - 1);
      if (prev && prev.completed_at) {
        // Czy ta walka w ogóle ZOSTAŁA ROZLICZONA — czytamy z rejestru, a nie zgadujemy
        // z braku `boss_defeated_at`. Cykl domknięty administracyjnie (wyłącznik bossa
        // w panelu, migracja przy wdrożeniu) też nie ma daty pokonania, a mimo to NIKT
        // nie dostał kary. Wnioskowanie „nie pokonany = boss zaatakował" kazało więc
        // panelowi ogłaszać wszystkim stratę 50 coins, której nie było.
        const prevPenalty = db.prepare(`
          SELECT COUNT(*) AS n, COALESCE(SUM(-coins), 0) AS taken
          FROM sl_boss_payouts WHERE cycle = ? AND kind = 'penalty'
        `).get(prev.cycle);
        const myPenalty = meId ? db.prepare(`
          SELECT COALESCE(SUM(-coins), 0) AS taken
          FROM sl_boss_payouts WHERE cycle = ? AND kind = 'penalty' AND player_id = ?
        `).get(prev.cycle, meId).taken : 0;

        previousResult = {
          cycle: Number(prev.cycle),
          boss_name: prev.boss_name,
          defeated: !!prev.boss_defeated_at,
          // `settled` = walka doszła do rozliczenia (wygrana albo realnie przegrana).
          // false znaczy „domknięta bez konsekwencji" i UI ma tak właśnie napisać.
          settled: !!prev.boss_defeated_at || Number(prevPenalty.n) > 0,
          penalized: Number(prevPenalty.n),
          timeout_penalty: prev.boss_defeated_at ? 0 : SL_BOSS_TIMEOUT_PENALTY,
          my_penalty: Number(myPenalty)
        };
        // MOJA wypłata z tamtej walki — czytana z REJESTRU, nie przeliczana. Dzięki temu
        // liczba na karcie jest dokładnie tą, która wylądowała na koncie, nawet jeśli
        // stawki zmieniły się po tamtym rozliczeniu.
        const paid = db.prepare(`
          SELECT player_id, SUM(points) AS points, SUM(coins) AS coins
          FROM sl_boss_payouts
          WHERE cycle = ? AND player_id IS NOT NULL AND kind IN ('contrib','fighter','podium')
          GROUP BY player_id
        `).all(prev.cycle);
        const mine = meId ? paid.find(p => p.player_id === meId) : null;
        // Ile kto WPŁACIŁ bierzemy z wkładów (te przeżywają zamknięcie cyklu), a ile
        // DOSTAŁ — z rejestru. Panel admina pokazuje rozpiskę z tamtej walki, więc musi
        // mieć obie liczby obok siebie.
        const prevPaid = new Map(slCoopAttackers(prev.cycle).map(c => [c.player_id, c]));
        previousResult.payouts = paid.map(p => {
          const a = prevPaid.get(p.player_id);
          return {
            player_id: p.player_id,
            nickname: a ? a.nickname : '?',
            coins: a ? a.coins : 0,
            points: Number(p.points),
            refund: Number(p.coins)
          };
        });
        previousResult.contributors = paid.length;
        previousResult.points_awarded = paid.reduce((a, p) => a + Number(p.points), 0);
        previousResult.coins_refunded = paid.reduce((a, p) => a + Number(p.coins), 0);
        previousResult.coins_paid = previousResult.payouts.reduce((a, p) => a + p.coins, 0);
        previousResult.my_points = mine ? Number(mine.points) : 0;
        previousResult.my_refund = mine ? Number(mine.coins) : 0;

        // ── MOJA ROZPISKA Z TAMTEJ WALKI ── (kolumna „poprzedni boss" w panelu)
        // Gracz pytał wprost: „co dostałem od poprzedniego bossa albo ile mi zabrał".
        // Suma my_points tego nie mówi — nie ma w niej kamieni milowych (wpadły w trakcie)
        // ani tego, ile sam wpłaciłem. Wszystko z REJESTRU, po rodzajach, więc liczby są
        // dokładnie tymi, które wylądowały na koncie, także po zmianie stawek.
        if (meId) {
          const byKind = {};
          for (const r of db.prepare(`
            SELECT kind, SUM(points) AS points, SUM(coins) AS coins
            FROM sl_boss_payouts WHERE cycle = ? AND player_id = ? GROUP BY kind
          `).all(prev.cycle, meId)) {
            byKind[r.kind] = { points: Number(r.points), coins: Number(r.coins) };
          }
          const pts = k => (byKind[k] ? byKind[k].points : 0);
          const myPrev = prevPaid.get(meId);
          previousResult.mine = {
            paid_coins: myPrev ? myPrev.coins : 0,     // ile wpłaciłem coins
            damage: myPrev ? myPrev.amount : 0,        // ile obrażeń zadałem (kość + coins)
            contrib_points: pts('contrib'),
            fighter_points: pts('fighter'),
            podium_points: pts('podium'),
            milestone_points: pts('milestone'),
            refund: byKind.contrib ? byKind.contrib.coins : 0,
            penalty: Number(myPenalty)
          };
        }
      }
    }

    const maxHp = Math.max(1, Number(coop.boss_max_hp));
    const hp = Math.max(0, Number(coop.boss_hp));
    const deadlineIso = coop.boss_deadline_at
      ? new Date(coop.boss_deadline_at.replace(' ', 'T') + 'Z').toISOString()
      : null;
    const daysLeft = slBusinessDaysLeft(deadlineIso);
    const daily = slCoopDailyDamage(coop.cycle);
    const dailyAmount = day => { const r = daily.find(d => d.day === day); return r ? r.amount : 0; };
    const todayStr = todayWaw();
    // Poprzedni dzień roboczy liczy się tylko, jeśli ten boss już wtedy walczył — inaczej
    // świeży boss od progu pokazywałby „wczoraj: 0 ⚠️ poniżej normy" za dzień, w którym
    // nie było z kim walczyć. Dzień startu po czasie Warszawy, jak cały `day` w grze.
    const startDay = coop.boss_started_at
      ? new Date(coop.boss_started_at.replace(' ', 'T') + 'Z').toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
      : null;
    const prevBizDay = slPrevBusinessDay(todayStr);
    const prevDayCounts = !startDay || prevBizDay >= startDay;

    // Ile już wpłynęło z kamieni milowych — żeby panel nie udawał, że to dopiero przyjdzie.
    const myMilestones = meId ? Number(db.prepare(`
      SELECT COALESCE(SUM(points), 0) AS p FROM sl_boss_payouts
      WHERE cycle = ? AND player_id = ? AND kind = 'milestone'
    `).get(coop.cycle, meId).p) : 0;

    return {
      cycle: Number(coop.cycle),
      status: coop.status,
      threshold,
      default_threshold: slCoopDefaultThreshold(),
      my_damage: me ? me.amount : 0,
      my_coins: me ? me.coins : 0,
      attackers,
      // Pełna rozpiska „kto ile dostanie, jeśli boss padnie teraz" — ta sama funkcja, co
      // przy rozliczeniu, więc panel nie może obiecać czegoś innego, niż wypłaci gra.
      payout_plan: plan,
      // ── CO DOSTANĘ JA ──
      // Stare UI mówiło tylko „będzie nagroda albo kara", bez ani jednej liczby, więc
      // największe wydarzenie w grze nie dawało się z niczym porównać.
      my_reward: {
        qualified: !!(minePlan && minePlan.fighter_points > 0),
        fighter_min: SL_COOP_FIGHTER_MIN_COINS,
        coins_to_qualify: Math.max(0, SL_COOP_FIGHTER_MIN_COINS - (me ? me.coins : 0)),
        contrib_points: minePlan ? minePlan.contrib_points : 0,
        fighter_points: minePlan ? minePlan.fighter_points : 0,
        podium_place: minePlan ? minePlan.podium_place : 0,
        podium_points: minePlan ? minePlan.podium_points : 0,
        points: minePlan ? minePlan.points : 0,
        refund: minePlan ? minePlan.refund : 0,
        milestones_earned: myMilestones
      },
      time_limit_days: Number(coop.time_limit_days),
      previous_result: previousResult,
      timeout_penalty: SL_BOSS_TIMEOUT_PENALTY,
      // Kara jest płaska — każdy widzi tę samą liczbę, bez względu na wpłatę.
      my_timeout_penalty: SL_BOSS_TIMEOUT_PENALTY,
      next_on_win: slCoopNextDifficulty(coop, true),
      next_on_loss: slCoopNextDifficulty(coop, false),
      // ── JAK NAM IDZIE ──
      pace: {
        dealt: maxHp - hp,
        days_left: daysLeft,
        needed_per_day: daysLeft > 0 ? Math.ceil(hp / daysLeft) : hp,
        // Dawne `last_day` brało NAJŚWIEŻSZY dzień z obrażeniami — czyli zwykle DZISIEJSZY,
        // jeszcze niedokończony. Panel nazywał to „ostatnio w ciągu dnia" i rano zawsze
        // wieszał ⚠️, bo połowa dnia wypadała gorzej od dziennej normy. Teraz osobno:
        // dziś (w toku) i poprzedni DZIEŃ ROBOCZY (zamknięty — tylko on nadaje się do
        // porównania z normą). Oba liczą wszystkie obrażenia: rzuty kostką + wpłaty coins.
        today: { day: todayStr, amount: dailyAmount(todayStr) },
        prev_day: prevDayCounts ? { day: prevBizDay, amount: dailyAmount(prevBizDay) } : null,
        last_day: daily.length ? daily[0] : null, // zostaje dla starego frontu z cache
        daily
      },
      milestones: SL_COOP_MILESTONES.map(pct => ({
        percent: pct,
        points: SL_COOP_MILESTONE_POINTS,
        reached: hp <= (maxHp * pct) / 100,
        hp_at: Math.floor((maxHp * pct) / 100)
      })),
      boss: coop.boss_name ? {
        name: coop.boss_name,
        hp,
        max_hp: Number(coop.boss_max_hp),
        percent: Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))),
        defeated: !!coop.boss_defeated_at,
        active: coop.status === 'event_active',
        deadline_at: deadlineIso,
        started_at: coop.boss_started_at
          ? new Date(coop.boss_started_at.replace(' ', 'T') + 'Z').toISOString()
          : (deadlineIso
              ? new Date(Date.parse(deadlineIso) - Number(coop.time_limit_days) * 86400000).toISOString()
              : null),
        time_limit_days: Number(coop.time_limit_days),
        dice_damage_mult: SL_BOSS_DICE_DAMAGE_MULT,
        // Kurs wpłaty i stawki nagród — regulamin w UI czyta je stąd, zamiast mieć
        // zaszyte na sztywno liczby, które kłamią po każdej zmianie .env.
        points_per_coin: SL_COOP_POINTS_PER_COIN,
        refund_rate: SL_COOP_REFUND_RATE,
        fighter_min_coins: SL_COOP_FIGHTER_MIN_COINS,
        fighter_points: SL_COOP_FIGHTER_POINTS,
        podium_points: SL_COOP_PODIUM_POINTS,
        milestone_points: SL_COOP_MILESTONE_POINTS
      } : null
    };
  }

  // ── SCHEDULER TERMINU ──────────────────────────────────────────────────────
  // Tick co minutę + raz od razu przy starcie (samo-naprawa po restarcie, także po tym,
  // jak admin ustawi termin w przeszłości). Działa ZAWSZE, niezależnie od webhooka —
  // slEmit sam pomija wysyłkę, gdy webhook nie jest skonfigurowany.
  function startDeadlineScheduler() {
    const tick = () => {
      if (!slBossEnabled()) return;
      const coop = slCurrentCoop();
      if (coop.status !== 'event_active') return;
      const outcome = slResolveBossTimeout(coop.cycle);
      if (outcome) slEmitBossTimeout(outcome);
    };
    tick();
    setInterval(tick, 60_000);
    console.log(
      `Snakes/Co-op: próg bazowy ${SL_COOP_THRESHOLD} HP, eskalacja ×${SL_COOP_THRESHOLD_GROWTH} po wygranej ` +
      `(czas ×${SL_COOP_TIME_SHRINK}, min. ${SL_COOP_MIN_TIME_DAYS} dni), ulga ×${SL_COOP_RELIEF_FACTOR} ` +
      `po porażce do podłogi ${Math.round(SL_COOP_THRESHOLD * SL_COOP_RELIEF_FLOOR)} HP.`
    );
  }

  // ── MIGRACJE PRZY STARCIE ──────────────────────────────────────────────────
  // Nazwa flagi niesie WERSJĘ mechaniki. Gdyby kiedyś trzeba było wystartować bossa
  // od nowa po kolejnej przebudowie, wystarczy podbić numer — stara flaga zostaje
  // w bazie i nie blokuje nowego startu.
  const BOSS_RELAUNCH_FLAG = 'boss_relaunch_v2_done';

  // JEDNORAZOWE ZAPALENIE BOSSA PO PRZEBUDOWIE.
  // Na produkcji `boss_enabled` stoi na '0', bo zgasił go awaryjny hamulec sprzed
  // przebudowy. Sam deploy by go nie zapalił, a klikanie w panelu po każdym wdrożeniu
  // to proszenie się o to, żeby ktoś zapomniał. Flaga pilnuje, żeby stało się to
  // DOKŁADNIE RAZ: gdy właściciel później świadomie zgasi bossa z panelu, kolejny
  // restart NIE ma prawa włączyć go z powrotem.
  //
  // Próg ustawiamy WPROST przez override, a nie licząc na domyślną wartość z kodu —
  // w sl_meta może siedzieć `coop_threshold_override` z dawnych czasów i po cichu
  // przebiłby nowy default.
  function relaunchBossOnce() {
    if (slMetaGet(BOSS_RELAUNCH_FLAG)) return null;

    return transaction(() => {
      slMetaSet(BOSS_RELAUNCH_FLAG, new Date().toISOString());
      slMetaSet('coop_threshold_override', SL_COOP_THRESHOLD);

      // Domykamy cokolwiek wisiało z czasów sprzed wyłączenia. To NIE jest kosmetyka:
      // stary cykl ma termin sprzed miesięcy, więc pierwszy tik schedulera rozliczyłby
      // go jako przegraną i zabrał wszystkim po 50 coins za walkę, której nikt nie
      // miał szans rozegrać. Zamykamy go bez nagród i bez kar.
      const closed = db.prepare(`
        UPDATE sl_coop SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE status = 'event_active'
      `).run();

      slMetaSet('boss_enabled', '1');
      const last = db.prepare('SELECT cycle FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
      const fresh = slCoopInsertCycle(
        last ? Number(last.cycle) + 1 : 1,
        SL_COOP_THRESHOLD,
        SL_COOP_BASE_TIME_DAYS
      );
      return {
        cycle: Number(fresh.cycle),
        boss_name: fresh.boss_name,
        max_hp: Number(fresh.boss_max_hp),
        time_limit_days: SL_COOP_BASE_TIME_DAYS,
        closed_stale: closed.changes
      };
    });
  }

  function runStartupMigrations() {
    // Zapalenie bossa idzie PRZED resztą — migracje niżej sprawdzają slBossEnabled()
    // i przy zgaszonym bossie po prostu nic nie robią.
    const relaunch = relaunchBossOnce();
    if (relaunch) {
      console.log(
        `Snakes/Boss: WŁĄCZONY po przebudowie mechaniki. Edycja #${relaunch.cycle} — ` +
        `${relaunch.boss_name}, ${relaunch.max_hp} HP, ${relaunch.time_limit_days} dni roboczych` +
        (relaunch.closed_stale ? ` (domknięto ${relaunch.closed_stale} przeterminowaną walkę bez kar)` : '') +
        '. Leci tylko raz — wyłączenie z panelu zostaje wyłączeniem.'
      );
      announceRelaunch(relaunch);
    }

    // Edycje, które utknęły w starym statusie 'collecting' (sprzed przejścia na jedną
    // fazę), budzimy natychmiast — dostają swojego bossa i normalny termin. Przy
    // wyłączonym bossie nie ma czego budzić.
    if (slBossEnabled()) {
      const rows = db.prepare(`SELECT * FROM sl_coop WHERE status = 'collecting'`).all();
      for (const row of rows) {
        transaction(() => {
          db.prepare(`
            UPDATE sl_coop SET status = 'event_active', triggered_at = CURRENT_TIMESTAMP
            WHERE cycle = ? AND status = 'collecting'
          `).run(row.cycle);
          const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(row.cycle);
          const info = startCoopBossEvent(fresh);
          console.log(`Snakes/Co-op: legacy cykl #${info.cycle} obudzony — ${info.boss_name}, ${info.boss_max_hp} HP`);
        });
      }
    }

    // NIE JEST JEDNORAZOWA — flaga trzyma numer cyklu, więc odpala się raz na KAŻDY nowy
    // cykl bossa. To żywa logika, nie migracja (patrz CLAUDE.md).
    // Kasa wrzucona do puli, zanim boss wstał, nie może po prostu wyparować: przeliczamy
    // ją 1:1 na obrażenia i od razu je bossowi zadajemy. Wiersze sprzed `boss_started_at`
    // to WŁAŚNIE tamte wpłaty — rozpoznajemy je po czasie, a nie po statusie cyklu.
    // Same wiersze zostają nietknięte: liczą się dalej jako wkład do podziału nagród.
    // HP nie schodzi poniżej 1, bo dobicie ma pójść normalną drogą (rzut/wpłata gracza).
    if (slBossEnabled()) {
      const FLAG = 'coop_legacy_contrib_damage_cycle';
      const coop = db.prepare('SELECT * FROM sl_coop ORDER BY cycle DESC LIMIT 1').get();
      if (coop && coop.status === 'event_active' && coop.boss_started_at &&
          String(slMetaGet(FLAG) || '') !== String(coop.cycle)) {
        transaction(() => {
          const legacy = db.prepare(`
            SELECT player_id, SUM(amount) AS amount
            FROM sl_coop_contributions
            WHERE cycle = ? AND created_at < ?
            GROUP BY player_id
          `).all(coop.cycle, coop.boss_started_at);

          slMetaSet(FLAG, coop.cycle); // ZAWSZE — nawet bez wpłat, żeby nie liczyć dwa razy
          const total = legacy.reduce((a, r) => a + Number(r.amount), 0);
          if (total <= 0) return;

          const newHp = Math.max(1, Number(coop.boss_hp) - total);
          db.prepare('UPDATE sl_coop SET boss_hp = ? WHERE cycle = ?').run(newHp, coop.cycle);
          for (const r of legacy) {
            slLogActivity(r.player_id, 'boss_hit', slBossHitEntry(Number(r.amount), 'wpłata'));
          }
          console.log(`Snakes/Co-op: wpłaty z przygotowań (${total}) zadane jako obrażenia — ${coop.boss_name} ma ${newHp}/${coop.boss_max_hp} HP`);
        });
      }
    }
  }

  // ── TRASY ──────────────────────────────────────────────────────────────────
  function registerRoutes(app, { authPlayer, checkAdmin, buildState }) {
    // POST /api/snakes/coop/contribute { amount } — wpłata coins na bossa: 1 COIN =
    // 1 OBRAŻENIE, dowolna kwota z własnego salda. Bez limitu dziennego — limitem jest
    // saldo, które napełnia się wyłącznie grą. Jeśli wpłata dobija bossa, rozliczenie
    // leci od razu.
    app.post('/api/snakes/coop/contribute', authPlayer, (req, res) => {
      const playerId = req.player.id;
      const nickname = req.player.nickname;
      const amount = parseInt(req.body.amount, 10);

      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Podaj dodatnią liczbę coins.' });
      }

      const out = transaction(() => {
        const st = slEnsureState(playerId);
        if (!slBossEnabled()) return { notActive: true };
        const coop = slCurrentCoop();
        if (coop.status !== 'event_active' || Number(coop.boss_hp) <= 0) return { notActive: true };
        // Ujemne saldo nie przejdzie przez ten warunek — dług blokuje wpłaty, dokładnie
        // tak samo jak blokuje sklep.
        if (Number(st.balance) < amount) return { poor: true, balance: Number(st.balance) };

        db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?').run(amount, playerId);
        const hit = slApplyBossDamage(coop, playerId, amount, 'coins');
        slLogActivity(playerId, 'boss_hit', slBossHitEntry(amount, 'coins'));

        return {
          notActive: false, poor: false, boss_name: coop.boss_name, cycle: Number(coop.cycle),
          damage: amount, hp_left: hit.hp_left, max_hp: hit.max_hp,
          milestones: hit.milestones, victory: hit.victory,
          state: buildState(playerId)
        };
      });

      if (out.notActive) return res.status(400).json({ error: 'Żaden boss aktualnie nie walczy.' });
      if (out.poor) {
        return res.status(400).json({ error: `Za mało coins — chcesz wpłacić ${amount}, masz ${out.balance}.` });
      }

      if (out.milestones && out.milestones.length) {
        slEmitMilestones({ boss_name: out.boss_name, cycle: out.cycle }, out.milestones);
      }

      if (out.victory) {
        const v = out.victory;
        slEmit('coop_completed', () => ({
          content: `🏆 **${out.boss_name} pokonany!**`,
          embeds: [{
            title: `Edycja #${v.cycle}`,
            url: snakesUrl(),
            description: `Ostateczny cios zadał **${nickname}**. Wpłacający (${v.contributors}) dzielą ` +
              `**${v.points_awarded} pkt** i odzyskują **${v.coins_refunded}** z wpłaconych **${v.coins_paid}** coins.` +
              slBossPayoutLines(v),
            color: 0x53D06B
          }]
        }));
      }

      res.json({ success: true, ...out });
    });

    // POST /api/snakes/admin/coop/complete { password, force? } — ręczne domknięcie walki.
    app.post('/api/snakes/admin/coop/complete', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const force = !!req.body.force;

      const out = transaction(() => {
        if (!slBossEnabled()) return { notActive: true, status: 'wyłączony' };
        const coop = slCurrentCoop();
        if (coop.status !== 'event_active') return { notActive: true, status: coop.status };

        const outcome = resolveCoopBossEvent(coop);
        if (!outcome.defeated && !force) return { notDefeated: true };

        return { notActive: false, ...slFinishBossEvent(coop, outcome.defeated) };
      });

      if (out.notActive) {
        return res.status(400).json({ error: `Żadne wydarzenie nie trwa (status: ${out.status}).` });
      }
      if (out.notDefeated) {
        return res.status(400).json({ error: 'Boss jeszcze nie pokonany (dodaj force:true, żeby zamknąć mimo to — bez nagrody, jak przy przegranej).' });
      }

      slEmitBossTimeout(out);
      res.json({ success: true, ...out });
    });

    // POST /api/snakes/admin/coop/config { password, threshold?, deadline_at? }.
    // `threshold` skaluje HP NASTĘPNYCH edycji (bieżący boss ma HP przyznane przy
    // wybudzeniu, więc to nigdy nie przeskalowuje go z mocą wsteczną). `deadline_at`
    // ustawia DOKŁADNY termin aktywnego bossa i może być zmieniany dowolnie często;
    // termin z przeszłości rozlicza event od razu, bez czekania na tik schedulera.
    app.post('/api/snakes/admin/coop/config', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const threshold = req.body.threshold != null ? parseInt(req.body.threshold, 10) : null;
      const deadlineAt = req.body.deadline_at != null ? String(req.body.deadline_at) : null;
      const deadlineMs = deadlineAt != null ? Date.parse(deadlineAt) : null;

      if (threshold != null && (!Number.isInteger(threshold) || threshold <= 0)) {
        return res.status(400).json({ error: 'Próg musi być dodatnią liczbą całkowitą.' });
      }
      if (deadlineAt != null && !Number.isFinite(deadlineMs)) {
        return res.status(400).json({ error: 'Nieprawidłowa data/godzina terminu.' });
      }

      const out = transaction(() => {
        if (!slBossEnabled()) return { notActive: true, status: 'wyłączony' };
        const coop = slCurrentCoop();

        // Walidacja PRZED jakimkolwiek zapisem — żeby błąd na jednym polu nie zostawił
        // drugiego już zacommitowanego (transaction() commituje też przy zwykłym return).
        if (deadlineMs != null && coop.status !== 'event_active') {
          return { notActive: true, cycle: Number(coop.cycle), status: coop.status };
        }

        if (threshold != null) slMetaSet('coop_threshold_override', threshold);

        let deadlineChanged = false;
        let resolved = null;
        if (deadlineMs != null) {
          db.prepare(`UPDATE sl_coop SET boss_deadline_at = datetime(?, 'unixepoch') WHERE cycle = ?`)
            .run(Math.floor(deadlineMs / 1000), coop.cycle);
          deadlineChanged = true;
          if (deadlineMs <= Date.now()) {
            const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle);
            resolved = slFinishBossEvent(fresh, Number(fresh.boss_hp) <= 0);
          }
        }

        return {
          notActive: false, cycle: Number(coop.cycle), threshold_changed: threshold != null,
          deadline_changed: deadlineChanged, resolved, coop: slCoopPayload(null)
        };
      });

      if (out.notActive) {
        return res.status(400).json({ error: `Nie ma czego ustawiać — boss nie walczy teraz (status: ${out.status}).` });
      }
      if (out.resolved) slEmitBossTimeout(out.resolved);
      res.json({ success: true, ...out });
    });

    // POST /api/snakes/admin/coop/boss { password, hp?, max_hp?, name?, damage?, player_id? }
    // — ręczne sterowanie AKTYWNYM bossem. Wszystkie pola opcjonalne i można je łączyć:
    //   • `max_hp` — nowe maksimum (bieżące HP przycinamy do niego),
    //   • `hp`     — bieżące HP wprost (przycinane do 0..max_hp),
    //   • `damage` — DELTA: dodatnia zabiera HP, ujemna leczy (nakłada się na `hp`),
    //   • `player_id` — komu policzyć te obrażenia (dopisuje wkład jako trafienie z kości,
    //     więc NIE liczy się do nagród — te idą wyłącznie z wpłat),
    //   • `name`   — nowa nazwa bossa.
    // Jeśli HP dobije do zera, event rozlicza się OD RAZU jako wygrana.
    app.post('/api/snakes/admin/coop/boss', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const hp = req.body.hp != null ? parseInt(req.body.hp, 10) : null;
      const maxHp = req.body.max_hp != null ? parseInt(req.body.max_hp, 10) : null;
      const damage = req.body.damage != null ? parseInt(req.body.damage, 10) : null;
      const playerId = req.body.player_id != null ? parseInt(req.body.player_id, 10) : null;
      const name = req.body.name != null ? String(req.body.name).trim() : null;

      if (hp != null && (!Number.isInteger(hp) || hp < 0)) {
        return res.status(400).json({ error: 'HP musi być liczbą całkowitą ≥ 0.' });
      }
      if (maxHp != null && (!Number.isInteger(maxHp) || maxHp <= 0)) {
        return res.status(400).json({ error: 'Maksymalne HP musi być dodatnią liczbą całkowitą.' });
      }
      if (damage != null && (!Number.isInteger(damage) || damage === 0)) {
        return res.status(400).json({ error: 'Obrażenia muszą być niezerową liczbą całkowitą (ujemne leczą).' });
      }
      if (name != null && (!name || name.length > 60)) {
        return res.status(400).json({ error: 'Nazwa bossa musi mieć od 1 do 60 znaków.' });
      }
      if (playerId != null && !Number.isInteger(playerId)) {
        return res.status(400).json({ error: 'Nieprawidłowy gracz.' });
      }
      if (hp == null && maxHp == null && damage == null && name == null) {
        return res.status(400).json({ error: 'Nie podano żadnej zmiany.' });
      }

      const out = transaction(() => {
        if (!slBossEnabled()) return { notActive: true, status: 'wyłączony' };
        const coop = slCurrentCoop();
        if (coop.status !== 'event_active') return { notActive: true, status: coop.status };

        let player = null;
        if (playerId != null) {
          player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
          if (!player) return { noPlayer: true };
        }

        const nextMaxHp = maxHp != null ? maxHp : Number(coop.boss_max_hp);
        const nextName = name != null ? name : coop.boss_name;
        // Kolejność ma znaczenie: najpierw ewentualne ustawienie HP wprost, dopiero na tym
        // delta obrażeń — dzięki temu „ustaw 500 HP i od razu zbij o 100" działa w jednym strzale.
        let nextHp = hp != null ? hp : Number(coop.boss_hp);
        if (damage != null) nextHp -= damage;
        nextHp = Math.max(0, Math.min(nextMaxHp, nextHp));

        db.prepare('UPDATE sl_coop SET boss_hp = ?, boss_max_hp = ?, boss_name = ? WHERE cycle = ?')
          .run(nextHp, nextMaxHp, nextName, coop.cycle);

        // Wkład gracza dopisujemy tylko przy realnej delcie obrażeń — samo ustawienie HP
        // to korekta stanu bossa, nie czyjeś trafienie, więc nie ma komu jej przypisać.
        if (damage != null && player) {
          db.prepare(`
            INSERT INTO sl_coop_contributions (cycle, player_id, amount, source, day)
            VALUES (?, ?, ?, 'dice', ?)
          `).run(coop.cycle, player.id, damage, todayWaw());
          slLogActivity(player.id, 'boss_hit', damage > 0
            ? slBossHitEntry(damage, 'admin')
            : `zwrot ${-damage} ${slDamageWord(damage)} (admin)`);
        }

        const fresh = db.prepare('SELECT * FROM sl_coop WHERE cycle = ?').get(coop.cycle);
        const milestones = nextHp > 0 ? slCheckMilestones(fresh, nextHp) : [];
        let resolved = null;
        if (nextHp <= 0) resolved = slFinishBossEvent(fresh, true);

        return {
          notActive: false, cycle: Number(coop.cycle), hp: nextHp, max_hp: nextMaxHp, boss_name: nextName,
          credited_to: player ? player.nickname : null, milestones, resolved, coop: slCoopPayload(null)
        };
      });

      if (out.notActive) return res.status(400).json({ error: `Boss nie walczy teraz (status: ${out.status}).` });
      if (out.noPlayer) return res.status(404).json({ error: 'Gracz nie istnieje.' });

      if (out.milestones && out.milestones.length) {
        slEmitMilestones({ boss_name: out.boss_name, cycle: out.cycle }, out.milestones);
      }
      if (out.resolved) slEmitBossTimeout(out.resolved);
      res.json({ success: true, ...out });
    });

    // POST /api/snakes/admin/coop/toggle { password, enabled } — gasi albo zapala całą
    // walkę. Wyłączenie domyka trwającą walkę BEZ nagród i bez kar; włączenie startuje
    // świeżą edycję, więc nikt nie obrywa za termin, który minął, gdy bossa nie było.
    app.post('/api/snakes/admin/coop/toggle', (req, res) => {
      if (!checkAdmin(req, res)) return;
      if (typeof req.body.enabled !== 'boolean') {
        return res.status(400).json({ error: 'Podaj enabled: true albo false.' });
      }

      const out = slSetBossEnabled(req.body.enabled);

      if (out.enabled) {
        slEmit('coop_milestone', () => ({
          content: '👹 **Boss wraca do gry!**',
          embeds: [{
            title: `Edycja #${out.cycle} — ${out.boss_name}`,
            url: snakesUrl(),
            description: `Każdy rzut kostką rani go za darmo, a wpłacone coins ranią go 1:1. ` +
              `Nagrody idą do wpłacających: od ${SL_COOP_FIGHTER_MIN_COINS} coins łapiesz ` +
              `+${SL_COOP_FIGHTER_POINTS} pkt ryczałtu, podium wpłat bierze jeszcze więcej.`,
            color: 0xF5C842
          }]
        }));
      }

      res.json({ success: true, boss_enabled: out.enabled, ...out, coop: slCoopPayload(null) });
    });

    // POST /api/snakes/admin/coop/revert-rewards { password } — ŚCIEŻKA COFANIA #3:
    // zdejmuje z kont WSZYSTKO, co boss kiedykolwiek wypłacił i zabrał, i czyści rejestr.
    // Awaryjny hamulec na wypadek rozjechanego balansu — wcześniej dało się go pociągnąć
    // wyłącznie przez jednorazową migrację przy starcie serwera, czyli w praktyce raz
    // w życiu. Wpłacone coins NIE wracają: to był koszt walki, a nie nagroda.
    app.post('/api/snakes/admin/coop/revert-rewards', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const out = transaction(() => slRevertBossRewards());
      res.json({ success: true, ...out, coop: slCoopPayload(null) });
    });
  }

  return {
    // schemat + cykl życia
    initSchema, runStartupMigrations, startDeadlineScheduler, registerRoutes,
    // stan i payload
    slBossEnabled, slSetBossEnabled, slCurrentCoop, slCoopPayload, slCoopAttackers,
    // walka
    slApplyDiceDamage, slFinishBossEvent, resolveCoopBossEvent, slResolveBossTimeout,
    // cofanie (pięć ścieżek z CLAUDE.md)
    slRevertBossRewards, slRevertBossDay, slRevertBossDamageForRef,
    slClearPlayerBossData, slResetBossData,
    // Discord + drobiazgi używane przez server.js
    slBossPayoutLines, slEmitBossTimeout, slEmitMilestones, slBossHitEntry,
    // stałe potrzebne na zewnątrz
    constants: {
      SL_COOP_THRESHOLD, SL_COOP_POINTS_PER_COIN, SL_COOP_REFUND_RATE,
      SL_COOP_FIGHTER_MIN_COINS, SL_COOP_FIGHTER_POINTS, SL_COOP_PODIUM_POINTS,
      SL_COOP_MILESTONES, SL_COOP_MILESTONE_POINTS,
      SL_BOSS_DICE_DAMAGE_MULT, SL_BOSS_TIMEOUT_PENALTY
    }
  };
};
