import { S, run, refresh } from '../app.js';
import { esc, escAttr, toast, bind } from '../ui.js';
import { dueState } from '../lib/recurrence.js';

const DEFER_KEY = 'ch_deferred';
const deferred = () => JSON.parse(localStorage.getItem(DEFER_KEY) || '{}');
const defer = id => {
  const d = deferred(); d[id] = S.todayISO;
  localStorage.setItem(DEFER_KEY, JSON.stringify(d));
};

const lastDone = id => S.log.filter(e => e.task_id === id).map(e => e.completed_at).sort().pop() || null;

function queue() {
  const d = deferred();
  const focus = (location.hash.match(/[?&]t=([^&]+)/) || [])[1];
  const items = S.tasks
    .filter(t => t.active && dueState(t, lastDone(t.id), S.todayISO).due && d[t.id] !== S.todayISO);
  if (!focus) return items;
  return [...items.filter(t => t.id === focus), ...items.filter(t => t.id !== focus)];
}

export function renderInbox(root) {
  const items = queue();
  root.innerHTML = `
    <header class="hd"><b>Inbox</b><span>${items.length} waiting</span></header>
    ${items.length ? `<div class="deck">
      ${items.slice(0, 3).reverse().map((t, i) => `<article class="dk ${i === items.slice(0,3).length - 1 ? 'dk--front' : ''}" data-task="${escAttr(t.id)}">
        <h2>${esc(t.title)}</h2>
        <p>${esc(S.people.find(p => p.id === t.owner_id)?.name || 'Anyone')}${t.est_minutes ? ` · about ${esc(t.est_minutes)} min` : ''}</p>
      </article>`).join('')}
    </div>
    <div class="deck__act">
      <button class="db db--later" data-act="later">Later</button>
      <button class="db db--done" data-act="done">Done</button>
    </div>` : '<p class="muted pad">Nothing waiting. Everything due today is handled.</p>'}`;

  bind(root, 'click', onClick);
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const front = document.querySelector('.dk--front');
  if (!front || front.dataset.busy) return;   // a second tap during the swipe-out must not write again
  front.dataset.busy = '1';
  const id = front.dataset.task;
  front.classList.add(b.dataset.act === 'done' ? 'dk--out-right' : 'dk--out-left');
  try {
    if (b.dataset.act === 'done') await run('logComplete', { task_id: id, person_id: S.me, source: 'inbox' });
    else defer(id);
  } catch {
    front.classList.remove('dk--out-right', 'dk--out-left');
    delete front.dataset.busy;                 // let them retry after a failure
    toast('Could not save — try again', 'bad');
    return;
  }
  // The write succeeded — this used to be a bare setTimeout(refresh, 220),
  // not awaited and outside any handler. If that bootstrap failed the
  // rejection was unhandled: no toast, no rollback, and the card stayed
  // swiped off-screen with dataset.busy still set — an empty, frozen-looking
  // deck that reads as success. Catch it: the card comes back and the busy
  // flag clears, but the toast says the save worked, because it did — a
  // reload failure here must never invite a duplicate tap on a card whose
  // write already landed.
  setTimeout(async () => {
    try {
      await refresh();
    } catch {
      front.classList.remove('dk--out-right', 'dk--out-left');
      delete front.dataset.busy;
      toast('Saved — but the inbox could not reload. Pull to refresh.', 'bad');
    }
  }, 220);
}
