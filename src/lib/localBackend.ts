import type { Backend, NewTrip } from './backend';
import { uuid } from './backend';
import { toShared } from './itinerary';
import type { EditableTable, InboxFile, Member, Trip, TripData, User } from './types';

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
  inbox?: NonNullable<TripData['inbox']>;
  inboxFiles?: Array<InboxFile & { trip_id: string; data: string }>;
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
      if (t.is_example) {
        const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
        db.inbox = [...(db.inbox ?? []),
          { id: uuid(), trip_id: id, url: 'https://www.instagram.com/reel/EXAMPLE1', source: 'instagram', note: 'Example: gym in Canggu', caption: null, status: 'new', place_id: null, created_at: at(2),
            name: null, address: 'Jl. Example No. 1, Canggu', phone: '+6281200000000', maps_url: null, details: null, needs: null },
          { id: uuid(), trip_id: id, url: 'https://www.tiktok.com/@example/video/7000000000000000001', source: 'tiktok', note: 'Example: brunch spot', caption: 'Best smoothie bowls in Berawa (example caption)', status: 'new', place_id: null, created_at: at(20),
            name: null, address: null, phone: null, maps_url: null, details: null, needs: 'Name of the cafe and the address' },
          { id: uuid(), trip_id: id, url: 'https://example.com/bali-beach-clubs', source: 'other', note: null, caption: 'Example: ten beach clubs worth booking', status: 'new', place_id: null, created_at: at(50) },
        ];
      }
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
        inbox: f(db.inbox ?? []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
        inboxFiles: f(db.inboxFiles ?? []).map(({ id: fid, inbox_id, mime }) => ({ id: fid, inbox_id, mime })),
        placeExtras: true,
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
        inbox: (db.inbox ?? []).filter((r) => r.trip_id !== id), inboxFiles: (db.inboxFiles ?? []).filter((r) => r.trip_id !== id),
      });
    },
    async updateMember(m, patch) {
      const db = load();
      db.members = db.members.map((x) => (x.trip_id === m.trip_id && x.user_id === m.user_id ? { ...x, ...patch } : x));
      persist(db);
    },
    async updateInbox(id, patch) {
      const db = load();
      db.inbox = (db.inbox ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x));
      persist(db);
    },
    async listInboxFiles(inboxId) {
      return structuredClone((load().inboxFiles ?? []).filter((x) => x.inbox_id === inboxId));
    },
    async addInboxFile(file) {
      const db = load();
      if ((db.inboxFiles ?? []).filter((x) => x.inbox_id === file.inbox_id).length >= 6) throw new Error('Up to 6 screenshots per item.');
      db.inboxFiles = [...(db.inboxFiles ?? []), { id: uuid(), ...file }];
      persist(db);
    },
    async removeInboxFile(fileId) {
      const db = load();
      db.inboxFiles = (db.inboxFiles ?? []).filter((x) => x.id !== fileId);
      persist(db);
    },
    async linkTraveller(travellerId, userId) {
      const db = load();
      db.travellers = db.travellers.map((t) => (t.id === travellerId ? { ...t, user_id: userId } : t));
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
