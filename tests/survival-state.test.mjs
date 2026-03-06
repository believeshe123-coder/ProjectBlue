import test from 'node:test';
import assert from 'node:assert/strict';

import { SurvivalState } from '../src/core/survivalState.js';

test('starts with empty inventory, no campfire, and no night warmth', () => {
  const state = new SurvivalState();

  const snapshot = state.getSnapshot();

  assert.deepEqual(snapshot.inventory, {});
  assert.equal(snapshot.structures.campfire, false);
  assert.equal(snapshot.warmAtNight, false);
});

test('crafting axe and pickaxe unlocks wood and rock gathering', () => {
  const state = new SurvivalState();

  assert.equal(state.gather('wood'), false);
  assert.equal(state.gather('rock'), false);

  state.craft('axe');
  assert.equal(state.gather('wood'), true);

  state.craft('pickaxe');
  assert.equal(state.gather('rock'), true);

  const snapshot = state.getSnapshot();
  assert.equal(snapshot.canGather.wood, true);
  assert.equal(snapshot.canGather.rock, true);
  assert.equal(snapshot.inventory.wood, 1);
  assert.equal(snapshot.inventory.rock, 1);
});

test('campfire controls whether player is warm at night', () => {
  const state = new SurvivalState();

  assert.equal(state.isWarmAtNight(), false);
  state.build('campfire');
  assert.equal(state.isWarmAtNight(), true);
});

test('chronicle behaves as a running, scrollable log', () => {
  const state = new SurvivalState();

  state.addChronicle('Dawn breaks.');
  state.addChronicle('You hear wolves.');
  state.addChronicle('Night falls.');

  assert.deepEqual(
    state.getChronicle().map((entry) => entry.message),
    ['Dawn breaks.', 'You hear wolves.', 'Night falls.'],
  );

  assert.deepEqual(
    state.getChronicle({ offset: 0, limit: 2 }).map((entry) => entry.message),
    ['You hear wolves.', 'Night falls.'],
  );

  assert.deepEqual(
    state.getChronicle({ offset: 1, limit: 2 }).map((entry) => entry.message),
    ['Dawn breaks.', 'You hear wolves.'],
  );
});
