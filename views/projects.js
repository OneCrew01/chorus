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
    ${p.type === 'restoration' ? `<label class="shoot">
      <input type="file" accept="image/*" capture="environment" hidden id="shot">
      <span>📷 Add a photo of where it stands</span></label>` : ''}
    ${next ? `<div class="next"><span class="lab">Next step</span><b>${esc(next.title)}</b>
      <p>${esc(next.detail)}</p>${next.materials_note ? `<p class="mat">Needs: ${esc(next.materials_note)}</p>` : ''}
      <button class="go" data-step="${escAttr(next.id)}">Mark this done</button></div>` : '<p class="muted pad">Every step is done.</p>'}
    <section><h3 class="lab">All steps</h3>
      ${steps.map(s => `<div class="row ${s.done_at ? 'row--done' : ''}">
        <button class="ck ${s.done_at ? 'ck--on' : ''}" data-step="${escAttr(s.id)}"></button>
        <span class="row__t">${esc(s.seq)}. ${esc(s.title)}${s.materials_note ? `<small class="row__mat">${esc(s.materials_note)}</small>` : ''}</span>
        <span class="row__m">${s.done_at ? esc(s.done_at) : (s.planned_month ? 'planned ' + esc(s.planned_month) : 'unplanned')}</span>
      </div>`).join('')}
      <form class="stepform">
        <input name="title" placeholder="Add a step" required>
        <input name="detail" placeholder="What it involves (optional)">
        <input name="materials" placeholder="Materials needed (optional)">
        <button>Add step</button>
      </form></section>
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
  bind(root, 'change', onChange);
}

// The same step renders in two controls at once — the Next-step callout's
// "Mark this done" button and that step's own row checkbox in "All steps" —
// since `next` is just the first undone step and steps.map() renders every
// step including it. Guarding dataset.busy on the tapped node leaves the
// other control live, so the guard is keyed on the step id itself, in a
// module-level set that outlives any single render.
const inFlight = new Set();

async function onClick(e) {
  const open = e.target.closest('[data-open]');
  if (open) { history.pushState({ route: 'projects' }, '', `#/projects?p=${open.dataset.open}`); renderProjects(e.currentTarget); return; }
  if (e.target.closest('[data-back]')) { history.pushState({ route: 'projects' }, '', '#/projects'); renderProjects(e.currentTarget); return; }
  const st = e.target.closest('[data-step]');
  if (!st) return;
  const stepId = st.dataset.step;
  if (inFlight.has(stepId)) return;   // either control for this step already has a write in flight
  inFlight.add(stepId);
  try {
    // Write and reload are different failure modes — a successful
    // stepComplete followed only by a failed refresh() must not report
    // "Could not save": the step DID complete, and telling the operator
    // otherwise invites a duplicate write past the guard above.
    try {
      await run('stepComplete', { step_id: stepId, person_id: S.me });
    } catch {
      toast('Could not save — try again', 'bad');
      return;
    }
    try {
      await refresh();
    } catch {
      toast('Saved — but the screen could not refresh. Pull to retry.', 'bad');
    }
  } finally {
    // refresh() re-renders the detail view; on success the step now has
    // done_at set so neither control re-fires anyway, but on failure the
    // same two live nodes remain — release unconditionally or a failed
    // write leaves the step permanently untappable.
    inFlight.delete(stepId);
  }
}

async function onSubmit(e) {
  const form = e.target;
  if (form.classList.contains('stepform')) { e.preventDefault(); return addStep(form); }
  if (!form.classList.contains('noteform')) return;
  e.preventDefault();
  if (form.dataset.busy) return;   // a second submit before the write resolves must not log twice
  const body = form.body.value.trim();
  if (!body) return;
  form.dataset.busy = '1';
  // Same write/reload split as onClick above: a successful noteAdd followed
  // only by a failed refresh() must not report "Could not save the note" —
  // the note landed, only the screen didn't update to show it.
  try {
    await run('noteAdd', { project_id: openId(), body, author_id: S.me });
  } catch {
    delete form.dataset.busy;
    toast('Could not save the note', 'bad');
    return;
  }
  form.reset();
  try {
    await refresh();
  } catch {
    delete form.dataset.busy;
    toast('Saved — but the screen could not refresh. Pull to retry.', 'bad');
  }
}

