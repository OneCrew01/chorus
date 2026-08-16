import { S, run, refresh, render } from '../app.js';
import { esc, escAttr, toast, bind } from '../ui.js';
import { ringState, isSchedulerStale } from '../lib/pace.js';
import { dueState } from '../lib/recurrence.js';
import { findPromotionCandidate } from '../lib/promotion.js';

const lastDone = (taskId) => S.log
  .filter(e => e.task_id === taskId).map(e => e.completed_at).sort().pop() || null;

function ring(r) {
  if (r.empty) return `<div class="ring ring--empty"><b>—</b><span>add a chore to start</span></div>`;
  const pct = Math.min(r.ratio, 1);
  const dash = 327, off = dash * (1 - pct);
  return `<div class="ring">
    <svg viewBox="0 0 126 126" width="126" height="126">
      <circle cx="63" cy="63" r="52" class="ring__track"/>
      <circle cx="63" cy="63" r="52" class="ring__fill" stroke-dasharray="${dash}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="ring__mid"><b>${esc(r.display)}</b><span>${esc(S.todayISO.slice(0, 7))}</span></div>
    <p class="ring__pace ${r.onPace ? 'is-ahead' : 'is-behind'}">${r.onPace ? '▲ ahead of pace' : '▼ behind pace'}</p>
  </div>`;
}

function crew() {
  const mKey = S.todayISO.slice(0, 7);
  const rows = S.people.filter(p => String(p.active) !== 'FALSE').map(p => {
    const n = S.log.filter(e => e.person_id === p.id && e.completed_at.startsWith(mKey)).length;
    return { p, n };
  });
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.map(({ p, n }) => `<div class="crew__p">
    <b>${n}</b><span>${esc(p.name)}</span>
    <i class="bar"><i style="width:${Math.round(n / max * 100)}%;background:${escAttr(p.color)}"></i></i>
  </div>`).join('');
}

function projects() {
  return S.projects.filter(p => p.status === 'active').map(p => {
    const steps = S.steps.filter(s => s.project_id === p.id).sort((a, b) => a.seq - b.seq);
    const done = steps.filter(s => s.done_at).length;
    const next = steps.find(s => !s.done_at);
    const pct = steps.length ? Math.round(done / steps.length * 100) : 0;
    return `<button class="prj" data-project="${escAttr(p.id)}">
      <span class="prj__t">${esc(p.name)}<em>${pct}%</em></span>
      <span class="prj__s">${next ? `step ${done + 1} of ${steps.length} · ${esc(next.title)}` : 'all steps done'}</span>
      <i class="bar bar--warm"><i style="width:${pct}%"></i></i>
    </button>`;
  }).join('');
}

function taskRow(t) {
  const done = lastDone(t.id);
  const state = dueState(t, done, S.todayISO);
  const who = S.people.find(p => p.id === t.owner_id);
  const cand = t.recurrence_type === 'none' && done ? findPromotionCandidate(t, S.tasks, S.log) : null;
  const meta = t.recurrence_type === 'completion' ? `every ${t.recurrence_rule.intervalDays} days`
    : t.recurrence_type === 'schedule' ? 'on schedule' : 'one-off';
  return `<div class="row ${state.due ? '' : 'row--done'}">
    <button class="ck ${state.due ? '' : 'ck--on'}" data-complete="${escAttr(t.id)}" aria-label="Complete ${escAttr(t.title)}"></button>
    <span class="row__t">${esc(t.title)}</span>
    <span class="row__m">${who ? esc(who.name) + ' · ' : ''}${esc(meta)}${state.overdueDays ? ` · ${state.overdueDays}d late` : ''}</span>
    ${cand ? `<button class="promote" data-promote="${escAttr(t.id)}" data-interval="${cand.suggestedIntervalDays}" title="Seen this before — make it recurring?">↻</button>` : ''}
  </div>`;
}

