import { addDays, daysBetween } from './dates.js';

// Due-ness is COMPUTED, never stored. See spec §6.1 — materialising one row per
// occurrence is what breaks the sister app's plan band, and a chores app would
// generate occurrences without limit.

export function dueState(task, lastCompletedISO, todayISO) {
  const type = task.recurrence_type;

  if (type === 'none') {
    return lastCompletedISO
      ? { due: false, overdueDays: 0, nextDueISO: null }
      : { due: true, overdueDays: 0, nextDueISO: todayISO };
  }

  if (type === 'completion') {
    const interval = task.recurrence_rule.intervalDays;
    if (!lastCompletedISO) {
      return { due: true, overdueDays: 0, nextDueISO: todayISO };
    }
    const nextDueISO = addDays(lastCompletedISO, interval);
    const slip = daysBetween(nextDueISO, todayISO);
    return { due: slip >= 0, overdueDays: Math.max(0, slip), nextDueISO };
  }

  throw new Error(`dueState: unsupported recurrence_type "${type}"`);
}
