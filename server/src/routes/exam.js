/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const express = require('express');
const brand = require('../config/brand');
const crypto = require('crypto');
const { getAdminClient, adminPatch } = require('../config/pocketbase');
const { requireAdmin, requireAuth, requirePermission } = require('../middleware/auth');
const { notifyExamResult } = require('./discord');
const { logAction } = require('../utils/audit');
const { createDiscordInvite } = require('../utils/discordInvite');
const { escFilterValue } = require('../utils/pbFilter');
const { createCache } = require('../utils/cache');
const { DEVELOPER_EMAILS } = require('../utils/developers');

const router = express.Router();
const FRONTEND_URL = brand.frontendUrl;
const { getCached, setCached, invalidateCache } = createCache('exam');

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

async function loadExamBank(pb) {
  const cached = getCached('bank');
  if (cached) return cached;

  const topics = await pb.collection('exam_topics').getFullList({
    filter: 'active = true', sort: 'sort_order', requestKey: null,
  });
  const questions = await pb.collection('exam_questions').getFullList({
    filter: 'active = true', requestKey: null,
  });
  const byTopic = {};
  for (const q of questions) (byTopic[q.topic] ||= []).push(q);

  const bank = topics.map(t => ({ ...t, questions: byTopic[t.id] || [] }));
  setCached('bank', bank, 30 * 1000);
  return bank;
}

async function loadExamConfig(pb) {
  let passMark = 70, title = `${brand.shortName} Entry Exam`;
  try {
    const rec = await pb.collection('settings').getFirstListItem('key = "exam_pass_mark"', { requestKey: null });
    const parsed = parseInt(rec.value, 10);
    if (!isNaN(parsed)) passMark = parsed;
  } catch { }
  try {
    const rec = await pb.collection('settings').getFirstListItem('key = "exam_title"', { requestKey: null });
    if (rec.value) title = rec.value;
  } catch { }
  return { passMark, title };
}

function seededShuffle(seed, arr) {
  const seededRand = (() => {
    let s = [...seed].reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0);
    return () => { s = Math.imul(1664525, s) + 1013904223; return (s >>> 0) / 4294967296; };
  })();
  const pool = [...arr];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(seededRand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function pickFreshQuestions(seed, bank) {
  const picked = [];
  for (const topic of bank) {
    const shuffled = seededShuffle(`${seed}:${topic.id}`, topic.questions);
    picked.push(...shuffled.slice(0, Math.min(topic.questions_per_exam, shuffled.length)));
  }
  return picked;
}

async function resolveSnapshot(pb, idsJson) {
  const ids = JSON.parse(idsJson || '[]');
  if (ids.length === 0) return [];
  const all = await Promise.all(ids.map(id => pb.collection('exam_questions').getOne(id, { requestKey: null }).catch(() => null)));
  return all.filter(Boolean);
}

// GET /api/exam/check — validate token, return questions (without answers)
router.get('/check', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  if (!/^[a-f0-9]+$/i.test(token)) return res.status(400).json({ error: 'Invalid token format' });

  try {
    const pb = await getAdminClient();
    let user;
    try {
      user = await pb.collection('users').getFirstListItem(
        pb.filter('exam_token = {:token}', { token }),
        { requestKey: null }
      );
    } catch {
      return res.status(404).json({ error: 'Invalid or expired exam link.' });
    }

    if (user.exam_attempts > 0) {
      return res.json({ already_done: true });
    }

    if (user.exam_token_created) {
      const age = Date.now() - new Date(user.exam_token_created).getTime();
      if (age > TOKEN_TTL_MS) {
        return res.status(410).json({ error: 'This exam link has expired. Please contact your recruitment officer.' });
      }
    }

    const { passMark } = await loadExamConfig(pb);

    let questions;
    if (user.exam_question_ids) {
      questions = await resolveSnapshot(pb, user.exam_question_ids);
    } else {
      const bank = await loadExamBank(pb);
      questions = pickFreshQuestions(token, bank);

      if (DEVELOPER_EMAILS.includes(user.email)) {
        questions = questions.slice(0, 1);
      }

      await adminPatch(user.id, { exam_question_ids: JSON.stringify(questions.map(q => q.id)) }).catch(err =>
        console.error('[exam/check] failed to snapshot question IDs:', err.message)
      );
    }

    const safeQuestions = questions.map(q => ({
      id:       q.id,
      question: q.question,
      options:  JSON.parse(q.options || '[]'),
    }));

    res.json({
      valid: true,
      first_name: user.first_name,
      ifc_username: user.ifc_username,
      exam: {
        pass_mark: passMark,
        questions: safeQuestions,
      },
    });
  } catch (err) {
    console.error('[exam/check]', err.message);
    res.status(500).json({ error: 'Could not validate token.' });
  }
});

