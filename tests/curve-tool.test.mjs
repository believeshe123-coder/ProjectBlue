import test from 'node:test';
import assert from 'node:assert/strict';

import { createCurveSegments } from '../src/tools/curveTool.js';

function point(x, y) {
  return { x, y };
}

test('createCurveSegments uses minimum density for short curves', () => {
  const segments = createCurveSegments(
    point(0, 0),
    point(20, 0),
    point(40, 0),
    { strokeColor: '#fff', strokeWidth: 2 },
  );

  assert.equal(segments.length, 32);
  assert.deepEqual(segments[0].startUV, { u: 0, v: 0 });
  assert.equal(segments.at(-1).endUV.u, 0.5);
  assert.equal(segments.at(-1).endUV.v, -0.5);
  for (let index = 1; index < segments.length; index += 1) {
    assert.deepEqual(segments[index - 1].endUV, segments[index].startUV);
  }
});

test('createCurveSegments scales up and clamps for long curves', () => {
  const segments = createCurveSegments(
    point(0, 0),
    point(3000, 0),
    point(6000, 0),
    { strokeColor: '#fff', strokeWidth: 2 },
  );

  assert.equal(segments.length, 192);
});
