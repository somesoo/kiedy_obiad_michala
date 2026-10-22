// Testy flag (forma CTF, docs/21-…, 21.11): z gry wychodzisz do SIEM-a/SOAR-a i wracasz z flagą.
// Pilnują, że flagi nie da się podrobić ani przepisać od kolegi, że wdrożenie SIEM/SOAR naprawdę
// czeka na konfigurację w zewnętrznym systemie, a incydent z labu wraca do kampanii tym samym wynikiem.

const test = require('node:test');
const assert = require('node:assert');
const K = require('../proto/kampania');
const S = require('../proto/silnik');
const RU = require('../proto/ruchy');
const Z = require('../proto/zewnetrzne');
const LAB = require('../lab/lab');

const KL = Z.kluczePary(), OBCY = Z.kluczePary();
const OPCJE = { zewnetrzne: { tenant: 'ala', klucze: [KL.publiczny] } };
let nr = 0;
const flaga = (z, w = {}, tn = 'ala', kl = KL.prywatny) => Z.podpisz({ tn, z, w, n: `t${++nr}` }, kl);
const ZRODLA = ['ad', 'serwery', 'stacje', 'poczta', 'zapora'];

// Kampania z SIEM-em open source zamówionym od razu (mieści się w budżecie pierwszego roku —
// bez ręcznej podmiany budżetu, bo zapis musi się odtwarzać).
function zSiem(seed = 1) {
  const k = K.nowaKampania('wodociagi', seed, OPCJE);
  RU.wykonaj(k, 'wdroz:siem_os');
  for (let i = 0; i < 12 && k.obiekty.siem_os.stan === 'projekt'; i++) K.zamknijMiesiac(k);
  return k;
}

test('flaga: podróbka, obcy klucz, cudzy tenant, powtórka i nieznane zadanie są odrzucane z powodem', () => {
  const k = K.nowaKampania('wodociagi', 1, OPCJE);
  assert.match(Z.sprawdzKod(k, 'LO{abc.def}'), /nie zgadza/);
  assert.match(Z.sprawdzKod(k, 'flaga'), /to nie jest flaga/);
  assert.match(Z.sprawdzKod(k, flaga('siem.zrodla', {}, 'ala', OBCY.prywatny)), /nie zgadza/);
  assert.match(Z.sprawdzKod(k, flaga('siem.zrodla', {}, 'bob')), /innego tenanta/);
  assert.match(Z.sprawdzKod(k, flaga('siem.nic')), /nie zna/);
  // Zmiana ładunku (np. dopisanie źródeł) psuje podpis.
  const f = flaga('siem.zrodla', { zrodla: ['ad'] });
  const [, l, p] = /^LO\{(.+)\.(.+)\}$/.exec(f);
  const zmieniony = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(l, 'base64url')), w: { zrodla: ZRODLA } })).toString('base64url');
  assert.match(Z.sprawdzKod(k, `LO{${zmieniony}.${p}}`), /nie zgadza/);
  K.flaga(k, f);
  assert.throws(() => K.flaga(k, f), /już użyta/);
  // W zwykłej grze nie ma ani ruchu, ani bramki.
  const zwykla = K.nowaKampania('wodociagi', 1);
  assert.ok(!RU.lista(zwykla).some(r => r.id === 'flaga'));
});

test('wdrożenie SIEM w grze z systemem: po projekcie czeka na flagi; jakość z tego, co podłączono', () => {
  const k = zSiem();
  assert.strictEqual(k.obiekty.siem_os.stan, 'konfiguracja');
  assert.ok(!S.dziala(k.st, 'siem_os'), 'bez flag SIEM nie działa, choć projekt się skończył');
  assert.ok(k.raportIT.some(x => /czeka na konfigurację/.test(x)));
  assert.match(RU.dostepny(k, 'wdroz:siem_os'), /flagę/);
  assert.match(K.flaga(k, flaga('siem_os.zrodla', { zrodla: ['ad'] })), /Do zrobienia jeszcze/);
  assert.match(K.flaga(k, flaga('siem_os.reguly', { reguly: ['a', 'b', 'c'] })), /działa od teraz/);
  assert.ok(S.dziala(k.st, 'siem_os'));
  const malo = k.obiekty.siem_os.jakoscBazowa;
  K.flaga(k, flaga('siem_os.zrodla', { zrodla: ZRODLA }));
  assert.ok(k.obiekty.siem_os.jakoscBazowa > malo * 1.4, 'więcej źródeł = lepszy SIEM');
  assert.deepStrictEqual(Z.zrodlaSiem(k).sort(), [...ZRODLA].sort());
  // Bez systemu ten sam przebieg kończy się działającym SIEM-em (gra jak dotąd).
  const zwykla = K.nowaKampania('wodociagi', 1);
  RU.wykonaj(zwykla, 'wdroz:siem_os');
  for (let i = 0; i < 12 && zwykla.obiekty.siem_os.stan === 'projekt'; i++) K.zamknijMiesiac(zwykla);
  assert.strictEqual(zwykla.obiekty.siem_os.stan, 'dziala');
});

