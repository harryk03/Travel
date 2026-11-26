import type { Backend, NewTrip } from './backend';
import { uuid } from './backend';
import { toShared } from './itinerary';
import type { EditableTable, Member, Trip, TripData, User } from './types';

/**
 * Demo backend: everything lives in this browser's storage. Used for the preview build
 * and when no Supabase project is configured. Single user, no real sharing.
 */
interface DB {
  trips: Trip[];
  members: Member[];
  travellers: TripData['travellers'];
  places: TripData['places'];
  items: TripData['items'];
  expenses: TripData['expenses'];
}

const KEY = 'tripplanner-demo-db-v1';
const USER: User = { id: 'demo-user', email: 'demo@example.com', name: 'You' };

function empty(): DB {
  return { trips: [], members: [], travellers: [], places: [], items: [], expenses: [] };
}

let memory: DB | null = null;

function load(): DB {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as DB) : empty();
  } catch {
    memory = empty();
  }
  return memory;
}

function persist(db: DB) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();

export function createLocalBackend(): Backend {
  return {
    mode: 'demo',
    async currentUser() {
      return USER;
    },
    onAuthChange() {
      return () => {};
    },
    async signIn() {},
    async signUp() {},
    async signOut() {},
    async sendPasswordReset() {},
    async updatePassword() {},
    recoveryMode() {
      return false;
    },

    async listTrips() {
      return load().trips;
    },
    async createTrip(t: NewTrip) {
      const db = load();
      const id = uuid();
      db.trips.push({
        id, name: t.name, destination: t.destination, start_date: t.start_date, end_date: t.end_date,
        is_example: t.is_example ?? false, invite_code: uuid().slice(0, 10), share_token: uuid(), share_enabled: true,
      });
      db.members.push({ trip_id: id, user_id: USER.id, role: 'owner', display_name: t.display_name || USER.name });
      db.travellers.push({ id: uuid(), trip_id: id, name: t.display_name || USER.name, user_id: USER.id });
      persist(db);
      return id;
    },
    async joinTrip() {
      throw new Error('Joining trips needs the cloud version.');
    },
    async loadTrip(id) {
      const db = load();
      const trip = db.trips.find((t) => t.id === id);
      if (!trip) throw new Error('Trip not found');
      const f = <T extends { trip_id: string }>(rows: T[]) => rows.filter((r) => r.trip_id === id);
      return structuredClone({
        trip, members: f(db.members), travellers: f(db.travellers), places: f(db.places).reverse(),
        items: f(db.items),
        expenses: f(db.expenses).sort((a, b) => (a.spent_on < b.spent_on ? 1 : a.spent_on > b.spent_on ? -1 : 0)),
      });
    },
    subscribe(_tripId, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    async save(table: EditableTable, row) {
      const db = load();
      const id = (row.id as string | undefined) ?? uuid();
      const rows = db[table] as Array<{ id: string }>;
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i], ...row, id };
      else rows.push({ ...row, id } as { id: string });
      persist(db);
      return id;
    },
    async saveMany(table, rowsIn) {
      const db = load();
      const rows = db[table] as Array<{ id: string }>;
      for (const row of rowsIn) {
        const i = rows.findIndex((r) => r.id === row.id);
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push(row);
      }
      persist(db);
    },
    async remove(table, id) {
      const db = load();
      if (table === 'travellers' && db.expenses.some((e) => e.paid_by === id || e.shares.some((s) => s.traveller_id === id))) {
        throw new Error('This traveller has expenses. Remove those first.');
      }
      (db[table] as Array<{ id: string }>) = (db[table] as Array<{ id: string }>).filter((r) => r.id !== id);
      if (table === 'places') db.items.forEach((it) => { if (it.place_id === id) it.place_id = null; });
      persist(db);
    },
    async updateTrip(id, patch) {
      const db = load();
      db.trips = db.trips.map((t) => (t.id === id ? { ...t, ...patch } : t));
      persist(db);
    },
    async deleteTrip(id) {
      const db = load();
      persist({
        trips: db.trips.filter((t) => t.id !== id), members: db.members.filter((r) => r.trip_id !== id),
        travellers: db.travellers.filter((r) => r.trip_id !== id), places: db.places.filter((r) => r.trip_id !== id),
        items: db.items.filter((r) => r.trip_id !== id), expenses: db.expenses.filter((r) => r.trip_id !== id),
      });
    },
    async updateMember(m, patch) {
      const db = load();
      db.members = db.members.map((x) => (x.trip_id === m.trip_id && x.user_id === m.user_id ? { ...x, ...patch } : x));
      persist(db);
    },
    async removeMember(m) {
      const db = load();
      db.members = db.members.filter((x) => !(x.trip_id === m.trip_id && x.user_id === m.user_id));
      persist(db);
    },

    async getShared(token) {
      const db = load();
      const trip = db.trips.find((t) => t.share_token === token && t.share_enabled);
      if (!trip) return null;
      return toShared(await this.loadTrip(trip.id));
    },
  };
}
