/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import brand from '../brand';

const logo = brand.logos.icon;
const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Colours used only in this standalone exam page (not part of main app)
const C = {
  green:      '#2e7d32',
  greenLight: '#f1f8f1',
  greenBorder:'#c8e6c9',
  red:        '#c62828',
  redLight:   '#fff8f8',
  redBorder:  '#ffcdd2',
  gold:       'var(--brand-accent)',
  goldBg:     'rgba(var(--brand-accent-rgb),0.10)',
  grey:       '#6e6e6e',
  greyLight:  '#9e9e9e',
  border:     '#e8e8e8',
};

function JoinDiscordModal({ firstName, inviteUrl, onDismiss }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-modal-title"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,20,18,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 1000,
      }}
    >
      <div style={{
        background: 'white', borderRadius: '16px', width: '100%', maxWidth: '440px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden', textAlign: 'center',
      }}>
        <div style={{ background: 'linear-gradient(135deg, #5865F2, #4752c4)', padding: '1.75rem 1.5rem 1.5rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', margin: '0 auto 0.9rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="22" viewBox="0 0 71 55" fill="white"><path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6064 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.3125 16.3068 45.2167C16.679 44.9385 17.0513 44.6491 17.4067 44.3568C17.471 44.3031 17.5606 44.2946 17.6333 44.3341C29.2558 49.6202 41.8354 49.6202 53.3179 44.3341C53.3907 44.2918 53.4803 44.3003 53.5474 44.354C53.9028 44.6463 54.2751 44.9385 54.65 45.2167C54.7787 45.3125 54.7703 45.5041 54.6305 45.5858C52.8618 46.6197 51.0231 47.4931 49.0892 48.2228C48.9634 48.2707 48.9074 48.4172 48.969 48.5383C50.0352 50.6036 51.2526 52.5699 52.593 54.435C52.649 54.5139 52.7497 54.5477 52.8421 54.5195C58.6439 52.7249 64.5265 50.0174 70.5994 45.5576C70.6526 45.5182 70.6862 45.459 70.6918 45.3942C72.1748 30.0791 68.2416 16.7757 60.1968 4.9823C60.1773 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.2249 20.1717 23.0132 23.7259 23.0132C27.3082 23.0132 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8195 37.3253 40.937 34.1136 40.937 30.1693C40.937 26.2249 43.7636 23.0132 47.3178 23.0132C50.9001 23.0132 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9001 37.3253 47.3178 37.3253Z"/></svg>
          </div>
          <h2 id="join-modal-title" style={{ color: 'white', margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
            One last step, {firstName}
          </h2>
        </div>

        <div style={{ padding: '1.5rem 1.75rem 1.75rem' }}>
          <p style={{ color: '#333', margin: '0 0 1.25rem', fontSize: '0.92rem', lineHeight: 1.55 }}>
            Hop into our Discord server now to finish setting up your account. Just a heads up — this invite link only works once, so if you step away before joining, you'll need to wait for a staff member to send you a new one.
          </p>
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDismiss}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
              width: '100%', padding: '0.95rem', boxSizing: 'border-box', marginBottom: '0.75rem',
              background: 'linear-gradient(135deg, #5865F2, #4752c4)', color: 'white', borderRadius: '10px',
              fontWeight: 700, fontSize: '0.98rem', textDecoration: 'none',
              boxShadow: '0 6px 18px rgba(88,101,242,0.35)',
            }}
          >
            Join the Discord Server
          </a>
          <button
            onClick={onDismiss}
            style={{
              background: 'none', border: 'none', color: C.greyLight, fontSize: '0.82rem',
              cursor: 'pointer', padding: '0.4rem', textDecoration: 'underline',
            }}
          >
            I'll do it in a moment
          </button>
        </div>
      </div>
    </div>
  );
}

