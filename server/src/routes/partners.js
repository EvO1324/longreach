/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// Partner VAs (the "partners" plugin, in testing). How linking works is in
// services/partners.js. Three kinds of route here:
//   admin    Admin › Partners: invite, accept, share settings, pause, remove
//   partner  called by the other crew centre with its token: link, data
//   pilot    the Partners page: what each partner is sharing

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const partners = require('../services/partners');

const router = express.Router();

const shape = p => ({
  id: p.id, name: p.name || 'Invite not used yet', url: p.url, logo_url: p.logo_url, status: p.status,
  share: partners.readShare(p.share), last_seen: p.last_seen || null, last_error: p.last_error || '', created: p.created,
});

// ── Called by the partner's crew centre ────────────────────────────────────

async function fromPartner(pb, req) {
  const token = (req.headers.authorization || '').replace(/^Partner\s+/i, '').trim();
  if (!token || token.length < 20) return null;
  return pb.collection('partners').getFirstListItem(pb.filter('our_token = {:t}', { t: token }), { requestKey: null }).catch(() => null);
}

// Step 2 of linking: they used our invite and send their details and token
router.post('/link', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const p = await fromPartner(pb, req);
    if (!p) return res.status(401).json({ error: 'That invite isn\'t valid any more' });
    if (p.status !== 'pending') return res.status(400).json({ error: 'That invite has already been used' });
    const url = partners.cleanUrl(req.body?.url);
    const token = String(req.body?.token || '');
    if (!url || token.length < 20) return res.status(400).json({ error: 'Missing partner details' });
    await pb.collection('partners').update(p.id, {
      name: String(req.body?.name || 'Partner VA').slice(0, 80), url, their_token: token,
      logo_url: String(req.body?.logo || '').slice(0, 500), status: 'active', last_seen: new Date().toISOString(), last_error: '',
    });
    res.json({ name: require('../config/brand').name, logo: partners.ourLogo() });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t link' });
  }
});

// They removed the link on their side
router.delete('/link', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const p = await fromPartner(pb, req);
    if (!p) return res.status(401).json({ error: 'Not linked' });
    await pb.collection('partners').update(p.id, { status: 'paused', last_error: `${p.name || 'They'} removed the link on their side.` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t unlink' });
  }
});

// What we share with this partner
router.get('/data', async (req, res) => {
  try {
    const pb = await getAdminClient();
    const p = await fromPartner(pb, req);
    if (!p || p.status === 'pending') return res.status(401).json({ error: 'Not linked' });
    if (p.status === 'paused') return res.status(403).json({ error: 'The link is paused' });
    const { liveFlights } = require('./livemap');
    const data = await partners.ourData(pb, partners.readShare(p.share), { liveFlights });
    pb.collection('partners').update(p.id, { last_seen: new Date().toISOString() }).catch(() => {});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load partner data' });
  }
});

// ── Pilots: the Partners page ──────────────────────────────────────────────

const feedCache = new Map(); // partner id -> { at, data }
const FEED_MS = 60 * 1000;

router.get('/feed', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const list = await pb.collection('partners').getFullList({ filter: 'status = "active"', sort: 'name', requestKey: null });
    const out = await Promise.all(list.map(async p => {
      const hit = feedCache.get(p.id);
      if (hit && Date.now() - hit.at < FEED_MS) return { id: p.id, ...hit.data };
      try {
        const d = await partners.call(p, 'GET', '/data');
        const data = {
          name: d.name || p.name, logo: d.logo || p.logo_url, url: d.url || '',
          routes: Array.isArray(d.routes) ? d.routes : null,
          live: Array.isArray(d.live) ? d.live : null,
          recent: Array.isArray(d.recent) ? d.recent : null,
        };
        feedCache.set(p.id, { at: Date.now(), data });
        if (p.last_error) pb.collection('partners').update(p.id, { last_error: '' }).catch(() => {});
        return { id: p.id, ...data };
      } catch (err) {
        pb.collection('partners').update(p.id, { last_error: String(err.message).slice(0, 300) }).catch(() => {});
        return { id: p.id, name: p.name, logo: p.logo_url, error: 'Couldn\'t reach them just now.' };
      }
    }));
    res.json({ partners: out });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load partners' });
  }
});

