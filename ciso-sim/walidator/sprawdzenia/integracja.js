// ── SOAR: alert z SIEM-a zakłada sprawę ──
// Na żywo (adapter SIEM-a umie wstrzyknąć): próbka masowego wyłączania kont → alert → sprawa w SOAR-ze
// ze znacznikiem, w zadanym czasie. Bez tego: włączona integracja z SIEM-em i sprawa z SIEM-a
// z ostatnich 7 dni (dowód, że połączenie kiedykolwiek zadziałało, a nie tylko istnieje w konfiguracji).

const crypto = require('crypto');
const PROBY = require('../proby');

module.exports = {
  opis: 'alert z SIEM-a tworzy sprawę w SOAR-ze',
  async sprawdz({ tenant, siem, soar, konfig, teraz }) {
    const integ = (await soar.integracje(tenant)).filter(i => i.z === 'siem');
    if (!integ.some(i => i.wlaczona)) return { ok: false, powody: ['w SOAR-ze nie ma włączonej integracji z SIEM-em'], wynik: {} };
    if (siem.wstrzyknij && konfig.test_na_zywo !== false) {
      const znacznik = `lo-${crypto.randomBytes(6).toString('hex')}`;
      const od = new Date(Date.now() - 1000).toISOString();
      await siem.wstrzyknij(tenant, PROBY.T1531(znacznik));
      const koniec = Date.now() + (konfig.progi?.sprawa_s ?? 120) * 1000;
      for (;;) {
        if ((await soar.sprawy(tenant, od)).some(s => JSON.stringify(s).includes(znacznik))) return { ok: true, powody: [], wynik: { na_zywo: true } };
        if (Date.now() >= koniec) return { ok: false, powody: ['próbka masowego wyłączania kont nie założyła sprawy w SOAR-ze — sprawdź regułę w SIEM-ie (T1531) i przekazywanie alertów'], wynik: {} };
        await new Promise(r => setTimeout(r, konfig.progi?.odpytywanie_ms ?? 2000));
      }
    }
    const od = new Date(teraz - 7 * 86400000).toISOString();
    const z = (await soar.sprawy(tenant, od)).filter(s => s.zrodlo === 'siem');
    return z.length ? { ok: true, powody: ['bez testu na żywo — przyjmuję sprawę z SIEM-a z ostatnich 7 dni'], wynik: { na_zywo: false } }
      : { ok: false, powody: ['integracja włączona, ale w ostatnich 7 dniach nie przyszła z SIEM-a żadna sprawa'], wynik: {} };
  },
};
