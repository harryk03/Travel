-- Personal trip dates per traveller (null = follow the trip's dates). Run once in the Supabase SQL editor.
-- Non-destructive: adds two optional columns. Travellers are already readable/editable only by trip members.
alter table public.travellers add column if not exists arrive_on date;
alter table public.travellers add column if not exists leave_on date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'travellers_dates_order') then
    alter table public.travellers add constraint travellers_dates_order check (arrive_on is null or leave_on is null or leave_on >= arrive_on);
  end if;
end $$;
