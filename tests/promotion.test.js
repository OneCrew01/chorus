import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, titlesMatch, findPromotionCandidate } from '../lib/promotion.js';

test('normalizeTitle lowercases, trims, collapses and strips punctuation', () => {
  assert.equal(normalizeTitle('  Fix   the GATE latch!! '), 'fix the gate latch');
});

test('exact normalised titles match', () => {
  assert.ok(titlesMatch('Fix gate latch', 'fix   GATE latch'));
});

test('whole-token containment matches', () => {
  assert.ok(titlesMatch('wipe counters', 'wipe counters in kitchen'));
});

test('substring inside a word does NOT match', () => {
  // The refusal that matters. Fuzzy machinery that reads "cat" into "catalog"
  // also reads "veg" into "Cajun" — the sister app learned this the hard way.
  assert.equal(titlesMatch('cat', 'catalog the books'), false);
  assert.equal(titlesMatch('mow', 'homework'), false);
});

test('tokens shorter than 3 characters never match by containment', () => {
  assert.equal(titlesMatch('go', 'go to the store'), false);
});

test('unrelated titles do not match', () => {
  assert.equal(titlesMatch('fix gate latch', 'vacuum living room'), false);
});

test('a second completion of a matching one-off yields a candidate', () => {
  const tasks = [
    { id: 't1', title: 'Fix gate latch', recurrence_type: 'none' },
    { id: 't2', title: 'fix   gate LATCH', recurrence_type: 'none' }
  ];
  const log = [
    { task_id: 't1', completed_at: '2026-05-02' },
    { task_id: 't2', completed_at: '2026-08-15' }
  ];
  const c = findPromotionCandidate(tasks[1], tasks, log);
  assert.equal(c.matchTaskId, 't1');
  assert.equal(c.priorCount, 1);
  assert.equal(c.suggestedIntervalDays, 105);
});

test('a first-ever completion yields no candidate', () => {
  const tasks = [{ id: 't1', title: 'Fix gate latch', recurrence_type: 'none' }];
  const log = [{ task_id: 't1', completed_at: '2026-08-15' }];
  assert.equal(findPromotionCandidate(tasks[0], tasks, log), null);
});

test('tasks that already recur are never candidates', () => {
  const tasks = [
    { id: 't1', title: 'Laundry', recurrence_type: 'completion', recurrence_rule: { intervalDays: 3 } },
    { id: 't2', title: 'Laundry', recurrence_type: 'none' }
  ];
  const log = [{ task_id: 't1', completed_at: '2026-08-01' }, { task_id: 't2', completed_at: '2026-08-15' }];
  assert.equal(findPromotionCandidate(tasks[1], tasks, log), null);
});

test('tokens scattered through a longer unrelated title do NOT match', () => {
  // "Call Sam" and "Call the plumber before Sam visits" both contain "call" and "sam",
  // but Sam the person is unrelated to the plumbing errand. Coverage check blocks this.
  assert.equal(titlesMatch('Call Sam', 'Call the plumber before Sam visits'), false);
});

test('non-contiguous good matches still work with coverage check', () => {
  // "wipe the counters" contains all tokens of "wipe counters" but reorders them.
  // 2 tokens / 3 tokens = 0.67, which is >= 0.5, so this should match.
  assert.ok(titlesMatch('wipe counters', 'wipe the counters'));
});

test('a matching prior with no log entry returns null', () => {
  // A task with a matching prior but no completion log yields no candidate
  // (rather than NaN for the interval).
  const tasks = [
    { id: 't1', title: 'Fix gate latch', recurrence_type: 'none' },
    { id: 't2', title: 'fix gate latch', recurrence_type: 'none' }
  ];
  const log = [{ task_id: 't1', completed_at: '2026-05-02' }];
  // t2 has no log entry, so it cannot be promoted even though t1 matches.
  assert.equal(findPromotionCandidate(tasks[1], tasks, log), null);
});
