/*
 * PH-Drama service worker.
 *
 * Caches the app shell and static assets so the PWA opens instantly offline.
 * It deliberately does NOT cache:
 *   - /api/*                       (access decisions and tickets)
 *   - Supabase signed object URLs  (/storage/v1/object/sign/...)
 *   - anything carrying a ?token=  (a cached signed URL is a leaked signed URL)
 *   - video segments (.m3u8/.ts/.m4s/.mp4)
 * See docs/CONTENT_PROTECTION.md.
 */

const VERSION = 'phd-v1';
const SHELL = `${VERSION}-shell`;

const PRECACHE = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isPrivate(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/storage/v1/object/sign/') ||
    url.searchParams.has('token') ||
    /\.(m3u8|ts|m4s|mp4|key)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isPrivate(url)) return; // straight to the network, never stored

  // Static assets: cache first.
  if (url.origin === self.location.origin && /^\/(_next\/static|icon-|apple-touch)/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: network first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((hit) => hit ?? Response.error())),
    );
  }
});