export function renderMomentum(root) {
  const chores = S.tasks.filter(t => t.active && t.recurrence_type !== 'none');
  const oneoffs = S.tasks.filter(t => t.active && t.recurrence_type === 'none');
  const r = ringState(S.tasks, S.steps, S.log, S.todayISO);
  const stale = isSchedulerStale(S.config?.scheduler_last_ok, Date.now());
  const schedulerError = S.config?.scheduler_last_error || '';

  root.innerHTML = `
    ${stale ? `<p class="warn">Reminders may not be sending — the scheduler hasn't run since ${esc(S.config?.scheduler_last_ok || 'ever')}.</p>` : ''}
    ${schedulerError ? `<p class="warn warn--error">The scheduler is running, but some reminders failed to reconcile: ${esc(schedulerError)}</p>` : ''}
    <header class="hd"><b>Chorus</b><span>${esc(S.todayISO.slice(0, 7))}</span></header>
    ${ring(r)}
    <section><h3 class="lab">The crew</h3><div class="crew">${crew()}</div></section>
    <section><h3 class="lab">Projects <button class="add" data-add="project">+</button></h3>${projects()}</section>
    <section><h3 class="lab">Chores <button class="add" data-add="chore">+</button></h3>${chores.map(taskRow).join('')}</section>
    <section><h3 class="lab">One-offs <button class="add" data-add="oneoff">+</button></h3>
      ${oneoffs.map(taskRow).join('')}
      <button class="row row--ghost" data-add="oneoff">+ jot something down</button>
    </section>`;

  bind(root, 'click', onClick);
}

// Re-entry guard: the write window is a full Apps Script round trip (400ms-3s
// on a cold /exec redirect) on a touch target, on a phone, with only a CSS
// class as feedback — a second tap in that window must not fire a second
// write. Module-level Set keyed on the entity id, released in a finally: the
// same idiom views/projects.js already uses for step completion, not a new
// one. The server is idempotent too (ChorusWebApp.gs api_logComplete_), so
// this guard is about responsiveness, not correctness.
const inFlight = new Set();

async function onClick(e) {
  const done = e.target.closest('[data-complete]');
  if (done) {
    const id = done.dataset.complete;
    if (inFlight.has(id)) return;
    inFlight.add(id);
    done.classList.add('ck--on');                       // optimistic
    try {
      // Same write/reload split as day.js and views/projects.js: a
      // successful logComplete followed only by a failed refresh() must not
      // roll the checkbox back and claim the save itself failed — that
      // reading is false and invites a duplicate write past the guard above.
      try {
        await run('logComplete', { task_id: id, person_id: S.me, source: 'momentum' });
      } catch (err) {
        done.classList.remove('ck--on');                // visible rollback, never a silent failure
        toast('Could not save — try again', 'bad');
        return;
      }
      try {
        await refresh();
      } catch (err) {
        toast('Saved — but the screen could not refresh. Pull to retry.', 'bad');
      }
    } finally {
      inFlight.delete(id);
    }
    return;
  }
  const promote = e.target.closest('[data-promote]');
  if (promote) {
    try {
      await run('taskPromote', { task_id: promote.dataset.promote, intervalDays: Number(promote.dataset.interval) });
      toast('Now recurring');
      await refresh();
    } catch (err) {
      toast('Could not make it recurring — ' + err.message, 'bad');
    }
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) return onAdd(add.dataset.add);
  const project = e.target.closest('[data-project]');
  if (project) {
    // Same push-state-then-render shape views/projects.js uses for its own
    // in-view navigation (data-open). Reaching into app.js's render() rather
    // than importing renderProjects directly here avoids a module cycle:
    // app.js already imports renderMomentum AND renderProjects, so this
    // view importing the other view back would close a loop.
    history.pushState({ route: 'projects' }, '', `#/projects?p=${project.dataset.project}`);
    S.route = 'projects';
    render();
  }
}

// The minimum that satisfies spec Goal 2 ("capture a one-off in under five
// seconds") without building a form system. window.prompt is deliberately
// the smallest thing that works here — it blocks the whole page while open,
// so it cannot itself be double-fired, but the write that follows it still
// can be raced by a fast repeat tap once the dialog closes. Same inFlight
// idiom as the rest of this file, keyed by add-kind rather than an entity id
// since there is no entity yet.
async function onAdd(kind) {
  if (kind === 'oneoff') return addOneoff();
  if (kind === 'chore') return addChore();
  if (kind === 'project') return addProject();
}

async function addOneoff() {
  const title = window.prompt('What do you need to do?');
  if (!title || !title.trim()) return;
  const key = 'add:oneoff';
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await run('taskUpsert', { task: { title: title.trim(), recurrence_type: 'none' }, person_id: S.me });
    await refresh();
    toast('Added');
  } catch (err) {
    toast('Could not add that — ' + err.message, 'bad');
  } finally {
    inFlight.delete(key);
  }
}

async function addChore() {
  const title = window.prompt('What’s the chore?');
  if (!title || !title.trim()) return;
  const raw = window.prompt('Every how many days?');
  if (raw === null) return;                    // cancelled
  const interval = Number(raw);
  // A bad rule here is exactly the NaN-ring hazard the bootstrap shape check
  // exists to catch server-side — reject it at the source instead of relying
  // on that backstop.
  if (!Number.isFinite(interval) || interval <= 0) {
    toast('Needs to be a number of days greater than zero', 'bad');
    return;
  }
  const key = 'add:chore';
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await run('taskUpsert', {
      task: { title: title.trim(), recurrence_type: 'completion', recurrence_rule: { intervalDays: interval } },
      person_id: S.me
    });
    await refresh();
    toast('Added');
  } catch (err) {
    toast('Could not add that — ' + err.message, 'bad');
  } finally {
    inFlight.delete(key);
  }
}

async function addProject() {
  const name = window.prompt('Project name?');
  if (!name || !name.trim()) return;
  const key = 'add:project';
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await run('projectUpsert', { project: { name: name.trim(), type: 'constructive', parts_key: '' }, person_id: S.me });
    await refresh();
    toast('Added');
  } catch (err) {
    toast('Could not add that — ' + err.message, 'bad');
  } finally {
    inFlight.delete(key);
  }
}
