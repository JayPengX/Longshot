// Longshot's service worker: the settings, then the worker itself (kit/sw.js)
// and its picture cache (kit/sw-images.js).
self.LONGSHOT_SW = { cache: 'longshot-v1' };
importScripts('./kit/sw-images.js');
importScripts('./kit/sw.js');
