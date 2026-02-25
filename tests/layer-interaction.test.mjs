import test from 'node:test';
import assert from 'node:assert/strict';

import { ShapeStore } from '../src/state/shapeStore.js';
import { Line } from '../src/models/line.js';
import { isoUVToWorld } from '../src/core/isoGrid.js';

function makeLine(id, startU, startV, endU, endV) {
  return new Line({ id, start: isoUVToWorld(startU, startV), end: isoUVToWorld(endU, endV) });
}

test('cannot interact with hidden or locked layer content', () => {
  const store = new ShapeStore();
  const layerId = store.getLayerOrderIds()[0];

  store.addShape(makeLine('line-a', 0, 0, 2, 0));
  assert.deepEqual(store.getDrawList(), ['line-a']);
  assert.equal(store.getTopmostHitShape({ x: 10, y: 0 }, 6)?.id, 'line-a');

  store.setLayerVisibility(layerId, false);
  assert.deepEqual(store.getDrawList(), []);
  assert.equal(store.getTopmostHitShape({ x: 10, y: 0 }, 6), null);
  assert.deepEqual(store.duplicateNodes(['line-a'], { offset: { x: 5, y: 5 } }), []);

  store.setLayerVisibility(layerId, true);
  store.setLayerLocked(layerId, true);
  assert.deepEqual(store.getDrawList(), []);
  assert.equal(store.getTopmostHitShape({ x: 10, y: 0 }, 6), null);

  store.deleteNodesInEntirety(['line-a']);
  assert.ok(store.getNodeById('line-a'));
  assert.equal(store.reorderSelectionZ(['line-a'], 'front'), false);
});

test('move selection to active layer normalizes child ids to object roots', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];
  const layerB = store.createLayer({ name: 'Layer B' });

  store.setActiveLayer(layerA);
  store.addShape(makeLine('line-a', 0, 0, 1, 0));
  store.addShape(makeLine('line-b', 1, 0, 2, 0));

  const objectId = store.createObjectFromIds(['line-a', 'line-b'], { name: 'Pair' });
  assert.ok(objectId);
  assert.equal(store.getNodeLayerId(objectId), layerA);

  store.setActiveLayer(layerB);
  const moved = store.moveNodesToLayer(['line-a'], store.getActiveLayerId());

  assert.deepEqual(moved, [objectId]);
  assert.equal(store.getNodeLayerId(objectId), layerB);
  assert.equal(store.getNodeLayerId('line-a'), layerB);
  assert.equal(store.getNodeLayerId('line-b'), layerB);
});

test('move selection to active layer is blocked when target layer is hidden or locked', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];
  const layerB = store.createLayer({ name: 'Layer B' });

  store.setActiveLayer(layerA);
  store.addShape(makeLine('line-a', 0, 0, 1, 0));

  store.setLayerVisibility(layerB, false);
  store.setActiveLayer(layerB);
  assert.deepEqual(store.moveNodesToLayer(['line-a'], store.getActiveLayerId()), []);
  assert.equal(store.getNodeLayerId('line-a'), layerA);

  store.setLayerVisibility(layerB, true);
  store.setLayerLocked(layerB, true);
  assert.deepEqual(store.moveNodesToLayer(['line-a'], store.getActiveLayerId()), []);
  assert.equal(store.getNodeLayerId('line-a'), layerA);
});

test('object on locked layer cannot be duplicated, deleted, or moved by child selection', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];
  const layerB = store.createLayer({ name: 'Layer B' });

  store.setActiveLayer(layerA);
  store.addShape(makeLine('line-a', 0, 0, 1, 0));
  store.addShape(makeLine('line-b', 1, 0, 2, 0));
  const objectId = store.createObjectFromIds(['line-a', 'line-b'], { name: 'Pair' });
  assert.ok(objectId);

  store.setLayerLocked(layerA, true);
  assert.deepEqual(store.duplicateNodes(['line-a'], { offset: { x: 5, y: 5 } }), []);
  assert.deepEqual(store.deleteNodesInEntirety(['line-a']), []);
  assert.ok(store.getNodeById('line-a'));

  store.setLayerLocked(layerA, false);
  store.setLayerLocked(layerB, true);
  assert.deepEqual(store.moveNodesToLayer(['line-a'], layerB), []);
  assert.equal(store.getNodeLayerId(objectId), layerA);
});

test('duplicate within layer keeps duplicated object subtree in same source layer', () => {
  const store = new ShapeStore();
  const layerId = store.getLayerOrderIds()[0];

  store.addShape(makeLine('line-a', 0, 0, 1, 0));
  store.addShape(makeLine('line-b', 1, 0, 2, 0));
  const objectId = store.createObjectFromIds(['line-a', 'line-b'], { name: 'Pair' });
  assert.ok(objectId);

  const [duplicatedObjectId] = store.duplicateNodes([objectId], { offset: { x: 10, y: 10 } });
  assert.ok(duplicatedObjectId);
  assert.equal(store.getNodeLayerId(duplicatedObjectId), layerId);

  const duplicatedObject = store.getNodeById(duplicatedObjectId);
  assert.equal(duplicatedObject?.kind, 'object');
  assert.equal(duplicatedObject.children.length, 2);
  for (const childId of duplicatedObject.children) {
    assert.equal(store.getNodeLayerId(childId), layerId);
    assert.equal(store.parentById[childId], duplicatedObjectId);
  }
});

test('move object between layers resolves child selections to object roots', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];
  const layerB = store.createLayer({ name: 'Layer B' });

  store.setActiveLayer(layerA);
  store.addShape(makeLine('line-a', 0, 0, 1, 0));
  store.addShape(makeLine('line-b', 1, 0, 2, 0));
  const objectId = store.createObjectFromIds(['line-a', 'line-b'], { name: 'Pair' });
  assert.ok(objectId);

  const moved = store.moveNodesToLayer(['line-a', objectId, 'line-b'], layerB);
  assert.deepEqual(moved, [objectId]);
  assert.equal(store.getNodeLayerId(objectId), layerB);
  assert.equal(store.getNodeLayerId('line-a'), layerB);
  assert.equal(store.getNodeLayerId('line-b'), layerB);
});
