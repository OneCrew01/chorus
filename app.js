import { $, esc, escAttr, toast, bind } from './ui.js';
import { demoRun } from './demo.js';
import { renderMomentum } from './views/momentum.js';
import { renderDay } from './views/day.js';
import { renderInbox } from './views/inbox.js';
import { renderProjects } from './views/projects.js';

export var S = null;

const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const ROUTES = { momentum: renderMomentum, day: renderDay, inbox: renderInbox, projects: renderProjects };

function execUrl() {
  const frag = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (frag.get('s')) {
    localStorage.setItem('ch_exec', frag.get('s'));
    // Don't leave the endpoint sitting in the address bar for a screenshot to catch.
    history.replaceState(null, '', location.pathname + location.search);
  }
  return localStorage.getItem('ch_exec');
}

export async function run(method, params = {}) {
  if (DEMO) return demoRun(method, params, S);
  const res = await fetch(execUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids the CORS preflight Apps Script rejects
    body: JSON.stringify({ method, params, pin: localStorage.getItem('ch_pin') || '' })
  });
  const json = await res.json();
  if (!json.ok) {
    // Carry the backend's error code (e.g. PHOTO_TOO_LARGE) on the thrown
    // Error so a caller that cares can branch on it. Every existing call
    // site only ever reads .message, so this is additive.
    const err = new Error(json.error.message);
    err.code = json.error.code;
    throw err;
  }
  return json.data;
}

export function navigate(route) {
  history.pushState({ route }, '', '#/' + route);
  S.route = route;
  render();
}

export function render() {
  const view = ROUTES[S.route] || renderMomentum;
  view($('#screen'));
  document.querySelectorAll('.nav button').forEach(b =>
    b.classList.toggle('nav--on', b.dataset.route === S.route));
}

export async function refresh() {
  const data = await run('bootstrap');
  S = { ...data, me: localStorage.getItem('ch_me') || null, route: S?.route || 'momentum' };
  render();
}

async function boot() {
  if (!DEMO && !execUrl()) { $('#screen').innerHTML = '<p class="pad">Scan the setup link on this device first.</p>'; return; }
  if (!DEMO && !localStorage.getItem('ch_pin')) { showPin(); return; }
  S = { route: (location.hash.match(/^#\/(\w+)/) || [])[1] || 'momentum' };
  try {
    await refresh();
  } catch (err) {
    $('#screen').innerHTML =
      `<p class="pad muted">Couldn't reach Chorus.<br>Check your connection and pull to retry.</p>`;
    toast('Could not load — ' + err.message, 'bad');
    return;
  }
  if (!S.me) showIdentity();
}

function showPin() {
  $('#screen').innerHTML = `<div class="gate"><h1>Chorus</h1><input id="pin" type="tel" inputmode="numeric" placeholder="PIN"><button id="pinGo">Enter</button></div>`;
  $('#pinGo').addEventListener('click', async () => {
    localStorage.setItem('ch_pin', $('#pin').value);
    try { await run('ping'); await boot(); }
    catch { localStorage.removeItem('ch_pin'); toast('Wrong PIN', 'bad'); }
  });
}

function showIdentity() {
  const html = S.people.filter(p => String(p.active) !== 'FALSE')
    .map(p => `<button class="who" data-id="${escAttr(p.id)}" style="--c:${escAttr(p.color)}">${esc(p.name)}</button>`).join('');
  $('#overlay').innerHTML = `<div class="sheet"><h2>Who's this?</h2><div class="whos">${html}</div></div>`;
  $('#overlay').hidden = false;
  bind($('#overlay'), 'click', e => {
    const b = e.target.closest('.who');
    if (!b) return;
    localStorage.setItem('ch_me', b.dataset.id);
    S.me = b.dataset.id;
    $('#overlay').hidden = true;
    render();
  });
}

// Event delegation, one listener. No inline on*= handlers anywhere in this app.
document.addEventListener('click', e => {
  const nav = e.target.closest('.nav button');
  if (nav) navigate(nav.dataset.route);
});
addEventListener('popstate', e => {
  if (!S) return;              // not booted (or setup-link screen) — nothing to route
  S.route = e.state?.route || 'momentum';
  render();
});

boot();

// Gated OFF in demo mode so fixture verification reads a true zero in the console.
if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
