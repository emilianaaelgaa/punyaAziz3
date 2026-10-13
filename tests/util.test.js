// Tes unit fungsi murni. Jalankan: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/util.js');

test('deteksi badan usaha dari nama', () => {
  const cases = [
    ['PT Maju Jaya Abadi', 'PT'],
    ['PT. Sinar Terang', 'PT'],
    ['P.T. Sinar Terang', 'PT'],
    ['PT.Sinar Terang', 'PT'],
    ['Gudang PT Sumber Rejeki', 'PT'],
    ['Sumber Rejeki, PT', 'PT'],
    ['CV Karya Mandiri', 'CV'],
    ['CV.Karya Mandiri', 'CV'],
    ['UD Sumber Pangan', 'UD'],
    ['PD Sido Makmur', 'PD'],
    ['Koperasi Karyawan Sejahtera', 'Koperasi'],
    ['KSP Mitra Usaha', 'Koperasi'],
    ['PT Astra International Tbk', 'Tbk'],
    ['PT Pertamina (Persero)', 'BUMN'],
    ['Apotek Sehat', null],
    ['PDAM Tirta Moedal', null],
    ['Ptolemy Cafe', null],
    ['Dr. Budi S.Pt', null],
    ['Perum Griya Asri', null]
  ];
  for (const [name, want] of cases) assert.equal(U.detectEntity(name), want, name);
});

test('nama inti untuk deduplikasi', () => {
  assert.equal(U.coreName('PT. Maju Jaya Tbk'), 'majujaya');
  assert.equal(U.coreName('P.T. Maju Jaya'), 'majujaya');
  assert.equal(U.companyKey('PT', 'PT Maju Jaya'), U.companyKey('PT', 'Maju Jaya, PT'));
  assert.notEqual(U.companyKey('PT', 'PT Maju'), U.companyKey('CV', 'CV Maju'));
});

test('jarak dan zona', () => {
  const d = U.haversineKm(-6.2088, 106.8456, -6.1754, 106.8272);
  assert.ok(d > 4.2 && d < 4.4, 'Monas–Bundaran HI ±4,3 km, dapat ' + d);
  const r = [1, 5, 10];
  assert.equal(U.zoneFor(0.5, r), 'red');
  assert.equal(U.zoneFor(1, r), 'red');
  assert.equal(U.zoneFor(3, r), 'orange');
  assert.equal(U.zoneFor(7.5, r), 'green');
  assert.equal(U.zoneFor(10.01, r), 'out');
  assert.equal(U.zoneFor(null, r), 'out');
});

test('cabang terdekat sama dengan pencarian brute force', () => {
  const branches = [];
  for (let i = 0; i < 300; i++) branches.push({ id: i, lat: -8 + Math.random() * 10, lon: 100 + Math.random() * 30 });
  for (let k = 0; k < 50; k++) {
    const lat = -8 + Math.random() * 10, lon = 100 + Math.random() * 30;
    let best = null, bd = Infinity;
    for (const b of branches) { const d = U.haversineKm(lat, lon, b.lat, b.lon); if (d < bd) { bd = d; best = b; } }
    const got = U.nearestBranch(lat, lon, branches);
    assert.equal(got.branch.id, best.id);
  }
  assert.equal(U.nearestBranch(0, 0, []), null);
});

test('sel grid', () => {
  assert.equal(U.cellKey(-6.2, 106.8), '-62_1068');
  assert.equal(U.cellKey(-6.2088, 106.8456), '-63_1068');
  const keys = U.cellsForBBox([-6.25, 106.75, -6.05, 106.95]);
  assert.equal(keys.length, 9);
  assert.equal(U.groupCells(keys, 3).length, 1, '3x3 sel cukup satu permintaan');
  const wide = U.cellsForBBox([-6.9, 106.1, -6.0, 107.0]);
  assert.ok(U.groupCells(wide, 3).length > 1, 'area luas dipecah');
  const groups = U.groupCells(keys.concat(wide), 3);
  const all = groups.flatMap(g => g.keys);
  for (const k of keys.concat(wide)) assert.ok(all.includes(k));
  for (const g of groups) {
    for (const k of g.keys) {
      const b = U.cellBounds(k);
      assert.ok(b[0] >= g.bbox[0] - 1e-9 && b[2] <= g.bbox[2] + 1e-9 && b[1] >= g.bbox[1] - 1e-9 && b[3] <= g.bbox[3] + 1e-9);
    }
  }
});

