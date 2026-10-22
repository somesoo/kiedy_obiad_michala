// ── S07 „Konto byłego zleceniobiorcy" w labie: SIEM + SOAR (model MSSP, docs/21-…) ──
// Ten sam incydent co S07-konto.incydent.js (silnik, zasady, debrief bez zmian). Ten plik mówi,
// co trafia do tenanta gracza: jakie logi widzi SIEM, jakie dokumenty dostaje sprawa w SOAR-ze,
// które akcje są playbookami i czego trzeba się dowiedzieć samemu.
//
// Czas: T+0 = start incydentu (w narracji poniedziałek 7:40; w labie chwila założenia sesji albo
// `start` od prowadzącego). Wypowiedzenie = T−65:40, wejścia sprawcy wieczorami przed T+0.
// Wszystko fikcyjne: urząd, ludzie, konta, hosty. Adresy IP z puli dokumentacyjnej (RFC 5737:
// 203.0.113.0/24, 198.51.100.0/24) — żaden log z gry nie wskaże prawdziwej sieci.
//
// Widoczność wynika z kampanii (docs/21-…, 21.4): SIEM/MDR → dzienniki przesyłane na bieżąco;
// bez nich leżą lokalnie na serwerach i trafiają do SIEM-a dopiero playbookiem „zbierz-dzienniki"
// — a dziennik kontrolera domeny wyczyszczony wcześniej jest stracony. EDR widzi polecenia
// sprawcy, ale nie alarmuje (martwe pole: insider z prawdziwymi uprawnieniami, data/kontrole.js).

const T_PT_7 = -72 - 40 / 60;            // piątek 7:00
const T_WYPOWIEDZENIE = -65 - 40 / 60;   // piątek 14:00
const DZIEN = 24;

const URZEDNICY = ['a.zak', 'j.brzezinska', 't.kos', 'm.lis', 'k.wrona', 'e.sowa', 'p.dudek', 'b.mazur', 'r.zajac', 'h.krol',
  'l.pawlak', 'g.sikora', 'w.baran', 'i.wilk', 'z.adamek', 'o.kubiak', 'n.czarnecka', 'd.bielecka', 's.gorska', 'u.lisowska'];
const DOMENA = 'UG-BRZOZOW';
const H = { dc: 'UG-DC01', rdp: 'UG-RDP01', fs: 'UG-FS01' };
const GRACZ = 'it.admin';

const norm = x => String(x || '').trim().toLowerCase().replace(/^.*\\/, '').replace(/@.*$/, '');
const godz = (L, t) => new Date(L.t0 + Math.round(t * 60) * 60000).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
// Format odpowiedzi „data godzina" w czasie polskim (taki, jak w pytaniu).
const dataGodz = (L, t) => new Date(L.t0 + Math.round(t * 60) * 60000).toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).slice(0, 16) + ' (czas polski)';
const kontoLubOpis = L => (L.ustalenia.konto_sprawcy ? L.dane.konto : '<konto sprawcy>');

// Zdarzenie w formacie zbliżonym do ECS (docs/21-…, 21.7). `klucz` = stabilny identyfikator,
// z którego lab liczy event.id (SIEM może deduplikować przy ponownym wysłaniu).
const ev = (klucz, t, zrodlo, host, kod, akcja, wynik, x = {}) => ({
  klucz, t, zrodlo, 'host.name': host, 'event.code': String(kod), 'event.action': akcja, 'event.outcome': wynik, ...x,
});
const logowanie = (klucz, t, host, user, typ, ip, x = {}) => ev(klucz, t, host === H.rdp ? 'rdp' : 'dc', host, 4624, 'logon', 'success',
  { 'user.name': user, 'user.domain': DOMENA, 'winlog.logon.type': typ, ...(ip ? { 'source.ip': ip } : {}), message: `Konto ${user} zalogowało się (typ ${typ})`, ...x });
const nieudane = (klucz, t, host, user, ip, status) => ev(klucz, t, host === H.rdp ? 'rdp' : 'dc', host, 4625, 'logon-failed', 'failure',
  { 'user.name': user, 'user.domain': DOMENA, ...(ip ? { 'source.ip': ip } : {}), 'winlog.event_data.Status': status, message: `Nieudane logowanie konta ${user}` });
const naKoncie = (klucz, t, kod, akcja, kto, cel, msg) => ev(klucz, t, 'dc', H.dc, kod, akcja, 'success',
  { 'user.name': kto, 'user.domain': DOMENA, 'user.target.name': cel, message: msg });
