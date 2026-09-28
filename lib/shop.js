// ══ SKLEP I POWER-UPY — cennik, klątwy, tarcza, trasy /shop/buy i /shop/use ══
// Fabryka jak lib/boss.js: dostaje bazę i helpery z server.js. Ekwipunek (slInventory,
// slAddPowerup) zostaje w server.js — to stan gracza, a woła go też migracja przy starcie.
//
// Rzeczy, które łatwo tu zepsuć (szczegóły w CLAUDE.md):
//  • ukryta informacja — wariantu klątwy nie zna nikt, także rzucający, a cel ataku nie
//    pada nigdzie (dziennik, Discord, payload); wyjątek to atak zablokowany tarczą,
//  • Drożyzna ma TRZY stany (ukryta → odsłonięta → zużyta), a pierwsza próba zakupu jest
//    wstrzymywana bez pobrania czegokolwiek,
//  • cena Extra Move zależy od BIEŻĄCEGO miejsca w rankingu — front odsyła cenę, którą
//    pokazał (expected_cost), a rozjazd kończy się 409 bez pobrania,
//  • cennik jest wpisany na sztywno w regulaminie snakes.html — zmieniając stałe, popraw tekst.

module.exports = function createShopModule(deps) {
  const {
    db, app, authPlayer, transaction, slEnsureState, slInventory, slAddPowerup,
    slLogActivity, slBuildState, slEmit, todayWaw, isWeekendStr, slPlayHours,
    slOfficeOpenAt, SL_MAX_EXTRA_ROLLS, SL_DAILY_ROLLS
  } = deps;

  // Koszty power-upów (w coins). Shield jest najdroższy, bo to kontra na cudzy atak —
  // ma kosztować więcej niż sam atak, ale zostaje w zasięgu kilku dni zbierania (dzienny
  // ruch to ~10–30 coins). Curse jest najtańszy mimo ośmiu wariantów: pojedynczy wariant
  // trafia się losowo, więc rzucający nie kupuje konkretnego efektu, tylko loterię.
  const SL_POWERUP_COSTS = { freeze: 30, curse: 15, double_move: 40, shield: 70 };
  const SL_POWERUP_TYPES = Object.keys(SL_POWERUP_COSTS);
  // Etykiety power-upów do czytelnych wpisów w dzienniku i na Discordzie.
  const SL_POWERUP_LABELS = { freeze: 'Freeze', curse: 'Curse', double_move: 'Extra Move', shield: 'Shield' };
  // Typy ataków, które Shield potrafi zablokować (zużywa się przy pierwszym z nich).
  const SL_SHIELD_BLOCKS = ['freeze', 'curse'];

  // ── KLĄTWA — 7 losowych wariantów ──
  // Wariant losujemy w momencie RZUCENIA klątwy (sl_effects.variant) i odpalamy go na
  // NASTĘPNYM ruchu ofiary. Warianty 1/2/5 zmieniają SPOSÓB poruszania się, więc muszą
  // zadziałać PRZED odpaleniem węży/drabin/bonusów (patrz slCurseAdjustRoll + invertBoard
  // w slResolveTileEffect) — inaczej gracz lądowałby na złym polu. Warianty 3/4/6/7
  // działają PO wyliczeniu ruchu (patrz obsługa w POST /api/snakes/roll).
  const SL_CURSE_VARIANTS = 8;
  const SL_CURSE_COIN_STEAL = 50; // ile coins zabiera Kieszonkowiec (wariant 3)
  // Drożyzna (wariant 8) jako JEDYNA klątwa nie odpala się na ruchu, tylko w sklepie.
  // Ma trzy stany — ukryta, odsłonięta, zużyta (patrz kolumna "revealed_at" niżej): pierwsza
  // próba zakupu jest WSTRZYMYWANA i tylko odsłania klątwę, podbijając ceny o ten mnożnik;
  // zużywa się dopiero przy następnym, świadomym zakupie.
  const SL_CURSE_PRICE_VARIANT = 8;
  const SL_CURSE_PRICE_MARKUP = 1.5;
  // KOLEJKA KLĄTW. Klątwy na jednym graczu NIE odpalają naraz — każdy ruch zdejmuje
  // najstarszą (FIFO), a Drożyzna czeka na zakup. Naraz się nie da: warianty się ze sobą
  // gryzą (Odwrotny Ruch + Rozdwojona Kostka, podwójna Chciwość = ćwierć zdobyczy), a jeden
  // ruch zamieniałby się w nokaut. Za to kolejka ma sufit, bo przy cenie 15 coins dwie
  // osoby mogłyby zakopać kogoś na kilka dni. Dwa limity, oba liczą wszystkie oczekujące
  // klątwy (także Drożyznę):
  //  • na cel — tyle może na nim wisieć naraz, od wszystkich rzucających razem,
  //  • od jednego rzucającego na ten sam cel — żeby jeden bogacz nie zajął całej kolejki.
  // Odmowa przy limicie celu mówi rzucającemu, że ktoś już tego gracza przeklął. To świadomy
  // koszt: wie o tym tylko rzucający, nie ofiara, i nie wie, jaka to klątwa ani od kogo.
  const SL_CURSE_MAX_PENDING_PER_TARGET = 2;
  const SL_CURSE_MAX_PENDING_PER_CASTER = 1;

  // Oczekująca Drożyzna na tym graczu (albo null). JEDNO miejsce, z którego korzysta
  // i cennik w sklepie, i sam zakup — inaczej sklep pokazywałby jedną cenę, a kasa brała
  // inną. Dokładnie tak było: witryna rysowała cenę bazową, serwer ściągał 1,5×, a przycisk
  // „Kup" odblokowywał się przy cenie bazowej, więc gracz z 80 coins klikał Shielda „za 70"
  // i dostawał „za mało — koszt 105".
  function slPendingPriceCurse(playerId) {
    return db.prepare(`
      SELECT id, source_player_id, revealed_at FROM sl_effects
      WHERE target_player_id = ? AND type = 'curse' AND status = 'pending' AND variant = ?
      ORDER BY id LIMIT 1
    `).get(playerId, SL_CURSE_PRICE_VARIANT) || null;
  }

  // ── EXTRA MOVE: CENA Z MIEJSCA W RANKINGU ──
  // Dwa Extra Move'y dziennie zostają, bo to mechanizm, który ludzie lubią i kupują zawsze.
  // Symulacja (wrzesień 2026, 12 graczy, ~2 mln ruchów) pokazała, że przy równej cenie lider
  // ma nad drugim średnio 4,7% przewagi, a >10% w co ósmym sezonie. Kto odjechał, kupuje
  // tyle samo ruchów co goniący, więc nie da się go dogonić. Cena rośnie z miejscem: czołówka
  // płaci więcej, dół mniej. Przewaga lidera spada wtedy do ~2,3% (>10% w 1% sezonów),
  // a opuszczający dni wygrywają częściej — przy tej samej liczbie kupowanych ruchów.
  const SL_EXTRA_MOVE_TOP_PRICES = [60, 55, 50]; // 1., 2., 3. miejsce
  const SL_EXTRA_MOVE_MID_UNTIL = 7;             // miejsca 4.–7. płacą cenę bazową (SL_POWERUP_COSTS)
  const SL_EXTRA_MOVE_LOW_PRICE = 30;            // miejsca 8. i dalej
  // Ile Extra Move'ów można trzymać w ekwipunku: tyle, ile da się zużyć jednego dnia.
  // Bez sufitu gracz z dołu tabeli nakupiłby tanich sztuk na zapas i zużył je jako lider.
  const SL_EXTRA_MOVE_MAX_OWNED = 2;

  // Miejsce liczymy NA ŻYWO, przy każdym zakupie — kto awansuje, od razu płaci więcej.
  // Kolejność jak w slLeaderboard. Żeby kasa nie pobrała innej kwoty, niż pokazał sklep
  // (ranking potrafi się zmienić między odświeżeniem a kliknięciem), front odsyła cenę,
  // którą widział, a /shop/buy przy rozjeździe wstrzymuje zakup — patrz `expected_cost`.
  function slCurrentRank(playerId) {
    const rows = db.prepare('SELECT player_id FROM sl_state ORDER BY total_points DESC, laps DESC, abs_pos DESC').all();
    const i = rows.findIndex(r => r.player_id === playerId);
    return i < 0 ? null : i + 1;
  }

  // Cena bazowa (bez Drożyzny) dla konkretnego gracza.
  function slPowerupBaseCost(type, playerId) {
    if (type !== 'double_move' || playerId == null) return SL_POWERUP_COSTS[type];
    const rank = slCurrentRank(playerId) || Infinity;
    if (rank <= SL_EXTRA_MOVE_TOP_PRICES.length) return SL_EXTRA_MOVE_TOP_PRICES[rank - 1];
    if (rank <= SL_EXTRA_MOVE_MID_UNTIL) return SL_POWERUP_COSTS.double_move;
    return SL_EXTRA_MOVE_LOW_PRICE;
  }

  function slShopPriceOf(type, cursed, playerId) {
    const base = slPowerupBaseCost(type, playerId);
    return cursed ? Math.ceil(base * SL_CURSE_PRICE_MARKUP) : base;
  }

  // Cennik DLA KONKRETNEGO GRACZA — z doliczoną Drożyzną, ale WYŁĄCZNIE gdy jest już
  // ujawniona (patrz kolumna revealed_at). Dopóki klątwa siedzi ukryta, cennik pokazuje
  // ceny bazowe i nie zdradza jej ani słowem — a i tak nikt nie przepłaci, bo pierwsza
  // próba zakupu zostaje wstrzymana zamiast obciążyć konto.
  // Zasada ukrytej informacji jest tym nietknięta: ofiara dowiaduje się dopiero w chwili
  // odpalenia klątwy, a kto ją rzucił, nie wychodzi z tego payloadu w ogóle.
  function slShopPayload(playerId) {
    const curse = slPendingPriceCurse(playerId);
    const cursed = !!(curse && curse.revealed_at);
    return {
      items: SL_POWERUP_TYPES.map(type => ({
        type,
        cost: slShopPriceOf(type, cursed, playerId), // cena, którą gracz REALNIE zapłaci
        base_cost: slPowerupBaseCost(type, playerId),
        // Extra Move: skąd ta cena — miejsce z rana i cały cennik, żeby sklep umiał to wyjaśnić.
        ...(type === 'double_move' ? {
          rank: slCurrentRank(playerId),
          rank_prices: { top: SL_EXTRA_MOVE_TOP_PRICES, mid: SL_POWERUP_COSTS.double_move, mid_until: SL_EXTRA_MOVE_MID_UNTIL, low: SL_EXTRA_MOVE_LOW_PRICE },
          max_owned: SL_EXTRA_MOVE_MAX_OWNED
        } : {})
      })),
      price_curse: cursed ? {
        label: SL_CURSE_LABELS[SL_CURSE_PRICE_VARIANT],
        markup_percent: Math.round((SL_CURSE_PRICE_MARKUP - 1) * 100)
      } : null
    };
  }
  const SL_CURSE_LABELS = {
    1: '↩️ Odwrotny Ruch',
    2: '➗ Rozdwojona Kostka',
    3: '💰 Kieszonkowiec',
    4: '📉 Chciwość',
    5: '🔀 Odwrócone Zasady',
    6: '🌀 Chaos',
    7: '🚫 Bez Bonusu',
    8: '🧾 Drożyzna'
  };
  const SL_CURSE_DESCRIPTIONS = {
    1: 'kość cofa zamiast pchać do przodu (np. rzut 4 = 4 pola W TYŁ)',
    2: 'rzut liczy się w połowie, w dół (rzut 5 = ruch o 2 pola)',
    3: `traci ${SL_CURSE_COIN_STEAL} coins na rzecz tego, kto rzucił klątwę`,
    4: 'połowa punktów zdobytych tym ruchem przepada',
    5: 'na ten ruch drabiny i węże działa się od drugiego końca — ze szczytu drabiny zjeżdżasz na dół, z ogona węża wjeżdżasz do góry',
    6: 'po wylądowaniu losowy doskok o 1–3 pola w dowolną stronę',
    7: 'pole bonusowe na ten ruch nie działa',
    8: `pierwsza próba zakupu zostaje wstrzymana, a ceny w sklepie rosną o ${Math.round((SL_CURSE_PRICE_MARKUP - 1) * 100)}% do najbliższego zakupu`
  };

  // Warianty 1/2 zmieniają wartość kości PRZED ruchem — reszta rzutów nie rusza.
  function slCurseAdjustRoll(variant, roll) {
    if (variant === 1) return -roll;               // Odwrotny Ruch
    if (variant === 2) return Math.floor(roll / 2); // Rozdwojona Kostka (w dół)
    return roll;
  }

  // ── SHIELD ──
  // Aktywna tarcza = wpis 'shield' w sl_effects ze statusem 'pending'. Zużywa się
  // w momencie, w którym ktoś rzuca na gracza Freeze albo Curse: atak nie dochodzi
  // do skutku (zapisujemy go jako 'blocked'), a tarcza znika.
  function slActiveShield(playerId) {
    return db.prepare(
      `SELECT * FROM sl_effects WHERE target_player_id = ? AND type = 'shield' AND status = 'pending' ORDER BY id LIMIT 1`
    ).get(playerId) || null;
  }

  function slHasShield(playerId) {
    return !!slActiveShield(playerId);
  }

  // POST /api/snakes/shop/buy { type } — kup power-up za punkty.
  app.post('/api/snakes/shop/buy', authPlayer, (req, res) => {
    const playerId = req.player.id;
    const nickname = req.player.nickname;
    const type = String(req.body.type || '');
    if (!SL_POWERUP_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Nieznany power-up' });
    }
    const baseCost = slPowerupBaseCost(type, playerId);
    const priceCurseLabel = SL_CURSE_LABELS[SL_CURSE_PRICE_VARIANT];

    const out = transaction(() => {
      const st = slEnsureState(playerId);

      // KLĄTWA DROŻYZNA: czeka w kolejce jak każda inna, ale odpala się dopiero TUTAJ —
      // przy pierwszym zakupie po jej rzuceniu. Zużywa się WYŁĄCZNIE przy udanym zakupie:
      // gdy graczowi zabraknie coins, klątwa zostaje na kolejną próbę (inaczej dałoby się
      // ją zdjąć klikaniem „Kup" bez grosza przy duszy).
      const priceCurse = slPendingPriceCurse(playerId);

      // ── ODSŁONIĘCIE ──
      // Pierwsza próba zakupu pod ukrytą Drożyzną NIE kupuje niczego i NIE rusza salda:
      // wstrzymujemy ją, zapalamy klątwę i oddajemy świeży cennik z podwyżką. Dopiero
      // kolejne kliknięcie kupuje — po cenie, którą gracz ma już przed oczami.
      // Dzięki temu nie trzeba wybierać między „witryna kłamie" a „klątwa zdradza się przed
      // czasem": do tej chwili nic nie było widać, a mimo to nikt nie zapłacił więcej,
      // niż zobaczył. Zakup jest wstrzymany, a nie anulowany — to celowo ma być moment,
      // w którym gracz decyduje jeszcze raz, już znając cenę.
      if (priceCurse && !priceCurse.revealed_at) {
        db.prepare(`UPDATE sl_effects SET revealed_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(priceCurse.id);
        // ŚWIADOMIE BEZ WPISU W DZIENNIKU. Dziennik jest publiczny, a wpis „zakup
        // wstrzymany" zdradziłby tarczę okrężną drogą: wszyscy zobaczyliby, że gracz
        // właśnie coś kupował, a gdyby kupił Shield — po którym wpisu nie ma (patrz niżej)
        // — zostałby ślad „próbował" bez „kupił", czyli jednoznaczna informacja, co kupił.
        // Ofiara i tak wie swoje: dostaje toast od ręki, a w sklepie wisi ostrzeżenie aż
        // do zakupu. W dzienniku ląduje dopiero sam zakup, czyli moment, w którym klątwa
        // realnie zabolała.
        return { revealed: true, base_cost: baseCost, cost: slShopPriceOf(type, true, playerId) };
      }

      // Sufit ekwipunku Extra Move — sprawdzany PO odsłonięciu Drożyzny (ta niczego nie
      // pobiera), a PRZED pobraniem coins.
      if (type === 'double_move' && (slInventory(playerId).double_move || 0) >= SL_EXTRA_MOVE_MAX_OWNED) {
        return { full: true };
      }

      const cost = slShopPriceOf(type, !!priceCurse, playerId);
      // Cena Extra Move zmienia się razem z rankingiem. Jeśli od odświeżenia sklepu gracz
      // zmienił miejsce, NIE pobieramy innej kwoty, niż widział — wstrzymujemy zakup (nic nie
      // znika z konta) i odsyłamy świeży cennik. Stary front bez `expected_cost` kupuje jak dawniej.
      const expected = req.body.expected_cost != null ? Number(req.body.expected_cost) : null;
      if (type === 'double_move' && expected != null && expected !== cost) {
        return { price_changed: true, cost, expected };
      }
      if (st.balance < cost) return { poor: true, balance: st.balance, cost, cursed: !!priceCurse };

      db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?').run(cost, playerId);
      slAddPowerup(playerId, type, 1);
      if (priceCurse) {
        db.prepare(`UPDATE sl_effects SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(priceCurse.id);
      }
      // TARCZA NIE ZOSTAWIA ŚLADU W DZIENNIKU — ani przy zakupie, ani przy użyciu (patrz
      // /shop/use). Cała jej wartość polega na tym, że atakujący nie wie, czy trafi w mur:
      // gdyby feed pokazywał „kupił Shield", wszyscy po prostu omijaliby tego gracza.
      // Saldo innych graczy nie jest publiczne (patrz slLeaderboard), więc brak wpisu
      // naprawdę niczego nie zdradza.
      if (type !== 'shield') {
        // Zakup, na którym odpaliła Drożyzna, jest zarazem odpaleniem klątwy — dostaje typ
        // 'curse_fired', żeby kupujący widział go podświetlonego jak każdą inną klątwę.
        slLogActivity(playerId, priceCurse ? 'curse_fired' : 'shop_buy',
          `🛒 Kupił ${SL_POWERUP_LABELS[type]} (-${cost} coins)${priceCurse ? ` — klątwa ${priceCurseLabel} podbiła cenę o ${cost - baseCost}` : ''}`);
      }
      // Ten wpis jest publiczny, a przy zakupie tarczy zdradziłby ją okrężną drogą: „ktoś
      // przepłacił", a w feedzie ani śladu zakupu — czyli kupił Shield. Świadomy koszt:
      // rzucający klątwę traci powiadomienie w tym jednym przypadku, ale tarcza zostaje
      // szczelna. Kupujący i tak widzi klątwę u siebie w toaście.
      if (priceCurse && priceCurse.source_player_id && type !== 'shield') {
        slLogActivity(priceCurse.source_player_id, 'curse_fired',
          `🧾 Twoja klątwa ${priceCurseLabel} odpaliła — ${nickname} przepłacił o ${cost - baseCost} coins!`);
      }
      return { poor: false, cost, cursed: !!priceCurse, extra: cost - baseCost };
    });

    // Zakup wstrzymany przez świeżo odsłoniętą Drożyznę. 409, a nie 400: to nie jest błąd
    // gracza, tylko stan, który się właśnie zmienił — front ma przerysować sklep (nowe ceny
    // przychodzą w `state`) i pokazać powiadomienie, a nie zwykły komunikat o błędzie.
    if (out.revealed) {
      return res.status(409).json({
        error: `${priceCurseLabel}! Twój zakup został wstrzymany — ceny w sklepie idą w górę o ${Math.round((SL_CURSE_PRICE_MARKUP - 1) * 100)}% do najbliższego zakupu. ${SL_POWERUP_LABELS[type]} kosztuje teraz ${out.cost} zamiast ${out.base_cost}.`,
        price_curse_revealed: true,
        curse: { label: priceCurseLabel, markup_percent: Math.round((SL_CURSE_PRICE_MARKUP - 1) * 100) },
        type,
        cost: out.cost,
        base_cost: out.base_cost,
        state: slBuildState(playerId)
      });
    }

    if (out.price_changed) {
      return res.status(409).json({
        error: `Cena Extra Move zmieniła się, bo zmieniło się Twoje miejsce w rankingu — teraz ${out.cost} coins zamiast ${out.expected}. Nic nie zostało pobrane, kliknij „Kup" jeszcze raz.`,
        price_changed: true,
        cost: out.cost,
        state: slBuildState(playerId)
      });
    }

    if (out.full) {
      return res.status(400).json({
        error: `Masz już ${SL_EXTRA_MOVE_MAX_OWNED} Extra Move — więcej nie da się trzymać (tyle można użyć jednego dnia). Najpierw któregoś użyj.`
      });
    }

    if (out.poor) {
      // Cena z klątwy nie jest zagadką w momencie, w którym zaczyna boleć — mówimy wprost,
      // czemu w sklepie widniało mniej.
      return res.status(400).json({
        error: `Za mało coins — koszt ${out.cost}${out.cursed ? ` (klątwa ${priceCurseLabel}: +${Math.round((SL_CURSE_PRICE_MARKUP - 1) * 100)}%)` : ''}, masz ${out.balance}.`,
        price_curse: out.cursed ? { label: priceCurseLabel, cost: out.cost, base_cost: baseCost } : null
      });
    }

    // Klątwa ujawnia się dokładnie w chwili, w której zadziałała — tak jak każda inna.
    // Wyjątek: zakup tarczy zostaje niewidoczny nawet wtedy, bo komunikat nazwałby power-up
    // (a sama kwota i tak by go zdradziła). Kupujący widzi klątwę u siebie w toaście.
    if (out.cursed && type !== 'shield') {
      slEmit('powerup_curse', () =>
        `🧾 **${nickname}** wpadł na klątwę **${priceCurseLabel}** — za ${SL_POWERUP_LABELS[type]} zapłacił ${out.cost} zamiast ${baseCost} coins.`);
    }

    res.json({
      success: true,
      cost: out.cost,
      base_cost: baseCost,
      price_curse: out.cursed ? { label: priceCurseLabel, extra: out.extra } : null,
      state: slBuildState(playerId)
    });
  });

  // POST /api/snakes/shop/use { type, target_player_id? } — użyj power-up z ekwipunku.
  // Freeze/Curse wymagają celu (innego gracza). Extra Move i Shield działają na siebie.
  // Jeśli cel ma aktywny Shield, atak zostaje ZABLOKOWANY: tarcza znika, atak nie działa
  // (power-up atakującego i tak się zużywa — ryzyko wpisane w atak).
  // Freeze, Curse i Shield lądują w sl_effects i czekają na swój moment; Extra Move jako
  // jedyny działa NATYCHMIAST — dokłada ruch do dzisiejszej puli, do wykonania od razu.
  app.post('/api/snakes/shop/use', authPlayer, (req, res) => {
    const playerId = req.player.id;
    const nickname = req.player.nickname;
    const today = todayWaw();
    const type = String(req.body.type || '');
    if (!SL_POWERUP_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Nieznany power-up' });
    }

    // Extra Move daje ruch OD RAZU, więc poza oknem gry nie ma czego dać — zamiast
    // spalić power-up na ruch, którego i tak nie da się wykonać, odmawiamy użycia.
    // (Freeze/Curse/Shield celowo bez tej bramki: one czekają na swój moment.)
    if (type === 'double_move') {
      if (isWeekendStr(today) && !slPlayHours().weekends) {
        return res.status(400).json({ error: 'W weekend nie gramy — zostaw Extra Move na poniedziałek.', is_weekend: true });
      }
      if (!slOfficeOpenAt()) {
        return res.status(400).json({
          error: `Extra Move daje ruch od ręki, a biuro jest zamknięte — użyj go między ${slPlayHours().start}:00 a ${slPlayHours().end}:00.`,
          office_closed: true
        });
      }
    }
    const needsTarget = SL_SHIELD_BLOCKS.includes(type); // freeze / curse
    let targetId = playerId;
    let targetNick = nickname;

    if (needsTarget) {
      targetId = parseInt(req.body.target_player_id, 10);
      if (!Number.isInteger(targetId)) {
        return res.status(400).json({ error: 'Wskaż gracza, na którego użyjesz power-upa.' });
      }
      if (targetId === playerId) {
        return res.status(400).json({ error: 'Freeze i Curse rzucasz na INNEGO gracza.' });
      }
      const target = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(targetId);
      if (!target) return res.status(404).json({ error: 'Nie ma takiego gracza.' });
      targetNick = target.nickname;
      slEnsureState(targetId); // upewnij się, że cel ma stan gry
    }

    const out = transaction(() => {
      const inv = slInventory(playerId);
      if (inv[type] <= 0) return { none: true };

      // Shield można trzymać tylko jeden naraz — drugi byłby wyrzuceniem punktów.
      if (type === 'shield' && slHasShield(playerId)) return { already: true };

      // Extra Move ma dzienny sufit (SL_MAX_EXTRA_ROLLS) — sprawdzamy go PRZED zużyciem
      // sztuki, żeby odbity użytkownik nie stracił przedmiotu za nic.
      const stBefore = type === 'double_move' ? slEnsureState(playerId) : null;
      const extraToday = stBefore && stBefore.extra_rolls_date === today ? Number(stBefore.extra_rolls || 0) : 0;
      if (type === 'double_move' && extraToday >= SL_MAX_EXTRA_ROLLS) {
        return { capped: true, max_extra: SL_MAX_EXTRA_ROLLS, daily_max: SL_DAILY_ROLLS + SL_MAX_EXTRA_ROLLS };
      }

      // LIMIT KOLEJKI KLĄTW (patrz SL_CURSE_MAX_PENDING_*) — sprawdzany PRZED zużyciem
      // sztuki, tak jak sufit Extra Move. Najpierw limit własny, bo jego odmowa nie zdradza
      // niczego, czego rzucający sam nie wie; limit celu dopiero, gdy własny przeszedł.
      // Tarcza celu ma tu pierwszeństwo: z tarczą klątwa i tak by się nie zakolejkowała,
      // więc nie odmawiamy, tylko pozwalamy jej się odbić (gałąź TARCZA CELU niżej).
      if (type === 'curse' && !slActiveShield(targetId)) {
        const q = db.prepare(`
          SELECT COUNT(*) AS total, COALESCE(SUM(source_player_id = ?), 0) AS mine
          FROM sl_effects WHERE target_player_id = ? AND type = 'curse' AND status = 'pending'
        `).get(playerId, targetId);
        if (Number(q.mine) >= SL_CURSE_MAX_PENDING_PER_CASTER) return { curse_cap: 'mine' };
        if (Number(q.total) >= SL_CURSE_MAX_PENDING_PER_TARGET) return { curse_cap: 'target' };
      }

      slAddPowerup(playerId, type, -1);

      // EXTRA MOVE: nie czeka na następną turę — od razu dokłada JEDEN ruch ponad
      // dzienny limit, do wykonania natychmiast (przycisk „Rzuć" odblokowuje się w tej
      // samej odpowiedzi). Dodatkowe sloty żyją tylko dziś: extra_rolls_date pilnuje, żeby
      // niewykorzystane przepadły o północy razem z resztą limitu.
      if (type === 'double_move') {
        db.prepare('UPDATE sl_state SET extra_rolls = ?, extra_rolls_date = ? WHERE player_id = ?')
          .run(extraToday + 1, today, playerId);
        return { none: false, blocked: false, variant: null, extra_roll: true };
      }

      // TARCZA CELU: przechwytuje Freeze/Curse zanim staną się efektem na turę.
      if (needsTarget) {
        const shield = slActiveShield(targetId);
        if (shield) {
          db.prepare(`UPDATE sl_effects SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(shield.id);
          db.prepare(`
            INSERT INTO sl_effects (target_player_id, source_player_id, type, variant, status, consumed_at)
            VALUES (?, ?, ?, ?, 'blocked', CURRENT_TIMESTAMP)
          `).run(targetId, playerId, type, null);
          return { none: false, blocked: true };
        }
      }

      // Curse: losujemy wariant (patrz SL_CURSE_LABELS) już TERAZ, w momencie rzucenia —
      // ale NIE zdradzamy go NIKOMU, także rzucającemu (nie ma go w odpowiedzi ani w toaście).
      // Rzucający kupuje loterię, więc i on dowiaduje się, co wylosował, dopiero gdy klątwa
      // odpali (patrz POST /api/snakes/roll i /shop/buy — tam dostaje własny wpis).
      // Wariant losujemy teraz tylko dlatego, że Drożyzna czeka na zakup, a nie na ruch.
      const variant = type === 'curse' ? (1 + Math.floor(Math.random() * SL_CURSE_VARIANTS)) : null;

      db.prepare(`
        INSERT INTO sl_effects (target_player_id, source_player_id, type, variant)
        VALUES (?, ?, ?, ?)
      `).run(targetId, playerId, type, variant);

      return { none: false, blocked: false };
    });

    if (out.none) {
      return res.status(400).json({ error: 'Nie masz tego power-upa w ekwipunku.' });
    }
    if (out.curse_cap === 'mine') {
      return res.status(400).json({
        error: `Twoja klątwa na ${targetNick} jeszcze nie odpaliła — kolejną rzucisz, gdy ta zadziała. Sztuka zostaje w ekwipunku.`
      });
    }
    if (out.curse_cap === 'target') {
      return res.status(400).json({
        error: `Nad ${targetNick} wisi już komplet klątw (${SL_CURSE_MAX_PENDING_PER_TARGET}) — poczekaj, aż któraś odpali. Sztuka zostaje w ekwipunku.`
      });
    }
    if (out.already) {
      return res.status(400).json({ error: 'Masz już aktywną tarczę — poczekaj, aż coś zablokuje.' });
    }
    if (out.capped) {
      return res.status(400).json({
        error: `Dziś wykorzystałeś już ${out.max_extra} dodatkowe ruchy z Extra Move — dzienny limit to ${out.daily_max} rzutów. Sztuka została w ekwipunku, użyjesz jej jutro.`
      });
    }

    // ── DZIENNIK AKTYWNOŚCI ──
    // ATAKI NIE NAZYWAJĄ CELU. Freeze i Curse dostają wpis mówiący tylko, że ktoś zaatakował
    // — biuro ma wiedzieć, że coś się dzieje (to zmienia rachuby), ale kto oberwał, wie
    // wyłącznie rzucający. Ofiara nie dostaje własnego wpisu i nie widzi nic w swoim panelu;
    // dowie się dopiero przy odpaleniu: Freeze i większość klątw gdy kliknie „Rzuć", a
    // Drożyzna przy najbliższym zakupie. Dopiero wtedy POST /api/snakes/roll (albo /shop/buy)
    // dopisuje obu stronom pełną wersję z nazwiskiem i wariantem.
    // Wyjątek: zablokowanie tarczą (gałąź niżej) — atak przepadł, więc nie ma już czego kryć.
    const label = SL_POWERUP_LABELS[type];
    if (out.blocked) {
      slLogActivity(playerId, 'shop_use', `${label} na ${targetNick} zablokowany tarczą`);
      slLogActivity(targetId, 'shop_use', `🛡️ Zablokował ${label} od ${nickname} tarczą`);
    } else if (type === 'freeze') {
      slLogActivity(playerId, 'shop_use', `❄️ Użył Freeze — kogo zamroził, okaże się przy jego następnym ruchu`);
    } else if (out.extra_roll) {
      slLogActivity(playerId, 'shop_use', `⏩ Użył ${label} — dodatkowy ruch do wykonania od razu`);
    } else if (needsTarget) {
      // KLĄTWA ZOSTAWIA DOKŁADNIE JEDEN WPIS — rzucającego, BEZ celu i BEZ wariantu.
      // Dziennik jest publiczny, więc nazwanie celu ("Użył Curse na Bartka") mówiło ofierze
      // wprost, że coś na niej wisi — a klątwa ma się ujawniać dopiero, gdy odpali. Z tego
      // samego powodu zniknął wpis kierowany do celu. Dokładnie tak samo zachowuje się
      // Freeze (gałąź wyżej) i to jest wzorzec dla obu ataków.
      slLogActivity(playerId, 'shop_use', `💀 Rzucił klątwę — na kogo i jaka, okaże się dopiero, gdy odpali`);
    } else if (type === 'shield') {
      // Cisza — tarcza ujawnia się WYŁĄCZNIE wtedy, gdy coś zablokuje (gałąź out.blocked
      // wyżej dopisuje wpis obu stronom). Inaczej cały jej sens znika.
    } else {
      slLogActivity(playerId, 'shop_use', `Użył ${label}`);
    }

    // ── ZDARZENIA DISCORD ──
    // Freeze celowo nie ma tu emisji — dopiero gdy odpali (patrz POST /api/snakes/roll).
    if (out.blocked) {
      slEmit('shield_block', () =>
        `🛡️ **${targetNick}** zablokował tarczą ${type === 'freeze' ? 'Freeze' : 'Curse'} od **${nickname}**! Tarcza zużyta.`);
    } else if (type === 'curse') {
      // Bez nazwiska celu — Discord czyta całe biuro, więc podanie ofiary zdradzałoby ją
      // dokładnie tak samo jak wpis w dzienniku. Kto oberwał, wyjdzie przy odpaleniu.
      slEmit('powerup_curse', () => `💀 **${nickname}** rzucił klątwę — na kogo i jaką, przekonacie się, gdy odpali.`);
    } else if (out.extra_roll) {
      slEmit('double_move', () => `⏩ **${nickname}** użył Extra Move — dołożył sobie ruch ponad dzienny limit i rzuca od razu.`);
    }

    res.json({
      success: true,
      applied_to: targetId,
      blocked: !!out.blocked,
      extra_roll: !!out.extra_roll, // Extra Move: ruch dołożony do dzisiejszej puli, do wykonania od ręki
      // Celowo BEZ wariantu klątwy — nie zna go nawet rzucający, dopóki klątwa nie odpali.
      state: slBuildState(playerId)
    });
  });

  return {
    SL_POWERUP_TYPES,
    slShopPayload,
    slHasShield,
    SL_CURSE_PRICE_VARIANT,
    slCurseAdjustRoll,
    SL_CURSE_COIN_STEAL,
    SL_CURSE_LABELS,
    SL_CURSE_DESCRIPTIONS,
    SL_POWERUP_COSTS,
    SL_POWERUP_LABELS
  };
};