// ── Admin › Partners ───────────────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const list = await pb.collection('partners').getFullList({ sort: '-created', requestKey: null });
    res.json({ partners: list.map(shape), ourUrl: partners.ourUrl() });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t load partners' });
  }
});

// Step 1: a code for the other VA to paste
router.post('/invite', requireAdmin, async (req, res) => {
  try {
    const url = partners.ourUrl();
    if (!partners.cleanUrl(url)) return res.status(400).json({ error: 'Your API address isn\'t set (apiUrl in va.config.json, or PUBLIC_API_URL).' });
    const pb = await getAdminClient();
    const token = partners.newToken();
    const p = await pb.collection('partners').create({ status: 'pending', our_token: token, share: JSON.stringify(partners.readShare(req.body?.share)) });
    logAction(req.user, 'partners.invited', { id: p.id, name: 'Partner invite' });
    res.json({ code: partners.makeInvite({ url, name: require('../config/brand').name, token }), partner: shape(p) });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t make an invite' });
  }
});

// Step 2, our side: we paste their code and link up
router.post('/accept', requireAdmin, async (req, res) => {
  const invite = partners.readInvite(req.body?.code);
  if (invite.error) return res.status(400).json({ error: invite.error });
  if (invite.url === partners.cleanUrl(partners.ourUrl())) return res.status(400).json({ error: 'That\'s your own invite. Send it to the other VA.' });
  let p = null;
  try {
    const pb = await getAdminClient();
    const ours = partners.newToken();
    p = await pb.collection('partners').create({
      name: invite.name, url: invite.url, their_token: invite.token, our_token: ours, status: 'pending',
      share: JSON.stringify(partners.readShare(req.body?.share)),
    });
    const r = await partners.call({ ...p, name: invite.name }, 'POST', '/link', { url: partners.ourUrl(), name: require('../config/brand').name, logo: partners.ourLogo(), token: ours });
    const done = await pb.collection('partners').update(p.id, { status: 'active', name: r?.name || invite.name, logo_url: r?.logo || '', last_seen: new Date().toISOString() });
    logAction(req.user, 'partners.linked', { id: p.id, name: done.name });
    res.json({ partner: shape(done) });
  } catch (err) {
    if (p) (await getAdminClient()).collection('partners').delete(p.id).catch(() => {});
    const why = err.name === 'TimeoutError' ? `${invite.name} didn't answer. Check their crew centre is running.` : err.message;
    res.status(400).json({ error: `Couldn't link: ${why}` });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const p = await pb.collection('partners').getOne(req.params.id, { requestKey: null });
    const update = {};
    if (req.body?.share) update.share = JSON.stringify(partners.readShare({ ...partners.readShare(p.share), ...req.body.share }));
    if (['active', 'paused'].includes(req.body?.status) && p.status !== 'pending') {
      update.status = req.body.status;
      if (req.body.status === 'active') update.last_error = '';
    }
    const done = await pb.collection('partners').update(p.id, update);
    feedCache.delete(p.id);
    logAction(req.user, 'partners.updated', { id: p.id, name: p.name }, update);
    res.json({ partner: shape(done) });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t save' });
  }
});

// Removes them here and tells them, if they can be reached
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const p = await pb.collection('partners').getOne(req.params.id, { requestKey: null });
    if (p.status !== 'pending' && p.url && p.their_token) await partners.call(p, 'DELETE', '/link').catch(() => {});
    await pb.collection('partners').delete(p.id);
    feedCache.delete(p.id);
    logAction(req.user, 'partners.removed', { id: p.id, name: p.name || 'Unused invite' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Couldn\'t remove' });
  }
});

module.exports = router;
