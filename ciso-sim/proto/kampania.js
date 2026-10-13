// ── KAMPANIA W TERMINALU (we własnym tempie gracza) ──
// Grywalny prototyp pierwszej kampanii („Wodnik"). Nie ma limitu ruchów: gracz sam zamyka
// miesiąc, kiedy jest gotowy (decyzja właściciela, docs/15-…, 15.7). Łączy:
//   silnik.js  — miesiąc (wspólny z Monte Carlo)
//   dzialy.js  — działy-agenci: inicjatywy, pytaj/obejdź, uczenie, raporty
//   rezyser.js — diagnoza problemu, model gracza, rytm, przeciwnik adaptacyjny
//   rozegraj.js — scenariusze incydentów (S01, S03)
//
//   node ciso-sim/proto/kampania.js                         — gra (zapis: --zapis=plik.json)
//   node ciso-sim/proto/kampania.js --auto=rozsadny|odmawiajacy|bierny [--seed=7] [--szczegoly]
//
// Zapis to LISTA DECYZJI, nie stan: wczytanie odtwarza kampanię z ziarna. Działa, bo cała gra
// jest deterministyczna — i to jest zarazem test tej deterministyczności.

const fs = require('fs');
const readline = require('readline');
const S = require('./silnik');
const D = require('./dzialy');
const R = require('./rezyser');
const { graj, wczytaj } = require('./rozegraj');
const FIRMY = require('../data/firmy');
const KONTROLE = require('../data/kontrole');

const MIES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień',
  'październik', 'listopad', 'grudzień'];
const PKT = { dobra: 1, dopuszczalna: 0.5, blad: 0 };
const IKONA = { dobra: '✅', dopuszczalna: '⚠️', blad: '❌' };
const zl = n => `${Math.round(n).toLocaleString('pl-PL')} zł`;
const przytnij = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));

// ── WALIDACJA DANYCH KAMPANII ── (zły plik kampanii nie startuje; powód na liście)
function walidujKampanie(def) {
  const b = [];
  const fs_ = require('fs'), path = require('path');
  const firma = FIRMY[def.firma];
  if (!firma) b.push(`nieznana firma ${def.firma}`); else b.push(...S.walidujFirme(firma).map(x => `firma: ${x}`));
  const kart = def.karty || {};
  for (const [id, c] of Object.entries(kart)) {
    if (!c.opcje || c.opcje.length < 2) b.push(`${id}: mniej niż 2 opcje`);
    if (!c.opcje?.some(o => o.ocena === 'dobra')) b.push(`${id}: brak opcji „dobra"`);
    for (const o of c.opcje || []) {
      if (!['dobra', 'dopuszczalna', 'blad'].includes(o.ocena)) b.push(`${id}: ocena „${o.ocena}"`);
      if (!o.dlaczego) b.push(`${id}: opcja bez „dlaczego"`);
      for (const z of o.zlec || []) if (!S.kontrola[z]) b.push(`${id}: zlec nieznanej kontroli ${z}`);
    }
    const [od, doM] = c.okno || [];
    if (!(od >= 1 && doM >= od && doM <= def.miesiecy)) b.push(`${id}: złe okno ${c.okno}`);
  }
  const obowiazkowe = new Set([...Object.entries(kart).filter(([, c]) => c.obowiazkowa).map(([id]) => id),
    ...def.zdarzenia.filter(z => z.typ === 'karta').map(z => z.id)]);
  // Obowiązkowa karta musi mieć uczciwe wyjście bez pieniędzy (≤ 8 h, bez zakupów) — inaczej
  // gracz bez budżetu jest zmuszany do błędu (przypadek brzegowy: przejęcie oczyszczalni).
  for (const id of obowiazkowe) {
    const c = kart[id];
    if (!c) { b.push(`zdarzenie ${id}: brak karty`); continue; }
    if (!c.opcje.some(o => o.ocena !== 'blad' && !o.pln && !(o.zlec || []).length && (o.h || 0) <= 8)) b.push(`${id}: obowiązkowa bez taniego wyjścia`);
  }
  const scen = path.join(__dirname, '..', 'scenariusze');
  for (const z of def.zdarzenia) {
    const [od, doM] = z.okno || [];
    if (!(od >= 1 && doM >= od && doM <= def.miesiecy)) b.push(`zdarzenie ${z.id}: złe okno`);
    if (z.typ === 'scenariusz' && !fs_.readdirSync(scen).some(f => f.startsWith(z.id) && f.endsWith('.dane.js'))) b.push(`zdarzenie ${z.id}: brak pliku scenariusza`);
  }
  for (const [id, d] of Object.entries(def.dzialy)) {
    for (const ini of d.inicjatywy) if (!D.INICJATYWY[ini]) b.push(`dział ${id}: nieznana inicjatywa ${ini}`);
    for (const n of ['zaufanie', 'swiadomosc', 'aktywnosc']) if (!(d[n] >= 0 && d[n] <= 1)) b.push(`dział ${id}: ${n} poza 0–1`);
  }
  return b;
}

// ── TWORZENIE ──
function nowaKampania(defId, seed) {
  const def = require(`../data/kampanie/${defId}`);
  const bledy = walidujKampanie(def);
  if (bledy.length) throw new Error(`Kampania ${defId} ma błędy w danych:\n - ${bledy.join('\n - ')}`);
  const firma = FIRMY[def.firma];
  const st = S.nowyStan(firma, seed);
  const k = {
    def, st, seed, flagi: {}, wskazniki: { ...def.wskazniki }, budzet: { ...def.budzet }, wydaneRok: {},
    dzialy: D.noweDzialy(def), rezyser: R.nowyRezyser(), modStale: {}, ryzyka: {}, zrobione: new Set(), odlozone: {},
    // Osobne strumienie: tasowanie odpowiedzi i mgła nie mogą przesuwać losowań działów ani silnika.
    rnd: { dzialy: S.mulberry32(seed ^ 0x9e3779b9), rezyser: S.mulberry32(seed ^ 0x85ebca6b),
      tasuj: S.mulberry32(seed ^ 0xc2b2ae35), mgla: S.mulberry32(seed ^ 0x27d4eb2f) },
    karty: [], kartyNastepne: [], zdarzenia: [], decyzje: [], rejestr: [], incydenty: [], raporty: [],
    hKart: 0, koniec: false, akcje: [], kontrola: null,
  };
  k.log = (kto, tekst) => k.rejestr.push({ m: k.st.m, kto, tekst });
  // Stały błąd szacunku „ile naprawdę mamy zasobów" (±25%), żeby środek przedziału nie był prawdą.
  k.mglaBlad = (k.rnd.mgla() - 0.5) * 0.5;
  for (const d of Object.values(k.dzialy)) D.zaplanuj(k, d);
  rozpocznijMiesiac(k);
  return k;
}

function kalendarz(k) {
  const i = k.def.start.miesiac - 1 + k.st.m - 1;
  k.m = k.st.m;
  k.miesiacKal = (i % 12) + 1;
  k.rok = k.def.start.rok + Math.floor(i / 12);
}
const nazwaMiesiaca = k => `${MIES[k.miesiacKal - 1]} ${k.rok}`;

// Mnożniki wektorów w silniku = ryzyka działów (z rejestru, z sufitem) × trwałe skutki kart
// × przeciwnik. Całość przycięta do 0,25–4 — przypadki brzegowe pokazały ×23 bez sufitów.
function zastosujModyfikatory(k) {
  const dz = D.mnozniki(k);
  for (const w of new Set([...Object.keys(dz), ...Object.keys(k.modStale), ...Object.keys(k.rezyser.wagi)])) {
    k.st.mod.wektory[w] = Math.max(0.25, Math.min(4, (dz[w] ?? 1) * (k.modStale[w] ?? 1) * (k.rezyser.wagi[w] ?? 1)));
  }
  k.st.mod.h_extra = (k.def.h_gracza || 0) - k.hKart;
  k.st.mod.bez_ubezpieczenia = !!k.flagi.klamstwo_ankieta;
}

