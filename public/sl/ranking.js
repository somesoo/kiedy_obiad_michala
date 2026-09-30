// Snakes — RANKING: tabela, dymek z rozbiciem punktów (ten sezon / wcześniej) i nakładka
// ukoronowania po zamknięciu sezonu. Waluta to zawsze „coins", ranking to „pkt".
// Kolejność skryptów i zasady ładowania: patrz nagłówek sl/art-effects.js.

// ── DYMEK Z ROZBICIEM PUNKTÓW ──
// Jeden komponent dla pionków na planszy i wierszy rankingu. Natywny title odpadł, bo nie
// da się w nim zrobić wielowierszowej rozpiski. Dymek jest doklejany do <body>, a nie do
// elementu, na który najeżdżamy — plansza i ranking mają własne przewijanie i overflow,
// więc pozycjonowany wewnątrz nich potrafiłby zostać przycięty.
const SL_POINT_CATEGORY_LABELS = [
  ['dice',      '🎲', 'ruchy kostką'],
  ['boss',      '👹', 'walka z bossem'],
  ['knockback', '💥', 'zbicia przeciwnika'],
  ['bonus',     '⭐', 'punkty bonusowe'],
  ['season',    '🎃', 'wydarzenia sezonu'],
  ['pre_split', '📦', 'sprzed podziału'],
];

let slTipEl = null;

function slTipFor(playerId) {
  const g = state.game;
  if (!g) return null;
  // Ranking ma WSZYSTKICH, plansza tylko tych ze zdjęciem — dlatego szukamy najpierw tam.
  const src = (g.leaderboard || []).find(p => p.player_id === playerId)
           || (g.players || []).find(p => p.player_id === playerId);
  if (!src || !src.points_breakdown) return null;

  const total = Number(src.total_points) || 0;
  const medals = (src.medals || []).length
    ? `<div class="sl-tip-medals">${src.medals.map(m => `${SL_MEDAL[m.place]} ${esc(m.season)}`).join(' · ')}</div>` : '';
  const head = `<div class="sl-tip-head">${esc(src.nickname)}<span class="sl-tip-total mono">${total} pkt</span></div>` + medals;
  const split = src.points_split;
  // Sezonu jeszcze nikt nie przełączał — cała gra to jeden kawałek, rozbicie jak dawniej.
  if (!split) return head + (slTipRows(src.points_breakdown, total) || '<div class="sl-tip-empty">Jeszcze bez punktów.</div>');

  // Najpierw bieżący sezon z rozbiciem (o to się teraz gra; procenty w obrębie sezonu),
  // pod nim poprzednie sezony jako JEDNA suma — ich kategorie nikogo już nie obchodzą.
  const board = g.board || {};
  const seasonName = board.name ? esc(board.name) : 'Ten sezon';
  return head
    + `<div class="sl-tip-sec">${seasonName}<span class="sl-tip-sec-total mono">${split.season.total} pkt</span></div>`
    + (slTipRows(split.season, split.season.total) || '<div class="sl-tip-empty">W tym sezonie jeszcze bez punktów.</div>')
    + (split.prior.total > 0
      ? `<div class="sl-tip-sec">${esc(board.season_prior_label || 'Wcześniej')}<span class="sl-tip-sec-total mono">${split.prior.total} pkt</span></div>`
      : '');
}

function slTipRows(b, total) {
  return SL_POINT_CATEGORY_LABELS
    // Pustych kategorii nie pokazujemy — dymek ma być listą tego, co gracz faktycznie
    // zdobył, a nie tabelą zer. „Sprzed podziału" znika sama, gdy wyzeruje się historia.
    .filter(([key]) => (b[key] || 0) > 0)
    .map(([key, icon, label]) => {
      const val = b[key];
      const pct = total > 0 ? Math.round(val / total * 100) : 0;
      return `<div class="sl-tip-row">
        <span class="sl-tip-ico">${icon}</span>
        <span class="sl-tip-lbl">${label}</span>
        <span class="sl-tip-val mono">${val}</span>
        <span class="sl-tip-pct mono">${pct}%</span>
      </div>`;
    }).join('');
}

function slTipShow(target, playerId) {
  slTipShowHtml(target, slTipFor(playerId));
}

