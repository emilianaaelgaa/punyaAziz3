/*
 * Mode Google Maps (butuh API key milik pengguna).
 * - Pencarian & detail tempat: Maps JavaScript API, library "places" (Place.searchByText, Place.fetchFields).
 * - Peta dasar: Map Tiles API (petak 2D Google) yang dipasang di Leaflet, lengkap dengan logo dan hak cipta Google.
 * - Hasil Google hanya disimpan di memori selama halaman terbuka (aturan Google: hanya Place ID yang boleh disimpan).
 * - Pemakaian dihitung per bulan di perangkat ini untuk batas aman biaya.
 */
(function (root) {
  'use strict';

  var U = root.PP.util;
  var S = root.PP.store;

  var SEARCH_FIELDS = ['displayName', 'location', 'formattedAddress', 'types', 'businessStatus', 'googleMapsURI'];
  var SEARCH_FIELDS_MIN = ['displayName', 'location', 'formattedAddress'];
  var DETAIL_FIELDS = ['nationalPhoneNumber', 'internationalPhoneNumber', 'websiteURI', 'rating', 'userRatingCount', 'regularOpeningHours', 'googleMapsURI'];
  var DETAIL_FIELDS_MIN = ['nationalPhoneNumber', 'websiteURI'];
  var BASIC_FIELDS = ['location', 'formattedAddress'];
  var LOGO_URL = 'https://developers.google.com/static/maps/documentation/images/google_on_white.png';
  var TILE_ROOT = 'https://tile.googleapis.com';

  var g = {
    key: '',
    loadedKey: '',
    loading: null,
    authError: null,
    sessions: {},
    searchCache: new Map(),
    detailCache: new Map(),
    usage: null,
    onAuthFailure: null
  };

  function setKey(key) {
    key = String(key || '').trim();
    if (key !== g.key) {
      g.key = key;
      g.sessions = {};
      g.authError = null;
    }
  }

  // Pesan galat Google dibuat mudah dipahami.
  function friendlyError(e) {
    var msg = (e && (e.message || e.toString())) || '';
    var out;
    if (/RefererNotAllowed|referer|referrer/i.test(msg)) {
      out = 'API key tidak mengizinkan alamat ini. Tambahkan alamat aplikasi pada pembatasan "Websites" di API key, atau buka aplikasi dari alamat GitHub Pages.';
    } else if (/API_KEY_INVALID|API key not valid|InvalidKey|key is invalid/i.test(msg)) {
      out = 'API key tidak valid. Salin ulang key dari Google Cloud Console.';
    } else if (/billing|BillingNotEnabled/i.test(msg)) {
      out = 'Billing belum aktif di project Google Cloud. Hubungkan akun penagihan dulu.';
    } else if (/not (been )?(used|enabled|activated)|SERVICE_DISABLED|ApiNotActivated|API_NOT_ACTIVATED|has not been used/i.test(msg)) {
      out = 'API belum diaktifkan. Aktifkan Maps JavaScript API, Places API (New), dan Map Tiles API di Google Cloud Console.';
    } else if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
      out = 'Kuota Google sedang habis (batas per menit/hari di Google Cloud). Coba lagi nanti.';
    } else if (/PERMISSION_DENIED|ApiTargetBlocked|blocked/i.test(msg)) {
      out = 'API key tidak diizinkan memakai layanan ini. Periksa pembatasan API pada key.';
    } else {
      out = 'Google Maps menolak permintaan: ' + (msg || 'galat tidak dikenal');
    }
    var err = new Error(out);
    err.google = true;
    return err;
  }

  function isFieldError(e) {
    return /field|maxResultCount|InvalidValueError|unknown property/i.test((e && e.message) || '');
  }

  // ---------------------------------------------------------------------------
  // Memuat Maps JavaScript API
  // ---------------------------------------------------------------------------

  function load() {
    if (!g.key) return Promise.reject(new Error('Isi Google API key di Pengaturan.'));
    if (g.authError) return Promise.reject(g.authError);
    if (g.loading && g.loadedKey === g.key) return g.loading;
    if (g.loadedKey && g.loadedKey !== g.key) {
      return Promise.reject(new Error('API key diganti. Muat ulang halaman agar key baru dipakai.'));
    }
    g.loadedKey = g.key;
    g.loading = new Promise(function (resolve, reject) {
      var done = false;
      root.__ppGoogleReady = function () { done = true; resolve(); };
      root.gm_authFailure = function () {
        g.authError = new Error('Google menolak API key ini. Periksa key, pembatasan alamat (Websites), billing, dan API yang diaktifkan.');
        if (g.onAuthFailure) g.onAuthFailure(g.authError);
      };
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
        key: g.key, v: 'weekly', loading: 'async', language: 'id', region: 'ID', callback: '__ppGoogleReady'
      }).toString();
      s.onerror = function () {
        g.loading = null;
        g.loadedKey = '';
        reject(new Error('Google Maps tidak bisa dimuat. Periksa koneksi internet; jaringan kantor mungkin memblokir maps.googleapis.com.'));
      };
      document.head.appendChild(s);
      setTimeout(function () {
        if (!done) { g.loading = null; g.loadedKey = ''; reject(new Error('Google Maps tidak menjawab tepat waktu.')); }
      }, 25000);
    });
    return g.loading;
  }

  async function placesLib() {
    await load();
    return root.google.maps.importLibrary('places');
  }

  // ---------------------------------------------------------------------------
  // Penghitung pemakaian (per bulan, di perangkat ini)
  // ---------------------------------------------------------------------------

  function monthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
  }

  async function usage() {
    if (!g.usage) g.usage = (await S.get('gusage')) || {};
    if (g.usage.month !== monthKey()) g.usage = { month: monthKey(), search: 0, details: 0, basic: 0 };
    return g.usage;
  }

  async function addUsage(kind) {
    var u = await usage();
    u[kind] = (u[kind] || 0) + 1;
    S.set('gusage', u);
  }

  function capError(kind, cap) {
    var e = new Error(kind === 'search'
      ? 'Batas aman pencarian Google bulan ini (' + U.formatCount(cap) + ') sudah tercapai. Naikkan di Pengaturan bila siap membayar kelebihannya.'
      : 'Batas aman detail Google bulan ini (' + U.formatCount(cap) + ') sudah tercapai. Naikkan di Pengaturan bila siap membayar kelebihannya.');
    e.cap = true;
    return e;
  }

  // ---------------------------------------------------------------------------
  // Pencarian & detail tempat
  // ---------------------------------------------------------------------------

  function latLngOf(loc) {
    if (!loc) return null;
    var lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
    var lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
    return isFinite(lat) && isFinite(lng) ? [lat, lng] : null;
  }

  function plainPlace(place) {
    var ll = latLngOf(place.location);
    return {
      id: place.id,
      name: place.displayName || '',
      lat: ll ? ll[0] : null,
      lon: ll ? ll[1] : null,
      address: place.formattedAddress || '',
      types: place.types || [],
      businessStatus: place.businessStatus ? String(place.businessStatus) : '',
      mapsUrl: place.googleMapsURI || ''
    };
  }

  // Satu pencarian teks dalam kotak b = [s, w, n, e]. Hasil yang sama dalam sesi ini diambil dari memori.
  async function searchText(term, b, opts) {
    opts = opts || {};
    var ck = term + '|' + b.map(function (n) { return n.toFixed(5); }).join(',');
    if (g.searchCache.has(ck)) return { places: g.searchCache.get(ck), cached: true };
    var u = await usage();
    if (opts.monthlyCap != null && u.search >= opts.monthlyCap) throw capError('search', opts.monthlyCap);
    var lib = await placesLib();
    var req = {
      textQuery: term, fields: SEARCH_FIELDS, maxResultCount: U.GOOGLE_PAGE, language: 'id', region: 'id',
      locationRestriction: { south: b[0], west: b[1], north: b[2], east: b[3] }
    };
    var res;
    try {
      res = await lib.Place.searchByText(req);
    } catch (e) {
      if (!isFieldError(e)) throw friendlyError(e);
      req.fields = SEARCH_FIELDS_MIN;
      delete req.maxResultCount;
      try { res = await lib.Place.searchByText(req); } catch (e2) { throw friendlyError(e2); }
    }
    await addUsage('search');
    var places = ((res && res.places) || []).map(plainPlace).filter(function (p) { return p.id && p.lat != null; });
    g.searchCache.set(ck, places);
    return { places: places, cached: false };
  }

  // Telepon, situs web, rating, jam buka (tarif Place Details Enterprise). Diambil hanya bila diminta.
  async function details(placeId, opts) {
    opts = opts || {};
    if (g.detailCache.has(placeId)) return g.detailCache.get(placeId);
    var u = await usage();
    if (opts.monthlyCap != null && u.details >= opts.monthlyCap) throw capError('details', opts.monthlyCap);
    var lib = await placesLib();
    var place = new lib.Place({ id: placeId, requestedLanguage: 'id', requestedRegion: 'id' });
    try {
      await place.fetchFields({ fields: DETAIL_FIELDS });
    } catch (e) {
      if (!isFieldError(e)) throw friendlyError(e);
      try { await place.fetchFields({ fields: DETAIL_FIELDS_MIN }); } catch (e2) { throw friendlyError(e2); }
    }
    await addUsage('details');
    var hours = place.regularOpeningHours && place.regularOpeningHours.weekdayDescriptions;
    var d = {
      phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
      website: place.websiteURI || '',
      rating: place.rating == null ? null : place.rating,
      ratingCount: place.userRatingCount == null ? null : place.userRatingCount,
      hours: Array.isArray(hours) ? hours : [],
      mapsUrl: place.googleMapsURI || ''
    };
    g.detailCache.set(placeId, d);
    return d;
  }

  // Menyegarkan lokasi prospek tersimpan (koordinat Google hanya boleh disimpan maksimal 30 hari).
  async function refreshBasic(placeId) {
    var lib = await placesLib();
    var place = new lib.Place({ id: placeId, requestedLanguage: 'id', requestedRegion: 'id' });
    try { await place.fetchFields({ fields: BASIC_FIELDS }); } catch (e) { throw friendlyError(e); }
    await addUsage('basic');
    var ll = latLngOf(place.location);
    return ll ? { lat: U.round6(ll[0]), lon: U.round6(ll[1]), address: place.formattedAddress || '' } : null;
  }

  // ---------------------------------------------------------------------------
  // Peta dasar Google (Map Tiles API)
  // ---------------------------------------------------------------------------

  async function tileSession(mapType) {
    if (!g.key) throw new Error('Isi Google API key di Pengaturan.');
    var cur = g.sessions[mapType];
    if (cur && cur.expiry * 1000 > Date.now() + 3600e3) return cur;
    var body = { mapType: mapType === 'satellite' ? 'satellite' : 'roadmap', language: 'id-ID', region: 'ID' };
    if (mapType === 'satellite') body.layerTypes = ['layerRoadmap'];
    var res, json;
    try {
      res = await fetch(TILE_ROOT + '/v1/createSession?key=' + encodeURIComponent(g.key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      json = await res.json().catch(function () { return {}; });
    } catch (e) {
      throw new Error('Peta Google tidak bisa dimuat. Periksa koneksi internet; jaringan kantor mungkin memblokir tile.googleapis.com.');
    }
    if (!res.ok || !json.session) {
      throw friendlyError(new Error((json.error && (json.error.message + ' ' + (json.error.status || ''))) || ('HTTP ' + res.status)));
    }
    g.sessions[mapType] = { session: json.session, expiry: +json.expiry || (Date.now() / 1000 + 86400) };
    return g.sessions[mapType];
  }

  function tileUrl(session) {
    return TILE_ROOT + '/v1/2dtiles/{z}/{x}/{y}?session=' + encodeURIComponent(session) + '&key=' + encodeURIComponent(g.key);
  }

  // Teks hak cipta untuk area yang sedang tampil (wajib ditampilkan bersama petak Google).
  async function copyright(mapType, bounds, zoom) {
    var s = g.sessions[mapType];
    if (!s) return '';
    var url = TILE_ROOT + '/tile/v1/viewport?' + new URLSearchParams({
      session: s.session, key: g.key, zoom: String(zoom),
      north: String(bounds.getNorth()), south: String(bounds.getSouth()),
      east: String(bounds.getEast()), west: String(bounds.getWest())
    }).toString();
    try {
      var res = await fetch(url);
      if (!res.ok) return '';
      var j = await res.json();
      return j.copyright || '';
    } catch (e) {
      return '';
    }
  }

  root.PP.google = {
    LOGO_URL: LOGO_URL,
    setKey: setKey,
    hasKey: function () { return !!g.key; },
    load: load,
    searchText: searchText,
    details: details,
    cachedDetails: function (placeId) { return g.detailCache.get(placeId) || null; },
    refreshBasic: refreshBasic,
    tileSession: tileSession,
    tileUrl: tileUrl,
    copyright: copyright,
    usage: usage,
    set onAuthFailure(fn) { g.onAuthFailure = fn; },
    friendlyError: friendlyError
  };
})(self);