// POST /api/exam/submit — receive raw answers, score server-side
router.post('/submit', async (req, res) => {
  const { token, answers } = req.body;
  if (!token || !answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!/^[a-f0-9]+$/i.test(token)) return res.status(400).json({ error: 'Invalid token format' });

  try {
    const pb = await getAdminClient();
    let user;
    try {
      user = await pb.collection('users').getFirstListItem(
        pb.filter('exam_token = {:token}', { token }),
        { requestKey: null }
      );
    } catch {
      return res.status(404).json({ error: 'Invalid exam token.' });
    }

    if (user.exam_attempts > 0) {
      return res.status(400).json({ error: 'Exam already submitted.' });
    }

    if (user.exam_token_created) {
      const age = Date.now() - new Date(user.exam_token_created).getTime();
      if (age > TOKEN_TTL_MS) {
        return res.status(410).json({ error: 'This exam link has expired.' });
      }
    }

    const { passMark } = await loadExamConfig(pb);

    let questions;
    if (user.exam_question_ids) {
      questions = await resolveSnapshot(pb, user.exam_question_ids);
    } else {
      const bank = await loadExamBank(pb);
      questions = pickFreshQuestions(token, bank);
    }

    // Server-side scoring
    let correct = 0;
    const transcript = questions.map(q => {
      const options = JSON.parse(q.options || '[]');
      const pilotAnswer = answers[q.id] ?? answers[String(q.id)] ?? null;
      const isCorrect = pilotAnswer === q.answer;
      if (isCorrect) correct++;
      return {
        id:             q.id,
        question:       q.question,
        options,
        pilot_answer:   pilotAnswer ?? null,
        correct_answer: q.answer,
        is_correct:     isCorrect,
        explanation:    q.explanation || null,
      };
    });

    const score  = Math.round((correct / questions.length) * 100);
    const passed = score >= passMark;

    // Persist to PocketBase
    await adminPatch(user.id, {
      exam_passed:        passed,
      exam_score:         score,
      exam_attempts:      1,
      exam_token:         '',
      exam_transcript:    JSON.stringify(transcript),
      recruitment_status: passed ? 'approved' : 'exam_sent',
    });

    Promise.all(transcript.map(t =>
      pb.collection('exam_question_attempts').create({
        question:   t.id,
        user:       user.id,
        is_correct: t.is_correct,
        exam_token: token,
      })
    )).catch(err => console.error('[exam/submit] failed to log question attempts:', err.message));

    console.log(`[exam] ${user.first_name} ${user.last_name} scored ${score}% (${correct}/${questions.length}) — ${passed ? 'PASSED' : 'FAILED'}`);

    logAction(
      { id: user.id, callsign: user.callsign, email: user.email },
      'exam.submitted',
      { id: user.id, name: `${user.first_name} ${user.last_name} (${user.callsign})` },
      { score, passed, correct, total: questions.length }
    );

    // Notify staff via Discord webhook
    notifyExamResult({
      first_name:   user.first_name,
      last_name:    user.last_name,
      callsign:     user.callsign,
      ifc_username: user.ifc_username,
      score,
      correct,
      total:        questions.length,
      passed,
    }).catch(() => {});

    let invite_url = null;
    if (passed) {
      try {
        invite_url = await createDiscordInvite(user.id);
        logAction(null, 'pilot.discord_invite_generated', { id: user.id, name: `${user.first_name} ${user.last_name}` }, {
          reason: 'Auto-generated on exam pass',
        });
      } catch (err) {
        console.warn('[exam/submit] could not generate Discord invite:', err.message);
      }
    }

    res.json({
      success: true,
      passed,
      score,
      correct,
      total: questions.length,
      transcript,
      invite_url,
    });
  } catch (err) {
    console.error('[exam/submit]', err.message);
    res.status(500).json({ error: 'Failed to submit exam.' });
  }
});

