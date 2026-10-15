/*
 * Impor & ekspor Excel (SheetJS dimuat hanya saat dibutuhkan).
 */
(function (root) {
  'use strict';

  var U = root.PP.util;
  var loading = null;

  function ensureXLSX() {
    if (root.XLSX) return Promise.resolve(root.XLSX);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'vendor/xlsx/xlsx.core.min.js';
      s.onload = function () {
        if (root.XLSX) resolve(root.XLSX);
        else { loading = null; reject(new Error('Pustaka Excel gagal dimuat.')); }
      };
      s.onerror = function () { loading = null; reject(new Error('Pustaka Excel gagal dimuat. Muat ulang halaman lalu coba lagi.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  async function readWorkbook(file) {
    var XLSX = await ensureXLSX();
    var buf = await file.arrayBuffer();
    var wb;
    try {
      wb = XLSX.read(buf, { type: 'array', cellDates: true });
    } catch (e) {
      throw new Error('File tidak bisa dibaca. Gunakan format .xlsx, .xls, atau .csv.');
    }
    return wb.SheetNames.map(function (name) {
      return {
        name: name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false })
      };
    });
  }

  function isPeopleSheet(n) { return /pengurus|struktur|organisasi|direksi/i.test(n); }
  function isFinanceSheet(n) { return /keuangan|finansial|lapkeu/i.test(n); }
  function isAuxSheet(n) { return isPeopleSheet(n) || isFinanceSheet(n) || /petunjuk|panduan|ringkasan|readme/i.test(n); }

  async function parseProspectFile(file) {
    var sheets = await readWorkbook(file);
    if (!sheets.length) throw new Error('File tidak berisi lembar data.');
    var main = sheets.find(function (s) { return /prospek|debitur|nasabah/i.test(s.name) && !isAuxSheet(s.name); }) ||
      sheets.find(function (s) { return !isAuxSheet(s.name); }) || sheets[0];
    var people = sheets.find(function (s) { return s !== main && isPeopleSheet(s.name); });
    var finance = sheets.find(function (s) { return s !== main && isFinanceSheet(s.name); });
    var res = U.convertProspectSheets(main.rows, people && people.rows, finance && finance.rows);
    res.sheetName = main.name;
    res.peopleSheet = people ? people.name : '';
    res.financeSheet = finance ? finance.name : '';
    return res;
  }

  async function parseBranchFile(file) {
    var sheets = await readWorkbook(file);
    if (!sheets.length) throw new Error('File tidak berisi lembar data.');
    var main = sheets.find(function (s) { return /cabang|kantor|outlet|unit/i.test(s.name); }) ||
      sheets.find(function (s) { return !isAuxSheet(s.name); }) || sheets[0];
    var res = U.convertBranchSheet(main.rows);
    res.sheetName = main.name;
    return res;
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function writeBook(XLSX, wb, filename) {
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  }

  function sheet(XLSX, header, rows, widths) {
    var aoa = [header].concat(rows.map(function (r) { return header.map(function (h) { return r[h] == null ? '' : r[h]; }); }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = (widths || header.map(function (h) { return Math.max(10, h.length + 2); })).map(function (w) { return { wch: w }; });
    if (rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
    return ws;
  }

  function slug(s) {
    return U.normSpace(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'peta';
  }

  function r2(n) { return n == null || !isFinite(n) ? '' : Math.round(n * 100) / 100; }
  function r4(n) { return n == null || !isFinite(n) ? '' : Math.round(n * 10000) / 10000; }

  function osmLink(c) { return c.osm ? 'https://www.openstreetmap.org/' + c.osm : ''; }

  function zoneLabel(zone, settings) {
    if (!zone) return '';
    if (zone === 'out') return 'Luar zona (> ' + settings.radii[2] + ' km)';
    return U.ZONE_LABEL[zone] || '';
  }

  async function exportResults(results, ctx, settings) {
    var XLSX = await ensureXLSX();
    var header = ['No', 'Zona', 'Jarak (km)', 'Nama', 'Badan usaha', 'Kategori', 'Perkiraan sektor', 'Alamat', 'Telepon', 'Email', 'Situs web',
      'Acuan jarak', 'Kantor BNI terdekat', 'Jarak ke kantor terdekat (km)', 'Status', 'Estimasi plafond (Rp)',
      'Latitude', 'Longitude', 'Asal data', 'Tautan OpenStreetMap'];
    var rows = results.map(function (c, i) {
      var p = c.profile;
      return {
        'No': i + 1,
        'Zona': zoneLabel(c.zone, settings),
        'Jarak (km)': r2(c.dist),
        'Nama': c.name,
        'Badan usaha': U.ENTITY_LABEL[c.entity] || c.entity,
        'Kategori': c.category || '',
        'Perkiraan sektor': c.sector && U.SECTOR_BY_ID[c.sector] ? U.SECTOR_BY_ID[c.sector].label : '',
        'Alamat': c.address || '',
        'Telepon': c.phone || '',
        'Email': c.email || '',
        'Situs web': c.website || '',
        'Acuan jarak': c.refName || '',
        'Kantor BNI terdekat': c.nearest ? c.nearest.name : '',
        'Jarak ke kantor terdekat (km)': c.nearest ? r2(c.nearest.dist) : '',
        'Status': p ? U.STATUS_LABEL[p.status] || '' : '',
        'Estimasi plafond (Rp)': p && p.plafond != null ? p.plafond : '',
        'Latitude': c.lat,
        'Longitude': c.lon,
        'Asal data': c.source === 'osm' ? 'OpenStreetMap' : c.source === 'google' ? 'Google Maps' : (c.source === 'import' ? 'Impor Excel' : 'Input manual'),
        'Tautan OpenStreetMap': osmLink(c)
      };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, header, rows,
      [5, 10, 10, 38, 13, 20, 28, 40, 16, 22, 26, 26, 28, 14, 20, 18, 11, 11, 14, 40]), 'Hasil Deteksi');

    var ents = U.ENTITIES.map(function (e) { return e.id; });
    var summary = [
      ['Acuan', ctx.label],
      ['Radius zona (km)', 'Merah ≤ ' + settings.radii[0] + ' · Oranye ≤ ' + settings.radii[1] + ' · Hijau ≤ ' + settings.radii[2] +
        ' · Luar zona ≤ ' + settings.maxRadius + ' (dari kantor aktif)'],
      ['Diekspor', U.isoDate(new Date())],
      ['Sumber data', 'OpenStreetMap (© kontributor OpenStreetMap) dan data prospek Anda'],
      [],
      ['Badan usaha', 'Merah', 'Oranye', 'Hijau', 'Luar zona', 'Total']
    ];
    ents.forEach(function (id) {
      var list = results.filter(function (c) { return c.entity === id; });
      if (!list.length) return;
      var count = function (z) { return list.filter(function (c) { return c.zone === z; }).length; };
      summary.push([U.ENTITY_LABEL[id], count('red'), count('orange'), count('green'), count('out'), list.length]);
    });
    var ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2['!cols'] = [{ wch: 20 }, { wch: 60 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan');
    writeBook(XLSX, wb, 'deteksi-' + slug(ctx.label) + '-' + U.isoDate(new Date()) + '.xlsx');
  }

  async function exportProspects(list, settings) {
    var XLSX = await ensureXLSX();
    var header = ['ID', 'Nama', 'Badan usaha', 'Status', 'Estimasi plafond (Rp)', 'Sesuai target', 'Produk', 'Bidang usaha', 'Perkiraan sektor',
      'Tahun berdiri', 'PIC', 'Telepon', 'Email', 'Situs web', 'Alamat', 'Kota', 'Latitude', 'Longitude',
      'Kantor BNI terdekat', 'Jarak (km)', 'Zona', 'Nasabah BNI', 'Follow-up', 'Aktivitas terakhir', 'Langkah berikutnya', 'Jumlah aktivitas',
      'Kelengkapan dokumen', 'Catatan', 'Sumber data', 'Asal data', 'Tautan peta', 'Terakhir diubah'];
    var rows = list.map(function (x) {
      var p = x.profile;
      var target = U.inTarget(p.plafond, settings);
      var last = U.lastActivity(p);
      var doc = U.docProgress(p.dokumen);
      return {
        'ID': p.id,
        'Nama': p.name,
        'Badan usaha': p.entity,
        'Status': U.STATUS_LABEL[p.status] || '',
        'Estimasi plafond (Rp)': p.plafond != null ? p.plafond : '',
        'Sesuai target': target == null ? '' : (target ? 'Ya' : 'Tidak'),
        'Produk': p.produk || '',
        'Bidang usaha': p.bidang || '',
        'Perkiraan sektor': U.SECTOR_BY_ID[U.classifySector(p, p)].label,
        'Tahun berdiri': p.tahunBerdiri || '',
        'PIC': p.pic || '',
        'Telepon': p.phone || '',
        'Email': p.email || '',
        'Situs web': p.website || '',
        'Alamat': p.address || '',
        'Kota': p.city || '',
        'Latitude': p.lat != null ? p.lat : '',
        'Longitude': p.lon != null ? p.lon : '',
        'Kantor BNI terdekat': x.nearest ? x.nearest.name : '',
        'Jarak (km)': x.nearest ? r2(x.nearest.dist) : '',
        'Zona': zoneLabel(x.zone, settings),
        'Nasabah BNI': p.isNasabah ? 'Ya' : 'Tidak',
        'Follow-up': p.followUp || '',
        'Aktivitas terakhir': last ? last.tanggal + ' ' + (U.ACTIVITY_LABEL[last.jenis] || '') + (last.hasil ? ': ' + last.hasil : '') : '',
        'Langkah berikutnya': last && last.langkah ? last.langkah : '',
        'Jumlah aktivitas': (p.aktivitas || []).length,
        'Kelengkapan dokumen': doc.done ? doc.done + '/' + doc.total : '',
        'Catatan': p.catatan || '',
        'Sumber data': p.sumberData || '',
        'Asal data': p.source === 'osm' ? 'OpenStreetMap' : p.source === 'google' ? 'Google Maps' : (p.source === 'import' ? 'Impor Excel' : 'Input manual'),
        'Tautan peta': p.mapsUrl || (p.lat != null ? 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lon : ''),
        'Terakhir diubah': p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : ''
      };
    });
    var people = [];
    var fin = [];
    var acts = [];
    list.forEach(function (x) {
      var p = x.profile;
      U.sortActivities(p.aktivitas).forEach(function (a) {
        acts.push({ 'ID': p.id, 'Perusahaan': p.name, 'Tanggal': a.tanggal, 'Jenis': U.ACTIVITY_LABEL[a.jenis] || '', 'Hasil': a.hasil || '', 'Langkah berikutnya': a.langkah || '' });
      });
      (p.pengurus || []).forEach(function (o) {
        people.push({ 'ID': p.id, 'Perusahaan': p.name, 'Nama': o.nama, 'Jabatan': o.jabatan, 'Saham (%)': o.saham == null ? '' : o.saham });
      });
      U.financeView(p.keuangan).forEach(function (f) {
        fin.push({
          'ID': p.id, 'Perusahaan': p.name, 'Tahun': f.tahun || '',
          'Penjualan': f.penjualan == null ? '' : f.penjualan,
          'Laba bersih': f.laba == null ? '' : f.laba,
          'Total aset': f.aset == null ? '' : f.aset,
          'Total liabilitas': f.liabilitas == null ? '' : f.liabilitas,
          'Ekuitas': f.ekuitas == null ? '' : f.ekuitas,
          'HPP': f.hpp == null ? '' : f.hpp,
          'Piutang usaha': f.piutang == null ? '' : f.piutang,
          'Persediaan': f.persediaan == null ? '' : f.persediaan,
          'Utang usaha': f.utangUsaha == null ? '' : f.utangUsaha,
          'Penyusutan': f.penyusutan == null ? '' : f.penyusutan,
          'Beban bunga': f.bebanBunga == null ? '' : f.bebanBunga,
          'Angsuran pinjaman per tahun': f.angsuranTahun == null ? '' : f.angsuranTahun,
          'Margin laba bersih': r4(f.npm),
          'ROA': r4(f.roa),
          'DER (x)': r2(f.der),
          'Pertumbuhan penjualan': r4(f.growth)
        });
      });
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, header, rows,
      [22, 36, 12, 20, 18, 12, 18, 24, 28, 12, 20, 16, 22, 24, 40, 16, 11, 11, 28, 10, 10, 11, 12, 36, 28, 10, 12, 40, 20, 14, 40, 17]), 'Prospek');
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, ['ID', 'Perusahaan', 'Nama', 'Jabatan', 'Saham (%)'], people,
      [22, 36, 28, 18, 10]), 'Pengurus');
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, ['ID', 'Perusahaan', 'Tahun', 'Penjualan', 'Laba bersih', 'Total aset',
      'Total liabilitas', 'Ekuitas', 'HPP', 'Piutang usaha', 'Persediaan', 'Utang usaha', 'Penyusutan', 'Beban bunga',
      'Angsuran pinjaman per tahun', 'Margin laba bersih', 'ROA', 'DER (x)', 'Pertumbuhan penjualan'], fin,
      [22, 36, 8, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 12, 10, 10, 14]), 'Keuangan');
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, ['ID', 'Perusahaan', 'Tanggal', 'Jenis', 'Hasil', 'Langkah berikutnya'], acts,
      [22, 36, 11, 16, 44, 30]), 'Aktivitas');
    writeBook(XLSX, wb, 'prospek-saya-' + U.isoDate(new Date()) + '.xlsx');
  }

  // Laporan aktivitas RM: ringkasan, aktivitas, dan pipeline per status.
  async function exportReport(rep, meta, settings) {
    var XLSX = await ensureXLSX();
    var wb = XLSX.utils.book_new();
    var types = U.ACTIVITY_TYPES.map(function (t) { return [t.label, rep.byType[t.id] || 0]; });
    var summary = [
      ['Laporan aktivitas RM'],
      ['Nama', meta.nama || ''], ['Kantor', meta.kantor ? 'BNI ' + meta.kantor : ''], ['Periode', rep.range.label],
      [],
      ['Aktivitas', rep.activities.length]].concat(types.map(function (t) { return ['  ' + t[0], t[1]]; })).concat([
      ['Prospek dihubungi', rep.contacted],
      ['Prospek baru', rep.created.length],
      ['Masuk pengajuan', rep.moved.pengajuan.count], ['  Plafond pengajuan (Rp)', rep.moved.pengajuan.plafond],
      ['Disetujui / cair', rep.moved.disetujui.count], ['  Plafond disetujui (Rp)', rep.moved.disetujui.plafond],
      ['Pipeline aktif (prospek)', rep.openCount], ['Pipeline aktif (Rp)', rep.openPlafond],
      ['Sesuai target plafond', rep.inTarget],
      ['Follow-up 7 hari berikutnya', rep.upcoming.length]
    ]);
    var ws = XLSX.utils.aoa_to_sheet(summary);
    ws['!cols'] = [{ wch: 30 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Ringkasan');
    var acts = rep.activities.map(function (x) {
      return { 'Tanggal': x.a.tanggal, 'Perusahaan': x.p.name, 'Jenis': U.ACTIVITY_LABEL[x.a.jenis] || '', 'Hasil': x.a.hasil || '',
        'Langkah berikutnya': x.a.langkah || '', 'Status sekarang': U.STATUS_LABEL[x.p.status] || '',
        'Estimasi plafond (Rp)': x.p.plafond != null ? x.p.plafond : '' };
    });
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, ['Tanggal', 'Perusahaan', 'Jenis', 'Hasil', 'Langkah berikutnya', 'Status sekarang', 'Estimasi plafond (Rp)'],
      acts, [11, 36, 16, 40, 30, 20, 18]), 'Aktivitas');
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, ['Status', 'Jumlah prospek', 'Total plafond (Rp)'], rep.pipeline.map(function (r) {
      return { 'Status': r.label, 'Jumlah prospek': r.count, 'Total plafond (Rp)': r.plafond };
    }), [24, 14, 20]), 'Pipeline');
    writeBook(XLSX, wb, 'laporan-rm-' + rep.range.from + '-' + rep.range.to + '.xlsx');
  }

  async function downloadProspectTemplate() {
    var XLSX = await ensureXLSX();
    var wb = XLSX.utils.book_new();
    var main = [
      ['Nama Perusahaan', 'Badan Usaha', 'Alamat', 'Kota', 'Latitude', 'Longitude', 'Koordinat', 'Telepon', 'Bidang Usaha',
        'PIC', 'Status', 'Plafond', 'Produk', 'Follow-up', 'Nasabah BNI', 'Direktur Utama', 'Direktur', 'Komisaris Utama',
        'Komisaris', 'Pemegang Saham', 'Tahun', 'Penjualan', 'Laba Bersih', 'Total Aset', 'Total Liabilitas', 'Ekuitas', 'Catatan'],
      ['PT Contoh Sejahtera (contoh)', 'PT', 'Jl. Contoh No. 1', 'Semarang', -7.0051, 110.4381, '', '024-000000',
        'Distributor bahan bangunan', 'Bapak Contoh', 'Kunjungan', '2,5 M', 'KMK', '2026-11-02', 'Tidak', 'Nama Direktur Utama',
        '', 'Nama Komisaris Utama', '', 'Pemegang A (60%); Pemegang B (40%)', 2025, 12000000000, 900000000, 8000000000,
        3000000000, '', 'Baris yang namanya berisi "(contoh)" dilewati saat impor.'],
      ['CV Contoh Mandiri (contoh)', 'CV', 'Jl. Contoh No. 2', 'Semarang', '', '', '-7.0100, 110.4200', '', 'Kontraktor',
        '', 'Baru', '750 jt', 'KI', '', '', '', '', '', '', 'Sekutu A (70%); Sekutu B (30%)', '', '', '', '', '', '',
        'Koordinat boleh ditempel dari Google Maps.']
    ];
    var ws = XLSX.utils.aoa_to_sheet(main);
    ws['!cols'] = main[0].map(function (h, i) { return { wch: i === 0 ? 32 : Math.max(12, h.length + 4) }; });
    XLSX.utils.book_append_sheet(wb, ws, 'Prospek');
    var pengurus = XLSX.utils.aoa_to_sheet([
      ['Perusahaan', 'Nama', 'Jabatan', 'Saham (%)'],
      ['PT Contoh Sejahtera (contoh)', 'Nama Direktur', 'Direktur', ''],
      ['PT Contoh Sejahtera (contoh)', 'Pemegang A', 'Pemegang Saham', 60]
    ]);
    pengurus['!cols'] = [{ wch: 32 }, { wch: 26 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, pengurus, 'Pengurus');
    var keu = XLSX.utils.aoa_to_sheet([
      ['Perusahaan', 'Tahun', 'Penjualan', 'Laba Bersih', 'Total Aset', 'Total Liabilitas', 'Ekuitas', 'HPP', 'Piutang Usaha',
        'Persediaan', 'Utang Usaha', 'Penyusutan', 'Beban Bunga', 'Angsuran Pinjaman'],
      ['PT Contoh Sejahtera (contoh)', 2024, 10000000000, 700000000, 7000000000, 2800000000, 4200000000, 7500000000, 1200000000,
        1000000000, 500000000, 250000000, 80000000, 150000000]
    ]);
    keu['!cols'] = [{ wch: 32 }, { wch: 8 }].concat(Array(12).fill({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, keu, 'Keuangan');
    var help = XLSX.utils.aoa_to_sheet([
      ['Petunjuk impor prospek'],
      ['1. Hanya kolom "Nama Perusahaan" yang wajib. Kolom lain boleh dihapus atau dibiarkan kosong.'],
      ['2. Lokasi: isi Latitude & Longitude, atau kolom Koordinat (tempel dari Google Maps), atau cukup Alamat + Kota (aplikasi mencari koordinatnya).'],
      ['3. Plafond boleh ditulis 2500000000, "2,5 M", atau "750 jt". Angka kecil tanpa satuan dibaca sebagai miliar.'],
      ['4. Status: Baru, Dihubungi, Kunjungan, Pengajuan, Disetujui, Ditolak.'],
      ['5. Beberapa orang dalam satu sel dipisahkan titik koma, persen saham dalam kurung: "Budi (60%); Ani (40%)".'],
      ['6. Pengurus dan laporan keuangan beberapa tahun bisa diisi di lembar "Pengurus" dan "Keuangan" (kolom Perusahaan harus sama dengan nama di lembar Prospek).'],
      ['   HPP, piutang usaha, persediaan, utang usaha, penyusutan, beban bunga, dan angsuran pinjaman per tahun dipakai kalkulator kelayakan.'],
      ['7. Baris contoh yang namanya berisi "(contoh)" tidak ikut diimpor.'],
      ['8. Jangan memasukkan data SLIK OJK atau data nasabah yang bersifat rahasia.']
    ]);
    help['!cols'] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, help, 'Petunjuk');
    writeBook(XLSX, wb, 'template-prospek.xlsx');
  }

  async function downloadBranchTemplate() {
    var XLSX = await ensureXLSX();
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([
      ['Kode', 'Nama Cabang', 'Jenis', 'Alamat', 'Kota', 'Latitude', 'Longitude', 'Telepon'],
      ['000', 'BNI KCP Contoh (contoh)', 'KCP', 'Jl. Contoh No. 1', 'Semarang', -7.0051, 110.4381, '']
    ]);
    ws['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 10 }, { wch: 36 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Cabang');
    var help = XLSX.utils.aoa_to_sheet([
      ['Petunjuk impor cabang'],
      ['Isi satu baris per kantor. Jenis: KC, KCP, KK, atau Kanwil. Koordinat bisa juga ditulis di satu kolom "Koordinat".'],
      ['Baris tanpa koordinat dicarikan lokasinya dari alamat bila opsi pencarian alamat dicentang.']
    ]);
    help['!cols'] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, help, 'Petunjuk');
    writeBook(XLSX, wb, 'template-cabang.xlsx');
  }

  root.PP.excel = {
    ensureXLSX: ensureXLSX, parseProspectFile: parseProspectFile, parseBranchFile: parseBranchFile,
    exportResults: exportResults, exportProspects: exportProspects, exportReport: exportReport,
    downloadProspectTemplate: downloadProspectTemplate, downloadBranchTemplate: downloadBranchTemplate,
    downloadBlob: downloadBlob
  };
})(self);
