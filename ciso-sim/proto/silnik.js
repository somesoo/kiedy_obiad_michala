// ── SILNIK MIESIĄCA (czysty: bez bazy, bez Express) ──
// Jeden kod dla trzech użytkowników: Monte Carlo strategii (symulacja.js), kampanii gracza
// (kampania.js) i — docelowo — oceny decyzji w tle (docs/11-…). Wyciągnięty z pierwszej
// wersji symulacja.js BEZ zmiany kolejności losowań: te same ziarna dają te same wyniki,
// co jest testem regresji refaktoru (proto/wyniki-2026-10-13.txt).
//
// Użycie:
//   const st = nowyStan(firma, seed);
//   // planowanie miesiąca st.m: zlec(st, 'mfa'), dodajEtat(st, 1), modyfikatory st.mod…
//   const zdarzenia = zakonczMiesiac(st);   // symuluje miesiąc st.m i przesuwa st.m o 1
//
// Stan PRAWDZIWY (intruzi, prawdziwe pokrycie) nigdy nie idzie do gracza — kampania pokazuje
// tylko to, co gracz wie (docs/03-…, mgła wojny).

const KONTROLE = require('../data/kontrole');
const Z = require('../data/zagrozenia');

const TYGODNIE = 4;       // tyk symulacji wewnątrz miesiąca
const H_NA_ETAT = 120;    // produktywne godziny etatu w miesiącu (urlopy, spotkania, IT „przy okazji")
const H_NA_ALERT = 0.25;  // triage jednego alertu
const STROJENIE_MIES = 3; // przez tyle miesięcy po wdrożeniu narzędzie daje 2× więcej alertów
const KOSZT_ETATU = 22000;// średni miesięczny koszt etatu bezpieczeństwa z narzutami (PLN)
const PROG_POWAZNY = 100000; // 🔵 stały próg „poważnego" — do zmiany na względny (docs/14-…)

// Deterministyczny generator, żeby porównania strategii były uczciwe (ta sama „pogoda").
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(rnd, l) {
  // Knuth — λ jest tu małe, więc pętla jest krótka.
  const L = Math.exp(-l); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}
function pick(rnd, wagi) {
  const s = Object.values(wagi).reduce((a, b) => a + b, 0);
  let r = rnd() * s;
  for (const [k, w] of Object.entries(wagi)) { if ((r -= w) <= 0) return k; }
  return Object.keys(wagi)[0];
}
const kontrola = Object.fromEntries(KONTROLE.map(k => [k.id, k]));

function nowyStan(firma, seed) {
  const zasobyZnane = firma.zasoby.stacje + firma.zasoby.serwery;
  const st = {
    firma,
    rnd: mulberry32(seed),
    m: 1,
    zasobyZnane,
    znane: firma.zasoby.znane,                   // część prawdziwych zasobów w ewidencji
    uzytkownicy: firma.pracownicy,
    aktywne: {},                                 // id → miesiąc, od którego działa
    etaty: firma.zespol.fte,
    // Godziny w katalogu są dla firmy referencyjnej (330 zasobów). Łatanie 34 komputerów
    // to nie 1/10 łatania 330, ale też nie tyle samo — stąd potęga z podłogą i sufitem.
    skalaH: Math.min(2.5, Math.max(0.3, Math.pow(zasobyZnane / Z.SKALA_ODNIESIENIA.zasoby, 0.6))),
    intruzi: [],
    projekty: [],                                // { id, start, h } — w kolejności zlecenia
    zamowione: null,                             // umowy podpisane = płacimy abonament
    // Modyfikatory z kampanii: działy obchodzące zasady, przeciwnik uczący się, zdarzenia.
    // Domyślnie puste — Monte Carlo strategii ich nie używa.
    mod: { wektory: {}, sprawcy: {}, h_extra: 0 },
    w: { wydatki: 0, straty: 0, powazne: 0, incydenty: 0, wykryte_wczesnie: 0,
      alert_niedobor_mies: 0, nadgodziny: 0, opoznienie_mies: 0, niewdrozone: 0, szczegoly: {} },
    ostatni: null,                               // podsumowanie ostatniego miesiąca (dla kampanii)
  };
  for (const id of firma.na_starcie || []) st.aktywne[id] = -12; // stare = już nastrojone
  st.zamowione = new Set(Object.keys(st.aktywne));
  return st;
}

