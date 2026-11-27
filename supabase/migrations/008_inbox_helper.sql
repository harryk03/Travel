-- 008: inbox details, screenshots, phone numbers on places, and a limited helper key for Claude.
-- Additive only: new columns, tables and functions. Nothing existing is changed or removed.
-- Members only: get_shared_trip is unchanged, so none of this is on the share link.

-- 1. Details pulled from what's shared, your extra details, and what the helper still needs.
alter table public.inbox_items add column if not exists name text;
alter table public.inbox_items add column if not exists address text;
alter table public.inbox_items add column if not exists phone text;
alter table public.inbox_items add column if not exists maps_url text;
alter table public.inbox_items add column if not exists details text;   -- what you found
alter table public.inbox_items add column if not exists needs text;     -- what the helper couldn't confirm
alter table public.places add column if not exists phone text;
alter table public.places add column if not exists helper_added boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inbox_items_details_ok') then
    alter table public.inbox_items add constraint inbox_items_details_ok check (
      (name is null or length(name) <= 200) and (address is null or length(address) <= 300)
      and (phone is null or phone ~ '^\+?[0-9 ()-]{6,24}$')
      and (maps_url is null or (maps_url ~* '^https?://' and length(maps_url) <= 2048))
      and (details is null or length(details) <= 4000) and (needs is null or length(needs) <= 500));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'places_phone_ok') then
    alter table public.places add constraint places_phone_ok check (phone is null or phone ~ '^\+?[0-9 ()-]{6,24}$');
  end if;
end $$;

-- 2. Screenshots for an inbox item (small JPEGs made in the app, at most 6 per item). Members only.
create table if not exists public.inbox_files (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  inbox_id uuid not null references public.inbox_items on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data text not null check (length(data) between 100 and 700000),   -- base64, about 500 KB max
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists inbox_files_item on public.inbox_files (inbox_id);
alter table public.inbox_files enable row level security;
drop policy if exists inbox_files_select on public.inbox_files;
drop policy if exists inbox_files_insert on public.inbox_files;
drop policy if exists inbox_files_delete on public.inbox_files;
create policy inbox_files_select on public.inbox_files for select to authenticated using (public.is_member(trip_id));
create policy inbox_files_insert on public.inbox_files for insert to authenticated with check (
  public.is_member(trip_id)
  and exists (select 1 from public.inbox_items i where i.id = inbox_id and i.trip_id = inbox_files.trip_id)
  and (select count(*) from public.inbox_files f where f.inbox_id = inbox_files.inbox_id) < 6);
create policy inbox_files_delete on public.inbox_files for delete to authenticated using (public.is_member(trip_id));
revoke all on public.inbox_files from anon;
revoke update on public.inbox_files from authenticated;

-- 3. The Shortcut endpoint saves extracted details. Same secret check as inbox_add (which stays).
create or replace function public.inbox_add_details(
  p_trip uuid, p_token text, p_url text, p_source text, p_note text, p_caption text,
  p_name text, p_address text, p_phone text, p_maps_url text)
returns text language plpgsql security definer set search_path = public as $$
declare h text;
begin
  select token_hash into h from inbox_secrets where trip_id = p_trip;
  if h is null or p_token is null or length(p_token) < 32
     or h <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception 'not allowed';
  end if;
  insert into inbox_items (trip_id, url, source, note, caption, name, address, phone, maps_url)
  values (p_trip, p_url, coalesce(nullif(p_source, ''), 'other'), nullif(trim(p_note), ''),
          nullif(left(trim(p_caption), 2000), ''), nullif(left(trim(p_name), 200), ''),
          nullif(left(trim(p_address), 300), ''), nullif(trim(p_phone), ''), nullif(p_maps_url, ''))
  on conflict (trip_id, url) do nothing;
  return case when found then 'saved' else 'exists' end;
end $$;
revoke all on function public.inbox_add_details(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.inbox_add_details(uuid, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- 4. Helper key: a second secret (stored only as a hash) that can read the inbox and add places.
create table if not exists public.helper_secrets (
  trip_id uuid primary key references public.trips on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$')
);
alter table public.helper_secrets enable row level security;
revoke all on public.helper_secrets from anon, authenticated;

create or replace function public.helper_check(p_trip uuid, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  select token_hash into h from helper_secrets where trip_id = p_trip;
  if h is null or p_token is null or length(p_token) < 32
     or h <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception 'not allowed';
  end if;
end $$;
revoke all on function public.helper_check(uuid, text) from public, anon, authenticated;

-- Read: open inbox items (with your details and screenshot count) and the names of saved places.
create or replace function public.helper_inbox(p_trip uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  return jsonb_build_object(
    'trip', (select jsonb_build_object('name', name, 'destination', destination) from trips where id = p_trip),
    'inbox', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'url', i.url, 'source', i.source, 'note', i.note, 'caption', i.caption,
        'name', i.name, 'address', i.address, 'phone', i.phone, 'maps_url', i.maps_url,
        'details', i.details, 'needs', i.needs, 'created_at', i.created_at,
        'files', (select count(*) from inbox_files f where f.inbox_id = i.id)) order by i.created_at)
      from inbox_items i where i.trip_id = p_trip and i.status = 'new'), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'category', p.category,
        'helper_added', p.helper_added) order by p.name)
      from places p where p.trip_id = p_trip), '[]'::jsonb));
