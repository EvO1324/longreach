/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState } from 'react';
import { flights, infiniteFlight } from '../api/client';
import { showToast } from '../components/Toast';
import { CheckCircle } from 'lucide-react';

import brand from '../brand';

// Which airports count for ATC hours (va.config.json atc): none listed means any
const ATC_PREFIXES = (brand.atc?.airportPrefixes || []).map(p => String(p).toUpperCase()).filter(Boolean);
const ATC_REGION = brand.atc?.regionName ? `${brand.atc.regionName} ` : '';
const FREQ_LABELS = { 0: 'Ground', 1: 'Tower', 2: 'Unicom', 3: 'Clearance', 4: 'Approach', 5: 'Departure', 6: 'Centre', 7: 'ATIS' };
const MIN_ATC_MINS = 30;

export default function ATCSession({ user }) {
  const [icao, setIcao]             = useState('');
  const [searching, setSearching]   = useState(false);
  const [sessions, setSessions]     = useState([]);
  const [selected, setSelected]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);

  const lbl = { display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem' };
  const inp = { width: '100%', padding: '0.7rem 0.875rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' };

  const search = async () => {
    if (!icao.trim() || !user.if_user_id) return;
    if (ATC_PREFIXES.length && !ATC_PREFIXES.some(p => icao.trim().toUpperCase().startsWith(p))) {
      showToast(`Only ${ATC_REGION}airports (ICAO starting with ${ATC_PREFIXES.join(' or ')}) are eligible`, 'error');
      return;
    }
    setSearching(true);
    setSessions([]);
    setSelected(null);
    try {
      const data = await infiniteFlight.userAtc(user.if_user_id);
      const all = data.result?.data || [];
      const groups = {};
      for (const s of all) {
        if (s.worldType !== 3) continue;
        if (s.facility?.airportIcao?.toUpperCase() !== icao.toUpperCase()) continue;
        const gid = s.atcSessionGroupId;
        if (!groups[gid]) {
          groups[gid] = {
            id:               gid,
            atcSessionGroupId: gid,
            facility:         s.facility,
            created:          s.created,
            totalTime:        0,
            operations:       0,
            frequencies:      [],
          };
        }
        groups[gid].totalTime  = Math.max(groups[gid].totalTime, s.totalTime);
        groups[gid].operations = Math.max(groups[gid].operations, s.operations);
        groups[gid].frequencies.push(FREQ_LABELS[s.facility?.frequencyType] || 'Unknown');
        // Use earliest created time for the group
        if (s.created < groups[gid].created) groups[gid].created = s.created;
      }
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      const matched = Object.values(groups).filter(g => g.totalTime >= MIN_ATC_MINS && new Date(g.created).getTime() > cutoff);
      setSessions(matched);
      if (matched.length === 0) showToast('No matching Expert sessions found for that airport in the last 48h', 'error');
    } catch { showToast('Failed to fetch ATC sessions', 'error'); }
    finally { setSearching(false); }
  };

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await flights.submitAtc({
        airport_icao:    selected.facility.airportIcao,
        session_id:      selected.atcSessionGroupId,
        total_time_mins: selected.totalTime,
        date:            selected.created.slice(0, 10),
      });
      setDone(true);
      showToast('ATC session filed!', 'success');
    } catch (err) { showToast(err?.message || 'Failed to file ATC session', 'error'); }
    finally { setSubmitting(false); }
  };

  const reset = () => { setDone(false); setIcao(''); setSessions([]); setSelected(null); };

  return (
    <div>
      {done ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <CheckCircle size={52} color="var(--avg-green)" strokeWidth={1.5} />
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '0.4rem' }}>ATC Session Filed</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 1.75rem', lineHeight: 1.6 }}>
            Your session has been logged. ATC hours are tracked separately to flight hours.
          </p>
          <button onClick={reset} className="btn btn-primary">File Another</button>
        </div>
      ) : (
        <div className="card">

          {/* Search row */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={lbl}>Airport ICAO</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                value={icao}
                onChange={e => setIcao(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="e.g. YSSY"
                maxLength={4}
                style={{ ...inp, flex: 1, fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.08em' }}
              />
              <button
                onClick={search}
                disabled={searching || !icao.trim()}
                className="btn btn-primary"
                style={{ whiteSpace: 'nowrap', opacity: (!icao.trim() || searching) ? 0.5 : 1 }}
              >
                {searching ? 'Searching…' : 'Find Sessions'}
              </button>
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {ATC_PREFIXES.length ? `${ATC_REGION || 'Eligible '}airports only · ` : ''}Expert server · 30 min minimum
            </p>
          </div>

          {/* Results */}
          {sessions.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ ...lbl, marginBottom: '0.6rem' }}>
                Select session
                <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>{sessions.length} found</span>
              </label>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                {sessions.map((s, i) => {
                  const hrs  = Math.floor(s.totalTime / 60);
                  const mins = Math.round(s.totalTime % 60);
                  const freq = [...new Set(s.frequencies)].filter(f => f !== 'ATIS' && f !== 'Unicom').join(' · ');
                  const isSel = selected?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelected(isSel ? null : s)}
                      style={{
                        padding: '0.875rem 1rem',
                        borderBottom: i < sessions.length - 1 ? '1px solid var(--border-color)' : 'none',
                        cursor: 'pointer',
                        background: isSel ? 'rgba(var(--brand-primary-rgb),0.05)' : 'var(--bg-card)',
                        borderLeft: `3px solid ${isSel ? 'var(--avg-green)' : 'transparent'}`,
                        transition: 'background 0.12s',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSel ? 'rgba(var(--brand-primary-rgb),0.05)' : 'var(--bg-card)'; }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: isSel ? 'var(--avg-green)' : 'var(--text-primary)' }}>
                            {s.facility?.airportIcao}
                          </span>
                          {freq && (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                              {freq}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {new Date(s.created).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                          {s.operations > 0 && <span style={{ marginLeft: '0.5rem' }}>· {s.operations} ops</span>}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'monospace', color: isSel ? 'var(--avg-green)' : 'var(--text-primary)', flexShrink: 0 }}>
                        {hrs}h {mins}m
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={submitting || !selected}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.8rem', opacity: selected ? 1 : 0.4 }}
          >
            {submitting ? 'Filing…' : selected ? `File ${Math.floor(selected.totalTime / 60)}h ${Math.round(selected.totalTime % 60)}m at ${selected.facility?.airportIcao}` : 'File ATC Session'}
          </button>

        </div>
      )}
    </div>
  );
}