const hUtrz = (st, k) => (k.utrzymanie.h || 0) * st.skalaH;
const hWdr = (st, k) => k.wdrozenie.h * Math.max(0.4, st.skalaH);
const dziala = (st, id) => st.aktywne[id] !== undefined && st.m >= st.aktywne[id];

// Wdrożenie płaci się z góry, abonament od podpisania umowy — także gdy wdrożenie się ślizga.
function zlec(st, id) {
  const k = kontrola[id];
  if (!k) throw new Error(`Nieznana kontrola: ${id}`);
  if (st.zamowione.has(id)) return false;
  st.w.wydatki += k.wdrozenie.pln;
  st.projekty.push({ id, start: st.m, h: 0 });
  st.zamowione.add(id);
  return true;
}
function dodajEtat(st, ile = 1) { st.etaty += ile; }

function kosztMiesieczny(st, id) {
  const u = kontrola[id].utrzymanie;
  let pln = (u.pln || 0) + (u.pln_na_stanowisko || 0) * st.zasobyZnane + (u.pln_na_uzytkownika || 0) * st.uzytkownicy;
  if (u.pln_min) pln = Math.max(pln, u.pln_min);
  return pln;
}

// Symuluje miesiąc st.m i przesuwa licznik. Zwraca zdarzenia, które kampania zamienia
// w incydenty, raporty i wpisy rejestru.
function zakonczMiesiac(st) {
  const { firma, rnd, w } = st;
  const m = st.m;
  const zdarzenia = [];
  const dodajStrate = (rodzaj, pln) => {
    w.straty += pln; w.szczegoly[rodzaj] = (w.szczegoly[rodzaj] || 0) + pln;
  };
  w.wydatki += (st.etaty - firma.zespol.fte) * KOSZT_ETATU; // pensje NOWYCH etatów

  const czynne = KONTROLE.filter(k => dziala(st, k.id));
  let abonamenty = 0;
  for (const id of st.zamowione) abonamenty += kosztMiesieczny(st, id);
  w.wydatki += abonamenty;

  // Godziny. Kolejność jak w zdyscyplinowanym zespole: utrzymanie, potem alerty,
  // a projekty dostają RESZTĘ i się ślizgają. (W grze kolejność wybiera gracz —
  // projekty przed alertami to szybsze wdrożenia i ślepy SOC.)
  let h = st.etaty * H_NA_ETAT + firma.zespol.h_it + st.mod.h_extra + czynne.reduce((a, k) => a + (k.godziny || 0), 0);
  const hRazem = h;
  const potrzebaUtrz = czynne.reduce((a, k) => a + hUtrz(st, k), 0);
  // Kampania może odjąć godziny (gracz spędził je na kartach) — wtedy h bywa ujemne.
  const utrzymanieUlamek = potrzebaUtrz > 0 ? Math.max(0, Math.min(1, h / potrzebaUtrz)) : 1;
  h = Math.max(0, h - potrzebaUtrz * utrzymanieUlamek);

  // Skuteczność kontroli: wymagania, godziny utrzymania, pokrycie inwentaryzacji.
  const skut = {};
  for (const k of czynne) {
    let s = utrzymanieUlamek;
    if ((k.wymaga || []).some(r => !dziala(st, r))) s *= 0.3;
    if (k.inwentaryzacja) s *= st.znane;
    skut[k.id] = s;
  }
  // Inwentaryzacja i skanery odkrywają zasoby — powoli, a shadow IT powoli odrasta.
  const odkrywanie = czynne.reduce((a, k) => a + (k.odkrywa || 0) * skut[k.id], 0);
  st.znane = Math.min(0.98, st.znane + (1 - st.znane) * Math.min(0.5, odkrywanie * 0.25) - 0.003);

  // Alerty i triage — tu rodzi się zmęczenie alertami.
  let alerty = 0;
  for (const k of czynne) {
    if (!k.alerty) continue;
    const nowe = m - st.aktywne[k.id] < STROJENIE_MIES ? 2 : 1;
    alerty += k.alerty * (st.zasobyZnane / 100) * nowe;
  }
  const zdjete = 1 - czynne.filter(k => k.triage).reduce((a, k) => a * (1 - k.triage * skut[k.id]), 1);
  const triageH = alerty * H_NA_ALERT * (1 - zdjete);
  let jakoscOps = 1;
  if (triageH > 0) {
    const dane = Math.min(h, triageH);
    jakoscOps = Math.max(0.15, dane / triageH);
    h -= dane;
    if (jakoscOps < 0.8) w.alert_niedobor_mies++;
  }
  // MDR patrzy na swoje alerty sam — jego wykrywanie nie cierpi na niedobór naszych godzin.
  const jakosc = id => (kontrola[id].typ === 'usluga' ? 1 : jakoscOps);

  // Projekty: reszta godzin, po kolei. Gotowe = godziny zebrane i minął czas wdrożenia.
  const wdrozone = [];
  for (let i = 0; i < st.projekty.length; i++) {
    const pr = st.projekty[i];
    const k = kontrola[pr.id];
    const daj = Math.max(0, Math.min(h, hWdr(st, k) - pr.h));
    pr.h += daj; h -= daj;
    if (pr.h >= hWdr(st, k) && m >= pr.start + k.wdrozenie.mies - 1) {
      st.aktywne[pr.id] = m + 1;
      w.opoznienie_mies += (m + 1) - (pr.start + k.wdrozenie.mies);
      wdrozone.push(pr.id);
      st.projekty.splice(i--, 1);
    }
  }

  const zapobieg = wekt => czynne.reduce((a, k) => a * (1 - (k.zapobiega?.[wekt] || 0) * skut[k.id]), 1);
  const utrudn = etap => czynne.reduce((a, k) => a * (1 - (k.utrudnia?.[etap] || 0) * skut[k.id]), 1);
  const wykryj = (etap, skryt) => {
    const nie = czynne.reduce((a, k) => a * (1 - (k.wykrywa?.[etap] || 0) * skut[k.id] * jakosc(k.id)),
      1 - Z.WYKRYWANIE_BAZOWE[etap]);
    return Math.min(0.95, (1 - nie) * skryt);
  };
  const reakcja = Math.min(0.8, czynne.reduce((a, k) => a + (k.reakcja || 0) * skut[k.id], 0));
  const przestojMn = czynne.reduce((a, k) => a * (k.odtwarzanie?.przestoj ? 1 - (1 - k.odtwarzanie.przestoj) * skut[k.id] : 1), 1);
  // Kłamstwo w ankiecie = odmowa wypłaty (kampania ustawia mod.bez_ubezpieczenia).
  const ubezp = st.mod.bez_ubezpieczenia ? null : czynne.find(k => k.ubezpieczenie);

  const skutek = (rodzaj) => {
    const S = Z.SKUTKI;
    let pln = 0;
    if (rodzaj === 'szyfrowanie') {
      const dni = S.szyfrowanie.przestoj_dni * przestojMn * (1 - 0.3 * reakcja);
      pln = dni * firma.koszt_dnia + S.szyfrowanie.odbudowa_pln + S.szyfrowanie.odbudowa_na_zasob * st.zasobyZnane;
    } else if (rodzaj === 'wyciek' || rodzaj === 'wyciek_insider') {
      const s = S[rodzaj];
      pln = s.obsluga_pln + (s.na_rekord || 0) * firma.rekordy + s.utrata_przychodu * firma.przychod_rok;
      if (rodzaj === 'wyciek' && rnd() < s.kara_szansa) {
        const kara = Math.min(s.kara_max, s.kara_na_rekord * firma.rekordy);
        pln += firma.publiczny ? Math.min(kara, 100000) : kara; // JSFP: limit kary UODO 100 tys. zł
      }
    } else if (rodzaj === 'szpiegostwo') {
      pln = S.szpiegostwo.obsluga_pln + S.szpiegostwo.utrata_przychodu * firma.przychod_rok;
    } else if (rodzaj === 'sabotaz') {
      pln = S.sabotaz.przestoj_dni * firma.koszt_dnia * przestojMn + S.sabotaz.obsluga_pln;
    } else if (rodzaj === 'bec') {
      pln = S.bec.srednia_pln * (0.4 + rnd() * 1.6);
      if (rnd() < S.bec.odzysk_szansa + 0.2 * reakcja) pln *= 0.3;
    } else if (rodzaj === 'ddos') {
      pln = (S.ddos.przestoj_h / 24) * firma.koszt_dnia * (1 - (zapobieg('ddos') < 1 ? 0.7 : 0));
    }
    if (ubezp && pln > 50000) pln -= Math.min(ubezp.ubezpieczenie.limit, pln * ubezp.ubezpieczenie.pokrycie * skut[ubezp.id]);
    return pln;
  };

  const proby = {};                              // wektor → [prób, udanych] (dla przeciwnika)
  for (let t = 0; t < TYGODNIE; t++) {
    // Nowe próby. Wektory „ludzkie" rosną z liczbą ludzi, „techniczne" z liczbą
    // zasobów — pierwiastkowo, bo duża firma ma też więcej filtrów, których tu nie widać.
    for (const [wid, wek] of Object.entries(Z.WEKTORY)) {
      const skala = wek.skala === 'ludzie' ? Math.pow(st.uzytkownicy / Z.SKALA_ODNIESIENIA.ludzie, 0.7)
        : wek.skala === 'zasoby' ? Math.pow(st.zasobyZnane / Z.SKALA_ODNIESIENIA.zasoby, 0.5) : 1;
      const mn = (firma.wektory?.[wid] ?? wek.domyslnie ?? 1) * skala * (st.mod.wektory[wid] ?? 1);
      if (!mn) continue;
      const n = poisson(rnd, (wek.lambda * mn) / TYGODNIE);
      proby[wid] = proby[wid] || [0, 0];
      proby[wid][0] += n;
      for (let i = 0; i < n; i++) {
        if (rnd() >= wek.p * zapobieg(wid)) continue;
        proby[wid][1]++;
        const wagi = { ...Z.SPRAWCY_WEKTORA[wid] };
        for (const s of Object.keys(wagi)) wagi[s] *= (firma.sprawcy?.[s] ?? 1) * (st.mod.sprawcy[s] ?? 1);
        const kto = pick(rnd, wagi);
        const sp = Z.SPRAWCY[kto];
        w.incydenty++;
        if (sp.natychmiast) {
          const pln = skutek(sp.natychmiast);
          if (pln > 0) {
            dodajStrate(sp.natychmiast, pln);
            if (pln > PROG_POWAZNY) w.powazne++;
            zdarzenia.push({ typ: 'skutek', rodzaj: sp.natychmiast, pln, kto, wektor: wid, tydzien: t });
          }
          continue;
        }
        st.intruzi.push({ kto, etap: sp.start || 'dostep', wektor: wid, od: m });
      }
    }
    // Intruzi: wykrycie albo postęp.
    for (let i = st.intruzi.length - 1; i >= 0; i--) {
      const x = st.intruzi[i];
      const sp = Z.SPRAWCY[x.kto];
      if (rnd() < wykryj(x.etap, 1 / sp.skrytosc > 1 ? 1 : sp.skrytosc)) {
        const op = Z.OPANOWANIE[x.etap];
        w.wydatki += op.pln * (1 - 0.5 * reakcja);
        // Osobno: koszty reagowania idą z rezerwy firmy, nie z budżetu bezpieczeństwa
        // (inaczej gracz, który więcej wykrywa, płaciłby mandatem za skuteczność).
        w.reagowanie = (w.reagowanie || 0) + op.pln * (1 - 0.5 * reakcja);
        w.nadgodziny += op.h;
        if (x.etap === 'dostep' || x.etap === 'eskalacja') w.wykryte_wczesnie++;
        const opanowane = rnd() >= Z.NIEUDANE_OPANOWANIE * (1 - reakcja);
        zdarzenia.push({ typ: 'wykrycie', etap: x.etap, kto: x.kto, wektor: x.wektor, opanowane, tydzien: t });
        if (opanowane) { st.intruzi.splice(i, 1); continue; }
        // Nieudane opanowanie: intruz zostaje, my myślimy, że go nie ma.
      }
      if (sp.wygasa && rnd() < sp.wygasa) { st.intruzi.splice(i, 1); continue; }
      if (x.kto === 'broker' && rnd() < sp.sprzedaz) { x.kto = 'ransomware'; continue; }
      const nast = { dostep: 'eskalacja', eskalacja: 'ruch', ruch: 'cel' }[x.etap];
      const p = (sp.postep[nast] || 0) * utrudn(nast);
      if (rnd() < p) {
        if (nast === 'cel') {
          let pln = skutek(sp.cel);
          if (sp.cel === 'szyfrowanie' && rnd() < sp.eksfiltracja) pln += skutek('wyciek');
          dodajStrate(sp.cel, pln);
          w.powazne++;
          zdarzenia.push({ typ: 'skutek', rodzaj: sp.cel, pln, kto: x.kto, wektor: x.wektor, tydzien: t });
          st.intruzi.splice(i, 1);
        } else x.etap = nast;
      }
    }
  }

  st.ostatni = {
    m, h_razem: hRazem, h_utrzymanie: potrzebaUtrz * utrzymanieUlamek, utrzymanie_ulamek: utrzymanieUlamek,
    h_triage: triageH * jakoscOps, jakosc_ops: jakoscOps, alerty, h_projekty_wolne: h, wdrozone, abonamenty,
    proby, // tylko dla przeciwnika i reżysera — gracz tego nie widzi
  };
  st.m++;
  return zdarzenia;
}

