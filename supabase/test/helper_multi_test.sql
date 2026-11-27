-- Tests for migration 009. Run after helper_test.sql on the same database (reuses its trip and keys).
\set ON_ERROR_STOP 1
select id as trip from trips where name = 'Helper trip' \gset
select id as other from trips where name = 'Other trip' \gset
\set secret 'inbox-secret-0123456789abcdef0123456789abcdef'
\set hkey 'helper-key-0123456789abcdef0123456789abcdef00'
set role anon;
select inbox_add_details(:'trip', :'secret', 'https://www.tiktok.com/@x/video/99', 'tiktok', 'Multiple', null, null, null, null, null);
reset role;
select id as multi from inbox_items where url like '%video/99' \gset
set role anon;
select helper_add_more(:'trip', :'hkey', :'multi', 'Place one', 'cafe', null, null, null, null, null, null);
select helper_add_more(:'trip', :'hkey', :'multi', 'Place two', 'restaurant', null, null, null, null, null, null);
reset role;
select t.ok((select status = 'new' from inbox_items where id = :'multi'), 'item stays open while adding more');
set role anon;
select helper_add_place(:'trip', :'hkey', :'multi', 'Place three', 'nightlife', null, null, null, null, null, null);
select helper_add_more(:'trip', :'hkey', :'multi', 'Place four (late)', 'cafe', null, null, null, null, null, null);
select t.rejects(format('select helper_add_more(%L, %L, %L, %L, null, null, null, null, null, null, null)', :'trip', 'wrong-key-0123456789abcdef0123456789abcdef', :'multi', 'X'), 'wrong key refused');
select t.rejects(format('select helper_add_more(%L, %L, %L, %L, null, null, null, null, null, null, null)', :'other', :'hkey', :'multi', 'X'), 'other trip refused');
reset role;
select t.ok((select count(*) = 4 and bool_and(helper_added) and bool_and(source_url like '%video/99') from places where name like 'Place %'), 'four places, all linked back to the post');
select t.ok((select status = 'added' from inbox_items where id = :'multi'), 'last add ticks it off');
update inbox_items set status = 'dismissed' where id = :'multi';
set role anon;
select t.rejects(format('select helper_add_more(%L, %L, %L, %L, null, null, null, null, null, null, null)', :'trip', :'hkey', :'multi', 'X'), 'dismissed item refused');
reset role;
\echo HELPER MULTI TESTS PASSED
