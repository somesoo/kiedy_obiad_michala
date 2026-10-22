// ── SERWER LABU: gra ↔ SIEM i SOAR właściciela (model MSSP, docs/21-…) ──
// Jeden proces, wiele sesji: każda sesja = jeden gracz = jeden tenant w SIEM-ie i SOAR-ze.
//
//   gracz (lab/gracz.js)  ── Bearer <token gracza> ──▶  /gra/*          stan, akcje „w grze", ustalenia, podpowiedzi
//   SIEM                  ── Bearer LAB_SIEM_TOKEN ──▶  /siem/:sesja/zdarzenia?po=N   (NDJSON, pobieranie)
//   SOAR                  ── podpis HMAC ───────────▶  /soar/:sesja/{dokumenty,playbooki,playbook}
//   trener / admin        ── Bearer LAB_ADMIN_TOKEN ─▶  /admin/sesje
//   generator logów       ── Bearer LAB_GEN_TOKEN ───▶  /generator/:sesja/{scenariusz,przebieg}   (opcjonalnie)
//   gra ──▶ SIEM/SOAR/generator (opcjonalnie, wypychanie): LAB_SIEM_PUSH_URL, LAB_SOAR_PUSH_URL, LAB_GEN_PUSH_URL
//           ({tenant} w adresie), podpis LAB_PUSH_SECRET
//   flaga wyniku dla kampanii gracza: podpis Ed25519 kluczem LAB_KLUCZ_PRYWATNY (plik PEM, docs/21-…, 21.11)
//
// Gra o bezpieczeństwie musi być bezpieczna (CLAUDE.md): sekrety tylko ze zmiennych środowiska,
// bez wartości domyślnych (serwer bez nich nie wstanie), tokeny graczy trzymane jako skrót,
// porównania w stałym czasie, podpis SOAR-a z oknem czasu i ochroną przed powtórzeniem,
// limit wielkości ciała i liczby żądań, nasłuch domyślnie tylko na 127.0.0.1 (TLS robi reverse proxy).
//   LAB_ADMIN_TOKEN=… LAB_SIEM_TOKEN=… LAB_SOAR_SECRET=… node ciso-sim/lab/serwer.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LAB = require('./lab');

const MAX_CIALO = 16 * 1024;
const MAX_CIALO_ADMIN = 2 * 1024 * 1024;   // zapis kampanii gracza (lista akcji) bywa długi
const OKNO_PODPISU_S = 300;
const LIMIT_NA_MINUTE = 240;

const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const rowne = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));
const hmac = (sekret, tekst) => crypto.createHmac('sha256', sekret).update(tekst).digest('hex');

function konfiguracja(env = process.env) {
  const brak = [];
  const sekret = n => { const v = env[n]; if (!v || v.length < 24) brak.push(`${n} (co najmniej 24 znaki)`); return v; };
  const c = {
    admin: sekret('LAB_ADMIN_TOKEN'), siem: sekret('LAB_SIEM_TOKEN'), soar: sekret('LAB_SOAR_SECRET'),
    port: Number(env.LAB_PORT || 31600), host: env.LAB_HOST || '127.0.0.1',
    dane: env.LAB_DANE || path.join(__dirname, 'sesje'),
    siemPush: env.LAB_SIEM_PUSH_URL || null, soarPush: env.LAB_SOAR_PUSH_URL || null,
    push: env.LAB_PUSH_SECRET || null,
    gen: env.LAB_GEN_TOKEN || null, genPush: env.LAB_GEN_PUSH_URL || null,
    klucz: env.LAB_KLUCZ_PRYWATNY ? fs.readFileSync(env.LAB_KLUCZ_PRYWATNY, 'utf8') : null,
  };
  if (c.gen && c.gen.length < 24) brak.push('LAB_GEN_TOKEN (co najmniej 24 znaki)');
  if ((c.siemPush || c.soarPush || c.genPush) && (!c.push || c.push.length < 24)) brak.push('LAB_PUSH_SECRET (co najmniej 24 znaki) — wymagany przy wypychaniu');
  if (brak.length) throw new Error(`Brak konfiguracji:\n - ${brak.join('\n - ')}`);
  return c;
}