end $$;

-- Read: the screenshots on one inbox item.
create or replace function public.helper_files(p_trip uuid, p_token text, p_inbox uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'mime', f.mime, 'data', f.data) order by f.created_at)
    from inbox_files f where f.trip_id = p_trip and f.inbox_id = p_inbox), '[]'::jsonb);
end $$;

-- Write: turn an open inbox item into a place and tick it off. Nothing else.
create or replace function public.helper_add_place(p_trip uuid, p_token text, p_inbox uuid,
  p_name text, p_category text, p_address text, p_maps_url text, p_lat double precision, p_lng double precision,
  p_phone text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare src text; pid uuid;
begin
  perform helper_check(p_trip, p_token);
  select url into src from inbox_items where id = p_inbox and trip_id = p_trip and status = 'new' for update;
  if src is null then raise exception 'inbox item not found or already handled'; end if;
  insert into places (trip_id, name, category, address, maps_url, lat, lng, phone, notes, source_url, helper_added, created_by)
  values (p_trip, left(trim(p_name), 200), coalesce(nullif(p_category, ''), 'other'), nullif(trim(p_address), ''),
          nullif(p_maps_url, ''), p_lat, p_lng, nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), src, true, null)
  returning id into pid;
  update inbox_items set status = 'added', place_id = pid, needs = null where id = p_inbox;
  return pid;
end $$;

-- Write: fill in or correct a place the helper added (never one you added). Empty values leave a field as is.
create or replace function public.helper_update_place(p_trip uuid, p_token text, p_place uuid,
  p_name text, p_category text, p_address text, p_maps_url text, p_lat double precision, p_lng double precision,
  p_phone text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  update places set
    name = coalesce(nullif(left(trim(p_name), 200), ''), name),
    category = coalesce(nullif(p_category, ''), category),
    address = coalesce(nullif(trim(p_address), ''), address),
    maps_url = coalesce(nullif(p_maps_url, ''), maps_url),
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_place and trip_id = p_trip and helper_added;
  if not found then raise exception 'place not found or not added by the helper'; end if;
end $$;

-- Write: say what's missing on an open inbox item, so you know what to look for.
create or replace function public.helper_flag(p_trip uuid, p_token text, p_inbox uuid, p_needs text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  update inbox_items set needs = nullif(left(trim(p_needs), 500), '')
  where id = p_inbox and trip_id = p_trip and status = 'new';
  if not found then raise exception 'inbox item not found or already handled'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'helper_inbox(uuid, text)', 'helper_files(uuid, text, uuid)',
    'helper_add_place(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text)',
    'helper_update_place(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text)',
    'helper_flag(uuid, text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inbox_files') then
    alter publication supabase_realtime add table public.inbox_files;
  end if;
end $$;

notify pgrst, 'reload schema';
