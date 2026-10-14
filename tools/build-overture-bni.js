#!/usr/bin/env node
/*
 * Menyaring keluaran tools/overture-bni.py menjadi data/kantor-bni-overture.js
 * (kantor BNI saja: tanpa ATM, agen, unit syariah, dan duplikat). Berkas berupa
 * skrip agar tetap bisa dimuat saat index.html dibuka langsung dari laptop (file://).
 *
 *   python3 tools/overture-bni.py > /tmp/bni-overture-raw.json
 *   node tools/build-overture-bni.js /tmp/bni-overture-raw.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const U = require('../js/util.js');

const src = process.argv[2];
if (!src) {
  console.error('Pakai: node tools/build-overture-bni.js <keluaran overture-bni.py>');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const list = U.overtureBranches(raw.items || []);
const data = U.packOverture(list, {
  source: 'Overture Maps Foundation, tema places (sumber: Meta, Microsoft, Foursquare)',
  release: raw.release || '',
  license: 'CDLA-Permissive-2.0 (https://cdla.dev/permissive-2-0/); data Foursquare: Apache-2.0',
  generated: new Date().toISOString().slice(0, 10)
});
const out = path.join(__dirname, '..', 'data', 'kantor-bni-overture.js');
fs.writeFileSync(out,
  '/* Kantor BNI dari Overture Maps (' + data.release + '). ' + data.license + '.\n' +
  ' * Dibuat oleh tools/build-overture-bni.js; jangan diedit manual. */\n' +
  '(typeof self !== \'undefined\' ? self : globalThis).PP_OVERTURE_BNI = ' +
  JSON.stringify(data).replace(/\],\[/g, '],\n[') + ';\n');
const types = {};
list.forEach((b) => { types[b.type] = (types[b.type] || 0) + 1; });
console.log(`${raw.items.length} tempat → ${list.length} kantor BNI`, types, '→', path.relative(process.cwd(), out));
