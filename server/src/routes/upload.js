/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_IMAGES_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_IMAGES_BRANCH || 'main';

const imageUrl = path => `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;

router.post('/fleet-image', requireAdmin, async (req, res) => {
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  const { filename, data, folder = 'heroes' } = req.body;
  if (!filename || !data) {
    return res.status(400).json({ error: 'filename and data are required' });
  }

  // Sanitise filename
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `${folder}/${safeName}`;

  try {
    // Check if file already exists (need SHA to update)
    let sha;
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'crewcentre' } }
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;
    }

    // Upload to GitHub
    const body = {
      message: `Upload fleet image: ${safeName}`,
      content: data, // already base64
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    };

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'crewcentre',
        },
        body: JSON.stringify(body),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      console.error('[upload] GitHub error:', err);
      return res.status(502).json({ error: 'GitHub upload failed', detail: err.message });
    }

    res.json({ url: imageUrl(path), path });
  } catch (err) {
    console.error('[upload] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /api/upload/rank-badge
// Body: { filename: 'captain-badge.png', data: '<base64>' }
router.post('/rank-badge', requireAdmin, async (req, res) => {
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });

  const { filename, data } = req.body;
  if (!filename || !data) return res.status(400).json({ error: 'filename and data are required' });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `ranks/${safeName}`;

  try {
    let sha;
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'crewcentre' } }
    );
    if (checkRes.ok) sha = (await checkRes.json()).sha;

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'crewcentre' },
        body: JSON.stringify({
          message: `Upload rank badge: ${safeName}`,
          content: data,
          branch: GITHUB_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      return res.status(502).json({ error: 'GitHub upload failed', detail: err.message });
    }

    res.json({ url: imageUrl(path), path });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /api/upload/airline-logo
// Body: { filename: 'qf-logo.png', data: '<base64>' }
router.post('/airline-logo', requireAdmin, async (req, res) => {
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });

  const { filename, data } = req.body;
  if (!filename || !data) return res.status(400).json({ error: 'filename and data are required' });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `airlines/${safeName}`;

  try {
    let sha;
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'crewcentre' } }
    );
    if (checkRes.ok) sha = (await checkRes.json()).sha;

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'crewcentre' },
        body: JSON.stringify({
          message: `Upload airline logo: ${safeName}`,
          content: data,
          branch: GITHUB_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      return res.status(502).json({ error: 'GitHub upload failed', detail: err.message });
    }

    res.json({ url: imageUrl(path), path });
  } catch (err) {
    console.error('[upload/airline-logo] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

const BRAND_ASSET_KEYS = new Set([
  'logo_light', 'logo_dark', 'auth_background', 'hero_image',
]);

router.post('/brand-asset', requireAdmin, async (req, res) => {
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });

  const { key, filename, data } = req.body;
  if (!key || !filename || !data) return res.status(400).json({ error: 'key, filename and data are required' });
  if (!BRAND_ASSET_KEYS.has(key)) return res.status(400).json({ error: `Unknown asset key: ${key}` });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `brand/${key}/${safeName}`;

  try {
    let sha;
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'crewcentre' } }
    );
    if (checkRes.ok) sha = (await checkRes.json()).sha;

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'crewcentre' },
        body: JSON.stringify({
          message: `Upload brand asset (${key}): ${safeName}`,
          content: data,
          branch: GITHUB_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      return res.status(502).json({ error: 'GitHub upload failed', detail: err.message });
    }

    res.json({ url: imageUrl(path), path });
  } catch (err) {
    console.error('[upload/brand-asset] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

const GALLERY_FOLDER = 'gladys-wall';

// POST /api/upload/gladys-image
// Body: { filename: 'meme1.jpg', data: '<base64>' }
router.post('/gladys-image', requireAdmin, async (req, res) => {
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });

  const { filename, data } = req.body;
  if (!filename || !data) return res.status(400).json({ error: 'filename and data are required' });

  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()}`;
  const path = `${GALLERY_FOLDER}/${safeName}`;

  try {
    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'crewcentre' },
        body: JSON.stringify({ message: `Add to gallery: ${safeName}`, content: data, branch: GITHUB_BRANCH }),
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      return res.status(502).json({ error: 'GitHub upload failed', detail: err.message });
    }
    res.json({ url: imageUrl(path), path });
  } catch (err) {
    console.error('[upload/gladys-image] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/gladys-gallery', requireAdmin, async (req, res) => {
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });
  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GALLERY_FOLDER}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'crewcentre' } }
    );
    if (listRes.status === 404) return res.json({ images: [] });
    if (!listRes.ok) return res.status(502).json({ error: 'Failed to list gallery' });

    const files = await listRes.json();
    const images = files
      .filter(f => f.type === 'file')
      .map(f => ({ path: f.path, url: imageUrl(f.path) }))
      .sort((a, b) => b.path.localeCompare(a.path)); // newest first (filenames are timestamp-prefixed)
    res.json({ images });
  } catch (err) {
    console.error('[upload/gladys-gallery] error:', err);
    res.status(500).json({ error: 'Failed to list gallery' });
  }
});

// DELETE /api/upload/gladys-image?path=gladys-wall/12345-meme.jpg
router.delete('/gladys-image', requireAdmin, async (req, res) => {
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });
  const { path } = req.query;
  if (!path || !path.startsWith(`${GALLERY_FOLDER}/`)) {
    return res.status(400).json({ error: 'Invalid or missing path' });
  }
  try {
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'crewcentre' } }
    );
    if (!checkRes.ok) return res.status(404).json({ error: 'File not found' });
    const { sha } = await checkRes.json();

    const delRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'crewcentre' },
        body: JSON.stringify({ message: `Remove from gallery: ${path}`, sha, branch: GITHUB_BRANCH }),
      }
    );
    if (!delRes.ok) return res.status(502).json({ error: 'Failed to delete from GitHub' });
    res.json({ success: true });
  } catch (err) {
    console.error('[upload/gladys-image delete] error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
