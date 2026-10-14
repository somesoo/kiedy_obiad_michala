// Testy prototypu: node --test ciso-sim/test/
// Pierwsze automatyczne testy w tym repo (reszta repo ich nie ma — patrz CLAUDE.md główny).
// Pilnują tego, na czym stoi gra (docs/18-silnik-ruchow.md): deterministyczności i zapisu,
// pełnej dowolności ruchów (żaden ruch nie wysypuje modelu, nigdzie nie ma „ocen opcji"),
// zależności między ruchami (przygotowanie zmienia incydent, kolejność akcji ma znaczenie,
// cykl życia kontroli działa) i KIERUNKU wyników (nie konkretnych liczb).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { symuluj, STRATEGIE } = require('../proto/symulacja');
const K = require('../proto/kampania');
const S = require('../proto/silnik');
const RU = require('../proto/ruchy');
const SP = require('../proto/sprawy');
const I = require('../proto/incydent');
const B = require('../proto/brzegowe');
const FIRMY = require('../data/firmy');
const INICJATYWY = require('../data/dzialy');
const RUCHY = require('../data/ruchy');

const cicho = () => {};
const graj = (strat, seed) => K.grajAuto(typeof strat === 'string' && B.STRATEGIE[strat] ? B.STRATEGIE[strat] : strat, seed, false, cicho, false);
const nowa = (seed = 1) => K.nowaKampania('wodociagi', seed);
// Zamyka miesiące, aż warunek się spełni (z bezpiecznikiem — inaczej test wisi zamiast pęknąć).
const dopoki = (k, war, max = 8) => { for (let i = 0; i < max && !war(); i++) K.zamknijMiesiac(k); return war(); };

// ── SILNIK I DANE ──

test('silnik: migawka Monte Carlo (zmiana danych/silnika = świadoma aktualizacja tych liczb)', () => {
  // Liczby z 13.10.2026 po martwych polach narzędzi (EDR nie widzi insidera itd., docs/17-…, 17.6).
  // Konfiguracja kontroli (st.konf) jest pusta w symulacji, więc silnik ruchów ich nie zmienia.
  // Jeśli zmieniasz dane albo model: przelicz, zaktualizuj tu i opisz zmianę w docs/14-….
  const oczekiwane = { nic: [763917676, 4265000], mala_firma: [79765180, 138960625] };
  for (const [s, [straty, wydatki]] of Object.entries(oczekiwane)) {
    let a = 0, b = 0;
    for (let i = 0; i < 200; i++) { const w = symuluj(FIRMY.produkcja, STRATEGIE[s], 1000 + i); a += w.straty; b += w.wydatki; }
    assert.strictEqual(Math.round(a), straty, `${s}: straty`);
    assert.strictEqual(Math.round(b), wydatki, `${s}: wydatki`);
  }
});

test('dane: kampania i wszystkie firmy przechodzą walidację; firma bez ludzi i zasobów — nie', () => {
  assert.deepStrictEqual(K.walidujKampanie(require('../data/kampanie/wodociagi')), []);
  for (const [id, f] of Object.entries(FIRMY)) assert.deepStrictEqual(S.walidujFirme(f), [], id);
  assert.ok(S.walidujFirme({ ...FIRMY.biuro, pracownicy: 0, zasoby: { stacje: 0, serwery: 0, znane: 0.5 } }).length >= 2);
});

test('incydenty: każdy plik .incydent.js przechodzi walidację (min. 4 akcje, zasady, debrief)', () => {
  const dir = path.join(__dirname, '..', 'scenariusze');
  const pliki = fs.readdirSync(dir).filter(f => f.endsWith('.incydent.js'));
  assert.ok(pliki.length >= 2);
  for (const f of pliki) assert.deepStrictEqual(I.waliduj(require(path.join(dir, f))), [], f);
  // Walidator naprawdę pilnuje „bez quizu": akcja z oceną nie przechodzi.
  const zly = { ...require(path.join(dir, pliki[0])) };
  zly.akcje = { ...zly.akcje, x: { nazwa: 'x', czas_h: 1, efekt: () => '', ocena: 'dobra' } };
  assert.ok(I.waliduj(zly).some(b => /nie mają ocen/.test(b)));
});

test('to nie quiz: nigdzie w ruchach, sprawach ani akcjach incydentów nie ma ocen ani punktów', () => {
  const kamp = require('../data/kampanie/wodociagi');
  for (const [id, r] of Object.entries(RUCHY)) assert.ok(!('ocena' in r) && !('pkt' in r), `ruch ${id}`);
  for (const [sid, s] of Object.entries(kamp.sprawy)) {
    for (const [v, c] of Object.entries(s.czasowniki)) assert.ok(!('ocena' in c) && !('pkt' in c), `${sid}.${v}`);
  }
  for (const id of ['S01', 'S03']) for (const [aid, a] of Object.entries(I.wczytaj(id).akcje)) assert.ok(!('ocena' in a), `${id}.${aid}`);
});

// ── ZAPIS I DETERMINIZM ──

