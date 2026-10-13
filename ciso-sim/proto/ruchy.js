// ── RUCHY GRACZA I CYKL ŻYCIA ZMIAN ──
// Projekt: docs/18-silnik-ruchow.md. Każdy ruch jest dostępny ZAWSZE, chyba że obiektywnie
// coś stoi na przeszkodzie — wtedy gracz dostaje powód. Nie ma tu ocen: skutki liczy model,
// a praktykę oceniają zasady (proto/zasady.js) na historii ruchów (k.historia).
//
// Dwa źródła ruchów:
//   1) katalog kontroli (data/kontrole.js) → wdroz / pilotaz / przeglad / test / napraw /
//      zmien / wycofaj — cykl życia „obiektu" (k.obiekty[id]),
//   2) data/ruchy.js — rozpoznanie, OT, ludzie, zarząd, obowiązki, audyt (także nieuczciwe).
//
// Prawda vs wiedza: obiekt ma prawdziwą jakość i ukryte usterki (losowane przy wdrożeniu
// z WŁASNEGO strumienia `wdrozenia`); gracz widzi tylko to, co odsłonił przegląd, test albo
// incydent. Do silnika miesiąca trafiają jako st.konf[id] (mnożniki skuteczności).

const S = require('./silnik');
const D = require('./dzialy');
const Z = require('./zasoby');
const KONTROLE = require('../data/kontrole');
const RUCHY = require('../data/ruchy');
const INICJATYWY = require('../data/dzialy');

const sprawy = () => require('./sprawy');   // leniwie: sprawy.js używa zasobów, nie ruchów

const JAKOSC_BAZOWA = 0.9;      // najlepsze wdrożenie to ~90% tego, co obiecuje katalog
const DRYF = 0.01;              // utrata jakości na miesiąc bez przeglądu (konfiguracja się rozjeżdża)
const H_PLANOWANIA = 2;         // godziny gracza na zlecenie wdrożenia (zakres, dostawca, harmonogram)
const DOMYSLNE_USTERKI = [
  { id: 'konfiguracja_domyslna', opis: 'zostawiona konfiguracja domyślna (hasła, reguły, powiadomienia)', szansa: 0.25,
    skutek: { jakosc: 0.75 }, przeglad: 0.7, test: 0.5, naprawa_h: 4 },
];
const DOMYSLNY_TEST = { nazwa: 'test działania w praktyce', h: 6 };
// Etykiety parametrów `dzial` / `luka` dla gracza są liczone dynamicznie (lista działów, znane luki).

const przytnij = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const blad = (msg, uzytkownika = true) => { const e = new Error(msg); e.niedostepny = uzytkownika; return e; };

// ── PARAMETRY KONTROLI ──
function noweSkutki() {
  return { pokrycie: {}, jakosc: 1, utrudnia: 1, wykrywa: 1, odtwarzanie: 1, koszt: 1, h: 1, ot: false, awaria: 0,
    tarcie: 0, dzial: {}, mandat: 0, morale: 0, wektory: {}, flagi: {}, wymaga: [], wyjatki: [], wczesnie: null };
}
function polacz(sk, v) {
  for (const [w, x] of Object.entries(v.pokrycie || {})) sk.pokrycie[w] = (sk.pokrycie[w] ?? 1) * x;
  for (const n of ['jakosc', 'utrudnia', 'wykrywa', 'odtwarzanie', 'koszt', 'h']) if (v[n] !== undefined) sk[n] *= v[n];
  if (v.ot) sk.ot = true;
  if (v.awaria) sk.awaria = Math.max(sk.awaria, v.awaria);
  for (const n of ['tarcie', 'mandat', 'morale']) sk[n] += v[n] || 0;
  for (const [id, zm] of Object.entries(v.dzial || {})) {
    sk.dzial[id] = sk.dzial[id] || {};
    for (const [p, x] of Object.entries(zm)) sk.dzial[id][p] = (sk.dzial[id][p] || 0) + x;
  }
  for (const [w, x] of Object.entries(v.wektory || {})) sk.wektory[w] = (sk.wektory[w] ?? 1) * x;
  Object.assign(sk.flagi, v.flagi || {});
  if (v.wymaga) sk.wymaga.push(v.wymaga);
  if (v.wyjatek) sk.wyjatki.push(v.wyjatek);
  if (v.wczesnie) sk.wczesnie = v.wczesnie;
}
function rozwiazParam(kon, p = {}) {
  const defs = kon.parametry || {};
  for (const n of Object.keys(p)) if (!defs[n]) throw blad(`${kon.nazwa}: nieznany parametr „${n}"${Object.keys(defs).length ? ` (są: ${Object.keys(defs).join(', ')})` : ' (ta kontrola nie ma parametrów)'}`);
  const wybor = {}, sk = noweSkutki();
  for (const [n, def] of Object.entries(defs)) {
    const w = p[n] ?? def.domyslnie;
    if (!def.wartosci[w]) throw blad(`${kon.nazwa}: „${w}" to nie jest wartość parametru ${n} (możliwe: ${Object.keys(def.wartosci).join(', ')})`);
    wybor[n] = w;
    polacz(sk, def.wartosci[w]);
  }
  return { wybor, sk };
}

