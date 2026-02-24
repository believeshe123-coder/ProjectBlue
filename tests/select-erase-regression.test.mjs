import test from 'node:test';
import assert from 'node:assert/strict';

import { ShapeStore } from '../src/state/shapeStore.js';
import { SelectTool } from '../src/tools/selectTool.js';
import { EraseTool } from '../src/tools/eraseTool.js';
import { LineTool } from '../src/tools/lineTool.js';
import { Line } from '../src/models/line.js';
import { FaceShape } from '../src/models/faceShape.js';
import { Polygon } from '../src/models/polygon.js';
import { isoUVToWorld } from '../src/core/isoGrid.js';

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




test('line mode first click only sets start and does not erase', () => {
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
  eraseTool.onMouseUp({ worldPoint: { x: 0, y: 0 }, screenPoint: { x: 0, y: 0 } });

  assert.equal(shapeStore.getShapeById('line-1') !== null, true);
  assert.equal(eraseTool.lineEraseStartPoint !== null, true);
});

test('line mode second click finalizes erase even without move between clicks', () => {
  const shapeStore = new ShapeStore();
  shapeStore.addShape(new Line({ id: 'line-1', start: isoUVToWorld(0, 0), end: isoUVToWorld(4, 0) }));

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
  eraseTool.onMouseUp({ worldPoint: { x: 0, y: 0 }, screenPoint: { x: 0, y: 0 } });

  eraseTool.onMouseDown({ worldPoint: { x: 10, y: 0 }, screenPoint: { x: 10, y: 0 } });
  eraseTool.onMouseUp({ worldPoint: { x: 10, y: 0 }, screenPoint: { x: 10, y: 0 } });

  const lines = shapeStore.getShapes().filter((shape) => shape.type === 'line');
  assert.equal(lines.length >= 1, true);
  assert.equal(eraseTool.lineEraseStartPoint, null);
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

