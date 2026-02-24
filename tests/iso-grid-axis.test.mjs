import test from 'node:test';
import assert from 'node:assert/strict';

import { isoUVToWorld, snapWorldToIsoAxis } from '../src/core/isoGrid.js';

test('third iso axis lines run up/down (constant d has constant x)', () => {
  const p0 = isoUVToWorld(2 + (-3), -3);
  const p1 = isoUVToWorld(2 + 4, 4);
  assert.ok(Math.abs(p0.x - p1.x) < 1e-9);
  assert.notEqual(p0.y, p1.y);
});

test('axis snapping snaps to nearest constant-d line', () => {
  const raw = { x: 20, y: 37 };
  const snapped = snapWorldToIsoAxis(raw);
  const dFromUv = snapped.u - snapped.v;

  assert.equal(snapped.d, Math.round(dFromUv));
  assert.ok(Math.abs(dFromUv - snapped.d) < 1e-9);
});
