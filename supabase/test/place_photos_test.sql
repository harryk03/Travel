-- Tests for migration 012. Run after helper_test.sql on the same database.
\set ON_ERROR_STOP 1
select id as trip from trips where name = 'Helper trip' \gset
select id as other from trips where name = 'Other trip' \gset
select share_token as tok from trips where id = :'trip' \gset
\set hkey 'helper-key-0123456789abcdef0123456789abcdef00'
set role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000b2', false);
insert into places (trip_id, name) values (:'trip', 'Photo place') returning id as pl \gset
insert into place_photos (trip_id, place_id, mime, data, thumb) select :'trip', :'pl', 'image/jpeg', repeat('A', 200), repeat('a', 60) from generate_series(1, 6);
select t.rejects(format('insert into place_photos (trip_id, place_id, mime, data, thumb) values (%L, %L, %L, %L, %L)', :'trip', :'pl', 'image/jpeg', repeat('A', 200), repeat('a', 60)), 'max 6 photos per place');
select t.rejects(format('insert into place_photos (trip_id, place_id, mime, data, thumb) values (%L, %L, %L, %L, %L)', :'trip', :'pl', 'text/html', repeat('A', 200), repeat('a', 60)), 'only images');
select t.rejects(format('update place_photos set data = %L', repeat('B', 200)), 'photos cannot be edited');
delete from place_photos where id = (select id from place_photos where place_id = :'pl' limit 1);
do $$ begin perform t.ok((select count(*) from place_photos) = 5, 'member reads and removes photos'); end $$;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000c3', false);
do $$ begin perform t.ok((select count(*) from place_photos) = 0, 'outsider sees no photos'); end $$;
select t.rejects(format('insert into place_photos (trip_id, place_id, mime, data, thumb) values (%L, %L, %L, %L, %L)', :'trip', :'pl', 'image/jpeg', repeat('A', 200), repeat('a', 60)), 'outsider cannot add photos');
select t.rejects(format('insert into place_photos (trip_id, place_id, mime, data, thumb) values (%L, %L, %L, %L, %L)', :'other', :'pl', 'image/jpeg', repeat('A', 200), repeat('a', 60)), 'cannot attach to another trip''s place');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000a1', false);
insert into places (trip_id, name) values (:'trip', 'Bare place') returning id as bare \gset
reset role;
set role anon;
select t.rejects('select * from place_photos', 'anon cannot read photos');
select t.ok(helper_ping(:'trip', :'hkey'), 'helper key pings');
select t.rejects(format('select helper_ping(%L, %L)', :'trip', 'wrong-key-0123456789abcdef0123456789abcdef'), 'wrong key refused');
select helper_add_photo(:'trip', :'hkey', :'bare', 'image/jpeg', repeat('C', 300), repeat('c', 60), 'https://example.com/') is not null as ok \gset
select t.ok(:'ok'::boolean, 'helper adds a cover to a place with no photos');
select t.rejects(format('select helper_add_photo(%L, %L, %L, %L, %L, %L)', :'trip', :'hkey', :'bare', 'image/jpeg', repeat('C', 300), repeat('c', 60)), 'helper cannot add a second photo');
select t.rejects(format('select helper_add_photo(%L, %L, %L, %L, %L, %L)', :'trip', :'hkey', :'pl', 'image/jpeg', repeat('C', 300), repeat('c', 60)), 'helper cannot add to a place that has photos');
select t.rejects(format('select helper_add_photo(%L, %L, %L, %L, %L, %L)', :'other', :'hkey', :'bare', 'image/jpeg', repeat('C', 300), repeat('c', 60)), 'helper key only for its own trip');
select t.ok(get_shared_trip(:'tok')::text !~ 'CCCCCCCCCC|AAAAAAAAAA|place_photos', 'share page shows no photos');
reset role;
\echo PLACE PHOTOS TESTS PASSED