function slTipShowHtml(target, html) {
  if (!html) return;
  if (!slTipEl) {
    slTipEl = document.createElement('div');
    slTipEl.className = 'sl-tip';
    document.body.appendChild(slTipEl);
  }
  slTipEl.innerHTML = html;
  slTipEl.style.display = 'block';

  // Pozycjonowanie nad elementem, a jeśli u góry brakuje miejsca — pod nim. Wyjście poza
  // prawą krawędź okna też przycinamy, żeby dymek przy skrajnym pionku nie uciekał.
  const r = target.getBoundingClientRect();
  const t = slTipEl.getBoundingClientRect();
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - t.width - 6));
  const above = r.top - t.height - 8;
  slTipEl.style.left = `${Math.round(left)}px`;
  slTipEl.style.top = `${Math.round(above >= 6 ? above : r.bottom + 8)}px`;
}

function slTipHide() {
  if (slTipEl) slTipEl.style.display = 'none';
}

// Delegacja na document: plansza i ranking przerysowują się co 10 s, więc listenery
// wpięte w konkretne elementy ginęłyby przy każdym odświeżeniu.
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-tip-player]');
  if (el) slTipShow(el, Number(el.dataset.tipPlayer));
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest && e.target.closest('[data-tip-player]');
  if (el && !el.contains(e.relatedTarget)) slTipHide();
});
// Dymek przy cenie Extra Move: najechanie myszą albo fokus (tapnięcie na telefonie).
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-price-tip]');
  if (el) slTipShowHtml(el, slExtraMovePriceTip());
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest && e.target.closest('[data-price-tip]');
  if (el && !el.contains(e.relatedTarget)) slTipHide();
});
document.addEventListener('focusin', e => {
  const el = e.target.closest && e.target.closest('[data-price-tip]');
  if (el) slTipShowHtml(el, slExtraMovePriceTip());
});
document.addEventListener('focusout', e => {
  if (e.target.closest && e.target.closest('[data-price-tip]')) slTipHide();
});
// Przewinięcie odkleiłoby dymek od pionka — prościej go schować niż przeliczać pozycję.
window.addEventListener('scroll', slTipHide, true);

// ── LEADERBOARD ──
// Ranking ma zakładki sezonów: bieżący (na żywo, z payloadu) i zamknięte (zdjęcie z chwili
// zamknięcia, dociągane raz z /api/snakes/seasons/:id — po zamknięciu już się nie zmienia,
// więc trzymamy je w pamięci). Wybrana zakładka musi przeżyć odświeżanie co 10 s.
let slLbSeason = null;          // null = bieżący sezon, inaczej id zamknięcia
const slLbArchive = new Map();  // id zamknięcia → { season, leaderboard }
const slLbLoading = new Set();

const SL_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Medale przy nicku. Do trzech — każdy osobno, od najstarszego sezonu. Więcej — zliczone,
// żeby weteran z pięcioma podiami nie wypychał nicku z wąskiego panelu. Pełna lista w title.
function slMedalsHtml(medals) {
  if (!medals || !medals.length) return '';
  const title = medals.map(m => `${SL_MEDAL[m.place]} ${m.season}`).join(' · ');
  let icons;
  if (medals.length <= 3) {
    icons = medals.map(m => SL_MEDAL[m.place]).join('');
  } else {
    icons = [1, 2, 3].map(pl => {
      const n = medals.filter(m => m.place === pl).length;
      return n ? `${SL_MEDAL[pl]}<span class="lb-medal-n">${n}</span>` : '';
    }).join('');
  }
  return `<span class="lb-medals" title="${esc(title)}">${icons}</span>`;
}

function slLbRowHtml(p, { hunt, topCandy, archived }) {
  const rank = SL_MEDAL[p.rank] || p.rank;
  const meClass = p.is_me ? ' is-me' : '';
  const isTop = hunt && topCandy > 0 && p.candies === topCandy;
  const candyTitle = archived
    ? (isTop ? 'Najwięcej cukierków w tym sezonie' : 'Zebrane cukierki')
    : (isTop ? 'Prowadzi w polowaniu na cukierki — kto będzie miał najwięcej na koniec sezonu, dostaje kostium-nagrodę' : 'Zebrane cukierki');
  const candy = hunt && p.candies != null
    ? `<span class="lb-candy mono${isTop ? ' is-top' : ''}" title="${candyTitle}">${isTop ? '👑' : ''}🍬 ${p.candies}</span>` : '';
  // Dymek z rozbiciem punktów jest tylko dla sezonu na żywo — archiwum rozbicia nie ma,
  // a dymek pokazałby punkty z BIEŻĄCEGO sezonu pod wierszem starego.
  const tip = archived ? '' : ` data-tip-player="${p.player_id}"`;
  return `
      <div class="lb-row${meClass}"${tip}>
        <span class="lb-rank">${rank}</span>
        <div class="lb-main">
          <div class="lb-top">
            <span class="lb-nick">${esc(p.nickname)}</span>${slMedalsHtml(p.medals)}
            <span class="lb-right">${candy}<span class="lb-points mono">${p.total_points} <span class="lb-unit">pkt</span></span></span>
          </div>
          <div class="lb-stats">
            <span title="Ukończone okrążenia">🔁 ${p.laps}</span>
            <span title="${archived ? 'Pole na koniec sezonu' : 'Aktualne pole'}">📍 ${p.tile}</span>
          </div>
        </div>
      </div>`;
}