test('kampania: to samo ziarno i te same ruchy dają ten sam wynik', async () => {
  const a = await graj('rozsadny', 11);
  const b = await graj('rozsadny', 11);
  assert.strictEqual(a.st.w.straty, b.st.w.straty);
  assert.strictEqual(a.st.w.wydatki, b.st.w.wydatki);
  assert.deepStrictEqual(a.akcje, b.akcje);
});

test('zapis = lista akcji; odtworzenie fuzzera (losowe ruchy, sprawy, incydenty) daje identyczny stan', async () => {
  for (const seed of [3, 7]) {
    const a = await graj('losowy', seed);
    assert.ok(a.akcje.some(x => x.t === 'inc') && a.akcje.some(x => x.t === 'sprawa') && a.akcje.some(x => x.t === 'ruch'), 'fuzzer nie przećwiczył wszystkich rodzajów akcji');
    const b = await K.odtworz('wodociagi', seed, a.akcje);
    assert.strictEqual(b.st.w.straty, a.st.w.straty);
    assert.strictEqual(b.st.w.wydatki, a.st.w.wydatki);
    assert.deepStrictEqual(b.wskazniki, a.wskazniki);
    assert.deepStrictEqual(b.st.konf, a.st.konf);
    for (const id of Object.keys(a.dzialy)) assert.strictEqual(b.dzialy[id].zaufanie, a.dzialy[id].zaufanie, id);
  }
});

// ── DOWOLNOŚĆ RUCHÓW ──

test('każdy ruch, który lista pokazuje jako dostępny, da się wykonać na świeżej kampanii', () => {
  const k0 = nowa(2);
  const dostepne = RU.lista(k0).filter(r => !r.powod);
  assert.ok(dostepne.length >= 25, `za mało dostępnych ruchów na starcie: ${dostepne.length}`);
  for (const r of dostepne) {
    const k = nowa(2);
    // Przykładowe parametry jak w liście: pierwsza wartość każdego parametru (ruchy z data/ruchy.js).
    const p = r.id.includes(':') ? {} : Object.fromEntries(Object.entries(r.param).map(([n, w]) => [n, w[0]]));
    assert.doesNotThrow(() => RU.wykonaj(k, r.id, p), r.id);
    assert.deepStrictEqual(k.akcje.at(-1), { t: 'ruch', id: r.id, p }, `${r.id}: akcja nie trafiła do zapisu`);
  }
});

test('limity: ruch ponad godziny albo budżet jest niedostępny, mówi dlaczego i nic nie zmienia', () => {
  const k = nowa();
  k.hKart = 1000;
  assert.match(RU.dostepny(k, 'wdroz:mfa'), /brak godzin/);
  k.hKart = 0; k.budzet[k.rok] = 0;
  assert.match(RU.dostepny(k, 'wdroz:edr'), /brak budżetu/);
  const przed = JSON.stringify([k.hKart, k.wydaneRok, k.akcje.length, Object.keys(k.obiekty)]);
  assert.throws(() => RU.wykonaj(k, 'wdroz:edr'), /brak budżetu/);
  assert.strictEqual(JSON.stringify([k.hKart, k.wydaneRok, k.akcje.length, Object.keys(k.obiekty)]), przed);
});

// ── CYKL ŻYCIA KONTROLI ──

test('cykl życia: wdrożenie → działa; test odsłania usterkę, naprawa przywraca skuteczność', () => {
  const k = nowa();
  RU.wykonaj(k, 'wdroz:mfa', { zakres: 'wszyscy', metoda: 'numer' });
  assert.strictEqual(k.obiekty.mfa.stan, 'projekt');
  assert.ok(!S.dziala(k.st, 'mfa'), 'zlecone ≠ działa');
  assert.ok(dopoki(k, () => k.obiekty.mfa.stan === 'dziala'), 'MFA nie weszło w kilka miesięcy');
  assert.ok(S.dziala(k.st, 'mfa') && k.st.konf.mfa);

  // Kopia „robi się", ale nie odtwarza — skuteczność spada; test to widzi, naprawa przywraca.
  const k2 = nowa();
  const o = RU.zainstalujGotowe(k2, 'backup', { zakres: 'biuro_ot', nosnik: 'offline' });
  const dobra = RU.skutecznosc(k2, 'backup');
  o.usterki.push({ id: 'nie_odtwarza', opis: 'kopia nie odtwarza', skutek: { odtwarzanie: 0.3 }, przeglad: 0, test: 1, naprawa_h: 8, odkryta: false, naprawiona: false });
  RU.przeliczKonf(k2, 'backup');
  assert.ok(RU.skutecznosc(k2, 'backup') < dobra * 0.5, 'ukryta usterka nie obniża skuteczności');
  assert.match(RU.dostepny(k2, 'napraw:backup', { usterka: 'nie_odtwarza' }), /brak znanych usterek/);   // nie naprawisz, czego nie znasz
  RU.wykonaj(k2, 'test:backup');
  assert.ok(o.usterki[0].odkryta);
  RU.wykonaj(k2, 'napraw:backup', { usterka: 'nie_odtwarza' });
  assert.strictEqual(RU.skutecznosc(k2, 'backup'), dobra);
});

