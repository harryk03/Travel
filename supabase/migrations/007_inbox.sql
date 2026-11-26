-- 007: share-to-inbox for saved places. Additive only; get_shared_trip is unchanged.

create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  url text not null check (url ~* '^https?://' and length(url) <= 2048),
  source text not null default 'other' check (source in ('instagram', 'tiktok', 'other')),
  note text check (note is null or length(note) <= 500),
  caption text check (caption is null or length(caption) <= 2000),
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~* '^https?://'),
  status text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  place_id uuid references public.places on delete set null,
  created_at timestamptz not null default now(),
  constraint inbox_items_trip_url unique (trip_id, url)
);
create index if not exists inbox_items_trip_created on public.inbox_items (trip_id, created_at desc);

-- Members of the trip can read and update (status, place link). No insert or delete from the browser.
alter table public.inbox_items enable row level security;
drop policy if exists inbox_select on public.inbox_items;
drop policy if exists inbox_update on public.inbox_items;
create policy inbox_select on public.inbox_items for select to authenticated using (public.is_member(trip_id));
create policy inbox_update on public.inbox_items for update to authenticated
  using (public.is_member(trip_id)) with check (public.is_member(trip_id));
revoke all on public.inbox_items from anon;
revoke insert, delete on public.inbox_items from authenticated;

-- The share endpoint's secret, stored only as a SHA-256 hash. No policies and no grants: invisible to the API.
create table if not exists public.inbox_secrets (
  trip_id uuid primary key references public.trips on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$')
);
alter table public.inbox_secrets enable row level security;
revoke all on public.inbox_secrets from anon, authenticated;

-- The only way in: checks the secret, then adds one row. Returns 'saved' or 'exists'.
create or replace function public.inbox_add(p_trip uuid, p_token text, p_url text, p_source text,
                                            p_note text, p_caption text, p_thumb text)
returns text language plpgsql security definer set search_path = public as $$
declare h text;
begin
  select token_hash into h from inbox_secrets where trip_id = p_trip;
  if h is null or p_token is null or length(p_token) < 32
     or h <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception 'not allowed';
  end if;
  insert into inbox_items (trip_id, url, source, note, caption, thumbnail_url)
  values (p_trip, p_url, coalesce(nullif(p_source, ''), 'other'), nullif(trim(p_note), ''),
          nullif(left(trim(p_caption), 2000), ''), nullif(p_thumb, ''))
  on conflict (trip_id, url) do nothing;
  return case when found then 'saved' else 'exists' end;
end $$;
revoke all on function public.inbox_add(uuid, text, text, text, text, text, text) from public;
grant execute on function public.inbox_add(uuid, text, text, text, text, text, text) to anon, authenticated;

-- A place remembers the post it came from (members only; not in get_shared_trip).
alter table public.places add column if not exists source_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'places_source_url_http') then
    alter table public.places add constraint places_source_url_http check (source_url is null or source_url ~* '^https?://');
  end if;
end $$;

-- Live updates
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inbox_items') then
    alter publication supabase_realtime add table public.inbox_items;
  end if;
end $$;

notify pgrst, 'reload schema';