function renderLbSeasonTabs(g) {
  const box = document.getElementById('lb-seasons');
  const archive = g.seasons_archive || [];
  if (!archive.length) { box.hidden = true; box.innerHTML = ''; slLbSeason = null; return; }
  // Zakładka sezonu, którego już nie ma (np. wyczyszczone archiwum), wraca do bieżącego.
  if (slLbSeason != null && !archive.some(c => c.id === slLbSeason)) slLbSeason = null;
  box.hidden = false;
  const liveName = (g.board && g.board.name) || 'Ten sezon';
  box.innerHTML = `<button class="lb-season-tab${slLbSeason == null ? ' is-active' : ''}" data-lb-season="">${esc(liveName)} <span class="lb-season-live">teraz</span></button>`
    + archive.map(c => `<button class="lb-season-tab${slLbSeason === c.id ? ' is-active' : ''}" data-lb-season="${c.id}">${esc(c.name)}</button>`).join('');
}

document.addEventListener('click', e => {
  const tab = e.target.closest && e.target.closest('[data-lb-season]');
  if (!tab) return;
  slLbSeason = tab.dataset.lbSeason ? Number(tab.dataset.lbSeason) : null;
  if (state.game) renderLeaderboard(state.game);
});

async function slLoadArchivedSeason(id) {
  if (slLbLoading.has(id)) return;
  slLbLoading.add(id);
  try {
    slLbArchive.set(id, await api('GET', `/api/snakes/seasons/${id}`));
  } catch (e) {
    showToast(e.message);
    slLbSeason = null;
  } finally {
    slLbLoading.delete(id);
    if (state.game) renderLeaderboard(state.game);
  }
}

function renderLeaderboard(g) {
  renderLbSeasonTabs(g);
  const list = document.getElementById('leaderboard-list');
  const count = document.getElementById('players-count');

  if (slLbSeason != null) {
    const data = slLbArchive.get(slLbSeason);
    if (!data) {
      count.textContent = '';
      list.innerHTML = '<div class="text-muted small" style="padding:12px 4px">Wczytuję ranking sezonu…</div>';
      slLoadArchivedSeason(slLbSeason);
      return;
    }
    const rows = data.leaderboard;
    const hunt = rows.some(p => p.candies != null);
    const topCandy = hunt ? Math.max(0, ...rows.map(p => p.candies || 0)) : 0;
    count.textContent = `zakończony · ${rows.length} graczy`;
    list.innerHTML = rows.length
      ? rows.map(p => slLbRowHtml(p, { hunt, topCandy, archived: true })).join('')
      : '<div class="text-muted small" style="padding:12px 4px">W tym sezonie nikt nie zagrał.</div>';
    return;
  }

  if (!g.leaderboard.length) {
    count.textContent = '0 graczy';
    list.innerHTML = '<div class="text-muted small" style="padding:12px 4px">Nikt jeszcze nie zagrał — bądź pierwszy!</div>';
    return;
  }
  // Polowanie na cukierki: 🍬 obok punktów, a lider polowania ma koronę. `candies` jest
  // null w sezonie bez cukierków — wtedy kolumny w ogóle nie ma.
  const hunt = g.leaderboard.some(p => p.candies != null);
  const topCandy = hunt ? Math.max(0, ...g.leaderboard.map(p => p.candies || 0)) : 0;
  const onBoard = g.season_events && g.season_events.candy ? g.season_events.candy.tiles.length : 0;
  count.textContent = hunt
    ? `${g.leaderboard.length} graczy · 🍬 ${onBoard} na planszy` : `${g.leaderboard.length} graczy`;
  list.innerHTML = g.leaderboard.map(p => slLbRowHtml(p, { hunt, topCandy, archived: false })).join('');
}