test('wycofanie: skutek znika od razu, abonament płacimy jeszcze miesiąc; potem można wdrożyć ponownie', () => {
  const k = nowa();
  RU.zainstalujGotowe(k, 'edr');
  RU.wykonaj(k, 'wycofaj:edr');
  assert.ok(!S.dziala(k.st, 'edr') && !k.st.konf.edr, 'wycofana kontrola dalej działa');
  assert.ok(k.st.zamowione.has('edr'), 'okres wypowiedzenia: abonament jeszcze leci');
  K.zamknijMiesiac(k); K.zamknijMiesiac(k);
  assert.ok(!k.st.zamowione.has('edr'), 'abonament po wypowiedzeniu dalej naliczany');
  assert.strictEqual(RU.dostepny(k, 'wdroz:edr'), null);
});

test('OT: pilotaż odsłania niezgodność; rozszerzenie na OT bez niego = awaria; powrót z OT ją kończy', () => {
  let seed = 1;
  while (!nowa(seed).otNiezgodne.edr) seed++;
  const k = nowa(seed);
  RU.zainstalujGotowe(k, 'edr', { zakres: 'biuro_serwery' });
  const straty = k.st.w.straty;
  RU.wykonaj(k, 'zmien:edr', { zakres: 'z_ot' });
  assert.ok(k.st.w.straty > straty, 'brak awarii przy niezgodnym agencie na OT');
  assert.ok(k.obiekty.edr.usterki.some(u => u.id === 'niezgodnosc_ot' && !u.naprawiona));
  assert.ok(k.historia.some(h => h.t === 'ot_zmiana' && h.id === 'edr' && !h.pilot), 'zmiana OT bez pilotażu niezapisana (zasada jej nie oceni)');
  RU.wykonaj(k, 'zmien:edr', { zakres: 'biuro_serwery' });
  assert.ok(k.obiekty.edr.usterki.every(u => u.id !== 'niezgodnosc_ot' || u.naprawiona));

  const k2 = nowa(seed);
  assert.match(RU.wykonaj(k2, 'pilotaz:edr'), /zawieszać/);
  assert.strictEqual(k2.st.w.straty, 0, 'pilotaż ma być bezpieczny');
});

// ── SPRAWY I WARUNKI ──

test('warunki „tak, ale" składają się: resztka ryzyka na wektor maleje, zadowolenie działu też; warunek z MFA wymaga MFA', () => {
  const k = nowa();
  const ini = INICJATYWY.konto_wspolne;
  const jeden = SP.policzWarunki(k, ini, 'imienne');
  const dwa = SP.policzWarunki(k, ini, 'imienne,wygasanie');
  assert.ok(dwa.ulamki.insider < jeden.ulamki.insider, 'drugi warunek nie tnie ryzyka');
  assert.ok(dwa.nagroda < jeden.nagroda, 'każdy warunek kosztuje zadowolenie działu');
  assert.throws(() => SP.policzWarunki(k, ini, 'mfa'), /wymaga/);
  const s = SP.dodajProsbe(k, { dzial: 'kadry', ini: 'konto_wspolne' });
  assert.match(SP.dostepnyCzasownik(k, s, 'warunki', { warunki: 'mfa' }), /wymaga/);
  RU.zainstalujGotowe(k, 'mfa');
  assert.strictEqual(SP.dostepnyCzasownik(k, s, 'warunki', { warunki: 'imienne,mfa' }), null);
});

test('ankieta ubezpieczyciela: uczciwe „nie" = brak polisy; „tak" wbrew prawdzie = polisa i kłamstwo w rejestrze', () => {
  const k = nowa();
  const s = SP.dodajScenariuszowa(k, 'S_ubezpieczenie');
  SP.odpowiedz(k, s.id, 'ankieta', { mfa: 'nie', edr: 'nie', kopie: 'nie' });
  assert.ok(!k.st.zamowione.has('ubezpieczenie') && !k.klamstwa.length);

  const k2 = nowa();
  const s2 = SP.dodajScenariuszowa(k2, 'S_ubezpieczenie');
  SP.odpowiedz(k2, s2.id, 'ankieta', { mfa: 'tak', edr: 'tak', kopie: 'tak' });
  assert.ok(k2.st.zamowione.has('ubezpieczenie'), 'kłamstwo musi coś dawać — inaczej nie jest pokusą');
  assert.strictEqual(k2.klamstwa.length, 1);
  assert.strictEqual(k2.klamstwa[0].wobec, 'ubezpieczyciel');
});

test('odmowa nie kasuje potrzeby: działy czasem robią swoje po cichu', async () => {
  let po = 0;
  for (const seed of [1, 2, 3, 4, 5]) po += (await graj('odmawiajacy', seed)).rejestr.filter(r => /po odmowie/.test(r.tekst)).length;
  assert.ok(po > 0, 'po odmowach nigdy nie było obejścia');
});

