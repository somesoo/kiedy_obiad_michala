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

// ── TWORZENIE ──
function nowaKampania(defId, seed) {
  const def = require(`../data/kampanie/${defId}`);
  const firma = FIRMY[def.firma];
  const st = S.nowyStan(firma, seed);
  const k = {
    def, st, seed, flagi: {}, wskazniki: { ...def.wskazniki }, budzet: { ...def.budzet }, wydaneRok: {},
    dzialy: D.noweDzialy(def), rezyser: R.nowyRezyser(), modStale: {}, zrobione: new Set(), odlozone: {},
    rnd: { dzialy: S.mulberry32(seed ^ 0x9e3779b9), rezyser: S.mulberry32(seed ^ 0x85ebca6b) },
    karty: [], kartyNastepne: [], zdarzenia: [], decyzje: [], rejestr: [], incydenty: [], raporty: [],
    hKart: 0, koniec: false, akcje: [], kontrola: null,
  };
  k.log = (kto, tekst) => k.rejestr.push({ m: k.st.m, kto, tekst });
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

function zastosujModyfikatory(k) {
  for (const w of new Set([...Object.keys(k.modStale), ...Object.keys(k.rezyser.wagi)])) {
    k.st.mod.wektory[w] = (k.modStale[w] ?? 1) * (k.rezyser.wagi[w] ?? 1);
  }
  k.st.mod.h_extra = (k.def.h_gracza || 0) - k.hKart;
}

// ── POCZĄTEK MIESIĄCA ──
function rozpocznijMiesiac(k) {
  kalendarz(k);
  if (k.budzet[k.rok] === undefined) k.budzet[k.rok] = k.budzet[k.rok - 1] ?? 0;
  D.ustawObciazenie(k);
  k.karty = k.kartyNastepne; k.kartyNastepne = [];
  k.kartyDzialow = 0;
  for (const d of Object.values(k.dzialy)) {
    const w = D.wykonajPlan(k, d);
    if (!w) continue;
    k.log('dzial', `${d.nazwa}: ${w.typ === 'pytanie' ? 'PYTA' : 'OBCHODZI'} — ${D.INICJATYWY[w.ini].nazwa}; ${w.powod}`);
    if (w.typ === 'pytanie') { k.karty.push(D.kartaPytania(k, w)); k.kartyDzialow++; }
  }
  const plan = R.zaplanujMiesiac(k);
  for (const c of plan.karty) k.karty.push({ id: c.id, zrodlo: 'katalog', ...k.def.karty[c.id] });
  k.zdarzenia = [];
  for (const z of plan.zdarzenia) {
    if (z.typ === 'karta') k.karty.push({ id: z.id, zrodlo: 'katalog', ...k.def.karty[z.id], obowiazkowa: true });
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
  if (e.h) k.hKart += e.h;
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
  if (e.budzet) Object.assign(k.budzet, e.budzet);
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
  k.akcje.push({ t: 'karta', id: kartaId, j });
  if (c.zrodlo === 'dzial') { zastosuj(k, { h: o.h, pln: o.pln }); D.odpowiedz(k, c, o.odpowiedz); }
  else if (c.zrodlo === 'odkrycie') { zastosuj(k, { h: o.h, pln: o.pln, mandat: o.mandat }); D.odpowiedzOdkrycie(k, c, o.odpowiedz); }
  else if (c.zrodlo === 'sygnal') {
    zastosuj(k, { h: o.h });
    if (o.zbadaj && k.st.intruzi.includes(c.intruz)) {
      k.st.intruzi.splice(k.st.intruzi.indexOf(c.intruz), 1);
      const op = { dostep: 15000, eskalacja: 40000, ruch: 110000 }[c.intruz.etap] || 15000;
      wydaj(k, op);
      k.log('gracz', `Sygnał z działu zbadany: przyczółek usunięty (etap: ${c.intruz.etap}, koszt ${zl(op)})`);
      c.wynik = `Analiza potwierdziła włamanie na etapie „${c.intruz.etap}" — usunięte.`;
    } else if (o.zbadaj) c.wynik = 'Analiza nic nie znalazła.';
  } else zastosuj(k, o);
  R.poDecyzji(k, c.cele, o.ocena);
  k.decyzje.push({ m: k.st.m, karta: c.tytul, tekst: o.tekst, ocena: o.ocena, dlaczego: o.dlaczego });
  k.karty.splice(i, 1);
  return c.wynik;
}

function zlecRecznie(k, id) {
  k.akcje.push({ t: 'zlec', id });
  zastosuj(k, { zlec: [id] });
}

async function zagrajZdarzenie(k, z, wybierz, wypisz) {
  const s = wczytaj(z.id);
  const stan = { kontrole: KONTROLE.map(x => x.id).filter(id => S.dziala(k.st, id)) };
  const wybory = [];
  const wyb = async opcje => { const j = await wybierz(opcje); wybory.push(j); return j; };
  const wynik = await graj(s, stan, wyb, wypisz);
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
  // Brak decyzji też jest decyzją: pytania działów przechodzą w „odłóż".
  for (const c of k.karty) {
    if (c.zrodlo === 'dzial') { D.odpowiedz(k, c, 'odloz'); k.log('dzial', `${c.tytul}: brak odpowiedzi → odłożone`); }
  }
  k.karty = [];
  let intensywnosc = 0;
  for (const z of k.zdarzenia) {
    intensywnosc += z.ciezar || 0;
    if (z.typ === 'termin') terminSzbi(k);
    if (z.typ === 'fala') falaHaktywistow(k);
    if (z.typ === 'final') k.kontrola = ocenaKontroli(k);
  }
  zastosujModyfikatory(k);
  const wydatkiPrzed = st.w.wydatki;
  const zdarzenia = S.zakonczMiesiac(st);
  k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + (st.w.wydatki - wydatkiPrzed);
  k.mZamkniety = st.m - 1;
  k.raportIT = [];
  for (const e of zdarzenia) {
    if (e.typ === 'skutek') {
      intensywnosc += e.pln > S.PROG_POWAZNY ? 1 : 0.3;
      k.incydenty.push({ m: k.mZamkniety, rodzaj: e.rodzaj, pln: e.pln, wektor: e.wektor });
      const winny = D.incydentPrzezDzial(k, e.wektor);
      k.raportIT.push(`INCYDENT: ${OPIS_SKUTKU[e.rodzaj] || e.rodzaj} — koszt ${zl(e.pln)}` +
        (winny ? ` (wejście: ${D.INICJATYWY[winny.ini].nazwa}, ${k.dzialy[winny.dzial].nazwa})` : ''));
      if (e.pln > S.PROG_POWAZNY) { k.flagi.incydent_powazny = true; k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 8); }
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
  for (const s of D.sygnaly(k)) {
    k.kartyNastepne.push({
      id: `syg:${st.m}:${k.kartyNastepne.length}`, zrodlo: 'sygnal', intruz: s.intruz,
      tytul: `Sygnał: ${k.dzialy[s.dzial].nazwa}`, od: k.dzialy[s.dzial].szef, tresc: s.tekst, cele: ['E5'],
      opcje: [
        { tekst: 'Zbadać (analiza komputera/kont, logi) — 8 h.', h: 8, zbadaj: true, ocena: 'dobra',
          dlaczego: 'Sygnał od ludzi to często jedyny wczesny ślad intruza — wczesne wykrycie jest wielokrotnie tańsze.' },
        { tekst: 'Pewnie nic takiego.', ocena: 'blad', dlaczego: 'Zignorowany sygnał to darmowe wykrycie oddane napastnikowi.' },
      ],
    });
  }
  // Wskaźniki miesięczne.
  if ((k.wydaneRok[k.rok] || 0) > (k.budzet[k.rok] || 0)) k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 2);
  if (k.hKart > (k.def.h_gracza || 0)) k.wskazniki.morale = przytnij(k.wskazniki.morale - 3);
  else k.wskazniki.morale = przytnij(k.wskazniki.morale + 1);
  k.tarcie = KONTROLE.filter(x => S.dziala(st, x.id)).reduce((a, x) => a + (x.tarcie || 0), 0);
  R.poMiesiacu(k, intensywnosc);
  k.hKart = 0;
  if (st.m > k.def.miesiecy || k.wskazniki.mandat <= 0) { k.koniec = true; if (!k.kontrola) k.kontrola = ocenaKontroli(k); return; }
  rozpocznijMiesiac(k);
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
      k.kartyNastepne.push(D.kartaOdkrycia(k, d.id, u));
    }
  }
}

