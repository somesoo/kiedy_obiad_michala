// ── LAB: incydent obsługiwany w zewnętrznym SIEM-ie i SOAR-ze (model MSSP) ──
// Projekt: docs/21-siem-soar-ctf.md. Każdy gracz to osobny tenant w SIEM-ie i SOAR-ze właściciela.
// W trakcie incydentu gra „wydaje" do jego tenanta:
//   • zdarzenia (logi) → SIEM: tylko te, które jego kontrole z kampanii naprawdę by zebrały,
//   • dokumenty sprawy → SOAR: zgłoszenie, umowy, procedury, eksporty — też zależne od kampanii,
// a gracz działa tam, gdzie działa SOC: część akcji incydentu wykonuje się WYŁĄCZNIE playbookiem
// w SOAR-ze (wraca do gry podpisanym wywołaniem HTTP), a wiedzę (konto sprawcy, adres, czas)
// zdobywa się w SIEM-ie i zgłasza jako ustalenie.
//
// Bez quizu: „wymagane" jest tylko to, GDZIE się coś robi, nie CZY i KIEDY. Kolejność dowolna,
// zegar incydentu płynie, bezczynność dalej toczy incydent (proto/incydent.js). Podpowiedzi są
// zawsze dostępne i kosztują czas na zegarze — jak telefon do kolegi z SOC.
//
// Silnik incydentu się nie zmienia: lab woła te same funkcje co gra (K.incydentAkcja itd.),
// więc zasady, wynik i debrief są te same. Sesja = parametry + lista operacji labu; wczytanie
// = odtworzenie (jak zapis kampanii), a strumień losowości labu jest osobny (k.rnd.* nietknięte).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const I = require('../proto/incydent');
const K = require('../proto/kampania');
const S = require('../proto/silnik');
const { przygotuj } = require('../proto/rozegraj');

// Drabina podpowiedzi (docs/21-…, 21.3): pytanie śledcze → źródło → filtr → odpowiedź. Minuty zegara.
const CENY_MIN = [10, 20, 45, 90];
const BLAD_MIN = 5;   // zła odpowiedź też kosztuje: inaczej zgadywanie adresów byłoby darmowe

function wczytajLab(id) {
  const dir = path.join(__dirname, '..', 'scenariusze');
  const plik = fs.readdirSync(dir).find(f => f.startsWith(id) && f.endsWith('.lab.js'));
  if (!plik) throw new Error(`Incydent ${id} nie ma wersji labu (scenariusze/${id}-*.lab.js)`);
  return require(path.join(dir, plik));
}

// Walidacja pliku labu: playbooki wskazują istniejące akcje, ustalenia mają pytanie, prawdę,
// trzy podpowiedzi i sprawdzenie; generatory są funkcjami.
function walidujLab(lab, inc = I.wczytaj(lab.id)) {
  const b = [];
  for (const f of ['dane', 'widocznosc', 'tlo', 'zdarzenia', 'widok']) if (typeof lab[f] !== 'function') b.push(`${f} musi być funkcją`);
  if (!Object.keys(lab.soar || {}).length) b.push('brak playbooków SOAR (soar)');
  for (const [id, pb] of Object.entries(lab.soar || {})) {
    if (!inc.akcje[pb.akcja]) b.push(`playbook ${id}: nieznana akcja incydentu „${pb.akcja}"`);
    if (!pb.opis) b.push(`playbook ${id}: brak opisu`);
    if (pb.pola && typeof pb.sprawdz !== 'function') b.push(`playbook ${id}: pola bez sprawdz(pola, L)`);
  }
  if (!Object.keys(lab.ustalenia || {}).length) b.push('brak ustaleń (ustalenia)');
  for (const [id, u] of Object.entries(lab.ustalenia || {})) {
    if (!u.pytanie || typeof u.prawda !== 'function' || typeof u.sprawdz !== 'function') b.push(`ustalenie ${id}: pytanie, prawda(L), sprawdz(odp, L)`);
    if ((u.podpowiedzi || []).length !== 3) b.push(`ustalenie ${id}: dokładnie 3 podpowiedzi (czwarty szczebel to odpowiedź)`);
  }
  for (const d of lab.dokumenty || []) if (!d.id || !d.tytul || typeof d.tresc !== 'function' || typeof d.kiedy !== 'function') b.push(`dokument ${d.id || '?'}: id, tytul, kiedy, tresc`);
  return b;
}