test('działy uczą się: odmowy obniżają zaufanie, bierność rodzi obejścia', async () => {
  const sr = k => Object.values(k.dzialy).reduce((s, d) => s + d.zaufanie, 0) / Object.keys(k.dzialy).length;
  const ukryte = k => Object.values(k.dzialy).reduce((s, d) => s + d.ukryte.filter(u => !u.odkryte).length, 0);
  for (const seed of [1, 2, 3]) {
    const mad = await graj('madry', seed);
    const odm = await graj('odmawiajacy', seed);
    const bier = await graj('bierny', seed);
    assert.ok(sr(odm) < sr(mad), `seed ${seed}: zaufanie po odmowach (${sr(odm)}) < przy „tak, ale" (${sr(mad)})`);
    assert.ok(ukryte(bier) > ukryte(mad), `seed ${seed}: obejścia przy bierności > przy aktywnej współpracy`);
  }
});

// ── INCYDENTY BEZ DRZEWA ──

test('incydent S01: kolejność akcji ma znaczenie (bank od razu > bank po zebraniu > bank po mailu do sprawcy)', () => {
  const odzysk = plan => {
    const k = nowa();
    I.rozpocznij(k, 'S01');
    assert.ok(!k.incydent.s.udaremnione);
    for (const a of plan) I.wykonaj(k, a);
    return k.incydent.s.odzysk;
  };
  const odRazu = odzysk(['bank']), poZebraniu = odzysk(['zebranie', 'bank']), poMailu = odzysk(['mail_kontrahent', 'bank']);
  assert.ok(odRazu > poZebraniu, `${odRazu} vs ${poZebraniu}`);
  assert.ok(odRazu > poMailu * 2, `mail do przejętej skrzynki ostrzega sprawcę: ${odRazu} vs ${poMailu}`);
});

test('incydent: przygotowanie zmienia start (procedura płatności udaremnia S01, zamknięty panel HMI = tylko próba w S03)', () => {
  const k = nowa();
  RU.zainstalujGotowe(k, 'weryfikacja_platnosci');
  I.rozpocznij(k, 'S01');
  assert.ok(k.incydent.s.udaremnione);

  const k2 = nowa();
  assert.ok(k2.fakty.hmi_wystawiony.prawda);
  I.rozpocznij(k2, 'S03');
  assert.ok(!k2.incydent.s.proba, 'otwarty panel → prawdziwy atak');
  const k3 = nowa();
  k3.fakty.hmi_wystawiony.naprawiony = true;
  I.rozpocznij(k3, 'S03');
  assert.ok(k3.incydent.s.proba, 'zamknięty panel → tylko próba w logach');
});

test('incydent: bezczynność nie zalicza zasad „nie rób X", czas płynie także w czekaniu', () => {
  const k = nowa();
  I.rozpocznij(k, 'S01');
  I.czekaj(k, 5);
  assert.strictEqual(k.incydent.s.t, 5);
  const w = I.zakoncz(k, true);
  assert.ok(!w.oceny.some(o => o.wynik === 'spelniona'), `bezczynność zaliczyła: ${w.oceny.filter(o => o.wynik === 'spelniona').map(o => o.id)}`);
});

// ── OCENA: KIERUNEK WYNIKÓW ──

test('Wynik kampanii porządkuje style sensownie: mądry > rozsądny > bierny; mądry > potakiwacz > kłamca', async () => {
  const w = {};
  for (const n of ['madry', 'rozsadny', 'potakiwacz', 'klamca', 'bierny']) {
    w[n] = 0;
    for (const seed of [1, 2, 3]) w[n] += (await K.indeksOdpornosci(await graj(n === 'bierny' ? K.AUTO.bierny : n, seed))).kampania / 3;
  }
  assert.ok(w.madry > w.rozsadny && w.rozsadny > w.bierny, JSON.stringify(w));
  assert.ok(w.madry > w.potakiwacz && w.potakiwacz > w.klamca, JSON.stringify(w));
});

test('bierność nie jest cnotą: kto nic nie robi, ma praktykę bliską zera', async () => {
  for (const seed of [1, 2]) {
    const io = await K.indeksOdpornosci(await graj(K.AUTO.bierny, seed));
    assert.ok(io.jd < 0.2, `ziarno ${seed}: praktyka biernego ${io.jd}`);
  }
});

test('kłamstwo nie popłaca: sufit 650 nawet nieujawnione, 450 i mniej po ujawnieniu', async () => {
  for (const seed of [1, 2, 3]) {
    const k = await graj('klamca', seed);
    const io = await K.indeksOdpornosci(k);
    assert.ok(k.klamstwa.length > 0, 'kłamca nie skłamał — test nic nie sprawdza');
    const sufit = k.klamstwa.some(l => l.ujawnione) ? 450 : 650;
    assert.ok(io.kampania <= sufit && io.wynik <= sufit, `ziarno ${seed}: ${io.kampania}/${io.wynik} (sufit ${sufit})`);
  }
});

