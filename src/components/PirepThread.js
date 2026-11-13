/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

// The comment thread on a PIREP. The pilot sees it in their logbook, staff on
// the PIREP's admin page. Same component, same API.

import React, { useEffect, useState, useRef } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { flights as flightsApi } from '../api/client';
import { showToast } from './Toast';

const CSS = `
.pt { display: flex; flex-direction: column; gap: 10px; }
.pt-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700; }
.pt-list { display: flex; flex-direction: column; gap: 8px; }
.pt-msg { max-width: 85%; padding: 8px 12px; border-radius: 10px; background: var(--bg-secondary); align-self: flex-start; }
.pt-msg.is-me { align-self: flex-end; background: rgba(var(--brand-primary-rgb), 0.1); }
.pt-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px; }
.pt-staff { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 5px; border-radius: 4px; background: rgba(var(--brand-primary-rgb), 0.15); color: var(--avg-green); }
.pt-body { font-size: 13.5px; color: var(--text-primary); white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
.pt-del { background: none; border: none; padding: 0; margin-left: auto; cursor: pointer; color: var(--text-secondary); opacity: 0; display: flex; }
.pt-msg:hover .pt-del { opacity: 1; }
.pt-form { display: flex; gap: 8px; align-items: flex-end; }
.pt-form textarea { flex: 1; min-width: 0; resize: vertical; min-height: 38px; max-height: 160px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 13.5px; box-sizing: border-box; }
.pt-form button { display: flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 8px; border: none; background: var(--avg-green); color: #fff; font-weight: 600; font-size: 13px; cursor: pointer; }
.pt-form button:disabled { opacity: 0.6; cursor: default; }
.pt-empty { font-size: 13px; color: var(--text-secondary); margin: 0; }
`;

const when = iso => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};

function PirepThread({ flightId, userId, emptyText }) {
  const [comments, setComments] = useState(null);
  const [you, setYou] = useState({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    let live = true;
    flightsApi.comments(flightId)
      .then(d => { if (live) { setComments(d.comments || []); setYou(d.you || {}); } })
      .catch(() => { if (live) setComments([]); });
    return () => { live = false; };
  }, [flightId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const d = await flightsApi.addComment(flightId, body);
      setComments(c => [...(c || []), d.comment]);
      setText('');
    } catch (err) {
      showToast(err.message || 'Couldn\'t send that', 'error');
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    try {
      await flightsApi.removeComment(flightId, id);
      setComments(c => c.filter(x => x.id !== id));
    } catch (err) {
      showToast(err.message || 'Couldn\'t delete that', 'error');
    }
  };

  if (comments === null) return null;

  return (
    <div className="pt">
      <style>{CSS}</style>
      <div className="pt-label">Comments</div>
      {comments.length === 0 ? (
        <p className="pt-empty">{emptyText || 'No comments yet.'}</p>
      ) : (
        <div className="pt-list" ref={listRef} style={{ maxHeight: 320, overflowY: 'auto' }}>
          {comments.map(c => {
            const mine = c.user === userId;
            return (
              <div key={c.id} className={`pt-msg${mine ? ' is-me' : ''}`}>
                <div className="pt-meta">
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{mine ? 'You' : c.author}</span>
                  {c.staff && <span className="pt-staff">Staff</span>}
                  <span>{when(c.created)}</span>
                  {(mine || you.staff) && (
                    <button className="pt-del" onClick={() => remove(c.id)} title="Delete"><Trash2 size={12} /></button>
                  )}
                </div>
                <div className="pt-body">{c.body}</div>
              </div>
            );
          })}
        </div>
      )}
      <div className="pt-form">
        <textarea
          rows={1}
          value={text}
          maxLength={2000}
          placeholder={you.owner ? 'Ask staff about this PIREP…' : 'Reply to the pilot…'}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
        />
        <button onClick={send} disabled={sending || !text.trim()}><Send size={14} /> Send</button>
      </div>
    </div>
  );
}

export default PirepThread;
