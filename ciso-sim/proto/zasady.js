// ── ZASADY DOBREJ PRAKTYKI (ocena bez klucza odpowiedzi) ──
// Projekt: docs/18-silnik-ruchow.md, 18.7. Nie ma „poprawnych opcji" — są zasady, które
// doświadczony CISO albo audytor sprawdza na tym, CO i KIEDY zrobiono (k.historia) i w jakim
// stanie jest firma. Dwie różne drogi mogą spełnić tę samą zasadę; ta sama decyzja w innej
// kolejności — nie.
//
// Każda ocena: { id, wynik: 'spelniona'|'naruszona'|'nieuczciwa', waga, cel (E1–E12), opis,
// dlaczego, m (kiedy rozstrzygnięta) }. `koniec` = false: tylko oceny już rozstrzygnięte
// (do modelu gracza w trakcie gry); true: także to, co do końca kampanii się nie wydarzyło.
//
// Jakość praktyki = Σ waga × wynik / Σ waga, gdzie spełniona 1, naruszona 0, nieuczciwa −1.

const S = require('./silnik');
const D = require('./dzialy');
const INICJATYWY = require('../data/dzialy');

const PKT = { spelniona: 1, naruszona: 0, nieuczciwa: -1 };
const KLUCZOWE = ['mfa', 'backup', 'edr', 'patch', 'segmentacja', 'plan_ir', 'bcp', 'szbi', 'ryzyko', 'inwentaryzacja', 'weryfikacja_platnosci'];

function pomocnik(k) {
  const H = k.historia;
  const ruchy = id => H.filter(e => e.t === 'ruch' && (e.id === id || (id.endsWith(':') && e.id.startsWith(id))));
  const pierwszy = id => ruchy(id)[0];
  const sprawy = pred => H.filter(e => (e.t === 'sprawa' || e.t === 'sprawa_domyslnie' || e.t === 'sprawa_zapobiegnieta') && pred(e));
  // Kiedy kontrola została zlecona — ruchem gracza albo decyzją w sprawie (kartony z grantu),
  // a zastana od startu liczy się jako zrobiona.
  const zlecone = id => { const r = pierwszy(`wdroz:${id}`)?.m; const o = k.obiekty[id]?.od; const x = Math.min(r ?? 99, o ?? 99); return x === 99 ? undefined : x; };
  return { H, ruchy, pierwszy, sprawy, zlecone };
}

// Pozostałe ryzyko po warunkach (największy ułamek na wektorach inicjatywy).
function resztka(ini, warunki) {
  const ids = String(warunki || '').split(',').map(x => x.trim()).filter(Boolean);
  let max = 0;
  for (const w of Object.keys(ini.ryzyko?.wektory || {})) {
    let u = 1;
    for (const id of ids) u *= 1 - ((ini.warunki.find(x => x.id === id)?.redukcja || {})[w] || 0);
    max = Math.max(max, u);
  }
  return max;
}

// Zasada „zrobione do miesiąca X": spełniona w momencie zrobienia, naruszona, gdy X minie.
function doMiesiaca(k, id, cel, waga, opis, dlaczego, termin, kiedy) {
  if (kiedy !== undefined && kiedy !== null && kiedy <= termin) return [{ id, wynik: 'spelniona', waga, cel, opis, dlaczego, m: kiedy }];
  if (k.st.m > termin || k.koniec) return [{ id, wynik: 'naruszona', waga, cel, opis, dlaczego, m: termin }];
  return [];
}

