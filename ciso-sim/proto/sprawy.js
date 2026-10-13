// ── SPRAWY: skrzynka zamiast kart z odpowiedziami ──
// Projekt: docs/18-silnik-ruchow.md, 18.5. Sprawę przynosi dział, zarząd, dostawca albo świat.
// Ma termin, czasowniki z parametrami i ROZSTRZYGNIĘCIE DOMYŚLNE — sprawa, której nie ruszysz,
// rozstrzyga się sama według stanu firmy. Czasowniki nie mają ocen; praktykę ocenia
// proto/zasady.js na historii (k.historia).
//
// Rodzaje:
//   prosba     — dział chce coś wdrożyć: zgoda · warunki(lista) · alternatywa · odmowa · odloz
//   odkrycie   — znalezione obejście działu: legalizuj(warunki) · wylacz · ukarz · akceptuj · zostaw
//   sygnal     — ludzie zgłaszają coś dziwnego: zbadaj · zbadaj_zewnetrznie · przekaz_mdr · zignoruj
//   scenariusz — z pliku kampanii (def.sprawy): budżet, przejęcie, umowa z integratorem, ankieta
//                ubezpieczyciela… — czasowniki i skutki opisuje kampania, nie silnik.

const S = require('./silnik');
const D = require('./dzialy');
const Z = require('./zasoby');
const INICJATYWY = require('../data/dzialy');

const blad = msg => { const e = new Error(msg); e.niedostepny = true; return e; };
const lista = v => (Array.isArray(v) ? v : String(v ?? '').split(',').map(x => x.trim()).filter(Boolean));

function otworz(k, s) {
  s.id = s.id || `${s.rodzaj}:${k.st.m}:${k.licznikSpraw++}`;
  s.otwarta = k.st.m;
  if (s.termin === undefined) s.termin = k.st.m;
  k.sprawy.push(s);
  k.historia.push({ m: k.st.m, t: 'sprawa_otwarta', id: s.id, rodzaj: s.rodzaj, dzial: s.dzial, ini: s.ini, sid: s.sid });
  return s;
}

// ── WARUNKI „TAK, ALE" (składane) ──
// Ułamek ryzyka na wektor = Π (1 − redukcja wybranych warunków). Nagroda działu: każdy kolejny
// warunek i każde opóźnienie to mniej zadowolenia (dział chce rzecz, nie procedurę).
function policzWarunki(k, ini, ids) {
  const W = Object.fromEntries((ini.warunki || []).map(w => [w.id, w]));
  const wybrane = lista(ids);
  if (!wybrane.length) throw blad(`podaj warunki=… (do wyboru: ${Object.keys(W).join(', ')})`);
  for (const id of wybrane) {
    if (!W[id]) throw blad(`nie ma warunku „${id}" (do wyboru: ${Object.keys(W).join(', ')})`);
    if (W[id].wymaga && !S.dziala(k.st, W[id].wymaga)) throw blad(`warunek „${id}" wymaga działającej kontroli: ${S.kontrola[W[id].wymaga].nazwa}`);
  }
  if (new Set(wybrane).size !== wybrane.length) throw blad('warunek podany dwa razy');
  let h = 0, pln = 0, opoznienie = 0, zwrot = 0;
  const ulamki = {};
  for (const w of Object.keys(ini.ryzyko?.wektory || {})) ulamki[w] = 1;
  for (const id of wybrane) {
    const w = W[id];
    h += w.h || 0;
    pln += w.zamiast && S.dziala(k.st, w.zamiast) ? 0 : (w.pln || 0);
    opoznienie = Math.max(opoznienie, w.opoznienie || 0);
    zwrot += w.nieznane || 0;
    for (const [wek, r] of Object.entries(w.redukcja || {})) if (wek in ulamki) ulamki[wek] *= 1 - r;
  }
  const nagroda = Math.max(0.1, 0.8 - 0.12 * (wybrane.length - 1) - (opoznienie > 0 ? 0.3 : 0));
  return { wybrane, h, pln, opoznienie, ulamki, zwrotNieznanych: Math.min(1, zwrot), nagroda };
}

