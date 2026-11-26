# Trip HQ

A lightweight, shared trip planner: Overview, Itinerary, Saved Places, Expenses, and a live read-only link for friends.

**Stack:** React + Vite (static site on Vercel, free) · Supabase (Postgres, auth, realtime; free tier).
Without Supabase settings it runs in **demo mode** (data saved in the browser only).

## Go live (about 10 minutes, free)

1. **Supabase** – create a free project at supabase.com.
   - SQL Editor → paste all of `supabase/schema.sql` → Run (once).
   - Authentication → Sign In / Providers → Email: turn **off** "Confirm email" (keeps sign-up instant for the group).
   - Project Settings → API: copy the **Project URL** and the **anon public** key.
2. **Vercel** – sign in with GitHub at vercel.com → Add New → Project → import this repo
   (branch `claude/clever-clarke-bg5auh`, or merge it to `main` first).
   - Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from step 1. Deploy.
3. Open the site, create an account, create the trip (or load the example), then Settings → copy the invite link for your mates.
   Share → copy the friends' link for the other groups.

## Who sees what

| | Owner | Travelling member | Share link |
|---|---|---|---|
| Itinerary, places, dates, statuses | edit | edit | view (no places list) |
| Expenses, travellers | edit | edit | – |
| Booking refs, private notes | edit | edit | – |
| Trip settings, sharing, member roles | edit | – | – |

Enforced in Postgres (row level security + the `get_shared_trip` function), not just hidden in the UI.

## Expenses rule (keep this)

Settling up always means **paying back whoever paid**: each person owes each payer their share of that payer's
expenses, and amounts only net out between the same two people. Never switch to a "fewest transfers" optimiser.
Amounts to pay are rounded **up** to whole dollars (Rp 1,000 for IDR); anything under one step counts as settled.
Logic: `settleUp()` in `src/lib/money.ts`, covered by the "who pays who" test.

## Develop

```bash
npm install
npm run dev          # demo mode unless .env.local has the Supabase values (see .env.example)
npm test             # logic tests
npm run build:demo   # single-file demo build in dist-demo/
```

Security tests for the database: `supabase/test/` (local Postgres: `auth_stub.sql`, then `schema.sql`, then `attack_test.sql`).

Run `supabase/schema.sql`, then each file in `supabase/migrations/` in order (002, 003) once in the SQL editor.
Tests: `attack_test.sql` (permissions) and `visibility_test.sql` (per-plan visibility, account linking).

## Structure

- `src/lib/` – types, backends (`supabaseBackend`, `localBackend` share one interface), money, dates, maps parsing.
- `src/components/` – one file per tab plus forms, settings and the public share page.
- `api/resolve-maps.js` – Vercel function that expands `maps.app.goo.gl` short links.
- `public/sw.js` – offline cache of the app shell; trip data is cached in localStorage.
