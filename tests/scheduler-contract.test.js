import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { occurrencesBetween } from '../lib/recurrence.js';

// ChorusScheduler.gs is Apps Script, not part of this public repo (backend
// source stays in the private HAS-FACTORY tree — see project constraints).
// This path assumes a sibling checkout layout:
//   ~/repos/chorus     (this repo)
//   ~/HAS-FACTORY      (private factory tree)
// That assumption is brittle if the two repos are ever checked out elsewhere
// relative to each other, but there is no public location for the backend
// file to live instead.
//
// repos/chorus is PUBLIC. Anyone who clones it and runs `npm test` — the
// standard first command after a clone — must not see a red suite for a
// reason that has nothing to do with them. So this file checks for the
// sibling checkout up front and SKIPS (with a stated reason) rather than
// throwing at import time when it's absent. Nothing here runs eagerly at
// module load: existsSync is the only call outside a test body/skip check.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULER_PATH = path.join(
  __dirname, '..', '..', '..', 'HAS-FACTORY',
  '12_FACTORY', 'apps-script', 'projects', 'chorus', 'ChorusScheduler.gs'
);
const HAVE_BACKEND = existsSync(SCHEDULER_PATH);
const skip = HAVE_BACKEND
  ? false
  : 'chorus-backend sibling checkout not found — private-tree contract not checked here';

// Extracts one top-level `function name(...) { ... }` block from source text
// by brace-counting from the first `{` after the signature, so nested
// if/while blocks inside the function don't truncate the match early.
function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) {
    throw new Error(`extractFunction: "${name}" not found in ${SCHEDULER_PATH}`);
  }
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`extractFunction: unbalanced braces for "${name}"`);
  return src.slice(start, i + 1);
}

// Loads chAddDaysISO_, chDaysInMonth_, and chOccurrences_ straight out of the
// real ChorusScheduler.gs text and evaluates them in an isolated vm context.
// They touch exactly one Apps Script service between them — chAddDaysISO_
// calls Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd') — so that one call is
// shimmed with an equivalent pure formatter. No date/recurrence logic is
// stubbed; only that single Google-service call is. Called lazily, once, from
// inside each test body (never at module top level) so a missing backend
// checkout only affects tests that are already marked skip.
let cached = null;
function loadSchedulerHelpers() {
  if (cached) return cached;
  const src = readFileSync(SCHEDULER_PATH, 'utf8');
  const fns = ['chAddDaysISO_', 'chDaysInMonth_', 'chOccurrences_']
    .map((name) => extractFunction(src, name))
    .join('\n\n');

  const sandbox = {
    Utilities: {
      formatDate(date, tz, fmt) {
        if (tz !== 'UTC' || fmt !== 'yyyy-MM-dd') {
          throw new Error(`scheduler-contract sandbox: unsupported formatDate(${tz}, ${fmt})`);
        }
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fns, sandbox, { filename: 'ChorusScheduler.gs (extracted helpers)' });
  cached = sandbox;
  return sandbox;
}

// chOccurrences_ (as evaluated in the vm sandbox) builds its return array
// with the sandbox's Array constructor, a different realm than this file's.
// assert.deepEqual (which node:assert/strict aliases to deepStrictEqual)
// treats cross-realm arrays as unequal even when their contents match, so
// normalize into a plain, same-realm array before asserting.
function chOccurrences_(...args) {
  return Array.from(loadSchedulerHelpers().chOccurrences_(...args));
}

// Same four cases lib/recurrence.js's occurrencesBetween is exercised with in
// tests/recurrence.test.js: weekly expansion, monthly February clamp,
// completion-interval expansion, and the malformed-rule throw. If
// chOccurrences_ (the Apps Script reimplementation) and occurrencesBetween
// (the ES module original) ever diverge, one of these four assertions
// catches it.

test('chOccurrences_ matches occurrencesBetween: weekly expansion', { skip }, () => {
  const trash = { recurrence_type: 'schedule', recurrence_rule: { weekdays: [2] } }; // Tuesday
  const expected = occurrencesBetween(trash, '2026-08-15', '2026-09-01');
  const actual = chOccurrences_(trash, '2026-08-15', '2026-09-01');
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual, ['2026-08-18', '2026-08-25', '2026-09-01']);
});

test('chOccurrences_ matches occurrencesBetween: monthly clamp on short months', { skip }, () => {
  const rent = { recurrence_type: 'schedule', recurrence_rule: { monthDay: 31 } };
  const expected = occurrencesBetween(rent, '2026-01-01', '2026-03-31');
  const actual = chOccurrences_(rent, '2026-01-01', '2026-03-31');
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual, ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('chOccurrences_ matches occurrencesBetween: completion-interval expansion', { skip }, () => {
  const t = { recurrence_type: 'completion', recurrence_rule: { intervalDays: 3 }, last_completed: '2026-08-14' };
  const expected = occurrencesBetween(t, '2026-08-15', '2026-08-24');
  const actual = chOccurrences_(t, '2026-08-15', '2026-08-24');
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual, ['2026-08-17', '2026-08-20', '2026-08-23']);
});

test('chOccurrences_ matches occurrencesBetween: a schedule rule with neither weekdays nor monthDay throws in both', { skip }, () => {
  const malformed = { recurrence_type: 'schedule', recurrence_rule: {} };
  assert.throws(() => occurrencesBetween(malformed, '2026-08-15', '2026-08-22'));
  assert.throws(() => chOccurrences_(malformed, '2026-08-15', '2026-08-22'));
});