const skrot = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// ── SESJA ──
// p: { incydent, kampania?, seed, kontrole[], naprawione[], start (ISO: chwila T+0), tenant }
function nowaSesja(p) {
  const lab = wczytajLab(p.incydent);
  const bledy = walidujLab(lab);
  if (bledy.length) throw new Error(`Lab ${p.incydent} ma błędy:\n - ${bledy.join('\n - ')}`);
  const k = przygotuj(p.incydent, { seed: p.seed, kontrole: p.kontrole || [], naprawione: p.naprawione || [], ...(p.kampania ? { kampania: p.kampania } : {}) });
  const ctx = I.kontekst(k);
  // Osobny strumień: dane labu (konto, adres, godziny) i szum tła nie mogą przesunąć losowań silnika.
  const rnd = S.mulberry32((p.seed ^ 0x6c616221) >>> 0);
  const L = {
    p, k, lab, s: k.incydent.s, t0: Date.parse(p.start), ops: [], wynik: null,
    ustalenia: {}, podpowiedzi: {}, bledne: {}, chybione: 0, zebrane: null,
    wydaneZd: [], wydaneDok: [], idZd: new Set(),
  };
  if (Number.isNaN(L.t0)) throw new Error('start: nieprawidłowa data');
  L.dane = lab.dane(rnd, ctx);
  L.widocznosc = lab.widocznosc(ctx);
  L.ma = id => ctx.dziala(id);
  L.tlo = lab.tlo(rnd, L);
  wydaj(L);
  return L;
}

// Czas gry (godziny od T+0) → znacznik czasu dla SIEM-a.
const znacznik = (L, t) => new Date(L.t0 + Math.round(t * 60) * 60000).toISOString();

// Zdarzenie widoczne w SIEM-ie: źródło przesyłane na bieżąco albo zebrane playbookiem.
// Zebranie „włącza przekazywanie" od tej chwili (uproszczenie 🔵), ale dziennik wyczyszczony
// PRZED zebraniem jest stracony — tak jak w silniku (`dowody`).
function widoczne(L, z) {
  const w = L.widocznosc[z.zrodlo];
  if (w === 'siem') return true;
  if (w !== 'lokalnie' || !L.zebrane) return false;
  if (z.zrodlo === 'dc' && L.zebrane.dc_wyczyszczony && z.t <= L.zebrane.t) return false;
  return true;
}

// Wydanie nowych zdarzeń i dokumentów do tenanta gracza (po każdej operacji). Lista wydanych
// tylko rośnie — kursor SIEM-a i SOAR-a to po prostu długość listy.
function wydaj(L) {
  const s = L.s;
  const nowe = [...L.tlo, ...L.lab.zdarzenia(s, L)]
    .filter(z => z.t <= s.t + 1e-9 && widoczne(L, z) && !L.idZd.has(skrot(z.klucz)))
    .sort((a, b) => a.t - b.t || (a.klucz < b.klucz ? -1 : 1));
  for (const z of nowe) {
    const id = skrot(z.klucz);
    L.idZd.add(id);
    const { klucz, t, zrodlo, ...pola } = z;
    L.wydaneZd.push({ 'event.id': id, '@timestamp': znacznik(L, t), 'event.dataset': ZBIORY[zrodlo], ...pola });
  }
  for (const d of L.lab.dokumenty || []) {
    if (L.wydaneDok.some(x => x.id === d.id) || !d.kiedy(s, L)) continue;
    L.wydaneDok.push({ id: d.id, tytul: d.tytul, rodzaj: d.rodzaj || 'dokument', czas: znacznik(L, s.t), tresc: d.tresc(L, s) });
  }
}
const ZBIORY = { dc: 'windows.security', rdp: 'windows.security', fs: 'windows.security', edr: 'edr.proces', fw: 'zapora' };

const blad = (tekst, kod = 409) => Object.assign(new Error(tekst), { niedostepny: true, kod });
function trwa(L) { if (!L.k.incydent) throw blad('incydent jest już zakończony'); }
function poRuchu(L, r) {
  if (r?.koniec) L.wynik = r.koniec;
  wydaj(L);
  return r;
}
const czekajMin = (L, min) => poRuchu(L, K.incydentCzekaj(L.k, min / 60));

