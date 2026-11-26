/** Google Maps link helpers. Parsing is best-effort; the form always allows manual entry. */

export interface ParsedPlace {
  name: string | null;
  lat: number | null;
  lng: number | null;
  url: string;
  isShortLink: boolean;
}

const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co'];

export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.]+$/, '') : null;
}

export function isGoogleMapsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return SHORT_HOSTS.includes(h) || /(^|\.)google\.[a-z.]+$/.test(h) && (u.pathname.startsWith('/maps') || h.startsWith('maps.'));
  } catch {
    return false;
  }
}

function plusDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' ')).trim();
  } catch {
    return s.replace(/\+/g, ' ').trim();
  }
}

function validCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function parseMapsUrl(input: string): ParsedPlace | null {
  const url = extractUrl(input);
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const result: ParsedPlace = { name: null, lat: null, lng: null, url, isShortLink: SHORT_HOSTS.includes(u.hostname.toLowerCase()) };
  if (result.isShortLink) return result;

  const path = u.pathname;
  const placeMatch = path.match(/\/maps\/place\/([^/@]+)/);
  if (placeMatch) result.name = plusDecode(placeMatch[1]);
  const searchMatch = !result.name && path.match(/\/maps\/search\/([^/@]+)/);
  if (searchMatch) result.name = plusDecode(searchMatch[1]);

  // Precise pin coordinates (!3d<lat>!4d<lng>) beat the viewport centre (@lat,lng).
  const pin = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair = pin ?? at;
  if (pair) {
    const lat = parseFloat(pair[1]);
    const lng = parseFloat(pair[2]);
    if (validCoord(lat, lng)) {
      result.lat = lat;
      result.lng = lng;
    }
  }

  const q = u.searchParams.get('q') ?? u.searchParams.get('query') ?? u.searchParams.get('destination');
  if (q) {
    const coord = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coord && result.lat == null) {
      const lat = parseFloat(coord[1]);
      const lng = parseFloat(coord[2]);
      if (validCoord(lat, lng)) {
        result.lat = lat;
        result.lng = lng;
      }
    } else if (!coord && !result.name) {
      result.name = q.split(',')[0].trim() || null;
    }
  }
  if (result.name && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(result.name)) result.name = null;
  return result;
}

/** Resolve maps.app.goo.gl short links through our serverless function (cloud deploys only). */
export async function resolveShortLink(url: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/resolve-maps?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

interface Locatable {
  name?: string | null;
  location_name?: string | null;
  title?: string;
  address?: string | null;
  maps_url?: string | null;
  lat?: number | null;
  lng?: number | null;
}

function queryFor(p: Locatable): string {
  if (p.lat != null && p.lng != null) return `${p.lat},${p.lng}`;
  return [p.name ?? p.location_name ?? p.title, p.address].filter(Boolean).join(', ');
}

export function openInMapsUrl(p: Locatable): string | null {
  if (p.maps_url) return p.maps_url;
  const q = queryFor(p);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function directionsUrl(p: Locatable): string | null {
  const q = queryFor(p);
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}

export function hasLocation(p: Locatable): boolean {
  return Boolean(p.maps_url || (p.lat != null && p.lng != null) || p.address || p.location_name);
}
