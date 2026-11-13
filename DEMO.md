# Running a demo (no GitHub, no domain)

This puts a full crew centre online for people to try, deployed straight from your computer. The code is never on GitHub, and it uses the free addresses Fly.io and Vercel give every app, so you don't need to buy a domain.

| Piece | Address you get |
| --- | --- |
| Database | `https://<name>-db.fly.dev` |
| API and bot | `https://<name>-api.fly.dev` |
| Site | `https://<name>.vercel.app` |

**Cost.**
- **Vercel:** the Hobby plan is free.
- **Fly.io:** needs a card and bills by usage. A demo is two small machines and a 1 GB volume; see [fly.io/pricing](https://fly.io/pricing). Delete the apps when you're done and the billing stops.

**Before you start.** Have a Fly.io account, a Vercel account and an Infinite Flight API key. Then, in a terminal:

```bash
fly auth login
```

```bash
npx vercel login
```

Below, `demo` is the name used throughout. Pick something unique, like `crewcentre-demo`, since Fly and Vercel names are shared by everyone.

## 1. Database

Edit `pocketbase/fly.toml`: set `app = 'crewcentre-demo-db'` and `primary_region` to a region near you, e.g. `syd`.

```bash
cd pocketbase && fly apps create crewcentre-demo-db && fly volumes create pb_data --size 1 --region syd -a crewcentre-demo-db && fly deploy
```

Open `https://crewcentre-demo-db.fly.dev/_/` and create PocketBase's admin account.

## 2. API

Edit `server/fly.toml`: `app = 'crewcentre-demo-api'` and the same region.

```bash
cd server && fly apps create crewcentre-demo-api
```

## 3. Set it up with the live addresses

```bash
npm run setup
```

Fill it in like any VA. Under **Services**:

| Field | Value |
| --- | --- |
| Crew centre | `https://crewcentre-demo.vercel.app` |
| API | `https://crewcentre-demo-api.fly.dev` |
| PocketBase | `https://crewcentre-demo-db.fly.dev` and the admin login from step 1 |

On **Database**, create the tables and your admin account. Then **Install**.

## 4. Deploy the API

```bash
npm run fly-secrets
```

```bash
cd server && fly deploy
```

Check it's up: `https://crewcentre-demo-api.fly.dev/api/settings` should show a short list of settings.

## 5. Deploy the site

From the main folder, link a Vercel project. Name it `crewcentre-demo` and accept the detected settings:

```bash
npx vercel link
```

Give it the two settings it needs. Each command asks for the value:

```bash
npx vercel env add REACT_APP_API_URL production
```

That one is `https://crewcentre-demo-api.fly.dev/api`.

```bash
npx vercel env add REACT_APP_DEVELOPER_EMAILS production
```

That one is your email.

Then deploy:

```bash
npx vercel --prod
```

Vercel builds it from the files on your computer: nothing goes to GitHub. Open `https://crewcentre-demo.vercel.app` and sign in with the admin account from step 3.

## 6. Make it look lived-in

In **Admin › Import**:
1. **Templates:** download the template for each type.
2. **Fill them in:** add a few pilots, routes, fleet and flights.
3. **Import them:** do pilots first, so the flights can be matched to them.

Then set up ranks with **Admin › Ranks › Use default ranks**. Docs for pilots and staff are added for you.

## Updating the demo

After changing the code:
- **Site:** `npx vercel --prod`
- **API:** `cd server && fly deploy`

When the API starts on a new version, it adds any new database tables itself.

## Taking it down

```bash
fly apps destroy crewcentre-demo-api
```

```bash
fly apps destroy crewcentre-demo-db
```

Then delete the project in Vercel's dashboard. Destroying the database app deletes its data.

## About an "install link"

A one-click link (Vercel's Deploy button) works by copying a **public** GitHub repository into the visitor's account, and Fly.io has no equivalent. So a link isn't possible while the code is private. The steps above are the private route. Once the repository is public, a Deploy button can set up the site part with one click; the database and API still need the Fly.io steps.