// Kolejność odpowiedzi tasowana (deterministycznie): w danych dobra odpowiedź prawie zawsze
// stoi pierwsza — gracz „zawsze a)" miał 82% jakości decyzji (przypadki brzegowe, 13.10.2026).
function tasuj(k, opcje) {
  const a = [...opcje];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(k.rnd.tasuj() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function dodajKarte(k, c, gdzie = 'karty') {
  c.opcje = tasuj(k, c.opcje);
  k[gdzie].push(c);
}

// ── LIMITY: budżet i godziny ──
const LIMIT_NADGODZIN = 1.5;   // najwyżej +50% godzin gracza w miesiącu
const TOLERANCJA_BUDZETU = 1.1;
// Koszt w budżecie TEGO roku: wdrożenie + abonament do grudnia. Dawniej liczyło się tylko
// wdrożenie, więc abonamenty kupione „w limicie" rozsadzały budżet w kolejnych miesiącach.
function kosztOpcji(k, o) {
  const doKonca = 12 - k.miesiacKal + 1;
  return (o.pln || 0) + (o.zlec || []).filter(id => !k.st.zamowione.has(id))
    .reduce((a, id) => a + S.kontrola[id].wdrozenie.pln + S.kosztMiesieczny(k.st, id) * doKonca, 0);
}
// Zwraca powód, dla którego opcji NIE da się wybrać, albo null.
function niedostepna(k, o) {
  const h = (o.h || 0);
  if (h && k.hKart + h > (k.def.h_gracza || 0) * LIMIT_NADGODZIN) return `brak godzin (zostało ${Math.max(0, Math.round((k.def.h_gracza || 0) * LIMIT_NADGODZIN - k.hKart))} h z nadgodzinami)`;
  const pln = kosztOpcji(k, o);
  const budzet = k.budzet[k.rok] || 0;
  const wolne = budzet - zobowiazaniaRoku(k);
  if (pln && pln > wolne + budzet * (TOLERANCJA_BUDZETU - 1)) {
    return `brak budżetu (wolne do końca roku: ${zl(Math.max(0, wolne))} + ${Math.round((TOLERANCJA_BUDZETU - 1) * 100)}% tolerancji, potrzeba ${zl(pln)})`;
  }
  return null;
}
// Wydane w tym roku + abonamenty i pensje, które i tak polecą do grudnia.
function zobowiazaniaRoku(k) {
  const doKonca = 12 - k.miesiacKal + 1;
  let stale = (k.st.etaty - k.st.firma.zespol.fte) * S.KOSZT_ETATU;
  for (const id of k.st.zamowione) stale += S.kosztMiesieczny(k.st, id);
  return (k.wydaneRok[k.rok] || 0) + stale * doKonca;
}

// ── POCZĄTEK MIESIĄCA ──
function rozpocznijMiesiac(k) {
  kalendarz(k);
  if (k.budzet[k.rok] === undefined) k.budzet[k.rok] = k.budzet[k.rok - 1] ?? 0;
  D.ustawObciazenie(k);
  k.karty = k.kartyNastepne; k.kartyNastepne = [];
  k.kartyDzialow = 0;
  k.mandatZDzialow = 0;
  for (const d of Object.values(k.dzialy)) {
    const w = D.wykonajPlan(k, d);
    if (!w) continue;
    k.log('dzial', `${d.nazwa}: ${w.typ === 'pytanie' ? 'PYTA' : 'OBCHODZI'} — ${D.INICJATYWY[w.ini].nazwa}; ${w.powod}`);
    if (w.typ === 'pytanie') { dodajKarte(k, D.kartaPytania(k, w)); k.kartyDzialow++; }
  }
  const plan = R.zaplanujMiesiac(k);
  for (const c of plan.karty) dodajKarte(k, { id: c.id, zrodlo: 'katalog', ...k.def.karty[c.id] });
  k.zdarzenia = [];
  for (const z of plan.zdarzenia) {
    if (z.typ === 'karta') dodajKarte(k, { id: z.id, zrodlo: 'katalog', ...k.def.karty[z.id], obowiazkowa: true });
    else k.zdarzenia.push({ ...z, zagrane: false });
  }
  zastosujModyfikatory(k);
}

// ── EFEKTY OPCJI ──
function wydaj(k, pln) {
  k.st.w.wydatki += pln || 0;
  k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + (pln || 0);
}

function zastosuj(k, e, { straty = false } = {}) {
  const st = k.st;
  for (const id of e.zlec || []) if (S.zlec(st, id)) { k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + S.kontrola[id].wdrozenie.pln; k.log('gracz', `Zlecono: ${S.kontrola[id].nazwa}`); }
  if (e.etat) S.dodajEtat(st, e.etat);
  if (e.pln) {
    if (straty) { st.w.straty += e.pln; st.w.szczegoly.scenariusze = (st.w.szczegoly.scenariusze || 0) + e.pln; }
    else wydaj(k, e.pln);
  }
  if (e.h) { k.hKart += e.h; k.maxHKart = Math.max(k.maxHKart || 0, k.hKart); }
  for (const w of ['mandat', 'reputacja', 'morale']) if (e[w]) k.wskazniki[w] = przytnij(k.wskazniki[w] + e[w]);
  if (e.flagi) Object.assign(k.flagi, e.flagi);
  for (const [id, zm] of Object.entries(e.dzial || {})) {
    for (const d of id === 'wszystkie' ? Object.values(k.dzialy) : [k.dzialy[id]]) {
      if (!d) continue;
      if (zm.zaufanie) d.zaufanie = D.przytnij(d.zaufanie + zm.zaufanie);
      if (zm.swiadomosc) {
        d.swiadomosc = D.przytnij(d.swiadomosc + zm.swiadomosc);
        d.swiadomoscBazowa = D.przytnij(d.swiadomoscBazowa + zm.swiadomosc / 3); // trwała część nauki
      }
      if (zm.zmeczenie) d.zmeczenie = D.przytnij(d.zmeczenie + zm.zmeczenie);
    }
  }
  for (const [w, mn] of Object.entries(e.wektory || {})) k.modStale[w] = (k.modStale[w] ?? 1) * mn;
  if (e.nieznane) D.dodajNieznane(k, e.nieznane);
  if (e.intruz) st.intruzi.push({ ...e.intruz, od: st.m });
  if (e.budzet) {
    // Zarząd daje tyle, na ile Ci ufa: przy mandacie 40 — tyle, o ile prosisz; przy 16 — ~70%.
    const ufnosc = Math.max(0.6, Math.min(1.2, 0.5 + k.wskazniki.mandat / 80));
    for (const [rok, kw] of Object.entries(e.budzet)) {
      k.budzet[rok] = Math.round(kw * ufnosc / 1000) * 1000;
      k.log('zarzad', `Budżet ${rok}: wniosek ${zl(kw)}, przyznano ${zl(k.budzet[rok])} (mandat ${Math.round(k.wskazniki.mandat)})`);
    }
  }
  if (e.szkolenie_kierownika) { k.flagi[`szkolenie_kierownika_${k.rok}`] = true; k.flagi.szkolenie_kierownika = true; }
  if (e.pozniej) k.odlozone[e.pozniej.karta] = st.m + e.pozniej.za;
  if (e.zamknij_ekspozycje) { k.modStale.uslugi = (k.modStale.uslugi ?? 1) * 0.4; k.flagi.hmi_odciete = true; }
  if (e.powrot) st.intruzi.push({ kto: 'haktywista', etap: 'dostep', wektor: 'uslugi', od: st.m });
  zastosujModyfikatory(k);
}

// ── DECYZJE ──
function rozstrzygnij(k, kartaId, j) {
  const i = k.karty.findIndex(c => c.id === kartaId);
  if (i < 0) throw new Error(`Brak karty ${kartaId}`);
  const c = k.karty[i];
  const o = c.opcje[j];
  const brak = niedostepna(k, o);
  if (brak) { const e = new Error(brak); e.niedostepna = true; throw e; }
  k.akcje.push({ t: 'karta', id: kartaId, j });
  if (c.zrodlo === 'dzial') { zastosuj(k, { h: o.h, pln: o.pln }); D.odpowiedz(k, c, o.odpowiedz); }
  else if (c.zrodlo === 'odkrycie') { zastosuj(k, { h: o.h, pln: o.pln, mandat: o.mandat }); D.odpowiedzOdkrycie(k, c, o.odpowiedz); }
  else if (c.zrodlo === 'sygnal') {
    zastosuj(k, { h: o.h });
    if (o.zbadaj && k.st.intruzi.includes(c.intruz)) {
      k.st.intruzi.splice(k.st.intruzi.indexOf(c.intruz), 1);
      const op = { dostep: 15000, eskalacja: 40000, ruch: 110000 }[c.intruz.etap] || 15000;
      k.st.w.wydatki += op; k.st.w.reagowanie = (k.st.w.reagowanie || 0) + op;   // z rezerwy, nie z budżetu
      k.log('gracz', `Sygnał z działu zbadany: przyczółek usunięty (etap: ${c.intruz.etap}, koszt ${zl(op)})`);
      c.wynik = `Analiza potwierdziła włamanie na etapie „${c.intruz.etap}" — usunięte.`;
    } else if (o.zbadaj) c.wynik = 'Analiza nic nie znalazła. (To też dobra decyzja: o tym, że to fałszywy alarm, wiesz dopiero teraz.)';
  } else zastosuj(k, o);
  R.poDecyzji(k, c.cele, o.ocena);
  k.decyzje.push({ m: k.st.m, karta: c.tytul, tekst: o.tekst, ocena: o.ocena, dlaczego: o.dlaczego });
  k.karty.splice(i, 1);
  return c.wynik;
}

function zlecRecznie(k, id) {
  const brak = niedostepna(k, { zlec: [id] });
  if (brak) return brak;           // nic się nie dzieje — i nic nie trafia do zapisu
  k.akcje.push({ t: 'zlec', id });
  zastosuj(k, { zlec: [id] });
  return null;
}

async function zagrajZdarzenie(k, z, wybierz, wypisz) {
  const s = wczytaj(z.id);
  const stan = { kontrole: KONTROLE.map(x => x.id).filter(id => S.dziala(k.st, id)) };
  const wybory = [];
  const wyb = async opcje => { const j = await wybierz(opcje); wybory.push(j); return j; };
  const wynik = await graj(s, stan, wyb, wypisz, opcje => tasuj(k, opcje));
  // Incydent nie pyta o grafik: godziny scenariusza idą ponad limit (nadgodziny kosztują morale).
  k.hKart += wynik.decyzje.reduce((a, d) => a + (d.h || 0), 0);
  k.maxHKart = Math.max(k.maxHKart || 0, k.hKart);
  k.akcje.push({ t: 'scen', id: z.id, wybory });
  const sk = s.skutki_kampanii ? s.skutki_kampanii(stan) : {};
  zastosuj(k, sk, { straty: true });
  if (sk.pln) k.incydenty.push({ m: k.st.m, rodzaj: `${s.id} ${s.tytul}`, pln: sk.pln, zakonczenie: wynik.zakonczenie });
  for (const d of wynik.decyzje) {
    R.poDecyzji(k, s.cele || z.cele, d.ocena);
    k.decyzje.push({ m: k.st.m, karta: `${s.id}: ${d.faza}`, tekst: d.tekst, ocena: d.ocena, dlaczego: d.dlaczego, scenariusz: s.id });
  }
  k.log('incydent', `${s.id} „${s.tytul}": ${wynik.zakonczenie}, jakość ${wynik.pkt}/100`);
  z.zagrane = true;
  return wynik;
}

// ── KONIEC MIESIĄCA ──
function zamknijMiesiac(k) {
  const st = k.st;
  k.akcje.push({ t: 'zamknij' });
  // Brak decyzji też jest decyzją — i tak jest oceniany. Bez tego gracz, który odpowiadał tylko
  // na obowiązkowe, miał 100% jakości decyzji (przypadki brzegowe, 13.10.2026).
  const top = (k.rezyser.diagnoza || []).slice(0, 2).map(p => p.id);
  for (const c of k.karty) {
    let ocena, dlaczego;
    if (c.zrodlo === 'dzial') {
      const o = c.opcje.find(x => x.odpowiedz === 'odloz');
      D.odpowiedz(k, c, 'odloz');
      ocena = o.ocena; dlaczego = `Brak odpowiedzi = odłożone. ${o.dlaczego}`;
      k.log('dzial', `${c.tytul}: brak odpowiedzi → odłożone`);
    } else if (c.zrodlo === 'sygnal') {
      ocena = 'blad'; dlaczego = 'Sygnał od ludzi bez reakcji — jeśli to był intruz, został w sieci.';
    } else if (c.zrodlo === 'odkrycie') {
      ocena = 'blad'; dlaczego = 'Znane obejście bez decyzji i bez właściciela ryzyka.';
    } else {
      const wazna = (c.problemy || []).some(p => top.includes(p));
      ocena = wazna ? 'blad' : 'dopuszczalna';
      dlaczego = wazna ? 'Pominięta sprawa dotyczyła największego problemu firmy w tym miesiącu.' : 'Pominięte — nie było to najpilniejsze.';
    }
    R.poDecyzji(k, c.cele, ocena);
    k.decyzje.push({ m: k.st.m, karta: c.tytul, tekst: '(brak decyzji)', ocena, dlaczego, pominieta: true });
  }
  k.karty = [];
  let intensywnosc = 0;
  for (const z of k.zdarzenia) {
    intensywnosc += z.ciezar || 0;
    if (z.typ === 'termin') terminSzbi(k);
    if (z.typ === 'fala') falaHaktywistow(k);
    if (z.typ === 'final') k.log('zarzad', 'Organ zapowiedział kontrolę — wynik na koniec kampanii.');
  }
  zastosujModyfikatory(k);
  k.rokZamkniety = k.rok;
  const wydatkiPrzed = st.w.wydatki, reagPrzed = st.w.reagowanie || 0;
  const zdarzenia = S.zakonczMiesiac(st);
  // Budżet bezpieczeństwa = abonamenty, pensje, zakupy; NIE koszty reagowania na incydenty.
  k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + (st.w.wydatki - wydatkiPrzed) - ((st.w.reagowanie || 0) - reagPrzed);
  k.mZamkniety = st.m - 1;
  k.raportIT = [];
  for (const e of zdarzenia) {
    if (e.typ === 'skutek') {
      intensywnosc += e.pln > S.PROG_POWAZNY ? 1 : 0.3;
      k.incydenty.push({ m: k.mZamkniety, rodzaj: e.rodzaj, pln: e.pln, wektor: e.wektor });
      const winny = D.incydentPrzezDzial(k, e.wektor);
      k.raportIT.push(`INCYDENT: ${OPIS_SKUTKU[e.rodzaj] || e.rodzaj} — koszt ${zl(e.pln)}` +
        (winny ? ` (wejście: ${D.INICJATYWY[winny.ini].nazwa}, ${k.dzialy[winny.dzial].nazwa}${winny.zrodlo === 'zgoda' ? ' — za Twoją zgodą' : ''})` : ''));
      if (e.pln > S.PROG_POWAZNY) {
        k.flagi.incydent_powazny = true;
        k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 8);
        // Poważny incydent kosztuje zaufanie zarządu — inaczej potakiwacz miał najwyższy mandat w grze.
        k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 8);
        if (winny?.zrodlo === 'zgoda') {
          k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 4);
          k.raportIT.push(`Zarząd: „Zgodził się Pan/Pani na to bez żadnych warunków" (${D.INICJATYWY[winny.ini].nazwa}).`);
        }
      }
      if (k.flagi.klamstwo_ankieta && S.dziala(st, 'ubezpieczenie') && e.pln > 50000) {
        k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 6);
        k.raportIT.push('Ubezpieczyciel odmówił wypłaty: odpowiedzi w ankiecie (MFA, EDR, kopie) były niezgodne z prawdą.');
      }
      for (const d of Object.values(k.dzialy)) d.dodatkoweObciazenie = (d.dodatkoweObciazenie || 0) + 0.3;
    } else if (e.typ === 'wykrycie') {
      // Mgła wojny: gracz nie wie, czy opanowanie się udało — zawsze widzi „usunięte".
      k.raportIT.push(`Wykryto i usunięto przyczółek (etap: ${e.etap}).`);
    }
  }
  if (st.ostatni.wdrozone.length) k.raportIT.push(`Wdrożono: ${st.ostatni.wdrozone.map(id => S.kontrola[id].nazwa).join('; ')}.`);
  if (st.ostatni.jakosc_ops < 0.8) k.raportIT.push(`Nie nadążamy z alertami — przejrzano ok. ${Math.round(st.ostatni.jakosc_ops * 100)}%.`);
  if (st.ostatni.utrzymanie_ulamek < 1) k.raportIT.push(`Brakuje godzin na utrzymanie zabezpieczeń (${Math.round(st.ostatni.utrzymanie_ulamek * 100)}% potrzeb).`);
  const niedokonczone = st.projekty.map(p => `${S.kontrola[p.id].nazwa} (${Math.round(100 * p.h / (S.kontrola[p.id].wdrozenie.h * Math.max(0.4, st.skalaH)))}%)`);
  if (niedokonczone.length) k.raportIT.push(`W toku: ${niedokonczone.join('; ')}.`);

  // Działy: nauka, plany, raporty; odkrycia obejść; sygnały.
  D.koniecOkresu(k);
  kalendarz(k);
  for (const d of Object.values(k.dzialy)) D.zaplanuj(k, d);
  k.raporty = Object.values(k.dzialy).map(d => D.raport(k, d));
  odkryjObejscia(k);
  // Fałszywe alarmy: bez nich karta „sygnał" = pewny intruz, czyli przeciek zza mgły wojny.
  const falszywe = [];
  for (const d of Object.values(k.dzialy)) {
    if (k.rnd.mgla() < 0.05 + 0.1 * d.swiadomosc) {
      const teksty = Object.values(D.SYGNALY);
      falszywe.push({ dzial: d.id, intruz: null, tekst: teksty[Math.floor(k.rnd.mgla() * teksty.length)] });
    }
  }
  for (const s of [...D.sygnaly(k), ...falszywe]) {
    dodajKarte(k, {
      id: `syg:${st.m}:${k.kartyNastepne.length}`, zrodlo: 'sygnal', intruz: s.intruz,
      tytul: `Sygnał: ${k.dzialy[s.dzial].nazwa}`, od: k.dzialy[s.dzial].szef, tresc: s.tekst, cele: ['E5'],
      opcje: [
        { tekst: 'Zbadać (analiza komputera/kont, logi) — 8 h.', h: 8, zbadaj: true, ocena: 'dobra',
          dlaczego: 'Sygnał od ludzi to często jedyny wczesny ślad intruza — wczesne wykrycie jest wielokrotnie tańsze.' },
        { tekst: 'Pewnie nic takiego.', ocena: 'blad', dlaczego: 'Zignorowany sygnał to darmowe wykrycie oddane napastnikowi.' },
      ],
    }, 'kartyNastepne');
  }
  // Wskaźniki miesięczne.
  kwartal(k, zdarzenia);
  // Kłamstwo w ankiecie ubezpieczeniowej wychodzi nie tylko przy szkodzie: ubezpieczyciel
  // weryfikuje przy odnowieniu (w grze ~5%/mies.). Dawniej kłamca wychodził NA PLUS (docs/17-…).
  if (k.flagi.klamstwo_ankieta && !k.flagi.klamstwo_wykryte && S.dziala(st, 'ubezpieczenie') && k.rnd.mgla() < 0.05) {
    k.flagi.klamstwo_wykryte = true;
    st.zamowione.delete('ubezpieczenie'); delete st.aktywne.ubezpieczenie;
    k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 8);
    k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 3);
    k.raportIT.push('Ubezpieczyciel sprawdził deklaracje z ankiety (MFA, EDR, kopie offline) — były nieprawdziwe. Polisa wypowiedziana, zarząd wie dlaczego.');
  }
  // Przekroczenie budżetu boli proporcjonalnie (7× ponad budżet dawało dawniej −2/mies.).
  const rokZamk = k.rokZamkniety;
  const nad = (k.wydaneRok[rokZamk] || 0) / Math.max(1, k.budzet[rokZamk] || 0) - 1;
  if (nad > 0) k.wskazniki.mandat = przytnij(k.wskazniki.mandat - Math.min(15, 2 + 8 * nad));
  // Nadgodziny: −1 morale za każde 4 h ponad etat gracza.
  const nadgodziny = k.hKart - (k.def.h_gracza || 0);
  k.wskazniki.morale = przytnij(k.wskazniki.morale + (nadgodziny > 0 ? -nadgodziny / 4 : 1));
  // Reputacja na dnie (lokalne media, wójt) zjada zaufanie zarządu.
  if (k.wskazniki.reputacja < 20) k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 2);
  k.tarcie = KONTROLE.filter(x => S.dziala(st, x.id)).reduce((a, x) => a + (x.tarcie || 0), 0);
  R.poMiesiacu(k, intensywnosc);
  k.hKart = 0;
  // Kontrola liczy się zawsze na koniec — dawniej liczona w m. 23 ignorowała ostatni miesiąc pracy.
  if (st.m > k.def.miesiecy || k.wskazniki.mandat <= 0) { k.koniec = true; k.kontrola = ocenaKontroli(k); return; }
  rozpocznijMiesiac(k);
}

