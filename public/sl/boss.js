// Snakes — WALKA Z BOSSEM: kafelek z HP, panel w okienku (HUD: łup, tempo, poprzedni boss),
// ogłoszenie nowej mechaniki i punkt regulaminu składany z liczb z payloadu. Wszystko, co
// obiecuje nagrodę, czyta liczby z serwera (slCoopPayoutPlan) — UI nie liczy ich samo.
// Kolejność skryptów i zasady ładowania: patrz nagłówek sl/art-effects.js.

// ── BOSS: kafelek z HP + panel w okienku ──
// Pełny panel bossa zajmował pas pod planszą; zwinięty do kafelka w pasku oddaje planszy
// tę wysokość, więc pola i pionki (z kostiumami) są większe. Stan „otwarte" żyje w DOM
// (atrybut hidden na #coop-pop), bo okienko leży poza przerysowywaną planszą.
function renderBossChip(g) {
  const chip = document.getElementById('boss-chip');
  const c = g.coop;
  renderSpecialBossTeaser(c);
  if (!c || !c.boss) { chip.hidden = true; slToggleCoopPop(false); return; }
  const b = c.boss;
  const sp = c.special_boss && c.special_boss.active ? c.special_boss : null;
  chip.hidden = false;
  chip.classList.toggle('is-low', b.percent <= 25);
  chip.classList.toggle('is-special', !!sp);
  chip.innerHTML = `
    <span class="boss-chip-name">${sp ? esc(sp.emoji) : '👹'} ${esc(b.name)}</span>
    <span class="boss-chip-bar"><span class="boss-chip-fill" style="width:${b.percent}%"></span></span>
    <span class="boss-chip-hp mono">${b.hp}/${b.max_hp}</span>
    <span class="boss-chip-arrow" aria-hidden="true">▾</span>`;
  chip.title = `${b.name}: ${b.hp}/${b.max_hp} HP — kliknij, żeby zobaczyć walkę i wpłacić coins`;
}
// Zapowiedź bossa sezonowego (np. Dynia Zagłady): pigułka obok kafelka z odliczaniem
// do ataku. Widać ją od `announce_from`, także zanim ten boss w ogóle się pojawi —
// po to jest zapowiedź.
function renderSpecialBossTeaser(c) {
  let el = document.getElementById('special-boss-teaser');
  const sp = c && c.special_boss;
  if (!sp) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('span');
    el.id = 'special-boss-teaser';
    el.className = 'special-boss-teaser';
    const chip = document.getElementById('boss-chip');
    chip.parentNode.insertBefore(el, chip);
  }
  const when = new Date(sp.attack_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'short', day: 'numeric', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  el.dataset.until = sp.attack_at;
  el.title = sp.active
    ? `${sp.name} to teraz boss. Jeśli przeżyje do ${when}, zaatakuje wszystkich.`
    : `${sp.name} nadciąga — pojawi się jako następny boss i zaatakuje ${when}.`;
  el.innerHTML = `${esc(sp.emoji)} ${sp.active ? 'atak' : `${esc(sp.name)} nadciąga · atak`} <span class="mono" id="special-boss-countdown"></span>`;
  updateSpecialBossCountdown();
}
function updateSpecialBossCountdown() {
  const el = document.getElementById('special-boss-teaser');
  const out = document.getElementById('special-boss-countdown');
  if (!el || !out) return;
  const ms = Date.parse(el.dataset.until) - Date.now();
  if (ms <= 0) { out.textContent = 'teraz!'; return; }
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  out.textContent = d > 0 ? `za ${d}d ${h}h` : `za ${h}h ${m}m`;
}
setInterval(updateSpecialBossCountdown, 30000);

function slToggleCoopPop(open) {
  const pop = document.getElementById('coop-pop');
  const chip = document.getElementById('boss-chip');
  const next = open == null ? pop.hidden : open;
  pop.hidden = !next;
  chip.setAttribute('aria-expanded', String(next));
  chip.classList.toggle('is-open', next);
}
document.getElementById('boss-chip').addEventListener('click', () => slToggleCoopPop());
document.getElementById('coop-pop-close').addEventListener('click', () => slToggleCoopPop(false));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeWardrobe();
  slToggleCoopPop(false);
  slBoardPeek(false);
});