// ── FAKTY ŚWIATA (prawda + wiedza gracza) ──
function noweFakty(k) {
  const out = {};
  for (const [id, f] of Object.entries(k.def.fakty || {})) {
    const prawda = typeof f.prawda === 'number' ? k.rnd.mgla() < f.prawda : !!f.prawda;
    out[id] = { id, ...f, prawda, znany: false, naprawiony: false };
  }
  return out;
}
// Mnożniki wektorów z faktów i z działających obiektów — liczone OD NOWA (bez dryfu przyrostów).
function mnozniki(k) {
  const out = {};
  const mn = (w, x) => { out[w] = (out[w] ?? 1) * x; };
  for (const f of Object.values(k.fakty || {})) {
    if (!f.prawda) continue;
    if (!f.naprawiony) for (const [w, x] of Object.entries(f.wektory || {})) mn(w, x);
    else for (const [w, x] of Object.entries(f.po_naprawie || {})) mn(w, x);
  }
  for (const o of Object.values(k.obiekty || {})) {
    if (o.stan === 'dziala') for (const [w, x] of Object.entries(o.sk.wektory || {})) mn(w, x);
  }
  return out;
}

// ── OBIEKTY: cykl życia kontroli ──
function przeliczKonf(k, id) {
  const o = k.obiekty[id];
  if (!o || o.stan !== 'dziala') { delete k.st.konf[id]; return; }
  const c = { jakosc: o.jakosc, pokrycie: { ...o.sk.pokrycie }, utrudnia: o.sk.utrudnia, wykrywa: o.sk.wykrywa, odtwarzanie: o.sk.odtwarzanie };
  for (const u of o.usterki) {
    if (u.naprawiona) continue;
    const s = u.skutek || {};
    if (s.jakosc) c.jakosc *= s.jakosc;
    for (const n of ['utrudnia', 'wykrywa', 'odtwarzanie']) if (s[n]) c[n] *= s[n];
    for (const [w, x] of Object.entries(s.pokrycie || {})) c.pokrycie[w] = (c.pokrycie[w] ?? 1) * x;
  }
  k.st.konf[id] = c;
}
// Skuteczność „w jednej liczbie" — do wiedzy gracza i do audytu.
function skutecznosc(k, id) {
  const c = k.st.konf[id];
  if (!c) return 0;
  const pok = Object.values(c.pokrycie);
  return c.jakosc * Math.min(c.utrudnia, c.odtwarzanie, 1) * (pok.length ? Math.min(...pok) : 1);
}
// Co gracz WIE o skuteczności: przedział, zawężany przeglądem (±15 pp.) i testem (±7 pp.),
// rozszerzający się z czasem (2 pp. na miesiąc). Bez przeglądu i testu — szeroki.
function wiedzaOJakosci(k, id) {
  const o = k.obiekty[id];
  if (!o || o.stan !== 'dziala') return null;
  const ost = Math.max(o.ostPrzeglad ?? -99, o.ostTest ?? -99);
  if (ost < 0) return { lo: 0.3, hi: 1, opis: 'nieznana — nikt jej nie sprawdzał' };
  const szer = (o.ostTest === ost ? 0.07 : 0.15) + 0.02 * (k.st.m - ost);
  const s = o.wiedzaPunkt;
  return { lo: przytnij(s - szer), hi: przytnij(s + szer), opis: `${Math.round(100 * przytnij(s - szer))}–${Math.round(100 * przytnij(s + szer))}% (${o.ostTest === ost ? 'test' : 'przegląd'} w m. ${ost})` };
}

function nowyObiekt(k, kon, wybor, sk) {
  return { id: kon.id, stan: 'projekt', param: wybor, sk, od: k.st.m, dzialaOd: null, jakoscBazowa: null, jakosc: null,
    usterki: [], ostPrzeglad: null, ostTest: null, wiedzaPunkt: null, wycofanoM: null };
}
function stosujDzialy(k, zmiany) {
  for (const [id, zm] of Object.entries(zmiany || {})) {
    for (const d of id === 'wszystkie' ? Object.values(k.dzialy) : [k.dzialy[id]]) {
      if (!d) continue;
      if (zm.zaufanie) d.zaufanie = D.przytnij(d.zaufanie + zm.zaufanie);
      if (zm.swiadomosc) { d.swiadomosc = D.przytnij(d.swiadomosc + zm.swiadomosc); d.swiadomoscBazowa = D.przytnij(d.swiadomoscBazowa + (zm.bazowa ?? zm.swiadomosc / 3)); }
      if (zm.zmeczenie) d.zmeczenie = D.przytnij(d.zmeczenie + zm.zmeczenie);
    }
  }
}
const wskaznik = (k, n, d) => { if (d) k.wskazniki[n] = przytnij(k.wskazniki[n] + d, 0, 100); };

// Awaria procesu po wdrożeniu na OT (agent niezgodny ze SCADA, aktywny skan zawiesił sterownik,
// łatka bez zatwierdzenia producenta). Koszt idzie w straty, a stacja to zapamięta.
function awariaOT(k, id, skala = 1) {
  const st = k.st;
  const pln = Math.round((0.75 * st.firma.koszt_dnia + 10000) * skala);
  st.w.straty += pln; st.w.szczegoly.awaria_ot = (st.w.szczegoly.awaria_ot || 0) + pln;
  k.incydenty.push({ m: st.m, rodzaj: `awaria OT po zmianie (${S.kontrola[id].nazwa})`, pln, ot: true, wlasna: true });
  wskaznik(k, 'reputacja', -3 * skala); wskaznik(k, 'mandat', -3 * skala);
  stosujDzialy(k, { produkcja: { zaufanie: -0.2 * skala } });
  k.log('swiat', `Awaria procesu na stacji po zmianie: ${S.kontrola[id].nazwa} (${Z.zl(pln)}).`);
  return pln;
}

