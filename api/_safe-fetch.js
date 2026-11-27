// Server-side fetching of other people's pages and images, with guard rails:
// http(s) only, no private / local hosts (checked on every redirect hop), a timeout and a size cap.
import { isUnsafeHost } from './_inbox-url.js';

/** Fetch a URL; returns { buf, type, url } or null. Never throws. */
export async function fetchLimited(url, { timeoutMs = 3000, maxBytes = 300_000, accept = 'text/html' } = {}) {
  try {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(current);
      if (!/^https?:$/.test(u.protocol) || isUnsafeHost(u.hostname)) return null;
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; TripHQ link preview)' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).toString();
        continue;
      }
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      let truncated = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size >= maxBytes) { truncated = true; await reader.cancel(); break; }
      }
      return { buf: Buffer.concat(chunks.map((c) => Buffer.from(c))), type: (res.headers.get('content-type') || '').toLowerCase(), url: current, truncated };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function fetchText(url, opts) {
  const r = await fetchLimited(url, opts);
  return r ? new TextDecoder().decode(r.buf) : null;
}
