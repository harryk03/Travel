-- Security hardening (run once in the Supabase SQL editor). Non-destructive: adds checks only.
-- Blocks javascript:/data: links being stored as map links (stored XSS on the app and share page).
alter table public.items  add constraint items_maps_url_http  check (maps_url is null or maps_url ~* '^https?://');
alter table public.places add constraint places_maps_url_http check (maps_url is null or maps_url ~* '^https?://');
-- Invite codes rotated from the app must keep the same unguessable shape.
alter table public.trips add constraint trips_invite_code_shape check (invite_code ~ '^[0-9a-f]{10,64}$');
