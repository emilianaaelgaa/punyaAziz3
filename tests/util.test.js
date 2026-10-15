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
    { type: 'node', id: 17, lat: -6.94, lon: 110.46, tags: { amenity: 'bank', name: 'BNI Kantor Kas Pasar Johar' } },
    // Nama cabang di tag branch, dan kantor yang hanya bertanda brand:wikidata
    { type: 'node', id: 18, lat: -7.01, lon: 110.47, tags: { amenity: 'bank', name: 'BNI', brand: 'BNI', branch: 'KCP Tlogosari', 'addr:street': 'Jl. Fatmawati' } },
    { type: 'node', id: 19, lat: -7.02, lon: 110.48, tags: { amenity: 'bank', name: 'Kantor Cabang Pembantu Pedurungan', 'brand:wikidata': 'Q2882611' } },
    // ATM: "BNI ... & ATM" tetap kantor, "BNI ATM Center" bukan
    { type: 'node', id: 20, lat: -7.03, lon: 110.49, tags: { amenity: 'bank', name: 'BNI KCP Undip & ATM' } },
    { type: 'node', id: 21, lat: -7.04, lon: 110.50, tags: { amenity: 'bank', name: 'BNI ATM Center' } },
    { type: 'node', id: 22, lat: -7.05, lon: 110.51, tags: { amenity: 'bank', name: 'Bank BNI Capem Sako', alt_name: 'BNI Sako' } },
    { type: 'node', id: 23, lat: -7.06, lon: 110.52, tags: { amenity: 'bank', name: 'Bank BNI' } }
  ];
  const b = U.parseBranches(elements);
  assert.deepEqual(b.map(x => x.id), ['osm:n10', 'osm:n12', 'osm:n16', 'osm:n17', 'osm:n18', 'osm:n19', 'osm:n20', 'osm:n22', 'osm:n23']);
  const by = Object.fromEntries(b.map(x => [x.id, x]));
  assert.equal(by['osm:n10'].type, 'KCP');
  assert.equal(by['osm:n12'].name, 'BNI Jl. Pemuda');
  assert.equal(by['osm:n12'].generic, true, 'nama umum ditandai');
  assert.equal(by['osm:n16'].type, 'KC');
  assert.equal(by['osm:n17'].type, 'KK');
  assert.equal(by['osm:n18'].name, 'BNI KCP Tlogosari');
  assert.equal(by['osm:n18'].type, 'KCP');
  assert.equal(by['osm:n18'].generic, undefined);
  assert.equal(by['osm:n19'].type, 'KCP');
  assert.equal(by['osm:n22'].type, 'KCP', 'capem = cabang pembantu');
  assert.match(by['osm:n22'].alt, /BNI Sako/);
  assert.equal(by['osm:n23'].name, 'BNI');
  assert.ok(U.branchQuery().includes('"brand:wikidata"="Q2882611"'));
});

