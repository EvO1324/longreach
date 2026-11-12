# The database

The crew centre keeps everything in PocketBase. `npm run setup` creates these tables from `server/schema.json`.

**Who can see what:** every table is admin-only. The API signs in to PocketBase as the admin and decides what each pilot may see or change. Nobody can read or edit the database directly with just its address. Don't loosen a table's rules in the PocketBase dashboard: that would expose it to anyone on the internet.

PocketBase lists tables alphabetically. Here they are by what they're for.

## Pilots

| Table | What's in it |
| --- | --- |
| `users` | Pilot and staff accounts, grouped in this order: name, callsign, role, rank and hours; Infinite Flight; Discord; joining (application, exam, terms); career mode; everything else |
| `roles` | Staff roles and what each may do (Admin › Staff Roles) |
| `ranks` | Rank tiers: hours needed, aircraft unlocked, Discord role, hours multiplier |
| `badges` | Badges: for hours, for Infinite Flight roles (IFATC, IFAET), or awarded by hand |
| `pilot_badges` | Which pilot has which badge, and whether they've seen it |
| `leave_requests` | Leave of absence requests and staff decisions |
| `password_reset_tokens` | One-time password reset links |

## Flying

| Table | What's in it |
| --- | --- |
| `flights` | Every PIREP: route, aircraft, time and status, plus what it counted for (multiplier, event, challenge leg, career, ferry, Live Mode, ATC session) |
| `routes` | The VA's routes and the aircraft allowed on each |
| `fleet` | Aircraft and liveries pilots can fly, matched to Infinite Flight's IDs |
| `airlines` | Airline codes, names and logos (codeshares) |
| `multipliers` | Hours multipliers, including promo codes |
| `promo_uses` | Which pilot has used which one-time promo code |
| `route_requests` | Routes pilots have suggested |

## Joining and staff

| Table | What's in it |
| --- | --- |
| `staff_applications` | Applications for staff positions |
| `staff_positions` | The positions open for applications |
| `tickets` | Discord support tickets: who opened them, their channel, whether they're open, and the transcript once closed |
| `watchlist` | Infinite Flight Community usernames to watch or block when they apply |
| `exam_topics` | Entry exam topics and how many questions each exam draws from them |
| `exam_questions` | The question bank |
| `exam_question_attempts` | How each question was answered, for Admin › Exam's statistics |

## Events, challenges and features

| Table | What's in it |
| --- | --- |
| `events` | Events: route, aircraft, gates, multiplier, Discord message |
| `event_registrations` | Who's signed up to which event, their gate, when they landed |
| `challenges` | Multi-leg tours |
| `challenge_legs` | Each challenge's legs, in order |
| `challenge_entries` | Who's enrolled in which challenge and how far they've got |
| `challenge_leg_completions` | Each leg a pilot has completed, and the hours it gave them |
| `rotw_weeks` | Routes of the Week, one row per week |
| `rotw_slots` | The routes in each week, by day |

## Live Mode

| Table | What's in it |
| --- | --- |
| `if_live_tokens` | Pilots' Infinite Flight sign-in tokens (secret) |
| `if_live_bids` | Flights booked on the organisation's aircraft |
| `if_live_fleet_images` | Photos for the organisation's aircraft types |

## Site content and numbers

| Table | What's in it |
| --- | --- |
| `va_stats` | The VA's running totals (one row) |
| `daily_stats` | One row per day: flights, hours, busiest routes, aircraft and pilots |
| `news` | News posts on the dashboard |
| `notams` | Notices shown across the site |
| `docs` | The Docs pages |
| `changelog` | The "what's new" notes |
| `settings` | Site-wide settings as key and value: logos, images, exam settings, email setup |
| `audit_logs` | A record of staff actions |
