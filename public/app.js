// ── STATE ──
let state = {
  playerId: null,
  token: null,
  nickname: null,
  balance: 0,
  selectedSlot: null,
  todayBet: null,
  todayData: null,
  leaderboardInterval: null,
  mainInterval: null,
};

// ── STORAGE ──
function saveAuth(id, token, nickname) {
  localStorage.setItem('mko_player_id', id);
  localStorage.setItem('mko_token', token);
  localStorage.setItem('mko_nickname', nickname);
}

function loadAuth() {
  state.playerId = localStorage.getItem('mko_player_id');
  state.token = localStorage.getItem('mko_token');
  state.nickname = localStorage.getItem('mko_nickname');
}

function clearAuth() {
  ['mko_player_id', 'mko_token', 'mko_nickname'].forEach(k => localStorage.removeItem(k));
  state.playerId = state.token = state.nickname = null;
}

// ── API ──
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['X-Token'] = state.token;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Błąd serwera');
  return data;
}

// ── INIT ──
async function init() {
  loadAuth();
  if (state.token) {
    try {
      const me = await api('GET', '/api/me');
      loginSuccess(me.id, state.token, me.nickname, me.balance, me);
      return;
    } catch {
      clearAuth();
    }
  }
  document.getElementById('login-overlay').style.display = 'flex';
}

// ── LOGIN ──
document.getElementById('login-nick').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const nick = document.getElementById('login-nick').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!nick) { errEl.textContent = 'Wpisz nick'; return; }

  try {
    const data = await api('POST', '/api/register', { nickname: nick });
    const me = await fetchMe(data.token);
    saveAuth(data.player_id, data.token, me.nickname);
    state.token = data.token;
    loginSuccess(data.player_id, data.token, me.nickname, me.balance, me);
  } catch (e) {
    errEl.textContent = e.message;
  }
});

async function fetchMe(token) {
  const r = await fetch('/api/me', { headers: { 'X-Token': token } });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}

function loginSuccess(id, token, nickname, balance, me) {
  state.playerId = id;
  state.token = token;
  state.nickname = nickname;
  state.balance = balance;
  state.todayBet = me.today_bet;

  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('main-content').style.display = 'grid';

  document.getElementById('user-nick-display').textContent = nickname;
  updateBalanceDisplay(balance);
  document.getElementById('btn-logout').style.display = 'inline-block';

  if (me.welfare_received) showWelfareToast();
  if (me.balance === 0) showRipNotice(nickname);

  startApp();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  clearAuth();
  clearInterval(state.leaderboardInterval);
  clearInterval(state.mainInterval);
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-nick').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('user-nick-display').textContent = '';
  document.getElementById('user-balance-display').textContent = '';
});

// ── APP MAIN LOOP ──
function startApp() {
  loadTodayData();
  loadLeaderboard();
  loadHistory();
  loadBank();
  setupCountdown();

  // Odśwież dane co 30s
  state.mainInterval = setInterval(() => {
    loadTodayData();
    loadBank();
  }, 30000);

  // Leaderboard co 15s
  state.leaderboardInterval = setInterval(() => {
    loadLeaderboard();
  }, 15000);

  // Countdown co sekundę
  setInterval(updateCountdown, 1000);
}

// ── TODAY DATA ──
async function loadTodayData() {
  try {
    const data = await api('GET', '/api/today');
    state.todayData = data;
    renderSlots(data);
    updateTodayHeader(data);

    if (data.result) {
      renderDayResult(data.result);
      setSlotsCollapsed(true);
    }
  } catch (e) {
    console.error('Błąd ładowania danych dnia:', e);
  }
}

function updateTodayHeader(data) {
  const d = new Date(data.date + 'T12:00:00');
  const label = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('today-label').textContent = 'DZISIAJ · ' + label.toUpperCase();
  document.getElementById('total-pool').textContent = data.total_pool + ' monet';
}

