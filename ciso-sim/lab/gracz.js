// ── KLIENT GRACZA (terminal) — incydent w labie, obok SIEM-a i SOAR-a ──
// Gracz ma trzy okna: ten terminal (decyzje ludzi: wójt, komunikat, papier, zgłoszenia),
// swój tenant w SIEM-ie (szukanie) i w SOAR-ze (dokumenty sprawy, playbooki). Docs/21-….
//   LAB_URL=https://lab.example LAB_TOKEN=<token z /admin/sesje> node ciso-sim/lab/gracz.js

const readline = require('readline');


const URL_LABU = (process.env.LAB_URL || 'http://127.0.0.1:31600').replace(/\/$/, '');
const TOKEN = process.env.LAB_TOKEN;
if (!TOKEN) { console.error('Brak LAB_TOKEN (token gracza od prowadzącego).'); process.exit(1); }

async function api(metoda, sciezka, cialo) {
  const r = await fetch(URL_LABU + sciezka, {
    method: metoda, headers: { Authorization: `Bearer ${TOKEN}`, ...(cialo ? { 'Content-Type': 'application/json' } : {}) },
    body: cialo ? JSON.stringify(cialo) : undefined,
  });
  const x = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(x.blad || `HTTP ${r.status}`);
  return x;
}

function pokaz(st) {
  console.log(`\n── ${st.incydent.id} „${st.incydent.tytul}" · T+${st.t.toFixed(1)} h · ${new Date(st.czas).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })} ──`);
  for (const l of st.widok) console.log(l);
  for (const z of st.zegary) console.log(`  ⏱ ${z.nazwa}: ${z.zostalo.toFixed(1)} h`);
  console.log(`  SIEM: ${st.siem.zdarzen} zdarzeń w Twoim tenancie · SOAR: ${st.soar.dokumentow} dokumentów w sprawie`);
  if (st.koniec) {
    const k = st.koniec;
    console.log(`\n══ ${k.tytul} ══\n${k.opis}`);
    if (k.flaga) console.log(`\nFlaga wyniku do Twojej kampanii (komenda „flaga" w grze):\n${k.flaga}`);
    for (const o of k.oceny) console.log(`${o.wynik === 'spelniona' ? '✅' : '❌'} ${o.opis}\n   ${o.dlaczego}`);
    console.log('\nLab:', k.lab);
    console.log('\nDebrief:'); for (const z of k.debrief) console.log(`  – ${z}`);
    return;
  }
  console.log('\nAkcje:');
  for (const a of st.akcje) console.log(`  ${a.kanal === 'soar' ? '[SOAR]' : '      '} ${a.id.padEnd(28)} ${a.nazwa} [${a.czas_h} h]${a.kanal === 'soar' ? ` → playbook „${a.playbook}"` : ''}${a.powod ? `   ✗ ${a.powod}` : ''}`);
  console.log(st.tryb === 'flagi' ? '\nPytania śledcze (szukasz w SIEM-ie, analizę zapisujesz w SOAR-ze → flaga):' : '\nPytania śledcze (odpowiedź z SIEM-a):');
  for (const u of st.ustalenia) console.log(`  ${u.ustalone ? (u.podane ? '◐' : '●') : '○'} ${u.id.padEnd(20)} ${u.pytanie}${u.ustalone ? '' : `   (podpowiedź: ${u.nastepna_podpowiedz_min ?? '—'} min)`}`);
  console.log(st.tryb === 'flagi'
    ? '\nKomendy: a <akcja> · f LO{…} (flaga z wyniku playbooka/analizy w SOAR-ze) · c <godziny> · p <pytanie> (podpowiedź) · s · k (koniec fazy ostrej) · q'
    : '\nKomendy: a <akcja> · c <godziny> · u <pytanie> <odpowiedź> · p <pytanie> · s (stan) · k (koniec fazy ostrej) · q');
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  // Iterator linii zakładany OD RAZU (a nie rl.question): linie z potoku (skrypt prowadzącego)
  // przychodzą, zanim serwer odpowie, i bez bufora by przepadły.
  const linie = rl[Symbol.asyncIterator]();
  let st = await api('GET', '/gra/stan');
  pokaz(st);
  rl.prompt();
  for (;;) {
    const { value: linia, done } = await linie.next();
    if (done || st.koniec) break;
    const [kom, arg, ...reszta] = linia.trim().split(/\s+/);
    try {
      let r;
      if (kom === 'q') break;
      else if (kom === 's') r = { stan: await api('GET', '/gra/stan') };
      else if (kom === 'a') r = await api('POST', '/gra/akcja', { akcja: arg });
      else if (kom === 'c') r = await api('POST', '/gra/czekaj', { h: Number(arg) });
      else if (kom === 'u') r = await api('POST', '/gra/ustalenie', { id: arg, odpowiedz: reszta.join(' ') });
      else if (kom === 'p') r = await api('POST', '/gra/podpowiedz', { id: arg });
      else if (kom === 'k') r = await api('POST', '/gra/koniec', {});
      else if (kom === 'f' || kom === 'flaga') r = await api('POST', '/gra/flaga', { flaga: arg });
      else { console.log('Nie znam tej komendy.'); rl.prompt(); continue; }
      if (r.tekst) console.log(`→ ${r.tekst}`);
      st = r.stan; pokaz(st);
    } catch (e) { console.log(`Nie da się: ${e.message}`); }
    if (st.koniec) break;
    rl.prompt();
  }
  rl.close();
})().catch(e => { console.error(e.message); process.exit(1); });
