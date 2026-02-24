import test from 'node:test';
import assert from 'node:assert/strict';

import { drawErasePreview } from '../src/core/renderer.js';

function makeMockContext() {
  const ops = [];
  let composite = 'source-over';
  return {
    ops,
    save() { ops.push(['save']); },
    restore() { ops.push(['restore']); },
    beginPath() { ops.push(['beginPath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); },
    lineTo(x, y) { ops.push(['lineTo', x, y]); },
    stroke() { ops.push(['stroke', this.lineWidth, this.strokeStyle, composite]); },
    set lineWidth(value) { this._lineWidth = value; },
    get lineWidth() { return this._lineWidth; },
    set strokeStyle(value) { this._strokeStyle = value; },
    get strokeStyle() { return this._strokeStyle; },
    set lineCap(value) { this._lineCap = value; },
    set lineJoin(value) { this._lineJoin = value; },
    set globalCompositeOperation(value) { composite = value; ops.push(['composite', value]); },
    get globalCompositeOperation() { return composite; },
  };
}

test('erase preview is rendered as hollow red outline', () => {
  const ctx = makeMockContext();
  const camera = { worldToScreen: (p) => p };

  drawErasePreview(ctx, camera, {
    point: { x: 0, y: 0 },
    pathPoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    strokeWidthPx: 4,
    mode: 'line',
  });

  const strokeOps = ctx.ops.filter((op) => op[0] === 'stroke');
  assert.equal(strokeOps.length, 2);
  assert.equal(strokeOps[0][2], '#ef4444');
  assert.equal(strokeOps[0][3], 'source-over');
  assert.equal(strokeOps[1][3], 'destination-out');
  assert.ok(strokeOps[0][1] > strokeOps[1][1]);
});
