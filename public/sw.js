// Απλό service worker: κρατά τα αρχεία της εφαρμογής για γρήγορο άνοιγμα.
// Τα δεδομένα (Supabase) ΔΕΝ αποθηκεύονται εδώ — πάντα φρέσκα από το δίκτυο.
const CACHE = "apothiki-v2";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // πρώτα δίκτυο (νέα έκδοση αμέσως), αλλιώς ό,τι υπάρχει αποθηκευμένο
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./"))));
});
