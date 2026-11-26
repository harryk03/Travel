-- Per-plan visibility and traveller-to-account linking. Run once in the Supabase SQL editor.
-- items.visible_to: null = everyone in the trip; otherwise only members whose account is linked to one of these travellers.

alter table public.items add column if not exists visible_to uuid[];

create or replace function public.can_see_item(t uuid, vis uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(t) and (
    vis is null or exists (select 1 from travellers v where v.trip_id = t and v.user_id = auth.uid() and v.id = any(vis))
  );
$$;

drop policy if exists items_all on public.items;
drop policy if exists items_select on public.items;
drop policy if exists items_insert on public.items;
drop policy if exists items_update on public.items;
drop policy if exists items_delete on public.items;
create policy items_select on public.items for select to authenticated using (public.can_see_item(trip_id, visible_to));
create policy items_insert on public.items for insert to authenticated with check (public.is_member(trip_id));
create policy items_update on public.items for update to authenticated
  using (public.can_see_item(trip_id, visible_to)) with check (public.is_member(trip_id));
create policy items_delete on public.items for delete to authenticated using (public.can_see_item(trip_id, visible_to));

-- Only the owner (or the trip's own functions) may attach a traveller to an account; otherwise a member could
-- claim someone else's name and see their restricted plans.
-- Runs as the caller (not security definer) so current_user tells direct API edits apart from the trip's own functions.
create or replace function public.guard_traveller_account() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and new.user_id is distinct from
       (case when tg_op = 'UPDATE' then old.user_id else null end)
     and not public.is_owner(new.trip_id) then
    raise exception 'Only the trip owner can link travellers to accounts';
  end if;
  return new;
end $$;
drop trigger if exists travellers_account_guard on public.travellers;
create trigger travellers_account_guard before insert or update on public.travellers
  for each row execute function public.guard_traveller_account();

-- Link a traveller to a member's account. If that member already has another traveller entry in the trip
-- (e.g. created when they joined), merge it in: expenses, splits and plan visibility move across.
create or replace function public.link_traveller(p_traveller uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t uuid; dup uuid;
begin
  select trip_id into t from travellers where id = p_traveller;
  if t is null then raise exception 'traveller not found'; end if;
  if auth.uid() is not null and not public.is_owner(t) then raise exception 'Only the trip owner can link travellers'; end if;
  if not exists (select 1 from trip_members where trip_id = t and user_id = p_user) then raise exception 'That account is not in this trip'; end if;
  update travellers set user_id = null where trip_id = t and user_id = p_user and id <> p_traveller returning id into dup;
  if dup is not null then
    update expenses set paid_by = p_traveller where trip_id = t and paid_by = dup;
    update expenses set shares = replace(shares::text, dup::text, p_traveller::text)::jsonb
      where trip_id = t and shares::text like '%' || dup::text || '%';
    update items set visible_to = array_replace(visible_to, dup, p_traveller) where trip_id = t and dup = any(visible_to);
    delete from travellers where id = dup;
  end if;
  update travellers set user_id = p_user where id = p_traveller;
end $$;
revoke all on function public.link_traveller(uuid, uuid) from public, anon;
grant execute on function public.link_traveller(uuid, uuid) to authenticated;

-- Joining links you to an existing traveller with the same first name, instead of creating a duplicate.
create or replace function public.join_trip(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid; tid uuid; nm text := coalesce(nullif(trim(p_display_name), ''), 'Traveller');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into t from trips where invite_code = lower(trim(p_code));
  if t is null then raise exception 'invalid invite code'; end if;
  insert into trip_members (trip_id, user_id, role, display_name)
    values (t, auth.uid(), 'member', nm)
    on conflict (trip_id, user_id) do nothing;
  if not exists (select 1 from travellers where trip_id = t and user_id = auth.uid()) then
    select id into tid from travellers
     where trip_id = t and user_id is null and lower(split_part(name, ' ', 1)) = lower(split_part(nm, ' ', 1))
     order by created_at limit 1;
    if tid is not null then
      update travellers set user_id = auth.uid() where id = tid;
    else
      insert into travellers (trip_id, name, user_id) values (t, nm, auth.uid());
    end if;
  end if;
  return t;
end $$;
revoke all on function public.join_trip(text, text) from public, anon;
grant execute on function public.join_trip(text, text) to authenticated;

-- Share link: restricted plans never appear.
create or replace function public.get_shared_trip(p_token uuid)
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
      from items i where i.trip_id = t.id and i.visible_to is null), '[]'::jsonb)
  )
  from trips t
  where t.share_token = p_token and t.share_enabled;
$$;
revoke all on function public.get_shared_trip(uuid) from public;
grant execute on function public.get_shared_trip(uuid) to anon, authenticated;
