import test from 'node:test';
import assert from 'node:assert/strict';

import { ShapeStore } from '../src/state/shapeStore.js';
import { SelectTool } from '../src/tools/selectTool.js';
import { EraseTool } from '../src/tools/eraseTool.js';
import { LineTool } from '../src/tools/lineTool.js';
import { FillTool } from '../src/tools/fillTool.js';
import { Line } from '../src/models/line.js';
import { FaceShape } from '../src/models/faceShape.js';
import { Polygon } from '../src/models/polygon.js';
import { PolygonShape } from '../src/models/polygonShape.js';
import { isoUVToWorld, snapWorldToIso } from '../src/core/isoGrid.js';

import { FillRegion } from '../src/models/fillRegion.js';

function makeSelectContext(shapeStore) {
  const appState = {
    keepSelecting: false,
    selectedType: null,
    selectedIds: new Set(),
    selectedGroupId: null,
    snapToGrid: false,
    setSelection(ids = [], type = null, lastId = null) {
      this.selectedIds = new Set(ids);
      this.selectedType = ids.length ? type : null;
      this.lastSelectedId = lastId;
    },
    addToSelection(id, type) {
      if (this.selectedType && this.selectedType !== type) {
        this.setSelection([id], type, id);
        return;
      }
      this.selectedType = type;
      this.selectedIds.add(id);
      this.lastSelectedId = id;
    },
    removeFromSelection(id) {
      this.selectedIds.delete(id);
      if (!this.selectedIds.size) this.selectedType = null;
    },
    notifyStatus() {},
    updateSelectionBar() {},
    closeContextMenu() {},
    openContextMenuForSelection() {},
  };

  return {
    shapeStore,
    appState,
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
    canvas: null,
  };
}

function makeEraseContext(shapeStore) {
  return {
    shapeStore,
    appState: { eraseMode: 'line', eraserSizePx: 12, erasePreview: null, currentStyle: { strokeWidth: 2 } },
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
    historyStore: { pushState() {} },
  };
}


test('filling a polygon converts it into a face', () => {
  const shapeStore = new ShapeStore();
  const polygon = new PolygonShape({
    id: 'polygon-1',
    pointsWorld: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
    fillColor: '#ff00aa',
    fillAlpha: 0.4,
  });
  shapeStore.addShape(polygon);

  const appState = {
    enableFill: true,
    currentStyle: { fillColor: '#00ff88', fillOpacity: 0.75 },
    setSelection(ids = [], type = null, lastId = null) {
      this.selectedIds = new Set(ids);
      this.selectedType = type;
      this.lastSelectedId = lastId;
    },
    notifyStatus() {},
  };

  let historyPushes = 0;
  const fillTool = new FillTool({
    shapeStore,
    appState,
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() { historyPushes += 1; },
  });

  fillTool.onMouseDown({ event: { button: 0 }, worldPoint: { x: 10, y: 10 }, screenPoint: { x: 10, y: 10 } });

  const converted = shapeStore.getShapeById('polygon-1');
  assert.equal(converted?.type, 'face');
  assert.equal(converted?.fillColor, '#00ff88');
  assert.ok(Math.abs((converted?.fillAlpha ?? 0) - 0.75) < 1e-6);
  assert.equal(appState.selectedType, 'face');
  assert.equal(appState.lastSelectedId, 'polygon-1');
  assert.equal(historyPushes, 1);
});


test('filling still succeeds when clicking exactly on a region boundary', () => {
  const shapeStore = new ShapeStore();
  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);

  const appState = {
    enableFill: true,
    currentStyle: { fillColor: '#00ff88', fillOpacity: 0.75 },
    setSelection(ids = [], type = null, lastId = null) {
      this.selectedIds = new Set(ids);
      this.selectedType = type;
      this.lastSelectedId = lastId;
    },
    notifyStatus() {},
  };

  const fillTool = new FillTool({
    shapeStore,
    appState,
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
  });

  const onBoundary = isoUVToWorld(1, 0);
  fillTool.onMouseDown({ event: { button: 0 }, worldPoint: onBoundary, screenPoint: onBoundary });

  const createdFaceId = appState.lastSelectedId;
  const createdFace = shapeStore.getShapeById(createdFaceId);
  assert.equal(appState.selectedType, 'face');
  assert.equal(createdFace?.type, 'face');
});



