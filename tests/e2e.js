// Uji ujung-ke-ujung di Chromium dengan jaringan tiruan (Overpass, Nominatim, tile peta).
// Jalankan: npm run test:e2e  (atau NODE_PATH=$(npm root -g) node tests/e2e.js bila Playwright terpasang global)
// Variabel opsional: CHROMIUM=/path/ke/chrome  SHOT_DIR=/folder/tangkapan-layar
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = process.env.SHOT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'pp-shots-'));
const U = require('../js/util.js');

// ---------------------------------------------------------------------------
// Data tiruan
// ---------------------------------------------------------------------------

const UNGARAN = { lat: -7.1386, lon: 110.4053 };

function offset(base, km, bearingDeg) {
  const b = bearingDeg * Math.PI / 180;
  const dLat = (km * Math.cos(b)) / 110.57;
  const dLon = (km * Math.sin(b)) / (111.32 * Math.cos(base.lat * Math.PI / 180));
  return { lat: +(base.lat + dLat).toFixed(6), lon: +(base.lon + dLon).toFixed(6) };
}

function node(id, pos, tags) { return { type: 'node', id, lat: pos.lat, lon: pos.lon, tags }; }
function way(id, pos, tags) { return { type: 'way', id, center: { lat: pos.lat, lon: pos.lon }, tags }; }

const branchElements = [
  node(1001, UNGARAN, { amenity: 'bank', name: 'BNI KCP Ungaran', 'addr:street': 'Jl. Gatot Subroto', 'addr:city': 'Ungaran', phone: '024-6921234' }),
  way(1101, offset(UNGARAN, 0.02, 90), { amenity: 'bank', name: 'BNI KCP Ungaran', building: 'yes' }),
  node(1002, { lat: -6.9784, lon: 110.4203 }, { amenity: 'bank', name: 'BNI Kantor Cabang Semarang', 'addr:street': 'Jl. Pemuda', 'addr:city': 'Semarang' }),
  node(1003, { lat: -7.0640, lon: 110.4180 }, { amenity: 'bank', name: 'BNI KCP Banyumanik', 'addr:city': 'Semarang' }),
  node(1004, { lat: -6.9930, lon: 110.4600 }, { amenity: 'bank', name: 'BNI', brand: 'BNI', 'addr:street': 'Jl. Majapahit' }),
  node(1005, { lat: -7.0505, lon: 110.4380 }, { amenity: 'bank', name: 'BNI Kantor Kas Undip' }),
  node(1006, { lat: -7.2440, lon: 110.4320 }, { amenity: 'bank', name: 'BNI KCP Bawen' }),
  node(1007, offset(UNGARAN, 0.3, 200), { amenity: 'bank', name: 'ATM BNI' }),
  node(1008, { lat: -6.9900, lon: 110.4210 }, { amenity: 'bank', name: 'BNI Syariah Semarang' }),
  node(1009, { lat: -6.9910, lon: 110.4220 }, { amenity: 'bank', name: 'Bank Mandiri', operator: 'PT Bank Mandiri (Persero) Tbk' })
];
// Ratusan kantor sintetis di Jawa & Sumatra untuk menguji klaster dan kinerja.
let seed = 42;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
for (let i = 0; i < 400; i++) {
  const lat = -8 + rnd() * 9, lon = 98 + rnd() * 16;
  branchElements.push(node(5000 + i, { lat: +lat.toFixed(5), lon: +lon.toFixed(5) }, {
    amenity: 'bank', name: 'BNI ' + (i % 3 === 0 ? 'KC' : 'KCP') + ' Uji ' + i
  }));
}

const companyElements = [
  node(2001, offset(UNGARAN, 0.4, 30), { name: 'PT Sinar Ungaran Textile', office: 'company', phone: '024-6920001', 'addr:street': 'Jl. Diponegoro', 'addr:housenumber': '12', 'addr:city': 'Ungaran' }),
  node(2002, offset(UNGARAN, 0.8, 120), { name: 'CV Maju Bersama', shop: 'wholesale', phone: '0812-0000-1111' }),
  way(2003, offset(UNGARAN, 2.5, 250), { name: 'PT Kawasan Industri Ungaran', landuse: 'industrial' }),
  way(2004, offset(UNGARAN, 3.0, 330), { name: 'PT Ungaran Sari Garments', man_made: 'works', website: 'www.contoh-garmen.co.id' }),
  way(2005, offset(UNGARAN, 3.08, 331), { name: 'PT Ungaran Sari Garments', building: 'industrial' }),
  node(2006, offset(UNGARAN, 4.0, 60), { name: 'UD Sumber Pangan', shop: 'wholesale' }),
  node(2007, offset(UNGARAN, 4.5, 160), { name: 'Koperasi Karyawan Sejahtera', office: 'company' }),
  node(2008, offset(UNGARAN, 1.2, 10), { name: 'PT Bank Rakyat Indonesia (Persero) Tbk', amenity: 'bank' }),
  node(2009, offset(UNGARAN, 6.0, 200), { name: 'PT Pertamina (Persero) Depot Ungaran', industrial: 'depot' }),
  node(2010, offset(UNGARAN, 7.0, 100), { name: 'PT Astra International Tbk Toyota', shop: 'car' }),
  node(2011, offset(UNGARAN, 8.0, 280), { name: 'Gudang Beras Sentosa', operator: 'CV Sentosa Pangan', building: 'warehouse' }),
  node(2012, offset(UNGARAN, 2.0, 80), { name: 'Halte PT Maju', highway: 'bus_stop' }),
  node(2013, offset(UNGARAN, 12.0, 90), { name: 'PT Jauh Sekali', office: 'company' }),
  node(2018, offset(UNGARAN, 25.0, 180), { name: 'PT Di Luar Jangkauan', office: 'company' }),
  node(2014, offset(UNGARAN, 1.5, 300), { name: 'Hotel Ungaran Indah', tourism: 'hotel' }),
  node(2015, offset(UNGARAN, 5.5, 20), { name: 'PT Gemilang Abadi', office: 'company', email: 'info@contoh.co.id', 'addr:full': 'Jl. Raya Ungaran No. 5, Ungaran' }),
  node(2016, offset(UNGARAN, 9.5, 140), { name: 'CV Karya Teknik', craft: 'metal_construction' }),
  node(2017, offset(UNGARAN, 0.6, 250), { name: '<img src=x onerror=alert(1)> PT Uji XSS', office: 'company' })
];
for (let i = 0; i < 30; i++) {
  const km = 0.5 + rnd() * 9.3, br = rnd() * 360;
  companyElements.push(node(3000 + i, offset(UNGARAN, km, br), { name: (i % 2 ? 'CV' : 'PT') + ' Usaha Uji ' + String(i).padStart(2, '0'), office: 'company' }));
}

