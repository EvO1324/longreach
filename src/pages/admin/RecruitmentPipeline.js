/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ConfirmModal from '../../components/ConfirmModal';
import { exam as examApi, pilots as pilotsApi, infiniteFlight, watchlist as watchlistApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import IFRoleBadges from '../../components/IFRoleBadges';
import PaperPlaneAnimation from '../../components/PaperPlaneAnimation';
import {
  Mail, RefreshCw, Check, X, Undo2, Trash2, FileText, MoreVertical,
  Loader2, Info, AlertTriangle, Ban,
} from 'lucide-react';

import brand from '../../brand';
const WATCHLIST_META = {
  watchlist: { label: 'Watchlisted', color: '#e65100', bg: 'rgba(230,81,0,0.08)', icon: AlertTriangle },
  blacklist: { label: 'Blacklisted', color: '#c62828', bg: 'rgba(198,40,40,0.08)', icon: Ban },
};

function WatchlistFlag({ entry, showLabel }) {
  if (!entry) return null;
  const meta = WATCHLIST_META[entry.status] || WATCHLIST_META.watchlist;
  const Icon = meta.icon;
  return (
    <span title={entry.reason || meta.label} style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.68rem', fontWeight: 700, color: meta.color,
      padding: showLabel ? '0.2rem 0.55rem' : '0.2rem', borderRadius: '999px',
      background: meta.bg, flexShrink: 0,
    }}>
      <Icon size={11} strokeWidth={2.5} />
      {showLabel && meta.label}
    </span>
  );
}

// Brand tokens (matching index.css + AVG green/gold)
const AVG_GREEN      = 'var(--avg-green)';
const AVG_GREEN_PALE = 'var(--avg-green-pale)';
const AVG_GOLD       = 'var(--avg-gold)';

const STAGES = [
  { key: 'applied',   label: 'Applied',   dot: '#5b7c99', icon: 'dot'   },
  { key: 'exam_sent', label: 'Exam Sent', dot: AVG_GOLD,  icon: 'mail'  },
  { key: 'approved',  label: 'Approved',  dot: AVG_GREEN, icon: 'check' },
  { key: 'rejected',  label: 'Rejected',  dot: '#c62828', icon: 'x'     },
];

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}
  // Fallback for browsers that block clipboard API
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

function daysAgo(dateStr) {
  const d = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  return d === 0 ? 'Today' : `${d}d ago`;
}

function fmtMins(mins) {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h.toLocaleString()}h ${m}m` : `${h.toLocaleString()}h`;
}

function ifcAvatarUrl(pilot) {
  return pilot.ifc_username
    ? `https://community.infiniteflight.com/user_avatar/community.infiniteflight.com/${pilot.ifc_username.toLowerCase()}/288/1487666_2.png`
    : null;
}

// Shared micro-styles
const pillBtn = (active, color) => ({
  padding: '0.3rem 0.75rem',
  fontSize: '0.75rem', fontWeight: 700,
  border: `1px solid ${active ? color : 'var(--border-color)'}`,
  borderRadius: '6px', cursor: 'pointer',
  background: active ? `rgba(${hexToRgb(color)},0.08)` : 'transparent',
  color: active ? color : 'var(--text-secondary)',
  transition: 'all 0.15s',
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
});

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '0,0,0';
}

function StageBadge({ stage, size = 'md' }) {
  const small = size === 'sm';
  const iconSize = small ? 9 : 10;
  const stageIcon = {
    dot:   <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'white' }} />,
    mail:  <Mail size={iconSize} color="white" strokeWidth={3} />,
    check: <Check size={iconSize} color="white" strokeWidth={3.5} />,
    x:     <X size={iconSize} color="white" strokeWidth={3} />,
  }[stage.icon];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: small ? '0.3rem' : '0.35rem',
      fontSize: small ? '0.65rem' : '0.7rem', fontWeight: 700, color: 'white',
      padding: small ? '0.15rem 0.5rem' : '0.22rem 0.6rem', borderRadius: '999px',
      background: stage.dot,
    }}>
      {stageIcon}
      {stage.label}
    </span>
  );
}

