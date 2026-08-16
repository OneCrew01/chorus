import { S, run, refresh } from '../app.js';
import { esc, escAttr, toast, bind } from '../ui.js';

const openId = () => (location.hash.match(/[?&]p=([^&]+)/) || [])[1];

function list() {
  return S.projects.map(p => {
    const steps = S.steps.filter(s => s.project_id === p.id);
    const done = steps.filter(s => s.done_at).length;
    const pct = steps.length ? Math.round(done / steps.length * 100) : 0;
    return `<button class="prj" data-open="${escAttr(p.id)}">
      <span class="prj__t">${esc(p.name)}<em>${pct}%</em></span>
      <span class="prj__s">${done} of ${steps.length} steps · ${esc(p.type)}</span>
      <i class="bar bar--warm"><i style="width:${pct}%"></i></i>
    </button>`;
  }).join('');
}

function detail(p) {
  const steps = S.steps.filter(s => s.project_id === p.id).sort((a, b) => a.seq - b.seq);
  const done = steps.filter(s => s.done_at).length;
  const next = steps.find(s => !s.done_at);
  const notes = S.notes.filter(n => n.project_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return `<header class="hd"><button class="back" data-back>‹</button><b>${esc(p.name)}</b>
    <span>${done} of ${steps.length}</span></header>
    <div id="scene" class="scene" data-parts="${escAttr(p.parts_key || '')}" data-type="${escAttr(p.type)}"></div>
    ${next ? `<div class="next"><span class="lab">Next step</span><b>${esc(next.title)}</b>
      <p>${esc(next.detail)}</p>${next.materials_note ? `<p class="mat">Needs: ${esc(next.materials_note)}</p>` : ''}
      <button class="go" data-step="${escAttr(next.id)}">Mark this done</button></div>` : '<p class="muted pad">Every step is done.</p>'}
    <section><h3 class="lab">All steps</h3>
      ${steps.map(s => `<div class="row ${s.done_at ? 'row--done' : ''}">
        <button class="ck ${s.done_at ? 'ck--on' : ''}" data-step="${escAttr(s.id)}"></button>
        <span class="row__t">${esc(s.seq)}. ${esc(s.title)}</span>
        <span class="row__m">${s.done_at ? esc(s.done_at) : (s.planned_month ? 'planned ' + esc(s.planned_month) : 'unplanned')}</span>
      </div>`).join('')}</section>
    <section><h3 class="lab">Notes</h3>
      <form class="noteform"><input name="body" placeholder="Jot something down" required><button>Add</button></form>
      ${notes.map(n => `<p class="note"><b>${esc(n.created_at.slice(0, 10))}</b> ${esc(n.body)}</p>`).join('')}</section>`;
}

export function renderProjects(root) {
  const id = openId();
  const p = id && S.projects.find(x => x.id === id);
  root.innerHTML = p
    ? detail(p)
    : `<header class="hd"><b>Projects</b></header>${list()}`;

  if (p) import('../lib/scene3d.js')
    .then(m => m.renderScene(document.getElementById('scene'), p, S))
    .catch(() => {});   // no scene module yet, or no WebGL — the view above stands alone

  bind(root, 'click', onClick);
  bind(root, 'submit', onSubmit);
}

async function onClick(e) {
  const open = e.target.closest('[data-open]');
  if (open) { history.pushState({ route: 'projects' }, '', `#/projects?p=${open.dataset.open}`); renderProjects(e.currentTarget); return; }
  if (e.target.closest('[data-back]')) { history.pushState({ route: 'projects' }, '', '#/projects'); renderProjects(e.currentTarget); return; }
  const st = e.target.closest('[data-step]');
  if (!st || st.dataset.busy) return;   // a second tap before the write resolves must not log twice
  st.dataset.busy = '1';
  try {
    await run('stepComplete', { step_id: st.dataset.step, person_id: S.me });
    await refresh();
  } catch {
    delete st.dataset.busy;
    toast('Could not save — try again', 'bad');
  }
}

async function onSubmit(e) {
  if (!e.target.classList.contains('noteform')) return;
  e.preventDefault();
  const form = e.target;
  if (form.dataset.busy) return;   // a second submit before the write resolves must not log twice
  const body = form.body.value.trim();
  if (!body) return;
  form.dataset.busy = '1';
  try {
    await run('noteAdd', { project_id: openId(), body, author_id: S.me });
    form.reset();
    await refresh();
  } catch {
    delete form.dataset.busy;
    toast('Could not save the note', 'bad');
  }
}
