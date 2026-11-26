import { addDays, todayISO } from './dates';
import { equalShares } from './money';
import type { Expense, Item, Place, Traveller, Trip } from './types';
import { uuid } from './backend';

/**
 * EXAMPLE DATA ONLY. A made-up Bali trip so every screen has something to show.
 * Dates are relative to today so the Overview shows "today" content.
 */
export function sampleTrip(ownerName = 'You'): {
  trip: Omit<Trip, 'invite_code' | 'share_token' | 'share_enabled'>;
  travellers: Traveller[];
  places: Place[];
  items: Item[];
  expenses: Expense[];
} {
  const start = addDays(todayISO(), -1);
  const end = addDays(start, 9);
  const tripId = uuid();
  const names = [ownerName, 'Jake (example)', 'Tom (example)', 'Liam (example)', 'Ben (example)', 'Sam (example)'];
  const travellers: Traveller[] = names.map((name, i) => ({ id: uuid(), trip_id: tripId, name, user_id: null }));
  const T = travellers.map((t) => t.id);

  const place = (name: string, category: Place['category'], lat: number, lng: number, address: string, notes: string | null = null): Place => ({
    id: uuid(), trip_id: tripId, name, category, address, lat, lng, notes,
    maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ', ' + address)}`,
  });
  const places: Place[] = [
    place('Example: Canggu surf villa', 'stay', -8.6478, 115.1385, 'Canggu, Bali'),
    place('Example: Ubud jungle villa', 'stay', -8.5069, 115.2625, 'Ubud, Bali'),
    place('Example: Beach club', 'beach_club', -8.6794, 115.1532, 'Seminyak, Bali', 'Book a daybed for 6'),
    place('Example: Specialty coffee', 'cafe', -8.6503, 115.1366, 'Canggu, Bali'),
    place('Example: Warung lunch spot', 'restaurant', -8.6555, 115.1420, 'Canggu, Bali'),
    place('Example: Open-air gym', 'gym', -8.6560, 115.1310, 'Canggu, Bali'),
    place('Example: Rooftop bar', 'nightlife', -8.6900, 115.1620, 'Seminyak, Bali'),
    place('Example: Mount Batur sunrise trek', 'activity', -8.2421, 115.3751, 'Kintamani, Bali'),
  ];

  let pos = 0;
  const item = (day: string, kind: Item['kind'], title: string, extra: Partial<Item> = {}): Item => ({
    id: uuid(), trip_id: tripId, day, end_day: null, kind, title, start_time: null, end_time: null,
    status: 'tentative', location_name: null, address: null, maps_url: null, lat: null, lng: null,
    place_id: null, notes: null, private_notes: null, booking_ref: null, position: ++pos, ...extra,
  });
  const at = (p: Place): Partial<Item> => ({ location_name: p.name, address: p.address, lat: p.lat, lng: p.lng, maps_url: p.maps_url, place_id: p.id });

  const d = (n: number) => addDays(start, n);
  const items: Item[] = [
    item(d(0), 'flight', 'Example flight SYD → DPS', { start_time: '09:30', end_time: '15:10', status: 'confirmed', notes: 'Meet at the international terminal', booking_ref: 'EXAMPLE-ABC123', private_notes: 'Seats 32A–F' }),
    item(d(0), 'transport', 'Driver pick-up to Canggu', { start_time: '16:00', status: 'confirmed', private_notes: 'Driver phone in group chat' }),
    item(d(0), 'stay', 'Canggu surf villa (example)', { end_day: d(5), start_time: '17:00', status: 'confirmed', ...at(places[0]), booking_ref: 'EXAMPLE-VILLA-77', private_notes: 'Gate code shared in chat', notes: 'Check-in from 2pm' }),
    item(d(1), 'food', 'Breakfast & coffee', { start_time: '08:30', status: 'tentative', ...at(places[3]) }),
    item(d(1), 'activity', 'Surf lesson', { start_time: '10:00', end_time: '12:00', status: 'confirmed', location_name: 'Batu Bolong Beach' }),
    item(d(1), 'activity', 'Beach club afternoon', { start_time: '14:00', status: 'tentative', ...at(places[2]), notes: 'Other groups welcome to join' }),
    item(d(1), 'event', 'Sunset drinks with the other crews', { start_time: '18:00', status: 'tentative', ...at(places[6]) }),
    item(d(2), 'activity', 'Gym session', { start_time: '07:30', status: 'tentative', ...at(places[5]) }),
    item(d(2), 'food', 'Long lunch', { start_time: '13:00', status: 'tentative', ...at(places[4]) }),
    item(d(3), 'activity', 'Mount Batur sunrise trek', { start_time: '02:00', status: 'confirmed', ...at(places[7]), booking_ref: 'EXAMPLE-TREK-5', notes: 'Pick-up 2am sharp' }),
    item(d(4), 'event', 'Group dinner — all three crews', { start_time: '19:30', status: 'tentative', location_name: 'Seminyak' }),
    item(d(5), 'stay', 'Ubud jungle villa (example)', { end_day: d(9), start_time: '14:00', status: 'tentative', ...at(places[1]) }),
    item(d(6), 'activity', 'Rice terraces & waterfall', { start_time: '08:00', status: 'tentative', location_name: 'Tegallalang' }),
    item(d(9), 'flight', 'Example flight DPS → SYD', { start_time: '21:45', status: 'confirmed', booking_ref: 'EXAMPLE-XYZ789' }),
  ];

  const exp = (description: string, amount: number, currency: Expense['currency'], payer: number, who = T, daysIn = 0): Expense => ({
    id: uuid(), trip_id: tripId, kind: 'expense', description, amount, currency, paid_by: T[payer],
    split_type: 'equal', shares: equalShares(amount, currency, who), spent_on: d(daysIn),
  });
  const expenses: Expense[] = [
    exp('Example: Canggu villa (5 nights)', 2400, 'AUD', 0),
    exp('Example: Airport driver', 450000, 'IDR', 1),
    exp('Example: Surf lesson', 1800000, 'IDR', 2, T, 1),
    { ...exp('Example: Beach club daybed', 3000000, 'IDR', 3, T, 1), split_type: 'custom',
      shares: [{ traveller_id: T[0], amount: 1000000 }, { traveller_id: T[3], amount: 1000000 }, { traveller_id: T[4], amount: 1000000 }] },
    { id: uuid(), trip_id: tripId, kind: 'repayment', description: 'Example repayment', amount: 400, currency: 'AUD',
      paid_by: T[1], split_type: 'custom', shares: [{ traveller_id: T[0], amount: 400 }], spent_on: d(1) },
  ];

  return {
    trip: { id: tripId, name: 'Bali crew trip — EXAMPLE', destination: 'Bali, Indonesia', start_date: start, end_date: end, is_example: true },
    travellers, places, items, expenses,
  };
}
