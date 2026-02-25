import test from 'node:test';
import assert from 'node:assert/strict';

import { ShapeStore } from '../src/state/shapeStore.js';
import { Line } from '../src/models/line.js';
import { isoUVToWorld } from '../src/core/isoGrid.js';

function makeLine(id, startU, startV, endU, endV) {
  return new Line({ id, start: isoUVToWorld(startU, startV), end: isoUVToWorld(endU, endV) });
}

test('default layer bootstrap creates one active visible unlocked layer', () => {
  const store = new ShapeStore();

  const layerIds = store.getLayerOrderIds();
  assert.equal(layerIds.length, 1);

  const [layerId] = layerIds;
  const layer = store.getLayerNode(layerId);
  assert.ok(layer);
  assert.equal(layer.name, 'Layer 1');
  assert.equal(layer.visible, true);
  assert.equal(layer.locked, false);
  assert.equal(store.getActiveLayerId(), layerId);
});

test('layer mutations support add rename visibility and lock toggles', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];

  const layerB = store.createLayer({ name: 'Sketches' });
  assert.deepEqual(store.getLayerOrderIds(), [layerA, layerB]);
  assert.equal(store.getActiveLayerId(), layerB);

  assert.equal(store.setLayerName(layerB, 'Concept'), true);
  assert.equal(store.getLayerNode(layerB).name, 'Concept');

  assert.equal(store.setLayerVisibility(layerB, false), true);
  assert.equal(store.getLayerNode(layerB).visible, false);

  assert.equal(store.setLayerLocked(layerB, true), true);
  assert.equal(store.getLayerNode(layerB).locked, true);

  assert.equal(store.setLayerName(layerB, '   '), false);
  assert.equal(store.getLayerNode(layerB).name, 'Concept');
});

test('serialize and replaceFromSerialized preserve layer order and active layer', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];
  const layerB = store.createLayer({ name: 'Layer B' });
  const layerC = store.createLayer({ name: 'Layer C' });

  store.setLayerLocked(layerA, true);
  store.setLayerVisibility(layerB, false);
  store.reorderLayers([layerC, layerA, layerB]);
  store.setActiveLayer(layerA);

  store.setActiveLayer(layerB);
  store.addShape(makeLine('line-b', 0, 0, 2, 0));

  const snapshot = store.serialize();
  const restored = new ShapeStore();
  restored.replaceFromSerialized(snapshot);

  assert.deepEqual(restored.getLayerOrderIds(), [layerC, layerA, layerB]);
  assert.equal(restored.getActiveLayerId(), layerB);
  assert.equal(restored.getLayerNode(layerA).locked, true);
  assert.equal(restored.getLayerNode(layerB).visible, false);
  assert.equal(restored.getNodeLayerId('line-b'), layerB);
});

test('cannot delete final layer', () => {
  const store = new ShapeStore();
  const onlyLayerId = store.getLayerOrderIds()[0];

  const result = store.deleteLayer(onlyLayerId);
  assert.deepEqual(result, {
    ok: false,
    reason: 'cannot_delete_last_layer',
    deletedLayerId: null,
    targetLayerId: null,
  });
  assert.deepEqual(store.getLayerOrderIds(), [onlyLayerId]);
  assert.equal(store.getLayerNode(onlyLayerId) !== null, true);
});
