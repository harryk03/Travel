import type { EditableTable, Member, SharedTrip, Trip, TripData, User } from './types';

export interface NewTrip {
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  display_name: string;
  is_example?: boolean;
}

/** Everything the UI needs from storage. Cloud (Supabase) and demo (browser storage) both implement it. */
export interface Backend {
  mode: 'cloud' | 'demo';
  currentUser(): Promise<User | null>;
  onAuthChange(cb: (u: User | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<void>;
  signOut(): Promise<void>;

  listTrips(): Promise<Trip[]>;
  createTrip(t: NewTrip): Promise<string>;
  joinTrip(code: string, displayName: string): Promise<string>;
  loadTrip(id: string): Promise<TripData>;
  subscribe(tripId: string, onChange: () => void): () => void;

  save(table: EditableTable, row: { id?: string } & Record<string, unknown>): Promise<string>;
  saveMany(table: EditableTable, rows: Array<{ id: string } & Record<string, unknown>>): Promise<void>;
  remove(table: EditableTable, id: string): Promise<void>;
  updateTrip(id: string, patch: Partial<Trip>): Promise<void>;
  deleteTrip(id: string): Promise<void>;
  updateMember(m: Member, patch: Partial<Pick<Member, 'role'>>): Promise<void>;
  removeMember(m: Member): Promise<void>;

  getShared(token: string): Promise<SharedTrip | null>;
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
