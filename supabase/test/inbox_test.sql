-- Tests for migration 007 (share-to-inbox). Run after schema and migrations 002–007.
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

insert into auth.users (id) values ('50000000-0000-0000-0000-0000000000a1'), ('50000000-0000-0000-0000-0000000000b2'), ('50000000-0000-0000-0000-0000000000c3');
set role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-0000000000a1', false);
select create_trip('Inbox trip', 'Bali', '2026-12-23', '2027-01-05', 'Harry', false) as trip \gset
select invite_code as code, share_token as tok from trips where id = :'trip' \gset
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-0000000000b2', false); select join_trip(:'code', 'Adem') \gset
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-0000000000c3', false);
select create_trip('Other trip', 'X', null, null, 'Casey', false) as other \gset
reset role;
\set secret 'test-secret-0123456789abcdef0123456789abcdef'
insert into inbox_secrets (trip_id, token_hash) values (:'trip', encode(sha256(convert_to(:'secret', 'UTF8')), 'hex'));

\echo '== Adding through inbox_add (as the endpoint does, with the public key = anon)'
set role anon;
select t.ok(inbox_add(:'trip', :'secret', 'https://www.instagram.com/p/abc', 'instagram', 'gym in Canggu', null, null) = 'saved', 'right secret saves');
select t.ok(inbox_add(:'trip', :'secret', 'https://www.instagram.com/p/abc', 'instagram', 'again', null, null) = 'exists', 'same link twice -> exists');
select t.rejects(format('select inbox_add(%L, %L, %L, %L, null, null, null)', :'trip', 'wrong-secret-0123456789abcdef0123456789', 'https://x.com/1', 'other'), 'wrong secret refused');
select t.rejects(format('select inbox_add(%L, %L, %L, %L, null, null, null)', :'other', :'secret', 'https://x.com/1', 'other'), 'secret only works for its own trip');
select t.rejects(format('select inbox_add(%L, %L, %L, %L, null, null, null)', :'trip', :'secret', 'javascript:alert(1)', 'other'), 'non-http link refused');
select t.rejects('select * from inbox_items', 'anon cannot read the inbox');
select t.rejects('select * from inbox_secrets', 'anon cannot read the secret hash');
select t.rejects(format('insert into inbox_items (trip_id, url) values (%L, %L)', :'trip', 'https://x.com/2'), 'anon cannot insert directly');
reset role;

\echo '== Members'
set role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-0000000000b2', false);
do $$ begin perform t.ok((select count(*) from inbox_items) = 1, 'member sees the inbox'); end $$;
update inbox_items set status = 'dismissed';
do $$ begin perform t.ok((select status from inbox_items limit 1) = 'dismissed', 'member can dismiss'); end $$;
select t.rejects(format('insert into inbox_items (trip_id, url) values (%L, %L)', :'trip', 'https://x.com/3'), 'member cannot insert directly');
select t.rejects('delete from inbox_items', 'member cannot delete');
select t.rejects('select * from inbox_secrets', 'member cannot read the secret hash');
select t.rejects(format('update inbox_items set status = %L', 'maybe'), 'bad status rejected');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-0000000000c3', false);
do $$ begin perform t.ok((select count(*) from inbox_items) = 0, 'outsider sees nothing'); end $$;
update inbox_items set status = 'new';
reset role;
do $$ begin perform t.ok((select status from inbox_items limit 1) = 'dismissed', 'outsider cannot change it'); end $$;

\echo '== Places source_url and share page'
set role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-0000000000a1', false);
insert into places (trip_id, name, source_url) values (:'trip', 'Gym', 'https://www.instagram.com/p/abc');
select t.rejects(format('insert into places (trip_id, name, source_url) values (%L, %L, %L)', :'trip', 'Bad', 'javascript:x'), 'place source_url must be http(s)');
reset role;
set role anon;
select t.ok(get_shared_trip(:'tok')::text !~ 'instagram|inbox|source_url', 'share page shows no inbox or source links');
reset role;
\echo INBOX TESTS PASSED
