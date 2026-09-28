// Czas Europe/Warsaw i dni robocze — wspólne dla Snakes, bossa i Wordle.
// Czyste funkcje bez bazy i bez stanu: serwer stoi na UTC, a gra liczy doby, godziny
// otwarcia i terminy po czasie Warszawy (z CET/CEST), stąd jedno miejsce na tę matematykę.

// ── STREFA CZASOWA (Europe/Warsaw) ──
function warsawParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

// Dzisiejsza data w Warszawie jako 'YYYY-MM-DD'
function todayWaw() {
  const p = warsawParts();
  return `${p.y}-${p.mo}-${p.d}`;
}

// Odwrotność warsawParts: epoch ms odpowiadający podanej godzinie ściennej w
// Europe/Warsaw dla danej daty (Y-M-D). Iteracyjnie koryguje różnicę stref (CET/CEST),
// aż warsawParts(wynik) faktycznie pokaże żądaną godzinę — zbiega w 1-2 krokach.
function warsawWallTimeToMs(y, m, d, hour) {
  const wantedUtc = Date.UTC(y, m - 1, d, hour, 0, 0);
  let guessMs = wantedUtc;
  for (let i = 0; i < 3; i++) {
    const p = warsawParts(new Date(guessMs));
    const shownUtc = Date.UTC(Number(p.y), Number(p.mo) - 1, Number(p.d), Number(p.h), Number(p.mi), Number(p.s));
    const diff = wantedUtc - shownUtc;
    if (diff === 0) break;
    guessMs += diff;
  }
  return guessMs;
}

// ── DNI ROBOCZE ──
// Weekend rozpoznajemy z daty kalendarzowej (na północach UTC — DST nie ma znaczenia).
function isWeekendStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6; // niedziela / sobota
}

// (Snakes & Ladders) Dodaje `days` DNI ROBOCZYCH (pon–pt, czasu Warszawy) do danej
// chwili — weekendy są całkowicie pomijane, więc licznik "nie płynie" w sobotę/niedzielę.
// Używane do terminu pokonania bossa w wydarzeniu co-op (patrz slFinishBossEvent).
function addBusinessDaysMs(fromMs, days) {
  let ms = fromMs;
  let remaining = days;
  while (remaining > 0) {
    ms += 24 * 60 * 60 * 1000;
    const p = warsawParts(new Date(ms));
    if (!isWeekendStr(`${p.y}-${p.mo}-${p.d}`)) remaining--;
  }
  return ms;
}

function isoFromUTC(t) {
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// Poprzedni dzień roboczy przed dateStr (pon → poprzedni pt)
function previousBusinessDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  do { t -= 86400000; } while ([0, 6].includes(new Date(t).getUTCDay()));
  return isoFromUTC(t);
}

// Pierwszy dzień roboczy w dniu dateStr lub po nim
function firstBusinessDayOnOrAfter(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  while ([0, 6].includes(new Date(t).getUTCDay())) t += 86400000;
  return isoFromUTC(t);
}

module.exports = {
  warsawParts,
  todayWaw,
  warsawWallTimeToMs,
  isWeekendStr,
  addBusinessDaysMs,
  isoFromUTC,
  previousBusinessDay,
  firstBusinessDayOnOrAfter
};