function renderSlots(data) {
  const grid = document.getElementById('slots-grid');
  const alreadyBet = !!state.todayBet;
  const anyAvailable = data.any_slot_available && !data.result;

  // Znajdź max dla proporcji barów
  const maxTotal = Math.max(...data.slots.map(s => s.total), 1);

  // Status banner
  const banner = document.getElementById('status-banner');
  if (data.result) {
    banner.style.display = 'none';
  } else if (!data.any_slot_available) {
    banner.className = 'status-banner closed';
    banner.style.display = 'block';
    banner.textContent = '🔒 Wszystkie sloty minęły — czekamy na powrót Michała';
  } else if (alreadyBet) {
    banner.className = 'status-banner success';
    banner.style.display = 'block';
    banner.innerHTML = `✓ Twój zakład: <span class="mono accent">${state.todayBet.slot}</span> — <span class="mono">${state.todayBet.amount} monet</span>`;
  } else {
    banner.style.display = 'none';
  }

  // Jeśli mamy wynik — pokaż bet-placed jeśli gracz grał
  if (state.todayBet) {
    const bp = document.getElementById('bet-placed');
    const won = data.result && data.result.winning_slot === state.todayBet.slot;
    bp.style.display = 'flex';
    document.getElementById('bet-placed-info').textContent =
      `${state.todayBet.slot} · ${state.todayBet.amount} monet${won ? ' · 🎉 TRAFIONY!' : ''}`;
  }

  grid.innerHTML = '';
  data.slots.forEach(s => {
    const card = document.createElement('div');
    card.className = 'slot-card';

    // Slot zablokowany: już minął, gracz już obstawił, albo jest wynik
    const slotDisabled = !s.available || alreadyBet || !!data.result;
    if (slotDisabled) card.classList.add('disabled');
    if (!s.available && !data.result) card.classList.add('slot-past');
    if (state.selectedSlot === s.slot && !alreadyBet) card.classList.add('selected');
    if (data.result && data.result.winning_slot === s.slot) card.classList.add('winning');
    if (state.todayBet && state.todayBet.slot === s.slot) card.classList.add('selected');

    const barH = Math.round((s.total / maxTotal) * 32);

    card.innerHTML = `
      <div class="slot-bar-wrap">
        <div class="slot-bar" style="height:${Math.max(barH, 2)}px"></div>
      </div>
      <div class="slot-time">${s.slot.split('-')[0]}</div>
      <div class="slot-amount">${s.total > 0 ? s.total + ' monet' : '–'}</div>
    `;

    if (!slotDisabled) {
      card.addEventListener('click', () => selectSlot(s.slot));
    }

    grid.appendChild(card);
  });

  // Formularz zakładu — pokaż tylko jeśli wybrany slot jest nadal dostępny
  const betForm = document.getElementById('bet-form');
  const selectedStillAvailable = state.selectedSlot &&
    data.slots.find(s => s.slot === state.selectedSlot)?.available;

  if (anyAvailable && !alreadyBet && state.selectedSlot && selectedStillAvailable) {
    betForm.style.display = 'flex';
    updateBetForm();
  } else {
    betForm.style.display = 'none';
    // Wyczyść zaznaczenie jeśli wybrany slot minął
    if (state.selectedSlot && !selectedStillAvailable) {
      state.selectedSlot = null;
    }
  }
}

function selectSlot(slot) {
  state.selectedSlot = slot;
  document.getElementById('bet-slot-display').textContent = slot;
  document.getElementById('bet-form').style.display = 'flex';
  document.getElementById('bet-error').textContent = '';
  updateBetForm();

  // Re-render kart żeby pokazać selected
  if (state.todayData) renderSlots(state.todayData);
}

function updateBetForm() {
  const slider = document.getElementById('bet-slider');
  const numInput = document.getElementById('bet-amount');
  const max = Math.max(5, state.balance);
  slider.max = max;
  numInput.max = max;

  const val = Math.min(parseInt(slider.value) || 20, max);
  slider.value = val;
  numInput.value = val;
  document.getElementById('btn-bet-label').textContent = `${val} monet na ${state.selectedSlot || '–'}`;
}

// Synchronizacja suwaka i pola liczbowego
document.getElementById('bet-slider').addEventListener('input', () => {
  const v = document.getElementById('bet-slider').value;
  document.getElementById('bet-amount').value = v;
  document.getElementById('btn-bet-label').textContent = `${v} monet na ${state.selectedSlot || '–'}`;
});

document.getElementById('bet-amount').addEventListener('input', () => {
  const raw = parseInt(document.getElementById('bet-amount').value, 10);
  const slider = document.getElementById('bet-slider');
  const clamped = Math.max(5, Math.min(raw || 5, parseInt(slider.max)));
  slider.value = clamped;
  document.getElementById('btn-bet-label').textContent = `${clamped} monet na ${state.selectedSlot || '–'}`;
});

