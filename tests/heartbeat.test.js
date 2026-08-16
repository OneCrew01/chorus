import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSchedulerStale } from '../lib/pace.js';

const now = Date.parse('2026-08-15T12:00:00Z');

test('a recent heartbeat is healthy', () => {
  assert.equal(isSchedulerStale('2026-08-15T06:00:00Z', now), false);
});

test('a heartbeat older than 24h is stale', () => {
  assert.equal(isSchedulerStale('2026-08-14T05:00:00Z', now), true);
});

test('a missing heartbeat is stale — silence is the failure mode', () => {
  assert.equal(isSchedulerStale('', now), true);
  assert.equal(isSchedulerStale(null, now), true);
});
