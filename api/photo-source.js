// Photo finder: GET /api/photo-source?url=<a place's website or post>
// Finds the page's preview image (Open Graph og:image / twitter:image, or TikTok's oEmbed thumbnail) and returns
// the image bytes, so the app can shrink it and save it as the place's photo. Free: no image APIs involved.
//
// Only for trip members (a signed-in Supabase session) or the helper (X-Helper-Key, checked by the database),
// so it can't be used as an open image proxy. Fetches go through _safe-fetch (no private hosts, size caps).
import { fetchLimited, fetchText } from './_safe-fetch.js';
import { decodeEntities } from './_inbox-extract.js';
import { isUnsafeHost } from './_inbox-url.js';

const IMAGE = /^image\/(jpeg|jpg|png|webp|avif|gif)\b/;
const fail = (res, status, error) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(JSON.stringify({ error }));
};

async function allowed(req, base, key) {
  const helper = String(req.headers['x-helper-key'] || '').trim();
  const tripId = process.env.INBOX_TRIP_ID || '';
  if (helper.length >= 32 && tripId) {
    const r = await fetch(`${base}/rest/v1/rpc/helper_ping`, {
      method: 'POST', signal: AbortSignal.timeout(6000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_trip: tripId, p_token: helper }),
    }).catch(() => null);
    if (r?.ok) return true;
  }
  const auth = String(req.headers.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (token.length > 20 && token !== key) {
    const r = await fetch(`${base}/auth/v1/user`, { signal: AbortSignal.timeout(6000), headers: { apikey: key, Authorization: `Bearer ${token}` } }).catch(() => null);
    if (r?.ok) return true;
  }
  return false;
}

function metaImage(html, pageUrl) {
  for (const prop of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i'))?.[0];
    const content = tag?.match(/content=["']([^"']+)["']/i)?.[1];
    if (content) {
      try {
        return new URL(decodeEntities(content.trim()), pageUrl).toString();
      } catch { /* try the next one */ }
    }
  }
  const link = html.match(/<link[^>]+rel=["']image_src["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  if (link) {
    try { return new URL(decodeEntities(link), pageUrl).toString(); } catch { /* none */ }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'use GET');
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!base || !key) return fail(res, 500, 'not set up');
  if (!(await allowed(req, base, key))) return fail(res, 401, 'not authorised');

  let page;
  try {
    page = new URL(String(req.query?.url || ''));
  } catch {
    return fail(res, 400, 'url must be a web address');
  }
  if (!/^https?:$/.test(page.protocol) || isUnsafeHost(page.hostname) || page.href.length > 2048) return fail(res, 400, 'url must be a public web address');

  // Where's the picture? TikTok gives a thumbnail through oEmbed; everyone else through Open Graph tags.
  let imageUrl = null;
  if (/(^|\.)tiktok\.com$/i.test(page.hostname)) {
    const json = await fetchText(`https://www.tiktok.com/oembed?url=${encodeURIComponent(page.href)}`, { accept: 'application/json', maxBytes: 100_000 });
    try { imageUrl = JSON.parse(json || '{}').thumbnail_url || null; } catch { imageUrl = null; }
  }
  if (!imageUrl) {
    const first = await fetchLimited(page.href, { maxBytes: 600_000, timeoutMs: 5000, accept: 'text/html,image/*' });
    if (!first) return fail(res, 404, 'could not open that page');
    if (IMAGE.test(first.type) && !first.truncated) imageUrl = first.url; // the link was already an image
    else imageUrl = metaImage(new TextDecoder().decode(first.buf), first.url);
  }
  if (!imageUrl) return fail(res, 404, 'that page has no preview photo');

  const img = await fetchLimited(imageUrl, { maxBytes: 6_000_000, timeoutMs: 8000, accept: 'image/avif,image/webp,image/jpeg,image/png,image/*' });
  if (!img || img.truncated || !IMAGE.test(img.type) || img.buf.length < 200) return fail(res, 404, 'could not download the photo');

  res.setHeader('Content-Type', img.type.split(';')[0]);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('X-Photo-Source', img.url.slice(0, 2000));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).send(img.buf);
}