// ── PLACE BET ──
document.getElementById('btn-place-bet').addEventListener('click', async () => {
  const amount = parseInt(document.getElementById('bet-amount').value, 10);
  const slot = state.selectedSlot;
  const errEl = document.getElementById('bet-error');
  errEl.textContent = '';

  if (!slot) { errEl.textContent = 'Wybierz slot'; return; }
  if (!amount || amount < 5) { errEl.textContent = 'Minimum 5 monet'; return; }

  const btn = document.getElementById('btn-place-bet');
  btn.disabled = true;
  btn.textContent = 'Stawiam...';

  try {
    const res = await api('POST', '/api/bet', { slot, amount });

    state.balance = res.new_balance;
    state.todayBet = { slot, amount };

    updateBalanceDisplay(res.new_balance);
    showConfetti();

    // Pokaż bet-placed
    document.getElementById('bet-placed').style.display = 'flex';
    document.getElementById('bet-placed-info').textContent = `${slot} · ${amount} monet`;

    // Pulsacja slotu
    pulseSlot(slot);

    // Odśwież dane
    await loadTodayData();

  } catch (e) {
    errEl.textContent = e.message;
    btn.disabled = false;
    btn.innerHTML = `Stawiam <span id="btn-bet-label">${amount} monet</span>`;
  }
});

function pulseSlot(slot) {
  const cards = document.querySelectorAll('.slot-card');
  cards.forEach(card => {
    const time = card.querySelector('.slot-time');
    if (time && slot.startsWith(time.textContent)) {
      card.classList.add('slot-pulse');
      setTimeout(() => card.classList.remove('slot-pulse'), 600);
    }
  });
}

// ── DAY RESULT ──
function renderDayResult(result) {
  const section = document.getElementById('results-section');
  const content = document.getElementById('results-content');
  section.style.display = 'block';

  const nearestNote = result.nearest_win
    ? `<div class="text-muted small" style="margin:6px 0 0">⚡ Nikt nie trafił dokładnie — wygrywa najbliższy slot (${result.winning_slot})</div>`
    : `<div class="text-muted small" style="margin:6px 0 0">Wygrywający slot: <span class="mono accent">${result.winning_slot}</span></div>`;

  content.innerHTML = `
    <div class="breaking-banner">🍽️ MICHAŁ POSZEDŁ NA OBIAD O ${result.actual_time}</div>
    ${nearestNote}
    ${result.michal_comment ? `<div class="michal-comment">"${result.michal_comment}"</div>` : ''}
  `;

  // Near miss dla gracza
  if (state.todayBet && state.todayBet.slot !== result.winning_slot) {
    const winMins = timeToMins(result.actual_time);
    const myMins = timeToMins(state.todayBet.slot.split('-')[0]);
    if (Math.abs(myMins - winMins) <= 20) {
      content.innerHTML += `<div class="near-miss">💔 Grałeś na ${state.todayBet.slot}, Michał poszedł o ${result.actual_time}. Mogłeś wygrać.</div>`;
    }
  }

  // Załaduj i pokaż listę wygranych
  api('GET', '/api/day-results').then(data => {
    if (!data.bets || !data.bets.length) return;

    const winners = data.bets.filter(b => b.won);
    const losers  = data.bets.filter(b => !b.won);

    let html = `<div class="result-winner-list">`;

    if (winners.length) {
      html += `<div class="text-muted small" style="padding:4px 0;letter-spacing:0.5px">🏆 WYGRALI</div>`;
      winners.forEach((b, i) => {
        const isMe = state.nickname && b.nickname === state.nickname;
        html += `
          <div class="result-player-row won" style="animation-delay:${i * 0.08}s">
            <span style="flex:1">${esc(b.nickname)}${isMe ? ' <span class="accent">(ty)</span>' : ''}</span>
            <span class="text-muted small">postawił ${b.amount} monet</span>
            <span class="mono gold" style="margin-left:12px">+${b.payout} monet</span>
          </div>`;
      });
    }

    if (losers.length) {
      html += `<div class="text-muted small" style="padding:8px 0 4px;letter-spacing:0.5px">❌ NIE TRAFILI</div>`;
      losers.forEach(b => {
        const isMe = state.nickname && b.nickname === state.nickname;
        html += `
          <div class="result-player-row lost">
            <span style="flex:1">${esc(b.nickname)}${isMe ? ' <span class="accent">(ty)</span>' : ''}</span>
            <span class="mono text-muted">${b.slot}</span>
            <span class="mono danger" style="margin-left:12px">-${b.amount} monet</span>
          </div>`;
      });
    }

    html += `</div>
      <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
        Łączna pula: <span class="mono">${result.total_pool} monet</span>
      </div>`;

    content.innerHTML += html;
  }).catch(() => {});
}

