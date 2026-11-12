# Plugins

Plugins are optional parts of the crew centre that each VA switches on or off in **Admin › Plugins**. Career mode, Live Mode, Routes of the Week, Events, Challenges and ATC sessions are plugins.

A plugin's code ships inside the crew centre like everything else, and arrives at VAs through a normal release. Switching one on or off doesn't need a rebuild or redeploy.

## What switching a plugin off does

- Its pages and menu items disappear, for pilots and in the admin panel
- Its API paths answer 404
- Its Discord slash commands are no longer registered
- Its scheduled jobs (Discord posts, reminders) stop
- Its data stays, so switching it back on picks up where it left off

The site updates straight away. The API and bot restart by themselves (about 20 seconds) to pick up the jobs and commands.

## Making a new plugin

1. **Add it to the list** in `scripts/brandCore.js`, under `PLUGINS`:

   ```js
   { id: 'tours', name: 'Tours', on: false,
     description: 'Multi-leg tours pilots fly in order, with a badge at the end.',
     api: ['/api/tours'], commands: ['tours'] },
   ```

   - `id`: short and permanent. Never rename it, it's how each VA's choice is saved.
   - `on: false`: new plugins arrive switched off, so an update never turns something on by surprise.
   - `api`: the API paths it owns. They answer 404 while it's off. `apiAllow` lists exceptions.
   - `commands`: its Discord slash command names.

   Then run `npm run brand` to copy the list to the site and the API.

2. **API**: put its routes under the paths in `api`, mounted in `server/src/index.js` as usual. The guard handles the rest.

3. **Scheduled jobs**: start them only when it's on, in `server/src/index.js`:

   ```js
   if (plugins.isOn('tours')) scheduleTourReminder();
   ```

4. **Discord commands**: add them to `server/src/bot/commands/` as usual, and list their names in `commands`.

5. **Pages**:
   - Routes in `src/App.js`: wrap them with `on('tours', <Tours />)`
   - Menu items in `src/components/Sidebar.js`: add `feature: 'tours'`
   - Admin tabs in `src/pages/AdminPanel.js`: add `feature: 'tours'`
   - Anywhere else, check `features.tours !== false` (import `features` from `src/brand`)

6. **Database**: add any new tables to `server/schema.json`. VAs get them when they update, whether or not the plugin is on.

7. **Release** as normal. VAs see the update in Admin › Updates. After updating, the new plugin is listed in Admin › Plugins, switched off.

## Where the on/off state lives

In the `settings` collection, key `plugins`, as JSON (`{"career": false}`). A plugin with no saved choice uses `features` in `va.config.json` (set in the installer), then its `on` default.
