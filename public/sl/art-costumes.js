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
    // ── Klasyka (sezon 3) ──
    beret: '<path class="c-beret" d="M2 25 Q2 13 19 11 Q35 10 38 20 Q36 26 20 27.5 Q6 28.5 2 25 Z"/><path class="c-beret-band" d="M4.5 24.5 Q20 28.5 35.5 22.5 L36 25 Q20 31 4 27 Z"/><path class="c-beret-stalk" d="M19 11.2 Q19.5 7.5 22 6.5"/>',
    beanie: '<path class="c-beanie" d="M6 24 Q6 8.5 20 8.5 Q34 8.5 34 24 Z"/><path class="c-beanie-stripe" d="M7.6 15.5 Q20 12 32.4 15.5 L33.4 19 Q20 15.6 6.6 19 Z"/>'
      + '<rect class="c-beanie-cuff" x="4" y="22" width="32" height="7.5" rx="2.5"/><path class="c-beanie-rib" d="M9 23.5 L9 28 M14 23.5 L14 28 M19 23.5 L19 28 M24 23.5 L24 28 M29 23.5 L29 28 M33 23.5 L33 28"/>'
      + '<circle class="c-pompom" cx="20" cy="6" r="5"/>',
    // Wianek: gałązka dookoła czubka głowy, liście w trzech kolorach jesieni, klon z przodu.
    leaf_crown: '<path class="c-twig" d="M2 29 Q4 10 20 9.5 Q36 10 38 29"/>'
      + '<ellipse class="c-aleaf-y" cx="4.5" cy="23" rx="4.6" ry="2.3" transform="rotate(-70 4.5 23)"/><ellipse class="c-aleaf-r" cx="35.5" cy="23" rx="4.6" ry="2.3" transform="rotate(70 35.5 23)"/>'
      + '<ellipse class="c-aleaf-o" cx="7.5" cy="15" rx="4.8" ry="2.4" transform="rotate(-45 7.5 15)"/><ellipse class="c-aleaf-y" cx="32.5" cy="15" rx="4.8" ry="2.4" transform="rotate(45 32.5 15)"/>'
      + '<ellipse class="c-aleaf-r" cx="13" cy="10.5" rx="4.8" ry="2.4" transform="rotate(-20 13 10.5)"/><ellipse class="c-aleaf-o" cx="27" cy="10.5" rx="4.8" ry="2.4" transform="rotate(20 27 10.5)"/>'
      + '<path class="c-maple" d="M20 1 L22 6 L26.5 4 L25 9 L30 10.5 L25 13 L25.5 16.5 L21 15 L20.5 19 L19.5 19 L19 15 L14.5 16.5 L15 13 L10 10.5 L15 9 L13.5 4 L18 6 Z"/>'
      + '<circle class="c-acorn" cx="9.5" cy="20" r="1.8"/><circle class="c-acorn" cx="30.5" cy="20" r="1.8"/>',
    // ── Noc Duchów ──
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
    golden_laurel: '<path class="c-laurel-stem" d="M3 29 Q5 7 17.5 7 M37 29 Q35 7 22.5 7"/><path class="c-laurel" d="M3.3 26.4 Q0.7 24.9 1 21.9 Q3.5 23.4 3.3 26.4 Z M3.3 26.4 Q3.8 23.5 6.7 22.6 Q6.2 25.6 3.3 26.4 Z M4.2 21 Q2 19.2 2.5 16.4 Q4.8 18.1 4.2 21 Z M4.2 21 Q5 18.2 7.9 17.7 Q7.1 20.4 4.2 21 Z M5.6 16.4 Q3.7 14.5 4.6 11.9 Q6.6 13.8 5.6 16.4 Z M5.6 16.4 Q6.7 13.9 9.5 13.8 Q8.4 16.3 5.6 16.4 Z M7.5 12.7 Q6 10.6 7.3 8.3 Q8.8 10.5 7.5 12.7 Z M7.5 12.7 Q9 10.6 11.5 11 Q10.1 13.1 7.5 12.7 Z M9.7 10 Q8.9 7.6 10.7 5.9 Q11.5 8.2 9.7 10 Z M9.7 10 Q11.6 8.3 13.9 9.3 Q12 11 9.7 10 Z M12.4 8.1 Q12.3 5.7 14.4 4.7 Q14.5 7 12.4 8.1 Z M12.4 8.1 Q14.6 7.1 16.4 8.7 Q14.2 9.7 12.4 8.1 Z M15.6 7.1 Q16.1 5 18.3 4.6 Q17.8 6.8 15.6 7.1 Z M15.6 7.1 Q17.8 6.8 18.9 8.8 Q16.7 9.1 15.6 7.1 Z M36.7 26.4 Q39.3 24.9 39 21.9 Q36.5 23.4 36.7 26.4 Z M36.7 26.4 Q36.2 23.5 33.3 22.6 Q33.8 25.6 36.7 26.4 Z M35.8 21 Q38 19.2 37.5 16.4 Q35.2 18.1 35.8 21 Z M35.8 21 Q35 18.2 32.1 17.7 Q32.9 20.4 35.8 21 Z M34.4 16.4 Q36.3 14.5 35.4 11.9 Q33.4 13.8 34.4 16.4 Z M34.4 16.4 Q33.3 13.9 30.5 13.8 Q31.6 16.3 34.4 16.4 Z M32.5 12.7 Q34 10.6 32.7 8.3 Q31.2 10.5 32.5 12.7 Z M32.5 12.7 Q31 10.6 28.5 11 Q29.9 13.1 32.5 12.7 Z M30.3 10 Q31.1 7.6 29.3 5.9 Q28.5 8.2 30.3 10 Z M30.3 10 Q28.4 8.3 26.1 9.3 Q28 11 30.3 10 Z M27.6 8.1 Q27.7 5.7 25.6 4.7 Q25.5 7 27.6 8.1 Z M27.6 8.1 Q25.4 7.1 23.6 8.7 Q25.8 9.7 27.6 8.1 Z M24.4 7.1 Q23.9 5 21.7 4.6 Q22.2 6.8 24.4 7.1 Z M24.4 7.1 Q22.2 6.8 21.1 8.8 Q23.3 9.1 24.4 7.1 Z"/>'
      + '<circle class="c-gem" cx="20" cy="7.5" r="2.4"/><circle class="c-laurel-berry" cx="3" cy="29" r="1.6"/><circle class="c-laurel-berry" cx="37" cy="29" r="1.6"/>'
      + '<path class="c-sparkle" d="M33 0 L34 3 L37 4 L34 5 L33 8 L32 5 L29 4 L32 3 Z"/><path class="c-sparkle c-sparkle-late" d="M6 1 L6.8 3.2 L9 4 L6.8 4.8 L6 7 L5.2 4.8 L3 4 L5.2 3.2 Z"/>',
    // Nagroda za polowanie na cukierki (Noc Duchów): korona z laską cukrową w obręczy,
    // trzema lizakami i dwoma cukierkami w papierkach. Świeci jak skiny wsparcia.
    candy_hunter_prize: '<path class="c-lolly-stick" d="M11.5 23 L9.5 10 M20 23 L20 8 M28.5 23 L30.5 10"/>'
      + '<circle class="c-lolly-a" cx="9.5" cy="8" r="4.6"/><circle class="c-lolly-b" cx="20" cy="5.5" r="5.3"/><circle class="c-lolly-c" cx="30.5" cy="8" r="4.6"/>'
      + '<path class="c-swirl" d="M9.5 8 m-2.6 0 a2.6 2.6 0 1 1 2.6 2.6 a1.3 1.3 0 1 1 -1.3 -1.3 M20 5.5 m-3 0 a3 3 0 1 1 3 3 a1.5 1.5 0 1 1 -1.5 -1.5 M30.5 8 m-2.6 0 a2.6 2.6 0 1 1 2.6 2.6 a1.3 1.3 0 1 1 -1.3 -1.3"/>'
      + '<rect class="c-ccrown-band" x="3.5" y="21.5" width="33" height="8" rx="3"/>'
      + '<path class="c-ccrown-stripe" d="M8 21.5 L11 21.5 L8 29.5 L5 29.5 Z M14 21.5 L17 21.5 L14 29.5 L11 29.5 Z M20 21.5 L23 21.5 L20 29.5 L17 29.5 Z M26 21.5 L29 21.5 L26 29.5 L23 29.5 Z M32 21.5 L35 21.5 L32 29.5 L29 29.5 Z"/>'
      + '<path class="c-wrapper" d="M10.5 25.5 L7 22.5 L7 28.5 Z M17.5 25.5 L21 22.5 L21 28.5 Z M22.5 25.5 L19 22.5 L19 28.5 Z M29.5 25.5 L33 22.5 L33 28.5 Z"/>'
      + '<ellipse class="c-candy" cx="14" cy="25.5" rx="3.8" ry="2.6"/><ellipse class="c-candy c-candy-b" cx="26" cy="25.5" rx="3.8" ry="2.6"/>'
      + '<path class="c-sparkle" d="M36 0 L37 3 L40 4 L37 5 L36 8 L35 5 L32 4 L35 3 Z"/><path class="c-sparkle c-sparkle-late" d="M3 13 L3.8 15.2 L6 16 L3.8 16.8 L3 19 L2.2 16.8 L0 16 L2.2 15.2 Z"/>',
  },
  // Skrzydła: kształt LEWEGO skrzydła. Prawe to jego lustro zrobione w samym SVG (matrix),
  // a nie w CSS — dzięki temu animacja machania nie musi odbijać elementu i oba skrzydła
  // zginają się przy zdjęciu, a nie przeskakują na drugą stronę.
  wings: {
    // ── Klasyka ──
    angel_wings: 'M40 8 C34 2 22 0 11 1.5 C5 2.5 1 5 0 8 C4 8 6.5 9 7.5 10.5 C3.5 11.5 1.5 13.5 1.5 16 C5.5 15 8.5 15.5 10.5 16.5 C7.5 18.5 6.5 20.5 7.5 23 C11.5 20.5 15.5 19.5 18.5 19.5 C22.5 20.5 26.5 19.5 30.5 17.5 C34.5 15.5 38 13.5 40 12.5 Z',
    // Motyl: oczko w górnym skrzydle to DZIURA (fill-rule evenodd w CSS), bo skrzydło
    // jest jedną ścieżką w jednym kolorze.
    butterfly_wings: 'M40 10 C34 0 20 -1.5 8 1.5 C2 3 -0.5 8.5 3.5 11.5 C8 14 16 12.5 24 12 C18 14 10 17 11.5 21.5 C13.5 25 26 22 32 17 C36 14 39 12 40 12 Z M12 6 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 Z',
    // Husaria na 11 listopada: wąska rama łukiem od pleców, nad nią wachlarz długich piór
    // (od pionu przy plecach do skosu na końcu). Każde pióro to osobny kontur.
    hussar_wings: 'M6 14 Q5.6 7.7 0.7 5.5 Q0.5 10.9 6 14 Z M9.7 16.4 Q9.7 9.9 4.8 7.1 Q4.4 12.7 9.7 16.4 Z M13.6 18.5 Q13.9 11.7 9.1 8.4 Q8.4 14.1 13.6 18.5 Z M17.7 20.1 Q18.3 13.1 13.7 9.2 Q12.7 15.2 17.7 20.1 Z M21.8 21.3 Q22.8 14.1 18.4 9.7 Q17.1 15.8 21.8 21.3 Z M26.1 22.2 Q27.6 14.8 23.4 9.8 Q21.7 16 26.1 22.2 Z M30.6 22.6 Q32.5 15 28.7 9.6 Q26.5 15.9 30.6 22.6 Z M35.1 22.7 Q37.6 14.9 34.1 9 Q31.6 15.4 35.1 22.7 Z M40 24 Q20 26 4 14.5 Q20 22.5 40 21 Z',
    // ── Noc Duchów ──
    bat_wings: 'M40 6 C34 2 26 0 18 2 C12 3 5 6 0 4 C3 9 4 13 2 18 C6 15 10 15 12 19 C14 15 18 14 21 18 C23 14 27 13 30 16 C32 12 36 11 40 12 Z',
    demon_wings: 'M40 5 C33 1 22 0 12 3 L0 0 L4 8 L1 14 L8 12.5 L6 21 L14 16 L16 23 L22 15.5 L26 21 L30 14 L40 12 Z',
  },
  gadget: {
    // ── Klasyka ──
    umbrella: '<path class="c-umb-shaft" d="M15 4.5 L15 1.5 M15 15 L15 34 Q15 38 11.5 38 Q8 38 8 34.5"/>'
      + '<path class="c-umbrella" d="M1.5 16 Q2.5 4 15 4 Q27.5 4 28.5 16 Q25.5 13.5 22.5 16 Q18.8 13.5 15 16 Q11.2 13.5 7.5 16 Q4.5 13.5 1.5 16 Z"/>'
      + '<path class="c-umb-rib" d="M15 4.5 Q10.5 8 7.5 15.5 M15 4.5 Q19.5 8 22.5 15.5 M15 4.5 L15 15.5"/>'
      + '<path class="c-drop" d="M3 22 Q1.5 25 3 26 Q4.5 25 3 22 Z M26 25 Q24.5 28 26 29 Q27.5 28 26 25 Z M22 33 Q20.8 35.4 22 36.2 Q23.2 35.4 22 33 Z"/>',
    coffee: '<path class="c-steam" d="M10 13 Q8 10 10 7 Q12 4 10 1 M16 13 Q14 10 16 7 Q18 4 16 1"/>'
      + '<path class="c-mug-handle" d="M20.6 20 Q27 20 27 26 Q27 32 20.2 32"/>'
      + '<path class="c-mug" d="M5 15.5 L21 15.5 L20 36 Q20 38.5 17.5 38.5 L8.5 38.5 Q6 38.5 6 36 Z"/>'
      + '<ellipse class="c-coffee" cx="13" cy="16.4" rx="7.4" ry="1.5"/>'
      + '<path class="c-mug-heart" d="M13 31 L9.4 27.2 Q8 25.2 9.8 23.9 Q11.8 22.9 13 24.9 Q14.2 22.9 16.2 23.9 Q18 25.2 16.6 27.2 Z"/>',
    // Rogal świętomarciński (11 listopada): segmenty jak w rogalu, lukier i orzechy.
    rogal: '<ellipse class="c-rogal" cx="4.5" cy="31.5" rx="3" ry="5" transform="rotate(40 4.5 31.5)"/><ellipse class="c-rogal" cx="25.5" cy="31.5" rx="3" ry="5" transform="rotate(-40 25.5 31.5)"/>'
      + '<ellipse class="c-rogal" cx="9" cy="26" rx="4.2" ry="6.2" transform="rotate(25 9 26)"/><ellipse class="c-rogal" cx="21" cy="26" rx="4.2" ry="6.2" transform="rotate(-25 21 26)"/>'
      + '<ellipse class="c-rogal" cx="15" cy="24" rx="5" ry="7"/>'
      + '<path class="c-icing" d="M6 24 Q9 20.5 12 21.5 Q15 18 18 21.5 Q21 20.5 24 24"/>'
      + '<circle class="c-nut" cx="11" cy="22" r=".9"/><circle class="c-nut" cx="15" cy="19.5" r=".9"/><circle class="c-nut" cx="19" cy="22" r=".9"/><circle class="c-nut" cx="13.5" cy="23.5" r=".8"/><circle class="c-nut" cx="16.8" cy="23.4" r=".8"/>',
    // ── Noc Duchów ──
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
    // ── Klasyka ──
    // Kino nieme: czarno-biały ekran między dwoma paskami taśmy filmowej.
    film_noir: '<rect class="c-film" x="-3.5" y="-1" width="6.5" height="42" rx="1"/><rect class="c-film" x="37" y="-1" width="6.5" height="42" rx="1"/>'
      + '<path class="c-film-hole" d="M-1.8 1 h3 v3 h-3 Z M-1.8 7 h3 v3 h-3 Z M-1.8 13 h3 v3 h-3 Z M-1.8 19 h3 v3 h-3 Z M-1.8 25 h3 v3 h-3 Z M-1.8 31 h3 v3 h-3 Z M-1.8 37 h3 v3 h-3 Z'
      + ' M38.8 1 h3 v3 h-3 Z M38.8 7 h3 v3 h-3 Z M38.8 13 h3 v3 h-3 Z M38.8 19 h3 v3 h-3 Z M38.8 25 h3 v3 h-3 Z M38.8 31 h3 v3 h-3 Z M38.8 37 h3 v3 h-3 Z"/>'
      + '<path class="c-film-scratch" d="M13 4 L12 18 M27 20 L28.5 36"/>',
    // Jesienna ramka: zdjęcie w kształcie liścia, ogonek i dwa listki przy krawędzi.
    autumn_frame: '<path class="c-twig" d="M5 36 L-1.5 42.5"/>'
      + '<ellipse class="c-aleaf-r" cx="36" cy="33" rx="5.5" ry="2.8" transform="rotate(-35 36 33)"/><ellipse class="c-aleaf-y" cx="4" cy="6" rx="5" ry="2.6" transform="rotate(-35 4 6)"/>'
      + '<path class="c-maple" d="M40 23 L41 25.5 L43.5 24.5 L42.8 27 L45 28 L42.5 29 L42.7 31 L40.5 30.2 L40.2 32.5 L39.8 32.5 L39.5 30.2 L37.3 31 L37.5 29 L35 28 L37.2 27 L36.5 24.5 L39 25.5 Z"/>',
    // Szron: zdjęcie-sześciokąt, sople z górnej krawędzi i płatki śniegu.
    frost: '<path class="c-ice" d="M11.4 3.8 L28.6 3.8 L27.5 5.5 L26.2 11.5 L24.8 5.8 L22.6 9.5 L21.2 5.6 L19.6 13.5 L18 5.8 L15.8 9 L14.4 5.6 L13 8 Z"/>'
      + '<path class="c-flake" d="M37 30 L37 37 M34 31.8 L40 35.2 M34 35.2 L40 31.8 M3 6 L3 12 M0.4 7.5 L5.6 10.5 M0.4 10.5 L5.6 7.5 M6 33 L6 37 M4.3 34 L7.7 36 M4.3 36 L7.7 34"/>',
    // ── Noc Duchów ──
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
  // Stary ekran: prostokąt z lekko wypukłymi bokami, jak kineskop.
  film_noir: 'M0.1 0.04 Q0.5 -0.01 0.9 0.04 Q0.99 0.5 0.9 0.96 Q0.5 1.01 0.1 0.96 Q0.01 0.5 0.1 0.04 Z',
  // Liść: zaostrzony w prawym górnym i lewym dolnym rogu.
  autumn_frame: 'M0.96 0.04 C1.04 0.6 0.7 1 0.06 0.94 C0 0.4 0.3 -0.02 0.96 0.04 Z',
  // Sześciokąt jak kryształek lodu, płaska góra pod sople.
  frost: 'M0.25 0.03 L0.75 0.03 L1 0.5 L0.75 0.97 L0.25 0.97 L0 0.5 Z',
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
