import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, monthKey, daysInMonth, dayOfMonth, weekdayOf, clampToMonth } from '../lib/dates.js';

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-08-30', 3), '2026-09-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-05', -6), '2026-02-27');
});

test('addDays survives a DST transition', () => {
  // US DST springs forward 2026-03-08. A naive local-midnight Date loses a day here.
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
});

test('daysBetween is signed and whole', () => {
  assert.equal(daysBetween('2026-08-01', '2026-08-04'), 3);
  assert.equal(daysBetween('2026-08-04', '2026-08-01'), -3);
  assert.equal(daysBetween('2026-08-04', '2026-08-04'), 0);
});

test('monthKey and daysInMonth', () => {
  assert.equal(monthKey('2026-08-15'), '2026-08');
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2026-08'), 31);
});

test('weekdayOf uses 0=Sunday', () => {
  assert.equal(weekdayOf('2026-08-16'), 0); // Sunday
  assert.equal(weekdayOf('2026-08-18'), 2); // Tuesday
});

test('clampToMonth pins a too-large day to the last day of the month', () => {
  assert.equal(clampToMonth('2026-02', 31), '2026-02-28');
  assert.equal(clampToMonth('2026-08', 15), '2026-08-15');
});
