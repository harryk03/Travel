-- 011: let the helper fill in EMPTY fields on any place in the trip, including places you added.
-- It can set an address, pin, Google Maps link, phone, website or notes only where that field is blank.
-- It never overwrites anything already there, and can't rename, recategorise or delete. Additive only.

create or replace function public.helper_fill_place(p_trip uuid, p_token text, p_place uuid,
  p_address text default null, p_maps_url text default null, p_lat double precision default null, p_lng double precision default null,
  p_phone text default null, p_website text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p places; filled text[] := '{}';
begin
  perform helper_check(p_trip, p_token);
  select * into p from places where id = p_place and trip_id = p_trip for update;
  if p.id is null then raise exception 'place not found'; end if;
  if nullif(trim(p.address), '') is null and nullif(trim(p_address), '') is not null then p.address := left(trim(p_address), 300); filled := array_append(filled, 'address'); end if;
  if p.maps_url is null and nullif(p_maps_url, '') is not null then p.maps_url := p_maps_url; filled := array_append(filled, 'maps_url'); end if;
  if p.lat is null and p.lng is null and p_lat is not null and p_lng is not null then p.lat := p_lat; p.lng := p_lng; filled := array_append(filled, 'pin'); end if;
  if p.phone is null and nullif(trim(p_phone), '') is not null then p.phone := trim(p_phone); filled := array_append(filled, 'phone'); end if;
  if p.website is null and nullif(trim(p_website), '') is not null then p.website := trim(p_website); filled := array_append(filled, 'website'); end if;
  if nullif(trim(p.notes), '') is null and nullif(trim(p_notes), '') is not null then p.notes := left(trim(p_notes), 2000); filled := array_append(filled, 'notes'); end if;
  update places set address = p.address, maps_url = p.maps_url, lat = p.lat, lng = p.lng, phone = p.phone, website = p.website, notes = p.notes
  where id = p.id;
  return to_jsonb(filled);
end $$;
revoke all on function public.helper_fill_place(uuid, text, uuid, text, text, double precision, double precision, text, text, text) from public;
grant execute on function public.helper_fill_place(uuid, text, uuid, text, text, double precision, double precision, text, text, text) to anon, authenticated;

-- The helper's inbox read also lists each place's address, pin, phone and website, so it can see what's empty.
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
        'helper_added', p.helper_added, 'address', p.address, 'lat', p.lat, 'lng', p.lng, 'phone', p.phone,
        'website', p.website, 'maps_url', p.maps_url, 'has_notes', nullif(trim(p.notes), '') is not null) order by p.name)
      from places p where p.trip_id = p_trip), '[]'::jsonb));
end $$;

notify pgrst, 'reload schema';
