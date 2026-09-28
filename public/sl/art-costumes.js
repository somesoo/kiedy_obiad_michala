// Snakes — RYSUNKI KOSTIUMÓW (SL_COSTUME_ART) i kształty nakładek (SL_COSTUME_SHAPES).
// Katalog (id, slot, nazwa, cena, sezon) żyje TYLKO na serwerze w lib/costumes.js, rysunki
// TYLKO tutaj — payload niesie wyłącznie id, a nieznane id jest pomijane. Nowy kostium =
// wpis w katalogu na serwerze + rysunek tutaj pod tym samym id.
// Kolejność skryptów i zasady ładowania: patrz nagłówek sl/art-effects.js.

// ── KOSTIUMY: rysunki ──
// Serwer (lib/costumes.js) zna tylko id, slot i cenę; tu jest wygląd. Kolory przez klasy
// c-*, żeby motyw sezonu mógł je podmienić. Nieznane id jest po prostu pomijane.
const SL_COSTUME_ART = {
  hat: {
    witch_hat: '<path class="c-hat" d="M2 28 Q20 22 38 28 Q20 33 2 28 Z"/><path class="c-hat" d="M11 26 L18 5 Q21 -1 29 3 Q23 4 22 9 L29 26 Z"/><path class="c-band" d="M11.6 22 L28.4 22 L29 26 L11 26 Z"/><rect class="c-buckle" x="18" y="22" width="4" height="4" rx=".5"/>',
    pumpkin_hat: '<ellipse class="c-pumpkin" cx="20" cy="22" rx="13" ry="9"/><path class="c-rib" d="M20 13 L20 31 M13.5 14.5 Q10 22 13.5 29.5 M26.5 14.5 Q30 22 26.5 29.5"/><path class="c-stem" d="M19 14 Q18 8 22 6 L23.5 8 Q21 10 21.5 14 Z"/><path class="c-leaf" d="M22 9 Q28 4 32 9 Q26 12 22 9 Z"/>',
    horns: '<path class="c-horn" d="M7 31 Q2 17 10 5 Q10 17 16 27 Z"/><path class="c-horn" d="M33 31 Q38 17 30 5 Q30 17 24 27 Z"/>',
    top_hat: '<rect class="c-tophat" x="11" y="3" width="18" height="22" rx="2"/><rect class="c-band-red" x="11" y="17" width="18" height="4"/><ellipse class="c-tophat" cx="20" cy="26" rx="16" ry="3.5"/>',
    // Skiny wsparcia (BLIK) — po jednym na sezon; iskierka mruga (c-sparkle), żeby było
    // widać z daleka, że to coś innego niż czapka za coins.
    supporter_crown: '<path class="c-crown" d="M6 28 L4 10 L12 18 L20 5 L28 18 L36 10 L34 28 Z"/><rect class="c-crown-band" x="5.5" y="23" width="29" height="5" rx="1"/>'
      + '<circle class="c-gem" cx="4" cy="10" r="2.2"/><circle class="c-gem" cx="20" cy="5" r="2.6"/><circle class="c-gem" cx="36" cy="10" r="2.2"/>'
      + '<circle class="c-gem-b" cx="13" cy="25.5" r="1.4"/><circle class="c-gem" cx="20" cy="25.5" r="1.6"/><circle class="c-gem-b" cx="27" cy="25.5" r="1.4"/>'
      + '<path class="c-sparkle" d="M31 0 L32 3 L35 4 L32 5 L31 8 L30 5 L27 4 L30 3 Z"/>',
    pumpkin_king_crown: '<path class="c-kcrown" d="M5 28 L3 9 L10 16 L13 5 L20 12 L27 5 L30 16 L37 9 L35 28 Z"/><rect class="c-kband" x="4.5" y="24" width="31" height="4" rx="1"/>'
      + '<circle class="c-kgem" cx="3" cy="9" r="2"/><circle class="c-kgem" cx="13" cy="5" r="2"/><circle class="c-kgem" cx="27" cy="5" r="2"/><circle class="c-kgem" cx="37" cy="9" r="2"/>'
      + '<ellipse class="c-pumpkin" cx="20" cy="19.5" rx="6" ry="4.6"/><path class="c-rib" d="M20 15 L20 24 M16.8 15.6 Q15.2 19.5 16.8 23.4 M23.2 15.6 Q24.8 19.5 23.2 23.4"/>'
      + '<path class="c-stem" d="M19.4 15.4 Q19 12.6 21 11.8 L21.8 12.8 Q20.6 13.6 20.8 15.4 Z"/>'
      + '<path class="c-kcarve" d="M17 18.6 L18.6 17.2 L19 19.2 Z M23 18.6 L21.4 17.2 L21 19.2 Z M17.4 21 Q20 23.2 22.6 21 Z"/>'
      + '<path class="c-sparkle" d="M33 0 L34 3 L37 4 L34 5 L33 8 L32 5 L29 4 L32 3 Z"/>',
  },
  // Skrzydła: kształt LEWEGO skrzydła. Prawe to jego lustro zrobione w samym SVG (matrix),
  // a nie w CSS — dzięki temu animacja machania nie musi odbijać elementu i oba skrzydła
  // zginają się przy zdjęciu, a nie przeskakują na drugą stronę.
  wings: {
    bat_wings: 'M40 6 C34 2 26 0 18 2 C12 3 5 6 0 4 C3 9 4 13 2 18 C6 15 10 15 12 19 C14 15 18 14 21 18 C23 14 27 13 30 16 C32 12 36 11 40 12 Z',
    demon_wings: 'M40 5 C33 1 22 0 12 3 L0 0 L4 8 L1 14 L8 12.5 L6 21 L14 16 L16 23 L22 15.5 L26 21 L30 14 L40 12 Z',
  },
  gadget: {
    broom: '<path class="c-stick" d="M24 1 L11 29"/><path class="c-straw" d="M10 27 L2 39 L18 39 L15 28 Z"/><path class="c-band" d="M9.4 26 L15.8 27.6 L15 30 L8.6 28.6 Z"/>',
    candy_bucket: '<path class="c-handle" d="M5 19 Q15 4 25 19"/><circle class="c-candy" cx="11" cy="17" r="3"/><circle class="c-candy c-candy-b" cx="18" cy="16" r="3"/><path class="c-bucket" d="M4 19 L26 19 L22.5 39 L7.5 39 Z"/><path class="c-carve" d="M9 25 L12 22 L13.5 26 Z M21 25 L18 22 L16.5 26 Z M10 31 Q15 36 20 31 L18 31 L17 33 L15 31 L13 33 L12 31 Z"/>',
    lantern: '<path class="c-handle" d="M15 0 L15 6"/><circle class="c-glow" cx="15" cy="22" r="13"/><path class="c-lantern" d="M9 8 L21 8 L23 12 L23 32 L21 36 L9 36 L7 32 L7 12 Z"/><rect class="c-flame-box" x="10" y="13" width="10" height="18" rx="2"/><path class="c-flame" d="M15 29 Q11 24 15 17 Q19 24 15 29 Z"/>',
    spider: '<path class="c-thread" d="M15 0 L15 22"/><ellipse class="c-spider" cx="15" cy="28" rx="5" ry="6"/><circle class="c-spider" cx="15" cy="21" r="3.5"/><path class="c-legs" d="M11 25 L4 20 L2 24 M11 29 L3 29 L1 34 M19 25 L26 20 L28 24 M19 29 L27 29 L29 34 M12 32 L6 37 M18 32 L24 37"/><circle class="c-eye" cx="13.6" cy="20.5" r=".9"/><circle class="c-eye" cx="16.4" cy="20.5" r=".9"/>',
  },
  // Nakładki: filtr zdjęcia robi CSS (klasa ov-*), a tu jest to, co leży NA zdjęciu.
  // Pionek zajmuje w tym viewBoxie 2,76..37,24 (warstwa ma inset −8%). Rysunki celowo
  // wychodzą poza zdjęcie (kołnierz, piszczele, śluz): nakładka ma być widoczna z daleka,
  // na małym polu planszy, a nie tylko w podglądzie w garderobie.
  overlay: {
    zombie: '<path class="c-goo" d="M9 33.5 Q10.5 38 11.5 34 Q12.5 41.5 14.5 35 Q16 39 17.5 35.5 L17 33 Z M25 34.5 Q26.5 40.5 28 35 Q29.5 37.5 30.5 33 L29 32 Z"/>'
      + '<path class="c-bandage" d="M1.5 15.5 L15.5 1 L19.5 5 L5.5 19.5 Z"/><path class="c-bandage-line" d="M5 12 L8.5 15.5 M8.5 8.5 L12 12 M12 5 L15.5 8.5"/>'
      + '<path class="c-stitch" d="M21 11 L34 16 M24 9.5 L23 13.5 M27.5 11 L26.5 15 M31 12.5 L30 16.5 M8 27 L20 31 M11 25.5 L10 29.5 M14.5 27 L13.5 31 M17.5 28 L16.5 32"/>',
    vampire: '<path class="c-collar" d="M12.5 38 L2.5 24.5 L-3.5 7.5 L5.5 14 L9 28 Z M27.5 38 L37.5 24.5 L43.5 7.5 L34.5 14 L31 28 Z"/>'
      + '<path class="c-collar-in" d="M11.5 35.5 L4 24.5 L0 12 L6 16.5 L9 28 Z M28.5 35.5 L36 24.5 L40 12 L34 16.5 L31 28 Z"/>'
      + '<path class="c-fang" d="M14.2 28 L17.8 28 L16 36 Z M22.2 28 L25.8 28 L24 36 Z"/>'
      + '<path class="c-blood" d="M16 36.3 Q14.6 38.4 16 39.3 Q17.4 38.4 16 36.3 Z M24 36.3 Q22.6 38.4 24 39.3 Q25.4 38.4 24 36.3 Z"/>',
    skeleton: '<g class="c-bones"><path d="M1 32 L39 42.5 M39 32 L1 42.5"/></g>'
      + '<g class="c-bone-ends"><circle cx="0" cy="30.8" r="2.2"/><circle cx="1.8" cy="33.6" r="2.2"/><circle cx="40" cy="30.8" r="2.2"/><circle cx="38.2" cy="33.6" r="2.2"/>'
      + '<circle cx="0" cy="43.7" r="2.2"/><circle cx="1.8" cy="40.9" r="2.2"/><circle cx="40" cy="43.7" r="2.2"/><circle cx="38.2" cy="40.9" r="2.2"/></g>'
      + '<path class="c-bone-crack" d="M20 3.2 L18 7.5 L21 10.5 L19.5 14 M31.5 9 L28.5 11 L29.5 14"/>',
    pumpkin_frame: '<path class="c-pumpkin-rib" d="M12.5 6.5 Q5.5 20 12.5 36 M27.5 6.5 Q34.5 20 27.5 36 M17 6.2 Q14 20 17 37 M23 6.2 Q26 20 23 37"/>'
      + '<path class="c-vine" d="M22 3 Q27 -1 30 2 Q32 5 29 6 Q27 6 28 4"/>'
      + '<path class="c-leaf" d="M21.5 4 Q14 -3 9 2 Q15 6.5 21.5 4 Z"/>'
      + '<path class="c-stem" d="M18 8 Q17 0.5 21.8 -1.8 L23.6 0.4 Q20.8 2.2 21.4 8 Z"/>',
  },
};