test('query Overpass terbentuk dan regex di-escape', () => {
  const q = U.companyQuery([-6.3, 106.7, -6.1, 106.9], true);
  assert.match(q, /^\[out:json\]/);
  assert.match(q, /out center tags;$/);
  assert.ok(q.includes('P\\\\.? ?T'), 'backslash digandakan untuk string QL');
  assert.ok(q.includes('["man_made"="works"]'));
  const q2 = U.companyQuery([-6.3, 106.7, -6.1, 106.9], false);
  assert.ok(!q2.includes('man_made'));
  const bq = U.branchQuery();
  assert.ok(bq.includes('"amenity"="bank"'));
  // regex Overpass (POSIX) diuji juga dengan RegExp JS untuk sampel umum
  const re = new RegExp(U.OVERPASS_ENTITY_RE, 'i');
  for (const n of ['PT Maju', 'PT.Maju', 'Gudang CV Sinar', 'UD Rejeki', 'Koperasi Sejahtera', 'Astra Tbk', 'Bank X (Persero)', 'PD Sido Makmur']) {
    assert.ok(re.test(n), n);
  }
  for (const n of ['Apotek Sehat', 'Perum Griya', 'Ptolemy']) assert.ok(!re.test(n), n);
});

test('parsing elemen OSM perusahaan', () => {
  const elements = [
    { type: 'node', id: 1, lat: -6.2, lon: 106.8, tags: { name: 'PT Maju Jaya', office: 'company', phone: '021-555', 'addr:street': 'Jl. Sudirman', 'addr:housenumber': '5', 'addr:city': 'Jakarta' } },
    { type: 'way', id: 2, center: { lat: -6.2001, lon: 106.8001 }, tags: { name: 'PT Maju Jaya', building: 'industrial' } },
    { type: 'node', id: 3, lat: -6.21, lon: 106.81, tags: { name: 'Bank Mandiri', amenity: 'bank', operator: 'PT Bank Mandiri (Persero) Tbk' } },
    { type: 'node', id: 4, lat: -6.22, lon: 106.82, tags: { name: 'Gudang Beras Sentosa', operator: 'CV Sentosa Pangan', building: 'warehouse' } },
    { type: 'node', id: 5, lat: -6.23, lon: 106.83, tags: { name: 'Halte PT Maju', highway: 'bus_stop' } },
    { type: 'node', id: 6, lat: -6.24, lon: 106.84, tags: { name: 'Hotel Melati', tourism: 'hotel' } },
    { type: 'node', id: 7, lat: -6.25, lon: 106.85, tags: { name: 'Indomaret', shop: 'convenience', brand: 'Indomaret', operator: 'PT Indomarco Prismatama' } },
    { type: 'node', id: 8, lat: -6.26, lon: 106.86, tags: { name: 'PT Lama', 'disused:office': 'company' } }
  ];
  const pt = U.parseCompanies(elements, { includeOthers: false });
  assert.deepEqual(pt.map(c => c.id).sort(), ['osm:n1', 'osm:n4', 'osm:w2']);
  const viaOp = pt.find(c => c.id === 'osm:n4');
  assert.equal(viaOp.entity, 'CV');
  assert.equal(viaOp.viaOperator, true);
  const first = pt.find(c => c.id === 'osm:n1');
  assert.equal(first.address, 'Jl. Sudirman No. 5, Jakarta');
  assert.equal(first.category, 'Kantor perusahaan');
  const all = U.parseCompanies(elements, { includeOthers: true });
  assert.ok(all.some(c => c.id === 'osm:n6' && c.entity === 'Lainnya' && c.category === 'Hotel'));
  const dd = U.dedupeCompanies(pt);
  assert.equal(dd.length, 2);
  const merged = dd.find(c => c.name === 'PT Maju Jaya');
  assert.equal(merged.id, 'osm:n1');
  assert.deepEqual(merged.altIds, ['osm:w2']);
});

