import test from 'node:test';
import assert from 'node:assert/strict';

import { isoUVToWorld, snapWorldToIsoAxis, worldToIsoUV } from '../src/core/isoGrid.js';

test('third iso axis lines run up/down (constant d has constant x)', () => {
  const p0 = isoUVToWorld(2 + (-3), -3);
  const p1 = isoUVToWorld(2 + 4, 4);
  assert.ok(Math.abs(p0.x - p1.x) < 1e-9);
  assert.notEqual(p0.y, p1.y);
});

test('axis snapping can snap to all three iso axis families', () => {
  const nearU = isoUVToWorld(2.05, 5.4);
  const nearV = isoUVToWorld(7.55, -1.05);
  const nearD = isoUVToWorld(3.35, 2.4);

  const snappedU = snapWorldToIsoAxis(nearU);
  const snappedV = snapWorldToIsoAxis(nearV);
  const snappedD = snapWorldToIsoAxis(nearD);

  assert.equal(snappedU.axis, 'u');
  assert.equal(snappedV.axis, 'v');
  assert.equal(snappedD.axis, 'd');

  const uvU = worldToIsoUV(snappedU.point);
  const uvV = worldToIsoUV(snappedV.point);
  const uvD = worldToIsoUV(snappedD.point);

  assert.ok(Math.abs(uvU.u - Math.round(uvU.u)) < 1e-9);
  assert.ok(Math.abs(uvV.v - Math.round(uvV.v)) < 1e-9);
  assert.ok(Math.abs((uvD.u - uvD.v) - Math.round(uvD.u - uvD.v)) < 1e-9);
});
