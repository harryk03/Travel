import type { Backend } from './backend';
import { createLocalBackend } from './localBackend';
import { createSupabaseBackend } from './supabaseBackend';
import type { SharedTrip, Trip, TripData } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const backend: Backend =
  import.meta.env.MODE !== 'demo' && url && key ? createSupabaseBackend(url, key) : createLocalBackend();

/* Offline cache: last successfully loaded data, so the itinerary and places open without signal. */
const C = 'tripplanner-cache-v1:';

function put(k: string, v: unknown) {
  try {
    localStorage.setItem(C + k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
function get<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(C + k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const cache = {
  saveTrips: (t: Trip[]) => put('trips', t),
  trips: () => get<Trip[]>('trips'),
  saveTrip: (d: TripData) => put('trip:' + d.trip.id, d),
  trip: (id: string) => get<TripData>('trip:' + id),
  saveShared: (token: string, s: SharedTrip) => put('share:' + token, s),
  shared: (token: string) => get<SharedTrip>('share:' + token),
  lastTripId: () => get<string>('last-trip'),
  setLastTripId: (id: string | null) => put('last-trip', id),
  clearAll: () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(C)).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  },
};