test('kantor BNI dari Overture: saring, rapikan, buang duplikat', () => {
  const row = (id, name, lat, lon, extra) => Object.assign({ id: id + '-0000-0000-0000-000000000000', name, cat: 'bank_or_credit_union', conf: 0.6, lat, lon, addr: '', city: 'Ungaran', country: 'ID', phone: '' }, extra);
  const rows = [
    row('a1', 'BNI KCP Ungaran / Whatshapp 0816868673', -7.1386, 110.4053, { addr: 'Jl. Diponegoro No. 5', phone: '+62211500046', conf: 0.7 }),
    row('a2', 'Bank Negara Indonesia', -7.1388, 110.4055, { addr: 'Jalan Diponegoro 5', phone: '+6224123456', conf: 0.3 }),
    row('a3', 'ATM BNI Alfamart', -7.15, 110.41, { cat: 'atm' }),
    row('a4', 'Jagung Bakar Samping BNI', -7.16, 110.42, { cat: 'restaurant' }),
    row('a5', 'Bank BNI Syariah PT', -7.17, 110.43),
    row('a6', 'BNI Pinnacle - Singapore', 1.28, 103.85, { country: 'SG' }),
    row('a7', 'Bank Negara Indonesia', -6.9175, 107.6191, { addr: 'Jalan Merdeka 43', city: 'Bandung' }),
    row('a8', 'Bni', -7.2, 110.45, { addr: 'Jalan Raya', city: 'Bawen' }),
    row('a9', 'BNI46 Bukittinggi', -0.305, 100.369, { cat: 'government_office', city: 'Bukittinggi' }),
    row('b1', 'Rumdin Bni', -7.21, 110.46, { cat: 'historic_site' }),
    row('b2', 'BNI Cafe', -7.22, 110.47, { cat: 'cafe' }),
    row('b3', 'Kantor Cabang BNI Salatiga', -7.33, 110.5, { city: 'Salatiga' }),
    row('b4', 'PT. Bank Negara Indonesia (persero) tbk Cabang Jambi', -1.61, 103.61, { cat: 'corporate_or_business_office', city: 'Jambi' }),
    row('b5', 'bank bni plumpang raya', -6.12, 106.9, { city: 'Jakarta Utara' })
  ];
  const out = U.overtureBranches(rows);
  const names = out.map(b => b.name).sort();
  assert.deepEqual(names, ['BNI Bawen', 'BNI Bukittinggi', 'BNI Cabang Jambi', 'BNI Jalan Merdeka', 'BNI KCP Ungaran', 'BNI Plumpang Raya', 'Kantor Cabang BNI Salatiga']);
  const ung = out.find(b => b.name === 'BNI KCP Ungaran');
  assert.equal(ung.id, 'ov:a10000000000');
  assert.equal(ung.source, 'overture');
  assert.equal(ung.type, 'KCP');
  assert.equal(ung.phone, '+6224123456', 'nomor call center dibuang, telepon duplikat dipakai');
  assert.equal(out.find(b => b.name === 'BNI Jalan Merdeka').generic, true);
  assert.equal(out.find(b => b.name === 'Kantor Cabang BNI Salatiga').type, 'KC');
  // Simpan ringkas lalu baca lagi
  const packed = U.packOverture(out, { release: 'uji' });
  assert.equal(packed.release, 'uji');
  const back = U.unpackOverture(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(back.map(b => b.name).sort(), names);
  assert.equal(back.find(b => b.name === 'BNI Jalan Merdeka').generic, true);
  assert.deepEqual(U.unpackOverture({}), []);
});

test('kantor tambahan yang berimpit dengan kantor utama dibuang', () => {
  const base = [{ id: 'osm:n1', name: 'BNI KCP Ungaran', lat: -7.1386, lon: 110.4053 }];
  const at = (m, bearing) => ({ lat: -7.1386 + (bearing === 'n' ? m / 110574 : 0), lon: 110.4053 + (bearing === 'e' ? m / 110400 : 0) });
  const extra = [
    Object.assign({ id: 'ov:1', name: 'BNI Ungaran' }, at(150, 'n')),
    Object.assign({ id: 'ov:2', name: 'BNI KCP Bawen' }, at(150, 'e')),
    Object.assign({ id: 'ov:3', name: 'BNI Jalan Diponegoro', generic: true }, at(200, 'n')),
    Object.assign({ id: 'ov:4', name: 'BNI KC Semarang' }, at(60, 'e')),
    Object.assign({ id: 'ov:5', name: 'BNI Ungaran Barat' }, at(400, 'n'))
  ];
  assert.deepEqual(U.dropNearBranches(extra, base).map(b => b.id), ['ov:2', 'ov:5']);
  assert.equal(U.dropNearBranches(extra, []).length, 5);
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

test('Peluang: klasifikasi sektor dan statistik', () => {
  assert.equal(U.classifySector({ name: 'PT Sinar Ungaran Textile', category: 'Kantor perusahaan' }), 'industri');
  assert.equal(U.classifySector({ name: 'CV Maju Bersama', category: 'Grosir / distributor' }), 'dagang');
  assert.equal(U.classifySector({ name: 'Toko Bangunan Sentosa', category: 'Bahan bangunan' }), 'konstruksi');
  assert.equal(U.classifySector({ name: 'PT Abadi', category: 'Kantor perusahaan' }), 'lainnya', 'kategori umum tidak dipakai');
  assert.equal(U.classifySector({ name: 'PT Abadi', category: 'Kantor perusahaan' }, { bidang: 'distributor semen' }), 'dagang', 'bidang isian RM didahulukan');
  assert.equal(U.classifySector({ name: 'PT Hollandia', category: 'Kantor perusahaan' }), 'lainnya', '"land" di tengah kata tidak dianggap properti');
  const items = [
    { sector: 'dagang', zone: 'red' }, { sector: 'dagang', zone: 'orange' }, { sector: 'dagang', zone: 'green' },
    { sector: 'industri', zone: 'red' }, { sector: 'akomodasi', zone: 'red' }, { sector: 'akomodasi', zone: 'red' },
    { sector: 'lainnya', zone: 'red' }, { sector: 'lainnya', zone: 'red' }, { sector: 'lainnya', zone: 'red' }, { sector: 'lainnya', zone: 'red' }
  ];
  const st = U.sectorStats(items);
  assert.equal(st[0].id, 'dagang');            // 3+2+1 = 6
  assert.equal(st[1].id, 'akomodasi');         // (3+3) * 0.7 = 4.2
  assert.equal(st[2].id, 'industri');          // 3
  assert.equal(st[st.length - 1].id, 'lainnya', 'bidang belum diketahui selalu terakhir');
  assert.equal(st[0].near, 2);
  assert.ok(Math.abs(st[0].share - 0.3) < 1e-9);
});

test('Peluang: klaster usaha berdekatan', () => {
  const base = { lat: -7.1386, lon: 110.4053 };
  const items = [];
  for (let i = 0; i < 6; i++) items.push({ id: 'a' + i, lat: base.lat + i * 0.0006, lon: base.lon, entity: 'PT', sector: 'dagang' });
  for (let i = 0; i < 4; i++) items.push({ id: 'b' + i, lat: base.lat + 0.05, lon: base.lon + i * 0.0006, entity: 'CV', sector: 'industri' });
  items.push({ id: 'lone', lat: base.lat - 0.05, lon: base.lon, entity: 'PT', sector: 'jasa' });
  const cl = U.findClusters(items, { radiusKm: 0.5, minSize: 4 });
  assert.equal(cl.length, 2);
  assert.equal(cl[0].size, 6);
  assert.equal(cl[0].sector, 'dagang');
  assert.equal(cl[1].size, 4);
  assert.equal(cl[1].entities.CV, 4);
  assert.deepEqual(U.findClusters(items.slice(0, 3), { minSize: 4 }), []);
});

test('Peluang: pusat ekonomi dan bank pesaing dari OSM', () => {
  const els = [
    { type: 'node', id: 1, lat: -7.13, lon: 110.40, tags: { amenity: 'marketplace', name: 'Pasar Bandarjo' } },
    { type: 'way', id: 2, center: { lat: -7.1301, lon: 110.4001 }, tags: { amenity: 'marketplace', name: 'Pasar Bandarjo' } },
    { type: 'way', id: 3, center: { lat: -7.15, lon: 110.42 }, tags: { landuse: 'industrial', name: 'Kawasan Industri Ungaran' } },
    { type: 'way', id: 4, center: { lat: -7.16, lon: 110.43 }, tags: { landuse: 'industrial', name: 'PT Pabrik Sendiri' } },
    { type: 'way', id: 5, center: { lat: -7.17, lon: 110.44 }, tags: { landuse: 'industrial', name: 'Pergudangan Lingkar' } },
    { type: 'node', id: 6, lat: -7.12, lon: 110.41, tags: { shop: 'mall', name: 'Ungaran Plaza' } },
    { type: 'node', id: 7, lat: -7.14, lon: 110.405, tags: { amenity: 'bank', name: 'Bank BRI Unit Ungaran' } },
    { type: 'node', id: 8, lat: -7.14, lon: 110.406, tags: { amenity: 'bank', name: 'BNI KCP Ungaran' } },
    { type: 'node', id: 9, lat: -7.14, lon: 110.407, tags: { amenity: 'bank', name: 'ATM Mandiri' } },
    { type: 'node', id: 10, lat: -7.20, lon: 110.41, tags: { amenity: 'bank', name: 'Bank Mandiri KCP Bawen', brand: 'Mandiri' } },
    { type: 'node', id: 11, lat: -7.141, lon: 110.405, tags: { amenity: 'bank', name: 'BPR Bank Ungaran' } }
  ];
  const eco = U.parseEconomy(els);
  assert.deepEqual(eco.centers.map((c) => c.type + ':' + c.name), ['pasar:Pasar Bandarjo', 'industri:Kawasan Industri Ungaran', 'gudang:Pergudangan Lingkar', 'mal:Ungaran Plaza']);
  assert.deepEqual(eco.banks.map((b) => b.brand), ['BRI', 'Mandiri', 'BPR']);
  const comp = U.bankCompetition(eco.banks, -7.1386, 110.4053, [1, 5, 10]);
  assert.equal(comp.zones.red, 2);
  assert.equal(comp.zones.green, 1);
  assert.equal(comp.withinOrange, 2);
  assert.ok(U.economyQuery([-7.2, 110.3, -7.0, 110.5]).includes('"amenity"="marketplace"'));
  assert.equal(U.cityFromNominatim({ address: { county: 'Semarang', state: 'Jawa Tengah' } }), 'Semarang');
  assert.match(U.newsUrl('Kabupaten Semarang'), /news\.google\.com\/search\?q=/);
});

// ---------------------------------------------------------------------------
// Kerja harian RM
// ---------------------------------------------------------------------------

test('prioritas prospek', () => {
  const S = U.mergeSettings(null);
  const hot = U.priorityScore({ zone: 'red', entity: 'PT', name: 'PT Distributor Semen Jaya', phone: '0812-3456-7890' }, null, S, '2026-10-15');
  assert.equal(hot.level, 'tinggi');
  assert.ok(hot.score >= 85, 'skor ' + hot.score);
  assert.deepEqual(hot.reasons, ['zona merah', 'perdagangan besar & distribusi', 'ada nomor HP']);
  const cold = U.priorityScore({ zone: 'out', entity: 'CV', name: 'CV Abadi' }, null, S, '2026-10-15');
  assert.equal(cold.level, 'rendah');
  assert.ok(cold.score < hot.score);
  assert.ok(U.priorityScore({ zone: 'red', entity: 'Tbk', name: 'PT Besar Tbk' }, null, S).reasons.includes('biasanya di atas target plafond'));
  const late = U.priorityScore({ zone: 'green', entity: 'PT', name: 'PT A' }, { status: 'dihubungi', followUp: '2026-10-10', plafond: 5e9 }, S, '2026-10-15');
  assert.equal(late.reasons[0], 'follow-up terlambat');
  assert.ok(late.reasons.includes('plafond sesuai target'));
  assert.deepEqual(U.priorityScore({ zone: 'red', entity: 'PT', name: 'PT A' }, { status: 'ditolak' }, S), { score: 0, level: 'selesai', reasons: ['ditolak / tidak minat'] });
});

test('rencana rute kunjungan', () => {
  const start = { lat: 0, lon: 0 };
  const at = (lon, id) => ({ id, lat: 0, lon });
  const r = U.planRoute(start, [at(0.03, 'c'), at(0.01, 'a'), at(0.02, 'b')]);
  assert.deepEqual(r.stops.map((s) => s.id), ['a', 'b', 'c']);
  assert.ok(Math.abs(r.km - 3.336) < 0.01, 'km ' + r.km);
  assert.equal(r.legs.length, 3);
  const back = U.planRoute(start, [at(0.03, 'c'), at(0.01, 'a')], { returnToStart: true });
  assert.equal(back.legs.length, 3);
  assert.ok(Math.abs(back.km - 6.672) < 0.01);
  // 10 titik di lingkaran: hasil 2-opt mengikuti keliling, bukan zig-zag
  const ring = [];
  for (let i = 0; i < 10; i++) ring.push({ id: i, lat: Math.sin(i * 0.628) * 0.05, lon: Math.cos(i * 0.628) * 0.05 });
  const shuffled = [3, 8, 1, 6, 0, 9, 4, 2, 7, 5].map((i) => ring[i]);
  const rr = U.planRoute(null, shuffled);
  assert.equal(rr.stops.length, 10);
  assert.ok(rr.km < 32, 'keliling ±31 km, dapat ' + rr.km.toFixed(1));
  assert.deepEqual(U.planRoute(start, []).stops, []);

  const url = U.gmapsDirUrl(start, [at(0.01), at(0.02), at(0.03)]);
  assert.equal(url, 'https://www.google.com/maps/dir/?api=1&origin=0.000000,0.000000&destination=0.000000,0.030000&waypoints=0.000000,0.010000%7C0.000000,0.020000&travelmode=driving');
  assert.match(U.gmapsDirUrl(start, [at(0.01), at(0.02)], { returnToStart: true }), /destination=0\.000000,0\.000000&waypoints=0\.000000,0\.010000%7C0\.000000,0\.020000/);
  assert.doesNotMatch(U.gmapsDirUrl(null, [at(0.01)]), /origin=/);
});

test('WhatsApp: nomor ponsel, sapaan, dan template', () => {
  assert.equal(U.waNumber('0812-3456-7890'), '6281234567890');
  assert.equal(U.waNumber('+62 812 3456 789'), '628123456789');
  assert.equal(U.waNumber('Pak Budi (Direktur) 0811 222 333'), '62811222333');
  assert.equal(U.waNumber('(024) 6921234'), '', 'telepon kantor bukan WhatsApp');
  assert.equal(U.waNumber('024-6921234 / 0857.1234.5678'), '6285712345678');
  assert.equal(U.waNumber(''), '');
  assert.equal(U.sapaanFor('Pak Budi Santoso, Direktur, 0812'), 'Bapak Budi Santoso');
  assert.equal(U.sapaanFor('Ibu Sari (Keuangan)'), 'Ibu Sari');
  assert.equal(U.sapaanFor('Hendra Wijaya'), 'Bapak/Ibu Hendra Wijaya');
  assert.equal(U.sapaanFor(''), 'Bapak/Ibu');
  assert.equal(U.greetingFor(new Date(2026, 9, 15, 9)), 'pagi');
  assert.equal(U.greetingFor(new Date(2026, 9, 15, 16)), 'sore');
  const msg = U.fillTemplate(U.WA_TEMPLATE, { waktu: 'pagi', sapaan: 'Bapak Budi', nama_rm: 'Aziz', jabatan: 'Relationship Manager', kantor: 'KCP Ungaran', perusahaan: 'PT Maju' });
  assert.match(msg, /^Selamat pagi, Bapak Budi\. Perkenalkan, saya Aziz, Relationship Manager BNI KCP Ungaran\./);
  assert.match(msg, /untuk PT Maju\./);
  assert.equal(U.fillTemplate('Halo {nama} {x}', { nama: 'A' }), 'Halo A {x}');
  assert.equal(U.waUrl('6281234567890', 'Halo & salam'), 'https://wa.me/6281234567890?text=Halo%20%26%20salam');
});

test('agenda follow-up dan kalender', () => {
  const ps = [
    { name: 'A', status: 'dihubungi', followUp: '2026-10-10' },
    { name: 'B', status: 'baru', followUp: '2026-10-15' },
    { name: 'C', status: 'kunjungan', followUp: '2026-10-20' },
    { name: 'D', status: 'pengajuan', followUp: '2026-11-30' },
    { name: 'E', status: 'baru', followUp: '' },
    { name: 'F', status: 'ditolak', followUp: '2026-10-01' },
    { name: 'G', status: 'disetujui', followUp: '2026-10-15' }
  ];
  const g = U.agendaGroups(ps, '2026-10-15');
  assert.deepEqual(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((p) => p.name)])),
    { late: ['A'], today: ['B'], week: ['C'], later: ['D'], none: ['E'] });
  assert.equal(U.gcalUrl({ title: 'Follow-up PT A', date: '2026-10-31', details: 'Status: baru' }),
    'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Follow-up%20PT%20A&dates=20261031/20261101&details=Status%3A%20baru');
  const ics = U.icsCalendar([{ uid: 'fu-1@pp', date: '2026-12-31', title: 'Follow-up PT A, Tbk; uji', details: 'Baris 1\nBaris 2' }], new Date(Date.UTC(2026, 9, 15, 8, 30)));
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /DTSTAMP:20261015T083000Z\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n/);
  assert.match(ics, /SUMMARY:Follow-up PT A\\, Tbk\; uji\r\n/);
  assert.match(ics, /DESCRIPTION:Baris 1\\nBaris 2\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  const long = U.icsFold('DESCRIPTION:' + 'é'.repeat(80));
  long.split('\r\n').forEach((l) => assert.ok(Buffer.byteLength(l) <= 75, 'baris ' + Buffer.byteLength(l) + ' byte'));
  assert.equal(long.replace(/\r\n /g, ''), 'DESCRIPTION:' + 'é'.repeat(80));
});

