-- 014: the helper may add up to 6 photos to a place, as long as every photo already there was added by the helper.
-- Places with any photo YOU added stay yours: the helper still can't add to them. Additive only.
create or replace function public.helper_add_photo(p_trip uuid, p_token text, p_place uuid, p_mime text, p_data text, p_thumb text, p_source text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  perform helper_check(p_trip, p_token);
  if not exists (select 1 from places where id = p_place and trip_id = p_trip) then raise exception 'place not found'; end if;
  if exists (select 1 from place_photos where place_id = p_place and created_by is not null) then raise exception 'place has photos you added'; end if;
  if (select count(*) from place_photos where place_id = p_place) >= 6 then raise exception 'place already has 6 photos'; end if;
  insert into place_photos (trip_id, place_id, mime, data, thumb, source_url, created_by)
  values (p_trip, p_place, p_mime, p_data, p_thumb, nullif(p_source, ''), null) returning id into pid;
  return pid;
end $$;
notify pgrst, 'reload schema';