test('filling a detected region in stability mode creates/selects a face with source metadata', () => {
  const shapeStore = new ShapeStore();
  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);

  const appState = {
    enableFill: true,
    disableSceneGraph: true,
    currentStyle: { fillColor: '#00ff88', fillOpacity: 0.75 },
    setSelection(ids = [], type = null, lastId = null) {
      this.selectedIds = new Set(ids);
      this.selectedType = type;
      this.lastSelectedId = lastId;
    },
    notifyStatus() {},
  };

  const fillTool = new FillTool({
    shapeStore,
    appState,
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
  });

  const center = isoUVToWorld(1, 1);
  fillTool.onMouseDown({ event: { button: 0 }, worldPoint: center, screenPoint: center });

  const createdFaceId = appState.lastSelectedId;
  const createdFace = shapeStore.getShapeById(createdFaceId);
  assert.equal(appState.selectedType, 'face');
  assert.equal(createdFace?.type, 'face');
  assert.equal(createdFace?.sourceRegionKey != null, true);
  assert.equal(createdFace?.fillColor, '#00ff88');
  assert.ok(Math.abs((createdFace?.fillAlpha ?? 0) - 0.75) < 1e-6);
});
test('filling a detected region creates/selects a face and dragging moves boundary lines', () => {
  const shapeStore = new ShapeStore();
  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);

  const appState = {
    enableFill: true,
    currentStyle: { fillColor: '#00ff88', fillOpacity: 0.75 },
    setSelection(ids = [], type = null, lastId = null) {
      this.selectedIds = new Set(ids);
      this.selectedType = type;
      this.lastSelectedId = lastId;
    },
    notifyStatus() {},
  };

  let historyPushes = 0;
  const fillTool = new FillTool({
    shapeStore,
    appState,
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() { historyPushes += 1; },
  });

  const center = isoUVToWorld(1, 1);
  fillTool.onMouseDown({ event: { button: 0 }, worldPoint: center, screenPoint: center });

  const createdFaceId = appState.lastSelectedId;
  const createdFace = shapeStore.getShapeById(createdFaceId);
  assert.equal(appState.selectedType, 'face');
  assert.equal(createdFace?.type, 'face');
  assert.equal(createdFace?.sourceRegionKey != null, true);
  assert.equal(createdFace?.fillColor, '#00ff88');
  assert.ok(Math.abs((createdFace?.fillAlpha ?? 0) - 0.75) < 1e-6);
  assert.equal(historyPushes, 1);

  appState.currentStyle = { fillColor: '#aa00ff', fillOpacity: 0.35 };
  fillTool.onMouseDown({ event: { button: 0 }, worldPoint: center, screenPoint: center });
  const updatedFace = shapeStore.getShapeById(createdFaceId);
  assert.equal(updatedFace?.fillColor, '#aa00ff');
  assert.ok(Math.abs((updatedFace?.fillAlpha ?? 0) - 0.35) < 1e-6);
  assert.equal(historyPushes, 2);

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  const faceBefore = shapeStore.getShapeById(createdFaceId);
  const lineBefore = shapeStore.getShapeById('line-a');
  const anchor = {
    x: (faceBefore.pointsWorld[0].x + faceBefore.pointsWorld[2].x) / 2,
    y: (faceBefore.pointsWorld[0].y + faceBefore.pointsWorld[2].y) / 2,
  };

  selectTool.onMouseDown({ worldPoint: anchor, screenPoint: { x: 0, y: 0 } });
  assert.equal(selectTool.context.appState.selectedType, 'face');
  selectTool.onMouseMove({ worldPoint: { x: anchor.x + 11, y: anchor.y + 5 }, screenPoint: { x: 11, y: 5 } });
  selectTool.onMouseUp({ worldPoint: { x: anchor.x + 11, y: anchor.y + 5 }, screenPoint: { x: 11, y: 5 } });

  const faceAfter = shapeStore.getShapeById(createdFaceId);
  const lineAfter = shapeStore.getShapeById('line-a');
  const faceDx = faceAfter.pointsWorld[0].x - faceBefore.pointsWorld[0].x;
  const faceDy = faceAfter.pointsWorld[0].y - faceBefore.pointsWorld[0].y;
  const lineDx = lineAfter.start.x - lineBefore.start.x;
  const lineDy = lineAfter.start.y - lineBefore.start.y;

  const snapped = snapWorldToIso({ x: anchor.x + 11, y: anchor.y + 5 }).point;
  const expectedDx = snapped.x - anchor.x;
  const expectedDy = snapped.y - anchor.y;
  assert.ok(Math.abs(faceDx - expectedDx) < 1e-6);
  assert.ok(Math.abs(faceDy - expectedDy) < 1e-6);
  assert.ok(Math.abs(lineDx - expectedDx) < 1e-6);
  assert.ok(Math.abs(lineDy - expectedDy) < 1e-6);
});


test('line selection and line erase still work', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  shapeStore.addShape(line);

  const storedLine = shapeStore.getShapeById(line.id);
  const mid = { x: (storedLine.start.x + storedLine.end.x) / 2, y: (storedLine.start.y + storedLine.end.y) / 2 };

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  selectTool.onMouseDown({ worldPoint: mid, screenPoint: { x: 10, y: 10 } });

  assert.equal(selectTool.context.appState.selectedType, 'line');
  assert.equal(selectTool.context.appState.selectedIds.has(line.id), true);

  const eraseTool = new EraseTool(makeEraseContext(shapeStore));
  eraseTool.eraseObject({ x: 10, y: 0 });

  assert.equal(shapeStore.getShapeById(line.id), null);
});

test('face and polygon are selectable via topmost hit-testing', () => {
  const shapeStore = new ShapeStore();
  const face = new FaceShape({
    id: 'face-1',
    pointsWorld: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
  });
  const polygon = new Polygon({
    id: 'polygon-1',
    points: [{ x: 30, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 30, y: 20 }],
    closed: true,
  });
  shapeStore.addShape(face);
  shapeStore.addShape(polygon);

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  selectTool.onMouseDown({ worldPoint: { x: 10, y: 10 }, screenPoint: { x: 0, y: 0 } });
  assert.equal(selectTool.context.appState.selectedType, 'face');
  assert.equal(selectTool.context.appState.selectedIds.has(face.id), true);

  selectTool.onMouseDown({ worldPoint: { x: 40, y: 10 }, screenPoint: { x: 0, y: 0 } });
  assert.equal(selectTool.context.appState.selectedType, 'polygon');
  assert.equal(selectTool.context.appState.selectedIds.has(polygon.id), true);
});



test('selecting an object child resolves to object root', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'child-line', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  shapeStore.addShape(line);
  const objectId = shapeStore.createObjectFromIds([line.id], { name: 'Object 1' });

  const lineView = shapeStore.getShapeById(line.id);
  const mid = { x: (lineView.start.x + lineView.end.x) / 2, y: (lineView.start.y + lineView.end.y) / 2 };

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  selectTool.context.appState.setSelection([objectId], 'object', objectId);
  selectTool.onMouseDown({ worldPoint: mid, screenPoint: { x: 0, y: 0 } });

  assert.equal(selectTool.context.appState.selectedType, 'object');
  assert.deepEqual([...selectTool.context.appState.selectedIds], [objectId]);
});


test('clicking a filled child inside an object selects the fill itself', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const fill = new FillRegion({
    id: 'fill-1',
    regionId: 'region-1',
    uvCycle: [{ u: 0, v: 0 }, { u: 2, v: 0 }, { u: 1, v: 1 }],
  });
  shapeStore.addShape(line);
  shapeStore.addShape(fill);
  const objectId = shapeStore.createObjectFromIds([line.id, fill.id], { name: 'Object 1' });

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  const insideFill = isoUVToWorld(1, 0.4);
  selectTool.onMouseDown({ worldPoint: insideFill, screenPoint: { x: 0, y: 0 } });

  assert.equal(selectTool.context.appState.selectedType, 'face');
  assert.deepEqual([...selectTool.context.appState.selectedIds], [fill.id]);
  assert.notEqual(objectId, null);
});

