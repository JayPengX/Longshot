// Longshot's sources: the shared kit's (play-sources.mjs), one copy for
// Play and the Worker that checks every bet's price (Shared-Proxy settle.js).
// Here they're read through the kit (memory, the device, the mirror, the proxy).
import * as kit from '../kit/core.mjs';
import { useReader } from '../kit/play-sources.mjs';
useReader({ proxyJson: kit.proxyJson, packJson: kit.packJson });
export * from '../kit/play-sources.mjs';
