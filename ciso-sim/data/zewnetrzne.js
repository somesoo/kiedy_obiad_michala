// ── ZADANIA W ZEWNĘTRZNYM SIEM-ie / SOAR-ze (tryb MSSP, docs/21-…, 21.11) ──
// W grze z zewnętrznym systemem (opcja kampanii `zewnetrzne`) wdrożenie tych kontroli NIE kończy
// się po naszej stronie: projekt dochodzi do końca, kontrola czeka w stanie „konfiguracja",
// a zaczyna działać dopiero, gdy gracz zrobi zadania w prawdziwym narzędziu (swój tenant) i wróci
// z FLAGĄ z tego systemu (forma CTF; komenda `flaga LO{…}`, ruch `flaga`).
//
// To, CO gracz skonfigurował (lista źródeł, reguł, playbooków), wraca we fladze i ustala jakość
// kontroli w grze — a w labie także to, które logi istnieją w incydencie. SIEM z dwoma źródłami
// to nie ten sam SIEM, co z sześcioma (🔵 mnożniki niżej).
//
// Pole `wynik`: czego gra oczekuje we fladze (`w` w ładunku). Nieznane wartości są pomijane.

// Źródła logów, które ma każda organizacja w grze (OT tylko tam, gdzie jest sieć przemysłowa).
const ZRODLA = {
  ad: 'kontroler domeny / katalog kont',
  serwery: 'serwery (pulpit zdalny, serwer plików, aplikacje)',
  stacje: 'stacje robocze',
  poczta: 'poczta',
  zapora: 'zapora / VPN',
  ot: 'sieć przemysłowa (stacje inżynierskie, HMI)',
};

const siemZadania = {
  zrodla: { opis: 'Podłączyć źródła logów organizacji do swojego tenanta w SIEM-ie', wynik: { zrodla: Object.keys(ZRODLA) } },
  reguly: { opis: 'Reguły wykrywania dla scenariuszy z rejestru ryzyka (co najmniej 3)', wynik: { reguly: 'lista nazw reguł' } },
};

module.exports = {
  ZRODLA,
  kontrole: {
    siem: { nazwa: 'SIEM', zadania: siemZadania },
    siem_os: { nazwa: 'SIEM (open source)', zadania: siemZadania },
    // MDR: dostawca patrzy, ale źródła i tak podłącza organizacja.
    mdr: { nazwa: 'MDR', zadania: { zrodla: siemZadania.zrodla } },
    soar: {
      nazwa: 'SOAR',
      zadania: {
        integracja: { opis: 'Alerty z SIEM-a tworzą sprawy w SOAR-ze (tenant gracza)', wynik: {} },
        playbooki: { opis: 'Playbooki reagowania (co najmniej: wyłączenie konta, zebranie dzienników, izolacja hosta)', wynik: { playbooki: 'lista nazw playbooków' } },
      },
    },
  },
  // Mnożniki jakości (🔵): pokrycie źródeł waży najwięcej — czego nie zbierasz, tego nie wykryjesz.
  MIN_REGUL: 3, MIN_PLAYBOOKOW: 3,

  // ── DLA WALIDATORA (walidator/, docs/21-…, 21.12) ──
  // Techniki ataku z incydentów gry (MITRE ATT&CK) — reguła SIEM-a „liczy się", gdy deklaruje jedną
  // z nich, a w teście na żywo (próbka zdarzeń) naprawdę wystawia alert.
  TECHNIKI: {
    T1531: 'odebranie dostępu do kont (masowe wyłączanie kont — S07)',
    T1110: 'zgadywanie haseł (seria nieudanych logowań)',
    T1078: 'logowanie ważnym kontem z nietypowego miejsca albo po odejściu (S07)',
    'T1070.001': 'czyszczenie dziennika zdarzeń (S07)',
    T1485: 'niszczenie danych (usuwanie udziałów — S07)',
    T1486: 'szyfrowanie danych (ransomware)',
    T1114: 'przejęcie skrzynki, reguły przekierowania poczty (S01)',
    T1133: 'zdalny dostęp z zewnątrz: VPN, pulpit zdalny, narzędzia zdalne (S03, S07)',
  },
  // Playbooki, bez których SOAR nie obsłuży incydentów gry. `zatwierdzenie`: krok decyzji człowieka
  // przed działaniem, które może zatrzymać pracę (wyłączenie konta prezesa w trakcie przelewu).
  PLAYBOOKI: {
    wylaczenie_konta: { opis: 'wyłączenie konta i reset haseł', zatwierdzenie: true },
    zebranie_dziennikow: { opis: 'zabezpieczenie dzienników z sumami kontrolnymi', zatwierdzenie: false },
    izolacja_hosta: { opis: 'odcięcie hosta od sieci', zatwierdzenie: true },
  },
};