function terminSzbi(k) {
  if (S.dziala(k.st, 'szbi')) { k.wskazniki.mandat = przytnij(k.wskazniki.mandat + 3); k.log('termin', 'SZBI wdrożony przed 3.04.2027.'); }
  else { k.flagi.szbi_po_terminie = true; k.wskazniki.mandat = przytnij(k.wskazniki.mandat - 5); k.log('termin', 'Minął termin SZBI (3.04.2027) — obowiązki niewdrożone.'); }
}

function falaHaktywistow(k) {
  const st = k.st;
  const chronione = S.dziala(st, 'segmentacja') || S.dziala(st, 'ot_monitoring');
  const odciete = k.flagi.hmi_odciete || S.dziala(st, 'ekspozycja');
  let pln = 0, opis;
  if (chronione && odciete) { opis = 'Druga fala haktywistów: próby odbite, krótki DDoS na e-BOK.'; k.wskazniki.reputacja = przytnij(k.wskazniki.reputacja - 1); }
  else {
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
    ['Szkolenia (w tym kierownika)', d('szkolenia') && f.szkolenie_kierownika ? 'zgodny' : d('szkolenia') || f.szkolenie_kierownika ? 'drobna' : 'glowna'],
    ['Wykaz', f.wpis ? (f.wpis_spozniony ? 'drobna' : 'zgodny') : 'glowna'],
  ];
  const pkt = { zgodny: 6, drobna: 4, glowna: 1 };
  return { obszary, wynik: obszary.reduce((a, [, s]) => a + pkt[s], 0) };
}

