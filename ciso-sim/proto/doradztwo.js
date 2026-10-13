// ── DORADZTWO: zlecenie → czas → raport z rekomendacjami policzonymi w modelu ──
// Gracz zleca temat (data/doradztwo.js) ruchem `zlec_doradcy`. Po czasie realizacji doradca:
//   1) ODKRYWA to, czego gracz nie widział (fakty świata, ukryte usterki, obejścia działów,
//      zgodność wariantów OT) — z szansą zależną od wykonawcy,
//   2) WYCENIA każdą możliwą poprawę na modelu: o ile spadają oczekiwane straty w roku
//      (ta sama ekspozycja co w Indeksie, te same ziarna — porównanie jabłek z jabłkami),
//   3) układa rekomendacje od NAJWIĘKSZEJ poprawy obecnej sytuacji, każdą z gotowym poleceniem.
// Tania firma myli się w szacunkach (szum ±40%), więc jej kolejność bywa zła — tak jak w życiu.
// Doradca nie zmienia skuteczności kontroli ani przyszłości: tylko odsłania i wycenia.
// Losowanie wyłącznie ze strumienia `k.rnd.doradztwo`.

const S = require('./silnik');
const RU = require('./ruchy');
const SP = require('./sprawy');
const Z = require('./zasoby');
const D = require('../data/doradztwo');
const INICJATYWY = require('../data/dzialy');

const PRZEBIEGI = 150;         // ekspozycja na rekomendację (wspólne ziarna z bazą); mniej = ranking z szumu Monte Carlo
const NAJWIECEJ = 6;           // tyle rekomendacji w raporcie (doradca, który daje 40 punktów, nie pomaga)
const kampania = () => require('./kampania');   // leniwie: kampania używa doradztwa przy zamknięciu miesiąca
const zl = Z.zl;

const nowe = () => ({ zlecenia: [], raporty: [] });
const skala = k => Math.max(0.6, Math.min(2.5, Math.sqrt(k.st.firma.pracownicy / 64)));

// Cena, godziny i czas realizacji zlecenia (to samo dla listy ruchów, dostępności i wykonania).
function wycena(k, p = {}) {
  const t = D.TEMATY[p.temat], w = D.WYKONAWCY[p.firma], tr = D.TRYBY[p.tryb];
  if (!t || !w || !tr) return { h: 0, pln: 0, mies: 0 };
  return { h: t.h, pln: Math.round((t.pln * w.pln * tr.pln * skala(k)) / 1000) * 1000, mies: p.tryb === 'pilny' ? Math.floor(t.mies / 2) : t.mies };
}

function dostepny(k, p) {
  if (k.doradztwo.zlecenia.some(z => z.temat === p.temat)) return 'ten temat jest już zlecony — raport jeszcze nie przyszedł';
  const c = wycena(k, p);
  if (k.st.m + c.mies > k.def.miesiecy) return `raport przyszedłby po końcu kampanii (za ${c.mies} mies.)`;
  return null;
}

function zlec(k, p, a) {
  const t = D.TEMATY[p.temat], c = wycena(k, p);
  const z = { temat: p.temat, firma: p.firma, tryb: p.tryb, od: k.st.m, gotowe: k.st.m + c.mies, pln: c.pln };
  k.doradztwo.zlecenia.push(z);
  for (const [d, zm] of Object.entries(t.dzialy || {})) for (const id of d === 'wszystkie' ? Object.keys(k.dzialy) : [d]) a.dzial(id, zm);
  return `Zlecone: ${t.nazwa} (${D.WYKONAWCY[p.firma].nazwa}, ${zl(c.pln)}). Raport ${c.mies ? `pod koniec miesiąca ${z.gotowe}` : 'pod koniec tego miesiąca'}.`;
}