function poWdrozeniu(k, id) {
  const o = k.obiekty[id];
  if (!o || o.stan !== 'projekt') return;
  const kon = S.kontrola[id];
  const rnd = k.rnd.wdrozenia;
  o.stan = 'dziala';
  o.dzialaOd = k.st.aktywne[id];
  // Wypalony zespół wdraża gorzej (morale < 25: −15% jakości).
  o.jakoscBazowa = przytnij(JAKOSC_BAZOWA * o.sk.jakosc * (0.92 + 0.16 * rnd()) * (k.wskazniki.morale < 25 ? 0.85 : 1), 0.15, 1);
  o.jakosc = o.jakoscBazowa;
  o.usterki = (kon.usterki ?? DOMYSLNE_USTERKI).filter(u => rnd() < u.szansa).map(u => ({ ...u, odkryta: false, naprawiona: false }));
  if (o.sk.ot && k.otNiezgodne[id]) {
    awariaOT(k, id);
    o.usterki.push({ id: 'niezgodnosc_ot', opis: 'zmiana nie współpracuje ze SCADA — stacja ma problemy, dopóki jej nie wycofasz z OT', skutek: { jakosc: 0.9 },
      odkryta: true, naprawiona: false, naprawa_h: null });
    k.raportIT?.push(`AWARIA: ${kon.nazwa} na stacji OT zakłóciła proces${k.pilotaze[id] ? ' — mimo wyniku pilotażu' : ' (bez pilotażu)'}.`);
  }
  przeliczKonf(k, id);
  k.historia.push({ m: k.st.m, t: 'wdrozone', id, param: o.param });
  // Niektóre wdrożenia same odsłaniają fakty (moje.cert.pl pokazuje wystawiony panel,
  // inwentaryzacja — domyślne PIN-y), kopie OT u nas zamykają zależność od laptopa integratora.
  api(k).odkryjFakty(f => (f.odkrywa_wdrozenie || []).includes(id), `wdrożenie: ${kon.nazwa}`);
  if (id === 'backup' && o.param.zakres === 'biuro_ot' && k.fakty.kopia_scada_u_integratora) k.fakty.kopia_scada_u_integratora.naprawiony = true;
}

// ── API dla ruchów z data/ruchy.js i dla spraw ──
function api(k) {
  const a = {
    miesiac: () => k.st.m,
    rok: () => k.rok,
    dziala: id => S.dziala(k.st, id),
    obiekt: id => k.obiekty[id],
    flaga: (n, v) => { k.flagi[n] = v; },
    wskaznik: (n, d) => wskaznik(k, n, d),
    dzial: (id, zm) => stosujDzialy(k, { [id]: zm }),
    nazwaDzialu: id => k.dzialy[id]?.nazwa || id,
    log: (kto, t) => k.log(kto, t),
    klamstwo: l => { k.klamstwa.push({ m: k.st.m, ujawnione: null, ...l }); },
    fakt: id => k.fakty[id],
    odkryjFakty: (pred, skad) => {
      const nowe = [];
      for (const f of Object.values(k.fakty)) {
        if (!f.prawda || f.znany || f.naprawiony || !pred(f)) continue;
        f.znany = true; nowe.push(f.opis);
        k.log('gracz', `Odkryto (${skad}): ${f.opis}`);
        k.historia.push({ m: k.st.m, t: 'odkrycie_faktu', id: f.id, skad });
      }
      return nowe;
    },
    faktDoNaprawy: (id, powod) => {
      const f = k.fakty[id];
      if (!f || !f.prawda || !f.znany) return powod;
      return f.naprawiony ? 'już zrobione' : null;
    },
    napraw: id => { const f = k.fakty[id]; f.naprawiony = true; k.historia.push({ m: k.st.m, t: 'naprawa_faktu', id }); },
    odkryjObejscia: (pred, p, skad) => {
      let n = 0;
      for (const d of Object.values(k.dzialy)) {
        for (const u of d.ukryte) {
          if (u.odkryte || !pred(INICJATYWY[u.ini]) || k.rnd.mgla() >= p) continue;
          u.odkryte = true; n++;
          sprawy().dodajOdkrycie(k, d.id, u, skad);
        }
      }
      return n;
    },
    presja: (dzial, ini, x) => {
      const d = k.dzialy[dzial];
      if (!d || !d.inicjatywy.includes(ini)) return;
      d.pilnoscExtra[ini] = (d.pilnoscExtra[ini] || 0) + x;
      // Odcięta droga, z której korzystali, wraca jako potrzeba — także po wcześniejszej odmowie.
      k.zrobione.delete(`${dzial}:${ini}`); d.karencja[ini] = k.st.m + 1;
    },
    szukajIntruzow: mn => {
      const st = k.st;
      const narz = (S.dziala(st, 'edr') ? 1.2 : 1) * (S.dziala(st, 'siem') || S.dziala(st, 'siem_os') ? 1.2 : 1);
      let n = 0;
      for (let i = st.intruzi.length - 1; i >= 0; i--) {
        const x = st.intruzi[i];
        const p = Math.min(0.9, ({ dostep: 0.35, eskalacja: 0.5, ruch: 0.65 }[x.etap] || 0) * mn * narz);
        if (k.rnd.mgla() >= p) continue;
        const op = { dostep: 5000, eskalacja: 25000, ruch: 90000 }[x.etap] || 5000;
        st.w.wydatki += op; st.w.reagowanie = (st.w.reagowanie || 0) + op;
        st.intruzi.splice(i, 1); n++;
        k.historia.push({ m: st.m, t: 'intruz_usuniety', etap: x.etap, skad: 'polowanie' });
      }
      return n;
    },
    rozmowa: id => rozmowa(k, id),
    rekrutacjaTrwa: () => (k.rekrutacje || []).length > 0,
    rekrutuj: (etat, mies) => { k.rekrutacje.push({ etat, od: k.st.m + mies }); },
    luki: () => luki(k),
    opisLuki: id => (luki(k).find(l => l.id === id) || { opis: id }).opis,
    akceptuj: id => { k.akceptacje[id] = k.st.m; k.historia.push({ m: k.st.m, t: 'akceptacja', id }); },
    poznajStatus: () => { k.wiedza.status = k.st.firma.status_ksc; },
    statusPrawdziwy: () => k.st.firma.status_ksc,
    // ── dla spraw z pliku kampanii ──
    czyFlaga: n => k.flagi[n],
    dzialObiekt: id => k.dzialy[id],
    rnd: () => k.rnd.mgla(),
    wektor: (w, mn) => { k.modStale[w] = (k.modStale[w] ?? 1) * mn; },
    nieznane: n => D.dodajNieznane(k, n),
    intruz: x => { k.st.intruzi.push({ ...x, od: k.st.m }); },
    // Wydatek wymuszony (decyzja organu, wymiana sprzętu) — nie pyta o budżet, ale się w nim liczy.
    wydajPrzymusowo: pln => { k.st.w.wydatki += pln; k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + pln; },
    // Zarząd daje tyle, na ile Ci ufa: przy mandacie 40 — tyle, o ile prosisz; przy 16 — ~70%.
    // Po ujawnionym kłamstwie zarząd sprawdza każdą liczbę we wniosku — i tnie o 30%.
    przyznajBudzet: (rok, kw) => {
      const ufnosc = przytnij(0.5 + k.wskazniki.mandat / 80, 0.6, 1.2) * (k.klamstwa.some(l => l.ujawnione) ? 0.7 : 1);
      k.budzet[rok] = Math.round(kw * ufnosc / 1000) * 1000;
      k.log('zarzad', `Budżet ${rok}: wniosek ${Z.zl(kw)}, przyznano ${Z.zl(k.budzet[rok])} (mandat ${Math.round(k.wskazniki.mandat)})`);
      return k.budzet[rok];
    },
    zaplanujSprawe: (sid, za) => { k.planowaneSprawy.push({ sid, m: k.st.m + za }); },
    wdrozZeSprawy: id => {
      const kon = S.kontrola[id];
      const { wybor, sk } = rozwiazParam(kon, {});
      k.st.w.wydatki += kon.wdrozenie.pln; k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + kon.wdrozenie.pln;
      k.st.projekty.push({ id, start: k.st.m, h: 0, hMn: 1 });
      k.st.zamowione.add(id); delete k.st.wypowiedzenia[id];
      k.obiekty[id] = nowyObiekt(k, kon, wybor, sk);
    },
    oslabObiekt: (id, mn) => {
      const o = k.obiekty[id];
      if (!o || o.stan !== 'dziala') return;
      o.jakoscBazowa *= mn; o.jakosc *= mn; przeliczKonf(k, id);
    },
  };
  return a;
}

