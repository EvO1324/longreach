/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const { getAdminClient } = require('../config/pocketbase');
const { escFilterValue } = require('../utils/pbFilter');

const router = express.Router();

// GET /api/card/:callsign.svg
router.get('/:callsign.svg', async (req, res) => {
  try {
    const callsign = decodeURIComponent(req.params.callsign).replace(/-/g, ' ');
    const pb = await getAdminClient();

    const results = await pb.collection('users').getList(1, 1, {
      filter: `callsign = "${escFilterValue(callsign)}" && status = "approved"`,
      requestKey: null,
    });

    if (!results.items.length) {
      return res.status(404).type('image/svg+xml').send(notFoundSVG());
    }

    const pilot = results.items[0];

    // Fetch full rank list to get current rank + next rank
    let rankName      = 'New Pilot';
    let nextRankName  = null;
    let nextRankHours = null;
    let badgeUrl      = null;
    let orderPosition = 0;
    let staffRoleName = null;

    try {
      const ranks = await pb.collection('ranks').getFullList({ sort: 'hours_required', requestKey: null });
      const hours = pilot.total_hours || 0;
      let currentIdx = -1;

      for (let i = 0; i < ranks.length; i++) {
        if (hours >= ranks[i].hours_required) currentIdx = i;
      }

      if (currentIdx >= 0) {
        const current  = ranks[currentIdx];
        rankName       = current.name;
        badgeUrl       = current.badge_url || null;
        orderPosition  = current.order_position || 0;

        if (currentIdx + 1 < ranks.length) {
          const next     = ranks[currentIdx + 1];
          nextRankName   = next.name;
          nextRankHours  = next.hours_required;
        }
      } else if (ranks.length > 0) {
        nextRankName  = ranks[0].name;
        nextRankHours = ranks[0].hours_required;
      }
    } catch {}

    // Fetch staff role name if set
    if (pilot.staff_role) {
      try {
        const role = await pb.collection('roles').getOne(pilot.staff_role, { requestKey: null });
        staffRoleName = role.name || null;
      } catch {}
    }

    // Fetch badge image as base64
    let badgeBase64 = null;
    let badgeMime   = 'image/png';
    if (badgeUrl) {
      try {
        const imgRes = await fetch(badgeUrl, { signal: AbortSignal.timeout(4000) });
        if (imgRes.ok) {
          const ct = imgRes.headers.get('content-type') || 'image/png';
          badgeMime = ct.split(';')[0].trim();
          const buf = await imgRes.arrayBuffer();
          badgeBase64 = Buffer.from(buf).toString('base64');
        }
      } catch {}
    }

    const svg = generateSVG({
      firstName:     pilot.first_name,
      lastName:      pilot.last_name,
      callsign:      pilot.callsign,
      ifcUsername:   pilot.ifc_username   || null,
      staffRoleName,
      rank:          rankName,
      nextRankName,
      nextRankHours,
      hours:         pilot.total_hours    || 0,
      flights:       pilot.total_flights  || 0,
      memberSince:   pilot.created        || null,
      orderPosition,
      badgeBase64,
      badgeMime,
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(svg);
  } catch (err) {
    console.error('[card]', err.message);
    res.status(500).type('image/svg+xml').send(notFoundSVG());
  }
});

function formatHours(h) {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0)  return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function escapeXML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function epauletteSVG(x, y, w, h, orderPosition) {
  const bars    = Math.min(orderPosition, 4);
  const diamonds = Math.max(0, orderPosition - 4);
  const cornerR = h * 0.15;
  const padX    = w * 0.08;
  const padY    = h * 0.14;
  const barH    = h - padY * 2;
  const barW    = w * 0.10;
  const barGap  = barW * 0.6;

  let parts = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${cornerR}" fill="#0e1a16" stroke="#1a3020" stroke-width="1"/>`;

  for (let i = 0; i < bars; i++) {
    const bx = x + padX + i * (barW + barGap);
    parts += `<rect x="${bx}" y="${y + padY}" width="${barW}" height="${barH}" rx="2" fill="${brand.colors.accent}"/>`;
  }

  const barsEndX   = bars > 0 ? x + padX + (bars - 1) * (barW + barGap) + barW : x + padX;
  const dZoneStart = barsEndX + barGap * 2;
  const dZoneEnd   = x + w - padX;
  const dSize      = barW * 0.55;
  const dCY        = y + h / 2;

  if (diamonds > 0) {
    const spacing = (dZoneEnd - dZoneStart) / diamonds;
    for (let i = 0; i < diamonds; i++) {
      const cx = dZoneStart + spacing * i + spacing / 2;
      parts += `<polygon points="${cx},${dCY - dSize} ${cx + dSize},${dCY} ${cx},${dCY + dSize} ${cx - dSize},${dCY}" fill="${brand.colors.accent}"/>`;
    }
  }

  return parts;
}

function generateSVG({ firstName, lastName, callsign, ifcUsername, staffRoleName, rank, nextRankName, nextRankHours, hours, flights, memberSince, orderPosition, badgeBase64, badgeMime }) {
  const W = 600;
  const H = 260;

  const fullName    = lastName ? `${firstName} ${lastName}` : firstName;
  const memberDate  = fmtDate(memberSince);
  const hoursToNext = nextRankHours ? Math.max(0, nextRankHours - hours) : null;
  const nextPct     = (nextRankHours && nextRankHours > 0)
    ? Math.min(100, Math.round((hours / nextRankHours) * 100))
    : 100;

  // Progress bar dimensions
  const PB_X = 28;
  const PB_Y = 220;
  const PB_W = W - 56;
  const PB_H = 6;
  const PB_FILL = Math.round((nextPct / 100) * PB_W);

  // Badge area
  const BADGE_W = 110;
  const BADGE_H = 60;
  const BADGE_X = W - BADGE_W - 28;
  const BADGE_Y = 28;

  const badgeContent = badgeBase64
    ? `<image x="${BADGE_X}" y="${BADGE_Y}" width="${BADGE_W}" height="${BADGE_H}" href="data:${badgeMime};base64,${badgeBase64}" preserveAspectRatio="xMidYMid meet"/>`
    : epauletteSVG(BADGE_X, BADGE_Y, BADGE_W, BADGE_H, orderPosition);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#0d1f18"/>
      <stop offset="60%"  stop-color="#132b22"/>
      <stop offset="100%" stop-color="#0a1a12"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="${brand.colors.primaryLight}"/>
      <stop offset="100%" stop-color="${brand.colors.primary}"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="${brand.colors.accent}"/>
      <stop offset="100%" stop-color="#e2c46a"/>
    </linearGradient>
    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="${brand.colors.primary}"/>
      <stop offset="100%" stop-color="${brand.colors.accent}"/>
    </linearGradient>
    <linearGradient id="divider" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="30%"  stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="70%"  stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="cardClip"><rect width="${W}" height="${H}" rx="18"/></clipPath>
    <clipPath id="progressClip"><rect x="${PB_X}" y="${PB_Y}" width="${PB_FILL}" height="${PB_H}" rx="3"/></clipPath>
    <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" rx="18" fill="url(#bgGrad)"/>
  <rect width="${W}" height="${H}" rx="18" fill="none" stroke="${brand.colors.primary}" stroke-width="1.5" opacity="0.4"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="5" height="${H}" rx="2" fill="url(#accentGrad)" clip-path="url(#cardClip)"/>

  <!-- Top + bottom gold pinstripes -->
  <rect x="5" y="0"         width="${W - 5}" height="2.5" fill="url(#goldGrad)" opacity="0.5" clip-path="url(#cardClip)"/>
  <rect x="5" y="${H - 2.5}" width="${W - 5}" height="2.5" fill="url(#goldGrad)" opacity="0.25" clip-path="url(#cardClip)"/>

  <!-- Subtle bg glow -->
  <ellipse cx="160" cy="130" rx="200" ry="110" fill="${brand.colors.primary}" opacity="0.05"/>

  <!-- VA name -->
  <text x="28" y="32" font-family="Georgia, 'Times New Roman', serif" font-size="10" font-weight="700"
    fill="url(#goldGrad)" letter-spacing="3.5" opacity="0.85">${escapeXML(brand.name.toUpperCase())}</text>

  <!-- Pilot name -->
  <text x="28" y="76" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="700"
    fill="#ffffff" letter-spacing="-0.5">${escapeXML(fullName)}</text>

  <!-- Callsign -->
  <text x="30" y="100" font-family="Georgia, 'Times New Roman', serif" font-size="14"
    fill="${brand.colors.accent}" font-style="italic" opacity="0.9">${escapeXML(callsign)}</text>

  ${ifcUsername ? `<!-- IFC Username -->
  <text x="30" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="11"
    fill="#6aaa88" opacity="0.75">IFC: @${escapeXML(ifcUsername)}</text>` : ''}

  ${staffRoleName ? `<!-- Staff role -->
  <rect x="28" y="${ifcUsername ? 128 : 114}" width="${staffRoleName.length * 7 + 16}" height="18" rx="9"
    fill="${brand.colors.primary}" opacity="0.3" stroke="${brand.colors.primaryLight}" stroke-width="0.75"/>
  <text x="36" y="${ifcUsername ? 141 : 127}" font-family="Georgia, 'Times New Roman', serif" font-size="9.5"
    font-weight="700" fill="#6aaa88" letter-spacing="0.5">${escapeXML(staffRoleName.toUpperCase())}</text>` : ''}

  <!-- Rank badge -->
  <g filter="url(#badgeShadow)">${badgeContent}</g>

  <!-- Rank name under badge -->
  <text x="${BADGE_X + BADGE_W / 2}" y="${BADGE_Y + BADGE_H + 16}" font-family="Georgia, 'Times New Roman', serif"
    font-size="9.5" font-weight="700" fill="${brand.colors.accent}" text-anchor="middle"
    letter-spacing="1.2" opacity="0.9">${escapeXML(rank.toUpperCase())}</text>

  <!-- Divider -->
  <line x1="28" y1="154" x2="${W - 28}" y2="154" stroke="url(#divider)" stroke-width="1"/>

  <!-- Stats row -->
  <!-- Flight Time -->
  <text x="28"  y="172" font-family="Georgia, 'Times New Roman', serif" font-size="9" fill="#6aaa88" letter-spacing="1.8" opacity="0.8">FLIGHT TIME</text>
  <text x="28"  y="196" font-family="Georgia, 'Times New Roman', serif" font-size="26" font-weight="700" fill="#ffffff" letter-spacing="-0.5">${escapeXML(formatHours(hours))}</text>

  <!-- PIREPs -->
  <text x="210" y="172" font-family="Georgia, 'Times New Roman', serif" font-size="9" fill="#6aaa88" letter-spacing="1.8" opacity="0.8">PIREPS</text>
  <text x="210" y="196" font-family="Georgia, 'Times New Roman', serif" font-size="26" font-weight="700" fill="#ffffff">${escapeXML(String(flights))}</text>

  <!-- Member Since -->
  ${memberDate ? `<text x="${W - 28}" y="172" font-family="Georgia, 'Times New Roman', serif" font-size="9" fill="#6aaa88" letter-spacing="1.8" opacity="0.8" text-anchor="end">MEMBER SINCE</text>
  <text x="${W - 28}" y="196" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="end">${escapeXML(memberDate)}</text>` : ''}

  <!-- Progress bar to next rank -->
  ${nextRankName ? `
  <rect x="${PB_X}" y="${PB_Y}" width="${PB_W}" height="${PB_H}" rx="3" fill="#ffffff" opacity="0.08"/>
  <rect x="${PB_X}" y="${PB_Y}" width="${PB_FILL}" height="${PB_H}" rx="3" fill="url(#progressGrad)" opacity="0.9"/>
  <text x="${PB_X}" y="${PB_Y + 18}" font-family="Georgia, 'Times New Roman', serif" font-size="9" fill="#6aaa88" opacity="0.7">
    ${escapeXML(hoursToNext !== null ? `${formatHours(hoursToNext)} to ${nextRankName}` : nextRankName)}
  </text>
  <text x="${W - 28}" y="${PB_Y + 18}" font-family="Georgia, 'Times New Roman', serif" font-size="9" fill="#6aaa88" opacity="0.7" text-anchor="end">${nextPct}%</text>
  ` : `
  <text x="${PB_X}" y="${PB_Y + 18}" font-family="Georgia, 'Times New Roman', serif" font-size="9" fill="${brand.colors.accent}" opacity="0.8" letter-spacing="1">MAX RANK ACHIEVED</text>
  `}

  <!-- Watermark -->
  <text x="${W - 28}" y="${H - 8}" font-family="Georgia, 'Times New Roman', serif" font-size="8.5"
    fill="#ffffff" opacity="0.12" text-anchor="end">${escapeXML(brand.frontendUrl.replace(/^https?:\/\//, ''))}</text>
</svg>`;
}

function notFoundSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="260" viewBox="0 0 600 260">
    <rect width="600" height="260" rx="18" fill="#0d1f18"/>
    <text x="300" y="135" font-family="Georgia, serif" font-size="16" fill="#444" text-anchor="middle">Pilot not found</text>
  </svg>`;
}

module.exports = router;
