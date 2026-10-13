// ── DECYZJE CYKLICZNE: to, co wraca w każdej firmie niezależnie od kampanii ──
// Odnowienia umów, wygasające certyfikaty i domeny, koniec wsparcia producenta, alerty bez
// właściciela, zespół, który nie nadąża. Pojawiają się w skrzynce spraw ze STANU firmy
// (proto/cykl.js), a nie ze skryptu — dlatego gracz ma decyzje w każdym miesiącu i nie może
// „zrobić wszystkiego naraz, a potem czekać" (docs/18-…, 18.12).
//
// Format jak sprawy w pliku kampanii (proto/sprawy.js): tytul/tresc mogą być funkcjami
// (k, dane) — `dane.klucz` mówi, której umowy / którego certyfikatu dotyczy sprawa.
// Każda sprawa ma tanie uczciwe wyjście (≤ 8 h, bez pieniędzy) — walidator kampanii.
// Liczby (indeksacja, rabaty, szanse) to 🔵 uproszczenia gry; opis w docs/18-…, 18.12.

const S = require('../proto/silnik');
const zl = n => `${Math.round(n).toLocaleString('pl-PL')} zł`;

const INDEKSACJA = 1.08;       // automatyczne przedłużenie: cena rośnie
const RABAT_Z_DOWODAMI = 0.9;  // negocjacje z wynikami przeglądów/testów w ręku
const BEZ_DOWODOW = 1.05;      // negocjacje „na słowo": dostawca nie ustępuje
const PRZETARG = 0.8;          // nowy dostawca jest tańszy, ale wdrożenie zaczyna się od nowa

const cert = (k, d) => (k.def.certyfikaty || []).find(c => c.id === d.klucz);
const eol = (k, d) => (k.def.koniec_wsparcia || []).find(e => e.id === d.klucz);
const dowod = (k, id) => { const o = k.obiekty[id]; return !!o && Math.max(o.ostPrzeglad ?? -99, o.ostTest ?? -99) >= k.st.m - 12; };

// Skutek wygaśnięcia certyfikatu (także „zapomnianego" — bez ewidencji nikt nie wiedział).
function wygasCertyfikat(k, a, c, zapomniany) {
  const s = c.skutek || {};
  if (s.reputacja) a.wskaznik('reputacja', s.reputacja);
  if (s.mandat) a.wskaznik('mandat', s.mandat);
  for (const [d, zm] of Object.entries(s.dzial || {})) a.dzial(d, zm);
  if (s.pln) a.strata(s.pln, 'certyfikat');
  if (s.presja) a.presja(...s.presja);
  k.cykl.wygasle.push({ id: c.id, m: k.st.m, zapomniany });
  const t = `Wygasł: ${c.nazwa} — ${s.opis}${zapomniany ? '. Nikt nie wiedział, że trzeba go odnowić (brak ewidencji certyfikatów i domen)' : ''}.`;
  k.raportIT.push(t);
  return t;
}

const zatrudnij = {
  opis: 'Rekrutacja na pełny etat (ok. 3 miesiące; pensja z budżetu bezpieczeństwa)',
  koszt: () => ({ h: 8, etat: 1, etatOd: 3 }),
  dostepny: (k, p, a) => (a.rekrutacjaTrwa() ? 'rekrutacja już trwa' : null),
  wykonaj: (k, p, a) => { a.rekrutujEtat(1, 3); return 'Rekrutacja ruszyła — ktoś zacznie za ok. 3 miesiące.'; },
};
const zlecUsluge = (id, opis) => ({
  opis,
  koszt: k => ({ h: 4, pln: S.kontrola[id].wdrozenie.pln, msc: S.kosztMiesieczny(k.st, id) }),
  dostepny: (k, p, a) => (a.dziala(id) || k.obiekty[id]?.stan === 'projekt' ? `${S.kontrola[id].nazwa} już jest` : null),
  wykonaj: (k, p, a) => { a.wdrozZeSprawy(id, true); return `Umowa podpisana: ${S.kontrola[id].nazwa}. Rusza od przyszłego miesiąca.`; },
});

