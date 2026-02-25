import test from 'node:test';
import assert from 'node:assert/strict';

import { createCurveSegments } from '../src/tools/curveTool.js';

function point(x, y) {
  return { x, y };
}

function nearlyEqual(actual, expected, epsilon = 1e-6) {
  return Math.abs(actual - expected) <= epsilon;
}

test('createCurveSegments uses minimum density for short curves', () => {
  const start = point(0, 0);
  const control = point(20, 0);
  const end = point(40, 0);
  const segments = createCurveSegments(start, control, end, { strokeColor: '#fff', strokeWidth: 2 });

  assert.equal(segments.length, 32);
  assert.equal(segments[0].snapToGrid, false);
  assert.equal(segments.at(-1).snapToGrid, false);
  assert.ok(nearlyEqual(segments[0].start.x, start.x));
  assert.ok(nearlyEqual(segments[0].start.y, start.y));
  assert.ok(nearlyEqual(segments.at(-1).end.x, end.x));
  assert.ok(nearlyEqual(segments.at(-1).end.y, end.y));

  for (let index = 1; index < segments.length; index += 1) {
    assert.ok(nearlyEqual(segments[index - 1].end.x, segments[index].start.x));
    assert.ok(nearlyEqual(segments[index - 1].end.y, segments[index].start.y));
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