// Kwartalna ocena zarządu: nagroda za DOWIEZIONE wdrożenia i spokojny kwartał, kara za terminy.
// Bez niej mandat rósł tylko od uprzejmości (zgody, wyjątki), a malał od dobrych decyzji
// (MFA, segmentacja kosztują tarcie) — potakiwacz był ulubieńcem prezesa (docs/17-…).
function kwartal(k, zdarzenia) {
  const q = k.q || (k.q = { powazne: 0, wdrozone: 0, terminy: 0 });
  q.powazne += zdarzenia.filter(e => e.typ === 'skutek' && e.pln > S.PROG_POWAZNY).length;
  q.wdrozone += k.st.ostatni.wdrozone.length;
  if (k.mZamkniety % 3) return;
  let d = 0;
  if (!q.powazne && !k.incydenty.some(i => i.m > k.mZamkniety - 3 && /S0|fala/.test(i.rodzaj) && i.pln > 0)) d += 2;
  d += Math.min(3, q.wdrozone);
  if (k.flagi.szbi_po_terminie && !k.flagi.szbi_kara_kwartal) { d -= 3; k.flagi.szbi_kara_kwartal = true; }
  if (k.m > 7 && !k.flagi.wpis) d -= 2;
  k.wskazniki.mandat = przytnij(k.wskazniki.mandat + d);
  k.raportIT.push(`Kwartalna ocena zarządu: ${d >= 0 ? '+' : ''}${d} mandatu (wdrożenia: ${q.wdrozone}, poważne incydenty: ${q.powazne}).`);
  k.q = { powazne: 0, wdrozone: 0, terminy: 0 };
}