// ── OPERACJE (każda trafia do L.ops — odtworzenie sesji to ich ponowne wykonanie) ──
const OPERACJE = {
  // Akcja „w grze" (rozmowa z wójtem, komunikat, tryb papierowy…). Akcje z playbookiem — tylko w SOAR-ze.
  akcja(L, { akcja }) {
    trwa(L);
    const pb = Object.entries(L.lab.soar).find(([, x]) => x.akcja === akcja);
    if (pb) throw blad(`To robisz w SOAR-ze: playbook „${pb[0]}" (${pb[1].opis}).`);
    const r = poRuchu(L, K.incydentAkcja(L.k, akcja));
    return { tekst: r.tekst };
  },
  czekaj(L, { h }) {
    trwa(L);
    if (!(h > 0 && h <= 24)) throw blad('czekać można od kilku minut do 24 h', 400);
    return { tekst: poRuchu(L, K.incydentCzekaj(L.k, h)).tekst };
  },
  koniec(L) {
    trwa(L);
    poRuchu(L, { koniec: K.incydentZakoncz(L.k) });
    return { tekst: 'Koniec fazy ostrej.' };
  },
  // Ustalenie z SIEM-a: gracz wpisuje, co znalazł (nie wybiera z listy). Serwer porównuje z prawdą
  // i niczego o niej nie zdradza poza „zgadza się / nie zgadza się".
  ustalenie(L, { id, odpowiedz }) {
    trwa(L);
    const u = L.lab.ustalenia[id];
    if (!u || (u.kiedy && !u.kiedy(L.s, L))) throw blad('nie ma takiego pytania w tym incydencie', 404);
    if (L.ustalenia[id]) throw blad('już ustalone');
    if (typeof odpowiedz !== 'string' || !odpowiedz.trim() || odpowiedz.length > 300) throw blad('odpowiedź: krótki tekst', 400);
    if (u.sprawdz(odpowiedz, L)) {
      L.ustalenia[id] = { t: L.s.t, podpowiedzi: L.podpowiedzi[id] || 0 };
      wydaj(L);
      return { zgadza: true, tekst: u.po_ustaleniu ? u.po_ustaleniu(L) : 'Zgadza się.' };
    }
    L.bledne[id] = (L.bledne[id] || 0) + 1;
    czekajMin(L, BLAD_MIN);
    return { zgadza: false, tekst: `Nie zgadza się (−${BLAD_MIN} min na sprawdzanie fałszywego tropu).` };
  },
  podpowiedz(L, { id }) {
    trwa(L);
    const u = L.lab.ustalenia[id];
    if (!u || (u.kiedy && !u.kiedy(L.s, L))) throw blad('nie ma takiego pytania w tym incydencie', 404);
    if (L.ustalenia[id]) throw blad('już ustalone');
    const n = L.podpowiedzi[id] || 0;
    if (n >= CENY_MIN.length) throw blad('więcej podpowiedzi nie ma');
    L.podpowiedzi[id] = n + 1;
    czekajMin(L, CENY_MIN[n]);
    if (n < 3) { const x = u.podpowiedzi[n]; return { szczebel: n + 1, tekst: typeof x === 'function' ? x(L) : x }; }
    // Czwarty szczebel: odpowiedź. Ustalenie się zapisuje, ale jako podane, nie znalezione.
    L.ustalenia[id] = { t: L.s.t, podpowiedzi: 4, podane: true };
    wydaj(L);
    return { szczebel: 4, tekst: `Odpowiedź: ${u.prawda(L)}` };
  },
  // Playbook z SOAR-a (wywołanie podpisane — sprawdza serwer). Zły cel = czas mija, nic się nie dzieje.
  soar(L, { playbook, pola = {} }) {
    trwa(L);
    const pb = L.lab.soar[playbook];
    if (!pb) throw blad(`nieznany playbook „${playbook}"`, 404);
    const powod = I.dostepnaAkcja(L.k, pb.akcja);
    if (powod) return { ok: false, tekst: powod };
    if (pb.sprawdz && !pb.sprawdz(pola, L)) {
      L.chybione++;
      czekajMin(L, L.k.incydent.def.akcje[pb.akcja].czas_h * 60);
      return { ok: false, tekst: pb.chybiony ? pb.chybiony(pola, L) : 'Playbook wykonany, ale nie na tym celu — nic się nie zmieniło.' };
    }
    const r = K.incydentAkcja(L.k, pb.akcja);
    pb.po?.(L);
    poRuchu(L, r);
    return { ok: true, tekst: r.tekst };
  },
};

function wykonaj(L, op, dane = {}) {
  const f = OPERACJE[op];
  if (!f) throw blad(`nieznana operacja ${op}`, 400);
  const r = f(L, dane);
  L.ops.push({ op, ...dane });
  return r;
}

