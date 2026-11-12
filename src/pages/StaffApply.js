/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffApplications as staffApi } from '../api/client';
import { ArrowLeft, CheckCircle, ChevronRight, Users, Shield, Star, Headphones, FileText, Briefcase, CodeXml } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';

import brand from '../brand';
const QUESTIONS = [
  {
    id: 'why_join',
    label: `Why do you want to join the ${brand.abbreviation} staff team?`,
    hint: 'Tell us what motivates you and what you hope to contribute.',
    type: 'textarea',
    required: true,
    minLength: 80,
  },
  {
    id: 'avg_duration',
    label: `How long have you been a member of ${brand.shortName}?`,
    hint: 'e.g. "About 6 months", "Since mid-2023"',
    type: 'text',
    required: true,
  },
  {
    id: 'if_community',
    label: 'How long have you been involved in the Infinite Flight community?',
    hint: 'e.g. "3 years", "Started flying on IF in 2020"',
    type: 'text',
    required: true,
  },
  {
    id: 'past_staff',
    label: 'Have you previously held a staff position in another VA or IF community?',
    hint: 'If yes, briefly describe the role and organisation.',
    type: 'textarea',
    required: true,
    placeholder: 'e.g. "Yes — I was a recruitment officer at XYZ Virtual for 1 year" or "No"',
  },
  {
    id: 'current_staff',
    label: 'Do you currently hold any staff position elsewhere?',
    hint: 'We want to make sure you have the time to commit to this role.',
    type: 'textarea',
    required: true,
    placeholder: 'e.g. "Yes — I\'m currently a moderator at ABC VA, but I\'m stepping down" or "No"',
  },
];

function PositionIcon({ title = '' }) {
  const t = title.toLowerCase();
  if (t.includes('moderat') || t.includes('discord')) return <Headphones size={20} />;
  if (t.includes('recruit'))                           return <Users size={20} />;
  if (t.includes('admin') || t.includes('manage'))    return <Shield size={20} />;
  if (t.includes('event') || t.includes('social'))    return <Star size={20} />;
  if (t.includes('content') || t.includes('media'))   return <FileText size={20} />;
  if (t.includes('developer'))                        return <CodeXml size={20} />;
  return <Briefcase size={20} />;
}