function inBox(el, b) {
  const lat = el.lat != null ? el.lat : el.center.lat;
  const lon = el.lon != null ? el.lon : el.center.lon;
  return lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];
}

// ---------------------------------------------------------------------------
// Server statis
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP89+5dPQAIoAOWJgdDGgAAAABJRU5ErkJggg==', 'base64');

const stats = { overpass: 0, branchQueries: 0, companyQueries: 0, nominatim: 0, failNext: 0 };
// ---------------------------------------------------------------------------
// Google tiruan: Maps JavaScript API (Place) dan Map Tiles API
// ---------------------------------------------------------------------------

const GOOGLE_PLACES = [];
for (let i = 1; i <= 25; i++) {
  const p = offset(UNGARAN, 0.15 + (i % 5) * 0.15, i * 14);
  GOOGLE_PLACES.push({ id: 'gp' + i, name: 'PT Google Uji ' + String(i).padStart(2, '0'), lat: p.lat, lng: p.lon, addr: 'Jl. Uji ' + i + ', Ungaran', types: ['corporate_office', 'point_of_interest'] });
}
[
  ['gc1', 'CV Google Satu', 2.2, 40, ['wholesaler']],
  ['gc2', 'CV Google Dua', 3.8, 200, ['hardware_store', 'store']],
  ['gb1', 'PT Bank Google', 0.5, 90, ['bank']],
  ['gx1', 'PT Tutup Permanen', 0.7, 180, ['corporate_office'], 'CLOSED_PERMANENTLY'],
  ['go1', 'Toko Optik Sentosa', 0.9, 270, ['store']],
  ['gf1', 'PT Jauh Google', 15, 135, ['manufacturer']]
].forEach(([id, name, km, br, types, status]) => {
  const p = offset(UNGARAN, km, br);
  GOOGLE_PLACES.push({ id, name, lat: p.lat, lng: p.lon, addr: name + ', Jawa Tengah', types, status });
});

function mapsJsMock() {
  return `(() => {
    const DATA = ${JSON.stringify(GOOGLE_PLACES)};
    const cb = new URL(document.currentScript.src).searchParams.get('callback');
    const calls = window.__gcalls = { search: 0, fetch: 0, reqs: [] };
    class LatLng { constructor(a, b) { this._a = a; this._b = b; } lat() { return this._a; } lng() { return this._b; } }
    class Place {
      constructor(o) { this.id = o.id; }
      static async searchByText(req) {
        calls.search++;
        calls.reqs.push({ q: req.textQuery, fields: req.fields });
        const b = req.locationRestriction, q = req.textQuery.toLowerCase();
        const hits = DATA.filter((p) => p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east && p.name.toLowerCase().includes(q));
        return { places: hits.slice(0, req.maxResultCount || 20).map((p) => Object.assign(new Place({ id: p.id }), {
          displayName: p.name, location: new LatLng(p.lat, p.lng), formattedAddress: p.addr, types: p.types,
          businessStatus: p.status || 'OPERATIONAL', googleMapsURI: 'https://maps.google.com/?cid=' + p.id })) };
      }
      async fetchFields(o) {
        calls.fetch++;
        const p = DATA.find((x) => x.id === this.id) || {};
        if (o.fields.includes('location')) { this.location = new LatLng(p.lat, p.lng); this.formattedAddress = p.addr; }
        if (o.fields.includes('nationalPhoneNumber')) {
          this.nationalPhoneNumber = '024-6921000'; this.websiteURI = 'https://www.contoh-pt.co.id/';
          this.rating = 4.6; this.userRatingCount = 37;
          this.regularOpeningHours = { weekdayDescriptions: ['Senin: 08.00–17.00', 'Selasa: 08.00–17.00'] };
        }
        return { place: this };
      }
    }
    window.google = window.google || {};
    google.maps = google.maps || {};
    google.maps.importLibrary = async (name) => (name === 'places' ? { Place } : {});
    setTimeout(() => window[cb](), 5);
  })();`;
}

const gstats = { sessions: 0, tiles: 0, viewport: 0, jsLoads: 0 };

async function mockGoogle(context) {
  await context.route(/^https:\/\/maps\.googleapis\.com\/maps\/api\/js/, (route) => {
    gstats.jsLoads++;
    route.fulfill({ status: 200, contentType: 'text/javascript', body: mapsJsMock() });
  });
  await context.route(/^https:\/\/tile\.googleapis\.com\//, (route) => {
    const url = route.request().url();
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (url.includes('/v1/createSession')) {
      gstats.sessions++;
      const body = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ session: 'sess-' + body.mapType, expiry: String(Math.floor(Date.now() / 1000) + 14 * 86400), tileWidth: 256, tileHeight: 256, imageFormat: 'png' }) });
    }
    if (url.includes('/tile/v1/viewport')) {
      gstats.viewport++;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ copyright: 'Map data ©2026 Google' }) });
    }
    gstats.tiles++;
    return route.fulfill({ status: 200, contentType: 'image/png', body: TILE });
  });
  await context.route(/^https:\/\/developers\.google\.com\/static\/maps\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
}


