/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const webpush = require('web-push');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAdminClient } = require('../config/pocketbase');

const router = express.Router();

const PUSH_ENABLED = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (PUSH_ENABLED) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_EMAIL || brand.legal?.contact || 'admin@example.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[push] VAPID keys not set — push notifications disabled');
}

router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'Subscription required' });

    const pb = await getAdminClient();
    await pb.collection('users').update(req.user.id, {
      push_subscription: JSON.stringify(subscription),
    });

    res.json({ message: 'Subscribed' });
  } catch (err) {
    console.error('[push/subscribe]', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    await pb.collection('users').update(req.user.id, { push_subscription: '' });
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

async function notifyUser(userId, payload) {
  if (!PUSH_ENABLED) return;
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(userId, { requestKey: null });
    if (!user.push_subscription) return;

    const subscription = JSON.parse(user.push_subscription);
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      try {
        const pb = await getAdminClient();
        await pb.collection('users').update(userId, { push_subscription: '' });
      } catch {}
    }
    console.error('[push/notify]', err.message);
  }
}

async function notifyAll(payload) {
  if (!PUSH_ENABLED) return;
  try {
    const pb = await getAdminClient();
    const users = await pb.collection('users').getFullList({
      filter: 'status = "approved" && push_subscription != ""',
      fields: 'id,push_subscription',
      requestKey: null,
    });

    await Promise.allSettled(users.map(user => {
      try {
        const subscription = JSON.parse(user.push_subscription);
        return webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch {
        return Promise.resolve();
      }
    }));
  } catch (err) {
    console.error('[push/notifyAll]', err);
  }
}

router.post('/send', requireAdmin, async (req, res) => {
  const { title, body, url = '/', userId } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const payload = { title, body, url, icon: brand.appIcon };

  if (userId) {
    await notifyUser(userId, payload);
  } else {
    await notifyAll(payload);
  }

  res.json({ message: 'Sent' });
});

module.exports = { router, notifyUser, notifyAll };
