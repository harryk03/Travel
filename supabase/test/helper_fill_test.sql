-- Tests for migration 011. Run after helper_test.sql (and the 009/010 tests) on the same database.
\set ON_ERROR_STOP 1
select id as trip from trips where name = 'Helper trip' \gset
select id as other from trips where name = 'Other trip' \gset
\set hkey 'helper-key-0123456789abcdef0123456789abcdef00'
set role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000a1', false);
insert into places (trip_id, name, category, address, notes) values (:'trip', 'Fill me', 'cafe', 'Uluwatu', 'Very good food') returning id as mine \gset
insert into places (trip_id, name, category, phone) values (:'trip', 'Has a phone', 'cafe', '+62 811 111 111') returning id as withphone \gset
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-0000000000c3', false);
insert into places (trip_id, name) values (:'other', 'Other trip place') returning id as otherplace \gset
reset role;
set role anon;
select helper_fill_place(:'trip', :'hkey', :'mine', 'Jl. Pantai Bingin 9', 'https://maps.app.goo.gl/x', -8.8, 115.1, '+6285953789675', 'https://thecashewtree.com/', 'Overwritten?') as filled \gset
select t.ok(:'filled'::jsonb = '["maps_url", "pin", "phone", "website"]'::jsonb, 'fills only the empty fields: ' || :'filled');
select t.ok(helper_fill_place(:'trip', :'hkey', :'withphone', null, null, -8.7, null, '+62 899 999 999', null, 'New notes') = '["notes"]'::jsonb, 'keeps an existing phone, needs both lat and lng, fills blank notes');
select t.ok(helper_fill_place(:'trip', :'hkey', :'mine', null, null, -1, 1, '+62 800 000 000', 'https://other.example.com', 'x') = '[]'::jsonb, 'second fill changes nothing');
select t.rejects(format('select helper_fill_place(%L, %L, %L, %L)', :'trip', 'wrong-key-0123456789abcdef0123456789abcdef', :'mine', 'x'), 'wrong key refused');
select t.rejects(format('select helper_fill_place(%L, %L, %L, %L)', :'trip', :'hkey', :'otherplace', 'x'), 'cannot fill a place in another trip');
select t.rejects(format('select helper_fill_place(%L, %L, %L, null, null, null, null, null, %L)', :'trip', :'hkey', :'withphone', 'javascript:alert(1)'), 'website still must be http(s)');
select t.ok((select count(*) from jsonb_array_elements(helper_inbox(:'trip', :'hkey')->'places') x where x ? 'lat' and x ? 'has_notes') > 0, 'helper read shows what is empty');
reset role;
select t.ok((select address = 'Uluwatu' and notes = 'Very good food' and name = 'Fill me' and category = 'cafe' and phone = '+6285953789675' and lat = -8.8 from places where id = :'mine'), 'your address, notes, name and category untouched');
select t.ok((select phone = '+62 811 111 111' and lat is null from places where id = :'withphone'), 'existing phone kept; half a pin ignored');
\echo HELPER FILL TESTS PASSED