// Rozmowa z działem: zaufanie rośnie, a zaufanie decyduje, ile się dowiesz.
function rozmowa(k, id) {
  const d = k.dzialy[id];
  const a = api(k);
  stosujDzialy(k, { [id]: { zaufanie: 0.05, swiadomosc: 0.02 } });
  const l = [`${d.nazwa} (${d.szef}):`];
  if (d.zmeczenie > 0.3) l.push('„Mamy dość ciągłych ograniczeń — praca idzie wolniej."');
  if (d.plan) l.push(d.zaufanie >= 0.3 ? `„Planujemy: ${INICJATYWY[d.plan].nazwa}."` : '„Nic szczególnego nie planujemy." (Nie brzmi to szczerze.)');
  if (d.zaufanie >= 0.3) {
    const f = a.odkryjFakty(x => x.zna === id, `rozmowa: ${d.nazwa}`);
    for (const t of f) l.push(`Przy okazji: ${t}.`);
  }
  if (d.zaufanie >= 0.55) {
    const u = d.ukryte.find(x => !x.odkryte);
    if (u) {
      u.odkryte = true;
      sprawy().dodajOdkrycie(k, id, u, 'przyznanie w rozmowie');
      l.push(`„Muszę się przyznać: zrobiliśmy ${INICJATYWY[u.ini].nazwa} bez konsultacji." (sprawa w skrzynce)`);
    }
  }
  if (l.length === 1) l.push('„Wszystko w porządku."');
  return l.join(' ');
}

// Znane luki, które zarząd może formalnie zaakceptować (wyjątki, brakujące kontrole, znane fakty,
// odkryte usterki). Akceptacja nie zamyka luki — robi z niej ryzyko z właścicielem.
const KLUCZOWE_LUKI = ['mfa', 'backup', 'edr', 'segmentacja', 'patch', 'szbi', 'plan_ir'];
function luki(k) {
  const out = [];
  for (const o of Object.values(k.obiekty)) {
    if (o.stan !== 'dziala') continue;
    for (const w of o.sk.wyjatki) out.push({ id: `wyjatek:${w}`, opis: { mfa_zarzad: 'MFA bez kont zarządu', mfa_czesciowe: 'MFA tylko dla dostępu z zewnątrz' }[w] || w });
    for (const u of o.usterki) if (u.odkryta && !u.naprawiona) out.push({ id: `usterka:${o.id}:${u.id}`, opis: `${S.kontrola[o.id].nazwa}: ${u.opis}` });
  }
  for (const id of KLUCZOWE_LUKI) if (!S.dziala(k.st, id) && !k.st.projekty.some(p => p.id === id)) out.push({ id: `brak:${id}`, opis: `brak: ${S.kontrola[id].nazwa}` });
  for (const f of Object.values(k.fakty)) if (f.prawda && f.znany && !f.naprawiony) out.push({ id: `fakt:${f.id}`, opis: f.opis });
  return out;
}