test('parsing cabang BNI', () => {
  const elements = [
    { type: 'node', id: 10, lat: -7.14, lon: 110.40, tags: { amenity: 'bank', name: 'BNI KCP Ungaran', 'addr:city': 'Ungaran' } },
    { type: 'way', id: 11, center: { lat: -7.14001, lon: 110.40001 }, tags: { amenity: 'bank', name: 'BNI KCP Ungaran', building: 'yes' } },
    { type: 'node', id: 12, lat: -6.98, lon: 110.41, tags: { amenity: 'bank', name: 'BNI', brand: 'BNI', 'addr:street': 'Jl. Pemuda' } },
    { type: 'node', id: 13, lat: -6.99, lon: 110.42, tags: { amenity: 'bank', name: 'BNI Syariah Semarang' } },
    { type: 'node', id: 14, lat: -6.97, lon: 110.43, tags: { amenity: 'bank', name: 'ATM BNI' } },
    { type: 'node', id: 15, lat: -6.96, lon: 110.44, tags: { amenity: 'bank', name: 'Bank Mandiri' } },
    { type: 'node', id: 16, lat: -6.95, lon: 110.45, tags: { amenity: 'bank', name: 'Kantor Cabang Semarang', operator: 'PT Bank Negara Indonesia (Persero) Tbk' } },
    { type: 'node', id: 17, lat: -6.94, lon: 110.46, tags: { amenity: 'bank', name: 'BNI Kantor Kas Pasar Johar' } }
  ];
  const b = U.parseBranches(elements);
  assert.deepEqual(b.map(x => x.id), ['osm:n10', 'osm:n12', 'osm:n16', 'osm:n17']);
  assert.equal(b[0].type, 'KCP');
  assert.equal(b[1].name, 'BNI Jl. Pemuda');
  assert.equal(b[2].type, 'KC');
  assert.equal(b[3].type, 'KK');
});

test('angka rupiah', () => {
  assert.equal(U.parseNumberID('Rp 2.500.000.000'), 2.5e9);
  assert.equal(U.parseNumberID('2,5 M'), 2.5e9);
  assert.equal(U.parseNumberID('2.5m'), 2.5e9);
  assert.equal(U.parseNumberID('750 jt'), 7.5e8);
  assert.equal(U.parseNumberID('1,500,000'), 1.5e6);
  assert.equal(U.parseNumberID('1500000'), 1.5e6);
  assert.equal(U.parseNumberID('(1.000)'), -1000);
  assert.equal(U.parseNumberID('abc'), null);
  assert.equal(U.parseNumberID(''), null);
  assert.equal(U.parseMoneyCell(2.5, 1, true), 2.5e9);
  assert.equal(U.parseMoneyCell('750', 1, true), 7.5e8);
  assert.equal(U.parseMoneyCell(3, 1e9), 3e9);
  assert.equal(U.parseMoneyCell('3 M', 1e6), 3e9, 'satuan pada isian menang');
  assert.equal(U.formatRpShort(2.5e9), 'Rp 2,5 M');
  assert.equal(U.formatRpShort(7.5e8), 'Rp 750 jt');
  assert.equal(U.formatRupiah(1500000), 'Rp 1.500.000');
  assert.equal(U.formatKm(0.823), '820 m');
  assert.equal(U.formatKm(4.25), '4,3 km');
});

test('koordinat', () => {
  assert.deepEqual(U.parseLatLonPair('-6.2088, 106.8456'), [-6.2088, 106.8456]);
  assert.deepEqual(U.parseLatLonPair('-6,2088; 106,8456'), [-6.2088, 106.8456]);
  assert.deepEqual(U.parseLatLonPair('https://www.google.com/maps/@-6.2088,106.8456,17z'), [-6.2088, 106.8456]);
  // Tautan tempat: koordinat tempat (!3d/!4d) dipakai, bukan pusat layar (@)
  assert.deepEqual(U.parseLatLonPair('https://www.google.com/maps/place/PT+Maju/@-7.10,110.30,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d-7.1386!4d110.4053'), [-7.1386, 110.4053]);
  assert.deepEqual(U.fixLatLon(106.8456, -6.2088), [-6.2088, 106.8456], 'tertukar diperbaiki');
  assert.equal(U.fixLatLon(0, 0), null);
  assert.equal(U.parseLatLonPair('Jl. Sudirman'), null);
});

