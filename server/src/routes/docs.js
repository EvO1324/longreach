/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const { getAdminClient } = require('../config/pocketbase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { escFilterValue } = require('../utils/pbFilter');

const router = express.Router();

router.get('/docs', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const isStaff = req.user.role === 'admin' || !!req.user.staff_role;
    const filter = isStaff ? '' : 'admin_only = false';
    const records = await pb.collection('docs').getFullList({
      filter, sort: 'sort_order', requestKey: null,
    });
    const docs = records.map(r => ({
      id:         r.doc_id,
      recordId:   r.id,
      label:      r.label,
      title:      r.title,
      iconName:   r.icon_name,
      adminOnly:  r.admin_only,
      sortOrder:  r.sort_order,
      sections:   JSON.parse(r.sections || '[]'),
    }));
    res.json({ docs });
  } catch (err) {
    console.error('[docs/list]', err.message);
    res.status(500).json({ error: 'Failed to load docs' });
  }
});

router.patch('/docs/:docId', requireAdmin, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { label, title, adminOnly, sections } = req.body;

    const existing = await pb.collection('docs').getFirstListItem(`doc_id = "${escFilterValue(req.params.docId)}"`, { requestKey: null });

    const updates = {};
    if (label     !== undefined) updates.label      = label;
    if (title     !== undefined) updates.title       = title;
    if (adminOnly !== undefined) updates.admin_only   = !!adminOnly;
    if (sections  !== undefined) updates.sections     = JSON.stringify(sections);

    const updated = await pb.collection('docs').update(existing.id, updates);

    logAction(req.user, 'docs.edited',
      { id: updated.id, name: updated.label },
      { doc_id: req.params.docId }
    );

    res.json({
      doc: {
        id: updated.doc_id, recordId: updated.id, label: updated.label,
        title: updated.title, iconName: updated.icon_name,
        adminOnly: updated.admin_only, sortOrder: updated.sort_order,
        sections: JSON.parse(updated.sections || '[]'),
      },
    });
  } catch (err) {
    console.error('[docs/update]', err.message);
    if (err?.status === 404) return res.status(404).json({ error: 'Doc not found' });
    res.status(500).json({ error: 'Failed to save doc' });
  }
});

module.exports = router;
