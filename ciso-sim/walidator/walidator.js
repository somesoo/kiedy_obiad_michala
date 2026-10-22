// ── WALIDATOR WDROŻEŃ: gracz mówi „wdrożone", walidator sprawdza tenant i daje flagę ──
// Projekt: docs/21-…, 21.12. Stoi przy SIEM-ie i SOAR-ze właściciela (adaptery/), gra go woła
// (komenda „sprawdz <kontrola>"). Każde zadanie wdrożenia (data/zewnetrzne.js) ma skrypt w
// sprawdzenia/; zaliczone → flaga podpisana kluczem walidatora (Ed25519, proto/zewnetrzne.js),
// niezaliczone → lista powodów, bez flagi.
//
// Prośba o sprawdzenie nie musi być tajna: flaga jest przypięta do tenanta, którego konfigurację
// sprawdzono — „sprawdź tenanta kolegi" daje flagę ważną tylko w grze kolegi.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Z = require('../proto/zewnetrzne');
const ZW = require('../data/zewnetrzne');

// Zadanie gry → skrypt. SIEM open source i MDR sprawdzamy tymi samymi skryptami co SIEM.
const SPRAWDZENIA = {
  'siem.zrodla': 'zrodla', 'siem_os.zrodla': 'zrodla', 'mdr.zrodla': 'zrodla',
  'siem.reguly': 'reguly', 'siem_os.reguly': 'reguly',
  'soar.integracja': 'integracja', 'soar.playbooki': 'playbooki',
};
const skrypt = zad => require(path.join(__dirname, 'sprawdzenia', `${SPRAWDZENIA[zad]}.js`));

function zbuduj(konfig) {
  const nazwa = konfig.adapter || 'atrapa';
  if (!/^[a-z-]+$/.test(nazwa)) throw new Error('adapter: nazwa pliku z walidator/adaptery/');
  return require(path.join(__dirname, 'adaptery', `${nazwa}.js`))(konfig);
}

// { tenant, kontrola, zadania? } → { tenant, kontrola, wyniki: [{ zadanie, opis, ok, powody, wynik, flaga? }] }
async function sprawdz({ tenant, kontrola, zadania }, { siem, soar, konfig = {}, klucz, teraz = Date.now() }) {
  if (typeof tenant !== 'string' || !/^[\w.-]{1,64}$/.test(tenant)) throw new Error('tenant: identyfikator tenanta gracza');
  const kat = ZW.kontrole[kontrola];
  if (!kat) throw new Error(`nieznana kontrola „${kontrola}" (są: ${Object.keys(ZW.kontrole).join(', ')})`);
  const lista = zadania?.length ? zadania : Object.keys(kat.zadania);
  const wyniki = [];
  for (const z of lista) {
    const id = `${kontrola}.${z}`;
    if (!kat.zadania[z] || !SPRAWDZENIA[id]) { wyniki.push({ zadanie: z, ok: false, powody: [`nie ma zadania „${z}" dla ${kat.nazwa}`] }); continue; }
    let r;
    try { r = await skrypt(id).sprawdz({ tenant, siem, soar, konfig, teraz }); } catch (e) { r = { ok: false, powody: [`nie udało się sprawdzić: ${e.message}`] }; }
    const w = { zadanie: z, opis: kat.zadania[z].opis, ok: !!r.ok, powody: r.powody || [], wynik: r.wynik || {} };
    if (w.ok) w.flaga = Z.podpisz({ tn: tenant, z: id, w: w.wynik, n: crypto.randomBytes(9).toString('base64url'), wyd: new Date(teraz).toISOString().slice(0, 10) }, klucz);
    wyniki.push(w);
  }
  return { tenant, kontrola, wyniki };
}

const wczytajKonfig = plik => JSON.parse(fs.readFileSync(plik, 'utf8'));

module.exports = { sprawdz, zbuduj, wczytajKonfig, SPRAWDZENIA };