test('clicking a face child inside an object selects the face itself', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const face = new FaceShape({
    id: 'face-1',
    pointsWorld: [isoUVToWorld(0, 0), isoUVToWorld(2, 0), isoUVToWorld(1, 1)],
  });
  shapeStore.addShape(line);
  shapeStore.addShape(face);
  const objectId = shapeStore.createObjectFromIds([line.id, face.id], { name: 'Object 1' });

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  const insideFace = isoUVToWorld(1, 0.4);
  selectTool.onMouseDown({ worldPoint: insideFace, screenPoint: { x: 0, y: 0 } });

  assert.equal(selectTool.context.appState.selectedType, 'face');
  assert.deepEqual([...selectTool.context.appState.selectedIds], [face.id]);
  assert.notEqual(objectId, null);
});


test('dragging selected fill child does not move parent object or sibling lines', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const fill = new FillRegion({
    id: 'fill-1',
    regionId: 'region-1',
    uvCycle: [{ u: 0, v: 0 }, { u: 2, v: 0 }, { u: 1, v: 1 }],
  });
  shapeStore.addShape(line);
  shapeStore.addShape(fill);
  const objectId = shapeStore.createObjectFromIds([line.id, fill.id], { name: 'Object 1' });

  let historyPushes = 0;
  const selectContext = makeSelectContext(shapeStore);
  selectContext.pushHistoryState = () => { historyPushes += 1; };
  const selectTool = new SelectTool(selectContext);
  const lineBefore = shapeStore.getShapeById(line.id);

  const insideFill = isoUVToWorld(1, 0.4);
  selectTool.onMouseDown({ worldPoint: insideFill, screenPoint: { x: 0, y: 0 } });
  selectTool.onMouseMove({
    worldPoint: { x: insideFill.x + 12, y: insideFill.y + 6 },
    screenPoint: { x: 12, y: 6 },
  });
  selectTool.onMouseUp({
    worldPoint: { x: insideFill.x + 12, y: insideFill.y + 6 },
    screenPoint: { x: 12, y: 6 },
  });

  const lineAfter = shapeStore.getShapeById(line.id);
  const objectNode = shapeStore.getNodeById(objectId);

  assert.equal(historyPushes, 1);
  assert.ok(Math.abs(lineAfter.start.x - lineBefore.start.x) < 1e-6);
  assert.ok(Math.abs(lineAfter.start.y - lineBefore.start.y) < 1e-6);
  assert.ok(Math.abs(objectNode.transform.x) < 1e-6);
  assert.ok(Math.abs(objectNode.transform.y) < 1e-6);
});

test('dragging selected face child does not move parent object or sibling lines', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const face = new FaceShape({
    id: 'face-1',
    pointsWorld: [isoUVToWorld(0, 0), isoUVToWorld(2, 0), isoUVToWorld(1, 1)],
  });
  shapeStore.addShape(line);
  shapeStore.addShape(face);
  const objectId = shapeStore.createObjectFromIds([line.id, face.id], { name: 'Object 1' });

  let historyPushes = 0;
  const selectContext = makeSelectContext(shapeStore);
  selectContext.pushHistoryState = () => { historyPushes += 1; };
  const selectTool = new SelectTool(selectContext);
  const lineBefore = shapeStore.getShapeById(line.id);
  const faceBefore = shapeStore.getShapeById(face.id);

  const insideFace = isoUVToWorld(1, 0.4);
  selectTool.onMouseDown({ worldPoint: insideFace, screenPoint: { x: 0, y: 0 } });
  selectTool.onMouseMove({
    worldPoint: { x: insideFace.x + 40, y: insideFace.y + 8 },
    screenPoint: { x: 40, y: 8 },
  });
  selectTool.onMouseUp({
    worldPoint: { x: insideFace.x + 40, y: insideFace.y + 8 },
    screenPoint: { x: 40, y: 8 },
  });

  const lineAfter = shapeStore.getShapeById(line.id);
  const faceAfter = shapeStore.getShapeById(face.id);
  const objectNode = shapeStore.getNodeById(objectId);

  assert.equal(historyPushes, 1);
  assert.ok(Math.abs(faceAfter.pointsWorld[0].x - faceBefore.pointsWorld[0].x) > 1e-6);
  assert.ok(Math.abs(lineAfter.start.x - lineBefore.start.x) < 1e-6);
  assert.ok(Math.abs(lineAfter.start.y - lineBefore.start.y) < 1e-6);
  assert.ok(Math.abs(objectNode.transform.x) < 1e-6);
  assert.ok(Math.abs(objectNode.transform.y) < 1e-6);
});

test('duplicating a selected face child duplicates the face root (not parent object)', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const face = new FaceShape({
    id: 'face-1',
    pointsWorld: [isoUVToWorld(0, 0), isoUVToWorld(2, 0), isoUVToWorld(1, 1)],
  });
  shapeStore.addShape(line);
  shapeStore.addShape(face);
  const objectId = shapeStore.createObjectFromIds([line.id, face.id], { name: 'Object 1' });

  const duplicatedIds = shapeStore.duplicateNodes([face.id], { offset: isoUVToWorld(1, 1) });
  assert.equal(duplicatedIds.length, 1);

  const duplicatedNode = shapeStore.getNodeById(duplicatedIds[0]);
  assert.equal(duplicatedNode?.kind, 'shape');
  assert.equal(duplicatedNode?.shapeType, 'face');

  const duplicatedParent = shapeStore.parentById[duplicatedIds[0]];
  assert.equal(duplicatedParent, objectId);
});





