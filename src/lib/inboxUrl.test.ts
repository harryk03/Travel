import { describe, expect, it } from 'vitest';
import { extractUrl, isUnsafeHost, normalizeUrl, sourceOf } from '../../api/_inbox-url.js';

describe('inbox links', () => {
  it('finds the first link inside shared text', () => {
    expect(extractUrl('Best gym in Canggu 🔥 https://www.instagram.com/reel/C9xYz/?igsh=MTB3 follow us')).toBe('https://www.instagram.com/reel/C9xYz/?igsh=MTB3');
    expect(extractUrl('(see https://vm.tiktok.com/ZMabc123/).')).toBe('https://vm.tiktok.com/ZMabc123/');
    expect(extractUrl('no link here')).toBeNull();
    expect(extractUrl(undefined)).toBeNull();
    expect(extractUrl('javascript:alert(1)')).toBeNull();
  });

  it('removes tracking so the same post saved twice matches', () => {
    const a = normalizeUrl('https://www.instagram.com/reel/C9xYz/?igsh=MTB3dGh&utm_source=ig_web_copy_link');
    const b = normalizeUrl('https://WWW.Instagram.com/reel/C9xYz?utm_medium=share#comments');
    expect(a).toBe('https://www.instagram.com/reel/C9xYz');
    expect(b).toBe(a);
    expect(normalizeUrl('https://www.tiktok.com/@cafe/video/7312345678901234567?is_from_webapp=1&sender_device=pc&_r=1&_t=8abc'))
      .toBe('https://www.tiktok.com/@cafe/video/7312345678901234567');
    expect(normalizeUrl('https://example.com/menu?lang=en&utm_campaign=x')).toBe('https://example.com/menu?lang=en');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('ftp://example.com/file')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });

  it('tags the source', () => {
    expect(sourceOf('https://www.instagram.com/p/abc')).toBe('instagram');
    expect(sourceOf('https://instagr.am/p/abc')).toBe('instagram');
    expect(sourceOf('https://vm.tiktok.com/ZMabc')).toBe('tiktok');
    expect(sourceOf('https://www.tiktok.com/@a/video/1')).toBe('tiktok');
    expect(sourceOf('https://notinstagram.com/p/abc')).toBe('other');
    expect(sourceOf('https://maps.app.goo.gl/x')).toBe('other');
  });

  it('refuses to fetch internal addresses for previews', () => {
    for (const h of ['localhost', '127.0.0.1', '169.254.169.254', '10.0.0.5', '[::1]', 'printer.local', 'intranet']) expect(isUnsafeHost(h)).toBe(true);
    for (const h of ['www.instagram.com', 'www.tiktok.com', 'example.com']) expect(isUnsafeHost(h)).toBe(false);
  });
});