test('periode laporan', () => {
  const w = U.periodRange('minggu', '2026-10-15');
  assert.deepEqual([w.from, w.to, w.label], ['2026-10-12', '2026-10-18', '12–18 Okt 2026']);
  const l = U.periodRange('minggu-lalu', '2026-10-15');
  assert.deepEqual([l.from, l.to], ['2026-10-05', '2026-10-11']);
  const m = U.periodRange('bulan', '2026-02-10');
  assert.deepEqual([m.from, m.to], ['2026-02-01', '2026-02-28']);
  assert.equal(U.periodRange('minggu', '2026-12-30').label, '28 Des 2026 – 3 Jan 2027');
  assert.equal(U.addDaysISO('2026-12-31', 1), '2027-01-01');
});

test('aktivitas, status otomatis, dan laporan mingguan', () => {
  assert.equal(U.statusAfterActivity('baru', 'telepon'), 'dihubungi');
  assert.equal(U.statusAfterActivity('dihubungi', 'kunjungan'), 'kunjungan');
  assert.equal(U.statusAfterActivity('pengajuan', 'kunjungan'), 'pengajuan', 'tidak mundur');
  assert.equal(U.statusAfterActivity('ditolak', 'telepon'), 'ditolak');
  const a = U.newActivity({ jenis: 'xx', hasil: '  minta  proposal ' }, '2026-10-15');
  assert.equal(a.jenis, 'lainnya');
  assert.equal(a.tanggal, '2026-10-15');
  assert.equal(a.hasil, 'minta proposal');
  const ts = (iso) => new Date(iso + 'T10:00:00').getTime();
  const ps = [
    { id: 'p1', name: 'PT A', status: 'pengajuan', plafond: 5e9, createdAt: ts('2026-10-13'), followUp: '2026-10-20',
      statusLog: [{ s: 'dihubungi', t: ts('2026-10-13') }, { s: 'pengajuan', t: ts('2026-10-16') }],
      aktivitas: [{ tanggal: '2026-10-13', jenis: 'telepon', t: 1 }, { tanggal: '2026-10-16', jenis: 'kunjungan', t: 2 }] },
    { id: 'p2', name: 'CV B', status: 'disetujui', plafond: 2e9, createdAt: ts('2026-09-01'),
      statusLog: [{ s: 'disetujui', t: ts('2026-10-17') }], aktivitas: [{ tanggal: '2026-10-01', jenis: 'wa', t: 3 }] },
    { id: 'p3', name: 'UD C', status: 'baru', plafond: 30e9, createdAt: ts('2026-10-14'), followUp: '2026-10-22', aktivitas: [] }
  ];
  const rep = U.weeklyReport(ps, U.periodRange('minggu', '2026-10-15'), U.mergeSettings(null));
  assert.equal(rep.activities.length, 2);
  assert.deepEqual(rep.byType, { telepon: 1, kunjungan: 1 });
  assert.equal(rep.contacted, 1);
  assert.deepEqual(rep.created.map((p) => p.id), ['p1', 'p3']);
  assert.equal(rep.moved.pengajuan.count, 1);
  assert.equal(rep.moved.disetujui.plafond, 2e9);
  assert.equal(rep.openCount, 2);
  assert.equal(rep.inTarget, 1, '30 M di atas target');
  assert.deepEqual(rep.upcoming.map((p) => p.id), ['p1', 'p3']);
  const txt = U.reportText(rep, { nama: 'Aziz', kantor: 'KCP Ungaran' });
  assert.match(txt, /^Laporan aktivitas RM – Aziz \(BNI KCP Ungaran\)\nPeriode: 12–18 Okt 2026/);
  assert.match(txt, /Aktivitas: 2 \(telepon 1, kunjungan 1\) ke 1 prospek/);
  assert.match(txt, /Masuk pengajuan: 1 \(Rp 5 M\)/);
  assert.match(txt, /Disetujui\/cair: 1 \(Rp 2 M\)/);
});

