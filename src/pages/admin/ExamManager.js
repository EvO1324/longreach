/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { examTopics as topicsApi, examQuestions as questionsApi, exam as examApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import { X, Plus, Trash2, Pencil, Check, GraduationCap, ListChecks, BarChart3, Settings } from 'lucide-react';

function ExamManager({ onClose }) {
  const [tab, setTab] = useState('topics'); // 'topics' | 'questions' | 'stats' | 'config'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <GraduationCap size={18} color="var(--avg-green)" />
            <span style={{ fontWeight: 800, fontSize: '1.02rem' }}>Manage Exam</span>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 1.4rem', flexShrink: 0 }}>
          {[
            { key: 'topics', label: 'Topics', icon: ListChecks },
            { key: 'questions', label: 'Questions', icon: GraduationCap },
            { key: 'stats', label: 'Problem Questions', icon: BarChart3 },
            { key: 'config', label: 'Settings', icon: Settings },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 0.9rem',
                background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--avg-green)' : '2px solid transparent',
                color: tab === t.key ? 'var(--avg-green)' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.4rem' }}>
          {tab === 'topics' && <TopicsTab />}
          {tab === 'questions' && <QuestionsTab />}
          {tab === 'stats' && <StatsTab />}
          {tab === 'config' && <ConfigTab />}
        </div>
      </div>
    </div>
  );
}

// Topics
function TopicsTab() {
  const [topics, setTopics] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCount, setNewCount] = useState(5);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCount, setEditCount] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => topicsApi.list().then(d => setTopics(d.topics || [])).catch(() => showToast('Failed to load topics', 'error'));
  useEffect(() => { load(); }, []);

  const totalQuestionsPerExam = (topics || []).filter(t => t.active !== false).reduce((s, t) => s + (t.questions_per_exam || 0), 0);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await topicsApi.create({ name: newName.trim(), questions_per_exam: parseInt(newCount, 10) || 0, sort_order: (topics?.length || 0) });
      setNewName(''); setNewCount(5); setAdding(false);
      load();
      showToast('Topic added', 'success');
    } catch (err) { showToast(err.message || 'Failed to add topic', 'error'); }
  };

  const startEdit = (t) => { setEditingId(t.id); setEditName(t.name); setEditCount(t.questions_per_exam); };
  const saveEdit = async () => {
    try {
      await topicsApi.update(editingId, { name: editName.trim(), questions_per_exam: parseInt(editCount, 10) || 0 });
      setEditingId(null);
      load();
    } catch (err) { showToast(err.message || 'Failed to save', 'error'); }
  };

  const confirmDelete = async () => {
    try {
      await topicsApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
      showToast('Topic deleted', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete topic', 'error');
      setDeleteTarget(null);
    }
  };

  if (!topics) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <div>
      <div style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '0.65rem 0.9rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Every exam pulls <strong style={{ color: 'var(--text-primary)' }}>{totalQuestionsPerExam} questions total</strong> — that many are pulled from each active topic below, added together.
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <th style={{ paddingBottom: '0.5rem' }}>Topic</th>
            <th style={{ paddingBottom: '0.5rem' }}>Questions in exam</th>
            <th style={{ paddingBottom: '0.5rem' }}>Bank size</th>
            <th style={{ paddingBottom: '0.5rem' }}></th>
          </tr>
        </thead>
        <tbody>
          {topics.map(t => (
            <tr key={t.id} style={{ borderTop: '1px solid var(--border-color)' }}>
              {editingId === t.id ? (
                <>
                  <td style={{ padding: '0.5rem 0' }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: 6 }} />
                  </td>
                  <td style={{ padding: '0.5rem 0' }}>
                    <input type="number" min="0" value={editCount} onChange={e => setEditCount(e.target.value)} style={{ width: 70, padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: 6 }} />
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{t.question_count}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={saveEdit} style={{ background: 'none', border: 'none', color: 'var(--avg-green)', cursor: 'pointer', padding: '0.3rem' }}><Check size={16} /></button>
                    <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem' }}><X size={16} /></button>
                  </td>
                </>
              ) : (
                <>
                  <td style={{ padding: '0.6rem 0', fontWeight: 600 }}>{t.name}{t.active === false && <span style={{ marginLeft: 8, fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 400 }}>(inactive)</span>}</td>
                  <td>{t.questions_per_exam}</td>
                  <td style={{ color: t.question_count < t.questions_per_exam ? '#c62828' : 'var(--text-secondary)' }}>
                    {t.question_count}{t.question_count < t.questions_per_exam ? ` (needs ${t.questions_per_exam - t.question_count} more)` : ''}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem' }}><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(t)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', padding: '0.3rem' }}><Trash2 size={14} /></button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {adding ? (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Topic name" style={{ flex: 1, padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 6 }} />
          <input type="number" min="0" value={newCount} onChange={e => setNewCount(e.target.value)} style={{ width: 80, padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 6 }} />
          <button onClick={handleAdd} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>Add</button>
          <button onClick={() => setAdding(false)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '1rem', background: 'none', border: '1px dashed var(--border-color)', borderRadius: 8, padding: '0.55rem 0.9rem', color: 'var(--avg-green)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
          <Plus size={14} /> Add topic
        </button>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This can't be undone. If any questions are still assigned to this topic, deletion will be blocked until they're moved or removed."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// Questions
function QuestionsTab() {
  const [topics, setTopics] = useState([]);
  const [questions, setQuestions] = useState(null);
  const [filterTopic, setFilterTopic] = useState('');
  const [editing, setEditing] = useState(null); // question object being edited, or {} for new
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => {
    questionsApi.list(filterTopic || undefined).then(d => setQuestions(d.questions || [])).catch(() => showToast('Failed to load questions', 'error'));
  };
  useEffect(() => { topicsApi.list().then(d => setTopics(d.topics || [])); }, []);
  useEffect(() => { load(); }, [filterTopic]); // eslint-disable-line react-hooks/exhaustive-deps

  const topicName = (id) => topics.find(t => t.id === id)?.name || '—';

  const confirmDelete = async () => {
    try {
      await questionsApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
      showToast('Question deleted', 'success');
    } catch (err) { showToast(err.message || 'Failed to delete', 'error'); setDeleteTarget(null); }
  };

  if (!questions) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.6rem', flexWrap: 'wrap' }}>
        <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: '0.82rem' }}>
          <option value="">All topics</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button onClick={() => setEditing({})} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.5rem 0.9rem' }}>
          <Plus size={14} /> Add question
        </button>
      </div>

      {questions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No questions{filterTopic ? ' in this topic' : ''} yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {questions.map(q => (
            <div key={q.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem 0.9rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--avg-green)', background: 'var(--avg-green-pale)', padding: '0.1rem 0.45rem', borderRadius: 4 }}>{topicName(q.topic)}</span>
                  {q.active === false && <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>(inactive)</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{q.question}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Correct: {q.options[q.answer]}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                <button onClick={() => setEditing(q)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem' }}><Pencil size={14} /></button>
                <button onClick={() => setDeleteTarget(q)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', padding: '0.3rem' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <QuestionEditor question={editing} topics={topics} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}

      {deleteTarget && (
        <ConfirmModal
          title="Delete this question?"
          message="This can't be undone. Past exam results that included this question aren't affected — only future exams stop using it."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function QuestionEditor({ question, topics, onClose, onSaved }) {
  const isNew = !question.id;
  const [topic, setTopic] = useState(question.topic || topics[0]?.id || '');
  const [text, setText] = useState(question.question || '');
  const [options, setOptions] = useState(question.options && question.options.length > 0 ? [...question.options] : ['', '']);
  const [answer, setAnswer] = useState(question.answer ?? 0);
  const [explanation, setExplanation] = useState(question.explanation || '');
  const [saving, setSaving] = useState(false);

  const updateOption = (i, val) => setOptions(prev => prev.map((o, idx) => idx === i ? val : o));
  const addOption = () => setOptions(prev => [...prev, '']);
  const removeOption = (i) => {
    setOptions(prev => prev.filter((_, idx) => idx !== i));
    if (answer === i) setAnswer(0);
    else if (answer > i) setAnswer(a => a - 1);
  };

  const save = async () => {
    if (!topic || !text.trim() || options.some(o => !o.trim()) || options.length < 2) {
      showToast('Fill in the topic, question, and every option (at least 2)', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { topic, question: text.trim(), options: options.map(o => o.trim()), answer, explanation: explanation.trim() };
      if (isNew) await questionsApi.create(payload);
      else await questionsApi.update(question.id, payload);
      showToast(isNew ? 'Question added' : 'Question saved', 'success');
      onSaved();
    } catch (err) {
      showToast(err.message || 'Failed to save question', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4100, padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem' }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '1rem' }}>{isNew ? 'Add question' : 'Edit question'}</div>

        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Topic</label>
        <select value={topic} onChange={e => setTopic(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 7, marginTop: '0.3rem', marginBottom: '0.9rem' }}>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Question</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 7, marginTop: '0.3rem', marginBottom: '0.9rem', fontFamily: 'inherit', resize: 'vertical' }} />

        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Options — select the correct one</label>
        <div style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="radio" checked={answer === i} onChange={() => setAnswer(i)} />
              <input value={opt} onChange={e => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`} style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: 6 }} />
              {options.length > 2 && <button onClick={() => removeOption(i)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer' }}><Trash2 size={14} /></button>}
            </div>
          ))}
          <button onClick={addOption} style={{ fontSize: '0.78rem', color: 'var(--avg-green)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add option</button>
        </div>

        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Explanation (optional — shown after the exam)</label>
        <textarea value={explanation} onChange={e => setExplanation(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 7, marginTop: '0.3rem', marginBottom: '1.1rem', fontFamily: 'inherit', resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button onClick={onClose} disabled={saving} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// Problem Questions (stats)
function StatsTab() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    examApi.questionStats().then(d => setRows(d.questions || [])).catch(() => showToast('Failed to load question stats', 'error'));
  }, []);

  if (!rows) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No exam attempts logged yet.</div>;

  return (
    <div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Worst-performing questions... allows us to track problem topics/shitty questions.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <th style={{ paddingBottom: '0.5rem' }}>Question</th>
            <th style={{ paddingBottom: '0.5rem' }}>Asked</th>
            <th style={{ paddingBottom: '0.5rem' }}>Correct</th>
            <th style={{ paddingBottom: '0.5rem' }}>% correct</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const color = r.percent_correct == null ? 'var(--text-secondary)' : r.percent_correct < 50 ? '#c62828' : r.percent_correct < 75 ? 'var(--avg-gold-dark, var(--brand-accent-dark))' : 'var(--avg-green)';
            return (
              <tr key={r.question_id} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.55rem 0', maxWidth: 360 }}>{r.question}</td>
                <td>{r.times_asked}</td>
                <td>{r.times_correct}/{r.times_asked}</td>
                <td style={{ fontWeight: 700, color }}>{r.percent_correct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Config (title / pass mark)
function ConfigTab() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { examApi.config().then(setConfig).catch(() => showToast('Failed to load exam settings', 'error')); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await examApi.updateConfig({ pass_mark: config.passMark, title: config.title });
      showToast('Exam settings saved', 'success');
    } catch (err) { showToast(err.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  if (!config) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 380 }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Exam title</label>
      <input value={config.title} onChange={e => setConfig({ ...config, title: e.target.value })} style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 7, marginTop: '0.3rem', marginBottom: '1rem' }} />

      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Pass mark (%)</label>
      <input type="number" min="0" max="100" value={config.passMark} onChange={e => setConfig({ ...config, passMark: e.target.value })} style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 7, marginTop: '0.3rem', marginBottom: '1.2rem' }} />

      <button onClick={save} disabled={saving} className="btn btn-primary" style={{ width: '100%' }}>{saving ? 'Saving…' : 'Save settings'}</button>
    </div>
  );
}

export default ExamManager;
