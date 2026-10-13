// ── KAMPANIA W TERMINALU (silnik ruchów, we własnym tempie gracza) ──
// Grywalny prototyp pierwszej kampanii („Wodnik"). Projekt: docs/18-silnik-ruchow.md.
// Nie ma kart z odpowiedziami: gracz w każdej chwili może zagrać DOWOLNY ruch (wdrożyć,
// przejrzeć, przetestować, zmienić, wycofać, zbadać, porozmawiać, zgłosić…), odpowiada na
// sprawy z terminami i prowadzi incydenty w dowolnej kolejności akcji. Gracz sam zamyka
// miesiąc. Łączy:
//   silnik.js   — miesiąc (wspólny z Monte Carlo)
//   ruchy.js    — ruchy gracza i cykl życia kontroli (obiekty, jakość, usterki, dryf)
//   sprawy.js   — skrzynka spraw (prośby działów, odkrycia, sygnały, sprawy kampanii)
//   incydent.js — incydenty bez drzewa decyzji (scenariusze/*.incydent.js)
//   zasady.js   — ocena praktyki (zamiast klucza odpowiedzi)
//   dzialy.js   — działy-agenci; rezyser.js — diagnoza, obserwacje, rytm, przeciwnik
//
//   node ciso-sim/proto/kampania.js                         — gra (zapis: --zapis=plik.json)
//   node ciso-sim/proto/kampania.js --auto=madry|rozsadny|odmawiajacy|bierny [--seed=7] [--szczegoly]
//
// Zapis to LISTA AKCJI, nie stan: wczytanie odtwarza kampanię z ziarna (każda akcja przechodzi
// przez jeden z dyspozytorów: RU.wykonaj, SP.odpowiedz, incydent*, zamknijMiesiac).

const fs = require('fs');
const readline = require('readline');
const S = require('./silnik');
const D = require('./dzialy');
const R = require('./rezyser');
const Z = require('./zasoby');
const RU = require('./ruchy');
const SP = require('./sprawy');
const I = require('./incydent');
const ZA = require('./zasady');
const CY = require('./cykl');
const DR = require('./doradztwo');
const CYKLICZNE = require('../data/cykliczne');
const FIRMY = require('../data/firmy');
const KONTROLE = require('../data/kontrole');
const INICJATYWY = require('../data/dzialy');

const MIES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień',
  'październik', 'listopad', 'grudzień'];
const zl = Z.zl;
const przytnij = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const blad = msg => { const e = new Error(msg); e.niedostepny = true; return e; };

// ── WALIDACJA DANYCH KAMPANII ── (zły plik kampanii nie startuje; powód na liście)
function walidujKampanie(def) {
  const b = [];
  const firma = FIRMY[def.firma];
  if (!firma) b.push(`nieznana firma ${def.firma}`); else b.push(...S.walidujFirme(firma).map(x => `firma: ${x}`));
  const okno = (o, n) => { const [od, doM] = o || []; if (!(od >= 1 && doM >= od && doM <= def.miesiecy)) b.push(`${n}: złe okno ${o}`); };
  for (const [id, d] of Object.entries(def.dzialy)) {
    for (const ini of d.inicjatywy) if (!INICJATYWY[ini]) b.push(`dział ${id}: nieznana inicjatywa ${ini}`);
    for (const n of ['zaufanie', 'swiadomosc', 'aktywnosc']) if (!(d[n] >= 0 && d[n] <= 1)) b.push(`dział ${id}: ${n} poza 0–1`);
  }
  for (const [id, ini] of Object.entries(INICJATYWY)) {
    if (!(ini.warunki || []).length) b.push(`inicjatywa ${id}: brak warunków „tak, ale"`);
    for (const w of ini.warunki || []) {
      if (!w.id || !w.opis || !(w.h >= 0)) b.push(`inicjatywa ${id}: warunek bez id/opisu/godzin`);
      for (const wek of Object.keys(w.redukcja || {})) if (!(wek in (ini.ryzyko?.wektory || {}))) b.push(`inicjatywa ${id}/${w.id}: redukcja wektora ${wek}, którego inicjatywa nie ma`);
      if (w.wymaga && !S.kontrola[w.wymaga]) b.push(`inicjatywa ${id}/${w.id}: wymaga nieznanej kontroli`);
    }
  }
  for (const [id, f] of Object.entries(def.fakty || {})) {
    if (!f.opis) b.push(`fakt ${id}: brak opisu`);
    if (!(typeof f.prawda === 'boolean' || (f.prawda >= 0 && f.prawda <= 1))) b.push(`fakt ${id}: prawda musi być true/false albo szansą`);
  }
  for (const [id, o] of Object.entries(def.obserwacje || {})) {
    okno(o.okno, `obserwacja ${id}`);
    if (!o.tresc || !o.od) b.push(`obserwacja ${id}: brak treści/źródła`);
    if (o.odkrywa && !def.fakty?.[o.odkrywa]) b.push(`obserwacja ${id}: odkrywa nieznany fakt`);
  }
  for (const [id, s] of Object.entries(def.sprawy || {})) {
    if (!s.tytul || !s.tresc || typeof s.domyslnie !== 'function') b.push(`sprawa ${id}: tytul, tresc, domyslnie`);
    const cz = Object.entries(s.czasowniki || {});
    if (cz.length < 2) b.push(`sprawa ${id}: mniej niż 2 czasowniki — sprawa bez wyboru`);
    for (const [v, c] of cz) {
      if (!c.opis || typeof c.wykonaj !== 'function') b.push(`sprawa ${id}/${v}: opis i wykonaj`);
      if ('ocena' in c) b.push(`sprawa ${id}/${v}: czasowniki nie mają ocen — praktykę oceniają zasady`);
    }
    // Uczciwe, tanie wyjście (≤ 8 h, bez pieniędzy) — inaczej gracz bez budżetu jest zmuszany
    // do złej decyzji (przypadki brzegowe, docs/17-…).
    if (!cz.some(([, c]) => !c.pln && !c.koszt && (c.h || 0) <= 8 && !c.nieuczciwe)) b.push(`sprawa ${id}: brak taniego wyjścia (≤ 8 h, bez pieniędzy)`);
  }
  for (const c of def.certyfikaty || []) {
    if (!c.id || !c.nazwa || !(c.pierwszy >= 1) || !(c.co >= 1) || !c.skutek?.opis) b.push(`certyfikat ${c.id || '?'}: id, nazwa, pierwszy, co, skutek.opis`);
  }
  for (const e of def.koniec_wsparcia || []) {
    if (!e.id || !e.nazwa || !e.opis || !(e.m >= 1) || !e.wektory || !(e.pln >= 0) || !(e.pln_wsparcie >= 0)) b.push(`koniec wsparcia ${e.id || '?'}: id, nazwa, opis, m, wektory, pln, pln_wsparcie`);
  }
  for (const z of def.zdarzenia) {
    okno(z.okno, `zdarzenie ${z.id}`);
    if (!['incydent', 'sprawa', 'termin', 'fala', 'final'].includes(z.typ)) b.push(`zdarzenie ${z.id}: typ ${z.typ}`);
    if (z.typ === 'sprawa' && !def.sprawy?.[z.id]) b.push(`zdarzenie ${z.id}: brak sprawy`);
    if (z.typ === 'incydent') {
      try { b.push(...I.waliduj(I.wczytaj(z.id)).map(x => `incydent ${z.id}: ${x}`)); } catch (e) { b.push(`zdarzenie ${z.id}: ${e.message}`); }
    }
  }
  return b;
}

// ── TWORZENIE ──
// Definicja kampanii razem ze sprawami cyklicznymi (odnowienia, certyfikaty, koniec wsparcia…),
// które są wspólne dla wszystkich kampanii (data/cykliczne.js).
function pelnaDefinicja(defId) {
  const baza = require(`../data/kampanie/${defId}`);
  return { ...baza, sprawy: { ...CYKLICZNE.sprawy, ...baza.sprawy } };
}

