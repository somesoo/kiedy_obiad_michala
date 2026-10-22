// ── FLAGI Z ZEWNĘTRZNEGO SYSTEMU (SIEM / SOAR / lab) — forma CTF ──
// Projekt: docs/21-…, 21.11. Gracz wychodzi z gry do SIEM-a albo SOAR-a (swój tenant), robi tam
// robotę i WRACA Z FLAGĄ. Gra nie „wierzy na słowo", że SIEM jest skonfigurowany albo incydent
// poprowadzony — flaga to dowód.
//
// Format: LO{<ładunek base64url(JSON)>.<podpis base64url>}, podpis Ed25519 nad „LO1.<ładunek>".
// Ładunek: { tn: tenant gracza, z: zadanie („siem.zrodla", „soar.playbooki", „incydent:S07"),
//            w: wynik (co skonfigurowano / akcje incydentu), n: jednorazowy identyfikator, wyd: ISO }.
//
// Dlaczego Ed25519, a nie HMAC: gracz może mieć grę u siebie (terminal), więc gra zna tylko klucz
// PUBLICZNY. Podpisuje system właściciela (albo serwer labu) kluczem prywatnym — gracz flagi nie podrobi.
// Flaga jest przypięta do tenanta (nie przepiszesz od kolegi) i jednorazowa (nie użyjesz dwa razy).

const crypto = require('crypto');
const ZW = require('../data/zewnetrzne');

const PREFIKS = 'LO1';
const b64 = b => Buffer.from(b).toString('base64url');

function podpisz(ladunek, kluczPrywatnyPem) {
  const l = b64(JSON.stringify(ladunek));
  return `LO{${l}.${b64(crypto.sign(null, Buffer.from(`${PREFIKS}.${l}`), kluczPrywatnyPem))}}`;
}

// Odczyt i weryfikacja: zwraca ładunek albo rzuca Error z powodem po polsku.
function odczytaj(flaga, kluczePem) {
  const m = /^LO\{([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\}$/.exec(String(flaga || '').trim());
  if (!m) throw new Error('to nie jest flaga (LO{…})');
  const ok = (kluczePem || []).some(kl => { try { return crypto.verify(null, Buffer.from(`${PREFIKS}.${m[1]}`), kl, Buffer.from(m[2], 'base64url')); } catch { return false; } });
  if (!ok) throw new Error('flaga się nie zgadza — nie pochodzi z systemu albo została zmieniona');
  let l;
  try { l = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { throw new Error('flaga jest uszkodzona'); }
  if (!l || typeof l.tn !== 'string' || typeof l.z !== 'string' || typeof l.n !== 'string') throw new Error('flaga nie ma tenanta, zadania albo identyfikatora');
  return l;
}

function kluczePary() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { publiczny: publicKey.export({ type: 'spki', format: 'pem' }), prywatny: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}

// ── W KAMPANII ──
const wlaczone = k => !!k.opcje?.zewnetrzne;
const wymaga = (k, id) => (wlaczone(k) && ZW.kontrole[id] ? ZW.kontrole[id] : null);
const brakujace = (k, id) => Object.keys(wymaga(k, id)?.zadania || {}).filter(z => !k.zewn.wyniki[id]?.[z]);

// Sprawdzenie flagi wdrożenia (bez skutków): null albo powód.
function sprawdzKod(k, kod) {
  if (!wlaczone(k)) return 'ta gra nie jest połączona z zewnętrznym SIEM-em/SOAR-em';
  let l;
  try { l = odczytaj(kod, k.opcje.zewnetrzne.klucze); } catch (e) { return e.message; }
  if (l.tn !== k.opcje.zewnetrzne.tenant) return `flaga jest dla innego tenanta (${l.tn}) — każdy gracz konfiguruje swój`;
  if (k.zewn.uzyte.includes(l.n)) return 'ta flaga była już użyta';
  const [kid, zad] = l.z.split('.');
  if (!ZW.kontrole[kid]?.zadania[zad]) return `flaga dotyczy zadania „${l.z}", którego ta gra nie zna (wdrożenia: ${Object.keys(ZW.kontrole).join(', ')})`;
  return null;
}

// Jakość z tego, co naprawdę skonfigurowano (🔵): pokrycie źródeł 40–100%, reguły i playbooki ±30%.
function mnoznik(k, id) {
  const w = k.zewn.wyniki[id] || {};
  let m = 1;
  if (w.zrodla) {
    const potrzebne = Object.keys(ZW.ZRODLA).filter(z => z !== 'ot' || k.st.firma.ot);
    const maja = potrzebne.filter(z => (w.zrodla.zrodla || []).includes(z));
    m *= 0.4 + 0.6 * (maja.length / potrzebne.length);
  }
  if (w.reguly) m *= 0.7 + 0.3 * Math.min(1, (w.reguly.reguly || []).length / ZW.MIN_REGUL);
  if (w.playbooki) m *= 0.7 + 0.3 * Math.min(1, (w.playbooki.playbooki || []).length / ZW.MIN_PLAYBOOKOW);
  return m;
}

// Źródła podłączone do SIEM-a (dla labu: które logi istnieją w incydencie). null = gra bez systemu.
function zrodlaSiem(k) {
  if (!wlaczone(k)) return null;
  const z = new Set();
  for (const id of ['siem', 'siem_os', 'mdr']) if (k.obiekty[id]?.stan === 'dziala') for (const x of k.zewn.wyniki[id]?.zrodla?.zrodla || []) z.add(x);
  return [...z];
}

module.exports = { PREFIKS, podpisz, odczytaj, kluczePary, wlaczone, wymaga, brakujace, sprawdzKod, mnoznik, zrodlaSiem, ZW };
