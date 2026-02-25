import test from 'node:test';
import assert from 'node:assert/strict';

function createMagicElement() {
  const fn = function () {
    return proxy;
  };

  const proxy = new Proxy(fn, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'toString') return () => '';
      if (prop === 'valueOf') return () => 0;
      if (prop === 'classList') {
        return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      }
      if (prop === 'dataset') return {};
      if (prop === 'getContext') return () => createMagicElement();
      if (prop === 'querySelector' || prop === 'getElementById') return () => createMagicElement();
      if (prop === 'querySelectorAll') return () => [];
      if (
        prop === 'addEventListener' ||
        prop === 'removeEventListener' ||
        prop === 'setAttribute' ||
        prop === 'removeAttribute' ||
        prop === 'appendChild' ||
        prop === 'focus' ||
        prop === 'click'
      ) {
        return () => {};
      }
      if (prop === 'checked') return false;
      if (prop === 'value') return '';
      if (prop === 'width' || prop === 'height' || prop === 'clientWidth' || prop === 'clientHeight') {
        return 1024;
      }
      return proxy;
    },
    set() {
      return true;
    },
    apply() {
      return proxy;
    },
    construct() {
      return proxy;
    },
  });

  return proxy;
}

function installBrowserLikeGlobals() {
  const storage = new Map();
  const documentMock = {
    getElementById: () => createMagicElement(),
    querySelector: () => createMagicElement(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => createMagicElement(),
    body: createMagicElement(),
  };

  globalThis.document = documentMock;
  globalThis.window = globalThis;
  window.addEventListener = () => {};
  window.removeEventListener = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.devicePixelRatio = 1;
  window.location = { search: '', href: 'http://localhost/editor.html' };

  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => {
      storage.set(key, String(value));
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { userActivation: { isActive: false } },
    configurable: true,
  });

  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.performance = { now: () => 0 };
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.Blob = class {};
  globalThis.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
}

test('startup initialization path does not throw ReferenceError', async () => {
  installBrowserLikeGlobals();

  await assert.doesNotReject(async () => {
    await import(`../src/script.js?startup-regression=${Date.now()}`);
  });
});
