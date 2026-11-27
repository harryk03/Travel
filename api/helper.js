// Helper endpoint: lets Claude read the inbox and add places, with a key that can do nothing else.
// The key travels in the "X-Helper-Key" header and is checked by the database (helper_* functions in
// migration 008) against a stored hash. Uses the public Supabase key; no service-role key.
//
//   GET  /api/helper                     open inbox items + saved place names
//   GET  /api/helper?files=<inbox id>    screenshots on one inbox item (base64)
//   POST /api/helper {action:"add", inbox, name, category, address, maps_url, lat, lng, phone, notes}
//        optional website, and category "custom" with custom_emoji + custom_label (migration 010)
//        add keep_open:true to add one of several places from the same item (migration 009); the last add ticks it off
//   POST /api/helper {action:"update", place, ...same fields; blanks are left as they are}
//   POST /api/helper {action:"flag", inbox, needs}
//   POST /api/helper {action:"fill", place, address?, maps_url?, lat?, lng?, phone?, website?, notes?}
//        fills only EMPTY fields on any place in the trip, including ones people added (migration 011)

const MAX_BODY = 16_384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = ['gym', 'cafe', 'restaurant', 'stay', 'beach_club', 'nightlife', 'activity', 'spa', 'other', 'custom'];

const send = (res, status, body) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(JSON.stringify(body));
};
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function placeArgs(b) {
  const category = str(b.category, 20);
  if (category && !CATEGORIES.includes(category)) throw new Error(`category must be one of ${CATEGORIES.join(', ')}`);
  const maps = str(b.maps_url, 2048);
  if (maps && !/^https?:\/\//i.test(maps)) throw new Error('maps_url must be an http(s) link');
  const website = str(b.website, 2048);
  if (website && !/^https?:\/\//i.test(website)) throw new Error('website must be an http(s) link');
  const emoji = str(b.custom_emoji, 16);
  const label = str(b.custom_label, 40);
  if (category === 'custom' && (!emoji || !label)) throw new Error('a custom category needs custom_emoji and custom_label');
  return {
    p_name: str(b.name, 200), p_category: category, p_address: str(b.address, 300), p_maps_url: maps,
    p_lat: num(b.lat), p_lng: num(b.lng), p_phone: str(b.phone, 24), p_notes: str(b.notes, 2000),
    // Migration 010 inputs: only sent when given, so calls without them work on either version.
    ...(website ? { p_website: website } : {}),
    ...(emoji ? { p_custom_emoji: emoji } : {}),
    ...(label ? { p_custom_label: label } : {}),
  };
}

export default async function handler(req, res) {
  const tripId = process.env.INBOX_TRIP_ID || '';
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!tripId || !base || !key) return send(res, 500, { error: 'not set up' });

  const token = String(req.headers['x-helper-key'] || '').trim();
  if (token.length < 32 || token.length > 200) return send(res, 401, { error: 'not authorised' });

  const rpc = async (fn, args) => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_trip: tripId, p_token: token, ...args }),
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (r.ok) return send(res, 200, { ok: true, result: data });
    const msg = (data && data.message) || 'failed';
    if (/not allowed/.test(msg)) return send(res, 401, { error: 'not authorised' });
    if (r.status === 404) return send(res, 503, { error: 'migration 008 has not been run yet' });
    return send(res, 400, { error: msg.slice(0, 200) });
  };

  try {
    if (req.method === 'GET') {
      const files = req.query?.files;
      if (files) {
        if (!UUID.test(String(files))) return send(res, 400, { error: 'files must be an inbox id' });
        return await rpc('helper_files', { p_inbox: String(files) });
      }
      return await rpc('helper_inbox', {});
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'use GET or POST' });

    if (Number(req.headers['content-length'] || 0) > MAX_BODY) return send(res, 413, { error: 'too large' });
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
    if (!b || typeof b !== 'object' || JSON.stringify(b).length > MAX_BODY) return send(res, 400, { error: 'send a JSON body' });

    if (b.action === 'add') {
      if (!UUID.test(String(b.inbox || ''))) return send(res, 400, { error: 'inbox must be an inbox id' });
      const args = placeArgs(b);
      if (!args.p_name) return send(res, 400, { error: 'name is required' });
      return await rpc(b.keep_open === true ? 'helper_add_more' : 'helper_add_place', { p_inbox: b.inbox, ...args });
    }
    if (b.action === 'update') {
      if (!UUID.test(String(b.place || ''))) return send(res, 400, { error: 'place must be a place id' });
      return await rpc('helper_update_place', { p_place: b.place, ...placeArgs(b) });
    }
    if (b.action === 'flag') {
      if (!UUID.test(String(b.inbox || ''))) return send(res, 400, { error: 'inbox must be an inbox id' });
      return await rpc('helper_flag', { p_inbox: b.inbox, p_needs: str(b.needs, 500) });
    }
    if (b.action === 'fill') {
      if (!UUID.test(String(b.place || ''))) return send(res, 400, { error: 'place must be a place id' });
      const a = placeArgs({ ...b, category: undefined, name: undefined });
      return await rpc('helper_fill_place', {
        p_place: b.place, p_address: a.p_address, p_maps_url: a.p_maps_url, p_lat: a.p_lat, p_lng: a.p_lng,
        p_phone: a.p_phone, p_website: a.p_website ?? null, p_notes: a.p_notes,
      });
    }
    return send(res, 400, { error: 'action must be add, update, flag or fill' });
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return send(res, timeout ? 504 : 400, { error: timeout ? 'Trip HQ did not answer in time' : String(e.message || e).slice(0, 200) });
  }
}
