-- Private expenses: visible only to the people involved (who paid + who it's split between).
-- Run once in the Supabase SQL editor. Non-destructive: adds a column (default false) and replaces the expense policies.

alter table public.expenses add column if not exists is_private boolean not null default false;

create or replace function public.can_see_expense(t uuid, priv boolean, payer uuid, shares jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(t) and (
    not priv or exists (
      select 1 from travellers v
      where v.trip_id = t and v.user_id = auth.uid()
        and (v.id = payer or exists (select 1 from jsonb_array_elements(shares) s where s->>'traveller_id' = v.id::text))
    )
  );
$$;

drop policy if exists expenses_all on public.expenses;
drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (public.can_see_expense(trip_id, is_private, paid_by, shares));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_member(trip_id));
create policy expenses_update on public.expenses for update to authenticated
  using (public.can_see_expense(trip_id, is_private, paid_by, shares)) with check (public.is_member(trip_id));
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.can_see_expense(trip_id, is_private, paid_by, shares));
