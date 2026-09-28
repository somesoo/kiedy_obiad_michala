// ══ DISCORD — SZYNA ZDARZEŃ SNAKES ══
// Jedno wejście dla wszystkiego, co gra ogłasza na kanale: slEmit(typ, () => treść).
// Każdy typ ma przełącznik w sl_meta ('discord_events'), więc admin włącza je i wyłącza
// z panelu bez restartu. Nowy rodzaj ogłoszenia = nowy klucz w SL_EVENT_DEFAULTS
// i SL_EVENT_LABELS (panel sam go pokaże) + slEmit w miejscu zdarzenia.
//
// Ukryta informacja obowiązuje także tutaj: atak nie nazywa celu (poza zablokowanym tarczą).
// Dzienne podsumowanie rankingu i jego scheduler zostają w server.js — potrzebują bossa,
// który powstaje później niż ta szyna.

module.exports = function createDiscordBus(deps) {
  const {
    slMetaGet, slMetaSet
  } = deps;

  // ══ DISCORD — SZYNA ZDARZEŃ ══
  // Zdarzenia gry lecą przez jedną szynę: każdy typ ma własny przełącznik, trzymany
  // w sl_meta (klucz 'discord_events'), więc da się je włączać/wyłączać z panelu admina
  // bez restartu. Webhook bierzemy z SNAKES_DISCORD_WEBHOOK_URL, a gdy go nie ma —
  // z DISCORD_WEBHOOK_URL (ten sam, co Wordle). Wysyłka jest „fire & forget":
  // błąd Discorda nigdy nie wywraca ruchu gracza.
  const SL_DISCORD_WEBHOOK_URL = process.env.SNAKES_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  const SNAKES_URL = (process.env.APP_URL || 'https://frog03-21535.wykr.es/').replace(/\/+$/, '') + '/snakes';

  // Domyślnie ON to rzeczy „warte pingu": ataki, tarcze, węże/drabiny, kamienie milowe
  // co-opu i dzienne podsumowanie. Codzienny wynik każdego rzutu i Extra Move są
  // domyślnie OFF, żeby nie zasypywać kanału.
  const SL_EVENT_DEFAULTS = {
    roll_result:        false,
    tile_landing:       true,
    powerup_freeze:     true,
    powerup_curse:      true,
    shield_block:       true,
    double_move:        false,
    knockback:          true,
    coop_milestone:     true,
    coop_completed:     true,
    leaderboard_daily:  true
  };

  const SL_EVENT_LABELS = {
    roll_result:        'Wynik dziennego rzutu',
    tile_landing:       'Wejście na węża / drabinę',
    powerup_freeze:     'Użycie Freeze (kto na kogo)',
    powerup_curse:      'Klątwy (rzucenie — bez celu i wariantu; odpalenie)',
    shield_block:       'Shield zablokował atak',
    double_move:        'Użycie Extra Move',
    knockback:          'Wypchnięcie z zajętego pola (i efekt domina)',
    coop_milestone:     'Pula co-op przekroczyła próg',
    coop_completed:     'Wydarzenie co-op ukończone (nagrody wypłacone, kolejna edycja rusza)',
    leaderboard_daily:  'Dzienne podsumowanie rankingu'
  };

  function slEventsConfig() {
    let stored = {};
    try {
      stored = JSON.parse(slMetaGet('discord_events') || '{}');
    } catch {
      stored = {};
    }
    const cfg = {};
    for (const key of Object.keys(SL_EVENT_DEFAULTS)) {
      cfg[key] = typeof stored[key] === 'boolean' ? stored[key] : SL_EVENT_DEFAULTS[key];
    }
    return cfg;
  }

  function slSetEventsConfig(patch) {
    const cfg = slEventsConfig();
    for (const [key, val] of Object.entries(patch || {})) {
      if (key in SL_EVENT_DEFAULTS) cfg[key] = !!val;
    }
    slMetaSet('discord_events', JSON.stringify(cfg));
    return cfg;
  }

  function slEventEnabled(type) {
    return slEventsConfig()[type] === true;
  }

  async function slPostDiscord(payload) {
    if (!SL_DISCORD_WEBHOOK_URL) return { skipped: 'brak webhooka' };
    const r = await fetch(SL_DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Discord ${r.status}: ${await r.text()}`);
    return { sent: true };
  }

  // Główny punkt wejścia szyny. `build` to funkcja zwracająca treść (leniwie — nie
  // budujemy wiadomości, gdy zdarzenie jest wyłączone). Nigdy nie rzuca wyjątkiem.
  function slEmit(type, build) {
    try {
      if (!SL_DISCORD_WEBHOOK_URL) return;
      if (!slEventEnabled(type)) return;
      const content = build();
      if (!content) return;
      slPostDiscord(typeof content === 'string' ? { content } : content)
        .catch(err => console.error(`Snakes/Discord [${type}]:`, err.message));
    } catch (err) {
      console.error(`Snakes/Discord [${type}] — błąd budowania wiadomości:`, err.message);
    }
  }

  return {
    SNAKES_URL,
    SL_DISCORD_WEBHOOK_URL,
    slEmit,
    slPostDiscord,
    slEventsConfig,
    SL_EVENT_LABELS,
    SL_EVENT_DEFAULTS,
    slSetEventsConfig
  };
};
