import { expectedMonthly } from './recurrence.js';
import { monthKey, daysInMonth, dayOfMonth } from './dates.js';

// The ring measures PACE, not a completion ratio. See spec §7.2.
//
// One-offs contribute to `earned` and never to `target`. That asymmetry is the
// whole design: an app whose headline number falls when you log something
// teaches you to stop logging.

export function monthTarget(tasks, steps, mKey) {
  const chores = tasks
    .filter(t => t.active)
    .reduce((sum, t) => sum + expectedMonthly(t), 0);
  const planned = steps.filter(s => s.planned_month === mKey).length;
  return chores + planned;
}

export function monthEarned(log, mKey) {
  return log.filter(e => monthKey(e.completed_at) === mKey).length;
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