test('creating adjacent filled faces duplicates shared boundary lines per face ownership', () => {
  const shapeStore = new ShapeStore();

  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  const lineE = new Line({ id: 'line-e', start: isoUVToWorld(2, 0), end: isoUVToWorld(4, 0) });
  const lineF = new Line({ id: 'line-f', start: isoUVToWorld(4, 0), end: isoUVToWorld(4, 2) });
  const lineG = new Line({ id: 'line-g', start: isoUVToWorld(4, 2), end: isoUVToWorld(2, 2) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);
  shapeStore.addShape(lineE);
  shapeStore.addShape(lineF);
  shapeStore.addShape(lineG);

  const regions = shapeStore.getComputedRegions();
  assert.equal(regions.length, 2);

  const leftRegion = regions.find((region) => region.uvCycle.some((point) => point.u === 0 && point.v === 0));
  const rightRegion = regions.find((region) => region.uvCycle.some((point) => point.u === 4 && point.v === 0));
  assert.ok(leftRegion);
  assert.ok(rightRegion);

  const leftFaceId = shapeStore.createFaceFromRegion(leftRegion, { color: '#66ccff', alpha: 0.8 });
  const rightFaceId = shapeStore.createFaceFromRegion(rightRegion, { color: '#ffcc66', alpha: 0.8 });
  assert.ok(leftFaceId);
  assert.ok(rightFaceId);

  const leftFace = shapeStore.getShapeById(leftFaceId);
  const rightFace = shapeStore.getShapeById(rightFaceId);
  const leftSourceLineIds = leftFace.sourceLineIds ?? [];
  const rightSourceLineIds = rightFace.sourceLineIds ?? [];

  const sharedById = leftSourceLineIds.filter((lineId) => rightSourceLineIds.includes(lineId));
  assert.deepEqual(sharedById, []);

  const leftBoundaryLines = leftSourceLineIds.map((lineId) => shapeStore.getShapeById(lineId)).filter(Boolean);
  const rightBoundaryLines = rightSourceLineIds.map((lineId) => shapeStore.getShapeById(lineId)).filter(Boolean);

  const isSharedSegment = (line) => {
    const au = Math.round(line.startUV?.u ?? NaN);
    const av = Math.round(line.startUV?.v ?? NaN);
    const bu = Math.round(line.endUV?.u ?? NaN);
    const bv = Math.round(line.endUV?.v ?? NaN);
    const oneWay = au === 2 && av === 0 && bu === 2 && bv === 2;
    const reverseWay = au === 2 && av === 2 && bu === 2 && bv === 0;
    return oneWay || reverseWay;
  };

  const leftSharedSegmentCount = leftBoundaryLines.filter((line) => isSharedSegment(line)).length;
  const rightSharedSegmentCount = rightBoundaryLines.filter((line) => isSharedSegment(line)).length;

  assert.equal(leftSharedSegmentCount, 1);
  assert.equal(rightSharedSegmentCount, 1);
});


test('moving face duplicates shared boundary even when ownedByFaceIds metadata is missing', () => {
  const shapeStore = new ShapeStore();

  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  const lineE = new Line({ id: 'line-e', start: isoUVToWorld(2, 0), end: isoUVToWorld(4, 0) });
  const lineF = new Line({ id: 'line-f', start: isoUVToWorld(4, 0), end: isoUVToWorld(4, 2) });
  const lineG = new Line({ id: 'line-g', start: isoUVToWorld(4, 2), end: isoUVToWorld(2, 2) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);
  shapeStore.addShape(lineE);
  shapeStore.addShape(lineF);
  shapeStore.addShape(lineG);

  const regions = shapeStore.getComputedRegions();
  const leftRegion = regions.find((region) => region.uvCycle.some((point) => point.u === 0 && point.v === 0));
  const rightRegion = regions.find((region) => region.uvCycle.some((point) => point.u === 4 && point.v === 0));
  const leftFaceId = shapeStore.createFaceFromRegion(leftRegion, { color: '#66ccff', alpha: 0.8 });
  const rightFaceId = shapeStore.createFaceFromRegion(rightRegion, { color: '#ffcc66', alpha: 0.8 });

  // simulate legacy/corrupt metadata: two faces share a line id but ownedByFaceIds is empty
  const leftBoundaryAtX2 = (shapeStore.getShapeById(leftFaceId).sourceLineIds ?? []).find((lineId) => {
    const line = shapeStore.getShapeById(lineId);
    const au = Math.round(line.startUV.u);
    const bu = Math.round(line.endUV.u);
    return au === 2 && bu === 2;
  });
  const rightBoundaryAtX2 = (shapeStore.getShapeById(rightFaceId).sourceLineIds ?? []).find((lineId) => {
    const line = shapeStore.getShapeById(lineId);
    const au = Math.round(line.startUV.u);
    const bu = Math.round(line.endUV.u);
    return au === 2 && bu === 2;
  });
  assert.ok(leftBoundaryAtX2);
  assert.ok(rightBoundaryAtX2);

  const rightNode = shapeStore.getNodeById(rightFaceId);
  rightNode.meta.sourceLineIds = (rightNode.meta.sourceLineIds ?? []).map((lineId) => (lineId === rightBoundaryAtX2 ? leftBoundaryAtX2 : lineId));
  rightNode.style.sourceLineIds = [...rightNode.meta.sourceLineIds];

  const sharedNode = shapeStore.getNodeById(leftBoundaryAtX2);
  sharedNode.localGeom.ownedByFaceIds = [];

  shapeStore.applyWorldDeltaToNode(rightFaceId, { x: 20, y: 0 });

  const leftAfter = shapeStore.getShapeById(leftFaceId);
  const rightAfter = shapeStore.getShapeById(rightFaceId);
  const leftLines = (leftAfter.sourceLineIds ?? []).map((id) => shapeStore.getShapeById(id));
  const rightLines = (rightAfter.sourceLineIds ?? []).map((id) => shapeStore.getShapeById(id));

  const hasX2Segment = (line) => {
    const au = Math.round(line.startUV.u);
    const bu = Math.round(line.endUV.u);
    return au === 2 && bu === 2;
  };
  const hasX4Segment = (line) => {
    const au = Math.round(line.startUV.u);
    const bu = Math.round(line.endUV.u);
    return au === 4 && bu === 4;
  };

  assert.ok(leftLines.some((line) => hasX2Segment(line)));
  assert.ok(rightLines.some((line) => hasX4Segment(line)));
});

test('moving one of two adjacent faces reconciles boundaries for moved and stationary faces', () => {
  const shapeStore = new ShapeStore();

  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  const lineE = new Line({ id: 'line-e', start: isoUVToWorld(2, 0), end: isoUVToWorld(4, 0) });
  const lineF = new Line({ id: 'line-f', start: isoUVToWorld(4, 0), end: isoUVToWorld(4, 2) });
  const lineG = new Line({ id: 'line-g', start: isoUVToWorld(4, 2), end: isoUVToWorld(2, 2) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);
  shapeStore.addShape(lineE);
  shapeStore.addShape(lineF);
  shapeStore.addShape(lineG);

  const regions = shapeStore.getComputedRegions();
  const leftRegion = regions.find((region) => region.uvCycle.some((point) => point.u === 0 && point.v === 0));
  const rightRegion = regions.find((region) => region.uvCycle.some((point) => point.u === 4 && point.v === 0));
  const leftFaceId = shapeStore.createFaceFromRegion(leftRegion, { color: '#66ccff', alpha: 0.8 });
  const rightFaceId = shapeStore.createFaceFromRegion(rightRegion, { color: '#ffcc66', alpha: 0.8 });

  const leftBefore = shapeStore.getShapeById(leftFaceId);
  const rightBefore = shapeStore.getShapeById(rightFaceId);

  shapeStore.applyWorldDeltaToNode(rightFaceId, { x: 20, y: 0 });

  const leftAfter = shapeStore.getShapeById(leftFaceId);
  const rightAfter = shapeStore.getShapeById(rightFaceId);

  const leftLineIds = leftAfter.sourceLineIds ?? [];
  const rightLineIds = rightAfter.sourceLineIds ?? [];
  assert.equal(leftLineIds.length, leftAfter.pointsWorld.length);
  assert.equal(rightLineIds.length, rightAfter.pointsWorld.length);

  const sharedAfterMove = leftLineIds.filter((lineId) => rightLineIds.includes(lineId));
  assert.deepEqual(sharedAfterMove, []);

  const hasSegment = (line, a, b) => {
    const tol = 1e-6;
    const same = Math.abs(line.start.x - a.x) < tol && Math.abs(line.start.y - a.y) < tol
      && Math.abs(line.end.x - b.x) < tol && Math.abs(line.end.y - b.y) < tol;
    const rev = Math.abs(line.start.x - b.x) < tol && Math.abs(line.start.y - b.y) < tol
      && Math.abs(line.end.x - a.x) < tol && Math.abs(line.end.y - a.y) < tol;
    return same || rev;
  };

  const leftFormerSharedA = isoUVToWorld(2, 0);
  const leftFormerSharedB = isoUVToWorld(2, 2);
  const movedSharedA = { x: leftFormerSharedA.x + 20, y: leftFormerSharedA.y };
  const movedSharedB = { x: leftFormerSharedB.x + 20, y: leftFormerSharedB.y };

  const leftBoundaryLines = leftLineIds.map((id) => shapeStore.getShapeById(id)).filter(Boolean);
  const rightBoundaryLines = rightLineIds.map((id) => shapeStore.getShapeById(id)).filter(Boolean);

  assert.ok(leftBoundaryLines.some((line) => hasSegment(line, leftFormerSharedA, leftFormerSharedB)));
  assert.ok(rightBoundaryLines.some((line) => hasSegment(line, movedSharedA, movedSharedB)));

  const lineBShape = shapeStore.getShapeById('line-b');
  assert.ok(hasSegment(lineBShape, leftFormerSharedA, leftFormerSharedB));

  const movedOffsetX = rightAfter.pointsWorld[0].x - rightBefore.pointsWorld[0].x;
  const movedOffsetY = rightAfter.pointsWorld[0].y - rightBefore.pointsWorld[0].y;
  assert.ok(Math.abs(movedOffsetX - 20) < 1e-6);
  assert.ok(Math.abs(movedOffsetY) < 1e-6);

  const stationaryOffsetX = leftAfter.pointsWorld[0].x - leftBefore.pointsWorld[0].x;
  const stationaryOffsetY = leftAfter.pointsWorld[0].y - leftBefore.pointsWorld[0].y;
  assert.ok(Math.abs(stationaryOffsetX) < 1e-6);
  assert.ok(Math.abs(stationaryOffsetY) < 1e-6);

  for (const lineId of rightLineIds) {
    const node = shapeStore.getNodeById(lineId);
    assert.ok(!(node?.localGeom?.ownedByFaceIds ?? []).includes(leftFaceId));
  }
});

test('dragging a face auto-snaps movement to grid lines', () => {
  const shapeStore = new ShapeStore();

  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);

  const region = shapeStore.getComputedRegions()[0];
  const faceId = shapeStore.createFaceFromRegion(region, { color: '#66ccff', alpha: 0.8 });
  assert.ok(faceId);

  const selectContext = makeSelectContext(shapeStore);
  selectContext.appState.snapToGrid = false;
  const selectTool = new SelectTool(selectContext);

  const faceBefore = shapeStore.getShapeById(faceId);
  const lineBefore = shapeStore.getShapeById('line-a');
  const anchor = {
    x: (faceBefore.pointsWorld[0].x + faceBefore.pointsWorld[2].x) / 2,
    y: (faceBefore.pointsWorld[0].y + faceBefore.pointsWorld[2].y) / 2,
  };

  selectTool.onMouseDown({ worldPoint: anchor, screenPoint: { x: 0, y: 0 } });
  assert.equal(selectTool.context.appState.selectedType, 'face');

  selectTool.onMouseMove({
    worldPoint: { x: anchor.x + 3, y: anchor.y + 2 },
    screenPoint: { x: 3, y: 2 },
  });
  selectTool.onMouseUp({
    worldPoint: { x: anchor.x + 3, y: anchor.y + 2 },
    screenPoint: { x: 3, y: 2 },
  });

  const faceAfter = shapeStore.getShapeById(faceId);
  const lineAfter = shapeStore.getShapeById('line-a');
  const faceDx = faceAfter.pointsWorld[0].x - faceBefore.pointsWorld[0].x;
  const faceDy = faceAfter.pointsWorld[0].y - faceBefore.pointsWorld[0].y;
  const lineDx = lineAfter.start.x - lineBefore.start.x;
  const lineDy = lineAfter.start.y - lineBefore.start.y;

  const snapped = snapWorldToIso({ x: anchor.x + 3, y: anchor.y + 2 }).point;
  const expectedDx = snapped.x - anchor.x;
  const expectedDy = snapped.y - anchor.y;
  assert.ok(Math.abs(faceDx - expectedDx) < 1e-6);
  assert.ok(Math.abs(faceDy - expectedDy) < 1e-6);
  assert.ok(Math.abs(lineDx - expectedDx) < 1e-6);
  assert.ok(Math.abs(lineDy - expectedDy) < 1e-6);
});

test('dragging a face moves the filled section and attached boundary lines together', () => {
  const shapeStore = new ShapeStore();

  const lineA = new Line({ id: 'line-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const lineB = new Line({ id: 'line-b', start: isoUVToWorld(2, 0), end: isoUVToWorld(2, 2) });
  const lineC = new Line({ id: 'line-c', start: isoUVToWorld(2, 2), end: isoUVToWorld(0, 2) });
  const lineD = new Line({ id: 'line-d', start: isoUVToWorld(0, 2), end: isoUVToWorld(0, 0) });
  shapeStore.addShape(lineA);
  shapeStore.addShape(lineB);
  shapeStore.addShape(lineC);
  shapeStore.addShape(lineD);

  const region = shapeStore.getComputedRegions()[0];
  assert.ok(region);
  const faceId = shapeStore.createFaceFromRegion(region, { color: '#66ccff', alpha: 0.8 });
  assert.ok(faceId);

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  const faceBefore = shapeStore.getShapeById(faceId);
  const lineBefore = shapeStore.getShapeById('line-a');
  const anchor = {
    x: (faceBefore.pointsWorld[0].x + faceBefore.pointsWorld[2].x) / 2,
    y: (faceBefore.pointsWorld[0].y + faceBefore.pointsWorld[2].y) / 2,
  };

  selectTool.onMouseDown({ worldPoint: anchor, screenPoint: { x: 0, y: 0 } });
  assert.equal(selectTool.context.appState.selectedType, 'face');
  selectTool.onMouseMove({ worldPoint: { x: anchor.x + 14, y: anchor.y + 7 }, screenPoint: { x: 14, y: 7 } });
  selectTool.onMouseUp({ worldPoint: { x: anchor.x + 14, y: anchor.y + 7 }, screenPoint: { x: 14, y: 7 } });

  const faceAfter = shapeStore.getShapeById(faceId);
  const lineAfter = shapeStore.getShapeById('line-a');

  const faceDx = faceAfter.pointsWorld[0].x - faceBefore.pointsWorld[0].x;
  const faceDy = faceAfter.pointsWorld[0].y - faceBefore.pointsWorld[0].y;
  const lineDx = lineAfter.start.x - lineBefore.start.x;
  const lineDy = lineAfter.start.y - lineBefore.start.y;

  const snapped = snapWorldToIso({ x: anchor.x + 14, y: anchor.y + 7 }).point;
  const expectedDx = snapped.x - anchor.x;
  const expectedDy = snapped.y - anchor.y;
  assert.ok(Math.abs(faceDx - expectedDx) < 1e-6);
  assert.ok(Math.abs(faceDy - expectedDy) < 1e-6);
  assert.ok(Math.abs(lineDx - expectedDx) < 1e-6);
  assert.ok(Math.abs(lineDy - expectedDy) < 1e-6);
});


test('dragging object auto-snaps to grid even when snap-to-grid toggle is disabled', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'child-line', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  shapeStore.addShape(line);
  const objectId = shapeStore.createObjectFromIds([line.id], { name: 'Object 1' });

  const selectContext = makeSelectContext(shapeStore);
  selectContext.appState.snapToGrid = false;
  const selectTool = new SelectTool(selectContext);
  selectTool.context.appState.setSelection([objectId], 'object', objectId);

  const initial = shapeStore.getShapeById(line.id);
  const anchor = { ...initial.start };

  selectTool.onMouseDown({ worldPoint: anchor, screenPoint: { x: 0, y: 0 } });
  selectTool.onMouseMove({ worldPoint: { x: anchor.x + 3, y: anchor.y + 2 }, screenPoint: { x: 3, y: 2 } });
  selectTool.onMouseUp({ worldPoint: { x: anchor.x + 3, y: anchor.y + 2 }, screenPoint: { x: 3, y: 2 } });

  const snapped = snapWorldToIso({ x: anchor.x + 3, y: anchor.y + 2 }).point;
  const expectedDx = snapped.x - anchor.x;
  const expectedDy = snapped.y - anchor.y;

  const objectNode = shapeStore.getNodeById(objectId);
  assert.ok(Math.abs(objectNode.transform.x - expectedDx) < 1e-6);
  assert.ok(Math.abs(objectNode.transform.y - expectedDy) < 1e-6);

  const moved = shapeStore.getShapeById(line.id);
  assert.ok(Math.abs(moved.start.x - (initial.start.x + expectedDx)) < 1e-6);
  assert.ok(Math.abs(moved.start.y - (initial.start.y + expectedDy)) < 1e-6);
});

test('dragging object selection moves object transform and descendants', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'child-line', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  shapeStore.addShape(line);
  const objectId = shapeStore.createObjectFromIds([line.id], { name: 'Object 1' });

  const selectTool = new SelectTool(makeSelectContext(shapeStore));
  selectTool.context.appState.setSelection([objectId], 'object', objectId);

  const initial = shapeStore.getShapeById(line.id);
  const anchor = { ...initial.start };

  selectTool.onMouseDown({ worldPoint: anchor, screenPoint: { x: 0, y: 0 } });
  selectTool.onMouseMove({ worldPoint: { x: anchor.x + 10, y: anchor.y + 5 }, screenPoint: { x: 10, y: 5 } });
  selectTool.onMouseUp({ worldPoint: { x: anchor.x + 10, y: anchor.y + 5 }, screenPoint: { x: 10, y: 5 } });

  const snapped = snapWorldToIso({ x: anchor.x + 10, y: anchor.y + 5 }).point;
  const expectedDx = snapped.x - anchor.x;
  const expectedDy = snapped.y - anchor.y;

  const objectNode = shapeStore.getNodeById(objectId);
  assert.ok(Math.abs(objectNode.transform.x - expectedDx) < 1e-6);
  assert.ok(Math.abs(objectNode.transform.y - expectedDy) < 1e-6);

  const moved = shapeStore.getShapeById(line.id);
  assert.ok(Math.abs(moved.start.x - (initial.start.x + expectedDx)) < 1e-6);
  assert.ok(Math.abs(moved.start.y - (initial.start.y + expectedDy)) < 1e-6);
});

test('left-click mouseup does not open context menu, right-click mouseup does', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  shapeStore.addShape(line);

  const contextMenuCalls = [];
  const selectContext = makeSelectContext(shapeStore);
  selectContext.appState.openContextMenuForSelection = (screenPoint, clickedShapeId) => {
    contextMenuCalls.push({ screenPoint, clickedShapeId });
  };

  const selectTool = new SelectTool(selectContext);
  const mid = { x: 10, y: 0 };

  selectTool.onMouseDown({ event: { button: 0 }, worldPoint: mid, screenPoint: { x: 10, y: 10 } });
  selectTool.onMouseUp({ event: { button: 0 }, worldPoint: mid, screenPoint: { x: 10, y: 10 } });
  assert.equal(contextMenuCalls.length, 0);

  selectTool.onMouseDown({ event: { button: 2 }, worldPoint: mid, screenPoint: { x: 20, y: 20 } });
  selectTool.onMouseUp({ event: { button: 2 }, worldPoint: mid, screenPoint: { x: 20, y: 20 } });

  assert.equal(contextMenuCalls.length, 1);
  assert.equal(contextMenuCalls[0].clickedShapeId, line.id);
});

test('click-select then drag works within one gesture', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  shapeStore.addShape(line);

  let historyPushes = 0;
  const selectContext = makeSelectContext(shapeStore);
  selectContext.pushHistoryState = () => {
    historyPushes += 1;
  };
  const selectTool = new SelectTool(selectContext);

  const initial = shapeStore.getShapeById(line.id);
  const anchor = { ...initial.start };

  selectTool.onMouseDown({ event: { button: 0 }, worldPoint: anchor, screenPoint: { x: 0, y: 0 } });
  selectTool.onMouseMove({ worldPoint: { x: anchor.x + 10, y: anchor.y + 5 }, screenPoint: { x: 10, y: 5 } });
  selectTool.onMouseUp({ event: { button: 0 }, worldPoint: { x: anchor.x + 10, y: anchor.y + 5 }, screenPoint: { x: 10, y: 5 } });

  assert.equal(historyPushes, 1);
  assert.equal(selectTool.context.appState.selectedIds.has(line.id), true);
  const moved = shapeStore.getShapeById(line.id);
  assert.ok(Math.abs(moved.start.x - (initial.start.x + 10)) < 1e-6);
  assert.ok(Math.abs(moved.start.y - (initial.start.y + 5)) < 1e-6);
});