// ── KATALOG RUCHÓW ──
function kosztWdrozenia(k, kon, sk) {
  return { h: H_PLANOWANIA, pln: Math.round(kon.wdrozenie.pln * sk.koszt), msc: k.st.zamowione.has(kon.id) ? 0 : S.kosztMiesieczny(k.st, kon.id) };
}

// Pełna definicja ruchu z katalogu kontroli albo z data/ruchy.js.
function definicja(k, id) {
  const [rodzaj, kid] = id.includes(':') ? id.split(':') : [null, null];
  if (rodzaj) {
    const kon = S.kontrola[kid];
    if (!kon) return null;
    return { id, rodzaj, kon };
  }
  const r = RUCHY[id];
  return r ? { id, rodzaj: 'ruch', r } : null;
}

function nazwaRuchu(k, def) {
  if (def.rodzaj === 'ruch') return def.r.nazwa;
  const n = def.kon.nazwa;
  return { wdroz: `Wdrożyć: ${n}`, pilotaz: `Pilotaż na jednej stacji OT: ${n}`, przeglad: `Przegląd konfiguracji: ${n}`,
    test: `Test: ${(def.kon.test || DOMYSLNY_TEST).nazwa} (${n})`, napraw: `Naprawić usterkę: ${n}`, zmien: `Zmienić parametry: ${n}`,
    wycofaj: `Wycofać: ${n}` }[def.rodzaj];
}

// Koszt (dla podglądu i sprawdzenia) — zależy od parametrów.
function koszt(k, def, p = {}) {
  if (def.rodzaj === 'ruch') {
    const r = def.r;
    const c = r.koszt ? r.koszt(p) : { h: r.h || 0, pln: r.pln || 0 };
    const etat = r.etat ? r.etat(p) : 0;
    return { ...c, etat, etatOd: etat ? 3 : 0 };
  }
  const kon = def.kon;
  const o = k.obiekty[kon.id];
  switch (def.rodzaj) {
    case 'wdroz': return kosztWdrozenia(k, kon, rozwiazParam(kon, p).sk);
    case 'pilotaz': return { h: kon.pilot?.h || 6 };
    case 'przeglad': return { h: Math.max(2, Math.round((kon.utrzymanie.h || 4) * 0.5)) };
    case 'test': { const t = kon.test || DOMYSLNY_TEST; return { h: t.h || 0, pln: t.pln || 0 }; }
    case 'napraw': { const u = o?.usterki.find(x => x.id === p.usterka); return { h: u?.naprawa_h || 4 }; }
    case 'zmien': return { h: Math.max(2, Math.round(kon.wdrozenie.h * 0.1)) };
    case 'wycofaj': return { h: 1 };
    default: return {};
  }
}

// null = można; inaczej powód (po polsku).
function dostepny(k, id, p = {}) {
  const def = definicja(k, id);
  if (!def) return `nieznany ruch „${id}"`;
  if (k.incydent) return 'trwa incydent — najpierw go poprowadź (albo zakończ fazę ostrą)';
  if (def.rodzaj === 'ruch') {
    const r = def.r;
    if (r.raz && k.zrobioneRuchy.has(id)) return 'już zrobione';
    for (const [n, d] of Object.entries(r.param || {})) {
      if (p[n] === undefined) return `brak parametru ${n}=…`;
      if (d.typ === 'dzial' && !k.dzialy[p[n]]) return `nie ma działu „${p[n]}" (są: ${Object.keys(k.dzialy).join(', ')})`;
      if (d.typ === 'luka' && !luki(k).some(l => l.id === p[n])) return `nie ma takiej znanej luki „${p[n]}"`;
      if (d.wartosci && !d.wartosci.includes(String(p[n]))) return `${n} musi być jednym z: ${d.wartosci.join(', ')}`;
    }
    if (r.co_ile) {
      const ost = k.ostatnieRuchy[`${id}:${p.dzial || ''}`];
      if (ost !== undefined && k.st.m - ost < r.co_ile) return `zrobione w m. ${ost} — najwcześniej w m. ${ost + r.co_ile}`;
    }
    const pw = r.dostepny ? r.dostepny(k, p, api(k)) : null;
    if (pw) return pw;
    return Z.brakZasobow(k, koszt(k, def, p));
  }
  const kon = def.kon;
  const o = k.obiekty[kon.id];
  const stan = o?.stan;
  switch (def.rodzaj) {
    case 'wdroz': {
      if (kon.tylko_sprawa) return 'tego nie da się „wdrożyć" — przychodzi jako oferta (sprawa)';
      if (stan === 'projekt') return 'wdrożenie już trwa';
      if (stan === 'dziala') return 'już działa — możesz zmienić parametry albo wycofać';
      let sk;
      try { sk = rozwiazParam(kon, p).sk; } catch (e) { return e.message; }
      for (const w of sk.wymaga) if (!S.dziala(k.st, w)) return `ten wariant wymaga działającej kontroli: ${S.kontrola[w].nazwa}`;
      return Z.brakZasobow(k, kosztWdrozenia(k, kon, sk));
    }
    case 'pilotaz':
      if (!kon.pilot) return 'ta kontrola nie ma pilotażu na OT';
      if (k.pilotaze[kon.id]) return `pilotaż już był (m. ${k.pilotaze[kon.id].m})`;
      return Z.brakZasobow(k, koszt(k, def, p));
    case 'przeglad': case 'test':
      if (stan !== 'dziala') return 'kontrola nie działa (najpierw wdrożenie)';
      return Z.brakZasobow(k, koszt(k, def, p));
    case 'napraw': {
      if (stan !== 'dziala') return 'kontrola nie działa';
      const zn = o.usterki.filter(u => u.odkryta && !u.naprawiona && u.naprawa_h);
      if (!zn.length) return 'brak znanych usterek do naprawy (przegląd albo test je odsłania)';
      if (!p.usterka) return `podaj usterka=… (${zn.map(u => u.id).join(', ')})`;
      if (!zn.some(u => u.id === p.usterka)) return `nie ma znanej usterki „${p.usterka}" (są: ${zn.map(u => u.id).join(', ')})`;
      return Z.brakZasobow(k, koszt(k, def, p));
    }
    case 'zmien': {
      if (stan !== 'dziala') return 'kontrola nie działa';
      if (!kon.parametry) return 'ta kontrola nie ma parametrów';
      if (!Object.keys(p).length) return `podaj parametry (${Object.keys(kon.parametry).join(', ')})`;
      let sk;
      try { sk = rozwiazParam(kon, { ...o.param, ...p }).sk; } catch (e) { return e.message; }
      for (const w of sk.wymaga) if (!S.dziala(k.st, w)) return `ten wariant wymaga działającej kontroli: ${S.kontrola[w].nazwa}`;
      return Z.brakZasobow(k, koszt(k, def, p));
    }
    case 'wycofaj':
      if (stan !== 'dziala' && stan !== 'projekt') return 'nie ma czego wycofać';
      return Z.brakZasobow(k, koszt(k, def, p));
    default: return 'nieznany rodzaj ruchu';
  }
}

