/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const brand = require('../config/brand');
const { getUserByDiscordId } = require('./utils');
const { getDeveloperIds } = require('../utils/developers');

const FRONTEND_URL = brand.frontendUrl;

const LIVE_COLOURS = {
  green:  brand.embedColor('primary'),
  gold:   brand.embedColor('accent'),
  amber:  0xe65100,
  grey:   0x757575,
};

async function hasLiveAccess(user) {
  if (user.role === 'admin' || user.staff_role || user.live_access) return true;
  const pb = await getAdminClient();
  const devIds = await getDeveloperIds(pb);
  return devIds.has(user.id);
}

async function getLivePilot(interaction) {
  const user = await getUserByDiscordId(interaction.user.id);
  if (!user) {
    await interaction.editReply({ content: "❌ Your Discord isn't linked to a crew centre account. Run `/verify` first." });
    return null;
  }
  if (!(await hasLiveAccess(user))) {
    await interaction.editReply({ content: "❌ You don't have Live Mode access yet. Ask staff to enable it on your profile." });
    return null;
  }
  return user;
}

function shortName(p) {
  if (!p) return 'Unknown pilot';
  return `${p.first_name || ''} ${(p.last_name || '').charAt(0).toUpperCase()}.`.trim();
}

function discordTime(iso, style = 'f') {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function zuluTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--Z';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

// Restrict to AVG's own Live org(s) when configured, same as routes/ifLive.js
function orgFilter() {
  const ids = (process.env.IF_LIVE_ORG_ID || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return '';
  return ` && (${ids.map(id => `organization_id = "${id.replace(/["\\]/g, '')}"`).join(' || ')})`;
}

module.exports = { FRONTEND_URL, LIVE_COLOURS, getLivePilot, shortName, discordTime, zuluTime, orgFilter };