// GET /api/exam/transcript/:userId — admin fetches stored transcript
router.get('/transcript/:userId', requireAuth, async (req, res) => {
  try {
    const pb = await getAdminClient();
    const user = await pb.collection('users').getOne(req.params.userId, {
      fields: 'id,first_name,last_name,exam_score,exam_passed,exam_attempts,exam_transcript',
      requestKey: null,
    });
    if (!user.exam_transcript) {
      return res.json({ transcript: null });
    }
    let transcript = user.exam_transcript;
    if (typeof transcript === 'string' && transcript.length > 0) {
      transcript = JSON.parse(transcript);
    }
    if (!Array.isArray(transcript)) {
      return res.json({ transcript: null });
    }
    res.json({ transcript, score: user.exam_score, passed: user.exam_passed });
  } catch (err) {
    console.error('[exam/transcript]', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch transcript', detail: err.message });
  }
});

// POST /api/exam/assign/:id
router.post('/assign/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    await adminPatch(req.params.id, {
      exam_token:         token,
      exam_token_created: new Date().toISOString(),
      exam_attempts:      0,
      exam_passed:        false,
      exam_score:         0,
      exam_transcript:    '',
      exam_question_ids:  '',
      recruitment_status: 'exam_sent',
    });
    res.json({ exam_url: `${FRONTEND_URL}/exam?token=${token}`, token });
    logAction(req.user, 'exam.assigned', { id: req.params.id, name: req.params.id }, {});
  } catch (err) {
    console.error('[exam/assign]', err.message);
    res.status(500).json({ error: 'Failed to assign exam.' });
  }
});

// POST /api/exam/reset/:id
router.post('/reset/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    await adminPatch(req.params.id, {
      exam_token:         token,
      exam_token_created: new Date().toISOString(),
      exam_attempts:      0,
      exam_passed:        false,
      exam_score:         0,
      exam_transcript:    '',
      exam_question_ids:  '',
      recruitment_status: 'exam_sent',
    });
    res.json({ exam_url: `${FRONTEND_URL}/exam?token=${token}`, token });
    logAction(req.user, 'exam.reset', { id: req.params.id, name: req.params.id }, {});
  } catch (err) {
    console.error('[exam/reset]', err.message);
    res.status(500).json({ error: 'Failed to reset exam.' });
  }
});

// PATCH /api/exam/:id/stage
router.patch('/:id/stage', requirePermission('recruitment.manage'), async (req, res) => {
  const { recruitment_status } = req.body;
  const valid = ['applied', 'contacted', 'exam_sent', 'approved', 'rejected'];
  if (!valid.includes(recruitment_status)) {
    return res.status(400).json({ error: 'Invalid stage' });
  }
  try {
    const update = { recruitment_status };
    if (recruitment_status === 'rejected') update.status = 'rejected';
    if (['applied', 'contacted', 'exam_sent'].includes(recruitment_status)) update.status = 'pending';
    await adminPatch(req.params.id, update);
    logAction(req.user, 'recruitment.stage_changed', { id: req.params.id, name: req.params.id }, { stage: recruitment_status });
    res.json({ success: true });
  } catch (err) {
    console.error('[exam/stage]', err.message);
    res.status(500).json({ error: 'Failed to update stage.', detail: err.message });
  }
});