// Zamknięcie miesiąca: gotowe zlecenia zamieniają się w raporty.
function koniecMiesiaca(k) {
  for (const z of k.doradztwo.zlecenia.filter(x => x.gotowe <= k.mZamkniety)) {
    k.doradztwo.zlecenia.splice(k.doradztwo.zlecenia.indexOf(z), 1);
    const r = raport(k, z);
    k.doradztwo.raporty.push(r);
    const top = r.rekomendacje[0];
    k.raportIT.push(`Raport doradcy (${D.TEMATY[z.temat].nazwa}), odkrycia: ${r.odkrycia.length}. ` +
      (top ? `Największa poprawa: ${top.opis} — ${top.polecenie}. [p] pełny raport.` : 'Nic, co istotnie zmienia ryzyko. [p] pełny raport.'));
  }
}

// ── RAPORT ──
function raport(k, z) {
  const t = D.TEMATY[z.temat], w = D.WYKONAWCY[z.firma], rnd = k.rnd.doradztwo, a = RU.api(k), m = k.mZamkniety;
  const p = w.wykrywa * (t.glebokosc ?? 1);
  const odkrycia = [], kand = [];
  const dodaj = c => { if (!kand.some(x => x.polecenie === c.polecenie)) kand.push(c); };

  // 1) Fakty świata (drzwi, o których nie wiesz).
  for (const f of Object.values(k.fakty)) {
    if (!t.fakty || !f.prawda || f.naprawiony || !t.fakty(f)) continue;
    // Doradca nie wie o oczyszczalni, zanim ktokolwiek zaczął mówić o przejęciu.
    if (f.widoczny_od_sprawy && !k.historia.some(h => h.t === 'sprawa_otwarta' && h.sid === f.widoczny_od_sprawy)) continue;
    if (!f.znany) {
      if (rnd() >= p) continue;
      f.znany = true; odkrycia.push(f.opis);
      k.historia.push({ m: k.st.m, t: 'odkrycie_faktu', id: f.id, skad: 'doradca' });
    }
    if (!f.naprawa) continue;
    const { ruch, p: par = {} } = f.naprawa;
    dodaj({ opis: `Zamknąć: ${f.opis}`, ruch, p: par, polecenie: polecenie(ruch, par), slad: { t: 'ruch', id: ruch },
      zmiana: k2 => { k2.fakty[f.id].naprawiony = true; if (ruch.startsWith('wdroz:') && !S.dziala(k2.st, ruch.slice(6))) RU.zainstalujGotowe(k2, ruch.slice(6), par); } });
  }

  // 2) Kontrole w zakresie: czego brakuje, co jest zepsute, co rozjechane, co źle ustawione.
  for (const id of t.kontrole || []) {
    const kon = S.kontrola[id];
    if (!kon || kon.tylko_sprawa) continue;
    const o = k.obiekty[id];
    if (!o || o.stan === 'wycofany') {
      const par = D.ZALECANE_PARAMETRY[id] || {};
      const brak = (kon.wymaga || []).filter(x => !S.dziala(k.st, x));
      dodaj({ opis: `Wdrożyć: ${kon.nazwa}${brak.length ? ` (najpierw: ${brak.map(x => S.kontrola[x].nazwa).join(', ')})` : ''}`, ruch: `wdroz:${id}`, p: par,
        polecenie: polecenie(`wdroz:${id}`, par), slad: { t: 'ruch', id: `wdroz:${id}` }, zmiana: k2 => RU.zainstalujGotowe(k2, id, par) });
      continue;
    }
    if (o.stan !== 'dziala') continue;
    const testuje = (t.testuje || []).includes(id);
    for (const u of o.usterki.filter(x => !x.naprawiona)) {
      if (!u.odkryta) {
        const pu = p * Math.max(u.przeglad ?? 0.5, testuje ? (u.test ?? 0.5) : 0);
        if (rnd() >= pu) continue;
        u.odkryta = true; odkrycia.push(`${kon.nazwa}: ${u.opis}`);
      }
      if (u.naprawa_h) {
        dodaj({ opis: `Naprawić: ${kon.nazwa} — ${u.opis}`, ruch: `napraw:${id}`, p: { usterka: u.id }, polecenie: polecenie(`napraw:${id}`, { usterka: u.id }),
          slad: { t: 'ruch', id: `napraw:${id}` }, zmiana: k2 => { k2.obiekty[id].usterki.find(x => x.id === u.id).naprawiona = true; RU.przeliczKonf(k2, id); } });
      }
    }
    if (o.jakosc < 0.85 * o.jakoscBazowa) {
      odkrycia.push(`${kon.nazwa}: konfiguracja rozjechana od wdrożenia (wyjątki, wyłączone moduły)`);
      dodaj({ opis: `Przegląd konfiguracji: ${kon.nazwa}`, ruch: `przeglad:${id}`, p: {}, polecenie: polecenie(`przeglad:${id}`, {}), slad: { t: 'ruch', id: `przeglad:${id}` },
        zmiana: k2 => { const x = k2.obiekty[id]; x.jakosc = x.jakoscBazowa; RU.przeliczKonf(k2, id); } });
    }
    for (const [kid, n, v, war] of D.POPRAWKI_USTAWIEN) {
      if (kid !== id || !war(o, k)) continue;
      dodaj({ opis: `Zmienić ustawienie: ${kon.nazwa} — ${kon.parametry[n].opis || n}: ${v}`, ruch: `zmien:${id}`, p: { [n]: v }, polecenie: polecenie(`zmien:${id}`, { [n]: v }),
        slad: { t: 'ruch', id: `zmien:${id}` },
        zmiana: k2 => { const x = k2.obiekty[id]; const r = RU.rozwiazParam(kon, { ...x.param, [n]: v }); x.param = r.wybor; x.sk = r.sk; RU.przeliczKonf(k2, id); } });
    }
    // Test zewnętrzny jest testem: dowód dla audytu i zawężenie wiedzy o skuteczności.
    if (testuje) { o.ostTest = m; o.wiedzaPunkt = RU.skutecznosc(k, id); }
  }

  // 3) Zgodność wariantów OT z producentem SCADA (jak pilotaż — tylko bez zawieszania stacji).
  if (t.ot) {
    for (const [id, niezgodny] of Object.entries(k.otNiezgodne)) {
      if (k.pilotaze[id]) continue;
      k.pilotaze[id] = { m, zgodny: !niezgodny, zrodlo: 'doradca' };
      odkrycia.push(`${S.kontrola[id].nazwa} na stacjach OT: ${niezgodny ? 'NIEZGODNE z wersją SCADA — nie rozszerzać na OT' : 'zgodne z SCADA (potwierdzone z producentem)'}`);
    }
  }

  // 4) Obejścia działów (wywiady, skany): odkrycie trafia do skrzynki jak każde inne.
  if (t.obejscia) {
    for (const d of Object.values(k.dzialy)) {
      for (const u of [...d.ukryte]) {
        const ini = INICJATYWY[u.ini];
        if (u.odkryte || !t.obejscia(ini) || rnd() >= p * 0.7) continue;
        u.odkryte = true;
        const s = SP.dodajOdkrycie(k, d.id, u, 'raport doradcy');
        odkrycia.push(`${d.nazwa}: ${ini.nazwa} (bez Twojej wiedzy)`);
        const klucz = `${d.id}:${u.ini}`;
        if (!k.ryzyka[klucz]) continue;
        const ids = kampania().najlepszeWarunki(k, s, kampania().apiAuto(k)) || ini.warunki.filter(x => !x.wymaga || S.dziala(k.st, x.wymaga)).map(x => x.id);
        dodaj({ opis: `Zalegalizować z warunkami: ${ini.nazwa} (${d.nazwa})`, sprawa: s.id, polecenie: `skrzynka „${s.tytul}" → legalizuj warunki=${ids.join(',')}`,
          slad: { t: 'sprawa', id: s.id }, zmiana: k2 => { if (k2.ryzyka[klucz]) k2.ryzyka[klucz].ulamki = SP.policzWarunki(k2, ini, ids).ulamki; } });
      }
    }
  }

  // 5) Wycena: o ile spada oczekiwana strata roku (plus zakłócenia wody liczone jak dzień przychodu).
  const baza = kampania().coJesli(k, null, PRZEBIEGI);
  for (const c of kand) {
    const e = kampania().coJesli(k, c.zmiana, PRZEBIEGI);
    c.dpln = baza.pln - e.pln;
    c.dzakl = baza.sabotaze - e.sabotaze;
    c.wartosc = c.dpln + c.dzakl * k.st.firma.koszt_dnia;
    c.szacunek = Math.round(c.wartosc * (1 + (rnd() - 0.5) * 2 * w.blad) / 1000) * 1000;
    c.koszt = c.ruch ? kosztRuchu(k, c.ruch, c.p) : null;
    delete c.zmiana;
  }
  const rekomendacje = kand.filter(c => c.szacunek > 0).sort((x, y) => y.szacunek - x.szacunek).slice(0, NAJWIECEJ);

  // 6) Obowiązki prawne (nie zmieniają strat, ale mają termin i karę).
  const obowiazki = t.obowiazki ? listaObowiazkow(k, a) : [];
  const r = { temat: z.temat, firma: z.firma, m, odkrycia, rekomendacje, obowiazki, bazaPln: baza.pln };
  k.historia.push({ m: k.st.m, t: 'raport_doradcy', temat: z.temat, top: rekomendacje[0]?.slad || null });
  k.log('doradca', `${D.TEMATY[z.temat].nazwa}: ${odkrycia.length} odkryć, ${rekomendacje.length} rekomendacji`);
  return r;
}