test('flagi wdrożenia są w zapisie: odtworzenie daje ten sam stan', async () => {
  const k = zSiem();
  K.flaga(k, flaga('siem_os.zrodla', { zrodla: ['ad', 'serwery'] }));
  K.flaga(k, flaga('siem_os.reguly', { reguly: ['x'] }));
  const b = await K.odtworz('wodociagi', 1, k.akcje, OPCJE);
  assert.strictEqual(b.obiekty.siem_os.stan, 'dziala');
  assert.strictEqual(b.obiekty.siem_os.jakoscBazowa, k.obiekty.siem_os.jakoscBazowa);
});

// Gmina do miesiąca, w którym wypada S07 (w grze z systemem incydent czeka na lab).
function doS07(seed = 2) {
  const k = K.nowaKampania('gmina', seed, OPCJE);
  for (let i = 0; i < 30 && !k.zdarzenia.some(z => z.typ === 'incydent' && z.id === 'S07' && !z.zagrane); i++) K.zamknijMiesiac(k);
  assert.ok(k.zdarzenia.some(z => z.id === 'S07' && !z.zagrane), 'S07 nie wypadł');
  return k;
}

test('incydent z wersją labową: w terminalu się nie da; lab z zapisu → flaga wyniku → ten sam wynik w kampanii', async () => {
  const k = doS07();
  assert.throws(() => K.rozpocznijIncydent(k, 'S07'), /SIEM-ie i SOAR-ze/);
  const zapis = JSON.parse(JSON.stringify({ kampania: 'gmina', seed: 2, akcje: k.akcje, opcje: OPCJE }));
  const L = LAB.nowaSesja({ incydent: 'S07', tenant: 'ala', seed: 2, start: '2026-11-16T06:40:00Z', zapis });
  assert.strictEqual(LAB.flagaWyniku(L, KL.prywatny), null, 'flaga dopiero po końcu fazy ostrej');
  LAB.wykonaj(L, 'soar', { playbook: 'zbierz-dzienniki' });
  LAB.wykonaj(L, 'soar', { playbook: 'wylacz-konto', pola: { konto: L.dane.konto } });
  LAB.wykonaj(L, 'akcja', { akcja: 'rozmowa_z_wojtem' });
  LAB.wykonaj(L, 'koniec', {});
  const f = LAB.flagaWyniku(L, KL.prywatny);
  assert.strictEqual(LAB.flagaWyniku(L, KL.prywatny), f, 'ta sama sesja = ta sama flaga');

  // Flaga na innym stanie (gracz w międzyczasie coś zrobił) nie przejdzie.
  const inny = doS07();
  RU.wykonaj(inny, 'rozmowa', { dzial: 'kadry' });
  assert.throws(() => K.flaga(inny, f), /innego stanu/);

  const w = K.flaga(k, f);
  assert.match(w, new RegExp(L.wynik.tytul));
  assert.ok(k.zdarzenia.find(z => z.id === 'S07').zagrane);
  assert.deepStrictEqual(k.ocenyIncydentow.filter(o => o.id.startsWith('S07')).map(o => o.wynik), L.wynik.oceny.map(o => o.wynik));
  assert.throws(() => K.flaga(k, f), /już użyta|nie trwa/);
  const b = await K.odtworz('gmina', 2, k.akcje, OPCJE);
  assert.deepStrictEqual(b.wskazniki, k.wskazniki);
  assert.strictEqual(b.st.w.straty, k.st.w.straty);
});

