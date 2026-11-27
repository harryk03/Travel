-- Tests for migration 013. Run after place_photos_test.sql on the same database.
\set ON_ERROR_STOP 1
select id as trip from trips where name = 'Helper trip' \gset
\set hkey 'helper-key-0123456789abcdef0123456789abcdef00'
select id as mine from place_photos where trip_id = :'trip' and created_by is not null limit 1 \gset
select id as its from place_photos where trip_id = :'trip' and created_by is null limit 1 \gset
set role anon;
select t.ok(jsonb_array_length(helper_photos(:'trip', :'hkey')) > 0, 'helper lists photos');
select t.rejects(format('select helper_remove_photo(%L, %L, %L)', :'trip', :'hkey', :'mine'), 'helper cannot remove a person''s photo');
select t.rejects(format('select helper_remove_photo(%L, %L, %L)', :'trip', 'wrong-key-0123456789abcdef0123456789abcdef', :'its'), 'wrong key refused');
select helper_remove_photo(:'trip', :'hkey', :'its');
reset role;
select t.ok((select count(*) from place_photos where id = :'its') = 0, 'helper removes its own photo');
select t.ok((select count(*) from place_photos where id = :'mine') = 1, 'your photo is still there');
\echo HELPER REMOVE PHOTO TESTS PASSED