test('ujawnione kłamstwo uderza we współpracę: działy przestają ufać, zarząd tnie mandat', () => {
  const k = nowa();
  k.klamstwa.push({ m: 1, tekst: 't', wobec: 'ubezpieczyciel', wykrywalnosc: 1, ujawnione: null });
  const przed = { man: k.wskazniki.mandat, zauf: Object.values(k.dzialy).map(d => d.zaufanie), q: Object.values(k.dzialy).map(d => d.Q.pytaj) };
  K.ujawnij(k, k.klamstwa[0], 'test');
  assert.ok(k.wskazniki.mandat <= przed.man - 15);
  Object.values(k.dzialy).forEach((d, i) => { assert.ok(d.zaufanie < przed.zauf[i] || d.zaufanie === 0); assert.ok(d.Q.pytaj < przed.q[i]); });
});

test('audyt zamykający: dowody, próbki usterek, rozszerzona próba po kłamstwie, plan naprawczy', () => {
  const przygotuj = () => {
    const k = nowa();
    RU.zainstalujGotowe(k, 'szbi', { sposob: 'z_pudelka' });    // SZBI i ład: drobna
    RU.zainstalujGotowe(k, 'ryzyko');
    RU.zainstalujGotowe(k, 'mfa', { zakres: 'wszyscy' });
    return k;
  };
  const czysty = K.ocenaKontroli(przygotuj());
  assert.ok(czysty.obszary.some(([, x]) => x === 'drobna') && !czysty.rozszerzonaProba);

  const k = przygotuj();
  k.klamstwa.push({ m: 20, tekst: 'wstecz', wobec: 'audytor', wykrywalnosc: 0, ujawnione: null });
  assert.ok(K.ocenaKontroli(k).wynik > czysty.wynik, 'niewykryte dokumenty wstecz „pomagają" (stąd sufit w BRAMKI)');

  const k2 = przygotuj();
  k2.klamstwa.push({ m: 20, tekst: 'wstecz', wobec: 'audytor', wykrywalnosc: 1, ujawnione: null });
  const wykryte = K.ocenaKontroli(k2);
  assert.ok(wykryte.rozszerzonaProba && !wykryte.obszary.some(([, x]) => x === 'drobna'));
  assert.ok(wykryte.wynik < czysty.wynik, `${wykryte.wynik} vs ${czysty.wynik}`);

  const k3 = przygotuj();
  k3.flagi.plan_naprawczy = 20;
  assert.strictEqual(K.ocenaKontroli(k3).wynik, czysty.wynik + 6, 'plan naprawczy: dwie główne niezgodności → drobne');

  // Znana, nienaprawiona usterka wychodzi w próbce zawsze; zaakceptowana przez zarząd — nie.
  const k4 = przygotuj();
  k4.obiekty.mfa.usterki.push({ id: 'stare_protokoly', opis: 'stare protokoły', odkryta: true, naprawiona: false });
  const zUsterka = K.ocenaKontroli(k4);
  assert.ok(zUsterka.proba.length === 1 && zUsterka.wynik < czysty.wynik);
  const k5 = przygotuj();
  k5.obiekty.mfa.usterki.push({ id: 'stare_protokoly', opis: 'stare protokoły', odkryta: true, naprawiona: false });
  k5.akceptacje['usterka:mfa:stare_protokoly'] = 20;
  assert.strictEqual(K.ocenaKontroli(k5).proba.length, 0);
});

test('ekspozycja widzi to, co zostawiasz: ukryte obejścia podnoszą oczekiwane straty', async () => {
  const k = await graj('madry', 1);
  const przed = K.ekspozycja(k, 60).pln;
  for (const [w, v] of Object.entries({ insider: 3, uslugi: 3, dostawca: 3 })) k.modStale[w] = v;
  assert.ok(K.ekspozycja(k, 60).pln > przed * 1.3, 'mnożniki ryzyka nie zmieniają ekspozycji');
});

