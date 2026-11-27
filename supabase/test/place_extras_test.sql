-- Tests for migration 010. Run after helper_test.sql and helper_multi_test.sql on the same database.
\set ON_ERROR_STOP 1
select id as trip from trips where name = 'Helper trip' \gset
select share_token as tok from trips where id = :'trip' \gset
\set secret 'inbox-secret-0123456789abcdef0123456789abcdef'
\set hkey 'helper-key-0123456789abcdef0123456789abcdef00'
\echo '== Existing places untouched, new fields work for members'
select t.ok((select count(*) from places where website is not null or custom_emoji is not null) = 0, 'existing places have no website or custom category');
set role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000b2', false);
insert into places (trip_id, name, category, website) values (:'trip', 'Spa one', 'spa', 'https://spa.example.com');
insert into places (trip_id, name, category, custom_emoji, custom_label) values (:'trip', 'Padel one', 'custom', '🎾', 'Padel');
select t.rejects(format('insert into places (trip_id, name, category) values (%L, %L, %L)', :'trip', 'No emoji', 'custom'), 'custom needs an emoji and a name');
select t.rejects(format('insert into places (trip_id, name, category) values (%L, %L, %L)', :'trip', 'Bad', 'casino'), 'unknown category still rejected');
select t.rejects(format('insert into places (trip_id, name, website) values (%L, %L, %L)', :'trip', 'Bad', 'javascript:alert(1)'), 'website must be http(s)');
select t.rejects(format('insert into places (trip_id, name, category, custom_emoji, custom_label) values (%L, %L, %L, %L, %L)', :'trip', 'Long', 'custom', '🎾', repeat('x', 41)), 'custom name max 40');
reset role;
\echo '== Helper'
set role anon;
select inbox_add_details(:'trip', :'secret', 'https://www.tiktok.com/@x/video/1010', 'tiktok', 'padel', null, null, null, null, null);
reset role;
select id as item from inbox_items where url like '%video/1010' \gset
set role anon;
select helper_add_more(:'trip', :'hkey', :'item', 'Court A', 'custom', null, null, null, null, null, null, 'https://courta.example.com', '🎾', 'Padel') as ca \gset
select helper_add_place(:'trip', :'hkey', :'item', 'Court B', 'spa', null, null, null, null, null, null) as cb \gset
select helper_update_place(:'trip', :'hkey', :'cb', null, null, null, null, null, null, null, null, 'https://courtb.example.com');
select t.rejects(format('select helper_update_place(%L, %L, (select id from places where name = %L), null, null, null, null, null, null, null, null, %L)', :'trip', :'hkey', 'Spa one', 'https://x.com'), 'helper still cannot change your places');
reset role;
select t.ok((select website = 'https://courta.example.com' and custom_label = 'Padel' and source_url like '%1010' from places where id = :'ca'), 'helper adds website and custom category');
select t.ok((select website = 'https://courtb.example.com' and category = 'spa' and name = 'Court B' from places where id = :'cb'), 'helper fills in a website, blanks left alone');
select t.ok((select status = 'added' from inbox_items where id = :'item'), 'item ticked off');
set role anon;
select t.ok(get_shared_trip(:'tok')::text !~ 'example.com|Padel|Court', 'share page shows none of it');
reset role;
\echo PLACE EXTRAS TESTS PASSED
