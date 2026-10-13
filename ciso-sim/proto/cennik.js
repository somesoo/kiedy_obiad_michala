// ── CENNIK ZŁYCH DECYZJI ──
// Ile kosztuje JEDNA zła decyzja w dobrej grze? Gracz mądry gra normalnie, a w jednej karcie
// wybiera najgorszą opcję (błąd, a gdy go nie ma — dopuszczalną). Różnica Wyniku kampanii na tych
// samych ziarnach to „cena" tej decyzji. Laboratorium brzegowe (brzegowe.js) pytało, czy głupia
// gra daje głupi wynik; to pyta, czy POJEDYNCZY błąd w dobrej grze jest widoczny (docs/17-…, 17.7).
//   node ciso-sim/proto/cennik.js [liczba_ziaren]

const K = require('./kampania');
const DEF = require('../data/kampanie/wodociagi');

const najgorsza = c => {
  const ocena = o => (o.nieuczciwe ? -1 : { blad: 0, dopuszczalna: 0.5, dobra: 1 }[o.ocena]);
  let j = 0;
  c.opcje.forEach((o, i) => { if (ocena(o) < ocena(c.opcje[j])) j = i; });
  return j;
};

async function cennik(N = 10, wypisz = console.log) {
  const baza = {};
  for (let seed = 1; seed <= N; seed++) {
    const k = await K.grajAuto('madry', seed, false, () => {}, false);
    baza[seed] = await K.indeksOdpornosci(k);
  }
  const wiersze = [];
  for (const [id, karta] of Object.entries(DEF.karty)) {
    const zla = karta.opcje.reduce((a, o) => (o.nieuczciwe ? o : a.nieuczciwe ? a : o.ocena === 'blad' ? o : a.ocena === 'blad' ? a : o.ocena === 'dopuszczalna' ? o : a), karta.opcje[0]);
    let dW = 0, dIO = 0, dJD = 0, n = 0;
    for (let seed = 1; seed <= N; seed++) {
      let trafila = false;
      const strat = { ...K.AUTO.madry, karta: (c, k) => (c.id === id ? (trafila = true, najgorsza(c)) : K.AUTO.madry.karta(c, k)) };
      const k = await K.grajAuto(strat, seed, false, () => {}, false);
      if (!trafila) continue;
      const io = await K.indeksOdpornosci(k);
      dW += io.kampania - baza[seed].kampania; dIO += io.wynik - baza[seed].wynik; dJD += io.jd - baza[seed].jd; n++;
    }
    if (n) wiersze.push({ id, tekst: zla.tekst, ocena: zla.nieuczciwe ? 'nieuczciwa' : zla.ocena, dW: dW / n, dIO: dIO / n, dJD: (100 * dJD) / n, n });
  }
  wiersze.sort((a, b) => a.dW - b.dW);
  wypisz('karta                      najgorsza opcja                                        ocena         ΔWYNIK   ΔIndeks  ΔJD(pp)  próbek');
  for (const w of wiersze) {
    wypisz(`${w.id.padEnd(26)} ${w.tekst.slice(0, 54).padEnd(54)} ${w.ocena.padEnd(12)} ${w.dW.toFixed(0).padStart(7)} ${w.dIO.toFixed(0).padStart(9)} ${w.dJD.toFixed(1).padStart(8)} ${String(w.n).padStart(7)}`);
  }
  return wiersze;
}

if (require.main === module) cennik(Number(process.argv[2] || 10)).catch(e => { console.error(e); process.exit(1); });
module.exports = { cennik };
