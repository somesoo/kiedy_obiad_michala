// ── SIEM / MDR: czy źródła logów naprawdę płyną do tenanta gracza ──
// „Podłączone" w konsoli to za mało: źródło liczy się, gdy przysłało zdarzenie w ostatnich N godzinach
// (progi.zrodlo_swieze_h) i zegar się zgadza. Wynik niesie listę żywych źródeł — gra liczy z niej
// jakość SIEM-a, a lab: które logi istnieją w incydencie. Wystarczy jedno żywe źródło, ale każde
// brakujące jest wypisane z powodem (gracz wie, co dołożyć).

const { ZRODLA } = require('../../data/zewnetrzne');

module.exports = {
  opis: 'źródła logów przysyłają zdarzenia do tenanta',
  async sprawdz({ tenant, siem, konfig, teraz }) {
    const swieze = (konfig.progi?.zrodlo_swieze_h ?? 24) * 3600000;
    const typy = konfig.siem?.typy || {};   // Twoje nazwy typów → źródła gry (ad, serwery, …)
    const zywe = new Set(), powody = [];
    for (const z of await siem.zrodla(tenant)) {
      const id = typy[z.typ] || z.typ;
      if (!ZRODLA[id]) { powody.push(`„${z.nazwa}" (typ ${z.typ}): nie wiem, co to za źródło — dopisz typ w konfiguracji walidatora (siem.typy)`); continue; }
      const t = Date.parse(z.ostatnie);
      if (Number.isNaN(t)) { powody.push(`„${z.nazwa}" (${ZRODLA[id]}): nie przysłało jeszcze żadnego zdarzenia`); continue; }
      if (t > teraz + 10 * 60000) { powody.push(`„${z.nazwa}" (${ZRODLA[id]}): zdarzenia „z przyszłości" — zegar źródła się nie zgadza`); continue; }
      if (teraz - t > swieze) { powody.push(`„${z.nazwa}" (${ZRODLA[id]}): ostatnie zdarzenie ${new Date(t).toISOString()} — podłączone, ale nie przysyła logów`); continue; }
      zywe.add(id);
    }
    const brak = Object.keys(ZRODLA).filter(id => !zywe.has(id));
    if (brak.length) powody.push(`niepodłączone (jeśli je macie): ${brak.map(id => ZRODLA[id]).join(', ')}`);
    return { ok: zywe.size > 0, powody, wynik: { zrodla: [...zywe] } };
  },
};
