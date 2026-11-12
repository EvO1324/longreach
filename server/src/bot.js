/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const localEnv = require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') }).parsed || {};
const brand = require('./config/brand');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Client, GatewayIntentBits, ActivityType, MessageFlags, REST, Routes, Collection, Options, Sweepers } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { getAdminClient } = require('./config/pocketbase');
const { notifyBotOnline } = require('./routes/discord');
const { handleFileButton } = require('./bot/landingFile');
const { handleExtendButton } = require('./bot/liveExtend');

const DISCORD_BOT_TOKEN        = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID        = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID         = process.env.DISCORD_GUILD_ID;
const DISCORD_RANKUP_CHANNEL_ID = process.env.DISCORD_RANKUP_CHANNEL_ID;
const UNVERIFIED_ROLE_ID       = process.env.DISCORD_UNVERIFIED_ROLE_ID || null;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('[bot] Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID — bot will not start');
  process.exit(0);
}

if (process.env.NODE_ENV !== 'production' && !localEnv.DISCORD_BOT_TOKEN) {
  console.error('[bot] No DISCORD_BOT_TOKEN in server/.env.local — refusing to start locally with the live bot token');
  process.exit(1);
}

// Load commands
const commands = new Collection();

function loadCommands(dir) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) { loadCommands(full); continue; }
    if (!file.endsWith('.js')) continue;
    const command = require(full);
    if (command.data && command.execute) {
      commands.set(command.data.name, command);
    }
  }
}

loadCommands(path.join(__dirname, 'bot/commands'));

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
  // commands of switched-off plugins (Admin › Plugins) aren't registered
  const { commandOff } = require('./config/plugins');
  const commandData = [...commands.values()].filter(c => !commandOff(c.data.name)).map(c => c.data.toJSON());
  try {
    if (!DISCORD_GUILD_ID) {
      // no server set: global commands (can take up to an hour to show)
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commandData });
      console.log(`[bot] Registered ${commandData.length} global slash commands (set DISCORD_GUILD_ID for instant ones)`);
      return;
    }
    // guild commands show at once; clear global ones so nothing appears twice
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: [] });
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commandData });
    console.log(`[bot] Registered ${commandData.length} guild slash commands`);
  } catch (err) {
    console.error('[bot] Failed to register commands:', err.message);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 25,
    GuildMemberManager: 500,
    UserManager: 500,
    PresenceManager: 0,
    ReactionManager: 0,
    ThreadManager: 25,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    StageInstanceManager: 0,
    VoiceStateManager: 0,
  }),
  sweepers: {
    ...Sweepers.defaultSweeperSettings,
    messages: {
      interval: 60 * 30, // 30 min
      lifetime: 60 * 30, // drop anything older than 30 min
    },
    users: {
      interval: 60 * 60, // 1 hour
      filter: () => (user) => user.id !== client.user?.id,
    },
    guildMembers: {
      interval: 60 * 60, // 1 hour
      filter: () => (member) => member.id !== client.user?.id,
    },
  },
});

require('./config/runtime').restartOnChange();

client.once('ready', async () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  client.user.setActivity(brand.shortName, { type: ActivityType.Watching });
  notifyBotOnline({ tag: client.user.tag }).catch(() => {});

  // on by default; REGISTER_COMMANDS=false turns it off (e.g. on a second machine)
  if (process.env.REGISTER_COMMANDS !== 'false') await registerCommands();
  else console.log('[bot] REGISTER_COMMANDS=false, not registering slash commands');
});

// Interaction handler (slash commands)
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = require('./config/plugins').commandOff(interaction.commandName) ? null : commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[bot] Error in /${interaction.commandName}:`, err);
      const reply = { content: '❌ Something went wrong running that command.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  // Extend 1 hour on a 1 HOUR LEFT TO LAND message
  if (interaction.isButton() && interaction.customId.startsWith('liveextend:')) {
    try {
      await handleExtendButton(interaction);
    } catch (err) {
      console.error(`[bot] Error handling ${interaction.customId}:`, err);
      const reply = { content: 'Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
    return;
  }

  // File PIREP on a landing prompt
  if (interaction.isButton() && interaction.customId.startsWith('livefile:')) {
    try {
      await handleFileButton(interaction);
    } catch (err) {
      console.error(`[bot] Error handling ${interaction.customId}:`, err);
      const reply = { content: '❌ Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  }
});

// New member join
client.on('guildMemberAdd', async (member) => {
  if (!UNVERIFIED_ROLE_ID) return;
  try {
    const role = member.guild.roles.cache.get(UNVERIFIED_ROLE_ID)
      || await member.guild.roles.fetch(UNVERIFIED_ROLE_ID).catch(() => null);

    if (!role) {
      console.warn(`[bot] guildMemberAdd: unverified role ${UNVERIFIED_ROLE_ID} not found`);
      return;
    }

    await member.roles.add(role);
    console.log(`[bot] Assigned unverified role to ${member.user.tag}`);
  } catch (err) {
    console.error('[bot] guildMemberAdd error:', err.message);
  }
});

// Rank-up notification (called from rankup.js via REST, kept for backwards compat)
async function notifyRankUp({ discordId, pilotName, callsign, rankName, rankIcon, newHours, newRoleId, allRankRoleIds = [] }) {
  if (!client.isReady()) return;
  try {
    const guild = DISCORD_GUILD_ID ? client.guilds.cache.get(DISCORD_GUILD_ID) : client.guilds.cache.first();
    if (!guild) return;

    if (DISCORD_RANKUP_CHANNEL_ID) {
      let channel = guild.channels.cache.get(DISCORD_RANKUP_CHANNEL_ID)
        || await client.channels.fetch(DISCORD_RANKUP_CHANNEL_ID).catch(() => null);
      if (channel) {
        const mention = discordId ? `<@${discordId}>` : `**${pilotName}**`;
        await channel.send(
          `${rankIcon || brand.emoji()} ${mention} has ranked up to **${rankName}**! ` +
          `(${Math.floor(newHours)}h ${Math.round((newHours % 1) * 60)}m total) ` +
          `Callsign: **${callsign}** — congratulations! 🎉`
        );
      }
    }

    if (discordId && newRoleId) {
      await guild.roles.fetch();
      const role = guild.roles.cache.get(newRoleId);
      if (role) {
        const member = await guild.members.fetch({ user: discordId, force: true });
        const toRemove = allRankRoleIds.filter(id => id && id !== newRoleId).map(id => guild.roles.cache.get(id)).filter(Boolean);
        if (toRemove.length > 0) await member.roles.remove(toRemove).catch(() => {});
        await member.roles.add(role);
        console.log(`[bot] Role updated for ${pilotName}: assigned ${role.name}`);
      }
    }
  } catch (err) {
    console.error('[bot] notifyRankUp error:', err.message);
  }
}

module.exports = { notifyRankUp, getClient: () => client };

client.login(DISCORD_BOT_TOKEN);
