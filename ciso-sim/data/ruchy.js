// ── RUCHY SPOZA KATALOGU KONTROLI ──
// Wszystko, co gracz może zrobić, a co nie jest wdrożeniem kontroli z data/kontrole.js
// (wdrożenia, pilotaże, przeglądy, testy, naprawy, zmiany i wycofania kontroli generuje
// proto/ruchy.js z katalogu). Projekt: docs/18-silnik-ruchow.md.
//
// Każdy ruch jest dostępny ZAWSZE, chyba że coś obiektywnie stoi na przeszkodzie — wtedy
// `dostepny` zwraca powód (po polsku, do pokazania graczowi). Nie ma tu ocen „dobry/zły":
// praktykę oceniają zasady (proto/zasady.js) na historii ruchów.
//
// Pola:
//   nazwa, kategoria, opis
//   h, pln                — godziny gracza i koszt (z budżetu bezpieczeństwa)
//   param                 — { nazwa: { opis, wartosci: [..] } } albo { typ: 'dzial' } (id działu)
//   co_ile                — najwyżej raz na tyle miesięcy (na parametr, np. na dział)
//   dostepny(k, p, a)     — null albo powód, dla którego TERAZ się nie da
//   wykonaj(k, p, a)      — skutek; zwraca tekst dla gracza (tylko to, czego się dowiedział)
//   nieuczciwe            — { wobec, wykrywalnosc } — ruch trafia do rejestru kłamstw
//
// `a` = API kampanii (proto/ruchy.js → api): fakty, działy, wskaźniki, flagi, kłamstwa, log…

