'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  BONUS ZA PRZYJŚCIE DO BIURA — +1 ruch dziennie z adresu biura
// ══════════════════════════════════════════════════════════════════════════════
// Gracz, który otworzy grę z sieci biura (adresy ustawia admin w panelu), dostaje pop-up
// „odbierz ruch za przyjście do biura". Odebranie działa DOKŁADNIE jak kupienie i od razu
// użycie Extra Move: dokłada dzisiejszy slot ponad bazowe ruchy (extra_rolls), więc sufit
// dnia dalej wynosi SL_DAILY_ROLLS + SL_MAX_EXTRA_ROLLS (5). Gdy oba sloty są już dziś
// zajęte, bonus trafia do ekwipunku jako sztuka Extra Move — także jako trzecia, ponad
// limit posiadania ze sklepu (ten pilnuje tylko ZAKUPÓW tanio z dołu tabeli). Decyzja
// właściciela: przyjście do biura ma coś dać zawsze.
//
// Że bonus już odebrano, pamięta sl_state.office_bonus_date (dzień odbioru) — raz dziennie
// na gracza, z dowolnego urządzenia. Bonus nie daje punktów ani coins, więc ścieżki
// cofania go nie dotyczą (tak jak użycia Extra Move).
//
// ── ADRES KLIENTA ──
// Gra stoi za tunelem/proxy (wykr.es na Mikrusie), więc gniazdo widzi adres proxy, a nie
// gracza. Prawdziwy adres przychodzi w X-Forwarded-For — ale ten nagłówek może dopisać
// też sam gracz. Każde proxy DOKLEJA adres, z którego przyszło połączenie, na KONIEC listy,
// więc ufamy tylko tylu wpisom od prawej, ile proxy faktycznie stoi przed serwerem
// (`trust_hops` z panelu, jak Express „trust proxy" = N). Wszystko na lewo od nich mógł
// wpisać gracz, więc nie ma znaczenia. Przy złej liczbie: za mało = wszyscy mają adres
// proxy (nikt nie dostaje bonusu), za dużo = da się podszyć nagłówkiem. Stąd podgląd
// „co widzi serwer" w panelu — liczbę ustawia się, patrząc na niego z biura.
//
// ── ADRESY BIURA ──
// Pojedyncze adresy albo zakresy CIDR, IPv4 i IPv6. Zakres jest potrzebny przy IPv6:
// każde urządzenie w biurze ma zwykle INNY adres w tej samej sieci /64, więc wpisanie
// jednego adresu łapałoby tylko jeden komputer.

const net = require('net');

const META_IPS = 'office_ips';
const META_HOPS = 'office_trust_hops';
const DEFAULT_HOPS = 1; // produkcja stoi za jednym tunelem (wykr.es)
const MAX_HOPS = 5;

