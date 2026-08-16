import { S, run, refresh } from '../app.js';
import { esc, escAttr, toast, bind } from '../ui.js';
import { ringState } from '../lib/pace.js';
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
  const stale = S.config?.scheduler_last_ok &&
    (Date.now() - Date.parse(S.config.scheduler_last_ok)) > 86400000;

  root.innerHTML = `
    ${stale ? `<p class="warn">Reminders may not be sending — the scheduler hasn't run since ${esc(S.config.scheduler_last_ok)}.</p>` : ''}
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

async function onClick(e) {
  const done = e.target.closest('[data-complete]');
  if (done) {
    const id = done.dataset.complete;
    done.classList.add('ck--on');                       // optimistic
    try {
      await run('logComplete', { task_id: id, person_id: S.me, source: 'momentum' });
      await refresh();
    } catch (err) {
      done.classList.remove('ck--on');                  // visible rollback, never a silent failure
      toast('Could not save — try again', 'bad');
    }
    return;
  }
  const promote = e.target.closest('[data-promote]');
  if (promote) {
    await run('taskPromote', { task_id: promote.dataset.promote, intervalDays: Number(promote.dataset.interval) });
    toast('Now recurring');
    await refresh();
  }
}
