// Testy labu SIEM/SOAR (docs/21-siem-soar-ctf.md): to, na czym stoi połączenie gry z narzędziami
// właściciela — widoczność logów wynika z kampanii, prawda nie wycieka do gracza, akcje z playbookiem
// idą tylko przez SOAR, podpowiedzi kosztują zegar, sesja się odtwarza, a serwer pilnuje sekretów.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const LAB = require('../lab/lab');
const { konfiguracja, utworz, hmac } = require('../lab/serwer');

const START = '2026-11-16T06:40:00Z';
const sesja = (kontrole = [], seed = 3) => LAB.nowaSesja({ incydent: 'S07', seed, start: START, tenant: 'g1', kontrole });
const dc = L => L.wydaneZd.filter(z => z['host.name'] === 'UG-DC01');

test('lab S07: plik przechodzi walidację, playbooki wskazują istniejące akcje incydentu', () => {
  assert.deepStrictEqual(LAB.walidujLab(LAB.wczytajLab('S07')), []);
  const zly = { ...LAB.wczytajLab('S07'), soar: { x: { akcja: 'nie_ma_takiej', opis: 'x' } }, ustalenia: { y: { pytanie: 'p' } } };
  const b = LAB.walidujLab(zly).join('\n');
  assert.match(b, /nieznana akcja incydentu/);
  assert.match(b, /ustalenie y/);
});

test('widoczność z kampanii: bez SIEM-a dzienniki leżą lokalnie, z SIEM-em płyną od razu', () => {
  const bez = sesja();
  assert.strictEqual(bez.wydaneZd.length, 0, 'bez SIEM-a/MDR w kampanii tenant zaczyna pusty');
  LAB.wykonaj(bez, 'soar', { playbook: 'zbierz-dzienniki' });
  assert.ok(dc(bez).some(z => z['event.code'] === '4725' && z['user.name'] === bez.dane.konto), 'po zebraniu widać, kto wyłączał konta');

  const z = sesja(['siem', 'edr', 'ngfw']);
  assert.ok(dc(z).some(e => e['event.code'] === '4725'), 'z SIEM-em blokady są w tenancie od pierwszej minuty');
  assert.ok(z.wydaneZd.some(e => e['event.dataset'] === 'edr.proces'), 'EDR widzi polecenia sprawcy (choć nie alarmuje)');
  assert.ok(z.wydaneZd.some(e => e['event.dataset'] === 'zapora'), 'zapora widzi połączenia na 3389');
  assert.ok(!bez.wydaneZd.some(e => e['event.dataset'] === 'edr.proces'), 'bez EDR nie ma logów procesów');
});

test('dziennik kontrolera domeny wyczyszczony przed zebraniem jest stracony; serwer plików zostaje', () => {
  const L = sesja();
  LAB.wykonaj(L, 'czekaj', { h: 9 });          // po 8 h sprawca czyści dziennik DC
  assert.ok(L.s.logi_usuniete);
  LAB.wykonaj(L, 'soar', { playbook: 'zbierz-dzienniki' });
  assert.ok(!dc(L).some(z => Date.parse(z['@timestamp']) <= L.t0 + L.zebrane.t * 3600000 && z['event.code'] === '4725'), 'wyczyszczone blokady nie mogą wrócić');
  assert.ok(L.wydaneZd.some(z => z['host.name'] === 'UG-FS01' && z['event.code'] === '4663'), 'kasowanie na serwerze plików widać');
  assert.match(LAB.podsumowanie(L).dzienniki, /wyczyszczony/);
});

test('mgła wojny: stan gracza nie zawiera konta ani adresu sprawcy, dopóki ich nie ustali', () => {
  const L = sesja(['siem']);
  const tekst = () => JSON.stringify(LAB.stan(L));
  assert.ok(!tekst().includes(L.dane.konto) && !tekst().includes(L.dane.ip));
  assert.strictEqual(LAB.wykonaj(L, 'ustalenie', { id: 'konto_sprawcy', odpowiedz: `UG-BRZOZOW\\${L.dane.konto.toUpperCase()}` }).zgadza, true, 'domena i wielkość liter nie mają znaczenia');
  assert.ok(tekst().includes(L.dane.konto), 'po ustaleniu konto pojawia się w widoku');
  assert.ok(!tekst().includes(L.dane.ip));
});

