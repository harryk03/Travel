import { addDays, dayRange, todayISO } from './dates';
import type { Item, SharedItem, SharedTrip, TripData } from './types';

type AnyItem = Item | SharedItem;

export function sortItems<T extends AnyItem>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.position - b.position));
}

/** Last night of a stay (check-out day minus one, or the check-in day if no check-out set). */
export function lastNight(s: AnyItem): string {
  return s.end_day && s.end_day > s.day ? addDays(s.end_day, -1) : s.day;
}

export function staysOn<T extends AnyItem>(items: T[], day: string): T[] {
  return items.filter((i) => i.kind === 'stay' && i.day <= day && day <= lastNight(i));
}

export function currentAndUpcomingStays<T extends AnyItem>(items: T[], today = todayISO()): { current: T[]; upcoming: T[] } {
  const stays = sortItems(items.filter((i) => i.kind === 'stay'));
  return {
    current: stays.filter((s) => s.day <= today && today <= lastNight(s)),
    upcoming: stays.filter((s) => s.day > today),
  };
}

/** Days to show: the trip range plus any day that has items outside it. */
export function tripDays(start: string | null, end: string | null, items: AnyItem[]): string[] {
  const set = new Set<string>(start ? dayRange(start, end ?? start) : []);
  for (const i of items) set.add(i.day);
  if (set.size === 0) set.add(todayISO());
  return [...set].sort();
}

/** Position for a new item: slotted by start time among that day's timed items, otherwise at the end. */
export function newPosition(dayItems: AnyItem[], startTime: string | null): number {
  const sorted = [...dayItems].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return 1;
  if (startTime) {
    const idx = sorted.findIndex((i) => i.start_time && i.start_time > startTime);
    if (idx === 0) return sorted[0].position - 1;
    if (idx > 0) return (sorted[idx - 1].position + sorted[idx].position) / 2;
  }
  return sorted[sorted.length - 1].position + 1;
}

/**
 * Client-side mirror of get_shared_trip() for demo mode only.
 * In cloud mode the database function is the enforcement point.
 */
export function toShared(data: TripData): SharedTrip {
  const { name, destination, start_date, end_date, is_example } = data.trip;
  return {
    trip: { name, destination, start_date, end_date, is_example },
    items: sortItems(data.items).map((i) => ({
      id: i.id, day: i.day, end_day: i.end_day, kind: i.kind, title: i.title,
      start_time: i.start_time, end_time: i.end_time, status: i.status,
      location_name: i.location_name, address: i.address, maps_url: i.maps_url,
      lat: i.lat, lng: i.lng, notes: i.notes, position: i.position,
    })),
  };
}
