# Going live

A crew centre runs as three pieces:

| Piece | What it does | Where it runs |
| --- | --- | --- |
| **Database** | PocketBase 0.22: pilots, flights, routes, settings | A small Fly.io app (`pocketbase/`) |
| **API and Discord bot** | Everything the site asks for, the bot, the scheduled jobs | A second Fly.io app (`server/`) |
| **Site** | What pilots open in their browser | Vercel |

Only the API talks to the database. The site talks to the API, and pilots never reach PocketBase directly.

Plan on about an hour the first time. Nothing here needs you to write code.

## What you need first

- **Accounts:**
  - [GitHub](https://github.com).
  - [Fly.io](https://fly.io). It needs a card and bills by usage; a crew centre is a few small machines.
  - [Vercel](https://vercel.com). The free Hobby plan is enough for a non-commercial VA.
  - The [Discord developer portal](https://discord.com/developers/applications), if you want the bot.
- **An Infinite Flight Live API key**, from Infinite Flight's developer programme.
- **On your computer:**
  - [Node.js](https://nodejs.org) 20 or newer.
  - [Git](https://git-scm.com).
  - The [Fly.io command line tool](https://fly.io/docs/flyctl/install/). Then sign in with `fly auth login`.

## 1. Your own copy

Make a **private** GitHub repository for your VA (empty: no README). Then copy the crew centre into it **with its history**, which is what lets it take updates later:

```bash
git clone https://github.com/EvO1324/longreach.git myva-longreach
```

```bash
cd myva-longreach && git remote set-url origin https://github.com/YOU/myva-longreach.git && git push -u origin main
```

Your VA's settings and logos will live in this repository. The secrets (`.env` files) never do; `.gitignore` keeps them out.

Then install the dependencies:

```bash
npm install
```

```bash
cd server && npm install
```

## 2. The database (Fly.io)

Pick a name for the database app (for example `myva-db`) and a [region](https://fly.io/docs/reference/regions/) near your pilots (for example `syd`, `lhr`, `iad`). Use the same region for everything.

Open `pocketbase/fly.toml` and set `app` and `primary_region` to those. Then, from the `pocketbase` folder, create the app, give it somewhere to keep its data, and deploy:

```bash
cd pocketbase
fly apps create myva-db
```

```bash
fly volumes create pb_data --size 1 --region syd
```

```bash
fly deploy
```

Open `https://myva-db.fly.dev/_/` (with your app's name). PocketBase asks you to create its admin account. Use a long password and keep it somewhere safe: the API signs in with it.

## 3. The API's address

Pick a name for the API (for example `myva-api`). Set `app` and `primary_region` in `server/fly.toml`, then create the app (it's deployed in step 6):

```bash
cd server
fly apps create myva-api
```

Its address is `https://myva-api.fly.dev`. You can use your own domain instead later (`fly certs add api.myva.com`, then point the domain where Fly says).

## 4. The site's address

In Vercel, choose **Add New → Project** and import your GitHub repository. Vercel recognises it as a Create React App site and needs no other settings. Its address is `https://<project>.vercel.app`, or a domain you add in the project's settings.

The first build works without any settings; you'll add two in step 6.

## 5. Set up with the live addresses

Back in the main folder, run the installer:

```bash
npm run setup
```

Fill it in, and under **Services** use the live addresses:

| Field | Value |
| --- | --- |
| Crew centre | Your Vercel address |
| API | Your API's Fly address |
| PocketBase | `https://myva-db.fly.dev` and the admin login from step 2 |

On **Database**, tick **Create the database collections** and fill in your own admin account. Then press **Install**. The last page shows the next commands with your addresses filled in.

## 6. Deploy

**API and bot:** send the server its settings, then deploy:

```bash
npm run fly-secrets
```

```bash
cd server && fly deploy
```

**Site:** in your Vercel project, open **Settings → Environment Variables** and add:

| Name | Value |
| --- | --- |
| `REACT_APP_API_URL` | Your API address followed by `/api`, e.g. `https://myva-api.fly.dev/api` |
| `REACT_APP_DEVELOPER_EMAILS` | Your email, the same as "Owner emails" in setup |

Then commit and push. `va.config.json` and `brand/` are what make the site yours:

```bash
git add -A && git commit -m "Set up our crew centre" && git push
```

Vercel builds and publishes the site on every push. Open it and sign in with the admin account from step 5.

## 7. Fill it in

In the crew centre's admin panel:

- **Ranks** and **Badges**: "Use default" gives you a starting set to edit.
- **Fleet**, **Airlines** and **Routes**: what your pilots can fly.
- **Docs**: rules and guides. For a starting set: `cd server && node scripts/seedDocs.js --live`.
- **Staff roles**: what each staff position can do.

## 8. Discord (optional)

1. **Create the bot.** In the developer portal, create an application and add a bot. Copy its token, and the application ID and secret.
2. **Invite it.** Use **OAuth2 → URL Generator** with the `bot` and `applications.commands` scopes and the **Manage Roles**, **Manage Nicknames** and **Manage Channels** permissions (Manage Channels is for support tickets). In your server's role list, drag the bot's role above the roles it hands out.
3. **Webhooks.** In each channel that should get posts (PIREPs, applications, staff), open **Edit Channel → Integrations → Webhooks** and copy the URL.
4. **Save and deploy.** Run `npm run setup`, add the token, IDs and webhooks under **Services** (the test buttons check them), install, then:

   ```bash
   npm run fly-secrets
   ```

   ```bash
   cd server && fly deploy
   ```

   The bot registers its slash commands when it starts.

**Support tickets** (optional): switch on **Support tickets** in Admin › Plugins, then set it up in Admin › Tickets and post the panel. For full transcripts, also switch on **Message Content Intent** under Bot › Privileged Gateway Intents in the developer portal.

**Changing them later.** Roles, channels and webhooks (and the GitHub and Live Mode settings) can be changed any time in **Admin › Connections**, with no redeploy. Roles and channels are picked from lists once the bot is in your server. Saving restarts the crew centre for a few seconds. Values saved there replace the ones from setup.

## Updating

New versions show up in **Admin › Updates**, with notes on what changed. To update from there with one click, set up once:

1. **A GitHub token** that can run workflows in your repository: a fine-grained token with **Actions** and **Contents** set to read and write. In `npm run setup`, under **Services › GitHub**, add it as the token, and add your repository (`YOU/myva-longreach`). Then `npm run fly-secrets` and `cd server && fly deploy`.
2. **A Fly.io token** in your repository, so the update can deploy the API. Make one with `fly tokens create deploy -a myva-api`. Add it in GitHub under **Settings › Secrets and variables › Actions** as `FLY_API_TOKEN`.

After that, **Update** in Admin › Updates:
- merges the new version into your repository
- deploys the API
- makes Vercel rebuild the site

When the API starts on the new version, it adds any new database tables or fields itself. It takes a few minutes, and pilots can keep using the crew centre meanwhile.

Without the token, update by hand instead:

```bash
git pull https://github.com/EvO1324/longreach.git v1.2.0
```

```bash
git push && cd server && fly deploy
```

Your `va.config.json`, `brand/` and `.env` files are only in your repository, so updates never touch them. If you change the crew centre's own code, an update can clash with your changes; the update then stops without deploying anything, and you merge it by hand.

## Changing something later

Run `npm run setup`, change it and install:

- **Name, colours, logos or features:** commit and push, and Vercel rebuilds the site. Also `cd server && fly deploy`, since the bot and emails use them too.
- **Keys and webhooks:** `npm run fly-secrets`, then `cd server && fly deploy`.

## Backups

PocketBase keeps everything in one folder on the database app's volume. In its dashboard (`/_/`), **Settings → Backups** makes a backup, or schedules them. Download one now and then, too.
