// ── INCYDENT W TERMINALU („gra przy stole") ──
// Etap B roadmapy: zanim powstanie UI, sprawdzamy na ludziach, czy incydent jest ciekawy
// i zrozumiały. Prowadzący odpala to przy stole, grupa decyduje, CO robi i w JAKIEJ kolejności
// (silnik incydentu bez drzewa decyzji: proto/incydent.js).
//   node ciso-sim/proto/rozegraj.js S03 [--kontrole=bcp,backup] [--naprawione=hmi_wystawiony] [--seed=7]
// Bez interakcji: --auto=wzorcowo | --auto=bezczynnie (sprawdzenie pliku i zasad)
//
// Przy okazji WALIDUJE plik incydentu: zły plik nie zagra, a powód jest wypisany.

const readline = require('readline');
const I = require('./incydent');
const K = require('./kampania');
const RU = require('./ruchy');

function przygotuj(id, { seed = 7, kontrole = [], naprawione = [] } = {}) {
  const k = K.nowaKampania('wodociagi', seed);
  // Przygotowanie z „poprzednich miesięcy": działające kontrole (wdrożone porządnie) i naprawione fakty.
  for (const kid of kontrole) RU.zainstalujGotowe(k, kid);
  for (const f of naprawione) if (k.fakty[f]) { k.fakty[f].znany = true; k.fakty[f].naprawiony = true; }
  k.zdarzenia.push({ id, typ: 'incydent', zagrane: false, okno: [1, 1] });
  K.rozpocznijIncydent(k, id);
  return k;
}

function raport(k, w, log) {
  log(`\n══ ${w.tytul} ══\n${w.opis}`);
  log(`Skutki dla kampanii: ${JSON.stringify(w.skutki)}`);
  for (const o of w.oceny) log(`${o.wynik === 'spelniona' ? '✅' : o.wynik === 'nieuczciwa' ? '⛔' : '❌'} ${o.opis}\n   ${o.dlaczego}`);
  log('\nDebrief:');
  for (const z of w.def.debrief) log(`  – ${z}`);
}

async function main() {
  const id = process.argv[2] || 'S01';
  const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1];
  const def = I.wczytaj(id);
  const bledy = I.waliduj(def);
  if (bledy.length) { console.error(`Incydent ${id} ma błędy:\n - ${bledy.join('\n - ')}`); process.exit(1); }
  const k = przygotuj(id, { seed: Number(arg('seed') || 7), kontrole: (arg('kontrole') || '').split(',').filter(Boolean), naprawione: (arg('naprawione') || '').split(',').filter(Boolean) });
  const widok = () => { const inc = k.incydent; console.log(`\n── T+${inc.s.t.toFixed(1)} h ──`); for (const x of inc.def.widok(inc.s)) console.log(x); for (const z of I.zegary(inc)) console.log(`  ⏱ ${z.nazwa}: ${z.zostalo.toFixed(1)} h`); };
  let wynik = null;
  const auto = arg('auto');
  if (auto) {
    if (auto === 'wzorcowo') {
      for (const a of K.PLAYBOOK[id](k.incydent.s)) {
        if (!k.incydent || I.dostepnaAkcja(k, a)) continue;
        widok();
        const r = K.incydentAkcja(k, a);
        console.log(`→ ${r.tekst}`);
        if (r.koniec) wynik = r.koniec;
      }
    } else if (k.incydent) wynik = K.incydentCzekaj(k, def.limit_h).koniec;
    if (k.incydent) wynik = K.incydentZakoncz(k);
    raport(k, wynik, console.log);
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pytaj = q => new Promise(r => rl.question(q, r));
  while (k.incydent) {
    widok();
    I.akcje(k).forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}) ${a.nazwa} [${a.czas_h} h]${a.powod ? `   ✗ ${a.powod}` : ''}`));
    const l = (await pytaj('Akcja (numer), „c <h>" — czekaj, „k" — koniec fazy ostrej: ')).trim();
    try {
      if (l === 'k') { wynik = K.incydentZakoncz(k); break; }
      const c = l.match(/^c\s+(\d+(\.\d+)?)$/);
      const r = c ? K.incydentCzekaj(k, Number(c[1])) : K.incydentAkcja(k, I.akcje(k)[Number(l) - 1]?.id || l);
      console.log(`→ ${r.tekst}`);
      if (r.koniec) wynik = r.koniec;
    } catch (e) { if (!e.niedostepny) throw e; console.log(`Nie da się: ${e.message}`); }
  }
  rl.close();
  raport(k, wynik, console.log);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { przygotuj };
