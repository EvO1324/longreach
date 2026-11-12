/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Dropdown from '../components/Dropdown';
import { flights } from '../api/client';
import { showToast } from '../components/Toast';

import brand from '../brand';
export default function ManualPirep({ user, fleet, fullFleet }) {
  const [formData, setFormData] = useState({
    flight_number:  '',
    departure_icao: '',
    arrival_icao:   '',
    aircraft:       '',
    flight_hours:   '',
    flight_minutes: '',
    date:           new Date().toISOString().split('T')[0],
    notes:          '',
  });
  const [submitting, setSubmitting]   = useState(false);
  const [ifCheck, setIfCheck]         = useState({ status: 'idle' });
  const debounceRef                   = useRef(null);
  const ifCheckStatusRef              = useRef('idle');
  const lastMatchKeyRef               = useRef(null);

  const aircraftOptions = [
    { value: '', label: 'Select aircraft…' },
    ...(fullFleet || fleet || []).map(ac => ({ value: ac.displayName, label: ac.displayName })),
  ];

  const inp = {
    width: '100%', padding: '0.7rem 0.875rem',
    border: '1px solid var(--border-color)', borderRadius: '8px',
    fontSize: '0.9rem', backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  const runPreviewMatch = useCallback(async (dep, arr, aircraft, date) => {
    ifCheckStatusRef.current = 'checking';
    setIfCheck({ status: 'checking' });
    try {
      const data = await flights.previewMatch({ departure_icao: dep, arrival_icao: arr, aircraft, date });
      if (!data.checked) { ifCheckStatusRef.current = 'idle'; setIfCheck({ status: 'idle' }); return; }
      const status = data.matched ? 'matched' : 'no_match';
      ifCheckStatusRef.current = status;
      setIfCheck({ status, checks: data.checks, bestCandidate: data.bestCandidate, reason: data.reason });
    } catch { ifCheckStatusRef.current = 'error'; setIfCheck({ status: 'error' }); }
  }, []);

  useEffect(() => {
    const dep = formData.departure_icao;
    const arr = formData.arrival_icao;
    const ac  = formData.aircraft;
    const dt  = formData.date;
    const hrs = (parseInt(formData.flight_hours) || 0) + (parseInt(formData.flight_minutes) || 0) / 60;
    const complete = !!(user?.if_user_id) && dep?.length === 4 && arr?.length === 4 && dep !== arr && ac && hrs > 0;
    if (!complete) { setIfCheck({ status: 'idle' }); lastMatchKeyRef.current = null; return; }
    const matchKey = `${dep}|${arr}|${ac}|${dt}`;
    if (matchKey === lastMatchKeyRef.current && ifCheckStatusRef.current !== 'idle') return;
    lastMatchKeyRef.current = matchKey;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runPreviewMatch(dep, arr, ac, dt); }, 1200);
    return () => clearTimeout(debounceRef.current);
  }, [formData.departure_icao, formData.arrival_icao, formData.aircraft, formData.date, formData.flight_hours, formData.flight_minutes, runPreviewMatch, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async e => {
    e.preventDefault();
    const hours   = parseInt(formData.flight_hours)   || 0;
    const minutes = parseInt(formData.flight_minutes) || 0;
    const flightTimeHours = hours + minutes / 60;
    if (!formData.flight_number)  { showToast('Enter a flight number', 'error'); return; }
    if (!formData.departure_icao || formData.departure_icao.length !== 4) { showToast('Enter a valid 4-letter departure ICAO', 'error'); return; }
    if (!formData.arrival_icao   || formData.arrival_icao.length   !== 4) { showToast('Enter a valid 4-letter arrival ICAO', 'error'); return; }
    if (!formData.aircraft)       { showToast('Select an aircraft', 'error'); return; }
    if (flightTimeHours <= 0)     { showToast('Enter a valid flight time', 'error'); return; }
    try {
      setSubmitting(true);
      const result = await flights.submit({
        flight_number:  formData.flight_number,
        departure_icao: formData.departure_icao,
        arrival_icao:   formData.arrival_icao,
        aircraft:       formData.aircraft,
        flight_time:    parseFloat(flightTimeHours.toFixed(4)),
        date:           formData.date,
        notes:          formData.notes,
      });
      if (result.auto_approved) {
        showToast('PIREP verified and auto-approved via Infinite Flight!', 'success');
      } else {
        showToast('PIREP submitted! Awaiting admin approval.', 'success');
      }
      setFormData({ flight_number: '', departure_icao: '', arrival_icao: '', aircraft: '', flight_hours: '', flight_minutes: '', date: new Date().toISOString().split('T')[0], notes: '' });
      setIfCheck({ status: 'idle' });
      ifCheckStatusRef.current = 'idle';
      lastMatchKeyRef.current = null;
    } catch (err) {
      showToast(err.message || 'Failed to submit PIREP', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const hours = (parseInt(formData.flight_hours) || 0);
  const mins  = (parseInt(formData.flight_minutes) || 0);
  const flightTimeOk = (hours + mins / 60) > 0;

  return (
    <form onSubmit={handleSubmit}>
      <div className="pirep-layout-grid">
        <div className="card" style={{ padding: '1.5rem' }}>

          {/* Banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1.5rem', background: 'rgba(var(--brand-accent-rgb),0.06)', border: '1px solid rgba(var(--brand-accent-rgb),0.25)', borderRadius: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--avg-gold)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--avg-gold-dark)' }}>One World Discover</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>Manual PIREP — enter any route freely. IF logbook check still applies.</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Flight number */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Flight Number</label>
              <input style={inp} value={formData.flight_number} onChange={e => setFormData(f => ({ ...f, flight_number: e.target.value.toUpperCase() }))} placeholder="e.g. OW001" autoComplete="off" />
            </div>

            {/* Route */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Departure ICAO</label>
                <input style={{ ...inp, fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', textTransform: 'uppercase' }} value={formData.departure_icao} onChange={e => setFormData(f => ({ ...f, departure_icao: e.target.value.toUpperCase().slice(0, 4) }))} placeholder="YSSY" maxLength={4} autoComplete="off" />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Arrival ICAO</label>
                <input style={{ ...inp, fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', textTransform: 'uppercase' }} value={formData.arrival_icao} onChange={e => setFormData(f => ({ ...f, arrival_icao: e.target.value.toUpperCase().slice(0, 4) }))} placeholder="EGLL" maxLength={4} autoComplete="off" />
              </div>
            </div>

            {/* Aircraft */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Aircraft</label>
              <Dropdown options={aircraftOptions} value={formData.aircraft} onChange={v => setFormData(f => ({ ...f, aircraft: v }))} placeholder="Select aircraft…" />
            </div>

            {/* Flight time */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Flight Time</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <input className="flight-time-input" type="number" value={formData.flight_hours} onChange={e => setFormData(f => ({ ...f, flight_hours: e.target.value }))} placeholder="0" min="0" max="99"
                    style={{ width: 50, padding: '0.6rem 0.4rem', border: 'none', fontSize: '1.05rem', fontWeight: 600, textAlign: 'center', backgroundColor: 'transparent', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', paddingRight: '0.4rem' }}>hr</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <input className="flight-time-input" type="number" value={formData.flight_minutes} onChange={e => setFormData(f => ({ ...f, flight_minutes: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)).toString() }))} placeholder="0" min="0" max="59"
                    style={{ width: 50, padding: '0.6rem 0.4rem', border: 'none', fontSize: '1.05rem', fontWeight: 600, textAlign: 'center', backgroundColor: 'transparent', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', paddingRight: '0.4rem' }}>min</span>
                </div>
              </div>
            </div>

            {/* Date */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Date</label>
              <input style={inp} type="date" value={formData.date} onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} />
            </div>

            {/* IF logbook check */}
            {flightTimeOk && (
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>IF Logbook</label>
                {ifCheck.status === 'idle' && <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Will check automatically once all fields are set.</span>}
                {ifCheck.status === 'checking' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'avg-spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Checking IF logbook…
                  </span>
                )}
                {ifCheck.status === 'matched' && (() => {
                  const enteredMins = hours * 60 + mins;
                  const ifMins = ifCheck.bestCandidate?.totalTime != null ? Math.round(ifCheck.bestCandidate.totalTime) : null;
                  const timeDiff = ifMins !== null ? Math.abs(enteredMins - ifMins) : null;
                  const timeOk = timeDiff === null || timeDiff <= 10;
                  const ifTimeLabel = ifMins !== null ? `${Math.floor(ifMins/60)}h ${ifMins%60}m` : null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', background: 'rgba(var(--brand-primary-rgb),0.08)', border: '1px solid rgba(var(--brand-primary-rgb),0.2)', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--avg-green)', fontWeight: 600 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        Matching flight found in IF logbook
                      </span>
                      {!timeOk && ifTimeLabel && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', background: 'rgba(198,40,40,0.06)', border: '1px solid rgba(198,40,40,0.25)', borderRadius: '6px', fontSize: '0.82rem', color: '#c62828', fontWeight: 600 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Incorrect flight time — IF logbook shows {ifTimeLabel}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {ifCheck.status === 'no_match' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', background: 'rgba(230,81,0,0.06)', border: '1px solid rgba(230,81,0,0.2)', borderRadius: '6px', fontSize: '0.82rem', color: '#e65100', fontWeight: 600 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    No IF match — will be reviewed manually
                  </span>
                )}
                {ifCheck.status === 'error' && <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Couldn't reach IF logbook — will be reviewed manually.</span>}
              </div>
            )}

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes about your flight…" rows={2}
                style={{ ...inp, resize: 'vertical', fontSize: '0.875rem' }} />
            </div>

          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <button type="submit" disabled={submitting} style={{ width: '100%', padding: '0.8rem', fontSize: '0.95rem', fontWeight: 700, background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, fontFamily: 'inherit' }}>
              {submitting ? 'Submitting…' : 'Submit PIREP'}
            </button>
          </div>

        </div>

        {/* Sidebar */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--avg-gold)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>One World Discover</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
            This form allows you to file a PIREP for any route — including non-{brand.abbreviation} routes. Enter the ICAOs directly and select your aircraft.
          </p>
          {[
            'Flight time must reflect actual in-sim time.',
            'IF logbook check still applies — your flight must appear in your IF history.',
            'One PIREP per flight — no duplicates.',
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}
