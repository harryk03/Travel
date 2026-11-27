// Pulls place details out of what was shared: Google/Apple Maps share text, captions, bios.
// Pattern matching only (free, nothing is sent anywhere). Shared with the Vitest suite.

const MAPS_HOST = /^(maps\.app\.goo\.gl|goo\.gl|maps\.apple\.com|(www\.|maps\.)?google\.[a-z.]+)$/i;

/** True for Google Maps and Apple Maps links. */
export function isMapsLink(url) {
  try {
    const u = new URL(url);
    if (!MAPS_HOST.test(u.hostname)) return false;
    if (/google\./i.test(u.hostname) && !u.hostname.startsWith('maps.')) return u.pathname.startsWith('/maps');
    if (/^goo\.gl$/i.test(u.hostname)) return u.pathname.startsWith('/maps');
    return true;
  } catch {
    return false;
  }
}

/** Phone or WhatsApp number in international form (+62…), or null. Prefers wa.me links. */
export function findPhone(text) {
  if (typeof text !== 'string') return null;
  const wa = text.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?\+?(\d{8,15})/i);
  if (wa) return `+${wa[1]}`;
  for (const m of text.matchAll(/(?<![\w/.=])(\+?\d[\d\s().-]{7,18}\d)(?![\w/])/g)) {
    const raw = m[1];
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(raw.trim())) continue; // dates
    if (raw.startsWith('+')) return `+${digits}`;
    if (digits.startsWith('62')) return `+${digits}`;
    if (digits.startsWith('08')) return `+62${digits.slice(1)}`; // Indonesian local mobile
  }
  return null;
}

/** A line that looks like a Bali street address ("Jl. …", "Jalan …", "Gang …"). */
export function findAddress(text) {
  if (typeof text !== 'string') return null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\b(?:jl\.?|jln\.?|jalan|gg\.?|gang)\s+[^\n|•·]{3,}/i);
    if (!m) continue;
    // Stop at a phone number, a link, or an emoji that starts the next bit of the caption.
    const cut = m[0].split(/\s(?:wa|whatsapp|call|tel|ph|dm|book)\b|\+?\d[\d\s-]{8,}\d|https?:\/\/|\p{Extended_Pictographic}/iu)[0];
    return cut.replace(/[\s,.;:-]+$/, '').trim().slice(0, 300) || null;
  }
  return null;
}

function appleMaps(url) {
  try {
    const u = new URL(url);
    if (!/^maps\.apple\.com$/i.test(u.hostname)) return {};
    const name = u.searchParams.get('name') || u.searchParams.get('q');
    const address = u.searchParams.get('address');
    return { name: name && !/^-?\d/.test(name) ? name.trim().slice(0, 200) : null, address: address ? address.trim().slice(0, 300) : null };
  } catch {
    return {};
  }
}

/**
 * Details from the shared text (and the fetched caption, if any).
 * `url` is the link being saved. Returns { name, address, phone, maps_url } with nulls for unknowns.
 */
export function extractDetails(text, caption, url) {
  const all = [text, caption].filter((s) => typeof s === 'string' && s).join('\n');
  const links = [...all.matchAll(/https?:\/\/[^\s<>"'`]+/gi)].map((m) => m[0].replace(/[)\].,;:!?'"]+$/, ''));
  const maps = url && isMapsLink(url) ? url : links.find(isMapsLink) ?? null;
  let name = null;
  let address = null;
  if (maps) {
    const a = appleMaps(maps);
    name = a.name ?? null;
    address = a.address ?? null;
  }
  // Google Maps shares "Place name\n(address)\nhttps://maps.app.goo.gl/…": the first plain line is the name.
  if (!name && url && isMapsLink(url) && typeof text === 'string') {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/https?:\/\//i.test(l));
    if (lines[0] && lines[0].length <= 120) name = lines[0];
    if (!address && lines[1] && lines[1].length <= 300 && /,|\d/.test(lines[1])) address = lines[1];
  }
  return {
    name,
    address: address ?? findAddress(all),
    phone: findPhone(all),
    maps_url: maps,
  };
}