test('akcje z playbookiem są tylko w SOAR-ze; playbook na zły cel kosztuje czas i nic nie zmienia', () => {
  const L = sesja(['siem']);
  assert.throws(() => LAB.wykonaj(L, 'akcja', { akcja: 'odbierz_dostep' }), /SOAR/);
  const t = L.s.t;
  const r = LAB.wykonaj(L, 'soar', { playbook: 'wylacz-konto', pola: { konto: 'a.zak' } });
  assert.strictEqual(r.ok, false);
  assert.match(r.tekst, /urzędnika/);
  assert.ok(L.s.t > t && !L.s.dostep_odebrany);
  assert.strictEqual(LAB.wykonaj(L, 'soar', { playbook: 'wylacz-konto', pola: { konto: L.dane.konto } }).ok, true);
  assert.ok(L.s.dostep_odebrany);
  assert.strictEqual(LAB.wykonaj(L, 'akcja', { akcja: 'rozmowa_z_wojtem' }).tekst.length > 0, true, 'decyzje ludzi zostają w grze');
});

test('drabina podpowiedzi: każdy szczebel kosztuje zegar, czwarty podaje odpowiedź i jest tak liczony', () => {
  const L = sesja(['siem']);
  let t = L.s.t;
  for (const [i, min] of LAB.CENY_MIN.entries()) {
    const r = LAB.wykonaj(L, 'podpowiedz', { id: 'adres_zrodlowy' });
    assert.strictEqual(r.szczebel, i + 1);
    assert.ok(Math.abs(L.s.t - t - min / 60) < 1e-9, `szczebel ${i + 1}: ${min} min`);
    t = L.s.t;
  }
  assert.ok(L.ustalenia.adres_zrodlowy.podane);
  assert.throws(() => LAB.wykonaj(L, 'podpowiedz', { id: 'adres_zrodlowy' }), /już ustalone/);
  const zle = LAB.wykonaj(L, 'ustalenie', { id: 'konto_sprawcy', odpowiedz: 'ktos.inny' });
  assert.strictEqual(zle.zgadza, false);
  assert.ok(Math.abs(L.s.t - t - LAB.BLAD_MIN / 60) < 1e-9, 'zła odpowiedź kosztuje');
});

test('próba (konto wyłączone wcześniej): w SIEM-ie tylko nieudane logowania, bez blokad urzędników', () => {
  const L = LAB.nowaSesja({ incydent: 'S07', seed: 5, start: START, tenant: 'g', kontrole: ['siem', 'jml'] });
  assert.ok(L.s.proba);
  assert.ok(L.wydaneZd.some(z => z['event.code'] === '4625' && z['user.name'] === L.dane.konto));
  assert.ok(!L.wydaneZd.some(z => z['event.code'] === '4725' && z['user.name'] === L.dane.konto));
  assert.ok(!LAB.stan(L).ustalenia.some(u => u.id === 'pierwsze_wejscie'), 'w próbie nie ma pytania o wejście sprawcy');
});

test('dokumenty sprawy zależą od kampanii: plan ciągłości i rejestr kopii tylko, gdy istnieją', () => {
  assert.deepStrictEqual(sesja().wydaneDok.map(d => d.id), ['zgloszenie', 'wypowiedzenie', 'formularz_csirt']);
  assert.ok(['plan_ciaglosci', 'rejestr_kopii'].every(id => sesja(['bcp', 'backup']).wydaneDok.some(d => d.id === id)));
  const L = sesja();
  LAB.wykonaj(L, 'soar', { playbook: 'przeglad-kont-uprzywilejowanych' });
  assert.ok(L.wydaneDok.some(d => d.id === 'eksport_kont'), 'wynik playbooka trafia do sprawy jako dokument');
});