const OPIS_SKUTKU = { szyfrowanie: 'ransomware zaszyfrował systemy', wyciek: 'wyciek danych', sabotaz: 'sabotaż (zmiana parametrów / zakłócenie)',
  szpiegostwo: 'długotrwałe szpiegostwo wykryte z zewnątrz', wyciek_insider: 'wyniesienie danych przez osobę z wewnątrz',
  bec: 'wyłudzenie przelewu', ddos: 'atak DDoS na e-BOK' };

// Inwentaryzacja i skany ujawniają obejścia działów — w karcie: zalegalizować czy ukarać.
function odkryjObejscia(k) {
  const st = k.st;
  const sila = (S.dziala(st, 'inwentaryzacja') ? 0.35 : 0) + (S.dziala(st, 'moje_cert') ? 0.15 : 0) + (S.dziala(st, 'asm') ? 0.25 : 0);
  if (!sila) return;
  for (const d of Object.values(k.dzialy)) {
    // Dział, który boi się kary, ukrywa się lepiej (prywatne urządzenia, poza siecią firmy).
    const ukrywanie = 0.4 + 0.6 * d.zaufanie;
    for (const u of d.ukryte) {
      if (u.odkryte || k.rnd.rezyser() >= sila * ukrywanie) continue;
      u.odkryte = true;
      dodajKarte(k, D.kartaOdkrycia(k, d.id, u), 'kartyNastepne');
    }
  }
}

