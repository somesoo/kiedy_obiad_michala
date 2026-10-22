// ── SERWER WALIDATORA (stoi przy SIEM-ie i SOAR-ze właściciela) ──
//   POST /sprawdz { tenant, kontrola, zadania? } → { wyniki: [{ zadanie, ok, powody, wynik, flaga? }] }
//   GET  /zadania                                 → katalog zadań i co sprawdzają
// Gra woła /sprawdz (komenda „sprawdz <kontrola>"), gracz dostaje powody albo flagi — gra wnosi flagi sama.
//
// Konfiguracja: WAL_KONFIG (plik JSON: adapter, ścieżki API, mapowania, progi — konfig.przyklad.json),
// WAL_KLUCZ_PRYWATNY (PEM, lab/flaga.js klucze — publiczny trafia do gier graczy), WAL_TOKEN (opcjonalnie:
// Bearer wymagany od gry), WAL_HOST (127.0.0.1), WAL_PORT (31700). Sekrety API — tylko w zmiennych
// środowiska, na które wskazuje konfiguracja (${ENV:…}).
// Jedno sprawdzenie naraz na tenanta i odstęp między sprawdzeniami (progi.odstep_s) — test na żywo
// wstrzykuje zdarzenia do prawdziwego SIEM-a, nie wolno go zalać klikaniem „sprawdź".

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const W = require('./walidator');
const ZW = require('../data/zewnetrzne');

function utworz({ konfig, klucz, token = null }) {
  const { siem, soar } = W.zbuduj(konfig);
  const trwa = new Set(), ostatnie = new Map();
  const odp = (res, kod, x) => { res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(x)); };
  const rowne = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
  return http.createServer(async (req, res) => {
    try {
      if (req.url === '/zdrowie') return odp(res, 200, { ok: true });
      if (token && !rowne((req.headers.authorization || '').replace(/^Bearer /, ''), token)) return odp(res, 401, { blad: 'zły token' });
      if (req.url === '/zadania' && req.method === 'GET') {
        return odp(res, 200, Object.fromEntries(Object.entries(ZW.kontrole).map(([id, k]) => [id, Object.fromEntries(Object.entries(k.zadania).map(([z, d]) => [z, d.opis]))])));
      }
      if (req.url !== '/sprawdz' || req.method !== 'POST') return odp(res, 404, { blad: 'nie ma takiej trasy' });
      let surowe = '';
      for await (const c of req) { surowe += c; if (surowe.length > 8192) return odp(res, 413, { blad: 'za duże żądanie' }); }
      let d; try { d = JSON.parse(surowe); } catch { return odp(res, 400, { blad: 'ciało: JSON' }); }
      const klucz2 = `${d.tenant}:${d.kontrola}`;
      if (trwa.has(d.tenant)) return odp(res, 429, { blad: 'sprawdzenie tego tenanta już trwa' });
      const odstep = (konfig.progi?.odstep_s ?? 20) * 1000;
      if (Date.now() - (ostatnie.get(klucz2) || 0) < odstep) return odp(res, 429, { blad: `odczekaj ${Math.ceil((odstep - (Date.now() - ostatnie.get(klucz2))) / 1000)} s między sprawdzeniami` });
      trwa.add(d.tenant); ostatnie.set(klucz2, Date.now());
      try { return odp(res, 200, await W.sprawdz({ tenant: d.tenant, kontrola: d.kontrola, zadania: Array.isArray(d.zadania) ? d.zadania.map(String) : null }, { siem, soar, konfig, klucz })); }
      catch (e) { return odp(res, 400, { blad: e.message }); }
      finally { trwa.delete(d.tenant); }
    } catch (e) { console.error(e); if (!res.headersSent) odp(res, 500, { blad: 'błąd walidatora' }); }
  });
}

if (require.main === module) {
  const brak = ['WAL_KONFIG', 'WAL_KLUCZ_PRYWATNY'].filter(n => !process.env[n]);
  if (brak.length) { console.error(`Brak konfiguracji: ${brak.join(', ')}`); process.exit(1); }
  if (process.env.WAL_TOKEN && process.env.WAL_TOKEN.length < 24) { console.error('WAL_TOKEN: co najmniej 24 znaki'); process.exit(1); }
  const s = utworz({ konfig: W.wczytajKonfig(process.env.WAL_KONFIG), klucz: fs.readFileSync(process.env.WAL_KLUCZ_PRYWATNY, 'utf8'), token: process.env.WAL_TOKEN || null });
  const port = Number(process.env.WAL_PORT || 31700), host = process.env.WAL_HOST || '127.0.0.1';
  s.listen(port, host, () => console.log(`Walidator „Linia Obrony" na http://${host}:${port}`));
}

module.exports = { utworz };