test('click erase removes topmost non-line renderables', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-bottom', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0), zIndex: 0 });
  const polygon = new Polygon({
    id: 'polygon-top',
    points: [{ x: 5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: 5, y: 5 }],
    closed: true,
    zIndex: 10,
  });
  shapeStore.addShape(line);
  shapeStore.addShape(polygon);

  const mid = { x: 10, y: 0 };
  const eraseTool = new EraseTool({
    ...makeEraseContext(shapeStore),
    appState: { eraseMode: 'fill', erasePreview: null, currentStyle: { strokeWidth: 2 } },
  });
  eraseTool.eraseObject(mid, 'fill');

  assert.equal(shapeStore.getShapeById('polygon-top'), null);
  assert.notEqual(shapeStore.getShapeById('line-bottom'), null);
});


test('line mode two-click erase records one history state when finalized', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  shapeStore.addShape(line);

  let historyPushes = 0;
  const eraseTool = new EraseTool({
    shapeStore,
    appState: { eraseMode: 'line', eraserSizePx: 12, erasePreview: null, currentStyle: { strokeWidth: 2 } },
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() { historyPushes += 1; },
    historyStore: { pushState() {} },
  });

  eraseTool.onMouseDown({ worldPoint: { x: 8, y: 0 }, screenPoint: { x: 8, y: 0 } });
  eraseTool.onMouseMove({ worldPoint: { x: 12, y: 0 }, screenPoint: { x: 12, y: 0 } });

  assert.equal(historyPushes, 0);

  eraseTool.onMouseDown({ worldPoint: { x: 12, y: 0 }, screenPoint: { x: 12, y: 0 } });
  eraseTool.onMouseUp({ worldPoint: { x: 12, y: 0 }, screenPoint: { x: 12, y: 0 } });

  assert.equal(historyPushes, 1);
});


