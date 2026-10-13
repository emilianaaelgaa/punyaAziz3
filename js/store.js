/*
 * Penyimpanan lokal (IndexedDB) berbentuk key-value.
 * Semua data hanya tersimpan di browser perangkat ini. Bila IndexedDB tidak tersedia
 * (mis. mode privat tertentu), data disimpan di memori dan hilang saat halaman ditutup.
 */
(function (root) {
  'use strict';

  var DB_NAME = 'peta-prospek-kredit';
  var STORE = 'kv';
  var mem = new Map();
  var dbPromise = null;
  var persistent = true;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) { persistent = false; resolve(null); return; }
        var req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { persistent = false; resolve(null); };
        req.onblocked = function () { persistent = false; resolve(null); };
      } catch (e) {
        persistent = false;
        resolve(null);
      }
    });
    return dbPromise;
  }

  function get(key) {
    return open().then(function (db) {
      if (!db) return mem.get(key);
      return new Promise(function (resolve) {
        try {
          var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
          r.onsuccess = function () { resolve(r.result === undefined ? mem.get(key) : r.result); };
          r.onerror = function () { resolve(mem.get(key)); };
        } catch (e) { resolve(mem.get(key)); }
      });
    });
  }

  // Mengembalikan true bila tersimpan permanen, false bila hanya di memori (mis. kuota penuh).
  function set(key, value) {
    return open().then(function (db) {
      if (!db) { mem.set(key, value); return false; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = function () { mem.delete(key); resolve(true); };
          tx.onerror = tx.onabort = function () { mem.set(key, value); resolve(false); };
        } catch (e) { mem.set(key, value); resolve(false); }
      });
    });
  }

  function del(key) {
    mem.delete(key);
    return open().then(function (db) {
      if (!db) return true;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = tx.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  function range(prefix) {
    return root.IDBKeyRange.bound(prefix, prefix + '￿');
  }

  // Semua nilai dengan awalan kunci tertentu, mis. "p:" untuk profil.
  function getAllPrefix(prefix) {
    return open().then(function (db) {
      var fromMem = [];
      mem.forEach(function (v, k) { if (k.indexOf(prefix) === 0) fromMem.push(v); });
      if (!db) return fromMem;
      return new Promise(function (resolve) {
        try {
          var r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(range(prefix));
          r.onsuccess = function () { resolve((r.result || []).concat(fromMem)); };
          r.onerror = function () { resolve(fromMem); };
        } catch (e) { resolve(fromMem); }
      });
    });
  }

  function deletePrefix(prefix) {
    Array.from(mem.keys()).forEach(function (k) { if (k.indexOf(prefix) === 0) mem.delete(k); });
    return open().then(function (db) {
      if (!db) return true;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(range(prefix));
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = tx.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  function isPersistent() {
    return open().then(function () { return persistent; });
  }

  // Minta browser agar data tidak dihapus otomatis saat ruang penyimpanan menipis.
  function requestPersist() {
    try {
      if (root.navigator && navigator.storage && navigator.storage.persist) return navigator.storage.persist();
    } catch (e) { /* abaikan */ }
    return Promise.resolve(false);
  }

  root.PP = root.PP || {};
  root.PP.store = {
    get: get, set: set, del: del, getAllPrefix: getAllPrefix, deletePrefix: deletePrefix,
    isPersistent: isPersistent, requestPersist: requestPersist
  };
})(self);
