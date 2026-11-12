/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { Client, GatewayIntentBits, REST, Routes, Collection, ActivityType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const brand = require('../config/brand');
const fs   = require('fs');
const path = require('path');
const { setClient } = require('./rankup');
const { canUseStaffCommand } = require('./utils');
const { approveBid, denyBid, notifyPilot, pilotName } = require('./ifLiveActions');

const DISCORD_BOT_TOKEN      = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID      = process.env.DISCORD_CLIENT_ID;
const UNVERIFIED_ROLE_ID     = process.env.DISCORD_UNVERIFIED_ROLE_ID || '1478636096735936512';

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
  console.warn('[bot] Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID — bot disabled (local dev mode)');
  module.exports = { getClient: () => null };
  return; // stop executing this module, server continues normally
}

// Load all commands
const commands = new Collection();

function loadCommands(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      loadCommands(fullPath); // recurse into staff/ etc
    } else if (file.endsWith('.js')) {
      const command = require(fullPath);
      if (command.data && command.execute) {
        commands.set(command.data.name, command);
        console.log(`[bot] Loaded command: /${command.data.name}`);
      }
    }
  }
}

loadCommands(path.join(__dirname, 'commands'));

// Register slash commands with Discord
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
  const commandData = [...commands.values()].map(c => c.data.toJSON());
  try {
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commandData });
    console.log(`[bot] Registered ${commandData.length} slash commands`);
  } catch (err) {
    console.error('[bot] Failed to register commands:', err.message);
  }
}

// Bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', async () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  client.user.setActivity(brand.shortName, { type: ActivityType.Watching });
  setClient(client); // share client with rankup module
  // Only register commands when running as standalone bot, not when required by API
  if (require.main === module) {
    await registerCommands();
  }
});

function approvedEmbed(bid, approvedBy) {
  return new EmbedBuilder()
    .setTitle('✅ Bid Approved')
    .setColor(brand.embedColor('primary'))
    .setDescription(`**${bid.aircraft_registration || 'Aircraft'}** for ${pilotName(bid)} — schedule${(bid.legs || []).length > 1 ? 's' : ''} created in Infinite Flight Live.`)
    .setFooter({ text: `Approved by ${approvedBy}` })
    .setTimestamp();
}

function deniedEmbed(bid, deniedBy, reason) {
  return new EmbedBuilder()
    .setTitle('❌ Bid Denied')
    .setColor(0xc62828)
    .setDescription(`**${bid.aircraft_registration || 'Aircraft'}** for ${pilotName(bid)}${reason ? `\n\n**Reason:** ${reason}` : ''}`)
    .setFooter({ text: `Denied by ${deniedBy}` })
    .setTimestamp();
}

async function handleApproveButton(interaction, bidId) {
  await interaction.deferUpdate();
  const result = await approveBid(bidId).catch(err => ({ ok: false, error: err.message || 'Unknown error' }));

  if (!result.ok) {
    return interaction.followUp({ content: `❌ ${result.error}`, flags: 64 }).catch(() => {});
  }

  notifyPilot(interaction.client, result.bid, `✅ Your IF Live bid for **${result.bid.aircraft_registration || 'your aircraft'}** was approved — you have 24h from each leg's off-blocks time to fly and file it. Check \`/mybookings\` for deadlines.`);

  await interaction.editReply({
    embeds: [approvedEmbed(result.bid, interaction.user.username)],
    components: [],
  }).catch(() => {});
}

async function handleDenyModalSubmit(interaction, bidId) {
  const reason = interaction.fields.getTextInputValue('reason');
  await interaction.deferUpdate();
  const result = await denyBid(bidId, reason).catch(err => ({ ok: false, error: err.message || 'Unknown error' }));

  if (!result.ok) {
    return interaction.followUp({ content: `❌ ${result.error}`, flags: 64 }).catch(() => {});
  }

  const reasonLine = result.bid.review_note ? `\nReason: ${result.bid.review_note}` : '';
  notifyPilot(interaction.client, result.bid, `❌ Your IF Live bid for **${result.bid.aircraft_registration || 'an aircraft'}** was denied.${reasonLine}`);

  await interaction.editReply({
    embeds: [deniedEmbed(result.bid, interaction.user.username, result.bid.review_note)],
    components: [],
  }).catch(() => {});
}

