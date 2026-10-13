// ── ZASOBY GRACZA: godziny i budżet ──
// Wspólne dla ruchów (proto/ruchy.js), spraw (proto/sprawy.js) i incydentów. Każdy ruch,
// który kosztuje, przechodzi przez `brakZasobow` — jedna reguła zamiast trzech kopii.
//
// Godziny: gracz ma `h_gracza` na miesiąc (pół etatu informatyka minus bieżące IT), najwyżej
// +50% nadgodzinami (morale). Incydent nie pyta o grafik — może przekroczyć limit.
// Budżet: zakup przechodzi tylko w ramach budżetu ROKU (+10% tolerancji), liczony razem
// z abonamentami i pensjami do grudnia — inaczej abonamenty „w limicie" rozsadzały kolejne
// miesiące (przypadki brzegowe, docs/17-…).

const S = require('./silnik');

const LIMIT_NADGODZIN = 1.5;
const TOLERANCJA_BUDZETU = 1.1;
const zl = n => `${Math.round(n).toLocaleString('pl-PL')} zł`;

const doKonca = k => 12 - k.miesiacKal + 1;

// Wydane w tym roku + to, co i tak poleci do grudnia (abonamenty, pensje, rekrutacje w toku).
function zobowiazaniaRoku(k) {
  const n = doKonca(k);
  let stale = (k.st.etaty - k.st.firma.zespol.fte) * S.KOSZT_ETATU;
  for (const id of k.st.zamowione) if (!(k.st.wypowiedzenia?.[id] < k.st.m + 1)) stale += S.kosztMiesieczny(k.st, id);
  let rekrutacje = 0;
  for (const r of k.rekrutacje || []) rekrutacje += r.etat * S.KOSZT_ETATU * Math.max(0, n - Math.max(0, r.od - k.st.m));
  return (k.wydaneRok[k.rok] || 0) + stale * n + rekrutacje;
}

// Koszt w budżecie TEGO roku: jednorazowo + miesięcznie do grudnia (+ pensja od startu etatu).
function kosztRoku(k, { pln = 0, msc = 0, etat = 0, etatOd = 0 } = {}) {
  const n = doKonca(k);
  return pln + msc * n + etat * S.KOSZT_ETATU * Math.max(0, n - etatOd);
}

// Wypalenie (morale < 25): mniej godzin, które naprawdę da się przepracować — zmęczony człowiek
// nie zrobi 60 h w miesiącu (przypadek brzegowy: pracoholik z morale 0 miał wynik jak mądry).
const limitGodzin = k => (k.def.h_gracza || 0) * LIMIT_NADGODZIN * (k.wskazniki.morale < 25 ? 0.7 : 1);
function godzinyWolne(k) {
  return Math.max(0, Math.round(limitGodzin(k) - k.hKart));
}

// Zwraca powód (po polsku), dla którego nie da się tego zrobić, albo null.
function brakZasobow(k, koszt = {}, { incydent = false } = {}) {
  const h = koszt.h || 0;
  if (h && !incydent && k.hKart + h > limitGodzin(k)) {
    return `brak godzin (zostało ${godzinyWolne(k)} h z nadgodzinami${k.wskazniki.morale < 25 ? ' — jesteś wypalony, limit niższy' : ''}, potrzeba ${h} h)`;
  }
  const pln = kosztRoku(k, koszt);
  if (pln > 0) {
    const budzet = k.budzet[k.rok] || 0;
    const wolne = budzet - zobowiazaniaRoku(k);
    if (pln > wolne + budzet * (TOLERANCJA_BUDZETU - 1)) {
      return `brak budżetu (wolne do końca roku: ${zl(Math.max(0, wolne))} + ${Math.round((TOLERANCJA_BUDZETU - 1) * 100)}% tolerancji, potrzeba ${zl(pln)})`;
    }
  }
  return null;
}

// Pobranie zasobów (po sprawdzeniu). Reagowanie na incydenty idzie z rezerwy firmy, nie stąd.
function pobierz(k, { h = 0, pln = 0 } = {}) {
  if (h) { k.hKart += h; k.maxHKart = Math.max(k.maxHKart || 0, k.hKart); }
  if (pln) { k.st.w.wydatki += pln; k.wydaneRok[k.rok] = (k.wydaneRok[k.rok] || 0) + pln; }
}

module.exports = { LIMIT_NADGODZIN, TOLERANCJA_BUDZETU, zl, doKonca, zobowiazaniaRoku, kosztRoku, limitGodzin, godzinyWolne, brakZasobow, pobierz };
