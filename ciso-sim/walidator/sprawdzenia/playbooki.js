// ── SOAR: playbooki potrzebne w incydentach gry ──
// Dla każdego wymaganego rodzaju (data/zewnetrzne.js → PLAYBOOKI): włączony, co najmniej dwa kroki,
// a tam, gdzie działanie może zatrzymać pracę (wyłączenie konta, odcięcie hosta) — krok zatwierdzenia
// przez człowieka (progi.zatwierdzenie: false wyłącza ten wymóg). Playbook „jednym kliknięciem bez
// pytania" na koncie prezesa w trakcie przelewu to osobny incydent.

const { PLAYBOOKI } = require('../../data/zewnetrzne');

module.exports = {
  opis: `playbooki: ${Object.values(PLAYBOOKI).map(p => p.opis).join('; ')}`,
  async sprawdz({ tenant, soar, konfig }) {
    const typy = konfig.soar?.typy || {};               // Twoje nazwy → rodzaje gry
    const zatw = new Set(['zatwierdzenie', ...(konfig.soar?.kroki_zatwierdzenia || [])]);
    const lista = (await soar.playbooki(tenant)).map(p => ({ ...p, rodzaj: typy[p.typ] || p.typ }));
    const powody = [], dobre = [];
    for (const [rodzaj, wym] of Object.entries(PLAYBOOKI)) {
      const kand = lista.filter(p => p.rodzaj === rodzaj);
      if (!kand.length) { powody.push(`brak playbooka: ${wym.opis} (rodzaj „${rodzaj}")`); continue; }
      const p = kand.find(x => x.wlaczony && x.kroki.length >= 2 && (!wym.zatwierdzenie || konfig.progi?.zatwierdzenie === false || x.kroki.some(k => zatw.has(k.typ))));
      if (p) { dobre.push(p.nazwa); continue; }
      const x = kand[0];
      powody.push(`„${x.nazwa}" (${wym.opis}): ${!x.wlaczony ? 'wyłączony' : x.kroki.length < 2 ? 'za mało kroków' : 'brak kroku zatwierdzenia przez człowieka'}`);
    }
    return { ok: dobre.length === Object.keys(PLAYBOOKI).length, powody, wynik: { playbooki: dobre } };
  },
};
