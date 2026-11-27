// Link helpers for the share-to-inbox endpoint. Files starting with "_" are not routes on Vercel.
// Shared with the Vitest suite so the tests run the exact code the endpoint runs.

const TRACKING = /^(utm_.*|igsh|igshid|fbclid|gclid|mc_cid|mc_eid|si|_r|_t|is_from_webapp|sender_device|sender_web_id|share_app_id|share_link_id|share_item_id|tt_from|u_code|preview_pb|_d|checksum|sec_user_id|social_sharing|web_id|ref|refer)$/i;

/** First http(s) URL in a block of shared text (captions often wrap the link in words or punctuation). */
export function extractUrl(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return m ? m[0].replace(/[)\].,;:!?'"]+$/, '') : null;
}

/** Canonical form used for de-duplication: tracking parameters and fragments removed, host lowercased. */
export function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  // Instagram and TikTok links need no query at all, and both keep adding new random share codes
  // (igsh, fqnt, hvrq, …), so drop the whole query there. Elsewhere only known tracking keys go.
  if (/(^|\.)(instagram\.com|instagr\.am|tiktok\.com)$/.test(u.hostname)) u.search = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : '';
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  const out = u.toString();
  return out.length <= 2048 ? out : null;
}

export function sourceOf(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (/(^|\.)instagram\.com$|(^|\.)instagr\.am$/.test(host)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  return 'other';
}

/** True for hosts a server should never fetch: localhost, private and link-local ranges, bare IPs. */
export function isUnsafeHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return true; // literal IPv4 / IPv6 addresses
  return !h.includes('.');
}
