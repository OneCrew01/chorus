import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { addDays, daysBetween, monthKey, daysInMonth, dayOfMonth, weekdayOf, clampToMonth } from '../lib/dates.js';

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-08-30', 3), '2026-09-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-05', -6), '2026-02-27');
});

test('addDays crosses month and year boundaries adjacent to a DST transition date', () => {
  // US DST springs forward on 2026-03-08 at 02:00 local time. This test verifies that
  // month/year boundary arithmetic works correctly when the target dates straddle a
  // DST-transition day. The test passes for both naive and UTC-anchored implementations
  // because the transition occurs at 02:00 local time, not at midnight.
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
});

test('addDays is TZ-independent: identical results across all timezones', () => {
  // Run the same date arithmetic in multiple timezones. ISO strings parse as UTC, so
  // implementations that read with local getters fail in negative-offset zones:
  // `new Date('2026-03-07')` parses as UTC midnight, and in America/Santiago the
  // local calendar day is the previous day. This test catches that anti-pattern.
  const zones = ['UTC', 'America/Santiago', 'Pacific/Kiritimati'];
  const testCases = [
    { input: ['2026-03-07', 1], expected: '2026-03-08' },
    { input: ['2026-03-08', 1], expected: '2026-03-09' },
    { input: ['2026-08-30', 3], expected: '2026-09-02' },
    { input: ['2026-12-31', 1], expected: '2027-01-01' },
    { input: ['2026-03-05', -6], expected: '2026-02-27' },
  ];

  for (const zone of zones) {
    for (const testCase of testCases) {
      // Use file:// URL on Windows for ES module resolution
      const modulePath = process.platform === 'win32'
        ? `file:///${process.cwd().replace(/\\/g, '/')}/lib/dates.js`
        : `${process.cwd()}/lib/dates.js`;

      const childScript = `
        import { addDays } from '${modulePath}';
        console.log(addDays('${testCase.input[0]}', ${testCase.input[1]}));
      `;

      const result = execFileSync(process.execPath, ['-e', childScript], {
        env: { ...process.env, TZ: zone },
        encoding: 'utf-8',
      }).trim();

      assert.equal(
        result,
        testCase.expected,
        `Zone ${zone} returned ${result} but expected ${testCase.expected} for input ${JSON.stringify(testCase.input)}`
      );
    }
  }
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
