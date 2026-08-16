import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringState } from '../lib/pace.js';

const laundry = { id: 't1', active: true, recurrence_type: 'completion', recurrence_rule: { intervalDays: 3 } };
const trash   = { id: 't2', active: true, recurrence_type: 'schedule',   recurrence_rule: { weekdays: [2] } };
const oneoff  = { id: 't3', active: true, recurrence_type: 'none',       recurrence_rule: null };

const log = (n, month = '2026-08') =>
  Array.from({ length: n }, (_, i) => ({ id: `l${i}`, completed_at: `${month}-0${(i % 9) + 1}` }));

test('target sums chore volume and ignores one-offs entirely', () => {
  const r = ringState([laundry, trash, oneoff], [], [], '2026-08-15');
  assert.equal(Math.round(r.target * 100) / 100, 14.5); // 10.15 + 4.35
});

test('planned project steps raise the target', () => {
  const steps = [{ id: 's1', planned_month: '2026-08' }, { id: 's2', planned_month: '2026-09' }];
  const r = ringState([laundry], steps, [], '2026-08-15');
  assert.equal(Math.round(r.target * 100) / 100, 11.15); // 10.15 + one step
});

test('adding a one-off does not move the ring', () => {
  const before = ringState([laundry], [], log(5), '2026-08-15');
  const after  = ringState([laundry, oneoff], [], log(5), '2026-08-15');
  assert.equal(before.ratio, after.ratio);
});

test('completing a one-off moves the ring UP', () => {
  const base = log(5);
  const withOneoff = [...base, { id: 'lx', task_id: 't3', completed_at: '2026-08-10' }];
  const before = ringState([laundry, oneoff], [], base, '2026-08-15');
  const after  = ringState([laundry, oneoff], [], withOneoff, '2026-08-15');
  assert.ok(after.ratio > before.ratio);
  assert.equal(after.target, before.target); // the one-off raised earned, never target
});

test('only this month counts', () => {
  const r = ringState([laundry], [], [...log(3), ...log(4, '2026-07')], '2026-08-15');
  assert.equal(r.earned, 3);
});

test('onPace compares earned against the elapsed fraction of the month', () => {
  // 2026-08 has 31 days. On the 15th, ~48% elapsed; target 10.15 -> ~4.9 expected.
  assert.equal(ringState([laundry], [], log(6), '2026-08-15').onPace, true);
  assert.equal(ringState([laundry], [], log(2), '2026-08-15').onPace, false);
});

test('above 100% reads ahead, never done', () => {
  const r = ringState([laundry], [], log(20), '2026-08-15');
  assert.ok(r.ratio > 1);
  assert.equal(r.display, 'ahead');
});

test('a target of zero renders an em dash, never NaN or 100%', () => {
  const r = ringState([], [], [], '2026-08-15');
  assert.equal(r.empty, true);
  assert.equal(r.ratio, null);
  assert.equal(r.onPace, null);
  assert.equal(r.display, '—');
});

test('inactive chores are excluded from the target', () => {
  const r = ringState([{ ...laundry, active: false }], [], [], '2026-08-15');
  assert.equal(r.empty, true);
});

test('a malformed log entry does not crash the ring', () => {
  const base = log(3);
  const withMalformed = [
    ...base,
    { id: 'bad1', completed_at: null },
    { id: 'bad2', completed_at: new Date('2026-08-10') },
    { id: 'bad3' }, // missing completed_at
  ];
  const r = ringState([laundry], [], withMalformed, '2026-08-15');
  assert.equal(r.earned, 3); // only the 3 valid entries count
  assert.ok(r.ratio > 0); // ring computes successfully despite malformed entries
});