test('line mode does not erase fill shapes', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const face = new FaceShape({ id: 'face-1', pointsWorld: [{ x: -5, y: -5 }, { x: 25, y: -5 }, { x: 25, y: 5 }, { x: -5, y: 5 }] });
  shapeStore.addShape(line);
  shapeStore.addShape(face);

  const eraseTool = new EraseTool({
    ...makeEraseContext(shapeStore),
    appState: { eraseMode: 'line', erasePreview: null, currentStyle: { strokeWidth: 2 } },
  });

  eraseTool.eraseObject({ x: 10, y: 0 }, 'line');

  assert.equal(shapeStore.getShapeById('line-1'), null);
  assert.notEqual(shapeStore.getShapeById('face-1'), null);
});

test('fill mode does not erase lines and drag only removes fill entities', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(2, 0) });
  const face = new FaceShape({ id: 'face-1', pointsWorld: [{ x: -5, y: -5 }, { x: 25, y: -5 }, { x: 25, y: 5 }, { x: -5, y: 5 }] });
  shapeStore.addShape(line);
  shapeStore.addShape(face);

  const eraseTool = new EraseTool({
    shapeStore,
    appState: { eraseMode: 'fill', erasePreview: null, currentStyle: { strokeWidth: 2 } },
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
    historyStore: { pushState() {} },
  });

  eraseTool.onMouseDown({ worldPoint: { x: 10, y: 0 } });
  eraseTool.onMouseMove({ worldPoint: { x: 12, y: 0 } });
  eraseTool.onMouseUp({ worldPoint: { x: 12, y: 0 } });

  assert.notEqual(shapeStore.getShapeById('line-1'), null);
  assert.equal(shapeStore.getShapeById('face-1'), null);
});