function terminSzbi(k) {
  if (S.dziala(k.st, 'szbi')) { k.wskazniki.mandat = przytnij(k.wskazniki.mandat + 3); k.log('termin', 'SZBI wdrożony przed 3.04.2027.'); }
  else if (k.st.projekty.some(p => p.id === 'szbi')) { k.flagi.szbi_po_terminie = true; k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 2); k.log('termin', 'Termin SZBI minął, wdrożenie w toku — spóźnienie, ale nie zaniechanie.'); }
  else { k.flagi.szbi_po_terminie = true; k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 5); k.log('termin', 'Minął termin SZBI (3.04.2027) — obowiązki niewdrożone.'); }
}

function falaHaktywistow(k) {
  const st = k.st;
  const chronione = S.dziala(st, 'segmentacja') || S.dziala(st, 'ot_monitoring');
  const odciete = k.flagi.hmi_odciete || S.dziala(st, 'ekspozycja');
  let pln = 0, opis;
  if (chronione && odciete) { opis = 'Druga fala haktywistów: próby odbite, krótki DDoS na e-BOK.'; k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 1); }
  else if (odciete) {
    // Panel zamknięty, ale sieć płaska: napastnik dochodzi tylko do telemetrii przepompowni.
    // Drobne zakłócenie, NIE poważny incydent — dawniej fala zawsze była „poważna", także
    // u najlepszych graczy (P(poważny) = 100% we wszystkich stylach, docs/17-…).
    pln = (S.dziala(st, 'bcp') ? 0.25 : 0.5) * st.firma.koszt_dnia + 10000;
    opis = 'Druga fala haktywistów: krótkie zakłócenie telemetrii przepompowni (sieć bez segmentacji).';
    st.w.straty += pln; st.w.szczegoly.sabotaz = (st.w.szczegoly.sabotaz || 0) + pln;
    k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 2);
    k.incydenty.push({ m: st.m, rodzaj: 'fala haktywistów (drobna)', pln });
  } else {
    pln = (odciete ? 1 : 2) * st.firma.koszt_dnia * (S.dziala(st, 'bcp') ? 0.5 : 1) + 50000;
    opis = `Druga fala haktywistów: zakłócenie pracy przepompowni (${odciete ? 'przez obejście w sieci' : 'przez wystawione urządzenia'}).`;
    st.w.straty += pln; st.w.szczegoly.sabotaz = (st.w.szczegoly.sabotaz || 0) + pln;
    k.flagi.incydent_powazny = true; k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 8);
    k.incydenty.push({ m: st.m, rodzaj: 'fala haktywistów', pln });
  }
  k.log('swiat', opis);
}

// Kontrola/audyt na koniec (docs/12 scenariusz S12 — tu wersja liczona z rejestru stanu).
function ocenaKontroli(k) {
  const d = id => S.dziala(k.st, id);
  const f = k.flagi;
  const obszary = [
    ['SZBI i ład', d('szbi') ? (f.polityki_z_pudelka ? 'drobna' : 'zgodny') : 'glowna'],
    ['Szacowanie ryzyka', d('ryzyko') ? 'zgodny' : 'glowna'],
    ['Incydenty i zgłoszenia', d('plan_ir') ? (f.incydent_powazny && !f.zgloszone_w_terminie ? 'drobna' : 'zgodny') : 'glowna'],
    ['Ciągłość działania', d('backup') && (d('dr_test') || d('bcp')) ? (f.kopie_ot ? 'zgodny' : 'drobna') : d('backup') ? 'drobna' : 'glowna'],
    ['Łańcuch dostaw', d('dostawcy') || f.umowa_integratora ? 'zgodny' : 'glowna'],
    ['Dostęp i tożsamość', d('mfa') ? (f.wyjatek_mfa_zarzad ? 'drobna' : 'zgodny') : 'glowna'],
    ['Podatności', d('patch') || d('skaner_podatnosci') ? 'zgodny' : d('ekspozycja') ? 'drobna' : 'glowna'],
    ['Monitorowanie', d('edr') || d('mdr') || d('siem') || d('siem_os') ? 'zgodny' : 'glowna'],
    // Szkolenie kierownika jest ROCZNE: liczy się rok przed kontrolą (albo bieżący), nie „kiedyś".
    ['Szkolenia (w tym kierownika)', ((sk) => (d('szkolenia') && sk ? 'zgodny' : d('szkolenia') || sk ? 'drobna' : 'glowna'))(f[`szkolenie_kierownika_${k.rok}`] || f[`szkolenie_kierownika_${k.rok - 1}`])],
    ['Wykaz', f.wpis ? (f.wpis_spozniony ? 'drobna' : 'zgodny') : 'glowna'],
  ];
  const pkt = { zgodny: 6, drobna: 4, glowna: 1 };
  return { obszary, wynik: obszary.reduce((a, [, s]) => a + pkt[s], 0) };
}

// ── WIDOKI (to, co gracz WIE) ──
function naglowek(k) {
  const wyd = k.wydaneRok[k.rok] || 0;
  return `\n══════ Miesiąc ${k.st.m}/${k.def.miesiecy} — ${nazwaMiesiaca(k)} ══════\n` +
    `Budżet ${k.rok}: wydane ${zl(wyd)}, z abonamentami do grudnia ${zl(zobowiazaniaRoku(k))} z ${zl(k.budzet[k.rok] || 0)} · ` +
    `Twoje godziny: ${k.def.h_gracza} h (na karty: ${k.hKart} h, maks. ${Math.round(k.def.h_gracza * LIMIT_NADGODZIN)}) · ` +
    `Mandat ${Math.round(k.wskazniki.mandat)} · Reputacja ${Math.round(k.wskazniki.reputacja)} · Morale ${Math.round(k.wskazniki.morale)}`;
}

function briefing(k) {
  const l = [];
  if (k.st.m === 1) l.push(...k.def.wstep, '');
  for (const z of k.zdarzenia) if (!z.zagrane && z.typ === 'scenariusz') l.push(`⚠ PILNE: ${z.opis} — rozegraj przed zamknięciem miesiąca.`);
  for (const z of k.zdarzenia) if (z.typ !== 'scenariusz') l.push(`• Na koniec miesiąca: ${z.opis || z.id}`);
  if (k.raportIT?.length) { l.push('Raport IT/bezpieczeństwa z poprzedniego miesiąca:'); for (const r of k.raportIT) l.push(`  – ${r}`); }
  l.push(`Kart do decyzji: ${k.karty.length}${k.karty.some(c => c.obowiazkowa) ? ' (są obowiązkowe)' : ''}.`);
  return l.join('\n');
}