function IFCAvatar({ username, firstName }) {
  const [imgError, setImgError] = React.useState(false);
  const url = username && !imgError
    ? `https://community.infiniteflight.com/user_avatar/community.infiniteflight.com/${username.toLowerCase()}/288/1487666_2.png`
    : null;
  const initials = firstName?.charAt(0)?.toUpperCase() || '?';
  if (url) return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
      <img src={url} alt={firstName} onError={() => setImgError(true)}
        style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${C.gold}` }} />
    </div>
  );
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))', border: `3px solid ${C.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '2rem', fontWeight: 700 }}>
        {initials}
      </div>
    </div>
  );
}

function Exam() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // states: loading | invalid | expired | already_done | welcome | ready | submitting | result
  const [state, setState]           = useState('loading');
  const [exam, setExam]             = useState(null);   // { pass_mark, questions }
  const [pilot, setPilot]           = useState(null);   // { first_name, ifc_username }
  const [answers, setAnswers]       = useState({});     // { qId: optionIndex }
  const [result, setResult]         = useState(null);   // server response after submit
  const [errorMsg, setErrorMsg]     = useState('');
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    fetch(`${API}/exam/check?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.already_done)  { setState('already_done'); return; }
        if (data.error)         {
          setState(data.error?.toLowerCase().includes('expir') ? 'expired' : 'invalid');
          return;
        }
        setExam(data.exam);
        setPilot({ first_name: data.first_name, ifc_username: data.ifc_username });
        setState('welcome');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  const handleSelect = (qId, optIdx) =>
    setAnswers(prev => ({ ...prev, [qId]: optIdx }));

  const allAnswered = exam && Object.keys(answers).length === exam.questions.length;

  const handleSubmit = async () => {
    if (!allAnswered) { setErrorMsg('Please answer all questions before submitting.'); return; }
    setState('submitting');
    setErrorMsg('');
    try {
      const res = await fetch(`${API}/exam/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState('ready');
        setErrorMsg(data.error || 'Submission failed. Please try again.');
        return;
      }
      setResult(data);
      setState('result');
      if (data.passed && data.invite_url) setJoinModalOpen(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setState('ready');
      setErrorMsg('Something went wrong. Please try again.');
    }
  };

  // Wrapper card
  const card = (children) => (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #f4f8f5 0%, #e9f1ec 100%)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem',
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', width: '100%', maxWidth: '680px',
        boxShadow: '0 12px 40px rgba(31,77,57,0.12)', border: '1px solid rgba(31,77,57,0.06)', overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{ background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%)', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}>
            <img src={logo} alt={brand.shortName} style={{ width: 30, height: 30, objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: '1.1rem' }}>Entry Examination</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem' }}>{brand.name}</div>
          </div>
        </div>
        <div style={{ padding: '2rem' }}>{children}</div>
      </div>
    </div>
  );

  // States
  if (state === 'loading') return card(
    <div style={{ textAlign: 'center', padding: '2rem', color: C.grey }}>Loading your exam...</div>
  );

  if (state === 'expired') return card(<>
    <IconCircle stroke="#e65100" path="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    <h2 style={{ color: '#e65100', textAlign: 'center', marginBottom: '1rem' }}>Link Expired</h2>
    <p style={{ color: C.grey, textAlign: 'center' }}>This exam link has expired (links are valid for 72 hours). Please contact your recruitment officer for a new link.</p>
  </>);

  if (state === 'invalid') return card(<>
    <IconCircle stroke={C.red} path="M15 9l-6 6M9 9l6 6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    <h2 style={{ color: C.red, textAlign: 'center', marginBottom: '1rem' }}>Invalid Link</h2>
    <p style={{ color: C.grey, textAlign: 'center' }}>This exam link is invalid. Please contact your recruitment officer.</p>
  </>);

  if (state === 'already_done') return card(<>
    <IconCircle stroke={C.green} path="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    <h2 style={{ color: C.green, textAlign: 'center', marginBottom: '1rem' }}>Already Submitted</h2>
    <p style={{ color: C.grey, textAlign: 'center' }}>You've already completed this exam. Contact your recruitment officer if you have questions.</p>
  </>);

  // Result screen
  if (state === 'result' && result) {
    const { passed, score, correct, total, transcript, invite_url } = result;
    return <>
      {joinModalOpen && passed && invite_url && (
        <JoinDiscordModal
          firstName={pilot?.first_name}
          inviteUrl={invite_url}
          onDismiss={() => setJoinModalOpen(false)}
        />
      )}
      {card(<>
      <div style={{ textAlign: 'center', padding: '0.5rem 0 1.75rem' }}>
        <ScoreRing score={score} passed={passed} />
        <h2 style={{ color: passed ? C.green : C.red, margin: '1.25rem 0 0.4rem', fontSize: '1.55rem', fontWeight: 800 }}>
          {passed ? `Congratulations, ${pilot?.first_name}!` : `Not Quite, ${pilot?.first_name}`}
        </h2>
        <p style={{ color: C.grey, margin: 0, fontSize: '0.92rem' }}>
          {correct}/{total} correct{!passed && ` · ${exam?.pass_mark}% required to pass`}
        </p>
      </div>

      <div style={{
        display: 'flex', gap: '0.9rem', alignItems: 'flex-start',
        background: passed ? C.greenLight : C.redLight, border: `1px solid ${passed ? C.greenBorder : C.redBorder}`,
        borderRadius: '12px', padding: '1.1rem 1.25rem', marginBottom: passed && invite_url ? '1.1rem' : '2rem',
      }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: passed ? C.green : C.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {passed ? <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /> : <><circle cx="12" cy="12" r="9" fill="none" /><path d="M12 8v5M12 16h.01" /></>}
          </svg>
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: passed ? C.green : C.red, fontSize: '0.92rem' }}>
            {passed ? 'What happens next?' : "Don't worry!"}
          </p>
          <p style={{ margin: '0.3rem 0 0', color: C.grey, fontSize: '0.86rem', lineHeight: 1.5 }}>
            {passed
              ? (invite_url
                  ? 'Join our Discord server below to complete your induction.'
                  : 'Our team will be in touch via IFC with your Discord invite to complete onboarding.')
              : 'Our team will be in touch to discuss next steps. You may be able to resit the exam at a later date.'}
          </p>
        </div>
      </div>

      {passed && invite_url && (
        <a
          href={invite_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem',
            width: '100%', padding: '0.95rem', marginBottom: '2rem', boxSizing: 'border-box',
            background: 'linear-gradient(135deg, #5865F2, #4752c4)', color: 'white', borderRadius: '10px',
            fontWeight: 700, fontSize: '1rem', textDecoration: 'none',
            boxShadow: '0 6px 18px rgba(88,101,242,0.35)', transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 22px rgba(88,101,242,0.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(88,101,242,0.35)'; }}
        >
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="12.5" viewBox="0 0 71 55" fill="white"><path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6064 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.3125 16.3068 45.2167C16.679 44.9385 17.0513 44.6491 17.4067 44.3568C17.471 44.3031 17.5606 44.2946 17.6333 44.3341C29.2558 49.6202 41.8354 49.6202 53.3179 44.3341C53.3907 44.2918 53.4803 44.3003 53.5474 44.354C53.9028 44.6463 54.2751 44.9385 54.65 45.2167C54.7787 45.3125 54.7703 45.5041 54.6305 45.5858C52.8618 46.6197 51.0231 47.4931 49.0892 48.2228C48.9634 48.2707 48.9074 48.4172 48.969 48.5383C50.0352 50.6036 51.2526 52.5699 52.593 54.435C52.649 54.5139 52.7497 54.5477 52.8421 54.5195C58.6439 52.7249 64.5265 50.0174 70.5994 45.5576C70.6526 45.5182 70.6862 45.459 70.6918 45.3942C72.1748 30.0791 68.2416 16.7757 60.1968 4.9823C60.1773 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.2249 20.1717 23.0132 23.7259 23.0132C27.3082 23.0132 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8195 37.3253 40.937 34.1136 40.937 30.1693C40.937 26.2249 43.7636 23.0132 47.3178 23.0132C50.9001 23.0132 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9001 37.3253 47.3178 37.3253Z"/></svg>
          </span>
          Join the Discord Server
        </a>
      )}

      {/* Exam review */}
      {transcript && (
        <div style={{ borderTop: `2px solid #f0f0f0`, paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.greyLight, margin: '0 0 1.25rem' }}>
            Exam Review
          </h3>
          {transcript.map((q, qi) => (
            <TranscriptQuestion key={q.id} q={q} qi={qi} />
          ))}
        </div>
      )}
      </>)}
    </>;
  }

  // Welcome screen
  if (state === 'welcome') return card(<>
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <IFCAvatar username={pilot?.ifc_username} firstName={pilot?.first_name} />
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', color: '#1a1a1a' }}>
        Welcome, {pilot?.first_name}!
      </h2>
      <p style={{ color: C.grey, margin: 0, fontSize: '0.95rem' }}>
        You've been invited to sit the {brand.shortName} entry examination.
      </p>
    </div>

    <div style={{ background: '#f8f8f8', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center' }}>
        {[
          { label: 'Questions', value: exam?.questions?.length },
          { label: 'Pass Mark',  value: `${exam?.pass_mark}%` },
          { label: 'Attempts',   value: '1' },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.gold }}>{value}</div>
            <div style={{ fontSize: '0.75rem', color: C.greyLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.2rem' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>

    <div style={{ marginBottom: '1.75rem' }}>
      <h3 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.greyLight, marginBottom: '0.75rem' }}>Before you begin</h3>
      {[
        'Read each question carefully before selecting your answer.',
        'You must answer all questions before submitting.',
        'You only get one attempt — make sure you are ready before starting.',
        'Once submitted your answers cannot be changed.',
      ].map((tip, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.goldBg, color: C.gold, fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '0.1rem' }}>{i + 1}</div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#4a4a4a', lineHeight: 1.5 }}>{tip}</p>
        </div>
      ))}
    </div>

    <button onClick={() => setState('ready')} style={{
      width: '100%', padding: '0.875rem',
      background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))',
      color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
      fontWeight: 700, fontSize: '1rem',
    }}>
      I'm Ready - Start Exam
    </button>
  </>);

  // Exam questions (ready | submitting)
  const answered = Object.keys(answers).length;
  return card(<>
    <div style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>Good luck, {pilot?.first_name}!</h2>
      <p style={{ color: C.grey, margin: 0, fontSize: '0.9rem' }}>
        {exam.questions.length} questions · {exam.pass_mark}% to pass · Answer all before submitting
      </p>
    </div>

    {/* Progress bar */}
    <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, marginBottom: '2rem', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${(answered / exam.questions.length) * 100}%`, background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))', borderRadius: 3, transition: 'width 0.3s ease' }} />
    </div>

    {exam.questions.map((q, qi) => (
      <div key={q.id} style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.75rem', color: '#1a1a1a' }}>
          <span style={{ color: C.gold, marginRight: '0.5rem' }}>{qi + 1}.</span>{q.question}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {q.options.map((opt, oi) => {
            const selected = answers[q.id] === oi;
            return (
              <div key={oi} onClick={() => handleSelect(q.id, oi)} style={{
                padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
                border: `2px solid ${selected ? 'var(--brand-primary)' : C.border}`,
                background: selected ? 'rgba(var(--brand-primary-rgb),0.05)' : 'white',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                transition: 'all 0.15s', userSelect: 'none',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${selected ? 'var(--brand-primary)' : '#ccc'}`,
                  background: selected ? 'var(--brand-primary)' : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />}
                </div>
                <span style={{ fontSize: '0.9rem', color: selected ? 'var(--brand-primary)' : '#2d2d2d', fontWeight: selected ? 600 : 400 }}>{opt}</span>
              </div>
            );
          })}
        </div>
      </div>
    ))}

    {errorMsg && (
      <div style={{ padding: '0.75rem', background: '#ffebee', color: C.red, borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
        {errorMsg}
      </div>
    )}

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1.5rem', borderTop: `1px solid #f0f0f0` }}>
      <span style={{ fontSize: '0.85rem', color: C.greyLight }}>{answered} of {exam.questions.length} answered</span>
      <button onClick={handleSubmit} disabled={!allAnswered || state === 'submitting'} style={{
        padding: '0.75rem 2rem',
        background: allAnswered ? 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))' : '#ccc',
        color: 'white', border: 'none', borderRadius: '8px',
        cursor: allAnswered ? 'pointer' : 'not-allowed',
        fontWeight: 700, fontSize: '1rem', transition: 'all 0.15s',
      }}>
        {state === 'submitting' ? 'Submitting...' : 'Submit Exam'}
      </button>
    </div>
  </>);
}