// ── WALKA Z BOSSEM ──
// Jedna, ciągła faza — boss walczy ZAWSZE, więc panel zawsze pokazuje to samo: kto to,
// ile ma HP, ile czasu zostało na pokonanie go i kto już go trafił. Dwa paski w jednym
// rzędzie: pasek HP (zadane obrażenia) i pod nim cienki pasek czasu (narasta do terminu,
// który admin ustawia w panelu — patrz updateBossTimeBar).
function slCoopChipsHtml(c) {
  // Lista pokazuje WPŁACONE COINS, a nie sumę obrażeń — bo to od wpłaty liczy się
  // nagroda. Obrażenia z kości są darmowe, więc ktoś, kto tylko rzucał, stałby wysoko
  // w rankingu wkładu, nic nie ryzykując. Kogo nie ma na liście, ten nie wpłacił.
  // Kolejność jest tą samą, którą rozliczenie liczy podium, więc medale na chipach nie
  // mogą się rozminąć z tym, co realnie wypłaci gra (patrz payout_plan w lib/boss.js).
  const plan = c.payout_plan || [];
  if (!plan.length) {
    return `<div class="coop-chips"><span class="text-muted small">Nikt jeszcze nie wpłacił — bądź pierwszy!</span></div>`;
  }
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return `<div class="coop-chips">` + plan.map(x =>
    `<span class="coop-chip${Number(x.player_id) === Number(state.playerId) ? ' is-me' : ''}${x.podium_place ? ` is-p${x.podium_place}` : ''}" ` +
    `title="wpłacone coins → ${x.points} pkt przy zwycięstwie">` +
    `${medals[x.podium_place] || ''}${esc(x.nickname)}<span class="coop-amt mono">${x.coins}</span></span>`
  ).join('') + `</div>`;
}

// ── HUD BOSSA: LICZBY ZAMIAST ZDAŃ ──
// Panel mówił wszystko pełnymi zdaniami jedną drobną czcionką, więc liczby, które coś
// znaczą (+18 pkt, 24 coins do bonusu, 982 wobec normy 504), tonęły w tekście. Teraz
// każda z nich jest kafelkiem: etykieta nad dużą liczbą, kolor mówi „dobrze/źle".
// Kafelki mają STAŁY rozmiar (patrz .hud-tile), więc etykieta ma być pełnym, krótkim
// opisem („Zwrot coins", „Pkt za progi HP"), a nie skrótem — skróty typu „Kamienie"
// czy „Próg 50%" okazały się nieczytelne. Dłuższe wyjaśnienie siedzi w title.
// `unit` mówi, CZY liczba to punkty czy coins — te same ikony, co w statach pod zdjęciem
// (⭐ pkt / 💰 coins). Bez nich kafelek w rodzaju „2. miejsce wpłat +25" nie zdradzał,
// czy chodzi o punkty rankingowe, czy o zwrot do portfela — a to dwie zupełnie różne
// waluty. Ikona jest częścią WARTOŚCI, nie etykiety, bo to wartość ma jednostkę.
const HUD_UNITS = { pkt: '⭐', coins: '💰' };

function slHudTile(label, value, opts = {}) {
  const cls = opts.tone ? ` is-${opts.tone}` : '';
  const title = opts.title ? ` title="${esc(opts.title)}"` : '';
  const unit = HUD_UNITS[opts.unit]
    ? `<span class="hud-unit" title="${opts.unit === 'pkt' ? 'punkty rankingowe' : 'coins'}">${HUD_UNITS[opts.unit]}</span>`
    : '';
  return `<div class="hud-tile${cls}"${title}><span class="hud-label">${label}</span><span class="hud-value mono">${value}${unit}</span></div>`;
}

// Kafelek „zadania" — CO zrobić i CO za to dostaniesz („Wpłać jeszcze 24 coins → +40 pkt"),
// z mini paskiem postępu na dole. Samo „Bonus 26/50" nie mówiło, że chodzi o wpłatę.
function slHudQuest(label, value, have, need, title) {
  const pct = need > 0 ? Math.max(0, Math.min(100, (have / need) * 100)) : 0;
  return `<div class="hud-tile hud-quest" title="${esc(title)}">` +
    `<span class="hud-label">${label}</span>` +
    `<span class="hud-value mono">${value}</span>` +
    `<div class="hud-quest-bar"><div class="hud-quest-fill" style="width:${pct}%"></div></div></div>`;
}

function slHudSection(caption, tilesHtml, extraCls = '') {
  return `<div class="hud-section${extraCls ? ' ' + extraCls : ''}"><div class="hud-caption">${caption}</div><div class="hud-tiles">${tilesHtml}</div></div>`;
}

