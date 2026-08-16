import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

// ChorusWebApp.gs is Apps Script, not part of this public repo (backend
// source stays in the private HAS-FACTORY tree — see project constraints).
// Same sibling-checkout assumption as tests/scheduler-contract.test.js:
//   ~/repos/chorus     (this repo)
//   ~/HAS-FACTORY      (private factory tree)
// SKIPS (with a stated reason) rather than throwing at import time when the
// sibling checkout is absent, so a public clone's `npm test` never goes red
// for a reason that has nothing to do with the person running it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP_PATH = path.join(
  __dirname, '..', '..', '..', 'HAS-FACTORY',
  '12_FACTORY', 'apps-script', 'projects', 'chorus', 'ChorusWebApp.gs'
);
const HAVE_BACKEND = existsSync(WEBAPP_PATH);
const skip = HAVE_BACKEND
  ? false
  : 'chorus-backend sibling checkout not found — private-tree contract not checked here';

// Same brace-counting extraction as scheduler-contract.test.js — grabs one
// top-level `function name(...) { ... }` block by text, so nested blocks
// don't truncate the match.
function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) {
    throw new Error(`extractFunction: "${name}" not found in ${WEBAPP_PATH}`);
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

// chLogAlreadyRecorded_ is the pure dedupe predicate api_logComplete_ uses to
// close the double-write class at the source (item 1 of the 2026-08-15 fix
// wave). It touches no Apps Script service, so unlike chOccurrences_ it needs
// no shimmed sandbox globals — evaluated as plain JS.
let cached = null;
function loadHelper() {
  if (cached) return cached;
  const src = readFileSync(WEBAPP_PATH, 'utf8');
  const fn = extractFunction(src, 'chLogAlreadyRecorded_');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fn, sandbox, { filename: 'ChorusWebApp.gs (extracted helper)' });
  cached = sandbox;
  return sandbox;
}

function chLogAlreadyRecorded_(...args) {
  return loadHelper().chLogAlreadyRecorded_(...args);
}

test('a same-day completion of the same task is already recorded', { skip }, () => {
  const log = [{ task_id: 't1', step_id: '', completed_at: '2026-08-15' }];
  const hit = chLogAlreadyRecorded_(log, 't1', '', '2026-08-15');
  assert.equal(hit.task_id, 't1');
});

test('a different day does not count as already recorded', { skip }, () => {
  const log = [{ task_id: 't1', step_id: '', completed_at: '2026-08-14' }];
  assert.equal(chLogAlreadyRecorded_(log, 't1', '', '2026-08-15'), null);
});

test('a same-day completion of the same step is already recorded', { skip }, () => {
  const log = [{ task_id: '', step_id: 's1', completed_at: '2026-08-15' }];
  const hit = chLogAlreadyRecorded_(log, '', 's1', '2026-08-15');
  assert.equal(hit.step_id, 's1');
});

test('a task_id lookup never falls back to matching on step_id', { skip }, () => {
  const log = [{ task_id: '', step_id: 's1', completed_at: '2026-08-15' }];
  assert.equal(chLogAlreadyRecorded_(log, 't1', '', '2026-08-15'), null);
});

test('a second, later tap on the same task the same day is caught by the first entry, not a fresh append', { skip }, () => {
  // Simulates a double-tap: two logComplete calls in the same request cycle
  // both consult the same CH_Log snapshot before either has appended.
  const log = [{ task_id: 't1', step_id: '', completed_at: '2026-08-15', id: 'l1' }];
  const firstCall = chLogAlreadyRecorded_(log, 't1', '', '2026-08-15');
  const secondCall = chLogAlreadyRecorded_(log, 't1', '', '2026-08-15');
  assert.equal(firstCall.id, 'l1');
  assert.equal(secondCall.id, 'l1'); // same row returned twice, never a new one
});

test('no matching entry returns null, so the caller appends a fresh row', { skip }, () => {
  assert.equal(chLogAlreadyRecorded_([], 't1', '', '2026-08-15'), null);
});