test('kalkulator kelayakan kredit', () => {
  const pay = U.annuityPayment(2.1e9, 10, 5);
  assert.ok(Math.abs(pay - 44618433) < 1000, 'angsuran ' + pay);
  assert.ok(Math.abs(U.annuityPrincipal(pay, 10, 5) - 2.1e9) < 1);
  assert.equal(U.annuityPayment(1.2e9, 0, 1), 1e8);
  const keu = [{ tahun: 2025, penjualan: 12e9, hpp: 9e9, piutang: 1.5e9, persediaan: 1.2e9, utangUsaha: 0.6e9, laba: 0.9e9,
    penyusutan: 0.3e9, bebanBunga: 0.1e9, angsuranTahun: 0.2e9, aset: 10e9, liabilitas: 4e9 }];
  const c = U.creditCalc(keu, { investasi: 3e9 }, U.mergeSettings(null));
  assert.deepEqual(c.missing, []);
  assert.equal(c.tahun, 2025);
  assert.ok(Math.abs(c.kmk.ccc - 69.96) < 0.05, 'siklus ' + c.kmk.ccc);
  assert.ok(Math.abs(c.kmk.plafond - 1.3283e9) < 1e6, 'KMK ' + c.kmk.plafond);
  assert.equal(c.ki.plafond, 2.1e9);
  assert.ok(Math.abs(c.dscr.value - 1.497) < 0.005, 'DSCR ' + c.dscr.value);
  assert.ok(Math.abs(c.dscr.kiMax - 2.7737e9) < 5e6, 'KI maks ' + c.dscr.kiMax);
  assert.ok(Math.abs(c.total - 3.428e9) < 2e6, 'total ' + c.total);
  assert.equal(c.target, true);
  assert.equal(c.kiDibatasi, false);
  // Investasi besar dibatasi kemampuan bayar
  const big = U.creditCalc(keu, { investasi: 10e9 });
  assert.equal(big.kiDibatasi, true);
  assert.ok(Math.abs(big.total - (big.kmk.plafond + big.dscr.kiMax)) < 1);
  // Data belum lengkap
  const thin = U.creditCalc([{ tahun: 2025, penjualan: 5e9, laba: 0.4e9 }], {});
  assert.deepEqual(thin.missing, ['HPP', 'piutang usaha', 'persediaan', 'utang usaha']);
  assert.equal(thin.kmk, undefined);
  assert.ok(thin.notes.some((n) => /Penyusutan/.test(n)));
  assert.deepEqual(U.creditCalc([], {}).missing, ['laporan keuangan']);
});