test('line mode drag path stays straight (start/end only)', () => {
  const shapeStore = new ShapeStore();
  shapeStore.addShape(new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(3, 0) }));

  const eraseTool = new EraseTool({
    shapeStore,
    appState: {
      eraseMode: 'line',
      erasePreview: null,
      currentStyle: { strokeWidth: 2 },
      snapToGrid: false,
      snapToMidpoints: false,
      snapIndicator: null,
      snapDebugStatus: 'SNAP: OFF',
    },
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
    historyStore: { pushState() {} },
  });

  eraseTool.onMouseDown({ worldPoint: { x: 0, y: 0 }, screenPoint: { x: 0, y: 0 } });
  eraseTool.onMouseMove({ worldPoint: { x: 5, y: 0 }, screenPoint: { x: 5, y: 0 } });
  eraseTool.onMouseMove({ worldPoint: { x: 10, y: 0 }, screenPoint: { x: 10, y: 0 } });

  assert.equal(eraseTool.context.appState.erasePreview.pathPoints.length, 2);
  assert.deepEqual(eraseTool.context.appState.erasePreview.pathPoints[0], eraseTool.strokePoints[0]);
  assert.deepEqual(eraseTool.context.appState.erasePreview.pathPoints[1], eraseTool.strokePoints[1]);
});


