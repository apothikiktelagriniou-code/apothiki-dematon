// Service worker: η εφαρμογή ανοίγει αμέσως από το κινητό, ακόμα και με κακό σήμα.
// Τα δεδομένα (Supabase) ΔΕΝ αποθηκεύονται εδώ — πάντα φρέσκα από το δίκτυο.
const CACHE = "apothiki-v10";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const put = (req, res) => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); } };
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("/version.json")) return; // version: πάντα δίκτυο
  if (u.pathname.includes("/assets/") || u.pathname.includes("/tess/")) { // αρχεία με hash: δεν αλλάζουν ποτέ → πρώτα από το κινητό
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { put(e.request, res); return res; })));
    return;
  }
  // σελίδα & λοιπά: δίκτυο με όριο 2,5″ — αν «σέρνεται» το σήμα, ανοίγει από το κινητό (και ενημερώνεται στο παρασκήνιο)
  const net = fetch(e.request).then(res => { put(e.request, res); return res; });
  e.respondWith(Promise.race([net.catch(() => null), new Promise(r => setTimeout(() => r(null), 2500))])
    .then(r => r || caches.match(e.request).then(c => c || net))
    .catch(() => caches.match(e.request).then(r => r || caches.match("./"))));
  e.waitUntil(net.catch(() => {}));
});
