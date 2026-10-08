// Mock chrome.* for tests outside a Chrome extension context.
// storage.local is backed by localStorage so a page reload (the Writer's
// autosave/restore path) still sees what the previous load saved. Each
// Playwright test runs in a fresh browser context, so nothing leaks between tests.
(function () {
  const KEY = '__jitter_chrome_mock_store__';
  let store = {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) store = JSON.parse(raw) || {};
  } catch (e) { store = {}; }
  function persist() {
    try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  const local = {
    get _store() { return store; },
    get(keys, callback) {
      const result = {};
      if (typeof keys === 'string') keys = [keys];
      if (keys == null) {
        Object.assign(result, store);
      } else if (Array.isArray(keys)) {
        keys.forEach(k => { if (store[k] !== undefined) result[k] = store[k]; });
      } else if (typeof keys === 'object') {
        Object.keys(keys).forEach(k => {
          result[k] = store[k] !== undefined ? store[k] : keys[k];
        });
      }
      if (callback) callback(result);
      return Promise.resolve(result);
    },
    set(items, callback) {
      // Structured-clone semantics, like the real API: plain data only
      Object.assign(store, JSON.parse(JSON.stringify(items)));
      persist();
      if (callback) callback();
      return Promise.resolve();
    },
    remove(keys, callback) {
      if (typeof keys === 'string') keys = [keys];
      keys.forEach(k => delete store[k]);
      persist();
      if (callback) callback();
      return Promise.resolve();
    },
    clear(callback) {
      store = {};
      persist();
      if (callback) callback();
      return Promise.resolve();
    }
  };

  window.chrome = {
    storage: { local },
    runtime: {
      onMessage: { addListener() {} },
      sendMessage() {},
      getURL(path) { return path; }
    },
    action: {
      onClicked: { addListener() {} }
    }
  };
})();