test('lab z zapisu: logi w SIEM-ie są tylko ze źródeł, które gracz podłączył (flagi SIEM-a)', () => {
  const k = K.nowaKampania('gmina', 2, OPCJE);
  RU.zainstalujGotowe(k, 'siem');                // SIEM działa, ale bez potwierdzonych źródeł…
  k.obiekty.siem.stan = 'dziala';
  k.zewn.wyniki.siem = { zrodla: { zrodla: ['serwery'] }, reguly: { reguly: [] } };   // …albo tylko z serwerami
  const L = { zrodla: Z.zrodlaSiem(k) };
  const w = LAB.wczytajLab('S07').widocznosc({ dziala: id => S.dziala(k.st, id) }, L.zrodla);
  assert.strictEqual(w.rdp, 'siem');
  assert.strictEqual(w.dc, 'lokalnie', 'kontroler domeny niepodłączony — blokad kont nie ma w SIEM-ie, choć SIEM działa');
});

test('przebieg dla generatora: zdarzenia świata gry zależne od decyzji, bez przyszłości', () => {
  const L = LAB.nowaSesja({ incydent: 'S07', tenant: 'g', seed: 3, start: '2026-11-16T06:40:00Z' });
  const co = () => LAB.przebieg(L).map(e => e.co);
  assert.ok(co().includes('masowe_wylaczenie_kont') && !co().includes('usuniecie_danych'), 'kasowanie jeszcze się nie stało');
  LAB.wykonaj(L, 'czekaj', { h: 5 });
  assert.ok(co().includes('usuniecie_danych'), 'po 4 h bez odebrania dostępu sprawca kasuje udziały');
  const sc = LAB.scenariusz(L);
  assert.strictEqual(sc.dane.konto, L.dane.konto, 'generator dostaje te same dane, które sprawdza gra');
  assert.ok(LAB.przebieg(L).every(e => e.czas && e.id));
});

test('serwer: sesja z zapisu gracza → flaga wyniku w stanie gry; generator dostaje scenariusz i przebieg', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { konfiguracja, utworz } = require('../lab/serwer');
  const dane = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-'));
  fs.writeFileSync(path.join(dane, 'flagi.pem'), KL.prywatny);
  const SEK = { LAB_ADMIN_TOKEN: 'a'.repeat(32), LAB_SIEM_TOKEN: 's'.repeat(32), LAB_SOAR_SECRET: 'x'.repeat(32), LAB_GEN_TOKEN: 'g'.repeat(32) };
  const { serwer } = utworz(konfiguracja({ ...SEK, LAB_DANE: path.join(dane, 'sesje'), LAB_KLUCZ_PRYWATNY: path.join(dane, 'flagi.pem') }));
  await new Promise(r => serwer.listen(0, '127.0.0.1', r));
  const baza = `http://127.0.0.1:${serwer.address().port}`;
  const req = (m, p, token, body) => fetch(baza + p, { method: m, body: body && JSON.stringify(body), headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async r => ({ status: r.status, x: await r.json() }));
  try {
    const k = doS07();
    const zapis = { kampania: 'gmina', seed: 2, akcje: k.akcje, opcje: OPCJE };
    assert.strictEqual((await req('POST', '/admin/sesje', SEK.LAB_ADMIN_TOKEN, { incydent: 'S07', tenant: 'bob', zapis })).status, 400, 'tenant musi być z zapisu');
    const s = (await req('POST', '/admin/sesje', SEK.LAB_ADMIN_TOKEN, { incydent: 'S07', zapis })).x;
    assert.strictEqual(s.tenant, 'ala');
    const sc = await req('GET', `/generator/${s.sesja}/scenariusz`, SEK.LAB_GEN_TOKEN);
    assert.strictEqual(sc.status, 200);
    assert.ok(sc.x.dane.konto && sc.x.hosty.kontroler_domeny);
    assert.strictEqual((await req('GET', `/generator/${s.sesja}/przebieg`, 'zly')).status, 401);
    await req('POST', '/gra/akcja', s.token, { akcja: 'rozmowa_z_wojtem' });
    const kon = (await req('POST', '/gra/koniec', s.token, {})).x;
    assert.match(kon.stan.koniec.flaga, /^LO\{/);
    const pb = (await req('GET', `/generator/${s.sesja}/przebieg?po=0`, SEK.LAB_GEN_TOKEN)).x;
    assert.ok(pb.koniec && pb.przebieg.some(e => e.co === 'masowe_wylaczenie_kont'));
    // Gracz wraca do kampanii z flagą.
    assert.match(K.flaga(k, kon.stan.koniec.flaga), /Wynik z labu/);
  } finally {
    serwer.close();
    fs.rmSync(dane, { recursive: true, force: true });
  }
});