// Lista wszystkich ruchów, które w ogóle mają sens dla obecnego stanu (dostępne i niedostępne
// z powodem). Front pokazuje wszystkie — gracz widzi, czego mu brakuje, a nie tylko, co wolno.
function lista(k) {
  const out = [];
  const dodaj = (id, p = {}, powod) => {
    const def = definicja(k, id);
    out.push({ id, nazwa: nazwaRuchu(k, def), kategoria: def.rodzaj === 'ruch' ? def.r.kategoria : 'kontrole',
      koszt: (() => { try { return koszt(k, def, p); } catch { return {}; } })(), param: parametryRuchu(k, def),
      powod: powod !== undefined ? powod : dostepny(k, id, p) });
  };
  for (const kon of KONTROLE) {
    if (kon.tylko_sprawa) continue;
    const o = k.obiekty[kon.id];
    if (!o || o.stan === 'wycofany') dodaj(`wdroz:${kon.id}`);
    if (kon.pilot && !k.pilotaze[kon.id]) dodaj(`pilotaz:${kon.id}`);
    if (o?.stan === 'dziala') {
      dodaj(`przeglad:${kon.id}`); dodaj(`test:${kon.id}`);
      // Zmiana bez parametrów nie ma sensu — na liście pokazujemy ją jako dostępną, jeśli są zasoby.
      if (kon.parametry) dodaj(`zmien:${kon.id}`, {}, k.incydent ? 'trwa incydent' : Z.brakZasobow(k, koszt(k, definicja(k, `zmien:${kon.id}`))));
      const u = o.usterki.find(x => x.odkryta && !x.naprawiona && x.naprawa_h);
      if (u) dodaj(`napraw:${kon.id}`, { usterka: u.id });
    }
    if (o?.stan === 'dziala' || o?.stan === 'projekt') dodaj(`wycofaj:${kon.id}`);
  }
  for (const id of Object.keys(RUCHY)) dodaj(id, przykladoweParam(k, RUCHY[id]));
  return out;
}
function przykladoweParam(k, r) {
  const p = {};
  for (const [n, d] of Object.entries(r.param || {})) {
    if (d.typ === 'dzial') p[n] = Object.keys(k.dzialy)[0];
    else if (d.typ === 'luka') p[n] = luki(k)[0]?.id;
    else p[n] = d.wartosci[0];
  }
  return p;
}
function parametryRuchu(k, def) {
  if (def.rodzaj === 'ruch') {
    return Object.fromEntries(Object.entries(def.r.param || {}).map(([n, d]) => [n,
      d.typ === 'dzial' ? Object.keys(k.dzialy) : d.typ === 'luka' ? luki(k).map(l => l.id) : d.wartosci]));
  }
  if (['wdroz', 'zmien'].includes(def.rodzaj)) return Object.fromEntries(Object.entries(def.kon.parametry || {}).map(([n, d]) => [n, Object.keys(d.wartosci)]));
  if (def.rodzaj === 'napraw') return { usterka: (k.obiekty[def.kon.id]?.usterki || []).filter(u => u.odkryta && !u.naprawiona && u.naprawa_h).map(u => u.id) };
  return {};
}

// ── WYKONANIE ──
function wykonaj(k, id, p = {}) {
  p = Object.fromEntries(Object.entries(p || {}).filter(([n]) => !n.startsWith('_')));
  const powod = dostepny(k, id, p);
  if (powod) throw blad(powod);
  const def = definicja(k, id);
  const c = koszt(k, def, p);
  k.akcje.push({ t: 'ruch', id, p });
  k.historia.push({ m: k.st.m, t: 'ruch', id, p });
  const a = api(k);
  let tekst;
  if (def.rodzaj === 'ruch') {
    const r = def.r;
    Z.pobierz(k, { h: c.h, pln: c.pln });
    if (r.nieuczciwe) a.klamstwo({ ...r.nieuczciwe, tekst: r.nazwa });
    tekst = r.wykonaj(k, p, a);
    if (r.raz) k.zrobioneRuchy.add(id);
    k.ostatnieRuchy[`${id}:${p.dzial || ''}`] = k.st.m;
  } else {
    tekst = cyklZycia(k, def, p, c);
  }
  k.log('gracz', `${nazwaRuchu(k, def)}${Object.keys(p).length ? ` [${Object.entries(p).map(([n, v]) => `${n}=${v}`).join(', ')}]` : ''} → ${tekst}`);
  return tekst;
}