// Zasady z pliku kampanii. Deklaratywnie: { sprawa, id, waga, cel, opis, dlaczego,
// wybierz?(e) — które rozstrzygnięcie oceniać (domyślnie pierwsze), kazda? — każde osobno,
// ocena(e, k) → true (spełniona) | false (naruszona) | null (nie oceniać) }. Albo funkcja (k, h).
// Deklaracja z `sprawa` pozwala walidatorowi sprawdzić, że każda sprawa kampanii jest oceniana.
function zasadyKampanii(k, h) {
  const out = [];
  for (const z of k.def.zasady || []) {
    if (typeof z === 'function') { out.push(...z(k, h)); continue; }
    const ev = h.sprawy(e => e.sid === z.sprawa && (!z.wybierz || z.wybierz(e, k)));
    for (const e of z.kazda ? ev : ev.slice(0, 1)) {
      const w = z.ocena(e, k, h);
      if (w === null || w === undefined) continue;
      out.push({ id: z.kazda ? `${z.id}:${e.m}` : z.id, wynik: w === true ? 'spelniona' : w === false ? 'naruszona' : w,
        waga: z.waga, cel: z.cel, m: e.m, opis: z.opis, dlaczego: typeof z.dlaczego === 'function' ? z.dlaczego(e, k) : z.dlaczego });
    }
  }
  return out;
}

