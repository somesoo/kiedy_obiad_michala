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
  // Liczby z 13.10.2026 po wydzieleniu silnik.js (identyczne z pierwszą wersją symulacja.js).
  // Jeśli zmieniasz dane albo model: przelicz, zaktualizuj tu i opisz zmianę w docs/14-….
  const oczekiwane = { nic: [763917676, 4265000], mala_firma: [61486553, 140369375] };
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
