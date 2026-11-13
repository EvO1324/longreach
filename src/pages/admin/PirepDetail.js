/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { flights as flightsApi, infiniteFlight, fleet as fleetApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import Dropdown from '../../components/Dropdown';
import PirepThread from '../../components/PirepThread';

const STATUS_COLORS = {
  pending:  { bg: 'rgba(230,81,0,0.1)',   color: '#e65100',  label: 'Pending'  },
  approved: { bg: 'rgba(46,125,50,0.1)',  color: '#2e7d32',  label: 'Approved' },
  rejected: { bg: 'rgba(198,40,40,0.1)', color: '#c62828',  label: 'Rejected' },
};

function PirepDetail({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pirep, setPirep]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [processing, setProcessing] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [fleetList, setFleetList]     = useState([]);
  const [showReject, setShowReject] = useState(false);
  const [showRejectApproved, setShowRejectApproved] = useState(false);
  const [rejectApprovedNote, setRejectApprovedNote] = useState('');
  const [ifFlights, setIfFlights]         = useState(null);
  const [selectedIFFlight, setSelectedIFFlight] = useState(null);
  const [retrying, setRetrying]           = useState(false);
  const [loadingIF, setLoadingIF]         = useState(false);
  const [ifError, setIfError]             = useState(null);
  const getAircraftName = (aircraftId, liveryId) => {
    if (!aircraftId && !liveryId) return '—';
    const match = fleetList.find(f => f.livery_id === liveryId && f.aircraft_id === aircraftId)
      || fleetList.find(f => f.livery_id === liveryId)
      || fleetList.find(f => f.aircraft_id === aircraftId);
    if (!match) return '—';
    return match.name?.split(' - ')[0] || match.name || '—';
  };

  const getLiveryName = (liveryId) => {
    if (!liveryId) return '—';
    const match = fleetList.find(f => f.livery_id === liveryId);
    if (!match) return '—';
    // livery_name field, or the part after " - " in name
    return match.livery_name || match.name?.split(' - ')[1] || '—';
  };

  const [form, setForm] = useState({
    flight_number: '', departure_icao: '', arrival_icao: '',
    aircraft: '', flight_time: '', date: '', notes: '',
  });

  const loadPirep = useCallback(async () => {
    try {
      setLoading(true);
      const data = await flightsApi.getOne(id);
      const f = data.flight;
      setPirep(f);
      setForm({
        flight_number:  f.flight_number  || '',
        departure_icao: f.departure_icao || '',
        arrival_icao:   f.arrival_icao   || '',
        aircraft:       f.aircraft       || '',
        flight_time:    f.flight_time    != null ? String(f.flight_time) : '',
        date:           f.date ? f.date.split(' ')[0] : '',
        notes:          f.notes          || '',
      });
    } catch (err) {
      showToast('Failed to load PIREP', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadPirep(); }, [loadPirep]);

  useEffect(() => {
    fleetApi.list().then(data => {
      const flat = (data.fleet || []).flatMap(g => g.liveries || []);
      setFleetList(flat);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await flightsApi.adminUpdate(id, {
        flight_number:  form.flight_number.toUpperCase(),
        departure_icao: form.departure_icao.toUpperCase(),
        arrival_icao:   form.arrival_icao.toUpperCase(),
        aircraft:       form.aircraft,
        flight_time:    parseFloat(form.flight_time),
        date:           form.date,
        notes:          form.notes,
      });
      showToast('PIREP updated', 'success');
      await loadPirep();
    } catch (err) {
      showToast('Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    try {
      setProcessing(true);
      await flightsApi.approve(id);
      showToast('PIREP approved!', 'success');
      navigate(-1);
    } catch {
      showToast('Failed to approve', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setProcessing(true);
      await flightsApi.reject(id, rejectNote.trim());
      showToast('PIREP rejected', 'success');
      navigate(-1);
    } catch {
      showToast('Failed to reject', 'error');
    } finally {
      setProcessing(false);
      setShowReject(false);
    }
  };

  const handleApproveRejected = async () => {
    try {
      setProcessing(true);
      await flightsApi.approveRejected(id);
      showToast('PIREP approved and hours credited', 'success');
      navigate(-1);
    } catch (err) {
      showToast(err.message || 'Failed to approve PIREP', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectApproved = async () => {
    try {
      setProcessing(true);
      await flightsApi.rejectApproved(id, rejectApprovedNote.trim());
      showToast('PIREP rejected and hours reversed', 'success');
      navigate(-1);
    } catch (err) {
      showToast(err.message || 'Failed to reject PIREP', 'error');
    } finally {
      setProcessing(false);
      setShowRejectApproved(false);
    }
  };

  const handleRetryAutoApprove = async () => {
    setRetrying(true);
    try {
      const data = await flightsApi.retryAutoApprove(id);
      if (data.approved) {
        showToast('✅ PIREP auto-approved via Infinite Flight!', 'success');
      } else {
        showToast('No matching IF flight found — diagnostic updated', 'warning');
      }
      await loadPirep(); // refresh to show updated result + new status
    } catch (err) {
      showToast(err.message || 'Retry failed', 'error');
    } finally {
      setRetrying(false);
    }
  };

  const loadIF = async () => {
    if (!pirep?.expand?.user?.if_user_id) return;
    setLoadingIF(true);
    setIfError(null);
    try {
      const data = await infiniteFlight.userFlights(pirep.expand.user.if_user_id);
      setIfFlights(data.result?.data || []);
    } catch {
      setIfError('Failed to fetch Infinite Flight logbook.');
    } finally {
      setLoadingIF(false);
    }
  };

  const [avatarError, setAvatarError] = useState(false);
  const fmtMins = (mins) => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  const fmtHours = (h) => `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;

  const matchesIF = (ifFlight) => {
    if (!pirep) return false;
    const daysDiff = Math.abs(new Date(ifFlight.created) - new Date(pirep.date)) / (1000 * 60 * 60 * 24);
    return ifFlight.originAirport === pirep.departure_icao &&
           ifFlight.destinationAirport === pirep.arrival_icao &&
           daysDiff <= 7;
  };

  const AutoApproveChecklist = () => {
    if (!autoResult) return (
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        No diagnostic available — filed before diagnostics were added.
      </div>
    );

    const iconPass = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
    const iconFail = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    const iconSkip = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>;

    // Parse aircraft detail into two clean rows if it contains pipe separator
    const renderDetail = (check) => {
      if (!check.detail) return null;
      if (check.key === 'aircraft' && check.detail.includes(' | Expected:')) {
        const [ifPart, expPart] = check.detail.split(' | Expected:');
        const parseAC = str => {
          const ac  = str.match(/aircraft=([^\s]+)/)?.[1] || '—';
          const liv = str.match(/livery=([^\s]+)/)?.[1]   || '—';
          return { ac, liv };
        };
        const got = parseAC(ifPart);
        const exp = parseAC(expPart);
        // Look up human-readable names from our fleet list
        const expEntry = fleetList.find(f => f.aircraft_id === exp.ac && f.livery_id === exp.liv)
          || fleetList.find(f => f.livery_id === exp.liv)
          || fleetList.find(f => f.aircraft_id === exp.ac);
        const gotEntry = fleetList.find(f => f.aircraft_id === got.ac && f.livery_id === got.liv)
          || fleetList.find(f => f.livery_id === got.liv)
          || fleetList.find(f => f.aircraft_id === got.ac);
        return (
          <div style={{ marginTop: '0.4rem', display: 'grid', gridTemplateColumns: '4rem 1fr', rowGap: '0.15rem', fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
            <span style={{ fontFamily: 'inherit', fontWeight: 600, color: 'var(--text-secondary)' }}>Flew</span>
            <span style={{ wordBreak: 'break-all' }}>{gotEntry ? gotEntry.name : `ac: ${got.ac} / livery: ${got.liv}`}</span>
            <span style={{ fontFamily: 'inherit', fontWeight: 600, color: 'var(--text-secondary)' }}>Filed</span>
            <span style={{ wordBreak: 'break-all' }}>{expEntry ? expEntry.name : `ac: ${exp.ac} / livery: ${exp.liv}`}</span>
          </div>
        );
      }
      return <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{check.detail}</div>;
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {!autoResult.matched && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(198,40,40,0.05)', borderRadius: '6px', border: '1px solid rgba(198,40,40,0.15)', marginBottom: '0.25rem' }}>
            {iconFail}
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#c62828' }}>
              {{ no_if_linked: 'No IF account linked', no_api_key: 'IF API key missing', if_api_error: 'IF API error', no_if_flights: 'No IF flights found', no_match: 'No matching flight found', exception: 'Unexpected error' }[autoResult.reason] || autoResult.reason}
            </span>
          </div>
        )}

        {(autoResult.checks || []).map(check => {
          const icon  = check.passed === true ? iconPass : check.passed === false ? iconFail : iconSkip;
          const color = check.passed === true ? '#2e7d32' : check.passed === false ? '#c62828' : '#9e9e9e';
          const bg    = check.passed === true ? 'rgba(46,125,50,0.05)' : check.passed === false ? 'rgba(198,40,40,0.05)' : 'var(--bg-secondary)';
          const border = check.passed === true ? 'rgba(46,125,50,0.15)' : check.passed === false ? 'rgba(198,40,40,0.15)' : 'var(--border-color)';
          return (
            <div key={check.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.55rem 0.75rem', background: bg, borderRadius: '6px', border: `1px solid ${border}` }}>
              <div style={{ marginTop: '2px', flexShrink: 0 }}>{icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color }}>{check.label}</div>
                {renderDetail(check)}
              </div>
            </div>
          );
        })}

        {autoResult.bestCandidate && !autoResult.matched && (
          <div style={{ marginTop: '0.25rem', padding: '0.65rem 0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Closest candidate</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{autoResult.bestCandidate.originAirport} → {autoResult.bestCandidate.destinationAirport}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
              <div>{autoResult.bestCandidate.daysDiff}d apart</div>
              <div>{['Expert','Casual','Training','Expert','Private'][autoResult.bestCandidate.worldType] || 'Expert'}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px',
    border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block', fontSize: '0.75rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    color: 'var(--text-secondary)', marginBottom: '0.35rem',
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ color: 'var(--text-secondary)' }}>Loading PIREP...</div>
    </div>
  );

  if (!pirep) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ color: 'var(--text-secondary)' }}>PIREP not found.</div>
    </div>
  );

  const pilot = pirep.expand?.user;
  const statusStyle = STATUS_COLORS[pirep.status] || STATUS_COLORS.pending;

  // Parse auto-approve diagnostic stored on the flight record
  const autoResult = (() => {
    try { return pirep.auto_approve_result ? JSON.parse(pirep.auto_approve_result) : null; }
    catch { return null; }
  })();

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .pirep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        .pirep-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.875rem; }
        .pirep-header-actions { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .pirep-action-btns { display: flex; gap: 0.5rem; }
        @media (max-width: 680px) {
          .pirep-grid { grid-template-columns: 1fr !important; }
          .pirep-form-grid { grid-template-columns: 1fr 1fr; }
          .pirep-header-actions { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
          .pirep-title-row { flex-wrap: wrap; gap: 0.5rem; }
          .pirep-action-btns { width: 100%; }
          .pirep-action-btns button { flex: 1; }
          .pirep-reject-btn { width: 100%; box-sizing: border-box; }
        }
      `}</style>

      {/* Header */}
      <div className="pirep-header-actions">
        <button onClick={() => navigate(-1)} style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: 'none', border: '1px solid var(--border-color)',
          borderRadius: '6px', padding: '0.45rem 0.875rem',
          cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600,
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pirep-title-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem', wordBreak: 'break-word' }}>
              {pirep.flight_number} — {pirep.departure_icao} → {pirep.arrival_icao}
            </h2>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem',
              borderRadius: '12px', background: statusStyle.bg, color: statusStyle.color,
              textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
            }}>
              {statusStyle.label}
            </span>
            {pirep.auto_approved && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1976d2', background: 'rgba(25,118,210,0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px', flexShrink: 0 }}>
                IF Verified
              </span>
            )}
            {pirep.is_live && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--brand-accent)', background: 'rgba(var(--brand-accent-rgb),0.14)', padding: '0.2rem 0.6rem', borderRadius: '12px', flexShrink: 0 }}>
                LIVE
              </span>
            )}
            {pirep.multiplier_value && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--avg-green)', background: 'rgba(var(--brand-primary-rgb),0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontFamily: 'monospace', flexShrink: 0 }}>
                ×{pirep.multiplier_value}{pirep.multiplier_name ? ` — ${pirep.multiplier_name}` : ''}
              </span>
            )}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            PIREP ID: <code style={{ fontSize: '0.78rem' }}>{id}</code>
          </div>
        </div>

        {/* Reject approved PIREP */}
        {pirep.status === 'approved' && (
          <button onClick={() => setShowRejectApproved(true)} disabled={processing} className="pirep-reject-btn" style={{
            padding: '0.6rem 1.25rem', background: 'transparent', color: '#c62828',
            border: '1.5px solid #c62828', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '0.875rem', opacity: processing ? 0.6 : 1,
          }}>
            ✕ Reject & Reverse Hours
          </button>
        )}

        {/* Approve rejected PIREP */}
        {pirep.status === 'rejected' && (
          <button onClick={handleApproveRejected} disabled={processing} className="pirep-reject-btn" style={{
            padding: '0.6rem 1.25rem', background: '#2e7d32', color: 'white',
            border: 'none', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '0.875rem', opacity: processing ? 0.6 : 1,
          }}>
            {processing ? '...' : '✓ Approve & Credit Hours'}
          </button>
        )}

        {/* Action buttons for pending */}
        {pirep.status === 'pending' && (
          <div className="pirep-action-btns">
            <button onClick={handleApprove} disabled={processing} style={{
              padding: '0.6rem 1.25rem', background: '#2e7d32', color: 'white',
              border: 'none', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.875rem', opacity: processing ? 0.6 : 1,
            }}>
              {processing ? '...' : '✓ Approve'}
            </button>
            <button onClick={() => setShowReject(true)} disabled={processing} style={{
              padding: '0.6rem 1.25rem', background: '#c62828', color: 'white',
              border: 'none', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.875rem', opacity: processing ? 0.6 : 1,
            }}>
              ✕ Reject
            </button>
          </div>
        )}
      </div>

      <div className="pirep-grid">

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Pilot card */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Pilot</div>
            {pilot ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                {pilot.ifc_username && !avatarError ? (
                  <img
                    src={`https://community.infiniteflight.com/user_avatar/community.infiniteflight.com/${pilot.ifc_username.toLowerCase()}/288/1487666_2.png`}
                    alt={pilot.first_name}
                    onError={() => setAvatarError(true)}
                    style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border-color)' }}
                  />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--avg-green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0 }}>
                    {pilot.first_name?.[0]}{pilot.last_name?.[0]}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700 }}>{pilot.first_name} {pilot.last_name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--avg-green)', fontWeight: 600 }}>{pilot.callsign}</div>
                  {pilot.ifc_username && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>@{pilot.ifc_username}</div>}
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {pilot.total_flights || 0} flights · {pilot.total_hours ? `${Math.floor(pilot.total_hours)}h` : '0h'}
                    {pilot.if_user_id
                      ? <span style={{ marginLeft: '0.5rem', color: '#2e7d32', fontWeight: 600 }}>IF Linked</span>
                      : <span style={{ marginLeft: '0.5rem', color: '#e65100' }}>No IF ID</span>
                    }
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>Unknown pilot</div>
            )}
          </div>

          {/* Edit form */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Edit PIREP</div>

            <div className="pirep-form-grid">
              <div>
                <label style={labelStyle}>Flight Number</label>
                <input style={inputStyle} value={form.flight_number}
                  onChange={e => setForm(f => ({ ...f, flight_number: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" style={inputStyle} value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Departure ICAO</label>
                <input style={inputStyle} value={form.departure_icao} maxLength={4}
                  onChange={e => setForm(f => ({ ...f, departure_icao: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label style={labelStyle}>Arrival ICAO</label>
                <input style={inputStyle} value={form.arrival_icao} maxLength={4}
                  onChange={e => setForm(f => ({ ...f, arrival_icao: e.target.value.toUpperCase() }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Aircraft</label>
                <Dropdown
                  options={[{ value: '', label: 'Select aircraft…' }, ...fleetList.map(ac => ({ value: ac.name, label: ac.name }))]}
                  value={form.aircraft}
                  onChange={v => setForm(f => ({ ...f, aircraft: v }))}
                  placeholder="Select aircraft…"
                />
              </div>
              <div>
                <label style={labelStyle}>Flight Time (hours)</label>
                <input type="number" step="0.01" style={inputStyle} value={form.flight_time}
                  onChange={e => setForm(f => ({ ...f, flight_time: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', paddingBottom: '0.5rem' }}>
                  = {form.flight_time ? fmtHours(parseFloat(form.flight_time) || 0) : '—'}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notes (pilot-submitted)</label>
                <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {pirep.rejection_note && (
              <div style={{ marginTop: '0.875rem', padding: '0.75rem 1rem', background: 'rgba(198,40,40,0.07)', border: '1px solid rgba(198,40,40,0.2)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#c62828', marginBottom: '0.35rem' }}>Rejection Note</div>
                <div style={{ fontSize: '0.875rem' }}>{pirep.rejection_note}</div>
              </div>
            )}

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '0.6rem 1.5rem', background: 'var(--avg-green)', color: 'white',
                border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: '0.875rem', opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <PirepThread flightId={pirep.id} userId={user?.id} emptyText="Message the pilot about this PIREP. They'll see it in their logbook." />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {(pirep.fuel_used_kg != null || pirep.landing_stats) && (() => {
          const MS_TO_FPM = 196.85;
          const landings = pirep.landing_stats
            ? (typeof pirep.landing_stats === 'string' ? JSON.parse(pirep.landing_stats) : pirep.landing_stats)
            : [];
          const gradeColor = { A: '#2e7d32', B: '#558b2f', C: '#f57f17', D: '#e65100', F: '#c62828' };
          const gradeBg    = { A: 'rgba(46,125,50,0.1)', B: 'rgba(85,139,47,0.1)', C: 'rgba(245,127,23,0.1)', D: 'rgba(230,81,0,0.1)', F: 'rgba(198,40,40,0.1)' };
          const getGrade = (vs, g) => {
            let gr = vs <= 100 ? 'A' : vs <= 200 ? 'B' : vs <= 300 ? 'C' : vs <= 500 ? 'D' : 'F';
            if (g > 1.5 && gr !== 'F') gr = String.fromCharCode(gr.charCodeAt(0) + 1);
            return gr;
          };
          return (
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.875rem' }}>
                Flight Data
              </div>
              {/* Fuel */}
              {pirep.fuel_used_kg != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: landings.length ? '0.75rem' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M3 22V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14"/><path d="M3 12h10"/><path d="M19 22v-4"/><path d="M19 14a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2z"/><line x1="13" y1="22" x2="21" y2="22"/></svg>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Fuel used</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{Math.round(pirep.fuel_used_kg).toLocaleString()} kg</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>({Math.round(pirep.fuel_used_kg * 1.25).toLocaleString()} L)</span>
                  </div>
                </div>
              )}
              {/* Landing stats */}
              {landings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {landings.map((l, i) => {
                    const vsFpm = Math.abs(Math.round((l.verticalSpeed || 0) * MS_TO_FPM));
                    const g     = parseFloat((l.maxGForce || 0).toFixed(2));
                    const grade = getGrade(vsFpm, g);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: gradeBg[grade], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontWeight: 900, fontSize: '0.85rem', color: gradeColor[grade] }}>{grade}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Landing {landings.length > 1 ? i + 1 : ''}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                            {vsFpm} fpm · {g}g
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {(autoResult || !pirep.auto_approved) && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Auto-Approve Diagnostic
              </div>
              {pirep.status !== 'rejected' && (
                <button onClick={handleRetryAutoApprove} disabled={retrying} style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                  background: 'var(--avg-green)', color: 'white', border: 'none',
                  cursor: retrying ? 'not-allowed' : 'pointer', opacity: retrying ? 0.7 : 1,
                }}>
                  {retrying ? (
                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Checking...</>
                  ) : (
                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg> Re-run Check</>
                  )}
                </button>
              )}
            </div>
            <AutoApproveChecklist />
          </div>

        )}

        {/* IF Logbook */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
              Infinite Flight Logbook
            </div>
            <button onClick={loadIF} disabled={loadingIF || !pilot?.if_user_id} style={{
              padding: '0.4rem 0.875rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
              background: pilot?.if_user_id ? 'var(--avg-green)' : 'var(--bg-hover)',
              color: pilot?.if_user_id ? 'white' : 'var(--text-secondary)',
              border: 'none', cursor: pilot?.if_user_id && !loadingIF ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}>
              {loadingIF ? (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Fetching...</>
              ) : (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg> {ifFlights ? 'Refresh' : 'Fetch Flights'}</>
              )}
            </button>
          </div>

          {ifError && (
            <div style={{ padding: '0.75rem', background: 'rgba(198,40,40,0.07)', border: '1px solid rgba(198,40,40,0.2)', borderRadius: '6px', fontSize: '0.82rem', color: '#c62828', marginBottom: '0.75rem' }}>
              {ifError}
            </div>
          )}

          {!ifFlights && !ifError && !loadingIF && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, padding: '2rem' }}>
              {pilot?.if_user_id
                ? 'Fetch this pilot\'s recent Infinite Flight flights to cross-check the PIREP.'
                : 'This pilot has no IF user ID linked.'}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {ifFlights?.slice().sort((a, b) => new Date(b.created) - new Date(a.created)).map((f) => {
              const isMatch = matchesIF(f);
              const daysAgo = Math.floor((Date.now() - new Date(f.created)) / (1000 * 60 * 60 * 24));
              const serverLabel = f.server || ['Expert','Casual','Training','Expert','Private'][f.worldType] || 'Expert';
              const serverColor = serverLabel.toLowerCase().includes('expert') ? '#1976d2'
                : serverLabel.toLowerCase().includes('training') ? '#e65100' : '#909090';
              const isSelected = selectedIFFlight?.id === f.id;
              return (
                <div key={f.id}>
                  <div
                    onClick={() => {
                      setSelectedIFFlight(isSelected ? null : f);
                    }}
                    style={{
                      padding: '0.75rem', borderRadius: isSelected ? '8px 8px 0 0' : '8px', marginBottom: isSelected ? 0 : '0.5rem',
                      border: isMatch ? '2px solid #2e7d32' : '1px solid var(--border-color)',
                      background: isMatch ? 'rgba(46,125,50,0.06)' : 'var(--bg-secondary)',
                      position: 'relative', cursor: 'pointer', transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px var(--shadow-hover)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    {isMatch && (
                      <div style={{ position: 'absolute', top: -1, right: '0.75rem', background: '#2e7d32', color: 'white', fontSize: '0.62rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '0 0 5px 5px', textTransform: 'uppercase' }}>
                        ✓ Match
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{f.originAirport || '????'} → {f.destinationAirport || '????'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
                      <span>{fmtMins(f.totalTime)}</span>
                      <span>{f.landingCount} ldg</span>
                      <span style={{ color: serverColor, fontWeight: 600 }}>{serverLabel}</span>
                      {f.callsign && <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-primary)' }}>{f.callsign}</span>}
                      {f.violations?.length > 0 && <span style={{ color: '#c62828', fontWeight: 600 }}>⚠ {f.violations.length} viol.</span>}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isSelected && (
                    <div style={{
                      border: isMatch ? '2px solid #2e7d32' : '1px solid var(--border-color)',
                      borderTop: '1px solid var(--border-color)',
                      borderRadius: '0 0 8px 8px',
                      background: 'var(--bg-card)',
                      padding: '0.875rem 0.75rem',
                      marginBottom: '0.5rem',
                    }}>
                      <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1rem', fontSize: '0.78rem' }}>
                        {[
                          { label: 'Total Time',  value: fmtMins(f.totalTime) },
                          { label: 'Day / Night',  value: `${fmtMins(f.dayTime)} / ${fmtMins(f.nightTime)}` },
                          { label: 'Landings',    value: f.landingCount },
                          { label: 'XP Earned',   value: f.xp?.toLocaleString() ?? '—' },
                          { label: 'Server',       value: serverLabel, color: serverColor },
                          { label: 'Callsign',    value: f.callsign || '—', mono: true },
                          { label: 'Aircraft',    value: getAircraftName(f.aircraftId, f.liveryId) },
                          { label: 'Livery',      value: getLiveryName(f.liveryId) },
                        ].map(({ label, value, color, mono }) => (
                          <div key={label}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
                            <div style={{ fontWeight: 600, color: color || 'var(--text-primary)', fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Violations */}
                      {f.violations?.length > 0 && (
                        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c62828', marginBottom: '0.4rem' }}>
                            Violations ({f.violations.length})
                          </div>
                          {f.violations.map((v, i) => (
                            <div key={i} style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', borderRadius: '5px', background: 'rgba(198,40,40,0.06)', border: '1px solid rgba(198,40,40,0.15)', marginBottom: '0.3rem' }}>
                              <span style={{ fontWeight: 700, color: '#c62828' }}>L{v.level}</span>
                              <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>{v.type}</span>
                              {v.issuedBy?.callsign && <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>· by {v.issuedBy.callsign}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>{/* end right column wrapper */}
      </div>

      {/* Reject modal */}
      {showReject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Reject PIREP</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
              The pilot will see this note when they next log in.
            </p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Flight not found in Infinite Flight logbook, incorrect aircraft type..."
              rows={4} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowReject(false)} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleReject} disabled={processing} style={{ padding: '0.6rem 1.25rem', background: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 700 }}>Reject PIREP</button>
            </div>
          </div>
        </div>
      )}
    
      {showRejectApproved && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRejectApproved(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '460px', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '1rem', color: '#c62828' }}>Reject Approved PIREP</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
              This will reverse the pilot's hours and flight count for this PIREP. The pilot will be notified.
            </p>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem' }}>Reason (shown to pilot)</label>
            <textarea
              value={rejectApprovedNote}
              onChange={e => setRejectApprovedNote(e.target.value)}
              placeholder="Explain why this PIREP is being reversed…"
              rows={3}
              style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRejectApproved(false)} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                Cancel
              </button>
              <button onClick={handleRejectApproved} disabled={processing} style={{ padding: '0.6rem 1.25rem', background: '#c62828', color: 'white', border: 'none', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: processing ? 0.6 : 1 }}>
                {processing ? 'Rejecting…' : 'Confirm Reject & Reverse'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PirepDetail;