// ── CO DOSTANĘ JA ── („łup")
// Wcześniej stało tu wyłącznie „Pokonacie bossa — nagroda. Nie zdążycie — kara.", bez
// ani jednej liczby, więc największe wydarzenie w grze nie dawało się z niczym porównać.
function slCoopLootHtml(c) {
  const r = c.my_reward;
  if (!r || !c.boss) return '';
  // UWAGA na różnicę: `r.fighter_points` to ile ryczałtu MAM (czyli 0, dopóki nie przekroczę
  // progu), a `c.boss.fighter_points` to STAWKA. Zachęta musi pokazywać stawkę — inaczej
  // gracz poniżej progu czyta „dorzuć, żeby złapać +0 pkt" i zachęta działa odwrotnie.
  const rate = c.boss.fighter_points;
  const perCoin = String(c.boss.points_per_coin).replace('.', ',');
  const refundPct = Math.round(c.boss.refund_rate * 100);

  const tiles = [];
  if (c.my_coins <= 0) {
    tiles.push(slHudTile('Wpłaciłeś', '0', { unit: 'coins', title: 'Nagrody dostają wyłącznie ci, którzy wpłacą coins — rzuty kostką są darmowe.' }));
    tiles.push(slHudTile('Pkt za każdy coin', `+${perCoin}`, { unit: 'pkt', title: `Przy wygranej: ${perCoin} pkt za każdy wpłacony coin i ${refundPct}% wpłaty z powrotem.` }));
  } else {
    const parts = [`${r.contrib_points} za wpłatę`];
    if (r.fighter_points > 0) parts.push(`${r.fighter_points} za udział`);
    if (r.podium_points > 0) parts.push(`${r.podium_points} za ${r.podium_place}. miejsce`);
    tiles.push(slHudTile('Wpłaciłeś', c.my_coins, { unit: 'coins', title: 'Coins wpłacone na tego bossa' }));
    tiles.push(slHudTile('Pkt za wygraną', `+${r.points}`, { tone: 'good', unit: 'pkt', title: `Tyle punktów dostaniesz, jeśli boss padnie: ${parts.join(' + ')}` }));
    tiles.push(slHudTile('Zwrot coins', r.refund, { tone: 'good', unit: 'coins', title: `Jeśli boss padnie, wraca Ci ${refundPct}% wpłaty w coins` }));
    if (r.podium_place > 0) {
      const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[r.podium_place] || '';
      tiles.push(slHudTile(`${r.podium_place}. miejsce wpłat`, `${medal}+${r.podium_points}`, { tone: 'gold', unit: 'pkt', title: 'Premia za podium wpłat, wypłacana przy wygranej' }));
    }
  }
  if (r.milestones_earned > 0) {
    // „Kamienie" nic nie mówiło. To punkty za progi HP (75/50/25%) — już wpłynęły na konto.
    tiles.push(slHudTile('Pkt za progi HP', `+${r.milestones_earned}`, { tone: 'good', unit: 'pkt', title: 'Punkty za zbicie bossa do 75% / 50% / 25% HP — już są na Twoim koncie, niezależnie od wyniku walki' }));
  }
  if (!r.qualified) {
    const missing = r.coins_to_qualify;
    tiles.push(slHudQuest(
      c.my_coins > 0 ? `Dorzuć ${missing} coins` : `Wpłać ${r.fighter_min} coins`,
      `+${rate} pkt`,
      c.my_coins, r.fighter_min,
      `Bonus za udział: kto wpłaci co najmniej ${r.fighter_min} coins, dostaje przy wygranej +${rate} pkt. Masz ${c.my_coins}/${r.fighter_min}.`
    ));
  }
  return slHudSection('💰 Twój łup', tiles.join(''));
}

// ── JAK NAM IDZIE ──
// Czy idziecie na wygraną: ile trzeba zdejmować dziennie i ile realnie zdjęliście.
// To jedyny mechanizm koordynacji, jaki ta gra ma.
// „Ostatnio w ciągu dnia" było niezrozumiałe: pokazywało NAJŚWIEŻSZY dzień z obrażeniami,
// czyli zwykle dzisiejszy, niedokończony. Stąd dwa nazwane dni: dziś (w toku) i poprzedni
// dzień roboczy (zamknięty — tylko on jest oceniany wobec normy na czerwono/zielono).
function slCoopPaceHtml(c) {
  const p = c.pace;
  if (!p || !c.boss || !c.boss.active) return '';
  const dd = day => day ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : '';
  const how = `Obrażenia wszystkich graczy razem: rzuty kostką (oczka × ${c.boss.dice_damage_mult}) i wpłaty coins (1 coin = 1 obrażenie).`;
  const tiles = [];
  // Stary serwer nie przysyła today/prev_day — wtedy zostaje sama norma i dni.
  if (p.today) {
    // Dzisiejszy dzień trwa, więc „za mało" nie jest jeszcze porażką — zielony dopiero,
    // gdy norma już pękła, a poza tym neutralny.
    tiles.push(slHudTile('Obrażenia dziś', p.today.amount, {
      tone: p.today.amount >= p.needed_per_day ? 'good' : null,
      title: `Dzisiaj, dzień w toku. ${how}`
    }));
  }
  if (p.prev_day) {
    const ok = p.prev_day.amount >= p.needed_per_day;
    tiles.push(slHudTile(`Obrażenia ${dd(p.prev_day.day)}`, `${p.prev_day.amount}${ok ? ' ✓' : ' ⚠️'}`, {
      tone: ok ? 'good' : 'bad',
      title: `Poprzedni dzień roboczy — ${ok ? 'norma zrobiona' : 'poniżej normy'}. ${how}`
    }));
  }
  tiles.push(slHudTile('Potrzeba dziennie', `~${p.needed_per_day}`, {
    title: `Tyle obrażeń dziennie trzeba zdejmować, żeby zdążyć: zostało ${c.boss.hp} HP na ${p.days_left} ${p.days_left === 1 ? 'dzień roboczy' : 'dni robocze'}`
  }));
  // Bez kafelka „dni do końca" — to samo mówi licznik w pasku czasu, a ten kafelek był
  // tym, który spychał HUD do drugiego rzędu.
  tiles.push(slCoopNextMilestoneTile(c));
  return slHudSection('⚔️ Tempo ekipy', tiles.join(''));
}