function nowaKampania(defId, seed) {
  const def = pelnaDefinicja(defId);
  const bledy = walidujKampanie(def);
  if (bledy.length) throw new Error(`Kampania ${defId} ma błędy w danych:\n - ${bledy.join('\n - ')}`);
  const firma = FIRMY[def.firma];
  const st = S.nowyStan(firma, seed);
  const k = {
    def, st, seed, flagi: {}, wskazniki: { ...def.wskazniki }, budzet: { ...def.budzet }, wydaneRok: {},
    dzialy: D.noweDzialy(def), rezyser: R.nowyRezyser(), modStale: {}, ryzyka: {}, zrobione: new Set(), odlozone: {},
    // Osobne strumienie: każdy podsystem losuje ze swojego — dołożenie losowania w jednym nie
    // przesuwa „pogody" w innym (silnik, działy, reżyser, mgła, wdrożenia, incydenty).
    rnd: { dzialy: S.mulberry32(seed ^ 0x9e3779b9), rezyser: S.mulberry32(seed ^ 0x85ebca6b), mgla: S.mulberry32(seed ^ 0x27d4eb2f),
      wdrozenia: S.mulberry32(seed ^ 0x165667b1), incydent: S.mulberry32(seed ^ 0xd3a2646c), cykl: S.mulberry32(seed ^ 0x2545f491),
      doradztwo: S.mulberry32(seed ^ 0x5bd1e995) },
    cykl: CY.nowyCykl(), doradztwo: DR.nowe(), obciazenia: [], kosztyStale: [], bonusH: [],
    obiekty: {}, pilotaze: {}, rekrutacje: [], akceptacje: {}, wiedza: {}, zrobioneRuchy: new Set(), ostatnieRuchy: {},
    sprawy: [], sprawyZamkniete: [], licznikSpraw: 0, planowaneSprawy: [], obserwacje: [], zdarzenia: [],
    historia: [], rejestr: [], incydenty: [], raporty: [], raportIT: [], ocenyIncydentow: [], bktZnane: new Set(),
    hKart: 0, koniec: false, akcje: [], kontrola: null, klamstwa: [], incydent: null, miesiaceNadgodzin: 0,
  };
  k.log = (kto, tekst) => k.rejestr.push({ m: k.st.m, kto, tekst });
  k.fakty = RU.noweFakty(k);
  k.otNiezgodne = RU.noweNiezgodnosci(k);
  // Stały błąd szacunku „ile naprawdę mamy zasobów" (±25%), żeby środek przedziału nie był prawdą.
  k.mglaBlad = (k.rnd.mgla() - 0.5) * 0.5;
  kalendarz(k);
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

// Mnożniki wektorów w silniku = ryzyka działów × trwałe skutki spraw × fakty świata i parametry
// wdrożeń × przeciwnik. Całość przycięta do 0,25–4 (bez sufitów było ×23, docs/17-…).
function zastosujModyfikatory(k) {
  const dz = D.mnozniki(k), fk = RU.mnozniki(k);
  for (const w of new Set([...Object.keys(dz), ...Object.keys(k.modStale), ...Object.keys(fk), ...Object.keys(k.rezyser.wagi)])) {
    k.st.mod.wektory[w] = Math.max(0.25, Math.min(4, (dz[w] ?? 1) * (k.modStale[w] ?? 1) * (fk[w] ?? 1) * (k.rezyser.wagi[w] ?? 1)));
  }
  // Godziny gracza, których nie zużył, idą do zespołu; minus przełączanie między projektami.
  k.st.mod.h_extra = (k.def.h_gracza || 0) - k.hKart + Z.zmianaGodzin(k) - Math.round(Z.karaWip(k) * Z.godzinyZespolu(k));
  k.st.mod.bez_ubezpieczenia = !!k.flagi.klamstwo_ankieta;
}

// ── POCZĄTEK MIESIĄCA ──
function rozpocznijMiesiac(k) {
  const st = k.st;
  kalendarz(k);
  if (k.budzet[k.rok] === undefined) k.budzet[k.rok] = k.budzet[k.rok - 1] ?? st.firma.budzet_rok;
  D.ustawObciazenie(k);
  k.mandatZDzialow = 0;
  // Koordynacja projektów w toku zjada godziny gracza, zanim zrobi cokolwiek nowego.
  k.hKart = Z.koordynacja(k) + Z.obciazenieGracza(k);
  k.maxHKart = Math.max(k.maxHKart || 0, k.hKart);
  k.maxProjekty = Math.max(k.maxProjekty || 0, st.projekty.length);
  k.obserwacje = []; k.zdarzenia = [];
  for (const d of Object.values(k.dzialy)) {
    const w = D.wykonajPlan(k, d);
    if (!w) continue;
    k.log('dzial', `${d.nazwa}: ${w.typ === 'pytanie' ? 'PYTA' : 'OBCHODZI'} — ${INICJATYWY[w.ini].nazwa}; ${w.powod}`);
    if (w.typ === 'pytanie') SP.dodajProsbe(k, w);
  }
  // Decyzje cykliczne ze stanu firmy: odnowienia, certyfikaty, koniec wsparcia, właściciele procesów.
  CY.nowyMiesiac(k);
  for (const p of k.planowaneSprawy.filter(x => x.m === st.m)) SP.dodajScenariuszowa(k, p.sid);
  k.planowaneSprawy = k.planowaneSprawy.filter(x => x.m !== st.m);
  const plan = R.zaplanujMiesiac(k);
  for (const z of plan.zdarzenia) {
    if (z.typ === 'sprawa') {
      const zap = k.def.sprawy[z.id].zapobiegnieta?.(k, RU.api(k));
      if (zap) { k.log('swiat', `${k.def.sprawy[z.id].tytul}: ${zap}`); k.historia.push({ m: st.m, t: 'sprawa_zapobiegnieta', sid: z.id }); k.raportIT.push(`Bez Twojego udziału: ${zap}.`); }
      else SP.dodajScenariuszowa(k, z.id);
    } else k.zdarzenia.push({ ...z, zagrane: false });
  }
  for (const o of plan.obserwacje) pokazObserwacje(k, o.id);
  zastosujModyfikatory(k);
}

function pokazObserwacje(k, id) {
  const o = k.def.obserwacje[id];
  k.obserwacje.push({ id, od: o.od, tresc: o.tresc });
  if (o.flaga) k.flagi[o.flaga] = k.st.m;
  if (o.odkrywa) RU.api(k).odkryjFakty(f => f.id === o.odkrywa, `obserwacja: ${o.od}`);
  k.historia.push({ m: k.st.m, t: 'obserwacja', id });
}

// ── INCYDENTY (tryb operacyjny) ──
function rozpocznijIncydent(k, id) {
  if (k.incydent) throw blad('trwa inny incydent');
  const z = k.zdarzenia.find(x => x.typ === 'incydent' && x.id === id && !x.zagrane);
  if (!z) throw blad('ten incydent nie trwa w tym miesiącu');
  k.akcje.push({ t: 'inc_start', id });
  I.rozpocznij(k, id);
  z.zagrane = true;
  return k.incydent;
}
function incydentAkcja(k, aid) { const r = I.wykonaj(k, aid); if (r.koniec) zastosujWynikIncydentu(k, r.koniec); return r; }
function incydentCzekaj(k, h) { const r = I.czekaj(k, h); if (r.koniec) zastosujWynikIncydentu(k, r.koniec); return r; }
function incydentZakoncz(k) {
  if (!k.incydent) throw blad('nie ma trwającego incydentu');
  const w = I.zakoncz(k, true);
  zastosujWynikIncydentu(k, w);
  return w;
}
// Gracz nie podjął incydentu — świat nie czeka: incydent toczy się do limitu bez reakcji.
function incydentBezGracza(k, z) {
  I.rozpocznij(k, z.id);
  z.zagrane = true;
  k.historia.push({ m: k.st.m, t: 'incydent_bez_reakcji', id: z.id });
  const r = I.czekaj(k, k.incydent.def.limit_h, { zapis: false });
  zastosujWynikIncydentu(k, r.koniec || I.zakoncz(k));
}

function zastosujWynikIncydentu(k, w) {
  const st = k.st, sk = w.skutki || {}, a = RU.api(k);
  if (sk.pln) {
    st.w.straty += sk.pln; st.w.szczegoly.scenariusze = (st.w.szczegoly.scenariusze || 0) + sk.pln;
    k.incydenty.push({ m: st.m, rodzaj: `${w.def.id} ${w.def.tytul}`, pln: sk.pln, ot: !!sk.ot });
  }
  for (const n of ['mandat', 'reputacja', 'morale']) if (sk[n]) k.wskazniki[n] = przytnij(k.wskazniki[n] + sk[n]);
  Object.assign(k.flagi, sk.flagi || {});
  RU.stosujDzialy(k, sk.dzial);
  for (const f of sk.fakty_odkryj || []) a.odkryjFakty(x => x.id === f, `incydent ${w.def.id}`);
  for (const f of sk.fakty_napraw || []) { const x = k.fakty[f]; if (x?.prawda && !x.naprawiony) { x.znany = true; a.napraw(f); } }
  for (const [wek, mn] of Object.entries(sk.wektory || {})) a.wektor(wek, mn);
  if (sk.intruz) a.intruz(sk.intruz);
  if (sk.powrot) st.intruzi.push({ kto: 'haktywista', etap: 'dostep', wektor: 'uslugi', od: st.m });
  if (k.flagi.klamstwo_ankieta && S.dziala(st, 'ubezpieczenie') && (sk.pln || 0) > 50000) {
    for (const l of k.klamstwa.filter(x => x.wobec === 'ubezpieczyciel' && !x.ujawnione)) ujawnij(k, l, 'likwidacja szkody');
  }
  if ((sk.pln || 0) > S.PROG_POWAZNY || sk.flagi?.incydent_powazny) ujawnijPrzyIncydencie(k);
  k.ocenyIncydentow.push(...w.oceny);
  for (const o of w.oceny) { k.bktZnane.add(o.id); R.poDecyzji(k, [o.cel], o.wynik === 'spelniona' ? 'dobra' : 'blad'); }
  k.ostatniIncydent = { id: w.def.id, tytul: w.tytul, opis: w.opis, oceny: w.oceny, debrief: w.def.debrief };
  k.historia.push({ m: st.m, t: 'incydent_koniec', id: w.def.id, tytul: w.tytul });
  k.log('incydent', `${w.def.id} „${w.def.tytul}": ${w.tytul}. ${w.opis}`);
  zastosujModyfikatory(k);
}

// ── WIARYGODNOŚĆ: kłamstwo wychodzi na jaw ──
// Ujawnienie uderza we wszystkich, z którymi gracz pracuje (docs/17-…, 17.7):
//   zarząd — mandat −15, kolejny budżet ×0,7; działy — zaufanie −0,3 i Q(pytaj) −0,5;
//   ubezpieczyciel — polisa wypowiedziana; audytor — rozszerzona próba (ocenaKontroli).
function ujawnij(k, l, przez) {
  l.ujawnione = { m: Math.min(k.st.m, k.def.miesiecy), przez };
  k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 15);
  k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 5);
  for (const d of Object.values(k.dzialy)) { d.zaufanie = D.przytnij(d.zaufanie - 0.3); d.Q.pytaj -= 0.5; }
  if (l.wobec === 'ubezpieczyciel') {
    k.flagi.klamstwo_wykryte = true;
    if (k.obiekty.ubezpieczenie) { S.wycofaj(k.st, 'ubezpieczenie', 0); k.obiekty.ubezpieczenie.stan = 'wycofany'; }
  }
  const tekst = `Wyszło na jaw (${przez}): „${l.tekst}". Wiedzą zarząd, kierownicy działów i ${l.wobec}.`;
  k.log('zarzad', tekst);
  k.historia.push({ m: k.st.m, t: 'ujawnienie', wobec: l.wobec, przez });
  k.raportIT.push(tekst + ' Kierownicy przestają Cię pytać o zdanie.');
}
// Upiększone raporty wychodzą, gdy przychodzi poważny incydent („a raport mówił, że jest dobrze").
function ujawnijPrzyIncydencie(k) {
  for (const l of k.klamstwa.filter(x => x.przy_incydencie && !x.ujawnione)) {
    if (k.rnd.mgla() < l.przy_incydencie) ujawnij(k, l, 'poważny incydent — zarząd porównuje go z raportami');
  }
}

