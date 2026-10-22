// ── INCYDENT BEZ DRZEWA DECYZJI ──
// Projekt: docs/18-silnik-ruchow.md, 18.8. Dawniej scenariusz był drzewem faz z 2–3 opcjami
// (quiz z narzuconą kolejnością). Teraz: zegar, stan, akcje w DOWOLNEJ kolejności, dynamika
// (pieniądze odpływają, film się rozchodzi, terminy biegną). Gracz może czekać, robić rzeczy
// równolegle (każda akcja kosztuje czas), zakończyć fazę ostrą albo dojść do limitu.
//
// Format pliku scenariusze/<id>-*.incydent.js:
//   id, tytul, cele[], limit_h
//   start(ctx) → stan            — ctx: { dziala(id), fakt(id), flaga(n), usterka(kontrola, id), rnd(), dzial(id) }
//   widok(s) → [linie]           — co gracz WIE (mgła wojny: nie cały stan)
//   zegary: [{ id, nazwa, od(s) → godzina startu albo null, godzin }]
//   akcje: { id: { nazwa, czas_h, h, pln, raz, dostepna(s) → powód|null, efekt(s, ctx) → tekst } }
//   dynamika(s, dt, ctx)         — co dzieje się z upływem czasu (wołane co godzinę)
//   koniec(s) → bool             — automatyczny koniec fazy ostrej (oprócz limitu i decyzji gracza)
//   wynik(s) → { tytul, opis, skutki: { pln, mandat, reputacja, morale, flagi, dzial, fakty_napraw[],
//                fakty_odkryj[], intruz, wektory } }
//   zasady: [{ id, opis, dlaczego, waga, cel, ocen(s) → 'spelniona'|'naruszona'|'nieuczciwa'|null,
//              tylko_gdy_dzialal (zasada „nie rób X" — bez żadnej akcji nie jest oceniana) }]
//   debrief: [zdania]
//
// Czas incydentu nie jest miesiącem kampanii: cały incydent dzieje się w bieżącym miesiącu.
// Godziny gracza w incydencie nie mają limitu (nadgodziny kosztują morale, jak dotąd).

const fs = require('fs');
const path = require('path');
const S = require('./silnik');

const KROK_H = 0.5;   // dynamika w półgodzinnych krokach — akcje trwają od 15 minut do 8 godzin

// Czy incydent ma wersję labową (SIEM/SOAR, lab/ i scenariusze/<id>-*.lab.js, docs/21-…).
const maLab = id => fs.readdirSync(path.join(__dirname, '..', 'scenariusze')).some(f => f.startsWith(id) && f.endsWith('.lab.js'));

function wczytaj(id) {
  const dir = path.join(__dirname, '..', 'scenariusze');
  const plik = fs.readdirSync(dir).find(f => f.startsWith(id) && f.endsWith('.incydent.js'));
  if (!plik) throw new Error(`Brak pliku incydentu ${id} (scenariusze/${id}-*.incydent.js)`);
  return require(path.join(dir, plik));
}

// Walidacja pliku (jak lib/seasons.js waliduje plansze): zły plik nie zagra, powód na liście.
function waliduj(def) {
  const b = [];
  if (!def.id || !def.tytul) b.push('brak id/tytul');
  for (const f of ['start', 'widok', 'dynamika', 'koniec', 'wynik']) if (typeof def[f] !== 'function') b.push(`${f} musi być funkcją`);
  if (!(def.limit_h > 0)) b.push('limit_h musi być > 0');
  if (!def.akcje || Object.keys(def.akcje).length < 4) b.push('za mało akcji (min. 4) — incydent bez wyboru to film, nie gra');
  for (const [id, a] of Object.entries(def.akcje || {})) {
    if (!a.nazwa) b.push(`akcja ${id}: brak nazwy`);
    if (!(a.czas_h >= 0)) b.push(`akcja ${id}: czas_h`);
    if (typeof a.efekt !== 'function') b.push(`akcja ${id}: efekt musi być funkcją`);
    if ('ocena' in a || 'pkt' in a) b.push(`akcja ${id}: akcje nie mają ocen — praktykę oceniają zasady`);
  }
  if (!(def.zasady || []).length) b.push('brak zasad (ocena praktyki)');
  for (const z of def.zasady || []) {
    if (!z.id || !z.dlaczego || typeof z.ocen !== 'function') b.push(`zasada ${z.id || '?'}: id, dlaczego, ocen`);
    if (!(z.waga > 0)) b.push(`zasada ${z.id}: waga`);
  }
  if (!(def.debrief || []).length) b.push('brak debriefu');
  // Kompletność dla laboratoriów: plan wzorcowy i plan laika (testy sprawdzają, że ich akcje
  // istnieją), typowe błędy dla cennika i kampania, w której incydent gra się domyślnie.
  for (const st of ['wzorcowo', 'laik']) if (typeof def.automaty?.[st] !== 'function') b.push(`automaty.${st} musi być funkcją (stan → lista akcji)`);
  if (Object.keys(def.odstepstwa || {}).length < 2) b.push('za mało odstępstw dla cennika (min. 2): typowe błędy w prowadzeniu tego incydentu');
  for (const [n, f] of Object.entries(def.odstepstwa || {})) if (typeof f !== 'function') b.push(`odstępstwo „${n}" musi być funkcją (plan, stan) → plan`);
  if (!def.kampania) b.push('brak kampanii domyślnej (pole kampania)');
  return b;
}

