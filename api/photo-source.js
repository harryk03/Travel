// Photo finder: GET /api/photo-source?url=<a place's website or post>[&list=1]  or  ?image=<picture url>
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

const NOT_A_PHOTO = /\.svg(\?|$)|^data:|logo|icon|favicon|sprite|avatar|badge|payment|flag|emoji|pixel|spacer|gravatar|placeholder|loader|arrow|button|banner-ad/i;

function abs(u, pageUrl) {
  try {
    const url = new URL(decodeEntities(String(u).trim()), pageUrl);
    return /^https?:$/.test(url.protocol) && !isUnsafeHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Picture candidates on a page, best first: share images (og / twitter / JSON-LD) that aren't logos, then the
 * page's own large-looking <img>s, then logo-ish share images last. The caller checks real sizes.
 */
function candidates(html, pageUrl) {
  const share = [];
  for (const prop of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const tag of html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'gi')) ?? []) {
      const c = tag.match(/content=["']([^"']+)["']/i)?.[1];
      if (c) share.push(c);
    }
  }
  for (const block of html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    for (const m of block.matchAll(/"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/g)) share.push(m[1].replace(/\\\//g, '/'));
  }
  const imgs = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const srcset = tag.match(/\s(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    // Largest entry of a srcset, else src / data-src.
    const fromSet = srcset?.split(',').map((x) => x.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] || '0') - parseInt(a[1] || '0'))[0]?.[0];
    const src = fromSet || tag.match(/\s(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i)?.[1];
    const w = parseInt(tag.match(/\swidth=["']?(\d+)/i)?.[1] || '0');
    if (src && !(w && w < 300) && !NOT_A_PHOTO.test(src) && !NOT_A_PHOTO.test(tag.match(/\salt=["']([^"']*)["']/i)?.[1] || '')) imgs.push(src);
  }
  const out = [];
  const add = (u) => { const a = abs(u, pageUrl); if (a && !out.includes(a)) out.push(a); };
  share.filter((u) => !NOT_A_PHOTO.test(u)).forEach(add);
  imgs.forEach(add);
  share.filter((u) => NOT_A_PHOTO.test(u) && !/\.svg(\?|$)|^data:/i.test(u)).forEach(add);
  return out.slice(0, 12);
}

async function sendImage(res, imageUrl) {
  const img = await fetchLimited(imageUrl, { maxBytes: 6_000_000, timeoutMs: 8000, accept: 'image/avif,image/webp,image/jpeg,image/png,image/*' });
  if (!img || img.truncated || !IMAGE.test(img.type) || img.buf.length < 200) return fail(res, 404, 'could not download the photo');
  res.setHeader('Content-Type', img.type.split(';')[0]);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('X-Photo-Source', img.url.slice(0, 2000));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).send(img.buf);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'use GET');
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!base || !key) return fail(res, 500, 'not set up');
  if (!(await allowed(req, base, key))) return fail(res, 401, 'not authorised');

  // ?image=<url>: fetch one picture (a candidate from ?list=1). Same guard rails as everything else.
  if (req.query?.image) {
    const one = abs(String(req.query.image), 'https://example.com/');
    return one ? sendImage(res, one) : fail(res, 400, 'image must be a public web address');
  }

  let page;
  try {
    page = new URL(String(req.query?.url || ''));
  } catch {
    return fail(res, 400, 'url must be a web address');
  }
  if (!/^https?:$/.test(page.protocol) || isUnsafeHost(page.hostname) || page.href.length > 2048) return fail(res, 400, 'url must be a public web address');

  // Where are the pictures? TikTok gives a thumbnail through oEmbed; everyone else through the page itself.
  let list = [];
  if (/(^|\.)tiktok\.com$/i.test(page.hostname)) {
    const json = await fetchText(`https://www.tiktok.com/oembed?url=${encodeURIComponent(page.href)}`, { accept: 'application/json', maxBytes: 100_000 });
    try { const t = JSON.parse(json || '{}').thumbnail_url; if (t) list = [t]; } catch { /* none */ }
  }
  if (!list.length) {
    const first = await fetchLimited(page.href, { maxBytes: 1_200_000, timeoutMs: 8000, accept: 'text/html,image/*' });
    if (!first) return fail(res, 404, 'could not open that page');
    list = IMAGE.test(first.type) && !first.truncated ? [first.url] : candidates(new TextDecoder().decode(first.buf), first.url);
  }
  if (!list.length) return fail(res, 404, 'that page has no photos');
  // ?list=1: the candidates, best first, for the caller to try in turn. Otherwise: the first one.
  if (req.query?.list) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(JSON.stringify({ candidates: list }));
  }
  return sendImage(res, list[0]);
}
