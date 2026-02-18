import test from 'node:test';
import assert from 'node:assert/strict';

import { HistoryStore } from '../src/state/history.js';

test('history store enforces max stack size of 20 by default', () => {
  const history = new HistoryStore();

  for (let i = 0; i < 25; i += 1) {
    history.pushState({ step: i });
  }

  assert.equal(history.undoStack.length, 20);
  assert.deepEqual(JSON.parse(history.undoStack[0]), { step: 5 });
  assert.deepEqual(JSON.parse(history.undoStack[19]), { step: 24 });
});

test('serialize and restore preserve undo/redo stacks within limit', () => {
  const history = new HistoryStore(20);
  history.pushState({ step: 1 });
  history.pushState({ step: 2 });
  const undone = history.undo({ step: 3 });
  assert.deepEqual(undone, { step: 2 });

  const persisted = history.serialize();

  const restored = new HistoryStore(20);
  restored.restore(persisted);

  assert.equal(restored.undoStack.length, 1);
  assert.equal(restored.redoStack.length, 1);
  assert.deepEqual(JSON.parse(restored.undoStack[0]), { step: 1 });
  assert.deepEqual(JSON.parse(restored.redoStack[0]), { step: 3 });
});
