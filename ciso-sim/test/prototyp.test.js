// Testy prototypu: node --test ciso-sim/test/
// Pierwsze automatyczne testy w tym repo (reszta repo ich nie ma — patrz CLAUDE.md główny).
// Pilnują trzech rzeczy, na których stoi cała gra: deterministyczności, poprawności plików
// scenariuszy i KIERUNKU uczenia się działów (nie konkretnych liczb).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { symuluj, STRATEGIE } = require('../proto/symulacja');
const { waliduj } = require('../proto/rozegraj');
const K = require('../proto/kampania');
const FIRMY = require('../data/firmy');

const cicho = () => {};

test('silnik: migawka Monte Carlo (zmiana danych/silnika = świadoma aktualizacja tych liczb)', () => {
  // Liczby z 13.10.2026 po martwych polach narzędzi (EDR nie widzi insidera itd., docs/17-…, 17.6).
  // Jeśli zmieniasz dane albo model: przelicz, zaktualizuj tu i opisz zmianę w docs/14-….
  const oczekiwane = { nic: [763917676, 4265000], mala_firma: [79765180, 138960625] };
  for (const [s, [straty, wydatki]] of Object.entries(oczekiwane)) {
    let a = 0, b = 0;
    for (let i = 0; i < 200; i++) { const w = symuluj(FIRMY.produkcja, STRATEGIE[s], 1000 + i); a += w.straty; b += w.wydatki; }
    assert.strictEqual(Math.round(a), straty, `${s}: straty`);
    assert.strictEqual(Math.round(b), wydatki, `${s}: wydatki`);
  }
});

test('scenariusze: każdy plik .dane.js przechodzi walidację (najlepsza ścieżka = 100 pkt)', () => {
  const dir = path.join(__dirname, '..', 'scenariusze');
  const pliki = fs.readdirSync(dir).filter(f => f.endsWith('.dane.js'));
  assert.ok(pliki.length >= 2);
  for (const f of pliki) assert.deepStrictEqual(waliduj(require(path.join(dir, f))), [], f);
});

test('kampania: to samo ziarno i te same decyzje dają ten sam wynik', async () => {
  const a = await K.grajAuto('rozsadny', 11, false, cicho, false);
  const b = await K.grajAuto('rozsadny', 11, false, cicho, false);
  assert.strictEqual(a.st.w.straty, b.st.w.straty);
  assert.strictEqual(a.st.w.wydatki, b.st.w.wydatki);
  assert.strictEqual(a.decyzje.length, b.decyzje.length);
});

test('kampania: zapis = lista decyzji; odtworzenie daje identyczny stan', async () => {
  const a = await K.grajAuto('odmawiajacy', 5, false, cicho, false);
  const b = await K.odtworz('wodociagi', 5, a.akcje);
  assert.strictEqual(b.st.w.straty, a.st.w.straty);
  assert.strictEqual(b.st.w.wydatki, a.st.w.wydatki);
  for (const id of Object.keys(a.dzialy)) assert.strictEqual(b.dzialy[id].zaufanie, a.dzialy[id].zaufanie, id);
});

test('działy uczą się: odmowy obniżają zaufanie, bierność rodzi obejścia', async () => {
  const sr = k => Object.values(k.dzialy).reduce((s, d) => s + d.zaufanie, 0) / Object.keys(k.dzialy).length;
  const ukryte = k => Object.values(k.dzialy).reduce((s, d) => s + d.ukryte.filter(u => !u.odkryte).length, 0);
  for (const seed of [1, 2, 3]) {
    const roz = await K.grajAuto('rozsadny', seed, false, cicho, false);
    const odm = await K.grajAuto('odmawiajacy', seed, false, cicho, false);
    const bier = await K.grajAuto('bierny', seed, false, cicho, false);
    assert.ok(sr(odm) < sr(roz), `seed ${seed}: zaufanie po odmowach (${sr(odm)}) < po „tak, ale" (${sr(roz)})`);
    assert.ok(ukryte(bier) > ukryte(roz), `seed ${seed}: obejścia przy bierności > przy aktywnej współpracy`);
  }
});

test('mgła wojny: raporty działów nie zdradzają, kto jest w sieci', async () => {
  const k = await K.grajAuto('bierny', 3, false, cicho, false);
  const tekst = k.raporty.flatMap(r => r.linie).join(' ') + k.raportIT.join(' ');
  // „ransomware" wolno — po zaszyfrowaniu gracz widzi żądanie okupu. Sprawców w trakcie — nie.
  for (const slowo of ['broker', 'apt', 'haktywista', 'intruz']) {
    assert.ok(!new RegExp(`(^|[^\\p{L}])${slowo}`, 'iu').test(tekst), slowo);   // całe słowo, nie „adaptacja"
  }
});