// ── KONIEC MIESIĄCA ──
function zamknijMiesiac(k) {
  const st = k.st;
  if (k.incydent) throw blad('najpierw zakończ fazę ostrą incydentu');
  k.akcje.push({ t: 'zamknij' });
  k.raportIT = [];
  for (const z of k.zdarzenia.filter(x => x.typ === 'incydent' && !x.zagrane)) incydentBezGracza(k, z);
  SP.terminy(k);
  let intensywnosc = 0;
  for (const z of k.zdarzenia) {
    intensywnosc += z.ciezar || 0;
    if (z.typ === 'termin') terminSzbi(k);
    if (z.typ === 'fala') falaHaktywistow(k);
    if (z.typ === 'final') k.log('zarzad', 'Rada nadzorcza: audyt zamykający na koniec kampanii.');
  }
  k.tarcie = RU.tarcie(k);
  zastosujModyfikatory(k);
  k.rokZamkniety = k.rok;
  // Stałe koszty z decyzji (np. zastępstwo w IT) — z budżetu, jak pensje.
  const stale = Z.kosztyStale(k);
  if (stale) { st.w.wydatki += stale; k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + stale; }
  const wydatkiPrzed = st.w.wydatki, reagPrzed = st.w.reagowanie || 0;
  const zdarzenia = S.zakonczMiesiac(st);
  // Budżet bezpieczeństwa = abonamenty, pensje, zakupy; NIE koszty reagowania na incydenty.
  k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + (st.w.wydatki - wydatkiPrzed) - ((st.w.reagowanie || 0) - reagPrzed);
  k.mZamkniety = st.m - 1;
  for (const e of zdarzenia) {
    if (e.typ === 'skutek') {
      intensywnosc += e.pln > S.PROG_POWAZNY ? 1 : 0.3;
      k.incydenty.push({ m: k.mZamkniety, rodzaj: e.rodzaj, pln: e.pln, wektor: e.wektor });
      const winny = D.incydentPrzezDzial(k, e.wektor);
      k.raportIT.push(`INCYDENT: ${OPIS_SKUTKU[e.rodzaj] || e.rodzaj} — koszt ${zl(e.pln)}` +
        (winny ? ` (wejście: ${INICJATYWY[winny.ini].nazwa}, ${k.dzialy[winny.dzial].nazwa}${winny.zrodlo === 'zgoda' ? ' — za Twoją zgodą' : ''})` : ''));
      if (e.pln > S.PROG_POWAZNY) {
        k.flagi.incydent_powazny = true;
        k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 8);
        k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 8);
        if (winny?.zrodlo === 'zgoda') { k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 4); k.raportIT.push(`Zarząd: „Zgodził się Pan/Pani na to bez żadnych warunków" (${INICJATYWY[winny.ini].nazwa}).`); }
        ujawnijPrzyIncydencie(k);
      }
      if (k.flagi.klamstwo_ankieta && S.dziala(st, 'ubezpieczenie') && e.pln > 50000) {
        k.raportIT.push('Ubezpieczyciel odmówił wypłaty: odpowiedzi w ankiecie były niezgodne z prawdą.');
        for (const l of k.klamstwa.filter(x => x.wobec === 'ubezpieczyciel' && !x.ujawnione)) ujawnij(k, l, 'likwidacja szkody');
      }
      for (const d of Object.values(k.dzialy)) d.dodatkoweObciazenie = (d.dodatkoweObciazenie || 0) + 0.3;
    } else if (e.typ === 'wykrycie') {
      // Mgła wojny: gracz nie wie, czy opanowanie się udało — zawsze widzi „usunięte".
      k.raportIT.push(`Wykryto i usunięto przyczółek (etap: ${e.etap}).`);
    }
  }
  RU.poMiesiacu(k, st.ostatni.wdrozone);
  CY.koniecMiesiaca(k, RU.api(k));
  DR.koniecMiesiaca(k);
  if (st.ostatni.wdrozone.length) k.raportIT.push(`Wdrożono: ${st.ostatni.wdrozone.map(id => S.kontrola[id].nazwa).join('; ')}.`);
  if (st.ostatni.jakosc_ops < 0.8) k.raportIT.push(`Nie nadążamy z alertami — przejrzano ok. ${Math.round(st.ostatni.jakosc_ops * 100)}%.`);
  if (st.ostatni.utrzymanie_ulamek < 1) k.raportIT.push(`Brakuje godzin na utrzymanie zabezpieczeń (${Math.round(st.ostatni.utrzymanie_ulamek * 100)}% potrzeb).`);
  const niedok = st.projekty.map(p => `${S.kontrola[p.id].nazwa} (${Math.round(100 * p.h / (S.kontrola[p.id].wdrozenie.h * Math.max(0.4, st.skalaH) * (p.hMn ?? 1)))}%)`);
  if (niedok.length) k.raportIT.push(`W toku: ${niedok.join('; ')}.`);

  // Działy: nauka, plany, raporty; odkrycia obejść; sygnały (prawdziwe i fałszywe).
  D.koniecOkresu(k);
  kalendarz(k);
  for (const d of Object.values(k.dzialy)) D.zaplanuj(k, d);
  k.raporty = Object.values(k.dzialy).map(d => D.raport(k, d));
  odkryjObejscia(k);
  const falszywe = [];
  for (const d of Object.values(k.dzialy)) {
    if (k.rnd.mgla() < 0.05 + 0.1 * d.swiadomosc) {
      const teksty = Object.values(D.SYGNALY);
      falszywe.push({ dzial: d.id, intruz: null, tekst: teksty[Math.floor(k.rnd.mgla() * teksty.length)] });
    }
  }
  for (const s of [...D.sygnaly(k), ...falszywe]) SP.dodajSygnal(k, s);

  kwartal(k, zdarzenia);
  // Ubezpieczyciel weryfikuje deklaracje przy odnowieniu (w grze ~5%/mies.).
  if (k.flagi.klamstwo_ankieta && !k.flagi.klamstwo_wykryte && S.dziala(st, 'ubezpieczenie') && k.rnd.mgla() < 0.05) {
    k.raportIT.push('Ubezpieczyciel sprawdził deklaracje z ankiety — były nieprawdziwe.');
    for (const l of k.klamstwa.filter(x => x.wobec === 'ubezpieczyciel' && !x.ujawnione)) ujawnij(k, l, 'weryfikacja przy odnowieniu');
  }
  // Przekroczenie budżetu boli proporcjonalnie.
  const nad = (k.wydaneRok[k.rokZamkniety] || 0) / Math.max(1, k.budzet[k.rokZamkniety] || 0) - 1;
  if (nad > 0) k.wskazniki.mandat = przytnij(k.wskazniki.mandat - Math.min(15, 2 + 8 * nad));
  // Nadgodziny: −1 morale za każde 4 h ponad etat gracza.
  const nadgodziny = k.hKart - (k.def.h_gracza || 0);
  if (nadgodziny > 0) k.miesiaceNadgodzin++;
  k.wskazniki.morale = przytnij(k.wskazniki.morale + (nadgodziny > 0 ? -nadgodziny / 4 : 1));
  if (k.wskazniki.reputacja < 20) k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 2);
  R.poMiesiacu(k, intensywnosc);
  karmModelGracza(k);
  k.hKart = 0;
  // Audyt zamykający liczy się zawsze na koniec — gra ma skończoną liczbę miesięcy.
  if (st.m > k.def.miesiecy || k.wskazniki.mandat <= 0) { k.koniec = true; k.kontrola = ocenaKontroli(k); return; }
  rozpocznijMiesiac(k);
}

// Model gracza (BKT reżysera) uczy się z zasad rozstrzygniętych w tym miesiącu — nie z „opcji".
function karmModelGracza(k) {
  for (const o of ZA.ocen(k, false)) {
    if (k.bktZnane.has(o.id)) continue;
    k.bktZnane.add(o.id);
    R.poDecyzji(k, [o.cel], o.wynik === 'spelniona' ? 'dobra' : 'blad');
  }
}

// Kwartalna ocena zarządu: nagroda za DOWIEZIONE wdrożenia i spokojny kwartał, kara za terminy.
function kwartal(k, zdarzenia) {
  const q = k.q || (k.q = { powazne: 0, wdrozone: 0 });
  q.powazne += zdarzenia.filter(e => e.typ === 'skutek' && e.pln > S.PROG_POWAZNY).length;
  q.wdrozone += k.st.ostatni.wdrozone.length;
  if (k.mZamkniety % 3) return;
  let d = 0;
  if (!q.powazne && !k.incydenty.some(i => i.m > k.mZamkniety - 3 && /S0|fala|awaria/.test(i.rodzaj) && i.pln > 0)) d += 2;
  d += Math.min(3, q.wdrozone);
  if (k.flagi.szbi_po_terminie && !k.flagi.szbi_kara_kwartal) { d -= 3; k.flagi.szbi_kara_kwartal = true; }
  if (k.m > 7 && !k.flagi.wpis) d -= 2;
  k.wskazniki.mandat = przytnij(k.wskazniki.mandat + d);
  k.raportIT.push(`Kwartalna ocena zarządu: ${d >= 0 ? '+' : ''}${d} mandatu (wdrożenia: ${q.wdrozone}, poważne incydenty: ${q.powazne}).`);
  k.q = { powazne: 0, wdrozone: 0 };
}

const OPIS_SKUTKU = { szyfrowanie: 'ransomware zaszyfrował systemy', wyciek: 'wyciek danych', sabotaz: 'sabotaż (zmiana parametrów / zakłócenie)',
  szpiegostwo: 'długotrwałe szpiegostwo wykryte z zewnątrz', wyciek_insider: 'wyniesienie danych przez osobę z wewnątrz',
  bec: 'wyłudzenie przelewu', ddos: 'atak DDoS na e-BOK' };

// Działające narzędzia odkrywania (inwentaryzacja, moje.cert.pl, ASM) same znajdują obejścia działów.
function odkryjObejscia(k) {
  const st = k.st;
  const sila = (S.dziala(st, 'inwentaryzacja') ? 0.35 * RU.skutecznosc(k, 'inwentaryzacja') / RU.JAKOSC_BAZOWA : 0)
    + (S.dziala(st, 'moje_cert') ? 0.15 : 0) + (S.dziala(st, 'asm') ? 0.25 : 0);
  if (!sila) return;
  for (const d of Object.values(k.dzialy)) {
    // Dział, który boi się kary, ukrywa się lepiej (prywatne urządzenia, poza siecią firmy).
    const ukrywanie = 0.4 + 0.6 * d.zaufanie;
    for (const u of d.ukryte) {
      if (u.odkryte || k.rnd.rezyser() >= sila * ukrywanie) continue;
      u.odkryte = true;
      SP.dodajOdkrycie(k, d.id, u, 'Twoja inwentaryzacja / skan');
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
  const hmi = k.fakty.hmi_wystawiony;
  const odciete = !hmi || !hmi.prawda || hmi.naprawiony;
  let pln = 0, opis;
  if (chronione && odciete) { opis = 'Druga fala haktywistów: próby odbite, krótki DDoS na e-BOK.'; k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 1); }
  else if (odciete) {
    // Panel zamknięty, ale sieć płaska: napastnik dochodzi tylko do telemetrii przepompowni.
    pln = (S.dziala(st, 'bcp') ? 0.25 : 0.5) * st.firma.koszt_dnia + 10000;
    opis = 'Druga fala haktywistów: krótkie zakłócenie telemetrii przepompowni (sieć bez segmentacji).';
    st.w.straty += pln; st.w.szczegoly.sabotaz = (st.w.szczegoly.sabotaz || 0) + pln;
    k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 2);
    k.incydenty.push({ m: st.m, rodzaj: 'fala haktywistów (drobna)', pln });
  } else {
    pln = 2 * st.firma.koszt_dnia * (S.dziala(st, 'bcp') ? 0.5 : 1) + 50000;
    opis = 'Druga fala haktywistów: zakłócenie pracy przepompowni przez wystawione urządzenia.';
    st.w.straty += pln; st.w.szczegoly.sabotaz = (st.w.szczegoly.sabotaz || 0) + pln;
    k.flagi.incydent_powazny = true; k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 8);
    k.incydenty.push({ m: st.m, rodzaj: 'fala haktywistów', pln });
  }
  k.log('swiat', opis);
}

