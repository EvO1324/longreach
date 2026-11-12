/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useRef } from 'react';
import { issues as issuesApi } from '../api/client';
import { showToast } from './Toast';

export default function ReportIssueModal({ open, onClose }) {
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]     = useState('bug');
  const [screenshot, setScreenshot] = useState(null); // { base64, filename, mime, preview }
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  if (!open) return null;

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Screenshot must be under 5MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const base64  = dataUrl.split(',')[1];
      setScreenshot({ base64, filename: file.name, mime: file.type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim())       { showToast('Please enter a title', 'error'); return; }
    if (!description.trim()) { showToast('Please enter a description', 'error'); return; }

    try {
      setSubmitting(true);
      const result = await issuesApi.submit({
        title, description, category,
        screenshot_base64: screenshot?.base64 || null,
        screenshot_mime:   screenshot?.mime   || null,
      });
      showToast(`Issue #${result.issue_number} submitted — thanks!`, 'success');
      setTitle(''); setDescription(''); setCategory('bug'); setScreenshot(null);
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to submit issue', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const inp = { width: '100%', padding: '0.65rem 0.875rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.875rem', boxSizing: 'border-box' };

  const cats = [
    { value: 'bug',     label: '🐛 Bug', desc: 'Something isn\'t working' },
    { value: 'feature', label: '✨ Feature', desc: 'Suggest an improvement' },
    { value: 'other',   label: '💬 Other', desc: 'Anything else' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '520px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Report an issue</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1px' }}>This gets posted directly to our GitHub</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Category */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Category</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {cats.map(c => (
                <button key={c.value} type="button" onClick={() => setCategory(c.value)} style={{ padding: '0.65rem 0.5rem', border: `1.5px solid ${category === c.value ? 'var(--avg-green)' : 'var(--border-color)'}`, borderRadius: '8px', background: category === c.value ? 'rgba(var(--brand-primary-rgb),0.06)' : 'var(--bg-card)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: category === c.value ? 700 : 500, color: category === c.value ? 'var(--avg-green)' : 'var(--text-primary)' }}>{c.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{c.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Title</label>
            <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief summary of the issue" maxLength={100} />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Description</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: '100px' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What happened? What were you expecting? Steps to reproduce..." maxLength={2000} />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px', textAlign: 'right' }}>{description.length}/2000</div>
          </div>

          {/* Screenshot */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
              Screenshot <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            {screenshot ? (
              <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <img src={screenshot.preview} alt="Screenshot preview" style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', display: 'block' }} />
                <button type="button" onClick={() => setScreenshot(null)} style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '1rem', border: '1.5px dashed var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Click to attach a screenshot
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting} style={{ padding: '0.6rem 1.25rem', background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: submitting ? 0.6 : 1, fontFamily: 'inherit' }}>
            {submitting ? 'Submitting…' : 'Submit issue'}
          </button>
        </div>
      </div>
    </div>
  );
}