function polecenie(ruch, p) {
  const par = Object.entries(p || {}).map(([n, v]) => `${n}=${v}`).join(' ');
  return `x ${ruch}${par ? ` ${par}` : ''}`;
}
function kosztRuchu(k, id, p) {
  try { return RU.koszt(k, RU.definicja(k, id), p); } catch { return null; }
}

function listaObowiazkow(k, a) {
  const st = k.st, l = [];
  a.poznajStatus();
  const rok = k.rok;
  if (!k.flagi.wpis) l.push({ opis: `Wniosek o wpis do wykazu jako podmiot ${st.firma.status_ksc === 'wazny' ? 'WAŻNY' : st.firma.status_ksc}`, termin: 6, polecenie: `x wpis_s46 status=${st.firma.status_ksc}`, ruch: 'wpis_s46', p: { status: st.firma.status_ksc } });
  if (!S.dziala(st, 'szbi') && k.obiekty.szbi?.stan !== 'projekt') l.push({ opis: 'System zarządzania bezpieczeństwem informacji (SZBI)', termin: 13, polecenie: 'x wdroz:szbi sposob=doradca', ruch: 'wdroz:szbi', p: { sposob: 'doradca' } });
  if (!S.dziala(st, 'ryzyko') && k.obiekty.ryzyko?.stan !== 'projekt') l.push({ opis: 'Szacowanie ryzyka (rejestr ryzyk)', termin: 13, polecenie: 'x wdroz:ryzyko', ruch: 'wdroz:ryzyko', p: {} });
  if (!S.dziala(st, 'plan_ir') && k.obiekty.plan_ir?.stan !== 'projekt') l.push({ opis: 'Obsługa i zgłaszanie incydentów (24 h / 72 h)', termin: 13, polecenie: 'x wdroz:plan_ir', ruch: 'wdroz:plan_ir', p: {} });
  if (!k.flagi[`szkolenie_kierownika_${rok}`]) l.push({ opis: `Szkolenie kierownika podmiotu w ${rok} r.`, termin: null, polecenie: 'x szkolenie_kierownika', ruch: 'szkolenie_kierownika', p: {} });
  return l.filter(o => o.termin === null || o.termin >= 1);
}

