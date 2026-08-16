// Fixture-mode backend. Resolves D+n / D-n / M+n tokens so fixtures never age out.
import { addDays, monthKey } from './lib/dates.js';

function resolve(value, todayISO) {
  if (typeof value !== 'string') return value;
  let m = value.match(/^D([+-])(\d+)(T.*)?$/);
  if (m) return addDays(todayISO, (m[1] === '-' ? -1 : 1) * Number(m[2])) + (m[3] || '');
  m = value.match(/^M([+-])(\d+)$/);
  if (m) return monthKey(addDays(todayISO, (m[1] === '-' ? -1 : 1) * Number(m[2]) * 30));
  return value;
}

function walk(node, todayISO) {
  if (Array.isArray(node)) return node.map(n => walk(n, todayISO));
  if (node && typeof node === 'object') {
    const out = {};
    for (const k in node) out[k] = walk(node[k], todayISO);
    return out;
  }
  return resolve(node, todayISO);
}

let cache = null;

export async function demoRun(method, params, state) {
  if (method === 'bootstrap') {
    // Resolve the fixtures ONCE. Re-reading the file on every bootstrap would
    // discard every write the session has made, and demo mode is how this app's
    // UI gets verified at all.
    if (!cache) {
      const raw = await (await fetch('fixtures.json')).json();
      const todayISO = new Date().toISOString().slice(0, 10);
      cache = { ...walk(raw, todayISO), todayISO };
    }
    return cache;
  }
  // Every write below mutates `cache`, not the caller's `state` — the two are
  // the same object once bootstrap has run, but writing directly to `cache`
  // keeps a write and the next bootstrap() call in agreement even if that
  // stops being true. A hard page reload clears `cache` and starts fresh,
  // which is the right semantic for a demo.
  if (method === 'logComplete') {
    const entry = { id: 'l' + Math.random().toString(36).slice(2, 8), task_id: params.task_id || '',
      step_id: params.step_id || '', person_id: params.person_id, completed_at: cache.todayISO, source: params.source };
    cache.log.push(entry);
    return { entry };
  }
  if (method === 'taskUpsert') {
    const t = { ...params.task, id: params.task.id || 't' + Math.random().toString(36).slice(2, 8), active: true };
    const i = cache.tasks.findIndex(x => x.id === t.id);
    if (i >= 0) cache.tasks[i] = t; else cache.tasks.push(t);
    return t;
  }
  if (method === 'stepComplete') {
    const s = cache.steps.find(x => x.id === params.step_id);
    s.done_at = cache.todayISO; s.done_by = params.person_id;
    cache.log.push({ id: 'l' + Math.random().toString(36).slice(2, 8), task_id: '', step_id: s.id,
      person_id: params.person_id, completed_at: cache.todayISO, source: 'projects' });
    return { step: s };
  }
  if (method === 'taskPromote') {
    const t = cache.tasks.find(x => x.id === params.task_id);
    if (!t) throw new Error('taskPromote: no task ' + params.task_id);
    t.recurrence_type = 'completion';
    t.recurrence_rule = { intervalDays: params.intervalDays };
    return t;
  }
  // Anything the real backend exposes that demo mode hasn't implemented yet
  // must fail loudly rather than a blanket { ok: true } — a demo backend that
  // always claims success is exactly how the missing taskPromote branch above
  // hid: the UI toasted "Now recurring" while nothing had actually changed.
  throw new Error(`demoRun: "${method}" is not implemented in demo mode`);
}