module.exports = {
  // ── ROZPOZNANIE: zdobywanie wiedzy (mgła wojny) ──
  skan_ekspozycji: {
    nazwa: 'Przegląd ekspozycji: co widać z internetu (moje.cert.pl, wyszukiwarki urządzeń, router brzegowy)',
    kategoria: 'rozpoznanie', h: 6,
    wykonaj: (k, p, a) => {
      const fakty = a.odkryjFakty(f => f.widoczne_z_internetu, 'przegląd ekspozycji');
      const obejscia = a.odkryjObejscia(ini => !!ini.ryzyko?.wektory?.uslugi, 0.8, 'przegląd ekspozycji');
      if (!fakty.length && !obejscia) return 'Z internetu nie widać niczego nowego (co nie znaczy, że niczego nie ma za NAT-em czy u dostawców).';
      return [...fakty.map(f => `Znalezione: ${f}.`), obejscia ? `Urządzenia działów widoczne z internetu: ${obejscia} (sprawy w skrzynce).` : ''].filter(Boolean).join(' ');
    },
  },
  przeglad_dostepow: {
    nazwa: 'Przegląd dostępów zdalnych i kont dostawców (VPN, narzędzia zdalne, konta serwisowe)',
    kategoria: 'rozpoznanie', h: 8,
    wykonaj: (k, p, a) => {
      const fakty = a.odkryjFakty(f => f.dostep_zdalny, 'przegląd dostępów');
      const obejscia = a.odkryjObejscia(ini => !!ini.ryzyko?.wektory?.dostawca, 0.7, 'przegląd dostępów');
      if (!fakty.length && !obejscia) return 'Nie znaleziono dostępów, o których byś nie wiedział.';
      return [...fakty.map(f => `Znalezione: ${f}.`), obejscia ? `Dostępy działów i dostawców bez Twojej wiedzy: ${obejscia} (sprawy w skrzynce).` : ''].filter(Boolean).join(' ');
    },
  },
  przeglad_ot: {
    nazwa: 'Obchód stacji z automatykiem: szafy, sterowniki, hasła, PIN-y, kto ma klucze',
    kategoria: 'rozpoznanie', h: 6,
    wykonaj: (k, p, a) => {
      a.dzial('produkcja', { zaufanie: 0.03 });
      const fakty = a.odkryjFakty(f => f.na_obiekcie, 'obchód stacji');
      return fakty.length ? fakty.map(f => `Znalezione: ${f}.`).join(' ') : 'Na stacji nic nowego — kierownik docenia, że przyszedłeś osobiście.';
    },
  },
  polowanie: {
    nazwa: 'Polowanie na intruzów (przegląd logów, kont, nietypowych połączeń)',
    kategoria: 'rozpoznanie', h: 16,
    param: { kto: { opis: 'Kto szuka', wartosci: ['sam', 'firma_zewnetrzna'] } },
    koszt: p => (p.kto === 'firma_zewnetrzna' ? { h: 2, pln: 12000 } : { h: 16 }),
    wykonaj: (k, p, a) => {
      const n = a.szukajIntruzow(p.kto === 'firma_zewnetrzna' ? 1.3 : 1);
      return n ? `Znaleziono i usunięto ślady włamania (${n}). Koszty opanowania idą z rezerwy firmy.` :
        'Nic nie znaleziono. To nie dowód, że nikogo nie ma — tylko że nie było go tam, gdzie patrzyliśmy.';
    },
  },

  // ── DZIAŁANIA W OT (wymagają wiedzy o fakcie) ──
  odetnij_hmi: {
    nazwa: 'Odciąć panel HMI od internetu (zamknąć przekierowanie portu u integratora)',
    kategoria: 'ot', h: 4,
    dostepny: (k, p, a) => a.faktDoNaprawy('hmi_wystawiony', 'nie wiesz, czy cokolwiek ze stacji jest w internecie — najpierw przegląd ekspozycji'),
    wykonaj: (k, p, a) => {
      a.napraw('hmi_wystawiony');
      if (!a.dziala('brama_dostepu')) {
        // Integrator traci drogę, którą serwisował zdalnie — stacja zacznie naciskać na „stały dostęp".
        a.dzial('produkcja', { zaufanie: -0.05 });
        a.presja('produkcja', 'zdalny_integrator', 0.4);
        return 'Panel nie jest już widoczny z internetu. Integrator protestuje: „jak mamy teraz serwisować w nocy?".';
      }
      return 'Panel nie jest już widoczny z internetu; integrator łączy się przez bramę.';
    },
  },
  zmien_pin: {
    nazwa: 'Zmienić domyślne PIN-y i hasła sterowników i paneli (z automatykiem i integratorem)',
    kategoria: 'ot', h: 6,
    dostepny: (k, p, a) => a.faktDoNaprawy('pin_domyslny', 'nie wiesz, jakie hasła mają sterowniki — najpierw obchód stacji albo inwentaryzacja'),
    wykonaj: (k, p, a) => { a.napraw('pin_domyslny'); return 'PIN-y zmienione i zapisane w sejfie haseł; integrator dostał je imiennie.'; },
  },
  usun_narzedzie_zdalne: {
    nazwa: 'Usunąć narzędzie zdalnej pomocy integratora ze stacji inżynierskiej',
    kategoria: 'ot', h: 2,
    dostepny: (k, p, a) => a.faktDoNaprawy('narzedzie_zdalne_integratora', 'nie wiesz o żadnym narzędziu zdalnym na stacji — najpierw przegląd dostępów'),
    wykonaj: (k, p, a) => {
      a.napraw('narzedzie_zdalne_integratora');
      if (!a.dziala('brama_dostepu')) {
        a.dzial('produkcja', { zaufanie: -0.1 });
        a.presja('produkcja', 'zdalny_integrator', 0.5);
        return 'Narzędzie usunięte. Bez bramy dla dostawców integrator nie ma jak pomóc zdalnie — kierownik stacji jest wściekły.';
      }
      return 'Narzędzie usunięte; integrator przechodzi na bramę.';
    },
  },

  // ── LUDZIE ──
  rozmowa: {
    nazwa: 'Rozmowa z kierownikiem działu (plany, kłopoty, co obchodzą i dlaczego)',
    kategoria: 'ludzie', h: 3, co_ile: 1,
    param: { dzial: { typ: 'dzial' } },
    wykonaj: (k, p, a) => a.rozmowa(p.dzial),
  },
  szkolenie_dzialu: {
    nazwa: 'Krótkie szkolenie w dziale na konkretnych przykładach z ich pracy',
    kategoria: 'ludzie', h: 4, co_ile: 3,
    param: { dzial: { typ: 'dzial' } },
    wykonaj: (k, p, a) => { a.dzial(p.dzial, { swiadomosc: 0.1, bazowa: 0.03 }); return `${a.nazwaDzialu(p.dzial)}: szkolenie odbyte, padło kilka dobrych pytań.`; },
  },
  zatrudnij: {
    nazwa: 'Rekrutacja do zespołu (2–4 miesiące szukania + wypowiedzenie)',
    kategoria: 'ludzie', h: 8,
    param: { etat: { opis: 'Etat', wartosci: ['0.5', '1'] } },
    // Koszt w budżecie liczy proto/ruchy.js (pensja od miesiąca zatrudnienia do grudnia).
    etat: p => Number(p.etat),
    dostepny: (k, p, a) => (a.rekrutacjaTrwa() ? 'rekrutacja już trwa' : null),
    wykonaj: (k, p, a) => { a.rekrutuj(Number(p.etat), 3); return `Rekrutacja ruszyła (${p.etat} etatu). Realnie: ktoś zacznie za ~3 miesiące.`; },
  },

  // ── ZARZĄD ──
  raport_zarzadowi: {
    nazwa: 'Raport dla zarządu o stanie bezpieczeństwa',
    kategoria: 'zarzad', h: 3, co_ile: 3,
    param: { styl: { opis: 'Jaki obraz', wartosci: ['rzetelny', 'upiekszony'] } },
    wykonaj: (k, p, a) => {
      if (p.styl === 'upiekszony') {
        a.wskaznik('mandat', 3);
        a.klamstwo({ wobec: 'zarząd', wykrywalnosc: 0.5, tekst: 'raport dla zarządu z upiększonym obrazem bezpieczeństwa', przy_incydencie: 0.7 });
        return 'Zarząd zadowolony: „wreszcie dobre wiadomości".';
      }
      const zRyzykiem = a.dziala('ryzyko');
      a.wskaznik('mandat', zRyzykiem ? 2 : 1);
      a.dzial('zarzad', { swiadomosc: 0.05 });
      return zRyzykiem ? 'Raport z rejestrem ryzyk w złotówkach — zarząd zadaje rzeczowe pytania.' : 'Raport przyjęty. Prezes pyta: „a ile to nas może kosztować?" — bez rejestru ryzyk trudno odpowiedzieć.';
    },
  },
  akceptacja_ryzyka: {
    nazwa: 'Formalna akceptacja ryzyka przez zarząd (znana luka z właścicielem i terminem przeglądu)',
    kategoria: 'zarzad', h: 2,
    param: { luka: { typ: 'luka' } },
    dostepny: (k, p, a) => (a.luki().length ? null : 'nie ma znanych luk do zaakceptowania'),
    wykonaj: (k, p, a) => { a.akceptuj(p.luka); a.wskaznik('mandat', -1); return `Zarząd podpisał akceptację ryzyka: ${a.opisLuki(p.luka)}. Wraca do przeglądu za rok.`; },
  },

  // ── OBOWIĄZKI PRAWNE (docs/02-…) ──
  analiza_statusu: {
    nazwa: 'Analiza: czy i jako kto podlegamy KSC (sektor z załącznika + wielkość)',
    kategoria: 'prawo', h: 8, raz: true,
    wykonaj: (k, p, a) => { a.poznajStatus(); return `Wynik analizy: podmiot ${a.statusPrawdziwy() === 'wazny' ? 'WAŻNY' : a.statusPrawdziwy()} (sektor z załącznika, 50–249 osób). Wpis do wykazu przez S46 do 3.10.2026.`; },
  },
  wpis_s46: {
    nazwa: 'Wniosek o wpis do wykazu podmiotów kluczowych i ważnych (S46)',
    kategoria: 'prawo', h: 2,
    param: { status: { opis: 'Zgłaszany status', wartosci: ['wazny', 'kluczowy'] } },
    dostepny: (k, p, a) => (k.flagi.wpis ? 'wniosek już złożony' : null),
    wykonaj: (k, p, a) => {
      a.flaga('wpis', true); a.flaga('status_zgloszony', p.status);
      if (a.miesiac() > 6) a.flaga('wpis_spozniony', true);
      return a.miesiac() > 6 ? 'Wniosek złożony po terminie — lepiej późno niż wcale; obowiązki i tak biegły od kwietnia.' : 'Wniosek złożony w terminie.';
    },
  },
  szkolenie_kierownika: {
    nazwa: 'Coroczne szkolenie kierownika podmiotu (zarząd) z ćwiczeniem na przykładzie z sektora',
    kategoria: 'prawo', h: 6, pln: 2500,
    dostepny: (k, p, a) => (k.flagi[`szkolenie_kierownika_${a.rok()}`] ? `zarząd ma już szkolenie w ${a.rok()} r.` : null),
    wykonaj: (k, p, a) => {
      a.flaga(`szkolenie_kierownika_${a.rok()}`, true); a.flaga('szkolenie_kierownika', true);
      a.dzial('zarzad', { swiadomosc: 0.2 }); a.wskaznik('mandat', 1);
      return 'Zarząd przeszkolony, zaświadczenie w aktach. Prezes: „nie wiedziałem, że to tak wygląda w praktyce".';
    },
  },

  // ── PRZED AUDYTEM (dostępne zawsze — dobra praktyka nie czeka na zapowiedź) ──
  plan_naprawczy: {
    nazwa: 'Plan naprawczy: lista luk z właścicielami, terminami i budżetem (pokazać stan uczciwie)',
    kategoria: 'audyt', h: 8,
    wykonaj: (k, p, a) => { a.flaga('plan_naprawczy', a.miesiac()); a.wskaznik('mandat', -1); return 'Plan naprawczy zatwierdzony przez zarząd. Prezes nie lubi czytać o lukach, ale podpisał.'; },
  },
  sprint_dowodow: {
    nazwa: 'Sprint zespołu: zrobić brakujący rejestr ryzyk i przeglądy naprawdę (z prawdziwymi datami)',
    kategoria: 'audyt', h: 30,
    wykonaj: (k, p, a) => { a.flaga('sprint_audytowy', true); a.wskaznik('morale', -8); return 'Dwa tygodnie nadgodzin. Rejestr ryzyk istnieje — świeży, ale prawdziwy.'; },
  },
  dokumenty_wstecz: {
    nazwa: 'Uzupełnić dokumenty z datą wsteczną (rejestr ryzyk, protokoły przeglądów, listy obecności)',
    kategoria: 'audyt', h: 12,
    nieuczciwe: { wobec: 'audytor', wykrywalnosc: 0.6 },
    wykonaj: (k, p, a) => { a.flaga('dokumenty_wstecz', true); return 'Dokumenty „są". Daty się zgadzają — na papierze.'; },
  },
};
