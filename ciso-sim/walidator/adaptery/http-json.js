// ── ADAPTER HTTP/JSON: Twój SIEM i SOAR przez ich API ──
// Nie zakładamy produktu: w konfiguracji walidatora podajesz ścieżki i nazwy pól (konfig.przyklad.json).
// Sekrety tylko ze zmiennych środowiska: w nagłówkach „${ENV:NAZWA}" — w pliku konfiguracji nie ma haseł.
//
//   { "url": "https://siem.example/api", "naglowki": { "Authorization": "Bearer ${ENV:SIEM_TOKEN}" },
//     "zasoby": { "zrodla": { "sciezka": "/tenants/{tenant}/sources", "lista": "data", "pola": { "nazwa": "name", "typ": "type", "ostatnie": "last_event" } }, … } }
// W ścieżce: {tenant}, {od} (ISO). „lista": gdzie w odpowiedzi jest tablica (kropki dla zagnieżdżeń).
// „pola": nazwa w grze → nazwa w Twoim API (kropki dla zagnieżdżeń). Brak zasobu = adapter go nie ma
// (np. bez „wstrzyknij" i „alerty" walidator nie zrobi testu reguł na żywo i powie to).

const dostan = (o, sciezka) => (sciezka ? sciezka.split('.').reduce((x, k) => (x == null ? x : x[k]), o) : o);
const env = s => String(s).replace(/\$\{ENV:([A-Z0-9_]+)\}/g, (_, n) => { if (!process.env[n]) throw new Error(`brak zmiennej środowiska ${n} (konfiguracja adaptera)`); return process.env[n]; });

function klient(konf) {
  const naglowki = () => Object.fromEntries(Object.entries(konf.naglowki || {}).map(([k, v]) => [k, env(v)]));
  const url = (z, tenant, od = '') => konf.url.replace(/\/$/, '') + z.sciezka.replace('{tenant}', encodeURIComponent(tenant)).replace('{od}', encodeURIComponent(od));
  async function pobierz(nazwa, tenant, od) {
    const z = konf.zasoby?.[nazwa];
    const r = await fetch(url(z, tenant, od), { headers: naglowki(), signal: AbortSignal.timeout(konf.timeout_ms || 10000) });
    if (!r.ok) throw new Error(`${nazwa}: HTTP ${r.status} z ${konf.url}`);
    const lista = dostan(await r.json(), z.lista);
    if (!Array.isArray(lista)) throw new Error(`${nazwa}: odpowiedź nie zawiera tablicy (ustaw „lista" w konfiguracji)`);
    // Pola mapowane na nazwy gry; reszta rekordu zostaje (np. do szukania znacznika w alertach).
    return lista.map(x => ({ ...x, ...Object.fromEntries(Object.entries(z.pola || {}).map(([gra, api]) => [gra, dostan(x, api)])) }));
  }
  const ma = n => !!konf.zasoby?.[n];
  return { pobierz, ma, url, naglowki };
}

function kroki(p) { return (Array.isArray(p.kroki) ? p.kroki : []).map(k => (typeof k === 'string' ? { typ: k } : k)); }

module.exports = function httpJson(konf) {
  const s = klient(konf.siem || {}), o = klient(konf.soar || {});
  const siem = {
    zrodla: tn => s.pobierz('zrodla', tn),
    reguly: async tn => (await s.pobierz('reguly', tn)).map(r => ({ ...r, wlaczona: !!r.wlaczona, techniki: [].concat(r.techniki || []) })),
    ...(s.ma('wstrzyknij') && s.ma('alerty') ? {
      wstrzyknij: async (tn, zdarzenia) => {
        const z = konf.siem.zasoby.wstrzyknij;
        const ndjson = z.format !== 'json';
        const r = await fetch(s.url(z, tn), { method: z.metoda || 'POST', headers: { ...s.naglowki(), 'Content-Type': ndjson ? 'application/x-ndjson' : 'application/json' },
          body: ndjson ? zdarzenia.map(e => JSON.stringify(e)).join('\n') + '\n' : JSON.stringify(zdarzenia), signal: AbortSignal.timeout(konf.siem.timeout_ms || 10000) });
        if (!r.ok) throw new Error(`wstrzyknij: HTTP ${r.status}`);
      },
      alerty: (tn, od) => s.pobierz('alerty', tn, od),
    } : {}),
  };
  const soar = {
    integracje: async tn => (o.ma('integracje') ? (await o.pobierz('integracje', tn)).map(i => ({ ...i, wlaczona: !!i.wlaczona })) : []),
    sprawy: (tn, od) => o.pobierz('sprawy', tn, od),
    playbooki: async tn => (await o.pobierz('playbooki', tn)).map(p => ({ ...p, wlaczony: !!p.wlaczony, kroki: kroki(p) })),
  };
  return { siem, soar };
};
