/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const router = express.Router();

router.use(require('./list'));
router.use(require('./submit'));
router.use(require('./moderation'));

module.exports = router;

const { tryAutoApprove } = require('../../services/pirepAutoApprove');
const { updateUserStats, updateVaStats, checkRankUp } = require('../../services/pirepStats');
module.exports.tryAutoApprove  = tryAutoApprove;
module.exports.updateUserStats = updateUserStats;
module.exports.updateVaStats   = updateVaStats;
module.exports.checkRankUp     = checkRankUp;
