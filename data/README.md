# Data kantor BNI tambahan

`kantor-bni-overture.js` berisi kantor BNI di Indonesia dari [Overture Maps Foundation](https://overturemaps.org/), tema *places* (sumber: Meta, Microsoft, Foursquare). Aplikasi memakainya untuk melengkapi kantor yang belum ada di OpenStreetMap. Kantor yang berimpit dengan data OpenStreetMap, impor Excel, atau kantor yang Anda tambahkan sendiri tidak ditampilkan dua kali.

Lisensi data:

- Data Meta dan Microsoft: [Community Data License Agreement – Permissive 2.0](https://cdla.dev/permissive-2-0/)
- Data Foursquare: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)

Atribusi: © Overture Maps Foundation.

Lokasi dan nama kantor berasal dari data tempat publik dan bisa kurang tepat atau sudah tutup. Di aplikasi, kantor ini ditandai dengan penanda bergaris tepi dan bisa diubah atau disembunyikan.

## Memperbarui

Overture merilis data baru setiap bulan.

```
pip install pyarrow
python3 tools/overture-bni.py > /tmp/bni-overture-raw.json      # ±1 menit, membaca hanya bagian Indonesia
node tools/build-overture-bni.js /tmp/bni-overture-raw.json      # menyaring dan menulis data/kantor-bni-overture.js
```

Aturan penyaringan ada di `js/util.js` (`overtureBranches`) dan diuji di `tests/util.test.js`.