test('dokumen, tautan rekam jejak, dan impor keuangan tambahan', () => {
  assert.equal(U.DOC_IDS.length, 19);
  assert.deepEqual(U.docProgress({ akta: '2026-10-01', nib: '2026-10-02', bukan: true }), { done: 2, total: 19 });
  assert.deepEqual(U.docProgress(null), { done: 0, total: 19 });
  const links = U.trackRecordLinks('PT Maju Jaya', 'Semarang');
  assert.deepEqual(links.map((l) => l.id), ['tender', 'lpjk', 'ekspor', 'berita']);
  assert.match(links[1].url, /%22PT%20Maju%20Jaya%22%20site%3Apu\.go\.id/);
  const rows = [
    ['Nama Perusahaan', 'Tahun', 'Penjualan', 'HPP', 'Piutang Usaha', 'Persediaan', 'Hutang Usaha (Rp)', 'Total Liabilitas', 'Penyusutan', 'Beban Bunga', 'Angsuran Pinjaman'],
    ['PT Uji Kalkulator', 2025, 12e9, 9e9, 1.5e9, 1.2e9, 0.6e9, 4e9, 0.3e9, 0.1e9, 0.2e9]
  ];
  const res = U.convertProspectSheets(rows);
  const k = res.records[0].keuangan[0];
  assert.deepEqual([k.hpp, k.piutang, k.persediaan, k.utangUsaha, k.liabilitas, k.penyusutan, k.bebanBunga, k.angsuranTahun],
    [9e9, 1.5e9, 1.2e9, 0.6e9, 4e9, 0.3e9, 0.1e9, 0.2e9]);
});
