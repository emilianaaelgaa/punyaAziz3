/*
 * Pengambilan data dari OpenStreetMap:
 * - Overpass API: kantor BNI se-Indonesia dan badan usaha (PT/CV/dll.) per sel grid 0,1°.
 * - Nominatim: mencari koordinat dari alamat (untuk impor Excel tanpa koordinat).
 * Hasil disimpan di IndexedDB agar tidak perlu diunduh ulang.
 */
(function (root) {
  'use strict';

  var U = root.PP.util;
  var S = root.PP.store;

  var ENDPOINTS = [
    { url: 'https://overpass-api.de/api/interpreter', label: 'overpass-api.de (utama)' },
    { url: 'https://overpass.private.coffee/api/interpreter', label: 'overpass.private.coffee' },
    { url: 'https://overpass.kumi.systems/api/interpreter', label: 'overpass.kumi.systems' },
    { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', label: 'maps.mail.ru' }
  ];
  var BRANCH_TTL = 30 * 864e5;
  var CELL_TTL = 14 * 864e5;
  var memCells = new Map();

  function endpointsFor(choice) {
    var all = ENDPOINTS.map(function (e) { return e.url; });
    if (!choice || choice === 'auto') return all;
    return [choice].concat(all.filter(function (u) { return u !== choice; }));
  }

  function abortError() {
    var e = new Error('Dibatalkan');
    e.name = 'AbortError';
    return e;
  }

  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) { reject(abortError()); return; }
      var t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', function () { clearTimeout(t); reject(abortError()); }, { once: true });
    });
  }

  function friendlyError(e) {
    if (!e) return new Error('Gagal menghubungi server OpenStreetMap.');
    if (e.name === 'TypeError') {
      return new Error('Tidak bisa terhubung ke server OpenStreetMap. Periksa internet; jaringan kantor mungkin memblokirnya.');
    }
    return e;
  }

  // Kirim query ke Overpass. Bila server sibuk/gagal, coba ulang lalu pindah ke server cadangan.
  async function overpass(query, opts) {
    opts = opts || {};
    var lastErr = null;
    var urls = endpointsFor(opts.endpoint);
    for (let u = 0; u < urls.length; u++) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (opts.signal && opts.signal.aborted) throw abortError();
        const ctrl = new AbortController();
        const onAbort = function () { ctrl.abort(); };
        if (opts.signal) opts.signal.addEventListener('abort', onAbort);
        const timer = setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 90000);
        let retry = false;
        try {
          const res = await fetch(urls[u], {
            method: 'POST',
            body: new URLSearchParams({ data: query }),
            signal: ctrl.signal
          });
          if (res.status === 429 || res.status === 503 || res.status === 504) {
            lastErr = new Error('Server OpenStreetMap sedang sibuk (kode ' + res.status + ').');
            retry = attempt === 0;
          } else if (!res.ok) {
            lastErr = new Error('Server OpenStreetMap menolak permintaan (kode ' + res.status + ').');
          } else {
            const json = await res.json();
            if (json && json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
              lastErr = new Error('Server OpenStreetMap kehabisan waktu. Coba perkecil area.');
            } else {
              return json;
            }
          }
        } catch (e) {
          if (opts.signal && opts.signal.aborted) throw abortError();
          lastErr = e.name === 'AbortError' ? new Error('Server OpenStreetMap tidak menjawab tepat waktu.') : friendlyError(e);
        } finally {
          clearTimeout(timer);
          if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
        }
        if (!retry) break;
        await sleep(2500, opts.signal);
      }
    }
    throw lastErr || new Error('Gagal menghubungi server OpenStreetMap.');
  }

  async function loadBranches(opts) {
    opts = opts || {};
    var cached = await S.get('branches:osm');
    var hasCache = cached && cached.items && cached.items.length;
    if (hasCache && !opts.force && Date.now() - cached.t < BRANCH_TTL) {
      return { items: cached.items, t: cached.t, fromCache: true };
    }
    try {
      var json = await overpass(U.branchQuery(), { timeoutMs: 200000, endpoint: opts.endpoint, signal: opts.signal });
      var items = U.parseBranches(json.elements || []);
      if (!items.length) throw new Error('Server tidak mengembalikan data kantor BNI.');
      var t = Date.now();
      await S.set('branches:osm', { t: t, items: items });
      return { items: items, t: t, fromCache: false };
    } catch (e) {
      if (e.name !== 'AbortError' && hasCache) return { items: cached.items, t: cached.t, fromCache: true, stale: true, error: e };
      throw e;
    }
  }

  async function getCell(variant, key) {
    var mk = variant + ':' + key;
    if (memCells.has(mk)) return memCells.get(mk);
    var rec = await S.get('c:' + mk);
    if (rec) memCells.set(mk, rec);
    return rec || null;
  }

  function fresh(rec) { return rec && Date.now() - rec.t < CELL_TTL; }

  // Badan usaha di dalam bbox [s, w, n, e]. Sel yang sudah ada di cache tidak diunduh ulang.
  async function loadCompanies(bbox, opts) {
    opts = opts || {};
    var variant = opts.includeOthers ? 'all' : 'pt';
    var keys = U.cellsForBBox(bbox);
    var items = [];
    var missing = [];
    var stale = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var rec = null;
      if (!opts.force) {
        rec = await getCell(variant, k);
        if (!fresh(rec) && variant === 'pt') {
          var sup = await getCell('all', k);
          if (fresh(sup)) rec = sup;
        }
      }
      if (fresh(rec)) items = items.concat(rec.items);
      else {
        missing.push(k);
        var old = rec || await getCell(variant, k);
        if (old) stale[k] = old;
      }
    }
    var groups = U.groupCells(missing, 3);
    var result = { items: null, fetchedCells: 0, cachedCells: keys.length - missing.length, error: null };
    for (var g = 0; g < groups.length; g++) {
      if (opts.onProgress) opts.onProgress(g, groups.length);
      var grp = groups[g];
      try {
        var json = await overpass(U.companyQuery(grp.bbox, variant === 'all'), {
          timeoutMs: 120000, endpoint: opts.endpoint, signal: opts.signal
        });
        var parsed = U.parseCompanies(json.elements || [], { includeOthers: variant === 'all' });
        var byCell = {};
        grp.keys.forEach(function (key) { byCell[key] = []; });
        parsed.forEach(function (c) {
          var key = U.cellKey(c.lat, c.lon);
          if (byCell[key]) byCell[key].push(c);
        });
        var t = Date.now();
        for (var j = 0; j < grp.keys.length; j++) {
          var key = grp.keys[j];
          var fresh2 = { t: t, items: byCell[key] };
          memCells.set(variant + ':' + key, fresh2);
          await S.set('c:' + variant + ':' + key, fresh2);
          if (missing.indexOf(key) >= 0) { items = items.concat(byCell[key]); result.fetchedCells++; }
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        result.error = e;
        grp.keys.forEach(function (key) {
          if (missing.indexOf(key) >= 0 && stale[key]) items = items.concat(stale[key].items);
        });
      }
    }
    if (variant === 'pt') items = items.filter(function (c) { return c.entity !== 'Lainnya'; });
    result.items = items;
    return result;
  }

  // Pusat ekonomi (pasar, mal, kawasan industri, pergudangan, pelabuhan) dan kantor bank lain dalam bbox.
  async function loadEconomy(bbox, opts) {
    opts = opts || {};
    var key = 'eco:' + bbox.map(function (n) { return n.toFixed(3); }).join(',');
    var cached = await S.get(key);
    if (cached && !opts.force && Date.now() - cached.t < CELL_TTL) return cached.data;
    var json = await overpass(U.economyQuery(bbox), { timeoutMs: 120000, endpoint: opts.endpoint, signal: opts.signal });
    var data = U.parseEconomy(json.elements || []);
    await S.set(key, { t: Date.now(), data: data });
    return data;
  }

  // Nama kota/kabupaten untuk sebuah titik (Nominatim reverse), disimpan agar tidak bertanya ulang.
  async function cityName(lat, lon, opts) {
    opts = opts || {};
    var key = 'city:' + lat.toFixed(2) + ',' + lon.toFixed(2);
    var cached = await S.get(key);
    if (cached) return cached;
    var wait = 1100 - (Date.now() - lastGeocodeAt);
    if (wait > 0) await sleep(wait, opts.signal);
    lastGeocodeAt = Date.now();
    var url = 'https://nominatim.openstreetmap.org/reverse?' + new URLSearchParams({
      lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '10', 'accept-language': 'id'
    }).toString();
    var res = await fetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Nama wilayah tidak ditemukan (kode ' + res.status + ').');
    var name = U.cityFromNominatim(await res.json());
    if (name) await S.set(key, name);
    return name;
  }

  async function clearCells() {
    memCells.clear();
    await S.deletePrefix('c:');
  }

  var lastGeocodeAt = 0;

  // Nominatim membatasi 1 permintaan per detik; fungsi ini menunggu sendiri bila perlu.
  async function geocode(query, opts) {
    opts = opts || {};
    var wait = 1100 - (Date.now() - lastGeocodeAt);
    if (wait > 0) await sleep(wait, opts.signal);
    lastGeocodeAt = Date.now();
    var url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q: query, format: 'jsonv2', limit: '1', countrycodes: 'id', 'accept-language': 'id'
    }).toString();
    var res;
    try {
      res = await fetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('Tidak bisa terhubung ke layanan pencarian alamat (Nominatim).');
    }
    if (!res.ok) throw new Error('Pencarian alamat gagal (kode ' + res.status + ').');
    var arr = await res.json();
    if (!arr || !arr.length) return null;
    var r = arr[0];
    return {
      lat: U.round6(+r.lat),
      lon: U.round6(+r.lon),
      precision: (+r.place_rank || 0) >= 26 ? 'street' : 'approx',
      label: r.display_name || ''
    };
  }

  root.PP.osm = {
    ENDPOINTS: ENDPOINTS, BRANCH_TTL: BRANCH_TTL, CELL_TTL: CELL_TTL,
    overpass: overpass, loadBranches: loadBranches, loadCompanies: loadCompanies,
    clearCells: clearCells, geocode: geocode, sleep: sleep, loadEconomy: loadEconomy, cityName: cityName
  };
})(self);
