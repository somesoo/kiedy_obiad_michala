'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  KOSTIUMY — kosmetyka pionka za coins
// ══════════════════════════════════════════════════════════════════════════════
// Pionek bazowo to okrągłe zdjęcie. W sklepie kostiumów można dokupić czapkę, skrzydła,
// gadżet i nakładkę na zdjęcie (overlay) — po jednym na slot. To CZYSTA kosmetyka:
// nic w grze od kostiumu nie zależy.
//
// Dlaczego to ma sens ekonomicznie: coins mogą z gry tylko wypływać (patrz CLAUDE.md,
// „Dwie waluty"), a power-upy to jedyny odpływ, który przy okazji zmienia rozgrywkę.
// Kostium to odpływ, który NIE rusza równowagi — kto ma nadwyżkę, może ją „przepalić"
// na wygląd, zamiast nią kogoś zamrażać.
//
// Fabryka jak lib/boss.js: helpery przychodzą w `deps`, żeby nie robić require w drugą
// stronę (jeden uchwyt bazy).
//
// Katalog żyje TYLKO tutaj (id, slot, nazwa, cena). Rysunki są na froncie
// (SL_COSTUME_ART w public/snakes.js) — payload niesie wyłącznie id, więc przez bazę nie
// da się wstrzyknąć niczego do strony. Nieznane id (np. po usunięciu przedmiotu) front
// po prostu pomija.
//
// ŚCIEŻKI COFANIA: zakup kostiumu nie jest ruchem, więc cofnięcie ruchu i dnia go nie
// dotyczą (tak samo jak zakupów power-upów). Reset całej gry i wyczyszczenie gracza
// kasują kostiumy — patrz slResetCostumes / slClearPlayerCostumes. WYJĄTEK: skiny
// wsparcia (niżej) zostają, bo są opłacone prawdziwymi pieniędzmi, a nie coins z gry.
//
// SKINY WSPARCIA: jeden na sezon, za 5 zł BLIK-iem na telefon twórcy. Nie ma tu żadnej
// bramki płatności — gracz wysyła BLIK-a, twórca sprawdza przelew i nadaje skin w panelu
// admina. Dlatego nie da się go kupić za coins, a sklep pokazuje tylko instrukcję.
// W sklepie wisi skin AKTYWNEGO sezonu; kto go ma, nosi go też po zmianie sezonu.
// Numer telefonu (sl_meta.supporter_blik_phone, ustawiany w panelu) NIE jedzie
// w payloadzie odświeżanym co 10 s — front dociąga go osobno, dopiero po kliknięciu.