// ── PRZYPADKI BRZEGOWE (docs/17-przypadki-brzegowe.md) ──
// Każdy test tu odpowiada absurdowi, który naprawdę wyszedł w laboratorium (proto/brzegowe.js).
const B = require('../proto/brzegowe');
const S = require('../proto/silnik');

test('dane: kampania i wszystkie firmy przechodzą walidację; firma bez ludzi i zasobów — nie', () => {
  assert.deepStrictEqual(K.walidujKampanie(require('../data/kampanie/wodociagi')), []);
  for (const [id, f] of Object.entries(FIRMY)) assert.deepStrictEqual(S.walidujFirme(f), [], id);
  assert.ok(S.walidujFirme({ ...FIRMY.biuro, pracownicy: 0, zasoby: { stacje: 0, serwery: 0, znane: 0.5 } }).length >= 2);
});

test('niezmienniki trzymają się dla każdej głupiej i cwanej strategii', async () => {
  for (const [nazwa, strat] of Object.entries(B.STRATEGIE)) {
    for (const seed of [1, 2]) {
      strat.reset?.(seed);
      const k = await K.grajAuto(strat, seed, false, cicho, false);
      assert.deepStrictEqual(B.sprawdz(k, nazwa, seed), []);
    }
  }
});

test('„zawsze pierwsza odpowiedź" nie wygrywa (kolejność opcji jest tasowana)', async () => {
  let jd = 0;
  for (const seed of [1, 2, 3]) {
    const k = await K.grajAuto({ karta: () => 0, scen: () => 0 }, seed, false, cicho, false);
    jd += K.jakoscDecyzji(k);
  }
  assert.ok(jd / 3 < 0.7, `jakość decyzji „zawsze a)" = ${(jd / 3).toFixed(2)}`);
});

test('Wynik kampanii porządkuje style sensownie: mądry > potakiwacz > kłamca, kłamca daleko za rozsądnym', async () => {
  const w = {};
  for (const n of ['madry', 'rozsadny', 'potakiwacz', 'klamca']) {
    w[n] = 0;
    for (const seed of [1, 2, 3]) w[n] += (await K.indeksOdpornosci(await K.grajAuto(B.STRATEGIE[n], seed, false, cicho, false))).kampania / 3;
  }
  assert.ok(w.madry > w.potakiwacz && w.potakiwacz > w.klamca, JSON.stringify(w));
  assert.ok(w.rozsadny - w.klamca > 300, `kłamstwo kosztuje za mało: ${JSON.stringify(w)}`);
});

test('kłamstwo nie popłaca: sufit 650 nawet nieujawnione, 450 i mniej po ujawnieniu', async () => {
  for (const seed of [1, 2, 3]) {
    const k = await K.grajAuto(B.STRATEGIE.klamca, seed, false, cicho, false);
    const io = await K.indeksOdpornosci(k);
    assert.ok(k.klamstwa.length > 0, 'kłamca nie skłamał — test nic nie sprawdza');
    const sufit = k.klamstwa.some(l => l.ujawnione) ? 450 : 650;
    assert.ok(io.kampania <= sufit && io.wynik <= sufit, `ziarno ${seed}: ${io.kampania}/${io.wynik} (sufit ${sufit})`);
  }
});

test('ujawnione kłamstwo uderza we współpracę: działy przestają ufać, zarząd tnie mandat', () => {
  const k = K.nowaKampania('wodociagi', 1);
  k.klamstwa.push({ m: 1, tekst: 't', wobec: 'ubezpieczyciel', wykrywalnosc: 1, ujawnione: null });
  const przed = { man: k.wskazniki.mandat, zauf: Object.values(k.dzialy).map(d => d.zaufanie), q: Object.values(k.dzialy).map(d => d.Q.pytaj) };
  K.ujawnij(k, k.klamstwa[0], 'test');
  assert.ok(k.wskazniki.mandat <= przed.man - 15);
  Object.values(k.dzialy).forEach((d, i) => { assert.ok(d.zaufanie < przed.zauf[i] || d.zaufanie === 0); assert.ok(d.Q.pytaj < przed.q[i]); });
});

