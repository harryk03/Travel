-- Tests for migration 014. Run after place_photos_test.sql on the same database.
\set ON_ERROR_STOP 1
select id as trip from trips where name = 'Helper trip' \gset
\set hkey 'helper-key-0123456789abcdef0123456789abcdef00'
select id as bare from places where name = 'Bare place' \gset
select id as pl from places where name = 'Photo place' \gset
set role anon;
select helper_add_photo(:'trip', :'hkey', :'bare', 'image/jpeg', repeat('D', 300), repeat('d', 60)) from generate_series(1, 4);
reset role;
select t.ok((select count(*) from place_photos where place_id = :'bare') >= 5, 'helper adds more photos to a place with only its photos');
set role anon;
select helper_add_photo(:'trip', :'hkey', :'bare', 'image/jpeg', repeat('D', 300), repeat('d', 60)) where (select count(*) from place_photos where place_id = :'bare') < 6;
select t.rejects(format('select helper_add_photo(%L, %L, %L, %L, %L, %L)', :'trip', :'hkey', :'bare', 'image/jpeg', repeat('D', 300), repeat('d', 60)), 'max 6');
select t.rejects(format('select helper_add_photo(%L, %L, %L, %L, %L, %L)', :'trip', :'hkey', :'pl', 'image/jpeg', repeat('D', 300), repeat('d', 60)), 'not on a place with your photos');
reset role;
\echo HELPER MORE PHOTOS TESTS PASSED