// Odtworzenie: te same parametry i operacje = ten sam stan, te same wydane zdarzenia i dokumenty.
function odtworz(p, ops) {
  const L = nowaSesja(p);
  for (const o of ops) {
    const { op, ...dane } = o;
    try { wykonaj(L, op, dane); } catch (e) { if (!e.niedostepny) throw e; L.ops.push(o); }
  }
  return L;
}

// ── WIDOKI ──
// Dla gracza: co wie (mgła wojny — bez prawdy silnika i bez odpowiedzi na ustalenia).
function stan(L) {
  const k = L.k, inc = k.incydent;
  const s = L.s, def = I.wczytaj(L.p.incydent);
  const playbook = id => Object.entries(L.lab.soar).find(([, x]) => x.akcja === id)?.[0] || null;
  const out = {
    incydent: { id: def.id, tytul: def.tytul }, tenant: L.p.tenant, t: s.t, czas: znacznik(L, s.t),
    widok: L.lab.widok(s, L),
    zegary: inc ? I.zegary(inc) : [],
    akcje: inc ? I.akcje(k).map(a => ({ ...a, kanal: playbook(a.id) ? 'soar' : 'gra', playbook: playbook(a.id) })) : [],
    ustalenia: Object.entries(L.lab.ustalenia).filter(([, u]) => !u.kiedy || u.kiedy(s, L)).map(([id, u]) => ({
      id, pytanie: typeof u.pytanie === 'function' ? u.pytanie(L) : u.pytanie, ustalone: !!L.ustalenia[id], podane: !!L.ustalenia[id]?.podane,
      podpowiedzi: L.podpowiedzi[id] || 0, nastepna_podpowiedz_min: CENY_MIN[L.podpowiedzi[id] || 0] ?? null,
    })),
    siem: { zdarzen: L.wydaneZd.length }, soar: { dokumentow: L.wydaneDok.length },
    koniec: null,
  };
  if (L.wynik) {
    const w = L.wynik;
    out.koniec = {
      tytul: w.tytul, opis: w.opis,
      oceny: w.oceny.map(o => ({ wynik: o.wynik, opis: o.opis, dlaczego: o.dlaczego })),
      debrief: w.def.debrief, lab: podsumowanie(L),
    };
  }
  return out;
}

// Statystyka labu do debriefu (dla trenera) — NIE wchodzi w Wynik: oceniają zasady incydentu.
function podsumowanie(L) {
  const u = Object.keys(L.lab.ustalenia).filter(id => !L.lab.ustalenia[id].kiedy || L.lab.ustalenia[id].kiedy(L.s, L));
  const znalezione = u.filter(id => L.ustalenia[id] && !L.ustalenia[id].podane);
  const minPodp = Object.values(L.podpowiedzi).reduce((a, n) => a + CENY_MIN.slice(0, n).reduce((x, y) => x + y, 0), 0);
  return {
    ustalenia: `${znalezione.length}/${u.length} znalezione samodzielnie lub z podpowiedzią` + (u.length - znalezione.length ? `, ${u.filter(id => L.ustalenia[id]?.podane).length} podane` : ''),
    podpowiedzi: Object.values(L.podpowiedzi).reduce((a, n) => a + n, 0), podpowiedzi_min: minPodp,
    bledne_odpowiedzi: Object.values(L.bledne).reduce((a, n) => a + n, 0),
    playbooki_na_zly_cel: L.chybione,
    zdarzen_w_siem: L.wydaneZd.length, dokumentow: L.wydaneDok.length,
    dzienniki: L.widocznosc.dc === 'siem' ? 'przesyłane do SIEM-a na bieżąco' : L.zebrane ? `zebrane playbookiem po ${L.zebrane.t.toFixed(1)} h${L.zebrane.dc_wyczyszczony ? ' — dziennik kontrolera domeny był już wyczyszczony' : ''}` : 'nie trafiły do SIEM-a',
  };
}

// Dla SOAR-a: katalog playbooków (nazwa, opis, pola) — bez stanu gry.
const playbooki = L => Object.entries(L.lab.soar).map(([id, x]) => ({ id, opis: x.opis, pola: x.pola || {} }));

module.exports = { wczytajLab, walidujLab, nowaSesja, wykonaj, odtworz, stan, podsumowanie, playbooki, CENY_MIN, BLAD_MIN, OPERACJE };
