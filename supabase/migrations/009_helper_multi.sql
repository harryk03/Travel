-- 009: let the helper turn one inbox item (a slideshow or list post) into several places.
-- Additive only: one new function. The item stays open until the last place is added with helper_add_place.

create or replace function public.helper_add_more(p_trip uuid, p_token text, p_inbox uuid,
  p_name text, p_category text, p_address text, p_maps_url text, p_lat double precision, p_lng double precision,
  p_phone text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare src text; pid uuid;
begin
  perform helper_check(p_trip, p_token);
  select url into src from inbox_items where id = p_inbox and trip_id = p_trip and status in ('new', 'added');
  if src is null then raise exception 'inbox item not found or dismissed'; end if;
  insert into places (trip_id, name, category, address, maps_url, lat, lng, phone, notes, source_url, helper_added, created_by)
  values (p_trip, left(trim(p_name), 200), coalesce(nullif(p_category, ''), 'other'), nullif(trim(p_address), ''),
          nullif(p_maps_url, ''), p_lat, p_lng, nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), src, true, null)
  returning id into pid;
  return pid;
end $$;
revoke all on function public.helper_add_more(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text) from public;
grant execute on function public.helper_add_more(uuid, text, uuid, text, text, text, text, double precision, double precision, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