// Kamienie milowe siedzą NA PASKU HP jako znaczniki — to te same progi, które gracz
// widzi, patrząc na HP, więc osobny wiersz tylko je powtarzał i zabierał wysokość.
// Etykieta w dymku mówi, CZEGO brakuje: „75% (za 747)" czytało się jak cena albo punkty,
// a to jest liczba OBRAŻEŃ, które dzielą ekipę od progu.
function slCoopMilestoneMarks(c) {
  if (!c.milestones || !c.boss) return '';
  const max = Math.max(1, c.boss.max_hp);
  return c.milestones.map(m => {
    const title = m.reached
      ? `${m.percent}% zaliczone — każdy, kto wtedy już wpłacił, dostał +${m.points} pkt`
      : `${m.percent}%: jeszcze ${c.boss.hp - m.hp_at} obrażeń → +${m.points} pkt od ręki dla każdego, kto już wpłacił`;
    return `<span class="boss-ms${m.reached ? ' is-done' : ''}" style="left:${(m.hp_at / max) * 100}%" title="${esc(title)}">` +
      `<span class="boss-ms-tag">${m.reached ? '✓' : `${m.percent}%`}</span></span>`;
  }).join('');
}

// Najbliższy niezaliczony próg jako kafelek — pasek pokazuje GDZIE, kafelek ILE i ZA CO.
// „Próg 50%" nie mówił, co się stanie po jego zbiciu — etykieta podaje nagrodę wprost.
function slCoopNextMilestoneTile(c) {
  if (!c.milestones || !c.boss) return '';
  const next = c.milestones.find(m => !m.reached);
  if (!next) return slHudTile('Progi HP', 'wszystkie ✓', { tone: 'good', title: 'Wszystkie kamienie milowe (75/50/25% HP) już zaliczone' });
  const left = c.boss.hp - next.hp_at;
  return slHudTile(`Do +${next.points} pkt (${next.percent}% HP)`, `${left} obr.`, {
    tone: 'gold',
    title: `Zbijcie bossowi jeszcze ${left} HP (do ${next.percent}%), a każdy, kto już wpłacił, dostanie od ręki +${next.points} pkt`
  });
}

// ── REAKCJA NA TRAFIENIE ──
// Panel przerysowuje się co 10 s. Jeśli od ostatniego razu HP spadło, pasek miga
// i wyskakuje „−N" — boss przestaje wyglądać jak statyczna tabelka. Pamiętamy HP per
// cykl: nowy boss (inny cykl) albo pierwszy render po wczytaniu strony nie migają.
let slLastBossHp = null;
function slBossHitDelta(c) {
  const key = `${c.cycle}`;
  const prev = slLastBossHp && slLastBossHp.key === key ? slLastBossHp.hp : null;
  slLastBossHp = { key, hp: c.boss.hp };
  return prev !== null && c.boss.hp < prev ? prev - c.boss.hp : 0;
}

// ── OGŁOSZENIE: NOWA MECHANIKA BOSSA, FAZA TESTÓW ──
// Ludzie wracają do gry, w której nagrody liczą się inaczej niż wczoraj, a przegrana
// potrafi zbić saldo pod kreskę — muszą się o tym dowiedzieć ZANIM wpłacą, a nie
// z dziennika po fakcie. Baner siedzi nad planszą, znika po kliknięciu ✕ i wraca, gdy
// podbijemy BOSS_NOTICE_VERSION (kolejna zmiana stawek = kolejne ogłoszenie).
//
// Stan „zamknięte" trzymamy w localStorage: to wygoda konkretnej przeglądarki, a nie
// dane gry — nie ma czego trzymać na serwerze. Dostęp opakowany w try/catch, bo
// w trybie prywatnym albo przy zablokowanych danych stron samo sięgnięcie rzuca
// wyjątkiem i wywróciłoby cały render panelu.
const BOSS_NOTICE_VERSION = 'v2-2026-09';
const BOSS_NOTICE_KEY = 'snakes-boss-notice-' + BOSS_NOTICE_VERSION;

function bossNoticeDismissed() {
  try { return localStorage.getItem(BOSS_NOTICE_KEY) === '1'; } catch { return false; }
}
function dismissBossNotice() {
  try { localStorage.setItem(BOSS_NOTICE_KEY, '1'); } catch { /* tryb prywatny — trudno */ }
  const el = document.getElementById('boss-notice');
  if (el) el.style.display = 'none';
}

