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

## Develop

```bash
npm install
npm run dev          # demo mode unless .env.local has the Supabase values (see .env.example)
npm test             # logic tests
npm run build:demo   # single-file demo build in dist-demo/
```

Security tests for the database: `supabase/test/` (run against a local Postgres with `auth_stub.sql` first).

## Structure

- `src/lib/` – types, backends (`supabaseBackend`, `localBackend` share one interface), money, dates, maps parsing.
- `src/components/` – one file per tab plus forms, settings and the public share page.
- `api/resolve-maps.js` – Vercel function that expands `maps.app.goo.gl` short links.
- `public/sw.js` – offline cache of the app shell; trip data is cached in localStorage.