// Kształty nakładek w jednostkach pionka (0..1). JEDNO źródło dla przycięcia zdjęcia
// (clipPath z clipPathUnits="objectBoundingBox" wstrzykiwany raz niżej) i dla obrysu
// w slPawnHtml, więc obrys nie może się rozjechać z krawędzią zdjęcia.
const SL_COSTUME_SHAPES = {
  // Czaszka: kopuła, kości policzkowe i węższa szczęka z zębami.
  skeleton: 'M0.5 0 C0.8 0 1 0.2 1 0.46 C1 0.62 0.93 0.7 0.86 0.74 L0.84 0.88 Q0.84 0.97 0.74 0.97 L0.68 0.97 L0.66 0.91 L0.62 0.97 L0.56 0.97 L0.53 0.91 L0.5 0.97 L0.47 0.91 L0.44 0.97 L0.38 0.97 L0.34 0.91 L0.32 0.97 L0.26 0.97 Q0.16 0.97 0.16 0.88 L0.14 0.74 C0.07 0.7 0 0.62 0 0.46 C0 0.2 0.2 0 0.5 0 Z',
  // Trumna: najszersza na wysokości ramion, zwęża się ku stopom.
  vampire: 'M0.32 0 L0.68 0 L0.96 0.26 L0.7 1 L0.3 1 L0.04 0.26 Z',
  // Poszarpana twarz z odgryzionym kawałkiem w prawym górnym rogu.
  zombie: 'M0.5 0 L0.603 0.047 L0.69 0.105 L0.679 0.275 L0.748 0.302 L0.868 0.323 L0.987 0.389 L0.96 0.5 L0.968 0.607 L0.905 0.695 L0.883 0.806 L0.793 0.867 L0.697 0.91 L0.608 0.973 L0.5 0.965 L0.389 0.987 L0.3 0.914 L0.201 0.875 L0.133 0.793 L0.095 0.695 L0.022 0.609 L0.035 0.5 L0.032 0.393 L0.09 0.303 L0.109 0.188 L0.207 0.133 L0.29 0.063 L0.398 0.052 Z',
  // Dynia: szersza niż wyższa, z wcięciami między żebrami u góry i u dołu.
  pumpkin_frame: 'M0.5 0.13 C0.6 0.04 0.72 0.07 0.77 0.14 C0.93 0.12 1 0.32 1 0.53 C1 0.77 0.9 0.95 0.75 0.92 C0.68 0.99 0.58 1 0.5 0.95 C0.42 1 0.32 0.99 0.25 0.92 C0.1 0.95 0 0.77 0 0.53 C0 0.32 0.07 0.12 0.23 0.14 C0.28 0.07 0.4 0.04 0.5 0.13 Z',
};
(function slInjectCostumeShapes() {
  const defs = Object.entries(SL_COSTUME_SHAPES)
    .map(([id, d]) => `<clipPath id="sl-shape-${id}" clipPathUnits="objectBoundingBox"><path d="${d}"/></clipPath>`).join('');
  document.body.insertAdjacentHTML('beforeend',
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>`);
})();