// Topics
router.get('/topics', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const topics = await pb.collection('exam_topics').getFullList({ sort: 'sort_order', requestKey: null });
    const allQuestions = await pb.collection('exam_questions').getFullList({ fields: 'topic', requestKey: null });
    const countByTopic = {};
    allQuestions.forEach(q => { countByTopic[q.topic] = (countByTopic[q.topic] || 0) + 1; });
    res.json({ topics: topics.map(t => ({ ...t, question_count: countByTopic[t.id] || 0 })) });
  } catch (err) {
    console.error('[exam/topics]', err.message);
    res.status(500).json({ error: 'Failed to load topics' });
  }
});

router.post('/topics', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { name, questions_per_exam, sort_order } = req.body;
    if (!name || questions_per_exam == null) {
      return res.status(400).json({ error: 'name and questions_per_exam are required' });
    }
    const topic = await pb.collection('exam_topics').create({
      name,
      questions_per_exam: parseInt(questions_per_exam, 10) || 0,
      sort_order: sort_order ?? 0,
      active: true,
    });
    invalidateCache('bank');
    logAction(req.user, 'exam.topic_created', { id: topic.id, name: topic.name }, {});
    res.json({ topic });
  } catch (err) {
    console.error('[exam/topics/create]', err.message);
    res.status(500).json({ error: 'Failed to create topic' });
  }
});

router.patch('/topics/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { name, questions_per_exam, sort_order, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (questions_per_exam !== undefined) updates.questions_per_exam = parseInt(questions_per_exam, 10) || 0;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (active !== undefined) updates.active = !!active;
    const topic = await pb.collection('exam_topics').update(req.params.id, updates);
    invalidateCache('bank');
    logAction(req.user, 'exam.topic_updated', { id: topic.id, name: topic.name }, { fields: Object.keys(updates).join(', ') });
    res.json({ topic });
  } catch (err) {
    console.error('[exam/topics/update]', err.message);
    res.status(500).json({ error: 'Failed to update topic' });
  }
});

