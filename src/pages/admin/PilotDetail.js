/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import ConfirmModal from '../../components/ConfirmModal';
import { useParams, useNavigate } from 'react-router-dom';
import {
  pilots as pilotsApi,
  flights as flightsApi,
  ranks as ranksApi,
  roles as rolesApi,
  fleet as fleetApi,
  infiniteFlight,
} from '../../api/client';
import Dropdown from '../../components/Dropdown';
import IFRoleBadges from '../../components/IFRoleBadges';
import { showToast } from '../../components/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { career as careerApi } from '../../api/client';
import AircraftLabel from '../../components/AircraftLabel';

import { callsign } from '../../brand';

// The fixed parts either side of the number in the VA's callsign format
const [CALLSIGN_PREFIX, CALLSIGN_SUFFIX] = callsign.format('{n}').split('{n}').map(s => s.trim());
const CALLSIGN_DIGITS = String(callsign.max).length;
const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'var(--text-secondary)', marginBottom: '0.35rem',
};

const inputStyle = {
  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px',
  border: '1.5px solid var(--border-color)', background: 'var(--bg-card)',
  color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
};

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.875rem' }}>
    {children}
  </div>
);

function fmtHours(h) {
  const hrs = Math.floor(h); const mins = Math.round((h % 1) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
function fmtMins(mins) {
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}
function daysAgo(dateStr) {
  const d = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d}d ago`;
}

// Stat tile
function StatTile({ label, value, accent }) {
  return (
    <div style={{ padding: '0.875rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// Main component
function PilotDetail({ user: currentUser }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pilot, setPilot]           = useState(null);
  const { can } = usePermissions(currentUser);
  const canEditEmail = can('pilots.edit_email');
  const canViewEmail = can('pilots.view_email') || canEditEmail; // editing implies seeing it
  const [email, setEmail]           = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  useEffect(() => { setEmail(null); setEmailDraft(''); }, [id]);
  const showEmail = async () => {
    setEmailLoading(true);
    try {
      const d = await pilotsApi.email(id);
      setEmail(d.email || '');
      setEmailDraft(d.email || '');
    } catch (err) {
      showToast(err.message || 'Could not load the email address', 'error');
    } finally {
      setEmailLoading(false);
    }
  };
  const emailChanged = email !== null && emailDraft.trim().toLowerCase() !== (email || '').toLowerCase();
  const saveEmail = async () => {
    setEmailSaving(true);
    try {
      const d = await pilotsApi.updateEmail(id, emailDraft.trim());
      setEmail(d.email); setEmailDraft(d.email);
      showToast('Email updated', 'success');
    } catch (err) {
      showToast(err.message || 'Could not update the email address', 'error');
    } finally {
      setEmailSaving(false);
    }
  };
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [ranksList, setRanksList]   = useState([]);
  const [rolesList, setRolesList]   = useState([]);
  const [fleetList, setFleetList]   = useState([]);

  // Recent flights
  const [flights, setFlights]       = useState([]);
  const [flightsLoading, setFlightsLoading] = useState(true);

  // IF stats
  const [ifStats, setIfStats]       = useState(null);
  const [ifLoading, setIfLoading]   = useState(false);
  const [ifError, setIfError]       = useState(null);
  const [avatarError, setAvatarError] = useState(false);

  // Password reset
  const [resetting, setResetting]   = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [confirmResetPw, setConfirmResetPw] = useState(false);
  const [confirmResetCareer, setConfirmResetCareer] = useState(false);

  // Delete flights confirm
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // Notes
  const [notes, setNotes]           = useState([]);
  const [newNote, setNewNote]       = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // PIREP CSV import
  const [careerSaving, setCareerSaving]     = useState(false);
  const [careerHub, setCareerHub]           = useState('');
  const [careerAircraft, setCareerAircraft] = useState('');

  // Edit form
  const [form, setForm] = useState({
    first_name: '', last_name: '', ifc_username: '',
    role: 'pilot', status: 'approved',
    total_flights: 0, total_hours: 0,
    rank: '', staff_role: '', callsign: '',
    live_access: false,
  });
  const [callsignNum, setCallsignNum] = useState('');

  const loadPilot = useCallback(async () => {
    try {
      setLoading(true);
      const data = await pilotsApi.get(id);
      const p = data.pilot;
      setPilot(p);
      // Parse notes
      try {
        const parsed = p.admin_notes ? JSON.parse(p.admin_notes) : [];
        setNotes(Array.isArray(parsed) ? parsed : []);
      } catch { setNotes([]); }
      // Load career status
      careerApi.status && careerApi.status().catch(() => {});
      setCallsignNum(callsign.number(p.callsign) || '');
      setForm({
        first_name:    p.first_name    || '',
        last_name:     p.last_name     || '',
        ifc_username:  p.ifc_username  || '',
        role:          p.role          || 'pilot',
        status:        p.status        || 'approved',
        admin_notes:   p.admin_notes   || '',
        total_flights: p.total_flights || 0,
        total_hours:   p.total_hours   || 0,
        rank:          p.rank          || '',
        staff_role:    p.staff_role    || '',
        live_access:   p.live_access   || false,
      });
    } catch {
      showToast('Failed to load pilot', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadFlights = useCallback(async () => {
    try {
      setFlightsLoading(true);
      const data = await flightsApi.list({ user: id, limit: 25, sort: '-date' });
      setFlights(data.flights || []);
    } catch {
      setFlights([]);
    } finally {
      setFlightsLoading(false);
    }
  }, [id]);

  const loadIFStats = useCallback(async (ifc_username) => {
    if (!ifc_username) return;
    setIfLoading(true); setIfError(null);
    try {
      const data = await infiniteFlight.userStats(ifc_username);
      setIfStats(data.result?.[0] || null);
      if (!data.result?.[0]) setIfError('No IF account found for this IFC username.');
    } catch { setIfError('Failed to fetch Infinite Flight stats.'); }
    finally { setIfLoading(false); }
  }, []);

  useEffect(() => {
    loadPilot();
    loadFlights();
    Promise.all([ranksApi.list(), rolesApi.list(), fleetApi.list()])
      .then(([r, ro, fl]) => {
        setRanksList(r.ranks || []);
        setRolesList(ro.roles || []);
        const flat = (fl.fleet || []).flatMap(g => g.liveries.map(l => ({ id: l.id, name: l.name || `${g.type} - ${l.livery_name}` })));
        setFleetList(flat);
      })
      .catch(() => {});
  }, [loadPilot, loadFlights]);

  // Auto-fetch IF stats once pilot loads
  useEffect(() => {
    if (pilot?.ifc_username) loadIFStats(pilot.ifc_username);
  }, [pilot?.ifc_username, loadIFStats]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const newCallsign = callsignNum.trim() ? callsign.format(callsignNum.trim()) : null;
      await pilotsApi.adminUpdate(id, {
        first_name:    form.first_name,
        last_name:     form.last_name,
        ifc_username:  form.ifc_username,
        role:          form.role,
        status:        form.status,
        total_flights: parseInt(form.total_flights),
        total_hours:   parseFloat(form.total_hours),
        rank:          form.rank || null,
        staff_role:    form.staff_role || '',
        live_access:   form.live_access,
        ...(newCallsign ? { callsign: newCallsign } : {}),
      });
      showToast('Pilot updated!', 'success');
      await loadPilot();
    } catch {
      showToast('Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = () => setConfirmResetPw(true);

  const doResetPassword = async () => {
    try {
      setResetting(true);
      setTempPassword(null);
      const res = await pilotsApi.resetPassword(id);
      setTempPassword(res.temp_password);
    } catch {
      showToast('Failed to reset password', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleDeleteFlights = async () => {
    try {
      setDeleting(true);
      const res = await flightsApi.deleteAllForUser(id);
      showToast(`Deleted ${res.deleted} flight${res.deleted !== 1 ? 's' : ''} and reset stats.`, 'success');
      setConfirmDelete(false);
      await Promise.all([loadPilot(), loadFlights()]);
    } catch {
      showToast('Failed to delete flights', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ color: 'var(--text-secondary)' }}>Loading pilot...</div>
    </div>
  );

  if (!pilot) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ color: 'var(--text-secondary)' }}>Pilot not found.</div>
    </div>
  );

  const avatarUrl = pilot.ifc_username
    ? `https://community.infiniteflight.com/user_avatar/community.infiniteflight.com/${pilot.ifc_username.toLowerCase()}/288/1487666_2.png`
    : null;

  const gradeColor = ifStats?.grade === 5 ? '#c62828' : ifStats?.grade === 4 ? 'var(--avg-gold)' : ifStats?.grade === 3 ? 'var(--avg-green)' : ifStats?.grade === 2 ? '#1976d2' : '#909090';

  const statusColor = pilot.status === 'approved' ? 'var(--avg-green)' : pilot.status === 'archived' ? '#888' : pilot.status === 'rejected' ? '#c62828' : '#e65100';

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const note = {
        text:       newNote.trim(),
        author:     `${currentUser.first_name} ${currentUser.last_name}`,
        author_id:  currentUser.id,
        created_at: new Date().toISOString(),
      };
      const updated = [...notes, note];
      await pilotsApi.adminUpdate(id, { admin_notes: JSON.stringify(updated) });
      setNotes(updated);
      setNewNote('');
      showToast('Note added', 'success');
    } catch { showToast('Failed to add note', 'error'); }
    finally { setAddingNote(false); }
  };

  const handleDeleteNote = async (idx) => {
    const updated = notes.filter((_, i) => i !== idx);
    try {
      await pilotsApi.adminUpdate(id, { admin_notes: JSON.stringify(updated) });
      setNotes(updated);
    } catch { showToast('Failed to delete note', 'error'); }
  };
  const roleColor   = pilot.role === 'admin' ? '#c62828' : pilot.role === 'staff' ? '#1976d2' : pilot.role === 'beta_tester' ? '#7b1fa2' : 'var(--text-secondary)';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .pilot-detail-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.75rem;
          flex-wrap: wrap;
        }
        .pilot-detail-identity {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
          min-width: 0;
        }
        .pilot-detail-quickstats {
          display: flex;
          gap: 0.75rem;
          flex-shrink: 0;
        }
        .pilot-detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          align-items: start;
        }
        .pilot-edit-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.875rem;
          margin-bottom: 0.875rem;
        }
        .pilot-if-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.6rem;
        }
        .pilot-flight-row {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          gap: 0.75rem;
          align-items: center;
          padding: 0.6rem 0.875rem;
          border-radius: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: all 0.15s;
        }

        @media (max-width: 700px) {
          .pilot-detail-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.875rem;
          }
          .pilot-detail-identity {
            width: 100%;
          }
          .pilot-detail-quickstats {
            width: 100%;
            padding: 0.75rem 1rem;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            justify-content: flex-start;
            gap: 1.25rem;
          }
          .pilot-detail-quickstats > div {
            text-align: left !important;
          }
          .pilot-detail-grid {
            grid-template-columns: 1fr;
          }
          .pilot-edit-form-grid {
            grid-template-columns: 1fr;
          }
          .pilot-edit-form-grid > div[style*="1 / -1"] {
            grid-column: 1 !important;
          }
          .pilot-if-stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .pilot-flight-row {
            grid-template-columns: auto 1fr auto;
            gap: 0.6rem;
            padding: 0.65rem 0.75rem;
          }
          .pilot-flight-row .flight-arrow {
            display: none;
          }
          .pilot-flight-row .flight-meta {
            text-align: right;
          }
        }

        @media (max-width: 420px) {
          .pilot-if-stats-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      {/* Header */}
      <div className="pilot-detail-header">
        <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.45rem 0.875rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.15s', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.color = 'var(--avg-green)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>

        <div className="pilot-detail-identity">
          {avatarUrl && !avatarError
            ? <img src={avatarUrl} alt="" onError={() => setAvatarError(true)} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-color)', flexShrink: 0 }} />
            : <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--avg-green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.15rem', flexShrink: 0 }}>{pilot.first_name?.[0]}{pilot.last_name?.[0]}</div>
          }
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pilot.first_name} {pilot.last_name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--avg-gold)', fontWeight: 700 }}>{pilot.callsign}</span>
              {pilot.ifc_username && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>@{pilot.ifc_username}</span>}
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '10px', background: `rgba(0,0,0,0.06)`, color: statusColor, textTransform: 'capitalize' }}>{pilot.status}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '10px', background: `rgba(0,0,0,0.06)`, color: roleColor, textTransform: 'capitalize' }}>{pilot.role}</span>
              {ifStats?.grade && (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '10px', background: `rgba(0,0,0,0.06)`, color: gradeColor }}>IF Grade {ifStats.grade}</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="pilot-detail-quickstats">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '1.3rem', color: 'var(--avg-green)', lineHeight: 1 }}>{pilot.total_flights}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.1rem' }}>Flights</div>
          </div>
          <div style={{ width: 1, background: 'var(--border-color)' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '1.3rem', color: 'var(--avg-green)', lineHeight: 1 }}>{fmtHours(pilot.total_hours || 0)}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.1rem' }}>Hours</div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="pilot-detail-grid">

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Edit form */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: 0 }}>
            <SectionLabel>Edit Profile</SectionLabel>

            <div className="pilot-edit-form-grid">
              <div>
                <label style={labelStyle}>First Name</label>
                <input style={inputStyle} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = 'var(--avg-green)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input style={inputStyle} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = 'var(--avg-green)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} />
              </div>
              <div>
                <label style={labelStyle}>IFC Username</label>
                <input style={inputStyle} value={form.ifc_username} placeholder="Optional"
                  onChange={e => setForm(f => ({ ...f, ifc_username: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = 'var(--avg-green)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} />
              </div>
              {canViewEmail && (
                <div>
                  <label style={labelStyle}>Email</label>
                  {email === null ? (
                    <button type="button" onClick={showEmail} disabled={emailLoading}
                      style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', color: 'var(--avg-green)', fontWeight: 600, opacity: emailLoading ? 0.6 : 1 }}>
                      {emailLoading ? 'Loading…' : 'Show email'}
                    </button>
                  ) : canEditEmail ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="email" style={{ ...inputStyle, flex: 1, minWidth: 0 }} value={emailDraft} placeholder="No email on file"
                        onChange={e => setEmailDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && emailChanged && !emailSaving) { e.preventDefault(); saveEmail(); } }}
                        onFocus={e => e.target.style.borderColor = 'var(--avg-green)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} />
                      {emailChanged && (
                        <button type="button" className="btn btn-primary" onClick={saveEmail} disabled={emailSaving} style={{ flexShrink: 0, opacity: emailSaving ? 0.6 : 1 }}>
                          {emailSaving ? 'Saving…' : 'Save'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <input style={{ ...inputStyle, background: 'var(--bg-secondary)' }} value={email || 'No email on file'} readOnly onFocus={e => e.target.select()} />
                  )}
                </div>
              )}
              <div>
                <label style={labelStyle}>Callsign</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                  {CALLSIGN_PREFIX && <span style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color)', flexShrink: 0 }}>
                    {CALLSIGN_PREFIX}
                  </span>}
                  <input
                    type="text"
                    value={callsignNum}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, CALLSIGN_DIGITS);
                      setCallsignNum(v);
                    }}
                    placeholder={String(callsign.min)}
                    maxLength={CALLSIGN_DIGITS}
                    style={{ ...inputStyle, border: 'none', borderRadius: 0, flex: 1, minWidth: 0, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', outline: 'none', boxShadow: 'none' }}
                    onFocus={e => e.target.closest('div').style.borderColor = 'var(--avg-green)'}
                    onBlur={e => e.target.closest('div').style.borderColor = 'var(--border-color)'}
                  />
                  {CALLSIGN_SUFFIX && <span style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', borderLeft: '1px solid var(--border-color)', flexShrink: 0 }}>
                    {CALLSIGN_SUFFIX}
                  </span>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <Dropdown value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))}
                  options={[{ value: 'pilot', label: 'Pilot' }, { value: 'beta_tester', label: 'Beta Tester' }, { value: 'staff', label: 'Staff' }, { value: 'admin', label: 'Admin' }]} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <Dropdown value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))}
                  options={[{ value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }, { value: 'rejected', label: 'Rejected' }, { value: 'archived', label: 'Archived' }]} />
                {form.status === 'archived' && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                    Archived pilots cannot log in but their data is preserved.
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Total Flights</label>
                <input type="number" min="0" style={inputStyle} value={form.total_flights}
                  onChange={e => setForm(f => ({ ...f, total_flights: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = 'var(--avg-green)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} />
              </div>
              <div>
                <label style={labelStyle}>Total Hours</label>
                <input type="number" min="0" step="0.1" style={inputStyle} value={form.total_hours}
                  onChange={e => setForm(f => ({ ...f, total_hours: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = 'var(--avg-green)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} />
              </div>
              <div>
                <label style={labelStyle}>Rank Override</label>
                <Dropdown value={form.rank || ''} onChange={v => setForm(f => ({ ...f, rank: v }))} placeholder="— Auto (by hours) —"
                  options={[{ value: '', label: '— Auto (by hours) —' }, ...ranksList.map(r => ({ value: r.id, label: `${r.name} (${r.hours_required}h)` }))]} />
              </div>
              <div>
                <label style={labelStyle}>Staff Role</label>
                <Dropdown value={form.staff_role || ''} onChange={v => setForm(f => ({ ...f, staff_role: v }))} placeholder="— None —"
                  options={[{ value: '', label: '— None —' }, ...rolesList.map(r => ({ value: r.id, label: r.name }))]} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!form.live_access}
                    onChange={e => setForm(f => ({ ...f, live_access: e.target.checked }))}
                    style={{ marginTop: '0.2rem', width: '1rem', height: '1rem', accentColor: 'var(--avg-green)', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>Live Mode Access</span>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      Grants access to the Live Mode page (/if-live) + assigns role on discord
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary"
                style={{ padding: '0.6rem 1.5rem', fontSize: '0.875rem', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Account actions */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: 0 }}>
            <SectionLabel>Account Actions</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button onClick={handleResetPassword} disabled={resetting}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: 'transparent', color: '#1976d2', border: '1.5px solid #1976d2', borderRadius: '6px', cursor: resetting ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: resetting ? 0.6 : 1, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(25,118,210,0.07)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                {resetting ? 'Resetting…' : 'Reset Password'}
              </button>

              {tempPassword && (
                <div style={{ padding: '0.875rem 1rem', background: 'rgba(25,118,210,0.06)', border: '1.5px solid rgba(25,118,210,0.2)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1976d2', marginBottom: '0.4rem' }}>
                    Temporary Password
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <code style={{ flex: 1, fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {tempPassword}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(tempPassword); showToast('Copied!', 'success'); }}
                      style={{ padding: '0.35rem 0.7rem', background: '#1976d2', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      Copy
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Give this to {pilot.first_name} — they'll be prompted to change it on next login.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Admin Notes */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Admin Notes</div>

            {/* Existing notes */}
            {notes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1rem' }}>
                {notes.map((n, i) => (
                  <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.55, margin: 0, flex: 1 }}>{n.text}</p>
                      <button onClick={() => handleDeleteNote(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: 0.6 }}>×</button>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                      {n.author} · {n.created_at ? new Date(n.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>No notes yet.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <textarea
                rows={2}
                placeholder="Add an internal note…"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--avg-green)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !newNote.trim()}
                style={{ alignSelf: 'flex-end', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: newNote.trim() ? 'var(--avg-green)' : 'var(--border-color)', color: newNote.trim() ? 'white' : 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, cursor: newNote.trim() ? 'pointer' : 'default', fontFamily: 'inherit', transition: 'background 0.15s' }}
              >
                {addingNote ? 'Adding…' : 'Add Note'}
              </button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: 0, borderColor: 'rgba(198,40,40,0.2)' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c62828', marginBottom: '0.875rem' }}>Danger Zone</div>

            {confirmDelete ? (
              <div style={{ background: 'rgba(198,40,40,0.05)', border: '1.5px solid rgba(198,40,40,0.2)', borderRadius: '8px', padding: '1rem 1.25rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#c62828' }}>
                  Delete all flights for {pilot.first_name} {pilot.last_name}?
                </p>
                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  This will permanently delete all their PIREPs and reset their flight count and hours to zero. This cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button onClick={handleDeleteFlights} disabled={deleting}
                    style={{ padding: '0.5rem 1.25rem', background: '#c62828', color: 'white', border: 'none', borderRadius: '6px', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: deleting ? 0.7 : 1 }}>
                    {deleting ? 'Deleting…' : 'Yes, delete all flights'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    style={{ padding: '0.5rem 1.25rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: 'transparent', color: '#c62828', border: '1.5px solid rgba(198,40,40,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(198,40,40,0.05)'; e.currentTarget.style.borderColor = '#c62828'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(198,40,40,0.3)'; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                Delete All Flights &amp; Reset Stats
              </button>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* IF Stats */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <SectionLabel>Infinite Flight</SectionLabel>
              {pilot.ifc_username && (
                <button onClick={() => loadIFStats(pilot.ifc_username)} disabled={ifLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.7rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: ifLoading ? 'not-allowed' : 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.color = 'var(--avg-green)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={ifLoading ? { animation: 'spin 1s linear infinite' } : {}}>
                    {ifLoading
                      ? <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      : <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></>}
                  </svg>
                  Refresh
                </button>
              )}
            </div>

            {!pilot.ifc_username && (
              <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No IFC username linked — IF stats unavailable.
              </div>
            )}

            {ifLoading && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Fetching stats…</div>
            )}

            {ifError && !ifLoading && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(198,40,40,0.06)', border: '1px solid rgba(198,40,40,0.15)', borderRadius: '8px', fontSize: '0.84rem', color: '#c62828' }}>{ifError}</div>
            )}

            {ifStats && !ifLoading && (
              <>
                <div className="pilot-if-stats-grid">
                  {[
                    { label: 'Grade',      value: `Grade ${ifStats.grade}`,                          accent: gradeColor },
                    { label: 'Flight Time', value: fmtMins(ifStats.flightTime) },
                    { label: 'Flights',    value: (ifStats.onlineFlights ?? 0).toLocaleString() },
                    { label: 'XP',         value: (ifStats.xp ?? 0).toLocaleString() },
                    { label: 'Landings',   value: (ifStats.landingCount ?? 0).toLocaleString() },
                    { label: 'Violations', value: String(ifStats.violations ?? 0) },
                  ].map(s => <StatTile key={s.label} {...s} />)}
                </div>
                {ifStats?.roles?.length > 0 && (
                  <div style={{ marginTop: '0.875rem' }}>
                    <IFRoleBadges roles={ifStats.roles} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Recent flights */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <SectionLabel>Recent Flights</SectionLabel>
              {flights.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Last {flights.length}</span>
              )}
            </div>

            {flightsLoading && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading flights…</div>
            )}

            {!flightsLoading && flights.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>No flights yet.</div>
            )}

            {!flightsLoading && flights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 340, overflowY: 'auto' }}>
                {flights.map(f => {
                  const statusColor = f.status === 'approved' ? 'var(--avg-green)' : f.status === 'rejected' ? '#c62828' : '#e65100';
                  return (
                    <div key={f.id}
                      onClick={() => navigate(`/admin/pirep/${f.id}`)}
                      className="pilot-flight-row"
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.background = 'var(--avg-green-pale)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{f.flight_number} · {f.departure_icao} → {f.arrival_icao}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}><AircraftLabel flight={f} inline empty="" /></div>
                      </div>
                      <div className="flight-meta" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <div>{fmtHours(f.flight_time || 0)}</div>
                        <div style={{ fontSize: '0.68rem', marginTop: '0.1rem' }}>{daysAgo(f.date)}</div>
                      </div>
                      <svg className="flight-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        {/* Career Mode section */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: 0 }}>
            <SectionLabel>Career Mode</SectionLabel>
            {pilot.career_active ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {[
                    { label: 'Aircraft',  value: pilot.career_aircraft || '—' },
                    { label: 'Home Hub',  value: pilot.career_hub || '—' },
                    { label: 'Current Position', value: pilot.career_current_icao || '—' },
                    { label: 'Career Flights', value: pilot.career_total_flights || 0 },
                    { label: 'Career Hours', value: pilot.career_total_hours ? `${Math.floor(pilot.career_total_hours)}h ${Math.round((pilot.career_total_hours % 1) * 60)}m` : '0h' },
                    { label: 'Started', value: pilot.career_started_at ? new Date(pilot.career_started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{label}</div>
                      <div style={{ fontWeight: 700, fontFamily: typeof value === 'string' && value.length <= 6 ? 'monospace' : undefined }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Admin override */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Admin Override</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <Dropdown
                      value={careerAircraft}
                      onChange={v => setCareerAircraft(v)}
                      placeholder="Keep current aircraft"
                      options={[{ value: '', label: 'Keep current aircraft' }, ...fleetList.map(ac => ({ value: ac.name, label: ac.name }))]}
                    />
                    <select value={careerHub} onChange={e => setCareerHub(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      <option value="">Keep current hub</option>
                      {['YSSY','YMML','YBBN','YPPH','YPAD'].map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <button disabled={careerSaving || (!careerAircraft && !careerHub)} onClick={async () => {
                      try {
                        setCareerSaving(true);
                        await careerApi.adminUpdate(id, { aircraft: careerAircraft || undefined, hub: careerHub || undefined });
                        showToast('Career settings updated', 'success');
                        setCareerAircraft(''); setCareerHub('');
                        // Reload pilot
                        const { pilots } = await import('../../api/client');
                        const p = await pilots.get(id);
                        setPilot(p.pilot || p);
                      } catch (err) { showToast(err.message, 'error'); }
                      finally { setCareerSaving(false); }
                    }} className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.5rem 1rem', opacity: (!careerAircraft && !careerHub) ? 0.4 : 1 }}>
                      {careerSaving ? 'Saving…' : 'Update'}
                    </button>
                  </div>
                  <button onClick={() => setConfirmResetCareer(true)} style={{ background: 'none', border: '1px solid #c62828', borderRadius: '6px', padding: '0.4rem 0.875rem', cursor: 'pointer', fontSize: '0.8rem', color: '#c62828', fontFamily: 'inherit' }}>
                    Reset Career Mode
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', padding: '0.5rem 0' }}>
                This pilot has not enrolled in Career Mode.
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmResetPw && (
        <ConfirmModal
          title={`Reset password for ${pilot?.first_name} ${pilot?.last_name}?`}
          message="They will receive a temporary password and be prompted to change it on next login."
          confirmLabel="Reset Password"
          danger
          onConfirm={doResetPassword}
          onClose={() => setConfirmResetPw(false)}
        />
      )}
      {confirmResetCareer && (
        <ConfirmModal
          title="Reset career mode?"
          message="This pilot's career stats will be wiped and they will be unenrolled from career mode. This cannot be undone."
          confirmLabel="Reset Career"
          danger
          onConfirm={async () => {
            try {
              setCareerSaving(true);
              await careerApi.adminUpdate(id, { reset: true });
              showToast('Career mode reset', 'success');
              const { pilots } = await import('../../api/client');
              const p = await pilots.get(id);
              setPilot(p.pilot || p);
            } catch (err) { showToast(err.message, 'error'); }
            finally { setCareerSaving(false); }
          }}
          onClose={() => setConfirmResetCareer(false)}
        />
      )}
    </div>
  );
}

export default PilotDetail;
