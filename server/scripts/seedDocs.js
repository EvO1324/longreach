#!/usr/bin/env node
/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getAdminClient } = require('../src/config/pocketbase');
const brand = require('../src/config/brand');

const live = process.argv.includes('--live');

const STARTER_DOCS = [
  {
    "doc_id": "pilot-basics",
    "label": "Pilot Basics",
    "title": "Pilot Basics",
    "icon_name": "Briefcase",
    "admin_only": false,
    "sort_order": 0,
    "sections": [
      {
        "heading": "Your callsign",
        "body": "Your AVG callsign is assigned when your application is approved and is shown in your crew centre profile. Use this callsign as your Infinite Flight callsign when flying routes you intend to log as PIREPs. For example, Australia 1VG. This may show as \"RAAF No. 34 (Australia)\" on Infinite Flight as we're using their callsign. Using a different callsign won't prevent filing, but if staff cross-reference your IF logbook they'll be looking for flights matching your profile. PIREPs for flights that did not use the correct callsign will not be approved."
      },
      {
        "heading": "Aircraft and livery use",
        "body": "You must fly the aircraft type and AVG livery specified on the route. Each route lists approved aircraft \u2014 you cannot substitute a different type. Within a type, use the correct AVG livery where one exists. Staff cross-reference your Infinite Flight logbook, and a mismatch between your filed aircraft and your logbook entry is one of the most common reasons for rejection.",
        "highlight": true
      },
      {
        "heading": "Finding and flying routes",
        "body": "Start with Routes of the Week in the sidebar \u2014 these are the recommended routes for the current week and often carry bonus hour multipliers. If you want to fly outside the weekly schedule, use the Flight Routes page to search the full catalogue by flight number, departure, arrival, duration, or aircraft type. See the Finding a Route doc for full details."
      },
      {
        "heading": "Filing a PIREP",
        "body": "After completing a flight, file your PIREP through the crew centre within 7 days. The fastest method is clicking File PIREP directly from the Routes of the Week or Flight Routes page \u2014 this pre-fills most of the form. Enter your actual block time, not the estimated duration shown on the route. See the Filing a PIREP doc for full details on each field and how auto-approval works."
      },
      {
        "heading": "Activity requirements",
        "body": "Members are expected to file at least one PIREP per month to remain active. Pilots who go inactive receive an automated warning via Discord. Continued inactivity may result in your account being flagged as inactive. If you know you'll be away, file leave in advance \u2014 see How to File Leave below."
      },
      {
        "heading": "How to file leave",
        "body": "If you're going to be unavailable for an extended period, visit the Leave page in the crew centre to submit a leave request. Once submitted, you cannot edit or cancel the request yourself \u2014 so double-check your dates before submitting. Leave is approved by staff and pauses your inactivity timer. If you return earlier than expected, open a ticket on Discord to let staff know and they'll update your leave accordingly."
      }
    ]
  },
  {
    "doc_id": "pilot-code-of-conduct",
    "label": "Code of Conduct",
    "title": "Pilot Code of Conduct",
    "icon_name": "ShieldCheck",
    "admin_only": false,
    "sort_order": 1,
    "sections": [
      {
        "heading": "Respect and inclusivity",
        "body": "Australia Virtual is a community built on mutual respect. All members are expected to treat each other with courtesy at all times \u2014 in Discord, in the crew centre, and in any public forum where you represent AVG. Discrimination, bullying, targeted harassment, or hate speech of any kind will not be tolerated and may result in an immediate permanent ban with no right of appeal.",
        "highlight": true
      },
      {
        "heading": "Conduct on Discord",
        "body": null,
        "list": [
          {
            "label": "Stay on topic",
            "desc": "Use channels for their intended purpose. Keep general chat in #chat and flight chat in the appropriate channels."
          },
          {
            "label": "No harassment",
            "desc": "Do not send unsolicited DMs to other members, pile on in public channels, or demean others over their flying ability or rank."
          },
          {
            "label": "No discrimination",
            "desc": "Remarks targeting race, religion, gender, sexuality, nationality, or disability are grounds for an immediate ban."
          },
          {
            "label": "No bullying",
            "desc": "Repeated negative behaviour directed at a specific member \u2014 even if framed as jokes \u2014 is treated as bullying."
          },
          {
            "label": "Resolve disputes privately",
            "desc": "If you have a conflict with another member, contact staff via a ticket rather than arguing in public channels."
          }
        ]
      },
      {
        "heading": "Conduct when flying under AVG callsign",
        "body": "When you fly with the AVG callsign on Infinite Flight, you are representing Australia Virtual to the broader IF community. You are expected to follow all Infinite Flight rules and community standards \u2014 violations on IF that are reported to staff may result in disciplinary action within AVG independent of any action taken by IF moderators."
      },
      {
        "heading": "Compliance with Infinite Flight rules",
        "body": null,
        "list": [
          {
            "label": "Expert Server standards",
            "desc": "When flying on Expert Server, comply with all ATC instructions. Ghosting or violations reflect on AVG."
          },
          {
            "label": "Realistic flight conduct",
            "desc": "Do not troll other pilots, block taxiways, or engage in unrealistic flight behaviour under the AVG callsign."
          },
          {
            "label": "Report rule-breakers",
            "desc": "If you witness another AVG member behaving poorly on IF, report it to staff with evidence rather than retaliating."
          }
        ]
      },
      {
        "heading": "Consequences for breaches",
        "body": "Staff handle conduct breaches on a case-by-case basis. Consequences range from a formal warning to suspension from PIREP filing to permanent removal from AVG and the Discord server. Serious breaches \u2014 including discrimination, bullying, and falsified PIREPs \u2014 are grounds for immediate removal without warning.",
        "highlight": true
      }
    ]
  },
  {
    "doc_id": "server-rules",
    "label": "Server Rules",
    "title": "Australia Virtual Rules",
    "icon_name": "BookOpen",
    "admin_only": false,
    "sort_order": 2,
    "sections": [
      {
        "heading": "General conduct",
        "body": null,
        "list": [
          {
            "label": "Be respectful",
            "desc": "Treat all members with respect. Harassment, discrimination, or targeted abuse will result in an immediate ban."
          },
          {
            "label": "No spam",
            "desc": "Do not spam messages, images, or commands in any channel."
          },
          {
            "label": "English only",
            "desc": "Please use English in all public channels so staff can moderate effectively."
          },
          {
            "label": "No self-promotion",
            "desc": "Do not advertise other VAs, Discord servers, or external services without staff permission."
          }
        ]
      },
      {
        "heading": "Flight standards",
        "body": null,
        "list": [
          {
            "label": "Expert Server preferred",
            "desc": "We strongly encourage Expert Server. Training and Casual flights are accepted but must still meet quality standards."
          },
          {
            "label": "Realistic operations",
            "desc": "File PIREPs that reflect realistic operations. No touch-and-goes, instant spawns, or unrealistic flight paths."
          },
          {
            "label": "Correct aircraft",
            "desc": "Fly the aircraft and livery you report. Staff cross-reference your IF logbook and will reject PIREPs where the aircraft does not match."
          },
          {
            "label": "No falsified PIREPs",
            "desc": "Filing fraudulent PIREPs results in an immediate ban and removal of all hours."
          }
        ]
      },
      {
        "heading": "Crew centre usage",
        "body": null,
        "list": [
          {
            "label": "One account only",
            "desc": "Each pilot may have one crew centre account. Duplicates will be removed."
          },
          {
            "label": "Keep details accurate",
            "desc": "Keep your IFC username and IF User ID up to date in your Profile. Incorrect details delay auto-approval."
          },
          {
            "label": "Report issues",
            "desc": "If you find a bug or error, report it to staff rather than attempting to exploit it."
          }
        ]
      },
      {
        "heading": "Consequences",
        "body": "Violations may result in warnings, suspension of PIREP submissions, removal of hours, or a permanent ban, at staff discretion.",
        "highlight": true
      }
    ]
  },
  {
    "doc_id": "finding-a-route",
    "label": "Finding a Route",
    "title": "Finding a Route to Fly",
    "icon_name": "Search",
    "admin_only": false,
    "sort_order": 3,
    "sections": [
      {
        "heading": "Two ways to find a route",
        "body": "You can find routes in two places \u2014 the Routes page for searching the full catalogue, or Routes of the Week for the curated weekly schedule. Routes of the Week is the best starting point since those routes often carry bonus hour multipliers."
      },
      {
        "heading": "Routes of the Week",
        "body": "Head to Routes of the Week in the sidebar. The schedule is broken down by day \u2014 today is highlighted automatically. Each route shows the flight number, departure and arrival airports, distance, estimated duration, aircraft type, livery, and any active multiplier. Make a note of the details before heading into Infinite Flight, then hit File PIREP on the route when you're ready to log it.",
        "highlight": true
      },
      {
        "heading": "Searching the full route catalogue",
        "body": "Go to Flight Routes in the sidebar to search outside the weekly schedule. Filter by flight number, departure ICAO, arrival ICAO, duration range, or aircraft type using the tag buttons. Results will not appear until you click Search Routes. Once you find a route, click File PIREP directly from the results table to pre-fill the form."
      },
      {
        "heading": "What each route shows",
        "body": null,
        "list": [
          {
            "label": "Flight number",
            "desc": "The AVG flight number to use when filing your PIREP."
          },
          {
            "label": "Departure / Arrival",
            "desc": "ICAO codes for both airports. You must depart and arrive at exactly these airports in IF."
          },
          {
            "label": "Distance",
            "desc": "Route distance in nautical miles."
          },
          {
            "label": "Duration",
            "desc": "Estimated flight time. File your actual block time \u2014 not this estimate."
          },
          {
            "label": "Aircraft",
            "desc": "Approved aircraft types for this route. You must fly one of these."
          },
          {
            "label": "Multiplier",
            "desc": "Shown on Routes of the Week only. A \u00d71.5 multiplier boosts your credited hours by that factor."
          }
        ]
      }
    ]
  },
  {
    "doc_id": "filing-pirep",
    "label": "Filing a PIREP",
    "title": "How to File a PIREP",
    "icon_name": "Plane",
    "admin_only": false,
    "sort_order": 4,
    "sections": [
      {
        "heading": "File from Routes of the Week (recommended)",
        "body": "The fastest way to file is directly from the Routes of the Week page. Hit File PIREP on any route and the form pre-fills with the flight number, departure, arrival, aircraft, and any active multiplier. You just need to add your actual flight time and date.",
        "highlight": true
      },
      {
        "heading": "File from the Routes page",
        "body": "Search for your route on the Flight Routes page and click File PIREP from the results table. This pre-fills the flight number, departure, and arrival \u2014 you'll still need to select your aircraft and enter your flight time."
      },
      {
        "heading": "Filing manually",
        "body": "Go to File PIREP in the sidebar. Use the Select Route dropdown at the top to find your route by flight number \u2014 selecting it auto-fills the flight number, departure, and arrival. If you flew a non-scheduled route, skip the dropdown and fill in the fields manually."
      },
      {
        "heading": "Form fields",
        "body": null,
        "list": [
          {
            "label": "Flight Number",
            "desc": "Required. Auto-filled from route selection or the dropdown."
          },
          {
            "label": "Aircraft",
            "desc": "Required. Select from the dropdown \u2014 only approved fleet liveries are listed."
          },
          {
            "label": "Departure ICAO",
            "desc": "Required. 4-letter code e.g. KLAX. Auto-filled from route selection."
          },
          {
            "label": "Arrival ICAO",
            "desc": "Required. 4-letter code e.g. KJFK. Auto-filled from route selection."
          },
          {
            "label": "Flight Time",
            "desc": "Required. Enter actual block time in hours and minutes. If a multiplier is active, the boosted total is shown as a preview."
          },
          {
            "label": "Date",
            "desc": "Required. Defaults to today. Set this to the UTC date your flight was completed."
          },
          {
            "label": "Notes",
            "desc": "Optional. Context for the reviewer \u2014 not needed for standard flights."
          }
        ]
      },
      {
        "heading": "Multipliers",
        "body": "If you filed from a Routes of the Week route with a multiplier, a banner shows at the top of the form with the multiplier code and value. Enter your real flight time \u2014 the multiplier is recorded separately and applied automatically. You do not need to calculate the boosted hours yourself."
      },
      {
        "heading": "Auto-approval",
        "body": "The system checks your IF logbook on submission. If a matching flight is found \u2014 same route, same date, matching aircraft \u2014 your PIREP is approved instantly and hours are credited straight away. If no match is found, the PIREP goes into the review queue for staff to check within 48 hours.",
        "highlight": true
      }
    ]
  },
  {
    "doc_id": "logbook",
    "label": "Your Logbook",
    "title": "Using Your Logbook",
    "icon_name": "Map",
    "admin_only": false,
    "sort_order": 5,
    "sections": [
      {
        "heading": "What the logbook shows",
        "body": "Your logbook is a complete record of every PIREP you've filed. At the top are four stat cards \u2014 total flights, total hours, total distance, and your most-flown aircraft type. Below that is a map of your flight paths, then the full flight table paginated in groups of 10."
      },
      {
        "heading": "Filtering and viewing",
        "body": "Use the filter buttons above the table to switch between All, Approved, Pending, and Rejected flights. Click View on any row (or tap on mobile) to open the flight detail modal showing all filed details, approval status, and any rejection note."
      },
      {
        "heading": "PIREP statuses",
        "body": null,
        "list": [
          {
            "label": "Approved",
            "desc": "Flight verified. Hours have been credited to your total."
          },
          {
            "label": "Pending",
            "desc": "Awaiting review. Hours not yet credited. Staff aim to review within 48 hours."
          },
          {
            "label": "Rejected",
            "desc": "Flight declined. A rejection note in the detail modal explains why. Hours not credited. You can re-file if the issue was a form error."
          }
        ]
      },
      {
        "heading": "Rejection notes",
        "body": "If a PIREP is rejected, you'll see a notification when you next log in. Open the flight in your logbook to read the note. Common reasons include a mismatch between your filed aircraft and your IF logbook, incorrect route details, or a duplicate submission."
      }
    ]
  },
  {
    "doc_id": "rank-progression",
    "label": "Ranks & Progression",
    "title": "Ranks & Progression",
    "icon_name": "Award",
    "admin_only": false,
    "sort_order": 6,
    "sections": [
      {
        "heading": "How ranks work",
        "body": "Your rank is calculated automatically from your total approved flight hours. Every time a PIREP is approved, the system checks whether you've crossed a rank threshold. If you have, your rank updates and your Discord role changes automatically \u2014 no action needed from you."
      },
      {
        "heading": "Rank tiers",
        "body": null,
        "list": [
          {
            "label": "New Pilot",
            "desc": "0 hours \u2014 Starting rank for all new members."
          },
          {
            "label": "Second Officer",
            "desc": "25 hours"
          },
          {
            "label": "First Officer",
            "desc": "100 hours"
          },
          {
            "label": "Senior First Officer",
            "desc": "200 hours"
          },
          {
            "label": "Captain",
            "desc": "400 hours"
          },
          {
            "label": "Chairman's Bronze",
            "desc": "750 hours"
          },
          {
            "label": "Chairman's Silver",
            "desc": "1,500 hours"
          },
          {
            "label": "Chairman's Gold",
            "desc": "2,500 hours"
          },
          {
            "label": "oneworld Discover",
            "desc": "3,000 hours"
          }
        ]
      },
      {
        "heading": "Hour multipliers",
        "body": "Routes of the Week routes sometimes carry a multiplier (e.g. \u00d71.5 or \u00d72.0). When you file using one of these routes, the multiplier is applied to your credited hours automatically. A 3-hour flight with a \u00d71.5 multiplier credits 4.5 hours toward your rank total.",
        "highlight": true
      },
      {
        "heading": "Linking your IF account",
        "body": "Linking your Infinite Flight account in your Profile enables auto-approval of PIREPs. Go to Profile, enter your IF User ID in the Infinite Flight section, and save. Your User ID can be found in the IF app under Settings \u2192 Account."
      },
      {
        "heading": "Discord rank roles",
        "body": "When you rank up, your Discord role updates automatically provided your Discord account is linked. If your crew centre rank doesn't match your Discord role, run /verify in the Discord server to re-sync."
      }
    ]
  },
  {
    "doc_id": "rotw-guide",
    "label": "Routes of the Week",
    "title": "Routes of the Week \u2014 Pilot Guide",
    "icon_name": "CalendarClock",
    "admin_only": false,
    "sort_order": 7,
    "sections": [
      {
        "heading": "What are Routes of the Week?",
        "body": "Routes of the Week (ROTW) is a curated weekly schedule of featured flights published each Monday. These routes are the recommended flights for the week and frequently carry bonus hour multipliers. Flying ROTW routes is the most efficient way to progress through ranks."
      },
      {
        "heading": "The ROTW window \u2014 critical rule",
        "body": "Each ROTW route is assigned to a specific day. To count as a valid ROTW flight, your aircraft must land within the 24-hour UTC window for that day \u2014 from 06:00Z to 05:59Z the following day. It is your landing time that counts, not your departure time. A flight that departs within the window but lands outside it does not qualify for that day's route.",
        "highlight": true
      },
      {
        "heading": "Example of the window rule",
        "body": "If Wednesday's ROTW window runs from Wednesday 06:00Z to Thursday 05:59Z, a flight departing Wednesday at 04:30Z that lands at 06:45Z is valid \u2014 the landing falls inside the window. A flight departing Wednesday at 03:00Z that lands at 05:45Z is not valid for Wednesday's route, even though the departure was on Wednesday. Plan long-haul flights with enough buffer so your landing falls inside the window."
      },
      {
        "heading": "Multipliers",
        "body": "Many ROTW routes carry a multiplier shown on the route card (e.g. \u00d71.5 or \u00d72.0). Multipliers are applied automatically when you file your PIREP via the ROTW page \u2014 you do not need to calculate the boosted hours yourself. Enter your actual block time and the system does the rest. A 4-hour flight with a \u00d71.5 multiplier credits 6 hours toward your rank total.",
        "highlight": true
      },
      {
        "heading": "How to fly a ROTW route",
        "body": null,
        "list": [
          {
            "label": "Check the schedule",
            "desc": "Go to Routes of the Week in the sidebar. Today's routes are highlighted automatically."
          },
          {
            "label": "Note the details",
            "desc": "Take note of your origin and destination, aircraft type and select the right livery on Infinite Flight."
          },
          {
            "label": "Plan your timing",
            "desc": "Make sure your expected landing time falls within the 06:00Z\u201305:59Z window for the assigned day."
          },
          {
            "label": "Fly the route",
            "desc": "Complete the flight in Infinite Flight using the correct callsign, aircraft, and livery."
          },
          {
            "label": "File your PIREP",
            "desc": "Return to the ROTW page and click File PIREP on that route. The form will pre-fill with the multiplier attached."
          }
        ]
      }
    ]
  },
  {
    "doc_id": "challenges",
    "label": "Challenges",
    "title": "Challenges",
    "icon_name": "Star",
    "admin_only": false,
    "sort_order": 8,
    "sections": [
      {
        "heading": "Beta feature \u2014 limited availability",
        "body": "Challenges are currently in beta and are only available to a select group of pilots. This feature is not yet open to all AVG members. If you don't see Challenges in your crew centre, you are not part of the current beta. Keep an eye on the Discord server for announcements about when Challenges will be rolled out more broadly.",
        "highlight": true
      },
      {
        "heading": "What are challenges?",
        "body": "Challenges are themed multi-leg events created by staff. Each challenge has a set timeframe to complete it within, a sequence of legs to fly in order, and specified aircraft for each leg. Some legs may also carry a bonus multiplier. Challenges are a great way to earn extra hours and push yourself beyond the regular schedule."
      },
      {
        "heading": "Bonus hours for top finishers",
        "body": "The first three pilots to complete a challenge are awarded bonus hours automatically once the challenge is finished. These are added to your total hours automatically \u2014 no action needed from you.",
        "highlight": true
      },
      {
        "heading": "How to participate",
        "body": null,
        "list": [
          {
            "label": "Find the challenge",
            "desc": "Go to the Challenges tab in the crew centre to see all active challenges, including the legs, aircraft, timeframe, and any multipliers."
          },
          {
            "label": "Enrol",
            "desc": "Click to enrol yourself in the challenge. You must enrol before starting your flights."
          },
          {
            "label": "Fly the legs in order",
            "desc": "Complete each leg in the sequence specified, using the correct aircraft for each. Order matters \u2014 legs cannot be skipped or swapped."
          },
          {
            "label": "File from the Challenges page",
            "desc": "You must file each PIREP from the Challenges page, not the standard PIREP form. This is what registers the flight as part of the challenge and ensures any leg multipliers are applied correctly."
          }
        ]
      },
      {
        "heading": "Challenge rules",
        "body": null,
        "list": [
          {
            "label": "File from the Challenges page",
            "desc": "PIREPs filed via the standard form will not count toward the challenge, even if the route matches."
          },
          {
            "label": "Fly in order",
            "desc": "Legs must be completed in the sequence listed. Do not skip ahead."
          },
          {
            "label": "Correct aircraft",
            "desc": "Use the aircraft specified for each leg. Standard AVG livery rules apply."
          },
          {
            "label": "Complete within the window",
            "desc": "All legs must be filed before the challenge closes. Partial completions do not qualify for bonus hours."
          },
          {
            "label": "Standard conduct applies",
            "desc": "All normal AVG flight standards apply during challenge flights."
          }
        ]
      }
    ]
  },
  {
    "doc_id": "career-mode",
    "label": "Career Mode",
    "title": "Career Mode",
    "icon_name": "Map",
    "admin_only": false,
    "sort_order": 9,
    "sections": [
      {
        "heading": "What is Career Mode?",
        "body": "Career Mode is an optional layer on top of your normal AVG flying. It simulates a pilot career \u2014 you're assigned a home hub and a specific aircraft, and you progress by flying realistic scheduled routes from airports your aircraft can actually reach. Career Mode runs alongside your regular flights; you don't have to choose one or the other."
      },
      {
        "heading": "Ferry flights",
        "body": "Once per week you may fly one ferry flight to reposition your aircraft to a new destination. Ferry flights must depart from an airport that your aircraft can reach via a scheduled route \u2014 you cannot teleport to a random airport. Ferry flights are logged as standard PIREPs and count toward your normal hour total.",
        "highlight": true
      },
      {
        "heading": "Aircraft changes",
        "body": "You may request one aircraft change every three months. Changes are granted at staff discretion \u2014 submit your request via a Discord ticket explaining which aircraft you'd like to move to and why. Hub changes follow the same process and the same three-month cooldown. Staff may approve changes outside this window in exceptional circumstances."
      },
      {
        "heading": "How career mode and normal flying interact",
        "body": "Career Mode flights and standard AVG flights are tracked separately in your profile but hours from both count toward the same rank total. You can fly a career route on Monday and a non-career ROTW route on Tuesday \u2014 there is no conflict. The only Career Mode-specific restriction is the one ferry flight per week limit."
      },
      {
        "heading": "Getting started",
        "body": "Click \"Career\" on the crew centre to enrol in Career Mode. You can then select your starting hub and aircraft. From there, check the scheduled routes available from your hub and start flying. Your career progression is tracked in your crew centre profile."
      }
    ]
  },
  {
    "doc_id": "staff-code-of-conduct",
    "label": "Staff Code of Conduct",
    "title": "Staff Guide \u2014 Code of Conduct",
    "icon_name": "ShieldCheck",
    "admin_only": true,
    "sort_order": 10,
    "sections": [
      {
        "heading": "Representing AVG as staff",
        "body": "As a staff member you represent Australia Virtual in everything you do \u2014 in the crew centre, in Discord, and on Infinite Flight. Pilots look to staff to set the standard. All pilot conduct rules apply to staff with higher expectations, not lower ones.",
        "highlight": true
      },
      {
        "heading": "Impartiality",
        "body": "Handle all pilot interactions fairly and consistently. Do not approve PIREPs for friends while holding others to a stricter standard. Do not use admin tools to advantage or disadvantage any pilot. If you have a personal conflict with a pilot, recuse yourself and hand the matter to another staff member."
      },
      {
        "heading": "Confidentiality",
        "body": "Do not share the contents of tickets, applications, or pilot account details with non-staff members. Internal staff discussions remain internal. Do not screenshot or forward admin panel information outside of authorised channels."
      },
      {
        "heading": "Use of admin tools",
        "body": null,
        "list": [
          {
            "label": "Least-privilege principle",
            "desc": "Only use the tools and permissions your role requires. Do not poke around in areas outside your remit."
          },
          {
            "label": "No destructive actions without authorisation",
            "desc": "Deleting flight history, banning accounts, or resetting pilot data requires sign-off from a senior staff member or admin unless the situation is an emergency."
          },
          {
            "label": "Document your actions",
            "desc": "Leave clear notes on PIREPs, tickets, and pilot records so other staff understand what was done and why."
          }
        ]
      },
      {
        "heading": "Conduct breaches by staff",
        "body": "Staff conduct breaches are handled by admins. Breaches may result in demotion, removal of staff permissions, or removal from AVG entirely. The same zero-tolerance rules around discrimination and bullying apply \u2014 staff are not exempt. All breaches will be notified to IFVARB, and serious breaches will be notified to Infinite Flight staff.",
        "highlight": true
      }
    ]
  },
  {
    "doc_id": "recruitment",
    "label": "Recruitment Pipeline",
    "title": "Staff Guide \u2014 Recruitment Pipeline",
    "icon_name": "ClipboardList",
    "admin_only": true,
    "sort_order": 11,
    "sections": [
      {
        "heading": "Accessing the pipeline",
        "body": "Go to Admin Panel \u2192 Recruitment. The Overview tab shows application stats and recent activity. The Pipeline tab shows every applicant and their current stage. Click a pilot card to expand their actions."
      },
      {
        "heading": "Step 1 \u2014 Review the application",
        "body": "When a pilot applies they will appear in the Applied section. Before taking any action, complete the following checks:",
        "list": [
          {
            "label": "IFVARB blacklist",
            "desc": "Check the applicant's IFC username against the IFVARB blacklist. If they appear on it, reject the application immediately. Do not disclose the blacklist as the reason \u2014 simply advise that their application was unsuccessful."
          },
          {
            "label": "Grade check",
            "desc": "Confirm the applicant is Grade 3 or above in Infinite Flight. Applications from pilots below Grade 3 should be rejected."
          },
          {
            "label": "IF account connected",
            "desc": "Check that the applicant has connected their Infinite Flight account as part of their application. If not, do not proceed until this is resolved."
          }
        ]
      },
      {
        "heading": "Step 2 \u2014 Send the exam",
        "body": "Before sending the exam, make sure you are logged into your VA's account on the Infinite Flight Community (IFC). All recruitment communications must go through this account \u2014 do not send anything from your personal IFC account. Once logged in, click Send Exam on the applicant's card. This generates a unique exam link and automatically sends the instructions to the applicant via IFC. The applicant has 72 hours to complete the exam from when the link is generated. They will move to the Exam Sent section of the pipeline automatically.",
        "highlight": true
      },
      {
        "heading": "Step 3 \u2014 After the exam",
        "body": "Once the applicant completes the exam they will move to the Approved section automatically. The pass mark is 70%. If an applicant fails, they remain in Exam Sent and can be reset at staff discretion to receive a new link."
      },
      {
        "heading": "Step 4 \u2014 Send the welcome DM",
        "body": "Once an applicant is in the Approved section, click Send Welcome DM on their card. This generates a Discord invite and formats it into a ready-to-send message which is copied to your clipboard automatically. Go to the original IFC conversation sent to the applicant and paste the message there. The applicant will remain in the Approved state until they join the Discord server and run /verify in #induction, which activates their crew centre account and assigns their rank roles.",
        "highlight": true
      },
      {
        "heading": "Rejected applications",
        "body": "If you need to reject an application at any stage, set the status to Rejected. The applicant's account will be deactivated and they will not be able to log in. Keep rejection notes professional \u2014 they may be visible to the applicant."
      },
      {
        "heading": "Exam details",
        "body": "Pass mark is 70%. The exam currently consists of 20 fixed questions \u2014 all applicants receive the same set. The plan is to move to a randomised question pool in future so no two exams are identical, but this is not yet in place. To view an applicant's answers and results, select View Results from their card while they are still in the Exam Sent stage of the pipeline. Once an applicant has been invited (moved to Approved), the exam results are no longer visible. Use Reset Exam to generate a new link if the original expires or staff decide to grant another attempt."
      }
    ]
  },
  {
    "doc_id": "managing-pilots",
    "label": "Managing Pilots",
    "title": "Staff Guide \u2014 Managing Pilots",
    "icon_name": "Users",
    "admin_only": true,
    "sort_order": 12,
    "sections": [
      {
        "heading": "Pilot list",
        "body": "Admin Panel \u2192 Pilots shows all approved members. Search by name, callsign, or IFC username. Click a pilot row to expand their edit panel inline."
      },
      {
        "heading": "Editable fields",
        "body": null,
        "list": [
          {
            "label": "Name / IFC username",
            "desc": "Update if the pilot changes their IFC username or there's a typo from their application. Changing a pilot's name will trigger the name to be automatically updated on Discord too."
          },
          {
            "label": "Role",
            "desc": "Pilot, Staff, or Admin. Staff members should also have a Staff Role assigned to control their specific permissions."
          },
          {
            "label": "Staff Role",
            "desc": "Grants a specific permission set (e.g. Recruitment Officer). Manage what each role can do in Admin Panel \u2192 Staff Roles."
          },
          {
            "label": "Status",
            "desc": "Approved, Pending, or Rejected. Setting to Rejected deactivates the account \u2014 pilot cannot log in or file PIREPs."
          },
          {
            "label": "Rank override",
            "desc": "Leave on Auto in most cases. The system sets rank by hours automatically. Use override only for special circumstances."
          },
          {
            "label": "Total flights / hours",
            "desc": "Only edit these to correct a data error. Changing hours triggers an automatic rank recalculation."
          }
        ]
      },
      {
        "heading": "Deleting flight history",
        "body": "In the edit panel, scroll to the Danger Zone. Delete All Flights & Reset Stats wipes all PIREPs and resets totals to zero. This cannot be undone \u2014 use only for confirmed fraudulent accounts.",
        "highlight": true
      },
      {
        "heading": "Activity monitoring",
        "body": "Admin Panel \u2192 Activity shows pilots who have not filed recently. The inactivity check can be triggered manually from this panel to send automated Discord warnings to flagged pilots."
      }
    ]
  },
  {
    "doc_id": "approving-pireps",
    "label": "Approving PIREPs",
    "title": "Staff Guide \u2014 Approving PIREPs",
    "icon_name": "CheckSquare",
    "admin_only": true,
    "sort_order": 13,
    "sections": [
      {
        "heading": "Accessing the queue",
        "body": "Go to Admin Panel \u2192 PIREPs. The Pending tab shows all PIREPs awaiting review, sorted oldest first. The All PIREPs tab shows full history paginated in groups of 50 \u2014 use this to look up specific flights or check for duplicates."
      },
      {
        "heading": "What to check",
        "body": null,
        "list": [
          {
            "label": "Route validity",
            "desc": "Check the departure and arrival ICAOs form a real and legitimate route. Cross-reference against the scheduled route catalogue if unsure."
          },
          {
            "label": "Flight time",
            "desc": "Time should be reasonable for the distance. Use common sense \u2014 a 2-hour PIREP for a Sydney\u2013London route is a red flag."
          },
          {
            "label": "IF badge",
            "desc": "A blue IF badge means the PIREP was auto-verified against the pilot's IF logbook. These rarely need further review \u2014 trust the system."
          },
          {
            "label": "Aircraft match",
            "desc": "Confirm the filed aircraft matches an approved type for that route."
          },
          {
            "label": "Duplicates",
            "desc": "Check the pilot hasn't already had the same flight approved. Use the All PIREPs tab filtered by pilot to check."
          }
        ]
      },
      {
        "heading": "Checking the IF logbook",
        "body": "If a PIREP lacks the auto-verification badge, you can manually cross-check the pilot's IF logbook via their profile. Do this once \u2014 there is no need to refresh or re-check repeatedly. The logbook data is fetched live and a single check is conclusive. Repeatedly hitting the logbook lookup strains the IF API and risks rate-limiting the entire system.",
        "highlight": true
      },
      {
        "heading": "Retry auto-approval",
        "body": "The retry auto-approval button re-runs the IF logbook check for a pending PIREP. Only use this once per PIREP \u2014 if it doesn't find a match on the first retry, re-running it will not produce a different result and will unnecessarily hit the IF API. If auto-approval fails after one retry, proceed with a manual review and approve or reject based on what you can verify.",
        "highlight": true
      },
      {
        "heading": "Approving or rejecting",
        "body": "Click \u2713 to approve \u2014 hours are credited immediately and the pilot gets a notification. Click \u2715 to open the reject modal. Always write a clear, specific rejection note so the pilot knows whether to re-file and what to fix. Vague notes like \"invalid flight\" are not acceptable \u2014 explain exactly what was wrong."
      },
      {
        "heading": "Editing a PIREP",
        "body": "Click Edit on any PIREP to correct fields like flight number, route, aircraft, or flight time before approving. Use this for minor errors rather than rejecting and making the pilot re-file. Document what you changed in the notes field."
      },
      {
        "heading": "If in doubt, communicate",
        "body": "If you suspect a falsified PIREP or anything else untoward, please open a ticket with the pilot and speak to them. What may appear as an intentional rulebreak may simply be a mistake, so always go in with an open mind. For non-policy breaches, you can just reject the PIREP, provide a reason and ask the pilot to open a ticket."
      }
    ]
  },
  {
    "doc_id": "leave-approval",
    "label": "Leave Approval",
    "title": "Staff Guide \u2014 Leave Approval",
    "icon_name": "CalendarClock",
    "admin_only": true,
    "sort_order": 14,
    "sections": [
      {
        "heading": "How pilots request leave",
        "body": "Pilots submit leave requests directly through the Leave page in the crew centre. Pilots cannot edit a request once it has been submitted. On the staff side, go to Admin Panel \u2192 Pilots \u2192 Leave Requests to view all requests, filterable by Pending, Approved, or Denied."
      },
      {
        "heading": "Our approach to leave",
        "body": "Infinite Flight is a hobby. Members should never feel like they need to justify taking a break, and it is not staff's place to decide whether someone's reason is \"valid enough.\" Approve leave requests freely \u2014 even vague or unspecified reasons should be approved in most cases. A pilot notifying us of their absence is doing us a courtesy, and we should treat it as such. If you are ever unsure, consult with another staff member rather than making a call alone.",
        "highlight": true
      },
      {
        "heading": "Actioning a leave request",
        "body": null,
        "list": [
          {
            "label": "Review the request",
            "desc": "Check the dates provided. You do not need a detailed reason \u2014 a rough timeframe is enough to action it."
          },
          {
            "label": "Approve promptly",
            "desc": "Approve the request in the Leave Requests panel. This pauses the inactivity timer for the pilot automatically."
          },
          {
            "label": "Deny only if necessary",
            "desc": "Denial should be rare and only used where there is a clear problem (e.g. duplicate request, conflicting active status). If unsure, approve and flag it to other staff."
          }
        ]
      },
      {
        "heading": "Early returns",
        "body": "Pilots cannot edit or cancel their own leave once submitted. If a pilot returns early, they should open a ticket on Discord to let staff know. On the staff side, there is no edit function \u2014 to close out the leave early, deny the already-approved request and include a clear reason noting the early return date. For example: \"Returned early on 12 April 2026.\" The pilot will be able to see this reason, so keep it professional and factual.",
        "highlight": true
      },
      {
        "heading": "Approval and denial reasons are visible to pilots",
        "body": "Whatever you write in an approval or denial reason is visible to the pilot. Always write professionally and factually \u2014 reasons should be clear and courteous. Avoid informal language or anything that could be read as dismissive. When in doubt, keep it brief and neutral."
      }
    ]
  },
  {
    "doc_id": "discord-ticket-tool",
    "label": "Discord Ticket Tool",
    "title": "Staff Guide \u2014 Discord Ticket Tool",
    "icon_name": "TicketCheck",
    "admin_only": true,
    "sort_order": 15,
    "sections": [
      {
        "heading": "Overview",
        "body": "The ticket tool is the primary way pilots contact staff and the primary way staff manage support interactions. Every leave request, conduct complaint, appeal, and general enquiry should go through a ticket. Keep communication inside tickets \u2014 not in DMs \u2014 so there is a record other staff can access if needed."
      },
      {
        "heading": "Creating a ticket from a message",
        "body": "You can create a ticket directly from any message in Discord without asking the user to open one themselves. Right-click the message (or tap and hold on mobile), select More \u2192 Apps \u2192 Start Ticket. This pulls the message and the user directly into a new ticket where you can assist them. Use this instead of telling someone to go and create a ticket \u2014 it is faster and creates less friction for the pilot. This is also the right approach when a member posts something inappropriate in #chat or another channel: start a ticket from the message to handle the moderation privately rather than in public.",
        "highlight": true
      },
      {
        "heading": "Ticket commands",
        "body": null,
        "list": [
          {
            "label": "/open",
            "desc": "Opens a new ticket to initiate contact with a pilot. Use this when you need to reach out to a pilot proactively \u2014 e.g. to follow up on a rejected PIREP, discuss a conduct issue, or progress a recruitment application. Usage: /open subject, i.e. /open PIREP Query"
          },
          {
            "label": "/add",
            "desc": "Adds a user to an existing ticket. For example, after opening a ticket with /open, use /add to bring the relevant pilot in. Usage: /add @user"
          },
          {
            "label": "/notes",
            "desc": "Creates a notes thread on the ticket visible to staff only. Use this for private discussion with other staff about the ticket contents \u2014 for example, if you are unsure whether to transfer a ticket, use /notes to start a thread and tag the relevant staff member. Usage: /notes"
          },
          {
            "label": "/claim",
            "desc": "Claims an open ticket and assigns it to you. Claiming signals to other staff that you are handling it. Always claim a ticket before working on it to avoid two staff responding simultaneously. Usage: click Claim button or /claim in the ticket channel."
          },
          {
            "label": "/transfer",
            "desc": "Transfers a claimed ticket to another staff member. Use when the issue is outside your remit or you need to hand off. Usage: /transfer @staffmember"
          },
          {
            "label": "/closerequest",
            "desc": "Sends a close request to the pilot, asking them to confirm the issue is resolved before the ticket is closed. Use this for tickets where resolution is ambiguous rather than closing unilaterally \u2014 it gives the pilot a chance to flag anything outstanding. Usage: /closerequest"
          }
        ]
      },
      {
        "heading": "Resolution notes",
        "body": "Every ticket must have a resolution note entered before it is closed. Resolution notes are visible to the pilot \u2014 they are not private. A good resolution note includes: what the pilot's issue was, what action was taken (e.g. PIREP approved, account updated, leave marked), and whether any follow-up is required. Vague notes like \"resolved\" are not acceptable.",
        "highlight": true
      },
      {
        "heading": "Good resolution note examples",
        "body": null,
        "list": [
          {
            "label": "Query about callsign",
            "desc": "Pilot asked for callsign. Educated and referred to docs page for further information."
          },
          {
            "label": "PIREP query",
            "desc": "Pilot queried rejection of PIREP #4821. Reviewed \u2014 aircraft mismatch confirmed. Advised pilot to re-file with correct aircraft. No further action."
          },
          {
            "label": "Conduct report",
            "desc": "Pilot reported member X for harassment in #chat. Reviewed message history. Advised investigation underway."
          }
        ]
      },
      {
        "heading": "Escalating tickets",
        "body": "If a ticket involves a conduct breach, account ban, or anything requiring higher authority, use /transfer to hand it to an admin rather than acting unilaterally. When in doubt, use /notes and request support from your colleagues."
      }
    ]
  },
  {
    "doc_id": "bot-commands",
    "label": "Bot Commands",
    "title": "Staff Guide \u2014 Discord Bot Commands",
    "icon_name": "Bot",
    "admin_only": true,
    "sort_order": 16,
    "sections": [
      {
        "heading": "Public commands",
        "body": null,
        "list": [
          {
            "label": "/verify",
            "desc": "Pilots use this to verify their account. Enter IFC username to link Discord and activate the crew centre account."
          },
          {
            "label": "/stats",
            "desc": "View your own or another pilot's stats. Usage: /stats or /stats @pilot"
          },
          {
            "label": "/leaderboard",
            "desc": "Shows the top pilots by total flight hours."
          },
          {
            "label": "/rotw",
            "desc": "Displays this week's featured routes by day."
          }
        ]
      },
      {
        "heading": "Staff-only commands",
        "body": null,
        "list": [
          {
            "label": "/manualverify",
            "desc": "Manually approve and verify a pilot. Usage: /manualverify ifc_username:alexev discord_user:@Alex"
          },
          {
            "label": "/linkifc",
            "desc": "Update the IFC username on an existing account. Usage: /linkifc discord_user:@Alex ifc_username:newusername"
          },
          {
            "label": "/linkdiscord",
            "desc": "Link a Discord account to a crew centre account. Usage: /linkdiscord ifc_username:alexev discord_user:@Alex"
          }
        ]
      },
      {
        "heading": "Bot permissions",
        "body": "Staff commands are restricted to members with the Discord role set via DISCORD_STAFF_ROLE_ID in the server config. If a staff member cannot use these commands, check that their Discord role ID matches the configured value. This is separate from crew centre staff roles.",
        "highlight": true
      }
    ]
  },
  {
    "doc_id": "rotw-process",
    "label": "ROTW Process",
    "title": "Staff Guide \u2014 Routes of the Week Process",
    "icon_name": "RefreshCw",
    "admin_only": true,
    "sort_order": 17,
    "sections": [
      {
        "heading": "When ROTW is published",
        "body": "Routes of the Week are published every Monday. The publishing staff member is responsible for having the schedule ready before 06:00Z Monday so it's available from the start of the first window. Late publication means pilots miss the window \u2014 coordinate in advance if the usual publisher is unavailable.",
        "highlight": true
      },
      {
        "heading": "Save vs. Publish \u2014 important distinction",
        "body": "When adding routes to the schedule, always click Save \u2014 not Publish. Saving stores the schedule and allows the system to automatically publish it and send the announcement at the correct time. Clicking Publish immediately sends the announcement to Discord, which you do not want to do manually. Build and save the schedule in advance, then let the system handle the rest.",
        "highlight": true
      },
      {
        "heading": "Building the schedule",
        "body": "Go to Admin Panel \u2192 ROTW and create the week's schedule. To add a route, start typing an ICAO airport code and the system will search the route catalogue and return matching options \u2014 select the route from the results. Assign one or more routes to each day. Double-check your selections before saving, as a wrong route here affects every pilot's view for the whole day."
      },
      {
        "heading": "Choosing routes \u2014 IF ATC schedule",
        "body": "Check the official Infinite Flight ATC schedule before building the week's ROTW. Where possible, include at least one route that is featured on the IF ATC schedule for that day \u2014 these airports will be active and busy, which makes for a better flying experience. For remaining slots, try to use featured airports from the IF schedule even if the route itself is not directly featured."
      },
      {
        "heading": "Choosing routes \u2014 themed days",
        "body": "Where there are no AVG routes to or from a featured airport, pick a theme for the day rather than filling slots arbitrarily. A themed day gives the schedule coherence and makes it more engaging. Examples include: WestJet operations across Canada, A220 routes in Australia, routes within a specific region near the featured airports, or a particular aircraft type focus. The theme does not need to be complex \u2014 just intentional."
      },
      {
        "heading": "Setting multipliers",
        "body": "Multipliers are set per-route when building the schedule. Available values are \u00d71.25, \u00d71.5, \u00d71.75, and \u00d72.0. As a general guide, reserve higher multipliers for shorter flights \u2014 a very short hop might warrant \u00d72.0, a medium-haul \u00d71.5, a long-haul \u00d71.25, and ultra long-haul routes generally no multiplier. The intent is to make shorter flights more worthwhile, not to inflate hours on routes that are already long. Set criteria will be formalised at a later date \u2014 use your judgement in the meantime and consult other staff if unsure."
      },
      {
        "heading": "The 06:00Z window",
        "body": "Each day's window runs from 06:00Z to 05:59Z the following day. A pilot's landing time must fall within this window for the flight to be valid. When reviewing ROTW PIREPs, check the actual landing time in the IF logbook \u2014 not the departure time and not the PIREP submission time. Flights that departed inside the window but landed outside it are not valid.",
        "highlight": true
      },
      {
        "heading": "Reviewing ROTW PIREPs",
        "body": null,
        "list": [
          {
            "label": "Check landing time",
            "desc": "Confirm the IF logbook landing time falls within the 06:00Z\u201305:59Z window for the correct day."
          },
          {
            "label": "Check multiplier",
            "desc": "Confirm the multiplier was applied \u2014 it should appear as a banner on the filed PIREP. If missing, check if the pilot filed via the ROTW page or manually."
          },
          {
            "label": "One ROTW per day slot",
            "desc": "Reject duplicate ROTW PIREPs for the same day \u2014 one per day slot per pilot."
          },
          {
            "label": "Route match",
            "desc": "Confirm the flight number, departure, and arrival match the scheduled ROTW route for that day."
          }
        ]
      },
      {
        "heading": "If a route has an error after saving",
        "body": "If you spot an error in a saved ROTW route (wrong route selected, wrong multiplier), correct it in the admin panel before the schedule goes live. If the error is caught after it has already published and pilots have started filing, correct it immediately and post a notice in the ROTW Discord channel. Review any affected PIREPs manually \u2014 do not mass-reject without checking individual circumstances."
      }
    ]
  },
  {
    "doc_id": "staff-challenges",
    "label": "Creating Challenges",
    "title": "Staff Guide \u2014 Creating Challenges",
    "icon_name": "Star",
    "admin_only": true,
    "sort_order": 18,
    "sections": [
      {
        "heading": "Overview",
        "body": "Challenges are themed multi-leg events that staff create and publish for pilots to complete within a set timeframe. The first three pilots to complete a challenge receive bonus hours automatically. Challenges are managed from the Challenges section in the Admin Panel."
      },
      {
        "heading": "Setting up a challenge",
        "body": null,
        "list": [
          {
            "label": "Theme and name",
            "desc": "Give the challenge a clear, engaging name and theme. The theme should be reflected in the legs chosen \u2014 e.g. a trans-Tasman series, a specific aircraft type tour, or a regional focus."
          },
          {
            "label": "Timeframe",
            "desc": "Set a start and end date. Make sure the window is long enough for pilots across different time zones and schedules to realistically complete all legs."
          },
          {
            "label": "Legs",
            "desc": "Add each leg in order, specifying the route and aircraft for each. Pilots must fly them in the sequence you define, so make sure the routing is logical."
          },
          {
            "label": "Multipliers",
            "desc": "Optionally assign a multiplier to individual legs. The same general guidance applies as ROTW \u2014 reserve higher multipliers for shorter legs."
          },
          {
            "label": "Banner image",
            "desc": "You can optionally upload a banner image for the challenge. This is not mandatory but adds visual appeal to the challenge page. If in doubt, skip it."
          }
        ]
      },
      {
        "heading": "Bonus hours for top finishers",
        "body": "The system automatically awards bonus hours to the first three pilots to complete the challenge. As a general guide: 1st place \u2014 25 hours, 2nd place \u2014 10 hours, 3rd place \u2014 5 hours. These are added to pilot totals automatically once their final leg is approved. Confirm the bonus hour values are correctly set before publishing the challenge.",
        "highlight": true
      },
      {
        "heading": "How pilots file challenge PIREPs",
        "body": "Pilots must file each leg from the Challenges page in the crew centre, not from the standard PIREP form. Filing from the Challenges page is what registers the flight as part of the challenge and ensures leg multipliers are applied. If a pilot files via the standard form, the flight will not count toward the challenge \u2014 advise them to file the correct leg from the Challenges page instead.",
        "highlight": true
      },
      {
        "heading": "Reviewing challenge PIREPs",
        "body": "Challenge PIREPs go through the same approval process as standard PIREPs. Check the aircraft matches the leg requirement and that legs are being filed in the correct order. If a leg is filed out of sequence or with the wrong aircraft, reject it with a clear note explaining what needs to be corrected."
      },
      {
        "heading": "Publishing a challenge",
        "body": "Once the challenge is built and double-checked, publish it. Unlike ROTW, publishing a challenge does not need to be timed to a specific window \u2014 publish when the challenge is ready to open. Announce it in Discord so pilots know it's live!"
      }
    ]
  }
];

