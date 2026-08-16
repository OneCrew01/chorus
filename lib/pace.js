import { expectedMonthly } from './recurrence.js';
import { monthKey, daysInMonth, dayOfMonth } from './dates.js';

// The ring measures PACE, not a completion ratio. See spec §7.2.
//
// One-offs contribute to `earned` and never to `target`. That asymmetry is the
// whole design: an app whose headline number falls when you log something
// teaches you to stop logging.

export function monthTarget(tasks, steps, mKey) {
  // Belt and braces: api_bootstrap_ validates recurrence_rule shape before it
  // ever reaches this module, but this is the one number the app exists to
  // show correctly (spec §7.2), so it does not trust a single upstream
  // guard. A rule expectedMonthly can't make sense of either returns NaN
  // (e.g. {} with no intervalDays) or throws (e.g. null with type
  // 'completion') — either way that one task's contribution is skipped
  // rather than being allowed to NaN (or crash) the whole ring.
  const chores = tasks
    .filter(t => t.active)
    .reduce((sum, t) => {
      let v;
      try { v = expectedMonthly(t); } catch { v = NaN; }
      return Number.isFinite(v) ? sum + v : sum;
    }, 0);
  const planned = steps.filter(s => s.planned_month === mKey).length;
  return chores + planned;
}

export function monthEarned(log, mKey) {
  // A malformed completed_at must not take down the whole ring — skip it.
  return log.filter(e => typeof e.completed_at === 'string' && monthKey(e.completed_at) === mKey).length;
}

export function ringState(tasks, steps, log, todayISO) {
  const mKey = monthKey(todayISO);
  const target = monthTarget(tasks, steps, mKey);
  const earned = monthEarned(log, mKey);

  if (target <= 0) {
    return { target: 0, earned, ratio: null, onPace: null, empty: true, display: '—' };
  }

  const ratio = earned / target;
  const elapsed = dayOfMonth(todayISO) / daysInMonth(mKey);
  const onPace = earned >= target * elapsed;

  return {
    target, earned, ratio, onPace, empty: false,
    display: ratio > 1 ? 'ahead' : `${Math.round(ratio * 100)}%`
  };
}

const STALE_MS = 86400000;

// A missing heartbeat counts as stale. The whole point is that a scheduler
// which never ran is indistinguishable to the user from one that died.
export function isSchedulerStale(lastOkISO, nowMs) {
  if (!lastOkISO) return true;
  const t = Date.parse(lastOkISO);
  return Number.isNaN(t) || (nowMs - t) > STALE_MS;
}
