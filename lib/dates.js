// Pure ISO-date arithmetic. Every value crossing this module's boundary is a
// 'YYYY-MM-DD' string. Internally we anchor Date objects at UTC noon: local
// midnight shifts by an hour across a DST transition and silently drops or
// duplicates a day.

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function fromUTC(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const dt = toUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

export function daysBetween(aIso, bIso) {
  return Math.round((toUTC(bIso) - toUTC(aIso)) / 86400000);
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function daysInMonth(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayOfMonth(iso) {
  return Number(iso.slice(8, 10));
}

export function weekdayOf(iso) {
  return toUTC(iso).getUTCDay();
}

export function clampToMonth(mKey, day) {
  const last = daysInMonth(mKey);
  return `${mKey}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