test('sesja = parametry + operacje: odtworzenie daje te same zdarzenia, dokumenty i wynik; różne ziarna — różne flagi', () => {
  const L = sesja();
  for (const [op, d] of [['podpowiedz', { id: 'konto_sprawcy' }], ['soar', { playbook: 'zbierz-dzienniki' }], ['ustalenie', { id: 'konto_sprawcy', odpowiedz: 'zle' }],
    ['soar', { playbook: 'wylacz-konto', pola: { konto: L.dane.konto } }], ['akcja', { akcja: 'tryb_papierowy' }], ['koniec', {}]]) LAB.wykonaj(L, op, d);
  const B = LAB.odtworz(L.p, L.ops);
  assert.deepStrictEqual(B.wydaneZd, L.wydaneZd);
  assert.deepStrictEqual(B.wydaneDok, L.wydaneDok);
  assert.deepStrictEqual(LAB.stan(B), LAB.stan(L));
  const inne = [1, 2, 3, 4, 5, 6].map(s => sesja([], s).dane.ip);
  assert.ok(new Set(inne).size >= 4, 'gracze z różnymi ziarnami mają różne odpowiedzi');
});

// ── SERWER HTTP ──
const SEKRETY = { LAB_ADMIN_TOKEN: 'a'.repeat(32), LAB_SIEM_TOKEN: 's'.repeat(32), LAB_SOAR_SECRET: 'x'.repeat(32) };

test('serwer nie wstanie bez sekretów (żadnych wartości domyślnych)', () => {
  assert.throws(() => konfiguracja({}), /LAB_ADMIN_TOKEN/);
  assert.throws(() => konfiguracja({ ...SEKRETY, LAB_SOAR_SECRET: 'krotki' }), /LAB_SOAR_SECRET/);
  assert.throws(() => konfiguracja({ ...SEKRETY, LAB_SIEM_PUSH_URL: 'http://x' }), /LAB_PUSH_SECRET/);
});

