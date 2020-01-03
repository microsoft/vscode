self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
	// stale while revalidate
	event.respondWith(
		Promise.resolve().then(async () => {
			const cache = await caches.open('v1');
			const response = await cache.match(event.request);
			const fetchPromise = fetch(event.request).then(networkResponse => {
				cache.put(event.request, networkResponse.clone());
				return networkResponse;
			});
			return response || fetchPromise;
		})
	);
});
