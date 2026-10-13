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
// Silnik miesiąca żyje w silnik.js i liczy też kampanię gracza (kampania.js). Tu strategia
// jest stała, a „gracz" wie wszystko — to świadome uproszczenie.

const FIRMY = require('../data/firmy');
const S = require('./silnik');

const MIESIACE = 24;      // kampania = 24 miesiące (od wejścia nowelizacji KSC do 1. audytu)

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

// Strategia = stały plan zleceń; ten sam silnik co kampania gracza (silnik.js).
function symuluj(firma, strategia, seed) {
  const st = S.nowyStan(firma, seed);
  for (let m = 1; m <= MIESIACE; m++) {
    for (const [id, start] of Object.entries(strategia.plan)) if (m === start) S.zlec(st, id);
    for (const [od, ile] of strategia.etaty || []) if (m === od) S.dodajEtat(st, ile);
    S.zakonczMiesiac(st);
  }
  st.w.niewdrozone = st.projekty.length;
  return st.w;
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
