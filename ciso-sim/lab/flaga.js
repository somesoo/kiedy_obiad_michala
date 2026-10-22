// ── FLAGI: klucze, wydawanie i sprawdzanie (dla systemu właściciela i prowadzącego) ──
// Twój SIEM/SOAR (albo osoba, która sprawdziła konfigurację w tenancie gracza) wydaje flagę
// kluczem PRYWATNYM; gra sprawdza ją kluczem PUBLICZNYM (docs/21-…, 21.11). Format i ładunek:
// proto/zewnetrzne.js. Ten skrypt można wołać z playbooka albo reguły po stronie systemu.
//
//   node ciso-sim/lab/flaga.js klucze <katalog>                      → <katalog>/flagi.pem (prywatny), flagi.pub.pem
//   node ciso-sim/lab/flaga.js wydaj --klucz=flagi.pem --tenant=ala --zadanie=siem.zrodla --wynik='{"zrodla":["ad","serwery"]}'
//   node ciso-sim/lab/flaga.js sprawdz 'LO{…}' --klucz=flagi.pub.pem
// Zadania wdrożeń: data/zewnetrzne.js (siem.zrodla, siem.reguly, siem_os.*, mdr.zrodla, soar.integracja, soar.playbooki).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Z = require('../proto/zewnetrzne');

const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const [, , cmd, x] = process.argv;

if (cmd === 'klucze') {
  const dir = x || '.';
  const { publiczny, prywatny } = Z.kluczePary();
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, 'flagi.pem'))) { console.error(`W ${dir} jest już flagi.pem — nie nadpisuję (stare flagi przestałyby się zgadzać).`); process.exit(1); }
  fs.writeFileSync(path.join(dir, 'flagi.pem'), prywatny, { mode: 0o600, flag: 'wx' });   // nie nadpisuje istniejącego klucza
  fs.writeFileSync(path.join(dir, 'flagi.pub.pem'), publiczny, { flag: 'wx' });
  console.log(`Klucz prywatny: ${path.join(dir, 'flagi.pem')} (trzymaj w systemie, nie dawaj graczom)\nKlucz publiczny: ${path.join(dir, 'flagi.pub.pem')} (do gry: --klucz=…)`);
} else if (cmd === 'wydaj') {
  const kl = fs.readFileSync(arg('klucz'), 'utf8');
  if (!arg('tenant') || !arg('zadanie')) { console.error('Potrzebne --tenant i --zadanie'); process.exit(1); }
  const w = arg('wynik') ? JSON.parse(arg('wynik')) : {};
  console.log(Z.podpisz({ tn: arg('tenant'), z: arg('zadanie'), w, n: crypto.randomBytes(9).toString('base64url'), wyd: new Date().toISOString().slice(0, 10) }, kl));
} else if (cmd === 'sprawdz') {
  try { console.log(JSON.stringify(Z.odczytaj(x, [fs.readFileSync(arg('klucz'), 'utf8')]), null, 2)); } catch (e) { console.error(`Nie: ${e.message}`); process.exit(1); }
} else {
  console.error('Komendy: klucze <katalog> · wydaj --klucz= --tenant= --zadanie= [--wynik=JSON] · sprawdz <flaga> --klucz=');
  process.exit(1);
}
