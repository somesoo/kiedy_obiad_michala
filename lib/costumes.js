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
// kasują kostiumy — patrz slResetCostumes / slClearPlayerCostumes.

module.exports = function createCostumesModule(deps) {
  const { db, transaction, slLogActivity, slEnsureState } = deps;

  const SLOTS = {
    hat:     'Czapka',
    wings:   'Skrzydła',
    gadget:  'Gadżet',
    overlay: 'Nakładka',
  };

  // Ceny w coins. Punkt odniesienia: power-upy kosztują 15–70, a rzut daje średnio
  // kilkanaście coins — kostium ma być „na coś odkładam", nie „kupuję przy okazji".
  const CATALOG = [
    { id: 'witch_hat',     slot: 'hat',     icon: '🧙', name: 'Kapelusz wiedźmy',     price: 45 },
    { id: 'pumpkin_hat',   slot: 'hat',     icon: '🎃', name: 'Dyniowa czapka',       price: 35 },
    { id: 'horns',         slot: 'hat',     icon: '😈', name: 'Diabelskie rogi',      price: 30 },
    { id: 'top_hat',       slot: 'hat',     icon: '🎩', name: 'Cylinder hrabiego',    price: 40 },
    { id: 'bat_wings',     slot: 'wings',   icon: '🦇', name: 'Skrzydła nietoperza',  price: 50 },
    { id: 'demon_wings',   slot: 'wings',   icon: '🔥', name: 'Skrzydła demona',      price: 60 },
    { id: 'broom',         slot: 'gadget',  icon: '🧹', name: 'Miotła',               price: 30 },
    { id: 'candy_bucket',  slot: 'gadget',  icon: '🍬', name: 'Wiaderko na cukierki', price: 25 },
    { id: 'lantern',       slot: 'gadget',  icon: '🏮', name: 'Latarenka',            price: 30 },
    { id: 'spider',        slot: 'gadget',  icon: '🕷️', name: 'Pająk na nitce',       price: 20 },
    { id: 'zombie',        slot: 'overlay', icon: '🧟', name: 'Zombie',               price: 35 },
    { id: 'vampire',       slot: 'overlay', icon: '🧛', name: 'Wampir',               price: 40 },
    { id: 'skeleton',      slot: 'overlay', icon: '💀', name: 'Szkielet',             price: 35 },
    { id: 'pumpkin_frame', slot: 'overlay', icon: '🟠', name: 'Dyniowa ramka',        price: 25 },
  ];
  const BY_ID = new Map(CATALOG.map(c => [c.id, c]));

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
    return {
      slots: Object.entries(SLOTS).map(([id, label]) => ({ id, label })),
      items: CATALOG.map(c => ({ ...c, owned: owned.has(c.id), worn: worn[c.slot] === c.id })),
      worn
    };
  }

  function slBuyCostume(playerId, nickname, itemId) {
    const item = BY_ID.get(String(itemId || ''));
    if (!item) return { error: 'Nie ma takiego kostiumu.', status: 404 };
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
      slLogActivity(playerId, 'shop_buy', `🎭 Kupił kostium: ${item.icon} ${item.name} (-${item.price} coins)`);
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

  // ŚCIEŻKA COFANIA #4 (reset gry) i #5 (wyczyszczenie gracza).
  function slResetCostumes() {
    db.exec('DELETE FROM sl_costume_owned; DELETE FROM sl_costume_worn;');
  }
  function slClearPlayerCostumes(playerId) {
    db.prepare('DELETE FROM sl_costume_owned WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM sl_costume_worn WHERE player_id = ?').run(playerId);
  }

  function registerRoutes(app, { authPlayer, buildState }) {
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
  }

  return {
    initSchema, registerRoutes,
    slWornMap, slCostumeShop,
    slResetCostumes, slClearPlayerCostumes,
  };
};