test('HTTP: sesja dla tenanta, gra, pobieranie z SIEM-a, podpisany playbook, wypychanie do SIEM-a i SOAR-a', async () => {
  // Udawany SIEM i SOAR właściciela: przyjmują wypychane dane i sprawdzają podpis.
  const odebrane = [];
  const odbiorca = http.createServer((req, res) => {
    let b = ''; req.on('data', x => { b += x; }); req.on('end', () => {
      const ok = req.headers['x-lab-podpis'] === `sha256=${hmac('p'.repeat(32), `${req.headers['x-lab-czas']}.${req.headers['x-lab-sesja']}.${b}`)}`;
      odebrane.push({ url: req.url, ok, b, tenant: req.headers['x-lab-tenant'] }); res.end('ok');
    });
  });
  await new Promise(r => odbiorca.listen(0, '127.0.0.1', r));
  const port = odbiorca.address().port;
  const dane = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-'));
  const c = konfiguracja({ ...SEKRETY, LAB_DANE: dane, LAB_PUSH_SECRET: 'p'.repeat(32),
    LAB_SIEM_PUSH_URL: `http://127.0.0.1:${port}/siem/{tenant}`, LAB_SOAR_PUSH_URL: `http://127.0.0.1:${port}/soar/{tenant}` });
  const { serwer } = utworz(c);
  await new Promise(r => serwer.listen(0, '127.0.0.1', r));
  const baza = `http://127.0.0.1:${serwer.address().port}`;
  const req = (m, p, { token, body, naglowki = {} } = {}) => fetch(baza + p, { method: m, body, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...naglowki } });
  const podpisz = (id, body = '') => { const czas = String(Math.floor(Date.now() / 1000)); return { 'X-Lab-Czas': czas, 'X-Lab-Podpis': `sha256=${hmac(SEKRETY.LAB_SOAR_SECRET, `${czas}.${id}.${body}`)}` }; };
  try {
    assert.strictEqual((await req('POST', '/admin/sesje', { token: 'zly', body: '{}' })).status, 401);
    const nowa = await (await req('POST', '/admin/sesje', { token: SEKRETY.LAB_ADMIN_TOKEN, body: JSON.stringify({ incydent: 'S07', tenant: 'urzad-ala', seed: 3, kontrole: ['siem'] }) })).json();
    assert.match(nowa.sesja, /^[a-f0-9]{16}$/);
    const st = await (await req('GET', '/gra/stan', { token: nowa.token })).json();
    assert.strictEqual(st.incydent.id, 'S07');
    assert.strictEqual((await req('POST', '/gra/akcja', { token: nowa.token, body: JSON.stringify({ akcja: 'odbierz_dostep' }) })).status, 409, 'akcja z playbookiem nie idzie przez grę');

    const siem = await req('GET', `/siem/${nowa.sesja}/zdarzenia?po=0`, { token: SEKRETY.LAB_SIEM_TOKEN });
    const linie = (await siem.text()).trim().split('\n').map(JSON.parse);
    assert.ok(linie.length > 0 && linie.every(z => z['organization.id'] === 'urzad-ala'));
    assert.strictEqual(Number(siem.headers.get('x-lab-nastepny')), linie.length);
    assert.strictEqual((await req('GET', `/siem/${nowa.sesja}/zdarzenia`, { token: 'zly' })).status, 401);

    const konto = linie.find(z => z['event.code'] === '4725')['user.name'];
    const body = JSON.stringify({ playbook: 'wylacz-konto', pola: { konto } });
    assert.strictEqual((await req('POST', `/soar/${nowa.sesja}/playbook`, { body, naglowki: { 'X-Lab-Czas': String(Math.floor(Date.now() / 1000)), 'X-Lab-Podpis': 'sha256=' + '0'.repeat(64) } })).status, 401);
    const h = podpisz(nowa.sesja, body);
    const r = await (await req('POST', `/soar/${nowa.sesja}/playbook`, { body, naglowki: h })).json();
    assert.strictEqual(r.ok, true);
    assert.strictEqual((await req('POST', `/soar/${nowa.sesja}/playbook`, { body, naglowki: h })).status, 409, 'powtórzone wywołanie odrzucone');
    const dok = await (await req('GET', `/soar/${nowa.sesja}/dokumenty`, { naglowki: podpisz(nowa.sesja) })).json();
    assert.ok(dok.dokumenty.some(d => d.id === 'wypowiedzenie'));

    const trener = await (await req('GET', `/admin/sesje/${nowa.sesja}`, { token: SEKRETY.LAB_ADMIN_TOKEN })).json();
    assert.strictEqual(trener.odpowiedzi.konto_sprawcy, konto, 'trener widzi odpowiedzi');
    const gracz = await (await req('GET', '/gra/stan', { token: nowa.token })).json();
    assert.ok(!('odpowiedzi' in gracz));

    // Wypychanie jest asynchroniczne — chwila na kolejkę.
    for (let i = 0; i < 50 && !(odebrane.some(o => o.url === '/siem/urzad-ala') && odebrane.some(o => o.url === '/soar/urzad-ala')); i++) await new Promise(r2 => setTimeout(r2, 20));
    assert.ok(odebrane.some(o => o.url === '/siem/urzad-ala' && o.ok && o.tenant === 'urzad-ala'), 'zdarzenia wypchnięte do SIEM-a tenanta z poprawnym podpisem');
    assert.ok(odebrane.some(o => o.url === '/soar/urzad-ala' && o.ok && JSON.parse(o.b).dokumenty.length), 'dokumenty wypchnięte do SOAR-a');

    // Restart: sesja wraca z dysku w tym samym stanie.
    const { sesje } = utworz(c);
    assert.deepStrictEqual(LAB.stan(sesje.get(nowa.sesja).L), gracz);
  } finally {
    serwer.close(); odbiorca.close();
    fs.rmSync(dane, { recursive: true, force: true });
  }
});
