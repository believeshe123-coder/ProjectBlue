import test from 'node:test';
import assert from 'node:assert/strict';

import { Renderer } from '../src/core/renderer.js';

function makeMockContext() {
  const ops = [];
  return {
    canvas: { width: 200, height: 200 },
    ops,
    setTransform(...args) { ops.push(['setTransform', ...args]); },
    clearRect(...args) { ops.push(['clearRect', ...args]); },
    save() { ops.push(['save']); },
    restore() { ops.push(['restore']); },
    beginPath() { ops.push(['beginPath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); },
    lineTo(x, y) { ops.push(['lineTo', x, y]); },
    closePath() { ops.push(['closePath']); },
    stroke() { ops.push(['stroke']); },
    fill() { ops.push(['fill']); },
    fillRect(...args) { ops.push(['fillRect', ...args]); },
    fillText(...args) { ops.push(['fillText', ...args]); },
    setLineDash() {},
    set globalAlpha(value) { this._alpha = value; },
    set strokeStyle(value) { this._strokeStyle = value; },
    set fillStyle(value) { this._fillStyle = value; },
    set lineWidth(value) { this._lineWidth = value; },
    set lineCap(value) { this._lineCap = value; },
    set lineJoin(value) { this._lineJoin = value; },
    set font(value) { this._font = value; },
    set textAlign(value) { this._textAlign = value; },
  };
}

test('selected face outline is rendered after lines so all edges remain visible', () => {
  const ctx = makeMockContext();
  const camera = { worldToScreen: (p) => p, screenToWorld: (p) => p };

  const shapeStore = {
    getFillRegions() { return []; },
    getComputedRegions() { return []; },
    getDescendantIds() { return []; },
    getRenderableShapesSorted() {
      return [
        {
          id: 'face-1',
          type: 'face',
          pointsWorld: [
            { x: 10, y: 10 },
            { x: 50, y: 10 },
            { x: 50, y: 50 },
          ],
          fillColor: '#4aa3ff',
          fillAlpha: 1,
          visible: true,
        },
        {
          id: 'line-1',
          type: 'line',
          start: { x: 10, y: 10 },
          end: { x: 50, y: 10 },
          strokeColor: '#fff',
          strokeWidth: 2,
          visible: true,
        },
      ];
    },
  };

  const appState = {
    selectedIds: new Set(['face-1']),
    selectedType: 'face',
    disableSceneGraph: false,
    enableFill: true,
    debugRegions: false,
  };

  const renderer = new Renderer({
    ctx,
    camera,
    shapeStore,
    appState,
    getCanvasMetrics: () => ({ canvasCssW: 200, canvasCssH: 200, currentDpr: 1 }),
    ensureCanvasSize: () => {},
  });

  renderer.renderFrame();

  const strokeIndices = ctx.ops
    .map((op, index) => (op[0] === 'stroke' ? index : -1))
    .filter((index) => index >= 0);

  assert.ok(strokeIndices.length >= 3, 'expected face highlight + line + final face highlight strokes');
  assert.ok(
    strokeIndices[strokeIndices.length - 1] > strokeIndices[strokeIndices.length - 2],
    'expected final selected-face stroke to run after the line stroke',
  );
});


test('disableSceneGraph mode still renders faces for compatibility', () => {
  const ctx = makeMockContext();
  const camera = { worldToScreen: (p) => p, screenToWorld: (p) => p };

  const shapeStore = {
    getShapes() {
      return [
        {
          id: 'face-1',
          type: 'face',
          pointsWorld: [
            { x: 10, y: 10 },
            { x: 50, y: 10 },
            { x: 50, y: 50 },
          ],
          fillColor: '#4aa3ff',
          fillAlpha: 1,
          visible: true,
        },
      ];
    },
    getFillRegions() { return []; },
    getComputedRegions() { return []; },
    getDescendantIds() { return []; },
  };

  const appState = {
    selectedIds: new Set(['face-1']),
    selectedType: 'face',
    disableSceneGraph: true,
    enableFill: true,
    debugRegions: false,
  };

  const renderer = new Renderer({
    ctx,
    camera,
    shapeStore,
    appState,
    getCanvasMetrics: () => ({ canvasCssW: 200, canvasCssH: 200, currentDpr: 1 }),
    ensureCanvasSize: () => {},
  });

  renderer.renderFrame();

  const fillCount = ctx.ops.filter((op) => op[0] === 'fill').length;
  assert.ok(fillCount >= 1, 'expected face fill to render in disableSceneGraph compatibility mode');
});


test('selected object renders a bounds outline around selected area', () => {
  const ctx = makeMockContext();
  const camera = { worldToScreen: (p) => p, screenToWorld: (p) => p };

  const shapeStore = {
    getFillRegions() { return []; },
    getComputedRegions() { return []; },
    getRenderableShapesSorted() {
      return [
        {
          id: 'face-1',
          type: 'face',
          pointsWorld: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 30 },
          ],
          fillColor: '#4aa3ff',
          fillAlpha: 1,
          visible: true,
        },
      ];
    },
    getDescendantIds() { return ['face-1']; },
    getNodeById(id) {
      if (id === 'face-1') return { id, kind: 'shape', shapeType: 'face' };
      return { id, kind: 'object' };
    },
    toShapeView(id) {
      if (id !== 'face-1') return null;
      return {
        id: 'face-1',
        type: 'face',
        pointsWorld: [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
          { x: 30, y: 30 },
        ],
      };
    },
    getShapeBounds(shape) {
      const xs = shape.pointsWorld.map((p) => p.x);
      const ys = shape.pointsWorld.map((p) => p.y);
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    },
  };

  const appState = {
    selectedIds: new Set(['object-1']),
    selectedType: 'object',
    disableSceneGraph: false,
    enableFill: true,
    debugRegions: false,
  };

  const renderer = new Renderer({
    ctx,
    camera,
    shapeStore,
    appState,
    getCanvasMetrics: () => ({ canvasCssW: 200, canvasCssH: 200, currentDpr: 1 }),
    ensureCanvasSize: () => {},
  });

  renderer.renderFrame();

  const moveToOps = ctx.ops.filter((op) => op[0] === 'moveTo');
  const lineToOps = ctx.ops.filter((op) => op[0] === 'lineTo');
  assert.ok(moveToOps.some((op) => op[1] === 10 && op[2] === 10), 'expected bounds outline to start at top-left corner');
  assert.ok(lineToOps.some((op) => op[1] === 30 && op[2] === 30), 'expected bounds outline to include bottom-right corner');
});
