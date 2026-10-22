// ── ADAPTER-ATRAPA: SIEM i SOAR w pamięci (testy, demo, wzór danych dla prawdziwego adaptera) ──
// dane: { tenanty: { <tenant>: { zrodla: [{ nazwa, typ, ostatnie }], reguly: [{ nazwa, wlaczona, techniki }],
//   integracje: [{ z, wlaczona }],  (reguła może mieć `nie_wykrywa: true` — symulacja reguły, która milczy) sprawy: [{ zrodlo, utworzona, opis }], playbooki: [{ nazwa, typ, wlaczony, kroki: [{ typ }] }] } } }
// Atrapa udaje też detekcję: włączona reguła z techniką, dla której jest prosty detektor, wystawia
// alert na wstrzyknięte zdarzenia; włączona integracja z SIEM-em zakłada z alertu sprawę w SOAR-ze.

const DETEKTORY = {
  T1531: z => z.filter(e => e['event.code'] === '4725').length >= 10,
  T1110: z => z.filter(e => e['event.code'] === '4625').length >= 20,
  'T1070.001': z => z.some(e => e['event.code'] === '1102'),
  T1485: z => z.filter(e => e['event.action'] === 'file-delete').length >= 20,
};

module.exports = function atrapa(konf, dane = konf.dane || JSON.parse(require('fs').readFileSync(konf.plik, 'utf8'))) {
  const t = tenant => { if (!dane.tenanty[tenant]) throw new Error(`atrapa: nie ma tenanta ${tenant}`); const x = dane.tenanty[tenant]; x.alerty ??= []; x.sprawy ??= []; return x; };
  const siem = {
    // „TERAZ" w pliku = przed chwilą (plik przykładowy nie starzeje się).
    zrodla: async tn => (t(tn).zrodla || []).map(z => (z.ostatnie === 'TERAZ' ? { ...z, ostatnie: new Date(Date.now() - 60000).toISOString() } : z)),
    reguly: async tn => t(tn).reguly || [],
    wstrzyknij: async (tn, zdarzenia) => {
      const x = t(tn), znacznik = zdarzenia[0]?.['labels.lo_proba'];
      for (const r of (x.reguly || []).filter(r => r.wlaczona)) {
        // `nie_wykrywa`: reguła z dobrą nazwą i techniką, która w praktyce milczy (zły próg, złe pole).
        if (r.nie_wykrywa || !(r.techniki || []).some(tech => DETEKTORY[tech]?.(zdarzenia))) continue;
        const alert = { regula: r.nazwa, techniki: r.techniki, znacznik, czas: new Date().toISOString() };
        x.alerty.push(alert);
        if ((x.integracje || []).some(i => i.z === 'siem' && i.wlaczona)) x.sprawy.push({ zrodlo: 'siem', utworzona: alert.czas, opis: `Alert: ${r.nazwa}`, znacznik });
      }
    },
    alerty: async (tn, od) => t(tn).alerty.filter(a => a.czas >= od),
  };
  const soar = {
    integracje: async tn => t(tn).integracje || [],
    sprawy: async (tn, od) => t(tn).sprawy.filter(s => s.utworzona >= od),
    playbooki: async tn => t(tn).playbooki || [],
  };
  return { siem, soar };
};