function slRenderBossNotice(c) {
  const el = document.getElementById('boss-notice');
  if (!el) return;
  // Boss wyłączony albo baner zamknięty — nie ma o czym ogłaszać.
  if (!c || !c.boss || bossNoticeDismissed()) {
    el.style.display = 'none';
    return;
  }
  const b = c.boss;
  const perCoin = String(b.points_per_coin).replace('.', ',');
  el.style.display = '';
  el.innerHTML = `
    <button class="boss-notice-close" id="boss-notice-close" title="Zamknij">✕</button>
    <div class="boss-notice-title">🧪 Nowa mechanika bossa — faza testów</div>
    <div class="boss-notice-body">
      <p><strong>Nagrody dostają teraz wyłącznie ci, którzy wpłacą coins.</strong>
      Rzuty kostką nadal ranią bossa za darmo i zdejmują większość HP, ale nic za nie nie ma —
      bo nic nie ryzykują.</p>
      <p>Za wpłatę: <strong>${perCoin} pkt</strong> za każdy coin,
      <strong>${Math.round(b.refund_rate * 100)}% wpłaty z powrotem</strong>,
      <strong>+${b.fighter_points} pkt</strong> ryczałtu od <strong>${b.fighter_min_coins} coins</strong>
      i podium wpłat <strong>+${b.podium_points.join(' / +')} pkt</strong>.
      Do tego <strong>kamienie milowe</strong> przy 75%, 50% i 25% HP:
      <strong>+${b.milestone_points} pkt od ręki</strong> dla każdego, kto już wpłacił —
      im wcześniej się dorzucisz, tym więcej progów złapiesz.</p>
      <p class="boss-notice-warn">⚠️ Jak nie zdążycie na czas, boss zabiera
      <strong>${c.timeout_penalty} coins KAŻDEMU</strong> — płasko, bez zniżki za wpłatę
      i bez względu na to, ile masz coins. <strong>Coins mogą zejść pod kreskę.</strong></p>
      <p class="boss-notice-foot">To faza testów — stawki i trudność będą jeszcze krążone
      na podstawie tego, jak pójdzie. Szczegóły w regulaminie niżej; zgłaszajcie, co nie gra.</p>
    </div>`;
}

// ── REGULAMIN Z PRAWDZIWYMI LICZBAMI ──
// Punkt regulaminu o bossie składamy ze stawek przysłanych przez serwer, zamiast trzymać
// je zaszyte w HTML-u. Wcześniej były wpisane na sztywno i każda zmiana .env sprawiała,
// że zasady zaczynały kłamać — a gracz nie miał jak się zorientować, że czyta nieprawdę.
function slRenderBossRules(c) {
  const el = document.getElementById('rules-boss-text');
  if (!el || !c.boss) return;
  const b = c.boss;
  const pct = n => String(Math.round(n * 100)).replace('.', ',');
  const perCoin = String(b.points_per_coin).replace('.', ',');
  el.innerHTML =
    `Boss walczy <strong>cały czas</strong> — jedna, ciągła faza: bijecie mu HP. Widać to na ` +
    `<strong>dwóch paskach</strong> pod planszą: ile obrażeń już zadaliście i ile czasu zostało ` +
    `do terminu. Obrażenia idą z dwóch źródeł: <strong>każdy Twój rzut kostką rani go za darmo</strong> ` +
    `(oczka × ${b.dice_damage_mult}, bez dodatkowej akcji — zwykłe granie już walczy), ` +
    `a dodatkowo możesz <strong>wpłacić coins: 1 coin = 1 obrażenie</strong>, dowolną kwotę ze swoich coins. ` +
    `<strong>Nagrody dostają WYŁĄCZNIE ci, którzy wpłacili</strong> — rzuty są darmowe, więc nic nie ryzykują. ` +
    `<strong>Pokonacie go na czas</strong>, a każdy wpłacający dostaje: <strong>${perCoin} pkt</strong> za każdy ` +
    `wpłacony coin, <strong>${pct(b.refund_rate)}% wpłaty z powrotem</strong> w coins, ` +
    `<strong>+${b.fighter_points} pkt</strong> ryczałtu za udział (od <strong>${b.fighter_min_coins} coins</strong> wzwyż) ` +
    `oraz podium wpłat: <strong>+${b.podium_points.join(' / +')} pkt</strong> za trzy pierwsze miejsca. ` +
    `Do tego <strong>kamienie milowe</strong>: gdy HP bossa spada poniżej 75%, 50% i 25%, każdy, kto do tej pory ` +
    `wpłacił choć coina, dostaje <strong>+${b.milestone_points} pkt</strong> od ręki — więc im wcześniej się dorzucisz, ` +
    `tym więcej progów złapiesz. <strong>Nie zdążycie do terminu</strong> — wpłacone coins przepadają, ` +
    `a boss zabiera <strong>${c.timeout_penalty} coins</strong> KAŻDEMU graczowi, bez zniżki za wpłatę ` +
    `i bez względu na to, ile masz coins (można zejść pod kreskę; z długu wychodzisz normalną grą, ale sklep i wpłaty są wtedy zablokowane). ` +
    `Tak czy inaczej kolejny boss staje od razu — po wygranej mocniejszy, po przegranej łagodniejszy.`;
}