function cyklZycia(k, def, p, c) {
  const kon = def.kon, id = kon.id, st = k.st;
  const rnd = k.rnd.wdrozenia;
  switch (def.rodzaj) {
    case 'wdroz': {
      const { wybor, sk } = rozwiazParam(kon, p);
      Z.pobierz(k, { h: c.h, pln: c.pln });
      st.projekty.push({ id, start: st.m, h: 0, hMn: sk.h });
      st.zamowione.add(id); delete st.wypowiedzenia[id];
      k.obiekty[id] = nowyObiekt(k, kon, wybor, sk);
      if (sk.ot) k.historia.push({ m: st.m, t: 'ot_zmiana', id, pilot: !!k.pilotaze[id], param: wybor });
      stosujDzialy(k, sk.dzial);
      wskaznik(k, 'mandat', sk.mandat); wskaznik(k, 'morale', sk.morale);
      Object.assign(k.flagi, sk.flagi);
      const ostr = (kon.wymaga || []).filter(w => !S.dziala(st, w));
      return `Zlecone (${Z.zl(c.pln)} + ${Z.zl(c.msc)}/mies.; zespół: ok. ${Math.round(kon.wdrozenie.h * sk.h * Math.max(0.4, st.skalaH))} h, min. ${kon.wdrozenie.mies} mies.).` +
        (ostr.length ? ` Uwaga: bez ${ostr.map(w => S.kontrola[w].nazwa).join(', ')} zadziała tylko w ~30%.` : '') +
        (sk.ot && !k.pilotaze[id] && kon.pilot ? ' Bez pilotażu na OT.' : '');
    }
    case 'pilotaz': {
      Z.pobierz(k, c);
      const zgodny = !k.otNiezgodne[id];
      k.pilotaze[id] = { m: st.m, zgodny };
      return zgodny ? 'Pilotaż na jednej stacji: bez problemów przez dwa tygodnie. Można wdrażać na OT.'
        : 'Pilotaż: po instalacji panel operatorski zaczął się zawieszać. Na OT tylko po zmianie wersji z producentem — albo wcale.';
    }
    case 'przeglad': {
      Z.pobierz(k, c);
      const o = k.obiekty[id];
      const znalezione = o.usterki.filter(u => !u.odkryta && rnd() < (u.przeglad ?? 0.5));
      for (const u of znalezione) u.odkryta = true;
      o.jakosc = o.jakoscBazowa;            // przegląd zdejmuje dryf konfiguracji
      o.ostPrzeglad = st.m;
      przeliczKonf(k, id);
      o.wiedzaPunkt = skutecznosc(k, id);
      return `Przegląd: ${znalezione.length ? `znalezione — ${znalezione.map(u => u.opis).join('; ')}` : 'nic nowego'}. Skuteczność: ${wiedzaOJakosci(k, id).opis}.`;
    }
    case 'test': {
      Z.pobierz(k, c);
      const o = k.obiekty[id];
      const znalezione = o.usterki.filter(u => !u.odkryta && rnd() < (u.test ?? 0.5));
      for (const u of znalezione) u.odkryta = true;
      o.ostTest = st.m;
      o.wiedzaPunkt = skutecznosc(k, id);
      // Niektóre testy uczą ludzi same w sobie (symulacja phishingu, ćwiczenie przy stole).
      const uczy = { szkolenia: { wszystkie: { swiadomosc: 0.03 } }, plan_ir: { zarzad: { swiadomosc: 0.05 } },
        bcp: { produkcja: { swiadomosc: 0.05 } }, weryfikacja_platnosci: { finanse: { swiadomosc: 0.05 } } }[id];
      if (uczy) stosujDzialy(k, uczy);
      return `${(kon.test || DOMYSLNY_TEST).nazwa}: ${znalezione.length ? `wyszło — ${znalezione.map(u => u.opis).join('; ')}` : 'zaliczony'}. Skuteczność: ${wiedzaOJakosci(k, id).opis}.`;
    }
    case 'napraw': {
      Z.pobierz(k, c);
      const u = k.obiekty[id].usterki.find(x => x.id === p.usterka);
      u.naprawiona = true;
      przeliczKonf(k, id);
      return `Naprawione: ${u.opis}.`;
    }
    case 'zmien': {
      Z.pobierz(k, c);
      const o = k.obiekty[id];
      const stare = o.param;
      const { wybor, sk } = rozwiazParam(kon, { ...stare, ...p });
      // Skutki uboczne tylko ZMIENIONYCH wartości (nowa wartość wchodzi, stara nie liczy się drugi raz).
      const zmiany = noweSkutki();
      for (const [n, w] of Object.entries(wybor)) if (stare[n] !== w) polacz(zmiany, kon.parametry[n].wartosci[w]);
      stosujDzialy(k, zmiany.dzial); wskaznik(k, 'mandat', zmiany.mandat); wskaznik(k, 'morale', zmiany.morale);
      Object.assign(k.flagi, zmiany.flagi);
      const l = [];
      // Przełączenie na „blokuj" zaraz po wdrożeniu = fałszywe alarmy blokują pracę (brak strojenia).
      if (zmiany.wczesnie && o.dzialaOd !== null && st.m - o.dzialaOd < zmiany.wczesnie.miesiecy) {
        k.tarcieExtra = (k.tarcieExtra || 0) + zmiany.wczesnie.tarcie;
        stosujDzialy(k, zmiany.wczesnie.dzial);
        l.push('Za wcześnie po wdrożeniu: fałszywe blokady utrudniają pracę działom.');
      }
      const bylaNiezgodnosc = o.usterki.find(u => u.id === 'niezgodnosc_ot' && !u.naprawiona);
      if (bylaNiezgodnosc && !sk.ot) { bylaNiezgodnosc.naprawiona = true; stosujDzialy(k, { produkcja: { zaufanie: 0.1 } }); l.push('Stacja odetchnęła — OT bez zmiany, która jej szkodziła.'); }
      if (sk.ot && !o.sk.ot) k.historia.push({ m: st.m, t: 'ot_zmiana', id, pilot: !!k.pilotaze[id], param: wybor });
      if (sk.ot && !o.sk.ot && k.otNiezgodne[id]) {
        awariaOT(k, id);
        o.usterki.push({ id: 'niezgodnosc_ot', opis: 'zmiana nie współpracuje ze SCADA', skutek: { jakosc: 0.9 }, odkryta: true, naprawiona: false, naprawa_h: null });
        l.push('AWARIA na stacji po rozszerzeniu na OT.');
      }
      o.param = wybor; o.sk = sk;
      przeliczKonf(k, id);
      return `Zmienione: ${Object.entries(p).map(([n, v]) => `${n}=${v}`).join(', ')}.${l.length ? ` ${l.join(' ')}` : ''}`;
    }
    case 'wycofaj': {
      Z.pobierz(k, c);
      const o = k.obiekty[id];
      const bylo = o.stan;
      S.wycofaj(st, id);
      o.stan = 'wycofany'; o.wycofanoM = st.m;
      if (o.usterki.some(u => u.id === 'niezgodnosc_ot' && !u.naprawiona)) stosujDzialy(k, { produkcja: { zaufanie: 0.1 } });
      return bylo === 'projekt' ? 'Projekt przerwany; wydane pieniądze przepadają, abonament płacimy jeszcze miesiąc.'
        : 'Wycofane; przestaje działać od dziś, abonament płacimy jeszcze miesiąc.';
    }
    default: throw blad('nieznany ruch');
  }
}