// ── WIDOKI (to, co gracz WIE) ──
function naglowek(k) {
  const wyd = k.wydaneRok[k.rok] || 0;
  return `\n══════ Miesiąc ${k.st.m}/${k.def.miesiecy} — ${nazwaMiesiaca(k)} ══════\n` +
    `Budżet ${k.rok}: wydane ${zl(wyd)} z ${zl(k.budzet[k.rok] || 0)} · Twoje godziny: ${k.def.h_gracza} h (na karty: ${k.hKart} h) · ` +
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
  const sz = ew / st.znane;
  const nier = S.dziala(st, 'inwentaryzacja') ? 0.08 : 0.35;     // bez inwentaryzacji tylko zgadujemy
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

function pokazKarte(c, i) {
  const l = [`\n[${i + 1}] ${c.obowiazkowa ? '(obowiązkowa) ' : ''}${c.tytul} — od: ${c.od}`, `    ${c.tresc}`];
  c.opcje.forEach((o, j) => l.push(`    ${String.fromCharCode(97 + j)}) ${o.tekst}`));
  return l.join('\n');
}

function podsumowanie(k) {
  const st = k.st;
  const l = ['\n════════ KONIEC KAMPANII ════════'];
  if (k.wskazniki.mandat <= 0) l.push('Zarząd stracił zaufanie i odwołał Cię ze stanowiska.');
  const jd = k.decyzje.length ? k.decyzje.reduce((a, d) => a + PKT[d.ocena], 0) / k.decyzje.length : 0;
  l.push(`Jakość decyzji: ${Math.round(jd * 100)}% (${k.decyzje.length} decyzji)`);
  l.push(`Straty z incydentów: ${zl(st.w.straty)} · Wydatki: ${zl(st.w.wydatki)} · Razem: ${zl(st.w.straty + st.w.wydatki)}`);
  const zakl = k.incydenty.filter(i => /sabota|S03|fala/.test(i.rodzaj)).length;
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
    karta: c => (c.obowiazkowa ? c.opcje.length - 1 : null),   // obowiązkowe: ostatnia opcja; reszta bez decyzji
    scen: opcje => opcje.length - 1,
  },
};