client.on('error', (err) => console.error('[bot] Client error:', err));
client.on('shardError', (err) => console.error('[bot] Shard error:', err));
client.on('shardDisconnect', (event, id) => console.warn(`[bot] Shard ${id} disconnected, code ${event?.code}`));
client.on('shardReconnecting', (id) => console.warn(`[bot] Shard ${id} reconnecting`));

client.on('interactionCreate', async (interaction) => {
  console.log(`[bot] interactionCreate fired — type=${interaction.type} isButton=${interaction.isButton?.()} isModalSubmit=${interaction.isModalSubmit?.()} customId=${interaction.customId || interaction.commandName || 'n/a'}`);

  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[bot] Error in /${interaction.commandName}:`, err);
      const reply = { content: '❌ Something went wrong running that command.', flags: 64 };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('iflive_')) {
    const [prefix, bidId] = interaction.customId.split(':');
    console.log(`[bot] Button click: ${interaction.customId} from ${interaction.user.tag}`);
    if (!bidId) return;

    try {
      let allowed = false;
      try {
        allowed = canUseStaffCommand(interaction);
      } catch (permErr) {
        console.error('[bot] canUseStaffCommand threw:', permErr);
      }

      if (!allowed) {
        await interaction.reply({ content: "❌ You don't have permission to do that.", flags: 64 });
        return;
      }

      if (prefix === 'iflive_approve') {
        await handleApproveButton(interaction, bidId);
      } else if (prefix === 'iflive_deny') {
        const modal = new ModalBuilder()
          .setCustomId(`iflive_deny_modal:${bidId}`)
          .setTitle('Deny bid');
        const reasonInput = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason (optional, shown to the pilot)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
      }
    } catch (err) {
      console.error(`[bot] Error handling ${interaction.customId}:`, err);
      const reply = { content: '❌ Something went wrong. Please try again.', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('iflive_deny_modal:')) {
    const bidId = interaction.customId.split(':')[1];
    console.log(`[bot] Modal submit: ${interaction.customId} from ${interaction.user.tag}`);
    if (!bidId) return;

    try {
      let allowed = false;
      try {
        allowed = canUseStaffCommand(interaction);
      } catch (permErr) {
        console.error('[bot] canUseStaffCommand threw:', permErr);
      }

      if (!allowed) {
        await interaction.reply({ content: "❌ You don't have permission to do that.", flags: 64 });
        return;
      }

      await handleDenyModalSubmit(interaction, bidId);
    } catch (err) {
      console.error(`[bot] Error handling ${interaction.customId}:`, err);
      const reply = { content: '❌ Something went wrong. Please try again.', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  }
});

// New member join
const WELCOME_CHANNEL_ID = '1476732250543620232';

client.on('guildMemberAdd', async (member) => {
  try {
    const role = member.guild.roles.cache.get(UNVERIFIED_ROLE_ID)
      || await member.guild.roles.fetch(UNVERIFIED_ROLE_ID).catch(() => null);

    if (!role) {
      console.warn(`[bot] guildMemberAdd: unverified role ${UNVERIFIED_ROLE_ID} not found`);
      return;
    }

    await member.roles.add(role);
    console.log(`[bot] Assigned unverified role to ${member.user.tag}`);

    // Send welcome message
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID)
      || await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel.send(`Welcome to ${brand.shortName}, ${member}! 👋`);
    }

  } catch (err) {
    console.error('[bot] guildMemberAdd error:', err.message);
  }
});

// Only login when run directly as the bot process, not when required as a module
if (require.main === module) {
  client.login(DISCORD_BOT_TOKEN);
}

module.exports = { getClient: () => client };
