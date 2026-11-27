-- 010: place websites, a Spa category, and custom categories (your own emoji and name).
-- Additive: three optional columns, a wider category list, and the helper functions gain optional
-- website / custom-category inputs. Existing places are unchanged. Places are never on the share link.

alter table public.places add column if not exists website text;
alter table public.places add column if not exists custom_emoji text;
alter table public.places add column if not exists custom_label text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'places_website_http') then
    alter table public.places add constraint places_website_http
      check (website is null or (website ~* '^https?://' and length(website) <= 2048));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'places_custom_ok') then
    alter table public.places add constraint places_custom_ok check (
      (custom_emoji is null or length(custom_emoji) between 1 and 16)
      and (custom_label is null or length(custom_label) between 1 and 40)
      and (category <> 'custom' or (custom_emoji is not null and custom_label is not null)));
  end if;
end $$;

-- Category list: the same as before plus 'spa' and 'custom'. Every existing place still fits.
alter table public.places drop constraint if exists places_category_check;
alter table public.places add constraint places_category_check check (category in
  ('gym', 'cafe', 'restaurant', 'stay', 'beach_club', 'nightlife', 'activity', 'spa', 'other', 'custom'));

-- Helper functions: same rules as 008/009, plus optional website and custom category.
drop function if exists public.helper_add_place(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text);
drop function if exists public.helper_add_more(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text);
drop function if exists public.helper_update_place(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text);

create or replace function public.helper_add_place(p_trip uuid, p_token text, p_inbox uuid,
  p_name text, p_category text, p_address text, p_maps_url text, p_lat double precision, p_lng double precision,
  p_phone text, p_notes text, p_website text default null, p_custom_emoji text default null, p_custom_label text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare src text; pid uuid;
begin
  perform helper_check(p_trip, p_token);
  select url into src from inbox_items where id = p_inbox and trip_id = p_trip and status = 'new' for update;
  if src is null then raise exception 'inbox item not found or already handled'; end if;
  insert into places (trip_id, name, category, address, maps_url, lat, lng, phone, notes, source_url, website, custom_emoji, custom_label, helper_added, created_by)
  values (p_trip, left(trim(p_name), 200), coalesce(nullif(p_category, ''), 'other'), nullif(trim(p_address), ''),
          nullif(p_maps_url, ''), p_lat, p_lng, nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), src,
          nullif(trim(p_website), ''), nullif(trim(p_custom_emoji), ''), nullif(trim(p_custom_label), ''), true, null)
  returning id into pid;
  update inbox_items set status = 'added', place_id = pid, needs = null where id = p_inbox;
  return pid;
end $$;

create or replace function public.helper_add_more(p_trip uuid, p_token text, p_inbox uuid,
  p_name text, p_category text, p_address text, p_maps_url text, p_lat double precision, p_lng double precision,
  p_phone text, p_notes text, p_website text default null, p_custom_emoji text default null, p_custom_label text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare src text; pid uuid;
begin
  perform helper_check(p_trip, p_token);
  select url into src from inbox_items where id = p_inbox and trip_id = p_trip and status in ('new', 'added');
  if src is null then raise exception 'inbox item not found or dismissed'; end if;
  insert into places (trip_id, name, category, address, maps_url, lat, lng, phone, notes, source_url, website, custom_emoji, custom_label, helper_added, created_by)
  values (p_trip, left(trim(p_name), 200), coalesce(nullif(p_category, ''), 'other'), nullif(trim(p_address), ''),
          nullif(p_maps_url, ''), p_lat, p_lng, nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), src,
          nullif(trim(p_website), ''), nullif(trim(p_custom_emoji), ''), nullif(trim(p_custom_label), ''), true, null)
  returning id into pid;
  return pid;
end $$;

create or replace function public.helper_update_place(p_trip uuid, p_token text, p_place uuid,
  p_name text, p_category text, p_address text, p_maps_url text, p_lat double precision, p_lng double precision,
  p_phone text, p_notes text, p_website text default null, p_custom_emoji text default null, p_custom_label text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  update places set
    name = coalesce(nullif(left(trim(p_name), 200), ''), name),
    category = coalesce(nullif(p_category, ''), category),
    address = coalesce(nullif(trim(p_address), ''), address),
    maps_url = coalesce(nullif(p_maps_url, ''), maps_url),
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    notes = coalesce(nullif(trim(p_notes), ''), notes),
    website = coalesce(nullif(trim(p_website), ''), website),
    custom_emoji = coalesce(nullif(trim(p_custom_emoji), ''), custom_emoji),
    custom_label = coalesce(nullif(trim(p_custom_label), ''), custom_label)
  where id = p_place and trip_id = p_trip and helper_added;
  if not found then raise exception 'place not found or not added by the helper'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'helper_add_place(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text, text, text, text)',
    'helper_add_more(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text, text, text, text)',
    'helper_update_place(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text, text, text, text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
