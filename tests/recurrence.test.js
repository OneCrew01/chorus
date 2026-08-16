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
