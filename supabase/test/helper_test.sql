-- Tests for migration 008 (inbox details, screenshots, phone, helper key). Run after schema and 002–008.
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

insert into auth.users (id) values ('70000000-0000-0000-0000-0000000000a1'), ('70000000-0000-0000-0000-0000000000b2'), ('70000000-0000-0000-0000-0000000000c3');
set role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000a1', false);
select create_trip('Helper trip', 'Bali', '2026-12-23', '2027-01-05', 'Harry', false) as trip \gset
select invite_code as code, share_token as tok from trips where id = :'trip' \gset
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000b2', false); select join_trip(:'code', 'Adem') \gset
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000c3', false);
select create_trip('Other trip', 'X', null, null, 'Casey', false) as other \gset
reset role;
\set secret 'inbox-secret-0123456789abcdef0123456789abcdef'
\set hkey 'helper-key-0123456789abcdef0123456789abcdef00'
insert into inbox_secrets values (:'trip', encode(sha256(convert_to(:'secret', 'UTF8')), 'hex'));
insert into helper_secrets values (:'trip', encode(sha256(convert_to(:'hkey', 'UTF8')), 'hex'));
insert into helper_secrets values (:'other', encode(sha256(convert_to('other-key-0123456789abcdef0123456789abcdef', 'UTF8')), 'hex'));

\echo '== Shortcut saves details'
set role anon;
select t.ok(inbox_add_details(:'trip', :'secret', 'https://www.instagram.com/bendbali', 'instagram', null, null,
  'BEND', 'Jl. Sempol, Pererenan', '+62 821 3573 2415', null) = 'saved', 'details saved with the inbox secret');
select t.ok(inbox_add_details(:'trip', :'secret', 'https://www.tiktok.com/@x/video/2', 'tiktok', 'brunch', null, null, null, null, null) = 'saved', 'second item saved');
select t.ok(inbox_add(:'trip', :'secret', 'https://example.com/old', 'other', null, null, null) = 'saved', 'old inbox_add still works');
select t.rejects(format('select inbox_add_details(%L, %L, %L, %L, null, null, null, null, %L, null)', :'trip', :'secret', 'https://x.com/p', 'other', 'call me maybe'), 'junk phone rejected');
select t.rejects(format('select inbox_add_details(%L, %L, %L, %L, null, null, null, null, null, null)', :'trip', :'hkey', 'https://x.com/q', 'other'), 'helper key cannot use the Shortcut endpoint');
reset role;
select id as bend from inbox_items where url like '%bendbali%' \gset
select id as brunch from inbox_items where url like '%tiktok%' \gset

