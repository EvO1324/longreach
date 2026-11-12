# Longreach

Longreach is a crew centre for virtual airlines on [Infinite Flight](https://infiniteflight.com): pilot applications and an entry exam, PIREPs and a logbook, ranks and badges, routes and fleet, a live map, events, challenges, Routes of the Week, career mode, statistics, and a Discord bot that keeps roles and nicknames in step.

It's built for one VA at a time. A setup page sets your VA's name, callsign, colours, logos and services, so you don't have to edit any code.

## Getting started

You need [Node.js](https://nodejs.org) 20 or newer and a [PocketBase](https://pocketbase.io) **0.22** server (see [DEPLOYING.md](DEPLOYING.md) for one way to host it).

```bash
npm install
cd server && npm install && cd ..
npm run setup
```

`npm run setup` opens the installer at http://localhost:4848. It walks through:

| Step | What it sets |
| --- | --- |
| Your VA | Name, short name, abbreviation, time zone, website, legal details |
| Callsign | The format pilots fly as (`Example {n}VA`), the short form for Discord (`EVA{n}`), the number range |
| Colours | A main colour and an accent, with light, cool or neutral backgrounds and a live preview |
| Logos | Logo, dark-mode logo (or a white version made for you) and a square app icon |
| Operations | Career hubs, the Infinite Flight grade needed to join, ATC airports, which features are on |
| Services | Addresses, PocketBase, the Infinite Flight API key, Discord, GitHub |
| Database | Creates the collections in a new PocketBase and your admin account |

Then, in two terminals:

```bash
cd server && npm run dev
```

```bash
npm start
```

and open http://localhost:3000.

Run `npm run setup` again any time to change something. It starts from your current setup.

To put it online (PocketBase and the API on Fly.io, the site on Vercel), follow **[DEPLOYING.md](DEPLOYING.md)**. For a quick demo deployed from your computer, see **[DEMO.md](DEMO.md)**. **[DATABASE.md](DATABASE.md)** explains what each database table is for.

## How the branding works

Everything the installer picks is saved in **`va.config.json`** at the top of the project, with logo files in **`brand/`**. `npm run brand` turns them into what the site and server use: CSS colours, the page title and app icons, and copies of the logos. It runs before every `npm start` and `npm run build`, so you can edit `va.config.json` by hand too. The fields are described in `va.config.example.json`.

In the code, use the brand helpers rather than writing a VA's name or colours:

- Site: `import brand, { callsign, features } from '../brand'`. Use `var(--brand-primary)` and `var(--brand-accent)` in styles.
- Server and bot: `const brand = require('../config/brand')`. For example `brand.callsign.format(123)` or `brand.footer('Recruitment')`.

Secrets live in `server/.env` and `.env`, which git ignores. The installer writes both.

## Project layout

```
src/            the site (React)
server/         the API, Discord bot and scheduled jobs (Express)
installer/      npm run setup, plus the database structure (schema.json)
pocketbase/     the database's Fly.io app (Dockerfile and fly.toml)
scripts/        npm run brand and build helpers
brand/          your logos (brand/default/ holds the placeholders)
va.config.json  your VA's settings (made by npm run setup)
```

## Releasing (maintainers)

Push your changes, then on GitHub go to **Releases › Draft a new release**, make a new tag like `v1.2.0` on `main`, write what changed and publish. Every crew centre sees it in Admin › Updates and can update with one click (see DEPLOYING.md › Updating). The tag is the version, so there's nothing to bump by hand. To ship an optional feature VAs can switch on and off, see **[PLUGINS.md](PLUGINS.md)**.

## Tests

```bash
cd server && npm test
```

## Licence

Longreach is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). You can use and change it for a non-commercial virtual airline. Selling it, or charging for it or for hosting it, isn't allowed without the author's permission.
