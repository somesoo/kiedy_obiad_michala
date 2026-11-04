// Karta „Teksty i zasady" w panelach admina Snakes i Wordle (trasy: lib/content.js).
// Wspólny plik, bo oba panele edytują to samo, tylko inne sekcje. Każda sekcja ma wersję
// polską i angielską; pusty tekst albo „Przywróć domyślny" = tekst domyślny z kodu.
// Podgląd składa SERWER tym samym rendererem co gra, więc panel nie obieca innego wyglądu.
window.ContentAdmin = (function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function call(method, path, body) {
    const r = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Błąd serwera');
    return data;
  }

  const HELP = `
    <strong>Formatowanie:</strong> <code>**pogrubienie**</code>, <code>*kursywa*</code>,
    <code>[tekst](/adres)</code> (link w serwisie albo https://), lista punktowana
    <code>- punkt</code>, numerowana <code>1. punkt</code>, podpunkty wcięciem (2–3 spacje),
    pusta linia = nowy akapit. HTML nie działa — jest pokazywany jako zwykły tekst.
    <strong>Zmienne</strong> w nawiasach klamrowych, np. <code>{godziny}</code>, wstawiają
    aktualne ustawienia gry — dzięki nim tekst nie zacznie kłamać po zmianie godzin czy cen.
    W regulaminie Snakes <code>[[sezon]]</code> i <code>[[boss]]</code> to miejsca na opisy
    składane przez grę ze stawek (zostaw je w punktach, w których mają się pojawić).
    W Wordle kolorowe znaczki: <code>[[zielony:tekst]]</code>, <code>[[zolty:tekst]]</code>,
    <code>[[szary:tekst]]</code>.`;

  // Style w pliku, bo karta żyje w dwóch panelach o różnych arkuszach (snakes-admin ma
  // .adm-note i spółkę, wordle-admin nie) — wszystko zawężone do .content-admin.
  function injectCss() {
    if (document.getElementById('content-admin-css')) return;
    const st = document.createElement('style');
    st.id = 'content-admin-css';
    st.textContent = `
      .content-admin { display: flex; flex-direction: column; gap: 12px; }
      .content-admin .adm-note { font-size: 12px; color: var(--text-muted); line-height: 1.6; }
      .content-admin .adm-note code, .content-admin td code { font-size: 11px; }
      .content-admin .adm-stat { font-size: 12px; color: var(--text-muted); }
      .content-admin .adm-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .content-admin .content-section { border: 1px solid var(--muted); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .content-admin .content-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .content-admin .content-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
      @media (max-width: 900px) { .content-admin .content-cols { grid-template-columns: minmax(0, 1fr); } }
      .content-admin .content-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .content-admin .content-col-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .content-admin .content-text { width: 100%; box-sizing: border-box; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.5;
        background: var(--surface-alt, #111); color: var(--text-primary); border: 1px solid var(--muted); border-radius: 8px; padding: 8px; resize: vertical; }
      .content-admin .content-preview { position: static; max-width: none; max-height: 420px; overflow: auto; padding: 12px;
        border: 1px dashed var(--muted); border-radius: 8px; font-size: 13px; line-height: 1.6; }
      .content-admin button:disabled { opacity: 0.4; cursor: default; }
      .content-admin .content-vars summary { cursor: pointer; font-size: 12px; }
      .content-admin .content-vars-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
      .content-admin .content-vars-table td, .content-admin .content-vars-table th { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--muted); vertical-align: top; }
    `;
    document.head.appendChild(st);
  }

  function mount(el, opts) {
    injectCss();
    el.classList.add('content-admin');
    const game = opts.game;
    const pass = () => opts.password();
    // Panel Wordle nie ma toastów — wtedy komunikat ląduje w linijce nad sekcjami.
    const toast = opts.toast || (msg => {
      const f = el.querySelector('.content-flash');
      if (f) f.textContent = msg;
    });

    async function load() {
      el.innerHTML = '<div class="adm-stat">Wczytuję…</div>';
      try {
        const data = await call('GET', `/api/content-admin?game=${game}&password=${encodeURIComponent(pass())}`);
        render(data);
      } catch (e) {
        el.innerHTML = `<div class="login-error">${esc(e.message)}</div>`;
      }
    }

    function render(data) {
      const vars = (data.vars[game] || []).map(v =>
        `<tr><td><code>{${esc(v.name)}}</code></td><td>${esc(v.help)}</td><td class="mono">${esc(v.pl)}</td><td class="mono">${esc(v.en)}</td></tr>`
      ).join('');
      el.innerHTML = `
        <div class="adm-stat content-flash"></div>
        <div class="adm-note">${HELP}</div>
        ${vars ? `<details class="content-vars"><summary>Zmienne i ich dzisiejsze wartości</summary>
          <table class="content-vars-table"><thead><tr><th>zmienna</th><th>co to</th><th>PL</th><th>EN</th></tr></thead><tbody>${vars}</tbody></table>
        </details>` : ''}
        ${data.sections.map(sectionHtml).join('')}`;
      data.sections.forEach(s => { el.querySelector(`[data-key="${s.key}"]`).__section = s; });
    }

    // Każda sekcja to DWA pola obok siebie — polskie i angielskie — żeby przy poprawce jednej
    // wersji od razu było widać drugą (osobne nadpisania łatwo rozjechać, patrz CLAUDE.md).
    function langColHtml(s, lang) {
      const ov = s.overrides[lang];
      const text = ov ? ov.body : s.defaults[lang];
      return `
          <div class="content-col" data-lang="${lang}">
            <div class="content-col-head">
              <strong>${lang === 'pl' ? '🇵🇱 Polski' : '🇬🇧 English'}</strong>
              <span class="adm-stat">${ov ? `własny tekst · ${esc(ov.updated_at)} UTC` : 'tekst domyślny'}</span>
            </div>
            <textarea class="content-text" data-lang="${lang}" rows="${Math.min(18, Math.max(3, text.split('\n').length + 1))}">${esc(text)}</textarea>
            <div class="adm-actions">
              <button class="btn-ghost content-preview-btn" data-lang="${lang}">👁 Podgląd</button>
              <button class="btn-ghost content-reset" data-lang="${lang}"${ov ? '' : ' disabled'}>↩️ Przywróć domyślny</button>
            </div>
            <div class="content-preview how-inner" data-lang="${lang}" hidden></div>
          </div>`;
    }

    function sectionHtml(s) {
      return `
        <div class="content-section" data-key="${esc(s.key)}">
          <div class="content-head">
            <strong>${esc(s.label)}</strong>
            <button class="btn-primary content-save">💾 Zapisz PL i EN</button>
          </div>
          <div class="content-cols">${langColHtml(s, 'pl')}${langColHtml(s, 'en')}</div>
        </div>`;
    }

    // Po zapisie przerysowujemy TYLKO tę sekcję — pełne przeładowanie kasowałoby
    // niezapisane zmiany w innych sekcjach.
    async function refreshSection(box) {
      const data = await call('GET', `/api/content-admin?game=${game}&password=${encodeURIComponent(pass())}`);
      const s = data.sections.find(x => x.key === box.__section.key);
      if (!s) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = sectionHtml(s);
      const fresh = tmp.firstElementChild;
      fresh.__section = s;
      box.replaceWith(fresh);
    }

    el.addEventListener('click', async e => {
      const box = e.target.closest('.content-section');
      if (!box) return;
      const s = box.__section;
      const btn = e.target.closest('button');
      if (!btn) return;
      const lang = btn.dataset.lang;
      const area = l => box.querySelector(`.content-text[data-lang="${l}"]`);
      try {
        if (btn.classList.contains('content-preview-btn')) {
          const res = await call('POST', '/api/content-admin/preview', { password: pass(), key: s.key, lang, body: area(lang).value });
          const pv = box.querySelector(`.content-preview[data-lang="${lang}"]`);
          pv.innerHTML = res.html;
          pv.hidden = false;
          return;
        }
        if (btn.classList.contains('content-reset')) {
          if (!confirm(`Przywrócić domyślny tekst (${lang.toUpperCase()}) sekcji „${s.label}"?`)) return;
          await call('POST', '/api/content-admin', { password: pass(), key: s.key, lang, body: '' });
          await refreshSection(box);
          toast(`↩️ ${s.label} (${lang.toUpperCase()}): przywrócono tekst domyślny`);
          return;
        }
        if (btn.classList.contains('content-save')) {
          // Obie wersje naraz. Tekst równy domyślnemu serwer zapisuje jako „brak nadpisania",
          // więc zapis nieruszonej wersji niczego nie psuje.
          for (const l of ['pl', 'en']) {
            await call('POST', '/api/content-admin', { password: pass(), key: s.key, lang: l, body: area(l).value });
          }
          await refreshSection(box);
          toast(`💾 ${s.label}: zapisano PL i EN — gracze zobaczą zmianę po odświeżeniu strony`);
        }
      } catch (err) {
        toast('❌ ' + err.message);
      }
    });

    load();
    return { reload: load };
  }

  return { mount };
})();
