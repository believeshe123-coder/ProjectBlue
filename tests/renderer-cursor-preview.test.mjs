import test from 'node:test';
import assert from 'node:assert/strict';

import { drawCursorMagnifier } from '../src/core/renderer.js';

function makeMockContext() {
  const ops = [];
  return {
    canvas: { width: 400, height: 300 },
    ops,
    save() { ops.push(['save']); },
    restore() { ops.push(['restore']); },
    beginPath() { ops.push(['beginPath']); },
    arc(...args) { ops.push(['arc', ...args]); },
    clip() { ops.push(['clip']); },
    translate(...args) { ops.push(['translate', ...args]); },
    scale(...args) { ops.push(['scale', ...args]); },
    drawImage(...args) { ops.push(['drawImage', ...args]); },
    moveTo(...args) { ops.push(['moveTo', ...args]); },
    lineTo(...args) { ops.push(['lineTo', ...args]); },
    stroke() { ops.push(['stroke']); },
    fill() { ops.push(['fill']); },
    fillText(...args) { ops.push(['fillText', ...args]); },
    set strokeStyle(value) { this._strokeStyle = value; },
    set fillStyle(value) { this._fillStyle = value; },
    set lineWidth(value) { this._lineWidth = value; },
    set font(value) { this._font = value; },
    set textAlign(value) { this._textAlign = value; },
  };
}

test('cursor magnifier samples already-rendered canvas content under cursor', () => {
  const ctx = makeMockContext();
  const camera = { worldToScreen: (p) => p };

  drawCursorMagnifier(ctx, camera, 500, 300, {
    screenPoint: { x: 220, y: 120 },
    worldPoint: { x: 220, y: 120 },
  });

  const drawImageOp = ctx.ops.find((op) => op[0] === 'drawImage');
  assert.ok(drawImageOp, 'expected drawImage to be used for magnifier sampling');
  assert.equal(drawImageOp[1], ctx.canvas);
});


test('cursor magnifier can sample from an explicit snapshot canvas source', () => {
  const ctx = makeMockContext();
  const camera = { worldToScreen: (p) => p };
  const snapshotCanvas = { width: 400, height: 300 };

  drawCursorMagnifier(ctx, camera, 500, 300, {
    screenPoint: { x: 220, y: 120 },
    worldPoint: { x: 220, y: 120 },
  }, snapshotCanvas);

  const drawImageOp = ctx.ops.find((op) => op[0] === 'drawImage');
  assert.ok(drawImageOp, 'expected drawImage to be used for magnifier sampling');
  assert.equal(drawImageOp[1], snapshotCanvas);
});
