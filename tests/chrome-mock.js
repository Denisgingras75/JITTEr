// Mock chrome.storage.local for testing outside Chrome extension context
window.chrome = {
  storage: {
    local: {
      _store: {},
      get(keys, callback) {
        if (typeof keys === 'string') keys = [keys];
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(k => { if (this._store[k] !== undefined) result[k] = this._store[k]; });
        } else if (typeof keys === 'object' && keys !== null) {
          Object.keys(keys).forEach(k => {
            result[k] = this._store[k] !== undefined ? this._store[k] : keys[k];
          });
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set(items, callback) {
        Object.assign(this._store, items);
        if (callback) callback();
        return Promise.resolve();
      },
      remove(keys, callback) {
        if (typeof keys === 'string') keys = [keys];
        keys.forEach(k => delete this._store[k]);
        if (callback) callback();
        return Promise.resolve();
      },
      clear(callback) {
        this._store = {};
        if (callback) callback();
        return Promise.resolve();
      }
    }
  },
  runtime: {
    onMessage: { addListener() {} },
    sendMessage() {},
    getURL(path) { return path; }
  },
  action: {
    onClicked: { addListener() {} }
  }
};
