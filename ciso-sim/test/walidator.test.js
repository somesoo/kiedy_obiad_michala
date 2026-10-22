// Testy walidatora wdrożeń i flag z wyników SOAR-a (docs/21-…, 21.12): gracz mówi „wdrożone",
// walidator sprawdza jego tenant skryptami i daje flagę tylko za to, co naprawdę działa; w incydencie
// playbook i analiza w SOAR-ze oddają flagę, a skutek w grze następuje, gdy gracz z nią wróci.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const K = require('../proto/kampania');
const RU = require('../proto/ruchy');
const S = require('../proto/silnik');
const Z = require('../proto/zewnetrzne');
const ZW = require('../data/zewnetrzne');
const W = require('../walidator/walidator');
const LAB = require('../lab/lab');

const KL = Z.kluczePary();
const KONFIG = { adapter: 'atrapa', progi: { alert_s: 1, sprawa_s: 1, odpytywanie_ms: 20 } };
const atrapa = () => { const k = { ...KONFIG, dane: JSON.parse(require('fs').readFileSync(path.join(__dirname, '../walidator/atrapa.przyklad.json'), 'utf8')) }; return { ...W.zbuduj(k), konfig: k, klucz: KL.prywatny }; };

test('każde zadanie wdrożenia z gry ma skrypt sprawdzenia', () => {
  for (const [id, k] of Object.entries(ZW.kontrole)) for (const z of Object.keys(k.zadania)) assert.ok(W.SPRAWDZENIA[`${id}.${z}`], `${id}.${z}`);
});

test('dobrze wdrożony tenant dostaje flagi (ważne tylko dla niego), źle wdrożony — powody bez flag', async () => {
  const sr = atrapa();
  for (const kon of ['siem', 'soar']) {
    const r = await W.sprawdz({ tenant: 'ala', kontrola: kon }, sr);
    for (const w of r.wyniki) {
      assert.ok(w.ok && w.flaga, `${kon}.${w.zadanie}: ${w.powody}`);
      const l = Z.odczytaj(w.flaga, [KL.publiczny]);
      assert.strictEqual(l.tn, 'ala'); assert.strictEqual(l.z, `${kon}.${w.zadanie}`);
    }
  }
  const zr = (await W.sprawdz({ tenant: 'ala', kontrola: 'siem', zadania: ['zrodla'] }, sr)).wyniki[0];
  assert.deepStrictEqual(zr.wynik.zrodla.sort(), ['ad', 'serwery', 'zapora']);
  const bob = [...(await W.sprawdz({ tenant: 'bob', kontrola: 'siem' }, sr)).wyniki, ...(await W.sprawdz({ tenant: 'bob', kontrola: 'soar' }, sr)).wyniki];
  assert.ok(bob.every(w => !w.ok && !w.flaga && w.powody.length));
  const t = bob.map(w => w.powody.join(' ')).join(' ');
  assert.match(t, /nie przysyła logów/);
  assert.match(t, /na próbce zdarzeń nie wystawiła alertu/, 'reguła z dobrą nazwą, która milczy, nie przechodzi');
  assert.match(t, /nie deklaruje techniki/);
  assert.match(t, /brak kroku zatwierdzenia/);
});

test('bez testu na żywo (adapter bez wstrzykiwania) reguły liczą się z deklaracji — i walidator to mówi', async () => {
  const sr = atrapa();
  delete sr.siem.wstrzyknij;
  const w = (await W.sprawdz({ tenant: 'bob', kontrola: 'siem', zadania: ['reguly'] }, sr)).wyniki[0];
  assert.match(w.powody.join(' '), /bez testu na żywo/);
  assert.ok(!w.ok, 'bob ma jedną regułę z techniką — dalej za mało');
});