export default function StaffApply({ user }) {
  const navigate = useNavigate();

  const [positions, setPositions]   = useState([]);
  const [loadingPos, setLoadingPos] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');
  const [positionId, setPositionId] = useState('');

  // One answer string per question, keyed by question id
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(QUESTIONS.map(q => [q.id, '']))
  );

  useEffect(() => {
    staffApi.positions()
      .then(d => setPositions(d.positions || []))
      .catch(() => setError('Unable to load positions. Please try again later.'))
      .finally(() => setLoadingPos(false));
  }, []);

  const setAnswer = (id, val) => setAnswers(prev => ({ ...prev, [id]: val }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!positionId) { setError('Please select a position.'); return; }

    for (const q of QUESTIONS) {
      if (q.required && !answers[q.id].trim()) {
        setError(`Please answer: "${q.label}"`);
        return;
      }
      if (q.minLength && answers[q.id].trim().length < q.minLength) {
        setError(`Your answer to "${q.label}" is a bit short — please give us a little more detail.`);
        return;
      }
    }

    // Pack answers as a JSON array into the `reason` field
    const structuredAnswers = QUESTIONS.map(q => ({
      question: q.label,
      answer:   answers[q.id].trim(),
    }));

    setSubmitting(true);
    try {
      await staffApi.apply({
        name:             `${user.first_name} ${user.last_name}`,
        ifc_username:     user.ifc_username || '',
        discord_username: user.discord_username || '',
        position_id:      positionId,
        reason:           JSON.stringify(structuredAnswers),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPosition = positions.find(p => p.id === positionId);
  const noPositions      = !loadingPos && positions.length === 0;

  // Progress: how many required questions have a non-empty answer
  const answered      = QUESTIONS.filter(q => q.required && answers[q.id].trim().length > 0).length;
  const totalRequired = QUESTIONS.filter(q => q.required).length;
  const progressPct   = positionId ? Math.round((answered / totalRequired) * 100) : 0;

  return (
    <div className="main-content-inner">
      <style>{`
        .sa-back-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: none; border: none; cursor: pointer;
          color: var(--text-secondary); font-size: 0.875rem;
          font-family: inherit; font-weight: 500;
          padding: 0; margin-bottom: 2rem;
          transition: color 0.15s;
        }
        .sa-back-btn:hover { color: var(--text-primary); }

        .sa-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 2rem;
          align-items: start;
        }
        @media (max-width: 900px) {
          .sa-grid { grid-template-columns: 1fr; }
          .sa-sidebar { position: static !important; }
        }

        .sa-position-card {
          padding: 1rem 1.25rem;
          border-radius: 12px;
          border: 1.5px solid var(--border-color);
          background: var(--bg-card);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
          display: flex; align-items: center; gap: 1rem;
          text-align: left; width: 100%; font-family: inherit;
        }
        .sa-position-card:hover {
          border-color: var(--avg-green);
          background: var(--avg-green-pale);
        }
        .sa-position-card.selected {
          border-color: var(--avg-green);
          background: var(--avg-green-pale);
          box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb),0.1);
        }
        .sa-position-icon {
          width: 42px; height: 42px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(var(--brand-primary-rgb),0.1); color: var(--avg-green);
          transition: background 0.15s;
        }
        .sa-position-card.selected .sa-position-icon { background: rgba(var(--brand-primary-rgb),0.18); }

        .sa-input {
          width: 100%; padding: 0.75rem 1rem; box-sizing: border-box;
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-color); border-radius: 10px;
          color: var(--text-primary); font-size: 0.9rem;
          font-family: inherit; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .sa-input:focus {
          border-color: var(--avg-green);
          box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb),0.1);
        }
        .sa-textarea {
          resize: vertical; min-height: 110px; line-height: 1.65;
        }

        .sa-q-label {
          display: block; font-weight: 700; font-size: 0.9rem;
          color: var(--text-primary); margin-bottom: 0.3rem;
        }
        .sa-q-hint {
          font-size: 0.78rem; color: var(--text-secondary);
          margin-bottom: 0.65rem; line-height: 1.5;
        }

        .sa-progress-bar {
          height: 4px; background: var(--border-color); border-radius: 4px; overflow: hidden;
          margin-bottom: 0.6rem;
        }
        .sa-progress-fill {
          height: 100%; background: var(--avg-green); border-radius: 4px;
          transition: width 0.4s ease;
        }

        .sa-submit-btn {
          width: 100%; padding: 0.875rem;
          background: var(--avg-green); color: white;
          border: none; border-radius: 10px;
          font-size: 0.95rem; font-weight: 700; font-family: inherit;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 0.5rem;
          transition: background 0.15s, transform 0.1s, opacity 0.15s;
        }
        .sa-submit-btn:hover:not(:disabled) {
          background: var(--avg-green-dark); transform: translateY(-1px);
        }
        .sa-submit-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

        .sa-info-row {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 0.65rem 0; border-bottom: 1px solid var(--border-color);
          font-size: 0.875rem;
        }
        .sa-info-row:last-child { border-bottom: none; }

        .sa-step-num {
          width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; font-weight: 800; color: white;
          transition: background 0.2s;
        }

        .sa-checklist-item {
          display: flex; align-items: center; gap: 0.55rem;
          font-size: 0.82rem; padding: 0.3rem 0;
          transition: color 0.2s;
        }
        .sa-checklist-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
          transition: background 0.2s;
        }

        @keyframes sa-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sa-animate     { animation: sa-fade-up 0.3s ease both; }
        .sa-delay-1     { animation-delay: 0.05s; }
        .sa-delay-2     { animation-delay: 0.10s; }
        .sa-delay-3     { animation-delay: 0.15s; }
      `}</style>

      {/* Back */}
      <button className="sa-back-btn" onClick={() => navigate('/dashboard')}>
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      {/* Page header */}
      <div style={{ marginBottom: '2rem' }} className="sa-animate">
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--avg-green)',
            background: 'var(--avg-green-pale)', border: '1px solid rgba(var(--brand-primary-rgb),0.2)',
            padding: '0.2rem 0.65rem', borderRadius: '20px',
          }}>Staff Recruitment</span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '0.4rem' }}>
          Join the Team
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', maxWidth: 540 }}>
          We're always looking for passionate pilots to help run {brand.shortName}.
          Fill in the form below and our admin team will be in touch via Discord.
        </p>
      </div>

      {/* Submitted */}
      {submitted && (
        <div className="card sa-animate" style={{ maxWidth: 520, textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--avg-green-pale)', border: '2px solid rgba(var(--brand-primary-rgb),0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', color: 'var(--avg-green)',
          }}>
            <CheckCircle size={28} strokeWidth={2} />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.6rem' }}>Application Submitted!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: '2rem', maxWidth: 360, margin: '0 auto 2rem' }}>
            Thanks {user.first_name}! We've received your application for{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{selectedPosition?.title}</strong>.
            Our team will review it and reach out via Discord.
          </p>
          <button onClick={() => navigate('/dashboard')} className="sa-submit-btn" style={{ maxWidth: 200, margin: '0 auto' }}>
            Back to Dashboard
          </button>
        </div>
      )}

      {/* Loading */}
      {loadingPos && !submitted && (
        <div style={{ color: 'var(--text-secondary)', padding: '3rem 0', textAlign: 'center' }}>Loading positions…</div>
      )}

      {/* No positions */}
      {noPositions && !submitted && (
        <div className="card" style={{ maxWidth: 440, textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.4rem' }}>No open positions right now</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Keep an eye on our Discord for recruitment announcements.
          </p>
        </div>
      )}

      {/* Main form */}
      {!loadingPos && !submitted && !noPositions && (
        <form onSubmit={handleSubmit}>
          <div className="sa-grid">

            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* Step 1: Position */}
              <div className="card sa-animate sa-delay-1" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
                  <div className="sa-step-num" style={{ background: 'var(--avg-green)' }}>1</div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Choose a position</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {positions.map(pos => {
                    const sel = positionId === pos.id;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        className={`sa-position-card${sel ? ' selected' : ''}`}
                        onClick={() => setPositionId(pos.id)}
                      >
                        <div className="sa-position-icon">
                          <PositionIcon title={pos.title} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: pos.description ? '0.15rem' : 0 }}>{pos.title}</div>
                          {pos.description && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{pos.description}</div>
                          )}
                        </div>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${sel ? 'var(--avg-green)' : 'var(--border-color)'}`,
                          background: sel ? 'var(--avg-green)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {sel && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Questions */}
              <div className="card sa-animate sa-delay-2" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
                  <div className="sa-step-num" style={{ background: positionId ? 'var(--avg-green)' : 'var(--border-color)' }}>2</div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Application questions</h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {QUESTIONS.map((q, idx) => (
                    <div key={q.id}>
                      {/* Subtle divider between questions */}
                      {idx > 0 && (
                        <div style={{ borderTop: '1px solid var(--border-color)', marginBottom: '1.5rem' }} />
                      )}
                      <label className="sa-q-label" htmlFor={`q-${q.id}`}>
                        {idx + 1}. {q.label}
                        {q.required && <span style={{ color: 'var(--avg-green)', marginLeft: '0.2rem' }}>*</span>}
                      </label>
                      {q.hint && <p className="sa-q-hint">{q.hint}</p>}
                      {q.type === 'textarea' ? (
                        <>
                          <textarea
                            id={`q-${q.id}`}
                            className="sa-input sa-textarea"
                            placeholder={q.placeholder || 'Your answer…'}
                            value={answers[q.id]}
                            onChange={e => setAnswer(q.id, e.target.value)}
                            required={q.required}
                          />
                          {q.minLength && answers[q.id].trim().length > 0 && answers[q.id].trim().length < q.minLength && (
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                              {q.minLength - answers[q.id].trim().length} more characters recommended
                            </div>
                          )}
                        </>
                      ) : (
                        <input
                          id={`q-${q.id}`}
                          type="text"
                          className="sa-input"
                          placeholder={q.placeholder || 'Your answer…'}
                          value={answers[q.id]}
                          onChange={e => setAnswer(q.id, e.target.value)}
                          required={q.required}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: 'rgba(198,40,40,0.07)', border: '1px solid rgba(198,40,40,0.2)',
                  borderRadius: '10px', padding: '0.875rem 1rem',
                  color: '#c62828', fontSize: '0.875rem', fontWeight: 500,
                }}>
                  {error}
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div className="sa-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1.5rem' }}>

              {/* Applicant card */}
              <div className="card sa-animate sa-delay-1" style={{ marginBottom: 0 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '1rem', opacity: 0.7 }}>
                  Applying as
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.1rem' }}>
                  <UserAvatar user={user} size={46} fontSize="1rem" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{user.first_name} {user.last_name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--avg-gold)', fontWeight: 600 }}>{user.callsign}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  {user.total_hours > 0 && (
                    <div className="sa-info-row">
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>Hours logged</span>
                      <span style={{ fontWeight: 700, color: 'var(--avg-green)' }}>{Math.floor(user.total_hours)}h</span>
                    </div>
                  )}
                  {user.ifc_username && (
                    <div className="sa-info-row">
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>IFC</span>
                      <span style={{ fontWeight: 600 }}>@{user.ifc_username}</span>
                    </div>
                  )}
                  {user.discord_username && (
                    <div className="sa-info-row">
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>Discord</span>
                      <span style={{ fontWeight: 600 }}>@{user.discord_username}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress + Submit */}
              <div className="card sa-animate sa-delay-2" style={{ marginBottom: 0 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.75rem', opacity: 0.7 }}>
                  Progress
                </div>

                {/* Progress bar */}
                <div className="sa-progress-bar">
                  <div className="sa-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  {!positionId
                    ? 'Select a position to begin'
                    : answered === totalRequired
                      ? '✓ All done - ready to submit'
                      : `${answered} of ${totalRequired} questions answered`}
                </div>

                {/* Checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', marginBottom: '1.25rem' }}>
                  <div className="sa-checklist-item" style={{ color: positionId ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    <div className="sa-checklist-dot" style={{ background: positionId ? 'var(--avg-green)' : 'var(--border-color)' }} />
                    Position selected
                  </div>
                  {QUESTIONS.filter(q => q.required).map(q => {
                    const done = answers[q.id].trim().length > 0 && (!q.minLength || answers[q.id].trim().length >= q.minLength);
                    return (
                      <div key={q.id} className="sa-checklist-item" style={{ color: done ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        <div className="sa-checklist-dot" style={{ background: done ? 'var(--avg-green)' : 'var(--border-color)' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.label.length > 42 ? q.label.slice(0, 42) + '…' : q.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="submit"
                  className="sa-submit-btn"
                  disabled={submitting || !positionId || answered < totalRequired}
                >
                  {submitting ? 'Submitting…' : (
                    <>Submit Application <ChevronRight size={16} /></>
                  )}
                </button>
              </div>

              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
                Applications are reviewed by the {brand.abbreviation} admin team. We'll reach out via Discord.
              </p>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