// ── ŹRÓDŁA SPRAW ──
function dodajProsbe(k, w) {
  const d = k.dzialy[w.dzial], ini = INICJATYWY[w.ini];
  return otworz(k, { rodzaj: 'prosba', dzial: w.dzial, ini: w.ini, tytul: `${d.nazwa}: ${ini.nazwa}`, od: d.szef, tresc: ini.prosba,
    termin: k.st.m, cele: ini.cele, problemy: Object.keys(ini.ryzyko?.wektory || {}) });
}
function dodajOdkrycie(k, dzialId, obej, przez) {
  const d = k.dzialy[dzialId], ini = INICJATYWY[obej.ini];
  // Termin: do końca NASTĘPNEGO miesiąca — znalezisko z końca miesiąca nie przepada od razu.
  return otworz(k, { rodzaj: 'odkrycie', dzial: dzialId, ini: obej.ini, obej, przez, tytul: `Znalezione: ${ini.nazwa} (${d.nazwa})`,
    od: przez, tresc: `${d.nazwa} zrobił(a) to w ${obej.m}. miesiącu bez konsultacji (${przez}).`, termin: k.st.m + 1,
    cele: ['E9', 'E4'], problemy: Object.keys(ini.ryzyko?.wektory || {}) });
}
function dodajSygnal(k, s) {
  const d = k.dzialy[s.dzial];
  return otworz(k, { rodzaj: 'sygnal', dzial: s.dzial, intruz: s.intruz, tytul: `Sygnał: ${d.nazwa}`, od: d.szef, tresc: s.tekst,
    termin: k.st.m + 1, cele: ['E5'] });
}
// `dane` — której umowy / którego certyfikatu dotyczy sprawa cykliczna (data/cykliczne.js).
function dodajScenariuszowa(k, sid, dane = {}) {
  const def = k.def.sprawy[sid];
  if (!def) throw new Error(`brak sprawy ${sid} w kampanii`);
  const tekst = x => (typeof x === 'function' ? x(k, dane) : x);
  return otworz(k, { rodzaj: 'scenariusz', sid, tytul: tekst(def.tytul), od: tekst(def.od), tresc: tekst(def.tresc),
    termin: k.st.m + (def.termin || 0), cele: def.cele || [], problemy: def.problemy || [], dane: { ...dane } });
}

// ── CZASOWNIKI ──
// { nazwa: { opis, param: { p: { opis, wartosci?|lista?|liczba? } }, koszt(p), dostepny(p) → powód|null } }
function czasowniki(k, s) {
  const a = require('./ruchy').api(k);
  if (s.rodzaj === 'prosba' || s.rodzaj === 'odkrycie') {
    const ini = INICJATYWY[s.ini];
    const warunki = {
      opis: s.rodzaj === 'prosba' ? 'Tak, ale bezpiecznie — z warunkami, które wybierasz' : 'Zalegalizować z warunkami (bez szukania winnych)',
      param: { warunki: { opis: 'lista warunków', lista: ini.warunki.map(w => w.id), pomoc: ini.warunki.map(w => `${w.id}: ${w.opis} (${w.h} h${w.pln ? `, ${w.pln} zł` : ''})`) } },
      koszt: p => { const w = policzWarunki(k, ini, p.warunki); return { h: w.h, pln: w.pln }; },
    };
    if (s.rodzaj === 'prosba') {
      return {
        zgoda: { opis: 'Zgoda, róbcie.' },
        warunki,
        alternatywa: { opis: `Nie, ale proponuję: ${ini.alternatywa}.` },
        odmowa: { opis: 'Nie.' },
        odloz: { opis: 'Wrócę do tego później.' },
      };
    }
    return {
      legalizuj: warunki,
      wylacz: { opis: 'Wyłączyć — z rozmową, bez szukania winnych (potrzeba działu zostaje)', koszt: () => ({ h: 2 }) },
      ukarz: { opis: 'Wyłączyć i wyciągnąć konsekwencje wobec kierownika działu' },
      akceptuj: { opis: 'Zostawić z formalną akceptacją ryzyka przez zarząd (właściciel i termin przeglądu)', koszt: () => ({ h: 2 }) },
      zostaw: { opis: 'Zostawić jak jest' },
    };
  }
  if (s.rodzaj === 'sygnal') {
    return {
      zbadaj: { opis: 'Zbadać samemu (komputer, konta, logi)', koszt: () => ({ h: 8 }) },
      zbadaj_zewnetrznie: { opis: 'Zlecić analizę firmie zewnętrznej (w ramach retainera — bez dopłaty)',
        koszt: () => ({ h: 1, pln: S.dziala(k.st, 'retainer_ir') ? 0 : 6000 }) },
      przekaz_mdr: { opis: 'Przekazać do SOC (MDR)', koszt: () => ({ h: 1 }), dostepny: () => (S.dziala(k.st, 'mdr') ? null : 'nie masz usługi MDR') },
      zignoruj: { opis: 'Pewnie nic takiego.' },
    };
  }
  const def = k.def.sprawy[s.sid];
  const out = {};
  for (const [v, c] of Object.entries(def.czasowniki)) {
    out[v] = {
      opis: c.opis, param: c.param,
      koszt: p => (c.koszt ? c.koszt(k, p, a, s) : { h: c.h || 0, pln: c.pln || 0 }),
      dostepny: p => (c.dostepny ? c.dostepny(k, p, a, s) : null),
    };
  }
  return out;
}

