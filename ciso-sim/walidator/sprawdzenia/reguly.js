// ── SIEM: reguły wykrywania, które naprawdę wykrywają ──
// Reguła liczy się, gdy jest włączona i deklaruje technikę z incydentów gry (data/zewnetrzne.js →
// TECHNIKI). Jeśli adapter umie wstrzyknąć zdarzenia i czytać alerty, każdą technikę z próbką
// (walidator/proby.js) sprawdzamy NA ŻYWO: wstrzykujemy oznaczoną paczkę i czekamy na alert ze
// znacznikiem. Reguła, która na próbce milczy, nie przechodzi — jej nazwa nie ratuje.

const crypto = require('crypto');
const { TECHNIKI, MIN_REGUL } = require('../../data/zewnetrzne');
const PROBY = require('../proby');

async function naZywo({ tenant, siem, konfig }, technika) {
  const znacznik = `lo-${crypto.randomBytes(6).toString('hex')}`;
  const od = new Date(Date.now() - 1000).toISOString();
  await siem.wstrzyknij(tenant, PROBY[technika](znacznik));
  const koniec = Date.now() + (konfig.progi?.alert_s ?? 90) * 1000;
  for (;;) {
    if ((await siem.alerty(tenant, od)).some(a => JSON.stringify(a).includes(znacznik))) return true;
    if (Date.now() >= koniec) return false;
    await new Promise(r => setTimeout(r, konfig.progi?.odpytywanie_ms ?? 2000));
  }
}

module.exports = {
  opis: `co najmniej ${MIN_REGUL} reguły wykrywania dla technik z incydentów (z testem na żywo, gdy się da)`,
  async sprawdz(ctx) {
    const { tenant, siem, konfig } = ctx;
    const powody = [], dobre = [];
    const zywo = !!(siem.wstrzyknij && siem.alerty) && konfig.test_na_zywo !== false;
    if (!zywo) powody.push('bez testu na żywo (adapter nie ma „wstrzyknij" i „alerty") — liczę reguły zadeklarowane');
    const wynikTechniki = {};
    for (const r of await siem.reguly(tenant)) {
      if (!r.wlaczona) { powody.push(`„${r.nazwa}": wyłączona`); continue; }
      const tech = (r.techniki || []).filter(t => TECHNIKI[t]);
      if (!tech.length) { powody.push(`„${r.nazwa}": nie deklaruje techniki z incydentów gry (${Object.keys(TECHNIKI).join(', ')}) — nie wiem, co wykrywa`); continue; }
      const doTestu = tech.filter(t => PROBY[t]);
      if (zywo && doTestu.length) {
        for (const t of doTestu) if (wynikTechniki[t] === undefined) wynikTechniki[t] = await naZywo(ctx, t);
        if (!doTestu.some(t => wynikTechniki[t])) { powody.push(`„${r.nazwa}" (${doTestu.join(', ')}): na próbce zdarzeń nie wystawiła alertu`); continue; }
      }
      dobre.push(r.nazwa);
    }
    if (dobre.length < MIN_REGUL) powody.push(`działających reguł: ${dobre.length} z wymaganych ${MIN_REGUL}`);
    return { ok: dobre.length >= MIN_REGUL, powody, wynik: { reguly: dobre } };
  },
};
