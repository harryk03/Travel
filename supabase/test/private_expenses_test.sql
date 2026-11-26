-- Tests for migration 004 (private expenses). Run after schema, 002, 003, 004.
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

insert into auth.users (id) values ('40000000-0000-0000-0000-0000000000a1'), ('40000000-0000-0000-0000-0000000000b2'),
  ('40000000-0000-0000-0000-0000000000c3'), ('40000000-0000-0000-0000-0000000000d4');
set role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000a1', false);
select create_trip('P', 'Bali', '2026-12-23', '2027-01-05', 'Harry', false) as trip \gset
select invite_code as code from trips where id = :'trip' \gset
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000b2', false); select join_trip(:'code', 'Adem') \gset
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000c3', false); select join_trip(:'code', 'Abel') \gset
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000d4', false); select join_trip(:'code', 'Robert') \gset
reset role;
select id as harry from travellers where name = 'Harry' \gset
select id as adem from travellers where name = 'Adem' \gset
select id as abel from travellers where name = 'Abel' \gset
select id as rob from travellers where name = 'Robert' \gset

set role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000a1', false);
insert into expenses (trip_id, description, amount, currency, paid_by, shares, is_private) values
  (:'trip', 'Flights for Adem and Abel', 900, 'AUD', :'harry',
   jsonb_build_array(jsonb_build_object('traveller_id', :'adem', 'amount', 450), jsonb_build_object('traveller_id', :'abel', 'amount', 450)), true),
  (:'trip', 'Villa', 1000, 'AUD', :'harry',
   jsonb_build_array(jsonb_build_object('traveller_id', :'harry', 'amount', 250), jsonb_build_object('traveller_id', :'adem', 'amount', 250),
                     jsonb_build_object('traveller_id', :'abel', 'amount', 250), jsonb_build_object('traveller_id', :'rob', 'amount', 250)), false);
\echo '== Private expenses'
do $$ begin perform t.ok((select count(*) from expenses) = 2, 'payer sees both'); end $$;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000b2', false);
do $$ begin perform t.ok((select count(*) from expenses where is_private) = 1, 'Adem (in the split) sees the private one'); end $$;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000d4', false);
do $$ begin
  perform t.ok((select count(*) from expenses where is_private) = 0, 'Robert (not involved) cannot see it');
  perform t.ok((select count(*) from expenses) = 1, 'Robert still sees the shared villa');
  update expenses set is_private = false, description = 'hacked' where description = 'Flights for Adem and Abel';
  delete from expenses where description = 'Flights for Adem and Abel';
end $$;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000a1', false);
do $$ begin perform t.ok((select is_private and description = 'Flights for Adem and Abel' from expenses where amount = 900), 'Robert cannot edit, reveal or delete it'); end $$;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-0000000000c3', false);
update expenses set description = 'Flights (Abel edited)' where amount = 900;
do $$ begin perform t.ok((select count(*) from expenses where description = 'Flights (Abel edited)') = 1, 'Abel (involved) can edit it'); end $$;
reset role;
set role anon;
select t.rejects('select * from expenses', 'anon still cannot read expenses');
reset role;
select t.ok((select get_shared_trip(share_token)::text from trips) not like '%Flights%', 'share link has no expenses');
\echo PRIVATE EXPENSE TESTS PASSED