// ── AUDYT ZAMYKAJĄCY (z dowodami) ──
// Audytor patrzy na to, co DZIAŁA, jak dobrze (próbki — także ukryte usterki), czy są DOWODY
// (przegląd/test w ostatnim roku), czy wyjątki mają akceptację zarządu — i porównuje deklaracje
// z rzeczywistością (rejestr kłamstw).
const OBSZARY_KONTROLI = {
  'SZBI i ład': ['szbi'], 'Szacowanie ryzyka': ['ryzyko'], 'Incydenty i zgłoszenia': ['plan_ir'],
  'Ciągłość działania': ['backup', 'bcp'], 'Dostęp i tożsamość': ['mfa', 'mfa_fido'], 'Podatności': ['patch'],
  'Monitorowanie': ['edr', 'mdr', 'siem', 'siem_os'], 'Szkolenia (w tym kierownika)': ['szkolenia'],
};
function ocenaKontroli(k) {
  const st = k.st, f = k.flagi;
  const d = id => S.dziala(st, id);
  const o = id => k.obiekty[id];
  const dowod = id => { const x = o(id); return x && Math.max(x.ostPrzeglad ?? -99, x.ostTest ?? -99) >= st.m - 12; };
  const krok = { glowna: 'drobna', drobna: 'zgodny', zgodny: 'zgodny' };
  const w_dol = { zgodny: 'drobna', drobna: 'glowna', glowna: 'glowna' };
  const szk = f[`szkolenie_kierownika_${k.rok}`] || f[`szkolenie_kierownika_${k.rok - 1}`];
  const obszary = [
    ['SZBI i ład', d('szbi') ? (o('szbi').param.sposob === 'z_pudelka' ? 'drobna' : 'zgodny') : 'glowna'],
    ['Szacowanie ryzyka', d('ryzyko') ? (dowod('ryzyko') || st.m - o('ryzyko').dzialaOd <= 12 ? 'zgodny' : 'drobna') : 'glowna'],
    ['Incydenty i zgłoszenia', d('plan_ir') ? (o('plan_ir').ostTest !== null && !(f.incydent_powazny && !f.zgloszone_w_terminie) ? 'zgodny' : 'drobna') : 'glowna'],
    ['Ciągłość działania', d('backup') ? (o('backup').ostTest !== null && d('bcp') ? (f.kopie_ot || f.kopie_ot_umowa ? 'zgodny' : 'drobna') : 'drobna') : 'glowna'],
    ['Łańcuch dostaw', d('dostawcy') || f.umowa_integratora ? 'zgodny' : d('brama_dostepu') ? 'drobna' : 'glowna'],
    ['Dostęp i tożsamość', d('mfa') ? (o('mfa').sk.wyjatki.every(w => k.akceptacje[`wyjatek:${w}`] !== undefined) ? 'zgodny' : 'drobna') : 'glowna'],
    ['Podatności', d('patch') || d('skaner_podatnosci') ? 'zgodny' : d('ekspozycja') ? 'drobna' : 'glowna'],
    ['Monitorowanie', d('edr') || d('mdr') || d('siem') || d('siem_os') ? (d('edr') && !d('mdr') && o('edr').param.tryb === 'wykrywaj' ? 'drobna' : 'zgodny') : 'glowna'],
    ['Szkolenia (w tym kierownika)', d('szkolenia') && o('szkolenia').param.forma === 'program' && szk ? 'zgodny' : d('szkolenia') || szk ? 'drobna' : 'glowna'],
    ['Wykaz', f.wpis ? (f.wpis_spozniony || f.status_zgloszony !== st.firma.status_ksc ? 'drobna' : 'zgodny') : 'glowna'],
  ];
  // Próbki audytora: nienaprawione usterki w kontrolach obszaru (także te, o których gracz nie
  // wie) wychodzą z szansą 0,6 — chyba że zarząd je zaakceptował. Stąd wartość przeglądów przed audytem.
  const proba = [];
  for (const ob of obszary) {
    for (const id of OBSZARY_KONTROLI[ob[0]] || []) {
      const x = o(id);
      if (!x || x.stan !== 'dziala') continue;
      for (const u of x.usterki.filter(u => !u.naprawiona && k.akceptacje[`usterka:${id}:${u.id}`] === undefined)) {
        if (u.odkryta || k.rnd.mgla() < 0.6) { proba.push(`${S.kontrola[id].nazwa}: ${u.opis}`); ob[1] = w_dol[ob[1]]; break; }
      }
    }
  }
  // Kłamstwa: audytor porównuje deklaracje z rzeczywistością.
  const ujawnioneWczesniej = k.klamstwa.filter(l => l.ujawnione).length;
  for (const l of k.klamstwa) if (!l.ujawnione && k.rnd.mgla() < (l.wykrywalnosc ?? 0.8)) ujawnij(k, l, 'audyt zamykający');
  const wstecz = k.klamstwa.find(l => l.wobec === 'audytor');
  const zmien = (nazwy, fn) => { for (const x of obszary) if (nazwy.includes(x[0])) x[1] = fn(x[1]); };
  if (wstecz && !wstecz.ujawnione) zmien(['SZBI i ład', 'Szacowanie ryzyka', 'Szkolenia (w tym kierownika)'], s => krok[s]);
  if (wstecz && wstecz.ujawnione) zmien(['SZBI i ład', 'Szacowanie ryzyka', 'Szkolenia (w tym kierownika)'], () => 'glowna');
  if (f.sprint_audytowy) zmien(['Szacowanie ryzyka'], s => (s === 'glowna' ? 'drobna' : s));
  if (f.plan_naprawczy) { let n = 2; for (const x of obszary) if (n && x[1] === 'glowna') { x[1] = 'drobna'; n--; } }
  const ujawnione = k.klamstwa.filter(l => l.ujawnione);
  if (ujawnione.length) for (const x of obszary) if (x[1] === 'drobna') x[1] = 'glowna';
  const pkt = { zgodny: 6, drobna: 4, glowna: 1 };
  return { obszary, wynik: obszary.reduce((a, [, s]) => a + pkt[s], 0), proba,
    ujawnioneNaAudycie: ujawnione.length - ujawnioneWczesniej, rozszerzonaProba: ujawnione.length > 0 };
}

// ── INDEKS ODPORNOŚCI I WYNIK KAMPANII (docs/11-…) ──
// Indeks liczy się z PRAWDY silnika (mgła jest w trakcie gry, rachunek na koniec).
const KLUCZOWE = ['mfa', 'backup', 'plan_ir', 'bcp', 'inwentaryzacja', 'patch', 'edr', 'szbi', 'ryzyko', 'ekspozycja'];

// Ekspozycja: oczekiwane straty w ROKU PO kampanii, z końcowego stanu (jakość wdrożeń, ukryte
// usterki, obejścia, wyjątki, intruzi). Te same ziarna dla każdego gracza.
const EKSPOZYCJA_PRZEBIEGI = 40;
function ekspozycja(k, n = EKSPOZYCJA_PRZEBIEGI) {
  const dz = D.mnozniki(k), fk = RU.mnozniki(k);
  const wektory = {};
  for (const w of new Set([...Object.keys(dz), ...Object.keys(k.modStale), ...Object.keys(fk)])) {
    wektory[w] = przytnij((dz[w] ?? 1) * (k.modStale[w] ?? 1) * (fk[w] ?? 1), 0.25, 4);
  }
  let suma = 0, sabotaze = 0;
  for (let i = 0; i < n; i++) {
    const st = {
      ...k.st,
      rnd: S.mulberry32((k.seed * 7919 + i * 104729 + 17) >>> 0),
      aktywne: { ...k.st.aktywne }, intruzi: structuredClone(k.st.intruzi), projekty: structuredClone(k.st.projekty),
      zamowione: new Set(k.st.zamowione), konf: structuredClone(k.st.konf), wypowiedzenia: { ...k.st.wypowiedzenia },
      mod: { ...structuredClone(k.st.mod), wektory, h_extra: 0 },
      w: { wydatki: 0, straty: 0, powazne: 0, incydenty: 0, wykryte_wczesnie: 0, alert_niedobor_mies: 0,
        nadgodziny: 0, opoznienie_mies: 0, niewdrozone: 0, szczegoly: {} },
      ostatni: null,
    };
    for (let m = 0; m < 12; m++) sabotaze += S.zakonczMiesiac(st).filter(z => z.typ === 'skutek' && z.rodzaj === 'sabotaz').length;
    suma += st.w.straty;
  }
  return { pln: suma / n, sabotaze: sabotaze / n };
}

// „Co jeśli": ekspozycja po hipotetycznej zmianie (doradca wycenia rekomendacje). Zmiana idzie
// na kopiach — prawdziwy stan kampanii i strumienie losowości zostają nietknięte.
function coJesli(k, zmiana, n = EKSPOZYCJA_PRZEBIEGI) {
  const oryg = { aktywne: k.st.aktywne, zamowione: k.st.zamowione, konf: k.st.konf, obiekty: k.obiekty, fakty: k.fakty, ryzyka: k.ryzyka, modStale: k.modStale };
  k.st.aktywne = { ...oryg.aktywne }; k.st.zamowione = new Set(oryg.zamowione); k.st.konf = structuredClone(oryg.konf);
  k.obiekty = structuredClone(oryg.obiekty); k.fakty = structuredClone(oryg.fakty); k.ryzyka = structuredClone(oryg.ryzyka); k.modStale = { ...oryg.modStale };
  try {
    if (zmiana) zmiana(k);
    return ekspozycja(k, n);
  } finally {
    Object.assign(k.st, { aktywne: oryg.aktywne, zamowione: oryg.zamowione, konf: oryg.konf });
    Object.assign(k, { obiekty: oryg.obiekty, fakty: oryg.fakty, ryzyka: oryg.ryzyka, modStale: oryg.modStale });
  }
}

