// ── PRÓBKI ZDARZEŃ do testu reguł „na żywo" ──
// Walidator wstrzykuje do tenanta gracza małą, jawnie oznaczoną paczkę zdarzeń typowych dla techniki
// (event.dataset „lo.proba", labels.lo_proba = znacznik) i czeka na alert ze znacznikiem. Reguła,
// która deklaruje technikę, ale na próbce milczy, się nie liczy — „mam regułę" to nie „wykrywam".
// Format pól zbliżony do ECS (jak logi labu). Fikcyjne konta i adresy z puli dokumentacyjnej.

const ev = (znacznik, i, x) => ({ '@timestamp': new Date(Date.now() - (60 - i) * 1000).toISOString(), 'event.dataset': 'lo.proba', 'labels.lo_proba': znacznik, ...x });

module.exports = {
  T1531: z => Array.from({ length: 15 }, (_, i) => ev(z, i, { 'host.name': 'PROBA-DC', 'event.code': '4725', 'event.action': 'user-disabled', 'user.name': 'proba.admin', 'user.target.name': `proba.u${i}`, message: 'Konto wyłączone (próbka walidatora)' })),
  T1110: z => Array.from({ length: 30 }, (_, i) => ev(z, i, { 'host.name': 'PROBA-RDP', 'event.code': '4625', 'event.action': 'logon-failed', 'event.outcome': 'failure', 'user.name': `proba.u${i % 5}`, 'source.ip': '198.51.100.77', message: 'Nieudane logowanie (próbka walidatora)' })),
  'T1070.001': z => [ev(z, 0, { 'host.name': 'PROBA-DC', 'event.code': '1102', 'event.action': 'audit-log-cleared', 'user.name': 'proba.admin', message: 'Dziennik inspekcji wyczyszczony (próbka walidatora)' })],
  T1485: z => Array.from({ length: 25 }, (_, i) => ev(z, i, { 'host.name': 'PROBA-FS', 'event.code': '4663', 'event.action': 'file-delete', 'user.name': 'proba.admin', 'file.path': `D:\\Proba\\plik${i}.docx`, message: 'Usunięto obiekt (próbka walidatora)' })),
};
