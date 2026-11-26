-- Permission-boundary tests from four perspectives: owner, travelling member, outsider (signed in, not in
-- the trip), anonymous visitor (share-link friend). Run on a scratch database after auth_stub.sql,
-- schema.sql and migrations. Synthetic data only. Stops at the first failure.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema if not exists t;
grant usage on schema t to anon, authenticated;
create or replace function t.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', name; else raise exception 'FAIL  %', name; end if;
end $$;
-- Expect a statement to be rejected (any error). Runs with the caller's role.
create or replace function t.rejects(stmt text, name text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS  % (rejected: %)', name, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % (was allowed)', name;
end $$;
create or replace function t.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- owner A
  ('00000000-0000-0000-0000-0000000000b2'),  -- member B
  ('00000000-0000-0000-0000-0000000000c3'),  -- outsider C
  ('00000000-0000-0000-0000-0000000000d4');  -- removed member D

\set A '00000000-0000-0000-0000-0000000000a1'
\set B '00000000-0000-0000-0000-0000000000b2'
\set C '00000000-0000-0000-0000-0000000000c3'
\set D '00000000-0000-0000-0000-0000000000d4'

----------------------------------------------------------------------------- setup
set role authenticated;
select t.as_user(:'A');
select create_trip('T1', 'Bali', '2026-12-01', '2026-12-10', 'Alex', false) as t1 \gset
insert into items (trip_id, day, kind, title, notes, private_notes, booking_ref)
  values (:'t1', '2026-12-01', 'stay', 'Villa', 'public note', 'gate code 4321', 'BOOK-777');
insert into places (trip_id, name) values (:'t1', 'Cafe');
insert into expenses (trip_id, amount, currency, paid_by, shares)
  select :'t1', 100, 'AUD', id, '[]' from travellers where trip_id = :'t1';
select invite_code as code1, share_token as tok1 from trips where id = :'t1' \gset

select t.as_user(:'C');
select create_trip('T2 (outsider own trip)', 'Elsewhere', null, null, 'Casey', false) as t2 \gset
insert into items (trip_id, day, title) values (:'t2', '2026-12-01', 'C item') returning id as c_item \gset

select t.as_user(:'B');
select join_trip(:'code1', 'Ben');
select t.as_user(:'D');
select join_trip(:'code1', 'Dan');
select t.as_user(:'A');
delete from trip_members where trip_id = :'t1' and user_id = :'D';

select set_config('x.t1', :'t1', false), set_config('x.t2', :'t2', false), set_config('x.tok1', :'tok1', false),
       set_config('x.code1', :'code1', false), set_config('x.c_item', :'c_item', false);

----------------------------------------------------------------------------- outsider C
\echo '== Outsider (signed in, not a member)'
select t.as_user(:'C');
do $$ declare t1 uuid := current_setting('x.t1');
begin
  perform t.ok((select count(*) from trips where id = t1) = 0, 'outsider cannot see trip');
  perform t.ok((select count(*) from trip_members where trip_id = t1) = 0, 'outsider cannot see members');
  perform t.ok((select count(*) from travellers where trip_id = t1) = 0, 'outsider cannot see travellers');
  perform t.ok((select count(*) from items where trip_id = t1) = 0, 'outsider cannot see items');
  perform t.ok((select count(*) from places where trip_id = t1) = 0, 'outsider cannot see places');
  perform t.ok((select count(*) from expenses where trip_id = t1) = 0, 'outsider cannot see expenses');
  perform t.ok(not is_member(t1), 'is_member() is false for outsider');
  update items set title = 'hacked' where trip_id = t1;
  delete from items where trip_id = t1;
  delete from trips where id = t1;
  update trips set share_enabled = false where id = t1;
end $$;
select t.rejects(format('insert into items (trip_id, day, title) values (%L, current_date, %L)', current_setting('x.t1'), 'x'), 'outsider cannot add item by guessing trip id');
select t.rejects(format('insert into trip_members (trip_id, user_id, role) values (%L, %L, %L)', current_setting('x.t1'), :'C', 'owner'), 'outsider cannot insert themselves as owner');
select t.rejects(format('update items set trip_id = %L where id = %L', current_setting('x.t1'), current_setting('x.c_item')), 'outsider cannot move own item into victim trip');
select t.rejects(format('insert into travellers (trip_id, name) values (%L, %L)', current_setting('x.t1'), 'x'), 'outsider cannot add traveller');
select t.rejects($$select join_trip('0000000000', 'Casey')$$, 'wrong invite code rejected');

----------------------------------------------------------------------------- member B
\echo '== Travelling member'
select t.as_user(:'B');
do $$ declare t1 uuid := current_setting('x.t1');
begin
  perform t.ok((select count(*) from items where trip_id = t1) = 1, 'member sees itinerary');
  perform t.ok((select count(*) from expenses where trip_id = t1) = 1, 'member sees expenses');
  perform t.ok((select count(*) from trips where id = current_setting('x.t2')::uuid) = 0, 'member cannot see other trips');
  update trips set share_enabled = false, invite_code = 'aaaaaaaaaa', share_token = gen_random_uuid(), name = 'pwned' where id = t1;
  update trip_members set role = 'owner' where trip_id = t1;
  delete from trip_members where trip_id = t1 and role = 'owner';
  delete from trips where id = t1;
end $$;
select t.rejects(format('insert into trip_members (trip_id, user_id, role) values (%L, %L, %L)', current_setting('x.t1'), :'C', 'member'), 'member cannot add other users directly');
select t.rejects(format('update items set trip_id = %L where trip_id = %L', current_setting('x.t2'), current_setting('x.t1')), 'member cannot move items to a trip they are not in');
select join_trip(current_setting('x.code1'), 'Ben again');
reset role;
do $$ declare t1 uuid := current_setting('x.t1');
begin
  perform t.ok((select share_enabled and name = 'T1' and invite_code = current_setting('x.code1') from trips where id = t1), 'member cannot change trip settings, sharing or invite');
  perform t.ok((select role from trip_members where trip_id = t1 and user_id = '00000000-0000-0000-0000-0000000000b2') = 'member', 'member cannot promote self (direct update or re-join)');
  perform t.ok((select count(*) from trip_members where trip_id = t1 and role = 'owner') = 1, 'member cannot remove owner');
  perform t.ok((select count(*) from trips where id = t1) = 1, 'member cannot delete trip');
end $$;
set role authenticated;
select t.as_user(:'B');
select t.rejects(format('update items set maps_url = %L where trip_id = %L', 'javascript:alert(document.cookie)', current_setting('x.t1')), 'javascript: map link rejected (items)');
select t.rejects(format('insert into places (trip_id, name, maps_url) values (%L, %L, %L)', current_setting('x.t1'), 'x', 'data:text/html,<script>alert(1)</script>'), 'data: map link rejected (places)');

----------------------------------------------------------------------------- removed member D
\echo '== Removed member'
select t.as_user(:'D');
do $$ begin
  perform t.ok((select count(*) from items where trip_id = current_setting('x.t1')::uuid) = 0, 'removed member loses access');
  perform t.ok((select count(*) from expenses where trip_id = current_setting('x.t1')::uuid) = 0, 'removed member cannot see expenses');
end $$;

----------------------------------------------------------------------------- owner A
\echo '== Owner'
select t.as_user(:'A');
select t.rejects(format('update trips set invite_code = %L where id = %L', 'abc', current_setting('x.t1')), 'weak invite code rejected');
update trips set invite_code = encode(gen_random_bytes(5), 'hex'), share_token = gen_random_uuid() where id = :'t1';
select t.as_user(:'D');
select t.rejects(format('select join_trip(%L, %L)', current_setting('x.code1'), 'Dan'), 'old invite code stops working after rotation');

----------------------------------------------------------------------------- anonymous / share-link friend
\echo '== Anonymous visitor / external friend'
reset role;
select share_token as tok2 from trips where id = :'t1' \gset
set role anon;
select t.as_user('');
select t.rejects('select * from trips', 'anon cannot read trips');
select t.rejects('select * from trip_members', 'anon cannot read members');
select t.rejects('select * from travellers', 'anon cannot read travellers');
select t.rejects('select * from places', 'anon cannot read places');
select t.rejects('select * from items', 'anon cannot read items');
select t.rejects('select * from expenses', 'anon cannot read expenses');
select t.rejects('insert into items (trip_id, day, title) values (gen_random_uuid(), current_date, $x$x$x$)', 'anon cannot write');
select t.rejects($$select create_trip('x', 'x', null, null, 'x', false)$$, 'anon cannot create trips');
select t.rejects(format('select join_trip(%L, %L)', current_setting('x.code1'), 'x'), 'anon cannot join');
select get_shared_trip(:'tok2')::text as shared \gset
select set_config('x.shared', :'shared', false);
do $$ declare s jsonb := current_setting('x.shared')::jsonb;
  item_keys text[]; trip_keys text[];
begin
  select array_agg(k order by k) into trip_keys from jsonb_object_keys(s->'trip') k;
  select array_agg(distinct k order by k) into item_keys from jsonb_array_elements(s->'items') e, jsonb_object_keys(e) k;
  perform t.ok(trip_keys = array['destination','end_date','is_example','name','start_date'], 'share trip fields are whitelist only: ' || array_to_string(trip_keys, ','));
  perform t.ok(item_keys = array['address','day','end_day','end_time','id','kind','lat','lng','location_name','maps_url','notes','position','start_time','status','title'],
               'share item fields are whitelist only (no private_notes, booking_ref, created_by)');
  perform t.ok(s::text not like '%gate code%' and s::text not like '%BOOK-777%' and s::text not like '%Alex%' and s::text not like '%Ben%', 'no private notes, refs or names in share payload');
  perform t.ok(s ? 'trip' and not s ? 'expenses' and not s ? 'members' and not s ? 'travellers' and not s ? 'places', 'share payload has no expenses, members, travellers or places');
end $$;
select t.ok(get_shared_trip(:'tok1') is null, 'old share link stops working after rotation');
select t.ok(get_shared_trip(gen_random_uuid()) is null, 'random share token returns nothing');
select t.ok(not is_member(:'t1'), 'is_member() false for anon');

reset role;
update trips set share_enabled = false where id = :'t1';
set role anon;
select t.ok(get_shared_trip(:'tok2') is null, 'share link off -> nothing returned');
reset role;

----------------------------------------------------------------------------- static checks
\echo '== Static checks'
do $$ begin
  perform t.ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'RLS on every public table');
  perform t.ok(not exists (select 1 from pg_policies where schemaname = 'public' and 'anon' = any(roles)), 'no policies grant anything to anon');
  perform t.ok(not exists (select 1 from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')), 'no always-true policies');
  perform t.ok(not exists (select 1 from pg_views where schemaname = 'public'), 'no views that could bypass RLS');
  perform t.ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
    'every security-definer function pins search_path');
  perform t.ok(not has_function_privilege('anon', 'public.create_trip(text,text,date,date,text,boolean)', 'execute')
           and not has_function_privilege('anon', 'public.join_trip(text,text)', 'execute'), 'anon cannot execute create/join');
end $$;
\echo ALL TESTS PASSED