function sprawdzParam(def, p) {
  for (const [n, d] of Object.entries(def.param || {})) {
    if (p[n] === undefined) throw blad(`brak parametru ${n}=…${d.wartosci ? ` (${d.wartosci.join(' | ')})` : d.lista ? ` (lista: ${d.lista.join(',')})` : ''}`);
    if (d.wartosci && !d.wartosci.includes(String(p[n]))) throw blad(`${n} musi być jednym z: ${d.wartosci.join(', ')}`);
    if (d.lista) for (const x of lista(p[n])) if (!d.lista.includes(x)) throw blad(`${n}: „${x}" spoza listy (${d.lista.join(', ')})`);
    if (d.liczba) { const x = Number(p[n]); if (!(x >= d.liczba[0] && x <= d.liczba[1])) throw blad(`${n} musi być liczbą od ${d.liczba[0]} do ${d.liczba[1]}`); }
  }
}

function dostepnyCzasownik(k, s, v, p = {}) {
  if (k.incydent) return 'trwa incydent — najpierw go poprowadź';
  const cz = czasowniki(k, s)[v];
  if (!cz) return `sprawa nie ma czasownika „${v}" (są: ${Object.keys(czasowniki(k, s)).join(', ')})`;
  try { sprawdzParam(cz, p); } catch (e) { return e.message; }
  let c;
  try { c = cz.koszt ? cz.koszt(p) : {}; } catch (e) { return e.message; }
  return (cz.dostepny ? cz.dostepny(p) : null) || Z.brakZasobow(k, c);
}

// ── ODPOWIEDŹ (dyspozytor) ──
function odpowiedz(k, sprawaId, v, p = {}) {
  const s = k.sprawy.find(x => x.id === sprawaId);
  if (!s) throw blad(`nie ma otwartej sprawy ${sprawaId}`);
  const powod = dostepnyCzasownik(k, s, v, p);
  if (powod) throw blad(powod);
  const cz = czasowniki(k, s)[v];
  const c = cz.koszt ? cz.koszt(p) : {};
  k.akcje.push({ t: 'sprawa', id: sprawaId, v, p });
  Z.pobierz(k, c);
  const wynik = wykonajCzasownik(k, s, v, p);
  k.historia.push({ m: k.st.m, t: 'sprawa', id: s.id, rodzaj: s.rodzaj, sid: s.sid, klucz: s.dane?.klucz, dzial: s.dzial, ini: s.ini, v, p, intruz: !!s.intruz });
  if (wynik.zamyka !== false) zamknij(k, s, v);
  k.log('gracz', `${s.tytul}: ${v}${Object.keys(p).length ? ` [${Object.entries(p).map(([n, x]) => `${n}=${x}`).join(', ')}]` : ''} → ${wynik.tekst}`);
  return wynik.tekst;
}

function zamknij(k, s, v, domyslnie = false) {
  k.sprawy.splice(k.sprawy.indexOf(s), 1);
  s.zamknieta = { m: k.st.m, v, domyslnie };
  k.sprawyZamkniete.push(s);
}