module.exports = function createCostumesModule(deps) {
  const { db, transaction, slLogActivity, slEnsureState, slMetaGet, slMetaSet, activeSeasonId, seasonLabel } = deps;

  const SLOTS = {
    hat:     'Czapka',
    wings:   'Skrzydła',
    gadget:  'Gadżet',
    overlay: 'Nakładka',
  };

  // Ceny w coins — kostium to rzecz PREMIUM, na którą się odkłada. Punkt odniesienia
  // (symulacja z września 2026): gracz zarabia ~40 coins dziennie, ~880 przez sezon. Przy
  // dawnych cenach 20–60 kostium kosztował mniej niż dzień gry i nikt nie musiał na nic
  // zbierać. Teraz jedna rzecz to 4–11 dni odkładania, a komplet na wszystkie cztery sloty
  // (~1100) nie mieści się w jednym sezonie. Kolejność slotów rośnie z tym, jak bardzo
  // rzecz rzuca się w oczy na planszy: gadżet < czapka < nakładka < skrzydła.
  // Zmiana cennika nie rusza starych zakupów — sl_costume_owned.price trzyma, ile kto
  // faktycznie zapłacił.
  const CATALOG = [
    { id: 'witch_hat',     slot: 'hat',     icon: '🧙', name: 'Kapelusz wiedźmy',     price: 260 },
    { id: 'pumpkin_hat',   slot: 'hat',     icon: '🎃', name: 'Dyniowa czapka',       price: 210 },
    { id: 'horns',         slot: 'hat',     icon: '😈', name: 'Diabelskie rogi',      price: 200 },
    { id: 'top_hat',       slot: 'hat',     icon: '🎩', name: 'Cylinder hrabiego',    price: 240 },
    { id: 'bat_wings',     slot: 'wings',   icon: '🦇', name: 'Skrzydła nietoperza',  price: 400 },
    { id: 'demon_wings',   slot: 'wings',   icon: '🔥', name: 'Skrzydła demona',      price: 450 },
    { id: 'broom',         slot: 'gadget',  icon: '🧹', name: 'Miotła',               price: 180 },
    { id: 'candy_bucket',  slot: 'gadget',  icon: '🍬', name: 'Wiaderko na cukierki', price: 150 },
    { id: 'lantern',       slot: 'gadget',  icon: '🏮', name: 'Latarenka',            price: 170 },
    { id: 'spider',        slot: 'gadget',  icon: '🕷️', name: 'Pająk na nitce',       price: 150 },
    { id: 'zombie',        slot: 'overlay', icon: '🧟', name: 'Zombie',               price: 260 },
    { id: 'vampire',       slot: 'overlay', icon: '🧛', name: 'Wampir',               price: 300 },
    { id: 'skeleton',      slot: 'overlay', icon: '💀', name: 'Szkielet',             price: 260 },
    { id: 'pumpkin_frame', slot: 'overlay', icon: '🟠', name: 'Dyniowa ramka',        price: 230 },
    // Skiny wsparcia — `season` to id pliku planszy (boards/<id>.js), `pln` to cena BLIK-iem.
    // Nowy sezon = nowa pozycja tutaj + rysunek w SL_COSTUME_ART. Bez pozycji sezon po
    // prostu nie ma skina wsparcia (zakładka w sklepie się nie pokaże).
    { id: 'supporter_crown',    slot: 'hat', icon: '👑', name: 'Złota korona',     supporter: true, season: 'default',   pln: 5 },
    { id: 'pumpkin_king_crown', slot: 'hat', icon: '🎃', name: 'Korona Króla Dyń', supporter: true, season: 'halloween', pln: 5 },
  ];
  const BY_ID = new Map(CATALOG.map(c => [c.id, c]));
  // Lista do „NOT IN (…)" przy resecie. Id to stałe z katalogu, nie wejście od gracza.
  const SUPPORTER_SQL = CATALOG.filter(c => c.supporter).map(c => `'${c.id}'`).join(', ') || "''";

  const PHONE_KEY = 'supporter_blik_phone';
  function slSupporterPhone() { return slMetaGet(PHONE_KEY) || null; }

  function initSchema() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS snakes.sl_costume_owned (
        player_id INTEGER NOT NULL,
        item      TEXT NOT NULL,
        price     INTEGER NOT NULL,           -- ile faktycznie zapłacił (cennik może się zmienić)
        bought_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, item)
      );
      CREATE TABLE IF NOT EXISTS snakes.sl_costume_worn (
        player_id INTEGER NOT NULL,
        slot      TEXT NOT NULL,              -- "hat" | "wings" | "gadget" | "overlay"
        item      TEXT NOT NULL,
        PRIMARY KEY (player_id, slot)
      );
    `);
  }

  // Co kto ma na sobie — dla WSZYSTKICH graczy jednym zapytaniem (payload planszy buduje
  // się dla kilkunastu pionków naraz). Przedmioty spoza katalogu są pomijane.
  function slWornMap() {
    const map = new Map();
    for (const r of db.prepare('SELECT player_id, slot, item FROM sl_costume_worn').all()) {
      if (!BY_ID.has(r.item)) continue;
      if (!map.has(r.player_id)) map.set(r.player_id, {});
      map.get(r.player_id)[r.slot] = r.item;
    }
    return map;
  }

  // Katalog z perspektywy gracza: co ma, co nosi, na co go stać.
  function slCostumeShop(playerId) {
    const owned = new Set(db.prepare('SELECT item FROM sl_costume_owned WHERE player_id = ?').all(playerId).map(r => r.item));
    const worn = slWornMap().get(playerId) || {};
    const season = activeSeasonId();
    return {
      slots: Object.entries(SLOTS).map(([id, label]) => ({ id, label })),
      // Skin wsparcia z innego sezonu widzi tylko ten, kto go ma (może go dalej nosić).
      items: CATALOG
        .filter(c => !c.supporter || c.season === season || owned.has(c.id))
        .map(c => ({
          ...c, owned: owned.has(c.id), worn: worn[c.slot] === c.id,
          ...(c.supporter ? { season_name: seasonLabel(c.season), season_active: c.season === season } : {})
        })),
      worn,
      // Tylko informacja, CZY numer jest ustawiony — sam numer przez /costumes/supporter-phone.
      supporter_open: !!slSupporterPhone()
    };
  }

  function slBuyCostume(playerId, nickname, itemId) {
    const item = BY_ID.get(String(itemId || ''));
    if (!item) return { error: 'Nie ma takiego kostiumu.', status: 404 };
    if (item.supporter) return { error: `${item.name} to skin wsparcia — nie kupisz go za coins. Instrukcja jest w zakładce „Golden Carrot".`, status: 400 };
    return transaction(() => {
      const st = slEnsureState(playerId);
      if (db.prepare('SELECT 1 FROM sl_costume_owned WHERE player_id = ? AND item = ?').get(playerId, item.id)) {
        return { error: 'Ten kostium już masz — możesz go po prostu założyć.', status: 400 };
      }
      // Ten sam warunek „stać cię?" co w całym sklepie — także przy długu po bossie
      // (saldo ujemne) zakup jest zablokowany.
      if (Number(st.balance) < item.price) {
        return { error: `Za mało coins — ${item.name} kosztuje ${item.price}, masz ${st.balance}.`, status: 400 };
      }
      db.prepare('UPDATE sl_state SET balance = balance - ? WHERE player_id = ?').run(item.price, playerId);
      db.prepare('INSERT INTO sl_costume_owned (player_id, item, price) VALUES (?, ?, ?)').run(playerId, item.id, item.price);
      // Kupiony = od razu założony: po to się go kupuje. Poprzedni z tego slotu wraca do szafy.
      db.prepare(`
        INSERT INTO sl_costume_worn (player_id, slot, item) VALUES (?, ?, ?)
        ON CONFLICT(player_id, slot) DO UPDATE SET item = excluded.item
      `).run(playerId, item.slot, item.id);
      // Kostium jest publiczny (widać go na planszy), więc wpis do dziennika niczego nie zdradza.
      slLogActivity(playerId, 'shop_buy', `🪞 Kupił kostium: ${item.icon} ${item.name} (-${item.price} coins)`);
      return { success: true, item: item.id, price: item.price };
    });
  }

  // Zakłada kupiony przedmiot albo zdejmuje wszystko ze slotu (item = null).
  function slWearCostume(playerId, slot, itemId) {
    if (!SLOTS[slot]) return { error: 'Nie ma takiego miejsca na kostium.', status: 400 };
    if (itemId == null || itemId === '') {
      db.prepare('DELETE FROM sl_costume_worn WHERE player_id = ? AND slot = ?').run(playerId, slot);
      return { success: true, slot, item: null };
    }
    const item = BY_ID.get(String(itemId));
    if (!item || item.slot !== slot) return { error: 'Ten przedmiot nie pasuje do tego miejsca.', status: 400 };
    if (!db.prepare('SELECT 1 FROM sl_costume_owned WHERE player_id = ? AND item = ?').get(playerId, item.id)) {
      return { error: 'Najpierw kup ten kostium.', status: 400 };
    }
    db.prepare(`
      INSERT INTO sl_costume_worn (player_id, slot, item) VALUES (?, ?, ?)
      ON CONFLICT(player_id, slot) DO UPDATE SET item = excluded.item
    `).run(playerId, slot, item.id);
    return { success: true, slot, item: item.id };
  }

  // ŚCIEŻKA COFANIA #4 (reset gry) i #5 (wyczyszczenie gracza). Skiny wsparcia zostają
  // (razem z tym, że są założone): zapłacone złotówkami, a nie coins z gry, więc zerowanie
  // gry nie ma prawa ich zabrać. Odebrać je można tylko świadomie, z panelu.
  function slResetCostumes() {
    db.exec(`
      DELETE FROM sl_costume_owned WHERE item NOT IN (${SUPPORTER_SQL});
      DELETE FROM sl_costume_worn WHERE item NOT IN (${SUPPORTER_SQL});
    `);
  }
  function slClearPlayerCostumes(playerId) {
    db.prepare(`DELETE FROM sl_costume_owned WHERE player_id = ? AND item NOT IN (${SUPPORTER_SQL})`).run(playerId);
    db.prepare(`DELETE FROM sl_costume_worn WHERE player_id = ? AND item NOT IN (${SUPPORTER_SQL})`).run(playerId);
  }

  // ── SKINY WSPARCIA: panel admina ──
  function slSupporterAdmin() {
    const season = activeSeasonId();
    const owners = db.prepare(`
      SELECT o.player_id, p.nickname, o.item, o.bought_at
      FROM sl_costume_owned o LEFT JOIN players p ON p.id = o.player_id
      WHERE o.item IN (${SUPPORTER_SQL})
      ORDER BY o.bought_at DESC
    `).all();
    return {
      phone: slSupporterPhone(),
      items: CATALOG.filter(c => c.supporter).map(c => ({
        id: c.id, icon: c.icon, name: c.name, pln: c.pln, season: c.season,
        season_name: seasonLabel(c.season), season_active: c.season === season
      })),
      owners: owners.map(r => {
        const it = BY_ID.get(r.item);
        return {
          player_id: r.player_id, nickname: r.nickname || `#${r.player_id}`, item: r.item,
          // CURRENT_TIMESTAMP z SQLite to UTC bez strefy — dopisujemy ją, żeby przeglądarka
          // nie wzięła tego za czas lokalny.
          item_name: it ? `${it.icon} ${it.name}` : r.item,
          granted_at: r.bought_at ? `${String(r.bought_at).replace(' ', 'T')}Z` : null
        };
      })
    };
  }

  // Pusty numer = wsparcie wyłączone (sklep pokazuje „jeszcze nieuruchomione").
  function slSetSupporterPhone(raw) {
    const phone = String(raw || '').trim();
    if (!phone) {
      db.prepare('DELETE FROM sl_meta WHERE key = ?').run(PHONE_KEY);
      return { success: true };
    }
    const digits = phone.replace(/[\s-]/g, '');
    if (!/^\+?\d{9,15}$/.test(digits)) return { error: 'Numer telefonu: 9–15 cyfr, opcjonalnie z + na początku.', status: 400 };
    // Polski numer bez kierunkowego czyta się trójkami: „600 123 456".
    slMetaSet(PHONE_KEY, /^\d{9}$/.test(digits) ? digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : digits);
    return { success: true };
  }

  function slGrantSupporter(playerId, itemId) {
    const item = BY_ID.get(String(itemId || ''));
    if (!item || !item.supporter) return { error: 'To nie jest skin wsparcia.', status: 400 };
    const player = db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId);
    if (!player) return { error: 'Gracz nie istnieje.', status: 404 };
    return transaction(() => {
      if (db.prepare('SELECT 1 FROM sl_costume_owned WHERE player_id = ? AND item = ?').get(playerId, item.id)) {
        return { error: `${player.nickname} już ma ten skin (${item.icon} ${item.name}).`, status: 400 };
      }
      // price = 0: kolumna liczy coins, a za ten skin nie poszedł ani jeden.
      db.prepare('INSERT INTO sl_costume_owned (player_id, item, price) VALUES (?, ?, 0)').run(playerId, item.id);
      // Jak przy zakupie: dostajesz = masz na sobie. Poprzednia czapka wraca do szafy.
      db.prepare(`
        INSERT INTO sl_costume_worn (player_id, slot, item) VALUES (?, ?, ?)
        ON CONFLICT(player_id, slot) DO UPDATE SET item = excluded.item
      `).run(playerId, item.slot, item.id);
      return { success: true, nickname: player.nickname, item_name: `${item.icon} ${item.name}` };
    });
  }

  // Na pomyłkę (zły gracz, BLIK nie doszedł). Zdejmuje też z pionka.
  function slRevokeSupporter(playerId, itemId) {
    const item = BY_ID.get(String(itemId || ''));
    if (!item || !item.supporter) return { error: 'To nie jest skin wsparcia.', status: 400 };
    return transaction(() => {
      const gone = db.prepare('DELETE FROM sl_costume_owned WHERE player_id = ? AND item = ?').run(playerId, item.id).changes;
      if (!gone) return { error: 'Ten gracz nie ma tego skina.', status: 404 };
      db.prepare('DELETE FROM sl_costume_worn WHERE player_id = ? AND item = ?').run(playerId, item.id);
      return { success: true };
    });
  }

  function registerRoutes(app, { authPlayer, buildState, checkAdmin }) {
    // POST /api/snakes/costumes/buy { item }
    app.post('/api/snakes/costumes/buy', authPlayer, (req, res) => {
      const out = slBuyCostume(req.player.id, req.player.nickname, req.body && req.body.item);
      if (out.error) return res.status(out.status || 400).json({ error: out.error });
      res.json({ ...out, state: buildState(req.player.id) });
    });
    // POST /api/snakes/costumes/wear { slot, item | null }
    app.post('/api/snakes/costumes/wear', authPlayer, (req, res) => {
      const out = slWearCostume(req.player.id, String((req.body && req.body.slot) || ''), req.body && req.body.item);
      if (out.error) return res.status(out.status || 400).json({ error: out.error });
      res.json({ ...out, state: buildState(req.player.id) });
    });
    // GET /api/snakes/costumes/supporter-phone — numer do BLIK-a, dopiero po kliknięciu
    // „Pokaż numer" w sklepie (patrz komentarz na górze pliku).
    app.get('/api/snakes/costumes/supporter-phone', authPlayer, (req, res) => {
      const phone = slSupporterPhone();
      if (!phone) return res.status(404).json({ error: 'Wsparcie nie jest jeszcze uruchomione.' });
      res.json({ phone });
    });

    // ── panel admina ── GET bierze ?password=, POST {password} w ciele (jak reszta).
    app.get('/api/snakes/admin/supporter', (req, res) => {
      if (!checkAdmin(req, res)) return;
      res.json(slSupporterAdmin());
    });
    // POST { password, phone } — pusty numer wyłącza wsparcie.
    app.post('/api/snakes/admin/supporter/phone', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const out = slSetSupporterPhone(req.body.phone);
      if (out.error) return res.status(out.status || 400).json({ error: out.error });
      res.json({ ...out, ...slSupporterAdmin() });
    });
    // POST { password, player_id, item } — po ręcznym sprawdzeniu, że BLIK doszedł.
    app.post('/api/snakes/admin/supporter/grant', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const out = slGrantSupporter(parseInt(req.body.player_id, 10), req.body.item);
      if (out.error) return res.status(out.status || 400).json({ error: out.error });
      res.json({ ...out, ...slSupporterAdmin() });
    });
    // POST { password, player_id, item }
    app.post('/api/snakes/admin/supporter/revoke', (req, res) => {
      if (!checkAdmin(req, res)) return;
      const out = slRevokeSupporter(parseInt(req.body.player_id, 10), req.body.item);
      if (out.error) return res.status(out.status || 400).json({ error: out.error });
      res.json({ ...out, ...slSupporterAdmin() });
    });
  }

  return {
    initSchema, registerRoutes,
    slWornMap, slCostumeShop,
    slResetCostumes, slClearPlayerCostumes,
  };
};
