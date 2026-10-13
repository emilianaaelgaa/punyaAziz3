/*
 * Peta Prospek Kredit — fungsi murni (tanpa DOM, tanpa jaringan).
 * Dipakai oleh aplikasi di browser dan oleh tes di Node.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.PP = root.PP || {}; root.PP.util = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstanta domain
  // ---------------------------------------------------------------------------

  var ZONE_IDS = ['red', 'orange', 'green'];
  var ZONE_LABEL = { red: 'Merah', orange: 'Oranye', green: 'Hijau', out: 'Luar zona' };

  var ENTITIES = [
    { id: 'PT', label: 'PT' },
    { id: 'CV', label: 'CV' },
    { id: 'UD', label: 'UD' },
    { id: 'PD', label: 'PD' },
    { id: 'Firma', label: 'Firma' },
    { id: 'Koperasi', label: 'Koperasi' },
    { id: 'Tbk', label: 'PT Tbk' },
    { id: 'BUMN', label: 'BUMN/Persero' },
    { id: 'Lainnya', label: 'Usaha lain' }
  ];
  var ENTITY_LABEL = {};
  ENTITIES.forEach(function (e) { ENTITY_LABEL[e.id] = e.label; });

  var STATUSES = [
    { id: 'baru', label: 'Prospek baru' },
    { id: 'dihubungi', label: 'Sudah dihubungi' },
    { id: 'kunjungan', label: 'Kunjungan / survei' },
    { id: 'pengajuan', label: 'Proses pengajuan' },
    { id: 'disetujui', label: 'Disetujui / cair' },
    { id: 'ditolak', label: 'Ditolak / tidak minat' }
  ];
  var STATUS_LABEL = {};
  STATUSES.forEach(function (s) { STATUS_LABEL[s.id] = s.label; });

  var BRANCH_TYPES = [
    { id: 'KC', label: 'KC', long: 'Kantor Cabang' },
    { id: 'KCP', label: 'KCP', long: 'Kantor Cabang Pembantu' },
    { id: 'KK', label: 'KK', long: 'Kantor Kas' },
    { id: 'Kanwil', label: 'Kanwil', long: 'Kantor Wilayah' },
    { id: 'Kantor', label: 'Lainnya', long: 'Kantor BNI (jenis belum tercatat)' }
  ];

  var JABATAN = ['Direktur Utama', 'Direktur', 'Komisaris Utama', 'Komisaris', 'Pemegang Saham',
    'Sekutu Aktif', 'Sekutu Pasif', 'Pemilik', 'Manajer / PIC', 'Lainnya'];

  var PRODUK = ['KMK (modal kerja)', 'KI (investasi)', 'KMK + KI', 'Lainnya'];

  var DEFAULT_SETTINGS = {
    radii: [1, 5, 10],
    maxRadius: 20,
    targetMin: 1e9,
    targetMax: 25e9,
    includeOthers: false,
    autoDetect: true,
    branchSource: 'both',
    overpass: 'auto',
    theme: 'auto',
    baseLayer: 'osm',
    entityFilter: { PT: true, CV: true, UD: true, PD: true, Firma: true, Koperasi: true, Tbk: false, BUMN: false, Lainnya: true },
    branchTypes: { KC: true, KCP: true, KK: true, Kanwil: true, Kantor: true },
    view: null,
    lastBranchId: null
  };

  var INDONESIA_BBOX = [-11.5, 94.5, 6.5, 141.5];

  // ---------------------------------------------------------------------------
  // Teks
  // ---------------------------------------------------------------------------

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function normSpace(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function normKey(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFKD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  // Nama inti perusahaan tanpa label badan usaha, untuk mencocokkan duplikat.
  function coreName(name) {
    var s = ' ' + String(name || '').toLowerCase().replace(/[.,()'"`\-–—/&]/g, ' ') + ' ';
    var prev;
    do {
      prev = s;
      s = s.replace(/\s(p\s?t|c\s?v|u\s?d|p\s?d|tbk|persero|firma|fa)\s/g, ' ');
    } while (s !== prev);
    return normKey(s);
  }

  function companyKey(entity, name) {
    var core = coreName(name);
    return core ? (entity || '') + ':' + core : '';
  }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  function uniq(arr) {
    var seen = {};
    return arr.filter(function (x) {
      var k = String(x).toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Geografi
  // ---------------------------------------------------------------------------

  var EARTH_R = 6371.0088;
  var KM_PER_DEG_LAT = 111.19; // sedikit di bawah nilai sebenarnya: aman sebagai batas bawah

  function haversineKm(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r;
    var dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function zoneFor(distKm, radii) {
    if (distKm == null || !isFinite(distKm)) return 'out';
    if (distKm <= radii[0]) return 'red';
    if (distKm <= radii[1]) return 'orange';
    if (distKm <= radii[2]) return 'green';
    return 'out';
  }

  function nearestBranch(lat, lon, branches) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < branches.length; i++) {
      var b = branches[i];
      if (best && Math.abs(b.lat - lat) * KM_PER_DEG_LAT > bestD) continue;
      var d = haversineKm(lat, lon, b.lat, b.lon);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best ? { branch: best, dist: bestD } : null;
  }

  function bboxAround(lat, lon, km) {
    var dLat = km / 110.57;
    var dLon = km / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
  }

  // Grid deteksi 0,1° (±11 km). Kunci sel: "i_j" = floor(lat*10)_floor(lon*10).
  function cellIndex(v) { return Math.floor(v * 10 + 1e-9); }
  function cellKey(lat, lon) { return cellIndex(lat) + '_' + cellIndex(lon); }
  function cellBounds(key) {
    var p = key.split('_');
    var i = +p[0], j = +p[1];
    return [i / 10, j / 10, (i + 1) / 10, (j + 1) / 10];
  }
  function cellsForBBox(b) {
    var keys = [];
    var i0 = cellIndex(b[0]), i1 = cellIndex(b[2]);
    var j0 = cellIndex(b[1]), j1 = cellIndex(b[3]);
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) keys.push(i + '_' + j);
    return keys;
  }

  // Kelompokkan sel yang perlu diambil menjadi sesedikit mungkin permintaan Overpass:
  // satu persegi bila muat (≤ maxCells sel), selain itu blok size×size.
  function groupCells(keys, size, maxCells) {
    size = size || 3;
    maxCells = maxCells || 16;
    if (!keys.length) return [];
    var bi0 = Infinity, bi1 = -Infinity, bj0 = Infinity, bj1 = -Infinity;
    keys.forEach(function (k) {
      var p = k.split('_');
      bi0 = Math.min(bi0, +p[0]); bi1 = Math.max(bi1, +p[0]);
      bj0 = Math.min(bj0, +p[1]); bj1 = Math.max(bj1, +p[1]);
    });
    if ((bi1 - bi0 + 1) * (bj1 - bj0 + 1) <= maxCells) {
      var all = [];
      for (var ii = bi0; ii <= bi1; ii++) for (var jj = bj0; jj <= bj1; jj++) all.push(ii + '_' + jj);
      return [{ keys: all, bbox: [bi0 / 10, bj0 / 10, (bi1 + 1) / 10, (bj1 + 1) / 10] }];
    }
    var blocks = {};
    keys.forEach(function (k) {
      var p = k.split('_');
      var i = +p[0], j = +p[1];
      var bk = Math.floor(i / size) + '_' + Math.floor(j / size);
      var g = blocks[bk] || (blocks[bk] = { i0: i, i1: i, j0: j, j1: j });
      g.i0 = Math.min(g.i0, i); g.i1 = Math.max(g.i1, i);
      g.j0 = Math.min(g.j0, j); g.j1 = Math.max(g.j1, j);
    });
    return Object.keys(blocks).map(function (bk) {
      var g = blocks[bk], cells = [];
      for (var i = g.i0; i <= g.i1; i++) for (var j = g.j0; j <= g.j1; j++) cells.push(i + '_' + j);
      return { keys: cells, bbox: [g.i0 / 10, g.j0 / 10, (g.i1 + 1) / 10, (g.j1 + 1) / 10] };
    });
  }

  function inIndonesia(lat, lon) {
    return lat >= INDONESIA_BBOX[0] && lat <= INDONESIA_BBOX[2] && lon >= INDONESIA_BBOX[1] && lon <= INDONESIA_BBOX[3];
  }

  // ---------------------------------------------------------------------------
  // Deteksi badan usaha dari nama
  // ---------------------------------------------------------------------------

  var ENTITY_RULES = [
    ['Tbk', /(^|[\s,.(])tbk(?:\.|(?=$|[\s,)]))/i],
    ['BUMN', /\(\s*persero\s*\)|(^|\s)persero(?=$|[\s,.)])/i],
    ['PT', /(^|[\s,(])p\.?\s?t(?:\.|(?=$|[\s,)]))/i],
    ['CV', /(^|[\s,(])c\.?\s?v(?:\.|(?=$|[\s,)]))/i],
    ['UD', /(^|[\s,(])u\.?\s?d(?:\.|(?=$|[\s,)]))/i],
    ['PD', /^p\.?\s?d(?:\.|(?=\s))/i],
    ['Firma', /^(firma|fa\.)\s/i],
    ['Koperasi', /(^|\s)(koperasi|kopkar|kopontren|ksp|ksu|kud)(?=$|[\s.,])/i]
  ];

  function detectEntity(name) {
    if (!name) return null;
    for (var i = 0; i < ENTITY_RULES.length; i++) {
      if (ENTITY_RULES[i][1].test(name)) return ENTITY_RULES[i][0];
    }
    return null;
  }

  // Entitas dari isian kolom "badan usaha" pada Excel.
  function normEntity(text, name) {
    var t = String(text || '').toLowerCase();
    if (t) {
      if (/tbk|terbuka/.test(t)) return 'Tbk';
      if (/persero|bumn|bumd/.test(t)) return 'BUMN';
      if (/^\s*p\.?\s?t\b|perseroan terbatas/.test(t)) return 'PT';
      if (/^\s*c\.?\s?v\b|komanditer/.test(t)) return 'CV';
      if (/^\s*u\.?\s?d\b|usaha dagang/.test(t)) return 'UD';
      if (/^\s*p\.?\s?d\b|perusahaan dagang/.test(t)) return 'PD';
      if (/firma/.test(t)) return 'Firma';
      if (/koperasi|ksp|kud/.test(t)) return 'Koperasi';
    }
    return detectEntity(name) || 'Lainnya';
  }

  // ---------------------------------------------------------------------------
  // OpenStreetMap / Overpass
  // ---------------------------------------------------------------------------

  // Regex POSIX (Overpass) yang menangkap nama berlabel PT/CV/UD/PD/Firma/Koperasi/Tbk/Persero.
  var OVERPASS_ENTITY_RE =
    '(^|[ ,(])(P\\.? ?T|C\\.? ?V|U\\.? ?D)(\\.|$|[ ,)])' +
    '|^P\\.? ?D(\\.| )' +
    '|(^| )(Koperasi|Kopkar|Kopontren|KSP|KSU|KUD)($|[ .,])' +
    '|(^|[ ,.(])Tbk(\\.|$|[ ,)])' +
    '|\\(Persero\\)' +
    '|^(Firma|Fa\\.) ';

  var OTHER_FILTERS = [
    '["office"~"^(company|construction_company|construction|logistics|courier|moving_company|engineer|it|telecommunication|energy_supplier|property_management|consulting|estate_agent)$"]["name"]',
    '["man_made"="works"]["name"]',
    '["industrial"]["name"]',
    '["building"~"^(industrial|warehouse|factory|manufacture)$"]["name"]',
    '["shop"~"^(wholesale|car|motorcycle|truck|trade|building_materials|agrarian|tyres|car_parts|hardware)$"]["name"]',
    '["tourism"~"^(hotel|motel)$"]["name"]',
    '["amenity"~"^(fuel|hospital)$"]["name"]'
  ];

  function qlStr(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function bboxStr(b) {
    return b.map(function (n) { return (+n).toFixed(5); }).join(',');
  }

  function branchQuery(bbox) {
    var b = bboxStr(bbox || INDONESIA_BBOX);
    var re = qlStr('BNI|Negara Indonesia');
    return '[out:json][timeout:180];(' +
      'nwr["amenity"="bank"]["name"~' + re + ',i](' + b + ');' +
      'nwr["amenity"="bank"]["brand"~' + re + ',i](' + b + ');' +
      'nwr["amenity"="bank"]["operator"~' + re + ',i](' + b + ');' +
      ');out center tags;';
  }

  function companyQuery(bbox, includeOthers) {
    var b = bboxStr(bbox);
    var re = qlStr(OVERPASS_ENTITY_RE);
    var parts = [
      'nwr["name"~' + re + ',i](' + b + ');',
      'nwr["operator"~' + re + ',i]["name"][!"brand"](' + b + ');'
    ];
    if (includeOthers) {
      OTHER_FILTERS.forEach(function (f) { parts.push('nwr' + f + '(' + b + ');'); });
    }
    return '[out:json][timeout:90];(' + parts.join('') + ');out center tags;';
  }

  function elementLatLon(el) {
    if (el.type === 'node' && isFinite(el.lat) && isFinite(el.lon)) return [el.lat, el.lon];
    if (el.center && isFinite(el.center.lat)) return [el.center.lat, el.center.lon];
    if (el.bounds) return [(el.bounds.minlat + el.bounds.maxlat) / 2, (el.bounds.minlon + el.bounds.maxlon) / 2];
    return null;
  }

  function firstTag(t, keys) {
    for (var i = 0; i < keys.length; i++) if (t[keys[i]]) return normSpace(t[keys[i]]);
    return '';
  }

  function formatAddress(t) {
    if (t['addr:full']) return normSpace(t['addr:full']);
    var street = t['addr:street']
      ? t['addr:street'] + (t['addr:housenumber'] ? ' No. ' + t['addr:housenumber'] : '')
      : (t['addr:place'] || '');
    var parts = [street, t['addr:hamlet'], t['addr:village'] || t['addr:subdistrict'], t['addr:district'],
      t['addr:city'] || t['addr:regency'], t['addr:province'], t['addr:postcode']];
    return uniq(parts.filter(Boolean).map(normSpace)).join(', ');
  }

  var EXCLUDE = {
    amenity: /^(bank|atm|bureau_de_change|money_transfer|payment_centre|place_of_worship|school|kindergarten|college|university|townhall|police|prison|grave_yard|parking|toilets|bus_station|post_box)$/,
    office: /^(government|diplomatic|ngo|religion|political_party|association)$/,
    landuse: /^(residential|cemetery|religious|military)$/
  };

  function isExcluded(t) {
    if (t.highway || t.railway || t.public_transport || t.route || t.boundary || t.place || t.waterway || t.natural) return true;
    for (var k in EXCLUDE) if (t[k] && EXCLUDE[k].test(t[k])) return true;
    if (t.disused === 'yes' || t.abandoned === 'yes') return true;
    for (var key in t) if (/^(disused|abandoned|was|demolished|removed|razed):/.test(key)) return true;
    return false;
  }

  function isOtherBusiness(t) {
    return !!(
      (t.office && /^(company|construction_company|construction|logistics|courier|moving_company|engineer|it|telecommunication|energy_supplier|property_management|consulting|estate_agent)$/.test(t.office)) ||
      t.man_made === 'works' || t.industrial ||
      (t.building && /^(industrial|warehouse|factory|manufacture)$/.test(t.building)) ||
      (t.shop && /^(wholesale|car|motorcycle|truck|trade|building_materials|agrarian|tyres|car_parts|hardware)$/.test(t.shop)) ||
      (t.tourism && /^(hotel|motel)$/.test(t.tourism)) ||
      (t.amenity && /^(fuel|hospital)$/.test(t.amenity))
    );
  }

  var CATEGORY_RULES = [
    ['office', 'company', 'Kantor perusahaan'],
    ['office', 'construction_company', 'Kontraktor'],
    ['office', 'construction', 'Kontraktor'],
    ['office', 'logistics', 'Logistik'],
    ['office', 'courier', 'Kurir / ekspedisi'],
    ['office', 'moving_company', 'Jasa angkutan'],
    ['office', 'estate_agent', 'Agen properti'],
    ['office', 'insurance', 'Asuransi'],
    ['office', 'it', 'Teknologi informasi'],
    ['office', 'telecommunication', 'Telekomunikasi'],
    ['office', 'energy_supplier', 'Energi'],
    ['office', 'consulting', 'Konsultan'],
    ['office', 'engineer', 'Jasa teknik'],
    ['office', 'property_management', 'Pengelola properti'],
    ['office', '*', 'Kantor'],
    ['man_made', 'works', 'Pabrik'],
    ['industrial', 'factory', 'Pabrik'],
    ['industrial', 'warehouse', 'Gudang'],
    ['industrial', '*', 'Industri'],
    ['building', 'warehouse', 'Gudang'],
    ['building', 'factory', 'Pabrik'],
    ['building', 'manufacture', 'Pabrik'],
    ['building', 'industrial', 'Bangunan industri'],
    ['shop', 'wholesale', 'Grosir / distributor'],
    ['shop', 'car', 'Dealer mobil'],
    ['shop', 'motorcycle', 'Dealer motor'],
    ['shop', 'truck', 'Dealer truk'],
    ['shop', 'building_materials', 'Bahan bangunan'],
    ['shop', 'hardware', 'Toko besi / perkakas'],
    ['shop', 'agrarian', 'Saprotan / pertanian'],
    ['shop', 'trade', 'Perdagangan'],
    ['shop', 'tyres', 'Ban'],
    ['shop', 'car_parts', 'Suku cadang'],
    ['shop', '*', 'Toko'],
    ['tourism', 'hotel', 'Hotel'],
    ['tourism', 'motel', 'Motel'],
    ['tourism', 'guest_house', 'Penginapan'],
    ['amenity', 'fuel', 'SPBU'],
    ['amenity', 'hospital', 'Rumah sakit'],
    ['amenity', 'clinic', 'Klinik'],
    ['amenity', 'restaurant', 'Restoran'],
    ['amenity', 'cafe', 'Kafe'],
    ['amenity', '*', 'Fasilitas'],
    ['craft', '*', 'Produksi / kerajinan'],
    ['healthcare', '*', 'Kesehatan'],
    ['landuse', 'industrial', 'Kawasan industri'],
    ['landuse', 'commercial', 'Kawasan komersial'],
    ['building', 'commercial', 'Bangunan komersial'],
    ['building', 'office', 'Gedung kantor'],
    ['building', '*', 'Bangunan']
  ];

  function categoryOf(t) {
    for (var i = 0; i < CATEGORY_RULES.length; i++) {
      var r = CATEGORY_RULES[i];
      var v = t[r[0]];
      if (v && v !== 'no' && (r[1] === '*' || v === r[1])) return r[2];
    }
    return 'Lainnya';
  }

  function pickTags(t) {
    var out = {};
    for (var k in t) {
      if (/^(name|alt_name|old_name|official_name|short_name):(?!id$|en$)/.test(k)) continue;
      if (/^(source|fixme|FIXME|created_by)/.test(k)) continue;
      out[k] = t[k];
    }
    return out;
  }

  function parseCompanies(elements, opts) {
    var includeOthers = !!(opts && opts.includeOthers);
    var out = [];
    (elements || []).forEach(function (el) {
      var t = el.tags;
      if (!t) return;
      var ll = elementLatLon(el);
      if (!ll) return;
      if (isExcluded(t)) return;
      var name = normSpace(t.name || t['name:id'] || t.official_name || '');
      if (!name) return;
      var entity = detectEntity(name) || detectEntity(t.official_name);
      var operator = t.operator ? normSpace(t.operator) : '';
      var viaOperator = false;
      if (!entity && !t.brand) {
        var e2 = detectEntity(t.operator) || detectEntity(t.owner);
        if (e2) { entity = e2; viaOperator = true; if (!operator) operator = normSpace(t.owner); }
      }
      if (!entity) {
        if (!includeOthers || !isOtherBusiness(t)) return;
        entity = 'Lainnya';
      }
      out.push({
        id: 'osm:' + el.type.charAt(0) + el.id,
        osm: el.type + '/' + el.id,
        source: 'osm',
        name: name,
        entity: entity,
        operator: operator,
        viaOperator: viaOperator,
        lat: round6(ll[0]),
        lon: round6(ll[1]),
        category: categoryOf(t),
        address: formatAddress(t),
        city: t['addr:city'] || t['addr:regency'] || '',
        phone: firstTag(t, ['phone', 'contact:phone', 'contact:mobile', 'mobile']),
        email: firstTag(t, ['email', 'contact:email']),
        website: firstTag(t, ['website', 'contact:website', 'url']),
        tags: pickTags(t)
      });
    });
    return out;
  }

  function infoScore(c) {
    return (c.phone ? 2 : 0) + (c.website ? 2 : 0) + (c.email ? 1 : 0) + (c.address ? 1 : 0) +
      (/^osm:n/.test(c.id) ? 0.5 : 0) + (c.tags ? Object.keys(c.tags).length * 0.01 : 0);
  }

  // Gabungkan entri bernama sama yang berdekatan (mis. titik + gedung, atau beberapa gedung satu pabrik).
  function dedupeCompanies(list, thresholdKm) {
    var th = thresholdKm == null ? 0.3 : thresholdKm;
    var sorted = list.slice().sort(function (a, b) {
      return (infoScore(b) - infoScore(a)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    var groups = {};
    var out = [];
    var seenIds = {};
    sorted.forEach(function (c) {
      if (seenIds[c.id]) return;
      seenIds[c.id] = true;
      var key = companyKey(c.entity, c.name);
      var arr = key ? groups[key] : null;
      if (arr) {
        for (var i = 0; i < arr.length; i++) {
          var k = arr[i];
          if (haversineKm(k.lat, k.lon, c.lat, c.lon) <= th) {
            ['phone', 'email', 'website', 'address', 'city', 'operator'].forEach(function (f) {
              if (!k[f] && c[f]) k[f] = c[f];
            });
            (k.altIds = k.altIds || []).push(c.id);
            return;
          }
        }
      }
      var copy = Object.assign({}, c);
      out.push(copy);
      if (key) (groups[key] = groups[key] || []).push(copy);
    });
    return out;
  }

  var BNI_RE = /(^|[^a-z])bni([^a-z]|$)|bank negara indonesia/i;
  var BNI_EXCLUDE = /syariah|sharia|(^|[^a-z])atm([^a-z]|$)|bni life|life insurance|sekuritas|securities|ventura|multi ?finance|remittance|agen ?46|agen bni|laku pandai|(^|[^a-z])bsi([^a-z]|$)/i;
  var GENERIC_BRANCH_NAMES = ['bni', 'bankbni', 'bni46', 'bankbni46', 'banknegaraindonesia', 'banknegaraindonesiapersero',
    'banknegaraindonesiaperserotbk', 'ptbanknegaraindonesia', 'ptbanknegaraindonesiapersero', 'ptbanknegaraindonesiaperserotbk'];

  function branchType(text) {
    var s = ' ' + String(text || '').toLowerCase() + ' ';
    if (/[^a-z]kcp[^a-z]|cabang pembantu/.test(s)) return 'KCP';
    if (/[^a-z]kk[^a-z]|kantor kas/.test(s)) return 'KK';
    if (/kanwil|kantor wilayah/.test(s)) return 'Kanwil';
    if (/[^a-z](kc|kcu)[^a-z]|kantor cabang|cabang utama|[^a-z]cabang[^a-z]/.test(s)) return 'KC';
    return 'Kantor';
  }

  function normBranchType(text, name) {
    var t = String(text || '').toLowerCase();
    if (t) {
      if (/kcp|pembantu/.test(t)) return 'KCP';
      if (/\bkk\b|kas/.test(t)) return 'KK';
      if (/kanwil|wilayah/.test(t)) return 'Kanwil';
      if (/\bkc\b|kcu|cabang/.test(t)) return 'KC';
    }
    return branchType(name);
  }

  function branchDisplayName(raw, t) {
    if (GENERIC_BRANCH_NAMES.indexOf(normKey(raw)) >= 0) {
      var loc = t['addr:street'] || t['addr:village'] || t['addr:subdistrict'] || t['addr:district'] || t['addr:city'] || '';
      return loc ? 'BNI ' + normSpace(loc) : 'BNI';
    }
    return raw;
  }

  function parseBranches(elements) {
    var out = [];
    (elements || []).forEach(function (el) {
      var t = el.tags || {};
      var ll = elementLatLon(el);
      if (!ll) return;
      var text = [t.name, t.brand, t.operator, t['name:id'], t.official_name, t['name:en']].filter(Boolean).join(' | ');
      if (!BNI_RE.test(text) || BNI_EXCLUDE.test(text)) return;
      var raw = normSpace(t.name || t['name:id'] || t.official_name || t.brand || 'BNI');
      out.push({
        id: 'osm:' + el.type.charAt(0) + el.id,
        osm: el.type + '/' + el.id,
        source: 'osm',
        name: branchDisplayName(raw, t),
        type: branchType([raw, t.official_name, t.description].filter(Boolean).join(' ')),
        lat: round6(ll[0]),
        lon: round6(ll[1]),
        address: formatAddress(t),
        city: t['addr:city'] || t['addr:regency'] || '',
        phone: firstTag(t, ['phone', 'contact:phone']),
        hours: t.opening_hours || ''
      });
    });
    return dedupeBranches(out);
  }

  function dedupeBranches(list) {
    var groups = {};
    var out = [];
    list.forEach(function (b) {
      var key = normKey(b.name);
      var arr = groups[key];
      if (arr) {
        for (var i = 0; i < arr.length; i++) {
          if (haversineKm(arr[i].lat, arr[i].lon, b.lat, b.lon) <= 0.15) {
            ['address', 'city', 'phone', 'hours'].forEach(function (f) { if (!arr[i][f] && b[f]) arr[i][f] = b[f]; });
            if (arr[i].type === 'Kantor' && b.type !== 'Kantor') arr[i].type = b.type;
            return;
          }
        }
      }
      var copy = Object.assign({}, b);
      out.push(copy);
      (groups[key] = groups[key] || []).push(copy);
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Angka, uang, tanggal
  // ---------------------------------------------------------------------------

  var MULT = { triliun: 1e12, t: 1e12, miliar: 1e9, milyar: 1e9, m: 1e9, b: 1e9, bn: 1e9, juta: 1e6, jt: 1e6, ribu: 1e3, rb: 1e3, k: 1e3 };

  // Menerima "Rp 2.500.000.000", "2,5 M", "750 jt", "2500000000", 2.5e9, "(1.000)" (negatif).
  function parseNumberID(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().toLowerCase().replace(/^rp\.?\s*/, '').replace(/\s+/g, '');
    if (!s) return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/^rp\.?/, '');
    if (s.charAt(0) === '-' || s.charAt(0) === '−') { neg = true; s = s.slice(1); }
    var mult = 1;
    var m = s.match(/(triliun|miliar|milyar|juta|ribu|bn|jt|rb|t|m|b|k)$/);
    if (m && /\d/.test(s.slice(0, -m[1].length))) {
      mult = MULT[m[1]];
      s = s.slice(0, -m[1].length);
    }
    var num;
    if (mult !== 1) {
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
      else num = /^\d+([.,]\d+)?$/.test(s) ? parseFloat(s.replace(',', '.')) : NaN;
    } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      num = parseFloat(s.replace(/,/g, ''));
    } else if (/^\d+(,\d+)?$/.test(s)) {
      num = parseFloat(s.replace(',', '.'));
    } else if (/^\d+(\.\d+)?$/.test(s)) {
      num = parseFloat(s);
    } else {
      num = NaN;
    }
    if (!isFinite(num)) return null;
    return (neg ? -1 : 1) * num * mult;
  }

  // Satuan dari judul kolom, mis. "Plafond (Rp miliar)" atau "Omzet (juta)".
  function unitFromHeader(h) {
    var s = String(h || '').toLowerCase();
    if (/miliar|milyar|\(\s*m\s*\)|\bdalam m\b|\bm\)$/.test(s)) return 1e9;
    if (/juta|\(\s*jt\s*\)|\bjt\b/.test(s)) return 1e6;
    if (/ribu|\(\s*rb\s*\)/.test(s)) return 1e3;
    return 1;
  }

  // isPlafond: angka kecil tanpa satuan ditafsirkan sebagai miliar (< 100) atau juta (< 100.000),
  // karena plafond kredit tidak mungkin hanya ratusan rupiah.
  function parseMoneyCell(v, unit, isPlafond) {
    if (v == null || v === '') return null;
    var hasSuffix = typeof v === 'string' && /(triliun|miliar|milyar|juta|ribu|bn|jt|rb|[tmbk])\s*$/i.test(v.trim());
    var n = parseNumberID(v);
    if (n == null) return null;
    if (!hasSuffix) {
      if (unit && unit !== 1) n = n * unit;
      else if (isPlafond && n > 0 && n < 100) n = n * 1e9;
      else if (isPlafond && n >= 100 && n < 100000) n = n * 1e6;
    }
    return n;
  }

  var nfInt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

  function formatRupiah(n) {
    if (n == null || !isFinite(n)) return '–';
    return (n < 0 ? '−' : '') + 'Rp ' + nfInt.format(Math.round(Math.abs(n)));
  }

  function formatRpShort(n) {
    if (n == null || !isFinite(n)) return '–';
    var a = Math.abs(n), sign = n < 0 ? '−' : '';
    function f(v, unit) {
      var digits = v < 10 ? 2 : (v < 100 ? 1 : 0);
      return sign + 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(v) + ' ' + unit;
    }
    if (a >= 1e12) return f(a / 1e12, 'T');
    if (a >= 1e9) return f(a / 1e9, 'M');
    if (a >= 1e6) return f(a / 1e6, 'jt');
    return sign + 'Rp ' + nfInt.format(Math.round(a));
  }

  function formatKm(d) {
    if (d == null || !isFinite(d)) return '–';
    if (d < 1) return nfInt.format(Math.round(d * 1000 / 10) * 10) + ' m';
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(d) + ' km';
  }

  function formatPct(x, digits) {
    if (x == null || !isFinite(x)) return '–';
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits == null ? 1 : digits, maximumFractionDigits: digits == null ? 1 : digits }).format(x * 100) + '%';
  }

  function formatCount(n) { return nfInt.format(n || 0); }

  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function formatDate(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    return (+m[3]) + ' ' + BULAN[+m[2] - 1] + ' ' + m[1];
  }

  function relTime(ts, now) {
    if (!ts) return '';
    now = now || Date.now();
    var s = Math.max(0, (now - ts) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    if (s < 86400 * 45) return Math.floor(s / 86400) + ' hari lalu';
    var d = new Date(ts);
    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Tanggal dari sel Excel: objek Date, nomor seri Excel, "13/10/2026", "2026-10-13".
  function parseDateCell(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return isoDate(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var ms = Math.round((v - 25569) * 86400000);
      var d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
    m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
    if (m) {
      var y = +m[3];
      if (y < 100) y += 2000;
      return y + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
    }
    return '';
  }

  function parseYear(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.getFullYear();
    var m = String(v).match(/(19|20)\d{2}/);
    if (!m) return null;
    var y = +m[0];
    return y >= 1990 && y <= 2100 ? y : null;
  }

  function parsePercent(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 0 && v <= 1 ? Math.round(v * 10000) / 100 : v;
    var s = String(v);
    var m = s.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0].replace(',', '.'));
    if (!/%/.test(s) && n > 0 && n <= 1 && /[.,]/.test(m[0])) n = n * 100;
    return isFinite(n) ? n : null;
  }

  // ---------------------------------------------------------------------------
  // Koordinat
  // ---------------------------------------------------------------------------

  function parseCoordValue(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    var s = String(v).trim().replace(/\s/g, '').replace('−', '-').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return parseFloat(s);
  }

  function fixLatLon(lat, lon) {
    if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return null;
    var t;
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { t = lat; lat = lon; lon = t; }
    if (lat >= 94 && lat <= 142 && lon >= -12 && lon <= 7) { t = lat; lat = lon; lon = t; }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    if (lat === 0 && lon === 0) return null;
    return [round6(lat), round6(lon)];
  }

  // "-6.2088, 106.8456", "-6,2088; 106,8456", tautan Google Maps ".../@-6.2088,106.8456,17z".
  // Tautan tempat Google Maps ("...!3d-6.2088!4d106.8456") memakai titik tempatnya, bukan pusat layar.
  function parseLatLonPair(v) {
    if (v == null || v === '') return null;
    var s = String(v).replace(/−/g, '-');
    var place = s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
    if (place) return fixLatLon(parseFloat(place[1]), parseFloat(place[2]));
    var m = s.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (!m) m = s.match(/(-?\d{1,3}(?:[.,]\d+)?)\s*[;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)/);
    if (!m) return null;
    return fixLatLon(parseCoordValue(m[1]), parseCoordValue(m[2]));
  }

  // ---------------------------------------------------------------------------
  // Pemetaan kolom Excel
  // ---------------------------------------------------------------------------

  var MAIN_FIELDS = {
    id: ['id', 'idprospek', 'kodeprospek'],
    name: ['nama', 'namaperusahaan', 'namadebitur', 'namacalondebitur', 'namausaha', 'namabadanusaha', 'namaprospek',
      'namanasabah', 'perusahaan', 'debitur', 'calondebitur', 'prospek', 'nasabah', 'name', 'company', 'companyname'],
    entity: ['badanusaha', 'bentukusaha', 'bentukbadanusaha', 'jenisbadanusaha', 'legalitas', 'entity'],
    address: ['alamat', 'alamatusaha', 'alamatlengkap', 'alamatkantor', 'lokasiusaha', 'address'],
    city: ['kota', 'kabupaten', 'kotakabupaten', 'kabupatenkota', 'kabkota', 'kotakab', 'city', 'wilayah'],
    lat: ['latitude', 'lat', 'lintang'],
    lon: ['longitude', 'long', 'lon', 'lng', 'bujur'],
    coords: ['koordinat', 'titikkoordinat', 'latlong', 'latlng', 'latlon', 'coordinates', 'lokasi', 'gmaps', 'googlemaps', 'linkgooglemaps', 'linkmaps'],
    phone: ['telepon', 'telp', 'notelp', 'notelepon', 'nomortelepon', 'nohp', 'hp', 'phone', 'kontak', 'notlp', 'tlp'],
    email: ['email', 'surel', 'alamatemail'],
    website: ['website', 'situsweb', 'web', 'situs', 'url'],
    bidang: ['bidangusaha', 'jenisusaha', 'sektor', 'sektorusaha', 'sektorekonomi', 'industri', 'kbli', 'usaha', 'lineofbusiness'],
    pic: ['pic', 'namapic', 'namakontak', 'contactperson', 'cp', 'narahubung', 'kontakperson'],
    status: ['status', 'statuspipeline', 'tahap', 'tahapan', 'pipeline'],
    plafond: ['plafond', 'plafon', 'estimasiplafond', 'estimasiplafon', 'limit', 'limitkredit', 'kebutuhankredit',
      'kebutuhan', 'nominal', 'nilaikredit'],
    produk: ['produk', 'jeniskredit', 'fasilitas', 'jenisfasilitas'],
    followUp: ['followup', 'tanggalfollowup', 'jadwalfollowup', 'tindaklanjut', 'jadwalkunjungan', 'tanggalkunjungan', 'jadwal'],
    catatan: ['catatan', 'keterangan', 'ket', 'notes', 'note', 'remark'],
    isNasabah: ['nasabahbni', 'sudahnasabah', 'sudahnasabahbni', 'existingnasabah', 'existing'],
    category: ['kategori'],
    sumberData: ['sumberdata', 'sumber'],
    tahunBerdiri: ['tahunberdiri', 'berdiri', 'tahunpendirian'],
    p_dirut: ['direkturutama', 'dirut', 'presidendirektur', 'namadirekturutama', 'namadirut'],
    p_dir: ['direktur', 'direksi', 'namadirektur'],
    p_komut: ['komisarisutama', 'komut', 'presidenkomisaris', 'namakomisarisutama'],
    p_kom: ['komisaris', 'namakomisaris'],
    p_ps: ['pemegangsaham', 'shareholder', 'pemiliksaham', 'komposisisaham'],
    p_owner: ['pemilik', 'owner', 'pemilikusaha', 'namapemilik'],
    p_sa: ['sekutuaktif', 'persekutuaktif', 'sekutupengurus'],
    p_sp: ['sekutupasif', 'sekutukomanditer', 'komanditer', 'persekutupasif'],
    f_tahun: ['tahun', 'tahunlaporan', 'tahunbuku', 'periode', 'periodelaporan', 'year'],
    f_penjualan: ['penjualan', 'penjualanbersih', 'omzet', 'omset', 'omzettahunan', 'pendapatan', 'revenue', 'sales'],
    f_laba: ['lababersih', 'laba', 'labarugi', 'labatahunberjalan', 'netprofit', 'profit'],
    f_aset: ['totalaset', 'aset', 'asset', 'totalasset', 'jumlahaset', 'totalaktiva', 'aktiva'],
    f_liab: ['totalliabilitas', 'liabilitas', 'totalkewajiban', 'kewajiban', 'totalutang', 'totalhutang', 'utang', 'hutang', 'liabilities'],
    f_ekuitas: ['ekuitas', 'totalekuitas', 'modal', 'modalsendiri', 'equity']
  };

  var PEOPLE_FIELDS = {
    refId: ['idprospek', 'id'],
    refName: ['perusahaan', 'namaperusahaan', 'prospek', 'namaprospek', 'debitur', 'namadebitur'],
    nama: ['nama', 'namapengurus', 'namaorang', 'name'],
    jabatan: ['jabatan', 'posisi', 'peran', 'role', 'kedudukan'],
    saham: ['saham', 'sahampersen', 'kepemilikan', 'kepemilikansaham', 'persentase', 'persentasesaham', 'porsimodal']
  };

  var FINANCE_FIELDS = {
    refId: ['idprospek', 'id'],
    refName: ['perusahaan', 'namaperusahaan', 'prospek', 'namaprospek', 'debitur', 'namadebitur', 'nama'],
    tahun: MAIN_FIELDS.f_tahun,
    penjualan: MAIN_FIELDS.f_penjualan,
    laba: MAIN_FIELDS.f_laba,
    aset: MAIN_FIELDS.f_aset,
    liabilitas: MAIN_FIELDS.f_liab,
    ekuitas: MAIN_FIELDS.f_ekuitas
  };

  var BRANCH_FIELDS = {
    name: ['nama', 'namacabang', 'namakantor', 'cabang', 'kantor', 'unit', 'namaunit', 'outlet', 'namaoutlet', 'name'],
    type: ['tipe', 'jenis', 'jeniskantor', 'tipekantor', 'kelas', 'type'],
    kode: ['kode', 'kodecabang', 'kodeoutlet', 'kodeunit'],
    address: MAIN_FIELDS.address,
    city: MAIN_FIELDS.city,
    lat: MAIN_FIELDS.lat,
    lon: MAIN_FIELDS.lon,
    coords: MAIN_FIELDS.coords,
    phone: MAIN_FIELDS.phone
  };

  // Cocokkan judul kolom ke field. Hasil: { map: {field: index}, units: {field: pengali}, unknown: [judul] }.
  function mapHeaders(headers, fields) {
    var norm = headers.map(function (h) { return normKey(h); });
    var map = {}, units = {}, used = {};
    var names = Object.keys(fields);
    // 1) cocok persis
    norm.forEach(function (h, idx) {
      if (!h) return;
      for (var i = 0; i < names.length; i++) {
        var f = names[i];
        if (map[f] == null && fields[f].indexOf(h) >= 0) { map[f] = idx; used[idx] = true; return; }
      }
    });
    // 2) awalan (sinonim ≥ 6 huruf), contoh "Plafond (Rp miliar)" → plafond
    norm.forEach(function (h, idx) {
      if (!h || used[idx]) return;
      var best = null, bestLen = 0;
      names.forEach(function (f) {
        if (map[f] != null) return;
        fields[f].forEach(function (syn) {
          if (syn.length >= 6 && h.indexOf(syn) === 0 && syn.length > bestLen) { best = f; bestLen = syn.length; }
        });
      });
      if (best) { map[best] = idx; used[idx] = true; }
    });
    Object.keys(map).forEach(function (f) { units[f] = unitFromHeader(headers[map[f]]); });
    var unknown = [];
    headers.forEach(function (h, idx) { if (!used[idx] && normSpace(h)) unknown.push(normSpace(h)); });
    return { map: map, units: units, unknown: unknown };
  }

  // Cari baris judul (bisa ada judul laporan di atasnya): baris dengan kecocokan kolom terbanyak di 15 baris pertama.
  function findHeaderRow(rows, fields, requiredField) {
    var bestIdx = 0, bestScore = -1;
    var limit = Math.min(rows.length, 15);
    for (var i = 0; i < limit; i++) {
      var r = rows[i] || [];
      var m = mapHeaders(r.map(function (c) { return c == null ? '' : String(c); }), fields);
      var score = Object.keys(m.map).length + (requiredField && m.map[requiredField] != null ? 5 : 0);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestIdx;
  }

  function sheetTable(rows, fields, requiredField) {
    rows = rows || [];
    var hi = findHeaderRow(rows, fields, requiredField);
    var headers = (rows[hi] || []).map(function (c) { return c == null ? '' : String(c); });
    var body = rows.slice(hi + 1).filter(function (r) {
      return r && r.some(function (v) { return v !== '' && v != null; });
    });
    return { headers: headers, rows: body, headerRow: hi };
  }

  function normJabatan(s) {
    var t = String(s || '').toLowerCase();
    if (!t.trim()) return '';
    if (/komisaris\s*ut(ama)?|komut|presiden komisaris|president commissioner/.test(t)) return 'Komisaris Utama';
    if (/komisaris|commissioner/.test(t)) return 'Komisaris';
    if (/dir(ektur|\.)?\s*ut(ama)?|dirut|presiden direktur|president director|ceo/.test(t)) return 'Direktur Utama';
    if (/direktur|direksi|director/.test(t)) return 'Direktur';
    if (/pemegang saham|shareholder|pemilik saham/.test(t)) return 'Pemegang Saham';
    if (/sekutu aktif|persero aktif|sekutu pengurus/.test(t)) return 'Sekutu Aktif';
    if (/sekutu pasif|komanditer|persero pasif/.test(t)) return 'Sekutu Pasif';
    if (/pemilik|owner/.test(t)) return 'Pemilik';
    if (/manajer|manager|pic|kepala|general|keuangan|finance/.test(t)) return 'Manajer / PIC';
    return 'Lainnya';
  }

  function normStatus(s) {
    var t = String(s || '').toLowerCase();
    if (!t.trim()) return 'baru';
    if (/tolak|reject|batal|tidak minat|tdk minat|gagal/.test(t)) return 'ditolak';
    if (/setuju|cair|approve|akad|realisasi|booking/.test(t)) return 'disetujui';
    if (/aju|proses|analis|usul|review/.test(t)) return 'pengajuan';
    if (/kunjung|survei|survey|visit|ots/.test(t)) return 'kunjungan';
    if (/hubung|contact|telp|telepon|call|wa/.test(t)) return 'dihubungi';
    return 'baru';
  }

  function normProduk(s) {
    var t = String(s || '').toLowerCase();
    if (!t.trim()) return '';
    var kmk = /kmk|modal kerja|working/.test(t);
    var ki = /\bki\b|investasi|investment/.test(t);
    if (kmk && ki) return 'KMK + KI';
    if (kmk) return 'KMK (modal kerja)';
    if (ki) return 'KI (investasi)';
    return 'Lainnya';
  }

  function parseBool(v) {
    if (typeof v === 'boolean') return v;
    var t = String(v == null ? '' : v).trim().toLowerCase();
    return /^(ya|y|yes|true|1|sudah|v|x|✓)$/.test(t);
  }

  // "Budi Santoso (60%); Andi 40%" → [{nama, jabatan, saham}]
  function splitPeople(cell, jabatan) {
    if (cell == null || cell === '') return [];
    return String(cell).split(/[;\n]+/).map(function (part) {
      var pm = part.match(/(\d+(?:[.,]\d+)?)\s*%/);
      var nama = normSpace(part.replace(/\(?\s*\d+(?:[.,]\d+)?\s*%\s*\)?/, '').replace(/[()]/g, ' '));
      return nama ? { nama: nama, jabatan: jabatan, saham: pm ? parseFloat(pm[1].replace(',', '.')) : null } : null;
    }).filter(Boolean);
  }

  function addPerson(list, p) {
    if (!p || !normSpace(p.nama)) return;
    var key = normKey(p.nama) + '|' + (p.jabatan || '');
    for (var i = 0; i < list.length; i++) {
      if (normKey(list[i].nama) + '|' + (list[i].jabatan || '') === key) {
        if (p.saham != null) list[i].saham = p.saham;
        return;
      }
    }
    list.push({ nama: normSpace(p.nama), jabatan: p.jabatan || 'Lainnya', saham: p.saham == null ? null : p.saham });
  }

  var FIN_KEYS = ['penjualan', 'laba', 'aset', 'liabilitas', 'ekuitas'];

  function addFinance(list, f) {
    if (!f) return;
    var hasValue = FIN_KEYS.some(function (k) { return f[k] != null; });
    if (!hasValue) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i].tahun === f.tahun) {
        FIN_KEYS.forEach(function (k) { if (f[k] != null) list[i][k] = f[k]; });
        return;
      }
    }
    var row = { tahun: f.tahun == null ? null : f.tahun };
    FIN_KEYS.forEach(function (k) { row[k] = f[k] == null ? null : f[k]; });
    list.push(row);
  }

  function emptyRecord() {
    return {
      id: null, name: '', entity: '', address: '', city: '', lat: null, lon: null, phone: '', email: '', website: '',
      bidang: '', pic: '', status: '', plafond: null, produk: '', followUp: '', catatan: '', isNasabah: null,
      category: '', sumberData: '', tahunBerdiri: '', pengurus: [], keuangan: []
    };
  }

  // Ubah lembar Excel (baris array) menjadi rekaman prospek. people/finance opsional (lembar terpisah).
  function convertProspectSheets(mainRows, peopleRows, financeRows) {
    var main = sheetTable(mainRows, MAIN_FIELDS, 'name');
    var hm = mapHeaders(main.headers, MAIN_FIELDS);
    var result = { records: [], skipped: [], unknownHeaders: hm.unknown, mappedFields: Object.keys(hm.map), headerRow: main.headerRow };
    if (hm.map.name == null) {
      result.error = 'Kolom nama perusahaan tidak ditemukan. Beri judul kolom "Nama Perusahaan".';
      return result;
    }
    var byKey = {};
    main.rows.forEach(function (row, idx) {
      function get(f) { return hm.map[f] != null ? row[hm.map[f]] : undefined; }
      var excelRow = main.headerRow + idx + 2;
      var name = normSpace(get('name'));
      if (!name) { result.skipped.push({ row: excelRow, reason: 'Nama kosong' }); return; }
      if (/\(contoh\)/i.test(name)) return;
      var rec = emptyRecord();
      rec.row = excelRow;
      rec.id = normSpace(get('id')) || null;
      rec.name = name;
      rec.entity = normEntity(get('entity'), name);
      rec.address = normSpace(get('address'));
      rec.city = normSpace(get('city'));
      var ll = fixLatLon(parseCoordValue(get('lat')), parseCoordValue(get('lon')));
      if (!ll && get('coords') != null && get('coords') !== '') {
        ll = parseLatLonPair(get('coords'));
        if (!ll && !rec.address) rec.address = normSpace(get('coords'));
      }
      if (ll) { rec.lat = ll[0]; rec.lon = ll[1]; }
      rec.phone = normSpace(get('phone'));
      rec.email = normSpace(get('email'));
      rec.website = normSpace(get('website'));
      rec.bidang = normSpace(get('bidang'));
      rec.pic = normSpace(get('pic'));
      rec.status = get('status') != null && get('status') !== '' ? normStatus(get('status')) : '';
      rec.plafond = parseMoneyCell(get('plafond'), hm.units.plafond, true);
      rec.produk = normProduk(get('produk'));
      rec.followUp = parseDateCell(get('followUp'));
      rec.catatan = normSpace(get('catatan'));
      rec.isNasabah = get('isNasabah') != null && get('isNasabah') !== '' ? parseBool(get('isNasabah')) : null;
      rec.category = normSpace(get('category'));
      rec.sumberData = normSpace(get('sumberData'));
      rec.tahunBerdiri = normSpace(get('tahunBerdiri'));
      [['p_dirut', 'Direktur Utama'], ['p_dir', 'Direktur'], ['p_komut', 'Komisaris Utama'], ['p_kom', 'Komisaris'],
        ['p_ps', 'Pemegang Saham'], ['p_owner', 'Pemilik'], ['p_sa', 'Sekutu Aktif'], ['p_sp', 'Sekutu Pasif']]
        .forEach(function (pair) {
          splitPeople(get(pair[0]), pair[1]).forEach(function (p) { addPerson(rec.pengurus, p); });
        });
      addFinance(rec.keuangan, {
        tahun: parseYear(get('f_tahun')),
        penjualan: parseMoneyCell(get('f_penjualan'), hm.units.f_penjualan),
        laba: parseMoneyCell(get('f_laba'), hm.units.f_laba),
        aset: parseMoneyCell(get('f_aset'), hm.units.f_aset),
        liabilitas: parseMoneyCell(get('f_liab'), hm.units.f_liab),
        ekuitas: parseMoneyCell(get('f_ekuitas'), hm.units.f_ekuitas)
      });
      // Beberapa baris untuk perusahaan yang sama (mis. per tahun) digabung.
      var key = rec.id ? 'id:' + rec.id : 'k:' + companyKey(rec.entity, rec.name) + '|' + normKey(rec.city);
      var prev = byKey[key];
      if (prev) {
        mergeRecord(prev, rec);
      } else {
        byKey[key] = rec;
        result.records.push(rec);
      }
    });
    attachPeople(result, peopleRows);
    attachFinance(result, financeRows);
    return result;
  }

  function mergeRecord(into, rec) {
    Object.keys(rec).forEach(function (k) {
      if (k === 'pengurus') rec.pengurus.forEach(function (p) { addPerson(into.pengurus, p); });
      else if (k === 'keuangan') rec.keuangan.forEach(function (f) { addFinance(into.keuangan, f); });
      else if ((into[k] == null || into[k] === '') && rec[k] != null && rec[k] !== '') into[k] = rec[k];
    });
  }

  function findRecordByRef(records, refId, refName) {
    var id = normSpace(refId);
    if (id) {
      for (var i = 0; i < records.length; i++) if (records[i].id === id) return records[i];
    }
    var core = coreName(refName);
    if (core) {
      for (var j = 0; j < records.length; j++) if (coreName(records[j].name) === core) return records[j];
    }
    return null;
  }

  function attachPeople(result, rows) {
    if (!rows || !rows.length) return;
    var tbl = sheetTable(rows, PEOPLE_FIELDS, 'nama');
    var hm = mapHeaders(tbl.headers, PEOPLE_FIELDS);
    if (hm.map.nama == null) return;
    tbl.rows.forEach(function (row) {
      function get(f) { return hm.map[f] != null ? row[hm.map[f]] : undefined; }
      var rec = findRecordByRef(result.records, get('refId'), get('refName'));
      if (!rec) return;
      addPerson(rec.pengurus, { nama: get('nama'), jabatan: normJabatan(get('jabatan')) || 'Lainnya', saham: parsePercent(get('saham')) });
    });
  }

  function attachFinance(result, rows) {
    if (!rows || !rows.length) return;
    var tbl = sheetTable(rows, FINANCE_FIELDS, 'tahun');
    var hm = mapHeaders(tbl.headers, FINANCE_FIELDS);
    if (hm.map.tahun == null) return;
    tbl.rows.forEach(function (row) {
      function get(f) { return hm.map[f] != null ? row[hm.map[f]] : undefined; }
      var rec = findRecordByRef(result.records, get('refId'), get('refName'));
      if (!rec) return;
      addFinance(rec.keuangan, {
        tahun: parseYear(get('tahun')),
        penjualan: parseMoneyCell(get('penjualan'), hm.units.penjualan),
        laba: parseMoneyCell(get('laba'), hm.units.laba),
        aset: parseMoneyCell(get('aset'), hm.units.aset),
        liabilitas: parseMoneyCell(get('liabilitas'), hm.units.liabilitas),
        ekuitas: parseMoneyCell(get('ekuitas'), hm.units.ekuitas)
      });
    });
  }

  function convertBranchSheet(rows) {
    var tbl = sheetTable(rows, BRANCH_FIELDS, 'name');
    var hm = mapHeaders(tbl.headers, BRANCH_FIELDS);
    var result = { records: [], skipped: [], unknownHeaders: hm.unknown, mappedFields: Object.keys(hm.map), headerRow: tbl.headerRow };
    if (hm.map.name == null) {
      result.error = 'Kolom nama cabang tidak ditemukan. Beri judul kolom "Nama Cabang".';
      return result;
    }
    tbl.rows.forEach(function (row, idx) {
      function get(f) { return hm.map[f] != null ? row[hm.map[f]] : undefined; }
      var excelRow = tbl.headerRow + idx + 2;
      var name = normSpace(get('name'));
      if (!name) { result.skipped.push({ row: excelRow, reason: 'Nama kosong' }); return; }
      if (/\(contoh\)/i.test(name)) return;
      var ll = fixLatLon(parseCoordValue(get('lat')), parseCoordValue(get('lon'))) || parseLatLonPair(get('coords'));
      result.records.push({
        row: excelRow,
        name: /bni/i.test(name) ? name : 'BNI ' + name,
        type: normBranchType(get('type'), name),
        kode: normSpace(get('kode')),
        address: normSpace(get('address')),
        city: normSpace(get('city')),
        phone: normSpace(get('phone')),
        lat: ll ? ll[0] : null,
        lon: ll ? ll[1] : null
      });
    });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Profil prospek, keuangan, struktur organisasi
  // ---------------------------------------------------------------------------

  var PROFILE_BASE_FIELDS = ['name', 'entity', 'lat', 'lon', 'address', 'city', 'phone', 'email', 'website', 'category', 'osm', 'operator', 'tags'];

  function newProfile(base, source) {
    var now = Date.now();
    var p = {
      id: base.id || uid(source === 'import' ? 'imp:' : 'man:'),
      source: source || base.source || 'manual',
      status: 'baru', plafond: null, produk: '', bidang: '', pic: '', followUp: '', catatan: '',
      isNasabah: false, tahunBerdiri: '', sumberData: '', pengurus: [], keuangan: [],
      geo: base.lat != null ? (base.geo || 'exact') : 'none',
      createdAt: now, updatedAt: now
    };
    PROFILE_BASE_FIELDS.forEach(function (f) { if (base[f] != null) p[f] = base[f]; });
    if (!p.entity) p.entity = detectEntity(p.name) || 'Lainnya';
    if (!p.name) p.name = '';
    return p;
  }

  // Terapkan rekaman impor ke profil (yang ada atau baru). Kolom kosong di Excel tidak menghapus isian lama.
  function applyRecord(profile, rec) {
    ['name', 'address', 'city', 'phone', 'email', 'website', 'bidang', 'pic', 'produk', 'followUp', 'catatan',
      'category', 'sumberData', 'tahunBerdiri'].forEach(function (f) {
      if (rec[f]) profile[f] = rec[f];
    });
    if (rec.entity && (rec.entity !== 'Lainnya' || !profile.entity)) profile.entity = rec.entity;
    if (rec.status) profile.status = rec.status;
    if (rec.plafond != null) profile.plafond = rec.plafond;
    if (rec.isNasabah != null) profile.isNasabah = rec.isNasabah;
    if (rec.lat != null && rec.lon != null) {
      profile.lat = rec.lat; profile.lon = rec.lon;
      profile.geo = rec.geo || 'exact';
    }
    profile.pengurus = profile.pengurus || [];
    profile.keuangan = profile.keuangan || [];
    (rec.pengurus || []).forEach(function (p) { addPerson(profile.pengurus, p); });
    (rec.keuangan || []).forEach(function (f) { addFinance(profile.keuangan, f); });
    profile.updatedAt = Date.now();
    return profile;
  }

  // Cari profil yang sama untuk rekaman impor: berdasarkan ID, lalu nama + lokasi berdekatan.
  function matchProfile(profiles, rec) {
    if (rec.id && profiles[rec.id]) return profiles[rec.id];
    var key = companyKey(rec.entity, rec.name);
    if (!key) return null;
    var ids = Object.keys(profiles);
    for (var i = 0; i < ids.length; i++) {
      var p = profiles[ids[i]];
      if (companyKey(p.entity, p.name) !== key) continue;
      if (rec.lat == null || p.lat == null) {
        if (!rec.city || !p.city || normKey(rec.city) === normKey(p.city)) return p;
        continue;
      }
      if (haversineKm(rec.lat, rec.lon, p.lat, p.lon) <= 0.5) return p;
    }
    return null;
  }

  function inTarget(plafond, settings) {
    if (plafond == null || !isFinite(plafond)) return null;
    return plafond >= settings.targetMin && plafond <= settings.targetMax;
  }

  function financeView(keuangan) {
    var rows = (keuangan || []).filter(function (f) {
      return f && FIN_KEYS.some(function (k) { return f[k] != null; });
    }).map(function (f) { return Object.assign({}, f); });
    rows.sort(function (a, b) { return (a.tahun || 0) - (b.tahun || 0); });
    rows.forEach(function (r, i) {
      var ek = r.ekuitas != null ? r.ekuitas : (r.aset != null && r.liabilitas != null ? r.aset - r.liabilitas : null);
      r.ekuitasHitung = r.ekuitas == null && ek != null;
      r.ekuitasEfektif = ek;
      r.npm = r.laba != null && r.penjualan ? r.laba / r.penjualan : null;
      r.roa = r.laba != null && r.aset ? r.laba / r.aset : null;
      r.der = r.liabilitas != null && ek ? r.liabilitas / ek : null;
      var prev = i > 0 ? rows[i - 1] : null;
      r.growth = prev && prev.penjualan && r.penjualan != null && r.tahun && prev.tahun && r.tahun - prev.tahun === 1
        ? (r.penjualan - prev.penjualan) / prev.penjualan : null;
    });
    return rows;
  }

  // Rasio untuk satu baris keuangan; pertumbuhan dibanding baris tahun sebelumnya bila ada.
  function ratiosFor(rows, i) {
    var r = rows[i] || {};
    var ek = r.ekuitas != null ? r.ekuitas : (r.aset != null && r.liabilitas != null ? r.aset - r.liabilitas : null);
    var prev = null;
    if (r.tahun) {
      for (var j = 0; j < rows.length; j++) if (j !== i && rows[j] && rows[j].tahun === r.tahun - 1) prev = rows[j];
    }
    return {
      ekuitas: ek,
      npm: r.laba != null && r.penjualan ? r.laba / r.penjualan : null,
      roa: r.laba != null && r.aset ? r.laba / r.aset : null,
      der: r.liabilitas != null && ek ? r.liabilitas / ek : null,
      growth: prev && prev.penjualan && r.penjualan != null ? (r.penjualan - prev.penjualan) / prev.penjualan : null
    };
  }

  var ORG_LEVELS = [
    { id: 'saham', title: 'Pemegang saham' },
    { id: 'komisaris', title: 'Dewan Komisaris' },
    { id: 'direksi', title: 'Direksi' },
    { id: 'sekutu_aktif', title: 'Sekutu aktif (pengurus)' },
    { id: 'sekutu_pasif', title: 'Sekutu pasif (komanditer)' },
    { id: 'pemilik', title: 'Pemilik' },
    { id: 'manajemen', title: 'Manajemen & kontak' }
  ];

  function orgLevels(pengurus, entity) {
    var lv = {};
    ORG_LEVELS.forEach(function (l) { lv[l.id] = []; });
    (pengurus || []).forEach(function (p) {
      if (!p || !normSpace(p.nama)) return;
      var share = p.saham == null || p.saham === '' ? null : +p.saham;
      var j = p.jabatan || 'Lainnya';
      var m = { nama: normSpace(p.nama), jabatan: j, saham: share };
      if ((share && share > 0) || j === 'Pemegang Saham') lv.saham.push(m);
      if (j === 'Komisaris Utama' || j === 'Komisaris') lv.komisaris.push(m);
      else if (j === 'Direktur Utama' || j === 'Direktur') lv.direksi.push(m);
      else if (j === 'Sekutu Aktif') lv.sekutu_aktif.push(m);
      else if (j === 'Sekutu Pasif') lv.sekutu_pasif.push(m);
      else if (j === 'Pemilik') lv.pemilik.push(m);
      else if (j !== 'Pemegang Saham') lv.manajemen.push(m);
    });
    lv.saham.sort(function (a, b) { return (b.saham || 0) - (a.saham || 0); });
    function utamaFirst(a, b) { return (/Utama/.test(b.jabatan) ? 1 : 0) - (/Utama/.test(a.jabatan) ? 1 : 0); }
    lv.komisaris.sort(utamaFirst);
    lv.direksi.sort(utamaFirst);
    return ORG_LEVELS.filter(function (l) { return lv[l.id].length; }).map(function (l) {
      var title = l.title;
      if (l.id === 'saham' && entity && entity !== 'PT' && entity !== 'Tbk' && entity !== 'BUMN') title = 'Komposisi modal';
      return { id: l.id, title: title, members: lv[l.id] };
    });
  }

  function validateMaxRadius(max, r3) {
    if (!(max > 0)) return 'Isi jangkauan maksimal deteksi.';
    if (!(max > r3)) return 'Jangkauan maksimal harus lebih besar dari batas zona hijau.';
    if (max > 50) return 'Jangkauan maksimal 50 km agar deteksi tetap ringan.';
    return null;
  }

  function validateRadii(r) {
    if (!Array.isArray(r) || r.length !== 3) return 'Isi tiga radius zona.';
    for (var i = 0; i < 3; i++) if (!(r[i] > 0)) return 'Radius zona harus lebih dari 0 km.';
    if (!(r[0] < r[1] && r[1] < r[2])) return 'Radius harus naik: merah < oranye < hijau.';
    if (r[2] > 30) return 'Radius hijau maksimal 30 km agar deteksi tetap ringan.';
    return null;
  }

  function mergeSettings(saved) {
    var s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!saved || typeof saved !== 'object') return s;
    Object.keys(s).forEach(function (k) {
      if (saved[k] === undefined) return;
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && saved[k] && typeof saved[k] === 'object') {
        Object.assign(s[k], saved[k]);
      } else {
        s[k] = saved[k];
      }
    });
    if (validateRadii(s.radii)) s.radii = DEFAULT_SETTINGS.radii.slice();
    s.maxRadius = +s.maxRadius;
    if (validateMaxRadius(s.maxRadius, s.radii[2])) s.maxRadius = Math.min(50, Math.max(DEFAULT_SETTINGS.maxRadius, s.radii[2] + 5));
    return s;
  }

  function safeUrl(u) {
    var s = normSpace(u);
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    try {
      var url = new URL(s);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  return {
    ZONE_IDS: ZONE_IDS, ZONE_LABEL: ZONE_LABEL, ENTITIES: ENTITIES, ENTITY_LABEL: ENTITY_LABEL,
    STATUSES: STATUSES, STATUS_LABEL: STATUS_LABEL, BRANCH_TYPES: BRANCH_TYPES, JABATAN: JABATAN, PRODUK: PRODUK,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, INDONESIA_BBOX: INDONESIA_BBOX, ORG_LEVELS: ORG_LEVELS,
    MAIN_FIELDS: MAIN_FIELDS, PEOPLE_FIELDS: PEOPLE_FIELDS, FINANCE_FIELDS: FINANCE_FIELDS, BRANCH_FIELDS: BRANCH_FIELDS,
    esc: esc, normSpace: normSpace, normKey: normKey, coreName: coreName, companyKey: companyKey, uid: uid, round6: round6,
    haversineKm: haversineKm, zoneFor: zoneFor, nearestBranch: nearestBranch, bboxAround: bboxAround,
    cellKey: cellKey, cellBounds: cellBounds, cellsForBBox: cellsForBBox, groupCells: groupCells, inIndonesia: inIndonesia,
    detectEntity: detectEntity, normEntity: normEntity, branchQuery: branchQuery, companyQuery: companyQuery,
    qlStr: qlStr, OVERPASS_ENTITY_RE: OVERPASS_ENTITY_RE, elementLatLon: elementLatLon, formatAddress: formatAddress,
    isExcluded: isExcluded, categoryOf: categoryOf, parseCompanies: parseCompanies, dedupeCompanies: dedupeCompanies,
    parseBranches: parseBranches, dedupeBranches: dedupeBranches, branchType: branchType, normBranchType: normBranchType,
    parseNumberID: parseNumberID, parseMoneyCell: parseMoneyCell, unitFromHeader: unitFromHeader,
    formatRupiah: formatRupiah, formatRpShort: formatRpShort, formatKm: formatKm, formatPct: formatPct,
    formatCount: formatCount, formatDate: formatDate, relTime: relTime, isoDate: isoDate, parseDateCell: parseDateCell,
    parseYear: parseYear, parsePercent: parsePercent, parseCoordValue: parseCoordValue, fixLatLon: fixLatLon,
    parseLatLonPair: parseLatLonPair, mapHeaders: mapHeaders, sheetTable: sheetTable, normJabatan: normJabatan,
    normStatus: normStatus, normProduk: normProduk, parseBool: parseBool, splitPeople: splitPeople, addPerson: addPerson,
    addFinance: addFinance, convertProspectSheets: convertProspectSheets, convertBranchSheet: convertBranchSheet,
    newProfile: newProfile, applyRecord: applyRecord, matchProfile: matchProfile, inTarget: inTarget,
    financeView: financeView, ratiosFor: ratiosFor, orgLevels: orgLevels, validateRadii: validateRadii,
    validateMaxRadius: validateMaxRadius, mergeSettings: mergeSettings,
    safeUrl: safeUrl, FIN_KEYS: FIN_KEYS
  };
});