function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ── LEADERBOARD ──
async function loadLeaderboard() {
  try {
    const data = await api('GET', `/api/leaderboard?highlight=${state.playerId}`);
    renderLeaderboard(data);
  } catch (e) {
    console.error('Leaderboard error:', e);
  }
}

function renderLeaderboard(data) {
  const list = document.getElementById('leaderboard-list');
  const countEl = document.getElementById('players-count');
  countEl.textContent = `${data.total_players} graczy w grze`;

  let html = '';
  let prevWasTop = false;

  data.leaderboard.forEach((p, i) => {
    if (p.outside_top && !prevWasTop) {
      html += `<div class="lb-separator">···</div>`;
    }
    prevWasTop = !p.outside_top;

    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
    const streakBadge = p.streak >= 2 ? `<span class="lb-streak">🔥${p.streak}</span>` : '';
    const meClass = p.is_me ? ' is-me' : '';

    html += `
      <div class="lb-row${meClass}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-nick">${esc(p.nickname)}${streakBadge}</span>
        <span class="lb-balance mono">${p.balance} monet</span>
      </div>
    `;
  });

  list.innerHTML = html;
}

// ── HISTORY ──
async function loadHistory() {
  try {
    const data = await api('GET', '/api/history');
    renderHistory(data.results);
  } catch (e) {
    console.error('History error:', e);
  }
}

function renderHistory(results) {
  const list = document.getElementById('history-list');
  if (!results.length) {
    list.innerHTML = '<div class="text-muted small" style="padding:8px 4px">Brak wyników</div>';
    return;
  }

  list.innerHTML = results.map(r => {
    const d = new Date(r.result_date + 'T12:00:00');
    const label = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    const slotClass = r.winners_count === 0 ? 'history-slot no-winner' : 'history-slot';
    const winnerText = r.winners_count === 0 ? 'brak trafień' : `${r.winners_count} traf.`;

    return `
      <div class="history-row">
        <span class="history-date">${label}</span>
        <span class="${slotClass}">${r.winning_slot ? r.winning_slot.split('-')[0] : '–'} ✓</span>
        <span class="history-winners">${winnerText}</span>
      </div>
    `;
  }).join('');
}

// ── BANK ──
async function loadBank() {
  try {
    const data = await api('GET', '/api/bank');
    document.getElementById('bank-balance').textContent = data.balance + ' monet';
  } catch {}
}

// ── COUNTDOWN ──
let countdownInterval = null;

function setupCountdown() {
  updateCountdown();
}

// Sloty po stronie klienta (zgodne z serwerem: 10:30–14:30)
const CLIENT_SLOTS = (() => {
  const s = [];
  let h = 10, m = 30;
  while (h < 14 || (h === 14 && m <= 15)) {
    const pad = n => String(n).padStart(2, '0');
    const em = m + 15, eh = em >= 60 ? h + 1 : h, enm = em >= 60 ? em - 60 : em;
    s.push({ slot: `${pad(h)}:${pad(m)}-${pad(eh)}:${pad(enm)}`, startMins: h * 60 + m });
    m += 15; if (m >= 60) { h++; m -= 60; }
  }
  return s;
})();

