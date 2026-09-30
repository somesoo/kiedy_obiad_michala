// Snakes — DZIENNIK AKTYWNOŚCI (prawa kolumna). Wpisy jednej tury (wspólny `ref`) rysują się
// jako zwinięty blok: rzut to nagłówek, reszta rośnie chronologicznie pod nim. Predykat
// „to mój wpis" to ZAWSZE entry.player_id — nigdy dopasowanie po treści (zdradziłoby cel
// Freeze'a). Stan rozwinięcia trzyma activityOpen, bo lista przerysowuje się co 10 s.
// Kolejność skryptów i zasady ładowania: patrz nagłówek sl/art-effects.js.

// ── HISTORIA AKTYWNOŚCI (prawa kolumna) ──
const ACTIVITY_ICONS = { roll: '🎲', shop_buy: '🛒', shop_use: '⚡', curse_fired: '💀', knockback: '💥', avatar: '🖼️', boss_hit: '⚔️', bonus_grant: '🏦', boss_reward: '🏆', season_event: '🎃' };

// Które bloki dziennika są rozwinięte — po `ref`, który jest stały między odświeżeniami.
const activityOpen = new Set();

async function loadActivity(date) {
  try {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    const data = await api('GET', `/api/snakes/activity${q}`);
    renderActivity(data);
  } catch (e) {
    console.error('Błąd ładowania historii:', e);
  }
}

