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
    stroke() { ops.push(['stroke']); },
    fillRect(...args) { ops.push(['fillRect', ...args]); },
    strokeRect(...args) { ops.push(['strokeRect', ...args]); },
    setLineDash() {},
    closePath() {},
    fill() {},
    arc() {},
    fillText(...args) { ops.push(['fillText', ...args]); },
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

test('disableSceneGraph mode draws lines from getShapes so hidden-layer lines stay hidden', () => {
  const ctx = makeMockContext();
  const camera = { worldToScreen: (p) => p, screenToWorld: (p) => p };

  let toShapeViewCalls = 0;

  const shapeStore = {
    nodes: {
      visibleLineNode: { id: 'visible-line', kind: 'shape', shapeType: 'line', style: { visible: true } },
      hiddenLayerLineNode: { id: 'hidden-layer-line', kind: 'shape', shapeType: 'line', style: { visible: true } },
    },
    toShapeView() { toShapeViewCalls += 1; return null; },
    getShapes() {
      return [
        { id: 'visible-line', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, strokeWidth: 2, visible: true },
      ];
    },
    getFillRegions() { return []; },
    getComputedRegions() { return []; },
    getDescendantIds() { return []; },
    getRenderableShapesSorted() { return []; },
  };

  const appState = {
    selectedIds: new Set(),
    selectedType: null,
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

  assert.equal(toShapeViewCalls, 0);
});