// Analityczny szacunek „skąd przyjdzie atak" — oczekiwana liczba udanych dostępów na miesiąc
// dla każdego wektora, bez losowania. Reżyser używa tego do diagnozy „aktualnego problemu".
function presjaWektorow(st) {
  const czynne = KONTROLE.filter(k => dziala(st, k.id));
  const skut = id => (kontrola[id].inwentaryzacja ? st.znane : 1);
  const wynik = {};
  for (const [wid, wek] of Object.entries(Z.WEKTORY)) {
    const skala = wek.skala === 'ludzie' ? Math.pow(st.uzytkownicy / Z.SKALA_ODNIESIENIA.ludzie, 0.7)
      : wek.skala === 'zasoby' ? Math.pow(st.zasobyZnane / Z.SKALA_ODNIESIENIA.zasoby, 0.5) : 1;
    const mn = (st.firma.wektory?.[wid] ?? wek.domyslnie ?? 1) * skala * (st.mod.wektory[wid] ?? 1);
    const zap = czynne.reduce((a, k) => a * (1 - (k.zapobiega?.[wid] || 0) * skut(k.id)), 1);
    wynik[wid] = wek.lambda * mn * wek.p * zap;
  }
  return wynik;
}

// Walidacja profilu firmy (jak lib/seasons.js waliduje plansze): zły profil nie wchodzi do gry.
// Przypadek brzegowy: firma z 0 osób i 0 komputerów „traciła" 195 tys. zł przez wektor dostawcy.
function walidujFirme(f) {
  const b = [];
  if (!(f.pracownicy >= 1)) b.push('pracownicy < 1');
  const z = f.zasoby || {};
  if (!((z.stacje || 0) + (z.serwery || 0) >= 1)) b.push('brak zasobów (stacje + serwery < 1)');
  if (!(z.znane > 0 && z.znane <= 1)) b.push('zasoby.znane poza (0, 1]');
  for (const n of ['koszt_dnia', 'przychod_rok', 'rekordy', 'budzet_rok']) if (!(f[n] >= 0)) b.push(`${n} < 0 albo brak`);
  if (!(f.zespol?.fte >= 0 && f.zespol?.h_it >= 0)) b.push('zespol.fte / zespol.h_it');
  for (const id of f.na_starcie || []) if (!kontrola[id]) b.push(`na_starcie: nieznana kontrola ${id}`);
  for (const [w, v] of Object.entries(f.wektory || {})) { if (!Z.WEKTORY[w]) b.push(`wektory: nieznany ${w}`); if (!(v >= 0)) b.push(`wektory.${w} < 0`); }
  for (const s of Object.keys(f.sprawcy || {})) if (!Z.SPRAWCY[s]) b.push(`sprawcy: nieznany ${s}`);
  return b;
}

module.exports = {
  walidujFirme,
  TYGODNIE, H_NA_ETAT, KOSZT_ETATU, PROG_POWAZNY,
  mulberry32, poisson, pick, kontrola,
  nowyStan, zlec, dodajEtat, zakonczMiesiac, dziala, kosztMiesieczny, presjaWektorow,
};