// ── POPRZEDNI BOSS ── trzecia sekcja HUD-u (obok łupu i tempa).
// Jedna linijka „pokonany — dostałeś +X pkt" nie odpowiadała na pytanie, które gracze
// faktycznie zadają: CO DOKŁADNIE dostałem albo ile mi zabrał. Tu jest pełna rozpiska
// z rejestru wypłat, łącznie z kamieniami milowymi, które wpadły jeszcze w trakcie walki.
// Trzy różne zakończenia, nie dwa. „Nie pokonany" nie znaczy automatycznie „zaatakował":
// walkę domkniętą administracyjnie (wyłącznik bossa, wdrożenie) nikt nie przypłacił,
// więc ogłaszanie przy niej straty 50 coins byłoby zwykłym kłamstwem.
function slCoopPrevBossHtml(pr) {
  if (!pr) return '';
  const m = pr.mine; // brak przy starym serwerze — wtedy tylko wynik i suma
  // Wynik jako odznaka, jak ekran końca rundy. „Remis" to walka domknięta bez rozliczenia.
  const badge = pr.defeated
    ? `<span class="hud-badge is-good" title="Boss pokonany przed terminem">🏆 Zwycięstwo</span>`
    : !pr.settled
      ? `<span class="hud-badge" title="Walka domknięta administracyjnie — bez nagród i bez kar, nikt nic nie stracił">⚪ Remis</span>`
      : `<span class="hud-badge is-bad" title="Nie zdążyliście — boss zabrał ${pr.timeout_penalty} coins każdemu">💀 Porażka</span>`;

  // Poprzedni boss to zamknięta historia, więc zamiast kafelków dostaje JEDNĄ linijkę liczb
  // pod odznaką — tylko dzięki temu cały HUD mieści się w jednym rzędzie obok łupu i tempa.
  const stats = [];
  const stat = (txt, tone, title) =>
    stats.push(`<span class="prev-stat${tone ? ' is-' + tone : ''}"${title ? ` title="${esc(title)}"` : ''}>${txt}</span>`);
  let note = '';
  if (m) {
    const totalPts = m.contrib_points + m.fighter_points + m.podium_points + m.milestone_points;
    const pts = [];
    if (m.contrib_points) pts.push(`${m.contrib_points} za wpłatę`);
    if (m.fighter_points) pts.push(`${m.fighter_points} za udział`);
    if (m.podium_points) pts.push(`${m.podium_points} za podium`);
    if (m.milestone_points) pts.push(`${m.milestone_points} za progi HP`);
    // Przy przegranej wpłata przepada — gracz ma to zobaczyć obok kary, bo razem to jego strata.
    const lost = pr.settled && !pr.defeated;
    if (m.paid_coins > 0) stat(lost ? `${m.paid_coins} coins przepadło` : `${m.paid_coins} wpłacone`, lost ? 'bad' : null);
    if (totalPts > 0) stat(`+${totalPts} pkt`, 'good', pts.join(' + '));
    if (m.refund > 0) stat(`+${m.refund} coins zwrotu`, 'good', 'Coins, które wróciły z wpłaty');
    if (m.penalty > 0) stat(`−${m.penalty} coins kary`, 'bad', 'Coins zabrane za przegraną');
    if (!stats.length) {
      note = m.damage > 0 ? `Tylko kostka (${m.damage} obr.) — bez wpłaty bez nagrody`
        : pr.settled ? 'Nie brałeś udziału' : 'Nie brałeś udziału · nikt nic nie stracił';
    }
  } else if (pr.defeated && (pr.my_points > 0 || pr.my_refund > 0)) {
    stat(`+${pr.my_points} pkt`, 'good');
    stat(`+${pr.my_refund} coins zwrotu`, 'good');
  } else if (pr.my_penalty > 0) {
    stat(`−${pr.my_penalty} coins kary`, 'bad');
  }

  return `<div class="hud-section hud-prev">
      <div class="hud-caption" title="Poprzedni boss · #${pr.cycle} ${esc(pr.boss_name)}">⏮ Poprzedni boss · #${pr.cycle} ${esc(pr.boss_name)}</div>
      <div class="coop-prev-head">${badge}${note ? `<span class="coop-prev-note">${note}</span>` : ''}</div>
      ${stats.length ? `<div class="prev-stats mono">${stats.join('<span class="prev-sep">·</span>')}</div>` : ''}
    </div>`;
}

