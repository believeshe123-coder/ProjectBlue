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
    camera: { zoom: 1 },
    pushHistoryState() {},
    canvas: null,
  };
}

function makeEraseContext(shapeStore) {
  return {
    shapeStore,
    appState: { eraseMode: 'object', eraserSizePx: 12, erasePreview: null },
    camera: { zoom: 1 },
    pushHistoryState() {},
    historyStore: { pushState() {} },
  };
}

test('line selection and object erase still work', () => {
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
  const eraseTool = new EraseTool(makeEraseContext(shapeStore));
  eraseTool.eraseObject(mid);

  assert.equal(shapeStore.getShapeById('polygon-top'), null);
  assert.notEqual(shapeStore.getShapeById('line-bottom'), null);
});


test('segment erase records one history state per drag action', () => {
  const shapeStore = new ShapeStore();
  const line = new Line({ id: 'line-1', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } });
  shapeStore.addShape(line);

  let historyPushes = 0;
  const eraseTool = new EraseTool({
    shapeStore,
    appState: { eraseMode: 'hybrid', eraserSizePx: 12, erasePreview: null },
    camera: { zoom: 1 },
    pushHistoryState() { historyPushes += 1; },
    historyStore: { pushState() {} },
  });

  eraseTool.onMouseDown({ worldPoint: { x: 8, y: 0 } });
  eraseTool.onMouseMove({ worldPoint: { x: 12, y: 0 } });
  eraseTool.onMouseUp({ worldPoint: { x: 12, y: 0 } });

  assert.equal(historyPushes, 1);
});


test('line tool prefers shared history hook and avoids fallback double-push', () => {
  const shapeStore = new ShapeStore();
  let sharedPushes = 0;
  let fallbackPushes = 0;

  const lineTool = new LineTool({
    shapeStore,
    appState: {
      snapToGrid: false,
      snapToMidpoints: false,
      currentStyle: {
        strokeColor: '#000000',
        fillColor: 'transparent',
        strokeWidth: 2,
        opacity: 1,
        strokeOpacity: 1,
        fillOpacity: 0,
        fillEnabled: false,
      },
      previewShape: null,
      snapIndicator: null,
      snapDebugStatus: 'SNAP: OFF',
    },
    camera: {
      zoom: 1,
      screenToWorld: ({ x, y }) => ({ x, y }),
    },
    pushHistoryState() { sharedPushes += 1; },
    historyStore: { pushState() { fallbackPushes += 1; } },
  });

  lineTool.onMouseDown({ screenPoint: { x: 0, y: 0 } });
  lineTool.onMouseDown({ screenPoint: { x: 10, y: 0 } });

  assert.equal(sharedPushes, 1);
  assert.equal(fallbackPushes, 0);
});