// The text was written for one VA; swap in this one's name
const DOCS = JSON.parse(JSON.stringify(STARTER_DOCS)
  .replace(/Australia Virtual Group/g, brand.name)
  .replace(/Australia Virtual/g, brand.shortName)
  .replace(/\bAVG\b/g, brand.abbreviation)
  .replace(/a Sydney\\u2013London route/g, 'an ultra long-haul route')
  .replace(/a Sydney–London route/g, 'an ultra long-haul route'));

async function main() {
  const pb = await getAdminClient();

  let created = 0, skipped = 0;
  for (const doc of DOCS) {
    let exists = null;
    try {
      exists = await pb.collection('docs').getFirstListItem(`doc_id = "${doc.doc_id}"`, { requestKey: null });
    } catch { }

    if (exists) {
      console.log(`skip (already exists): ${doc.doc_id}`);
      skipped++;
      continue;
    }

    console.log(`${live ? 'creating' : '[dry] would create'}: ${doc.doc_id} (${doc.sections.length} sections)`);
    if (live) {
      await pb.collection('docs').create({
        doc_id:     doc.doc_id,
        label:      doc.label,
        title:      doc.title,
        icon_name:  doc.icon_name,
        admin_only: doc.admin_only,
        sort_order: doc.sort_order,
        sections:   JSON.stringify(doc.sections),
      });
    }
    created++;
  }

  console.log(`\n${live ? 'Done' : 'Dry run complete'} — ${created} ${live ? 'created' : 'would be created'}, ${skipped} skipped.`);
  if (!live) console.log('Re-run with --live to actually insert.');
}

main().catch(err => { console.error(err); process.exit(1); });
