// ── PROTOTYP SYMULACJI (Monte Carlo) ──
// Nie jest grą — to narzędzie do sprawdzania, czy model zagrożeń i kontroli daje
// REALISTYCZNE wnioski, zanim zbudujemy na nim cokolwiek. Odpowiada na pytania:
//   • czy firma bez ochrony ma sensowną (nie absurdalną) liczbę poważnych incydentów,
//   • czy higiena (MFA, łatki, kopie) daje najwięcej za najmniej — jak w realu,
//   • czy kupienie SIEM/SOAR bez ludzi daje mniej, niż kosztuje (zmęczenie alertami),
//   • czy żadna strategia nie jest „jedynie słuszna" (gra musi mieć wybory).
// Wyniki i wnioski: docs/14-samoewaluacja.md. Uruchomienie:
//   node ciso-sim/proto/symulacja.js [firma] [liczba_przebiegów]
//
// Silnik gry będzie liczył to samo, ale z decyzjami gracza co miesiąc i z mgłą wojny.
// Tu strategia jest stała, a gracz „wie wszystko" — to świadome uproszczenie.

const KONTROLE = require('../data/kontrole');
const Z = require('../data/zagrozenia');
const FIRMY = require('../data/firmy');

const MIESIACE = 24;      // kampania = 24 miesiące (od wejścia nowelizacji KSC do 1. audytu)
const TYGODNIE = 4;       // tyk symulacji wewnątrz miesiąca
const H_NA_ETAT = 120;    // produktywne godziny etatu w miesiącu (urlopy, spotkania, IT „przy okazji")
const H_NA_ALERT = 0.25;  // triage jednego alertu
const STROJENIE_MIES = 3; // przez tyle miesięcy po wdrożeniu narzędzie daje 2× więcej alertów
const KOSZT_ETATU = 22000;// średni miesięczny koszt etatu bezpieczeństwa z narzutami (PLN)

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

// ── STRATEGIE ── (miesiąc startu wdrożenia; etaty dodatkowe od miesiąca)
const STRATEGIE = {
  'nic': { opis: 'Nic ponad stan zastany', plan: {} },
  'papier': {
    opis: 'Zgodność na papierze: SZBI, ryzyko, dostawcy, plan IR — bez narzędzi i ludzi',
    plan: { szbi: 1, ryzyko: 2, dostawcy: 3, plan_ir: 2 },
  },
  'narzedzia_bez_ludzi': {
    opis: 'Kupujemy SIEM, SOAR, EDR, NDR, DLP — zespół bez zmian',
    plan: { siem: 1, edr: 1, ndr: 2, dlp: 3, plan_ir: 1, soar: 4 },
  },
  'mala_firma': {
    opis: 'Mała firma: higiena kupiona jako usługa (MSP), bez nowych etatów',
    plan: { msp: 1, mfa: 1, weryfikacja_platnosci: 1, backup: 1, poczta: 1, moje_cert: 1, ekspozycja: 2,
      szkolenia: 2, patch: 3, edr: 3, plan_ir: 4, dr_test: 4 },
  },
  'higiena': {
    opis: 'Higiena: MFA, łatki, kopie offline + testy, porządek z ekspozycją, inwentaryzacja, procedura płatności',
    plan: { mfa: 1, ekspozycja: 1, moje_cert: 1, weryfikacja_platnosci: 1, backup: 1, inwentaryzacja: 2,
      patch: 2, hardening: 3, dr_test: 3, plan_ir: 4, szkolenia: 4, poczta: 2 },
    etaty: [[1, 1]],
  },
  'higiena_mdr': {
    opis: 'Higiena + EDR + MDR 24/7 + retainer IR + ćwiczenia + SZBI',
    plan: { mfa: 1, ekspozycja: 1, moje_cert: 1, weryfikacja_platnosci: 1, backup: 1, inwentaryzacja: 2,
      patch: 2, hardening: 3, dr_test: 3, plan_ir: 2, szkolenia: 4, poczta: 2, edr: 3, mdr: 4,
      retainer_ir: 2, cwiczenia: 5, szbi: 4, ryzyko: 4, dostawcy: 8, segmentacja: 9 },
    etaty: [[1, 1], [6, 1]],
  },
  'wszystko_w_srodku': {
    opis: 'Własny SOC: higiena + EDR + SIEM + SOAR + NDR + 4 nowe etaty',
    plan: { mfa: 1, ekspozycja: 1, moje_cert: 1, weryfikacja_platnosci: 1, backup: 1, inwentaryzacja: 2,
      patch: 2, hardening: 3, dr_test: 3, plan_ir: 2, szkolenia: 4, poczta: 2, edr: 3, siem: 4,
      soar: 8, ndr: 6, cwiczenia: 5, szbi: 4, ryzyko: 4, dostawcy: 8, segmentacja: 9, pam: 10 },
    etaty: [[1, 1], [4, 2], [8, 1]],
  },
};