\echo '== Helper key'
set role anon;
select t.ok(jsonb_array_length(helper_inbox(:'trip', :'hkey')->'inbox') = 3, 'helper reads open inbox items');
select t.ok((helper_inbox(:'trip', :'hkey')->'inbox'->0->>'phone') = '+62 821 3573 2415', 'helper sees the details');
select t.rejects(format('select helper_inbox(%L, %L)', :'trip', 'wrong-key-0123456789abcdef0123456789abcdef'), 'wrong helper key refused');
select t.rejects(format('select helper_inbox(%L, %L)', :'trip', :'secret'), 'Shortcut secret cannot read the inbox');
select t.rejects(format('select helper_inbox(%L, %L)', :'other', :'hkey'), 'helper key only works for its own trip');
select t.rejects(format('select helper_check(%L, %L)', :'trip', :'hkey'), 'helper_check is not callable directly');
select t.rejects('select * from helper_secrets', 'anon cannot read helper hashes');
select helper_add_place(:'trip', :'hkey', :'bend', 'BEND Stretch Studio', 'gym', 'Jl. Sempol, Pererenan', null, -8.64, 115.12, '+62 821 3573 2415', '1:1 stretching') as hp \gset
reset role;
select t.ok((select helper_added and source_url like '%bendbali%' and phone is not null from places where id = :'hp'), 'helper place added with link back and phone');
select t.ok((select status = 'added' and place_id = :'hp' from inbox_items where id = :'bend'), 'inbox item ticked off');
set role anon;
select t.rejects(format('select helper_add_place(%L, %L, %L, %L, null, null, null, null, null, null, null)', :'trip', :'hkey', :'bend', 'Again'), 'cannot add the same item twice');
select t.rejects(format('select helper_add_place(%L, %L, %L, %L, %L, null, null, null, null, null, null)', :'trip', :'hkey', :'brunch', 'X', 'casino'), 'bad category rejected');
select helper_update_place(:'trip', :'hkey', :'hp', null, null, null, null, null, null, null, 'Open 8am to 8pm');
reset role;
select t.ok((select notes = 'Open 8am to 8pm' and name = 'BEND Stretch Studio' from places where id = :'hp'), 'helper fills in its own place, blanks left alone');
set role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000a1', false);
insert into places (trip_id, name) values (:'trip', 'My own cafe') returning id as mine \gset
reset role;
set role anon;
select t.rejects(format('select helper_update_place(%L, %L, %L, %L, null, null, null, null, null, null, null)', :'trip', :'hkey', :'mine', 'Hacked'), 'helper cannot change places you added');
select helper_flag(:'trip', :'hkey', :'brunch', 'Name of the cafe and address');
select t.rejects(format('select helper_flag(%L, %L, %L, %L)', :'trip', :'hkey', :'bend', 'x'), 'cannot flag a handled item');
select t.rejects('select * from inbox_files', 'anon cannot read screenshots');
reset role;
select t.ok((select name = 'My own cafe' from places where id = :'mine'), 'your place unchanged');
select t.ok((select needs = 'Name of the cafe and address' from inbox_items where id = :'brunch'), 'flag saved');

\echo '== Screenshots and details (members)'
set role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000b2', false);
update inbox_items set details = 'Cafe is called Sprout, Jl. Raya Canggu' where id = :'brunch';
insert into inbox_files (trip_id, inbox_id, mime, data) select :'trip', :'brunch', 'image/jpeg', repeat('A', 200) from generate_series(1, 6);
select t.rejects(format('insert into inbox_files (trip_id, inbox_id, mime, data) values (%L, %L, %L, %L)', :'trip', :'brunch', 'image/jpeg', repeat('A', 200)), 'max 6 screenshots per item');
select t.rejects(format('insert into inbox_files (trip_id, inbox_id, mime, data) values (%L, %L, %L, %L)', :'trip', :'brunch', 'text/html', repeat('A', 200)), 'only images');
select t.rejects(format('update inbox_files set data = %L', repeat('B', 200)), 'screenshots cannot be edited');
delete from inbox_files where id = (select id from inbox_files where inbox_id = :'brunch' limit 1);
do $$ begin perform t.ok((select count(*) from inbox_files) = 5, 'member reads and removes screenshots'); end $$;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000c3', false);
do $$ begin perform t.ok((select count(*) from inbox_files) = 0, 'outsider sees no screenshots'); end $$;
select t.rejects(format('insert into inbox_files (trip_id, inbox_id, mime, data) values (%L, %L, %L, %L)', :'trip', :'brunch', 'image/jpeg', repeat('A', 200)), 'outsider cannot add screenshots');
select t.rejects(format('insert into inbox_files (trip_id, inbox_id, mime, data) values (%L, %L, %L, %L)', :'other', :'brunch', 'image/jpeg', repeat('A', 200)), 'cannot attach to another trip''s item');
select t.rejects('select * from helper_secrets', 'members cannot read helper hashes');
reset role;
set role anon;
select t.ok(jsonb_array_length(helper_files(:'trip', :'hkey', :'brunch')) = 5, 'helper reads the screenshots');
select t.ok((select x->>'details' from jsonb_array_elements(helper_inbox(:'trip', :'hkey')->'inbox') x where x->>'id' = :'brunch') like 'Cafe is called Sprout%', 'helper reads your details');
select t.ok(get_shared_trip(:'tok')::text !~ 'instagram|inbox|phone|821|helper|Sprout', 'share page shows none of it');
reset role;
\echo HELPER TESTS PASSED
