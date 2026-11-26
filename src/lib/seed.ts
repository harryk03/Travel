import type { Backend } from './backend';
import { sampleTrip } from './sample';

/** Creates the clearly-labelled example Bali trip through the normal backend API. Returns the new trip id. */
export async function seedExampleTrip(backend: Backend, displayName: string): Promise<string> {
  const s = sampleTrip(displayName);
  const tripId = await backend.createTrip({
    name: s.trip.name, destination: s.trip.destination ?? '', start_date: s.trip.start_date, end_date: s.trip.end_date,
    display_name: displayName, is_example: true,
  });
  const loaded = await backend.loadTrip(tripId);
  // createTrip already made the caller a traveller; map the sample's first traveller onto it.
  const idMap = new Map<string, string>([[s.travellers[0].id, loaded.travellers[0].id]]);
  const t = (id: string) => idMap.get(id) ?? id;

  await backend.saveMany('travellers', s.travellers.slice(1).map((x) => ({ ...x, trip_id: tripId })));
  await backend.saveMany('places', s.places.map((x) => ({ ...x, trip_id: tripId })));
  await backend.saveMany('items', s.items.map((x) => ({ ...x, trip_id: tripId })));
  await backend.saveMany('expenses', s.expenses.map((e) => ({
    ...e, trip_id: tripId, paid_by: t(e.paid_by), shares: e.shares.map((sh) => ({ ...sh, traveller_id: t(sh.traveller_id) })),
  })));
  return tripId;
}
