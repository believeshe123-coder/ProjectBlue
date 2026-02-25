import test from 'node:test';
import assert from 'node:assert/strict';

import { CurveTool, createCurveSegments } from '../src/tools/curveTool.js';

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


test('CurveTool commits the previewed end point on final click', () => {
  const added = [];
  const context = {
    appState: {
      snapToGrid: false,
      snapToMidpoints: false,
      snapIndicator: null,
      snapDebugStatus: 'SNAP: OFF',
      previewShape: null,
      currentStyle: {
        strokeColor: '#ffffff',
        strokeOpacity: 1,
        strokeWidth: 2,
        fillEnabled: false,
        fillColor: '#000000',
        fillOpacity: 0,
      },
    },
    camera: { zoom: 1, screenToWorld: (point) => point },
    shapeStore: { addShape(shape) { added.push(shape); } },
    pushHistoryState() {},
  };

  const tool = new CurveTool(context);

  tool.onMouseDown({ screenPoint: point(0, 0) });
  tool.onMouseDown({ screenPoint: point(20, 20) });
  tool.onMouseMove({ screenPoint: point(60, 0) });

  tool.onMouseDown({ screenPoint: point(80, 0) });

  assert.equal(added.length > 0, true);
  const committedEnd = added.at(-1).end;
  assert.equal(committedEnd.x, 60);
  assert.equal(committedEnd.y, 0);
});