test('tanggal dan persen', () => {
  assert.equal(U.parseDateCell('13/10/2026'), '2026-10-13');
  assert.equal(U.parseDateCell('2026-10-13'), '2026-10-13');
  assert.equal(U.parseDateCell(46308), '2026-10-13');
  assert.equal(U.parseYear('FY2024'), 2024);
  assert.equal(U.parsePercent('60%'), 60);
  assert.equal(U.parsePercent(0.6), 60);
  assert.equal(U.parsePercent('40'), 40);
});

test('impor prospek dari lembar Excel', () => {
  const main = [
    ['Daftar prospek KCP Ungaran'],
    [],
    ['No', 'Nama Perusahaan', 'Badan Usaha', 'Alamat', 'Kota', 'Koordinat', 'Plafond (Rp miliar)', 'Status', 'Direktur Utama', 'Pemegang Saham', 'Tahun', 'Omzet', 'Laba Bersih', 'Kolom Aneh'],
    [1, 'PT Maju Jaya', 'PT', 'Jl. Gatot Subroto 5', 'Semarang', '-7.0051, 110.4381', 2.5, 'kunjungan', 'Budi Santoso', 'Budi Santoso (60%); Ani Wijaya (40%)', 2024, 12000000000, 900000000, 'x'],
    [2, 'PT Maju Jaya', '', '', 'Semarang', '', '', '', '', '', 2023, 10000000000, 700000000, ''],
    [3, 'CV Sinar (contoh)', 'CV', '', '', '', '', '', '', '', '', '', '', ''],
    [4, '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [5, 'Toko Bangunan Sentosa', 'UD', 'Jl. Pemuda 1', 'Semarang', '', '0,75', 'baru', '', '', '', '', '', '']
  ];
  const people = [
    ['Perusahaan', 'Nama', 'Jabatan', 'Saham (%)'],
    ['PT Maju Jaya', 'Ani Wijaya', 'Komisaris Utama', '']
  ];
  const res = U.convertProspectSheets(main, people, null);
  assert.equal(res.error, undefined);
  assert.equal(res.headerRow, 2);
  assert.equal(res.records.length, 2);
  const a = res.records[0];
  assert.equal(a.name, 'PT Maju Jaya');
  assert.equal(a.lat, -7.0051);
  assert.equal(a.plafond, 2.5e9);
  assert.equal(a.status, 'kunjungan');
  assert.equal(a.keuangan.length, 2);
  assert.deepEqual(a.pengurus.map(p => [p.nama, p.jabatan, p.saham]), [
    ['Budi Santoso', 'Direktur Utama', null],
    ['Budi Santoso', 'Pemegang Saham', 60],
    ['Ani Wijaya', 'Pemegang Saham', 40],
    ['Ani Wijaya', 'Komisaris Utama', null]
  ]);
  const b = res.records[1];
  assert.equal(b.entity, 'UD');
  assert.equal(b.plafond, 7.5e8);
  assert.equal(b.lat, null);
  assert.ok(res.unknownHeaders.includes('Kolom Aneh'));
  assert.ok(res.skipped.some(s => s.reason === 'Nama kosong'));

  const fv = U.financeView(a.keuangan);
  assert.equal(fv[0].tahun, 2023);
  assert.ok(Math.abs(fv[1].growth - 0.2) < 1e-9);
  assert.ok(Math.abs(fv[1].npm - 0.075) < 1e-9);

  const org = U.orgLevels(a.pengurus, a.entity);
  assert.deepEqual(org.map(l => l.id), ['saham', 'komisaris', 'direksi']);
  assert.equal(org[0].members[0].nama, 'Budi Santoso');
});

test('profil: buat, cocokkan, terapkan rekaman', () => {
  const profiles = {};
  const rec = { name: 'PT Maju Jaya', entity: 'PT', lat: -7.0051, lon: 110.4381, plafond: 2e9, status: 'kunjungan', pengurus: [{ nama: 'Budi', jabatan: 'Direktur', saham: null }], keuangan: [] };
  const p = U.newProfile({ name: rec.name, entity: rec.entity, lat: rec.lat, lon: rec.lon }, 'import');
  U.applyRecord(p, rec);
  profiles[p.id] = p;
  assert.ok(p.id.startsWith('imp:'));
  assert.equal(p.status, 'kunjungan');
  const again = { name: 'Maju Jaya, PT', entity: 'PT', lat: -7.0052, lon: 110.4382, plafond: null, status: '', pengurus: [{ nama: 'budi', jabatan: 'Direktur', saham: 10 }], keuangan: [] };
  const found = U.matchProfile(profiles, again);
  assert.equal(found, p);
  U.applyRecord(found, again);
  assert.equal(found.plafond, 2e9, 'nilai kosong tidak menghapus');
  assert.equal(found.status, 'kunjungan');
  assert.equal(found.pengurus.length, 1);
  assert.equal(found.pengurus[0].saham, 10);
  assert.equal(U.inTarget(2e9, U.DEFAULT_SETTINGS), true);
  assert.equal(U.inTarget(30e9, U.DEFAULT_SETTINGS), false);
  assert.equal(U.inTarget(null, U.DEFAULT_SETTINGS), null);
});

test('impor cabang', () => {
  const rows = [
    ['Kode', 'Nama Cabang', 'Jenis', 'Alamat', 'Latitude', 'Longitude'],
    ['123', 'KCP Ungaran', 'KCP', 'Jl. Diponegoro', '-7,1390', '110,4050'],
    ['124', 'BNI Semarang', 'Kantor Cabang', '', '', '']
  ];
  const res = U.convertBranchSheet(rows);
  assert.equal(res.records.length, 2);
  assert.equal(res.records[0].name, 'BNI KCP Ungaran');
  assert.equal(res.records[0].type, 'KCP');
  assert.equal(res.records[0].lat, -7.139);
  assert.equal(res.records[1].type, 'KC');
  assert.equal(res.records[1].lat, null);
});

test('pengaturan dan URL', () => {
  assert.equal(U.validateRadii([1, 5, 10]), null);
  assert.ok(U.validateRadii([5, 1, 10]));
  const s = U.mergeSettings({ radii: [2, 4, 8], entityFilter: { Tbk: true }, unknownKey: 1 });
  assert.deepEqual(s.radii, [2, 4, 8]);
  assert.equal(s.entityFilter.Tbk, true);
  assert.equal(s.entityFilter.PT, true);
  assert.equal(s.unknownKey, undefined);
  assert.deepEqual(U.mergeSettings({ radii: [5, 1, 2] }).radii, [1, 5, 10]);
  assert.equal(U.mergeSettings(null).maxRadius, 20);
  assert.equal(U.mergeSettings({ maxRadius: 35 }).maxRadius, 35);
  assert.equal(U.mergeSettings({ radii: [1, 5, 25], maxRadius: 20 }).maxRadius, 30, 'jangkauan dinaikkan di atas zona hijau');
  assert.equal(U.mergeSettings({ maxRadius: 500 }).maxRadius, 20);
  assert.equal(U.validateMaxRadius(20, 10), null);
  assert.ok(U.validateMaxRadius(10, 10));
  assert.ok(U.validateMaxRadius(60, 10));
  assert.equal(U.safeUrl('www.contoh.co.id'), 'https://www.contoh.co.id/');
  assert.equal(U.safeUrl('javascript:alert(1)'), '');
  assert.equal(U.esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('Google: konversi hasil tempat', () => {
  const base = { id: 'abc', name: 'PT Sinar Jaya', lat: -7.13, lon: 110.41, address: 'Jl. A', types: ['corporate_office', 'point_of_interest'], businessStatus: 'OPERATIONAL' };
  const c = U.googlePlaceToCompany(base, false);
  assert.equal(c.id, 'g:abc');
  assert.equal(c.entity, 'PT');
  assert.equal(c.category, 'Kantor perusahaan');
  assert.match(c.mapsUrl, /query_place_id=abc/);
  assert.equal(U.googlePlaceToCompany({ ...base, businessStatus: 'CLOSED_PERMANENTLY' }), null, 'tutup permanen');
  assert.equal(U.googlePlaceToCompany({ ...base, name: 'PT Bank Mandiri (Persero) Tbk', types: ['bank'] }), null, 'bank dikecualikan');
  assert.equal(U.googlePlaceToCompany({ ...base, name: 'Toko Sumber Rejeki' }, false), null, 'tanpa label PT/CV');
  assert.equal(U.googlePlaceToCompany({ ...base, name: 'Toko Sumber Rejeki' }, true).entity, 'Lainnya');
  assert.equal(U.googleCategory(['some_new_type', 'establishment']), 'Some new type');
  assert.equal(U.googleCategory(['store', 'hardware_store']), 'Toko besi / perkakas');
});

test('Google: pencarian per petak dipecah saat penuh & mendahulukan pusat', async () => {
  // 30 tempat "PT" berkumpul di dekat pusat, 3 tempat jauh
  const center = { lat: -7.1386, lon: 110.4053 };
  const places = [];
  // Tersebar ±3 km di timur laut pusat (jarak antar-titik ±660 m)
  for (let i = 0; i < 30; i++) places.push({ id: 'n' + i, name: 'PT Dekat ' + i, lat: center.lat + 0.0005 + (i % 6) * 0.006, lon: center.lon + 0.0005 + Math.floor(i / 6) * 0.006 });
  for (let i = 0; i < 3; i++) places.push({ id: 'f' + i, name: 'PT Jauh ' + i, lat: center.lat + 0.12, lon: center.lon + 0.05 * i });
  let calls = 0;
  const cache = new Map();
  const search = async (term, b) => {
    const k = term + b.join();
    if (cache.has(k)) return { places: cache.get(k), cached: true };
    calls++;
    const hit = places.filter((p) => p.name.startsWith(term) && p.lat >= b[0] && p.lat <= b[2] && p.lon >= b[1] && p.lon <= b[3]).slice(0, 20);
    cache.set(k, hit);
    return { places: hit, cached: false };
  };
  const job = U.createGoogleJob({ lat: center.lat, lon: center.lon, radiusKm: 20, terms: ['PT'] });
  assert.equal(job.queue.length, 1, 'mulai dari satu petak besar');
  assert.equal(U.splitBBox([0, 0, 4, 4], 4).length, 16);
  assert.deepEqual(U.splitBBox([0, 0, 2, 2]), [[0, 0, 1, 1], [0, 1, 1, 2], [1, 0, 2, 1], [1, 1, 2, 2]]);
  const used1 = await U.runGoogleJob(job, search, 10);
  assert.equal(used1, 10);
  // Petak pusat diproses lebih dulu dan petak yang penuh dipecah, jadi 30 tempat dekat sudah terkumpul
  const near = [...job.found.keys()].filter((k) => k.startsWith('n')).length;
  assert.equal(near, 30);
  assert.equal(job.done, false);
  // Lanjutkan sampai habis: tempat jauh ikut terambil
  await U.runGoogleJob(job, search, 500);
  assert.equal(job.done, true);
  assert.equal(job.found.size, 33);
  assert.equal(job.calls, calls);
  // Pekerjaan baru untuk area yang sama memakai cache: tidak ada panggilan baru
  const again = U.createGoogleJob({ lat: center.lat, lon: center.lon, radiusKm: 20, terms: ['PT'] });
  const used2 = await U.runGoogleJob(again, search, 3);
  assert.equal(used2, 0, 'semua petak sudah ada di cache');
  assert.equal(again.found.size, 33);
  assert.equal(again.done, true);
  // Petak di luar lingkaran radius tidak masuk antrean
  const small = U.createGoogleJob({ lat: center.lat, lon: center.lon, radiusKm: 20, terms: ['PT', 'CV'], startKm: 6 });
  assert.ok(small.queue.length > 2 && small.queue.every((t) => t.d <= 20), 'petak di luar lingkaran tidak masuk antrean');
  // Daerah sepi: satu pencarian per kata kunci sudah selesai
  const sparse = U.createGoogleJob({ lat: 0, lon: 120, radiusKm: 20, terms: ['PT', 'CV'] });
  const usedSparse = await U.runGoogleJob(sparse, async () => ({ places: [{ id: 'x' }], cached: false }), 40);
  assert.equal(usedSparse, 2);
  assert.equal(sparse.done, true);
});