test('martwe pola: EDR nie wykrywa insidera tak jak intruza z phishingu', () => {
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

// ── NIEZMIENNIKI I MGŁA WOJNY ──

test('niezmienniki trzymają się dla każdej głupiej, cwanej i losowej strategii', async () => {
  for (const [nazwa, strat] of Object.entries(B.STRATEGIE)) {
    for (const seed of [1, 2]) assert.deepStrictEqual(B.sprawdz(await graj(strat, seed), nazwa, seed), []);
  }
});

test('mgła wojny: raporty działów nie zdradzają, kto jest w sieci', async () => {
  const k = await graj(K.AUTO.bierny, 3);
  const tekst = k.raporty.flatMap(r => r.linie).join(' ') + k.raportIT.join(' ');
  // „ransomware" wolno — po zaszyfrowaniu gracz widzi żądanie okupu. Sprawców w trakcie — nie.
  for (const slowo of ['broker', 'apt', 'haktywista', 'intruz']) {
    assert.ok(!new RegExp(`(^|[^\\p{L}])${slowo}`, 'iu').test(tekst), slowo);   // całe słowo, nie „adaptacja"
  }
});

test('mgła wojny: sygnały bywają fałszywe, a szacunek zasobów nie jest prawdą', async () => {
  let falszywe = 0;
  for (const seed of [1, 2, 3]) falszywe += (await graj(K.AUTO.bierny, seed)).sprawyZamkniete.filter(s => s.rodzaj === 'sygnal' && !s.intruz).length;
  assert.ok(falszywe > 0, 'sprawa „sygnał" nie może oznaczać pewnego intruza');
  const bledy = [1, 2, 3, 4].map(s => Math.abs(nowa(s).mglaBlad));
  assert.ok(bledy.some(b => b > 0.02), 'środek przedziału nie może być prawdą');
});

// ── SKOŃCZONE ZASOBY: koordynacja i praca w toku (docs/18-…, 18.12) ──
const Z = require('../proto/zasoby');
const DR = require('../proto/doradztwo');

test('projekty w toku kosztują godziny co miesiąc, a więcej niż trzy naraz spowalnia zespół', () => {
  const k = nowa();
  for (const id of ['inwentaryzacja', 'mfa', 'plan_ir', 'bcp', 'ryzyko', 'weryfikacja_platnosci']) RU.wykonaj(k, `wdroz:${id}`);
  assert.ok(Z.karaWip(k) > 0, 'sześć projektów naraz bez kary za przełączanie');
  K.zamknijMiesiac(k);
  assert.strictEqual(k.hKart, Z.KOORDYNACJA_H * k.st.projekty.length, 'nowy miesiąc zaczyna się od godzin koordynacji');
});

test('„wszystko naraz" przegrywa z „mało naraz, do końca": przy skończonych zasobach kolejka nie dowozi', async () => {
  let wn = 0, md = 0, dzialaWn = 0;
  for (const seed of [1, 2]) {
    const a = await graj('wszystko_naraz', seed), b = await graj('madry', seed);
    wn += (await K.indeksOdpornosci(a)).kampania; md += (await K.indeksOdpornosci(b)).kampania;
    dzialaWn += Object.values(a.obiekty).filter(o => o.stan === 'dziala').length;
  }
  assert.ok(md - wn > 150, `mądry ${md / 2} vs wszystko naraz ${wn / 2}`);
  assert.ok(dzialaWn / 2 < 10, `z całego katalogu działa ${dzialaWn / 2} — kolejka powinna nie dowieźć większości`);
});

// ── DECYZJE CYKLICZNE ──

test('decyzje są w każdym okresie: mądry ma sprawę w skrzynce w co najmniej 18 z 24 miesięcy', async () => {
  for (const seed of [1, 2]) {
    const k = await graj('madry', seed);
    const mies = new Set(k.historia.filter(h => h.t === 'sprawa_otwarta').map(h => h.m)).size;
    assert.ok(mies >= 18, `ziarno ${seed}: decyzje tylko w ${mies} miesiącach`);
    assert.ok(k.historia.some(h => h.sid === 'C_odnowienie') && k.historia.some(h => h.sid === 'C_certyfikat') && k.historia.some(h => h.sid === 'C_eol'));
  }
});

test('odnowienie umowy: automat podnosi cenę, negocjacje z dowodami ją obniżają, bez dowodów nie', () => {
  const przygotuj = (dowod) => {
    const k = nowa();
    const o = RU.zainstalujGotowe(k, 'backup', { zakres: 'biuro_ot', nosnik: 'offline' });
    o.od = -12; if (dowod) o.ostTest = 0;
    k.sprawy = []; require('../proto/cykl').nowyMiesiac(k);
    return { k, s: k.sprawy.find(x => x.sid === 'C_odnowienie') };
  };
  const cena = k => S.kosztMiesieczny(k.st, 'backup');
  const a = przygotuj(true); const przed = cena(a.k);
  assert.ok(a.s, 'brak sprawy odnowienia w rocznicę umowy');
  SP.odpowiedz(a.k, a.s.id, 'negocjuj'); assert.ok(cena(a.k) < przed);
  const b = przygotuj(false); SP.odpowiedz(b.k, b.s.id, 'negocjuj'); assert.ok(cena(b.k) > przed);
  const c = przygotuj(true); K.zamknijMiesiac(c.k); assert.ok(cena(c.k) > przed, 'brak decyzji = automatyczne przedłużenie z indeksacją');
});

test('certyfikat: bez ewidencji część wygasa „po cichu"; z automatyzacją kolejne nie przychodzą', async () => {
  let ciche = 0;
  for (const seed of [1, 2, 3, 4]) ciche += (await graj(K.AUTO.bierny, seed)).cykl.wygasle.filter(w => w.zapomniany).length;
  assert.ok(ciche > 0, 'bez ewidencji nic nie wygasło po cichu');
  const k = await graj('madry', 1);
  assert.ok(k.flagi.certy_auto || k.flagi.certy_msp);
  assert.ok(k.cykl.odnowione.some(o => o.auto), 'po automatyzacji certyfikaty TLS odnawiają się same');
});

test('koniec wsparcia: „zostaw" zostawia ryzyko w rejestrze, izolacja wymaga segmentacji', () => {
  const k = nowa();
  const s = SP.dodajScenariuszowa(k, 'C_eol', { klucz: 'serwer_fk' });
  assert.match(SP.dostepnyCzasownik(k, s, 'izoluj'), /segmentacji/);
  SP.odpowiedz(k, s.id, 'zostaw');
  assert.ok(k.ryzyka['eol:serwer_fk']?.ulamek === 1);
});

// ── DORADZTWO ──

test('doradztwo: temat zmienia cenę i czas; tryb pilny szybszy i droższy; renomowana firma droższa', () => {
  const k = nowa();
  const w = (temat, firma = 'lokalna', tryb = 'zwykly') => DR.wycena(k, { temat, firma, tryb });
  assert.ok(w('ogolny').pln > w('platnosci').pln && w('ogolny').mies > w('platnosci').mies);
  assert.ok(w('ot', 'lokalna', 'pilny').mies < w('ot').mies && w('ot', 'lokalna', 'pilny').pln > w('ot').pln);
  assert.ok(w('ot', 'renomowana').pln > w('ot').pln);
  RU.wykonaj(k, 'zlec_doradcy', { temat: 'ekspozycja', firma: 'lokalna', tryb: 'zwykly' });
  assert.match(RU.dostepny(k, 'zlec_doradcy', { temat: 'ekspozycja', firma: 'renomowana', tryb: 'zwykly' }), /już zlecony/);
});

test('raport doradcy: odkrywa ukryte, układa rekomendacje od największej poprawy, polecenie da się wykonać', () => {
  const k = nowa(1);
  RU.wykonaj(k, 'zlec_doradcy', { temat: 'ekspozycja', firma: 'renomowana', tryb: 'pilny' });
  assert.ok(!k.fakty.hmi_wystawiony.znany);
  K.zamknijMiesiac(k);
  const r = k.doradztwo.raporty[0];
  assert.ok(r && r.rekomendacje.length >= 2);
  assert.ok(k.fakty.hmi_wystawiony.znany, 'renomowany pentest nie znalazł panelu w internecie');
  for (let i = 1; i < r.rekomendacje.length; i++) assert.ok(r.rekomendacje[i - 1].szacunek >= r.rekomendacje[i].szacunek, 'kolejność nie jest od największej poprawy');
  const top = r.rekomendacje[0];
  assert.strictEqual(RU.dostepny(k, top.ruch, top.p), null, `najważniejszej rekomendacji nie da się wykonać: ${top.polecenie}`);
  // Wycena jest prawdziwa: zrobienie rekomendacji obniża ekspozycję.
  const przed = K.coJesli(k, null, 80).pln;
  RU.wykonaj(k, top.ruch, top.p);
  assert.ok(K.coJesli(k, null, 80).pln < przed);
  assert.match(DR.widok(k), /NAJWIĘKSZA POPRAWA/);
});

test('„co jeśli" nie zmienia stanu kampanii ani losowości', () => {
  const k = nowa(2);
  const przed = JSON.stringify([k.st.aktywne, [...k.st.zamowione], k.st.konf, k.fakty, k.ryzyka, Object.keys(k.obiekty)]);
  const r0 = k.rnd.mgla();
  const k2 = nowa(2); k2.rnd.mgla();
  K.coJesli(k2, x => { RU.zainstalujGotowe(x, 'edr'); x.fakty.hmi_wystawiony.naprawiony = true; }, 10);
  assert.strictEqual(JSON.stringify([k2.st.aktywne, [...k2.st.zamowione], k2.st.konf, k2.fakty, k2.ryzyka, Object.keys(k2.obiekty)]), przed);
  assert.strictEqual(k.rnd.mgla(), k2.rnd.mgla());
  assert.ok(r0 >= 0);
});

test('doradca pomaga laikowi: laik wykonujący rekomendacje wypada lepiej niż laik działający sam', async () => {
  let sam = 0, zDor = 0;
  for (const seed of [1, 2, 3]) {
    sam += (await K.indeksOdpornosci(await graj('rozsadny', seed))).kampania;
    zDor += (await K.indeksOdpornosci(await graj('laik_z_doradca', seed))).kampania;
  }
  assert.ok(zDor > sam, `z doradcą ${zDor / 3} vs sam ${sam / 3}`);
});

// ── DRUGA KAMPANIA: GMINA (docs/19-kampania-gmina.md) ──
const gmina = (seed = 1) => K.nowaKampania('gmina', seed);
const grajG = (strat, seed) => K.grajAuto(typeof strat === 'string' && B.STRATEGIE[strat] ? B.STRATEGIE[strat] : strat, seed, false, cicho, false, 'gmina');

test('gmina: dane przechodzą walidację, zapis fuzzera odtwarza identyczny stan', async () => {
  assert.deepStrictEqual(K.walidujKampanie(K.pelnaDefinicja('gmina')), []);
  const a = await grajG('losowy', 4);
  const b = await K.odtworz('gmina', 4, a.akcje);
  assert.strictEqual(b.st.w.straty, a.st.w.straty);
  assert.deepStrictEqual(b.wskazniki, a.wskazniki);
});

test('gmina: Wynik porządkuje style sensownie (mądry > rozsądny > bierny), kłamca pod sufitem, niezmienniki', async () => {
  const w = {};
  for (const n of ['madry', 'rozsadny', 'bierny', 'klamca']) {
    w[n] = 0;
    for (const seed of [1, 2]) w[n] += (await K.indeksOdpornosci(await grajG(n === 'bierny' ? K.AUTO.bierny : n, seed))).kampania / 2;
  }
  assert.ok(w.madry > w.rozsadny && w.rozsadny > w.bierny, JSON.stringify(w));
  assert.ok(w.klamca <= 650, JSON.stringify(w));
  for (const [nazwa, strat] of Object.entries(B.STRATEGIE)) assert.deepStrictEqual(B.sprawdz(await grajG(strat, 1), nazwa, 1), []);
});

test('gmina bez OT: ruchy OT znikają z listy, warianty OT są niedostępne z powodem', () => {
  const k = gmina();
  const ids = RU.lista(k).map(r => r.id);
  for (const id of ['przeglad_ot', 'odetnij_hmi', 'zmien_pin', 'pilotaz:edr']) assert.ok(!ids.includes(id), id);
  assert.match(RU.dostepny(k, 'odetnij_hmi'), /nie ma sieci przemysłowej/);
  assert.match(RU.dostepny(k, 'wdroz:edr', { zakres: 'z_ot' }), /nie ma sieci przemysłowej/);
  assert.strictEqual(RU.dostepny(k, 'wdroz:inwentaryzacja'), null, 'wdrożenie bez parametrów OT musi przejść (bez_ot domyślnie)');
  assert.match(RU.dostepny(k, 'zlec_doradcy', { temat: 'ot', firma: 'lokalna', tryb: 'zwykly' }), /nie ma sieci przemysłowej/);
  assert.deepStrictEqual(k.otNiezgodne, {});
});

test('gmina: zamówienie ponad próg Pzp czeka na przetarg; w spółce prywatnej nie', () => {
  const k = gmina();
  k.budzet[k.rok] = 1e6;
  RU.wykonaj(k, 'wdroz:pam');
  const pr = k.st.projekty.find(p => p.id === 'pam');
  assert.ok(pr.od > k.st.m && k.historia.some(h => h.t === 'przetarg' && h.id === 'pam'));
  RU.wykonaj(k, 'wdroz:mfa');
  assert.strictEqual(k.st.projekty.find(p => p.id === 'mfa').od, undefined, 'MFA poniżej progu idzie bez przetargu');
  const w = nowa(); w.budzet[w.rok] = 1e6;
  RU.wykonaj(w, 'wdroz:pam');
  assert.strictEqual(w.st.projekty.find(p => p.id === 'pam').od, undefined);
});

test('gmina: sprzęt z grantu kosztuje tylko pracę, a kontrola trwałości rozlicza kartony', () => {
  const k = gmina();
  assert.strictEqual(RU.koszt(k, RU.definicja(k, 'wdroz:ngfw'), {}).pln, 0);
  const kontrola = przygotuj => {
    const x = gmina(2); przygotuj(x);
    const s = SP.dodajScenariuszowa(x, 'G_kontrola_grantu');
    SP.odpowiedz(x, s.id, 'pokaz');
    return x;
  };
  const kartony = kontrola(() => {});
  assert.strictEqual(kartony.flagi.grant_trwalosc, 'korekta');
  assert.ok(kartony.st.w.straty >= 60000);
  const dziala = kontrola(x => { RU.zainstalujGotowe(x, 'ngfw'); RU.zainstalujGotowe(x, 'backup'); });
  assert.strictEqual(dziala.flagi.grant_trwalosc, 'ok');
});

test('gmina S07: kolejność ma znaczenie, a odebrane wcześniej uprawnienia zamieniają atak w próbę', () => {
  const k = gmina();
  I.rozpocznij(k, 'S07');
  assert.ok(!k.incydent.s.proba);
  I.wykonaj(k, 'odblokuj_konta');
  assert.ok(k.incydent.s.zablokowane_ponownie && k.incydent.s.obsluga_stoi, 'odblokowanie przed odebraniem dostępu nie może działać');
  I.wykonaj(k, 'odbierz_dostep'); I.wykonaj(k, 'odblokuj_konta');
  assert.ok(!k.incydent.s.obsluga_stoi);
  const w = I.zakoncz(k, true);
  assert.ok(w.oceny.some(o => o.id === 'S07:najpierw_dostep' && o.wynik === 'naruszona'));

  const k2 = gmina();
  I.rozpocznij(k2, 'S07'); I.wykonaj(k2, 'telefon_do_zleceniobiorcy');
  assert.ok(k2.incydent.s.dane_usuniete, 'ostrzeżony sprawca z dostępem kasuje dane');

  const k3 = gmina();
  RU.api(k3).napraw('zleceniobiorca_admin');
  I.rozpocznij(k3, 'S07');
  assert.ok(k3.incydent.s.proba);
});

test('gmina S01: kwota z wariantu kampanii; kontrasygnata skarbnika z rachunkiem udaremnia wyłudzenie', () => {
  const k = gmina();
  I.rozpocznij(k, 'S01');
  assert.strictEqual(k.incydent.s.kwota, 480000);
  const k2 = gmina();
  const s = SP.dodajScenariuszowa(k2, 'G_skarbnik');
  SP.odpowiedz(k2, s.id, 'rozszerz');
  I.rozpocznij(k2, 'S01');
  assert.ok(k2.incydent.s.udaremnione);
});
