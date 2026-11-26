-- Trip planner schema for Supabase (Postgres).
-- Run ONCE in the Supabase SQL editor on a new project.
-- Security model:
--   * Signed-in trip members (owner/member) can read and edit their trip's data (row level security).
--   * Only owners can change trip settings, sharing, and member roles.
--   * Anonymous visitors can read NOTHING from tables. The public share link goes through
--     get_shared_trip(), which returns a fixed whitelist of fields: no expenses, travellers,
--     member details, private notes or booking references.

create extension if not exists pgcrypto;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  destination text,
  start_date date,
  end_date date,
  is_example boolean not null default false,
  invite_code text not null unique default encode(gen_random_bytes(5), 'hex'),
  share_token uuid not null unique default gen_random_uuid(),
  share_enabled boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.trip_members (
  trip_id uuid not null references public.trips on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null default 'Traveller',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- People in the trip for expense splitting. May or may not have an account.
create table public.travellers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  name text not null check (length(name) between 1 and 60),
  user_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index on public.travellers (trip_id);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  name text not null check (length(name) between 1 and 200),
  category text not null default 'other'
    check (category in ('gym','cafe','restaurant','stay','beach_club','nightlife','activity','other')),
  address text,
  maps_url text,
  lat double precision,
  lng double precision,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.places (trip_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  day date not null,
  end_day date,                      -- check-out day for stays
  kind text not null default 'activity'
    check (kind in ('flight','stay','activity','event','food','transport','other')),
  title text not null check (length(title) between 1 and 200),
  start_time time,
  end_time time,
  status text not null default 'tentative' check (status in ('confirmed','tentative')),
  location_name text,
  address text,
  maps_url text,
  lat double precision,
  lng double precision,
  place_id uuid references public.places on delete set null,
  notes text,                        -- visible on the public share link
  private_notes text,                -- members only
  booking_ref text,                  -- members only
  position double precision not null default 0,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint stay_dates check (end_day is null or end_day >= day)
);
create index on public.items (trip_id, day);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  kind text not null default 'expense' check (kind in ('expense','repayment')),
  description text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('AUD','IDR')),
  paid_by uuid not null references public.travellers on delete restrict,
  split_type text not null default 'equal' check (split_type in ('equal','custom')),
  shares jsonb not null default '[]'::jsonb,   -- [{ "traveller_id": uuid, "amount": number }]
  spent_on date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint shares_is_array check (jsonb_typeof(shares) = 'array')
);
create index on public.expenses (trip_id);

-- Membership helpers (security definer so policies don't recurse into trip_members RLS).
create function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = t and user_id = auth.uid());
$$;

create function public.is_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = t and user_id = auth.uid() and role = 'owner');
$$;

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.travellers enable row level security;
alter table public.places enable row level security;
alter table public.items enable row level security;
alter table public.expenses enable row level security;

create policy trips_select on public.trips for select to authenticated using (public.is_member(id));
create policy trips_update on public.trips for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy trips_delete on public.trips for delete to authenticated using (public.is_owner(id));

create policy members_select on public.trip_members for select to authenticated using (public.is_member(trip_id));
create policy members_update on public.trip_members for update to authenticated
  using (public.is_owner(trip_id)) with check (public.is_owner(trip_id));
create policy members_delete on public.trip_members for delete to authenticated
  using (public.is_owner(trip_id) or user_id = auth.uid());

-- Shared editable data: any member.
create policy travellers_all on public.travellers for all to authenticated using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy places_all on public.places for all to authenticated using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy items_all on public.items for all to authenticated using (public.is_member(trip_id)) with check (public.is_member(trip_id));
create policy expenses_all on public.expenses for all to authenticated using (public.is_member(trip_id)) with check (public.is_member(trip_id));

-- Belt and braces: anonymous role gets no direct table access at all.
revoke all on public.trips, public.trip_members, public.travellers, public.places, public.items, public.expenses from anon;

-- Create a trip and make the caller its owner and first traveller.
create function public.create_trip(p_name text, p_destination text, p_start date, p_end date, p_display_name text, p_example boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into trips (name, destination, start_date, end_date, is_example, created_by)
    values (p_name, p_destination, p_start, p_end, coalesce(p_example, false), auth.uid()) returning id into t;
  insert into trip_members (trip_id, user_id, role, display_name) values (t, auth.uid(), 'owner', coalesce(nullif(p_display_name, ''), 'Owner'));
  insert into travellers (trip_id, name, user_id) values (t, coalesce(nullif(p_display_name, ''), 'Owner'), auth.uid());
  return t;
end $$;

-- Join with an invite code as a travelling member.
create function public.join_trip(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into t from trips where invite_code = lower(trim(p_code));
  if t is null then raise exception 'invalid invite code'; end if;
  insert into trip_members (trip_id, user_id, role, display_name)
    values (t, auth.uid(), 'member', coalesce(nullif(p_display_name, ''), 'Traveller'))
    on conflict (trip_id, user_id) do nothing;
  if not exists (select 1 from travellers where trip_id = t and user_id = auth.uid()) then
    insert into travellers (trip_id, name, user_id) values (t, coalesce(nullif(p_display_name, ''), 'Traveller'), auth.uid());
  end if;
  return t;
end $$;

-- Public read-only view for external friends. Whitelisted fields only.
create function public.get_shared_trip(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trip', jsonb_build_object('name', t.name, 'destination', t.destination,
                               'start_date', t.start_date, 'end_date', t.end_date, 'is_example', t.is_example),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'day', i.day, 'end_day', i.end_day, 'kind', i.kind, 'title', i.title,
        'start_time', i.start_time, 'end_time', i.end_time, 'status', i.status,
        'location_name', i.location_name, 'address', i.address, 'maps_url', i.maps_url,
        'lat', i.lat, 'lng', i.lng, 'notes', i.notes, 'position', i.position)
        order by i.day, i.position)
      from items i where i.trip_id = t.id), '[]'::jsonb)
  )
  from trips t
  where t.share_token = p_token and t.share_enabled;
$$;

revoke all on function public.get_shared_trip(uuid) from public;
grant execute on function public.get_shared_trip(uuid) to anon, authenticated;
revoke all on function public.create_trip(text, text, date, date, text, boolean) from public, anon;
grant execute on function public.create_trip(text, text, date, date, text, boolean) to authenticated;
revoke all on function public.join_trip(text, text) from public, anon;
grant execute on function public.join_trip(text, text) to authenticated;

-- Live updates for travelling members (Supabase Realtime respects RLS).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trips, public.trip_members, public.travellers, public.places, public.items, public.expenses;
  end if;
end $$;