test('walidator przez HTTP z adapterem http-json: Twoje API, Twoje nazwy pól, sekret ze środowiska', async () => {
  // Udawane API SIEM-a i SOAR-a w „cudzym" formacie.
  const teraz = new Date().toISOString();
  const api = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer tajne-siem' && req.headers['x-api-key'] !== 'tajne-soar') { res.writeHead(401); return res.end(); }
    const dane = {
      '/s/tenants/ala/sources': { data: [{ name: 'DC1', type: 'windows-dc', last_event_at: teraz }] },
      '/s/tenants/ala/rules': { data: [1, 2, 3].map(i => ({ name: `R${i}`, enabled: true, mitre: { techniques: ['T1078'] } })) },
      '/o/tenants/ala/playbooks': { data: [['disable-account', ['approval', 'disable']], ['collect-logs', ['export', 'hash']], ['isolate-host', ['approval', 'isolate']]].map(([kind, steps]) => ({ name: kind, kind, active: true, steps })) },
    }[req.url];
    res.writeHead(dane ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(dane || {}));
  });
  await new Promise(r => api.listen(0, '127.0.0.1', r));
  const u = `http://127.0.0.1:${api.address().port}`;
  process.env.T_SIEM = 'tajne-siem'; process.env.T_SOAR = 'tajne-soar';
  const konfig = {
    adapter: 'http-json',
    siem: { url: `${u}/s`, naglowki: { Authorization: 'Bearer ${ENV:T_SIEM}' }, typy: { 'windows-dc': 'ad' }, zasoby: {
      zrodla: { sciezka: '/tenants/{tenant}/sources', lista: 'data', pola: { nazwa: 'name', typ: 'type', ostatnie: 'last_event_at' } },
      reguly: { sciezka: '/tenants/{tenant}/rules', lista: 'data', pola: { nazwa: 'name', wlaczona: 'enabled', techniki: 'mitre.techniques' } } } },
    soar: { url: `${u}/o`, naglowki: { 'X-Api-Key': '${ENV:T_SOAR}' }, typy: { 'disable-account': 'wylaczenie_konta', 'collect-logs': 'zebranie_dziennikow', 'isolate-host': 'izolacja_hosta' },
      kroki_zatwierdzenia: ['approval'], zasoby: { playbooki: { sciezka: '/tenants/{tenant}/playbooks', lista: 'data', pola: { nazwa: 'name', typ: 'kind', wlaczony: 'active', kroki: 'steps' } } } },
  };
  const { utworz } = require('../walidator/serwer');
  const wal = utworz({ konfig, klucz: KL.prywatny });
  await new Promise(r => wal.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${wal.address().port}`;
  try {
    const r = await Z.zapytajWalidator(url, { tenant: 'ala', kontrola: 'siem' });
    assert.deepStrictEqual(r.wyniki.map(w => w.ok), [true, true]);
    assert.deepStrictEqual(r.wyniki[0].wynik.zrodla, ['ad']);
    assert.match(r.wyniki[1].powody.join(' '), /bez testu na żywo/);
    const p = await Z.zapytajWalidator(url, { tenant: 'ala', kontrola: 'soar', zadania: ['playbooki'] });
    assert.ok(p.wyniki[0].ok, p.wyniki[0].powody.join('; '));
    await assert.rejects(Z.zapytajWalidator(url, { tenant: 'ala', kontrola: 'siem' }), /odczekaj/, 'odstęp między sprawdzeniami');

    // Pełna pętla w kampanii: wdrożenie czeka → „sprawdz" → flagi → SIEM działa.
    const k = K.nowaKampania('wodociagi', 1, { zewnetrzne: { tenant: 'ala', klucze: [KL.publiczny], walidator: url } });
    RU.wykonaj(k, 'wdroz:siem_os');
    for (let i = 0; i < 12 && k.obiekty.siem_os.stan === 'projekt'; i++) K.zamknijMiesiac(k);
    assert.strictEqual(k.obiekty.siem_os.stan, 'konfiguracja');
    assert.ok(k.raportIT.some(x => /sprawdz siem_os/.test(x)));
    // Walidator jest przy SIEM-ie: zadanie siem_os sprawdza tymi samymi skryptami (odstęp dotyczy pary tenant+kontrola).
    const s2 = await Z.zapytajWalidator(url, { tenant: 'ala', kontrola: 'siem_os' });
    for (const w of s2.wyniki) K.flaga(k, w.flaga);
    assert.ok(S.dziala(k.st, 'siem_os'));
  } finally { wal.close(); api.close(); }
});

// ── INCYDENT: flaga z wyniku playbooka / analizy w SOAR-ze ──
const CTX = { klucz: KL.prywatny, klucze: [KL.publiczny] };
const sesja = () => LAB.nowaSesja({ incydent: 'S07', tenant: 'ala', seed: 3, start: '2026-11-16T06:40:00Z', kontrole: ['siem'], tryb: 'flagi' });

test('tryb „flagi": playbook oddaje flagę w wyniku, a skutek w grze następuje dopiero po jej wniesieniu', () => {
  const L = sesja();
  const r = LAB.wykonaj(L, 'soar', { playbook: 'wylacz-konto', pola: { konto: L.dane.konto } }, CTX);
  assert.ok(r.ok && /^LO\{/.test(r.flaga));
  assert.ok(!L.s.dostep_odebrany, 'samo uruchomienie playbooka nie zmienia gry');
  const zly = LAB.wykonaj(L, 'soar', { playbook: 'wylacz-konto', pola: { konto: 'a.zak' } }, CTX);
  assert.ok(!zly.ok && !zly.flaga, 'zły cel — bez flagi');
  LAB.wykonaj(L, 'flaga', { flaga: r.flaga }, CTX);
  assert.ok(L.s.dostep_odebrany);
  assert.throws(() => LAB.wykonaj(L, 'flaga', { flaga: r.flaga }, CTX), /już użyta|już odebrany/);
});

test('tryb „flagi": analiza w SOAR-ze daje flagę ustalenia; w grze ustaleń się nie wpisuje; flaga z innej sesji nie przejdzie', () => {
  const L = sesja();
  assert.throws(() => LAB.wykonaj(L, 'ustalenie', { id: 'konto_sprawcy', odpowiedz: L.dane.konto }, CTX), /SOAR/);
  const zle = LAB.wykonaj(L, 'analiza', { id: 'konto_sprawcy', odpowiedz: 'nie.to' }, CTX);
  assert.ok(!zle.zgadza && !zle.flaga);
  const ok = LAB.wykonaj(L, 'analiza', { id: 'konto_sprawcy', odpowiedz: L.dane.konto }, CTX);
  assert.ok(ok.zgadza && ok.flaga);
  assert.ok(!L.ustalenia.konto_sprawcy, 'dopiero flaga w grze zapisuje ustalenie');
  const inna = LAB.nowaSesja({ incydent: 'S07', tenant: 'ala', seed: 4, start: '2026-11-16T06:40:00Z', tryb: 'flagi' });
  assert.throws(() => LAB.wykonaj(inna, 'flaga', { flaga: ok.flaga }, CTX), /innej sesji/);
  LAB.wykonaj(L, 'flaga', { flaga: ok.flaga }, CTX);
  assert.ok(L.ustalenia.konto_sprawcy);
  // Odtworzenie sesji (bez kluczy — ładunki flag są w zapisie) daje ten sam stan.
  const B = LAB.odtworz(L.p, L.ops);
  assert.deepStrictEqual(LAB.stan(B), LAB.stan(L));
});