test('audyt zamykający: po ujawnionym kłamstwie próba rozszerzona (drobne → główne); nieujawnione dokumenty wstecz „pomagają"', () => {
  const k = K.nowaKampania('wodociagi', 1);
  for (const id of ['szbi', 'ryzyko', 'mfa']) k.st.aktywne[id] = 0;
  k.flagi.polityki_z_pudelka = true;                       // SZBI i ład: drobna
  const czysty = K.ocenaKontroli(k);
  assert.ok(czysty.obszary.some(([, x]) => x === 'drobna') && !czysty.rozszerzonaProba);
  k.klamstwa.push({ m: 20, tekst: 'wstecz', wobec: 'audytor', wykrywalnosc: 0, ujawnione: null });
  const ukryte = K.ocenaKontroli(k);                       // nikt nie wykrył: fałszywka „działa"
  assert.ok(ukryte.wynik > czysty.wynik, `${ukryte.wynik} vs ${czysty.wynik}`);
  k.klamstwa[0].wykrywalnosc = 1;
  const wykryte = K.ocenaKontroli(k);
  assert.ok(wykryte.rozszerzonaProba && !wykryte.obszary.some(([, x]) => x === 'drobna'));
  assert.ok(wykryte.wynik < czysty.wynik, `${wykryte.wynik} vs ${czysty.wynik}`);
});

test('uczciwa ankieta bez EDR = brak polisy (prawda ma cenę, więc kłamstwo jest prawdziwym wyborem)', () => {
  const k = K.nowaKampania('wodociagi', 1);
  const c = { id: 'u', zrodlo: 'katalog', tytul: 'Ubezpieczenie', cele: [], opcje: [
    { tekst: 'prawda', zlec: ['ubezpieczenie'], warunkowo: true, ocena: 'dobra', dlaczego: '-' }] };
  k.karty.push(c);
  K.rozstrzygnij(k, 'u', 0);
  assert.ok(!k.st.zamowione.has('ubezpieczenie'));
});

test('odmowa nie kasuje potrzeby: działy czasem robią swoje po cichu', async () => {
  let po = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const k = await K.grajAuto('odmawiajacy', seed, false, cicho, false);
    po += k.rejestr.filter(r => /po odmowie/.test(r.tekst)).length;
  }
  assert.ok(po > 0, 'po odmowach nigdy nie było obejścia');
});

test('ekspozycja widzi to, co zostawiasz: ukryte obejścia podnoszą oczekiwane straty', async () => {
  const k = await K.grajAuto('madry', 1, false, cicho, false);
  const przed = K.ekspozycja(k, 60).pln;
  for (const [w, v] of Object.entries({ insider: 3, uslugi: 3, dostawca: 3 })) k.modStale[w] = v;
  assert.ok(K.ekspozycja(k, 60).pln > przed * 1.3, 'mnożniki ryzyka nie zmieniają ekspozycji');
});

test('martwe pola: EDR nie wykrywa insidera tak jak intruza z phishingu', () => {
  const S = require('../proto/silnik');
  const st0 = () => { const st = S.nowyStan(FIRMY.wodociagi, 5); st.aktywne.edr = -12; st.zamowione.add('edr'); return st; };
  const wykryte = wektor => {
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const st = st0(); st.rnd = S.mulberry32(100 + i);
      st.intruzi.push({ kto: 'kradziez', etap: 'ruch', wektor, od: 1 });
      n += S.zakonczMiesiac(st).filter(z => z.typ === 'wykrycie').length ? 1 : 0;
    }
    return n;
  };
  assert.ok(wykryte('insider') < wykryte('phishing') * 0.7, `insider ${wykryte('insider')} vs phishing ${wykryte('phishing')}`);
});

test('limity: opcja ponad godziny albo budżet jest niedostępna i nic nie zmienia', () => {
  const k = K.nowaKampania('wodociagi', 1);
  k.karty.push({ id: 'test', zrodlo: 'katalog', tytul: 't', cele: [], opcje: [
    { tekst: 'za dużo godzin', h: 1000, ocena: 'dobra', dlaczego: '-' },
    { tekst: 'za drogo', pln: 10000000, ocena: 'dobra', dlaczego: '-' }] });
  const przed = JSON.stringify([k.hKart, k.wydaneRok, k.akcje.length]);
  assert.throws(() => K.rozstrzygnij(k, 'test', 0), /brak godzin/);
  assert.throws(() => K.rozstrzygnij(k, 'test', 1), /brak budżetu/);
  assert.strictEqual(JSON.stringify([k.hKart, k.wydaneRok, k.akcje.length]), przed);
});

test('mgła wojny: sygnały bywają fałszywe, a szacunek zasobów nie jest prawdą', async () => {
  let falszywe = 0;
  for (const seed of [1, 2, 3]) {
    await K.grajAuto({ karta: (c, k) => { if (c.zrodlo === 'sygnal' && !c.intruz) falszywe++; return c.obowiazkowa ? 0 : null; }, scen: () => 0 }, seed, false, cicho, false);
  }
  assert.ok(falszywe > 0, 'karta „sygnał" nie może oznaczać pewnego intruza');
  const bledy = [1, 2, 3, 4].map(s => Math.abs(K.nowaKampania('wodociagi', s).mglaBlad));
  assert.ok(bledy.some(b => b > 0.02), 'środek przedziału nie może być prawdą');
});
