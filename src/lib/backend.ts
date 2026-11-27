import type { EditableTable, InboxFile, Member, SharedTrip, Trip, TripData, User } from './types';

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
  /** Emails a reset link that brings the user back here signed in, ready to set a new password. */
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** True after arriving from a password-reset email link. */
  recoveryMode(): boolean;

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
  /** Owner only: attach a traveller to a member's account (merging any duplicate entry for that account). */
  linkTraveller(travellerId: string, userId: string): Promise<void>;
  /** Mark an inbox item added (linked to a place) or dismissed / restored, or save what you found. */
  updateInbox(id: string, patch: { status?: 'new' | 'added' | 'dismissed'; place_id?: string | null; details?: string | null }): Promise<void>;
  /** Screenshots on an inbox item, with their image data. */
  listInboxFiles(inboxId: string): Promise<InboxFile[]>;
  addInboxFile(f: { trip_id: string; inbox_id: string; mime: string; data: string }): Promise<void>;
  removeInboxFile(id: string): Promise<void>;

  getShared(token: string): Promise<SharedTrip | null>;
}

/** Random v4 UUID from the browser's cryptographic generator (used for ids and share tokens). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 10 hex characters (40 bits), same shape as the database default. */
export function newInviteCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(5))].map((x) => x.toString(16).padStart(2, '0')).join('');
}
