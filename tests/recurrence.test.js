import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueState } from '../lib/recurrence.js';

const laundry = { recurrence_type: 'completion', recurrence_rule: { intervalDays: 3 } };

test('never completed is due immediately', () => {
  const s = dueState(laundry, null, '2026-08-15');
  assert.equal(s.due, true);
  assert.equal(s.overdueDays, 0);
  assert.equal(s.nextDueISO, '2026-08-15');
});

test('inside the interval is not due', () => {
  const s = dueState(laundry, '2026-08-14', '2026-08-15');
  assert.equal(s.due, false);
  assert.equal(s.nextDueISO, '2026-08-17');
});

test('exactly at the interval is due', () => {
  assert.equal(dueState(laundry, '2026-08-12', '2026-08-15').due, true);
});

test('past the interval reports how overdue', () => {
  const s = dueState(laundry, '2026-08-10', '2026-08-15');
  assert.equal(s.due, true);
  assert.equal(s.overdueDays, 2); // due 08-13, now 08-15
});

test('doing it late shifts the next one late', () => {
  // The defining property of completion-based recurrence: the interval runs from
  // when you actually did it, not from a fixed calendar. Completed 2 days after
  // the previous due date, so the next one moves out by the same 2 days.
  // A today-anchored implementation would return '2026-08-20' here.
  assert.equal(dueState(laundry, '2026-08-15', '2026-08-17').nextDueISO, '2026-08-18');
});

test('a one-off is due until it is done, then never again', () => {
  const oneoff = { recurrence_type: 'none', recurrence_rule: null };
  assert.equal(dueState(oneoff, null, '2026-08-15').due, true);
  assert.equal(dueState(oneoff, '2026-08-14', '2026-08-15').due, false);
  assert.equal(dueState(oneoff, '2026-08-14', '2026-08-15').nextDueISO, null);
});

import { occurrencesBetween, expectedMonthly } from '../lib/recurrence.js';

const trash = { recurrence_type: 'schedule', recurrence_rule: { weekdays: [2] } }; // Tuesday
const rent  = { recurrence_type: 'schedule', recurrence_rule: { monthDay: 31 } };

test('weekly schedule is due on its weekday regardless of history', () => {
  // 2026-08-18 is a Tuesday. Last done a fortnight ago — still just "due today".
  const s = dueState(trash, '2026-08-04', '2026-08-18');
  assert.equal(s.due, true);
  assert.equal(s.nextDueISO, '2026-08-18');
});

test('weekly schedule is not due on other days', () => {
  assert.equal(dueState(trash, '2026-08-11', '2026-08-19').due, false);
});

test('missing an occurrence does not shift the next one', () => {
  // Skipped the 18th entirely; the next is still the following Tuesday.
  assert.equal(dueState(trash, '2026-08-04', '2026-08-19').nextDueISO, '2026-08-25');
});

test('completing today marks it not-due today', () => {
  assert.equal(dueState(trash, '2026-08-18', '2026-08-18').due, false);
});

test('occurrencesBetween expands a weekly rule inclusively', () => {
  assert.deepEqual(
    occurrencesBetween(trash, '2026-08-15', '2026-09-01'),
    ['2026-08-18', '2026-08-25', '2026-09-01']
  );
});

test('occurrencesBetween clamps a monthly rule to short months', () => {
  assert.deepEqual(
    occurrencesBetween(rent, '2026-01-01', '2026-03-31'),
    ['2026-01-31', '2026-02-28', '2026-03-31']
  );
});

test('occurrencesBetween expands a completion rule from its next due date', () => {
  const t = { recurrence_type: 'completion', recurrence_rule: { intervalDays: 3 }, last_completed: '2026-08-14' };
  assert.deepEqual(
    occurrencesBetween(t, '2026-08-15', '2026-08-24'),
    ['2026-08-17', '2026-08-20', '2026-08-23']
  );
});

test('an empty weekdays array with a monthDay set is monthDay-only, not permanently not-due', () => {
  // {weekdays: [], monthDay: 15}: [] is truthy, so a naive `rule.weekdays ?`
  // check took the weekday branch, matched nothing, and dueState never fell
  // back to monthDay — the chore silently stopped existing. Normalised now:
  // due exactly on the 15th, same as a plain { monthDay: 15 } rule.
  const monthlyWithEmptyWeekdays = { recurrence_type: 'schedule', recurrence_rule: { weekdays: [], monthDay: 15 } };
  assert.equal(dueState(monthlyWithEmptyWeekdays, null, '2026-08-15').due, true);
  assert.equal(dueState(monthlyWithEmptyWeekdays, null, '2026-08-16').due, false);
  assert.equal(expectedMonthly(monthlyWithEmptyWeekdays), 1);
});

test('expectedMonthly converts rules to monthly volume', () => {
  assert.equal(Math.round(expectedMonthly({ recurrence_type: 'completion', recurrence_rule: { intervalDays: 3 } }) * 100) / 100, 10.15);
  assert.equal(expectedMonthly(trash), 4.35);
  assert.equal(expectedMonthly({ recurrence_type: 'schedule', recurrence_rule: { weekdays: [1, 4] } }), 8.7);
  assert.equal(expectedMonthly(rent), 1);
  assert.equal(expectedMonthly({ recurrence_type: 'none', recurrence_rule: null }), 0);
});
