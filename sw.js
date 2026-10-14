/*
 * Service worker: menyimpan file aplikasi agar tetap terbuka saat sinyal lemah.
 * Strategi "jaringan dulu": versi terbaru selalu dipakai bila online.
 * Peta (tile), Overpass, dan Nominatim tidak disimpan di sini.
 */
var CACHE = 'peta-prospek-v5';
var SHELL = [
  './', 'index.html', 'css/app.css', 'js/util.js', 'js/store.js', 'js/osm.js', 'js/google.js', 'js/excel.js', 'js/app.js', 'data/kantor-bni-overture.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet.markercluster/leaflet.markercluster.js',
  'vendor/leaflet.markercluster/MarkerCluster.css', 'vendor/xlsx/xlsx.core.min.js', 'assets/icon.svg', 'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
  }));
});