function utworz(c) {
  const sesje = new Map();   // id → { L, tokenHash, wypchniete: { zd, dok }, kolejka }
  fs.mkdirSync(c.dane, { recursive: true, mode: 0o700 });

  // ── TRWAŁOŚĆ: sesja = parametry + operacje (odtwarzane przy starcie, jak zapis kampanii) ──
  const plik = id => path.join(c.dane, `${id}.json`);
  const zapisz = (id, x) => {
    const tmp = `${plik(id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ p: x.L.p, ops: x.L.ops, tokenHash: x.tokenHash, wypchniete: x.wypchniete }), { mode: 0o600 });
    fs.renameSync(tmp, plik(id));
  };
  for (const f of fs.readdirSync(c.dane).filter(n => /^[a-f0-9]{16}\.json$/.test(n))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(c.dane, f), 'utf8'));
      sesje.set(f.slice(0, 16), { L: LAB.odtworz(d.p, d.ops), tokenHash: d.tokenHash, wypchniete: { zd: 0, dok: 0, gen: 0, ...d.wypchniete }, kolejka: Promise.resolve() });
    } catch (e) { console.error(`Sesja ${f} nie odtworzyła się: ${e.message}`); }
  }

  // ── WYPYCHANIE do tenanta (najlepsza możliwa próba; pobieranie działa zawsze) ──
  async function wyslij(url, sesja, tenant, cialo, typ) {
    const czas = String(Math.floor(Date.now() / 1000));
    const r = await fetch(url.replace('{tenant}', encodeURIComponent(tenant)), {
      method: 'POST', body: cialo,
      headers: { 'Content-Type': typ, 'X-Lab-Sesja': sesja, 'X-Lab-Tenant': tenant, 'X-Lab-Czas': czas, 'X-Lab-Podpis': `sha256=${hmac(c.push, `${czas}.${sesja}.${cialo}`)}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  }
  function wypchnij(id, x) {
    if (!c.siemPush && !c.soarPush && !c.genPush) return;
    x.kolejka = x.kolejka.then(async () => {
      const L = x.L, tenant = L.p.tenant;
      try {
        if (c.siemPush && x.wypchniete.zd < L.wydaneZd.length) {
          const nowe = L.wydaneZd.slice(x.wypchniete.zd);
          await wyslij(c.siemPush, id, tenant, nowe.map(z => JSON.stringify({ ...z, 'organization.id': tenant })).join('\n') + '\n', 'application/x-ndjson');
          x.wypchniete.zd += nowe.length;
        }
        if (c.soarPush && x.wypchniete.dok < L.wydaneDok.length) {
          const nowe = L.wydaneDok.slice(x.wypchniete.dok);
          await wyslij(c.soarPush, id, tenant, JSON.stringify({ tenant, sesja: id, incydent: LAB.stan(L).incydent, dokumenty: nowe }), 'application/json');
          x.wypchniete.dok += nowe.length;
        }
        const pb = LAB.przebieg(L);
        if (c.genPush && x.wypchniete.gen < pb.length) {
          const nowe = pb.slice(x.wypchniete.gen);
          await wyslij(c.genPush, id, tenant, JSON.stringify({ tenant, sesja: id, ...(x.wypchniete.gen ? {} : { scenariusz: LAB.scenariusz(L) }), przebieg: nowe }), 'application/json');
          x.wypchniete.gen += nowe.length;
        }
        zapisz(id, x);
      } catch (e) { console.error(`Wypychanie sesji ${id} (${tenant}): ${e.message} — ponowię przy następnym ruchu`); }
    });
  }

  // ── POMOCNICZE ──
  const liczniki = new Map();
  setInterval(() => liczniki.clear(), 60000).unref();
  const zuzyte = new Map();   // podpis → wygasa (ochrona przed powtórzeniem wywołania SOAR-a)
  setInterval(() => { const t = Date.now(); for (const [k, v] of zuzyte) if (v < t) zuzyte.delete(k); }, 60000).unref();

  const odp = (res, kod, x, typ = 'application/json; charset=utf-8') => {
    res.writeHead(kod, { 'Content-Type': typ, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(typeof x === 'string' ? x : JSON.stringify(x));
  };
  const blad = (kod, tekst) => Object.assign(new Error(tekst), { kod });
  const bearer = req => (req.headers.authorization || '').replace(/^Bearer /, '');
  function czytaj(req, max = MAX_CIALO) {
    return new Promise((ok, nie) => {
      let n = 0; const cz = [];
      req.on('data', b => { n += b.length; if (n > max) { nie(blad(413, 'za duże ciało żądania')); req.destroy(); } else cz.push(b); });
      req.on('end', () => ok(Buffer.concat(cz).toString('utf8')));
      req.on('error', nie);
    });
  }
  const json = surowe => { if (!surowe) return {}; try { const x = JSON.parse(surowe); if (x && typeof x === 'object' && !Array.isArray(x)) return x; } catch { /* niżej */ } throw blad(400, 'ciało musi być obiektem JSON'); };
  function podpisSoar(req, id, surowe) {
    const czas = req.headers['x-lab-czas'] || '', podpis = String(req.headers['x-lab-podpis'] || '').replace(/^sha256=/, '');
    if (!/^\d+$/.test(czas) || Math.abs(Date.now() / 1000 - Number(czas)) > OKNO_PODPISU_S) throw blad(401, 'brak albo przeterminowany X-Lab-Czas');
    if (!/^[a-f0-9]{64}$/.test(podpis) || !rowne(podpis, hmac(c.soar, `${czas}.${id}.${surowe}`))) throw blad(401, 'zły podpis');
    if (zuzyte.has(podpis)) throw blad(409, 'to wywołanie już było (powtórzenie)');
    zuzyte.set(podpis, Date.now() + OKNO_PODPISU_S * 2000);
  }
  const sesjaGracza = req => { const t = bearer(req); for (const [id, x] of sesje) if (t && rowne(hash(t).toString('hex'), x.tokenHash)) return [id, x]; throw blad(401, 'zły token gracza'); };
  const sesjaPo = id => { const x = /^[a-f0-9]{16}$/.test(id) && sesje.get(id); if (!x) throw blad(404, 'nie ma takiej sesji'); return x; };
  const operacja = (id, x, op, dane) => { const r = LAB.wykonaj(x.L, op, dane); zapisz(id, x); wypchnij(id, x); return r; };
  // Stan dla gracza + flaga wyniku, gdy incydent z zapisu kampanii się zakończył (wraca z nią do gry).
  const stanGracza = x => { const st = LAB.stan(x.L); const f = LAB.flagaWyniku(x.L, c.klucz); if (st.koniec && f) st.koniec.flaga = f; return st; };

  // ── TRASY ──
  async function obsluz(req, res) {
    const u = new URL(req.url, 'http://lab');
    const klucz = `${req.socket.remoteAddress}`;
    const n = (liczniki.get(klucz) || 0) + 1; liczniki.set(klucz, n);
    if (n > LIMIT_NA_MINUTE) throw blad(429, 'za dużo żądań — spróbuj za minutę');
    const [, a, b, cc] = u.pathname.split('/');
    const surowe = req.method === 'POST' ? await czytaj(req, a === 'admin' ? MAX_CIALO_ADMIN : MAX_CIALO) : '';

    if (u.pathname === '/zdrowie') return odp(res, 200, { ok: true });

    if (a === 'admin') {
      if (!rowne(bearer(req), c.admin)) throw blad(401, 'zły token admina');
      if (b === 'sesje' && !cc && req.method === 'POST') {
        const d = json(surowe);
        // Sesja z zapisu kampanii gracza: tenant z jego gry (flaga wyniku wróci do tej samej kampanii).
        const tz = d.zapis?.opcje?.zewnetrzne?.tenant;
        if (d.zapis) {
          if (!c.klucz) throw blad(400, 'sesja z zapisu wymaga LAB_KLUCZ_PRYWATNY (serwer podpisuje flagę wyniku)');
          if (!tz) throw blad(400, 'zapis nie pochodzi z gry połączonej z systemem (uruchom kampanię z --tenant i --klucz)');
          if (d.tenant && d.tenant !== tz) throw blad(400, `tenant (${d.tenant}) różni się od tenanta z zapisu (${tz})`);
          d.tenant = tz;
        }
        if (typeof d.tenant !== 'string' || !/^[\w.-]{1,64}$/.test(d.tenant)) throw blad(400, 'tenant: identyfikator tenanta gracza w SIEM/SOAR (litery, cyfry, . _ -)');
        const p = {
          incydent: String(d.incydent || 'S07'), tenant: d.tenant, seed: Number.isInteger(d.seed) ? d.seed : Number.isInteger(d.zapis?.seed) ? d.zapis.seed : crypto.randomInt(1, 2 ** 31),
          ...(d.zapis ? { zapis: { kampania: String(d.zapis.kampania), seed: d.zapis.seed, akcje: d.zapis.akcje, opcje: d.zapis.opcje } } : {}),
          kontrole: Array.isArray(d.kontrole) ? d.kontrole.map(String) : [], naprawione: Array.isArray(d.naprawione) ? d.naprawione.map(String) : [],
          // T+0 = chwila założenia sesji: logi z „piątku" mają prawdziwe daty sprzed trzech dni.
          start: d.start || new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(),
          ...(d.kampania ? { kampania: String(d.kampania) } : {}),
        };
        let L;
        try { L = LAB.nowaSesja(p); } catch (e) { throw blad(400, e.message); }
        const id = crypto.randomBytes(8).toString('hex'), token = crypto.randomBytes(24).toString('base64url');
        const x = { L, tokenHash: hash(token).toString('hex'), wypchniete: { zd: 0, dok: 0, gen: 0 }, kolejka: Promise.resolve() };
        sesje.set(id, x); zapisz(id, x); wypchnij(id, x);
        return odp(res, 201, { sesja: id, token, tenant: p.tenant, seed: p.seed, start: p.start });
      }
      if (b === 'sesje' && !cc && req.method === 'GET') return odp(res, 200, [...sesje].map(([id, x]) => ({ sesja: id, tenant: x.L.p.tenant, incydent: x.L.p.incydent, t: x.L.s.t, koniec: !!x.L.wynik, wypchniete: x.wypchniete })));
      if (b === 'sesje' && cc && req.method === 'GET') {
        const x = sesjaPo(cc), L = x.L;
        // Trener widzi też odpowiedzi — gracz nigdy (mgła wojny).
        return odp(res, 200, { ...stanGracza(x), lab: LAB.podsumowanie(L), odpowiedzi: Object.fromEntries(Object.entries(L.lab.ustalenia).map(([k, v]) => [k, v.prawda(L)])) });
      }
      if (b === 'sesje' && cc && req.method === 'DELETE') { sesjaPo(cc); sesje.delete(cc); fs.rmSync(plik(cc), { force: true }); return odp(res, 200, { ok: true }); }
      throw blad(404, 'nie ma takiej trasy');
    }

    if (a === 'gra') {
      const [id, x] = sesjaGracza(req);
      if (b === 'stan' && req.method === 'GET') return odp(res, 200, stanGracza(x));
      if (req.method === 'POST' && ['akcja', 'czekaj', 'ustalenie', 'podpowiedz', 'koniec'].includes(b)) {
        const d = json(surowe);
        return odp(res, 200, { ...operacja(id, x, b, d), stan: stanGracza(x) });
      }
      throw blad(404, 'nie ma takiej trasy');
    }

    if (a === 'generator') {
      if (!c.gen || !rowne(bearer(req), c.gen)) throw blad(401, 'zły token generatora');
      const x = sesjaPo(b);
      if (cc === 'scenariusz' && req.method === 'GET') return odp(res, 200, LAB.scenariusz(x.L));
      if (cc === 'przebieg' && req.method === 'GET') {
        const po = Math.max(0, Number(u.searchParams.get('po') || 0) | 0);
        const pb = LAB.przebieg(x.L);
        return odp(res, 200, { nastepny: pb.length, t: x.L.s.t, koniec: !!x.L.wynik, przebieg: pb.slice(po) });
      }
      throw blad(404, 'nie ma takiej trasy');
    }

    if (a === 'siem') {
      if (!rowne(bearer(req), c.siem)) throw blad(401, 'zły token SIEM-a');
      const x = sesjaPo(b);
      if (cc !== 'zdarzenia' || req.method !== 'GET') throw blad(404, 'nie ma takiej trasy');
      const po = Math.max(0, Number(u.searchParams.get('po') || 0) | 0);
      const nowe = x.L.wydaneZd.slice(po, po + 5000);
      res.setHeader('X-Lab-Nastepny', String(po + nowe.length));
      return odp(res, 200, nowe.map(z => JSON.stringify({ ...z, 'organization.id': x.L.p.tenant })).join('\n') + (nowe.length ? '\n' : ''), 'application/x-ndjson; charset=utf-8');
    }

    if (a === 'soar') {
      podpisSoar(req, b, surowe);   // najpierw podpis: bez niego nie zdradzamy nawet, czy sesja istnieje
      const x = sesjaPo(b);
      if (cc === 'dokumenty' && req.method === 'GET') {
        const po = Math.max(0, Number(u.searchParams.get('po') || 0) | 0);
        return odp(res, 200, { tenant: x.L.p.tenant, incydent: LAB.stan(x.L).incydent, nastepny: x.L.wydaneDok.length, dokumenty: x.L.wydaneDok.slice(po) });
      }
      if (cc === 'playbooki' && req.method === 'GET') return odp(res, 200, LAB.playbooki(x.L));
      if (cc === 'playbook' && req.method === 'POST') {
        const d = json(surowe);
        if (typeof d.playbook !== 'string') throw blad(400, 'playbook: nazwa playbooka');
        const pola = d.pola && typeof d.pola === 'object' ? Object.fromEntries(Object.entries(d.pola).map(([k, v]) => [k, String(v).slice(0, 200)])) : {};
        return odp(res, 200, operacja(b, x, 'soar', { playbook: d.playbook, pola }));
      }
      throw blad(404, 'nie ma takiej trasy');
    }
    throw blad(404, 'nie ma takiej trasy');
  }

  const serwer = http.createServer((req, res) => {
    obsluz(req, res).catch(e => {
      const kod = e.kod || (e.niedostepny ? 409 : 500);   // nie-da-się z silnika incydentu to nie awaria
      if (kod === 500) console.error(e);
      if (!res.headersSent) odp(res, kod, { blad: kod === 500 ? 'błąd serwera' : e.message });
    });
  });
  return { serwer, sesje };
}

if (require.main === module) {
  let c;
  try { c = konfiguracja(); } catch (e) { console.error(e.message); process.exit(1); }
  const { serwer, sesje } = utworz(c);
  serwer.listen(c.port, c.host, () => console.log(`Lab „Linia Obrony" na http://${c.host}:${c.port} (sesji: ${sesje.size})`));
}

module.exports = { konfiguracja, utworz, hmac };
