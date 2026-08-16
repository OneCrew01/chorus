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
    try { spec = await (await fetch(`parts/${project.parts_key}.json`)).json(); }
    catch { return; }                              // no parts file yet — perfectly normal

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

    let dragging = false, lastX = 0;
    renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; });
    addEventListener('pointerup', () => { dragging = false; });
    addEventListener('pointermove', e => {
      if (!dragging) return;
      group.rotation.y += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
    });

    (function loop() {
      if (!host.isConnected) { renderer.dispose(); return; }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
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
