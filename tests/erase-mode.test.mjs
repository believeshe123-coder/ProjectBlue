import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEraseMode } from '../src/state/eraseMode.js';

test('only line and fill erase modes are accepted', () => {
  assert.equal(normalizeEraseMode('line'), 'line');
  assert.equal(normalizeEraseMode('fill'), 'fill');
  assert.equal(normalizeEraseMode('hybrid'), 'line');
  assert.equal(normalizeEraseMode('object'), 'line');
  assert.equal(normalizeEraseMode('segment'), 'line');
  assert.equal(normalizeEraseMode(null), 'line');
});
