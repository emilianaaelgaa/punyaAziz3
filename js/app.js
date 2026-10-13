/*
 * Peta Prospek Kredit — logika aplikasi: peta, zona, deteksi, daftar, detail prospek, dialog.
 */
(function () {
  'use strict';

  var U = PP.util;
  var S = PP.store;
  var O = PP.osm;
  var X = PP.excel;
  var esc = U.esc;

  function $(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var state = {
    settings: U.mergeSettings(null),
    branchesOsm: [],
    branchesOsmT: 0,
    branchesOsmError: null,
    branchesLoading: false,
    branchesImport: [],
    branches: [],
    branchById: new Map(),
    profiles: {},
    activeBranch: null,
    rawResults: [],
    results: [],
    resultsCtx: null,
    resultsError: null,
    resultsLoading: false,
    zoneFilter: { red: true, orange: true, green: true, out: true },
    statusFilter: 'all',
    branchQuery: '',
    resultQuery: '',
    prospectQuery: '',
    selectedId: null,
    userLoc: null,
    pick: null,
    detectSeq: 0,
    detectCtrl: null,
    tab: 'deteksi',
    branchLimit: 60,
    resultLimit: 150,
    prospectLimit: 150
  };

  var map;
  var layers = {};
  var renderers = {};
  var branchMarkers = new Map();
  var resultMarkers = new Map();
  var savedMarkers = new Map();
  var colors = {};

  // ---------------------------------------------------------------------------
  // Utilitas UI
  // ---------------------------------------------------------------------------

  function debounce(fn, ms) {
    var t = null;
    var wrapped = function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
    wrapped.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    wrapped.cancel = function () { clearTimeout(t); t = null; };
    return wrapped;
  }

  function normQ(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function isMobile() { return window.matchMedia('(max-width: 760px)').matches; }

  var toastTimer = null;
  function toast(msg, opts) {
    opts = opts || {};
    var el = $('toast');
    el.className = 'toast' + (opts.error ? ' err' : '');
    el.textContent = msg;
    if (opts.action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.style.marginLeft = '10px';
      b.textContent = opts.action.label;
      b.addEventListener('click', function () { el.hidden = true; opts.action.fn(); });
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, opts.ms || (opts.action ? 7000 : 4000));
  }

  var statusTimer = null;
  function showStatus(text, kind, autoHideMs) {
    var el = $('status');
    el.classList.toggle('err', kind === 'err');
    $('statusSpinner').hidden = kind === 'err' || kind === 'info';
    $('statusText').textContent = text;
    el.hidden = false;
    clearTimeout(statusTimer);
    if (autoHideMs) statusTimer = setTimeout(hideStatus, autoHideMs);
  }
  function hideStatus() { $('status').hidden = true; }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['zone-red', 'zone-orange', 'zone-green', 'zone-out', 'ink', 'card', 'accent'].forEach(function (k) {
      colors[k] = cs.getPropertyValue('--' + k).trim();
    });
    colors.red = colors['zone-red'];
    colors.orange = colors['zone-orange'];
    colors.green = colors['zone-green'];
    colors.out = colors['zone-out'];
  }

  function confirmDialog(title, text, okLabel) {
    return new Promise(function (resolve) {
      var dlg = $('dlgConfirm');
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      $('confirmOk').textContent = okLabel || 'Hapus';
      dlg.returnValue = '';
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      });
      dlg.showModal();
    });
  }

  function radiiText(r) {
    function f(n) { return String(n).replace('.', ','); }
    return { r1: f(r[0]), r2: f(r[1]), r3: f(r[2]) };
  }

  // ---------------------------------------------------------------------------
  // Pengaturan & tema
  // ---------------------------------------------------------------------------

  var saveSettingsSoon = debounce(function () { S.set('settings', state.settings); }, 500);

  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    readColors();
  }

  function onThemeChanged() {
    readColors();
    if (!map) return;
    drawZones();
    renderResultMarkers();
  }

  function applyRadiiLabels() {
    var t = radiiText(state.settings.radii);
    $('brandZones').textContent = t.r1 + '–' + t.r2 + '–' + t.r3;
    var lg = document.querySelector('.legend');
    if (lg) {
      lg.querySelector('[data-r="1"]').textContent = '≤ ' + t.r1 + ' km';
      lg.querySelector('[data-r="2"]').textContent = t.r1 + '–' + t.r2 + ' km';
      lg.querySelector('[data-r="3"]').textContent = t.r2 + '–' + t.r3 + ' km';
    }
    $('helpZones').textContent = 'Merah: sampai ' + t.r1 + ' km dari kantor BNI. Oranye: ' + t.r1 + '–' + t.r2 +
      ' km. Hijau: ' + t.r2 + '–' + t.r3 + ' km. Usaha yang lebih jauh tidak ditampilkan saat kantor aktif, dan ditandai abu-abu pada deteksi area.';
  }

  // ---------------------------------------------------------------------------
  // Peta
  // ---------------------------------------------------------------------------

  function initMap() {
    map = L.map('map', { zoomControl: false, minZoom: 4, worldCopyJump: true, attributionControl: true });
    L.control.zoom({ position: 'topright', zoomInTitle: 'Perbesar', zoomOutTitle: 'Perkecil' }).addTo(map);

    var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'tiles-osm',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">kontributor OpenStreetMap</a>'
    });
    var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Citra &copy; Esri, Maxar, Earthstar Geographics'
    });
    layers.osm = osm;
    layers.sat = sat;
    (state.settings.baseLayer === 'sat' ? sat : osm).addTo(map);

    [['zones', 350, '0.22'], ['zoneLines', 360, '1'], ['companies', 450, '1']].forEach(function (p) {
      var pane = map.createPane(p[0]);
      pane.style.zIndex = p[1];
      pane.style.opacity = p[2];
      if (p[0] !== 'companies') pane.style.pointerEvents = 'none';
    });
    renderers.zones = L.canvas({ pane: 'zones', padding: 0.4 });
    renderers.lines = L.svg({ pane: 'zoneLines', padding: 0.4 });
    renderers.companies = L.canvas({ pane: 'companies', padding: 0.3, tolerance: 5 });

    layers.zones = L.layerGroup();
    layers.zoneLines = L.layerGroup();
    layers.zoneAll = L.layerGroup([layers.zones, layers.zoneLines]).addTo(map);
    layers.results = L.layerGroup().addTo(map);
    layers.saved = L.layerGroup().addTo(map);
    layers.me = L.layerGroup().addTo(map);
    layers.branches = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 50, disableClusteringAtZoom: 12,
      spiderfyOnMaxZoom: false, chunkedLoading: true, iconCreateFunction: clusterIcon
    }).addTo(map);

    L.control.layers({ 'Peta': osm, 'Satelit': sat }, {
      'Kantor BNI': layers.branches, 'Zona': layers.zoneAll, 'Hasil deteksi': layers.results, 'Prospek saya': layers.saved
    }, { position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    var Legend = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'legend');
        div.innerHTML =
          '<div class="legend-row"><i class="sw red"></i><span>Merah</span><b data-r="1"></b></div>' +
          '<div class="legend-row"><i class="sw orange"></i><span>Oranye</span><b data-r="2"></b></div>' +
          '<div class="legend-row"><i class="sw green"></i><span>Hijau</span><b data-r="3"></b></div>' +
          '<div class="legend-row"><i class="sw bank"></i><span>Kantor BNI</span></div>' +
          '<div class="legend-row"><i class="sw saved"></i><span>Prospek saya</span></div>';
        L.DomEvent.disableClickPropagation(div);
        return div;
      }
    });
    new Legend().addTo(map);

    map.on('baselayerchange', function (e) {
      state.settings.baseLayer = e.layer === sat ? 'sat' : 'osm';
      saveSettingsSoon();
    });
    map.on('moveend', onMoveEnd);
    map.on('zoomend', updateDetectButton);
    map.on('click', onMapClick);

    var v = state.settings.view;
    if (v && isFinite(v.lat) && isFinite(v.lon) && isFinite(v.z)) map.setView([v.lat, v.lon], v.z);
    else if (isMobile()) map.setView([-6.9, 110.2], 6);
    else map.fitBounds([[-10.5, 95.5], [5.8, 140.8]]);
  }

  function clusterIcon(cluster) {
    var n = cluster.getChildCount();
    var label = n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'rb' : String(n);
    return L.divIcon({ className: 'mc-wrap', iconSize: [38, 38], html: '<div class="mc">' + label + '</div>' });
  }

  function branchIcon(b, active) {
    return L.divIcon({
      className: 'bm-wrap', iconSize: [26, 26], iconAnchor: [13, 13],
      html: '<div class="bm t-' + esc(b.type) + (active ? ' active' : '') + '"><svg class="i"><use href="#i-bank"/></svg></div>'
    });
  }

  // Kantor yang tampil (sesuai filter jenis); disimpan sampai daftar kantor atau filter berubah.
  var visibleCache = null;
  function visibleBranches() {
    if (!visibleCache) {
      var types = state.settings.branchTypes;
      visibleCache = state.branches.filter(function (b) { return types[b.type] !== false; });
    }
    return visibleCache;
  }

  function renderBranchMarkers() {
    layers.branches.clearLayers();
    branchMarkers.clear();
    var markers = [];
    visibleBranches().forEach(function (b) {
      var active = state.activeBranch && state.activeBranch.id === b.id;
      var m = L.marker([b.lat, b.lon], { icon: branchIcon(b, active), title: b.name, riseOnHover: true, zIndexOffset: active ? 1000 : 0 });
      m.bindTooltip(esc(b.name), { className: 'ct', direction: 'top', offset: [0, -14] });
      m.on('click', function () { selectBranch(b); });
      branchMarkers.set(b.id, m);
      markers.push(m);
    });
    layers.branches.addLayers(markers);
  }

  function updateActiveBranchIcon(prevId) {
    if (prevId && branchMarkers.has(prevId)) {
      var pb = state.branchById.get(prevId);
      if (pb) { branchMarkers.get(prevId).setIcon(branchIcon(pb, false)); branchMarkers.get(prevId).setZIndexOffset(0); }
    }
    if (state.activeBranch && branchMarkers.has(state.activeBranch.id)) {
      var m = branchMarkers.get(state.activeBranch.id);
      m.setIcon(branchIcon(state.activeBranch, true));
      m.setZIndexOffset(1000);
    }
  }

  function drawZones() {
    if (!map) return;
    layers.zones.clearLayers();
    layers.zoneLines.clearLayers();
    var r = state.settings.radii;
    var list;
    if (state.activeBranch) {
      list = [state.activeBranch];
    } else {
      if (map.getZoom() < 9) return;
      var bounds = map.getBounds().pad(0.35);
      list = visibleBranches().filter(function (b) { return bounds.contains([b.lat, b.lon]); });
      if (list.length > 600) return;
    }
    // Hijau dulu, lalu oranye, lalu merah di atasnya; panel transparan membuat irisan zona tidak bertumpuk warnanya.
    [['green', r[2]], ['orange', r[1]], ['red', r[0]]].forEach(function (z) {
      list.forEach(function (b) {
        L.circle([b.lat, b.lon], {
          radius: z[1] * 1000, renderer: renderers.zones, stroke: false,
          fillColor: colors[z[0]], fillOpacity: 1, interactive: false
        }).addTo(layers.zones);
      });
    });
    if (state.activeBranch) {
      var b = state.activeBranch;
      var t = radiiText(r);
      [['red', r[0], t.r1], ['orange', r[1], t.r2], ['green', r[2], t.r3]].forEach(function (z) {
        L.circle([b.lat, b.lon], {
          radius: z[1] * 1000, renderer: renderers.lines, fill: false, color: colors[z[0]],
          weight: 2, dashArray: '6 5', interactive: false
        }).addTo(layers.zoneLines);
        L.marker([b.lat + z[1] / 110.57, b.lon], {
          pane: 'zoneLines', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'ring-label', iconSize: [0, 0], html: '<span style="color:' + colors[z[0]] + '">' + z[2] + ' km</span>' })
        }).addTo(layers.zoneLines);
      });
    }
  }

  function circleStyle(c, selected) {
    var saved = !!c.profile;
    return {
      renderer: renderers.companies,
      radius: selected ? 11 : (saved ? 8 : 7),
      color: saved || selected ? colors.ink : colors.card,
      weight: selected ? 3 : (saved ? 2.5 : 2),
      fillColor: colors[c.zone] || colors.out,
      fillOpacity: .95
    };
  }

  function renderResultMarkers() {
    if (!map) return;
    layers.results.clearLayers();
    resultMarkers.clear();
    filteredResults().forEach(function (c) {
      var m = L.circleMarker([c.lat, c.lon], circleStyle(c, c.id === state.selectedId));
      m.bindTooltip(esc(c.name), { className: 'ct', direction: 'top', offset: [0, -8] });
      m.on('click', function (e) { L.DomEvent.stop(e); openDossier(c.id); });
      m.addTo(layers.results);
      resultMarkers.set(c.id, m);
    });
    renderSavedMarkers();
  }

  function renderSavedMarkers() {
    layers.saved.clearLayers();
    savedMarkers.clear();
    var inResults = new Set(state.results.map(function (c) { return c.id; }));
    prospectViews().forEach(function (v) {
      var p = v.profile;
      if (p.lat == null || inResults.has(p.id)) return;
      var c = { id: p.id, zone: v.zone || 'out', profile: p };
      var m = L.circleMarker([p.lat, p.lon], circleStyle(c, p.id === state.selectedId));
      m.bindTooltip(esc(p.name || 'Prospek tanpa nama'), { className: 'ct', direction: 'top', offset: [0, -8] });
      m.on('click', function (e) { L.DomEvent.stop(e); openDossier(p.id); });
      m.addTo(layers.saved);
      savedMarkers.set(p.id, m);
    });
  }

  function highlightSelected() {
    resultMarkers.forEach(function (m, id) {
      var c = state.results.find(function (x) { return x.id === id; });
      if (c) m.setStyle(circleStyle(c, id === state.selectedId));
      if (id === state.selectedId) m.bringToFront();
    });
    savedMarkers.forEach(function (m, id) {
      var p = state.profiles[id];
      if (!p) return;
      var v = prospectView(p);
      m.setStyle(circleStyle({ zone: v.zone || 'out', profile: p }, id === state.selectedId));
      if (id === state.selectedId) m.bringToFront();
    });
    document.querySelectorAll('.item.selected').forEach(function (el) { el.classList.remove('selected'); });
    if (state.selectedId) {
      document.querySelectorAll('.item[data-id="' + cssEsc(state.selectedId) + '"]').forEach(function (el) { el.classList.add('selected'); });
    }
  }

  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  // Geser peta agar titik terlihat di area yang tidak tertutup panel detail.
  function ensureVisible(lat, lon, zoom) {
    if (!map) return;
    var ll = L.latLng(lat, lon);
    var dossierOpen = !$('dossier').hidden && !isMobile();
    var size = map.getSize();
    var rightPad = dossierOpen ? Math.min(460, size.x * 0.6) : 0;
    var pt = map.latLngToContainerPoint(ll);
    var visible = pt.x > 30 && pt.x < size.x - rightPad - 30 && pt.y > 70 && pt.y < size.y - 70;
    if (zoom && map.getZoom() < zoom) {
      map.setView(ll, zoom, { animate: false });
      if (rightPad) map.panBy([rightPad / 2, 0], { animate: false });
      return;
    }
    if (!visible) {
      var target = L.point((size.x - rightPad) / 2, size.y / 2);
      map.panBy(pt.subtract(target), { animate: true });
    }
  }

  var saveViewSoon = debounce(function () {
    var c = map.getCenter();
    state.settings.view = { lat: U.round6(c.lat), lon: U.round6(c.lng), z: map.getZoom() };
    saveSettingsSoon();
  }, 800);

  var autoDetectSoon = debounce(function () {
    if (!state.activeBranch && state.settings.autoDetect && map.getZoom() >= 13) runDetection({ auto: true });
  }, 700);

  var branchListSoon = debounce(function () { if (state.tab === 'cabang') renderBranchList(); }, 300);

  function onMoveEnd() {
    saveViewSoon();
    if (!state.activeBranch) {
      drawZones();
      autoDetectSoon();
    }
    branchListSoon();
  }

  function updateDetectButton() {
    var btn = $('btnDetectArea');
    var area = !state.activeBranch;
    btn.hidden = !area;
    if (!area || !map) return;
    var ok = map.getZoom() >= 12;
    btn.disabled = !ok;
    $('btnDetectAreaText').textContent = ok ? 'Deteksi PT/CV di area ini' : 'Perbesar peta untuk deteksi';
  }

  function fitToRadius(b) {
    var R = state.settings.radii[2] * 1000;
    var bounds = L.latLng(b.lat, b.lon).toBounds(R * 2);
    var pad = isMobile() ? [10, 10] : [30, 30];
    map.fitBounds(bounds, { paddingTopLeft: pad, paddingBottomRight: pad, maxZoom: 15 });
  }

  // ---------------------------------------------------------------------------
  // Data kantor BNI
  // ---------------------------------------------------------------------------

  function rebuildBranches() {
    var osm = state.settings.branchSource === 'import' ? [] : state.branchesOsm;
    var imp = state.branchesImport;
    if (imp.length && osm.length) {
      // Kantor OSM yang berimpit (< 200 m) dengan kantor impor dianggap sama; pakai data impor.
      var grid = new Map();
      imp.forEach(function (b) {
        var k = U.cellKey(b.lat, b.lon);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(b);
      });
      osm = osm.filter(function (b) {
        var i = Math.floor(b.lat * 10 + 1e-9), j = Math.floor(b.lon * 10 + 1e-9);
        for (var di = -1; di <= 1; di++) {
          for (var dj = -1; dj <= 1; dj++) {
            var arr = grid.get((i + di) + '_' + (j + dj));
            if (arr && arr.some(function (x) { return U.haversineKm(x.lat, x.lon, b.lat, b.lon) < 0.2; })) return false;
          }
        }
        return true;
      });
    }
    state.branches = osm.concat(imp);
    state.branches.forEach(function (b) {
      b._hay = normQ([b.name, b.address, b.city, b.type, b.kode].join(' '));
    });
    state.branchById = new Map(state.branches.map(function (b) { return [b.id, b]; }));
    visibleCache = null;
    if (state.activeBranch) {
      var still = state.branchById.get(state.activeBranch.id);
      state.activeBranch = still || null;
    }
    renderBranchMarkers();
    renderBranchTypeChips();
    renderBranchList();
    updateActiveChip();
    drawZones();
    if (state.resultsCtx) computeResults();
    else renderProspects();
    updateCounts();
  }

  async function loadOsmBranches(force) {
    if (state.settings.branchSource === 'import') { renderBranchList(); return; }
    state.branchesLoading = true;
    state.branchesOsmError = null;
    renderBranchList();
    var firstTime = !state.branchesOsm.length;
    showStatus(firstTime ? 'Memuat kantor BNI se-Indonesia dari OpenStreetMap (sekali saja, ±30 detik)…' : 'Memperbarui data kantor BNI…');
    try {
      var res = await O.loadBranches({ force: !!force, endpoint: state.settings.overpass });
      state.branchesOsm = res.items;
      state.branchesOsmT = res.t;
      if (res.stale && res.error) {
        state.branchesOsmError = res.error.message;
        showStatus('Memakai data kantor tersimpan. ' + res.error.message, 'err', 7000);
      } else {
        hideStatus();
        if (force || !res.fromCache) toast(U.formatCount(res.items.length) + ' kantor BNI dimuat dari OpenStreetMap.');
      }
    } catch (e) {
      state.branchesOsmError = e.message;
      showStatus('Data kantor BNI gagal dimuat. ' + e.message, 'err', 10000);
    } finally {
      state.branchesLoading = false;
      rebuildBranches();
    }
  }

  // ---------------------------------------------------------------------------
  // Pemilihan kantor & deteksi
  // ---------------------------------------------------------------------------

  function selectBranch(b, opts) {
    opts = opts || {};
    if (state.pick) cancelPick();
    var prevId = state.activeBranch ? state.activeBranch.id : null;
    state.activeBranch = b;
    state.settings.lastBranchId = b.id;
    saveSettingsSoon();
    updateActiveBranchIcon(prevId);
    updateActiveChip();
    updateDetectButton();
    drawZones();
    if (opts.fly !== false) fitToRadius(b);
    setTab('deteksi');
    if (isMobile() && $('app').dataset.sheet === 'peek') setSheet('half');
    runDetection({});
  }

  function clearBranch() {
    var prevId = state.activeBranch ? state.activeBranch.id : null;
    state.activeBranch = null;
    state.settings.lastBranchId = null;
    saveSettingsSoon();
    if (state.detectCtrl) state.detectCtrl.abort();
    state.detectSeq++;
    state.resultsLoading = false;
    hideStatus();
    updateActiveBranchIcon(prevId);
    updateActiveChip();
    updateDetectButton();
    state.resultsCtx = null;
    state.rawResults = [];
    computeResults();
    drawZones();
    if (state.settings.autoDetect && map.getZoom() >= 13) runDetection({ auto: true });
  }

  function updateActiveChip() {
    var b = state.activeBranch;
    $('activeChip').hidden = !b;
    if (!b) return;
    var t = U.BRANCH_TYPES.find(function (x) { return x.id === b.type; });
    $('activeName').textContent = b.name;
    $('activeMeta').textContent = (t ? t.long : 'Kantor BNI') + ' · radius ' + radiiText(state.settings.radii).r3 + ' km';
  }

  function inBBox(c, b) {
    return c.lat >= b[0] && c.lat <= b[2] && c.lon >= b[1] && c.lon <= b[3];
  }

  async function runDetection(opts) {
    opts = opts || {};
    var ctx, bbox;
    if (state.activeBranch) {
      var b = state.activeBranch;
      var R = state.settings.radii[2];
      bbox = U.bboxAround(b.lat, b.lon, R);
      ctx = { kind: 'branch', branchId: b.id, label: 'Sekitar ' + b.name, refName: b.name, lat: b.lat, lon: b.lon, radius: R };
    } else {
      if (map.getZoom() < 12) {
        if (opts.manual) toast('Perbesar peta dulu; area ini terlalu luas untuk dideteksi.');
        return;
      }
      var bn = map.getBounds();
      bbox = [bn.getSouth(), bn.getWest(), bn.getNorth(), bn.getEast()];
      if (U.cellsForBBox(bbox).length > 20) {
        if (opts.manual) toast('Perbesar peta dulu; area ini terlalu luas untuk dideteksi.');
        return;
      }
      ctx = { kind: 'area', label: 'Area peta', bbox: bbox };
    }
    var seq = ++state.detectSeq;
    if (state.detectCtrl) state.detectCtrl.abort();
    var ctrl = new AbortController();
    state.detectCtrl = ctrl;
    state.resultsLoading = true;
    state.resultsError = null;
    showStatus(ctx.kind === 'branch' ? 'Mendeteksi PT/CV di sekitar ' + ctx.refName + '…' : 'Mendeteksi PT/CV di area peta…');
    renderResults();
    try {
      var res = await O.loadCompanies(bbox, {
        includeOthers: state.settings.includeOthers, force: !!opts.force, signal: ctrl.signal, endpoint: state.settings.overpass,
        onProgress: function (i, n) {
          if (n > 1 && seq === state.detectSeq) showStatus('Mengunduh data badan usaha (' + (i + 1) + '/' + n + ')…');
        }
      });
      if (seq !== state.detectSeq) return;
      state.rawResults = U.dedupeCompanies(res.items);
      state.resultsCtx = ctx;
      state.resultsError = res.error ? res.error.message : null;
      state.resultLimit = 150;
      computeResults();
      if (res.error) showStatus('Sebagian area gagal dimuat. ' + res.error.message, 'err', 8000);
      else hideStatus();
    } catch (e) {
      if (e.name === 'AbortError' || seq !== state.detectSeq) return;
      state.resultsError = e.message;
      state.rawResults = [];
      state.resultsCtx = ctx;
      computeResults();
      showStatus(e.message, 'err', 9000);
    } finally {
      if (seq === state.detectSeq) {
        state.resultsLoading = false;
        renderResults();
      }
    }
  }

  function profileFor(c) {
    if (state.profiles[c.id]) return state.profiles[c.id];
    var alt = c.altIds || [];
    for (var i = 0; i < alt.length; i++) if (state.profiles[alt[i]]) return state.profiles[alt[i]];
    return null;
  }

  function profileAsCompany(p) {
    return {
      id: p.id, source: p.source, osm: p.osm, name: p.name || 'Prospek tanpa nama', entity: p.entity || 'Lainnya',
      lat: p.lat, lon: p.lon, address: p.address || '', city: p.city || '', phone: p.phone || '', email: p.email || '',
      website: p.website || '', category: p.category || p.bidang || '', operator: p.operator || '', tags: p.tags
    };
  }

  function computeResults() {
    var ctx = state.resultsCtx;
    var list = [];
    if (ctx) {
      var r = state.settings.radii;
      var vb = visibleBranches();
      var seen = new Set();
      var add = function (c, profile) {
        var item = Object.assign({}, c);
        item.profile = profile || profileFor(c);
        var near = U.nearestBranch(item.lat, item.lon, vb);
        item.nearest = near ? { id: near.branch.id, name: near.branch.name, dist: near.dist, lat: near.branch.lat, lon: near.branch.lon } : null;
        if (ctx.kind === 'branch') {
          item.dist = U.haversineKm(ctx.lat, ctx.lon, item.lat, item.lon);
          item.refName = ctx.refName;
        } else {
          item.dist = near ? near.dist : null;
          item.refName = near ? near.branch.name : '';
        }
        item.zone = U.zoneFor(item.dist, r);
        list.push(item);
      };
      state.rawResults.forEach(function (c) {
        if (ctx.kind === 'branch' && U.haversineKm(ctx.lat, ctx.lon, c.lat, c.lon) > r[2]) return;
        if (ctx.kind === 'area' && !inBBox(c, ctx.bbox)) return;
        add(c);
        seen.add(c.id);
        (c.altIds || []).forEach(function (id) { seen.add(id); });
      });
      Object.keys(state.profiles).forEach(function (id) {
        var p = state.profiles[id];
        if (seen.has(id) || p.lat == null || !p.name) return;
        if (ctx.kind === 'branch' && U.haversineKm(ctx.lat, ctx.lon, p.lat, p.lon) > r[2]) return;
        if (ctx.kind === 'area' && !inBBox(p, ctx.bbox)) return;
        add(profileAsCompany(p), p);
      });
    }
    state.results = list;
    renderResultMarkers();
    renderResults();
    renderProspects();
    updateCounts();
  }

  function filteredResults() {
    var ef = state.settings.entityFilter;
    var zf = state.zoneFilter;
    var q = normQ(state.resultQuery);
    var list = state.results.filter(function (c) {
      if (zf[c.zone] === false) return false;
      if (ef[c.entity] === false) return false;
      if (q && normQ([c.name, c.address, c.category, c.operator].join(' ')).indexOf(q) < 0) return false;
      return true;
    });
    var sort = $('resultSort').value;
    var zoneOrder = { red: 0, orange: 1, green: 2, out: 3 };
    list.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name, 'id');
      if (sort === 'entity') {
        var ea = U.ENTITIES.findIndex(function (e) { return e.id === a.entity; });
        var eb = U.ENTITIES.findIndex(function (e) { return e.id === b.entity; });
        if (ea !== eb) return ea - eb;
      }
      var da = a.dist == null ? Infinity : a.dist, db = b.dist == null ? Infinity : b.dist;
      return (zoneOrder[a.zone] - zoneOrder[b.zone]) || (da - db);
    });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Prospek (profil)
  // ---------------------------------------------------------------------------

  function prospectView(p) {
    var near = p.lat != null ? U.nearestBranch(p.lat, p.lon, visibleBranches()) : null;
    return {
      profile: p,
      nearest: near ? { id: near.branch.id, name: near.branch.name, dist: near.dist } : null,
      zone: p.lat == null ? null : (near ? U.zoneFor(near.dist, state.settings.radii) : 'out')
    };
  }

  function prospectViews() {
    return Object.keys(state.profiles).map(function (id) { return prospectView(state.profiles[id]); })
      .filter(function (v) { return v.profile.name; });
  }

  var pendingSaves = new Set();
  var flushSaves = debounce(function () {
    var ids = Array.from(pendingSaves);
    pendingSaves.clear();
    var all = ids.map(function (id) {
      var p = state.profiles[id];
      return p ? S.set('p:' + id, p) : Promise.resolve(true);
    });
    Promise.all(all).then(function (oks) {
      var ok = oks.every(Boolean);
      var el = $('saveState');
      el.textContent = ok ? 'Tersimpan' : 'Tidak tersimpan permanen';
      el.className = 'save-state' + (ok ? ' ok' : '');
      if (!ok) toast('Penyimpanan browser penuh atau diblokir. Unduh cadangan dari Pengaturan.', { error: true });
    });
  }, 450);

  function queueSave(p) {
    pendingSaves.add(p.id);
    $('saveState').textContent = 'Menyimpan…';
    $('saveState').className = 'save-state';
    flushSaves();
  }

  var persistAsked = false;
  function ensureProfile(item) {
    var p = state.profiles[item.id] || (item.profile && state.profiles[item.profile.id]);
    if (p) { item.profile = p; return p; }
    p = U.newProfile({
      id: item.id, name: item.name, entity: item.entity, lat: item.lat, lon: item.lon, address: item.address, city: item.city,
      phone: item.phone, email: item.email, website: item.website, category: item.category, osm: item.osm,
      operator: item.operator, tags: item.tags
    }, item.source === 'osm' ? 'osm' : item.source);
    state.profiles[p.id] = p;
    item.profile = p;
    var r = state.results.find(function (c) { return c.id === item.id; });
    if (r) r.profile = p;
    if (!persistAsked) { persistAsked = true; S.requestPersist(); }
    refreshAfterProfileChange();
    if (dossierItem === item) refreshDossierChrome();
    return p;
  }

  var refreshAfterProfileChange = debounce(function () {
    state.results.forEach(function (c) { c.profile = profileFor(c); });
    renderResultMarkers();
    renderResults();
    renderProspects();
    updateCounts();
    highlightSelected();
  }, 250);

  function touch(p) {
    p.updatedAt = Date.now();
    queueSave(p);
    refreshAfterProfileChange();
  }

  async function deleteProfile(id) {
    var p = state.profiles[id];
    if (!p) return;
    var ok = await confirmDialog('Hapus dari Prospek saya?', '"' + (p.name || 'Prospek tanpa nama') +
      '" beserta catatan, struktur organisasi, dan laporan keuangannya akan dihapus dari perangkat ini.');
    if (!ok) return;
    delete state.profiles[id];
    pendingSaves.delete(id);
    await S.del('p:' + id);
    closeDossier(true);
    computeResults();
    toast('Prospek dihapus.');
  }

  // ---------------------------------------------------------------------------
  // Daftar: cabang
  // ---------------------------------------------------------------------------

  function renderBranchTypeChips() {
    var counts = {};
    state.branches.forEach(function (b) { counts[b.type] = (counts[b.type] || 0) + 1; });
    var html = U.BRANCH_TYPES.filter(function (t) { return counts[t.id]; }).map(function (t) {
      var on = state.settings.branchTypes[t.id] !== false;
      return '<button type="button" class="chip" data-btype="' + t.id + '" aria-pressed="' + on + '" title="' + esc(t.long) + '">' +
        esc(t.label) + ' <b>' + U.formatCount(counts[t.id]) + '</b></button>';
    }).join('');
    $('branchTypeChips').innerHTML = html;
  }

  function renderBranchList() {
    var q = normQ(state.branchQuery);
    var origin = state.userLoc || (map ? { lat: map.getCenter().lat, lon: map.getCenter().lng } : null);
    var list = visibleBranches().filter(function (b) { return !q || b._hay.indexOf(q) >= 0; });
    list = list.map(function (b) {
      return { b: b, d: origin ? U.haversineKm(origin.lat, origin.lon, b.lat, b.lon) : null };
    });
    list.sort(function (a, c) { return (a.d == null ? 0 : a.d) - (c.d == null ? 0 : c.d); });

    var meta = '';
    var nOsm = state.settings.branchSource === 'import' ? 0 : state.branchesOsm.length;
    if (state.branchesLoading && !state.branches.length) meta = 'Memuat kantor BNI dari OpenStreetMap…';
    else if (!state.branches.length) {
      meta = state.branchesOsmError ? 'Data kantor belum termuat. ' + esc(state.branchesOsmError) + ' <button type="button" data-action="reload-branches">Coba lagi</button>'
        : 'Belum ada data kantor. Impor daftar kantor dari Excel.';
    } else {
      var parts = [U.formatCount(state.branches.length) + ' kantor BNI'];
      if (nOsm) parts.push('OpenStreetMap ' + U.relTime(state.branchesOsmT));
      if (state.branchesImport.length) parts.push(U.formatCount(state.branchesImport.length) + ' dari impor');
      meta = esc(parts.join(' · ')) + (state.settings.branchSource !== 'import' ? ' · <button type="button" data-action="reload-branches">Perbarui</button>' : '');
      meta += '<br>Diurutkan dari ' + (state.userLoc ? 'lokasi Anda' : 'tengah peta') + '.';
    }
    $('branchMeta').innerHTML = meta;

    var shown = list.slice(0, state.branchLimit);
    var html = shown.map(function (x) {
      var b = x.b;
      var active = state.activeBranch && state.activeBranch.id === b.id;
      var sub = [b.address, b.city].filter(Boolean).join(', ') || (b.source === 'import' ? 'Dari impor Excel' : 'Alamat belum tercatat di OSM');
      return '<li><button type="button" class="item' + (active ? ' selected' : '') + '" data-branch="' + esc(b.id) + '">' +
        '<span class="bt t-' + esc(b.type) + '">' + esc(b.type === 'Kantor' ? 'BNI' : b.type) + '</span>' +
        '<span class="item-main"><span class="item-title">' + esc(b.name) + '</span><span class="item-sub">' + esc(sub) + '</span></span>' +
        '<span class="item-side">' + (x.d != null ? '<b>' + U.formatKm(x.d) + '</b>' : '') + '</span></button></li>';
    }).join('');
    if (list.length > shown.length) {
      html += '<li><button type="button" class="btn more" data-action="more-branches">Tampilkan ' +
        U.formatCount(Math.min(60, list.length - shown.length)) + ' lagi (dari ' + U.formatCount(list.length) + ')</button></li>';
    }
    if (!list.length && state.branches.length) html = '<li class="empty"><strong>Tidak ada kantor yang cocok</strong><p>Coba kata kunci lain atau aktifkan jenis kantor lain.</p></li>';
    $('branchList').innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Daftar: hasil deteksi
  // ---------------------------------------------------------------------------

  function renderResults() {
    var ctx = state.resultsCtx;
    var b = state.activeBranch;
    var t = radiiText(state.settings.radii);
    var head = '';
    if (b) {
      var addr = [b.address, b.city].filter(Boolean).join(', ');
      head = '<strong>Sekitar ' + esc(b.name) + '</strong><span>' + esc(addr || 'Alamat kantor belum tercatat') +
        ' · radius ' + t.r3 + ' km · <a href="https://www.google.com/maps/search/?api=1&query=' + b.lat + ',' + b.lon +
        '" target="_blank" rel="noopener">Google Maps</a></span>';
    } else if (ctx && ctx.kind === 'area') {
      head = '<strong>Area peta saat ini</strong><span>Zona dihitung dari kantor BNI terdekat. Geser peta untuk area lain' +
        (state.settings.autoDetect ? '; deteksi berjalan otomatis pada zoom dekat.' : ', lalu tekan Deteksi.') + '</span>';
    } else {
      head = '<strong>Pilih kantor BNI</strong><span>Klik penanda kantor di peta atau cari di tab Cabang. PT, CV, dan badan usaha lain di sekitarnya terdeteksi otomatis.</span>';
    }
    $('detectContext').innerHTML = head;

    var hasCtx = !!ctx;
    // Hitungan zona (mengikuti filter badan usaha dan pencarian, tidak mengikuti filter zona)
    var ef = state.settings.entityFilter;
    var q = normQ(state.resultQuery);
    var base = state.results.filter(function (c) {
      return ef[c.entity] !== false && (!q || normQ([c.name, c.address, c.category, c.operator].join(' ')).indexOf(q) >= 0);
    });
    var zc = { red: 0, orange: 0, green: 0, out: 0 };
    base.forEach(function (c) { zc[c.zone]++; });
    if (hasCtx) {
      var labels = { red: '≤ ' + t.r1 + ' km', orange: t.r1 + '–' + t.r2 + ' km', green: t.r2 + '–' + t.r3 + ' km' };
      $('zoneTally').innerHTML = ['red', 'orange', 'green'].map(function (z) {
        return '<button type="button" class="z-' + z + '" data-zone="' + z + '" aria-pressed="' + (state.zoneFilter[z] !== false) + '">' +
          '<span class="n">' + U.formatCount(zc[z]) + '</span><span class="l">' + U.ZONE_LABEL[z] + ' · ' + labels[z] + '</span></button>';
      }).join('');
    } else {
      $('zoneTally').innerHTML = '';
    }

    // Chip badan usaha
    var ec = {};
    state.results.forEach(function (c) { ec[c.entity] = (ec[c.entity] || 0) + 1; });
    $('entityChips').innerHTML = hasCtx ? U.ENTITIES.filter(function (e) {
      return ec[e.id] || (e.id !== 'Lainnya' && e.id !== 'Firma' && e.id !== 'PD');
    }).map(function (e) {
      var on = state.settings.entityFilter[e.id] !== false;
      return '<button type="button" class="chip" data-ent="' + e.id + '" aria-pressed="' + on + '">' + esc(e.label) + ' <b>' + U.formatCount(ec[e.id] || 0) + '</b></button>';
    }).join('') : '';

    // Pemberitahuan
    var notice = '';
    if (state.resultsError && state.results.length) notice = 'Sebagian data gagal dimuat: ' + esc(state.resultsError) + ' <button type="button" data-action="retry-detect">Coba lagi</button>';
    else if (hasCtx && zc.out && state.zoneFilter.out !== false) notice = U.formatCount(zc.out) + ' usaha berada di luar ' + t.r3 + ' km dari kantor BNI mana pun (titik abu-abu). <button type="button" data-action="hide-out">Sembunyikan</button>';
    else if (hasCtx && zc.out && state.zoneFilter.out === false) notice = U.formatCount(zc.out) + ' usaha di luar zona disembunyikan. <button type="button" data-action="show-out">Tampilkan</button>';
    var hiddenEnt = state.results.filter(function (c) { return ef[c.entity] === false; }).length;
    if (!notice && hiddenEnt) notice = U.formatCount(hiddenEnt) + ' hasil disembunyikan oleh filter badan usaha (mis. PT Tbk dan BUMN yang biasanya di atas target plafond).';
    $('detectNotice').innerHTML = notice;
    $('detectNotice').hidden = !notice;

    var list = filteredResults();
    var shown = list.slice(0, state.resultLimit);
    var html = shown.map(resultItemHTML).join('');
    if (list.length > shown.length) {
      html += '<li><button type="button" class="btn more" data-action="more-results">Tampilkan lebih banyak (' +
        U.formatCount(list.length - shown.length) + ' lagi)</button></li>';
    }
    $('resultList').innerHTML = html;

    var empty = '';
    if (state.resultsLoading && !list.length) {
      empty = '<strong>Mendeteksi…</strong><p>Mengambil data badan usaha dari OpenStreetMap. Area yang pernah dibuka tersimpan dan tampil instan.</p>';
    } else if (!hasCtx) {
      empty = '<strong>Belum ada deteksi</strong><p>Pilih kantor BNI, atau perbesar peta ke suatu area lalu tekan "Deteksi PT/CV di area ini".</p>' +
        '<button type="button" class="btn" data-action="goto-cabang">Cari kantor BNI</button>';
    } else if (state.resultsError && !state.results.length) {
      empty = '<strong>Data gagal dimuat</strong><p>' + esc(state.resultsError) + '</p><button type="button" class="btn primary" data-action="retry-detect">Coba lagi</button>';
    } else if (!state.results.length) {
      empty = '<strong>Belum ada PT/CV tercatat di sini</strong><p>OpenStreetMap belum mencatat badan usaha berlabel PT/CV di area ini. Tambahkan prospek sendiri, impor daftar dari Excel, atau sertakan usaha tanpa label.</p>' +
        '<div class="btn-row" style="justify-content:center">' +
        (state.settings.includeOthers ? '' : '<button type="button" class="btn" data-action="include-others">Sertakan pabrik, gudang, dll.</button>') +
        '<button type="button" class="btn" data-action="add-prospect">Tambah prospek</button></div>';
    } else if (!list.length) {
      empty = '<strong>Semua hasil tersaring</strong><p>Ubah filter zona, badan usaha, atau kata kunci.</p>';
    }
    $('resultEmpty').innerHTML = empty;
    $('resultEmpty').hidden = !empty;
    $('btnExportResults').disabled = !list.length;
    $('btnRefreshDetect').disabled = !hasCtx || state.resultsLoading;
  }

  function resultItemHTML(c) {
    var p = c.profile;
    var tags = '<span class="tag ent">' + esc(U.ENTITY_LABEL[c.entity] || c.entity) + '</span>';
    if (p) tags += '<span class="tag status s-' + esc(p.status) + '">' + esc(U.STATUS_LABEL[p.status] || '') + '</span>';
    if (p && p.plafond != null) tags += '<span class="tag">' + esc(U.formatRpShort(p.plafond)) + '</span>';
    if (c.source === 'import') tags += '<span class="tag">Impor</span>';
    else if (c.source === 'manual') tags += '<span class="tag">Manual</span>';
    var sub = [c.category && c.category !== 'Lainnya' ? c.category : '', c.address || c.city].filter(Boolean).join(' · ');
    var side = '<b>' + U.formatKm(c.dist) + '</b>';
    if (state.activeBranch && c.nearest && c.nearest.id !== state.activeBranch.id && c.nearest.dist + 0.05 < c.dist) {
      side += '<span title="Lebih dekat ke ' + esc(c.nearest.name) + '">lebih dekat ke kantor lain</span>';
    }
    return '<li><button type="button" class="item' + (state.selectedId === c.id ? ' selected' : '') + '" data-id="' + esc(c.id) + '">' +
      '<span class="zdot ' + c.zone + (p ? ' saved' : '') + '"></span>' +
      '<span class="item-main"><span class="item-title">' + esc(c.name) + '</span>' +
      (sub ? '<span class="item-sub">' + esc(sub) + '</span>' : '') +
      '<span class="item-tags">' + tags + '</span></span>' +
      '<span class="item-side">' + side + '</span></button></li>';
  }

  // ---------------------------------------------------------------------------
  // Daftar: prospek saya
  // ---------------------------------------------------------------------------

  function todayISO() { return U.isoDate(new Date()); }

  function renderProspects() {
    var views = prospectViews();
    var s = state.settings;
    var active = views.filter(function (v) { return v.profile.status !== 'ditolak' && v.profile.status !== 'disetujui'; });
    var pipeline = active.reduce(function (sum, v) { return sum + (v.profile.plafond || 0); }, 0);
    var inT = views.filter(function (v) { return U.inTarget(v.profile.plafond, s) === true && v.profile.status !== 'ditolak'; }).length;
    var tMin = U.formatRpShort(s.targetMin).replace('Rp ', ''), tMax = U.formatRpShort(s.targetMax).replace('Rp ', '');
    $('pipelineSummary').innerHTML =
      '<div><b>' + U.formatCount(active.length) + '</b><span>Prospek aktif</span></div>' +
      '<div><b title="' + esc(U.formatRupiah(pipeline)) + '">' + esc(pipeline ? U.formatRpShort(pipeline) : 'Rp 0') + '</b><span>Plafond pipeline</span></div>' +
      '<div><b>' + U.formatCount(inT) + '</b><span>Target ' + esc(tMin + '–' + tMax) + '</span></div>';

    var sc = {};
    views.forEach(function (v) { sc[v.profile.status] = (sc[v.profile.status] || 0) + 1; });
    $('statusChips').innerHTML = views.length ? ['all'].concat(U.STATUSES.map(function (x) { return x.id; })).filter(function (id) {
      return id === 'all' || sc[id];
    }).map(function (id) {
      var label = id === 'all' ? 'Semua' : U.STATUS_LABEL[id];
      var n = id === 'all' ? views.length : sc[id];
      return '<button type="button" class="chip" data-status="' + id + '" aria-pressed="' + (state.statusFilter === id) + '">' + esc(label) + ' <b>' + U.formatCount(n) + '</b></button>';
    }).join('') : '';

    var q = normQ(state.prospectQuery);
    var list = views.filter(function (v) {
      var p = v.profile;
      if (state.statusFilter !== 'all' && p.status !== state.statusFilter) return false;
      if (q && normQ([p.name, p.address, p.city, p.bidang, p.pic, p.catatan].join(' ')).indexOf(q) < 0) return false;
      return true;
    });
    var sort = $('prospectSort').value;
    list.sort(function (a, b) {
      var pa = a.profile, pb = b.profile;
      if (sort === 'name') return pa.name.localeCompare(pb.name, 'id');
      if (sort === 'plafond') return (pb.plafond || 0) - (pa.plafond || 0);
      if (sort === 'followup') return (pa.followUp || '9999') < (pb.followUp || '9999') ? -1 : (pa.followUp || '9999') > (pb.followUp || '9999') ? 1 : 0;
      return (pb.updatedAt || 0) - (pa.updatedAt || 0);
    });
    var today = todayISO();
    var shown = list.slice(0, state.prospectLimit);
    var html = shown.map(function (v) {
      var p = v.profile;
      var tags = '<span class="tag ent">' + esc(U.ENTITY_LABEL[p.entity] || p.entity) + '</span>' +
        '<span class="tag status s-' + esc(p.status) + '">' + esc(U.STATUS_LABEL[p.status] || '') + '</span>';
      var target = U.inTarget(p.plafond, s);
      if (p.plafond != null) tags += '<span class="tag ' + (target ? 'target' : 'offtarget') + '">' + esc(U.formatRpShort(p.plafond)) + '</span>';
      var open = p.status !== 'ditolak' && p.status !== 'disetujui';
      if (p.followUp) tags += '<span class="tag' + (open && p.followUp < today ? ' late' : '') + '">' + (open && p.followUp < today ? 'Lewat ' : 'Follow-up ') + esc(U.formatDate(p.followUp)) + '</span>';
      if (p.lat == null) tags += '<span class="tag warn">Belum ada lokasi</span>';
      else if (p.geo === 'approx') tags += '<span class="tag warn">Lokasi perkiraan</span>';
      var sub = v.nearest ? U.formatKm(v.nearest.dist) + ' dari ' + v.nearest.name : (p.address || p.city || '');
      return '<li><button type="button" class="item' + (state.selectedId === p.id ? ' selected' : '') + '" data-id="' + esc(p.id) + '">' +
        '<span class="zdot ' + (v.zone || 'out') + ' saved"></span>' +
        '<span class="item-main"><span class="item-title">' + esc(p.name) + '</span>' +
        (sub ? '<span class="item-sub">' + esc(sub) + '</span>' : '') +
        '<span class="item-tags">' + tags + '</span></span></button></li>';
    }).join('');
    if (list.length > shown.length) {
      html += '<li><button type="button" class="btn more" data-action="more-prospects">Tampilkan lebih banyak (' + U.formatCount(list.length - shown.length) + ' lagi)</button></li>';
    }
    $('prospectList').innerHTML = html;
    var empty = '';
    if (!views.length) {
      empty = '<strong>Prospek saya masih kosong</strong><p>Buka perusahaan hasil deteksi lalu isi status atau catatan, tambahkan prospek di peta, atau impor daftar dari Excel.</p>' +
        '<div class="btn-row" style="justify-content:center"><button type="button" class="btn" data-action="add-prospect">Tambah di peta</button>' +
        '<button type="button" class="btn" data-action="open-import">Impor Excel</button></div>';
    } else if (!list.length) {
      empty = '<strong>Tidak ada yang cocok</strong><p>Ubah filter status atau kata kunci.</p>';
    }
    $('prospectEmpty').innerHTML = empty;
    $('prospectEmpty').hidden = !empty;
    $('btnExportProspects').disabled = !views.length;
  }

  function updateCounts() {
    $('countBranches').textContent = U.formatCount(visibleBranches().length);
    $('countResults').textContent = U.formatCount(state.resultsCtx ? filteredResults().length : 0);
    $('countProspects').textContent = U.formatCount(prospectViews().length);
  }

  // ---------------------------------------------------------------------------
  // Panel detail prospek
  // ---------------------------------------------------------------------------

  var dossierItem = null;

  function findItem(id) {
    var r = state.results.find(function (c) { return c.id === id || (c.altIds && c.altIds.indexOf(id) >= 0); });
    if (r) return r;
    var p = state.profiles[id];
    if (!p) return null;
    var v = prospectView(p);
    var item = profileAsCompany(p);
    item.profile = p;
    item.nearest = v.nearest;
    item.dist = v.nearest ? v.nearest.dist : null;
    item.refName = v.nearest ? v.nearest.name : '';
    item.zone = v.zone || 'out';
    return item;
  }

  function openDossier(id, opts) {
    opts = opts || {};
    var item = findItem(id);
    if (!item) return;
    if (state.pick) cancelPick();
    state.selectedId = item.id;
    dossierItem = item;
    if (item.profile && item.profile.keuangan) {
      item.profile.keuangan.sort(function (a, b) { return (b.tahun || 0) - (a.tahun || 0); });
    }
    renderDossier();
    $('dossier').hidden = false;
    $('app').classList.add('dossier-open');
    $('saveState').textContent = item.profile ? 'Tersimpan di perangkat ini' : '';
    $('saveState').className = 'save-state';
    highlightSelected();
    if (item.lat != null && opts.pan !== false) ensureVisible(item.lat, item.lon, opts.zoom);
    if (opts.focusName) {
      var n = $('dossierBody').querySelector('[data-f="name"]');
      if (n) n.focus();
    } else {
      $('dossierBody').scrollTop = 0;
    }
  }

  function closeDossier(skipCleanup) {
    flushSaves.flush();
    var item = dossierItem;
    dossierItem = null;
    $('dossier').hidden = true;
    $('app').classList.remove('dossier-open');
    state.selectedId = null;
    highlightSelected();
    if (!skipCleanup && item && item.profile && item.profile.source === 'manual' && !U.normSpace(item.profile.name)) {
      var id = item.profile.id;
      delete state.profiles[id];
      S.del('p:' + id);
      computeResults();
    }
  }

  function opt(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function moneyValue(n) { return n == null ? '' : new Intl.NumberFormat('id-ID').format(n); }

  function moneyHint(n, isPlafond) {
    if (n == null) return '';
    var s = U.formatRpShort(n);
    if (isPlafond) {
      var t = U.inTarget(n, state.settings);
      var range = U.formatRpShort(state.settings.targetMin).replace('Rp ', '') + '–' + U.formatRpShort(state.settings.targetMax).replace('Rp ', '');
      s += t ? ' · sesuai target ' + range : ' · di luar target ' + range;
    }
    return s;
  }

  function refBranchFor(item) {
    if (state.activeBranch) return state.activeBranch;
    if (item.nearest) return state.branchById.get(item.nearest.id) || null;
    return null;
  }

  function linkBtn(href, icon, label, extra) {
    return '<a class="btn" href="' + esc(href) + '" target="_blank" rel="noopener"' + (extra || '') + '><svg class="i"><use href="#i-' + icon + '"/></svg>' + esc(label) + '</a>';
  }

  function renderDossier() {
    var item = dossierItem;
    if (!item) return;
    var p = item.profile;
    var editableBase = item.source !== 'osm';
    var html = [];
    var name = p ? p.name : item.name;
    var entity = p ? p.entity : item.entity;

    // Kepala
    html.push('<div class="d-head">');
    if (editableBase && p) {
      html.push('<label class="field"><span>Nama perusahaan</span><input type="text" class="d-title-input" data-f="name" value="' + esc(p.name) +
        '" placeholder="mis. PT Maju Jaya Abadi" autocomplete="off"></label>');
    } else {
      html.push('<h2 class="d-title">' + esc(name) + '</h2>');
    }
    var tags = '';
    if (editableBase && p) {
      tags += '<select data-f="entity" aria-label="Badan usaha" style="width:auto">' + U.ENTITIES.map(function (e) { return opt(e.id, e.label, e.id === p.entity); }).join('') + '</select>';
    } else {
      tags += '<span class="tag ent">' + esc(U.ENTITY_LABEL[entity] || entity) + '</span>';
    }
    if (item.lat != null) {
      var ref = state.activeBranch && item.refName === state.activeBranch.name ? state.activeBranch.name : (item.refName || '');
      tags += '<span class="zone-pill ' + item.zone + '">' + (item.zone === 'out' ? 'Luar zona' : 'Zona ' + U.ZONE_LABEL[item.zone].toLowerCase()) +
        (item.dist != null ? ' · ' + esc(U.formatKm(item.dist)) + (ref ? ' dari ' + esc(ref) : '') : '') + '</span>';
    }
    tags += '<span class="tag">' + (item.source === 'osm' ? 'OpenStreetMap' : item.source === 'import' ? 'Impor Excel' : 'Input manual') + '</span>';
    html.push('<div class="d-tags">' + tags + '</div>');
    html.push('</div>');

    // Fakta
    var facts = [];
    if (item.category && item.category !== 'Lainnya') facts.push(['Kategori', esc(item.category)]);
    if (item.viaOperator && item.operator) facts.push(['Pengelola', esc(item.operator)]);
    else if (item.operator && item.operator !== item.name) facts.push(['Operator', esc(item.operator)]);
    if (!editableBase) {
      facts.push(['Alamat', item.address ? esc(item.address) : '<span class="hint">Belum tercatat di OpenStreetMap</span>']);
      if (item.phone) facts.push(['Telepon', '<a href="tel:' + esc(item.phone.replace(/[^\d+]/g, '')) + '">' + esc(item.phone) + '</a>']);
      if (item.email) facts.push(['Email', '<a href="mailto:' + esc(item.email) + '">' + esc(item.email) + '</a>']);
      var web = U.safeUrl(item.website);
      if (web) facts.push(['Situs web', '<a href="' + esc(web) + '" target="_blank" rel="noopener">' + esc(item.website) + '</a>']);
    }
    if (item.nearest) {
      facts.push(['Kantor BNI terdekat', esc(item.nearest.name) + ' · ' + esc(U.formatKm(item.nearest.dist))]);
    }
    if (item.lat != null) {
      var coord = item.lat.toFixed(6) + ', ' + item.lon.toFixed(6);
      facts.push(['Koordinat', '<span style="font-variant-numeric:tabular-nums">' + coord + '</span> <button type="button" class="btn icon small" data-copy="' + coord + '" title="Salin koordinat" aria-label="Salin koordinat"><svg class="i"><use href="#i-copy"/></svg></button>']);
    }
    if (facts.length) {
      html.push('<dl class="facts">' + facts.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd>'; }).join('') + '</dl>');
    }

    if (editableBase && p) {
      html.push('<div class="grid2">' +
        '<label class="field" style="grid-column:1/-1"><span>Alamat</span><input type="text" data-f="address" value="' + esc(p.address || '') + '" placeholder="Jalan, nomor, kelurahan"></label>' +
        '<label class="field"><span>Kota / kabupaten</span><input type="text" data-f="city" value="' + esc(p.city || '') + '"></label>' +
        '<label class="field"><span>Telepon kantor</span><input type="tel" data-f="phone" value="' + esc(p.phone || '') + '"></label>' +
        '<label class="field"><span>Email</span><input type="email" data-f="email" value="' + esc(p.email || '') + '"></label>' +
        '<label class="field"><span>Situs web</span><input type="url" data-f="website" value="' + esc(p.website || '') + '"></label>' +
        '</div>');
      if (p.lat == null) html.push('<p class="d-note warn">Prospek ini belum punya lokasi sehingga tidak tampil di peta dan zonanya belum diketahui.</p>');
      else if (p.geo === 'approx') html.push('<p class="d-note warn">Lokasi diperkirakan dari alamat dan mungkin kurang tepat. Pindahkan titik bila perlu.</p>');
      html.push('<div class="btn-row"><button type="button" class="btn small" data-action="move-point"><svg class="i"><use href="#i-move"/></svg>' +
        (p.lat == null ? 'Tentukan lokasi di peta' : 'Pindahkan titik') + '</button></div>');
    }

    // Tautan riset
    var links = [];
    var refB = refBranchFor(item);
    if (item.lat != null) {
      if (refB) links.push(linkBtn('https://www.google.com/maps/dir/?api=1&origin=' + refB.lat + ',' + refB.lon + '&destination=' + item.lat + ',' + item.lon + '&travelmode=driving', 'route', 'Rute dari kantor'));
      links.push(linkBtn('https://www.google.com/maps/search/' + encodeURIComponent(name) + '/@' + item.lat + ',' + item.lon + ',17z', 'pin', 'Google Maps'));
      links.push(linkBtn('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + item.lat + ',' + item.lon, 'eye', 'Street View'));
    }
    links.push(linkBtn('https://www.google.com/search?q=' + encodeURIComponent('"' + name + '"' + (item.city ? ' ' + item.city : '')), 'search', 'Google'));
    var isPT = entity === 'PT' || entity === 'Tbk' || entity === 'BUMN';
    links.push(linkBtn(isPT ? 'https://ahu.go.id/pencarian/profil-pt' : 'https://ahu.go.id/', 'external', 'AHU Online', ' data-copy="' + esc(name) + '" data-copy-msg="Nama disalin. Tempel di kolom pencarian AHU."'));
    links.push(linkBtn('https://www.linkedin.com/search/results/companies/?keywords=' + encodeURIComponent(name), 'external', 'LinkedIn'));
    if (entity === 'Tbk') links.push(linkBtn('https://www.idx.co.id/id/perusahaan-tercatat/laporan-keuangan-dan-tahunan', 'external', 'Lapkeu di IDX'));
    if (item.osm) links.push(linkBtn('https://www.openstreetmap.org/' + item.osm, 'external', 'OpenStreetMap'));
    links.push('<button type="button" class="btn" data-copy="' + esc(name) + '"><svg class="i"><use href="#i-copy"/></svg>Salin nama</button>');
    html.push('<div class="links">' + links.join('') + '</div>');

    // Pipeline
    var pp = p || {};
    html.push('<section class="d-section"><h3>Pipeline kredit</h3>' + (p ? '' : '<p class="d-note" id="unsavedHint">Belum disimpan. Isian apa pun otomatis menyimpan perusahaan ini ke Prospek saya.</p>'));
    html.push('<div class="grid2">' +
      '<label class="field"><span>Status</span><select data-f="status">' + U.STATUSES.map(function (s) { return opt(s.id, s.label, s.id === (pp.status || 'baru')); }).join('') + '</select></label>' +
      '<label class="field"><span>Estimasi plafond</span><input type="text" inputmode="decimal" data-f="plafond" data-money="plafond" value="' + esc(moneyValue(pp.plafond)) + '" placeholder="mis. 2,5 M atau 750 jt"><span class="money-hint" data-hint="plafond">' + esc(moneyHint(pp.plafond, true)) + '</span></label>' +
      '<label class="field"><span>Produk</span><select data-f="produk">' + opt('', '–', !pp.produk) + U.PRODUK.map(function (x) { return opt(x, x, x === pp.produk); }).join('') + '</select></label>' +
      '<label class="field"><span>Follow-up</span><input type="date" data-f="followUp" value="' + esc(pp.followUp || '') + '"></label>' +
      '<label class="field"><span>Bidang usaha</span><input type="text" data-f="bidang" value="' + esc(pp.bidang || '') + '" placeholder="mis. distributor semen"></label>' +
      '<label class="field"><span>Tahun berdiri</span><input type="text" inputmode="numeric" data-f="tahunBerdiri" value="' + esc(pp.tahunBerdiri || '') + '"></label>' +
      '</div>');
    html.push('<label class="field"><span>PIC & kontak</span><input type="text" data-f="pic" value="' + esc(pp.pic || '') + '" placeholder="Nama, jabatan, nomor HP"></label>');
    html.push('<label class="check"><input type="checkbox" data-f="isNasabah"' + (pp.isNasabah ? ' checked' : '') + '><span>Sudah nasabah BNI</span></label>');
    html.push('<label class="field"><span>Catatan</span><textarea data-f="catatan" placeholder="Hasil kunjungan, kebutuhan kredit, agunan, kompetitor…">' + esc(pp.catatan || '') + '</textarea></label>');
    html.push('</section>');

    // Struktur organisasi
    html.push('<section class="d-section"><h3>Struktur organisasi</h3>');
    html.push('<div id="orgChart">' + orgChartHTML(pp.pengurus, entity) + '</div>');
    html.push('<div class="rows" id="personRows">' + (pp.pengurus || []).map(personRowHTML).join('') + '</div>');
    html.push('<div class="btn-row"><button type="button" class="btn small" data-action="add-person"><svg class="i"><use href="#i-plus"/></svg>Tambah pengurus / pemegang saham</button></div>');
    html.push('<label class="field"><span>Sumber data pengurus & keuangan</span><input type="text" data-f="sumberData" value="' + esc(pp.sumberData || '') + '" placeholder="mis. akta pendirian, profil AHU, dokumen nasabah"></label>');
    html.push('<p class="d-note">Data pengurus perusahaan tertutup tidak tersedia gratis. Ambil dari akta, profil AHU Online, atau dokumen calon debitur.</p>');
    html.push('</section>');

    // Laporan keuangan
    html.push('<section class="d-section"><h3>Laporan keuangan <small>dalam rupiah</small></h3>');
    html.push('<div class="rows" id="finCards">' + (pp.keuangan || []).map(function (f, i) { return finCardHTML(pp.keuangan, i); }).join('') + '</div>');
    html.push('<div class="btn-row"><button type="button" class="btn small" data-action="add-year"><svg class="i"><use href="#i-plus"/></svg>Tambah tahun</button></div>');
    html.push('<p class="d-note">Isi dari laporan keuangan yang diserahkan calon debitur. Rasio dihitung otomatis; ekuitas dihitung dari aset − liabilitas bila kosong.</p>');
    html.push('</section>');

    // Data mentah OSM
    if (item.tags && Object.keys(item.tags).length) {
      var keys = Object.keys(item.tags).sort();
      html.push('<details><summary>Data mentah OpenStreetMap (' + keys.length + ' tag)</summary><div class="table-wrap"><table class="tagtable">' +
        keys.map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + esc(item.tags[k]) + '</td></tr>'; }).join('') + '</table></div></details>');
    }

    html.push('<div id="dossierFoot">' + dossierFootHTML(p) + '</div>');
    $('dossierBody').innerHTML = html.join('');
  }

  function dossierFootHTML(p) {
    if (p) {
      return '<div class="btn-row" style="justify-content:space-between;align-items:center"><span class="hint">Tersimpan di perangkat ini · diubah ' +
        esc(U.relTime(p.updatedAt)) + '</span><button type="button" class="btn small danger" data-action="delete-prospect">' +
        '<svg class="i"><use href="#i-trash"/></svg>Hapus dari Prospek saya</button></div>';
    }
    return '<div class="btn-row"><button type="button" class="btn primary" data-action="save-prospect"><svg class="i"><use href="#i-check"/></svg>Simpan ke Prospek saya</button></div>';
  }

  // Setelah profil baru tercipta dari isian pertama, perbarui bagian panel tanpa merender ulang isian yang sedang diketik.
  function refreshDossierChrome() {
    if (!dossierItem) return;
    var hint = $('unsavedHint');
    if (hint) hint.remove();
    var foot = $('dossierFoot');
    if (foot) foot.innerHTML = dossierFootHTML(dossierItem.profile);
  }

  function personRowHTML(o, i) {
    return '<div class="person-row" data-p-idx="' + i + '">' +
      '<input type="text" data-p-f="nama" value="' + esc(o.nama || '') + '" placeholder="Nama" aria-label="Nama">' +
      '<select data-p-f="jabatan" aria-label="Jabatan">' + U.JABATAN.map(function (j) { return opt(j, j, j === o.jabatan); }).join('') + '</select>' +
      '<input type="text" inputmode="decimal" data-p-f="saham" value="' + esc(o.saham == null ? '' : String(o.saham).replace('.', ',')) + '" placeholder="% saham" aria-label="Persen saham">' +
      '<button type="button" class="btn icon" data-action="del-person" data-idx="' + i + '" aria-label="Hapus baris"><svg class="i"><use href="#i-trash"/></svg></button>' +
      '</div>';
  }

  function orgChartHTML(pengurus, entity) {
    var levels = U.orgLevels(pengurus, entity);
    if (!levels.length) return '<p class="d-note">Belum ada data pengurus. Tambahkan direksi, komisaris, pemegang saham, atau pemilik di bawah.</p>';
    return '<div class="org">' + levels.map(function (l, idx) {
      return (idx ? '<div class="org-link"></div>' : '') + '<div class="org-level"><h4>' + esc(l.title) + '</h4><div class="org-nodes">' +
        l.members.map(function (m) {
          var detail = l.id === 'saham' ? (m.saham != null ? String(m.saham).replace('.', ',') + '%' : 'porsi belum diisi') : m.jabatan;
          var bar = l.id === 'saham' && m.saham ? '<i class="share" style="width:' + Math.min(100, Math.max(0, m.saham)) + '%"></i>' : '';
          return '<div class="org-node"><b>' + esc(m.nama) + '</b><small>' + esc(detail) + '</small>' + bar + '</div>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  var FIN_FIELDS = [
    ['penjualan', 'Penjualan / omzet'], ['laba', 'Laba bersih'], ['aset', 'Total aset'], ['liabilitas', 'Total liabilitas'], ['ekuitas', 'Ekuitas']
  ];

  function finCardHTML(rows, i) {
    var f = rows[i];
    return '<div class="fin-card" data-k-idx="' + i + '">' +
      '<div class="fin-card-head"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>Tahun</span>' +
      '<input type="text" inputmode="numeric" data-k-f="tahun" value="' + esc(f.tahun || '') + '" placeholder="2025" aria-label="Tahun laporan"></label>' +
      '<span class="spacer"></span><button type="button" class="btn icon small" data-action="del-year" data-idx="' + i + '" aria-label="Hapus tahun ini"><svg class="i"><use href="#i-trash"/></svg></button></div>' +
      '<div class="fin-grid">' + FIN_FIELDS.map(function (ff) {
        return '<label class="field"><span>' + ff[1] + '</span><input type="text" inputmode="decimal" data-k-f="' + ff[0] + '" data-money="k" value="' +
          esc(moneyValue(f[ff[0]])) + '" placeholder="Rp"><span class="money-hint" data-khint="' + i + '-' + ff[0] + '">' + esc(moneyHint(f[ff[0]])) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="ratios" id="ratios-' + i + '">' + ratiosHTML(rows, i) + '</div></div>';
  }

  function ratiosHTML(rows, i) {
    var r = U.ratiosFor(rows, i);
    var der = r.der == null ? '–' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(r.der) + '×';
    return '<div class="ratio"><span>Margin laba</span><b>' + U.formatPct(r.npm) + '</b></div>' +
      '<div class="ratio"><span>ROA</span><b>' + U.formatPct(r.roa) + '</b></div>' +
      '<div class="ratio"><span>DER</span><b>' + der + '</b></div>' +
      '<div class="ratio"><span>Tumbuh omzet</span><b>' + U.formatPct(r.growth) + '</b></div>';
  }

  function refreshOrg() {
    var p = dossierItem && dossierItem.profile;
    if (!p) return;
    $('orgChart').innerHTML = orgChartHTML(p.pengurus, p.entity);
  }

  function refreshRatios() {
    var p = dossierItem && dossierItem.profile;
    if (!p) return;
    p.keuangan.forEach(function (f, i) {
      var el = $('ratios-' + i);
      if (el) el.innerHTML = ratiosHTML(p.keuangan, i);
    });
  }

  function onDossierInput(e) {
    var el = e.target;
    if (!dossierItem) return;
    var f = el.getAttribute('data-f');
    var pf = el.getAttribute('data-p-f');
    var kf = el.getAttribute('data-k-f');
    if (!f && !pf && !kf) return;
    var p = ensureProfile(dossierItem);
    if (f) {
      var v;
      if (el.type === 'checkbox') v = el.checked;
      else if (f === 'plafond') {
        v = U.parseNumberID(el.value);
        if (v != null) v = U.parseMoneyCell(el.value, 1, true);
        var hint = $('dossierBody').querySelector('[data-hint="plafond"]');
        if (hint) hint.textContent = el.value.trim() && v == null ? 'Format tidak dikenali' : moneyHint(v, true);
      } else v = el.value;
      p[f] = v;
      if (f === 'entity') p.entityManual = true;
      if (f === 'name' && !p.entityManual) {
        var det = U.detectEntity(v);
        if (det && det !== p.entity) {
          p.entity = det;
          var sel = $('dossierBody').querySelector('[data-f="entity"]');
          if (sel) sel.value = det;
          refreshOrg();
        }
      }
      if (f === 'name' || f === 'entity') {
        dossierItem.name = p.name;
        dossierItem.entity = p.entity;
        if (f === 'entity') refreshOrg();
      }
    } else if (pf) {
      var row = el.closest('[data-p-idx]');
      var idx = +row.getAttribute('data-p-idx');
      var o = p.pengurus[idx];
      if (!o) return;
      if (pf === 'saham') o.saham = U.parsePercent(el.value);
      else o[pf] = el.value;
      refreshOrg();
    } else if (kf) {
      var card = el.closest('[data-k-idx]');
      var ki = +card.getAttribute('data-k-idx');
      var fr = p.keuangan[ki];
      if (!fr) return;
      if (kf === 'tahun') fr.tahun = U.parseYear(el.value);
      else {
        fr[kf] = U.parseNumberID(el.value);
        var h = $('dossierBody').querySelector('[data-khint="' + ki + '-' + kf + '"]');
        if (h) h.textContent = el.value.trim() && fr[kf] == null ? 'Format tidak dikenali' : moneyHint(fr[kf]);
      }
      refreshRatios();
    }
    touch(p);
  }

  function onDossierBlur(e) {
    var el = e.target;
    if (!el.hasAttribute || !el.hasAttribute('data-money') || !dossierItem || !dossierItem.profile) return;
    var p = dossierItem.profile;
    var n;
    if (el.getAttribute('data-f') === 'plafond') n = p.plafond;
    else {
      var card = el.closest('[data-k-idx]');
      var fr = card && p.keuangan[+card.getAttribute('data-k-idx')];
      n = fr ? fr[el.getAttribute('data-k-f')] : null;
    }
    if (n != null) el.value = moneyValue(n);
  }

  async function onDossierClick(e) {
    var btn = e.target.closest('button, a');
    if (!btn || !dossierItem) return;
    if (btn.hasAttribute('data-copy')) {
      var text = btn.getAttribute('data-copy');
      var ok = await copyText(text);
      var msg = btn.getAttribute('data-copy-msg');
      if (ok) toast(msg || 'Disalin: ' + text);
      else if (btn.tagName !== 'A') toast('Tidak bisa menyalin otomatis. Teks: ' + text);
      return;
    }
    var action = btn.getAttribute('data-action');
    if (!action) return;
    var p;
    switch (action) {
      case 'save-prospect':
        ensureProfile(dossierItem);
        touch(dossierItem.profile);
        renderDossier();
        toast('Disimpan ke Prospek saya.');
        break;
      case 'delete-prospect':
        deleteProfile(dossierItem.profile.id);
        break;
      case 'add-person':
        p = ensureProfile(dossierItem);
        p.pengurus.push({ nama: '', jabatan: p.entity === 'CV' ? 'Sekutu Aktif' : (p.entity === 'UD' || p.entity === 'PD' ? 'Pemilik' : 'Direktur Utama'), saham: null });
        touch(p);
        $('personRows').insertAdjacentHTML('beforeend', personRowHTML(p.pengurus[p.pengurus.length - 1], p.pengurus.length - 1));
        var inputs = $('personRows').querySelectorAll('[data-p-f="nama"]');
        if (inputs.length) inputs[inputs.length - 1].focus();
        break;
      case 'del-person':
        p = dossierItem.profile;
        if (!p) return;
        p.pengurus.splice(+btn.getAttribute('data-idx'), 1);
        touch(p);
        $('personRows').innerHTML = p.pengurus.map(personRowHTML).join('');
        refreshOrg();
        break;
      case 'add-year':
        p = ensureProfile(dossierItem);
        var years = p.keuangan.map(function (f) { return f.tahun || 0; });
        var next = years.length ? Math.max.apply(null, years) + 1 : new Date().getFullYear() - 1;
        if (next > new Date().getFullYear()) next = Math.min.apply(null, years.filter(Boolean).concat([new Date().getFullYear()])) - 1;
        p.keuangan.unshift({ tahun: next, penjualan: null, laba: null, aset: null, liabilitas: null, ekuitas: null });
        touch(p);
        $('finCards').innerHTML = p.keuangan.map(function (f, i) { return finCardHTML(p.keuangan, i); }).join('');
        break;
      case 'del-year':
        p = dossierItem.profile;
        if (!p) return;
        p.keuangan.splice(+btn.getAttribute('data-idx'), 1);
        touch(p);
        $('finCards').innerHTML = p.keuangan.map(function (f, i) { return finCardHTML(p.keuangan, i); }).join('');
        break;
      case 'move-point':
        p = dossierItem.profile;
        if (p) startPick('move', p.id);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Menambah / memindahkan titik prospek
  // ---------------------------------------------------------------------------

  function startPick(kind, id) {
    state.pick = { kind: kind, id: id || null };
    var p = id ? state.profiles[id] : null;
    $('pickText').textContent = kind === 'new' ? 'Ketuk lokasi prospek baru di peta' : 'Ketuk lokasi baru untuk ' + (p && p.name ? p.name : 'prospek ini');
    $('pickBanner').hidden = false;
    $('mapwrap').classList.add('picking');
    if (isMobile()) {
      $('dossier').hidden = true;
      setSheet('peek');
    }
  }

  function cancelPick() {
    var pick = state.pick;
    state.pick = null;
    $('pickBanner').hidden = true;
    $('mapwrap').classList.remove('picking');
    if (pick && pick.kind === 'move' && isMobile() && dossierItem) $('dossier').hidden = false;
  }

  function onMapClick(e) {
    if (!state.pick) return;
    var pick = state.pick;
    cancelPick();
    var lat = U.round6(e.latlng.lat), lon = U.round6(e.latlng.lng);
    if (pick.kind === 'new') {
      var p = U.newProfile({ name: '', entity: 'PT', lat: lat, lon: lon, geo: 'exact' }, 'manual');
      state.profiles[p.id] = p;
      computeResults();
      openDossier(p.id, { focusName: true, pan: false });
    } else {
      var q = state.profiles[pick.id];
      if (!q) return;
      q.lat = lat;
      q.lon = lon;
      q.geo = 'exact';
      touch(q);
      computeResults();
      openDossier(q.id, { pan: false });
      toast('Lokasi prospek diperbarui.');
    }
  }

  // ---------------------------------------------------------------------------
  // Tab & lembar bawah (ponsel)
  // ---------------------------------------------------------------------------

  function setTab(tab) {
    state.tab = tab;
    ['cabang', 'deteksi', 'prospek'].forEach(function (t) {
      $('tab-' + t).hidden = t !== tab;
      $('tabbtn-' + t).setAttribute('aria-selected', String(t === tab));
    });
    if (tab === 'cabang') renderBranchList();
    if (tab === 'prospek') renderProspects();
  }

  function setSheet(s) {
    var app = $('app');
    if (app.dataset.sheet === s) return;
    app.dataset.sheet = s;
    setTimeout(function () { if (map) map.invalidateSize(); }, 60);
    setTimeout(function () { if (map) map.invalidateSize(); }, 320);
  }

  // ---------------------------------------------------------------------------
  // Lokasi saya
  // ---------------------------------------------------------------------------

  function locateMe() {
    if (!navigator.geolocation) { toast('Browser ini tidak mendukung lokasi.', { error: true }); return; }
    showStatus('Mencari lokasi Anda…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      hideStatus();
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      state.userLoc = { lat: lat, lon: lon };
      layers.me.clearLayers();
      L.circle([lat, lon], { radius: Math.min(pos.coords.accuracy || 0, 2000), color: '#2563eb', weight: 1, fillOpacity: .08, interactive: false }).addTo(layers.me);
      L.marker([lat, lon], { icon: L.divIcon({ className: 'me-dot', iconSize: [16, 16], html: '<span></span>' }), interactive: false, keyboard: false }).addTo(layers.me);
      map.setView([lat, lon], Math.max(map.getZoom(), 14));
      var near = U.nearestBranch(lat, lon, visibleBranches());
      if (state.tab === 'cabang') renderBranchList();
      if (near) {
        toast('Kantor BNI terdekat: ' + near.branch.name + ' (' + U.formatKm(near.dist) + ')', {
          action: { label: 'Pilih', fn: function () { selectBranch(near.branch); } }
        });
      }
    }, function (err) {
      hideStatus();
      toast(err.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini.' : 'Lokasi tidak ditemukan. Coba lagi di tempat terbuka.', { error: true });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  // ---------------------------------------------------------------------------
  // Dialog pengaturan
  // ---------------------------------------------------------------------------

  function openSettings() {
    var s = state.settings;
    $('setR1').value = s.radii[0];
    $('setR2').value = s.radii[1];
    $('setR3').value = s.radii[2];
    $('setTMin').value = s.targetMin / 1e9;
    $('setTMax').value = s.targetMax / 1e9;
    $('setOthers').checked = !!s.includeOthers;
    $('setAuto').checked = !!s.autoDetect;
    $('setBranchSource').value = s.branchSource;
    $('setTheme').value = s.theme;
    $('setOverpass').innerHTML = opt('auto', 'Otomatis (pindah bila sibuk)', s.overpass === 'auto') +
      O.ENDPOINTS.map(function (e) { return opt(e.url, e.label, s.overpass === e.url); }).join('');
    var info = [];
    if (state.branchesOsm.length) info.push(U.formatCount(state.branchesOsm.length) + ' kantor dari OpenStreetMap, diperbarui ' + U.relTime(state.branchesOsmT));
    if (state.branchesImport.length) info.push(U.formatCount(state.branchesImport.length) + ' kantor dari impor Excel');
    $('setBranchInfo').textContent = info.join(' · ') || 'Belum ada data kantor.';
    S.isPersistent().then(function (ok) {
      $('setStorageInfo').textContent = ok
        ? 'Prospek, catatan, dan cache peta tersimpan hanya di browser ini (' + U.formatCount(prospectViews().length) + ' prospek). Unduh cadangan secara berkala.'
        : 'Browser ini tidak mengizinkan penyimpanan permanen; data hilang saat halaman ditutup. Unduh cadangan sebelum menutup.';
    });
    $('setError').hidden = true;
    $('dlgSettings').showModal();
  }

  function onSettingsSubmit(e) {
    var submitter = e.submitter;
    if (!submitter || submitter.value !== 'save') return;
    var r = [parseFloat($('setR1').value), parseFloat($('setR2').value), parseFloat($('setR3').value)];
    var err = U.validateRadii(r);
    var tMin = parseFloat($('setTMin').value), tMax = parseFloat($('setTMax').value);
    if (!err && !(tMin >= 0 && tMax > tMin)) err = 'Target maksimal harus lebih besar dari minimal.';
    if (err) {
      e.preventDefault();
      $('setError').textContent = err;
      $('setError').hidden = false;
      return;
    }
    var s = state.settings;
    var radiiChanged = r.join() !== s.radii.join();
    var othersChanged = $('setOthers').checked !== s.includeOthers;
    var sourceChanged = $('setBranchSource').value !== s.branchSource;
    var themeChanged = $('setTheme').value !== s.theme;
    s.radii = r;
    s.targetMin = Math.round(tMin * 1e9);
    s.targetMax = Math.round(tMax * 1e9);
    s.includeOthers = $('setOthers').checked;
    s.autoDetect = $('setAuto').checked;
    s.branchSource = $('setBranchSource').value;
    s.overpass = $('setOverpass').value;
    s.theme = $('setTheme').value;
    S.set('settings', s);
    if (themeChanged) { applyTheme(); onThemeChanged(); }
    applyRadiiLabels();
    updateActiveChip();
    if (sourceChanged) {
      if (s.branchSource !== 'import' && !state.branchesOsm.length) loadOsmBranches(false);
      else rebuildBranches();
    }
    drawZones();
    if (state.resultsCtx && (othersChanged || (radiiChanged && state.activeBranch))) runDetection({});
    else computeResults();
    if (dossierItem) renderDossier();
    toast('Pengaturan disimpan.');
  }

  // Rapikan profil dari cadangan/penyimpanan agar tipe datanya aman dipakai.
  function sanitizeProfile(p) {
    function num(v) { return v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v; }
    p.name = typeof p.name === 'string' ? p.name : String(p.name || '');
    p.lat = num(p.lat);
    p.lon = num(p.lon);
    if (p.lat == null || p.lon == null) { p.lat = null; p.lon = null; }
    p.plafond = num(p.plafond);
    p.status = U.STATUS_LABEL[p.status] ? p.status : 'baru';
    p.entity = U.ENTITY_LABEL[p.entity] ? p.entity : (U.detectEntity(p.name) || 'Lainnya');
    p.pengurus = Array.isArray(p.pengurus) ? p.pengurus.filter(Boolean).map(function (o) {
      return { nama: String(o.nama || ''), jabatan: U.JABATAN.indexOf(o.jabatan) >= 0 ? o.jabatan : 'Lainnya', saham: num(o.saham) };
    }) : [];
    p.keuangan = Array.isArray(p.keuangan) ? p.keuangan.filter(Boolean).map(function (f) {
      var row = { tahun: num(f.tahun) };
      U.FIN_KEYS.forEach(function (k) { row[k] = num(f[k]); });
      return row;
    }) : [];
    return p;
  }

  function backupData() {
    var data = {
      app: 'peta-prospek-kredit', version: 1, exportedAt: new Date().toISOString(),
      settings: state.settings,
      profiles: Object.keys(state.profiles).map(function (id) { return state.profiles[id]; }),
      branchesImport: state.branchesImport
    };
    X.downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'cadangan-prospek-' + U.isoDate(new Date()) + '.json');
  }

  async function restoreData(file) {
    var data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      toast('File cadangan tidak bisa dibaca.', { error: true });
      return;
    }
    if (!data || data.app !== 'peta-prospek-kredit' || !Array.isArray(data.profiles)) {
      toast('Ini bukan file cadangan Peta Prospek Kredit.', { error: true });
      return;
    }
    var added = 0, updated = 0;
    for (var i = 0; i < data.profiles.length; i++) {
      var p = data.profiles[i];
      if (!p || !p.id) continue;
      var cur = state.profiles[p.id];
      if (cur && (cur.updatedAt || 0) >= (p.updatedAt || 0)) continue;
      if (cur) updated++; else added++;
      sanitizeProfile(p);
      state.profiles[p.id] = p;
      await S.set('p:' + p.id, p);
    }
    var restoredBranches = Array.isArray(data.branchesImport) ? data.branchesImport.filter(function (b) {
      return b && b.id && typeof b.name === 'string' && isFinite(b.lat) && isFinite(b.lon);
    }) : [];
    if (restoredBranches.length && !state.branchesImport.length) {
      state.branchesImport = restoredBranches;
      await S.set('branches:import', state.branchesImport);
    }
    if (data.settings) {
      var keepView = state.settings.view;
      state.settings = U.mergeSettings(data.settings);
      state.settings.view = keepView;
      await S.set('settings', state.settings);
      applyTheme();
      applyRadiiLabels();
    }
    $('dlgSettings').close();
    rebuildBranches();
    computeResults();
    toast('Cadangan dipulihkan: ' + added + ' prospek baru, ' + updated + ' diperbarui.');
  }

  // ---------------------------------------------------------------------------
  // Dialog impor
  // ---------------------------------------------------------------------------

  var importState = null;

  function importKind() {
    var el = document.querySelector('input[name="impKind"]:checked');
    return el ? el.value : 'prospek';
  }

  function resetImport() {
    if (importState && importState.ctrl) importState.ctrl.abort();
    importState = null;
    $('fileImport').value = '';
    $('impPreview').hidden = true;
    $('impPreview').innerHTML = '';
    $('impGeoWrap').hidden = true;
    $('impProgress').hidden = true;
    $('impError').hidden = true;
    $('btnImpRun').disabled = true;
    $('btnImpRun').textContent = 'Impor';
    $('impHint').textContent = importKind() === 'prospek'
      ? 'Kolom wajib hanya "Nama Perusahaan". Lokasi diambil dari Latitude/Longitude, kolom Koordinat (tempel dari Google Maps), atau Alamat + Kota. Pengurus dan laporan keuangan bisa ikut diimpor; lihat template.'
      : 'Isi daftar resmi kantor BNI (nama, jenis KC/KCP/KK, alamat, koordinat). Daftar ini menggantikan impor kantor sebelumnya dan, bila berimpit, menggantikan data OpenStreetMap.';
  }

  function openImport() {
    resetImport();
    $('dlgImport').showModal();
  }

  async function onImportFile() {
    var file = $('fileImport').files[0];
    if (!file) return;
    var kind = importKind();
    $('impError').hidden = true;
    $('impPreview').hidden = false;
    $('impPreview').innerHTML = '<span class="hint">Membaca ' + esc(file.name) + '…</span>';
    try {
      var res = kind === 'prospek' ? await X.parseProspectFile(file) : await X.parseBranchFile(file);
      if (res.error) throw new Error(res.error);
      importState = { kind: kind, res: res, file: file.name };
      var noCoord = res.records.filter(function (r) { return r.lat == null; });
      var canGeocode = noCoord.filter(function (r) { return r.address || r.city; }).length;
      var stats = '<span class="tag">' + U.formatCount(res.records.length) + (kind === 'prospek' ? ' prospek' : ' kantor') + '</span>' +
        '<span class="tag">' + U.formatCount(res.records.length - noCoord.length) + ' berkoordinat</span>' +
        (noCoord.length ? '<span class="tag warn">' + U.formatCount(noCoord.length) + ' tanpa koordinat</span>' : '') +
        (res.skipped.length ? '<span class="tag">' + U.formatCount(res.skipped.length) + ' baris dilewati</span>' : '');
      var cols = 'Lembar "' + esc(res.sheetName) + '"' +
        (res.peopleSheet ? ' + "' + esc(res.peopleSheet) + '"' : '') + (res.financeSheet ? ' + "' + esc(res.financeSheet) + '"' : '') +
        ' · kolom dikenali: ' + esc(res.mappedFields.length) +
        (res.unknownHeaders.length ? ' · diabaikan: ' + esc(res.unknownHeaders.slice(0, 8).join(', ')) + (res.unknownHeaders.length > 8 ? ', …' : '') : '');
      var rows = res.records.slice(0, 5).map(function (r) {
        var loc = r.lat != null ? r.lat.toFixed(4) + ', ' + r.lon.toFixed(4) : (r.address || r.city ? 'dari alamat' : '–');
        var extra = kind === 'prospek' ? (r.plafond != null ? U.formatRpShort(r.plafond) : '') + (r.status ? ' · ' + U.STATUS_LABEL[r.status] : '') : r.type;
        return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.city || '') + '</td><td>' + esc(loc) + '</td><td>' + esc(extra || '') + '</td></tr>';
      }).join('');
      $('impPreview').innerHTML = '<div class="stats">' + stats + '</div><div class="cols">' + cols + '</div>' +
        (rows ? '<div class="table-wrap"><table class="mini-table"><thead><tr><th>Nama</th><th>Kota</th><th>Lokasi</th><th>' + (kind === 'prospek' ? 'Plafond / status' : 'Jenis') +
          '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '');
      importState.geocodeCount = canGeocode;
      $('impGeoWrap').hidden = !canGeocode;
      $('impGeoText').textContent = 'Cari koordinat dari alamat untuk ' + U.formatCount(canGeocode) + ' baris (±' +
        Math.max(1, Math.ceil(canGeocode * 1.2 / 60)) + ' menit, lewat OpenStreetMap Nominatim). Hasilnya ditandai "lokasi perkiraan" bila kurang tepat.';
      $('btnImpRun').disabled = !res.records.length;
      $('btnImpRun').textContent = 'Impor ' + U.formatCount(res.records.length) + (kind === 'prospek' ? ' prospek' : ' kantor');
    } catch (e) {
      importState = null;
      $('impPreview').hidden = true;
      $('impError').textContent = e.message;
      $('impError').hidden = false;
      $('btnImpRun').disabled = true;
    }
  }

  async function geocodeRecords(records, ctrl) {
    var todo = records.filter(function (r) { return r.lat == null && (r.address || r.city); });
    var found = 0;
    $('impProgress').hidden = false;
    for (var i = 0; i < todo.length; i++) {
      if (ctrl.signal.aborted) break;
      var r = todo[i];
      $('impProgressText').textContent = 'Mencari koordinat ' + (i + 1) + '/' + todo.length + ': ' + r.name;
      $('impBar').style.width = Math.round(i / todo.length * 100) + '%';
      var queries = [];
      if (r.address) queries.push([r.address, r.city].filter(Boolean).join(', '));
      queries.push([r.name.replace(/^(pt|cv|ud|pd)\.?\s+/i, ''), r.city].filter(Boolean).join(', '));
      for (var q = 0; q < queries.length; q++) {
        try {
          var g = await O.geocode(queries[q], { signal: ctrl.signal });
          if (g) {
            r.lat = g.lat;
            r.lon = g.lon;
            r.geo = q === 0 && g.precision === 'street' ? 'street' : 'approx';
            found++;
            break;
          }
        } catch (e) {
          if (e.name === 'AbortError') return found;
          if (i === 0) throw e;
        }
      }
    }
    $('impBar').style.width = '100%';
    return found;
  }

  async function runImport() {
    if (!importState) return;
    var st = importState;
    var ctrl = new AbortController();
    st.ctrl = ctrl;
    $('btnImpRun').disabled = true;
    $('impError').hidden = true;
    var records = st.res.records;
    var geocoded = 0;
    try {
      if ($('impGeocode').checked && !$('impGeoWrap').hidden) geocoded = await geocodeRecords(records, ctrl);
    } catch (e) {
      $('impError').textContent = e.message + ' Impor dilanjutkan tanpa pencarian alamat.';
      $('impError').hidden = false;
    }
    if (ctrl.signal.aborted) return;
    $('impProgressText').textContent = 'Menyimpan…';
    if (st.kind === 'prospek') {
      var added = 0, updated = 0;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var p = U.matchProfile(state.profiles, rec);
        if (p) updated++;
        else {
          var src = rec.id && /^osm:/.test(rec.id) ? 'osm' : 'import';
          p = U.newProfile({ id: rec.id || undefined, name: rec.name, entity: rec.entity, lat: rec.lat, lon: rec.lon, geo: rec.geo }, src);
          state.profiles[p.id] = p;
          added++;
        }
        U.applyRecord(p, rec);
        await S.set('p:' + p.id, p);
      }
      S.requestPersist();
      $('dlgImport').close();
      computeResults();
      setTab('prospek');
      var noLoc = records.filter(function (r) { return r.lat == null; }).length;
      toast('Impor selesai: ' + added + ' prospek baru, ' + updated + ' diperbarui' + (geocoded ? ', ' + geocoded + ' lokasi dari alamat' : '') +
        (noLoc ? '. ' + noLoc + ' belum punya lokasi.' : '.'), { ms: 7000 });
    } else {
      var list = records.filter(function (r) { return r.lat != null; }).map(function (r, idx) {
        return {
          id: 'imp:b:' + (r.kode ? U.normKey(r.kode) : idx + '-' + U.normKey(r.name).slice(0, 24)),
          source: 'import', name: r.name, type: r.type, kode: r.kode, lat: r.lat, lon: r.lon,
          address: r.address, city: r.city, phone: r.phone, hours: ''
        };
      });
      var seen = {};
      list = list.filter(function (b) { if (seen[b.id]) return false; seen[b.id] = true; return true; });
      state.branchesImport = list;
      await S.set('branches:import', list);
      $('dlgImport').close();
      rebuildBranches();
      setTab('cabang');
      var skipped = records.length - list.length;
      toast(U.formatCount(list.length) + ' kantor diimpor' + (skipped ? '; ' + skipped + ' dilewati karena tanpa koordinat.' : '.'), { ms: 7000 });
    }
  }

  // ---------------------------------------------------------------------------
  // Ekspor
  // ---------------------------------------------------------------------------

  async function exportResults() {
    var list = filteredResults();
    if (!list.length) return;
    try {
      await X.exportResults(list, { label: state.resultsCtx ? state.resultsCtx.label : 'Hasil deteksi' }, state.settings);
    } catch (e) {
      toast(e.message, { error: true });
    }
  }

  async function exportProspects() {
    var views = prospectViews();
    if (!views.length) return;
    try {
      await X.exportProspects(views, state.settings);
    } catch (e) {
      toast(e.message, { error: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Event
  // ---------------------------------------------------------------------------

  function onListClick(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var bid = btn.getAttribute('data-branch');
    var action = btn.getAttribute('data-action');
    if (id) {
      openDossier(id, { zoom: map.getZoom() < 13 ? 15 : null });
      return;
    }
    if (bid) {
      var b = state.branchById.get(bid);
      if (b) selectBranch(b);
      return;
    }
    if (btn.hasAttribute('data-btype')) {
      var t = btn.getAttribute('data-btype');
      state.settings.branchTypes[t] = state.settings.branchTypes[t] === false;
      visibleCache = null;
      saveSettingsSoon();
      renderBranchMarkers();
      renderBranchTypeChips();
      renderBranchList();
      drawZones();
      if (state.resultsCtx) computeResults();
      updateCounts();
      return;
    }
    if (btn.hasAttribute('data-zone')) {
      var z = btn.getAttribute('data-zone');
      state.zoneFilter[z] = state.zoneFilter[z] === false;
      renderResultMarkers();
      renderResults();
      updateCounts();
      return;
    }
    if (btn.hasAttribute('data-ent')) {
      var en = btn.getAttribute('data-ent');
      state.settings.entityFilter[en] = state.settings.entityFilter[en] === false;
      saveSettingsSoon();
      renderResultMarkers();
      renderResults();
      updateCounts();
      return;
    }
    if (btn.hasAttribute('data-status')) {
      state.statusFilter = btn.getAttribute('data-status');
      renderProspects();
      return;
    }
    switch (action) {
      case 'more-branches': state.branchLimit += 60; renderBranchList(); break;
      case 'more-results': state.resultLimit += 150; renderResults(); break;
      case 'more-prospects': state.prospectLimit += 150; renderProspects(); break;
      case 'reload-branches': loadOsmBranches(true); break;
      case 'retry-detect': runDetection({ manual: true }); break;
      case 'hide-out': state.zoneFilter.out = false; renderResultMarkers(); renderResults(); updateCounts(); break;
      case 'show-out': state.zoneFilter.out = true; renderResultMarkers(); renderResults(); updateCounts(); break;
      case 'goto-cabang': setTab('cabang'); $('branchSearch').focus(); break;
      case 'include-others':
        state.settings.includeOthers = true;
        S.set('settings', state.settings);
        runDetection({});
        break;
      case 'add-prospect': startPick('new'); break;
      case 'open-import': openImport(); break;
    }
  }

  function bindEvents() {
    document.querySelector('.tabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (!t) return;
      setTab(t.getAttribute('data-tab'));
      if (isMobile() && $('app').dataset.sheet === 'peek') setSheet('half');
    });
    $('sheetHandle').addEventListener('click', function () {
      var s = $('app').dataset.sheet;
      setSheet(s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek');
    });
    $('panel').addEventListener('click', onListClick);

    $('branchSearch').addEventListener('input', debounce(function (e) {
      state.branchQuery = e.target.value;
      state.branchLimit = 60;
      renderBranchList();
    }, 150));
    $('resultSearch').addEventListener('input', debounce(function (e) {
      state.resultQuery = e.target.value;
      state.resultLimit = 150;
      renderResultMarkers();
      renderResults();
      updateCounts();
    }, 150));
    $('prospectSearch').addEventListener('input', debounce(function (e) {
      state.prospectQuery = e.target.value;
      renderProspects();
    }, 150));
    $('resultSort').addEventListener('change', renderResults);
    $('prospectSort').addEventListener('change', renderProspects);
    $('btnRefreshDetect').addEventListener('click', function () { runDetection({ force: true, manual: true }); });
    $('btnExportResults').addEventListener('click', exportResults);
    $('btnExportProspects').addEventListener('click', exportProspects);
    $('btnAddProspect').addEventListener('click', function () { startPick('new'); });
    $('btnAddProspect2').addEventListener('click', function () { startPick('new'); });
    $('btnPickCancel').addEventListener('click', cancelPick);
    $('btnDetectArea').addEventListener('click', function () { runDetection({ manual: true }); });
    $('btnClearBranch').addEventListener('click', clearBranch);
    $('btnLocate').addEventListener('click', locateMe);
    $('btnImport').addEventListener('click', openImport);
    $('btnSettings').addEventListener('click', openSettings);
    $('btnHelp').addEventListener('click', function () { $('dlgHelp').showModal(); });

    $('btnDossierClose').addEventListener('click', function () { closeDossier(); });
    $('dossierBody').addEventListener('input', onDossierInput);
    $('dossierBody').addEventListener('change', function (e) {
      if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'date') onDossierInput(e);
      if (e.target.getAttribute('data-f') === 'name') computeResults();
    });
    $('dossierBody').addEventListener('focusout', onDossierBlur);
    $('dossierBody').addEventListener('click', onDossierClick);

    $('formSettings').addEventListener('submit', onSettingsSubmit);
    $('btnRefreshBranches').addEventListener('click', function () { $('dlgSettings').close(); loadOsmBranches(true); });
    $('btnBackup').addEventListener('click', backupData);
    $('fileRestore').addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (f) restoreData(f);
    });
    $('btnClearCache').addEventListener('click', async function () {
      await O.clearCells();
      toast('Cache deteksi dihapus. Data akan diunduh ulang saat dibutuhkan.');
    });
    $('btnClearAll').addEventListener('click', async function () {
      $('dlgSettings').close();
      var ok = await confirmDialog('Hapus semua data?', 'Semua prospek, catatan, pengurus, laporan keuangan, kantor impor, pengaturan, dan cache di perangkat ini akan dihapus. Unduh cadangan dulu bila masih diperlukan.', 'Hapus semua');
      if (!ok) return;
      await S.deletePrefix('');
      location.reload();
    });

    document.querySelectorAll('input[name="impKind"]').forEach(function (r) { r.addEventListener('change', resetImport); });
    $('fileImport').addEventListener('change', onImportFile);
    $('btnTemplate').addEventListener('click', function () {
      (importKind() === 'prospek' ? X.downloadProspectTemplate() : X.downloadBranchTemplate()).catch(function (e) { toast(e.message, { error: true }); });
    });
    $('btnImpRun').addEventListener('click', runImport);
    $('dlgImport').addEventListener('close', function () {
      if (importState && importState.ctrl) importState.ctrl.abort();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      if (state.pick) cancelPick();
      else if (!$('dossier').hidden) closeDossier();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { flushSaves.flush(); saveSettingsSoon.flush(); }
    });
    window.addEventListener('pagehide', function () { flushSaves.flush(); saveSettingsSoon.flush(); });

    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { if (state.settings.theme === 'auto') onThemeChanged(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    var mqMobile = window.matchMedia('(max-width: 760px)');
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', function () { setTimeout(function () { map.invalidateSize(); }, 50); });
  }

  // ---------------------------------------------------------------------------
  // Mulai
  // ---------------------------------------------------------------------------

  async function init() {
    var saved = await S.get('settings');
    state.settings = U.mergeSettings(saved);
    applyTheme();
    if (isMobile()) $('app').dataset.sheet = 'peek';
    initMap();
    applyRadiiLabels();
    bindEvents();
    updateDetectButton();

    var profiles = await S.getAllPrefix('p:');
    profiles.forEach(function (p) {
      if (!p || !p.id) return;
      state.profiles[p.id] = sanitizeProfile(p);
    });
    state.branchesImport = (await S.get('branches:import')) || [];
    var cached = await S.get('branches:osm');
    if (cached && cached.items) { state.branchesOsm = cached.items; state.branchesOsmT = cached.t; }
    rebuildBranches();
    renderResults();
    renderProspects();

    var last = state.settings.lastBranchId && state.branchById.get(state.settings.lastBranchId);
    if (last) selectBranch(last, { fly: !state.settings.view });
    else if (state.settings.autoDetect && map.getZoom() >= 13) runDetection({ auto: true });

    var stale = !cached || !cached.items || !cached.items.length || Date.now() - cached.t > O.BRANCH_TTL;
    if (state.settings.branchSource !== 'import' && stale) {
      await loadOsmBranches(false);
      if (!state.activeBranch && state.settings.lastBranchId) {
        var b = state.branchById.get(state.settings.lastBranchId);
        if (b) selectBranch(b, { fly: !state.settings.view });
      }
    }

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* opsional */ });
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    init().catch(function (e) {
      console.error(e);
      showStatus('Aplikasi gagal dimulai: ' + e.message, 'err');
    });
  });

  // Untuk pengujian otomatis.
  window.__PP_STATE__ = state;
})();
