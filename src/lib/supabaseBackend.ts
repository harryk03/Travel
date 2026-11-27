import { createClient, type SupabaseClient, type User as SbUser } from '@supabase/supabase-js';
import type { Backend, NewTrip } from './backend';
import { uuid } from './backend';
import type { EditableTable, InboxFile, Member, PlacePhoto, SharedTrip, Trip, TripData, User } from './types';

function toUser(u: SbUser | null | undefined): User | null {
  if (!u) return null;
  const name = (u.user_metadata?.name as string | undefined) ?? u.email?.split('@')[0] ?? 'Traveller';
  return { id: u.id, email: u.email ?? '', name };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function check(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  // Read before the client consumes the link's URL fragment.
  let recovery = typeof location !== 'undefined' && /type=recovery/.test(location.hash);
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
  });

  return {
    mode: 'cloud',
    async currentUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password, name) {
      const data = check(await sb.auth.signUp({ email, password, options: { data: { name } } }));
      if (!data.session) throw new Error('Account created. Check your email to confirm it, then sign in.');
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async sendPasswordReset(email) {
      check(await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` }));
    },
    async updatePassword(password) {
      check(await sb.auth.updateUser({ password }));
      recovery = false;
      if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname);
    },
    recoveryMode() {
      return recovery;
    },

    async listTrips() {
      return check(await sb.from('trips').select('*').order('start_date', { ascending: true })) as Trip[];
    },
    async createTrip(t: NewTrip) {
      return check(await sb.rpc('create_trip', {
        p_name: t.name, p_destination: t.destination, p_start: t.start_date, p_end: t.end_date,
        p_display_name: t.display_name, p_example: t.is_example ?? false,
      })) as string;
    },
    async joinTrip(code, displayName) {
      return check(await sb.rpc('join_trip', { p_code: code, p_display_name: displayName })) as string;
    },
    async loadTrip(id) {
      const [trip, members, travellers, places, items, expenses, inbox, files, extras, photos] = await Promise.all([
        sb.from('trips').select('*').eq('id', id).single(),
        sb.from('trip_members').select('*').eq('trip_id', id),
        sb.from('travellers').select('*').eq('trip_id', id).order('created_at'),
        sb.from('places').select('*').eq('trip_id', id).order('created_at', { ascending: false }),
        sb.from('items').select('*').eq('trip_id', id),
        sb.from('expenses').select('*').eq('trip_id', id).order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
        sb.from('inbox_items').select('*').eq('trip_id', id).order('created_at', { ascending: false }),
        sb.from('inbox_files').select('id,inbox_id,mime').eq('trip_id', id).order('created_at'),
        sb.from('places').select('website').eq('trip_id', id).limit(1),
        sb.from('place_photos').select('id,place_id,mime,thumb').eq('trip_id', id).order('created_at'),
      ]);
      return {
        trip: check(trip),
        members: check(members),
        travellers: check(travellers),
        places: check(places),
        items: check(items),
        expenses: (check(expenses) as TripData['expenses']).map((e) => ({ ...e, amount: Number(e.amount) })),
        // Missing table (migration 007 not run yet) or any other problem: hide the inbox rather than fail the trip.
        inbox: inbox.error ? undefined : (inbox.data as TripData['inbox']),
        // Missing until migration 008 has run.
        inboxFiles: files.error ? undefined : (files.data as TripData['inboxFiles']),
        // Errors until migration 010 adds the website column.
        placeExtras: !extras.error,
        // Missing until migration 012 has run.
        placePhotos: photos.error ? undefined : (photos.data as TripData['placePhotos']),
      } as TripData;
    },
    subscribe(tripId, onChange) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const debounced = () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 250);
      };
      const ch = sb.channel(`trip-${tripId}`);
      for (const table of ['items', 'places', 'expenses', 'travellers', 'trip_members']) {
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `trip_id=eq.${tripId}` }, debounced);
        ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `trip_id=eq.${tripId}` }, debounced);
        // Realtime can't filter deletes, so any delete in the table triggers a (cheap) reload.
        ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, debounced);
      }
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, debounced);
      ch.subscribe();
      // The inbox gets its own channel so a missing table can never break the main one.
      const inboxCh = sb.channel(`inbox-${tripId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_items', filter: `trip_id=eq.${tripId}` }, debounced)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_files', filter: `trip_id=eq.${tripId}` }, debounced)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'place_photos', filter: `trip_id=eq.${tripId}` }, debounced)
        .subscribe();
      return () => {
        void sb.removeChannel(inboxCh);
        clearTimeout(timer);
        void sb.removeChannel(ch);
      };
    },

    async save(table: EditableTable, row) {
      const id = row.id ?? uuid();
      const payload = table === 'items' ? { ...row, id, updated_at: new Date().toISOString() } : { ...row, id };
      check(await sb.from(table).upsert(payload));
      return id;
    },
    async saveMany(table, rows) {
      if (rows.length) check(await sb.from(table).upsert(rows));
    },
    async remove(table, id) {
      check(await sb.from(table).delete().eq('id', id));
    },
    async updateTrip(id, patch: Partial<Trip>) {
      check(await sb.from('trips').update(patch).eq('id', id));
    },
    async deleteTrip(id) {
      check(await sb.from('trips').delete().eq('id', id));
    },
    async updateMember(m: Member, patch) {
      check(await sb.from('trip_members').update(patch).eq('trip_id', m.trip_id).eq('user_id', m.user_id));
    },
    async removeMember(m: Member) {
      check(await sb.from('trip_members').delete().eq('trip_id', m.trip_id).eq('user_id', m.user_id));
    },
    async updateInbox(id, patch) {
      check(await sb.from('inbox_items').update(patch).eq('id', id));
    },
    async listInboxFiles(inboxId) {
      return check(await sb.from('inbox_files').select('id,inbox_id,mime,data').eq('inbox_id', inboxId).order('created_at')) as InboxFile[];
    },
    async addInboxFile(f) {
      check(await sb.from('inbox_files').insert(f));
    },
    async removeInboxFile(id) {
      check(await sb.from('inbox_files').delete().eq('id', id));
    },
    async listPlacePhotos(placeId) {
      return check(await sb.from('place_photos').select('id,place_id,mime,thumb,data,source_url').eq('place_id', placeId).order('created_at')) as PlacePhoto[];
    },
    async addPlacePhoto(f) {
      check(await sb.from('place_photos').insert(f));
    },
    async removePlacePhoto(id) {
      check(await sb.from('place_photos').delete().eq('id', id));
    },
    async findPhoto(url) {
      const { data } = await sb.auth.getSession();
      const res = await fetch(`/api/photo-source?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      });
      if (!res.ok) {
        const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        throw new Error(msg ? `No photo: ${msg}` : 'Couldn’t get a photo from that page');
      }
      return { blob: await res.blob(), source: res.headers.get('x-photo-source') };
    },
    async linkTraveller(travellerId, userId) {
      check(await sb.rpc('link_traveller', { p_traveller: travellerId, p_user: userId }));
    },

    async getShared(token) {
      return (check(await sb.rpc('get_shared_trip', { p_token: token })) as SharedTrip | null) ?? null;
    },
  };
}