// Shared sub-components

function IconCircle({ stroke, path }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </div>
  );
}

// Score ring — animated circular progress used on the result screen
function ScoreRing({ score, passed }) {
  const [animated, setAnimated] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(t);
  }, [score]);

  const size = 132, stroke = 10, radius = (size - stroke) / 2, circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = passed ? C.green : C.red;

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef1ee" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {passed ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.15rem' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ marginBottom: '0.1rem' }}>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{score}%</div>
      </div>
    </div>
  );
}

function TranscriptQuestion({ q, qi }) {
  const isCorrect = q.is_correct;
  return (
    <div style={{
      marginBottom: '1.25rem', padding: '1rem 1.25rem', borderRadius: '10px',
      border: `1.5px solid ${isCorrect ? '#c8e6c9' : '#ffcdd2'}`,
      background: isCorrect ? '#f8fff8' : '#fff8f8',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: '0.05rem',
          background: isCorrect ? '#2e7d32' : '#c62828',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isCorrect
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          }
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a', lineHeight: 1.4 }}>
          <span style={{ color: '#9e9e9e', marginRight: '0.35rem' }}>{qi + 1}.</span>{q.question}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: q.explanation ? '0.85rem' : 0, paddingLeft: '1.8rem' }}>
        {q.options.map((opt, oi) => {
          const isThisCorrect   = oi === q.correct_answer;
          const isThisSelected  = oi === q.pilot_answer;
          const isWrongPick     = isThisSelected && !isThisCorrect;
          let bg = 'transparent', border = '1px solid #e8e8e8', color = '#4a4a4a', fw = 400;
          if (isThisCorrect) { bg = 'rgba(46,125,50,0.08)'; border = '1px solid #a5d6a7'; color = '#2e7d32'; fw = 600; }
          if (isWrongPick)   { bg = 'rgba(198,40,40,0.07)'; border = '1px solid #ef9a9a'; color = '#c62828'; fw = 600; }
          return (
            <div key={oi} style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', background: bg, border, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isThisCorrect && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
              {isWrongPick   && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              {!isThisCorrect && !isWrongPick && <div style={{ width: 13, flexShrink: 0 }} />}
              <span style={{ fontSize: '0.85rem', color, fontWeight: fw, lineHeight: 1.3, flex: 1 }}>{opt}</span>
              {isThisCorrect && <span style={{ fontSize: '0.7rem', color: '#2e7d32', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Correct</span>}
              {isWrongPick   && <span style={{ fontSize: '0.7rem', color: '#c62828', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Your answer</span>}
            </div>
          );
        })}
      </div>

      {q.explanation && (
        <div style={{ paddingLeft: '1.8rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: 'rgba(0,0,0,0.035)', borderRadius: '7px', padding: '0.6rem 0.75rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9e9e9e" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '0.1rem' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#5a5a5a', lineHeight: 1.55 }}>{q.explanation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Exam;