function coWiemy(k) {
  const st = k.st;
  const ew = st.zasobyZnane;
  // Szacunek ma STAŁY błąd kampanii (k.mglaBlad), który maleje po inwentaryzacji — dawniej
  // środek przedziału był dokładnie prawdą, więc gracz „widział" przez mgłę.
  const inw = S.dziala(st, 'inwentaryzacja');
  const sz = (ew / st.znane) * (1 + k.mglaBlad * (inw ? 0.15 : 1));
  const nier = inw ? 0.08 : 0.35;     // bez inwentaryzacji tylko zgadujemy
  const lo = Math.max(ew, Math.round(sz * (1 - nier))), hi = Math.round(sz * (1 + nier));
  const czynne = KONTROLE.filter(x => S.dziala(st, x.id)).map(x => x.nazwa);
  return [
    `Zasoby w ewidencji: ${ew}; prawdziwa liczba: prawdopodobnie ${lo}–${hi}.`,
    `Działające zabezpieczenia: ${czynne.join('; ') || 'brak'}.`,
    `W toku: ${st.projekty.map(p => S.kontrola[p.id].nazwa).join('; ') || 'nic'}.`,
    `Status KSC: ${k.flagi.status || 'nieustalony'}; wpis do wykazu: ${k.flagi.wpis ? 'tak' : 'nie'}.`,
    `Poniesione straty z incydentów: ${zl(st.w.straty)}. Łączne wydatki: ${zl(st.w.wydatki)}.`,
  ].join('\n');
}

function pokazKarte(k, c, i) {
  const l = [`\n[${i + 1}] ${c.obowiazkowa ? '(obowiązkowa) ' : ''}${c.tytul} — od: ${c.od}`, `    ${c.tresc}`];
  c.opcje.forEach((o, j) => { const b = niedostepna(k, o); l.push(`    ${String.fromCharCode(97 + j)}) ${o.tekst}${b ? `   [niedostępne: ${b}]` : ''}`); });
  return l.join('\n');
}

function podsumowanie(k) {
  const st = k.st;
  const l = ['\n════════ KONIEC KAMPANII ════════'];
  if (k.io) {
    l.push(`INDEKS ODPORNOŚCI: ${k.io.wynik}/1000  (straty ${Math.round(100 * k.io.skladowe.straty)}% · budżet ${Math.round(100 * k.io.skladowe.budzet)}% · ` +
      `woda ${Math.round(100 * k.io.skladowe.niefinansowe)}% · zgodność ${Math.round(100 * k.io.skladowe.zgodnosc)}% · reputacja ${Math.round(100 * k.io.skladowe.reputacja)}% · ` +
      `dojrzałość ${Math.round(100 * k.io.skladowe.dojrzalosc)}% · ludzie ${Math.round(100 * k.io.skladowe.ludzie)}% · biznes ${Math.round(100 * k.io.skladowe.biznes)}%)`);
    l.push(`  (straty porównane z graczem biernym w tej samej „pogodzie": ${zl(k.io.odniesienie)})`);
  }
  if (k.wskazniki.mandat <= 0) l.push('Zarząd stracił zaufanie i odwołał Cię ze stanowiska.');
  const jd = k.decyzje.length ? k.decyzje.reduce((a, d) => a + PKT[d.ocena], 0) / k.decyzje.length : 0;
  l.push(`Jakość decyzji: ${Math.round(jd * 100)}% (${k.decyzje.length} decyzji)`);
  l.push(`Straty z incydentów: ${zl(st.w.straty)} · Wydatki: ${zl(st.w.wydatki)} · Razem: ${zl(st.w.straty + st.w.wydatki)}`);
  const zakl = k.incydenty.filter(i => /sabota|S03|fala/.test(i.rodzaj) && i.pln >= 50000).length;
  l.push(`Zakłócenia procesu uzdatniania / przepompowni: ${zakl} · Reputacja: ${Math.round(k.wskazniki.reputacja)} · Mandat: ${Math.round(k.wskazniki.mandat)}`);
  const ref = referencja(k.def.firma);
  // Uwaga: Monte Carlo to samo tło silnika — BEZ działów, reżysera, scenariuszy i fal. Pokazuje,
  // że w małej spółce wodnej rachunek „w złotówkach" jest niski; prawdziwa stawka to woda,
  // zdrowie, prawo i ogon ryzyka (docs/16-…, docs/14-…).
  l.push(`Tło silnika (Monte Carlo bez działów i scenariuszy, 300 przebiegów): „nic" ${zl(ref.nic)}, „mała firma" ${zl(ref.mala_firma)}, „higiena+MDR" ${zl(ref.higiena_mdr)}`);
  if (k.kontrola) {
    l.push(`Kontrola/audyt: ${k.kontrola.wynik}/60 pkt`);
    for (const [o, s] of k.kontrola.obszary) l.push(`  ${s === 'zgodny' ? '✅' : s === 'drobna' ? '⚠️' : '❌'} ${o}: ${s === 'glowna' ? 'niezgodność główna' : s === 'drobna' ? 'niezgodność drobna' : 'zgodny'}`);
  }
  l.push('Incydenty:');
  for (const i of k.incydenty) l.push(`  m. ${i.m}: ${OPIS_SKUTKU[i.rodzaj] || i.rodzaj} — ${zl(i.pln)}`);
  if (!k.incydenty.length) l.push('  brak');
  l.push('Mgła wojny — prawda (dopiero teraz):');
  l.push(`  intruzi wciąż w sieci: ${st.intruzi.length ? st.intruzi.map(x => `${x.kto}@${x.etap}`).join(', ') : 'brak'}`);
  l.push(`  zasoby poza ewidencją: ${Math.round(st.zasobyZnane / st.znane - st.zasobyZnane)}`);
  l.push('Działy (czego się nauczyły):');
  for (const d of Object.values(k.dzialy)) {
    l.push(`  ${d.nazwa}: zaufanie ${d.zaufanie.toFixed(2)}, Q pytaj ${d.Q.pytaj.toFixed(2)} / obejdź ${d.Q.obejdz.toFixed(2)}, ` +
      `świadomość ${d.swiadomosc.toFixed(2)}, ukryte obejścia: ${d.ukryte.filter(u => !u.odkryte).map(u => D.INICJATYWY[u.ini].nazwa).join(', ') || 'brak'}`);
  }
  l.push(`Przeciwnik — wagi wektorów: ${Object.entries(k.rezyser.wagi).map(([w, v]) => `${w} ${v.toFixed(2)}`).join(', ') || 'bez zmian'}`);
  l.push(`Model gracza (P opanowania celów): ${Object.entries(k.rezyser.bkt).map(([c, p]) => `${c} ${p.toFixed(2)}`).join(' ')}`);
  const zle = k.decyzje.filter(d => d.ocena === 'blad').slice(0, 5);
  if (zle.length) { l.push('Decyzje do przemyślenia:'); for (const d of zle) l.push(`  ❌ m. ${d.m} ${d.karta}: ${d.tekst}\n     ${d.dlaczego}`); }
  return l.join('\n');
}