const PHOTO_MAX_EDGE = 1600;

// A phone photo is 3-12MB; base64 inflates that ~33% into the JSON body —
// slow-to-failing on cell data, and the user just sees "Could not upload the
// photo." Downscale via canvas before it ever becomes a data URL. Re-encodes
// as JPEG regardless of source format, which also sidesteps HEIC/whatever
// the phone camera actually wrote landing in a PNG-only <canvas> pipeline.
function downscaleImage(file, maxEdge = PHOTO_MAX_EDGE, quality = 0.85) {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read that photo')); };
    img.src = objectUrl;
  });
}

// Adding a step to an open project. Same busy-guard and write/reload split
// as every other write in this file: a step that saved but whose screen
// failed to refresh must never be reported as "could not add", because that
// invites the operator to add it a second time.
async function addStep(form) {
  if (form.dataset.busy) return;
  const title = form.title.value.trim();
  if (!title) return;
  const projectId = openId();
  if (!projectId) return;
  form.dataset.busy = '1';

  // seq drives display order and the "next step" callout. Take the highest
  // existing seq rather than the count, so adding a step to a project whose
  // steps were seeded 1..14 continues at 15 instead of colliding.
  const seq = S.steps
    .filter(s => s.project_id === projectId)
    .reduce((max, s) => Math.max(max, Number(s.seq) || 0), 0) + 1;

  try {
    await run('stepUpsert', {
      step: {
        project_id: projectId,
        seq,
        title,
        detail: form.detail.value.trim(),
        materials_note: form.materials.value.trim(),
        part_ids: []   // only the seeded pergola steps map to 3D geometry
      }
    });
  } catch {
    delete form.dataset.busy;
    toast('Could not add the step', 'bad');
    return;
  }
  form.reset();
  toast('Step added');
  try {
    await refresh();
  } catch {
    delete form.dataset.busy;
    toast('Saved — but the screen could not refresh. Pull to retry.', 'bad');
  }
}

// Raw passthrough for formats the browser will not decode into a canvas.
// No resizing happens here — that is the trade for supporting HEIC at all.
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not read that photo'));
    fr.onabort = () => reject(new Error('Photo read was cancelled'));
    fr.readAsDataURL(file);
  });
}

async function onChange(e) {
  if (e.target.id !== 'shot' || !e.target.files?.length) return;
  const input = e.target;
  if (input.dataset.busy) return;   // a second change event before the upload resolves must not fire twice
  const file = input.files[0];
  // The accept="image/*" attribute is advisory only — a file picker or file
  // manager can still hand back anything. Check the real type before doing
  // any work with it.
  if (!file.type.startsWith('image/')) {
    toast('That file is not a photo', 'bad');
    input.value = '';
    return;
  }
  input.dataset.busy = '1';
  try {
    // Write and reload are different failure modes here too: a successful
    // photoAdd followed only by a failed refresh() must not report "Could
    // not upload the photo" — it uploaded; only the screen didn't refresh to
    // show it.
    try {
      let dataUrl;
      try {
        dataUrl = await downscaleImage(file);
      } catch {
        // The canvas path needs the BROWSER to decode the image, and most
        // browsers cannot decode HEIC — which is what an iPhone produces on
        // default settings, i.e. exactly the photo this feature exists for.
        // Fall back to shipping the original bytes: larger, and it skips the
        // downscale, but api_photoAdd_'s 8MB cap still backstops it and a
        // normal phone photo lands well under that. Better a big upload than
        // a feature that silently refuses the one camera it was built for.
        dataUrl = await readFileAsDataUrl(file);
      }
      await run('photoAdd', { project_id: openId(), dataUrl, caption: '' });
    } catch (err) {
      delete input.dataset.busy;
      toast(err?.code === 'PHOTO_TOO_LARGE' ? err.message : 'Could not upload the photo', 'bad');
      return;
    }
    toast('Photo added');
    try {
      await refresh();
    } catch {
      delete input.dataset.busy;
      toast('Saved — but the screen could not refresh. Pull to retry.', 'bad');
    }
  } finally {
    input.value = '';   // so picking the same file twice in a row still fires change
  }
}