// Transcript Modal
function TranscriptModal({ pilot, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  React.useEffect(() => {
    examApi.transcript(pilot.id)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load transcript'); setLoading(false); });
  }, [pilot.id]);

  const passed  = pilot.exam_passed;
  const correct = data?.transcript?.filter(q => q.is_correct).length ?? 0;
  const total   = data?.transcript?.length ?? 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '2rem 1rem', overflowY: 'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', width: '100%', maxWidth: '620px', boxShadow: '0 8px 40px var(--shadow-hover)', overflow: 'hidden', marginTop: '2rem', border: '1px solid var(--border-color)' }}>

        {/* Header */}
        <div style={{ borderTop: `3px solid ${passed ? AVG_GREEN : '#c62828'}`, padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{pilot.first_name} {pilot.last_name} — Exam Transcript</div>
            {!loading && data?.transcript && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {pilot.exam_score}% · {correct}/{total} correct ·{' '}
                <span style={{ fontWeight: 700, color: passed ? AVG_GREEN : '#c62828' }}>{passed ? 'PASSED' : 'FAILED'}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', display: 'flex', borderRadius: '6px' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', maxHeight: '72vh', overflowY: 'auto' }}>
          {loading && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0', fontSize: '0.875rem' }}>Loading transcript...</p>}
          {error   && <p style={{ color: '#c62828', textAlign: 'center', padding: '2rem 0', fontSize: '0.875rem' }}>{error}</p>}
          {!loading && !error && !data?.transcript && (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0', fontSize: '0.875rem' }}>No transcript available — submitted before transcripts were introduced.</p>
          )}

          {!loading && data?.transcript && data.transcript.map((q, qi) => (
            <div key={q.id} style={{ marginBottom: '0.875rem', padding: '1rem', borderRadius: '10px', border: `1px solid ${q.is_correct ? 'rgba(var(--brand-primary-rgb),0.2)' : 'rgba(198,40,40,0.2)'}`, background: q.is_correct ? 'rgba(var(--brand-primary-rgb),0.04)' : 'rgba(198,40,40,0.04)' }}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: '0.1rem', background: q.is_correct ? AVG_GREEN : '#c62828', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {q.is_correct
                    ? <Check size={10} color="white" strokeWidth={3} />
                    : <X size={10} color="white" strokeWidth={3} />}
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  <span style={{ color: 'var(--text-secondary)', marginRight: '0.3rem', fontWeight: 400 }}>{qi + 1}.</span>{q.question}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', paddingLeft: '1.6rem', marginBottom: q.explanation ? '0.6rem' : 0 }}>
                {q.options.map((opt, oi) => {
                  const isCorr = oi === q.correct_answer;
                  const isPick = oi === q.pilot_answer;
                  const isWrong = isPick && !isCorr;
                  return (
                    <div key={oi} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', background: isCorr ? 'rgba(var(--brand-primary-rgb),0.08)' : isWrong ? 'rgba(198,40,40,0.07)' : 'transparent', border: `1px solid ${isCorr ? 'rgba(var(--brand-primary-rgb),0.2)' : isWrong ? 'rgba(198,40,40,0.2)' : 'transparent'}` }}>
                      <div style={{ width: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isCorr && <Check size={10} color={AVG_GREEN} strokeWidth={3} />}
                        {isWrong && <X size={10} color="#c62828" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: '0.81rem', flex: 1, color: isCorr ? AVG_GREEN : isWrong ? '#c62828' : 'var(--text-secondary)', fontWeight: isCorr || isPick ? 600 : 400 }}>{opt}</span>
                      {isCorr  && <span style={{ fontSize: '0.63rem', color: AVG_GREEN,  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Correct</span>}
                      {isWrong && <span style={{ fontSize: '0.63rem', color: '#c62828', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pilot's answer</span>}
                    </div>
                  );
                })}
              </div>
              {q.explanation && (
                <div style={{ paddingLeft: '1.6rem' }}>
                  <div style={{ background: 'var(--bg-hover)', borderRadius: '6px', padding: '0.45rem 0.7rem', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <Info size={12} strokeWidth={2} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: '0.1rem' }} />
                    <p style={{ margin: 0, fontSize: '0.79rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{q.explanation}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Exam Timer

const EXAM_TTL_MS = 72 * 60 * 60 * 1000;

function ExamTimer({ sentAt }) {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  if (!sentAt) {
    return (
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '0.2rem 0', opacity: 0.8 }}>
        Awaiting exam submission…
      </div>
    );
  }

  const sent      = new Date(sentAt).getTime();
  const remaining = EXAM_TTL_MS - (Date.now() - sent);
  const expired   = remaining <= 0;
  const hrs       = Math.floor(remaining / 3600000);
  const mins      = Math.floor((remaining % 3600000) / 60000);
  const sentStr   = new Date(sent).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      borderRadius: 6, padding: '0.45rem 0.65rem',
      background: expired ? 'rgba(198,40,40,0.06)' : 'var(--bg-secondary)',
      border: `1px solid ${expired ? 'rgba(198,40,40,0.25)' : 'var(--border-color)'}`,
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
        Sent {sentStr}
      </div>
      <div style={{ fontSize: '0.73rem', fontWeight: 700, color: expired ? '#c62828' : remaining < 6 * 3600000 ? '#e65100' : 'var(--text-secondary)' }}>
        {expired ? 'Link expired' : `${hrs}h ${mins}m remaining`}
      </div>
    </div>
  );
}

function TextChipBtn({ label, onClick, title, color, disabled }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(e); }}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
        height: 26, padding: '0 0.55rem', flexShrink: 0,
        background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer', color: color || 'var(--text-secondary)',
        fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = color || 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-hover)'; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

// Shared icon set
function IconBtn({ icon, onClick, title, color, disabled }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(e); }}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, flexShrink: 0,
        background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer', color: color || 'var(--text-secondary)',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = color || 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-hover)'; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
    </button>
  );
}

const ICONS = {
  mail:    <Mail size={14} strokeWidth={2.5} />,
  refresh: <RefreshCw size={13} strokeWidth={2.5} />,
  check:   <Check size={14} strokeWidth={3} />,
  x:       <X size={14} strokeWidth={2.5} />,
  undo:    <Undo2 size={13} strokeWidth={2.5} />,
  trash:   <Trash2 size={13} strokeWidth={2} />,
  doc:     <FileText size={13} strokeWidth={2.5} />,
  kebab:   <MoreVertical size={14} />,
};

function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title="More actions"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, flexShrink: 0,
          background: 'transparent', border: 'none', borderRadius: '6px',
          cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        {ICONS.kebab}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={e => { e.stopPropagation(); setOpen(false); }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 1001,
            background: 'var(--bg-card)', borderRadius: '8px', boxShadow: '0 8px 24px var(--shadow-hover)',
            minWidth: 140, overflow: 'hidden', border: '1px solid var(--border-color)',
          }}>
            {items.map((item, i) => (
              <button key={i}
                onClick={e => { e.stopPropagation(); setOpen(false); item.onClick(); }}
                disabled={item.disabled}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.55rem 0.75rem', background: 'none', border: 'none', textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  color: item.danger ? '#c62828' : 'var(--text-primary)', opacity: item.disabled ? 0.5 : 1,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ApplicantActionIcons({ pilot, onAction, isProcessing }) {
  const status = pilot.recruitment_status || 'applied';
  return (
    <>
      {status === 'applied' && (
        <TextChipBtn label="Contact" title="Contact & send exam" color={AVG_GREEN} disabled={isProcessing} onClick={() => onAction(pilot.id, 'contact_and_exam')} />
      )}
      {status === 'exam_sent' && pilot.exam_attempts === 0 && (
        <IconBtn icon={ICONS.refresh} title="Resend / regen link" disabled={isProcessing} onClick={() => onAction(pilot.id, 'regenerate_exam')} />
      )}
      {status === 'exam_sent' && pilot.exam_attempts > 0 && (
        <IconBtn icon={ICONS.check} title="Approve" color={AVG_GREEN} disabled={isProcessing} onClick={() => onAction(pilot.id, 'approve')} />
      )}
      {status === 'approved' && (
        <TextChipBtn label="Welcome" title="Send welcome DM" color={AVG_GREEN} disabled={isProcessing} onClick={() => onAction(pilot.id, 'send_welcome')} />
      )}
      {status === 'rejected' && (
        <IconBtn icon={ICONS.undo} title="Reconsider" color="#1976d2" disabled={isProcessing} onClick={() => onAction(pilot.id, 'reconsider')} />
      )}
      <OverflowMenu items={[
        { label: 'Delete', icon: ICONS.trash, danger: true, disabled: isProcessing, onClick: () => onAction(pilot.id, 'delete') },
      ]} />
    </>
  );
}

function ApplicantGridCard({ pilot, isSelected, onSelect, onAction, processing, watchlistFlag }) {
  const [imgError, setImgError] = useState(false);
  const initials  = `${pilot.first_name?.[0] || ''}${pilot.last_name?.[0] || ''}`;
  const avatarUrl = ifcAvatarUrl(pilot);
  const isProcessing = processing === pilot.id;

  return (
    <div
      onClick={onSelect}
      className={`applicant-grid-card${isSelected ? ' is-selected' : ''}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: '1.1rem 0.9rem', borderRadius: '12px', cursor: 'pointer',
        border: `1.5px solid ${isSelected ? AVG_GREEN : 'var(--border-color)'}`,
        background: isSelected ? AVG_GREEN_PALE : '#fff',
      }}
    >
      {avatarUrl && !imgError ? (
        <img src={avatarUrl} alt="" onError={() => setImgError(true)}
          style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: '0.6rem' }} />
      ) : (
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'white', color: AVG_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.6rem', border: '1px solid var(--border-color)' }}>
          {initials}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.15rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
          {pilot.first_name} {pilot.last_name}
        </div>
        <WatchlistFlag entry={watchlistFlag} />
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        {pilot.callsign}{pilot.ifc_username && ` · @${pilot.ifc_username}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{daysAgo(pilot.created)}</span>
        {pilot.exam_attempts > 0 && (
          <span style={pillBtn(true, pilot.exam_passed ? AVG_GREEN : '#c62828')}>
            {pilot.exam_passed ? ICONS.check : ICONS.x}{pilot.exam_score}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
        <ApplicantActionIcons pilot={pilot} onAction={onAction} isProcessing={isProcessing} />
      </div>
    </div>
  );
}

function PilotDetail({ pilot, onAction, processing, watchlistFlag, user }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [avatarError, setAvatarError]       = useState(false);
  const isProcessing = processing === pilot.id;
  const status       = pilot.recruitment_status || 'applied';
  const stage        = STAGES.find(s => s.key === status) || STAGES[0];
  const initials      = `${pilot.first_name?.[0] || ''}${pilot.last_name?.[0] || ''}`;
  const avatarUrl      = ifcAvatarUrl(pilot);

  const [ifData, setIfData]     = useState(null);
  const [ifLoading, setIfLoading] = useState(false);
  const [ifError, setIfError]   = useState(null);

  const loadIFStats = useCallback(async () => {
    if (!pilot.ifc_username) return;
    setIfLoading(true); setIfError(null);
    try {
      const data = await infiniteFlight.userStats(pilot.ifc_username);
      setIfData(data.result?.[0] || null);
      if (!data.result?.[0]) setIfError('No IF account found for this IFC username.');
    } catch { setIfError('Failed to fetch Infinite Flight stats.'); }
    finally { setIfLoading(false); }
  }, [pilot.ifc_username]);

  React.useEffect(() => { loadIFStats(); }, [loadIFStats]);

  const grade = ifData?.grade;
  const gradeColor = grade === 5 ? '#c62828' : grade === 4 ? AVG_GOLD : grade === 3 ? AVG_GREEN : grade === 2 ? '#1976d2' : '#909090';

  const StatTile = ({ label, value, color }) => (
    <div style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '7px', border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );

  const [notes, setNotes] = useState(() => {
    try { return pilot.admin_notes ? JSON.parse(pilot.admin_notes) : []; }
    catch { return []; }
  });
  const [newNote, setNewNote]     = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const note = {
        text:       newNote.trim(),
        author:     user ? `${user.first_name} ${user.last_name}` : 'Staff',
        author_id:  user?.id || null,
        created_at: new Date().toISOString(),
      };
      const updated = [...notes, note];
      await pilotsApi.adminUpdate(pilot.id, { admin_notes: JSON.stringify(updated) });
      setNotes(updated);
      setNewNote('');
      showToast('Note added', 'success');
    } catch { showToast('Failed to add note', 'error'); }
    finally { setAddingNote(false); }
  };

  const handleDeleteNote = async (idx) => {
    const updated = notes.filter((_, i) => i !== idx);
    try {
      await pilotsApi.adminUpdate(pilot.id, { admin_notes: JSON.stringify(updated) });
      setNotes(updated);
    } catch { showToast('Failed to delete note', 'error'); }
  };

  const isBlacklisted = watchlistFlag?.status === 'blacklist';
  const ActionBtn = ({ label, onClick, variant = 'default', disabled, icon }) => {
    const effectiveVariant = (variant === 'primary' && isBlacklisted) ? 'caution' : variant;
    const variants = {
      primary: { bg: AVG_GREEN,     color: 'white',   border: AVG_GREEN },
      caution: { bg: 'transparent', color: '#c62828', border: '#c62828' },
      danger:  { bg: 'transparent', color: '#c62828', border: 'rgba(198,40,40,0.35)' },
      blue:    { bg: 'transparent', color: '#1976d2', border: 'rgba(25,118,210,0.35)' },
      ghost:   { bg: 'transparent', color: 'var(--text-secondary)', border: 'var(--border-color)' },
    };
    const v = variants[effectiveVariant] || variants.ghost;
    return (
      <button onClick={onClick} disabled={disabled || isProcessing}
        title={effectiveVariant === 'caution' ? 'This applicant is blacklisted - reject the application' : undefined}
        style={{ padding: '0.55rem 1rem', border: `1.5px solid ${v.border}`, borderRadius: '7px', cursor: (disabled || isProcessing) ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 700, background: v.bg, color: v.color, opacity: (disabled || isProcessing) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'opacity 0.15s' }}>
        {effectiveVariant === 'caution' && <AlertTriangle size={13} strokeWidth={2.5} />}
        {icon}{isProcessing ? '…' : label}
      </button>
    );
  };

  return (
    <div style={{ padding: '1.25rem' }}>

      {watchlistFlag && (() => {
        const meta = WATCHLIST_META[watchlistFlag.status] || WATCHLIST_META.watchlist;
        const Icon = meta.icon;
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: meta.bg, border: `1px solid ${meta.color}33`, marginBottom: '1rem' }}>
            <Icon size={14} strokeWidth={2.5} style={{ color: meta.color, flexShrink: 0, marginTop: '0.1rem' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: meta.color }}>{meta.label}</div>
              {watchlistFlag.reason && (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{watchlistFlag.reason}</div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', marginBottom: '0.9rem' }}>
        {avatarUrl && !avatarError ? (
          <img src={avatarUrl} alt="" onError={() => setAvatarError(true)}
            style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: AVG_GREEN_PALE, color: AVG_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              {pilot.first_name} {pilot.last_name}
            </div>
            <StageBadge stage={stage} size="sm" />
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {pilot.callsign}{pilot.ifc_username && ` · @${pilot.ifc_username}`}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>Applied {daysAgo(pilot.created)}</div>
        </div>
        <OverflowMenu items={[
          { label: 'Delete', icon: ICONS.trash, danger: true, disabled: isProcessing, onClick: () => onAction(pilot.id, 'delete') },
        ]} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        {ifLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.5rem 0' }}>
            <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
            Fetching Infinite Flight stats…
          </div>
        )}

        {ifError && !ifLoading && (
          <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(198,40,40,0.06)', border: '1px solid rgba(198,40,40,0.15)', borderRadius: '7px', fontSize: '0.78rem', color: '#c62828', marginBottom: '0.75rem' }}>
            {ifError}
          </div>
        )}

        {ifData && !ifLoading && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', opacity: 0.6, marginBottom: '0.5rem' }}>Infinite Flight</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              <StatTile label="Grade"       value={`Grade ${grade}`}                                    color={gradeColor} />
              <StatTile label="Flight Time" value={fmtMins(ifData.flightTime)}                          />
              <StatTile label="Flights"     value={(ifData.onlineFlights ?? 0).toLocaleString()}        />
              <StatTile label="XP"          value={(ifData.xp ?? 0).toLocaleString()}                   />
              <StatTile label="Landings"    value={(ifData.landingCount ?? 0).toLocaleString()}         />
              <StatTile label="Violations"  value={String(ifData.violations ?? 0)}
                color={(ifData.violations ?? 0) > 50 ? '#c62828' : undefined} />
            </div>
            {ifData.roles?.length > 0 && (
              <div style={{ marginTop: '0.6rem' }}>
                <IFRoleBadges roles={ifData.roles} />
              </div>
            )}
          </div>
        )}

        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', opacity: 0.6, marginBottom: '0.5rem' }}>{brand.shortName}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
            <StatTile label="Flights"   value={String(pilot.total_flights ?? 0)} />
            <StatTile label="Hours"     value={pilot.total_hours ? `${Math.floor(pilot.total_hours)}h` : '0h'} />
            <StatTile label="IF Linked" value={pilot.if_user_id ? 'Yes' : 'No'} color={pilot.if_user_id ? AVG_GREEN : '#e65100'} />
          </div>
          {pilot.ifc_username && (
            <button onClick={() => onAction(pilot.id, 'refresh_if_link')} disabled={isProcessing}
              style={{ marginTop: '0.5rem', width: '100%', padding: '0.4rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '7px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', opacity: isProcessing ? 0.6 : 1, transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!isProcessing) { e.currentTarget.style.borderColor = AVG_GREEN; e.currentTarget.style.color = AVG_GREEN; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
              {ICONS.refresh} {isProcessing ? 'Refreshing…' : 'Refresh IF Link'}
            </button>
          )}
        </div>
      </div>

      {/* Exam / status info, grouped together under a light divider */}
      {(pilot.exam_attempts > 0 || (status === 'exam_sent' && pilot.exam_attempts === 0) || (status === 'approved' && pilot.discord_invite_sent_at)) && (
        <div style={{ paddingTop: '0.8rem', marginBottom: '0.2rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', opacity: 0.6, marginBottom: '0.5rem' }}>Status</div>
          {pilot.exam_attempts > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
              <span style={pillBtn(true, pilot.exam_passed ? AVG_GREEN : '#c62828')}>
                {pilot.exam_passed ? ICONS.check : ICONS.x}
                {pilot.exam_passed ? 'Passed' : 'Failed'} {pilot.exam_score}%
              </span>
              <button onClick={() => setShowTranscript(true)}
                style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                {ICONS.doc} Transcript
              </button>
            </div>
          )}

          {status === 'exam_sent' && pilot.exam_attempts === 0 && (
            <div style={{ maxWidth: 260 }}><ExamTimer sentAt={pilot.exam_token_created} /></div>
          )}

          {status === 'approved' && pilot.discord_invite_sent_at && (
            <div style={{ fontSize: '0.78rem', color: AVG_GREEN, fontWeight: 600 }}>
              ✓ Invite sent {new Date(pilot.discord_invite_sent_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} — awaiting Discord /verify
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', opacity: 0.6, marginBottom: '0.5rem' }}>Actions</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {status === 'applied' && (
          <ActionBtn label="Contact & Send Exam" variant="primary" icon={ICONS.mail} onClick={() => onAction(pilot.id, 'contact_and_exam')} />
        )}

        {status === 'exam_sent' && pilot.exam_attempts === 0 && (
          <ActionBtn label="Resend / Regen Link" variant="ghost" icon={ICONS.refresh} onClick={() => onAction(pilot.id, 'regenerate_exam')} />
        )}

        {status === 'exam_sent' && pilot.exam_attempts > 0 && pilot.exam_passed && (
          <ActionBtn label="Approve & Invite" variant="primary" icon={ICONS.check} onClick={() => onAction(pilot.id, 'approve')} />
        )}

        {status === 'exam_sent' && pilot.exam_attempts > 0 && !pilot.exam_passed && (<>
          <ActionBtn label="Approve Anyway" variant="primary" icon={ICONS.check} onClick={() => onAction(pilot.id, 'approve')} />
          <ActionBtn label="Reset Exam" variant="ghost" icon={ICONS.refresh} onClick={() => onAction(pilot.id, 'reset_exam')} />
        </>)}

        {status === 'approved' && (
          <ActionBtn label={pilot.discord_invite_sent_at ? 'Resend Welcome DM' : 'Send Welcome DM'} variant="primary" icon={ICONS.mail} onClick={() => onAction(pilot.id, 'send_welcome')} />
        )}

        {status === 'rejected' && (
          <ActionBtn label="Reconsider" variant="blue" icon={ICONS.undo} onClick={() => onAction(pilot.id, 'reconsider')} />
        )}

        {!['approved', 'rejected'].includes(status) && (
          <ActionBtn label="Reject" variant="danger" icon={ICONS.x} onClick={() => onAction(pilot.id, 'reject')} />
        )}
      </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', marginTop: '0.85rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', opacity: 0.6, marginBottom: '0.6rem' }}>Notes</div>

        {notes.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {notes.map((n, i) => (
              <div key={i} style={{ padding: '0.6rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: '7px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0, flex: 1 }}>{n.text}</p>
                  <button onClick={() => handleDeleteNote(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: 0.6 }}>×</button>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  {n.author} · {n.created_at ? new Date(n.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>No notes yet.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <textarea
            rows={2}
            placeholder="Add an internal note…"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
            style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = AVG_GREEN}
            onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
          />
          <button
            onClick={handleAddNote}
            disabled={addingNote || !newNote.trim()}
            style={{ alignSelf: 'flex-end', padding: '0.45rem 0.9rem', borderRadius: '7px', border: 'none', background: newNote.trim() ? AVG_GREEN : 'var(--border-color)', color: newNote.trim() ? 'white' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 700, cursor: newNote.trim() ? 'pointer' : 'default', fontFamily: 'inherit', transition: 'background 0.15s' }}
          >
            {addingNote ? 'Adding…' : 'Add Note'}
          </button>
        </div>
      </div>

      {showTranscript && <TranscriptModal  pilot={pilot} onClose={() => setShowTranscript(false)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function RecruitmentPipeline({ allPilots, onReload, user }) {
  const [processing, setProcessing] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { pilotId, action, pilot }
  const [selectedId, setSelectedId] = useState(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState(STAGES[0].key);

  const [watchlistEntries, setWatchlistEntries] = useState([]);
  useEffect(() => {
    watchlistApi.list().then(d => setWatchlistEntries(d.entries || [])).catch(() => {});
  }, []);
  const watchlistMap = useMemo(() => {
    const m = new Map();
    watchlistEntries.forEach(e => { if (e.ifc_username) m.set(e.ifc_username.toLowerCase(), e); });
    return m;
  }, [watchlistEntries]);
  const getFlag = (pilot) => pilot.ifc_username ? watchlistMap.get(pilot.ifc_username.toLowerCase()) : undefined;

  const pipelinePilots = allPilots.filter(p => p.status !== 'approved' && p.status !== 'archived');

  const handleAction = useCallback(async (pilotId, action) => {
    const p = allPilots.find(x => x.id === pilotId);
    if (action === 'reject') {
      setPendingAction({ pilotId, action, pilot: p }); return;
    }
    if (action === 'delete') {
      setPendingAction({ pilotId, action, pilot: p }); return;
    }
    doAction(pilotId, action, p);
  }, [allPilots]); // eslint-disable-line

  const doAction = useCallback(async (pilotId, action, p) => {
    setProcessing(pilotId);
    try {

      if (action === 'contact_and_exam') {
        const data = await examApi.assign(pilotId);
        if (data?.exam_url && p?.ifc_username) {
          const body = [
            '<div align="center">',
            `\n\n<img src="${brand.urls.crewCentre}${brand.logos.light}" width="300">`,
            '\n\n# Recruitment Update',
            '\n---\n<br>',
            `\n\n### Hi ${p.first_name},`,
            `\n\nThank you for applying to **${brand.shortName}**! We have reviewed your application and would like to invite you to the next stage of our recruitment process: the entry exam.`,
            '\n\n<br>',
            '\n\n| **Exam Overview** | |',
            '\n| :--- | :--- |',
            '\n| **Questions** | 20 |',
            '\n| **Pass Mark** | 70% |',
            '\n| **Validity** | 72 Hours |',
            '\n\n<br>',
            `\n\n[**START YOUR ENTRY EXAM**](${data.exam_url})`,
            '\n\n<br>\n\n---',
            `\n\n**${brand.shortName} Recruitment Team**`,
            '\n![](https://img.shields.io/badge/Status-EXAM_SENT-2d6a4f?style=for-the-badge)',
            '\n\n</div>'
          ].join('');
          window.open(`https://community.infiniteflight.com/new-message?username=${encodeURIComponent(p.ifc_username)}&title=${encodeURIComponent(`${brand.shortName} Entry Exam`)}&body=${encodeURIComponent(body)}`, '_blank');
        }
        showToast('Exam assigned — IFC message opened!', 'success');
        onReload(); return;
      }
      if (action === 'reset_exam' || action === 'regenerate_exam') {
        const data = await examApi.reset(pilotId);
        if (action === 'regenerate_exam' && data?.exam_url && p?.ifc_username) {
          const body = [
            '<div align="center">',
            `\n\n<img src="${brand.urls.crewCentre}${brand.logos.light}" width="300">`,
            '\n\n# New Exam Link',
            '\n---\n<br>',
            `\n\n### Hi ${p.first_name},`,
            '\n\nYour previous exam link has expired. We have generated a new link for you below - please complete it within **72 hours**.',
            '\n\n<br>',
            `\n\n[**START YOUR ENTRY EXAM**](${data.exam_url})`,
            '\n\n<br>\n\n---',
            `\n\n**${brand.shortName} Recruitment Team**`,
            '\n![](https://img.shields.io/badge/Status-EXAM_RESENT-2d6a4f?style=for-the-badge)',
            '\n\n</div>'
          ].join('');
          await copyToClipboard(body);
          showToast('New exam link generated - message copied to clipboard. Paste it into their IFC DM.', 'success');
        } else {
          await copyToClipboard(data.exam_url);
          showToast('Exam reset - new link copied to clipboard.', 'success');
        }
        onReload(); return;
      }
      if (action === 'approve') {
        await examApi.stage(pilotId, 'approved');

        // Generate a single-use Discord invite and copy the welcome message to clipboard
        try {
          const { invite_url } = await pilotsApi.discordInvite(pilotId);
          const body = [
            '<div align="center">',
            `\n\n<img src="${brand.urls.crewCentre}${brand.logos.light}" width="300">`,
            '\n\n# Welcome to the Team!',
            '\n---\n<br>',
            `\n\n### Congratulations, ${p.first_name}!`,
            `\n\nWe are pleased to inform you that you have **passed** your entry exam. It is a pleasure to officially welcome you to **${brand.name}**.`,
            '\n\nTo begin your journey with us, please join our official Discord server and complete your induction.',
            '\n\n<br>',
            `\n\n[**JOIN OUR DISCORD SERVER**](${invite_url})`,
            '\n\n<br>\n\n---',
            '\n\n### **Final Step: Verification**',
            '\n\nOnce you have joined the server, please head over to the **#induction** channel and run the following command to link your account:',
            `\n\n\` /verify ${p.ifc_username} \``,
            '\n\n---',
            `\n\n**${brand.shortName} Recruitment Team**`,
            '\n![](https://img.shields.io/badge/Status-APPLICATION_ACCEPTED-2d6a4f?style=for-the-badge)',
            '\n\n</div>'
          ].join('');
          await copyToClipboard(body);
          showToast('Pilot approved! Welcome message copied to clipboard — paste it into their IFC DM.', 'success');
        } catch {
          showToast('Pilot approved! (Could not generate Discord invite — check bot is online.)', 'warning');
        }

        onReload(); return;
      }
      if (action === 'send_welcome') {
        try {
          const buildBody = (invite_url) => [
            '<div align="center">',
            `\n\n<img src="${brand.urls.crewCentre}${brand.logos.light}" width="300">`,
            '\n\n# Welcome to the Team!',
            '\n---\n<br>',
            `\n\n### Congratulations, ${p.first_name}!`,
            `\n\nWe are pleased to inform you that you have **passed** your entry exam. It is a pleasure to officially welcome you to **${brand.name}**.`,
            '\n\nTo begin your journey with us, please join our official Discord server and complete your induction.',
            '\n\n<br>',
            `\n\n[**JOIN OUR DISCORD SERVER**](${invite_url})`,
            '\n\n<br>\n\n---',
            '\n\n### **Final Step: Verification**',
            '\n\nOnce you have joined the server, please head over to the **#induction** channel and run the following command to link your account:',
            `\n\n\` /verify ${p.ifc_username} \``,
            '\n\n---',
            `\n\n**${brand.shortName} Recruitment Team**`,
            '\n![](https://img.shields.io/badge/Status-APPLICATION_ACCEPTED-2d6a4f?style=for-the-badge)',
            '\n\n</div>'
          ].join('');

          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/plain': pilotsApi.discordInvite(pilotId).then(({ invite_url }) =>
                  new Blob([buildBody(invite_url)], { type: 'text/plain' })
                ),
              }),
            ]);
          } else {
            // Fallback for browsers without ClipboardItem support
            const { invite_url } = await pilotsApi.discordInvite(pilotId);
            await copyToClipboard(buildBody(invite_url));
          }
          showToast('Welcome message copied to clipboard — paste it into their IFC DM.', 'success');
        } catch (err) {
          showToast(`Could not generate Discord invite: ${err?.message || 'unknown error'}`, 'error');
        }
        onReload(); return;
      }
      if (action === 'reject') {
        await examApi.stage(pilotId, 'rejected');
        showToast('Application rejected.', 'success');
        onReload(); return;
      }
      if (action === 'reconsider') {
        await examApi.stage(pilotId, 'applied');
        showToast('Moved back to Applied.', 'success');
        onReload(); return;
      }
      if (action === 'refresh_if_link') {
        await pilotsApi.refreshIfLink(pilotId);
        showToast('IF account link refreshed.', 'success');
        onReload(); return;
      }
      if (action === 'delete') {
        await pilotsApi.delete(pilotId);
        showToast('Application and account deleted.', 'success');
        onReload(); return;
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Action failed', 'error');
    } finally { setProcessing(null); }
  }, [onReload]); // eslint-disable-line react-hooks/exhaustive-deps

  const total   = pipelinePilots.length;

  const q = search.trim().toLowerCase();
  const searchedPilots = pipelinePilots.filter(p => {
    if (!q) return true;
    return [p.first_name, p.last_name, p.callsign, p.ifc_username].filter(Boolean).some(v => v.toLowerCase().includes(q));
  });
  const selectedPilot = searchedPilots.find(p => p.id === selectedId) || searchedPilots[0] || null;

  const selectDesktop = (id) => setSelectedId(id);
  const selectMobile = (id) => { setSelectedId(id); setMobileSheetOpen(true); };
  const closeMobileSheet = () => setMobileSheetOpen(false);

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', boxShadow: '0 1px 3px var(--shadow)', overflow: 'hidden' }}>

        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Pipeline</span>
            <PaperPlaneAnimation size={22} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {total} total
              {STAGES.map(stage => {
                const count = pipelinePilots.filter(p => (p.recruitment_status || 'applied') === stage.key).length;
                return ` · ${count} ${stage.label}`;
              }).join('')}
            </span>
          </div>
          <input
            type="text"
            placeholder="Search name, callsign, or IFC username..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', maxWidth: 340, padding: '0.65rem 0.8rem', fontSize: '0.82rem', lineHeight: 1.4, border: 'none', borderRadius: '7px', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="admin-grid-wide" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', alignItems: 'stretch' }}>
          <div className="desktop-only" style={{ borderRight: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: '0.4rem', padding: '0.9rem 1.25rem 0', flexWrap: 'wrap' }}>
              {STAGES.map(stage => {
                const count = searchedPilots.filter(p => (p.recruitment_status || 'applied') === stage.key).length;
                const isActive = activeStage === stage.key;
                return (
                  <button key={stage.key} onClick={() => setActiveStage(stage.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.8rem', borderRadius: '9px',
                    border: `1.5px solid ${isActive ? stage.dot : 'var(--border-color)'}`,
                    background: isActive ? stage.dot : '#fff', color: isActive ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? 'rgba(255,255,255,0.85)' : stage.dot, flexShrink: 0 }} />
                    {stage.label}
                    <span style={{ opacity: 0.8 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {(() => {
              const stagePilots = searchedPilots.filter(p => (p.recruitment_status || 'applied') === activeStage);
              if (stagePilots.length === 0) {
                return (
                  <div style={{ padding: '2.5rem 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic', opacity: 0.6 }}>
                    {q ? 'No matches in this stage' : 'Nobody in this stage yet'}
                  </div>
                );
              }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem', padding: '1.1rem 1.25rem' }}>
                  {stagePilots.map(pilot => (
                    <ApplicantGridCard key={pilot.id} pilot={pilot} isSelected={selectedPilot?.id === pilot.id} onSelect={() => selectDesktop(pilot.id)} onAction={handleAction} processing={processing} watchlistFlag={getFlag(pilot)} />
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="mobile-only" style={{ gridColumn: '1 / -1' }}>
            {/* Same stage tabs as desktop, just full width */}
            <div style={{ display: 'flex', gap: '0.4rem', padding: '0.9rem 1.25rem 0', flexWrap: 'wrap' }}>
              {STAGES.map(stage => {
                const count = searchedPilots.filter(p => (p.recruitment_status || 'applied') === stage.key).length;
                const isActive = activeStage === stage.key;
                return (
                  <button key={stage.key} onClick={() => setActiveStage(stage.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.8rem', borderRadius: '9px',
                    border: `1.5px solid ${isActive ? stage.dot : 'var(--border-color)'}`,
                    background: isActive ? stage.dot : '#fff', color: isActive ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? 'rgba(255,255,255,0.85)' : stage.dot, flexShrink: 0 }} />
                    {stage.label}
                    <span style={{ opacity: 0.8 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {(() => {
              const stagePilots = searchedPilots.filter(p => (p.recruitment_status || 'applied') === activeStage);
              if (stagePilots.length === 0) {
                return (
                  <div style={{ padding: '2.5rem 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic', opacity: 0.6 }}>
                    {q ? 'No matches in this stage' : 'Nobody in this stage yet'}
                  </div>
                );
              }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem', padding: '1.1rem 1.25rem' }}>
                  {stagePilots.map(pilot => (
                    <ApplicantGridCard key={pilot.id} pilot={pilot} isSelected={mobileSheetOpen && selectedPilot?.id === pilot.id} onSelect={() => selectMobile(pilot.id)} onAction={handleAction} processing={processing} watchlistFlag={getFlag(pilot)} />
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="desktop-only" style={{ position: 'sticky', top: 0, alignSelf: 'start', maxHeight: '100vh', overflowY: 'auto' }}>
            {selectedPilot
              ? <PilotDetail key={selectedPilot.id} pilot={selectedPilot} onAction={handleAction} processing={processing} watchlistFlag={getFlag(selectedPilot)} user={user} />
              : <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem 1.5rem', fontStyle: 'italic', opacity: 0.6 }}>Select an applicant</div>
            }
          </div>
        </div>
      </div>

      {mobileSheetOpen && selectedPilot && (
        <div className="mobile-only">
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1500, display: 'flex', alignItems: 'flex-end' }}
            onClick={e => e.target === e.currentTarget && closeMobileSheet()}
          >
            <div style={{ width: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: '16px 16px 0 0', padding: '0.75rem 1rem 1.5rem', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 0.75rem' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.4rem' }}>
                <IconBtn icon={ICONS.x} title="Close" onClick={closeMobileSheet} />
              </div>
              <PilotDetail key={selectedPilot.id} pilot={selectedPilot} onAction={handleAction} processing={processing} watchlistFlag={getFlag(selectedPilot)} user={user} />
            </div>
          </div>
        </div>
      )}

      {pendingAction?.action === 'reject' && (
        <ConfirmModal
          title={`Reject ${pendingAction.pilot?.first_name} ${pendingAction.pilot?.last_name}?`}
          message="Their application will be marked as rejected."
          confirmLabel="Reject"
          danger
          onConfirm={() => doAction(pendingAction.pilotId, 'reject', pendingAction.pilot)}
          onClose={() => setPendingAction(null)}
        />
      )}
      {pendingAction?.action === 'delete' && (
        <ConfirmModal
          title={`Delete ${pendingAction.pilot?.first_name} ${pendingAction.pilot?.last_name}?`}
          message="This will permanently delete their application and account. This cannot be undone."
          confirmLabel="Delete Account"
          danger
          onConfirm={() => doAction(pendingAction.pilotId, 'delete', pendingAction.pilot)}
          onClose={() => setPendingAction(null)}
        />
      )}

      <style>{`
        .applicant-grid-card { transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s; }
        .applicant-grid-card:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
      `}</style>
    </div>
  );
}

export default RecruitmentPipeline;
