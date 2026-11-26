// Vercel serverless function: expands a Google Maps short link (maps.app.goo.gl) to its full URL
// so the app can read the place name and coordinates. Only follows redirects between Google hosts.
const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.|maps\.)?google\.[a-z.]+|consent\.google\.[a-z.]+)$/i;

export default async function handler(req, res) {
  let url = String(req.query.url || '');
  try {
    for (let i = 0; i < 6; i++) {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) return res.status(400).json({ error: 'not a Google Maps link' });
      if (u.hostname.startsWith('consent.') && u.searchParams.get('continue')) { url = u.searchParams.get('continue'); continue; }
      if (!/goo\.gl$|g\.co$/i.test(u.hostname)) break;
      const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
      const next = r.headers.get('location');
      if (!next) break;
      url = new URL(next, url).toString();
    }
    res.setHeader('cache-control', 's-maxage=86400');
    return res.status(200).json({ url });
  } catch {
    return res.status(400).json({ error: 'could not resolve link' });
  }
}
