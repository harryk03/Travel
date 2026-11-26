// Share-to-inbox endpoint for the iOS Shortcut.
// POST { text, note } with "Authorization: Bearer <INBOX_SECRET>". Replies in plain text for the Shortcut to show.
// Writes only through the inbox_add() database function, using the public Supabase key; no service-role key is needed.
import { createHash, timingSafeEqual } from 'node:crypto';
import { extractUrl, isUnsafeHost, normalizeUrl, sourceOf } from './_inbox-url.js';

const MAX_BODY = 4096;
const reply = (res, status, text) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(text);
};
const sameSecret = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

async function fetchLimited(url, { timeoutMs = 3000, maxBytes = 300_000, accept = 'text/html' } = {}) {
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
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      chunks.push(value);
      if (size >= maxBytes) { await reader.cancel(); break; }
    }
    return new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  }
  return null;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : null;
};
const GENERIC = /^(instagram|tiktok|login|log in|sign up)\b|^(instagram|tiktok)( photo| video| reel)?$/i;

/** Best effort, never throws: TikTok oEmbed, otherwise Open Graph tags. */
async function preview(url, source) {
  try {
    if (source === 'tiktok') {
      const json = await fetchLimited(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { accept: 'application/json', maxBytes: 100_000 });
      if (json) {
        const d = JSON.parse(json);
        return { caption: typeof d.title === 'string' ? d.title.slice(0, 2000) : null, thumb: /^https?:\/\//.test(d.thumbnail_url ?? '') ? d.thumbnail_url : null };
      }
    }
    const html = await fetchLimited(url);
    if (!html) return {};
    const text = meta(html, 'og:description') || meta(html, 'og:title') || meta(html, 'twitter:description');
    const img = meta(html, 'og:image');
    return {
      caption: text && !GENERIC.test(text) ? text.slice(0, 2000) : null,
      thumb: img && /^https?:\/\//.test(img) ? img : null,
    };
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, 'Use POST');
  const secret = process.env.INBOX_SECRET || '';
  const tripId = process.env.INBOX_TRIP_ID || '';
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (secret.length < 32 || !tripId || !base || !key) return reply(res, 500, 'The Trip HQ inbox is not set up yet');

  const auth = String(req.headers.authorization || '');
  const given = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!given || !sameSecret(given, secret)) return reply(res, 401, 'Not authorised');

  if (Number(req.headers['content-length'] || 0) > MAX_BODY) return reply(res, 413, 'Too much was shared');
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY) return reply(res, 413, 'Too much was shared');
    try { body = JSON.parse(body); } catch { body = { text: body }; }
  }
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > MAX_BODY) return reply(res, 413, 'Too much was shared');

  const raw = extractUrl(String(body.text ?? ''));
  const url = raw && normalizeUrl(raw);
  if (!url) return reply(res, 400, 'No link found in what was shared');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const source = sourceOf(url);
  const p = await preview(url, source);

  let result;
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/rest/v1/rpc/inbox_add`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_trip: tripId, p_token: given, p_url: url, p_source: source, p_note: note || null, p_caption: p.caption ?? null, p_thumb: p.thumb ?? null }),
    });
    if (!r.ok) return reply(res, 502, 'Could not save to Trip HQ, try again');
    result = await r.json();
  } catch {
    return reply(res, 502, 'Could not reach Trip HQ, try again');
  }
  return reply(res, 200, result === 'exists' ? 'Already in the inbox' : 'Saved to Trip HQ');
}