// ── INDEKS ODPORNOŚCI (docs/11-…, 11.2) — końcowa ocena kampanii ──
// Mandat NIE jest wynikiem: przypadki brzegowe pokazały, że potakiwacz ma podobny mandat jak
// najlepszy gracz (zarząd nie widzi ryzyka, dopóki nie wybuchnie). Wynik liczy skutki.
// Straty porównujemy z graczem BIERNYM na tym samym ziarnie („ta sama pogoda").
const KLUCZOWE = ['mfa', 'backup', 'plan_ir', 'bcp', 'inwentaryzacja', 'patch', 'edr', 'szbi', 'ryzyko', 'ekspozycja'];
async function indeksOdpornosci(k) {
  const ref = k.refBierny ?? (k.refBierny = (await grajAuto('bierny', k.seed, false, () => {}, false)).st.w.straty);
  const c = (x) => Math.max(0, Math.min(1, x));
  const budzetSuma = Object.values(k.budzet).reduce((a, b) => a + b, 0);
  // Zakłócenie procesu = zdarzenie OT z kosztem od 50 tys. zł (drobne nie liczą się jako przerwa w dostawie wody).
  const zakl = k.incydenty.filter(i => /sabota|S03|fala/.test(i.rodzaj) && i.pln >= 50000).length;
  const sd = k.statDzialow || { pytania: 0, zablokowane: 0 };
  const sk = {
    straty: c((1 - k.st.w.straty / Math.max(1, ref)) / 0.9),
    budzet: c(1 - Math.max(0, (k.st.w.wydatki - (k.st.w.reagowanie || 0)) / Math.max(1, budzetSuma) - 1)),
    niefinansowe: c(1 - zakl / 3),
    zgodnosc: (k.kontrola?.wynik || 0) / 60,
    reputacja: c(k.wskazniki.reputacja / (k.def.wskazniki.reputacja || 60)),
    dojrzalosc: KLUCZOWE.filter(id => S.dziala(k.st, id)).length / KLUCZOWE.length,
    ludzie: c(k.wskazniki.morale / 100),
    // Biznes: jaka część próśb działów doszła do skutku (zgoda/„tak, ale"). Bez tej składowej
    // gracz odmawiający wszystkiego wychodził LEPIEJ niż rozsądny (docs/17-…).
    biznes: sd.pytania ? c(1 - sd.zablokowane / sd.pytania) : 1,
  };
  const wagi = { straty: 0.25, budzet: 0.05, niefinansowe: 0.20, zgodnosc: 0.15, reputacja: 0.10, dojrzalosc: 0.10, ludzie: 0.05, biznes: 0.10 };
  const wynik = Math.round(1000 * Object.entries(wagi).reduce((a, [n, w]) => a + w * sk[n], 0));
  return { wynik, skladowe: sk, odniesienie: ref };
}

let refCache = null;
function referencja(firmaId) {
  if (refCache) return refCache;
  const { symuluj, STRATEGIE } = require('./symulacja');
  const firma = FIRMY[firmaId];
  refCache = {};
  for (const s of ['nic', 'mala_firma', 'higiena_mdr']) {
    let suma = 0;
    for (let i = 0; i < 300; i++) { const w = symuluj(firma, STRATEGIE[s], 5000 + i); suma += w.wydatki + w.straty; }
    refCache[s] = suma / 300;
  }
  return refCache;
}

// ── STRATEGIE AUTOMATYCZNE (testy: czy działy i reżyser zachowują się sensownie) ──
const AUTO = {
  rozsadny: {
    karta: c => {
      if (c.zrodlo === 'dzial') return c.opcje.findIndex(o => o.odpowiedz === (D.ciezarRyzyka(D.INICJATYWY[c.ini]) < 0.1 ? 'zgoda' : 'warunki'));
      const j = c.opcje.findIndex(o => o.ocena === 'dobra');
      return j >= 0 ? j : 0;
    },
    scen: opcje => Math.max(0, opcje.findIndex(o => o.ocena === 'dobra')),
  },
  odmawiajacy: {
    karta: c => {
      if (c.zrodlo === 'dzial') return c.opcje.findIndex(o => o.odpowiedz === 'odmowa');
      if (c.zrodlo === 'odkrycie') return c.opcje.findIndex(o => o.odpowiedz === 'kara');
      return Math.max(0, c.opcje.findIndex(o => o.ocena === 'dobra'));
    },
    scen: opcje => Math.max(0, opcje.findIndex(o => o.ocena === 'dobra')),
  },
  bierny: {
    // obowiązkowe: najgorsza opcja; reszta bez decyzji (kolejność opcji jest tasowana)
    karta: c => (c.obowiazkowa ? Math.max(0, c.opcje.findIndex(o => o.ocena === 'blad')) : null),
    scen: opcje => Math.max(0, opcje.findIndex(o => o.ocena === 'blad')),
  },
  // Rozsądny + pilnuje budżetu: co miesiąc dokupuje z listy priorytetów (tanie podstawy najpierw),
  // a gdy dobra opcja jest za droga — bierze najlepszą dostępną. Dowód, że gra jest wygrywalna
  // przy twardym budżecie i limicie godzin.
  madry: {
    priorytety: ['moje_cert', 'ekspozycja', 'weryfikacja_platnosci', 'mfa', 'backup', 'plan_ir', 'inwentaryzacja',
      'bcp', 'patch', 'szkolenia', 'edr', 'dr_test', 'ryzyko', 'szbi', 'dostawcy', 'msp', 'segmentacja'],
    miesiac(k) {
      let n = 0;
      for (const id of this.priorytety) {
        if (n >= 2 || k.st.zamowione.has(id)) continue;
        if (!zlecRecznie(k, id)) n++;
      }
    },
    karta: (c, k) => {
      const dost = j => j >= 0 && !niedostepna(k, c.opcje[j]);
      if (c.zrodlo === 'dzial') {
        const chce = D.ciezarRyzyka(D.INICJATYWY[c.ini]) < 0.1 ? 'zgoda' : 'warunki';
        for (const x of [chce, 'alternatywa']) { const j = c.opcje.findIndex(o => o.odpowiedz === x); if (dost(j)) return j; }
      }
      if (c.zrodlo === 'odkrycie') { const j = c.opcje.findIndex(o => o.odpowiedz === 'legalizacja'); if (dost(j)) return j; }
      const ranga = { dobra: 2, dopuszczalna: 1, blad: 0 };
      const kolej = c.opcje.map((o, j) => j).filter(dost).sort((a, b) => ranga[c.opcje[b].ocena] - ranga[c.opcje[a].ocena]);
      return kolej.length ? kolej[0] : 0;
    },
    scen: opcje => Math.max(0, opcje.findIndex(o => o.ocena === 'dobra')),
  },
};

// `nazwa` = klucz z AUTO albo gotowy obiekt strategii { karta(c, k), scen(opcje, k), miesiac?(k) }
// (laboratorium przypadków brzegowych podaje własne, celowo głupie albo cwane strategie).
async function grajAuto(nazwa, seed, szczegoly, wypisz = console.log, podsumuj = true) {
  const strat = typeof nazwa === 'string' ? AUTO[nazwa] : nazwa;
  const k = nowaKampania('wodociagi', seed);
  const cicho = () => {};
  const console = { log: wypisz };
  while (!k.koniec) {
    if (strat.miesiac) strat.miesiac(k);
    for (const z of k.zdarzenia.filter(x => x.typ === 'scenariusz' && !x.zagrane)) {
      await zagrajZdarzenie(k, z, async o => strat.scen(o, k), cicho);
    }
    for (const c of [...k.karty]) {
      const j = strat.karta(c, k);
      if (j === null || j < 0) continue;
      try { rozstrzygnij(k, c.id, j); } catch (e) {
        if (!e.niedostepna) throw e;
        // Wybrana opcja niedostępna (godziny/budżet) — najlepsza dostępna wg oceny.
        const ranga = { dobra: 2, dopuszczalna: 1, blad: 0 };
        const dost = c.opcje.map((o, i) => [o, i]).filter(([o]) => !niedostepna(k, o)).sort((a, b) => ranga[b[0].ocena] - ranga[a[0].ocena]);
        if (dost.length) rozstrzygnij(k, c.id, dost[0][1]);
      }
    }
    const linia = `m.${String(k.st.m).padStart(2)} ${nazwaMiesiaca(k).padEnd(16)} mandat ${String(Math.round(k.wskazniki.mandat)).padStart(3)} ` +
      `rep ${String(Math.round(k.wskazniki.reputacja)).padStart(3)} | zaufanie działów ` +
      Object.values(k.dzialy).map(d => `${d.id.slice(0, 4)} ${d.zaufanie.toFixed(2)}`).join(' ') +
      ` | ukryte ${Object.values(k.dzialy).reduce((a, d) => a + d.ukryte.filter(u => !u.odkryte).length, 0)}`;
    console.log(linia);
    if (szczegoly) for (const r of k.rejestr.filter(x => x.m === k.st.m)) console.log(`      [${r.kto}] ${r.tekst}`);
    zamknijMiesiac(k);
  }
  if (podsumuj) { k.io = await indeksOdpornosci(k); console.log(podsumowanie(k)); }
  return k;
}

