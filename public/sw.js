// Quadra Play: the family's one service worker (Shared-Proxy/kit/sw.js),
// with this app's settings. It keeps the page's own files so the app opens
// without a connection and can be installed, and never keeps a file that
// isn't the one its address names (GitHub's CDN can answer a new address
// with the old file for a while after a deploy).
// Pictures from other sites: the kit's shared picture cache (sw-images.js).
self.ORBIT_SW = { cache: 'orbit-odds-v1', title: 'Quadra Play' };
importScripts('../Shared-Proxy/kit/sw-images.js');
importScripts('../Shared-Proxy/kit/sw.js');