// ── UKORONOWANIE ──
// Po zamknięciu sezonu każdy, kto w nim grał, raz zobaczy podium: stopnie wyrastają od
// trzeciego do pierwszego, gracze wskakują na nie, a na zwycięzcę spada korona. Serwer
// pamięta, kto już widział (sl_state.crowned_seen), więc animacja nie wraca na innym
// urządzeniu. Nowy gracz spoza wyników nie dostaje jej wcale — to nie jego sezon.
//
// Nakładka żyje w <body>, a nie w #board-area, bo renderBoard podmienia tam innerHTML
// co 10 s. `slCrownShown` pilnuje, żeby odświeżenie nie odpaliło jej drugi raz, zanim
// serwer zapisze „widziane".
let slCrownShown = null;

function slCrownAvatar(p) {
  const initial = esc((p.nickname || '?').trim().charAt(0).toUpperCase() || '?');
  return p.avatar_url
    ? `<img class="crown-avatar" src="${esc(p.avatar_url)}" alt="">`
    : `<span class="crown-avatar crown-avatar-empty">${initial}</span>`;
}

function slCrownHtml(c, g) {
  const byPlace = {};
  c.podium.forEach(p => { byPlace[p.place] = p; });
  // Kolejność na scenie: 2 · 1 · 3 — klasyczne podium, zwycięzca w środku i najwyżej.
  const spot = place => {
    const p = byPlace[place];
    if (!p) return `<div class="crown-spot is-empty" data-place="${place}"><div class="crown-step"><span>${place}</span></div></div>`;
    return `
      <div class="crown-spot${p.is_me ? ' is-me' : ''}" data-place="${place}">
        <div class="crown-person">
          ${place === 1 ? '<span class="crown-crown" aria-hidden="true">👑</span>' : ''}
          ${slCrownAvatar(p)}
          <span class="crown-medal" aria-hidden="true">${SL_MEDAL[place]}</span>
          <span class="crown-name">${esc(p.nickname)}</span>
          <span class="crown-pts mono">${p.total_points} pkt</span>
        </div>
        <div class="crown-step"><span>${place}</span></div>
      </div>`;
  };
  const me = c.me;
  const mine = me.place <= 3
    ? `Stoisz na podium! ${SL_MEDAL[me.place]} zostaje przy Twoim nicku na zawsze.`
    : `Twoje miejsce: <strong>${me.place}.</strong> z ${c.players} · ${me.total_points} pkt`;
  const next = (g.board && g.board.name) || 'nowy sezon';
  return `
    <div class="crown-stage">
      <button class="crown-close" id="crown-close" title="Zamknij">✕</button>
      <div class="crown-kicker">Koniec sezonu</div>
      <h2 class="crown-title" id="crown-title">${esc(c.season_name)}</h2>
      <div class="crown-podium">
        <div class="crown-rays" aria-hidden="true"></div>
        ${spot(2)}${spot(1)}${spot(3)}
      </div>
      <div class="crown-me">${mine}</div>
      <div class="crown-next">Startuje <strong>${esc(next)}</strong>. Wszyscy od zera: punkty, coins, okrążenia i ekwipunek. Kostiumy zostają.</div>
      <button class="btn-primary crown-go" id="crown-go">Zaczynamy!</button>
    </div>`;
}

function slMaybeCrown(g) {
  const c = g && g.crowning;
  if (!c || slCrownShown === c.closure_id) return;
  if (document.getElementById('crown-overlay')) return;
  const avatarOverlay = document.getElementById('avatar-overlay');
  if (avatarOverlay && avatarOverlay.style.display !== 'none') return;
  slCrownShown = c.closure_id;

  const el = document.createElement('div');
  el.className = 'overlay crown-overlay';
  el.id = 'crown-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'crown-title');
  el.innerHTML = slCrownHtml(c, g);
  document.body.appendChild(el);
  // Konfetti w chwili, gdy korona ląduje na zwycięzcy (patrz animation-delay w CSS).
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const confetti = setTimeout(() => showConfetti(['👑', '🏆', '⭐', '🎉']), reduced ? 0 : 2300);

  const close = () => {
    clearTimeout(confetti);
    el.remove();
    document.removeEventListener('keydown', onKey);
    // Błąd zapisu nie jest końcem świata: podium pokaże się jeszcze raz przy następnym wejściu.
    api('POST', '/api/snakes/crowning/seen', { closure_id: c.closure_id }).catch(() => {});
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.querySelector('#crown-go').addEventListener('click', close);
  el.querySelector('#crown-close').addEventListener('click', close);
  el.querySelector('#crown-go').focus({ preventScroll: true });
}