module.exports = function createOfficeModule(deps) {
  const {
    db, app, authPlayer, checkAdmin, transaction, ensureColumn, slEnsureState, slLogActivity,
    slMetaGet, slMetaSet, slBuildState, slAddPowerup, todayWaw, isWeekendStr, slPlayHours,
    SL_MAX_EXTRA_ROLLS
  } = deps;

  ensureColumn('sl_state', 'office_bonus_date', 'TEXT');

  // ::ffff:1.2.3.4 (IPv4 widziany przez gniazdo IPv6) → 1.2.3.4, żeby wpis „1.2.3.4" w panelu
  // pasował niezależnie od tego, jak serwer nasłuchuje.
  function normalizeIp(ip) {
    let s = String(ip || '').trim();
    if (s.startsWith('[') && s.includes(']')) s = s.slice(1, s.indexOf(']')); // [::1]:port
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);
    if (m) s = m[1];
    if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.split(':')[0]; // 1.2.3.4:port
    const zone = s.indexOf('%'); // fe80::1%eth0
    if (zone > 0) s = s.slice(0, zone);
    return s;
  }

  function trustHops() {
    const n = parseInt(slMetaGet(META_HOPS), 10);
    return Number.isInteger(n) && n >= 0 && n <= MAX_HOPS ? n : DEFAULT_HOPS;
  }

  // Łańcuch adresów od najdalszego do najbliższego: wpisy X-Forwarded-For, a na końcu
  // adres gniazda. Klient = wpis `hops` miejsc od prawej (0 = samo gniazdo). Gdy wpisów
  // jest mniej, niż proxy w konfiguracji, bierzemy najdalszy — to wtedy i tak adres,
  // który dopisało nasze proxy, bo gracz nie może SKRÓCIĆ listy, tylko ją wydłużyć.
  function clientIp(req) {
    const xff = String(req.headers['x-forwarded-for'] || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const chain = [...xff, req.socket && req.socket.remoteAddress].filter(Boolean).map(normalizeIp);
    const idx = Math.max(0, chain.length - 1 - trustHops());
    return chain[idx] || '';
  }

  // Wpisy z panelu: jeden na linię albo po przecinku. Zły wpis odrzucamy z powodem,
  // zamiast po cichu pominąć — admin ma od razu wiedzieć, że coś się nie zapisało.
  function parseEntries(text) {
    const entries = [];
    const errors = [];
    for (const raw of String(text || '').split(/[\s,;]+/)) {
      const v = raw.trim();
      if (!v) continue;
      const [addr, bitsStr, extra] = v.split('/');
      const ip = normalizeIp(addr);
      const fam = net.isIP(ip);
      if (!fam || extra !== undefined) { errors.push(`„${v}" to nie adres IP ani zakres`); continue; }
      if (bitsStr === undefined) { entries.push(ip); continue; }
      const bits = Number(bitsStr);
      const max = fam === 4 ? 32 : 128;
      if (!/^\d+$/.test(bitsStr) || bits < 1 || bits > max) {
        errors.push(`„${v}": długość prefiksu musi być od 1 do ${max}`);
        continue;
      }
      entries.push(`${ip}/${bits}`);
    }
    return { entries: [...new Set(entries)], errors };
  }

  function officeEntries() {
    return parseEntries(slMetaGet(META_IPS) || '').entries;
  }

  // BlockList to wbudowane w Node dopasowanie adresów i zakresów (IPv4 i IPv6 osobno).
  function matchesOffice(ip, entries = officeEntries()) {
    const norm = normalizeIp(ip);
    const fam = net.isIP(norm);
    if (!fam || !entries.length) return false;
    const list = new net.BlockList();
    for (const e of entries) {
      const [addr, bits] = e.split('/');
      const type = net.isIP(addr) === 4 ? 'ipv4' : 'ipv6';
      if (bits) list.addSubnet(addr, Number(bits), type);
      else list.addAddress(addr, type);
    }
    return list.check(norm, fam === 4 ? 'ipv4' : 'ipv6');
  }

  // Czy dziś w ogóle jest dzień gry — w weekend (bez weekendów w panelu) dzisiejszy slot
  // przepadłby bez użycia. Godzin NIE sprawdzamy: slot żyje cały dzień, więc odebrany
  // o 7:50 zadziała od 8:00.
  function playDay(today) {
    return !(isWeekendStr(today) && !slPlayHours().weekends);
  }

  // Dla stanu gracza. `null`, gdy funkcja jest wyłączona (brak adresów w panelu) — front
  // wtedy niczego nie pokazuje. `claimed_today` jedzie zawsze, żeby front mógł podziękować
  // zamiast proponować drugi raz z innego urządzenia.
  // ── LOG POŁĄCZEŃ ── do ustawiania liczby proxy na żywym serwerze. Stan odpytuje się co
  // 10 s, więc logujemy tylko ZMIANĘ (nowy adres, inny nagłówek, wejście/wyjście z sieci
  // biura) per gracz — w konsoli (pm2 logs) i w pamięci dla karty w panelu. Pamięć ginie
  // przy restarcie i to wystarczy: to narzędzie diagnostyczne, nie historia.
  const RECENT_MAX = 40;
  const recent = [];
  const lastSig = new Map();
  function noteConnection(req, nickname, playerId, ip, inOffice) {
    const xff = req.headers['x-forwarded-for'] || null;
    const xri = req.headers['x-real-ip'] || null;
    const socket = normalizeIp(req.socket && req.socket.remoteAddress);
    const sig = [ip, xff, xri, socket, inOffice].join('|');
    if (lastSig.get(playerId) === sig) return;
    lastSig.set(playerId, sig);
    const row = { at: new Date().toISOString(), nickname, ip, in_office: inOffice, socket, x_forwarded_for: xff, x_real_ip: xri };
    recent.unshift(row);
    if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
    console.log(`Snakes/biuro: ${nickname} — adres ${ip || '?'} ${inOffice ? '✅ biuro' : '✗ poza biurem'}` +
      ` (gniazdo ${socket || '–'}, X-Forwarded-For: ${xff || '–'}${xri ? `, X-Real-IP: ${xri}` : ''}, proxy: ${trustHops()})`);
  }

  // `in_office` jedzie osobno, żeby front pokazał szary przycisk „poza biurem", zamiast
  // go chować — inaczej z zewnątrz nie widać, że funkcja w ogóle istnieje.
  function statusFor(req, playerId, nickname) {
    const entries = officeEntries();
    if (!entries.length) return null;
    const today = todayWaw();
    const st = slEnsureState(playerId);
    const claimedToday = st.office_bonus_date === today;
    const ip = clientIp(req);
    const inOffice = matchesOffice(ip, entries);
    noteConnection(req, nickname || `#${playerId}`, playerId, ip, inOffice);
    return {
      in_office: inOffice,
      play_day: playDay(today),
      claimed_today: claimedToday,
      available: inOffice && !claimedToday && playDay(today)
    };
  }

  // ── TRASY GRACZA ──

  // POST /api/snakes/office-bonus/claim — odbiór bonusu. Adres sprawdzamy TU jeszcze raz,
  // a nie wierzymy fladze `available` z ostatniego stanu: gracz mógł wyjść z biura
  // z otwartą kartą, a trasa jest wystawiona na świat.
  app.post('/api/snakes/office-bonus/claim', authPlayer, (req, res) => {
    const playerId = req.player.id;
    const today = todayWaw();
    const entries = officeEntries();
    if (!entries.length) return res.status(400).json({ error: 'Rzut od Prezesa jest wyłączony.' });
    if (!matchesOffice(clientIp(req), entries)) {
      console.log(`Snakes/biuro: ${req.player.nickname} — odbiór odrzucony, adres ${clientIp(req) || '?'} spoza biura` +
        ` (X-Forwarded-For: ${req.headers['x-forwarded-for'] || '–'})`);
      return res.status(403).json({ error: 'Rzut od Prezesa odbierzesz tylko z sieci biura.', not_in_office: true });
    }
    if (!playDay(today)) {
      return res.status(400).json({ error: 'W weekend nie gramy — Rzut od Prezesa czeka na poniedziałek.' });
    }

    const out = transaction(() => {
      const st = slEnsureState(playerId);
      if (st.office_bonus_date === today) return { already: true };
      db.prepare('UPDATE sl_state SET office_bonus_date = ? WHERE player_id = ?').run(today, playerId);
      // Jak „Użyj" przy Extra Move (lib/shop.js): slot na dziś, póki jest miejsce pod sufitem.
      const extraToday = st.extra_rolls_date === today ? Number(st.extra_rolls || 0) : 0;
      if (extraToday < SL_MAX_EXTRA_ROLLS) {
        db.prepare('UPDATE sl_state SET extra_rolls = ?, extra_rolls_date = ? WHERE player_id = ?')
          .run(extraToday + 1, today, playerId);
        slLogActivity(playerId, 'office_bonus', '🏢 odbiera Rzut od Prezesa za przyjście do biura (+1 ruch na dziś)');
        return { already: false, granted: 'roll' };
      }
      slAddPowerup(playerId, 'double_move', 1);
      slLogActivity(playerId, 'office_bonus', '🏢 odbiera Rzut od Prezesa za przyjście do biura (Extra Move do ekwipunku)');
      return { already: false, granted: 'item' };
    });
    if (out.already) return res.status(409).json({ error: 'Rzut od Prezesa już dziś odebrany.', already: true });

    console.log(`Snakes: ${req.player.nickname} odebrał bonus za biuro (${out.granted === 'roll' ? 'ruch na dziś' : 'Extra Move do ekwipunku'})`);
    // Stan budujemy PO transakcji — patrz pułapka z seasonal.payload() w CLAUDE.md.
    res.json({ success: true, granted: out.granted, state: slBuildState(playerId), office_bonus: statusFor(req, playerId, req.player.nickname) });
  });

  // ── TRASY ADMINA ──

  function adminPayload(req) {
    const ip = clientIp(req);
    const entries = officeEntries();
    return {
      ips: entries,
      trust_hops: trustHops(),
      max_hops: MAX_HOPS,
      // Podgląd „co widzi serwer" dla przeglądarki ADMINA — po to, żeby z biura sprawdzić,
      // czy tunel przekazuje prawdziwy adres i ile proxy trzeba ustawić.
      you: {
        ip,
        in_office: matchesOffice(ip, entries),
        socket: normalizeIp(req.socket && req.socket.remoteAddress),
        x_forwarded_for: req.headers['x-forwarded-for'] || null,
        x_real_ip: req.headers['x-real-ip'] || null,
        forwarded: req.headers['forwarded'] || null,
        cf_connecting_ip: req.headers['cf-connecting-ip'] || null
      },
      claimed_today: Number(db.prepare('SELECT COUNT(*) AS c FROM sl_state WHERE office_bonus_date = ?')
        .get(todayWaw()).c),
      recent
    };
  }

  // GET /api/snakes/admin/office?password=…
  app.get('/api/snakes/admin/office', (req, res) => {
    if (!checkAdmin(req, res)) return;
    res.json(adminPayload(req));
  });

  // POST /api/snakes/admin/office { password, ips?: "tekst", trust_hops?: n }
  // Puste `ips` wyłącza bonus. Pola osobno opcjonalne — panel wysyła to, co zmienił.
  app.post('/api/snakes/admin/office', (req, res) => {
    if (!checkAdmin(req, res)) return;
    let ips = null;
    if (req.body.ips != null) {
      const parsed = parseEntries(req.body.ips);
      if (parsed.errors.length) return res.status(400).json({ error: parsed.errors.join('; ') });
      ips = parsed.entries;
    }
    let hops = null;
    if (req.body.trust_hops != null) {
      hops = Number(req.body.trust_hops);
      if (!Number.isInteger(hops) || hops < 0 || hops > MAX_HOPS) {
        return res.status(400).json({ error: `Liczba proxy musi być od 0 do ${MAX_HOPS}.` });
      }
    }
    transaction(() => {
      if (ips) slMetaSet(META_IPS, ips.join('\n'));
      if (hops != null) slMetaSet(META_HOPS, String(hops));
    });
    const out = adminPayload(req);
    console.log(`Snakes/Admin: bonus za biuro — adresy: ${out.ips.join(', ') || '(wyłączony)'}, proxy: ${out.trust_hops}`);
    res.json({ success: true, ...out });
  });

  return { statusFor, clientIp, matchesOffice };
};