// Odtworzenie kampanii z listy decyzji (zapis gry). Te same akcje + to samo ziarno = ten sam stan.
async function odtworz(defId, seed, akcje) {
  const k = nowaKampania(defId, seed);
  for (const a of akcje) {
    if (a.t === 'karta') rozstrzygnij(k, a.id, a.j);
    else if (a.t === 'zlec') zlecRecznie(k, a.id);
    else if (a.t === 'zamknij') zamknijMiesiac(k);
    else if (a.t === 'scen') {
      const z = k.zdarzenia.find(x => x.id === a.id);
      const kolejka = [...a.wybory];
      await zagrajZdarzenie(k, z, async () => kolejka.shift(), () => {});
    }
  }
  return k;
}

// ── GRA INTERAKTYWNA ──
// Wejście linia po linii z kolejką: działa i w terminalu, i z potoku (testy skryptem).
// rl.question gubi linie, które przyszły, zanim padło pytanie — stąd własna kolejka.
function wejscie() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const kolejka = [];
  let czeka = null, zamkniete = false;
  rl.on('line', l => { if (czeka) { const c = czeka; czeka = null; c(l); } else kolejka.push(l); });
  rl.on('close', () => { zamkniete = true; if (czeka) { const c = czeka; czeka = null; c(null); } });
  const pytaj = q => {
    process.stdout.write(q);
    if (kolejka.length) return Promise.resolve(kolejka.shift());
    if (zamkniete) return Promise.resolve(null);
    return new Promise(r => { czeka = r; });
  };
  return { pytaj, zamknij: () => rl.close() };
}

async function grajInteraktywnie(plikZapisu) {
  let seed = Math.floor(Math.random() * 1e9);
  let zapisane = [];
  if (plikZapisu && fs.existsSync(plikZapisu)) {
    const z = JSON.parse(fs.readFileSync(plikZapisu, 'utf8'));
    seed = z.seed; zapisane = z.akcje;
  }
  const k = await odtworz('wodociagi', seed, zapisane);
  const { pytaj, zamknij } = wejscie();
  const rl = { close: zamknij };
  const zapisz = () => { if (plikZapisu) fs.writeFileSync(plikZapisu, JSON.stringify({ seed, akcje: k.akcje })); };

  while (!k.koniec) {
    console.log(naglowek(k));
    console.log(briefing(k));
    const menu = '\n[r] raporty działów  [k] karty  [i] incydent  [z] zleć zabezpieczenie  [s] co wiemy  [d] dziennik reżysera  [n] zamknij miesiąc  [q] zapisz i wyjdź';
    const linia = await pytaj(`${menu}\n> `);
    const cmd = (linia ?? 'q').trim().toLowerCase();       // koniec wejścia = zapisz i wyjdź
    if (cmd === 'q') { zapisz(); rl.close(); console.log(plikZapisu ? `Zapisano w ${plikZapisu}.` : 'Bez pliku zapisu (--zapis=plik.json).'); return; }
    if (cmd === 'r') {
      for (const r of k.raporty.length ? k.raporty : [{ naglowek: 'Raporty', linie: ['Pierwsze raporty działów przyjdą po zamknięciu miesiąca.'] }]) {
        console.log(`\n■ ${r.naglowek}`); for (const x of r.linie) console.log(`  ${x}`);
      }
    } else if (cmd === 's') console.log(coWiemy(k));
    else if (cmd === 'd') {
      // Tryb prowadzącego/debug: dziennik reżysera i działów (w grze widoczny dopiero w debriefie).
      for (const r of k.rejestr.filter(x => x.m === k.st.m)) console.log(`  [${r.kto}] ${r.tekst}`);
    } else if (cmd === 'i') {
      const z = k.zdarzenia.find(x => x.typ === 'scenariusz' && !x.zagrane);
      if (!z) { console.log('Brak incydentu do rozegrania.'); continue; }
      await zagrajZdarzenie(k, z, async opcje => {
        for (;;) {
          const l = await pytaj('Twoja decyzja: ');
          if (l === null) throw new Error('Koniec wejścia w trakcie incydentu — zapis do ostatniej pełnej decyzji.');
          const n = Number(l); if (n >= 1 && n <= opcje.length) return n - 1;
        }
      });
      zapisz();
    } else if (cmd === 'k') {
      if (!k.karty.length) { console.log('Brak kart.'); continue; }
      k.karty.forEach((c, i) => console.log(pokazKarte(k, c, i)));
      const w = ((await pytaj('\nWybierz np. „1a" (Enter = wróć): ')) ?? '').trim().toLowerCase();
      const mm = w.match(/^(\d+)([a-z])$/);
      if (!mm) continue;
      const c = k.karty[Number(mm[1]) - 1];
      const j = mm[2].charCodeAt(0) - 97;
      if (!c || !c.opcje[j]) { console.log('Nie ma takiej opcji.'); continue; }
      const o = c.opcje[j];
      const brak = niedostepna(k, o);
      if (brak) { console.log(`Niedostępne: ${brak}.`); continue; }
      const wynik = rozstrzygnij(k, c.id, j);
      console.log(`${IKONA[o.ocena]} ${o.dlaczego}${wynik ? `\n   ${wynik}` : ''}`);
      zapisz();
    } else if (cmd === 'z') {
      const dostepne = KONTROLE.filter(x => !k.st.zamowione.has(x.id));
      dostepne.forEach((x, i) => console.log(`  ${String(i + 1).padStart(2)}) ${x.nazwa} — wdrożenie ${zl(x.wdrozenie.pln)} + ${x.wdrozenie.h} h, ` +
        `mies. ${zl(S.kosztMiesieczny(k.st, x.id))} + ${x.utrzymanie.h || 0} h`));
      const n = Number(await pytaj('Numer (Enter = wróć): '));
      if (n >= 1 && n <= dostepne.length) {
        const brak = zlecRecznie(k, dostepne[n - 1].id);
        console.log(brak ? `Nie zlecono: ${brak}.` : `Zlecono. Pułapka: ${dostepne[n - 1].pulapka}`);
        if (!brak) zapisz();
      }
    } else if (cmd === 'n') {
      if (k.zdarzenia.some(x => x.typ === 'scenariusz' && !x.zagrane)) { console.log('Najpierw rozegraj incydent [i].'); continue; }
      if (k.karty.some(c => c.obowiazkowa)) { console.log('Są obowiązkowe karty [k].'); continue; }
      const otwarte = k.karty.filter(c => c.zrodlo === 'dzial').length;
      if (otwarte && ((await pytaj(`${otwarte} działów czeka na odpowiedź — zamknięcie = „odłóż". Zamknąć? [t/n] `)) ?? '').trim() !== 't') continue;
      zamknijMiesiac(k);
      zapisz();
    }
  }
  k.io = await indeksOdpornosci(k);
  console.log(podsumowanie(k));
  rl.close();
}

async function main() {
  const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1];
  const auto = arg('auto');
  if (auto) {
    if (!AUTO[auto]) { console.error(`Strategie: ${Object.keys(AUTO).join(', ')}`); process.exit(1); }
    await grajAuto(auto, Number(arg('seed') || 7), process.argv.includes('--szczegoly'));
  } else await grajInteraktywnie(arg('zapis'));
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { walidujKampanie, indeksOdpornosci, niedostepna, nowaKampania, rozstrzygnij, zamknijMiesiac, zagrajZdarzenie, zlecRecznie, ocenaKontroli, podsumowanie, AUTO, grajAuto, odtworz };
