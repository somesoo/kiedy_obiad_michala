// Porównanie stylów gry w kampanii (20 ziaren): node ciso-sim/proto/porownaj-style.js
// Wynik zapisujemy w proto/wyniki-kampania-*.txt, wnioski w docs/16-kampania-wodociagi.md.
const K = require('./kampania');
(async () => {
  const N = 20;
  console.log('styl          straty    wydatki   audyt  zaufanie  ukryte  zakłóc.  reput.  mandat  P(poważny)  JD');
  for (const s of ['rozsadny', 'odmawiajacy', 'bierny']) {
    const a = { straty: 0, wyd: 0, audyt: 0, zauf: 0, ukr: 0, zak: 0, rep: 0, man: 0, pow: 0, jd: 0 };
    for (let seed = 1; seed <= N; seed++) {
      const k = await K.grajAuto(s, seed, false, () => {}, false);
      a.straty += k.st.w.straty; a.wyd += k.st.w.wydatki; a.audyt += k.kontrola.wynik;
      const dz = Object.values(k.dzialy);
      a.zauf += dz.reduce((x, d) => x + d.zaufanie, 0) / dz.length;
      a.ukr += dz.reduce((x, d) => x + d.ukryte.filter(u => !u.odkryte).length, 0);
      a.zak += k.incydenty.filter(i => /sabota|S03|fala/.test(i.rodzaj) && i.pln > 0).length;
      a.rep += k.wskazniki.reputacja; a.man += k.wskazniki.mandat;
      a.pow += k.flagi.incydent_powazny ? 1 : 0;
      a.jd += k.decyzje.reduce((x, d) => x + ({ dobra: 1, dopuszczalna: 0.5, blad: 0 })[d.ocena], 0) / Math.max(1, k.decyzje.length);
    }
    const f = n => (n / N / 1000).toFixed(0).padStart(6) + ' tys.';
    console.log(s.padEnd(12), f(a.straty), f(a.wyd), (a.audyt / N).toFixed(0).padStart(5), (a.zauf / N).toFixed(2).padStart(9),
      (a.ukr / N).toFixed(1).padStart(7), (a.zak / N).toFixed(1).padStart(8), (a.rep / N).toFixed(0).padStart(7), (a.man / N).toFixed(0).padStart(7),
      ((100 * a.pow) / N).toFixed(0).padStart(10) + '%', ((100 * a.jd) / N).toFixed(0).padStart(4) + '%');
  }
})();
