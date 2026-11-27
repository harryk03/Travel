-- 012: photos on saved places. Members only; never on the share link (get_shared_trip is unchanged).
-- Photos are small JPEGs made on the phone (or by the helper), stored like inbox screenshots: up to 6 per place.
-- Additive only.

create table if not exists public.place_photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  place_id uuid not null references public.places on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data text not null check (length(data) between 100 and 700000),   -- base64, about 500 KB max
  thumb text not null check (length(thumb) between 50 and 40000),   -- small base64 preview for lists and the map
  source_url text check (source_url is null or (source_url ~* '^https?://' and length(source_url) <= 2048)),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists place_photos_place on public.place_photos (place_id, created_at);
alter table public.place_photos enable row level security;
drop policy if exists place_photos_select on public.place_photos;
drop policy if exists place_photos_insert on public.place_photos;
drop policy if exists place_photos_delete on public.place_photos;
create policy place_photos_select on public.place_photos for select to authenticated using (public.is_member(trip_id));
create policy place_photos_insert on public.place_photos for insert to authenticated with check (
  public.is_member(trip_id)
  and exists (select 1 from public.places p where p.id = place_id and p.trip_id = place_photos.trip_id)
  and (select count(*) from public.place_photos f where f.place_id = place_photos.place_id) < 6);
create policy place_photos_delete on public.place_photos for delete to authenticated using (public.is_member(trip_id));
revoke all on public.place_photos from anon;
revoke update on public.place_photos from authenticated;

-- Helper: add a cover photo, only to a place that has no photos yet (the same fill-the-blanks rule as 011).
create or replace function public.helper_add_photo(p_trip uuid, p_token text, p_place uuid, p_mime text, p_data text, p_thumb text, p_source text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  perform helper_check(p_trip, p_token);
  if not exists (select 1 from places where id = p_place and trip_id = p_trip) then raise exception 'place not found'; end if;
  if exists (select 1 from place_photos where place_id = p_place) then raise exception 'place already has photos'; end if;
  insert into place_photos (trip_id, place_id, mime, data, thumb, source_url, created_by)
  values (p_trip, p_place, p_mime, p_data, p_thumb, nullif(p_source, ''), null) returning id into pid;
  return pid;
end $$;
revoke all on function public.helper_add_photo(uuid, text, uuid, text, text, text, text) from public;
grant execute on function public.helper_add_photo(uuid, text, uuid, text, text, text, text) to anon, authenticated;

-- Helper: a yes/no key check, so the photo finder can tell the helper apart from strangers.
create or replace function public.helper_ping(p_trip uuid, p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  return true;
end $$;
revoke all on function public.helper_ping(uuid, text) from public;
grant execute on function public.helper_ping(uuid, text) to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'place_photos') then
    alter publication supabase_realtime add table public.place_photos;
  end if;
end $$;

notify pgrst, 'reload schema';