// Sufity: decyzje, których żaden dobry wynik nie równoważy (docs/11-…, 11.2a).
const BRAMKI = [
  { gdy: k => k.klamstwa.some(l => !l.ujawnione) && !k.klamstwa.some(l => l.ujawnione), sufit: () => 650,
    powod: k => `Nieuczciwość, której nikt nie wykrył (${k.klamstwa.map(l => `„${l.tekst}" wobec: ${l.wobec}`).join('; ')}) — wynik liczy się z prawdy.` },
  { gdy: k => k.klamstwa.some(l => l.ujawnione),
    sufit: k => Math.max(250, 450 - 100 * (k.klamstwa.filter(l => l.ujawnione).length - 1)),
    powod: k => `Ujawnione kłamstwo (${k.klamstwa.filter(l => l.ujawnione).map(l => `${l.wobec}: ${l.ujawnione.przez}, m. ${l.ujawnione.m}`).join('; ')}) — w życiu koniec pracy na tym stanowisku.` },
  { gdy: k => k.flagi.falszywy_komunikat, sufit: () => 650,
    powod: () => 'Komunikat „woda bezpieczna" bez wyników badań — obietnica o zdrowiu mieszkańców bez danych.' },
  { gdy: k => k.wskazniki.mandat <= 0, sufit: () => 500, powod: () => 'Zarząd odwołał Cię ze stanowiska.' },
];

const REF_BIERNY = {};
async function indeksOdpornosci(k) {
  const kluczRef = `${k.def.firma}:${k.seed}`;
  if (!k.refBierny && !REF_BIERNY[kluczRef]) {
    const b = await grajAuto('bierny', k.seed, false, () => {}, false);
    REF_BIERNY[kluczRef] = { straty: b.st.w.straty, ekspozycja: ekspozycja(b).pln };
  }
  k.refBierny = k.refBierny || REF_BIERNY[kluczRef];
  const ref = k.refBierny;
  const ek = ekspozycja(k);
  const c = x => Math.max(0, Math.min(1, x));
  // Zakłócenie procesu = zdarzenie OT od 50 tys. zł (także własna awaria po wdrożeniu na OT).
  const zakl = k.incydenty.filter(i => (/sabota|S03|fala/.test(i.rodzaj) || i.ot) && i.pln >= 50000).length;
  const sd = k.statDzialow || { pytania: 0, zablokowane: 0 };
  const sk = {
    straty: c((1 - k.st.w.straty / Math.max(1, ref.straty)) / 0.9),
    ekspozycja: c((1 - ek.pln / Math.max(1, ref.ekspozycja)) / 0.9),
    niefinansowe: c(1 - zakl / 3),
    zgodnosc: (k.kontrola?.wynik || 0) / 60,
    reputacja: c(k.wskazniki.reputacja / (k.def.wskazniki.reputacja || 60)),
    // Dojrzałość z PRAWDZIWEJ skuteczności kluczowych kontroli (jakość, dryf, usterki) — nie z „jest/nie ma".
    dojrzalosc: KLUCZOWE.reduce((a, id) => a + Math.min(1, RU.skutecznosc(k, id) / RU.JAKOSC_BAZOWA), 0) / KLUCZOWE.length,
    ludzie: c(k.wskazniki.morale / 100),
    biznes: sd.pytania ? c(1 - sd.zablokowane / sd.pytania) : 1,
  };
  const wagi = { straty: 0.15, ekspozycja: 0.20, niefinansowe: 0.15, zgodnosc: 0.15, reputacja: 0.10, dojrzalosc: 0.10, ludzie: 0.05, biznes: 0.10 };
  const surowy = Math.round(1000 * Object.entries(wagi).reduce((a, [n, w]) => a + w * sk[n], 0));
  // Wynik kampanii: pół na pół skutki (Indeks) i praktyka (zasady). Praktyka nie zależy od szczęścia.
  const oceny = ZA.ocen(k, true);
  const jd = ZA.jakoscPraktyki(oceny);
  const kampaniaSurowy = Math.round((surowy + 1000 * jd) / 2);
  const bramki = BRAMKI.filter(b => b.gdy(k)).map(b => ({ sufit: b.sufit(k), powod: b.powod(k) }));
  const sufit = Math.min(1000, ...bramki.map(b => b.sufit));
  return {
    wynik: Math.min(surowy, sufit), surowy, kampania: Math.min(kampaniaSurowy, sufit), kampaniaSurowy, jd, oceny,
    bramki: bramki.filter(b => kampaniaSurowy > b.sufit || surowy > b.sufit),
    skladowe: sk, odniesienie: ref.straty, ekspozycja: ek.pln, sabotazeRok: ek.sabotaze, ekspozycjaOdniesienie: ref.ekspozycja,
  };
}
const jakoscDecyzji = k => ZA.jakoscPraktyki(ZA.ocen(k, true));

// ── WIDOKI (to, co gracz WIE) ──
function naglowek(k) {
  return `\n══════ Miesiąc ${k.st.m}/${k.def.miesiecy} — ${nazwaMiesiaca(k)} ══════\n` +
    `Budżet ${k.rok}: wydane ${zl(k.wydaneRok[k.rok] || 0)}, z abonamentami do grudnia ${zl(Z.zobowiazaniaRoku(k))} z ${zl(k.budzet[k.rok] || 0)} · ` +
    `Twoje godziny: ${k.hKart}/${k.def.h_gracza} h (z nadgodzinami maks. ${Math.round(Z.limitGodzin(k))}` +
    `${k.st.projekty.length ? `; w tym koordynacja ${k.st.projekty.length} projektów: ${Z.koordynacja(k)} h` : ''}` +
    `${Z.obciazenieGracza(k) ? `; stałe obowiązki: ${Z.obciazenieGracza(k)} h` : ''}) · ` +
    `${Z.karaWip(k) ? `Zespół traci ${Math.round(100 * Z.karaWip(k))}% czasu na przełączanie między projektami · ` : ''}` +
    `Mandat ${Math.round(k.wskazniki.mandat)} · Reputacja ${Math.round(k.wskazniki.reputacja)} · Morale ${Math.round(k.wskazniki.morale)}`;
}

function briefing(k) {
  const l = [];
  if (k.st.m === 1) l.push(...k.def.wstep, '');
  for (const z of k.zdarzenia.filter(x => x.typ === 'incydent' && !x.zagrane)) l.push(`⚠ TRWA: ${z.opis} — [i] żeby poprowadzić. Jeśli zamkniesz miesiąc, toczy się bez Ciebie.`);
  for (const z of k.zdarzenia.filter(x => x.typ !== 'incydent')) l.push(`• Na koniec miesiąca: ${z.opis || z.id}`);
  for (const o of k.obserwacje) l.push(`◦ ${o.od}: ${o.tresc}`);
  if (k.raportIT?.length) { l.push('Raport IT/bezpieczeństwa:'); for (const r of k.raportIT) l.push(`  – ${r}`); }
  if (k.ostatniIncydent && !k.ostatniIncydent.pokazany) {
    const x = k.ostatniIncydent; x.pokazany = true;
    l.push(`Incydent ${x.id}: ${x.tytul}. ${x.opis}`);
    for (const o of x.oceny) l.push(`  ${o.wynik === 'spelniona' ? '✅' : o.wynik === 'nieuczciwa' ? '⛔' : '❌'} ${o.opis} — ${o.dlaczego}`);
    for (const z of x.debrief || []) l.push(`  · ${z}`);
  }
  l.push(`Sprawy w skrzynce: ${k.sprawy.length}${k.sprawy.some(s => s.termin <= k.st.m) ? ' (część ma termin w tym miesiącu)' : ''}.`);
  return l.join('\n');
}

function widokSpraw(k) {
  if (!k.sprawy.length) return 'Skrzynka pusta.';
  const l = [];
  k.sprawy.forEach((s, i) => {
    l.push(`\n[${i + 1}] ${s.tytul} — od: ${s.od} · termin: ${s.termin <= k.st.m ? 'TEN miesiąc' : `m. ${s.termin}`}`);
    l.push(`    ${s.tresc}`);
    for (const [v, c] of Object.entries(SP.czasowniki(k, s))) {
      const par = Object.entries(c.param || {}).map(([n, d]) => `${n}=${d.wartosci ? d.wartosci.join('|') : d.lista ? 'a,b,…' : d.liczba ? `${d.liczba[0]}–${d.liczba[1]}` : '…'}`).join(' ');
      let koszt = '';
      try { const x = c.koszt && !c.param ? c.koszt({}) : null; if (x && (x.h || x.pln)) koszt = ` (${x.h ? `${x.h} h` : ''}${x.pln ? ` ${zl(x.pln)}` : ''})`; } catch { /* koszt zależy od parametrów */ }
      const pw = c.param ? null : SP.dostepnyCzasownik(k, s, v, {});
      l.push(`    · ${v}${par ? ` ${par}` : ''}: ${c.opis}${koszt}${pw ? `   [teraz nie: ${pw}]` : ''}`);
      for (const p of Object.values(c.param || {})) for (const h of p.pomoc || []) l.push(`        - ${h}`);
    }
  });
  return l.join('\n');
}

function widokRuchow(k, filtr = '') {
  const lista = RU.lista(k).filter(r => !filtr || r.kategoria === filtr || r.id.includes(filtr) || r.nazwa.toLowerCase().includes(filtr.toLowerCase()));
  const grupy = {};
  for (const r of lista) (grupy[r.kategoria] = grupy[r.kategoria] || []).push(r);
  const l = [];
  for (const [g, rs] of Object.entries(grupy)) {
    l.push(`\n── ${g} ──`);
    for (const r of rs) {
      const c = r.koszt || {};
      const koszt = [c.h ? `${c.h} h` : '', c.pln ? zl(c.pln) : '', c.msc ? `${zl(c.msc)}/mies.` : ''].filter(Boolean).join(', ');
      const par = Object.entries(r.param || {}).map(([n, w]) => `${n}=${(w || []).join('|')}`).join(' ');
      l.push(`  ${r.id.padEnd(30)} ${r.nazwa}${koszt ? ` [${koszt}]` : ''}${par ? `\n  ${''.padEnd(30)} parametry: ${par}` : ''}${r.powod ? `\n  ${''.padEnd(30)} ✗ ${r.powod}` : ''}`);
    }
  }
  return l.join('\n') || 'Brak ruchów pasujących do filtra.';
}

function widokObiektow(k) {
  const l = [];
  for (const o of Object.values(k.obiekty)) {
    const kon = S.kontrola[o.id];
    const w = RU.wiedzaOJakosci(k, o.id);
    const usterki = o.usterki.filter(u => u.odkryta).map(u => `${u.naprawiona ? '✓' : '✗'} ${u.opis}`);
    l.push(`  ${o.id.padEnd(22)} ${{ projekt: 'w toku', dziala: 'działa', wycofany: 'wycofany' }[o.stan]}` +
      `${Object.keys(o.param).length ? ` [${Object.entries(o.param).map(([n, v]) => `${n}=${v}`).join(', ')}]` : ''}` +
      `${w ? ` · skuteczność: ${w.opis}` : ''}${usterki.length ? `\n  ${''.padEnd(22)} usterki: ${usterki.join('; ')}` : ''}` +
      `${o.stan === 'dziala' && (kon.wymaga || []).some(x => !S.dziala(k.st, x)) ? `\n  ${''.padEnd(22)} ⚠ bez ${kon.wymaga.filter(x => !S.dziala(k.st, x)).join(', ')} działa w ~30%` : ''}`);
  }
  return l.length ? l.join('\n') : 'Nic jeszcze nie wdrożyłeś.';
}

function coWiemy(k) {
  const st = k.st;
  const inw = S.dziala(st, 'inwentaryzacja');
  const sz = (st.zasobyZnane / st.znane) * (1 + k.mglaBlad * (inw ? 0.15 : 1));
  const nier = inw ? 0.08 : 0.35;
  const lo = Math.max(st.zasobyZnane, Math.round(sz * (1 - nier))), hi = Math.round(sz * (1 + nier));
  const fakty = Object.values(k.fakty).filter(f => f.znany).map(f => `${f.naprawiony ? '✓' : '✗'} ${f.opis}`);
  const luki = RU.luki(k).map(x => `${k.akceptacje[x.id] !== undefined ? '[zaakceptowana] ' : ''}${x.id}: ${x.opis}`);
  return [
    `Zasoby w ewidencji: ${st.zasobyZnane}; prawdziwa liczba: prawdopodobnie ${lo}–${hi}.`,
    `Status KSC: ${k.wiedza.status || 'nieustalony (ruch: analiza_statusu)'}; wpis do wykazu: ${k.flagi.wpis ? `tak (${k.flagi.status_zgloszony})` : 'nie'}.`,
    `Znane fakty: ${fakty.length ? `\n  ${fakty.join('\n  ')}` : 'brak (rozpoznanie: skan_ekspozycji, przeglad_dostepow, przeglad_ot, rozmowa)'}`,
    `Znane luki (do naprawy albo akceptacji zarządu):${luki.length ? `\n  ${luki.join('\n  ')}` : ' brak'}`,
    `Rekrutacje: ${k.rekrutacje.map(r => `${r.etat} etatu od m. ${r.od}`).join(', ') || 'brak'}.`,
    `Poniesione straty: ${zl(st.w.straty)}. Wydatki łącznie: ${zl(st.w.wydatki)} (w tym reagowanie z rezerwy firmy: ${zl(st.w.reagowanie || 0)}).`,
  ].join('\n');
}

function widokIncydentu(k) {
  const inc = k.incydent;
  const l = [`\n── ${inc.def.id} „${inc.def.tytul}" · T+${inc.s.t.toFixed(1)} h (faza ostra do ${inc.def.limit_h} h) ──`];
  for (const x of inc.def.widok(inc.s)) l.push(x);
  for (const z of I.zegary(inc)) l.push(`  ⏱ ${z.nazwa}: ${z.zostalo > 0 ? `zostało ${z.zostalo.toFixed(1)} h` : 'PO TERMINIE'}`);
  l.push('Akcje (w dowolnej kolejności; każda zajmuje czas):');
  I.akcje(k).forEach((a, i) => l.push(`  ${String(i + 1).padStart(2)}) ${a.nazwa} [${a.czas_h} h${a.pln ? `, ${zl(a.pln)}` : ''}]${a.powod ? `   ✗ ${a.powod}` : ''}`));
  l.push('  c <h>) czekaj · k) zakończ fazę ostrą');
  return l.join('\n');
}

function podsumowanie(k) {
  const st = k.st;
  const l = ['\n════════ KONIEC KAMPANII ════════'];
  if (k.io) {
    l.push(`WYNIK KAMPANII: ${k.io.kampania}/1000  = ½ Indeks Odporności (${k.io.wynik}) + ½ Jakość praktyki (${Math.round(k.io.jd * 100)}%)`);
    l.push(`INDEKS ODPORNOŚCI: ${k.io.wynik}/1000  (${Object.entries(k.io.skladowe).map(([n, v]) => `${n} ${Math.round(100 * v)}%`).join(' · ')})`);
    l.push(`  Ekspozycja — oczekiwane straty w roku PO kampanii: ${zl(k.io.ekspozycja)} (bierny: ${zl(k.io.ekspozycjaOdniesienie)}); szansa sabotażu stacji ~${Math.round(100 * k.io.sabotazeRok)}%`);
    for (const b of k.io.bramki) l.push(`  ⛔ Wynik ograniczony do ${b.sufit} (bez tego: kampania ${k.io.kampaniaSurowy}, indeks ${k.io.surowy}): ${b.powod}`);
    const zle = k.io.oceny.filter(o => o.wynik !== 'spelniona').sort((a, b) => (b.wynik === 'nieuczciwa') - (a.wynik === 'nieuczciwa') || b.waga - a.waga);
    l.push(`PRAKTYKA: ${k.io.oceny.filter(o => o.wynik === 'spelniona').length} zasad spełnionych, ${zle.length} nie (pierwsze z brzegu):`);
    for (const o of zle.slice(0, 10)) l.push(`  ${o.wynik === 'nieuczciwa' ? '⛔' : '❌'} m. ${o.m} ${o.opis}\n     ${o.dlaczego}`);
  }
  if (k.wskazniki.mandat <= 0) l.push('Zarząd stracił zaufanie i odwołał Cię ze stanowiska.');
  l.push(`Straty z incydentów: ${zl(st.w.straty)} · Wydatki: ${zl(st.w.wydatki)} · Mandat: ${Math.round(k.wskazniki.mandat)} · Reputacja: ${Math.round(k.wskazniki.reputacja)}`);
  if (k.kontrola) {
    l.push(`AUDYT ZAMYKAJĄCY: ${k.kontrola.wynik}/60 pkt${k.kontrola.rozszerzonaProba ? ' — próba ROZSZERZONA (audytor nie wierzy już deklaracjom)' : ''}`);
    for (const x of k.klamstwa) l.push(`  ${x.ujawnione ? '⛔ ujawnione' : '🤫 nieujawnione'}: „${x.tekst}" (wobec: ${x.wobec}${x.ujawnione ? `; ${x.ujawnione.przez}, m. ${x.ujawnione.m}` : ''})`);
    for (const p of k.kontrola.proba) l.push(`  🔎 próbka audytora: ${p}`);
    for (const [o, s] of k.kontrola.obszary) l.push(`  ${s === 'zgodny' ? '✅' : s === 'drobna' ? '⚠️' : '❌'} ${o}: ${s === 'glowna' ? 'niezgodność główna' : s === 'drobna' ? 'niezgodność drobna' : 'zgodny'}`);
  }
  l.push('Incydenty:');
  for (const i of k.incydenty) l.push(`  m. ${i.m}: ${OPIS_SKUTKU[i.rodzaj] || i.rodzaj} — ${zl(i.pln)}`);
  if (!k.incydenty.length) l.push('  brak');
  l.push('Mgła wojny — prawda (dopiero teraz):');
  l.push(`  intruzi wciąż w sieci: ${st.intruzi.length ? st.intruzi.map(x => `${x.kto}@${x.etap}`).join(', ') : 'brak'}`);
  l.push(`  zasoby poza ewidencją: ${Math.round(st.zasobyZnane / st.znane - st.zasobyZnane)}`);
  l.push(`  nieodkryte fakty: ${Object.values(k.fakty).filter(f => f.prawda && !f.znany && !f.naprawiony).map(f => f.opis).join('; ') || 'brak'}`);
  l.push(`  ukryte usterki wdrożeń: ${Object.values(k.obiekty).flatMap(o => o.usterki.filter(u => !u.odkryta && !u.naprawiona).map(u => `${o.id}: ${u.opis}`)).join('; ') || 'brak'}`);
  for (const d of Object.values(k.dzialy)) {
    l.push(`  ${d.nazwa}: zaufanie ${d.zaufanie.toFixed(2)}, świadomość ${d.swiadomosc.toFixed(2)}, ukryte obejścia: ${d.ukryte.filter(u => !u.odkryte).map(u => INICJATYWY[u.ini].nazwa).join(', ') || 'brak'}`);
  }
  return l.join('\n');
}

// ── AUTOMATY (testy i laboratoria: czy model zachowuje się sensownie) ──
// Strategia: { ruchy(k, A), sprawa(k, s, A) → { v, p } | null, incydent(k, A), reset?(seed) }.
// Automaty widzą tylko to, co gracz (A.znany, wiedza o obiektach) — nie prawdę silnika.
function apiAuto(k) {
  return {
    ruch: (id, p = {}) => (RU.dostepny(k, id, p) ? null : RU.wykonaj(k, id, p)),
    dostepny: (id, p = {}) => RU.dostepny(k, id, p),
    sprawa: (s, v, p = {}) => (SP.dostepnyCzasownik(k, s, v, p) ? null : SP.odpowiedz(k, s.id, v, p)),
    inc: aid => (k.incydent && !I.dostepnaAkcja(k, aid) ? incydentAkcja(k, aid) : null),
    czekaj: h => (k.incydent ? incydentCzekaj(k, h) : null),
    znany: id => !!(k.fakty[id]?.znany && !k.fakty[id].naprawiony),
    dziala: id => S.dziala(k.st, id),
    obiekt: id => k.obiekty[id],
  };
}

// Najtańszy zestaw warunków, który naprawdę tnie ryzyko (resztka ≤ 0,6), w ramach zasobów.
function najlepszeWarunki(k, s, A) {
  const ini = INICJATYWY[s.ini];
  const W = ini.warunki.map(w => w.id);
  let best = null;
  for (let mask = 1; mask < 1 << W.length; mask++) {
    const ids = W.filter((_, i) => mask & (1 << i));
    if (ZA.resztka(ini, ids.join(',')) > 0.6) continue;
    const v = s.rodzaj === 'prosba' ? 'warunki' : 'legalizuj';
    if (SP.dostepnyCzasownik(k, s, v, { warunki: ids.join(',') })) continue;
    const c = SP.policzWarunki(k, ini, ids);
    const koszt = c.h + c.pln / 300;
    if (!best || koszt < best.koszt) best = { ids, koszt };
  }
  return best?.ids;
}

const PLAYBOOK = {
  S01: s => (s.udaremnione ? ['telefon_kontrahent', 'zgloszenie_cert', 'pochwala', 'przeglad_skrzynek', 'zabezpiecz_skrzynki', 'zgloszenie_uodo']
    : ['bank', 'telefon_kontrahent', 'zawiadomienie', 'przeglad_skrzynek', 'zabezpiecz_skrzynki', 'zgloszenie_uodo', 'zgloszenie_cert', 'procedura']),
  S03: s => (s.proba ? ['przeglad_ekspozycji', 'usun_furtke', 'csirt']
    : ['proces_reczny', 'odetnij', 'probki', 'komunikat_prawda', 'csirt', 'dowody', 'zmien_pin', 'odtworz_konfiguracje', 'przeglad_ekspozycji', 'usun_furtke']),
};

// Pierwsza dostępna odpowiedź z listy (budżet, godziny, wymagania) — jak człowiek, który ma
// plan A, B i C, zamiast zostawiać sprawę do terminu, gdy plan A nie przejdzie.
function pierwszaDostepna(k, s, lista) {
  return lista.find(d => d && !SP.dostepnyCzasownik(k, s, d.v, d.p || {})) || null;
}
// Decyzje cykliczne i zmiany firmy (data/cykliczne.js, sprawy S_rozbudowa/S_ciecie/S_odejscie).
function madraCykliczna(k, s, A) {
  const dowod = id => { const o = A.obiekt(id); return o && Math.max(o.ostPrzeglad ?? -99, o.ostTest ?? -99) >= k.st.m - 12; };
  const cert = (k.def.certyfikaty || []).find(c => c.id === s.dane?.klucz);
  const plany = {
    C_odnowienie: () => [dowod(s.dane.klucz) ? { v: 'negocjuj' } : null, { v: 'przedluz' }],
    C_certyfikat: () => [cert?.auto ? { v: 'automatyzuj' } : null, { v: 'zlec_msp' }, { v: 'odnow' }],
    C_eol: () => [{ v: 'izoluj' }, { v: 'modernizuj', p: { tryb: 'z_pilotazem' } }, { v: 'wsparcie' }, { v: 'akceptuj' }],
    C_alerty: () => [{ v: 'mdr' }, { v: 'strojenie' }],
    C_kolejka: () => [{ v: 'msp' }, { v: 'priorytety' }],
    S_rozbudowa: () => [{ v: 'wlacz' }],
    S_ciecie: () => [{ v: 'argumentuj' }],
    S_odejscie: () => [A.dziala('msp') ? { v: 'msp' } : null, { v: 'zatrudnij' }, { v: 'przejmij' }],
  }[s.sid];
  return plany ? pierwszaDostepna(k, s, plany()) : undefined;
}

// Sprawy z kampanii — odpowiedzi „mądre" (uczciwe, z priorytetami i budżetem).
function madraSprawa(k, s, A) {
  const cyk = madraCykliczna(k, s, A);
  if (cyk !== undefined) return cyk;
  if (s.rodzaj === 'prosba') {
    if (D.ciezarRyzyka(INICJATYWY[s.ini]) < 0.1) return { v: 'zgoda' };
    const w = najlepszeWarunki(k, s, A);
    return w ? { v: 'warunki', p: { warunki: w.join(',') } } : { v: 'alternatywa' };
  }
  if (s.rodzaj === 'odkrycie') { const w = najlepszeWarunki(k, s, A); return w ? { v: 'legalizuj', p: { warunki: w.join(',') } } : { v: 'wylacz' }; }
  if (s.rodzaj === 'sygnal') return A.dziala('mdr') ? { v: 'przekaz_mdr' } : { v: 'zbadaj' };
  const sw = {
    S_budzet2027: () => (A.dziala('ryzyko') ? { v: 'wniosek', p: { kwota: 240000, uzasadnienie: 'ryzyko' } } : { v: 'wniosek', p: { kwota: 190000, uzasadnienie: 'potrzeby' } }),
    S_przejecie: () => (!s.dane.przeglad && !SP.dostepnyCzasownik(k, s, 'przeglad') ? { v: 'przeglad' } : s.dane.przeglad ? { v: 'polacz' } : { v: 'odloz' }),
    S_umowa_integratora: () => ({ v: 'negocjuj', p: { klauzule: 'mfa_konta,kopie_u_nas,zakaz_przekierowan' } }),
    S_ubezpieczenie: () => {
      const p = { mfa: A.dziala('mfa') && A.obiekt('mfa').param.zakres === 'wszyscy' ? 'tak' : 'nie', edr: A.dziala('edr') ? 'tak' : 'nie',
        kopie: A.dziala('backup') && A.obiekt('backup').param.nosnik === 'offline' ? 'tak' : 'nie' };
      return Object.values(p).every(x => x === 'tak') ? { v: 'ankieta', p } : { v: 'odrzuc' };
    },
    S_dwr: () => (!s.dane.lista ? { v: 'lista' } : !s.dane.plan ? { v: 'plan' } : !s.dane.odciete ? { v: 'odetnij' } : null),
    S_wodomierze: () => ({ v: 'srodki', p: { srodki: 'ocena_dostawcy,umowa_powierzenia,mfa_dostawcy' } }),
    S_emerytura: () => ({ v: 'srodki', p: { srodki: 'dokumentacja,zmiana_hasel,konta_imienne' } }),
    S_falszywy_komunikat: () => ({ v: 'dementi', p: { kanaly: 'strona,sms_gminy,media,wyniki_badan' } }),
    S_noc_integrator: () => ({ v: 'oddzwon' }),
  }[s.sid];
  return sw ? sw() : null;
}
function madryIncydent(k, A) {
  const inc = k.incydent;
  for (const a of PLAYBOOK[inc.id](inc.s)) { if (!k.incydent) return; A.inc(a); }
}

const DZIALY_ROTACJA = ['produkcja', 'siec', 'finanse', 'bok', 'kadry', 'zarzad'];
// Kolejność „tanie i ważne najpierw" — a zaraz po MFA godziny z zewnątrz (MSP z wymaganiami):
// pół etatu nie udźwignie kilkunastu wdrożeń, projekty stoją w kolejce (docs/18-…).
const PRIORYTETY_MADRY = [
  ['wdroz:inwentaryzacja', { metoda_ot: 'pasywna' }], ['wdroz:moje_cert'], ['wdroz:mfa', { zakres: 'wszyscy', metoda: 'numer' }],
  ['wdroz:msp', { umowa: 'z_wymaganiami' }],
  ['wdroz:weryfikacja_platnosci', { sposob: 'uzgodniona' }], ['wdroz:backup', { zakres: 'biuro_ot', nosnik: 'offline' }], ['wdroz:plan_ir'],
  ['wdroz:bcp'], ['wdroz:ekspozycja'], ['wdroz:ryzyko'], ['wdroz:szbi', { sposob: 'doradca' }], ['wdroz:patch', { zakres_ot: 'z_producentem' }],
  ['wdroz:szkolenia', { forma: 'program' }], ['wdroz:edr', { zakres: 'biuro_serwery', tryb: 'wykrywaj' }], ['wdroz:brama_dostepu'],
  ['wdroz:dostawcy'], ['wdroz:segmentacja', { zakres: 'tylko_ot' }],
];
function madreRuchy(k, A) {
  const m = k.st.m;
  if (m === 1) { A.ruch('analiza_statusu'); A.ruch('wpis_s46', { status: 'wazny' }); }
  if (m === 2 || m % 6 === 0) A.ruch('skan_ekspozycji');
  if (m === 2) A.ruch('przeglad_ot');
  if (m === 3) A.ruch('przeglad_dostepow');
  // Znane drzwi zamykamy od razu.
  if (A.znany('hmi_wystawiony')) A.ruch('odetnij_hmi');
  if (A.znany('pin_domyslny')) A.ruch('zmien_pin');
  if (A.znany('narzedzie_zdalne_integratora') && A.dziala('brama_dostepu')) A.ruch('usun_narzedzie_zdalne');
  // Podstawy: najwyżej dwa nowe wdrożenia na miesiąc i najwyżej trzy projekty naraz (limit pracy
  // w toku — inaczej wszystko stoi w kolejce do godzin zespołu), w kolejności „tanie i ważne".
  let n = 0;
  for (const [id, p] of PRIORYTETY_MADRY) {
    if (n >= 2 || k.st.projekty.length >= 3) break;
    const o = A.obiekt(id.split(':')[1]);
    if (o && o.stan !== 'wycofany') continue;
    if (A.ruch(id, p || {})) n++;
  }
  // Cykl życia: testy, przeglądy, naprawy, EDR na blokowanie po strojeniu.
  for (const o of Object.values(k.obiekty)) {
    if (o.stan !== 'dziala') continue;
    for (const u of o.usterki.filter(x => x.odkryta && !x.naprawiona && x.naprawa_h)) A.ruch(`napraw:${o.id}`, { usterka: u.id });
    const ost = Math.max(o.ostPrzeglad ?? -99, o.ostTest ?? -99);
    if (['backup', 'plan_ir', 'bcp', 'weryfikacja_platnosci'].includes(o.id) && ost < m - 6) A.ruch(`test:${o.id}`);
    else if (ZA.KLUCZOWE.includes(o.id) && ost < m - 9 && m - o.dzialaOd >= 2) A.ruch(`przeglad:${o.id}`);
  }
  const edr = A.obiekt('edr');
  if (edr?.stan === 'dziala' && edr.param.tryb === 'wykrywaj' && m - edr.dzialaOd >= 2) A.ruch('zmien:edr', { tryb: 'blokuj' });
  if (!k.flagi[`szkolenie_kierownika_${k.rok}`] && m >= 3) A.ruch('szkolenie_kierownika');
  if (m % 3 === 0) A.ruch('raport_zarzadowi', { styl: 'rzetelny' });
  if (m % 2 === 0) A.ruch('rozmowa', { dzial: DZIALY_ROTACJA[(m / 2) % DZIALY_ROTACJA.length] });
  if (m >= 20 && !k.flagi.plan_naprawczy) A.ruch('plan_naprawczy');
  for (const l of RU.luki(k).filter(x => x.id.startsWith('brak:') && k.akceptacje[x.id] === undefined && m >= 18)) A.ruch('akceptacja_ryzyka', { luka: l.id });
}

// Rozsądny laik: dobre intencje, wdraża to, o czym słyszy, z domyślnymi ustawieniami; nie robi
// rozpoznania, pilotaży, testów ani przeglądów — „wdrożone = działa".
const OBSERWACJA_NA_RUCH = {
  O_status: [['wpis_s46', { status: 'wazny' }]], O_cert: [['skan_ekspozycji']], O_haslo_poczta: [['wdroz:mfa']], O_kopie_ot: [['wdroz:backup']],
  O_rachunki: [['wdroz:weryfikacja_platnosci']], O_praca_reczna: [['wdroz:plan_ir'], ['wdroz:bcp']], O_antywirus: [['wdroz:edr', { zakres: 'z_ot' }]],
  O_router: [['wdroz:patch']], O_lista_obecnosci: [['wdroz:szkolenia', { forma: 'elearning' }]], O_szbi: [['wdroz:szbi']],
  O_kierownik_szkolenie: [['szkolenie_kierownika']], O_pol_etatu: [['wdroz:msp', { umowa: 'standardowa' }]], O_audyt: [['plan_naprawczy']],
};

const AUTO = {
  madry: { ruchy: madreRuchy, sprawa: madraSprawa, incydent: madryIncydent },
  rozsadny: {
    ruchy: (k, A) => {
      k.zaleglosci = k.zaleglosci || [];
      for (const o of k.obserwacje) k.zaleglosci.push(...(OBSERWACJA_NA_RUCH[o.id] || []));
      k.zaleglosci = k.zaleglosci.filter(([id, p]) => !A.ruch(id, p || {}) && !String(RU.dostepny(k, id, p || {})).startsWith('już'));
      if (A.znany('hmi_wystawiony')) A.ruch('odetnij_hmi');
    },
    sprawa: (k, s, A) => {
      if (s.rodzaj === 'prosba') return { v: 'warunki', p: { warunki: INICJATYWY[s.ini].warunki.filter(w => !w.wymaga || A.dziala(w.wymaga)).map(w => w.id).join(',') } };
      if (s.rodzaj === 'odkrycie') return { v: 'legalizuj', p: { warunki: INICJATYWY[s.ini].warunki.filter(w => !w.wymaga || A.dziala(w.wymaga)).map(w => w.id).join(',') } };
      if (s.rodzaj === 'sygnal') return { v: 'zbadaj' };
      // Laik: odnawia jak leci, modernizuje „od razu", zatrudnia, gdy coś nie działa.
      const cyk = { C_odnowienie: [{ v: 'przedluz' }], C_certyfikat: [{ v: 'odnow' }], C_eol: [{ v: 'modernizuj', p: { tryb: 'od_razu' } }, { v: 'zostaw' }],
        C_alerty: [{ v: 'zatrudnij' }, { v: 'zostaw' }], C_kolejka: [{ v: 'nadgodziny' }], S_rozbudowa: [{ v: 'nic' }], S_ciecie: [{ v: 'przyjmij' }],
        S_odejscie: [{ v: 'przejmij' }] }[s.sid];
      if (cyk) return pierwszaDostepna(k, s, cyk);
      return ({ S_budzet2027: { v: 'wniosek', p: { kwota: 180000, uzasadnienie: 'potrzeby' } }, S_przejecie: { v: 'polacz' }, S_umowa_integratora: { v: 'przedluz' },
        S_ubezpieczenie: { v: 'odrzuc' }, S_dwr: s.dane.lista ? null : { v: 'lista' }, S_wodomierze: { v: 'srodki', p: { srodki: 'umowa_powierzenia' } },
        S_emerytura: { v: 'srodki', p: { srodki: 'zmiana_hasel' } }, S_falszywy_komunikat: { v: 'dementi', p: { kanaly: 'strona' } }, S_noc_integrator: { v: 'odmow' } })[s.sid] || null;
    },
    incydent: (k, A) => {
      const inc = k.incydent;
      const plan = inc.id === 'S01' ? ['zebranie', 'bank', 'przeglad_skrzynek', 'procedura'] : inc.s.proba ? ['csirt'] : ['integrator_zdalnie', 'proces_reczny', 'odetnij', 'komunikat_prawda', 'csirt'];
      for (const a of plan) { if (!k.incydent) return; A.inc(a); }
    },
  },
  odmawiajacy: {
    ruchy: madreRuchy,
    sprawa: (k, s, A) => (s.rodzaj === 'prosba' ? { v: 'odmowa' } : s.rodzaj === 'odkrycie' ? { v: 'ukarz' } : madraSprawa(k, s, A)),
    incydent: madryIncydent,
  },
  // Bierny: nic nie robi; sprawy rozstrzygają się same, incydenty toczą się bez niego.
  bierny: {},
};

// `nazwa` = klucz z AUTO albo gotowy obiekt strategii (laboratoria podają własne).
async function grajAuto(nazwa, seed, szczegoly, wypisz = console.log, podsumuj = true) {
  const strat = typeof nazwa === 'string' ? AUTO[nazwa] : nazwa;
  strat.reset?.(seed);
  const k = nowaKampania('wodociagi', seed);
  const A = apiAuto(k);
  while (!k.koniec) {
    strat.ruchy?.(k, A);
    for (const z of k.zdarzenia.filter(x => x.typ === 'incydent' && !x.zagrane)) {
      if (!strat.incydent) continue;
      rozpocznijIncydent(k, z.id);
      strat.incydent(k, A);
      if (k.incydent) incydentZakoncz(k);
    }
    for (const s of [...k.sprawy]) {
      if (!k.sprawy.includes(s) || !strat.sprawa) continue;
      for (let i = 0; i < 4 && k.sprawy.includes(s); i++) {        // sprawy wieloetapowe (przegląd → połączenie)
        const d = strat.sprawa(k, s, A);
        if (!d || !A.sprawa(s, d.v, d.p || {})) break;
      }
    }
    if (szczegoly) {
      wypisz(`m.${String(k.st.m).padStart(2)} ${nazwaMiesiaca(k).padEnd(16)} mandat ${String(Math.round(k.wskazniki.mandat)).padStart(3)} rep ${String(Math.round(k.wskazniki.reputacja)).padStart(3)} | ` +
        `h ${k.hKart} | sprawy ${k.sprawy.length} | obiekty ${Object.values(k.obiekty).filter(o => o.stan === 'dziala').length}`);
      for (const r of k.rejestr.filter(x => x.m === k.st.m)) wypisz(`      [${r.kto}] ${r.tekst}`);
    }
    zamknijMiesiac(k);
  }
  if (podsumuj) { k.io = await indeksOdpornosci(k); wypisz(podsumowanie(k)); }
  return k;
}

// ── ZAPIS: odtworzenie kampanii z listy akcji ──
function wykonajAkcje(k, a) {
  if (a.t === 'ruch') return RU.wykonaj(k, a.id, a.p);
  if (a.t === 'sprawa') return SP.odpowiedz(k, a.id, a.v, a.p);
  if (a.t === 'inc_start') return rozpocznijIncydent(k, a.id);
  if (a.t === 'inc') return incydentAkcja(k, a.a);
  if (a.t === 'inc_czekaj') return incydentCzekaj(k, a.h);
  if (a.t === 'inc_koniec') return incydentZakoncz(k);
  if (a.t === 'zamknij') return zamknijMiesiac(k);
  throw new Error(`nieznana akcja w zapisie: ${a.t}`);
}
async function odtworz(defId, seed, akcje) {
  const k = nowaKampania(defId, seed);
  for (const a of akcje) wykonajAkcje(k, a);
  if (k.akcje.length !== akcje.length) throw new Error('zapis nie odtwarza się (różna liczba akcji)');
  return k;
}

// ── GRA INTERAKTYWNA ──
// Wejście linia po linii z kolejką: działa i w terminalu, i z potoku (testy skryptem).
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
// „klucz=wartość klucz2=a,b" → { klucz: 'wartość', klucz2: 'a,b' }
const parametry = tokeny => Object.fromEntries(tokeny.filter(t => t.includes('=')).map(t => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));

const POMOC = `
Komendy (wszystko w dowolnej kolejności, ile chcesz w miesiącu):
  b                     briefing (obserwacje, raport IT, wynik incydentu)
  r                     raporty działów
  s                     skrzynka spraw z czasownikami
  a <nr> <czasownik> [k=v …]   odpowiedz na sprawę (np. a 1 warunki warunki=brama,konta)
  m [kategoria|szukaj]  lista ruchów (kontrole, rozpoznanie, ot, ludzie, zarzad, prawo, audyt)
  x <ruch> [k=v …]      wykonaj ruch (np. x wdroz:edr zakres=biuro_serwery tryb=wykrywaj · x test:backup · x rozmowa dzial=produkcja)
  o                     Twoje wdrożenia: stan, parametry, co wiesz o skuteczności, usterki
  p                     doradztwo: cennik tematów, zlecenia w toku, raporty z rekomendacjami
  w                     co wiemy (zasoby, fakty, luki, status)
  i                     poprowadź trwający incydent
  d                     dziennik (prowadzący/debug)
  n                     zamknij miesiąc
  q                     zapisz i wyjdź`;

async function grajInteraktywnie(plikZapisu) {
  let seed = Math.floor(Math.random() * 1e9);
  let zapisane = [];
  if (plikZapisu && fs.existsSync(plikZapisu)) {
    const z = JSON.parse(fs.readFileSync(plikZapisu, 'utf8'));
    seed = z.seed; zapisane = z.akcje;
  }
  const k = await odtworz('wodociagi', seed, zapisane);
  const { pytaj, zamknij } = wejscie();
  const zapisz = () => { if (plikZapisu) fs.writeFileSync(plikZapisu, JSON.stringify({ seed, akcje: k.akcje })); };
  const sprobuj = fn => { try { const t = fn(); if (t) console.log(typeof t === 'string' ? t : t.tekst || ''); zapisz(); } catch (e) { if (!e.niedostepny) throw e; console.log(`Nie da się: ${e.message}.`); } };
  console.log(naglowek(k)); console.log(briefing(k)); console.log(POMOC);

  while (!k.koniec) {
    if (k.incydent) {
      console.log(widokIncydentu(k));
      const l = ((await pytaj('incydent> ')) ?? 'k').trim().toLowerCase();
      const ak = I.akcje(k);
      if (l === 'k') { const w = incydentZakoncz(k); console.log(`Koniec fazy ostrej: ${w.tytul}. ${w.opis}`); zapisz(); continue; }
      const mc = l.match(/^c\s+(\d+(\.\d+)?)$/);
      if (mc) { sprobuj(() => { const r = incydentCzekaj(k, Number(mc[1])); return r.koniec ? `${r.tekst} Koniec fazy ostrej: ${r.koniec.tytul}.` : r.tekst; }); continue; }
      const a = ak[Number(l) - 1] || ak.find(x => x.id === l);
      if (!a) { console.log('Podaj numer albo id akcji, „c <h>" albo „k".'); continue; }
      sprobuj(() => { const r = incydentAkcja(k, a.id); return r.koniec ? `${r.tekst}\nKoniec fazy ostrej: ${r.koniec.tytul}. ${r.koniec.opis}` : r.tekst; });
      continue;
    }
    const linia = await pytaj('\n> ');
    const tok = (linia ?? 'q').trim().split(/\s+/);
    const cmd = tok[0].toLowerCase();
    if (cmd === 'q') { zapisz(); zamknij(); console.log(plikZapisu ? `Zapisano w ${plikZapisu}.` : 'Bez pliku zapisu (--zapis=plik.json).'); return; }
    if (cmd === '?' || cmd === 'h') console.log(POMOC);
    else if (cmd === 'b') { console.log(naglowek(k)); console.log(briefing(k)); }
    else if (cmd === 'r') for (const r of k.raporty.length ? k.raporty : [{ naglowek: 'Raporty', linie: ['Pierwsze raporty działów przyjdą po zamknięciu miesiąca.'] }]) { console.log(`\n■ ${r.naglowek}`); for (const x of r.linie) console.log(`  ${x}`); }
    else if (cmd === 's') console.log(widokSpraw(k));
    else if (cmd === 'm') console.log(widokRuchow(k, tok[1] || ''));
    else if (cmd === 'o') console.log(widokObiektow(k));
    else if (cmd === 'p') console.log(DR.widok(k));
    else if (cmd === 'w') console.log(coWiemy(k));
    else if (cmd === 'd') for (const r of k.rejestr.filter(x => x.m === k.st.m)) console.log(`  [${r.kto}] ${r.tekst}`);
    else if (cmd === 'x') sprobuj(() => RU.wykonaj(k, tok[1] || '', parametry(tok.slice(2))));
    else if (cmd === 'a') {
      const s = k.sprawy[Number(tok[1]) - 1];
      if (!s) { console.log('Nie ma takiej sprawy (s — lista).'); continue; }
      sprobuj(() => SP.odpowiedz(k, s.id, tok[2] || '', parametry(tok.slice(3))));
    } else if (cmd === 'i') {
      const z = k.zdarzenia.find(x => x.typ === 'incydent' && !x.zagrane);
      if (!z) { console.log('Nie trwa żaden incydent.'); continue; }
      sprobuj(() => { rozpocznijIncydent(k, z.id); return null; });
    } else if (cmd === 'n') {
      const inc = k.zdarzenia.filter(x => x.typ === 'incydent' && !x.zagrane).length;
      const terminy = k.sprawy.filter(s => s.termin <= k.st.m).length;
      if ((inc || terminy) && ((await pytaj(`${inc ? `Incydent toczy się bez Ciebie. ` : ''}${terminy ? `${terminy} spraw rozstrzygnie się domyślnie. ` : ''}Zamknąć? [t/n] `)) ?? '').trim() !== 't') continue;
      zamknijMiesiac(k);
      zapisz();
      if (!k.koniec) { console.log(naglowek(k)); console.log(briefing(k)); }
    } else console.log('Nieznana komenda (? — pomoc).');
  }
  k.io = await indeksOdpornosci(k);
  console.log(podsumowanie(k));
  zamknij();
}

async function main() {
  const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1];
  const auto = arg('auto');
  if (auto) {
    if (!AUTO[auto]) { console.error(`Strategie: ${Object.keys(AUTO).join(', ')}`); process.exit(1); }
    await grajAuto(auto, Number(arg('seed') || 7), process.argv.includes('--szczegoly'));
  } else await grajInteraktywnie(arg('zapis'));
}

module.exports = {
  walidujKampanie, pelnaDefinicja, nowaKampania, zamknijMiesiac, rozpocznijIncydent, incydentAkcja, incydentCzekaj, incydentZakoncz,
  ujawnij, ocenaKontroli, indeksOdpornosci, ekspozycja, coJesli, jakoscDecyzji, BRAMKI, KLUCZOWE, podsumowanie, widokRuchow, widokSpraw,
  apiAuto, najlepszeWarunki, madraSprawa, pierwszaDostepna, madreRuchy, madryIncydent, PLAYBOOK, AUTO, grajAuto, wykonajAkcje, odtworz,
};

// Po module.exports: moduły ładowane leniwie (doradztwo → kampania.coJesli) muszą widzieć eksporty,
// także gdy kampania jest uruchomiona z terminala jako program główny.
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
