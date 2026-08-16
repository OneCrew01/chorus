export const $ = (sel, root = document) => root.querySelector(sel);

// esc() is for TEXT. escAttr() is for ATTRIBUTE VALUES — it also escapes quotes.
// Using esc() inside an attribute lets a title containing " break out of it.
export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escAttr = s => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('toast--in'), 10);
  setTimeout(() => { el.classList.remove('toast--in'); setTimeout(() => el.remove(), 300); }, 3200);
}

// Views re-render on every refresh. addEventListener would stack a new listener
// each time, so one tap would fire twice. Replace, never accumulate.
export function bind(root, type, handler) {
  const key = '_ch_' + type;
  if (root[key]) root.removeEventListener(type, root[key]);
  root[key] = handler;
  root.addEventListener(type, handler);
}