test('line drag erase splits line and preserves line metadata', () => {
  const shapeStore = new ShapeStore();
  shapeStore.addShape(new Line({
    id: 'line-meta',
    start: isoUVToWorld(0, 0),
    end: isoUVToWorld(6, 0),
    strokeColor: '#00ffaa',
    fillColor: '#123456',
    strokeWidth: 4,
    strokeOpacity: 0.4,
    fillOpacity: 0.2,
    opacity: 0.6,
    fillEnabled: false,
    pinnedMeasure: true,
    visible: true,
    locked: false,
    zIndex: 7,
    groupId: 'group-1',
    sourceForPolygonId: 'poly-1',
    ownedByFaceIds: ['face-a'],
  }));

  const eraseTool = new EraseTool({
    shapeStore,
    appState: {
      eraseMode: 'line',
      erasePreview: null,
      currentStyle: { strokeWidth: 4 },
      snapToGrid: false,
      snapToMidpoints: false,
      snapIndicator: null,
      snapDebugStatus: 'SNAP: OFF',
    },
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
    historyStore: { pushState() {} },
  });

  const original = shapeStore.getShapeById('line-meta');
  const direction = {
    x: original.end.x - original.start.x,
    y: original.end.y - original.start.y,
  };
  const eraseStart = { x: original.start.x + direction.x * 0.4, y: original.start.y + direction.y * 0.4 };
  const eraseEnd = { x: original.start.x + direction.x * 0.6, y: original.start.y + direction.y * 0.6 };

  eraseTool.onMouseDown({ worldPoint: eraseStart, screenPoint: eraseStart });
  eraseTool.onMouseMove({ worldPoint: eraseEnd, screenPoint: eraseEnd });
  eraseTool.onMouseDown({ worldPoint: eraseEnd, screenPoint: eraseEnd });
  eraseTool.onMouseUp({ worldPoint: eraseEnd, screenPoint: eraseEnd });

  const lines = shapeStore.getShapes().filter((shape) => shape.type === 'line');
  assert.equal(lines.length, 2);

  for (const line of lines) {
    assert.equal(line.strokeColor, '#00ffaa');
    assert.equal(line.strokeWidth, 4);
    assert.equal(line.strokeOpacity, 0.4);
    assert.equal(line.fillOpacity, 0.2);
    assert.equal(line.opacity, 0.6);
    assert.equal(line.fillEnabled, false);
    assert.equal(line.pinnedMeasure, true);
    assert.equal(line.zIndex, 7);
    assert.equal(line.groupId, 'group-1');
    assert.equal(line.sourceForPolygonId, 'poly-1');
    assert.deepEqual(line.ownedByFaceIds, ['face-a']);
    assert.equal(line.startUV.u % 0.5, 0);
    assert.equal(line.startUV.v % 0.5, 0);
    assert.equal(line.endUV.u % 0.5, 0);
    assert.equal(line.endUV.v % 0.5, 0);
  }
});


test('line tool snaps to line intersections when midpoint snapping is enabled', () => {
  const shapeStore = new ShapeStore();
  const diagA = new Line({ id: 'diag-a', start: isoUVToWorld(0, 0), end: isoUVToWorld(4, 0) });
  const diagB = new Line({ id: 'diag-b', start: isoUVToWorld(2, -2), end: isoUVToWorld(2, 2) });
  shapeStore.addShape(diagA);
  shapeStore.addShape(diagB);

  const appState = {
    previewShape: null,
    snapIndicator: null,
    snapDebugStatus: 'SNAP: OFF',
    snapToGrid: false,
    snapToMidpoints: true,
    currentStyle: {
      strokeColor: '#ffffff',
      strokeOpacity: 1,
      strokeWidth: 2,
      fillEnabled: false,
      fillColor: 'transparent',
      fillOpacity: 0,
    },
  };

  const lineTool = new LineTool({
    shapeStore,
    appState,
    camera: { zoom: 1, screenToWorld: (p) => p },
    pushHistoryState() {},
    historyStore: { pushState() {} },
  });

  const intersection = isoUVToWorld(2, 0);
  lineTool.onMouseMove({ screenPoint: { x: intersection.x + 1, y: intersection.y + 1 } });

  assert.equal(appState.snapIndicator.kind, 'intersection');
  assert.equal(Math.round(appState.snapIndicator.point.x), Math.round(intersection.x));
  assert.equal(Math.round(appState.snapIndicator.point.y), Math.round(intersection.y));
});
