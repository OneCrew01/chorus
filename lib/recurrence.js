import { addDays, daysBetween, weekdayOf, monthKey, clampToMonth, dayOfMonth } from './dates.js';

const DAYS_PER_MONTH = 30.44;
const WEEKS_PER_MONTH = 4.35;

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

  if (type === 'schedule') {
    const rule = task.recurrence_rule;
    const onSchedule = rule.weekdays
      ? rule.weekdays.includes(weekdayOf(todayISO))
      : dayOfMonth(clampToMonth(monthKey(todayISO), rule.monthDay)) === dayOfMonth(todayISO);
    const doneToday = lastCompletedISO === todayISO;
    // A missed occurrence stays missed: the next due date is computed from the
    // calendar, never from when the task was last completed.
    const nextDueISO = (onSchedule && !doneToday)
      ? todayISO
      : nextScheduled(rule, addDays(todayISO, 1));
    return { due: onSchedule && !doneToday, overdueDays: 0, nextDueISO };
  }

  throw new Error(`dueState: unsupported recurrence_type "${type}"`);
}

function nextScheduled(rule, fromISO) {
  if (rule.weekdays) {
    for (let i = 0; i < 7; i++) {
      const iso = addDays(fromISO, i);
      if (rule.weekdays.includes(weekdayOf(iso))) return iso;
    }
  }
  if (rule.monthDay) {
    const thisMonth = clampToMonth(monthKey(fromISO), rule.monthDay);
    if (daysBetween(fromISO, thisMonth) >= 0) return thisMonth;
    return clampToMonth(monthKey(addDays(thisMonth, 32)), rule.monthDay);
  }
  throw new Error('nextScheduled: rule has neither weekdays nor monthDay');
}

export function occurrencesBetween(task, fromISO, toISO) {
  const out = [];
  if (task.recurrence_type === 'none') return out;

  if (task.recurrence_type === 'completion') {
    const interval = task.recurrence_rule.intervalDays;
    let cursor = task.last_completed ? addDays(task.last_completed, interval) : fromISO;
    while (daysBetween(cursor, fromISO) > 0) cursor = addDays(cursor, interval);
    while (daysBetween(cursor, toISO) >= 0) {
      out.push(cursor);
      cursor = addDays(cursor, interval);
    }
    return out;
  }

  let cursor = nextScheduled(task.recurrence_rule, fromISO);
  while (daysBetween(cursor, toISO) >= 0) {
    out.push(cursor);
    cursor = nextScheduled(task.recurrence_rule, addDays(cursor, 1));
  }
  return out;
}

export function expectedMonthly(task) {
  if (task.recurrence_type === 'completion') return DAYS_PER_MONTH / task.recurrence_rule.intervalDays;
  if (task.recurrence_type === 'schedule') {
    const rule = task.recurrence_rule;
    return rule.weekdays ? rule.weekdays.length * WEEKS_PER_MONTH : 1;
  }
  return 0;
}
