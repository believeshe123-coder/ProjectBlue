import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySelectionDraftToShapes,
  getSelectionApplyDisabledState,
  getSelectionStyleSummaryFromShapes,
} from '../src/utils/selectionStyleDraft.js';

test('selection controls are editable without mutating shape styles until apply runs', () => {
  const line = { id: 'line-1', type: 'line', strokeColor: '#112233', strokeWidth: 2 };
  const draft = { color: '#abcdef', strokeWidth: 7, supportsColor: true, supportsStrokeWidth: true };

  // Draft changed in the UI, but no apply call means no shape mutation.
  assert.equal(line.strokeColor, '#112233');
  assert.equal(line.strokeWidth, 2);

  applySelectionDraftToShapes([line], draft);
  assert.equal(line.strokeColor, '#abcdef');
  assert.equal(line.strokeWidth, 7);
});

test('apply updates selected items and face fill color per current behavior', () => {
  const line = { id: 'line-1', type: 'line', strokeColor: '#111111', strokeWidth: 1 };
  const face = { id: 'face-1', type: 'face', strokeColor: '#222222', strokeWidth: 2, fillColor: '#333333' };

  applySelectionDraftToShapes([line, face], {
    color: '#ff00aa',
    strokeWidth: 6,
    supportsColor: true,
    supportsStrokeWidth: true,
  });

  assert.equal(line.strokeColor, '#ff00aa');
  assert.equal(line.strokeWidth, 6);
  assert.equal(face.strokeColor, '#ff00aa');
  assert.equal(face.strokeWidth, 6);
  assert.equal(face.fillColor, '#ff00aa');
});

test('disabled-state logic matches unsupported selection capabilities', () => {
  assert.equal(getSelectionApplyDisabledState({ supportsColor: false, supportsStrokeWidth: false }), true);
  assert.equal(getSelectionApplyDisabledState({ supportsColor: true, supportsStrokeWidth: false }), false);
  assert.equal(getSelectionApplyDisabledState({ supportsColor: false, supportsStrokeWidth: true }), false);

  const summary = getSelectionStyleSummaryFromShapes(
    [{ id: 'fill-only', type: 'label', fillColor: '#f0f0f0' }],
    { strokeColor: '#4aa3ff', strokeWidth: 2 },
  );
  assert.equal(summary.supportsColor, false);
  assert.equal(summary.supportsStrokeWidth, false);
});
