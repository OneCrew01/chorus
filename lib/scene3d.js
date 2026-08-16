// The scene is NEVER load-bearing. Every failure path returns quietly and the
// project view (views/projects.js) stands on its own. See spec §10.3.

import { escAttr } from '../ui.js';

export function buildPartList(parts, completedIds) {
  return {
    solid: parts.filter(p => completedIds.has(p.id)),
    ghost: parts.filter(p => !completedIds.has(p.id))
  };
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export async function renderScene(host, project, state) {
  if (!host) return;
  if (project.type !== 'constructive' || !project.parts_key) return renderPhotoScene(host, project, state);
  try {
    if (!hasWebGL()) return;                       // silent, graceful, no error UI

    let spec;
    try {
      const res = await fetch(`parts/${project.parts_key}.json`);
      if (!res.ok) return;                          // no parts file yet — perfectly normal
      spec = await res.json();
    } catch { return; }                             // network/parse failure — same, stay quiet

    const THREE = await import('../vendor/three.module.js');

    const completed = new Set(
      state.steps.filter(s => s.project_id === project.id && s.done_at)
        .flatMap(s => String(s.part_ids || '').split(',').filter(Boolean))
    );
    const { solid, ghost } = buildPartList(spec.parts, completed);

    const w = host.clientWidth || 320, h = 240;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h);
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(...spec.camera.position);
    camera.lookAt(...spec.camera.target);

    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
    sun.position.set(6, 9, 4);
    scene.add(sun);

    const group = new THREE.Group();
    const add = (p, isGhost) => {
      const m = spec.materials[p.material] || { color: '#cccccc', roughness: 0.9 };
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...p.size),
        new THREE.MeshStandardMaterial({
          color: m.color, roughness: m.roughness,
          transparent: isGhost, opacity: isGhost ? 0.14 : 1
        })
      );
      mesh.position.set(...p.pos);
      group.add(mesh);
    };
    solid.forEach(p => add(p, false));
    ghost.forEach(p => add(p, true));   // the goal stays visible from day one
    scene.add(group);

    // Registered on the canvas itself, not window/document: views/projects.js
    // re-renders the whole detail view (and re-invokes renderScene) on every
    // refresh, including a step-toggle on the *same* open project. Listeners
    // on window outlive that render and pin this closure's `group` — and
    // through it the whole scene, lights and camera — in window's listener
    // table forever. Canvas-scoped listeners are collected with the canvas
    // the moment host.innerHTML is replaced, same as ui.js's bind() keeps
    // the rest of this app from stacking handlers across re-renders.
    let dragging = false, lastX = 0;
    const dom = renderer.domElement;
    const onPointerDown = e => { dragging = true; lastX = e.clientX; };
    const onPointerUp = () => { dragging = false; };
    const onPointerMove = e => {
      if (!dragging) return;
      group.rotation.y += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
    };
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointermove', onPointerMove);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointermove', onPointerMove);
      renderer.dispose();
    };

    (function loop() {
      // Everything after the first, synchronous call runs from a fresh
      // requestAnimationFrame call stack, outside the try/catch that wraps
      // renderScene's setup. A throw on frame 2+ (context loss, a driver
      // reset) must not be allowed to kill the rAF chain silently and leave
      // a frozen, undisposed host with no signal — so each frame gets its
      // own guard, and any throw here also stops and cleans up quietly.
      try {
        if (!host.isConnected) { cleanup(); return; }
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
      } catch {
        cleanup();
      }
    })();
  } catch {
    // Any failure anywhere in the WebGL path (bad parts file, three.js load
    // failure, a renderer error) leaves the host as-is and the rest of the
    // project view fully usable. The outer import().catch() in projects.js
    // only ever needs to catch a failed import of this module itself.
  }
}

export function renderPhotoScene(host, project, state) {
  try {
    const photos = state.photos.filter(p => p.project_id === project.id)
      .sort((a, b) => b.taken_at.localeCompare(a.taken_at));
    if (!photos.length) return;
    host.innerHTML = `<div class="photoscene">${photos.slice(0, 4).map((p, i) =>
      `<img class="ps ps--${i}" src="https://drive.google.com/thumbnail?id=${encodeURIComponent(p.drive_file_id)}&sz=w800" alt="${escAttr(p.caption || '')}">`
    ).join('')}</div>`;
  } catch {
    // A malformed photo record must not break the rest of the project view.
  }
}
