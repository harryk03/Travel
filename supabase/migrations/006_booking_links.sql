-- Listing and reservation links on plans (members only; get_shared_trip never returns them).
-- Run once in the Supabase SQL editor. Non-destructive: adds two optional columns.
alter table public.items add column if not exists listing_url text;
alter table public.items add column if not exists booking_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'items_listing_url_http') then
    alter table public.items add constraint items_listing_url_http check (listing_url is null or listing_url ~* '^https?://');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'items_booking_url_http') then
    alter table public.items add constraint items_booking_url_http check (booking_url is null or booking_url ~* '^https?://');
  end if;
end $$;
notify pgrst, 'reload schema';