function symuluj(firma, strategia, seed) {
  const rnd = mulberry32(seed);
  const zasobyZnane = firma.zasoby.stacje + firma.zasoby.serwery;
  let znane = firma.zasoby.znane;               // część prawdziwych zasobów w ewidencji
  const uzytkownicy = firma.pracownicy;
  const aktywne = {};                            // id → miesiąc, od którego działa
  for (const id of firma.na_starcie || []) aktywne[id] = -12; // stare = już nastrojone
  let etaty = firma.zespol.fte;
  // Godziny w katalogu są dla firmy referencyjnej (330 zasobów). Łatanie 34 komputerów
  // to nie 1/10 łatania 330, ale też nie tyle samo — stąd potęga z podłogą i sufitem.
  const skalaH = Math.min(2.5, Math.max(0.3, Math.pow(zasobyZnane / Z.SKALA_ODNIESIENIA.zasoby, 0.6)));
  const hUtrz = k => (k.utrzymanie.h || 0) * skalaH;
  const hWdr = k => k.wdrozenie.h * Math.max(0.4, skalaH);
  const intruzi = [];
  const w = { wydatki: 0, straty: 0, powazne: 0, incydenty: 0, wykryte_wczesnie: 0,
    alert_niedobor_mies: 0, nadgodziny: 0, opoznienie_mies: 0, niewdrozone: 0, szczegoly: {} };
  const dodajStrate = (rodzaj, pln) => {
    w.straty += pln; w.szczegoly[rodzaj] = (w.szczegoly[rodzaj] || 0) + pln;
  };

  const projekty = [];                           // { id, start, h } — w kolejności zlecenia
  const zamowione = new Set(Object.keys(aktywne)); // umowy podpisane = płacimy abonament

  for (let m = 1; m <= MIESIACE; m++) {
    // 1) Decyzje strategii: zlecenia wdrożeń i etaty. Wdrożenie płaci się z góry,
    // abonament od podpisania umowy — także wtedy, gdy wdrożenie się ślizga.
    for (const [id, start] of Object.entries(strategia.plan)) {
      if (m !== start) continue;
      w.wydatki += kontrola[id].wdrozenie.pln;
      projekty.push({ id, start, h: 0 });
      zamowione.add(id);
    }
    for (const [od, ile] of strategia.etaty || []) if (m === od) etaty += ile;
    w.wydatki += (etaty - firma.zespol.fte) * KOSZT_ETATU; // pensje NOWYCH etatów

    const dziala = id => aktywne[id] !== undefined && m >= aktywne[id];
    const czynne = KONTROLE.filter(k => dziala(k.id));

    for (const id of zamowione) {
      const u = kontrola[id].utrzymanie;
      let pln = (u.pln || 0) + (u.pln_na_stanowisko || 0) * zasobyZnane + (u.pln_na_uzytkownika || 0) * uzytkownicy;
      if (u.pln_min) pln = Math.max(pln, u.pln_min);
      w.wydatki += pln;
    }

    // 2) Godziny. Kolejność jak w zdyscyplinowanym zespole: utrzymanie, potem alerty,
    // a projekty dostają RESZTĘ i się ślizgają. (W grze kolejność wybiera gracz —
    // projekty przed alertami to szybsze wdrożenia i ślepy SOC.)
    let h = etaty * H_NA_ETAT + firma.zespol.h_it + czynne.reduce((a, k) => a + (k.godziny || 0), 0);
    const potrzebaUtrz = czynne.reduce((a, k) => a + hUtrz(k), 0);
    const utrzymanieUlamek = potrzebaUtrz > 0 ? Math.min(1, h / potrzebaUtrz) : 1;
    h -= potrzebaUtrz * utrzymanieUlamek;

    // Skuteczność kontroli: wymagania, godziny utrzymania, pokrycie inwentaryzacji.
    const skut = {};
    for (const k of czynne) {
      let s = utrzymanieUlamek;
      if ((k.wymaga || []).some(r => !dziala(r))) s *= 0.3;
      if (k.inwentaryzacja) s *= znane;
      skut[k.id] = s;
    }
    // Inwentaryzacja i skanery odkrywają zasoby — powoli, a shadow IT powoli odrasta.
    const odkrywanie = czynne.reduce((a, k) => a + (k.odkrywa || 0) * skut[k.id], 0);
    znane = Math.min(0.98, znane + (1 - znane) * Math.min(0.5, odkrywanie * 0.25) - 0.003);

    // 3) Alerty i triage — tu rodzi się zmęczenie alertami.
    let alerty = 0;
    for (const k of czynne) {
      if (!k.alerty) continue;
      const nowe = m - aktywne[k.id] < STROJENIE_MIES ? 2 : 1;
      alerty += k.alerty * (zasobyZnane / 100) * nowe;
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

    // 4) Projekty: reszta godzin, po kolei. Gotowe = godziny zebrane i minął czas wdrożenia.
    for (let i = 0; i < projekty.length; i++) {
      const pr = projekty[i];
      const k = kontrola[pr.id];
      const daj = Math.max(0, Math.min(h, hWdr(k) - pr.h));
      pr.h += daj; h -= daj;
      if (pr.h >= hWdr(k) && m >= pr.start + k.wdrozenie.mies - 1) {
        aktywne[pr.id] = m + 1;
        w.opoznienie_mies += (m + 1) - (pr.start + k.wdrozenie.mies);
        projekty.splice(i--, 1);
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
    const ubezp = czynne.find(k => k.ubezpieczenie);

    const skutek = (rodzaj) => {
      const S = Z.SKUTKI;
      let pln = 0;
      if (rodzaj === 'szyfrowanie') {
        const dni = S.szyfrowanie.przestoj_dni * przestojMn * (1 - 0.3 * reakcja);
        pln = dni * firma.koszt_dnia + S.szyfrowanie.odbudowa_pln + S.szyfrowanie.odbudowa_na_zasob * zasobyZnane;
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

    for (let t = 0; t < TYGODNIE; t++) {
      // 4) Nowe próby. Wektory „ludzkie" rosną z liczbą ludzi, „techniczne" z liczbą
      // zasobów — pierwiastkowo, bo duża firma ma też więcej filtrów, których tu nie widać.
      for (const [wid, wek] of Object.entries(Z.WEKTORY)) {
        const skala = wek.skala === 'ludzie' ? Math.pow(uzytkownicy / Z.SKALA_ODNIESIENIA.ludzie, 0.7)
          : wek.skala === 'zasoby' ? Math.pow(zasobyZnane / Z.SKALA_ODNIESIENIA.zasoby, 0.5) : 1;
        const mn = (firma.wektory?.[wid] ?? wek.domyslnie ?? 1) * skala;
        if (!mn) continue;
        const proby = poisson(rnd, (wek.lambda * mn) / TYGODNIE);
        for (let i = 0; i < proby; i++) {
          if (rnd() >= wek.p * zapobieg(wid)) continue;
          const wagi = { ...Z.SPRAWCY_WEKTORA[wid] };
          for (const s of Object.keys(wagi)) wagi[s] *= firma.sprawcy?.[s] ?? 1;
          const kto = pick(rnd, wagi);
          const sp = Z.SPRAWCY[kto];
          w.incydenty++;
          if (sp.natychmiast) {
            const pln = skutek(sp.natychmiast);
            if (pln > 0) { dodajStrate(sp.natychmiast, pln); if (pln > 100000) w.powazne++; }
            continue;
          }
          intruzi.push({ kto, etap: sp.start || 'dostep' });
        }
      }
      // 5) Intruzi: wykrycie albo postęp.
      for (let i = intruzi.length - 1; i >= 0; i--) {
        const x = intruzi[i];
        const sp = Z.SPRAWCY[x.kto];
        if (rnd() < wykryj(x.etap, 1 / sp.skrytosc > 1 ? 1 : sp.skrytosc)) {
          const op = Z.OPANOWANIE[x.etap];
          w.wydatki += op.pln * (1 - 0.5 * reakcja);
          w.nadgodziny += op.h;
          if (x.etap === 'dostep' || x.etap === 'eskalacja') w.wykryte_wczesnie++;
          if (rnd() >= Z.NIEUDANE_OPANOWANIE * (1 - reakcja)) { intruzi.splice(i, 1); continue; }
          // Nieudane opanowanie: intruz zostaje, my myślimy, że go nie ma.
        }
        if (sp.wygasa && rnd() < sp.wygasa) { intruzi.splice(i, 1); continue; }
        if (x.kto === 'broker' && rnd() < sp.sprzedaz) { x.kto = 'ransomware'; continue; }
        const nast = { dostep: 'eskalacja', eskalacja: 'ruch', ruch: 'cel' }[x.etap];
        const p = (sp.postep[nast] || 0) * utrudn(nast);
        if (rnd() < p) {
          if (nast === 'cel') {
            let pln = skutek(sp.cel);
            if (sp.cel === 'szyfrowanie' && rnd() < sp.eksfiltracja) pln += skutek('wyciek');
            dodajStrate(sp.cel, pln);
            w.powazne++;
            intruzi.splice(i, 1);
          } else x.etap = nast;
        }
      }
    }
  }
  w.niewdrozone = projekty.length;
  return w;
}

function main() {
  const firmaId = process.argv[2] || 'produkcja';
  const N = Number(process.argv[3] || 2000);
  const firma = FIRMY[firmaId];
  if (!firma) { console.error('Nie ma firmy', firmaId, '— dostępne:', Object.keys(FIRMY).join(', ')); process.exit(1); }
  console.log(`\n${firma.nazwa} — ${MIESIACE} mies., ${N} przebiegów\n`);
  const fmt = n => (n / 1000).toFixed(0).padStart(7) + ' tys.';
  console.log('strategia              wydatki   straty     RAZEM  RAZEM P90   poważne/2l  P(≥1 poważny)  wczesne  niedob.alert  poślizg  niewdroż.');
  for (const [id, s] of Object.entries(STRATEGIE)) {
    let wyd = 0, str = 0, pow = 0, jeden = 0, wcz = 0, nied = 0, posl = 0, niew = 0;
    const rodzaje = {};
    const razem = [];
    for (let i = 0; i < N; i++) {
      const w = symuluj(firma, s, 1000 + i); // ta sama „pogoda" dla każdej strategii
      razem.push(w.wydatki + w.straty);
      wyd += w.wydatki; str += w.straty; pow += w.powazne; if (w.powazne > 0) jeden++;
      wcz += w.wykryte_wczesnie; nied += w.alert_niedobor_mies; posl += w.opoznienie_mies; niew += w.niewdrozone;
      for (const [k, v] of Object.entries(w.szczegoly)) rodzaje[k] = (rodzaje[k] || 0) + v;
    }
    console.log(
      id.padEnd(20), fmt(wyd / N), fmt(str / N), fmt((wyd + str) / N),
      // P90 = „zły, ale nie najgorszy scenariusz": tego boi się zarząd, nie średniej.
      fmt(razem.sort((a, b) => a - b)[Math.floor(N * 0.9)]),
      (pow / N).toFixed(2).padStart(9), ((100 * jeden) / N).toFixed(0).padStart(12) + '%',
      (wcz / N).toFixed(1).padStart(8), (nied / N).toFixed(1).padStart(12),
      (posl / N).toFixed(0).padStart(8), (niew / N).toFixed(1).padStart(9),
    );
    const top = Object.entries(rodzaje).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${fmt(v / N).trim()}`).join(', ');
    console.log(''.padEnd(20), '  straty głównie:', top || '—');
  }
}

if (require.main === module) main();
module.exports = { symuluj, STRATEGIE };