async function grajAuto(nazwa, seed, szczegoly, wypisz = console.log, podsumuj = true) {
  const strat = AUTO[nazwa];
  const k = nowaKampania('wodociagi', seed);
  const cicho = () => {};
  const console = { log: wypisz };
  while (!k.koniec) {
    for (const z of k.zdarzenia.filter(x => x.typ === 'scenariusz' && !x.zagrane)) {
      await zagrajZdarzenie(k, z, async o => strat.scen(o), cicho);
    }
    for (const c of [...k.karty]) {
      const j = strat.karta(c);
      if (j !== null && j >= 0) rozstrzygnij(k, c.id, j);
    }
    const linia = `m.${String(k.st.m).padStart(2)} ${nazwaMiesiaca(k).padEnd(16)} mandat ${String(Math.round(k.wskazniki.mandat)).padStart(3)} ` +
      `rep ${String(Math.round(k.wskazniki.reputacja)).padStart(3)} | zaufanie działów ` +
      Object.values(k.dzialy).map(d => `${d.id.slice(0, 4)} ${d.zaufanie.toFixed(2)}`).join(' ') +
      ` | ukryte ${Object.values(k.dzialy).reduce((a, d) => a + d.ukryte.filter(u => !u.odkryte).length, 0)}`;
    console.log(linia);
    if (szczegoly) for (const r of k.rejestr.filter(x => x.m === k.st.m)) console.log(`      [${r.kto}] ${r.tekst}`);
    zamknijMiesiac(k);
  }
  if (podsumuj) console.log(podsumowanie(k));
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
      k.karty.forEach((c, i) => console.log(pokazKarte(c, i)));
      const w = ((await pytaj('\nWybierz np. „1a" (Enter = wróć): ')) ?? '').trim().toLowerCase();
      const mm = w.match(/^(\d+)([a-z])$/);
      if (!mm) continue;
      const c = k.karty[Number(mm[1]) - 1];
      const j = mm[2].charCodeAt(0) - 97;
      if (!c || !c.opcje[j]) { console.log('Nie ma takiej opcji.'); continue; }
      const o = c.opcje[j];
      const wynik = rozstrzygnij(k, c.id, j);
      console.log(`${IKONA[o.ocena]} ${o.dlaczego}${wynik ? `\n   ${wynik}` : ''}`);
      zapisz();
    } else if (cmd === 'z') {
      const dostepne = KONTROLE.filter(x => !k.st.zamowione.has(x.id));
      dostepne.forEach((x, i) => console.log(`  ${String(i + 1).padStart(2)}) ${x.nazwa} — wdrożenie ${zl(x.wdrozenie.pln)} + ${x.wdrozenie.h} h, ` +
        `mies. ${zl(S.kosztMiesieczny(k.st, x.id))} + ${x.utrzymanie.h || 0} h`));
      const n = Number(await pytaj('Numer (Enter = wróć): '));
      if (n >= 1 && n <= dostepne.length) { zlecRecznie(k, dostepne[n - 1].id); console.log(`Zlecono. Pułapka: ${dostepne[n - 1].pulapka}`); zapisz(); }
    } else if (cmd === 'n') {
      if (k.zdarzenia.some(x => x.typ === 'scenariusz' && !x.zagrane)) { console.log('Najpierw rozegraj incydent [i].'); continue; }
      if (k.karty.some(c => c.obowiazkowa)) { console.log('Są obowiązkowe karty [k].'); continue; }
      const otwarte = k.karty.filter(c => c.zrodlo === 'dzial').length;
      if (otwarte && ((await pytaj(`${otwarte} działów czeka na odpowiedź — zamknięcie = „odłóż". Zamknąć? [t/n] `)) ?? '').trim() !== 't') continue;
      zamknijMiesiac(k);
      zapisz();
    }
  }
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
module.exports = { nowaKampania, rozstrzygnij, zamknijMiesiac, zagrajZdarzenie, zlecRecznie, ocenaKontroli, podsumowanie, AUTO, grajAuto, odtworz };
