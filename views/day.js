import { S, run, refresh } from '../app.js';
import { esc, escAttr, toast, bind } from '../ui.js';
import { dueState } from '../lib/recurrence.js';

const lastDone = id => S.log.filter(e => e.task_id === id).map(e => e.completed_at).sort().pop() || null;

function dueToday() {
  return S.tasks.filter(t => t.active).map(t => ({ t, st: dueState(t, lastDone(t.id), S.todayISO) }))
    .filter(x => x.st.due);
}

function card(t, timed) {
  return `<div class="e ${timed ? 'e--timed' : ''}">
    ${timed ? `<span class="e__tm">${esc(t.anchor_time)}</span><i class="e__dot"></i>` : ''}
    <div class="e__cd">
      <button class="ck" data-complete="${escAttr(t.id)}" aria-label="Complete ${escAttr(t.title)}"></button>
      <span class="e__t">${esc(t.title)}</span>
      ${t.est_minutes ? `<span class="e__s">about ${esc(t.est_minutes)} min</span>` : ''}
    </div>
  </div>`;
}

export function renderDay(root) {
  const due = dueToday();
  const timed = due.filter(x => x.t.anchor_time).sort((a, b) => a.t.anchor_time.localeCompare(b.t.anchor_time));
  const anytime = due.filter(x => !x.t.anchor_time);
  const steps = S.steps.filter(s => !s.done_at && s.planned_month === S.todayISO.slice(0, 7));
  const doneToday = S.log.filter(e => e.completed_at === S.todayISO).length;
  const total = doneToday + due.length;

  root.innerHTML = `
    <header class="hd"><b>Today</b><span>${doneToday} of ${total} done</span></header>
    <section class="tl">${timed.length ? timed.map(x => card(x.t, true)).join('') : '<p class="muted">Nothing on the clock today.</p>'}</section>
    <section><h3 class="lab">Anytime today</h3>
      ${anytime.length ? anytime.map(x => card(x.t, false)).join('') : '<p class="muted">All clear.</p>'}</section>
    <section><h3 class="lab">Project steps this month</h3>
      ${steps.length ? steps.map(s => `<div class="e"><div class="e__cd">
        <button class="ck" data-step="${escAttr(s.id)}"></button>
        <span class="e__t">${esc(s.title)}</span>
        <span class="e__s">${esc(S.projects.find(p => p.id === s.project_id)?.name || '')}</span>
      </div></div>`).join('') : '<p class="muted">No steps planned this month.</p>'}</section>`;

  bind(root, 'click', onClick);
}

// Same re-entry idiom as views/projects.js and views/momentum.js: a
// module-level Set keyed on the entity id, released in a finally. The write
// window here is a full Apps Script round trip with only a CSS class as
// feedback, so a second tap must not fire a second write. The server
// (ChorusWebApp.gs api_logComplete_) is idempotent too — this guard is about
// responsiveness, not correctness.
const inFlight = new Set();

async function onClick(e) {
  const t = e.target.closest('[data-complete]');
  const s = e.target.closest('[data-step]');
  if (!t && !s) return;
  const btn = t || s;
  const id = t ? t.dataset.complete : s.dataset.step;
  if (inFlight.has(id)) return;
  inFlight.add(id);
  btn.classList.add('ck--on');
  try {
    if (t) await run('logComplete', { task_id: t.dataset.complete, person_id: S.me, source: 'day' });
    else await run('stepComplete', { step_id: s.dataset.step, person_id: S.me });
    await refresh();
  } catch {
    btn.classList.remove('ck--on');
    toast('Could not save — try again', 'bad');
  } finally {
    inFlight.delete(id);
  }
}