const ZASADY = [
  // ── PODSTAWY W PIERWSZYM PÓŁROCZU (priorytety przy małym budżecie) ──
  (k, h) => doMiesiaca(k, 'inwentaryzacja', 'E4', 2, 'Inwentaryzacja w pierwszym półroczu',
    'Nie da się chronić tego, o czym się nie wie. Bez ewidencji każda kontrola chroni tylko część firmy.', 6, h.zlecone('inwentaryzacja')),
  (k, h) => doMiesiaca(k, 'mfa', 'E2', 2, 'MFA na poczcie i dostępie zdalnym w pierwszym półroczu',
    'Najtańsza z dużych kontroli: przejęte hasło to wciąż otwarte drzwi, dopóki nie ma drugiego składnika.', 6, h.zlecone('mfa')),
  (k, h) => doMiesiaca(k, 'kopie', 'E12', 2, 'Kopie zapasowe (offline) w pierwszym półroczu',
    'Kopia offline zamienia ransomware z katastrofy w przestój.', 6, h.zlecone('backup')),
  // Procedura: kontrola z katalogu albo uzgodniony zwyczaj (gmina: kontrasygnata skarbnika obejmuje rachunek).
  (k, h) => doMiesiaca(k, 'procedura_platnosci', 'E2', 1, 'Procedura zmiany rachunku kontrahenta w ciągu 8 miesięcy',
    'BEC to jeden z najczęstszych realnych ataków; zatrzymuje go tylko procedura poza pocztą.', 8,
    Math.min(h.zlecone('weryfikacja_platnosci') ?? 99, k.flagi.weryfikacja_rachunku ?? 99) === 99 ? undefined
      : Math.min(h.zlecone('weryfikacja_platnosci') ?? 99, k.flagi.weryfikacja_rachunku ?? 99)),

  // ── REAKCJA NA OSTRZEŻENIE I NA ODKRYTE DRZWI ──
  (k, h) => {
    const m0 = k.flagi.ostrzezenie_cert;
    if (m0 === undefined) return [];
    const reakcja = h.H.find(e => e.t === 'ruch' && e.m >= m0 && e.m <= m0 + 1 &&
      ((k.def.reakcja_na_ostrzezenie || ['skan_ekspozycji', 'wdroz:ekspozycja', 'wdroz:moje_cert', 'wdroz:asm']).includes(e.id) ||
        (e.id === 'zlec_doradcy' && ['ekspozycja', 'ot', 'ogolny'].includes(e.p?.temat))));
    return doMiesiaca(k, 'reakcja_na_ostrzezenie', 'E4', 3, 'Reakcja na ostrzeżenie dla sektora w ciągu miesiąca',
      k.def.reakcja_dlaczego || 'Ostrzeżenie z nazwą Twojego sektora to sygnał do działania od razu.', m0 + 1, reakcja?.m);
  },
  (k, h) => {
    const out = [];
    for (const e of h.H.filter(x => x.t === 'odkrycie_faktu')) {
      const f = k.fakty[e.id];
      if (!f?.pilne) continue;
      const nap = h.H.find(x => x.t === 'naprawa_faktu' && x.id === e.id);
      out.push(...doMiesiaca(k, `drzwi:${e.id}`, 'E4', 3, `Znane drzwi zamknięte w ciągu miesiąca (${f.opis})`,
        'Znana ekspozycja, której nikt nie zamyka, to tylko kwestia czasu — napastnicy skanują internet codziennie.', e.m + 1, nap?.m));
    }
    return out;
  },

  // ── OT: najpierw bezpieczeństwo procesu ──
  (k, h) => h.H.filter(e => e.t === 'ot_zmiana_eol').map(e => ({ id: `pilotaz_eol:${e.id}:${e.m}`, wynik: e.pilot ? 'spelniona' : 'naruszona', waga: 2, cel: 'E12', m: e.m,
    opis: 'Wymiana systemu na stacji z pilotażem', dlaczego: 'Nowa wersja systemu albo routera na stacji to zmiana w OT jak każda inna — najpierw jedna stacja, potem reszta.' })),
  (k, h) => h.H.filter(e => e.t === 'ot_zmiana').map(e => {
    const kon = S.kontrola[e.id];
    const ok = kon.pilot && e.pilot;
    return { id: `pilotaz:${e.id}:${e.m}`, wynik: ok ? 'spelniona' : 'naruszona', waga: 3, cel: 'E12', m: e.m,
      opis: `Zmiana na stacjach OT dopiero po pilotażu (${kon.nazwa})`,
      dlaczego: kon.pilot ? 'Niesprawdzona zmiana na stacji sterującej potrafi zatrzymać proces — pilotaż na jednej stacji kosztuje kilka godzin.'
        : 'Tego nie robi się na OT „na żywo": aktywny skan i łatki bez zatwierdzenia producenta zawieszają sterowniki.' };
  }),
  (k, h) => {
    const o = k.obiekty.backup;
    if (!o || o.dzialaOd === null) return [];
    const t = h.ruchy('test:backup').find(e => e.m >= o.dzialaOd);
    return doMiesiaca(k, 'test_kopii', 'E12', 2, 'Test odtworzenia kopii w ciągu kwartału od wdrożenia',
      'Kopia, której nikt nie odtwarzał, jest nadzieją, nie kopią — co trzecia nie odtwarza się, gdy jest potrzebna.', o.dzialaOd + 3, t?.m);
  },
  (k, h) => {
    if (!k.koniec) return [];
    const out = [];
    for (const id of KLUCZOWE) {
      const o = k.obiekty[id];
      if (!o || o.stan !== 'dziala' || o.dzialaOd === null || k.st.m - o.dzialaOd < 6) continue;
      const ost = Math.max(o.ostPrzeglad ?? -99, o.ostTest ?? -99);
      out.push({ id: `przeglad:${id}`, wynik: ost >= k.st.m - 12 ? 'spelniona' : 'naruszona', waga: 1, cel: 'E3', m: k.st.m,
        opis: `Przegląd albo test w ostatnim roku: ${S.kontrola[id].nazwa}`,
        dlaczego: 'Narzędzie bez przeglądu dryfuje: wyjątki, wyłączone moduły, tryb „tylko wykrywaj" — po roku zostaje dekoracja.' });
    }
    if (k.obiekty.edr?.stan === 'dziala' && k.st.m - (k.obiekty.edr.dzialaOd ?? k.st.m) >= 3) {
      out.push({ id: 'edr_blokuje', wynik: k.obiekty.edr.param.tryb === 'blokuj' ? 'spelniona' : 'naruszona', waga: 1, cel: 'E5', m: k.st.m,
        opis: 'EDR po strojeniu przełączony na blokowanie',
        dlaczego: 'Tryb „tylko wykrywaj" ustawiony na czas wdrożenia i nigdy nie przełączony to jedna z najczęstszych pułapek EDR.' });
    }
    return out;
  },

  // ── DZIAŁY: zaufanie zamiast zakazów ──
  (k, h) => h.sprawy(e => e.rodzaj === 'prosba').map(e => {
    const ini = INICJATYWY[e.ini];
    let wynik = 'naruszona', dl = 'Bez odpowiedzi dział uczy się, że pytanie się nie opłaca — następnym razem zrobi po swojemu.';
    if (e.v === 'zgoda') { wynik = D.ciezarRyzyka(ini) < 0.2 ? 'spelniona' : 'naruszona'; dl = wynik === 'spelniona' ? 'Małe ryzyko — szybka zgoda buduje zaufanie.' : 'Zgoda bez warunków wnosi całe, duże ryzyko inicjatywy do firmy.'; }
    else if (e.v === 'warunki') { wynik = resztka(ini, e.p?.warunki) <= 0.6 ? 'spelniona' : 'naruszona'; dl = wynik === 'spelniona' ? '„Tak, ale" z warunkami, które naprawdę zmniejszają ryzyko.' : 'Warunki pozorne: dział się męczy, a główne ryzyko zostaje.'; }
    else if (e.v === 'alternatywa') {
      // Alternatywa ma sens przy realnym ryzyku; przy małym to zbędne blokowanie biznesu.
      wynik = D.ciezarRyzyka(ini) >= 0.1 ? 'spelniona' : 'naruszona';
      dl = wynik === 'spelniona' ? 'Odmowa z alternatywą jest uczciwa — dział dostaje drogę, nie tylko „nie".' : 'Ryzyko było małe — „nie, ale" zamiast szybkiej zgody to zbędna przeszkoda dla działu.';
    }
    else if (e.v === 'odmowa') dl = 'Odmowa bez alternatywy uczy działy, że pytanie się nie opłaca.';
    return { id: `prosba:${e.id}`, wynik, waga: 1, cel: 'E9', m: e.m, opis: `Prośba działu: ${ini.nazwa}`, dlaczego: dl };
  }),
  (k, h) => h.sprawy(e => e.rodzaj === 'odkrycie').map(e => {
    const ini = INICJATYWY[e.ini];
    const ok = (e.v === 'legalizuj' && resztka(ini, e.p?.warunki) <= 0.6) || e.v === 'wylacz' || e.v === 'akceptuj';
    return { id: `odkrycie:${e.id}`, wynik: ok ? 'spelniona' : 'naruszona', waga: 1, cel: 'E9', m: e.m, opis: `Odkryte obejście: ${ini.nazwa}`,
      dlaczego: ok ? 'Ryzyko ma decyzję i właściciela, a dział uczy się, że przyznanie się nie boli.'
        : e.v === 'ukarz' ? 'Kara uczy działy ukrywać się lepiej — następne obejście znajdziesz później albo wcale.' : 'Znane ryzyko bez decyzji i bez właściciela.' };
  }),
  (k, h) => h.sprawy(e => e.rodzaj === 'sygnal').map(e => ({
    id: `sygnal:${e.id}`, wynik: ['zbadaj', 'zbadaj_zewnetrznie', 'przekaz_mdr'].includes(e.v) ? 'spelniona' : 'naruszona', waga: 1, cel: 'E5', m: e.m,
    opis: 'Sygnał od ludzi sprawdzony', dlaczego: 'Sygnał od ludzi to często jedyny wczesny ślad intruza — i jedyny powód, dla którego ludzie zgłaszają dalej.' })),

  // ── RYZYKO MA WŁAŚCICIELA ──
  (k, h) => {
    if (!k.koniec) return [];
    const L = require('./ruchy').luki(k).filter(l => l.id.startsWith('wyjatek:'));
    return L.map(l => ({ id: `wyjatek:${l.id}`, wynik: k.akceptacje[l.id] !== undefined ? 'spelniona' : 'naruszona', waga: 2, cel: 'E1', m: k.st.m,
      opis: `Wyjątek z akceptacją zarządu: ${l.opis}`, dlaczego: 'Wyjątek bez akceptacji to luka, o której zarząd nie wie, że ją ma — i za którą odpowiada.' }));
  },

  // ── PRAWO (docs/02-…) ──
  (k, h) => doMiesiaca(k, 'wpis', 'E6', 2, 'Wniosek o wpis do wykazu w terminie (3.10.2026)',
    'Status wynika z ustawy; wpis jest deklaratoryjny, ale obowiązkowy w terminie.', 6, h.pierwszy('wpis_s46')?.m),
  (k, h) => {
    const e = h.pierwszy('wpis_s46');
    if (!e) return [];
    return [{ id: 'status', wynik: e.p.status === k.st.firma.status_ksc ? 'spelniona' : 'naruszona', waga: 1, cel: 'E6', m: e.m,
      opis: 'Prawidłowy status w wykazie', dlaczego: 'Kluczowy to zwykle duże przedsiębiorstwo albo dawny operator usługi kluczowej; zły status to obowiązki bez potrzeby albo luka.' }];
  },
  (k, h) => {
    if (k.st.m <= 13 && !k.koniec) return [];
    const o = k.obiekty.szbi;
    const ok = o && (o.stan === 'dziala' && o.dzialaOd <= 13 || o.od <= 7);
    return [{ id: 'szbi', wynik: ok ? 'spelniona' : 'naruszona', waga: 2, cel: 'E11', m: 13, opis: 'SZBI na termin 3.04.2027 (albo realny harmonogram od jesieni 2026)',
      dlaczego: 'Wdrożenie SZBI trwa realnie pół roku — zaczęte w październiku zdąży, zaczęte w marcu już nie.' }];
  },
  (k, h) => {
    const o = k.obiekty.szbi;
    if (!o || o.param.sposob !== 'z_pudelka') return [];
    return [{ id: 'szbi_na_miare', wynik: 'naruszona', waga: 1, cel: 'E11', m: o.od, opis: 'SZBI na miarę firmy, nie z pudełka',
      dlaczego: 'Polityki z innej firmy nie pasują do tej i nikt ich nie stosuje — audyt zapyta o dowody.' }];
  },
  (k, h) => {
    const out = [];
    for (const rok of [k.def.start.rok, k.def.start.rok + 1]) {
      const koniecRoku = (rok - k.def.start.rok) * 12 + (12 - k.def.start.miesiac + 1);   // ostatni miesiąc kampanii w tym roku
      if (k.st.m <= koniecRoku && !k.koniec) continue;
      out.push({ id: `szkolenie_kierownika:${rok}`, wynik: k.flagi[`szkolenie_kierownika_${rok}`] ? 'spelniona' : 'naruszona', waga: 1, cel: 'E7', m: koniecRoku,
        opis: `Szkolenie kierownika podmiotu w ${rok} r.`, dlaczego: 'Obowiązek ustawowy raz w roku kalendarzowym, z osobistą odpowiedzialnością kierownika.' });
    }
    return out;
  },

  // ── SPRAWY Z KAMPANII: zasady z pliku kampanii (`zasady`, deklaratywnie — każda sprawa ma swoją) ──
  (k, h) => zasadyKampanii(k, h),
  (k, h) => {
    const u = k.flagi.wniosek_budzetowy;
    if (!u || u === 'tyle_co_rok') return [];
    // Wniosek budżetowy to czasownik `wniosek` w sprawie budżetowej kampanii (każda ją ma).
    const e = h.sprawy(x => x.v === 'wniosek')[0];
    return [{ id: 'budzet', wynik: u === 'straszenie' ? 'naruszona' : 'spelniona', waga: 1, cel: 'E1', m: e?.m ?? k.st.m,
      opis: 'Wniosek budżetowy oparty na ryzyku albo konkretnych potrzebach', dlaczego: 'Zarząd decyduje lepiej, gdy widzi ryzyko w złotówkach; straszenie bez danych kosztuje zaufanie.' }];
  },
  (k, h) => {
    if (!k.koniec) return [];
    return [{ id: 'plan_naprawczy', wynik: k.flagi.plan_naprawczy ? 'spelniona' : 'naruszona', waga: 1, cel: 'E7', m: k.st.m,
      opis: 'Przed audytem: lista luk z planem, właścicielami i terminami', dlaczego: 'Audytor widział setki firm z lukami. Plan z właścicielami to dowód, że system zarządzania działa.' }];
  },

  // ── DECYZJE CYKLICZNE (data/cykliczne.js): rzeczy, które wracają co roku ──
  (k) => [...k.cykl.wygasle.map(w => ({ id: `cert:${w.id}:${w.m}`, wynik: 'naruszona', waga: 1, cel: 'E12', m: w.m,
    opis: `Certyfikat / domena odnowione na czas (${w.id})`,
    dlaczego: w.zapomniany ? 'Bez ewidencji certyfikatów i domen nikt nie wie, co i kiedy wygasa — dowiadujesz się od klientów.'
      : 'Wygasły certyfikat to przestój z własnej winy; odnowienie to dwie godziny, automatyzacja — raz na zawsze.' })),
  ...k.cykl.odnowione.map(w => ({ id: `cert:${w.id}:${w.m}`, wynik: 'spelniona', waga: 1, cel: 'E12', m: w.m,
    opis: `Certyfikat / domena odnowione na czas (${w.id})`, dlaczego: w.auto ? 'Automatyzacja zamieniła coroczne ryzyko w brak problemu.' : 'Odnowione przed terminem.' }))],
  (k, h) => h.sprawy(e => e.sid === 'C_eol' && e.t !== 'sprawa_otwarta').map(e => {
    const ok = ['modernizuj', 'izoluj', 'wsparcie', 'akceptuj'].includes(e.v);
    return { id: `eol:${e.klucz}:${e.m}`, wynik: ok ? 'spelniona' : 'naruszona', waga: 2, cel: 'E4', m: e.m,
      opis: `Koniec wsparcia ma decyzję (${e.klucz})`,
      dlaczego: ok ? 'Wymiana, izolacja, płatne łatki albo świadoma akceptacja ryzyka przez zarząd — każda z nich to decyzja z właścicielem.'
        : 'System bez łatek „bo działa" to podatność, która zostaje otwarta na zawsze — i nikt jej nie przyjął na siebie.' };
  }),
  (k, h) => h.sprawy(e => e.sid === 'C_alerty' && e.t !== 'sprawa_otwarta').map(e => ({
    id: `alerty:${e.m}`, wynik: ['zatrudnij', 'mdr', 'strojenie'].includes(e.v) ? 'spelniona' : 'naruszona', waga: 1, cel: 'E3', m: e.m,
    opis: 'Proces obsługi alertów ma właściciela', dlaczego: 'Narzędzie, którego alertów nikt nie czyta, daje tylko poczucie bezpieczeństwa.' })),
  (k, h) => h.sprawy(e => e.sid === 'C_odnowienie' && e.t !== 'sprawa_otwarta').map(e => ({
    id: `odnowienie:${e.klucz}:${e.m}`, wynik: e.t === 'sprawa' ? 'spelniona' : 'naruszona', waga: 0.5, cel: 'E1', m: e.m,
    opis: `Odnowienie umowy to decyzja, nie automat (${e.klucz})`,
    dlaczego: 'Moment odnowienia to jedyna chwila, kiedy masz przewagę nad dostawcą: dowody z przeglądów, rabat, zmiana zakresu albo rezygnacja.' })),
  // Raport doradcy nie do szuflady: najważniejsza rekomendacja zrobiona w ciągu 3 miesięcy.
  (k, h) => h.H.filter(e => e.t === 'raport_doradcy' && e.top).flatMap(e => {
    const zrobione = h.H.find(x => x.m >= e.m && x.m <= e.m + 3 && x.t === e.top.t && (x.id === e.top.id || (e.top.t === 'sprawa' && x.id === e.top.id)));
    return doMiesiaca(k, `doradca:${e.temat}:${e.m}`, 'E1', 1, 'Najważniejsza rekomendacja doradcy wykonana w ciągu 3 miesięcy',
      'Zapłacony raport w szufladzie to najdroższy dokument w firmie — i dowód dla audytora, że o ryzyku wiedziano.', e.m + 3, zrobione?.m);
  }),
  // Limit pracy w toku: więcej niż pięć wdrożeń naraz to kolejka, nie program.
  (k, h) => (k.koniec && h.H.filter(e => e.t === 'ruch').length >= 12 ? [{ id: 'wip', wynik: (k.maxProjekty || 0) <= 5 ? 'spelniona' : 'naruszona', waga: 1, cel: 'E3', m: k.st.m,
    opis: 'Najwyżej pięć wdrożeń w toku naraz', dlaczego: 'Każdy projekt w toku zjada godziny koordynacji, a zespół traci czas na przełączanie się. Szybciej kończy ten, kto zaczyna mniej naraz.' }] : []),

  // ── LUDZIE: zespół nie jedzie na nadgodzinach ──
  // Tylko dla gracza, który w ogóle pracował — brak nadgodzin u bezczynnego to nie zasługa.
  (k, h) => (k.koniec && h.H.filter(e => e.t === 'ruch').length >= 12 ? [{ id: 'nadgodziny', wynik: (k.miesiaceNadgodzin || 0) <= 4 ? 'spelniona' : 'naruszona', waga: 1, cel: 'E3', m: k.st.m,
    opis: 'Najwyżej 4 miesiące na nadgodzinach w całej kampanii', dlaczego: 'Bezpieczeństwo robione nadgodzinami kończy się wypaleniem i odejściem jedynej osoby, która wie, jak to działa.' }] : []),

  // ── UCZCIWOŚĆ (−1, nie 0: nie tylko nie zdobywa punktów, ale zabiera je innym) ──
  (k) => k.klamstwa.map((l, i) => ({ id: `uczciwosc:${i}`, wynik: 'nieuczciwa', waga: 3, cel: 'E1', m: l.m,
    opis: `Nieuczciwość wobec: ${l.wobec}`, dlaczego: `„${l.tekst}". Kłamstwa nie da się naprawić później; po ujawnieniu traci się współpracę wszystkich.` })),
  (k, h) => {
    const out = [];
    for (const rok of [k.def.start.rok, k.def.start.rok + 1]) {
      const koniecRoku = (rok - k.def.start.rok) * 12 + (12 - k.def.start.miesiac + 1);
      if (k.st.m <= koniecRoku && !k.koniec) continue;
      const od = Math.max(1, koniecRoku - 11);
      const n = h.ruchy('raport_zarzadowi').filter(e => e.m >= od && e.m <= koniecRoku && e.p.styl === 'rzetelny').length;
      out.push({ id: `raporty:${rok}`, wynik: n >= 2 ? 'spelniona' : 'naruszona', waga: 1, cel: 'E1', m: koniecRoku,
        opis: `Co najmniej dwa rzetelne raporty dla zarządu w ${rok} r.`, dlaczego: 'Zarząd, który nie wie, nie może zaakceptować ryzyka ani dać budżetu — a odpowiada za oba.' });
    }
    return out;
  },
];

// Wszystkie oceny (kampania + incydenty).
function ocen(k, koniec = false) {
  const zachowaj = k.koniec;
  if (koniec) k.koniec = true;
  const h = pomocnik(k);
  const out = [];
  for (const z of ZASADY) out.push(...z(k, h));
  out.push(...(k.ocenyIncydentow || []));
  k.koniec = zachowaj;
  return out;
}

function jakoscPraktyki(oceny) {
  let s = 0, w = 0;
  for (const o of oceny) { s += o.waga * PKT[o.wynik]; w += o.waga; }
  return w ? Math.max(0, s / w) : 0;
}

module.exports = { ZASADY, PKT, KLUCZOWE, ocen, jakoscPraktyki, resztka, zasadyKampanii };