function wykonajCzasownik(k, s, v, p) {
  const a = require('./ruchy').api(k);
  if (s.rodzaj === 'prosba') {
    const ini = INICJATYWY[s.ini];
    if (v === 'warunki') {
      const w = policzWarunki(k, ini, p.warunki);
      D.odpowiedz(k, s, 'warunki', { ulamki: w.ulamki, nagroda: w.nagroda });
      return { tekst: `${k.dzialy[s.dzial].nazwa} robi to z warunkami: ${w.wybrane.join(', ')}${w.opoznienie ? ' (ze startem przesuniętym o miesiąc)' : ''}.` };
    }
    D.odpowiedz(k, s, v);
    return { tekst: { zgoda: 'Dział rusza od razu.', alternatywa: `Dział przyjmuje alternatywę: ${ini.alternatywa}.`, odmowa: 'Dział przyjął odmowę. Bez entuzjazmu.', odloz: 'Dział czeka — i będzie naciskał.' }[v] };
  }
  if (s.rodzaj === 'odkrycie') {
    const ini = INICJATYWY[s.ini];
    if (v === 'legalizuj') {
      const w = policzWarunki(k, ini, p.warunki);
      D.odpowiedzOdkrycie(k, s, 'legalizacja', { ulamki: w.ulamki, zwrotNieznanych: w.zwrotNieznanych });
      return { tekst: `Zalegalizowane z warunkami: ${w.wybrane.join(', ')}.` };
    }
    if (v === 'akceptuj') { a.akceptuj(`obejscie:${s.dzial}:${s.ini}`); a.wskaznik('mandat', -1); }
    if (v === 'ukarz') a.wskaznik('mandat', -1);
    if (v !== 'zostaw') D.odpowiedzOdkrycie(k, s, { wylacz: 'wylaczenie', ukarz: 'kara', akceptuj: 'akceptacja' }[v]);
    return { tekst: { wylacz: 'Wyłączone. Kierownik działu: „dobrze, ale my dalej tego potrzebujemy".', ukarz: 'Wyłączone, konsekwencje wyciągnięte. Inne działy to usłyszały.',
      akceptuj: 'Zarząd podpisał akceptację ryzyka — obejście zostaje, ale ma właściciela.', zostaw: 'Zostaje jak jest.' }[v] };
  }
  if (s.rodzaj === 'sygnal') {
    if (v === 'zignoruj') return { tekst: 'Odnotowane.' };
    const x = s.intruz;
    if (x && k.st.intruzi.includes(x)) {
      k.st.intruzi.splice(k.st.intruzi.indexOf(x), 1);
      const op = { dostep: 15000, eskalacja: 40000, ruch: 110000 }[x.etap] || 15000;
      k.st.w.wydatki += op; k.st.w.reagowanie = (k.st.w.reagowanie || 0) + op;
      k.historia.push({ m: k.st.m, t: 'intruz_usuniety', etap: x.etap, skad: 'sygnal' });
      return { tekst: `Analiza potwierdziła włamanie na etapie „${x.etap}" — przyczółek usunięty (koszt ${Z.zl(op)} z rezerwy firmy).` };
    }
    return { tekst: 'Analiza nic nie znalazła. (O tym, że to fałszywy alarm, wiesz dopiero teraz — sprawdzenie i tak było potrzebne.)' };
  }
  const c = k.def.sprawy[s.sid].czasowniki[v];
  const t = c.wykonaj(k, p, a, s);
  return { tekst: t || 'Zrobione.', zamyka: c.zamyka !== false };
}

// ── TERMINY: rozstrzygnięcia domyślne na koniec miesiąca ──
function terminy(k) {
  const a = require('./ruchy').api(k);
  for (const s of [...k.sprawy]) {
    if (s.termin > k.st.m) continue;
    let tekst;
    if (s.rodzaj === 'prosba') { D.odpowiedz(k, s, 'odloz'); tekst = 'brak odpowiedzi → odłożone'; }
    else if (s.rodzaj === 'odkrycie') tekst = 'brak decyzji → zostaje bez właściciela';
    else if (s.rodzaj === 'sygnal') tekst = 'nikt nie sprawdził';
    else tekst = k.def.sprawy[s.sid].domyslnie(k, a, s);
    k.historia.push({ m: k.st.m, t: 'sprawa_domyslnie', id: s.id, rodzaj: s.rodzaj, sid: s.sid, klucz: s.dane?.klucz, dzial: s.dzial, ini: s.ini, intruz: !!s.intruz });
    k.log('swiat', `${s.tytul}: ${tekst}`);
    zamknij(k, s, null, true);
  }
}

module.exports = { otworz, policzWarunki, dodajProsbe, dodajOdkrycie, dodajSygnal, dodajScenariuszowa, czasowniki, dostepnyCzasownik, odpowiedz, terminy, lista };
