# Peta Prospek Kredit

Aplikasi web untuk RM yang mencari debitur kredit Rp1–25 miliar. Aplikasi ini menampilkan kantor BNI se-Indonesia di peta, menggambar tiga zona jarak di sekitar kantor, lalu mendeteksi PT, CV, dan badan usaha lain di zona tersebut. Setiap perusahaan bisa dibuka untuk melihat alamat dan kontak, mencatat status pipeline, menyusun struktur organisasi, dan mengisi laporan keuangan. Tab Peluang merangkum sektor usaha dan kawasan ekonomi yang paling potensial di sekitar kantor.

Aplikasi ini alat bantu pribadi, bukan aplikasi resmi BNI.

| Zona | Jarak dari kantor BNI (bawaan, bisa diubah) |
|---|---|
| Merah | 0–1 km |
| Oranye | 1–5 km |
| Hijau | 5–10 km |
| Luar zona | di atas 10 km, tetap ditampilkan sebagai bahan pertimbangan sampai jangkauan maksimal (bawaan 20 km, bisa sampai 50 km) |

## Fitur

- **Peta kantor BNI se-Indonesia** dari OpenStreetMap, dilengkapi ±1.670 kantor dari Overture Maps: KC, KCP, KK, dan Kanwil, dengan pencarian dan filter jenis kantor. Kantor yang belum ada bisa Anda tambahkan sendiri, kantor yang salah bisa diubah atau disembunyikan, dan daftar resmi kantor bisa diimpor dari Excel.
- **Deteksi otomatis badan usaha** di sekitar kantor yang dipilih: PT, CV, UD, PD, Firma, dan koperasi. PT Tbk dan BUMN/Persero tersembunyi secara bawaan karena biasanya di atas target plafond, tetapi bisa ditampilkan dengan satu klik. Opsional: pabrik, gudang, grosir, dealer, hotel, SPBU, dan rumah sakit yang tidak berlabel PT/CV.
- **Peluang pasar**: sektor usaha paling potensial di sekitar kantor beserta saran produk (KMK/KI), klaster usaha yang berdekatan, pasar, mal, kawasan industri, dan pelabuhan terdekat, jumlah kantor bank lain, serta tautan berita investasi dan data PDRB BPS untuk kota tersebut. Lihat [Peluang pasar](#peluang-pasar).
- **Mode area**: tanpa kantor aktif, geser peta ke kawasan mana pun dan zona dihitung dari kantor BNI terdekat.
- **Mode Google Maps (opsional, API key sendiri)**: deteksi PT/CV memakai data Google Maps yang jauh lebih lengkap, di atas peta Google. Telepon, situs web, rating, dan jam buka bisa dimuat per perusahaan. Ada batas pencarian per deteksi dan batas aman bulanan agar tidak melewati kuota gratis.
- **Jembatan ke Google Maps (gratis)**: tautan "Cari di Google Maps" membuka pencarian PT, CV, UD, pabrik, gudang, dan distributor di sekitar kantor. Perusahaan yang ditemukan bisa dimasukkan dengan menempel koordinat atau tautan Google Maps-nya.
- **Detail perusahaan**: kategori usaha, alamat, telepon, situs web, kantor BNI terdekat, serta tautan riset ke Google Maps, Street View, Google, AHU Online, LinkedIn, dan IDX (untuk Tbk).
- **Pipeline kredit**: status (baru → dihubungi → kunjungan → pengajuan → disetujui/ditolak), estimasi plafond dengan tanda "sesuai target", produk KMK/KI, jadwal follow-up, PIC, dan catatan.
- **Kerja harian RM** (lihat [Kerja harian](#kerja-harian)):
  - **Prioritas**: skor 0–100 per perusahaan dari zona, sektor, badan usaha, ketersediaan kontak, dan tahap pipeline. Hasil deteksi dan prospek bisa diurutkan menurut prioritas.
  - **Rute kunjungan**: sampai 10 prospek disusun dalam urutan terpendek, lalu dibuka sebagai rute di Google Maps.
  - **Agenda follow-up**: terlambat, hari ini, dan 7 hari ke depan, dengan tombol Google Calendar dan unduh .ics.
  - **Riwayat aktivitas dan laporan**: catat telepon, WhatsApp, dan kunjungan; laporan mingguan atau bulanan untuk atasan.
  - **WhatsApp perkenalan**: satu ketuk membuka WhatsApp dengan pesan perkenalan dari template.
  - **Kalkulator kelayakan**: perkiraan KMK, KI, DSCR, dan plafond maksimal dari laporan keuangan.
  - **Checklist dokumen pengajuan** dan tautan Zona Nilai Tanah untuk perkiraan nilai agunan.
  - **Cek rekam jejak**: tautan pencarian tender pemerintah, kontraktor (LPJK), eksportir, dan berita.
  - **Sembunyikan yang tidak relevan**: perusahaan tutup atau bukan target tidak muncul lagi di hasil deteksi.
- **Struktur organisasi**: isi pemegang saham, komisaris, direksi, atau sekutu CV; bagan tersusun otomatis.
- **Laporan keuangan** per tahun: penjualan, laba bersih, aset, liabilitas, dan ekuitas, dengan rasio otomatis (margin laba, ROA, DER, pertumbuhan omzet).
- **Impor Excel/CSV**: daftar prospek (termasuk pengurus dan keuangan) dan daftar kantor resmi. Baris tanpa koordinat dicarikan lokasinya dari alamat.
- **Ekspor Excel**: hasil deteksi per zona dan seluruh pipeline (lembar Prospek, Pengurus, Keuangan, Aktivitas). File ekspor bisa diimpor kembali di perangkat lain; riwayat aktivitas ikut lewat file cadangan.
- **Bisa dipasang di HP** sebagai aplikasi (Add to Home Screen), tampilan menyesuaikan layar ponsel, dan mendukung mode gelap.

## Cara membuka

### Pilihan 1: GitHub Pages (disarankan untuk HP)

1. Di GitHub buka **Settings → Pages**.
2. Pada **Build and deployment** pilih **Deploy from a branch**, pilih branch yang berisi aplikasi ini dan folder **/ (root)**, lalu **Save**.
3. Setelah 1–2 menit aplikasi tersedia di `https://emilianaaelgaa.github.io/punyaAziz3/`.
4. Di HP, buka alamat tersebut di Chrome, lalu menu **⋮ → Tambahkan ke layar utama**.

GitHub Pages gratis untuk repositori publik. Untuk repositori privat diperlukan paket GitHub berbayar. Kodenya aman dipublikasikan karena data prospek tidak pernah tersimpan di repositori, hanya di browser masing-masing perangkat.

### Pilihan 2: langsung di laptop

Unduh repositori (**Code → Download ZIP**), ekstrak, lalu buka `index.html` dengan Chrome atau Edge. Tidak perlu instalasi.

Aplikasi membutuhkan internet untuk peta dan data OpenStreetMap. Jika jaringan kantor memblokir `overpass-api.de` atau `tile.openstreetmap.org`, gunakan data seluler atau pilih server Overpass lain di **Pengaturan**.

## Cara pakai singkat

1. Pertama kali dibuka, aplikasi mengunduh data kantor BNI se-Indonesia (sekali saja, ±30 detik; diperbarui otomatis tiap 30 hari).
2. Pilih kantor: klik penanda di peta, cari di tab **Cabang**, atau tekan **Lokasi saya** untuk melihat kantor terdekat.
   - Kantor belum ada? Di tab **Cabang** tekan **Tambah kantor**, lalu ketuk lokasinya di peta atau tempel koordinat/tautan Google Maps. Bila pencarian tidak menemukan kantor, tombol **Cari di Google Maps** membantu menemukan lokasinya.
   - Nama, jenis, atau lokasi kantor salah? Pilih kantornya, lalu tekan **Ubah data kantor** di tab **Deteksi**. Kantor yang tidak ada bisa disembunyikan, dan bisa ditampilkan lagi dari **Pengaturan**.
3. Tab **Deteksi** menampilkan jumlah usaha per zona. Klik kotak zona atau chip badan usaha untuk menyaring.
4. Tab **Peluang** merangkum sektor usaha yang paling potensial, klaster usaha, pusat ekonomi, dan bank lain di sekitar kantor.
5. Klik perusahaan untuk membuka detail. Isian apa pun otomatis menyimpan perusahaan ke tab **Prospek saya**.
6. Perusahaan yang belum ada di peta bisa ditambahkan dengan tombol **+ Prospek**, lalu ketuk lokasinya atau tempel koordinat/tautan dari Google Maps. Bisa juga diimpor dari Excel.
   - Di aplikasi Google Maps HP: tekan lama lokasi perusahaan, salin koordinat yang muncul, lalu tempel.
   - Di Google Maps desktop: buka tempatnya, lalu salin alamat dari address bar browser (tautan yang memuat `!3d…!4d…` atau `@lat,lon`).
7. Unduh **cadangan** secara berkala dari **Pengaturan**, karena data hanya tersimpan di browser perangkat tersebut.

Di HP, panel bawah (tab Cabang, Deteksi, Peluang, Prospek) bisa digeser dengan jari: tarik garis pegangan atau baris tab ke atas untuk memperbesar, ke bawah untuk memperkecil. Isi tab, termasuk judul dan kotak zona, bergulir sebagai satu bagian. Saat panel belum penuh, geser isinya ke atas untuk memperbesar panel dulu; saat sudah di paling atas, tarik ke bawah untuk memperkecilnya.

## Kerja harian

Tab **Prospek** punya empat tampilan: **Daftar**, **Agenda**, **Rute**, dan **Laporan**. Alur yang disarankan:

1. **Pagi: buka Agenda.** Prospek dengan follow-up terlambat dan hari ini tampil paling atas. Angka merah di tab Prospek menunjukkan jumlahnya, dan aplikasi mengingatkan sekali sehari saat dibuka. Tombol **Google Calendar** atau **Unduh semua ke kalender (.ics)** memasukkan jadwal ke kalender ponsel atau Outlook.
2. **Susun rute.** Di **Rute**, tekan **Isi dari prioritas teratas**, atau tambahkan prospek dari detail perusahaan (**+ Rute kunjungan**), dari Agenda, atau dari klaster di tab Peluang (**Masukkan ke rute kunjungan**). Urutan terpendek dihitung otomatis dari kantor aktif, lokasi Anda, atau lokasi HP saat rute dibuka. **Buka rute di Google Maps** menampilkan rute jalan sebenarnya. Maksimal 10 titik; di HP, buka dengan aplikasi Google Maps karena browser HP hanya membaca 3 titik singgah.
3. **Hubungi dengan WhatsApp.** Isi **Pengaturan → Profil RM** sekali (nama, jabatan, kantor). Di detail perusahaan yang punya nomor HP (di isian PIC atau telepon), tombol **WhatsApp** membuka chat dengan pesan perkenalan. Pesan tetap Anda kirim sendiri, satu per satu.
4. **Catat setiap kontak.** Di **Riwayat aktivitas**, isi jenis (telepon, WhatsApp, kunjungan, rapat), hasil, langkah berikutnya, dan tanggal follow-up berikutnya. Status naik otomatis (aktivitas pertama → "Sudah dihubungi", kunjungan → "Kunjungan / survei"), tetapi tidak pernah turun. Tombol **Selesai** di Rute mencatat kunjungan.
5. **Saring kelayakan.** Isi laporan keuangan beserta **Rincian untuk kalkulator kelayakan**, lalu lihat **Kalkulator kelayakan** dan tekan **Pakai sebagai estimasi plafond** bila sesuai. Centang **Kelengkapan dokumen pengajuan** saat dokumen diterima.
6. **Akhir minggu: Laporan.** Pilih minggu ini, minggu lalu, atau bulan ini, lalu **Salin ringkasan** (untuk WhatsApp/email ke atasan) atau **Unduh Excel**.

### Skor prioritas

| Komponen | Bobot | Nilai |
|---|---|---|
| Zona | 30 | merah 1, oranye 0,75, hijau 0,45, luar zona 0,2 |
| Kecocokan sektor dengan kredit Rp1–25 M | 25 | sama dengan tab Peluang (distribusi dan pabrik 1,0 … bidang belum diketahui 0,4) |
| Badan usaha | 15 | PT 1, CV 0,85, Firma 0,75, UD/PD/koperasi 0,7, lainnya 0,55, Tbk/BUMN 0,3 |
| Kontak | 10 | ada nomor HP 1, ada telepon/situs 0,7, tidak ada 0,3 |
| Tahap pipeline | 20 | belum disimpan 0,5, baru 0,6, dihubungi 0,9, kunjungan 1, pengajuan 0,7; +0,3 bila plafond sesuai target, −0,4 bila di luar target; follow-up hari ini/terlambat = 1 |

Skor ≥ 70 ditandai **Prioritas tinggi**. Prospek yang sudah disetujui atau ditolak bernilai 0.

### Kalkulator kelayakan

Perhitungan memakai laporan keuangan tahun terakhir dan dapat diubah lewat isian bunga, tenor, porsi bank, rencana investasi, KMK di bank lain, dan pertumbuhan.

- **Siklus kas** = hari piutang (piutang ÷ penjualan × 365) + hari persediaan (persediaan ÷ HPP × 365) − hari utang usaha (utang usaha ÷ HPP × 365).
- **Kebutuhan modal kerja** = siklus kas ÷ 365 × HPP × (1 + pertumbuhan). Pertumbuhan bawaan diambil dari kenaikan penjualan tahun lalu (0–30%), atau 10% bila belum ada.
- **Perkiraan KMK** = kebutuhan modal kerja × porsi bank (bawaan 70%) − KMK di bank lain.
- **Perkiraan KI** = rencana investasi × porsi bank, dengan angsuran anuitas (bawaan bunga 10% per tahun, tenor 5 tahun).
- **DSCR** = (laba bersih + penyusutan + beban bunga) ÷ (angsuran pinjaman lama + bunga KMK + angsuran KI). **KI maksimal** adalah pinjaman terbesar yang masih menjaga DSCR ≥ 1,25.
- **Perkiraan plafond** = KMK + KI (KI dibatasi KI maksimal).

Hasilnya perkiraan kasar untuk menyaring prospek sejak awal, bukan analisis kredit resmi. Keputusan kredit tetap mengikuti analisis dan ketentuan BNI.

## Peluang pasar

Tab **Peluang** menjawab pertanyaan "sektor dan kawasan mana yang paling ramai di sekitar kantor ini?" dari usaha yang sudah terdeteksi. Selama tab ini terbuka, peta menampilkan klaster sebagai lingkaran putus-putus berlabel K1, K2, dan seterusnya, ikon pasar, mal, dan kawasan industri, serta titik kantor bank lain.

| Bagian | Isi | Cara menghitung |
|---|---|---|
| Ringkasan rekomendasi | Sektor teratas, klaster terpadat, pusat ekonomi teramai, dan tingkat persaingan | Rangkuman dari bagian-bagian di bawah |
| Sektor unggulan | Jumlah usaha per sektor, sebarannya per zona, dan saran produk kredit. Tombol di setiap sektor menyaring daftar di tab Deteksi ke sektor tersebut. | Bidang usaha ditebak dari isian "Bidang usaha", lalu nama, lalu kategori di peta. Setiap usaha diberi bobot zona (merah 3, oranye 2, hijau 1, luar zona 0,5), dijumlahkan per sektor, lalu dikali kecocokan sektor dengan kredit Rp1–25 miliar (distribusi dan pabrik 1,0; konstruksi, logistik, otomotif 0,9; kesehatan, pertanian, energi 0,8; hotel dan kuliner 0,7; properti, jasa, dan ritel 0,6) |
| Klaster usaha | Kumpulan minimal 4 usaha dalam radius 500 m, beserta nama jalan dan sektor yang dominan | Dihitung dari titik usaha yang terdeteksi |
| Pusat ekonomi terdekat | Pasar, mal, kawasan industri, pergudangan, dan pelabuhan, diurutkan dari yang paling banyak usaha terdeteksi dalam 1 km | Data OpenStreetMap. Tautan **Lihat jam ramai di Google Maps** membuka tempat tersebut di Google Maps. |
| Bank lain di sekitar | Jumlah kantor bank lain per merek dalam radius zona oranye | Data OpenStreetMap. ATM dan kantor BNI tidak dihitung. |
| Yang sedang ramai | Tautan Google News (investasi, pabrik baru, ekspansi usaha) dan pencarian PDRB per sektor di situs BPS untuk kota/kabupaten tersebut | Nama wilayah dicari lewat OpenStreetMap Nominatim |

Keterbatasan:

- Aplikasi tidak memiliki data tren pertumbuhan. "Ramai" di sini berarti padat usaha dan dekat pusat ekonomi saat ini. Pertumbuhan resmi per sektor ada di PDRB BPS, kabar terbaru ada di berita.
- Sektor ditebak dari kata kunci, jadi bisa meleset. Nama seperti "PT Maju Jaya" tidak menyebut bidangnya; bila kategorinya di peta juga umum, usaha itu masuk "Bidang belum diketahui". Isi **Bidang usaha** di detail perusahaan setelah kunjungan agar rekomendasi makin tepat.
- Kelengkapan rekomendasi mengikuti kelengkapan hasil deteksi. Hasil di mode Google Maps biasanya lebih lengkap daripada OpenStreetMap.

## Sumber data dan keterbatasannya

- **Kantor BNI dan badan usaha** berasal dari [OpenStreetMap](https://www.openstreetmap.org/copyright) (© kontributor OpenStreetMap, lisensi ODbL) melalui Overpass API. Data diisi sukarelawan sehingga tidak semua kantor dan perusahaan tercatat, terutama PT/CV kecil di luar kota besar. Tambahkan prospek secara manual atau impor dari Excel untuk melengkapi. Kantor BNI dapat diganti dengan daftar resmi melalui impor.
- **Kantor BNI tambahan** berasal dari [Overture Maps Foundation](https://overturemaps.org/) (data tempat Meta, Microsoft, dan Foursquare; lisensi [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/) dan Apache 2.0). Datanya sudah disaring: hanya kantor BNI, tanpa ATM, agen BNI46, BNI Syariah (kini BSI), dan anak usaha. Kantor yang berimpit dengan OpenStreetMap, impor Excel, atau tambahan Anda tidak ditampilkan dua kali. Penandanya bergaris tepi karena lokasinya bisa kurang tepat atau kantornya sudah tutup. Bisa dimatikan di **Pengaturan → Data kantor BNI**. Lihat [data/README.md](data/README.md).
- **Struktur organisasi dan laporan keuangan tidak tersedia gratis** untuk perusahaan tertutup, sehingga tidak bisa dideteksi otomatis. Sumber resmi data pengurus dan pemegang saham adalah AHU Online Kementerian Hukum (berbayar per perusahaan). Laporan keuangan diperoleh dari calon debitur. Hanya perusahaan Tbk yang laporan keuangannya publik di IDX. Aplikasi menyediakan formulir dan impor Excel untuk data ini.
- **Pasar, mal, kawasan industri, pelabuhan, dan kantor bank lain** di tab Peluang juga dari OpenStreetMap, sehingga kelengkapannya bergantung pada daerahnya.
- **Google Maps** dipakai lewat tautan (gratis), atau sebagai sumber deteksi bila Anda memasang API key sendiri (lihat [Mode Google Maps](#mode-google-maps)).
- **Pencarian koordinat dari alamat** memakai OpenStreetMap Nominatim, dibatasi 1 alamat per detik. Hasil yang hanya akurat sampai tingkat kelurahan/kota ditandai "lokasi perkiraan".
- **Citra satelit** (opsi lapisan peta) dari Esri World Imagery.

## Mode Google Maps

Sumber deteksi bisa diganti ke Google Maps di tab **Deteksi** (tombol OpenStreetMap / Google Maps) atau di **Pengaturan**. Mode ini memakai API key Google Cloud milik Anda sendiri.

### Membuat API key

1. Buka [console.cloud.google.com](https://console.cloud.google.com/), masuk dengan akun Google, lalu buat project baru (mis. "Peta Prospek").
2. Buka **Billing** dan hubungkan akun penagihan (kartu kredit/debit). Google mewajibkan ini walaupun pemakaian masih dalam kuota gratis.
3. Buka **APIs & Services → Library** dan aktifkan tiga API: **Maps JavaScript API**, **Places API (New)**, dan **Map Tiles API**.
4. Buka **APIs & Services → Credentials → Create credentials → API key**. Salin key-nya (diawali `AIza`).
5. Klik key tersebut untuk membatasinya:
   - **Application restrictions → Websites**: tambahkan `https://emilianaaelgaa.github.io/*` (alamat GitHub Pages aplikasi ini).
   - **API restrictions → Restrict key**: centang Maps JavaScript API, Places API (New), dan Map Tiles API.
6. Disarankan: **Billing → Budgets & alerts**, buat anggaran kecil (mis. Rp50.000) agar ada email peringatan bila muncul tagihan.
7. Di aplikasi: **Pengaturan → Sumber deteksi PT/CV → Google Maps**, tempel API key, lalu **Simpan**.

Karena key dibatasi ke alamat situs, mode Google hanya berjalan dari alamat GitHub Pages, bukan dari `index.html` yang dibuka langsung di laptop. Jangan membagikan API key; key tidak ikut tersimpan di file cadangan.

### Biaya dan pembatas

| Pemakaian | Kuota gratis Google per bulan | Setelah kuota |
|---|---|---|
| Pencarian PT/CV (Text Search Pro) | 5.000 | ±US$32 per 1.000 |
| Telepon, situs web, rating (Place Details Enterprise) | 1.000 | ±US$20 per 1.000 |
| Penyegaran lokasi prospek tersimpan (Place Details Essentials) | 10.000 | ±US$5 per 1.000 |
| Petak peta Google (Map Tiles 2D) | 100.000 petak | ±US$0,60 per 1.000 |

Tarif dapat berubah; cek halaman harga Google Maps Platform. Pembatas di aplikasi:

- **Maks. pencarian per deteksi** (bawaan 40). Pencarian dimulai dari satu kotak besar; kotak yang penuh (20 hasil) dipecah lalu dicari lagi, dimulai dari yang paling dekat ke kantor. Daerah sepi selesai dengan 1–2 pencarian; pusat kota yang padat bisa butuh puluhan. Tombol **Cari lebih banyak** melanjutkan pencarian bila belum tuntas.
- **Batas aman bulanan** (bawaan 4.500 pencarian dan 900 detail). Aplikasi berhenti mencari bila batas ini tercapai. Hitungannya per perangkat; batas resmi tetap di Google Cloud.
- Deteksi otomatis saat menggeser peta dimatikan di mode Google; area yang sudah dicari tidak dicari ulang selama halaman terbuka.
- Telepon dan situs web hanya diambil saat Anda menekan **Muat telepon, situs web & rating**.

### Aturan Google yang diikuti aplikasi

- Data Google hanya ditampilkan di atas peta Google, lengkap dengan logo dan teks hak cipta Google. Saat kembali ke OpenStreetMap, hasil Google dihapus dari peta.
- Ringkasan tab Peluang di mode Google dihitung dari hasil Google yang sedang tampil dan ikut hilang saat halaman ditutup.
- Hasil pencarian Google tidak disimpan permanen dan **tidak bisa diekspor** ke Excel. Simpan perusahaan yang menarik ke **Prospek saya**: yang tersimpan adalah Place ID dan catatan Anda (status, plafond, pengurus, keuangan). Lokasinya disegarkan otomatis setelah 30 hari.

## Privasi dan kepatuhan

- Semua prospek, catatan, data pengurus, laporan keuangan, riwayat aktivitas, rute, dan kantor yang Anda tambahkan atau ubah **tersimpan hanya di browser perangkat Anda** (IndexedDB) dan ikut dalam file cadangan.
- Aplikasi tidak pernah mengirim pesan sendiri. Tombol WhatsApp hanya membuka chat berisi pesan perkenalan; Anda yang memutuskan mengirimnya. Kirim satu per satu kepada calon debitur, jangan massal, karena aturan pelindungan konsumen OJK membatasi penawaran lewat saluran komunikasi pribadi tanpa persetujuan. Tidak ada server aplikasi; yang dikirim ke internet hanya permintaan peta dan pencarian OpenStreetMap (koordinat area dan alamat saat impor).
- **Jangan memasukkan data SLIK OJK.** SLIK hanya boleh diakses untuk calon debitur yang sudah mengajukan kredit dan dengan persetujuannya, bukan untuk prospecting.
- Nama pengurus dan pemegang saham termasuk **data pribadi** menurut UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi. Simpan seperlunya, lindungi perangkat dengan kunci layar, dan ikuti kebijakan keamanan informasi BNI sebelum menggunakan aplikasi ini untuk data nasabah.
- Jangan menyimpan file ekspor atau cadangan yang berisi data prospek di repositori ini.

## Format Excel yang dikenali

Unduh template dari menu **Impor Excel**. Judul kolom tidak harus persis; aplikasi mengenali variasi umum. Baris judul laporan di atas tabel juga dilewati otomatis.

| Data | Contoh judul kolom |
|---|---|
| Nama (wajib) | Nama Perusahaan, Nama Debitur, Nama Usaha |
| Badan usaha | Badan Usaha, Bentuk Usaha (PT, CV, UD, …) |
| Lokasi | Latitude + Longitude, atau Koordinat (tempel dari Google Maps), atau Alamat + Kota |
| Pipeline | Status, Plafond (`2500000000`, `2,5 M`, `750 jt`), Produk, Follow-up, PIC, Catatan, Nasabah BNI |
| Pengurus | Direktur Utama, Direktur, Komisaris Utama, Komisaris, Pemegang Saham, Pemilik, Sekutu Aktif, Sekutu Pasif. Beberapa orang dipisah titik koma: `Budi (60%); Ani (40%)` |
| Keuangan | Tahun, Penjualan/Omzet, Laba Bersih, Total Aset, Total Liabilitas, Ekuitas. Untuk kalkulator: HPP, Piutang Usaha, Persediaan, Utang Usaha, Penyusutan, Beban Bunga, Angsuran Pinjaman (per tahun) |

Pengurus dan keuangan beberapa tahun juga bisa diisi di lembar terpisah bernama **Pengurus** dan **Keuangan** dengan kolom **Perusahaan** sebagai penghubung. Daftar kantor resmi memakai kolom Nama Cabang, Jenis (KC/KCP/KK), Alamat, Kota, Latitude, Longitude.

## Struktur proyek

```
index.html            halaman aplikasi
css/app.css           tampilan (terang/gelap, desktop/ponsel)
js/util.js            logika murni: deteksi badan usaha, zona, sektor & klaster, parsing OSM & Excel, rasio keuangan
js/store.js           penyimpanan lokal (IndexedDB)
js/osm.js             Overpass API & Nominatim (kantor, badan usaha, pusat ekonomi), cache per sel grid 0,1°
js/google.js          mode Google: Maps JavaScript API (Places), Map Tiles API, penghitung pemakaian
js/excel.js           impor/ekspor Excel (SheetJS dimuat saat dibutuhkan)
js/app.js             peta, daftar, detail prospek, dialog
data/                 kantor BNI dari Overture Maps (lihat data/README.md)
tools/                skrip pembaruan data kantor Overture
vendor/               Leaflet 1.9.4, Leaflet.markercluster 1.5.3, SheetJS 0.18.5 (beserta lisensinya)
sw.js, manifest.webmanifest, assets/   dukungan pemasangan di HP
tests/                tes unit (Node) dan tes browser (Playwright)
```

## Pengembangan

```
npm test              # tes unit fungsi murni (Node 18+)
npm run test:e2e      # tes browser dengan jaringan tiruan (butuh Playwright + Chromium)
```

Tes browser tidak menghubungi internet; Overpass, Nominatim, tile peta, Maps JavaScript API, Map Tiles API, dan data kantor Overture diganti data tiruan di `tests/e2e.js`.

Memperbarui data kantor dari rilis Overture terbaru (butuh Python dengan `pyarrow`):

```
python3 tools/overture-bni.py > /tmp/bni-overture-raw.json
node tools/build-overture-bni.js /tmp/bni-overture-raw.json
```