async function mockNetwork(context) {
  await context.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  await context.route(/overpass|maps\.mail\.ru/, async (route) => {
    stats.overpass++;
    if (stats.failNext > 0) { stats.failNext--; return route.fulfill({ status: 429, body: 'busy' }); }
    const body = route.request().postData() || '';
    const q = new URLSearchParams(body).get('data') || '';
    let elements;
    if (q.includes('"amenity"="bank"') && q.includes('BNI')) {
      stats.branchQueries++;
      elements = branchElements;
    } else {
      stats.companyQueries++;
      const m = q.match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/);
      const b = m.slice(1).map(Number);
      elements = companyElements.filter((el) => inBox(el, b));
    }
    await new Promise((r) => setTimeout(r, 150));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements }) });
  });
  await context.route(/nominatim\.openstreetmap\.org/, (route) => {
    stats.nominatim++;
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    const hit = /Gatot Subroto/i.test(q) ? [{ lat: '-7.1300', lon: '110.4100', place_rank: 26, display_name: 'Jl. Gatot Subroto, Ungaran' }] : [];
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(hit) });
  });
  // Tautan keluar (Google, LinkedIn, AHU, IDX). Hanya host eksternal; file lokal seperti js/google.js tidak ikut.
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(google\.com|linkedin\.com|ahu\.go\.id|idx\.co\.id)\//, (route) => route.fulfill({ status: 204, body: '' }));
}

// ---------------------------------------------------------------------------
// Skenario
// ---------------------------------------------------------------------------

