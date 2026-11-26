import { describe, expect, it } from 'vitest';
import { tripPhase } from './dates';
import { currentAndUpcomingStays, itemsInRange, newPosition, personalRange, toShared } from './itinerary';
import { directionsUrl, openInMapsUrl, parseMapsUrl, safeHttpUrl } from './maps';
import { balances, equalShares, settleUp, sharesTotal } from './money';
import { sampleTrip } from './sample';
import type { Expense, Traveller, TripData } from './types';

describe('parseMapsUrl', () => {
  it('reads name and precise pin from a full place link', () => {
    const p = parseMapsUrl('https://www.google.com/maps/place/Potato+Head+Beach+Club/@-8.6795,115.1530,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-8.6794587!4d115.1532404');
    expect(p?.name).toBe('Potato Head Beach Club');
    expect(p?.lat).toBeCloseTo(-8.6794587);
    expect(p?.lng).toBeCloseTo(115.1532404);
  });
  it('handles encoded names and the @ viewport fallback', () => {
    const p = parseMapsUrl('Check this https://www.google.com/maps/place/Caf%C3%A9+Organic/@-8.65,115.13,15z');
    expect(p?.name).toBe('Café Organic');
    expect(p?.lat).toBe(-8.65);
  });
  it('reads ?q= search and coordinate links', () => {
    expect(parseMapsUrl('https://maps.google.com/?q=Single+Fin+Bali')?.name).toBe('Single Fin Bali');
    const c = parseMapsUrl('https://www.google.com/maps?q=-8.7,115.2');
    expect(c?.name).toBeNull();
    expect(c?.lat).toBe(-8.7);
  });
  it('flags short links for server-side resolution', () => {
    const p = parseMapsUrl('https://maps.app.goo.gl/AbCdEf123');
    expect(p?.isShortLink).toBe(true);
    expect(p?.name).toBeNull();
  });
  it('returns null for text without a link', () => {
    expect(parseMapsUrl('just some text')).toBeNull();
  });
});

describe('link safety', () => {
  it('never produces javascript:/data: hrefs from stored links', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', 'not a url']) {
      expect(safeHttpUrl(bad)).toBeNull();
      const open = openInMapsUrl({ maps_url: bad, name: 'Cafe' });
      expect(open?.startsWith('https://www.google.com/maps/')).toBe(true);
    }
    expect(safeHttpUrl('https://maps.app.goo.gl/x')).toBe('https://maps.app.goo.gl/x');
    expect(directionsUrl({ name: '"><script>', address: null })).toContain(encodeURIComponent('"><script>'));
  });
});

