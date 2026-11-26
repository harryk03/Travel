-- Local security test. Run against a scratch Postgres with supabase/test/auth_stub.sql loaded first.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- owner
  ('00000000-0000-0000-0000-00000000000b'),  -- member
  ('00000000-0000-0000-0000-00000000000c');  -- outsider

-- Owner creates trip
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select create_trip('Bali', 'Bali', '2026-12-01', '2026-12-10', 'Alex', false) as trip_id \gset
insert into items (trip_id, day, kind, title, status, notes, private_notes, booking_ref)
  values (:'trip_id', '2026-12-01', 'stay', 'Villa', 'confirmed', 'public note', 'door code 1234', 'BK-999');
insert into expenses (trip_id, amount, currency, paid_by, shares)
  select :'trip_id', 100, 'AUD', id, '[]' from travellers where trip_id = :'trip_id';
select invite_code, share_token from trips where id = :'trip_id' \gset

-- Outsider sees nothing and cannot write
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  if (select count(*) from trips) <> 0 then raise exception 'FAIL outsider sees trip'; end if;
  if (select count(*) from items) <> 0 then raise exception 'FAIL outsider sees items'; end if;
  if (select count(*) from expenses) <> 0 then raise exception 'FAIL outsider sees expenses'; end if;
end $$;
do $$ begin
  begin
    insert into items (trip_id, day, title) select id, current_date, 'x' from trips limit 1;
  exception when others then null; end;
end $$;

-- Member joins with code, can edit items, cannot change sharing or roles
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select join_trip(:'invite_code', 'Sam');
update items set title = 'Villa Sunset' where trip_id = :'trip_id';
update trips set share_enabled = false where id = :'trip_id';
update trip_members set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from items where title = 'Villa Sunset') <> 1 then raise exception 'FAIL member cannot edit'; end if;
  if (select count(*) from expenses) <> 1 then raise exception 'FAIL member cannot see expenses'; end if;
  if not (select share_enabled from trips limit 1) then raise exception 'FAIL member changed sharing'; end if;
  if (select role from trip_members where user_id = '00000000-0000-0000-0000-00000000000b') <> 'member' then raise exception 'FAIL member self-promoted'; end if;
end $$;

-- Anonymous: no table access, share function returns whitelisted fields only
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform 1 from items;
    raise exception 'FAIL anon read items';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from expenses;
    raise exception 'FAIL anon read expenses';
  exception when insufficient_privilege then null; end;
end $$;
select get_shared_trip(:'share_token')::text as shared \gset
do $$ declare s text := current_setting('my.shared', true); begin end $$;
select
  case when :'shared' like '%door code%' or :'shared' like '%BK-999%' or :'shared' like '%private_notes%'
         or :'shared' like '%booking_ref%' or :'shared' like '%Alex%' or :'shared' like '%invite%'
         or :'shared' like '%expense%' or :'shared' like '%amount%'
       then 'FAIL' else 'ok' end as leak_check,
  case when :'shared' like '%public note%' and :'shared' like '%Villa Sunset%' then 'ok' else 'FAIL' end as content_check
\gset
\echo leak_check=:leak_check content_check=:content_check
select case when get_shared_trip(gen_random_uuid()) is null then 'ok' else 'FAIL' end as bad_token \gset
\echo bad_token=:bad_token

-- Owner disables sharing -> link stops working
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update trips set share_enabled = false where id = :'trip_id';
reset role;
set role anon;
select case when get_shared_trip(:'share_token') is null then 'ok' else 'FAIL' end as disabled \gset
\echo disabled=:disabled
