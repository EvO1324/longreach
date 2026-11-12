/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Where pilot bug reports go: GITHUB_ISSUES_REPO="owner/repo" in server/.env
const [GITHUB_OWNER, GITHUB_REPO] = String(process.env.GITHUB_ISSUES_REPO || '').split('/');

router.post('/', requireAuth, async (req, res) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token || !GITHUB_OWNER || !GITHUB_REPO) return res.status(500).json({ error: 'Issue reporting not configured' });

    const { title, description, category, screenshot_base64, screenshot_mime } = req.body;
    if (!title?.trim())       return res.status(400).json({ error: 'Title is required' });
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });

    const pilot = req.user;
    const name  = `${pilot.first_name} ${pilot.last_name}`;
    const categoryCap = (category || 'bug').charAt(0).toUpperCase() + (category || 'bug').slice(1);

    // Label mapping
    const labelMap = {
      bug:     ['bug'],
      feature: ['enhancement'],
      other:   ['question'],
    };
    const labels = labelMap[category] || ['bug'];

    // Build issue body
    const lines = [
      `## Report from ${name} (${pilot.callsign || 'No callsign'})`,
      '',
      `**Category:** ${categoryCap}`,
      `**Pilot:** ${name} · ${pilot.callsign || '—'} · ${pilot.ifc_username ? `@${pilot.ifc_username}` : '—'}`,
      `**Account ID:** \`${pilot.id}\``,
      '',
      '---',
      '',
      '### Description',
      '',
      description.trim(),
    ];

    if (screenshot_base64 && screenshot_mime) {
      try {
        const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID || '546c25a59c58ad7';
        const imgurRes = await fetch('https://api.imgur.com/3/image', {
          method: 'POST',
          headers: {
            'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image: screenshot_base64, type: 'base64' }),
        });

        if (imgurRes.ok) {
          const imgurData = await imgurRes.json();
          const imageUrl = imgurData?.data?.link;
          if (imageUrl) lines.push('', '---', '', '### Screenshot', '', `![Screenshot](${imageUrl})`);
        } else {
          console.warn('[issues] Imgur upload failed:', imgurRes.status);
          lines.push('', '---', '', '### Screenshot', '', '_Screenshot upload failed — please attach manually._');
        }
      } catch (imgErr) {
        console.warn('[issues] Imgur upload error:', imgErr.message);
        lines.push('', '---', '', '### Screenshot', '', '_Screenshot upload failed — please attach manually._');
      }
    }

    const body = lines.join('\n');

    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `[${categoryCap}] ${title.trim()}`,
        body,
        labels,
      }),
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error('[issues] GitHub API error:', ghRes.status, err);
      return res.status(502).json({ error: 'Failed to create GitHub issue' });
    }

    const issue = await ghRes.json();
    console.log(`[issues] Created #${issue.number} by ${name}: ${title}`);
    res.json({ issue_number: issue.number, url: issue.html_url });
  } catch (err) {
    console.error('[issues]', err.message);
    res.status(500).json({ error: 'Failed to submit issue' });
  }
});

module.exports = router;