// Jeden zwarty pasek pod planszą (nie karta z sekcjami) — plansza ma dostać jak
// najwięcej miejsca w pionie. Górny rząd: boss, pasek HP (z kamieniami milowymi i HP
// w środku), pasek czasu (z licznikiem w środku), odznaka kary, wpłata. Pod spodem trzy
// sekcje HUD-u (łup, tempo ekipy, poprzedni boss), a na dole wyśrodkowana lista wpłat.
function renderCoop(g) {
  const c = g.coop;
  const el = document.getElementById('coop-panel');
  if (!el) return;

  // Boss wyłączony (serwer nie przysyła wtedy coop) — chowamy i panel, i punkt regulaminu
  // o walce, żeby zasady nie opisywały czegoś, czego w grze nie ma.
  const rulesItem = document.getElementById('rules-boss');
  if (!c || !c.boss) {
    el.innerHTML = '';
    el.style.display = 'none';
    if (rulesItem) rulesItem.style.display = 'none';
    slRenderBossNotice(null); // zgaszony boss chowa też ogłoszenie o przebudowie
    return;
  }
  el.style.display = '';
  if (rulesItem) rulesItem.style.display = '';

  const b = c.boss;
  // Licznik czasu siedzi W ŚRODKU paska czasu — pasek pokazuje proporcję, liczba dokładkę.
  // Obok licznika kara: to jest dokładnie to, co się stanie, gdy ten pasek się wyczerpie,
  // więc tu jest jej miejsce (jako odznaka w górnym rzędzie ściskała pasek HP na wąskich
  // ekranach). #coop-deadline zostaje tym samym elementem, który co sekundę przepisuje
  // updateCoopDeadline — kara jest obok niego, nie w nim, żeby jej nie nadpisał.
  const penaltyTitle = `Nie zdążycie do terminu — boss zabiera ${c.my_timeout_penalty} coins KAŻDEMU graczowi, także tym, którzy wpłacili. Bez zniżki i bez względu na to, ile masz coins: można zejść pod kreskę.`;
  const penaltyHtml = `<span class="boss-bar-penalty">· potem −${c.my_timeout_penalty} coins każdemu 💀</span>`;
  const timeBarHtml = b.deadline_at
    ? `<div class="boss-time-bar" id="boss-time-bar" data-from="${esc(b.started_at || '')}" data-until="${esc(b.deadline_at)}" title="${esc(penaltyTitle)}"><div class="boss-time-fill"></div><span class="boss-bar-label"><span class="mono" id="coop-deadline" data-until="${esc(b.deadline_at)}">⏳ –</span>${penaltyHtml}</span></div>`
    : `<div class="boss-time-bar" title="${esc(penaltyTitle)}"><span class="boss-bar-label">${c.time_limit_days}d na pokonanie ${penaltyHtml}</span></div>`;
  const hit = slBossHitDelta(c);

  // Wpłata jest dowolnej wysokości (1 coin = 1 obrażenie), więc zamiast przycisku
  // z ryczałtem mamy pole kwoty. Przy przerysowaniu panelu (co 10 s) trzeba zachować to,
  // co gracz właśnie wpisuje — inaczej kwota znika mu spod palców.
  const amountEl = document.getElementById('coop-amount');
  const keepAmount = amountEl ? amountEl.value : '';
  const keepFocus = !!amountEl && document.activeElement === amountEl;
  const actionHtml =
    `<input type="number" id="coop-amount" min="1" step="1" max="${g.me.balance}" placeholder="coins" />
     <button class="btn-primary" id="btn-coop-give" ${g.me.balance > 0 ? '' : 'disabled'}>Wpłać</button>`;

  // Boss sezonu (np. Dynia Zagłady) jest JEDYNYM bossem całego sezonu — sekcja „poprzedni
  // boss" pokazywałaby walkę sprzed sezonu (albo zamkniętą przy jego włączeniu), która
  // z tym sezonem nie ma nic wspólnego. Znika, dopóki boss sezonu trwa.
  const seasonBoss = c.special_boss && c.special_boss.active ? c.special_boss : null;
  const prevHtml = seasonBoss ? '' : slCoopPrevBossHtml(c.previous_result);

  el.innerHTML = `
    <div class="coop-row-main">
      <span class="coop-emoji">${seasonBoss ? esc(seasonBoss.emoji) : '👹'}</span>
      <span class="coop-name">${esc(b.name)}</span>
      <div class="coop-bar-flex">
        <div class="boss-hp${hit ? ' is-hit' : ''}" title="HP bossa — znaczniki to kamienie milowe">
          <div class="boss-hp-fill" style="width:${b.percent}%"></div>
          ${slCoopMilestoneMarks(c)}
          <span class="boss-bar-label mono">${b.hp} / ${b.max_hp} HP</span>
          ${hit ? `<span class="boss-hit-float mono">−${hit}</span>` : ''}
        </div>
        ${timeBarHtml}
      </div>
      <div class="coop-actions">${actionHtml}</div>
    </div>
    <div class="hud-sections">
      ${slCoopLootHtml(c)}
      ${slCoopPaceHtml(c)}
      ${prevHtml}
    </div>
    <div class="hud-foot">${slCoopChipsHtml(c)}</div>`;

  if (keepAmount || keepFocus) {
    const fresh = document.getElementById('coop-amount');
    if (fresh) {
      fresh.value = keepAmount;
      if (keepFocus) fresh.focus();
    }
  }
  updateCoopDeadline();

  // Regulamin i baner lecą NA KOŃCU i w try/catch — to dodatki do panelu, a nie panel.
  // Wcześniej szły przed `el.innerHTML` i wystarczyło, że serwer przyśle payload bez
  // któregoś z nowych pól (np. gdy front pojedzie przed backendem), żeby wyjątek zabił
  // CAŁY blok bossa: gracz nie widział ani paska HP, ani pola wpłaty, i nic mu nie
  // mówiło dlaczego.
  try {
    slRenderBossRules(c);
    slRenderBossNotice(c);
  } catch (e) {
    console.error('Snakes: nie udało się złożyć opisu bossa —', e);
  }
}

