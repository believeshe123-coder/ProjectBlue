import test from 'node:test';
import assert from 'node:assert/strict';

import { ShapeStore } from '../src/state/shapeStore.js';
import { Line } from '../src/models/line.js';
import { isoUVToWorld } from '../src/core/isoGrid.js';

function makeLine(id, startU, startV, endU, endV) {
  return new Line({ id, start: isoUVToWorld(startU, startV), end: isoUVToWorld(endU, endV) });
}

test('getDrawList and hit-testing ignore hidden/locked layers', () => {
  const store = new ShapeStore();
  const layerId = store.getLayerOrderIds()[0];
  const line = makeLine('line-a', 0, 0, 2, 0);
  store.addShape(line);

  assert.deepEqual(store.getDrawList(), ['line-a']);
  const hit = store.getTopmostHitShape({ x: 10, y: 0 }, 6);
  assert.equal(hit?.id, 'line-a');

  store.nodes[layerId].visible = false;
  assert.deepEqual(store.getDrawList(), []);
  assert.equal(store.getTopmostHitShape({ x: 10, y: 0 }, 6), null);

  store.nodes[layerId].visible = true;
  store.nodes[layerId].locked = true;
  assert.deepEqual(store.getDrawList(), []);
  assert.equal(store.getTopmostHitShape({ x: 10, y: 0 }, 6), null);
});

test('createObjectFromIds keeps nodes in same layer and blocks cross-layer parenting', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];
  const layerB = 'layer-b';
  store.nodes[layerB] = {
    id: layerB,
    kind: 'layer',
    name: 'Layer B',
    visible: true,
    locked: false,
    children: [],
    createdAt: Date.now(),
  };
  store.rootIds.push(layerB);

  store.addShape(makeLine('line-a', 0, 0, 1, 0));
  store.addShape(makeLine('line-b', 2, 0, 3, 0));
  store.attachNodeToLayer('line-b', layerB);

  const objectId = store.createObjectFromIds(['line-a', 'line-b'], { name: 'Obj' });
  const objectNode = store.getNodeById(objectId);
  assert.ok(objectNode);
  assert.deepEqual(objectNode.children, ['line-a']);
  assert.equal(store.getNodeLayerId(objectId), layerA);
  assert.equal(store.getNodeLayerId('line-b'), layerB);
});

test('serialize/replaceFromSerialized preserve layer properties and order', () => {
  const store = new ShapeStore();
  const layerA = store.getLayerOrderIds()[0];
  const layerB = 'layer-b';
  store.nodes[layerA].visible = false;
  store.nodes[layerA].locked = true;
  store.nodes[layerB] = {
    id: layerB,
    kind: 'layer',
    name: 'Layer B',
    visible: true,
    locked: false,
    children: [],
    createdAt: Date.now(),
  };
  store.rootIds.push(layerB);
  store.activeLayerId = layerB;

  const serialized = store.serialize();
  const restored = new ShapeStore();
  restored.replaceFromSerialized(serialized);

  assert.deepEqual(restored.getLayerOrderIds(), [layerA, layerB]);
  assert.equal(restored.nodes[layerA].visible, false);
  assert.equal(restored.nodes[layerA].locked, true);
  assert.equal(restored.activeLayerId, layerB);
});

test('duplicateNodes clones subtree, remaps metadata, and inserts above source roots', () => {
  const store = new ShapeStore();
  const layerId = store.getLayerOrderIds()[0];
  store.addShape(makeLine('line-a', 0, 0, 1, 0));
  store.addShape(makeLine('line-b', 1, 0, 2, 0));

  const faceId = 'face-a';
  store.nodes[faceId] = {
    id: faceId,
    kind: 'shape',
    shapeType: 'face',
    localGeom: { points: [isoUVToWorld(0, 0), isoUVToWorld(1, 0), isoUVToWorld(0, 1)] },
    nodeTransform: { x: 0, y: 0, rot: 0 },
    style: { id: faceId, type: 'face', sourceLineIds: ['line-a', 'line-b'], visible: true, locked: false },
    meta: { sourceLineIds: ['line-a', 'line-b'] },
    createdAt: Date.now(),
  };
  store.attachNodeToLayer(faceId, layerId);
  store.nodes['line-a'].localGeom.ownedByFaceIds = [faceId];
  store.nodes['line-b'].localGeom.ownedByFaceIds = [faceId];

  const objectId = store.createObjectFromIds(['line-a', 'line-b', faceId], { name: 'Obj' });
  const beforeChildren = [...store.nodes[layerId].children];

  const [cloneObjectId] = store.duplicateNodes([objectId], { offset: { x: 10, y: 12 } });
  assert.ok(cloneObjectId);
  assert.notEqual(cloneObjectId, objectId);

  const afterChildren = store.nodes[layerId].children;
  const sourceIndex = afterChildren.indexOf(objectId);
  assert.equal(afterChildren[sourceIndex + 1], cloneObjectId);
  assert.equal(afterChildren.length, beforeChildren.length + 1);

  const cloneObject = store.nodes[cloneObjectId];
  assert.equal(cloneObject.transform.x, 10);
  assert.equal(cloneObject.transform.y, 12);
  assert.equal(cloneObject.children.length, 3);

  const cloneLines = cloneObject.children.filter((id) => store.nodes[id]?.shapeType === 'line');
  const cloneFaceId = cloneObject.children.find((id) => store.nodes[id]?.shapeType === 'face');
  assert.equal(cloneLines.length, 2);
  assert.ok(cloneFaceId);

  const cloneFace = store.nodes[cloneFaceId];
  const clonedSourceLineIds = cloneFace.meta.sourceLineIds;
  assert.deepEqual(new Set(clonedSourceLineIds), new Set(cloneLines));
  for (const lineId of cloneLines) {
    const lineNode = store.nodes[lineId];
    assert.deepEqual(lineNode.localGeom.ownedByFaceIds, [cloneFaceId]);
  }
});
