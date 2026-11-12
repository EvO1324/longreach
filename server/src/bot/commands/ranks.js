/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const brand = require('../../config/brand');
const { getRanks } = require('../utils');

const RANK_EMOJIS = [
  '<:new_pilot:1483793976887873536>',
  '<:second_officer:1483794071729344522>',
  '<:first_officer:1483794137714262168>',
  '<:senior_first_officer:1483794209847644220>',
  '<:captain:1483794315158356120>',
  '<:chairmans_bronze:1483794375447285760>',
  '<:chairmans_silver:1483794428840902877>',
  '<:chairmans_gold:1483794483173658624>',
  '<:oneworld_discover:1483794792612626566>',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranks')
    .setDescription(`View the ${brand.shortName} rank matrix`.slice(0, 100)),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const ranks = await getRanks(); // sorted by hours_required ASC

      if (!ranks.length) {
        return interaction.editReply({ content: '❌ No ranks found.' });
      }

      const lines = ranks.map((rank, i) => {
        const emoji = RANK_EMOJIS[i] ?? '✈️';
        const hours = rank.hours_required === 0
          ? '0h (Starting rank)'
          : `${rank.hours_required.toLocaleString()}h`;
        return `${emoji} **${rank.name}** — ${hours}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`${brand.shortName} — Rank Matrix`)
        .setColor(brand.embedColor('primary'))
        .setDescription(lines.join('\n'))
        .setFooter({ text: brand.shortName })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[ranks] Error:', err);
      await interaction.editReply({ content: '❌ Failed to fetch ranks. Please try again.' });
    }
  },
};