function updateCountdown() {
  const now = new Date();
  const wawStr = now.toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const waw = new Date(wawStr);
  const h = waw.getHours(), m = waw.getMinutes(), s = waw.getSeconds();
  const totalMins = h * 60 + m;

  const textEl = document.getElementById('countdown-text');
  const barEl = document.getElementById('countdown-bar');

  const firstSlotMins = CLIENT_SLOTS[0].startMins;   // 10:30 = 630
  const lastSlotMins  = CLIENT_SLOTS[CLIENT_SLOTS.length - 1].startMins; // 14:15 = 855

  if (totalMins < firstSlotMins) {
    // Przed 10:30
    const remaining = (firstSlotMins - totalMins) * 60 - s;
    const hh = Math.floor(remaining / 3600);
    const mm = Math.floor((remaining % 3600) / 60);
    const ss = remaining % 60;
    textEl.textContent = `⏳ obstawianie zaczyna się za ${hh > 0 ? hh + 'h ' : ''}${String(mm).padStart(2,'0')}m ${String(ss).padStart(2,'0')}s`;
    barEl.style.width = '0%';
  } else if (totalMins <= lastSlotMins && !state.todayData?.result) {
    // 10:30–14:15 i dzień NIE jest jeszcze rozliczony
    const nextFuture = CLIENT_SLOTS.find(sl => sl.startMins > totalMins);
    const elapsed = (totalMins - firstSlotMins) * 60 + s;
    const total   = (lastSlotMins - firstSlotMins) * 60;
    const pct = Math.min((elapsed / total) * 100, 100);
    barEl.style.width = `${pct}%`;

    if (nextFuture) {
      const remaining = (nextFuture.startMins - totalMins) * 60 - s;
      const mm = Math.floor(remaining / 60);
      const ss = remaining % 60;
      textEl.textContent = `🟢 następny slot (${nextFuture.slot.split('-')[0]}) za ${mm}m ${String(ss).padStart(2,'0')}s`;
    } else {
      textEl.textContent = `🟢 ostatni slot dostępny`;
    }
  } else {
    // Po 14:15 — sprawdź czy dzień już rozliczony
    const daySettled = !!state.todayData?.result;

    if (daySettled) {
      // Odliczaj do 10:30 następnego dnia
      const nextDayStart = new Date(wawStr);
      nextDayStart.setDate(nextDayStart.getDate() + 1);
      nextDayStart.setHours(10, 30, 0, 0);
      const remaining = Math.max(0, Math.floor((nextDayStart - now) / 1000));
      const hh = Math.floor(remaining / 3600);
      const mm = Math.floor((remaining % 3600) / 60);
      const ss = remaining % 60;
      textEl.textContent = `⏳ następna runda za ${hh}h ${String(mm).padStart(2,'0')}m ${String(ss).padStart(2,'0')}s`;
      barEl.style.width = '100%';
    } else {
      // Sloty minęły, czekamy na wynik
      const elapsed = (totalMins - lastSlotMins) * 60 + s;
      const mm = Math.floor(elapsed / 60);
      const ssec = elapsed % 60;
      textEl.textContent = `🔒 obstawianie zakończone — czekamy na Michała (${mm}m ${String(ssec).padStart(2,'0')}s temu)`;
      barEl.style.width = '100%';
    }
  }
}

// ── BALANCE DISPLAY ──
let currentBalance = null;

function updateBalanceDisplay(balance) {
  const el = document.getElementById('user-balance-display');
  if (currentBalance !== null && currentBalance !== balance) {
    el.classList.remove('balance-rolling');
    void el.offsetWidth; // reset animation
    el.classList.add('balance-rolling');
  }
  el.textContent = `💰 ${balance} monet`;
  currentBalance = balance;
}

// ── CONFETTI ──
function showConfetti() {
  const container = document.getElementById('confetti-container');
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.textContent = '🍽️';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.animationDelay = (Math.random() * 0.6) + 's';
    el.style.fontSize = (16 + Math.random() * 16) + 'px';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
}

// ── WELFARE TOAST ──
function showWelfareToast() {
  const t = document.getElementById('welfare-toast');
  t.style.display = 'block';
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.style.display = 'none'; }, 300);
  }, 4000);
}

// ── RIP NOTICE ──
function showRipNotice(nick) {
  const year = new Date().getFullYear();
  const notice = document.createElement('div');
  notice.className = 'rip-notice';
  notice.textContent = `R.I.P. ${nick}'s monet (${year}–${year})`;
  document.querySelector('.col-game').prepend(notice);
}

// ── ESCAPE HTML ──
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── SLOTS TOGGLE ──
document.getElementById('slots-toggle').addEventListener('click', () => {
  const body = document.getElementById('slots-body');
  const btn  = document.getElementById('slots-toggle');
  const collapsed = body.classList.toggle('collapsed');
  btn.textContent = collapsed ? '▼ rozwiń' : '▲ zwiń';
  btn.setAttribute('aria-expanded', !collapsed);
});

function setSlotsCollapsed(collapsed) {
  const body = document.getElementById('slots-body');
  const btn  = document.getElementById('slots-toggle');
  body.classList.toggle('collapsed', collapsed);
  btn.textContent = collapsed ? '▼ rozwiń' : '▲ zwiń';
  btn.setAttribute('aria-expanded', !collapsed);
}

// ── HOW IT WORKS MODAL ──
document.getElementById('btn-how').addEventListener('click', () => {
  document.getElementById('how-it-works').style.display = 'flex';
});
document.getElementById('how-close').addEventListener('click', () => {
  document.getElementById('how-it-works').style.display = 'none';
});
document.getElementById('how-it-works').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

// ── START ──
init();