router.delete('/topics/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const existing = await pb.collection('exam_questions').getList(1, 1, {
      filter: `topic = "${escFilterValue(req.params.id)}"`, requestKey: null,
    });
    if (existing.totalItems > 0) {
      return res.status(400).json({ error: `Can't delete — ${existing.totalItems} question(s) still assigned to this topic. Move or delete them first.` });
    }
    await pb.collection('exam_topics').delete(req.params.id);
    invalidateCache('bank');
    logAction(req.user, 'exam.topic_deleted', { id: req.params.id, name: req.params.id }, {});
    res.json({ success: true });
  } catch (err) {
    console.error('[exam/topics/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

// Questions
router.get('/questions', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const filter = req.query.topic ? `topic = "${escFilterValue(req.query.topic)}"` : '';
    const questions = await pb.collection('exam_questions').getFullList({ filter, sort: '-created', requestKey: null });
    res.json({ questions: questions.map(q => ({ ...q, options: JSON.parse(q.options || '[]') })) });
  } catch (err) {
    console.error('[exam/questions]', err.message);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

router.post('/questions', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { topic, question, options, answer, explanation } = req.body;
    if (!topic || !question || !Array.isArray(options) || options.length < 2 || answer == null) {
      return res.status(400).json({ error: 'topic, question, options (2 or more), and answer are required' });
    }
    const rec = await pb.collection('exam_questions').create({
      topic, question, options: JSON.stringify(options),
      answer: parseInt(answer, 10), explanation: explanation || '', active: true,
    });
    invalidateCache('bank');
    logAction(req.user, 'exam.question_created', { id: rec.id, name: question.slice(0, 60) }, {});
    res.json({ question: { ...rec, options } });
  } catch (err) {
    console.error('[exam/questions/create]', err.message);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

router.patch('/questions/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { topic, question, options, answer, explanation, active } = req.body;
    const updates = {};
    if (topic       !== undefined) updates.topic       = topic;
    if (question    !== undefined) updates.question    = question;
    if (options     !== undefined) updates.options     = JSON.stringify(options);
    if (answer      !== undefined) updates.answer      = parseInt(answer, 10);
    if (explanation !== undefined) updates.explanation = explanation;
    if (active      !== undefined) updates.active      = !!active;
    const rec = await pb.collection('exam_questions').update(req.params.id, updates);
    invalidateCache('bank');
    logAction(req.user, 'exam.question_updated', { id: rec.id, name: rec.question.slice(0, 60) }, { fields: Object.keys(updates).join(', ') });
    res.json({ question: { ...rec, options: JSON.parse(rec.options || '[]') } });
  } catch (err) {
    console.error('[exam/questions/update]', err.message);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

router.delete('/questions/:id', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    await pb.collection('exam_questions').delete(req.params.id);
    invalidateCache('bank');
    logAction(req.user, 'exam.question_deleted', { id: req.params.id, name: req.params.id }, {});
    res.json({ success: true });
  } catch (err) {
    console.error('[exam/questions/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

router.get('/question-stats', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const [attempts, questions] = await Promise.all([
      pb.collection('exam_question_attempts').getFullList({ requestKey: null }),
      pb.collection('exam_questions').getFullList({ requestKey: null }),
    ]);
    const questionById = {};
    questions.forEach(q => { questionById[q.id] = q; });

    const statsByQuestion = {};
    for (const a of attempts) {
      if (!statsByQuestion[a.question]) statsByQuestion[a.question] = { asked: 0, correct: 0 };
      statsByQuestion[a.question].asked++;
      if (a.is_correct) statsByQuestion[a.question].correct++;
    }

    const rows = Object.entries(statsByQuestion).map(([questionId, s]) => ({
      question_id:     questionId,
      question:        questionById[questionId]?.question || '(deleted question)',
      topic:           questionById[questionId]?.topic || null,
      times_asked:     s.asked,
      times_correct:   s.correct,
      times_incorrect: s.asked - s.correct,
      percent_correct: s.asked > 0 ? Math.round((s.correct / s.asked) * 100) : null,
    })).sort((a, b) => a.percent_correct - b.percent_correct);

    res.json({ questions: rows });
  } catch (err) {
    console.error('[exam/question-stats]', err.message);
    res.status(500).json({ error: 'Failed to load question stats' });
  }
});

router.get('/config', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    res.json(await loadExamConfig(pb));
  } catch (err) {
    console.error('[exam/config]', err.message);
    res.status(500).json({ error: 'Failed to load exam config' });
  }
});

router.patch('/config', requirePermission('recruitment.manage'), async (req, res) => {
  try {
    const pb = await getAdminClient();
    const { pass_mark, title } = req.body;
    const saveKey = async (key, value) => {
      let rec;
      try { rec = await pb.collection('settings').getFirstListItem(`key = "${escFilterValue(key)}"`, { requestKey: null }); } catch { rec = null; }
      if (rec) await pb.collection('settings').update(rec.id, { value: String(value) });
      else await pb.collection('settings').create({ key, value: String(value) });
    };
    if (pass_mark !== undefined) await saveKey('exam_pass_mark', pass_mark);
    if (title !== undefined) await saveKey('exam_title', title);
    logAction(req.user, 'exam.config_updated', { id: 'exam_config', name: 'Exam configuration' }, { pass_mark, title });
    res.json({ success: true });
  } catch (err) {
    console.error('[exam/config/update]', err.message);
    res.status(500).json({ error: 'Failed to update exam config' });
  }
});

module.exports = router;