async function run() {
  const srv = await startServer();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch({ executablePath: exe });
  const errors = [];
  const results = [];
  async function step(name, fn) {
    let line;
    try { await fn(); line = 'ok   ' + name; } catch (e) { line = 'FAIL ' + name + '\n     ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n     '); }
    results.push(line);
    if (process.env.VERBOSE) console.log(line);
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true, locale: 'id-ID' });
  await mockNetwork(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 429/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => { errors.push('dialog muncul: ' + d.message()); d.dismiss(); });

  await page.goto(base);
  const S = () => page.evaluate(() => {
    const s = window.__PP_STATE__;
    return { branches: s.branches.length, results: s.results.length, profiles: Object.keys(s.profiles).length, active: s.activeBranch && s.activeBranch.name, loading: s.resultsLoading, ctx: s.resultsCtx && s.resultsCtx.kind };
  });

  await step('kantor BNI dimuat dari Overpass dan difilter', async () => {
    await page.waitForFunction(() => window.__PP_STATE__.branches.length > 0, null, { timeout: 15000 });
    const s = await S();
    // 10 elemen dasar: 1 duplikat (way), ATM, Syariah, Mandiri dibuang → 6 + 400 sintetis
    assert.equal(s.branches, 406);
    assert.equal(stats.branchQueries, 1);
    await page.screenshot({ path: path.join(SHOT_DIR, '01-awal.png') });
  });

  await step('cari & pilih kantor dari tab Cabang', async () => {
    await page.click('#tabbtn-cabang');
    await page.fill('#branchSearch', 'ungaran');
    await page.waitForSelector('#branchList [data-branch="osm:n1001"]');
    const count = await page.locator('#branchList [data-branch]').count();
    assert.equal(count, 1);
    await page.click('#branchList [data-branch="osm:n1001"]');
    await page.waitForFunction(() => window.__PP_STATE__.resultsCtx && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    const s = await S();
    assert.equal(s.active, 'BNI KCP Ungaran');
    assert.equal(await page.isVisible('#activeChip'), true);
    assert.equal(await page.isHidden('#btnDetectArea'), true);
  });

  await step('hasil deteksi: zona, filter, pengecualian', async () => {
    const names = await page.evaluate(() => window.__PP_STATE__.results.map((c) => c.name + '|' + c.zone + '|' + c.entity));
    const has = (n) => names.some((x) => x.startsWith(n + '|'));
    assert.ok(has('PT Sinar Ungaran Textile'));
    assert.ok(names.includes('PT Sinar Ungaran Textile|red|PT'));
    assert.ok(names.includes('CV Maju Bersama|red|CV'));
    assert.ok(names.includes('UD Sumber Pangan|orange|UD'));
    assert.ok(names.includes('Gudang Beras Sentosa|green|CV'), 'terdeteksi lewat operator');
    assert.ok(!has('PT Bank Rakyat Indonesia (Persero) Tbk'), 'bank dikecualikan');
    assert.ok(!has('Halte PT Maju'), 'halte dikecualikan');
    assert.ok(names.includes('PT Jauh Sekali|out|PT'), '12 km tetap tampil sebagai luar zona');
    assert.ok(!has('PT Di Luar Jangkauan'), '25 km di luar jangkauan 20 km');
    assert.ok(!has('Hotel Ungaran Indah'), 'usaha tanpa label tidak ikut secara bawaan');
    assert.equal(names.filter((x) => x.startsWith('PT Ungaran Sari Garments|')).length, 1, 'duplikat digabung');
    // Tbk & BUMN tersembunyi oleh filter bawaan
    const listed = await page.locator('#resultList .item').allInnerTexts();
    assert.ok(!listed.some((t) => t.includes('Pertamina')));
    assert.ok(!listed.some((t) => t.includes('Astra')));
    const tally = await page.locator('#zoneTally .n').allInnerTexts();
    assert.equal(tally.length, 4);
    assert.match(await page.locator('#zoneTally [data-zone="out"]').innerText(), /10–20 km/);
    const gm = await page.locator('#detectContext .gm-links a').first().getAttribute('href');
    assert.equal(gm, 'https://www.google.com/maps/search/PT/@-7.138600,110.405300,13z');
    const visible = await page.evaluate(() => document.querySelectorAll('#resultList .item').length);
    assert.equal(visible, tally.map(Number).reduce((a, b) => a + b, 0));
    // XSS: nama berbahaya tampil sebagai teks
    assert.equal(await page.locator('#resultList img').count(), 0);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-deteksi.png') });
  });

  await step('toggle zona & chip badan usaha', async () => {
    const before = await page.locator('#resultList .item').count();
    await page.click('#zoneTally [data-zone="green"]');
    const afterZone = await page.locator('#resultList .item').count();
    assert.ok(afterZone < before);
    await page.click('#zoneTally [data-zone="green"]');
    await page.click('#entityChips [data-ent="Tbk"]');
    const listed = await page.locator('#resultList .item').allInnerTexts();
    assert.ok(listed.some((t) => t.includes('Astra')));
    await page.click('#entityChips [data-ent="Tbk"]');
    assert.equal(await page.locator('#resultList .item').count(), before);
  });

  await step('detail perusahaan: isi pipeline, pengurus, keuangan', async () => {
    await page.click('#resultList .item:has-text("PT Sinar Ungaran Textile")');
    await page.waitForSelector('#dossier:not([hidden])');
    assert.equal(await page.locator('.d-title').innerText(), 'PT Sinar Ungaran Textile');
    assert.ok(await page.isVisible('#unsavedHint'));
    await page.selectOption('[data-f="status"]', 'kunjungan');
    await page.fill('[data-f="plafond"]', '2,5 M');
    await page.locator('[data-f="plafond"]').blur();
    assert.equal(await page.inputValue('[data-f="plafond"]'), '2.500.000.000');
    assert.match(await page.locator('[data-hint="plafond"]').innerText(), /sesuai target/);
    assert.equal(await page.locator('#unsavedHint').count(), 0);
    await page.click('[data-action="add-person"]');
    await page.fill('#personRows .person-row:nth-child(1) [data-p-f="nama"]', 'Budi Santoso');
    await page.fill('#personRows .person-row:nth-child(1) [data-p-f="saham"]', '60');
    await page.click('[data-action="add-person"]');
    await page.fill('#personRows .person-row:nth-child(2) [data-p-f="nama"]', 'Ani Wijaya');
    await page.selectOption('#personRows .person-row:nth-child(2) [data-p-f="jabatan"]', 'Komisaris Utama');
    await page.fill('#personRows .person-row:nth-child(2) [data-p-f="saham"]', '40');
    const org = await page.locator('#orgChart').innerText();
    assert.match(org, /Pemegang saham/i);
    assert.match(org, /Dewan Komisaris/i);
    assert.match(org, /Direksi/i);
    await page.click('[data-action="add-year"]');
    await page.fill('.fin-card [data-k-f="tahun"]', '2024');
    await page.fill('.fin-card [data-k-f="penjualan"]', '12 M');
    await page.fill('.fin-card [data-k-f="laba"]', '900 jt');
    await page.fill('.fin-card [data-k-f="aset"]', '8000000000');
    await page.fill('.fin-card [data-k-f="liabilitas"]', '3.000.000.000');
    const ratios = await page.locator('#ratios-0').innerText();
    assert.match(ratios, /7,5%/);   // margin laba 0,9/12
    assert.match(ratios, /0,6×/);   // DER 3 / (8-3)
    await page.fill('[data-f="catatan"]', 'Butuh KMK untuk bahan baku.');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOT_DIR, '03-detail.png') });
    const s = await S();
    assert.equal(s.profiles, 1);
    assert.equal(await page.locator('#countProspects').innerText(), '1');
  });

  await step('tutup detail, tab Prospek saya, ringkasan pipeline', async () => {
    await page.click('#btnDossierClose');
    await page.click('#tabbtn-prospek');
    const txt = await page.locator('#pipelineSummary').innerText();
    assert.match(txt, /Rp 2,5 M/);
    const items = await page.locator('#prospectList .item').allInnerTexts();
    assert.equal(items.length, 1);
    assert.match(items[0], /Kunjungan/);
  });

  await step('data bertahan setelah muat ulang & kantor terakhir dipulihkan', async () => {
    await page.reload();
    await page.waitForFunction(() => window.__PP_STATE__.resultsCtx && !window.__PP_STATE__.resultsLoading && window.__PP_STATE__.results.length, null, { timeout: 15000 });
    const s = await S();
    assert.equal(s.active, 'BNI KCP Ungaran');
    assert.equal(s.profiles, 1);
    assert.equal(stats.branchQueries, 1, 'kantor dari cache');
    const p = await page.evaluate(() => Object.values(window.__PP_STATE__.profiles)[0]);
    assert.equal(p.plafond, 2.5e9);
    assert.equal(p.pengurus.length, 2);
    assert.equal(p.keuangan[0].penjualan, 12e9);
    assert.equal(p.catatan, 'Butuh KMK untuk bahan baku.');
  });

  await step('cache deteksi: pilih ulang kantor tanpa unduh ulang', async () => {
    let before = stats.companyQueries;
    await page.click('#tabbtn-cabang');
    await page.fill('#branchSearch', 'banyumanik');
    await page.click('#branchList [data-branch="osm:n1003"]');
    await page.waitForFunction(() => window.__PP_STATE__.activeBranch.name === 'BNI KCP Banyumanik' && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    assert.equal(stats.companyQueries - before, 1, 'satu permintaan untuk area baru');
    before = stats.companyQueries;
    await page.click('#tabbtn-cabang');
    await page.fill('#branchSearch', 'ungaran');
    await page.click('#branchList [data-branch="osm:n1001"]');
    await page.waitForFunction(() => window.__PP_STATE__.activeBranch.name === 'BNI KCP Ungaran' && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    assert.equal(stats.companyQueries - before, 0, 'Ungaran tidak diunduh ulang');
  });

  await step('server sibuk (429) → coba ulang lalu berhasil', async () => {
    stats.failNext = 1;
    await page.click('#btnRefreshDetect');
    await page.waitForFunction(() => !window.__PP_STATE__.resultsLoading && window.__PP_STATE__.results.length > 0, null, { timeout: 20000 });
    assert.equal(stats.failNext, 0);
    assert.equal(await page.evaluate(() => window.__PP_STATE__.resultsError), null);
  });

  await step('ekspor hasil deteksi ke Excel', async () => {
    await page.click('#tabbtn-deteksi');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportResults')]);
    const file = path.join(SHOT_DIR, dl.suggestedFilename());
    await dl.saveAs(file);
    const XLSX = require(path.join(ROOT, 'vendor/xlsx/xlsx.core.min.js'));
    const wb = XLSX.read(fs.readFileSync(file));
    assert.deepEqual(wb.SheetNames, ['Hasil Deteksi', 'Ringkasan']);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Hasil Deteksi']);
    assert.ok(rows.length > 5);
    const sinar = rows.find((r) => r.Nama === 'PT Sinar Ungaran Textile');
    assert.equal(sinar.Zona, 'Merah');
    assert.equal(sinar['Estimasi plafond (Rp)'], 2.5e9);
  });

  let exportedProspects;
  await step('ekspor Prospek saya (3 lembar)', async () => {
    await page.click('#tabbtn-prospek');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportProspects')]);
    exportedProspects = path.join(SHOT_DIR, dl.suggestedFilename());
    await dl.saveAs(exportedProspects);
    const XLSX = require(path.join(ROOT, 'vendor/xlsx/xlsx.core.min.js'));
    const wb = XLSX.read(fs.readFileSync(exportedProspects));
    assert.deepEqual(wb.SheetNames, ['Prospek', 'Pengurus', 'Keuangan']);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Pengurus).length, 2);
    const fin = XLSX.utils.sheet_to_json(wb.Sheets.Keuangan);
    assert.equal(fin[0].Tahun, 2024);
  });

  await step('impor CSV prospek + pencarian alamat', async () => {
    const csv = [
      'Nama Perusahaan;Badan Usaha;Alamat;Kota;Koordinat;Plafond;Status;Direktur Utama;Pemegang Saham',
      'PT Baru Impor;PT;Jl. Gatot Subroto 9;Ungaran;;3,5 M;Pengajuan;Joko;Joko (100%)',
      'CV Titik Google;CV;;Semarang;"-7.0051, 110.4381";750 jt;Baru;;',
      'CV Tanpa Lokasi;CV;Jl. Tidak Dikenal;Antah;;;;;',
      'PT Contoh (contoh);PT;;;;;;;'
    ].join('\n');
    const file = path.join(SHOT_DIR, 'impor.csv');
    fs.writeFileSync(file, csv);
    await page.click('#btnImport');
    await page.setInputFiles('#fileImport', file);
    await page.waitForSelector('#impPreview .stats');
    const prev = await page.locator('#impPreview').innerText();
    assert.match(prev, /3 prospek/);
    assert.ok(await page.isVisible('#impGeoWrap'));
    await page.click('#btnImpRun');
    await page.waitForFunction(() => !document.getElementById('dlgImport').open, null, { timeout: 20000 });
    const profiles = await page.evaluate(() => Object.values(window.__PP_STATE__.profiles));
    const baru = profiles.find((p) => p.name === 'PT Baru Impor');
    assert.equal(baru.lat, -7.13);
    assert.equal(baru.plafond, 3.5e9);
    assert.equal(baru.status, 'pengajuan');
    assert.equal(baru.pengurus.length, 2);
    const g = profiles.find((p) => p.name === 'CV Titik Google');
    assert.equal(g.lat, -7.0051);
    assert.equal(g.plafond, 7.5e8);
    const t = profiles.find((p) => p.name === 'CV Tanpa Lokasi');
    assert.ok(t.lat == null, 'tanpa lokasi');
    assert.ok(!profiles.some((p) => /contoh/i.test(p.name)));
    assert.ok(stats.nominatim >= 2);
    await page.screenshot({ path: path.join(SHOT_DIR, '04-prospek.png') });
  });

  await step('impor ulang hasil ekspor tidak menggandakan', async () => {
    const before = await page.evaluate(() => Object.keys(window.__PP_STATE__.profiles).length);
    await page.click('#btnImport');
    await page.setInputFiles('#fileImport', exportedProspects);
    await page.waitForSelector('#impPreview .stats');
    await page.click('#btnImpRun');
    await page.waitForFunction(() => !document.getElementById('dlgImport').open, null, { timeout: 20000 });
    const after = await page.evaluate(() => Object.keys(window.__PP_STATE__.profiles).length);
    assert.equal(after, before);
    const p = await page.evaluate(() => window.__PP_STATE__.profiles['osm:n2001']);
    assert.equal(p.pengurus.length, 2);
    assert.equal(p.keuangan.length, 1);
  });

  await step('tambah prospek manual di peta', async () => {
    await page.click('#btnAddProspect');
    assert.ok(await page.isVisible('#pickBanner'));
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.waitForSelector('#dossier:not([hidden]) [data-f="name"]');
    await page.fill('[data-f="name"]', 'CV Manual Baru');
    await page.waitForTimeout(600);
    await page.click('#btnDossierClose');
    const p = await page.evaluate(() => Object.values(window.__PP_STATE__.profiles).find((x) => x.name === 'CV Manual Baru'));
    assert.ok(p && p.source === 'manual' && p.lat != null);
    assert.equal(p.entity, 'CV');
    // Prospek tanpa nama dibuang saat ditutup
    await page.click('#btnAddProspect');
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.55);
    await page.waitForSelector('#dossier:not([hidden])');
    await page.click('#btnDossierClose');
    const unnamed = await page.evaluate(() => Object.values(window.__PP_STATE__.profiles).filter((x) => !x.name).length);
    assert.equal(unnamed, 0);
  });

  await step('tambah prospek dari tautan Google Maps', async () => {
    await page.click('#btnAddProspect');
    await page.fill('#pickCoord', 'https://www.google.com/maps/place/CV+Dari+Google/@-7.10,110.30,15z/data=!4m6!3m5!8m2!3d-7.1450!4d110.4120');
    await page.click('#pickPaste button[type="submit"]');
    await page.waitForSelector('#dossier:not([hidden]) [data-f="name"]');
    await page.fill('[data-f="name"]', 'CV Dari Google');
    await page.waitForTimeout(600);
    const p = await page.evaluate(() => Object.values(window.__PP_STATE__.profiles).find((x) => x.name === 'CV Dari Google'));
    assert.equal(p.lat, -7.145);
    assert.equal(p.lon, 110.412);
    // Koordinat salah ditolak tanpa membuat prospek
    await page.fill('#coordPaste', 'bukan koordinat');
    await page.click('[data-action="apply-coord"]');
    assert.match(await page.locator('#toast').innerText(), /tidak dikenali/);
    await page.fill('#coordPaste', '-7.1460, 110.4130');
    await page.click('[data-action="apply-coord"]');
    const q = await page.evaluate(() => Object.values(window.__PP_STATE__.profiles).find((x) => x.name === 'CV Dari Google'));
    assert.equal(q.lat, -7.146);
    await page.click('#btnDossierClose');
  });

  await step('pengaturan: ubah radius & sertakan usaha lain', async () => {
    await page.click('#btnSettings');
    await page.fill('#setR1', '2');
    await page.fill('#setR2', '1');
    await page.click('#btnSaveSettings');
    assert.ok(await page.isVisible('#setError'));
    await page.fill('#setR2', '6');
    await page.fill('#setRMax', '8');
    await page.click('#btnSaveSettings');
    assert.match(await page.locator('#setError').innerText(), /Jangkauan/);
    await page.fill('#setRMax', '15');
    await page.check('#setOthers');
    await page.click('#btnSaveSettings');
    await page.waitForFunction(() => !window.__PP_STATE__.resultsLoading && window.__PP_STATE__.settings.includeOthers, null, { timeout: 15000 });
    await page.waitForFunction(() => window.__PP_STATE__.results.some((c) => c.name === 'Hotel Ungaran Indah'), null, { timeout: 15000 });
    const z = await page.evaluate(() => window.__PP_STATE__.results.find((c) => c.name === 'CV Maju Bersama').zone);
    assert.equal(z, 'red');
    assert.match(await page.locator('#brandZones').innerText(), /2–6–10/);
    const far = await page.evaluate(() => window.__PP_STATE__.results.find((c) => c.name === 'PT Jauh Sekali'));
    assert.equal(far.zone, 'out', '12 km masih dalam jangkauan 15 km');
  });

  await step('lepas kantor → mode area', async () => {
    await page.click('#btnClearBranch');
    assert.ok(await page.isVisible('#btnDetectArea'));
    assert.equal(await page.evaluate(() => window.__PP_STATE__.activeBranch), null);
  });

  await step('hapus prospek dengan konfirmasi di halaman', async () => {
    await page.click('#tabbtn-prospek');
    await page.click('#prospectList .item:has-text("CV Manual Baru")');
    await page.click('[data-action="delete-prospect"]');
    await page.waitForSelector('#dlgConfirm[open]');
    await page.click('#confirmOk');
    await page.waitForFunction(() => !Object.values(window.__PP_STATE__.profiles).some((x) => x.name === 'CV Manual Baru'));
  });

  await step('impor daftar kantor resmi', async () => {
    const csv = 'Kode,Nama Cabang,Jenis,Alamat,Latitude,Longitude\n901,KCP Uji Impor,KCP,Jl. Uji,-7.1000,110.4000\n902,KC Tanpa Koordinat,KC,Jl. X,,\n';
    const file = path.join(SHOT_DIR, 'cabang.csv');
    fs.writeFileSync(file, csv);
    await page.click('#btnImport');
    await page.check('input[name="impKind"][value="cabang"]');
    await page.setInputFiles('#fileImport', file);
    await page.waitForSelector('#impPreview .stats');
    await page.uncheck('#impGeocode').catch(() => {});
    await page.click('#btnImpRun');
    await page.waitForFunction(() => !document.getElementById('dlgImport').open, null, { timeout: 20000 });
    const b = await page.evaluate(() => window.__PP_STATE__.branches.find((x) => x.name === 'BNI KCP Uji Impor'));
    assert.ok(b && b.type === 'KCP');
  });

  await step('cadangan JSON: unduh, hapus prospek, pulihkan', async () => {
    await page.click('#btnSettings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackup')]);
    const file = path.join(SHOT_DIR, dl.suggestedFilename());
    await dl.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.app, 'peta-prospek-kredit');
    const n = data.profiles.length;
    assert.ok(n >= 4);
    await page.click('#formSettings .dlg-foot button[value="cancel"]');
    await page.click('#tabbtn-prospek');
    await page.click('#prospectList .item:has-text("PT Baru Impor")');
    await page.click('[data-action="delete-prospect"]');
    await page.click('#confirmOk');
    await page.waitForFunction((k) => Object.keys(window.__PP_STATE__.profiles).length === k - 1, n);
    await page.click('#btnSettings');
    await page.setInputFiles('#fileRestore', file);
    await page.waitForFunction((k) => Object.keys(window.__PP_STATE__.profiles).length === k, n, { timeout: 10000 });
    const p = await page.evaluate(() => Object.values(window.__PP_STATE__.profiles).find((x) => x.name === 'PT Baru Impor'));
    assert.equal(p.plafond, 3.5e9);
    await page.waitForFunction(() => !document.getElementById('dlgSettings').open, null, { timeout: 5000 });
  });

  // Ponsel
  const mobile =await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID' });
  await mockNetwork(mobile);
  const m = await mobile.newPage();
  m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  m.on('console', (msg) => { if (msg.type() === 'error') errors.push('mobile console: ' + msg.text()); });

  await step('ponsel: tata letak, lembar bawah, tanpa geser horizontal', async () => {
    await m.goto(base);
    await m.waitForFunction(() => window.__PP_STATE__.branches.length > 0, null, { timeout: 15000 });
    assert.equal(await m.evaluate(() => document.getElementById('app').dataset.sheet), 'peek');
    await m.screenshot({ path: path.join(SHOT_DIR, '05-ponsel-awal.png') });
    await m.click('#tabbtn-cabang');
    await m.fill('#branchSearch', 'ungaran');
    await m.click('#branchList [data-branch="osm:n1001"]');
    await m.waitForFunction(() => window.__PP_STATE__.resultsCtx && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    assert.equal(await m.evaluate(() => document.getElementById('app').dataset.sheet), 'half');
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, 'overflow horizontal ' + overflow);
    await m.screenshot({ path: path.join(SHOT_DIR, '06-ponsel-deteksi.png') });
    await m.click('#resultList .item >> nth=0');
    await m.waitForSelector('#dossier:not([hidden])');
    const box = await m.locator('#dossier').boundingBox();
    assert.ok(box.width >= 389 && box.height >= 800, 'detail layar penuh');
    await m.screenshot({ path: path.join(SHOT_DIR, '07-ponsel-detail.png') });
    await m.click('#btnDossierClose');
    await m.click('#sheetHandle');
    assert.equal(await m.evaluate(() => document.getElementById('app').dataset.sheet), 'full');
  });

  // Tema gelap
  const dark = await browser.newContext({ viewport: { width: 1366, height: 860 }, colorScheme: 'dark', locale: 'id-ID' });
  await mockNetwork(dark);
  const d = await dark.newPage();
  d.on('pageerror', (e) => errors.push('dark pageerror: ' + e.message));
  await step('tema gelap mengikuti perangkat', async () => {
    await d.goto(base);
    await d.waitForFunction(() => window.__PP_STATE__.branches.length > 0, null, { timeout: 15000 });
    await d.click('#tabbtn-cabang');
    await d.fill('#branchSearch', 'ungaran');
    await d.click('#branchList [data-branch="osm:n1001"]');
    await d.waitForFunction(() => window.__PP_STATE__.resultsCtx && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    const bg = await d.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(14, 22, 33)');
    await d.click('#resultList .item >> nth=0');
    await d.waitForSelector('#dossier:not([hidden])');
    await d.screenshot({ path: path.join(SHOT_DIR, '08-gelap.png') });
  });

  // Mode Google (jaringan tiruan)
  const gctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true, locale: 'id-ID' });
  await mockNetwork(gctx);
  await mockGoogle(gctx);
  const gp = await gctx.newPage();
  gp.on('pageerror', (e) => errors.push('google pageerror: ' + e.message));
  gp.on('console', (m) => { if (m.type() === 'error' && !/status of 429/.test(m.text())) errors.push('google console: ' + m.text()); });
  const GKEY = 'AIzaSyTESTKEY-0123456789abcdefghijklmn';
  const gstate = () => gp.evaluate(() => {
    const s = window.__PP_STATE__;
    return { ready: s.googleReady, source: s.settings.source, results: s.results.map((c) => c.name + '|' + c.zone + '|' + c.source), loading: s.resultsLoading, err: s.resultsError };
  });

  await step('Google: tanpa API key diarahkan ke Pengaturan', async () => {
    await gp.goto(base);
    await gp.waitForFunction(() => window.__PP_STATE__.branches.length > 0, null, { timeout: 15000 });
    await gp.click('#sourceSeg [data-source="google"]');
    await gp.waitForSelector('#dlgSettings[open]');
    assert.ok(await gp.isChecked('input[name="setSource"][value="google"]'));
    assert.match(await gp.locator('#setError').innerText(), /API key/);
    assert.equal(gstats.jsLoads, 0);
  });

  await step('Google: simpan key → peta dasar Google + logo', async () => {
    await gp.fill('#setGKey', 'kunci salah');
    await gp.click('#btnSaveSettings');
    assert.match(await gp.locator('#setError').innerText(), /AIza/);
    await gp.fill('#setGKey', GKEY);
    await gp.fill('#setGBudget', '6');
    await gp.click('#btnSaveSettings');
    await gp.waitForFunction(() => window.__PP_STATE__.googleReady === true, null, { timeout: 10000 });
    assert.equal(gstats.sessions, 2, 'sesi peta jalan & satelit');
    await gp.waitForTimeout(800);
    assert.ok(gstats.tiles > 0, 'petak Google dimuat');
    assert.ok(await gp.isVisible('.google-logo'));
    const layersText = await gp.locator('.leaflet-control-layers').textContent();
    assert.match(layersText, /Google Peta/);
    assert.doesNotMatch(layersText.replace(/Google Peta/g, ''), /Peta/);
    assert.equal(await gp.locator('.leaflet-tile-pane img[src*="tile.openstreetmap.org"]').count(), 0, 'petak OSM tidak dipakai');
    assert.match(await gp.locator('.leaflet-control-attribution').innerText(), /Google/);
    assert.equal(await gp.isVisible('.legend-credit'), true);
  });

  await step('Google: deteksi sekitar kantor dengan batas pencarian', async () => {
    await gp.click('#tabbtn-cabang');
    await gp.fill('#branchSearch', 'ungaran');
    await gp.click('#branchList [data-branch="osm:n1001"]');
    await gp.waitForFunction(() => window.__PP_STATE__.resultsCtx && !window.__PP_STATE__.resultsLoading && window.__PP_STATE__.results.length, null, { timeout: 15000 });
    const st = await gstate();
    const has = (n) => st.results.some((x) => x.startsWith(n + '|'));
    assert.ok(has('PT Google Uji 01'));
    assert.ok(st.results.every((x) => x.endsWith('|google')), 'semua hasil dari Google');
    assert.ok(!has('PT Bank Google'), 'bank dikecualikan');
    assert.ok(!has('PT Tutup Permanen'), 'tutup permanen dikecualikan');
    assert.ok(!has('Toko Optik Sentosa'), 'tanpa label PT/CV');
    const calls = await gp.evaluate(() => window.__gcalls.search);
    assert.ok(calls >= 1 && calls <= 6, 'maks 6 pencarian, dapat ' + calls);
    const fields = await gp.evaluate(() => window.__gcalls.reqs[0].fields);
    assert.deepEqual(fields, ['displayName', 'location', 'formattedAddress', 'types', 'businessStatus', 'googleMapsURI']);
    assert.match(await gp.locator('#detectNotice').innerText(), /Cari lebih banyak/);
    assert.equal(await gp.isDisabled('#btnExportResults'), true, 'hasil Google tidak bisa diekspor');
    await gp.screenshot({ path: path.join(SHOT_DIR, '09-google-deteksi.png') });
  });

  await step('Google: "Cari lebih banyak" melanjutkan sampai usaha jauh ditemukan', async () => {
    for (let i = 0; i < 12; i++) {
      const more = gp.locator('#detectNotice [data-action="google-more"]');
      if (!(await more.count())) break;
      await more.click();
      await gp.waitForFunction(() => !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    }
    const st = await gstate();
    assert.ok(st.results.includes('PT Jauh Google|out|google'), 'usaha 15 km masuk luar zona');
    assert.ok(st.results.includes('CV Google Satu|orange|google'));
    assert.match(await gp.locator('#detectNotice').innerText(), /semua petak sudah dicari/);
  });

  await step('Google: detail telepon/situs web dimuat sekali bila diminta', async () => {
    await gp.click('#tabbtn-deteksi');
    await gp.click('#resultList .item:has-text("PT Google Uji 01")');
    await gp.waitForSelector('#dossier:not([hidden]) [data-action="google-details"]');
    assert.equal(await gp.evaluate(() => window.__gcalls.fetch), 0);
    await gp.click('[data-action="google-details"]');
    await gp.waitForSelector('#dossierBody a[href^="tel:"]');
    const txt = await gp.locator('#dossierBody .facts').innerText();
    assert.match(txt, /024-6921000/);
    assert.match(txt, /★ 4,6/);
    assert.match(txt, /contoh-pt\.co\.id/);
    assert.match(await gp.locator('#dossierBody .d-tags').innerText(), /Google Maps/);
    const link = await gp.locator('#dossierBody .links a:has-text("Google Maps")').getAttribute('href');
    assert.equal(link, 'https://maps.google.com/?cid=gp1');
    await gp.selectOption('[data-f="status"]', 'dihubungi');
    await gp.waitForTimeout(600);
    const prof = await gp.evaluate(() => window.__PP_STATE__.profiles['g:gp1']);
    assert.equal(prof.source, 'google');
    assert.equal(prof.placeId, 'gp1');
    assert.ok(prof.gFetchedAt > 0);
    assert.equal(prof.phone, undefined, 'telepon Google tidak disimpan permanen');
    await gp.click('#btnDossierClose');
    await gp.click('#resultList .item:has-text("PT Google Uji 01")');
    assert.equal(await gp.evaluate(() => window.__gcalls.fetch), 1, 'detail diambil dari memori');
    await gp.screenshot({ path: path.join(SHOT_DIR, '10-google-detail.png') });
    await gp.click('#btnDossierClose');
  });

  await step('Google: pilih ulang kantor tidak menambah pencarian', async () => {
    const before = await gp.evaluate(() => window.__gcalls.search);
    await gp.click('#tabbtn-cabang');
    await gp.fill('#branchSearch', 'bawen');
    await gp.click('#branchList [data-branch="osm:n1006"]');
    await gp.waitForFunction(() => window.__PP_STATE__.activeBranch.name === 'BNI KCP Bawen' && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    const mid = await gp.evaluate(() => window.__gcalls.search);
    assert.ok(mid > before, 'kantor baru memakai pencarian baru');
    await gp.click('#tabbtn-cabang');
    await gp.fill('#branchSearch', 'ungaran');
    await gp.click('#branchList [data-branch="osm:n1001"]');
    await gp.waitForFunction(() => window.__PP_STATE__.activeBranch.name === 'BNI KCP Ungaran' && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    assert.equal(await gp.evaluate(() => window.__gcalls.search), mid);
    const st = await gstate();
    assert.ok(st.results.includes('PT Jauh Google|out|google'), 'hasil sebelumnya dipakai lagi');
  });

  await step('Google: batas aman bulanan menghentikan pencarian', async () => {
    const used = await gp.evaluate(() => PP.google.usage().then((u) => u.search));
    await gp.click('#btnSettings');
    await gp.fill('#setGCap', String(used));
    await gp.click('#btnSaveSettings');
    await gp.click('#tabbtn-cabang');
    await gp.fill('#branchSearch', 'banyumanik');
    await gp.click('#branchList [data-branch="osm:n1003"]');
    await gp.waitForFunction(() => window.__PP_STATE__.activeBranch.name === 'BNI KCP Banyumanik' && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    const st = await gstate();
    assert.match(st.err || '', /Batas aman pencarian/);
    assert.equal(await gp.evaluate(() => PP.google.usage().then((u) => u.search)), used);
  });

  await step('Google: kembali ke OpenStreetMap membuang hasil Google dari peta', async () => {
    await gp.click('#tabbtn-deteksi');
    await gp.click('#sourceSeg [data-source="osm"]');
    await gp.waitForFunction(() => window.__PP_STATE__.settings.source === 'osm' && !window.__PP_STATE__.resultsLoading, null, { timeout: 15000 });
    const st = await gstate();
    assert.ok(st.results.every((x) => !x.endsWith('|google')), 'tidak ada hasil Google di peta OSM');
    assert.equal(await gp.locator('.google-logo').count(), 0);
    assert.doesNotMatch(await gp.locator('.leaflet-control-layers').textContent(), /Google/);
    // Prospek dari Google tetap ada di daftar, tetapi titiknya tidak digambar di peta OSM
    await gp.click('#tabbtn-prospek');
    assert.match(await gp.locator('#prospectList').innerText(), /PT Google Uji 01/);
    assert.equal(await gp.evaluate(() => window.__PP_STATE__.results.some((c) => c.id === 'g:gp1')), false);
  });

  await step('Google: cadangan tidak menyertakan API key', async () => {
    await gp.click('#btnSettings');
    const [dl] = await Promise.all([gp.waitForEvent('download'), gp.click('#btnBackup')]);
    const file = path.join(SHOT_DIR, 'cadangan-google.json');
    await dl.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.settings.googleKey, '');
    assert.ok(data.profiles.some((p) => p.placeId === 'gp1'));
    await gp.click('#formSettings .dlg-foot button[value="cancel"]');
  });

  await browser.close();
  srv.close();
  console.log(results.join('\n'));
  if (errors.length) console.log('\nKesalahan konsol/halaman:\n' + errors.join('\n'));
  console.log('\nTangkapan layar: ' + SHOT_DIR);
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  if (failed || errors.length) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
