import test from 'node:test';
import assert from 'node:assert/strict';

import { ShapeStore } from '../src/state/shapeStore.js';
import { Line } from '../src/models/line.js';
import { isoUVToWorld } from '../src/core/isoGrid.js';

function makeBoundaryLine(id, startU, startV, endU, endV) {
  return new Line({
    id,
    start: isoUVToWorld(startU, startV),
    end: isoUVToWorld(endU, endV),
    strokeColor: '#000000',
    strokeWidth: 3,
  });
}

test('createFaceFromRegion clones style for missing generated boundary lines', () => {
  const store = new ShapeStore();
  store.addShape(makeBoundaryLine('line-a', 0, 0, 2, 0));
  store.addShape(makeBoundaryLine('line-b', 2, 0, 2, 2));
  store.addShape(makeBoundaryLine('line-c', 2, 2, 0, 2));

  const faceId = store.createFaceFromRegion({
    id: 'region-1',
    uvCycle: [
      { u: 0, v: 0 },
      { u: 2, v: 0 },
      { u: 2, v: 2 },
      { u: 0, v: 2 },
    ],
  }, {
    fillColor: '#4aa3ff',
    fillAlpha: 1,
  });

  assert.ok(faceId, 'expected a face to be created');

  const faceNode = store.nodes[faceId];
  const sourceLineIds = faceNode?.meta?.sourceLineIds ?? [];
  assert.equal(sourceLineIds.length, 4, 'expected sourceLineIds to include generated missing edge');

  const generatedLineId = sourceLineIds.find((id) => !['line-a', 'line-b', 'line-c'].includes(id));
  assert.ok(generatedLineId, 'expected one generated boundary line id');

  const generatedLineNode = store.nodes[generatedLineId];
  assert.equal(generatedLineNode?.style?.strokeColor, '#000000');
  assert.equal(generatedLineNode?.style?.strokeWidth, 3);
});