const proces = (klucz, t, kto, linia) => ev(klucz, t, 'edr', H.rdp, 'proces', 'process-start', 'success',
  { 'user.name': kto, 'process.name': linia.split(' ')[0], 'process.command_line': linia, message: 'Uruchomiono proces (bez alertu: brak reguły dla tego zachowania)' });
const zapora = (klucz, t, ip, wynik) => ev(klucz, t, 'fw', 'UG-FW01', 'ruch', wynik === 'allow' ? 'connection-allowed' : 'connection-denied', wynik === 'allow' ? 'success' : 'failure',
  { 'source.ip': ip, 'destination.port': 3389, 'destination.address': H.rdp, 'rule.name': wynik === 'allow' ? 'RDP-z-zewnatrz (tymczasowa, 2024)' : 'domyslna-odmowa', message: `Połączenie przychodzące na 3389 (${wynik})` });

// Wejście sprawcy: zapora (jeśli jest) → pulpit zdalny → kontroler domeny.
function wejscie(L, nazwa, t) {
  const { konto, ip } = L.dane;
  return [
    zapora(`${nazwa}:fw`, t - 1 / 60, ip, 'allow'),
    logowanie(`${nazwa}:rdp`, t, H.rdp, konto, 10, ip),
    logowanie(`${nazwa}:dc`, t + 1 / 60, H.dc, konto, 3, null, { 'source.address': H.rdp }),
  ];
}

