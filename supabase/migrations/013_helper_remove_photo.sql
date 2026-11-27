-- 013: let the helper remove photos IT added (never ones a person added), so it can swap a poor cover for a better one.
-- Additive only.
create or replace function public.helper_remove_photo(p_trip uuid, p_token text, p_photo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  delete from place_photos where id = p_photo and trip_id = p_trip and created_by is null;
  if not found then raise exception 'photo not found or not added by the helper'; end if;
end $$;
revoke all on function public.helper_remove_photo(uuid, text, uuid) from public;
grant execute on function public.helper_remove_photo(uuid, text, uuid) to anon, authenticated;

-- The helper's photo list for a place (ids, sizes and where they came from, not the images), to see what it added.
create or replace function public.helper_photos(p_trip uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform helper_check(p_trip, p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'place_id', place_id, 'source_url', source_url,
    'by_helper', created_by is null, 'bytes', length(data)) order by created_at) from place_photos where trip_id = p_trip), '[]'::jsonb);
end $$;
revoke all on function public.helper_photos(uuid, text) from public;
grant execute on function public.helper_photos(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
