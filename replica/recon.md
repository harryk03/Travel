# Recon (light, clean-room)

Scope: borrow a few interaction patterns from Wanderlog-style planners, build everything else fresh.
Wanderlog's site was not reachable from the build environment, so this is from general product knowledge only.
REA was not used: its job is inspecting an app's shipped code, which the Replica clean-room rules rule out here.

Patterns kept (generic, not ownable):
- Trip header with dates; sections for overview, day-by-day itinerary, saved places, budget.
- Itinerary grouped by day with "add to this day" at the bottom of each day.
- Saved places with category chips and one-tap "add to itinerary".
- Expenses with payer, who it covers, equal/custom split, and a settle-up list.
- Read-only share link for people outside the planning group.

Deliberately different: own name (Trip HQ), own palette (lagoon teal + sand), own copy, no maps embed,
two-status model (Confirmed / Tentative), AUD + IDR kept separate with no conversion,
backend-enforced share whitelist.
