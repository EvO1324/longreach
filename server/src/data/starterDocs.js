/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// The docs every crew centre starts with (Resources › Docs). Admins can edit
// them in the crew centre. {name}, {short}, {callsign} and {callsign_short}
// are filled in with the VA's own when they're added. A doc with a plugin is
// only shown while that plugin is on.
//
// Section: { heading, body?, highlight?, list?: [{ label, desc }] }

module.exports = [
  // Pilots

  {
    doc_id: 'getting-started', label: 'Getting started', title: 'Getting started', icon_name: 'Plane', sort_order: 0,
    sections: [
      { heading: 'Welcome', body: 'This is the {short} crew centre. You file your flights here, track your hours and rank, and find everything you need to fly with us.' },
      { heading: 'Join Discord and verify', body: 'Join the {short} Discord server using the invite in your welcome message. Then run /verify with your Infinite Flight Community username. This links your Discord account to the crew centre and gives you your roles.', highlight: true },
      { heading: 'Link your Infinite Flight account', body: 'Open your profile and link your Infinite Flight account. It lets your flights be approved automatically, and lets you sign in with Continue with Infinite Flight.' },
      { heading: 'Fly with your callsign', body: 'Your callsign is on your profile, for example {callsign}. Use it as your callsign in Infinite Flight so staff and the live map can see you flying with {short}.' },
      { heading: 'Your dashboard', body: 'The dashboard shows your hours, flights, rank progress and recent flights, plus news and notices from staff.' },
    ],
  },
  {
    doc_id: 'finding-a-route', label: 'Finding a route', title: 'Finding a route', icon_name: 'Search', sort_order: 1,
    sections: [
      { heading: 'The Routes page', body: 'Search every {short} route by flight number, airport, aircraft or flight time. Press File PIREP on a route after you\'ve flown it and most of the form is filled in for you.' },
      { heading: 'Aircraft and livery', body: 'Fly one of the aircraft listed on the route, in the {short} livery where there is one. Automatic approval checks both, so the wrong aircraft or livery sends your PIREP to staff instead.', highlight: true },
      { heading: 'Locked routes', body: 'Some aircraft unlock as you rank up, and so can codeshare routes. A locked route shows the rank you need. Routes of the Week, events and challenges are open to every rank.' },
      { heading: 'Live map', body: 'The live map shows {short} pilots flying right now on the Expert Server.' },
    ],
  },
  {
    doc_id: 'filing-a-pirep', label: 'Filing a PIREP', title: 'Filing a PIREP', icon_name: 'CheckSquare', sort_order: 2,
    sections: [
      { heading: 'How to file', list: [
        { label: 'Pick the route', desc: 'From File PIREP, or press File PIREP on the Routes or Routes of the Week page.' },
        { label: 'Enter your flight time', desc: 'Your actual block time, gate to gate. Not the estimate on the route.' },
        { label: 'Submit', desc: 'You\'ll see straight away whether it was approved or sent to staff.' },
      ] },
      { heading: 'Automatic approval', body: 'When you file, your Infinite Flight logbook is checked for a matching flight: the same departure and arrival, landed recently (within 36 hours by default), in the right aircraft and livery. If it all matches, the PIREP is approved and your hours are added at once. If not, it waits for staff to review.', highlight: true },
      { heading: 'To be approved automatically', list: [
        { label: 'Link your Infinite Flight account', desc: 'Without it there\'s nothing to check against.' },
        { label: 'File soon after landing', desc: 'Older flights fall outside the window and go to staff.' },
        { label: 'Land where you filed', desc: 'Diverted? File the route you actually flew, or let staff know.' },
      ] },
      { heading: 'Multipliers', body: 'Some flights earn extra hours: Routes of the Week, events, a bonus from your rank, or a multiplier staff have given you. Only one applies per PIREP. Your credited hours are your flight time times the multiplier.' },
      { heading: 'If it\'s rejected', body: 'Staff add a reason, which you can see in your logbook. Open the PIREP there and reply under Comments if you want to explain. A pending PIREP can\'t be filed twice, so wait for staff rather than filing it again.' },
    ],
  },
  {
    doc_id: 'logbook-and-stats', label: 'Logbook and statistics', title: 'Logbook and statistics', icon_name: 'BookOpen', sort_order: 3,
    sections: [
      { heading: 'Logbook', body: 'Every PIREP you\'ve filed, with its status: approved, pending or rejected. Open one to see its details, multiplier, landing stats and comments. Use the comments to ask staff about a PIREP. A NEW REPLY tag means staff have answered.' },
      { heading: 'Statistics', body: 'Your totals, month by month, plus your most flown routes, aircraft and airports. {short}-wide stats are there too.' },
      { heading: 'In Discord', list: [
        { label: '/stats', desc: 'Crew centre stats for you or another pilot.' },
        { label: '/leaderboard', desc: 'Top pilots by hours, all time or for a period.' },
        { label: '/ifstats', desc: 'Infinite Flight stats for a pilot.' },
      ] },
    ],
  },
  {
    doc_id: 'ranks', label: 'Ranks', title: 'Ranks', icon_name: 'Award', sort_order: 4,
    sections: [
      { heading: 'How ranks work', body: 'Ranks go by your credited hours, multipliers included. You\'re promoted automatically when you reach the hours for the next rank. It\'s announced on Discord and your role changes.' },
      { heading: 'What a rank can unlock', list: [
        { label: 'Aircraft', desc: 'Bigger types unlock at higher ranks.' },
        { label: 'Codeshares', desc: 'Routes flown under partner airlines.' },
        { label: 'Bonus hours', desc: 'A multiplier on every flight.' },
        { label: 'Manual PIREPs', desc: 'Filing without the usual aircraft checks.' },
      ] },
      { heading: 'See the ranks', body: 'Your progress is on your dashboard. Run /ranks in Discord for every rank and what it unlocks.' },
    ],
  },
  {
    doc_id: 'activity-and-leave', label: 'Activity and leave', title: 'Activity and leave', icon_name: 'CalendarClock', sort_order: 5,
    sections: [
      { heading: 'Staying active', body: 'Pilots who haven\'t flown for a while are warned on Discord and, if they still don\'t fly, archived. By default that\'s after 30 days without a flight, with a warning a week before. New pilots and pilots on approved leave are left alone.', highlight: true },
      { heading: 'Requesting leave', body: 'Going away? Request leave on the Leave page with your dates and a reason. Staff approve it, and while it\'s approved activity checks skip you.' },
      { heading: 'Changing leave', body: 'You can cancel a request while it\'s still pending. Once it\'s approved, ask staff to change it. Requests can\'t overlap.' },
      { heading: 'Archived?', body: 'Ask staff to reactivate your account. Your hours and flights are kept.' },
    ],
  },
  {
    doc_id: 'routes-of-the-week', label: 'Routes of the Week', title: 'Routes of the Week', icon_name: 'Star', sort_order: 6, plugin: 'routesOfTheWeek',
    sections: [
      { heading: 'What they are', body: 'Staff pick routes for each day of the week, often with bonus hours. The week\'s routes are posted on Discord every Monday.' },
      { heading: 'Flying one', body: 'Fly the route on its day, then press File PIREP on the Routes of the Week page so the multiplier is applied. They\'re open to every rank, whatever the aircraft.', highlight: true },
      { heading: 'In Discord', body: 'Run /rotw for this week\'s schedule.' },
    ],
  },
  {
    doc_id: 'career-mode', label: 'Career mode', title: 'Career mode', icon_name: 'Briefcase', sort_order: 7, plugin: 'career',
    sections: [
      { heading: 'How it works', body: 'Pick a hub and an aircraft type. From then on you fly routes departing from wherever your aircraft is, in that aircraft. Each flight moves you to where you landed.' },
      { heading: 'Ferry flights', body: 'Once a week you can ferry your aircraft to any airport with routes for it, to get somewhere new.' },
      { heading: 'Changing hub or aircraft', body: 'Your hub and aircraft are locked for 3 months after you choose them.', highlight: true },
      { heading: 'Leaving career mode', body: 'You can leave any time, but your career stats are reset and can\'t be recovered. Your normal hours and flights aren\'t affected.' },
      { heading: 'In Discord', body: 'Run /career to see where you are.' },
    ],
  },
  {
    doc_id: 'events', label: 'Events', title: 'Events', icon_name: 'CalendarClock', sort_order: 8, plugin: 'events',
    sections: [
      { heading: 'Signing up', body: 'Open an event on the Events page and sign up. If it has gates, pick one. The event\'s Discord post shows who\'s on which gate.' },
      { heading: 'Logging the flight', body: 'Fly the event route and file it from File PIREP. You can log it from 2 hours before the event starts until 48 hours after it ends. Any event multiplier is applied for you.', highlight: true },
      { heading: 'Good to know', body: 'Event routes are open to every rank. The Discord post updates as pilots land.' },
    ],
  },
  {
    doc_id: 'challenges', label: 'Challenges', title: 'Challenges', icon_name: 'Trophy', sort_order: 9, plugin: 'challenges',
    sections: [
      { heading: 'What they are', body: 'Multi-leg campaigns that run for a set time. Fly each leg in order to finish.' },
      { heading: 'Taking part', body: 'Enrol on the Challenges page, then fly each leg and file it as normal. A leg counts once its PIREP is approved.', highlight: true },
      { heading: 'Leaderboard and prizes', body: 'Each challenge has a leaderboard. Some give bonus hours to the first finishers. Challenge legs are open to every rank.' },
    ],
  },
  {
    doc_id: 'live-mode', label: 'Live Mode', title: 'Live Mode', icon_name: 'Satellite', sort_order: 10, plugin: 'liveMode',
    sections: [
      { heading: 'What it is', body: 'A shared {short} fleet in Infinite Flight\'s Live Mode. You book a real aircraft, fly it, and it\'s where you left it for the next pilot. Access is by invitation from staff.' },
      { heading: 'Booking', list: [
        { label: 'Up to 6 legs per booking', desc: 'Routes come from the {short} route list, or set your own.' },
        { label: 'Up to 2 bookings at a time', desc: 'Cancel one you won\'t fly so someone else can.' },
        { label: 'Start on time', desc: 'Not airborne within 4 hours of your start time and the booking is released.' },
        { label: 'Crew', desc: 'Up to 3 pilots can share a booking.' },
      ] },
      { heading: 'Flying', body: 'With an hour left to land you get a Discord message with an Extend button (up to 3 extra hours). When you land, the bot asks you to file your PIREP, which is approved automatically. Once your last leg is filed, the aircraft is free.', highlight: true },
      { heading: 'In Discord', list: [
        { label: '/liveboard', desc: 'The fleet right now: in use, booked and free.' },
        { label: '/livebookings', desc: 'Your bookings.' },
        { label: '/livestats', desc: 'Your Live Mode flights and hours.' },
        { label: '/liveleaderboard', desc: 'Top Live Mode pilots.' },
      ] },
    ],
  },
  {
    doc_id: 'atc-sessions', label: 'ATC sessions', title: 'ATC sessions', icon_name: 'Radio', sort_order: 11, plugin: 'atc',
    sections: [
      { heading: 'Logging a session', body: 'IFATC controllers can log sessions from File PIREP › ATC Session. They\'re approved straight away and count as ATC hours, kept separate from your flight hours.' },
      { heading: 'Active ATC', body: 'The dashboard shows who\'s controlling on the Expert Server now. Run /atc in Discord for the same.' },
    ],
  },
  {
    doc_id: 'discord-commands', label: 'Discord commands', title: 'Discord commands', icon_name: 'Bot', sort_order: 12,
    sections: [
      { heading: 'Everyone', list: [
        { label: '/verify', desc: 'Link your Discord account to the crew centre.' },
        { label: '/stats', desc: 'Crew centre stats for a pilot.' },
        { label: '/leaderboard', desc: 'Top pilots by hours.' },
        { label: '/ranks', desc: 'Every rank and what it unlocks.' },
        { label: '/ifstats', desc: 'Infinite Flight stats for a pilot.' },
        { label: '/liveflights', desc: '{short} pilots flying on the Expert Server now.' },
      ] },
      { heading: 'With plugins switched on', body: 'Depending on what {short} uses, you\'ll also see /rotw, /career, /atc and the Live Mode commands (/liveboard, /livebookings, /livestats, /liveleaderboard).' },
    ],
  },
  {
    doc_id: 'getting-help', label: 'Getting help', title: 'Getting help', icon_name: 'TicketCheck', sort_order: 13,
    sections: [
      { heading: 'Ask staff', body: 'Message a member of staff on Discord. If {short} uses support tickets, press Open a ticket (or pick a topic) in the support channel and you\'ll get a private channel with the staff team.' },
      { heading: 'Something broken?', body: 'Tell staff what you were doing and what happened. A screenshot helps.' },
    ],
  },
  {
    doc_id: 'code-of-conduct', label: 'Code of conduct', title: 'Code of conduct', icon_name: 'ShieldCheck', sort_order: 14,
    sections: [
      { heading: 'Respect', body: 'Treat everyone with respect, on Discord, in the crew centre and anywhere you represent {short}. Harassment, discrimination and hate speech aren\'t tolerated.', highlight: true },
      { heading: 'In the sim', body: 'Follow Infinite Flight\'s rules and ATC instructions. Expert Server conduct reflects on {short}.' },
      { heading: 'Honest flying', body: 'File the flights you actually flew, with your real flight time.' },
      { heading: 'Problems', body: 'If something isn\'t right, tell staff rather than arguing in public channels.' },
    ],
  },

  // Staff

  {
    doc_id: 'staff-getting-around', label: 'Getting around', title: 'Staff guide: getting around', icon_name: 'ClipboardList', sort_order: 100, admin_only: true,
    sections: [
      { heading: 'The admin panel', body: 'Everything staff do is in the admin panel, from the sidebar. You only see the parts your staff role allows.' },
      { heading: 'Sections', list: [
        { label: 'Pilots', desc: 'Active pilots, recruitment, activity, leave and staff applications.' },
        { label: 'Operations', desc: 'PIREPs, NOTAMs, news, tickets, the audit log, import and VA Health.' },
        { label: 'Network', desc: 'Routes, Routes of the Week, fleet, airlines, events and challenges.' },
        { label: 'Configuration', desc: 'Ranks, badges, staff roles, multipliers, assets, site settings, plugins, connections and updates. Admins only.' },
      ] },
      { heading: 'Staff roles', body: 'Admins give staff a role in Staff Roles. Each role is a set of permissions: viewing and editing pilots, seeing emails, approving and rejecting PIREPs, recruitment, NOTAMs and news, the audit log, staff applications and events.' },
      { heading: 'Audit log', body: 'Every staff action is recorded with who did it and when.' },
    ],
  },
  {
    doc_id: 'staff-recruitment', label: 'Recruitment', title: 'Staff guide: recruitment', icon_name: 'Users', sort_order: 101, admin_only: true,
    sections: [
      { heading: 'How pilots join', body: 'Admins choose this in Recruitment › Recruitment settings: the crew centre\'s own exam, an external exam (a link, say to a Google Form, that staff mark), or no exam.' },
      { heading: 'The pipeline', list: [
        { label: 'Applied', desc: 'New applications. Check their Infinite Flight profile and grade.' },
        { label: 'Exam sent', desc: 'They\'ve been sent the exam. Own-exam results show here, with a transcript.' },
        { label: 'Approved', desc: 'Send the welcome message with the Discord invite. They finish by running /verify.' },
        { label: 'Rejected', desc: 'Reconsider moves them back to Applied.' },
      ] },
      { heading: 'Messages', body: 'Contact and Welcome open an Infinite Flight Community message, or copy it to your clipboard, ready to send. Exam links from the crew centre\'s own exam expire after 72 hours. Resend makes a new one.', highlight: true },
      { heading: 'Own exam', body: 'Manage Exam is where you write topics and questions, choose how many questions come from each topic, and set the pass mark.' },
      { heading: 'Watchlist', body: 'Add Infinite Flight Community usernames to watch or block. They\'re flagged if they apply.' },
      { heading: 'Verification problems', list: [
        { label: '/manualverify', desc: 'Verify a pilot by IFC username.' },
        { label: '/linkdiscord', desc: 'Link a Discord account to a pilot.' },
        { label: '/linkifc', desc: 'Link an IFC username to a Discord member.' },
      ] },
    ],
  },
  {
    doc_id: 'staff-pireps', label: 'Reviewing PIREPs', title: 'Staff guide: reviewing PIREPs', icon_name: 'CheckSquare', sort_order: 102, admin_only: true,
    sections: [
      { heading: 'The queue', body: 'PIREPs that weren\'t approved automatically wait in Operations › PIREPs. Each one shows which checks passed and failed: Infinite Flight account linked, route, date and aircraft or livery.' },
      { heading: 'Deciding', body: 'Compare it with the pilot\'s Infinite Flight logbook. Approve it, or reject it with a reason the pilot will see. The reason starts the PIREP\'s comment thread, where you and the pilot can reply. Pilots who reply show at the top of the PIREPs page. Approving adds the hours and can promote them.', highlight: true },
      { heading: 'Common reasons it needs a look', list: [
        { label: 'No Infinite Flight account linked', desc: 'Ask them to link it on their profile.' },
        { label: 'Filed late', desc: 'Outside the automatic approval window.' },
        { label: 'Wrong aircraft or livery', desc: 'Different to the route or what they filed.' },
        { label: 'Diversion', desc: 'Landed somewhere else.' },
      ] },
      { heading: 'Settings', body: 'Admins can change the automatic approval window, or switch automatic approval off, in Site settings.' },
    ],
  },
  {
    doc_id: 'staff-pilots', label: 'Pilots, activity and leave', title: 'Staff guide: pilots, activity and leave', icon_name: 'Users', sort_order: 103, admin_only: true,
    sections: [
      { heading: 'Pilot details', body: 'Open a pilot from Active Pilots to see their flights and hours, edit their details, change their role or staff role, give Live Mode access, or archive them. Archived pilots keep their flights and can be reactivated.' },
      { heading: 'Activity', body: 'Pilots → Activity sets how long a pilot can go without flying before they\'re archived, when they\'re warned, and whether there\'s a final warning. The check runs once a day and posts warnings on Discord.' },
      { heading: 'Leave', body: 'Approve or deny requests in Leave Requests. Approved leave keeps a pilot out of activity checks until it ends.', highlight: true },
    ],
  },
  {
    doc_id: 'staff-network', label: 'Routes, fleet and ranks', title: 'Staff guide: routes, fleet and ranks', icon_name: 'Map', sort_order: 104, admin_only: true,
    sections: [
      { heading: 'Routes', body: 'Add, edit and deactivate routes with their flight number, airports, aircraft and flight time. Import brings in a whole route list from a spreadsheet.' },
      { heading: 'Fleet', body: 'Add aircraft types and their liveries from Infinite Flight. The ICAO code is set once per type and shared by every livery. Images are optional.' },
      { heading: 'Airlines', body: 'Airline names and logos shown on routes.' },
      { heading: 'Ranks', body: 'Each rank has the hours needed and can unlock aircraft, unlock codeshares, give a multiplier, or allow manual PIREPs. Add aircraft to the fleet before using them in ranks.', highlight: true },
      { heading: 'Multipliers', body: 'Named bonuses, like double hours, that pilots can claim once. Give one a code to make a link pilots can open to use it.' },
      { heading: 'Import', body: 'Bring pilots, flights, routes and fleet in from a spreadsheet or another crew centre. Check the preview before importing.' },
    ],
  },
  {
    doc_id: 'staff-rotw', label: 'Routes of the Week', title: 'Staff guide: Routes of the Week', icon_name: 'Star', sort_order: 105, admin_only: true, plugin: 'routesOfTheWeek',
    sections: [
      { heading: 'Planning a week', body: 'In Featured Routes, click a Monday on the calendar to create or edit that week. Search for routes and add them to each day, with a multiplier if you like.' },
      { heading: 'Publishing', body: 'Publish the week when it\'s ready. It\'s posted to Discord on Monday, with the Routes of the Week role pinged.', highlight: true },
    ],
  },
  {
    doc_id: 'staff-events', label: 'Events', title: 'Staff guide: events', icon_name: 'CalendarClock', sort_order: 106, admin_only: true, plugin: 'events',
    sections: [
      { heading: 'Creating an event', body: 'Pick a route and its aircraft, set the start and end times, add gates and a multiplier if you want them, and write the briefing. A wide image (about 3:1) works best.' },
      { heading: 'On the day', body: 'Publishing posts it to Discord. Sign-ups, gates and landings update on that post by themselves. Pilots can log the flight from 2 hours before it starts until 48 hours after it ends.', highlight: true },
    ],
  },
  {
    doc_id: 'staff-challenges', label: 'Challenges', title: 'Staff guide: challenges', icon_name: 'Trophy', sort_order: 107, admin_only: true, plugin: 'challenges',
    sections: [
      { heading: 'Creating a challenge', body: 'Set the dates, add the legs in order, and add bonus-hour prizes for the first finishers if you like.' },
      { heading: 'While it runs', body: 'Legs are ticked off when their PIREPs are approved. The leaderboard and pilots\' progress are on the challenge. Reminders are posted on Discord.', highlight: true },
    ],
  },
  {
    doc_id: 'staff-live-mode', label: 'Live Mode', title: 'Staff guide: Live Mode', icon_name: 'Satellite', sort_order: 108, admin_only: true, plugin: 'liveMode',
    sections: [
      { heading: 'Access', body: 'Give pilots Live Mode access from their pilot page or the Live Mode access list.' },
      { heading: 'Running the fleet', body: 'The Live admin tab shows every aircraft, booking and recent activity. Bookings that don\'t start in time are released on their own.', highlight: true },
    ],
  },
  {
    doc_id: 'staff-discord', label: 'Discord and tickets', title: 'Staff guide: Discord and tickets', icon_name: 'Bot', sort_order: 109, admin_only: true,
    sections: [
      { heading: 'Connections', body: 'Admins set the bot\'s roles, channels and webhooks in Configuration › Connections, picked from your server\'s own. Saving restarts the crew centre for a few seconds.' },
      { heading: 'Support tickets', body: 'With the Support tickets plugin on, members press Open a ticket, or pick a topic, to get a private channel with the staff roles. Each topic can go to its own roles and category. Staff press Claim to take a ticket. In Operations › Tickets you can read an open ticket live, reply, claim or close it. Closing saves a transcript and deletes the channel.' },
      { heading: 'Bot permissions', body: 'The bot needs Manage Roles, Manage Nicknames and Manage Channels, and its role must sit above the roles it gives out. Full ticket transcripts also need Message Content Intent switched on in the Discord developer portal.', highlight: true },
    ],
  },
  {
    doc_id: 'staff-site', label: 'Site, plugins and updates', title: 'Staff guide: site, plugins and updates', icon_name: 'RefreshCw', sort_order: 110, admin_only: true,
    sections: [
      { heading: 'Plugins', body: 'Switch optional features on and off: Career mode, Live Mode, Routes of the Week, Events, Challenges, ATC sessions, Support tickets and Partner VAs. Switching one off hides it and keeps its data.' },
      { heading: 'Updates', body: 'New versions appear in Updates with notes on what changed. Update installs it, and pilots can keep using the crew centre meanwhile.' },
      { heading: 'Site settings', body: 'Automatic PIREP approval and other site-wide settings.' },
      { heading: 'Embeds', body: 'Widgets for your own website: who\'s flying now, your numbers, and the top pilots. Switch one on, pick light or dark, and paste the code into your site. Anyone can see a widget once it\'s on.' },
      { heading: 'NOTAMs and news', body: 'NOTAMs show on every pilot\'s dashboard until they expire or you switch them off. News posts pop up on the dashboard.' },
      { heading: 'VA Health', body: 'Pilot numbers, recruitment, and the most flown routes and aircraft.' },
      { heading: 'Docs', body: 'Admins can edit any doc from its page here in Docs.', highlight: true },
    ],
  },
];