// ── WIDOK (komenda p) ──
function widok(k) {
  const l = ['Doradztwo — zlecenie: x zlec_doradcy temat=<temat> firma=lokalna|renomowana tryb=zwykly|pilny', ''];
  l.push('Tematy (cena dla tej firmy: lokalna / renomowana; czas zwykły / pilny):');
  for (const [id, t] of Object.entries(D.TEMATY)) {
    const lo = wycena(k, { temat: id, firma: 'lokalna', tryb: 'zwykly' }), re = wycena(k, { temat: id, firma: 'renomowana', tryb: 'zwykly' });
    const pi = wycena(k, { temat: id, firma: 'lokalna', tryb: 'pilny' });
    l.push(`  ${id.padEnd(11)} ${t.nazwa}`);
    l.push(`  ${''.padEnd(11)} ${zl(lo.pln)} / ${zl(re.pln)} · ${t.h} h Twoich · raport po ${lo.mies} / ${pi.mies} mies. (pilny ×1,5 ceny)`);
  }
  l.push(`  Lokalna firma znajduje mniej (≈${Math.round(D.WYKONAWCY.lokalna.wykrywa * 100)}%) i myli się w szacunkach (±${Math.round(D.WYKONAWCY.lokalna.blad * 100)}%); renomowana: ≈${Math.round(D.WYKONAWCY.renomowana.wykrywa * 100)}%, ±${Math.round(D.WYKONAWCY.renomowana.blad * 100)}%.`);
  if (k.doradztwo.zlecenia.length) {
    l.push('', 'W realizacji:');
    for (const z of k.doradztwo.zlecenia) l.push(`  • ${D.TEMATY[z.temat].nazwa} — ${D.WYKONAWCY[z.firma].nazwa}, raport pod koniec m. ${z.gotowe}`);
  }
  for (const r of [...k.doradztwo.raporty].reverse()) {
    l.push('', `══ Raport: ${D.TEMATY[r.temat].nazwa} (${D.WYKONAWCY[r.firma].nazwa}, m. ${r.m}) ══`);
    l.push(`Oczekiwane straty w roku przy obecnym stanie (szacunek doradcy): ok. ${zl(Math.round(r.bazaPln / 1000) * 1000)}.`);
    if (r.odkrycia.length) { l.push('Co znaleźliśmy:'); for (const o of r.odkrycia) l.push(`  ◦ ${o}`); }
    if (r.rekomendacje.length) {
      l.push('Rekomendacje — od największej poprawy obecnej sytuacji:');
      r.rekomendacje.forEach((c, i) => {
        const koszt = c.koszt ? [c.koszt.h ? `${c.koszt.h} h` : '', c.koszt.pln ? zl(c.koszt.pln) : '', c.koszt.msc ? `${zl(c.koszt.msc)}/mies.` : ''].filter(Boolean).join(' + ') : '';
        l.push(`  ${i === 0 ? '★ NAJWIĘKSZA POPRAWA →' : `${i + 1}.`} ${c.opis}`);
        l.push(`      mniej oczekiwanych strat o ok. ${zl(c.szacunek)} rocznie${c.dzakl > 0.05 ? ` (w tym mniej zakłóceń dostaw wody)` : ''}${koszt ? ` · koszt: ${koszt}` : ''}`);
        l.push(`      polecenie: ${c.polecenie}`);
      });
    } else l.push('Rekomendacje: nic, co w tym zakresie istotnie zmienia ryzyko.');
    if (r.obowiazki.length) {
      l.push('Obowiązki prawne (nie zmniejszają strat, ale mają termin i karę):');
      for (const o of r.obowiazki) l.push(`  ▸ ${o.opis}${o.termin ? ` — termin: m. ${o.termin}` : ''} · ${o.polecenie}`);
    }
  }
  return l.join('\n');
}

module.exports = { nowe, wycena, dostepny, zlec, koniecMiesiaca, raport, widok, PRZEBIEGI };
