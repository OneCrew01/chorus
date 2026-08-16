import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPartList } from '../lib/scene3d.js';

const parts = [{ id: 'post1' }, { id: 'post2' }, { id: 'post3' }, { id: 'beamA' }];

test('completed parts are solid, the rest are ghosts', () => {
  const r = buildPartList(parts, new Set(['post1', 'post2']));
  assert.deepEqual(r.solid.map(p => p.id), ['post1', 'post2']);
  assert.deepEqual(r.ghost.map(p => p.id), ['post3', 'beamA']);
});

test('nothing completed still shows the whole goal as ghosts', () => {
  const r = buildPartList(parts, new Set());
  assert.equal(r.solid.length, 0);
  assert.equal(r.ghost.length, 4);
});

test('a part id with no matching step never disappears', () => {
  const r = buildPartList(parts, new Set(['nope']));
  assert.equal(r.solid.length + r.ghost.length, 4);
});