const sprawy = {
  C_odnowienie: {
    tytul: (k, d) => `Odnowienie umowy: ${S.kontrola[d.klucz].nazwa}`,
    od: 'Dostawca', termin: 0, problemy: [], cele: ['E1', 'E8'],
    tresc: (k, d) => `Umowa kończy się w tym miesiącu (dziś ${zl(S.kosztMiesieczny(k.st, d.klucz))}/mies.). Dostawca proponuje przedłużenie z indeksacją +${Math.round((INDEKSACJA - 1) * 100)}%. ` +
      (dowod(k, d.klucz) ? 'Masz wyniki przeglądu albo testu z ostatniego roku — jest z czym negocjować.' : 'Nie masz wyników przeglądu ani testu — trudno wykazać, czego dostawca nie dowiózł.'),
    czasowniki: {
      przedluz: { opis: `Przedłużyć na rok (+${Math.round((INDEKSACJA - 1) * 100)}% indeksacji)`, h: 0,
        wykonaj: (k, p, a, s) => { a.cena(s.dane.klucz, INDEKSACJA); a.odnowiono(s.dane.klucz); return 'Przedłużone na rok.'; } },
      negocjuj: { opis: 'Negocjować na podstawie przeglądów i testów (z dowodami: −10% i naprawa znanej usterki w ramach umowy)', h: 4,
        wykonaj: (k, p, a, s) => {
          const id = s.dane.klucz;
          a.odnowiono(id);
          if (!dowod(k, id)) { a.cena(id, BEZ_DOWODOW); return 'Bez danych dostawca nie ustępuje — przedłużone z podwyżką.'; }
          a.cena(id, RABAT_Z_DOWODAMI);
          const u = k.obiekty[id].usterki.find(x => x.odkryta && !x.naprawiona && x.naprawa_h);
          if (u) { u.naprawiona = true; require('../proto/ruchy').przeliczKonf(k, id); }
          return `Rabat ${Math.round((1 - RABAT_Z_DOWODAMI) * 100)}%${u ? ` i naprawa w ramach umowy: ${u.opis}` : ''}.`;
        } },
      zmien_dostawce: { opis: `Przetarg na innego dostawcę: −${Math.round((1 - PRZETARG) * 100)}% ceny, ale wdrożenie od nowa (jakość nieznana, zero historii przeglądów)`, h: 12,
        wykonaj: (k, p, a, s) => { a.cena(s.dane.klucz, PRZETARG / (k.st.ceny?.[s.dane.klucz] ?? 1)); a.odnowiono(s.dane.klucz); a.nowyDostawca(s.dane.klucz); return 'Nowy dostawca, nowa umowa. Warto zrobić przegląd po przejściu.'; } },
      wypowiedz: { opis: 'Wypowiedzieć umowę (kontrola przestaje działać; abonament jeszcze przez miesiąc)', h: 1,
        wykonaj: (k, p, a, s) => { a.wycofajObiekt(s.dane.klucz); return 'Wypowiedziane.'; } },
    },
    domyslnie: (k, a, s) => { a.cena(s.dane.klucz, INDEKSACJA); a.odnowiono(s.dane.klucz); return `umowa przedłużyła się automatycznie (+${Math.round((INDEKSACJA - 1) * 100)}%)`; },
  },

  C_certyfikat: {
    tytul: (k, d) => `Wygasa: ${cert(k, d).nazwa}`,
    od: 'Przypomnienie (ewidencja / rejestrator)', termin: 0, problemy: ['ciaglosc'], cele: ['E12', 'E4'],
    tresc: (k, d) => `${cert(k, d).nazwa} wygasa w tym miesiącu. Jeśli wygaśnie: ${cert(k, d).skutek.opis}.`,
    czasowniki: {
      odnow: { opis: 'Odnowić ręcznie (jak co roku)', h: 2,
        wykonaj: (k, p, a, s) => { k.cykl.odnowione.push({ id: s.dane.klucz, m: k.st.m }); return 'Odnowione — do następnego roku.'; } },
      automatyzuj: { opis: 'Odnowić i zautomatyzować odnawianie certyfikatów TLS (raz; łatwiej, gdy jest ewidencja)',
        koszt: (k, p, a) => ({ h: a.dziala('inwentaryzacja') ? 4 : 10 }),
        dostepny: (k, p, a, s) => (cert(k, s.dane).auto ? null : 'tego nie da się odnawiać automatycznie (podpis kwalifikowany, domena u rejestratora)'),
        wykonaj: (k, p, a, s) => { a.flaga('certy_auto', a.miesiac()); k.cykl.odnowione.push({ id: s.dane.klucz, m: k.st.m }); return 'Odnowione; certyfikaty TLS odnawiają się teraz same (z alertem, gdy coś nie wyjdzie).'; } },
      zlec_msp: { opis: 'Przekazać certyfikaty i domeny firmie administrującej (w ramach umowy MSP)', h: 1,
        dostepny: (k, p, a) => (a.dziala('msp') ? null : 'nie masz firmy administrującej (MSP)'),
        wykonaj: (k, p, a, s) => { a.flaga('certy_msp', a.miesiac()); k.cykl.odnowione.push({ id: s.dane.klucz, m: k.st.m }); return 'Odnowione; certyfikaty i domeny pilnuje teraz MSP.'; } },
    },
    domyslnie: (k, a, s) => wygasCertyfikat(k, a, cert(k, s.dane), false),
  },

  C_eol: {
    tytul: (k, d) => `Koniec wsparcia: ${eol(k, d).nazwa}`,
    od: 'Producent / dostawca', termin: 2, problemy: ['podatnosc'], cele: ['E4', 'E1'],
    tresc: (k, d) => `${eol(k, d).opis} Bez łatek każda nowa podatność zostaje otwarta na zawsze.`,
    czasowniki: {
      modernizuj: { opis: 'Wymienić / zaktualizować (z pilotażem: dłużej, bez ryzyka dla procesu)',
        param: { tryb: { opis: 'jak', wartosci: ['z_pilotazem', 'od_razu'] } },
        koszt: (k, p, a, s) => { const e = eol(k, s.dane); return { h: e.h + (p.tryb === 'z_pilotazem' && e.ot ? 6 : 0), pln: e.pln }; },
        wykonaj: (k, p, a, s) => {
          const e = eol(k, s.dane);
          a.ryzyko(`eol:${e.id}`, e.wektory, 0, 'eol');
          k.cykl.eol[e.id] = { v: 'modernizuj', m: k.st.m };
          if (e.ot) k.historia.push({ m: k.st.m, t: 'ot_zmiana_eol', id: e.id, pilot: p.tryb === 'z_pilotazem' });
          if (e.ot && p.tryb === 'od_razu' && k.rnd.wdrozenia() < 0.3) { a.awaria(e.nazwa); return 'Wymienione „na żywo" — i proces stanął na kilka godzin. Teraz działa.'; }
          return 'Wymienione; system znów dostaje łatki.';
        } },
      izoluj: { opis: 'Odizolować w osobnej strefie sieci (ryzyko zostaje, ale mniej dróg do niego)', h: 8,
        dostepny: (k, p, a) => (a.dziala('segmentacja') || a.dziala('ngfw') ? null : 'izolacja wymaga segmentacji sieci albo zapory nowej generacji'),
        wykonaj: (k, p, a, s) => { const e = eol(k, s.dane); a.ryzyko(`eol:${e.id}`, e.wektory, 0.35, 'eol'); k.cykl.eol[e.id] = { v: 'izoluj', m: k.st.m }; return 'Odizolowane; dostęp tylko ze stacji inżynierskiej przez bramę.'; } },
      wsparcie: { opis: 'Wykupić rozszerzone wsparcie na rok (łatki bezpieczeństwa; wróci za rok)',
        koszt: (k, p, a, s) => ({ h: 2, pln: eol(k, s.dane).pln_wsparcie }),
        wykonaj: (k, p, a, s) => { const e = eol(k, s.dane); a.ryzyko(`eol:${e.id}`, e.wektory, 0.25, 'eol'); k.cykl.eol[e.id] = { v: 'wsparcie', m: k.st.m, ponownie: k.st.m + 12 }; return 'Rozszerzone wsparcie na 12 miesięcy.'; } },
      akceptuj: { opis: 'Zarząd akceptuje ryzyko na piśmie (z terminem przeglądu)', h: 2,
        wykonaj: (k, p, a, s) => { const e = eol(k, s.dane); a.ryzyko(`eol:${e.id}`, e.wektory, 1, 'eol'); a.akceptuj(`eol:${e.id}`); k.cykl.eol[e.id] = { v: 'akceptuj', m: k.st.m }; return 'Ryzyko ma właściciela i termin przeglądu.'; } },
      zostaw: { opis: 'Zostawić jak jest', h: 0,
        wykonaj: (k, p, a, s) => { const e = eol(k, s.dane); a.ryzyko(`eol:${e.id}`, e.wektory, 1, 'eol'); k.cykl.eol[e.id] = { v: 'zostaw', m: k.st.m }; return 'Zostaje.'; } },
    },
    domyslnie: (k, a, s) => { const e = eol(k, s.dane); a.ryzyko(`eol:${e.id}`, e.wektory, 1, 'eol'); k.cykl.eol[e.id] = { v: null, m: k.st.m }; return 'nikt nie zdecydował — system działa bez łatek'; },
  },

  C_alerty: {
    tytul: 'Alerty leżą — kto je obsługuje?',
    od: 'Zespół IT', termin: 1, problemy: ['wykrywanie', 'ludzie'], cele: ['E3', 'E5'],
    tresc: k => `Od ${k.cykl.alertyMies} miesięcy nie nadążamy z alertami — przegląda się ich mniej niż 80%. Alert, którego nikt nie czyta, nie istnieje. Proces potrzebuje właściciela.`,
    czasowniki: {
      zatrudnij,
      mdr: zlecUsluge('mdr', 'Zlecić monitorowanie na zewnątrz (MDR/SOC 24/7)'),
      strojenie: { opis: 'Stroić reguły: wyciszyć szum (alertów mniej o ~40%, wykrywanie odrobinę słabsze)', h: 8,
        wykonaj: (k, p, a) => { a.alertyMn(0.6); for (const id of ['edr', 'siem', 'siem_os']) a.oslabObiekt(id, 0.95); return 'Reguły nastrojone; mniej szumu.'; } },
      zostaw: { opis: 'Zostawić — „jakoś to będzie"', h: 0, wykonaj: () => 'Bez zmian.' },
    },
    domyslnie: () => 'bez właściciela — alerty dalej leżą',
  },

  C_kolejka: {
    tytul: 'Zespół nie nadąża z wdrożeniami',
    od: 'Zespół IT', termin: 1, problemy: ['ludzie'], cele: ['E3'],
    tresc: k => `W toku: ${k.st.projekty.length} projektów, najstarszy od ${k.st.m - Math.min(...k.st.projekty.map(p => p.start))} miesięcy. ` +
      'Każdy projekt to też Twoje godziny na koordynację, a przełączanie się między nimi zjada czas zespołu.',
    czasowniki: {
      zatrudnij,
      msp: zlecUsluge('msp', 'Zlecić administrację firmie zewnętrznej (MSP) — więcej rąk do pracy'),
      priorytety: { opis: 'Ustalić z zarządem priorytety i wstrzymać ostatni projekt w kolejce', h: 2,
        wykonaj: (k, p, a) => {
          const ost = k.st.projekty.at(-1);
          if (!ost) return 'Nie ma czego wstrzymywać.';
          a.wycofajObiekt(ost.id); a.wskaznik('mandat', 1);
          return `Wstrzymane: ${S.kontrola[ost.id].nazwa}. Zarząd docenia jasne priorytety.`;
        } },
      nadgodziny: { opis: 'Nadgodziny zespołu przez 3 miesiące (+25 h/mies., morale −10)', h: 0,
        wykonaj: (k, p, a) => { a.bonusGodzin(25, 3); a.wskaznik('morale', -10); return 'Zespół zostaje po godzinach.'; } },
      zostaw: { opis: 'Zostawić — kolejka sama się kiedyś skończy', h: 0, wykonaj: () => 'Bez zmian.' },
    },
    domyslnie: () => 'kolejka zostaje',
  },
};
module.exports = { sprawy, wygasCertyfikat };