module.exports = {
  id: 'S07',

  dane: rnd => {
    const r = n => Math.floor(rnd() * n);
    return {
      // Różne ziarna = różne odpowiedzi: gracze z jednego biura nie przepiszą od siebie flag.
      konto: ['adm.dkowalczyk', 'dkowalczyk.adm', 'admin.dkowalczyk', 'adm-dkowalczyk'][r(4)],
      ip: `203.0.113.${10 + r(230)}`,
      pierwsze_t: T_WYPOWIEDZENIE + 5 + r(4 * 60) / 60,          // piątek 19:00–23:00
      niedziela_t: -12 - 40 / 60 + r(3 * 60) / 60,               // niedziela ok. 19:00–22:00
      udzialy: ['Podatki', 'USC', ...(rnd() < 0.5 ? ['Inwestycje'] : [])],
      skanery: Array.from({ length: 6 }, () => `198.51.100.${1 + r(250)}`),
    };
  },

  // Gdzie żyją dzienniki — z kampanii gracza.
  widocznosc: ctx => {
    const przesyla = ctx.dziala('siem') || ctx.dziala('siem_os') || ctx.dziala('mdr');
    const lok = przesyla ? 'siem' : 'lokalnie';
    return { dc: lok, rdp: lok, fs: lok, edr: ctx.dziala('edr') ? 'siem' : 'brak', fw: ctx.dziala('ngfw') ? 'siem' : 'brak' };
  },

  // Szum tła: zwykły piątek w urzędzie, nocne kopie, skanery z internetu. Bez niego „szukanie"
  // byłoby czytaniem jedynych pięciu wierszy w SIEM-ie.
  tlo: (rnd, L) => {
    const z = [];
    URZEDNICY.forEach((u, i) => {
      const pc = `UG-PC${String(i + 1).padStart(2, '0')}`;
      const rano = T_PT_7 + (10 + rnd() * 50) / 60;
      z.push(logowanie(`tlo:pt:${u}:in`, rano, H.dc, u, 3, null, { 'source.address': pc }));
      if (rnd() < 0.25) z.push(nieudane(`tlo:pt:${u}:literowka`, rano - 1 / 60, H.dc, u, null, '0xC000006A'));
      z.push(ev(`tlo:pt:${u}:out`, T_PT_7 + 8 + rnd(), 'dc', H.dc, 4634, 'logoff', 'success', { 'user.name': u, 'user.domain': DOMENA, message: `Konto ${u} wylogowane` }));
    });
    for (let d = 0; d < 3; d++) z.push(logowanie(`tlo:kopie:${d}`, T_PT_7 + 15 + d * DZIEN, H.dc, 'svc.kopie', 5, null, { message: 'Konto usługi kopii zapasowych: zadanie nocne' }));
    L.dane.skanery.forEach((ip, i) => z.push(zapora(`tlo:skan:${i}`, T_PT_7 + rnd() * 72, ip, 'deny')));
    return z;
  },

  // Zdarzenia z prawdy incydentu (stan `s` z silnika). Funkcja czysta: lab liczy ją po każdym
  // ruchu i wydaje tylko to, co już się wydarzyło (t ≤ s.t) i co widać.
  zdarzenia: (s, L) => {
    const { konto, ip, udzialy } = L.dane;
    const z = [];
    if (s.proba) {
      // Konto wyłączone w piątek (JML/PAM albo wcześniejsza naprawa) — w poniedziałek tylko próby.
      z.push(naKoncie('proba:wylaczone', T_WYPOWIEDZENIE + 0.5, 4725, 'user-disabled', L.ma('jml') ? 'svc.jml' : GRACZ, konto, `Konto ${konto} wyłączone`));
      for (let i = 0; i < 8; i++) z.push(zapora(`proba:${i}:fw`, -0.1 + i * 0.1, ip, 'allow'), nieudane(`proba:${i}`, -0.1 + i * 0.1, H.rdp, konto, ip, '0xC0000072'));
      return z;
    }
    z.push(...wejscie(L, 'pt', L.dane.pierwsze_t));
    z.push(proces('pt:enum', L.dane.pierwsze_t + 0.2, konto, 'net.exe group "Domain Admins" /domain'));
    z.push(...wejscie(L, 'nd', L.dane.niedziela_t));
    z.push(proces('nd:eksport', L.dane.niedziela_t + 0.3, konto, 'powershell.exe Get-ADUser -Filter * | Export-Csv C:\\Users\\Public\\u.csv'));
    z.push(...wejscie(L, 'pn', -0.12));
    z.push(proces('pn:blokada', -0.06, konto, 'powershell.exe Get-ADUser -SearchBase "OU=Urzednicy" -Filter * | Disable-ADAccount'));
    URZEDNICY.forEach((u, i) => z.push(naKoncie(`blokada:${u}`, -0.05 + i * 0.002, 4725, 'user-disabled', konto, u, `Konto ${u} wyłączone`)));
    // Urzędnicy próbują się logować, dopóki konta nie wrócą.
    const odblokowane = !s.obsluga_stoi && s.kiedy.odblokuj_konta !== undefined ? s.kiedy.odblokuj_konta : Infinity;
    URZEDNICY.slice(0, 12).forEach((u, i) => { for (let j = 0; j < 3; j++) { const t = 0.08 + i * 0.03 + j * 0.4; if (t < odblokowane) z.push(nieudane(`pn:${u}:${j}`, t, H.dc, u, null, '0xC0000072')); } });
    if (s.odblokowano_h !== undefined) {
      URZEDNICY.forEach(u => z.push(naKoncie(`odbl1:${u}`, s.odblokowano_h, 4722, 'user-enabled', GRACZ, u, `Konto ${u} włączone`)));
      URZEDNICY.forEach(u => z.push(naKoncie(`blokada2:${u}`, s.ponowna_blokada_h, 4725, 'user-disabled', konto, u, `Konto ${u} wyłączone`)));
    }
    if (odblokowane !== Infinity && s.dostep_odebrany) URZEDNICY.forEach(u => z.push(naKoncie(`odbl:${u}`, odblokowane, 4722, 'user-enabled', GRACZ, u, `Konto ${u} włączone`)));
    if (s.dane_usuniete) {
      z.push(proces('kasowanie', s.usuniete_h - 0.02, konto, `powershell.exe Remove-Item \\\\${H.fs}\\{${udzialy.join(',')}} -Recurse -Force`));
      udzialy.forEach((d, i) => {
        for (let j = 0; j < 4; j++) z.push(ev(`kasowanie:${d}:${j}`, s.usuniete_h + i * 0.01 + j * 0.002, 'fs', H.fs, 4663, 'file-delete', 'success',
          { 'user.name': konto, 'user.domain': DOMENA, 'file.path': `D:\\Udzialy\\${d}\\${['2026', 'archiwum', 'decyzje', 'rejestr.xlsx'][j]}`, 'winlog.event_data.AccessMask': 'DELETE', message: 'Usunięto obiekt' }));
      });
    }
    if (s.logi_usuniete) z.push(naKoncie('czyszczenie', s.logi_usuniete_h, 1102, 'audit-log-cleared', konto, null, 'Dziennik inspekcji został wyczyszczony'));
    if (s.dostep_odebrany && s.kiedy.odbierz_dostep !== undefined) {
      const t = s.kiedy.odbierz_dostep;
      z.push(naKoncie('odebranie:haslo', t - 0.2, 4724, 'password-reset', GRACZ, konto, `Reset hasła konta ${konto}`));
      z.push(naKoncie('odebranie:konto', t, 4725, 'user-disabled', GRACZ, konto, `Konto ${konto} wyłączone`));
      // Sprawca próbuje wrócić co ~25 minut.
      for (let i = 1; i <= 40; i++) z.push(zapora(`powrot:${i}:fw`, t + i * 0.42, ip, 'allow'), nieudane(`powrot:${i}`, t + i * 0.42, H.rdp, konto, ip, '0xC0000072'));
    }
    return z;
  },

  // Widok gracza w labie: bez nazwiska konta, dopóki nie ustali go w SIEM-ie (w grze bez labu
  // widok S07 mówi to wprost — tam nie ma narzędzia, w którym można to sprawdzić).
  widok: (s, L) => {
    const kto = L.ustalenia.konto_sprawcy ? `konta ${L.dane.konto}` : 'jednego z kont administratora domeny (którego? — SIEM)';
    // Daty z zegara sesji (T+0 = chwila założenia sesji), nie „poniedziałek" na sztywno — muszą
    // się zgadzać z tym, co gracz widzi w SIEM-ie.
    const rano = godz(L, 0);
    if (s.proba) return [`${rano}. W urzędzie spokój. W sprawie w SOAR-ze: zgłoszenie z sekretariatu.`, '• Urząd pracuje normalnie [pewne]'];
    const l = [`${rano}. Nikt w urzędzie nie może się zalogować. Przy okienkach USC i podatków kolejka, telefon od wójta.`];
    l.push(`• Konta urzędników zablokowane z ${kto} [pewne]`);
    if (s.obsluga_stoi) l.push(`• Obsługa mieszkańców stoi od ${s.przestoj_h.toFixed(1)} h${s.papier ? ' (okienka działają na papierze)' : ''} [pewne]`);
    if (s.zablokowane_ponownie) l.push('• Konta odblokowane — i po godzinie zablokowane znowu [pewne]');
    if (s.dane_usuniete) l.push(`• Referaty zgłaszają, że zniknęły pliki na udziałach${s.dane_przywrocone ? ' — przywrócone z kopii' : ''} [pewne]`);
    if (s.dostep_odebrany && s.kiedy.odbierz_dostep !== undefined) l.push('• Konto sprawcy wyłączone, hasła administratorów zmienione [pewne]');
    l.push(L.widocznosc.dc === 'siem' ? '• Dzienniki serwerów płyną do SIEM-a [pewne]' : L.zebrane ? '• Dzienniki zebrane do SIEM-a [pewne]' : '• Dzienniki serwerów leżą lokalnie — w SIEM-ie ich nie ma [pewne]');
    return l;
  },

  // Dokumenty sprawy w SOAR-ze. Część istnieje tylko wtedy, gdy gracz ją wcześniej zbudował
  // (plan ciągłości, rejestr kopii) — w gminie bez BCP nikt nie wie, gdzie są druki.
  dokumenty: [
    { id: 'zgloszenie', tytul: 'Zgłoszenie z sekretariatu', rodzaj: 'zgloszenie', kiedy: () => true,
      tresc: (L, s) => (s.proba
        ? `${godz(L, 0.25)}, sekretariat (A. Żak): „Pan Darek dzwonił, że od rana nie może się zalogować z domu. Mówi, że to pilne, bo «ma coś do dokończenia». Czy to normalne, skoro umowa się skończyła?"`
        : `${godz(L, 0.2)}, sekretariat (A. Żak): „Nikt nie może się zalogować. «Konto wyłączone» u wszystkich w referatach podatków, USC i finansów. Kolejka do okienek. Wójt pyta, co się dzieje."`) },
    { id: 'wypowiedzenie', tytul: 'Wypowiedzenie umowy zlecenia nr 14/2025', rodzaj: 'dokument', kiedy: () => true,
      tresc: L => `Urząd Gminy Brzozów Wielki — Kadry.\nZleceniobiorca: Dariusz Kowalczyk (obsługa informatyczna, 2 dni w tygodniu).\nWypowiedzenie doręczone: ${godz(L, T_WYPOWIEDZENIE)}, ze skutkiem natychmiastowym (spór o rozliczenie godzin).\nUwagi kadr: „Proszę IT o odebranie dostępów" — wysłane mailem na it@ (skrzynka wspólna, w piątek po 15:00 nikt jej nie czytał).` },
    { id: 'plan_ciaglosci', tytul: 'Plan ciągłości działania — wyciąg: obsługa mieszkańców bez systemów', rodzaj: 'procedura', kiedy: (s, L) => L.ma('bcp'),
      tresc: () => 'Formularze papierowe: szafa 12 w sekretariacie (USC, podatki, dowody). Kto uruchamia: sekretarz gminy. Wpisy do systemów — w ciągu 3 dni roboczych od przywrócenia. Komunikat dla mieszkańców: wzór K-2.' },
    { id: 'rejestr_kopii', tytul: 'Rejestr kopii zapasowych (serwer plików)', rodzaj: 'dokument', kiedy: (s, L) => L.ma('backup'),
      tresc: L => `Ostatnia pełna kopia UG-FS01: ${godz(L, T_PT_7 + 15)} (svc.kopie), wynik: OK. Kopia offline: ${L.ma('backup') ? 'tak' : 'nie'}. Ostatni test odtworzenia: wg rejestru testów.` },
    { id: 'formularz_csirt', tytul: 'Wczesne ostrzeżenie do CSIRT — formularz', rodzaj: 'procedura', kiedy: s => !s.proba,
      tresc: () => 'Pola: podmiot, czas wykrycia, opis (co przestało działać), podejrzenie działania bezprawnego (tak/nie), wpływ transgraniczny (tak/nie), wskaźniki (konta, adresy IP), kontakt. Wyślij w ciągu 24 h od wykrycia.' },
    { id: 'eksport_kont', tytul: 'Eksport kont uprzywilejowanych i kont osób, które odeszły (AD)', rodzaj: 'eksport', kiedy: s => s.przeglad,
      tresc: L => [`${L.dane.konto} — Domain Admins — ${L.s.dostep_odebrany ? 'wyłączone' : 'AKTYWNE'}`, 'it.admin — Domain Admins — aktywne', 'a.nowicki (były sekretarz, odszedł 2025) — aktywne, poczta + obieg dokumentów',
        'svc.serwis1, svc.serwis2 (dostawca systemu podatkowego) — hasło niezmieniane od 2019', 'svc.kopie — Backup Operators — aktywne'].join('\n') },
  ],

  // Czego gracz dowiaduje się w SIEM-ie. Odpowiedź wpisuje sam (nie wybiera z listy).
  ustalenia: {
    konto_sprawcy: {
      pytanie: L => (L.s.proba ? 'Którym kontem próbowano się dziś logować?' : 'Z którego konta wyłączono konta urzędników?'),
      prawda: L => L.dane.konto,
      sprawdz: (odp, L) => norm(odp) === norm(L.dane.konto),
      po_ustaleniu: L => `Zgadza się: ${L.dane.konto}. Teraz wiesz, które konto wyłączyć playbookiem.`,
      podpowiedzi: [
        L => (L.s.proba ? 'Kto puka do drzwi, których już nie ma? Nieudane logowanie zapisuje, jakim kontem próbowano.' : 'Każde wyłączenie konta ma w dzienniku dwie osoby: tego, KOGO wyłączono, i tego, KTO to zrobił.'),
        L => `Dziennik zabezpieczeń ${L.s.proba ? `pulpitu zdalnego (${H.rdp}), nieudane logowania 4625` : `kontrolera domeny (${H.dc}), wyłączenia kont 4725`}.${L.widocznosc.dc === 'siem' || L.zebrane ? '' : ' W SIEM-ie ich nie ma, bo dzienniki nie są przesyłane — najpierw playbook „zbierz-dzienniki".'}`,
        L => (L.s.proba ? `Filtr: host.name = ${H.rdp}, event.code = 4625, od ${godz(L, -0.2)}; pole user.name.` : `Filtr: host.name = ${H.dc}, event.code = 4725, ${godz(L, -0.2)}–${godz(L, 0.1)}; pole user.name (wykonawca), nie user.target.name.`),
      ],
    },
    adres_zrodlowy: {
      pytanie: 'Z jakiego adresu IP łączył się sprawca?',
      prawda: L => L.dane.ip,
      sprawdz: (odp, L) => odp.trim() === L.dane.ip,
      podpowiedzi: [
        'Skąd przyszło połączenie z tym kontem? Logowanie zdalne zapisuje adres źródłowy.',
        L => `Logowania pulpitu zdalnego na ${H.rdp} (4624 z typem logowania 10, albo nieudane 4625)${L.widocznosc.fw === 'siem' ? ' — albo zapora: ruch przychodzący na port 3389' : ''}.`,
        L => `Filtr: host.name = ${H.rdp}, event.code = 4624 lub 4625, user.name = ${kontoLubOpis(L)}; pole source.ip.`,
      ],
    },
    pierwsze_wejscie: {
      kiedy: s => !s.proba,
      pytanie: 'Kiedy sprawca pierwszy raz wszedł do sieci po wypowiedzeniu umowy? (data i godzina, np. 2026-11-13 21:30)',
      prawda: L => dataGodz(L, L.dane.pierwsze_t),
      // Godzina w SIEM-ie bywa w UTC albo w czasie lokalnym — przyjmujemy obie, ±10 minut.
      sprawdz: (odp, L) => {
        const m = odp.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
        if (!m) return false;
        const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
        const prawda = L.t0 + Math.round(L.dane.pierwsze_t * 60) * 60000;
        return [0, 1, 2].some(off => Math.abs(utc - off * 3600000 - prawda) <= 10 * 60000);
      },
      podpowiedzi: [
        'Sprawca nie zaczął w poniedziałek. Kto ma klucze, ten zwykle wcześniej sprawdza, czy pasują.',
        L => `To samo konto i ten sam pulpit zdalny co dziś rano — tylko szukaj od doręczenia wypowiedzenia (${godz(L, T_WYPOWIEDZENIE)}).`,
        L => `Filtr: user.name = ${kontoLubOpis(L)}, event.code = 4624, od ${godz(L, T_WYPOWIEDZENIE)}; najwcześniejszy wynik.`,
      ],
    },
    usuniete_udzialy: {
      kiedy: s => s.dane_usuniete,
      pytanie: 'Które udziały sieciowe usunięto? (nazwy katalogów)',
      prawda: L => L.dane.udzialy.join(', '),
      sprawdz: (odp, L) => L.dane.udzialy.every(d => odp.toLowerCase().includes(d.toLowerCase())),
      podpowiedzi: [
        'Usuwanie plików zostawia ślad na serwerze plików, jeśli włączony jest audyt dostępu do obiektów.',
        L => `Serwer plików ${H.fs}: zdarzenia 4663 z prawem DELETE${L.widocznosc.edr === 'siem' ? ' — albo EDR: polecenie, które je usunęło' : ''}.`,
        L => `Filtr: host.name = ${H.fs}, event.code = 4663, user.name = ${kontoLubOpis(L)}; pole file.path — pierwszy katalog po D:\\Udzialy\\.`,
      ],
    },
  },

  // Akcje incydentu, które w labie robi się TYLKO playbookiem w SOAR-ze. Reszta (komunikat,
  // papier, wójt, zawiadomienie, RODO…) zostaje w grze — to decyzje ludzi, nie automatu.
  soar: {
    'wylacz-konto': { akcja: 'odbierz_dostep', opis: 'Wyłącza wskazane konto w AD, resetuje hasła administratorów domeny, zamyka pulpit zdalny z zewnątrz',
      pola: { konto: 'nazwa konta w AD (sAMAccountName)' },
      sprawdz: (p, L) => norm(p.konto) === norm(L.dane.konto),
      chybiony: (p, L) => `Wyłączono konto „${p.konto}"${URZEDNICY.includes(norm(p.konto)) ? ' — to konto urzędnika, nie sprawcy' : ''}. Blokady idą dalej: sprawca ma swoje konto.` },
    'zbierz-dzienniki': { akcja: 'zabezpiecz_logi', opis: `Zabezpiecza dzienniki ${H.dc}, ${H.rdp}, ${H.fs} z sumami kontrolnymi i wysyła je do SIEM-a`,
      po: L => { L.zebrane = { t: L.s.t, dc_wyczyszczony: !!L.s.logi_usuniete }; } },
    'odblokuj-konta': { akcja: 'odblokuj_konta', opis: 'Włącza konta urzędników z OU=Urzednicy i wymusza zmianę hasła' },
    'przeglad-kont-uprzywilejowanych': { akcja: 'przeglad_kont_wszystkich', opis: 'Eksport kont uprzywilejowanych i kont osób, które odeszły — wynik w sprawie jako dokument' },
    'przywroc-z-kopii': { akcja: 'przywroc_dane', opis: `Przywraca udziały ${H.fs} z ostatniej kopii` },
  },
};