function renderActivity(data) {
  // Lista dni przebudowuje się, gdy ZESTAW dni się zmienił — nie tylko raz na życie
  // strony. Admin może ukryć cały dzień (patrz moderacja widoku na serwerze) i wtedy
  // stara lista trzymałaby datę, po wybraniu której nie ma już czego pokazać.
  const sel = document.getElementById('activity-date');
  if (sel) {
    const signature = data.dates.join(',');
    if (sel.dataset.days !== signature) {
      const keep = sel.value;
      sel.innerHTML = ['<option value="">Ostatnie</option>']
        .concat(data.dates.map(d => `<option value="${d}">${d}</option>`))
        .join('');
      sel.dataset.days = signature;
      if (keep && data.dates.includes(keep)) sel.value = keep;
    }
  }

  const list = document.getElementById('activity-list');
  if (!list) return;
  if (!data.entries.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:8px 4px">Brak aktywności.</div>';
    return;
  }

  // ── GRUPOWANIE PO TURZE ──
  // Wszystkie wpisy z jednego rzutu mają wspólny `ref` (patrz slNewTurnRef na serwerze)
  // i przychodzą obok siebie, bo lista jest sortowana po id. Zbijamy je w jeden blok:
  // rzut robi za nagłówek, reszta (klątwa, zbicia, kaskada, trafienie bossa) wcina się
  // pod nim. Wcześniej to była ściana jednakowych wierszy z tą samą godziną i różnymi
  // nickami — nie dało się zobaczyć, gdzie kończy się jedna tura.
  //
  // Kolejność PODLINIJEK zostaje taka, jak przyszły z serwera (malejąco po id), bo to
  // właśnie ona czyta się chronologicznie: klątwa (zapisana po rzucie) ląduje tuż pod
  // nagłówkiem, a kaskada zbić — zapisywana odwrotnie, patrz slApplyKnockback — wraca
  // do właściwej kolejności. Nie sortuj tego rosnąco „dla porządku".
  const groups = [];
  for (const e of data.entries) {
    const prev = groups[groups.length - 1];
    if (prev && e.ref && prev.ref === e.ref) prev.entries.push(e);
    else groups.push({ ref: e.ref || null, entries: [e] });
  }

  let lastDay = null;
  let html = '';
  // `hideNick` — podlinijki należące do gracza z nagłówka nie powtarzają jego nicku
  // („kanat 6 → pole 33" / „⚔️ atak na bossa"), ale cudze ZAWSZE go mają, bo bez niego
  // nie wiadomo, kogo dotyczą (paulinka wypchnięta, witold rzucił klątwę).
  const renderRow = (e, sub, hideNick) => {
    const time = new Date(e.created_at.replace(' ', 'T') + 'Z')
      .toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
    const icon = e.icon || ACTIVITY_ICONS[e.type] || '•';
    // Treść prawie każdego wpisu zaczyna się od własnego emoji, a obok stoi jeszcze
    // kolumna z ikoną typu — wychodziło „🎲 kanat 🎲 6 → pole 40". Ucinamy ten wiodący
    // emoji, bo ikona z gutteru mówi to samo i trzyma pion. Wpisy bez emoji (np. trafienie
    // bossa) zostają nietknięte, więc ⚔️ dalej ma co pokazywać.
    // To zmiana WYŁĄCZNIE wizualna: predykat „to mój wpis" liczy się niżej z `player_id`,
    // nigdy z treści — patrz komentarz poniżej.
    const text = String(e.detail).replace(/^\p{Extended_Pictographic}️?\s*/u, '');
    // Wyróżniamy wpisy DOTYCZĄCE MOJEGO PIONKA — po player_id wpisu, nigdy po treści.
    // To nie jest wybór estetyczny, tylko warunek bezpieczeństwa: serwer celowo zapisuje
    // wpis obu stronom wszędzie tam, gdzie obie strony mają wiedzieć (klątwa rzucona na
    // mnie, tarcza, Freeze W MOMENCIE ODPALENIA), a Freeze przy rzucaniu NIE dostaje wpisu
    // dla ofiary — bo cel ma się nie dowiedzieć, że jest zamrożony, dopóki nie kliknie
    // „Rzuć". Dopasowywanie po nicku w tekście podświetliłoby „ktoś użył Freeze" u ofiary
    // i rozwaliło całą mechanikę ukrycia. Po player_id nie wycieka nic.
    //
    // Number() po OBU stronach jest konieczne: state.playerId bywa stringiem z localStorage
    // (patrz loadAuth), a liczbą dopiero po loginSuccess — gołe === dałoby false przy
    // pierwszym renderze po odświeżeniu strony.
    const mine = Number(e.player_id) === Number(state.playerId);
    // Odpalona klątwa świeci na zielono OBU stronom: serwer zapisuje osobny wpis ofierze
    // i rzucającemu, więc każdy z nich ma „swój" (po player_id). Typ wpisu, nie jego
    // treść — z tego samego powodu co wyżej.
    const curseFired = mine && e.type === 'curse_fired';
    return `
      <div class="activity-entry${sub ? ' is-sub' : ''}${mine ? ' is-me' : ''}${curseFired ? ' is-curse-fired' : ''}"${curseFired ? ' title="Klątwa odpaliła"' : mine ? ' title="Twoja akcja"' : ''}>
        <span class="activity-time mono">${sub ? '' : time}</span>
        <span class="activity-icon">${icon}</span>
        <span class="activity-body">${hideNick ? '' : `<strong>${esc(e.nickname)}</strong> `}${esc(text)}</span>
      </div>`;
  };

  // Rząd malutkich awatarów w zwiniętym nagłówku bloku — „kogo to dotyczy" bez czytania.
  // Lista graczy pochodzi WYŁĄCZNIE z `player_id` wpisów w bloku, nigdy z treści: pasek
  // nie może pokazać nikogo, kogo nie widać już jako nicku po rozwinięciu (Freeze, klątwy).
  const isMe = id => Number(id) === Number(state.playerId);
  const renderFaces = entries => {
    const seen = new Set();
    const people = [];
    for (const e of entries) {
      if (seen.has(Number(e.player_id))) continue;
      seen.add(Number(e.player_id));
      people.push(e);
    }
    if (!people.length) return '';
    // Przy karze bossa to cała ekipa — kilkanaście kółek nie mieści się w wąskiej kolumnie.
    const MAX = 6;
    const faces = people.slice(0, MAX).map(p => {
      const cls = `activity-face${isMe(p.player_id) ? ' is-me' : ''}`;
      return p.avatar_url
        ? `<img class="${cls}" src="${esc(p.avatar_url)}" alt="${esc(p.nickname)}" title="${esc(p.nickname)}" data-player-id="${Number(p.player_id)}" loading="lazy" />`
        : `<span class="${cls} is-initial" title="${esc(p.nickname)}">${esc(String(p.nickname || '?').charAt(0).toUpperCase())}</span>`;
    }).join('');
    const more = people.length > MAX ? `<span class="activity-face is-more">+${people.length - MAX}</span>` : '';
    return `<span class="activity-faces">${faces}${more}</span>`;
  };

  // Zwijany blok: nagłówek + awatary widać zawsze, szczegóły dopiero po kliknięciu.
  // Awatary idą osobnym rzędem POD tekstem nagłówka, a nie obok niego — w wąskiej
  // kolumnie obok tekstu zjadały mu miejsce i nagłówek łamał się na cztery linie.
  // Stan „rozwinięty" żyje w activityOpen (po `ref`), bo lista przerysowuje się co 10 s
  // przez innerHTML — bez tego rozwinięty blok zwijałby się sam pod palcem.
  const renderBlock = (ref, headHtml, facesHtml, bodyHtml, classes) => {
    const open = activityOpen.has(ref);
    return `
      <div class="activity-turn is-collapsible${open ? ' is-open' : ''}${classes}" data-ref="${esc(ref)}">
        <div class="activity-turn-head" role="button" tabindex="0" aria-expanded="${open}" title="${open ? 'Zwiń' : 'Pokaż szczegóły'}">
          ${headHtml}<span class="activity-chevron" aria-hidden="true">▸</span>
          ${facesHtml ? `<div class="activity-faces-row">${facesHtml}</div>` : ''}
        </div>
        <div class="activity-turn-body">${bodyHtml}</div>
      </div>`;
  };

  for (const g of groups) {
    const first = g.entries[0];
    if (first.date !== lastDay) {
      html += `<div class="activity-day">${esc(first.date)}</div>`;
      lastDay = first.date;
    }

    // Pojedynczy wpis (zakup, awatar) — bez ramki, jak dotąd.
    if (g.entries.length === 1) {
      html += renderRow(first, false, false);
      continue;
    }

    const hasMe = g.entries.some(e => isMe(e.player_id));

    // ── ROZLICZENIE BOSSA ── (kamień milowy, wygrana, kara) — wpis na gracza, wszystkie
    // o tym samym. Nagłówek to podsumowanie; po rozwinięciu każdy widzi swoją kwotę.
    if (String(g.ref).startsWith('boss:')) {
      const sorted = g.entries.slice().sort((a, b) => a.id - b.id);
      const texts = sorted.map(e => String(e.detail));
      // Kara i kamień milowy mają identyczną treść u wszystkich — pokazujemy ją raz.
      // Przy wygranej kwoty są różne, więc zostaje wspólny początek („Boss pokonany").
      const summary = texts.every(t => t === texts[0]) ? texts[0] : texts[0].split(' — ')[0];
      const headHtml = renderRow({
        ...sorted[0],
        detail: `${summary} · ${sorted.length} os.`,
        // Ikona z treści (🎯 próg / 🏆 wygrana / 💥 kara), a nie ogólne 🏆 typu — w zwiniętym
        // bloku to jedyna wskazówka, czy boss dał, czy zabrał.
        icon: (summary.match(/^\p{Extended_Pictographic}\uFE0F?/u) || [])[0],
        // Nagłówek nie jest niczyim wpisem — „to ja" świeci na awatarze i w szczegółach.
        player_id: null
      }, false, true);
      const body = sorted.map(e => renderRow(e, true, false)).join('');
      html += renderBlock(g.ref, headHtml, renderFaces(sorted), body,
        `${hasMe ? ' has-me' : ''} is-boss-block`);
      continue;
    }

    // ── TURA ── Nagłówkiem jest wpis o rzucie; gdy moderacja go ukryła, jego miejsce
    // zajmuje pierwszy skutek, żeby blok dalej miał co pokazać po zwinięciu.
    const headIdx = g.entries.findIndex(e => e.type === 'roll');
    // Skutki układamy narracyjnie: najpierw co odmieniło ten rzut (klątwa), potem kogo
    // zbił, na końcu ile oberwał boss. WEWNĄTRZ każdego rodzaju sortujemy ROSNĄCO po `id`,
    // czyli chronologicznie — blok ma się czytać z góry na dół, odwrotnie niż sama lista
    // dni (ta zostaje od najnowszych). Dlatego serwer zapisuje kaskadę zbić po kolei,
    // a nie od końca (patrz slApplyKnockback).
    const order = { curse_fired: 1, knockback: 2, boss_hit: 3 };
    const subs = g.entries
      .filter((_, i) => i !== headIdx)
      .sort((a, b) => ((order[a.type] || 9) - (order[b.type] || 9)) || (a.id - b.id));
    const head = headIdx >= 0 ? g.entries[headIdx] : subs.shift();
    const mineTurn = isMe(head.player_id);
    // Awatary pokazują INNYCH graczy, których tura dotknęła (zbici, rzucający klątwę) —
    // autor rzutu i tak stoi z nickiem w nagłówku. Trafienie bossa to tylko ⚔️ na końcu.
    const others = subs.filter(e => Number(e.player_id) !== Number(head.player_id));
    const bossMark = subs.some(e => e.type === 'boss_hit')
      ? '<span class="activity-mark" title="Atak na bossa">⚔️</span>' : '';
    const body = subs.map(e => renderRow(e, true,
      Number(e.player_id) === Number(head.player_id))).join('');
    html += renderBlock(g.ref, renderRow(head, false, false), renderFaces(others) + bossMark, body,
      `${mineTurn ? ' is-my-turn' : ''}${hasMe && !mineTurn ? ' has-me' : ''}`);
  }
  list.innerHTML = html;
}

function toggleActivityBlock(headEl) {
  const block = headEl.closest('.activity-turn.is-collapsible');
  if (!block) return;
  const ref = block.dataset.ref;
  const open = !block.classList.contains('is-open');
  if (open) activityOpen.add(ref); else activityOpen.delete(ref);
  block.classList.toggle('is-open', open);
  headEl.setAttribute('aria-expanded', String(open));
  headEl.title = open ? 'Zwiń' : 'Pokaż szczegóły';
}

// Delegacja na liście, a nie listener na każdym bloku — lista przerysowuje się co 10 s.
document.getElementById('activity-list').addEventListener('click', e => {
  const head = e.target.closest('.activity-turn-head');
  if (head) toggleActivityBlock(head);
});
document.getElementById('activity-list').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const head = e.target.closest('.activity-turn-head');
  if (!head) return;
  e.preventDefault();
  toggleActivityBlock(head);
});


document.getElementById('activity-date').addEventListener('change', e => loadActivity(e.target.value || null));
