export type Role = 'owner' | 'member';
export type Status = 'confirmed' | 'tentative';
export type ItemKind = 'flight' | 'stay' | 'activity' | 'event' | 'food' | 'transport' | 'other';
export type PlaceCategory = 'gym' | 'cafe' | 'restaurant' | 'stay' | 'beach_club' | 'nightlife' | 'activity' | 'other';
export type Currency = 'AUD' | 'IDR';

export interface Trip {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null;
  is_example: boolean;
  invite_code: string;
  share_token: string;
  share_enabled: boolean;
}

export interface Member {
  trip_id: string;
  user_id: string;
  role: Role;
  display_name: string;
}

export interface Traveller {
  id: string;
  trip_id: string;
  name: string;
  user_id: string | null;
  /** Personal dates; null means the trip's own dates. */
  arrive_on?: string | null;
  leave_on?: string | null;
}

export interface Place {
  id: string;
  trip_id: string;
  name: string;
  category: PlaceCategory;
  address: string | null;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  /** The Instagram/TikTok post this place came from. Members only. */
  source_url?: string | null;
}

export interface Item {
  id: string;
  trip_id: string;
  day: string;
  end_day: string | null;
  kind: ItemKind;
  title: string;
  start_time: string | null; // HH:MM[:SS]
  end_time: string | null;
  status: Status;
  location_name: string | null;
  address: string | null;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  notes: string | null;
  private_notes: string | null;
  booking_ref: string | null;
  position: number;
  /** Traveller ids who can see this plan; null = everyone in the trip. Enforced by the database. */
  visible_to?: string[] | null;
  /** Public listing page (Airbnb, Booking.com…) and the reservation page. Members only. */
  listing_url?: string | null;
  booking_url?: string | null;
}

export interface Share {
  traveller_id: string;
  amount: number;
}

export interface Expense {
  id: string;
  trip_id: string;
  kind: 'expense' | 'repayment';
  description: string;
  amount: number;
  currency: Currency;
  paid_by: string;
  split_type: 'equal' | 'custom';
  shares: Share[];
  spent_on: string;
  created_at?: string;
  /** Only the payer and the people it's split between can see it; left out of group totals. Enforced by the database. */
  is_private?: boolean;
}

export interface InboxItem {
  id: string;
  trip_id: string;
  url: string;
  source: 'instagram' | 'tiktok' | 'other';
  note: string | null;
  caption: string | null;
  status: 'new' | 'added' | 'dismissed';
  place_id: string | null;
  created_at: string;
}

export interface TripData {
  trip: Trip;
  members: Member[];
  travellers: Traveller[];
  places: Place[];
  items: Item[];
  expenses: Expense[];
  /** Shared-post inbox. Undefined when the database doesn't have it yet (migration 007). */
  inbox?: InboxItem[];
}

/** What external friends see. Mirrors get_shared_trip() in supabase/schema.sql. */
export type SharedItem = Pick<Item, 'id' | 'day' | 'end_day' | 'kind' | 'title' | 'start_time' | 'end_time' | 'status' |
  'location_name' | 'address' | 'maps_url' | 'lat' | 'lng' | 'notes' | 'position'>;
export interface SharedTrip {
  trip: Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date' | 'is_example'>;
  items: SharedItem[];
}

export type EditableTable = 'items' | 'places' | 'expenses' | 'travellers';

export interface User {
  id: string;
  email: string;
  name: string;
}

export const KIND_META: Record<ItemKind, { emoji: string; label: string }> = {
  flight: { emoji: '✈️', label: 'Flight' },
  stay: { emoji: '🏨', label: 'Accommodation' },
  activity: { emoji: '🌋', label: 'Activity' },
  event: { emoji: '🎉', label: 'Event' },
  food: { emoji: '🍽️', label: 'Food & drink' },
  transport: { emoji: '🛵', label: 'Transport' },
  other: { emoji: '📌', label: 'Other' },
};

export const CATEGORY_META: Record<PlaceCategory, { emoji: string; label: string; kind: ItemKind }> = {
  cafe: { emoji: '☕', label: 'Cafés', kind: 'food' },
  restaurant: { emoji: '🍽️', label: 'Restaurants', kind: 'food' },
  beach_club: { emoji: '🏖️', label: 'Beach clubs', kind: 'activity' },
  nightlife: { emoji: '🍸', label: 'Nightlife', kind: 'event' },
  activity: { emoji: '🌋', label: 'Activities', kind: 'activity' },
  gym: { emoji: '🏋️', label: 'Gyms', kind: 'activity' },
  stay: { emoji: '🏨', label: 'Accommodation', kind: 'stay' },
  other: { emoji: '📍', label: 'Other', kind: 'other' },
};
