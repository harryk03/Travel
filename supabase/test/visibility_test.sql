-- Tests for migration 003 (per-plan visibility + traveller linking). Run after schema, 002, 003 and attack_test helpers.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create schema if not exists t;
grant usage on schema t to anon, authenticated;
create or replace function t.ok(cond boolean, name text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS  %', name; else raise exception 'FAIL  %', name; end if; end $$;
create or replace function t.rejects(stmt text, name text) returns void language plpgsql as $$
begin begin execute stmt; exception when others then raise notice 'PASS  % (rejected: %)', name, sqlerrm; return; end;
raise exception 'FAIL  % (was allowed)', name; end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id) values ('10000000-0000-0000-0000-0000000000a1'), ('10000000-0000-0000-0000-0000000000b2'),
  ('10000000-0000-0000-0000-0000000000c3'), ('10000000-0000-0000-0000-0000000000d4');
-- owner Harry (a1), Adem (b2) joins, Jasmine (c3) joins, Rob (d4) joins as "Rob D"
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000a1', false);
select create_trip('V', 'Bali', '2026-12-23', '2027-01-05', 'Harry', false) as trip \gset
insert into travellers (trip_id, name) values (:'trip', 'Adem'), (:'trip', 'Abel'), (:'trip', 'Robert'), (:'trip', 'Jasmine');
select invite_code as code from trips where id = :'trip' \gset
select id as harry from travellers where name = 'Harry' \gset
select id as adem from travellers where name = 'Adem' \gset
select id as abel from travellers where name = 'Abel' \gset
select id as robert from travellers where name = 'Robert' \gset
insert into items (trip_id, day, kind, title, booking_ref, visible_to) values
  (:'trip', '2026-12-23', 'flight', 'Flight out', 'PNR-SECRET', array[:'harry', :'adem', :'abel']::uuid[]);
insert into items (trip_id, day, title) values (:'trip', '2026-12-24', 'Beach day');
insert into expenses (trip_id, amount, currency, paid_by, shares)
  values (:'trip', 100, 'AUD', :'robert', jsonb_build_array(jsonb_build_object('traveller_id', :'robert', 'amount', 50), jsonb_build_object('traveller_id', :'harry', 'amount', 50)));

\echo '== Joining links to existing names'
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000b2', false); select join_trip(:'code', 'Adem Cosic') \gset
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c3', false); select join_trip(:'code', 'jasmine') \gset
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000d4', false); select join_trip(:'code', 'Rob D') \gset
reset role;
do $$ begin
  perform t.ok((select user_id from travellers where name = 'Adem') = '10000000-0000-0000-0000-0000000000b2', 'Adem''s account linked to existing "Adem" (no duplicate)');
  perform t.ok((select user_id from travellers where name = 'Jasmine') = '10000000-0000-0000-0000-0000000000c3', 'first-name match is case-insensitive');
  perform t.ok((select count(*) from travellers where name = 'Rob D') = 1, 'non-matching name ("Rob D") creates its own entry for the owner to link');
end $$;

\echo '== Visibility'
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000b2', false);
do $$ begin perform t.ok((select count(*) from items where title = 'Flight out') = 1, 'Adem (on the booking) sees the flight'); end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c3', false);
do $$ begin
  perform t.ok((select count(*) from items where title = 'Flight out') = 0, 'Jasmine (not on the booking) cannot see the flight');
  perform t.ok((select count(*) from items where title = 'Beach day') = 1, 'Jasmine still sees everyone-plans');
  update items set title = 'hacked', visible_to = null where booking_ref = 'PNR-SECRET';
  delete from items where booking_ref = 'PNR-SECRET';
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000a1', false);
do $$ begin perform t.ok((select title from items where booking_ref = 'PNR-SECRET') = 'Flight out', 'Jasmine cannot edit, unhide or delete it'); end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c3', false);
select t.rejects(format('update travellers set user_id = %L where name = %L', '10000000-0000-0000-0000-0000000000c3', 'Abel'), 'member cannot attach themselves to Abel to see his flight');
select t.rejects(format('insert into travellers (trip_id, name, user_id) values (%L, %L, %L)', :'trip', 'x', '10000000-0000-0000-0000-0000000000b2'), 'member cannot create a traveller tied to someone else''s account');
select t.rejects(format('select link_traveller(%L, %L)', :'abel', '10000000-0000-0000-0000-0000000000c3'), 'member cannot call link_traveller');
update travellers set name = 'Jasmine B' where name = 'Jasmine';
do $$ begin perform t.ok((select count(*) from travellers where name = 'Jasmine B') = 1, 'members can still rename travellers'); end $$;

\echo '== Owner links "Rob D" account onto "Robert" (merge)'
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000a1', false);
select link_traveller(:'robert', '10000000-0000-0000-0000-0000000000d4');
reset role;
do $$ begin
  perform t.ok((select count(*) from travellers where name in ('Robert', 'Rob D')) = 1, 'duplicate removed, one Robert');
  perform t.ok((select user_id from travellers where name = 'Robert') = '10000000-0000-0000-0000-0000000000d4', 'Robert linked to Rob''s account');
  perform t.ok((select paid_by from expenses limit 1) = (select id from travellers where name = 'Robert'), 'expenses still point at Robert');
end $$;

\echo '== Share link'
select share_token as tok from trips \gset
set role anon;
select get_shared_trip(:'tok')::text as s \gset
reset role;
select t.ok(:'s' not like '%Flight out%' and :'s' like '%Beach day%', 'restricted flight is not on the share link');
\echo VISIBILITY TESTS PASSED
