import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSelectionGroupingAction } from '../src/utils/selectionGrouping.js';

test('multiple faces show group to object action', () => {
  const action = resolveSelectionGroupingAction({
    enableGrouping: true,
    selectedType: 'face',
    selectedCount: 2,
  });

  assert.deepEqual(action, { kind: 'make-object', label: 'Group to Object' });
});

test('line selection with enclosed fill shows group as face action', () => {
  const action = resolveSelectionGroupingAction({
    enableGrouping: true,
    selectedType: 'line',
    selectedCount: 2,
    enclosedFillCount: 1,
  });

  assert.deepEqual(action, { kind: 'make-face', label: 'Group as Face' });
});

test('single face does not show grouping action', () => {
  const action = resolveSelectionGroupingAction({
    enableGrouping: true,
    selectedType: 'face',
    selectedCount: 1,
  });

  assert.equal(action, null);
});
