import { describe, expect, it } from 'vitest';
import { decodeEntities, extractDetails, findAddress, findPhone, isMapsLink } from '../../api/_inbox-extract.js';

describe('findPhone', () => {
  it('reads wa.me links', () => expect(findPhone('Book: wa.me/6282135732415 and 1 more')).toBe('+6282135732415'));
  it('reads +62 numbers with spaces', () => expect(findPhone('WhatsApp +62 821 3573 2415 to book')).toBe('+6282135732415'));
  it('turns local 08 numbers into +62', () => expect(findPhone('Call 0812-3456-7890')).toBe('+6281234567890'));
  it('ignores dates, prices and short numbers', () => {
    expect(findPhone('Open 23/12/2026 from 8 till 10')).toBeNull();
    expect(findPhone('Only IDR 350000 per session')).toBeNull();
    expect(findPhone('Video 7000000000000000001 views')).toBeNull();
  });
});

describe('findAddress', () => {
  it('finds a Jl. line in a bio', () => expect(findAddress("Bali's Premium Assisted Stretching\n📍 Jl Sempol, Pererenan\n> 1:1")).toBe('Jl Sempol, Pererenan'));
  it('handles Jalan and Gang', () => {
    expect(findAddress('Find us at Jalan Pantai Berawa No. 99, Canggu.')).toBe('Jalan Pantai Berawa No. 99, Canggu');
    expect(findAddress('Gg. Nyepi 5, Seminyak')).toBe('Gg. Nyepi 5, Seminyak');
  });
  it('returns null when there is none', () => expect(findAddress('Best brunch in Bali!')).toBeNull());
});

describe('isMapsLink', () => {
  it('knows Google and Apple Maps', () => {
    expect(isMapsLink('https://maps.app.goo.gl/abc')).toBe(true);
    expect(isMapsLink('https://www.google.com/maps/place/Crate+Cafe/@-8.6,115.1,17z')).toBe(true);
    expect(isMapsLink('https://maps.apple.com/?q=Crate&ll=-8.6,115.1')).toBe(true);
    expect(isMapsLink('https://www.google.com/search?q=crate')).toBe(false);
    expect(isMapsLink('https://www.instagram.com/bendbali')).toBe(false);
  });
});

describe('extractDetails', () => {
  it('reads a Google Maps share', () => {
    const d = extractDetails('Crate Cafe\nJl. Canggu Padang Linjong No.49F, Canggu\nhttps://maps.app.goo.gl/AbC123', null, 'https://maps.app.goo.gl/AbC123');
    expect(d).toEqual({ name: 'Crate Cafe', address: 'Jl. Canggu Padang Linjong No.49F, Canggu', phone: null, maps_url: 'https://maps.app.goo.gl/AbC123' });
  });
  it('reads an Apple Maps link', () => {
    const url = 'https://maps.apple.com/?address=Jl.%20Sempol,%20Pererenan,%20Bali&ll=-8.64,115.12&q=BEND%20Stretch%20Studio';
    const d = extractDetails(url, null, url);
    expect(d.name).toBe('BEND Stretch Studio');
    expect(d.address).toBe('Jl. Sempol, Pererenan, Bali');
  });
  it('finds a maps link, phone and address inside a caption', () => {
    const d = extractDetails('https://www.tiktok.com/@x/video/1', 'Best bowls 🥣 📍 Jl. Raya Berawa 12 WA +62 812 1111 2222 https://maps.app.goo.gl/Zz9', 'https://www.tiktok.com/@x/video/1');
    expect(d.maps_url).toBe('https://maps.app.goo.gl/Zz9');
    expect(d.phone).toBe('+6281211112222');
    expect(d.address).toBe('Jl. Raya Berawa 12');
    expect(d.name).toBeNull();
  });
  it('returns nulls for a plain post', () => {
    expect(extractDetails('https://www.instagram.com/reel/abc', null, 'https://www.instagram.com/reel/abc'))
      .toEqual({ name: null, address: null, phone: null, maps_url: null });
  });
});

describe('decodeEntities', () => {
  it('turns preview codes back into characters', () => {
    expect(decodeEntities('so me It&#x2019;s quiet &#x1f90d; &amp; more&#x2026; &quot;hi&quot; &#39;x&#39;')).toBe('so me It’s quiet 🤍 & more… "hi" \'x\'');
  });
  it('leaves unknown or broken codes alone', () => expect(decodeEntities('&bogus; &#xZZ; 5 & 6')).toBe('&bogus; &#xZZ; 5 & 6'));
});