// Kontekst z kampanii: co gracz przygotował wcześniej, zmienia start incydentu.
// `wariant`: dane incydentu z pliku kampanii (k.def.warianty[id]) — ten sam incydent w innej
// organizacji ma inną kwotę, innych ludzi i inne skróty (gmina: kontrasygnata skarbnika).
function kontekst(k, id = k.incydent?.id) {
  return {
    wariant: k.def.warianty?.[id] || {},
    dziala: id => S.dziala(k.st, id),
    jakosc: id => (k.st.konf[id]?.jakosc ?? (S.dziala(k.st, id) ? 1 : 0)),
    fakt: id => k.fakty?.[id],
    flaga: n => k.flagi[n],
    usterka: (kid, uid) => !!k.obiekty?.[kid]?.usterki.some(u => u.id === uid && !u.naprawiona),
    param: (kid, n) => k.obiekty?.[kid]?.param?.[n],
    dzial: id => k.dzialy[id],
    rnd: k.rnd.incydent,
    firma: k.st.firma,
  };
}

function rozpocznij(k, id) {
  const def = wczytaj(id);
  const ctx = kontekst(k, id);
  const s = def.start(ctx);
  s.t = 0; s.kiedy = {}; s.zrobione = [];
  k.incydent = { id, def, s, h: 0 };
  k.historia.push({ m: k.st.m, t: 'incydent_start', id });
  k.log('incydent', `${def.id} „${def.tytul}" — początek.`);
  return k.incydent;
}

function uplyw(k, ile) {
  const inc = k.incydent, ctx = kontekst(k);
  let reszta = ile;
  while (reszta > 1e-9) {
    const dt = Math.min(KROK_H, reszta);
    inc.def.dynamika(inc.s, dt, ctx);
    inc.s.t += dt; reszta -= dt;
  }
}

function dostepnaAkcja(k, aid) {
  const inc = k.incydent;
  if (!inc) return 'nie ma trwającego incydentu';
  const a = inc.def.akcje[aid];
  if (!a) return `nie ma akcji „${aid}"`;
  if (a.raz !== false && inc.s.kiedy[aid] !== undefined) return 'już zrobione';
  if (inc.s.t + a.czas_h > inc.def.limit_h) return 'nie zdążysz przed końcem fazy ostrej';
  return a.dostepna ? a.dostepna(inc.s) : null;
}

function akcje(k) {
  const inc = k.incydent;
  return Object.entries(inc.def.akcje).map(([id, a]) => ({ id, nazwa: a.nazwa, czas_h: a.czas_h, h: a.h || 0, pln: a.pln || 0, powod: dostepnaAkcja(k, id) }));
}

// Akcja: czas płynie W TRAKCIE (dynamika), skutek na końcu. Zapis: { t: 'inc', a }.
function wykonaj(k, aid) {
  const powod = dostepnaAkcja(k, aid);
  if (powod) { const e = new Error(powod); e.niedostepny = true; throw e; }
  const inc = k.incydent, a = inc.def.akcje[aid];
  k.akcje.push({ t: 'inc', a: aid });
  uplyw(k, a.czas_h);
  inc.s.kiedy[aid] = inc.s.t;
  inc.s.zrobione.push(aid);
  inc.h += a.h || 0;
  k.hKart += a.h || 0; k.maxHKart = Math.max(k.maxHKart || 0, k.hKart);
  if (a.pln) { k.st.w.wydatki += a.pln; k.st.w.reagowanie = (k.st.w.reagowanie || 0) + a.pln; }   // z rezerwy firmy
  const tekst = a.efekt(inc.s, kontekst(k)) || 'Zrobione.';
  k.log('incydent', `T+${inc.s.t.toFixed(1)} h: ${a.nazwa} → ${tekst}`);
  if (inc.def.koniec(inc.s) || inc.s.t >= inc.def.limit_h) return { tekst, koniec: zakoncz(k) };
  return { tekst };
}

// `zapis: false` — świat „gra sam", gdy gracz nie podjął incydentu (część zamknięcia miesiąca).
function czekaj(k, h, { zapis = true } = {}) {
  const inc = k.incydent;
  if (!inc) throw new Error('nie ma trwającego incydentu');
  const ile = Math.min(h, inc.def.limit_h - inc.s.t);
  if (zapis) k.akcje.push({ t: 'inc_czekaj', h: ile });
  uplyw(k, ile);
  if (inc.def.koniec(inc.s) || inc.s.t >= inc.def.limit_h) return { tekst: `Minęło ${ile} h.`, koniec: zakoncz(k) };
  return { tekst: `Minęło ${ile} h.` };
}

// Koniec fazy ostrej (decyzja gracza albo limit). Zasady i skutki dla kampanii.
function zakoncz(k, zGracza = false) {
  const inc = k.incydent;
  if (zGracza) k.akcje.push({ t: 'inc_koniec' });
  const w = inc.def.wynik(inc.s);
  const oceny = [];
  for (const z of inc.def.zasady) {
    // Zasady typu „nie rób X" nie nagradzają bezczynności: kto nic nie zrobił, ten ich nie spełnił.
    if (z.tylko_gdy_dzialal && !inc.s.zrobione.length) continue;
    const o = z.ocen(inc.s);
    if (o) oceny.push({ id: `${inc.id}:${z.id}`, wynik: o, waga: z.waga, cel: z.cel, opis: z.opis, dlaczego: z.dlaczego, m: k.st.m });
  }
  k.incydent = null;
  return { ...w, oceny, h: inc.h, def: inc.def, s: inc.s };
}

function zegary(inc) {
  const s = inc.s;
  return (inc.def.zegary || []).map(z => {
    const od = z.od(s);
    return od === null || od === undefined ? null : { nazwa: z.nazwa, zostalo: z.godzin - (s.t - od) };
  }).filter(Boolean);
}

module.exports = { wczytaj, maLab, waliduj, kontekst, rozpocznij, akcje, dostepnaAkcja, wykonaj, czekaj, zakoncz, zegary };