describe('money', () => {
  it('splits AUD to the cent and always sums to the total', () => {
    const s = equalShares(100, 'AUD', ['a', 'b', 'c']);
    expect(s.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(sharesTotal(s, 'AUD')).toBe(100);
  });
  it('splits IDR in whole rupiah', () => {
    const s = equalShares(1000000, 'IDR', ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(s.every((x) => Number.isInteger(x.amount))).toBe(true);
    expect(sharesTotal(s, 'IDR')).toBe(1000000);
  });
  it('keeps currencies separate, counts repayments, and settles up to zero', () => {
    const tr: Traveller[] = ['a', 'b', 'c'].map((id) => ({ id, trip_id: 't', name: id, user_id: null }));
    const base = { trip_id: 't', split_type: 'equal' as const, spent_on: '2026-12-01', description: '' };
    const ex: Expense[] = [
      { ...base, id: '1', kind: 'expense', amount: 90, currency: 'AUD', paid_by: 'a', shares: equalShares(90, 'AUD', ['a', 'b', 'c']) },
      { ...base, id: '2', kind: 'expense', amount: 300000, currency: 'IDR', paid_by: 'b', shares: equalShares(300000, 'IDR', ['a', 'b', 'c']) },
      { ...base, id: '3', kind: 'repayment', amount: 30, currency: 'AUD', paid_by: 'b', shares: [{ traveller_id: 'a', amount: 30 }] },
    ];
    const net = balances(ex, tr);
    expect(net.AUD).toEqual({ a: 30, b: 0, c: -30 });
    expect(net.IDR).toEqual({ a: -100000, b: 200000, c: -100000 });
    // c owes a 30; b owed a 30 but repaid it, so nothing left between them
    expect(settleUp(ex, 'AUD')).toEqual([{ from: 'c', to: 'a', amount: 30, currency: 'AUD' }]);
  });
});

describe('who pays who', () => {
  it('pays each payer back; only the two payers net against each other', () => {
    const ids = ['harry', 'adem', 'abel', 'rob', 'jas'];
    const base = { trip_id: 't', split_type: 'equal' as const, spent_on: '2026-12-01', kind: 'expense' as const, currency: 'AUD' as const };
    const ex: Expense[] = [
      { ...base, id: '1', description: 'Kenaya', amount: 1447.16, paid_by: 'harry', shares: equalShares(1447.16, 'AUD', ids) },
      { ...base, id: '2', description: 'Alex', amount: 3453.01, paid_by: 'rob', shares: equalShares(3453.01, 'AUD', ids) },
      { ...base, id: '3', description: 'Befam', amount: 1432.30, paid_by: 'harry', shares: equalShares(1432.30, 'AUD', ids) },
    ];
    const plan = settleUp(ex, 'AUD');
    const get = (f: string, t: string) => plan.find((p) => p.from === f && p.to === t)?.amount;
    for (const m of ['adem', 'abel', 'jas']) {
      expect(get(m, 'harry')).toBe(576);
      expect(get(m, 'rob')).toBe(691);
    }
    expect(get('harry', 'rob')).toBe(115);
    expect(get('rob', 'harry')).toBeUndefined();
    expect(plan).toHaveLength(7);
    // Abel pays the rounded-up A$576: the 11c overpayment must not create a new line back to Abel.
    const paid: Expense = { ...base, id: '4', kind: 'repayment', description: 'Repayment', amount: 576, paid_by: 'abel', split_type: 'custom', shares: [{ traveller_id: 'harry', amount: 576 }] };
    const after = settleUp([...ex, paid], 'AUD');
    expect(after.some((p) => (p.from === 'abel' && p.to === 'harry') || (p.from === 'harry' && p.to === 'abel'))).toBe(false);
    expect(after).toHaveLength(6);
    // A partial payment leaves the rest, rounded up.
    const part: Expense = { ...paid, id: '5', amount: 300, shares: [{ traveller_id: 'harry', amount: 300 }] };
    expect(settleUp([...ex, part], 'AUD').find((p) => p.from === 'abel' && p.to === 'harry')?.amount).toBe(276);
  });
});

describe('itinerary', () => {
  it('share view drops private notes and booking references', () => {
    const s = sampleTrip('Me');
    const data: TripData = { ...s, members: [], trip: { ...s.trip, invite_code: 'code', share_token: 'tok', share_enabled: true } };
    const shared = JSON.stringify(toShared(data));
    expect(shared).not.toMatch(/private_notes|booking_ref|EXAMPLE-ABC123|Gate code|invite|tok"|expense|amount/);
    expect(shared).toContain('Surf lesson');
  });
  it('finds current and upcoming stays (check-out day is not a night)', () => {
    const s = sampleTrip();
    const stays = s.items.filter((i) => i.kind === 'stay');
    const { current, upcoming } = currentAndUpcomingStays(s.items, stays[0].day);
    expect(current.map((x) => x.id)).toEqual([stays[0].id]);
    expect(upcoming.map((x) => x.id)).toEqual([stays[1].id]);
    expect(currentAndUpcomingStays(s.items, stays[1].day).current.map((x) => x.id)).toEqual([stays[1].id]);
  });
  it('slots new timed items in time order', () => {
    const day = [{ position: 1, start_time: '08:00' }, { position: 2, start_time: '12:00' }] as never[];
    expect(newPosition(day, '10:00')).toBe(1.5);
    expect(newPosition(day, '07:00')).toBe(0);
    expect(newPosition(day, null)).toBe(3);
  });
  it('trip phase', () => {
    expect(tripPhase('2026-12-10', '2026-12-20', '2026-12-01')).toEqual({ phase: 'before', days: 9 });
    expect(tripPhase('2026-12-10', '2026-12-20', '2026-12-12')).toEqual({ phase: 'during', day: 3, total: 11 });
    expect(tripPhase('2026-12-10', '2026-12-20', '2026-12-21')).toEqual({ phase: 'after' });
  });
});

describe('personal dates', () => {
  const trip = { start_date: '2026-12-23', end_date: '2027-01-05' };
  const base = { trip_id: 't', end_time: null, start_time: null, status: 'confirmed' as const, location_name: null, address: null, maps_url: null, lat: null, lng: null, place_id: null, notes: null, private_notes: null, booking_ref: null, position: 1, end_day: null };
  const items = [
    { ...base, id: 'f1', day: '2026-12-23', kind: 'flight' as const, title: 'Flight in' },
    { ...base, id: 's1', day: '2026-12-23', end_day: '2026-12-26', kind: 'stay' as const, title: 'To book' },
    { ...base, id: 's2', day: '2026-12-26', end_day: '2026-12-30', kind: 'stay' as const, title: 'Kenaya' },
    { ...base, id: 'a1', day: '2026-12-31', kind: 'event' as const, title: 'NYE' },
    { ...base, id: 'f2', day: '2027-01-05', kind: 'flight' as const, title: 'Flight home' },
  ];
  it('falls back to the trip dates', () => {
    expect(personalRange(trip, { arrive_on: null, leave_on: null })).toEqual({ start: '2026-12-23', end: '2027-01-05', custom: false });
    expect(personalRange(trip, undefined).custom).toBe(false);
  });
  it('arriving on the 26th drops everything that finishes before then', () => {
    const jas = personalRange(trip, { arrive_on: '2026-12-26', leave_on: null });
    expect(jas).toEqual({ start: '2026-12-26', end: '2027-01-05', custom: true });
    expect(itemsInRange(items, jas.start, jas.end).map((i) => i.id)).toEqual(['s2', 'a1', 'f2']);
  });
  it('leaving early drops what starts after the last day', () => {
    expect(itemsInRange(items, '2026-12-23', '2026-12-31').map((i) => i.id)).toEqual(['f1', 's1', 's2', 'a1']);
  });
});
