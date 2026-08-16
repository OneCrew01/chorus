import { $, toast, bind } from './ui.js';
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
  if (frag.get('s')) localStorage.setItem('ch_exec', frag.get('s'));
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
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}

export function navigate(route) {
  history.pushState({ route }, '', '#/' + route);
  S.route = route;
  render();
}

function render() {
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
  await refresh();
  if (!S.me) showIdentity();
}

function showPin() {
  $('#screen').innerHTML = `<div class="gate"><h1>Chorus</h1><input id="pin" type="tel" inputmode="numeric" placeholder="PIN"><button id="pinGo">Enter</button></div>`;
  $('#pinGo').addEventListener('click', async () => {
    localStorage.setItem('ch_pin', $('#pin').value);
    try { await run('ping'); boot(); }
    catch { localStorage.removeItem('ch_pin'); toast('Wrong PIN', 'bad'); }
  });
}

function showIdentity() {
  const html = S.people.filter(p => String(p.active) !== 'FALSE')
    .map(p => `<button class="who" data-id="${p.id}" style="--c:${p.color}">${p.name}</button>`).join('');
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
addEventListener('popstate', e => { S.route = e.state?.route || 'momentum'; render(); });

boot();
