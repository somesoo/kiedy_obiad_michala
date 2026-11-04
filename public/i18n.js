// Warstwa językowa (PL/EN) dla stron graczy: Snakes i Wordle. Ładuje się w <head>, PRZED
// resztą skryptów i przed treścią strony.
//
// Jak to działa — i dlaczego tak, a nie kluczami w każdym miejscu kodu:
// Front składa teksty w setkach miejsc (szablony HTML w snakes.js, sl/*.js, app.js), a do
// tego dochodzą teksty z serwera (błędy, dziennik aktywności, nazwy kostiumów i klątw).
// Przepisanie wszystkiego na t('klucz') to refaktor całego frontu bez testów, a dziennik
// i tak jest zapisany w bazie po polsku (i parsowany po treści przy cofaniu dnia — patrz
// CLAUDE.md), więc nie dałoby się go przetłumaczyć „u źródła". Dlatego:
//  • KLUCZEM jest polski tekst, dokładnie taki, jaki ląduje w DOM-ie; słowniki w
//    public/i18n/en-*.js mapują go na angielski (z miejscami na liczby: {n}, {nick}…),
//  • w trybie EN MutationObserver tłumaczy każdy tekst w chwili, gdy trafia na stronę —
//    niezależnie od tego, czy wstawił go snakes.js, app.js, czy przyszedł z serwera,
//  • brak tłumaczenia = zostaje polski tekst (nic się nie psuje), a brakujące klucze
//    zbiera window.i18nMissing() w konsoli,
//  • w trybie PL nic z tego nie działa (zero narzutu), słowniki nawet się nie rejestrują.
// Długie akapity składane z liczb (np. regulamin bossa) mają osobną wersję angielską
// w kodzie przez I18N.pick(pl, en) — słownik do nich byłby kruchym klonem szablonu.
// Teksty z panelu admina (regulamin, opisy) przychodzą już w dobrym języku (lib/content.js).
//
// Hasła Wordle zostają po polsku — siatka i klawiatura mają data-i18n-skip.
(function () {
  'use strict';

  const STORE_KEY = 'ui_lang';
  let lang = 'pl';
  try { if (localStorage.getItem(STORE_KEY) === 'en') lang = 'en'; } catch (e) { /* tryb prywatny: zostaje PL */ }

  const exact = new Map();        // tekst → tekst
  const exactHtml = new Map();    // innerHTML → innerHTML (treść z <strong> itp. w środku)
  const textPatterns = { byPrefix: new Map(), bySuffix: new Map(), generic: [] };
  const htmlPatterns = [];
  const missing = new Set();
  const memo = new Map();

  const I18N = window.I18N = {
    lang,
    pick(pl, en) { return lang === 'en' ? en : pl; },
    // Rejestracja słownika. W trybie PL nic nie robi — tłumaczyć nie ma czego.
    add(dict) {
      if (lang !== 'en') return;
      for (const k of Object.keys(dict)) addEntry(k, dict[k]);
      memo.clear();
    },
    setLang(next) {
      try { localStorage.setItem(STORE_KEY, next === 'en' ? 'en' : 'pl'); } catch (e) { /* bez pamięci */ }
      // Przeładowanie zamiast tłumaczenia „w locie" z powrotem: tłumaczenie idzie tylko w jedną
      // stronę (PL → EN), a stan gry i tak dociąga się w sekundę.
      location.reload();
    },
    t(text) { return lang === 'en' ? (translateText(String(text)) || String(text)) : String(text); },
    loadContent,
    missing
  };
  window.i18nMissing = () => [...missing].sort();

  // ── SŁOWNIK ──
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PH = /\{(\w*)\}/g;

  function addEntry(rawKey, value) {
    const key = norm(rawKey);
    const html = /<[a-z]/i.test(key);
    if (!/\{\w*\}/.test(key)) {
      (html ? exactHtml : exact).set(key, value);
      return;
    }
    const names = [];
    const parts = key.split(PH); // parzyste = tekst, nieparzyste = nazwy miejsc
    const literals = parts.filter((_, i) => i % 2 === 0);
    let src = '^', n = 0;
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) src += reEsc(parts[i]);
      else {
        names.push(parts[i] || String(n++));
        // W HTML-u miejsce na liczbę/nick nie może połknąć tagu — inaczej sklejalibyśmy
        // fragmenty znaczników w nowej kolejności.
        src += html ? '([^<>]*?)' : '(.+?)';
      }
    }
    src += '$';
    const p = {
      re: new RegExp(src, 's'), names, value,
      weight: literals.join('').length
    };
    if (html) { htmlPatterns.push(p); htmlPatterns.sort((a, b) => b.weight - a.weight); return; }
    const prefix = literals[0], suffix = literals[literals.length - 1];
    let bucket;
    if (prefix.length >= 2) bucket = getBucket(textPatterns.byPrefix, prefix.slice(0, 2));
    else if (suffix.length >= 2) bucket = getBucket(textPatterns.bySuffix, suffix.slice(-2));
    else bucket = textPatterns.generic;
    bucket.push(p);
    bucket.sort((a, b) => b.weight - a.weight);
  }
  function getBucket(map, k) {
    if (!map.has(k)) map.set(k, []);
    return map.get(k);
  }

  function fill(p, m) {
    const caps = {};
    p.names.forEach((name, i) => {
      const raw = m[i + 1];
      // Wstawka (nazwa kostiumu, dzień tygodnia…) też może mieć tłumaczenie.
      // Słowo z samych wielkich liter to hasło Wordle albo skrót — nie ruszamy.
      caps[name] = /\p{L}{2}/u.test(raw) && !/^[\p{Lu}\d\s]+$/u.test(raw) ? capture(raw) : raw;
    });
    let seq = 0;
    return p.value.replace(PH, (_, name) => {
      const k = name || String(seq++);
      return caps[k] != null ? caps[k] : '';
    });
  }

  // Wstawka bez brzegowych ozdobników albo lista „a, b, c" (np. notatki ruchu).
  function capture(raw) {
    const t = lookup(raw);
    if (t != null) return t;
    // Lista tylko wtedy, gdy KAŻDY kawałek ma tłumaczenie — inaczej wyszłaby mieszanka języków.
    if (raw.includes(', ')) {
      const parts = raw.split(', ').map(x => (/\p{L}{2}/u.test(x) ? lookup(x) : x));
      if (parts.every(x => x != null)) return parts.join(', ');
    }
    return raw;
  }

  // Najlepszy wzorzec = ten z najdłuższym stałym tekstem. Kubełki (po początku, po końcu,
  // ogólne) są posortowane osobno, więc wybieramy globalnie — inaczej ogólny „{n} coins"
  // z kubełka końcówek łapałby całe zdanie, które ma własny, dokładniejszy wzorzec.
  function bestPattern(s) {
    let best = null;
    for (const bucket of [textPatterns.byPrefix.get(s.slice(0, 2)), textPatterns.bySuffix.get(s.slice(-2)), textPatterns.generic]) {
      if (!bucket) continue;
      for (const p of bucket) {
        if (best && p.weight <= best.p.weight) break; // kubełek posortowany malejąco
        const m = p.re.exec(s);
        if (m) { best = { p, m }; break; }
      }
    }
    return best;
  }
  function patternLookup(s) {
    const b = bestPattern(s);
    return b ? fill(b.p, b.m) : null;
  }

  // Dokładnie, wzorcem, a na koniec bez ozdobników z brzegów (emoji, liczby, kropki):
  // „🎲 Rzuć kostką (2/3)" trafia w klucz „Rzuć kostką".
  // Kolejność ma znaczenie: dokładne trafienie (także po obcięciu brzegów) zawsze wygrywa
  // ze wzorcem — inaczej ogólny wzorzec połknąłby tekst, który ma własne tłumaczenie.
  function lookup(s, affix = true) {
    if (exact.has(s)) return exact.get(s);
    const variants = [];
    if (affix) {
      // Sam początek (klucz może kończyć się kropką czy „!"), potem oba brzegi.
      const head = s.match(/^([^\p{L}]+)(.*)$/su);
      if (head && /\p{L}{2}/u.test(head[2])) variants.push([head[1], head[2], '']);
      const m = s.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/su);
      if (m && (m[1] || m[3]) && /\p{L}{2}/u.test(m[2])) variants.push([m[1], m[2], m[3]]);
    }
    for (const [a, core, b] of variants) if (exact.has(core)) return a + exact.get(core) + b;
    // Wzorzec na całości albo na obciętym środku — wygrywa dokładniejszy.
    let best = null;
    for (const [a, core, b] of [['', s, ''], ...variants]) {
      const hit = bestPattern(core);
      if (hit && (!best || hit.p.weight > best.hit.p.weight)) best = { hit, a, b };
    }
    return best ? best.a + fill(best.hit.p, best.hit.m) + best.b : null;
  }

  const LOOKS_PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(nie|jest|się|dla|pole|pól|pkt|już|lub|albo|bez|ruch|rzut|gracz|dziś|masz|jeszcze|tylko|przez|sezon|Wpłać|Kup|Zdejmij)\b/;

  function translateText(core) {
    if (memo.has(core)) return memo.get(core);
    let out = lookup(core);
    // Teksty sklejane z kawałków: „rzut 4 · postęp 2", „🪜 drabina w górę! 🍭 Cukierek!".
    if (out == null) out = splitJoin(core, ' · ', /\s·\s/);
    if (out == null) out = splitJoin(core, ' ', /(?<=[.!?…])\s+(?=\S)/);
    if (out == null && LOOKS_PL.test(core)) missing.add(core);
    if (memo.size > 5000) memo.clear();
    memo.set(core, out);
    return out;
  }
  function splitJoin(core, joiner, re) {
    const parts = core.split(re);
    if (parts.length < 2) return null;
    let any = false;
    const out = parts.map(part => {
      const t = lookup(part);
      if (t != null) { any = true; return t; }
      if (LOOKS_PL.test(part)) missing.add(part);
      return part;
    });
    return any ? out.join(joiner) : null;
  }

  // ── DOM ──
  if (lang !== 'en') {
    loadDomReady();
    return;
  }
  document.documentElement.lang = 'en';

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'TEMPLATE', 'CODE', 'PRE']);
  const INLINE_SEL = 'strong,b,em,i,span,a,br,s,small,sup,sub,mark,u';
  const ATTRS = ['title', 'placeholder', 'aria-label'];

  function skipEl(el) {
    return SKIP.has(el.tagName) || el instanceof SVGElement || el.hasAttribute('data-i18n-skip');
  }
  function insideSkip(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest('[data-i18n-skip],script,style,textarea,svg');
  }

  function translateTextNode(node) {
    const s = node.data;
    if (!/\p{L}{2}/u.test(s)) return;
    const core = norm(s);
    const t = translateText(core);
    if (t == null || t === core) return;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    node.data = (lead ? ' ' : '') + t + (trail ? ' ' : '');
  }

  function translateAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !/\p{L}{2}/u.test(v)) continue;
      const t = translateText(norm(v));
      if (t != null && t !== v) el.setAttribute(a, t);
    }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) {
      const t = translateText(norm(el.value));
      if (t != null) el.value = t;
    }
  }

  // Element „mieszany": tekst i znaczniki liniowe w jednym zdaniu („Masz <strong>3</strong>
  // ruchy"). Tłumaczymy go w całości, bo kawałek po kawałku zdanie by się rozsypało.
  function isMixed(el) {
    let text = false, elem = false;
    for (const c of el.childNodes) {
      if (c.nodeType === 3 && /\S/.test(c.data)) text = true;
      else if (c.nodeType === 1) elem = true;
    }
    if (!text || !elem) return false;
    if (el.querySelector(`:not(${INLINE_SEL})`)) return false;
    return el.innerHTML.length < 4000;
  }
  function tryHtml(el) {
    const key = norm(el.innerHTML);
    let out = exactHtml.get(key);
    if (out == null) {
      for (const p of htmlPatterns) {
        const m = p.re.exec(key);
        if (m) { out = fill(p, m); break; }
      }
    }
    if (out == null) return false;
    el.innerHTML = out;
    return true;
  }

  function processNode(node) {
    if (node.nodeType === 3) { translateTextNode(node); return; }
    if (node.nodeType !== 1) return;
    // SVG zostaje nietknięte poza <title> (dymki na drabinach i wężach planszy).
    if (node instanceof SVGElement) {
      if (!node.closest('[data-i18n-skip]')) {
        node.querySelectorAll('title').forEach(t => t.firstChild && translateTextNode(t.firstChild));
      }
      return;
    }
    if (skipEl(node)) return;
    translateAttrs(node);
    if (isMixed(node) && tryHtml(node)) {
      node.querySelectorAll('[title],[placeholder],[aria-label]').forEach(translateAttrs);
      return;
    }
    for (const c of [...node.childNodes]) processNode(c);
  }

  function handle(records) {
    const done = new Set();
    for (const r of records) {
      if (r.type === 'attributes') {
        if (!insideSkip(r.target)) translateAttrs(r.target);
        continue;
      }
      if (r.type === 'characterData') {
        if (!insideSkip(r.target)) translateTextNode(r.target);
        continue;
      }
      const t = r.target;
      if (t.nodeType === 1 && !done.has(t) && !insideSkip(t) && isMixed(t)) {
        done.add(t);
        processNode(t);
        continue;
      }
      for (const n of r.addedNodes) {
        if (done.has(n) || !n.isConnected || insideSkip(n)) continue;
        done.add(n);
        processNode(n);
      }
    }
  }

  const observer = new MutationObserver(records => {
    handle(records);
    // Nasze własne podmiany też są mutacjami — odrzucamy je, bo już przetłumaczone.
    observer.takeRecords();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS
  });

  // Okienka przeglądarki nie są w DOM-ie.
  for (const fn of ['alert', 'confirm', 'prompt']) {
    const orig = window[fn];
    window[fn] = function (msg, ...rest) { return orig.call(window, I18N.t(msg == null ? '' : msg), ...rest); };
  }

  function fullPass() {
    if (document.body) processNode(document.body);
    observer.takeRecords();
    const t = translateText(norm(document.title));
    if (t) document.title = t;
  }
  document.addEventListener('DOMContentLoaded', fullPass);
  loadDomReady();

  // ── WSPÓLNE DLA OBU JĘZYKÓW ──
  function loadDomReady() {
    document.addEventListener('DOMContentLoaded', () => {
      mountToggle();
    });
  }

  // Przełącznik języka w nagłówku (obie strony mają .header-user).
  function mountToggle() {
    const host = document.querySelector('.header-user');
    if (!host || host.querySelector('.lang-toggle')) return;
    const b = document.createElement('button');
    b.className = 'btn-ghost lang-toggle';
    b.setAttribute('data-i18n-skip', '');
    // Na telefonie zostaje sama flaga (style.css: .lang-toggle-label) — nagłówek Wordle
    // i tak jest tam ciasny.
    b.innerHTML = lang === 'en'
      ? '🇵🇱<span class="lang-toggle-label"> PL</span>'
      : '🇬🇧<span class="lang-toggle-label"> EN</span>';
    b.title = lang === 'en' ? 'Przełącz na polski' : 'Switch to English';
    b.addEventListener('click', () => I18N.setLang(lang === 'en' ? 'pl' : 'en'));
    host.insertBefore(b, host.firstChild);
  }

  // Teksty z panelu admina: wstawiamy w miejsca z data-content="<klucz>". Po wstawieniu
  // strona dostaje zdarzenie i18n:content — regulamin ma w środku punkty składane z payloadu
  // (boss, mechaniki sezonu), które trzeba wtedy przerysować.
  async function loadContent(game) {
    try {
      const r = await fetch(`/api/content/${game}?lang=${lang}`);
      if (!r.ok) return;
      const data = await r.json();
      for (const el of document.querySelectorAll('[data-content]')) {
        const html = data.sections[el.getAttribute('data-content')];
        if (html != null) el.innerHTML = html;
      }
      document.dispatchEvent(new CustomEvent('i18n:content'));
    } catch (e) {
      console.error('Nie udało się wczytać tekstów:', e);
    }
  }
})();