// Cienki pasek pod paskiem HP w bloku bossa: ile czasu bossa jeszcze ZOSTAŁO.
// MALEJE od pełna do zera, tak samo jak HP — oba paski czyta się tak samo („ile jeszcze"),
// a wyścig widać od razu: czas nie może skończyć się przed HP. Wcześniej narastał i dwa
// paski obok siebie szły w przeciwne strony. Element powstaje na nowo przy każdym
// renderCoop, więc dane niesie w atrybutach, a nie w domknięciu.
function updateBossTimeBar() {
  const bar = document.getElementById('boss-time-bar');
  if (!bar) return; // nie ma walki — nie ma paska
  const until = Date.parse(bar.dataset.until);
  const from = Date.parse(bar.dataset.from);
  if (!Number.isFinite(until)) return;
  const now = Date.now();
  // Bez wiarygodnego początku walki nie ma z czego liczyć proporcji — zostawiamy pasek
  // pusty zamiast zgadywać skalę (sam licznik obok i tak pokazuje, ile zostało).
  const total = Number.isFinite(from) && until > from ? until - from : 0;
  const left = total > 0 ? Math.max(0, Math.min(total, until - now)) : 0;
  bar.querySelector('.boss-time-fill').style.width = (total > 0 ? (left / total) * 100 : 0) + '%';
  bar.classList.toggle('is-urgent', until - now <= 86400000); // ostatnia doba
}

// Odświeża licznik czasu do pokonania bossa (wołane co sekundę z updateCountdown) —
// no-op, gdy boss nie walczy (element #coop-deadline wtedy w ogóle nie istnieje).
function updateCoopDeadline() {
  updateBossTimeBar();
  const el = document.getElementById('coop-deadline');
  if (!el) return;
  const until = Date.parse(el.dataset.until);
  const secs = Math.max(0, Math.round((until - Date.now()) / 1000));
  const days = Math.floor(secs / 86400);
  const rest = secs % 86400;
  const daysTxt = days > 0 ? `${days}d ` : '';
  el.textContent = `⏳ ${daysTxt}${fmtHMS(rest)}`;
}

// Enter w polu kwoty = wpłata, żeby nie trzeba było sięgać po przycisk.
document.getElementById('coop-panel').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'coop-amount') contributeToBoss();
});

document.getElementById('coop-panel').addEventListener('click', e => {
  if (e.target.closest('#btn-coop-give')) contributeToBoss();
});

// Delegacja, bo baner jest przerysowywany co 10 s razem z panelem — listener wpięty
// wprost w przycisk ✕ zniknąłby przy pierwszym odświeżeniu.
// Sprawdzenie na null jest KONIECZNE: przy starym, zacache'owanym snakes.html tego
// elementu jeszcze nie ma, a `null.addEventListener` wywaliłoby cały skrypt w połowie —
// czyli zepsułoby CAŁĄ grę, a nie tylko baner.
const bossNoticeEl = document.getElementById('boss-notice');
if (bossNoticeEl) {
  bossNoticeEl.addEventListener('click', e => {
    if (e.target.closest('#boss-notice-close')) dismissBossNotice();
  });
}

async function contributeToBoss() {
  if (state.busy) return;
  const input = document.getElementById('coop-amount');
  const amount = parseInt(input && input.value, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    showToast('Podaj dodatnią liczbę coins.');
    return;
  }
  state.busy = true;
  try {
    const res = await api('POST', '/api/snakes/coop/contribute', { amount });
    state.game = res.state;
    if (input) input.value = '';
    renderAll();
    // Trasa zwraca `victory` (cały wynik rozliczenia), a nie `defeated` — wcześniej front
    // pytał o `defeated`, którego w odpowiedzi nigdy nie było, więc dobicie bossa wpłatą
    // przechodziło bez konfetti i bez słowa o nagrodzie.
    if (res.victory) {
      const mine = (res.victory.payouts || []).find(p => p.player_id === state.playerId);
      showConfetti();
      showToast(mine
        ? `🏆 Twoja wpłata dobiła bossa! Dostajesz +${mine.points} pkt i ${mine.refund} coins z powrotem.`
        : '🏆 Twoja wpłata dobiła bossa! Nagrody rozliczone.');
    } else if (res.milestones && res.milestones.length) {
      const ms = res.milestones[res.milestones.length - 1];
      showToast(`🎯 Zbiliście bossa do ${ms.percent}%! Kamień milowy: +${ms.points} pkt dla wpłacających.`);
    } else {
      showToast(`💰 Wpłacono ${amount} coins = ${amount} obrażeń (bossowi zostało ${res.hp_left}/${res.max_hp}).`);
    }
    loadActivity(document.getElementById('activity-date').value || null);
  } catch (e) {
    showToast(e.message);
  } finally {
    state.busy = false;
  }
}
