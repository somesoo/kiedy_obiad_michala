// ── S01 „Faktura z nowym numerem konta" — incydent bez drzewa decyzji ──
// Opis do czytania: S01-faktura-z-nowym-numerem.md. Format: proto/incydent.js (nagłówek).
// Gracz robi, co chce i w jakiej kolejności chce; czas płynie z każdą akcją. Ocena —
// zasady na końcu pliku, nie etykiety akcji.
//
// Skąd liczby (🔵 uproszczenia gry, docs/02-…): szansa zablokowania środków u odbiorcy maleje
// wykładniczo z czasem od wykrycia (połowa w ~2 h) — w praktyce liczy się pierwsza godzina;
// mail do przejętej skrzynki ostrzega sprawcę (szybciej wyprowadza środki).

// Kwota i opis kontrahenta przychodzą z pliku kampanii (`warianty.S01`); domyślnie Wodnik.
const KWOTA = 92300;

module.exports = {
  id: 'S01',
  tytul: 'Faktura z nowym numerem konta',
  cele: ['E2', 'E6', 'E10'],
  limit_h: 72,

  start: ctx => {
    // Procedura płatności działa — chyba że ma ukrytą usterkę „wyjątek przy pilnych płatnościach".
    // Procedura płatności działa — kontrolą z katalogu albo uzgodnionym w kampanii zwyczajem
    // (gmina: kontrasygnata skarbnika rozszerzona o sprawdzenie rachunku).
    const procedura = ctx.dziala('weryfikacja_platnosci') || !!ctx.flaga('weryfikacja_rachunku');
    const zawiodla = procedura && ctx.usterka('weryfikacja_platnosci', 'wyjatek_pilne') && ctx.rnd() < 0.5;
    // Nasza skrzynka też bywa przejęta (dług „brak MFA" w co trzeciej kampanii).
    const naszaPrzejeta = ctx.rnd() < (ctx.dziala('mfa') ? 0.08 : 0.35);
    const w = ctx.wariant;
    return {
      kwota: w.kwota ?? KWOTA, kontrahent: w.kontrahent ?? 'kontrahent', placi: w.placi ?? 'Księgowa',
      udaremnione: procedura && !zawiodla, procedura_zawiodla: zawiodla,
      odzysk: 0, bank_h: null, sprawca_ostrzezony: false, dowody: true, zawiadomienie: false,
      kontrahent_ostrzezony: false, nasza_przejeta: naszaPrzejeta, nasza_sprawdzona: false, nasza_zabezpieczona: false,
      uodo_h: null, cert: false, szukanie_winnych_h: null, zwolnienie: false, procedura_obiecana: false, pochwala: false,
    };
  },

  widok: s => {
    const l = [];
    if (s.udaremnione) {
      l.push(`${s.placi} oddzwoniła na numer z kartoteki — ${s.kontrahent} zaprzeczył zmianie rachunku. Przelew NIE wyszedł.`);
      l.push('• Skrzynka kontrahenta jest prawdopodobnie przejęta [prawdopodobne]');
    } else {
      l.push(`Poniedziałek 9:10. Dzwoni ${s.kontrahent}: płatność nie wpłynęła. ${s.placi} zapłaciła w środę „na nowy rachunek, który przysłaliście". Odpowiedź: „Nie zmienialiśmy rachunku".`);
      if (s.procedura_zawiodla) l.push('• Procedura oddzwaniania istnieje, ale „przelew był pilny" — nikt nie oddzwonił [pewne]');
      l.push(`• Przelew ${s.kwota.toLocaleString('pl-PL')} zł wyszedł 5 dni temu na rachunek w innym banku [pewne]`);
      l.push(s.bank_h !== null ? `• Bank przyjął zgłoszenie (T+${s.bank_h.toFixed(1)} h) i prosi o zawiadomienie o przestępstwie [pewne]` : '• Szansa zablokowania środków u odbiorcy maleje z każdą godziną [pewne]');
      l.push('• Skrzynka kontrahenta jest przejęta [prawdopodobne]');
    }
    l.push(s.nasza_sprawdzona ? (s.nasza_przejeta ? `• NASZA skrzynka też była przejęta (reguła przekazywania do obcego adresu)${s.nasza_zabezpieczona ? ' — zabezpieczona' : ''} [pewne]` : '• Nasze skrzynki są czyste [pewne]')
      : '• Czy nasza skrzynka jest przejęta [nie wiadomo]');
    if (!s.dowody) l.push('• Feralny mail usunięty — nagłówków już nie ma [pewne]');
    return l;
  },

  zegary: [
    { id: 'bank', nazwa: 'Bank: szansa zatrzymania środków (połowa w ~2 h)', od: s => (s.udaremnione || s.bank_h !== null ? null : 0), godzin: 24 },
    { id: 'rodo', nazwa: 'RODO: 72 h na zgłoszenie naruszenia do UODO', od: s => (s.nasza_sprawdzona && s.nasza_przejeta && s.uodo_h === null ? s.kiedy.przeglad_skrzynek : null), godzin: 72 },
  ],

  akcje: {
    bank: {
      nazwa: 'Telefon do banku: zgłoszenie oszustwa, prośba o blokadę środków u odbiorcy', czas_h: 0.25, h: 0.5,
      dostepna: s => (s.udaremnione ? 'przelew nie wyszedł' : null),
      efekt: s => {
        s.bank_h = s.t;
        s.odzysk = 0.55 * Math.exp(-s.t / 3) * (s.sprawca_ostrzezony ? 0.3 : 1);
        return s.odzysk > 0.3 ? 'Bank zdążył: blokada części środków u odbiorcy.' : s.odzysk > 0.05 ? 'Bank próbuje — część środków już wyprowadzona.' : 'Bank przyjął zgłoszenie. Środki są już prawdopodobnie daleko.';
      },
    },
    mail_kontrahent: {
      nazwa: 'Napisać maila do kontrahenta z prośbą o wyjaśnienie', czas_h: 0.2, h: 0.2,
      efekt: s => { s.sprawca_ostrzezony = true; return 'Wysłane. Odpowiedź przychodzi szybko i jest bardzo uspokajająca…'; },
    },
    telefon_kontrahent: {
      nazwa: 'Telefon do kontrahenta na numer z kartoteki (nie z maila)', czas_h: 0.5, h: 0.5,
      efekt: s => { s.kontrahent_ostrzezony = true; return 'Kontrahent potwierdza: ich skrzynka jest przejęta. Odcinają przestępcę i ostrzegają innych klientów.'; },
    },
    zawiadomienie: {
      nazwa: 'Zawiadomienie o przestępstwie (policja) + eksport maili z nagłówkami', czas_h: 2, h: 3,
      efekt: s => { s.zawiadomienie = true; if (s.bank_h !== null && s.dowody) s.odzysk = Math.min(0.6, s.odzysk + 0.05); return s.dowody ? 'Zawiadomienie z kompletem dowodów — bank i policja mają z czym pracować.' : 'Zawiadomienie złożone, ale bez nagłówków maila dowody są słabe.'; },
    },
    usun_mail: {
      nazwa: 'Usunąć feralny mail ze skrzynek, żeby nikt więcej się nie nabrał', czas_h: 0.1, h: 0.1,
      efekt: s => { s.dowody = false; return 'Mail usunięty.'; },
    },
    zebranie: {
      nazwa: 'Zebranie z księgową i kierownictwem: ustalmy, czyja to wina', czas_h: 2, h: 4,
      efekt: s => { s.szukanie_winnych_h = s.t; return 'Dwie godziny rozmowy. Księgowa płacze, kierownictwo szuka winnego.'; },
    },
    przeglad_skrzynek: {
      nazwa: 'Przegląd naszych skrzynek: logowania, reguły przekazywania, aplikacje z dostępem', czas_h: 3, h: 5,
      efekt: s => { s.nasza_sprawdzona = true; return s.nasza_przejeta ? 'Jest: reguła przekazywania maili z „faktura" na obcy adres w skrzynce księgowej. Przestępca czytał NASZ wątek.' : 'Nasze skrzynki są czyste — wiedzę miał ze skrzynki kontrahenta.'; },
    },
    zabezpiecz_skrzynki: {
      nazwa: 'Zabezpieczyć skrzynki: reset haseł, usunięcie reguł i sesji, MFA dla finansów od dziś', czas_h: 1, h: 2,
      dostepna: s => (!s.nasza_sprawdzona ? 'nie wiesz jeszcze, czy coś jest do zabezpieczenia' : !s.nasza_przejeta ? 'skrzynki są czyste' : null),
      efekt: s => { s.nasza_zabezpieczona = true; return 'Przestępca odcięty od naszej poczty.'; },
    },
    zgloszenie_uodo: {
      nazwa: 'Zgłoszenie naruszenia ochrony danych do UODO (dane kontrahentów w przejętej skrzynce)', czas_h: 1, h: 2,
      dostepna: s => (!s.nasza_sprawdzona || !s.nasza_przejeta ? 'nie wiesz o naruszeniu po naszej stronie' : null),
      efekt: s => { s.uodo_h = s.t; return 'Zgłoszenie wysłane.'; },
    },
    zgloszenie_cert: {
      nazwa: 'Zgłoszenie do CERT Polska (incydent.cert.pl) — rachunek „słupa" i adres nadawcy', czas_h: 0.5, h: 1,
      efekt: s => { s.cert = true; return 'Zgłoszone; rachunek trafi na listy ostrzeżeń.'; },
    },
    procedura: {
      nazwa: 'Rozmowa z kierownictwem: to błąd organizacji — procedura płatności i szkolenie finansów, bez szukania winnych', czas_h: 1, h: 2,
      efekt: s => { s.procedura_obiecana = true; return 'Kierownictwo się zgadza. Księgowa sama zgłasza się do pomocy przy procedurze.'; },
    },
    zwolnienie: {
      nazwa: 'Zgodzić się na zwolnienie dyscyplinarne księgowej', czas_h: 0.5, h: 0.5,
      efekt: s => { s.zwolnienie = true; return 'Decyzja zapadła. Reszta działu patrzy w podłogę.'; },
    },
    pochwala: {
      nazwa: 'Pochwalić księgową przy zespole (zatrzymała przelew)', czas_h: 0.2, h: 0.2,
      dostepna: s => (s.udaremnione ? null : 'nie ma za co chwalić — przelew wyszedł'),
      efekt: s => { s.pochwala = true; return 'Zespół widzi, że zgłaszanie się opłaca.'; },
    },
  },

  dynamika: () => {},
  koniec: () => false,

  wynik: s => {
    const strata = s.udaremnione ? 0 : Math.round(s.kwota * (1 - s.odzysk));
    const tytul = s.udaremnione ? 'Udaremnione' : s.odzysk > 0.3 ? 'Odzyskane częściowo' : 'Strata';
    const skutki = {
      pln: strata,
      mandat: s.udaremnione ? 2 : s.procedura_obiecana ? 1 : -4,
      reputacja: s.udaremnione ? 0 : -2,
      morale: (s.szukanie_winnych_h !== null ? -5 : 0) + (s.zwolnienie ? -15 : 0) + (s.pochwala ? 5 : 0),
      flagi: { bec_udaremniony: s.udaremnione, procedura_po_bec: s.procedura_obiecana, rodo_niezgloszone: s.nasza_przejeta && s.nasza_sprawdzona && s.uodo_h === null },
      dzial: { finanse: { swiadomosc: s.udaremnione ? 0.15 : 0.3, zaufanie: (s.procedura_obiecana || s.pochwala ? 0.1 : 0) - (s.zwolnienie ? 0.2 : 0) - (s.szukanie_winnych_h !== null ? 0.05 : 0) } },
      // Przestępca, który został w naszej skrzynce, wróci z kolejnym „nowym rachunkiem".
      wektory: s.nasza_przejeta && !s.nasza_zabezpieczona ? { bec: 1.4 } : {},
    };
    return { tytul, opis: s.udaremnione ? 'Procedura zadziałała. Najtańsza wygrana w grze.' : `Strata ${strata.toLocaleString('pl-PL')} zł${s.odzysk > 0 ? `, odzyskano ok. ${Math.round(100 * s.odzysk)}%` : ''}.`, skutki };
  },

  zasady: [
    { id: 'bank_w_godzine', cel: 'E2', waga: 3, opis: 'Bank w ciągu godziny od wykrycia',
      dlaczego: 'Pierwsza godzina należy do banku — szansa zatrzymania środków spada z każdą godziną.',
      ocen: s => (s.udaremnione ? null : s.bank_h !== null && s.bank_h <= 1 ? 'spelniona' : 'naruszona') },
    { id: 'nie_ostrzegaj_sprawcy', tylko_gdy_dzialal: true, cel: 'E2', waga: 2, opis: 'Bez maila do przejętej skrzynki',
      dlaczego: 'Przejętą skrzynkę czyta przestępca — wie, że go wykryto, i szybciej wyprowadza środki.',
      ocen: s => (s.sprawca_ostrzezony ? 'naruszona' : 'spelniona') },
    { id: 'dowody', cel: 'E6', waga: 1, opis: 'Dowody zachowane, zawiadomienie złożone',
      dlaczego: 'Bez nagłówków policja i bank mają mniej do pracy, a ubezpieczyciel może odmówić.',
      ocen: s => (s.udaremnione ? null : s.dowody && s.zawiadomienie ? 'spelniona' : 'naruszona') },
    { id: 'wlasne_skrzynki', cel: 'E2', waga: 2, opis: 'Własne skrzynki sprawdzone w ciągu doby',
      dlaczego: 'Jeśli nasza skrzynka też jest przejęta, to naruszenie RODO i kolejne oszustwa za tydzień.',
      ocen: s => (s.nasza_sprawdzona && s.kiedy.przeglad_skrzynek <= 24 ? 'spelniona' : 'naruszona') },
    { id: 'rodo_72h', cel: 'E6', waga: 2, opis: 'Naruszenie po naszej stronie zgłoszone do UODO w 72 h',
      dlaczego: 'RODO: 72 h od stwierdzenia naruszenia. Spóźnione zgłoszenie to osobne naruszenie.',
      ocen: s => (!(s.nasza_sprawdzona && s.nasza_przejeta) ? null : s.uodo_h !== null && s.uodo_h - s.kiedy.przeglad_skrzynek <= 72 ? 'spelniona' : 'naruszona') },
    { id: 'bez_szukania_winnych', tylko_gdy_dzialal: true, cel: 'E10', waga: 2, opis: 'Najpierw ratowanie, potem przyczyny — bez kozła ofiarnego',
      dlaczego: 'Szukanie winnych przed ratowaniem pieniędzy kosztuje godziny. Zwolnienie uczy wszystkich ukrywać błędy.',
      ocen: s => (s.zwolnienie || (s.szukanie_winnych_h !== null && (s.bank_h === null || s.szukanie_winnych_h < s.bank_h)) ? 'naruszona' : 'spelniona') },
    { id: 'kontrahent', cel: 'E8', waga: 1, opis: 'Kontrahent ostrzeżony innym kanałem',
      dlaczego: 'Kontrahent zabezpieczy skrzynkę — inni jego klienci nie zapłacą.',
      ocen: s => (s.kontrahent_ostrzezony ? 'spelniona' : 'naruszona') },
    { id: 'lekcja_dla_organizacji', cel: 'E2', waga: 1, opis: 'Wniosek systemowy (procedura) albo pochwała tam, gdzie zadziałała',
      dlaczego: 'Osoba, która się pomyliła albo zatrzymała przelew, jest najlepszym ambasadorem procedury.',
      ocen: s => (s.udaremnione ? (s.pochwala ? 'spelniona' : 'naruszona') : s.procedura_obiecana ? 'spelniona' : 'naruszona') },
  ],

  // ── Dla laboratoriów i testów (gracz tego nie widzi; to nie są oceny akcji) ──
  // wzorcowo: jak prowadzi doświadczony praktyk; laik: dobre intencje, zła kolejność.
  // odstepstwa: typowe błędy — cennik (proto/cennik.js) liczy, ile kosztują w dobrej grze.
  kampania: 'wodociagi',
  automaty: {
    wzorcowo: s => (s.udaremnione ? ['telefon_kontrahent', 'zgloszenie_cert', 'pochwala', 'przeglad_skrzynek', 'zabezpiecz_skrzynki', 'zgloszenie_uodo']
      : ['bank', 'telefon_kontrahent', 'zawiadomienie', 'przeglad_skrzynek', 'zabezpiecz_skrzynki', 'zgloszenie_uodo', 'zgloszenie_cert', 'procedura']),
    laik: () => ['zebranie', 'bank', 'przeglad_skrzynek', 'procedura'],
  },
  odstepstwa: {
    'mail do przejętej skrzynki': plan => ['mail_kontrahent', ...plan],
    'najpierw szukanie winnych': (plan, s) => (s.udaremnione ? plan : ['zebranie', ...plan]),
  },

  debrief: [
    'Mail przyszedł z prawdziwego adresu kontrahenta, w prawdziwym wątku — żaden filtr tego nie zatrzyma.',
    'Zatrzymuje to wyłącznie procedura poza pocztą: oddzwonienie na znany numer, biała lista VAT, druga osoba.',
    'Procedura, która „przy pilnych" się pomija, nie jest procedurą — test socjotechniczny pokazuje to przed przestępcą.',
    'Szansa odzyskania pieniędzy liczy się w godzinach — bank jest pierwszym telefonem.',
    'Osoba, która się pomyliła, jest najlepszym świadkiem i przyszłym ambasadorem procedury.',
  ],
};