// ── KONIEC MIESIĄCA: wdrożenia, dryf, ryzyko bieżące, rekrutacje ──
function poMiesiacu(k, wdrozone) {
  const st = k.st;
  for (const id of wdrozone) poWdrozeniu(k, id);
  for (const o of Object.values(k.obiekty)) {
    if (o.stan !== 'dziala') continue;
    const kon = S.kontrola[o.id];
    // Dryf: bez przeglądu konfiguracja się rozjeżdża (wyjątki, wyłączone moduły, stare reguły).
    if (o.dzialaOd !== null && st.m > o.dzialaOd && (o.ostPrzeglad === null || st.m > o.ostPrzeglad)) {
      o.jakosc = Math.max(0.3 * o.jakoscBazowa, o.jakosc * (1 - (kon.dryf ?? DRYF)));
    }
    // Łatanie OT „co tydzień" bez producenta: ciągłe, małe ryzyko zakłócenia procesu.
    if (o.sk.ot && o.id === 'patch' && k.rnd.wdrozenia() < 0.05) awariaOT(k, o.id, 0.5);
    // Niezgodność z OT, dopóki nie wycofana z OT: stacja ma kłopoty co miesiąc.
    if (o.usterki.some(u => u.id === 'niezgodnosc_ot' && !u.naprawiona)) stosujDzialy(k, { produkcja: { zaufanie: -0.03, zmeczenie: 0.05 } });
    przeliczKonf(k, o.id);
  }
  k.tarcieExtra = Math.max(0, (k.tarcieExtra || 0) - 1);
  for (const r of [...(k.rekrutacje || [])]) {
    if (st.m >= r.od) { S.dodajEtat(st, r.etat); k.rekrutacje.splice(k.rekrutacje.indexOf(r), 1); k.log('gracz', `Nowa osoba w zespole (${r.etat} etatu).`); }
  }
}

// Tarcie dla działów (zmęczenie zasadami): katalog + parametry + świeże „blokuj".
function tarcie(k) {
  let t = k.tarcieExtra || 0;
  for (const o of Object.values(k.obiekty)) if (o.stan === 'dziala') t += (S.kontrola[o.id].tarcie || 0) + (o.sk.tarcie || 0);
  return t;
}

// Kontrole, które mogą mieć wariant OT z ryzykiem niezgodności: prawda losowana na starcie
// kampanii (pilotaż ją odsłania, wdrożenie bez pilotażu sprawdza „na żywo").
function noweNiezgodnosci(k) {
  const out = {};
  for (const kon of KONTROLE) {
    const p = Math.max(0, ...Object.values(kon.parametry || {}).flatMap(d => Object.values(d.wartosci)).map(v => (v.ot ? v.awaria || 0 : 0)));
    if (p > 0) out[kon.id] = k.rnd.wdrozenia() < p;
  }
  return out;
}

// Kontrola „już działająca" (przygotowanie stanu w testach i w grze przy stole, proto/rozegraj.js):
// porządne wdrożenie sprzed kampanii, bez usterek, jakość bazowa.
function zainstalujGotowe(k, id, p = {}) {
  const kon = S.kontrola[id];
  const { wybor, sk } = rozwiazParam(kon, p);
  k.st.aktywne[id] = -12; k.st.zamowione.add(id);
  k.obiekty[id] = { ...nowyObiekt(k, kon, wybor, sk), stan: 'dziala', od: -12, dzialaOd: -12, jakoscBazowa: JAKOSC_BAZOWA, jakosc: JAKOSC_BAZOWA };
  przeliczKonf(k, id);
  return k.obiekty[id];
}

module.exports = {
  JAKOSC_BAZOWA, zainstalujGotowe, rozwiazParam, noweFakty, noweNiezgodnosci, mnozniki, przeliczKonf, skutecznosc, wiedzaOJakosci,
  api, luki, lista, dostepny, wykonaj, koszt, definicja, poMiesiacu, tarcie, awariaOT, stosujDzialy, RUCHY,
};
