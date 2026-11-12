/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// How applicants are assessed: the crew centre's own exam, an exam somewhere
// else (a Google Form, say), or no exam. Shown the first time staff open
// Recruitment, and from "Recruitment settings" after that.

import React, { useState } from 'react';
import { exam as examApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import brand from '../../brand';

const OPTIONS = [
  {
    key: 'builtin', title: 'Our own exam',
    desc: 'A multiple-choice exam on the crew centre, marked automatically. You write the questions.',
    steps: ['A pilot applies', 'You send them the exam from Recruitment', 'It\'s marked as soon as they finish', 'You approve them and send a welcome message'],
  },
  {
    key: 'external', title: 'An external exam',
    desc: 'An exam you already have somewhere else, like a Google Form. You send the link and mark it yourselves.',
    steps: ['A pilot applies', 'You send them your exam link', 'You mark it', 'You approve them and send a welcome message'],
  },
  {
    key: 'none', title: 'No exam',
    desc: 'Pilots apply and your staff approve or reject them.',
    steps: ['A pilot applies', 'You look over their application', 'You approve them and send a welcome message'],
  },
];

const input = { width: '100%', boxSizing: 'border-box', padding: '0.75rem 1rem', borderRadius: 8, border: '1.5px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '1rem', fontFamily: 'inherit', outline: 'none' };
const label = { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' };

function RecruitmentSetup({ current, firstTime, onSaved, onCancel }) {
  const [exam, setExam] = useState(current?.configured ? current.exam : null);
  const [url, setUrl] = useState(current?.external_url || '');
  const [note, setNote] = useState(current?.external_note || '');
  const [saving, setSaving] = useState(false);
  const chosen = OPTIONS.find(o => o.key === exam);

  const save = async () => {
    setSaving(true);
    try {
      const next = await examApi.saveRecruitment({ exam, external_url: url, external_note: note });
      showToast('Recruitment saved', 'success');
      onSaved(next);
    } catch (err) {
      showToast(err.message || 'Couldn\'t save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.3rem' }}>{firstTime ? 'Set up recruitment' : 'Recruitment settings'}</h2>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.55 }}>
        How should new pilots join {brand.shortName}? You can change this any time.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {OPTIONS.map(o => {
          const on = exam === o.key;
          return (
            <button key={o.key} type="button" onClick={() => setExam(o.key)} aria-pressed={on} style={{
              textAlign: 'left', padding: '1rem', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)',
              background: on ? 'rgba(var(--brand-primary-rgb),0.06)' : 'var(--bg-card)',
              border: `1.5px solid ${on ? 'var(--avg-green)' : 'var(--border-color)'}`,
              display: 'flex', flexDirection: 'column', gap: '0.4rem',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${on ? 'var(--avg-green)' : 'var(--border-color)'}`, display: 'grid', placeItems: 'center' }}>
                  {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--avg-green)' }} />}
                </span>
                {o.title}
              </span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{o.desc}</span>
            </button>
          );
        })}
      </div>

      {exam === 'external' && (
        <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={label} htmlFor="rs-url">Link to your exam</label>
            <input id="rs-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://forms.gle/…" style={input} spellCheck={false} />
          </div>
          <div>
            <label style={label} htmlFor="rs-note">Instructions for applicants <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span></label>
            <textarea id="rs-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500}
              placeholder="e.g. Use your IFC username as your name so we can match your answers."
              style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Added to the message you send with the link.</div>
          </div>
        </div>
      )}

      {chosen && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>How it works</div>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.9rem' }}>
            {chosen.steps.map(s => <li key={s}>{s}</li>)}
          </ol>
          {exam === 'builtin' && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.85rem 0 0' }}>
              {current?.questions
                ? `You have ${current.questions} question${current.questions === 1 ? '' : 's'} written.`
                : 'Next you\'ll add your exam topics and questions.'}
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button onClick={save} disabled={!exam || saving} className="btn btn-primary" style={{ opacity: !exam || saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : exam === 'builtin' && !current?.questions ? 'Save and write questions' : 'Save'}
        </button>
        {onCancel && <button onClick={onCancel} className="btn btn-secondary">Cancel</button>}
      </div>
    </div>
  );
}

export default RecruitmentSetup;
