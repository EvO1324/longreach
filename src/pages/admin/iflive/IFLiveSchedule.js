/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { ifLive } from '../../../api/client';
import { showToast } from '../../../components/Toast';
import ConfirmModal from '../../../components/ConfirmModal';
import { useIFLive } from './IFLiveContext';
import {
  RefreshCw, ChevronRight, ChevronLeft, Plus, Trash2, Pencil,
  Radar, X, CalendarDays, Info, PlaneTakeoff, ArrowRight, AlertTriangle,
} from 'lucide-react';

const SCHEDULE_STATUS = {
  0: 'Unknown', 1: 'Scheduled', 4: 'Taxiing to runway',
  6: 'In flight', 7: 'Diverted', 8: 'Delayed', 9: 'Cancelled', 10: 'Taxiing to parking', 11: 'Arrived',
};
const FLIGHT_TYPE = {
  0: 'None', 1: 'Commercial', 2: 'Charter', 3: 'Cargo', 4: 'Training', 5: 'Test flight',
  6: 'Medical emergency', 7: 'Military', 8: 'VIP / Executive', 9: 'Humanitarian relief',
  10: 'General aviation', 11: 'Airshow', 12: 'Other',
};
const AC_STATE = { 0: 'Unknown', 1: 'On ground', 2: 'In flight', 3: 'Cancelled', 4: 'Stopped', 5: 'Maintenance' };
const STATUS_COLOR = {
  1: '#8a8578', 2: 'var(--brand-accent)', 3: 'var(--brand-accent)', 4: 'var(--brand-accent)',
  6: 'var(--brand-primary)', 7: '#c62828', 8: '#c62828', 9: '#c62828', 10: 'var(--brand-primary)', 11: 'var(--brand-primary)',
};

const emptyScheduleForm = {
  aircraftId: '', callsign: '', flightType: 1, originIcao: '', destinationIcao: '',
  scheduledDepartureUtc: '', scheduledArrivalUtc: '', briefing: '', flightPlan: '',
};

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}
function dateKeyUTC(d) {
  return d.toISOString().slice(0, 10);
}
function shiftDate(d, deltaDays) {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function IFLiveSchedule() {
  const { orgId, typeNames } = useIFLive();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [columns, setColumns] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);

  const [scheduleForm, setScheduleForm] = useState(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [expandedPosition, setExpandedPosition] = useState(null);
  const [positionData, setPositionData] = useState({});
  const [positionLoading, setPositionLoading] = useState(null);

  useEffect(() => {
    if (orgId) loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, currentDate]);

  const loadBoard = async () => {
    if (!orgId) return;
    setBoardLoading(true);
    try {
      const d = await ifLive.daySchedule(orgId, dateKeyUTC(currentDate));
      setColumns(d.columns || []);
    } catch (err) {
      showToast(err.message || 'Failed to load the ops board', 'error');
    } finally {
      setBoardLoading(false);
    }
  };

  const togglePosition = async (aircraftId) => {
    if (expandedPosition === aircraftId) { setExpandedPosition(null); return; }
    setExpandedPosition(aircraftId);
    if (!positionData[aircraftId]) {
      setPositionLoading(aircraftId);
      try {
        const d = await ifLive.position(aircraftId);
        setPositionData(p => ({ ...p, [aircraftId]: d.position }));
      } catch (err) {
        showToast(err.message || 'Failed to fetch live position', 'error');
      } finally {
        setPositionLoading(null);
      }
    }
  };

  const openCreateForm = () => setScheduleForm({ ...emptyScheduleForm, _mode: 'create' });
  const openEditForm = (s, aircraftId) => setScheduleForm({
    _mode: 'edit', _id: s.id, aircraftId, _originalAircraftId: aircraftId,
    callsign: s.callsign, flightType: s.flightType,
    originIcao: s.originIcao, destinationIcao: s.destinationIcao,
    scheduledDepartureUtc: toLocalInput(s.scheduledDepartureUtc),
    scheduledArrivalUtc: toLocalInput(s.scheduledArrivalUtc),
    briefing: s.briefing || '', flightPlan: s.flightPlan || '',
  });

  const saveScheduleForm = async () => {
    const f = scheduleForm;
    if (!f.aircraftId) return showToast('Choose an aircraft', 'error');
    if (!f.callsign.trim()) return showToast('Callsign is required', 'error');
    if (!f.originIcao.trim() || !f.destinationIcao.trim()) return showToast('Origin and destination are required', 'error');
    if (!f.scheduledDepartureUtc || !f.scheduledArrivalUtc) return showToast('Departure and arrival times are required', 'error');
    if (new Date(f.scheduledArrivalUtc) <= new Date(f.scheduledDepartureUtc)) return showToast('Arrival must be after departure', 'error');

    const body = {
      callsign: f.callsign.trim().slice(0, 32),
      flightType: Number(f.flightType),
      originIcao: f.originIcao.trim().toUpperCase(),
      destinationIcao: f.destinationIcao.trim().toUpperCase(),
      scheduledDepartureUtc: toIso(f.scheduledDepartureUtc),
      scheduledArrivalUtc: toIso(f.scheduledArrivalUtc),
      briefing: f.briefing?.trim() || null,
      flightPlan: f.flightPlan?.trim() || null,
    };

    setSavingSchedule(true);
    try {
      if (f._mode === 'create') {
        await ifLive.createSchedule(f.aircraftId, body);
        showToast('Flight scheduled', 'success');
      } else if (f.aircraftId !== f._originalAircraftId) {
        await ifLive.createSchedule(f.aircraftId, body);
        await ifLive.deleteSchedule(f._id);
        showToast('Flight moved to the new aircraft', 'success');
      } else {
        await ifLive.updateSchedule(f._id, body);
        showToast('Flight updated', 'success');
      }
      setScheduleForm(null);
      await loadBoard();
    } catch (err) {
      showToast(err.message || 'Failed to save flight', 'error');
    } finally {
      setSavingSchedule(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await ifLive.deleteSchedule(deleteTarget.id);
      showToast('Flight removed', 'success');
      setDeleteTarget(null);
      await loadBoard();
    } catch (err) {
      showToast(err.message || 'Failed to delete flight', 'error');
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.55rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '7px',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
  const iconBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
    background: 'var(--bg-hover)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)',
  };

  const isToday = dateKeyUTC(currentDate) === dateKeyUTC(new Date());

  // Flatten the per-aircraft columns into one chronological list for the board.
  const flights = (columns || [])
    .flatMap(col => (col.schedules || []).map(s => ({ ...s, aircraft: col.aircraft })))
    .sort((a, b) => new Date(a.scheduledDepartureUtc) - new Date(b.scheduledDepartureUtc));
  const erroredAircraft = (columns || []).filter(c => c.error);

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem',
        flexWrap: 'wrap', gap: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 14, padding: '0.75rem 1rem', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button onClick={() => setCurrentDate(d => shiftDate(d, -1))} style={iconBtnStyle}><ChevronLeft size={15} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.9rem', minWidth: 200, justifyContent: 'center' }}>
            <CalendarDays size={14} color="var(--avg-green)" />
            {currentDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.72rem' }}>UTC</span>
          </div>
          <button onClick={() => setCurrentDate(d => shiftDate(d, 1))} style={iconBtnStyle}><ChevronRight size={15} /></button>
          {!isToday && <button onClick={() => setCurrentDate(new Date())} className="btn btn-secondary" style={{ fontSize: '0.76rem', marginLeft: '0.3rem' }}>Today</button>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={openCreateForm} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700 }}>
            <Plus size={13} /> Add flight
          </button>
          <button onClick={loadBoard} style={iconBtnStyle}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {erroredAircraft.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.78rem', color: '#c62828',
          background: 'rgba(198,40,40,0.08)', border: '1px solid rgba(198,40,40,0.25)', borderRadius: 10,
          padding: '0.6rem 0.8rem', marginBottom: '1rem',
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Couldn't load schedules for {erroredAircraft.map(c => c.aircraft.registration).join(', ')}.</span>
        </div>
      )}

      {boardLoading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading ops board…</div>
      ) : (columns || []).length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: 14,
          padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem',
        }}>
          <PlaneTakeoff size={26} color="var(--text-secondary)" style={{ marginBottom: '0.6rem' }} />
          <div>No aircraft found in this organization.</div>
        </div>
      ) : flights.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: 14,
          padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem',
        }}>
          <CalendarDays size={26} color="var(--text-secondary)" style={{ marginBottom: '0.6rem' }} />
          <div>No flights scheduled for this day.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {flights.map(s => {
            const acId = s.aircraft.id;
            const isExpanded = expandedPosition === acId;
            const pos = positionData[acId];
            const color = s.pirepFiled ? 'var(--brand-primary)' : (STATUS_COLOR[s.status] || 'var(--border-color)');
            const statusLabel = s.pirepFiled ? 'Completed' : (SCHEDULE_STATUS[s.status] || 'Unknown');
            const typeName = typeNames[s.aircraft.aircraftId];
            return (
              <div key={s.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: `4px solid ${color}`,
                borderRadius: 12, padding: '0.9rem 1.1rem', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    {/* Time */}
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, minWidth: 110, color: 'var(--text-primary)' }}>
                      {fmtTime(s.scheduledDepartureUtc)}–{fmtTime(s.scheduledArrivalUtc)}
                    </div>

                    {/* Flight */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.9rem' }}>
                        {s.callsign}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.82rem', fontFamily: 'monospace' }}>
                          {s.originIcao} <ArrowRight size={11} /> {s.destinationIcao}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {s.aircraft.registration}{typeName ? ` · ${typeName}` : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '999px',
                      background: `${color}22`, color, textTransform: 'uppercase', letterSpacing: '0.03em',
                    }}>
                      {statusLabel}
                    </span>
                    <button onClick={() => togglePosition(acId)} title="Live position" style={iconBtnStyle}><Radar size={13} /></button>
                    <button onClick={() => openEditForm(s, acId)} title="Edit" style={iconBtnStyle}><Pencil size={13} /></button>
                    <button onClick={() => setDeleteTarget({ id: s.id, callsign: s.callsign, originIcao: s.originIcao, destinationIcao: s.destinationIcao })} title="Delete" style={{ ...iconBtnStyle, color: '#c62828' }}><Trash2 size={13} /></button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                    {positionLoading === acId ? (
                      <span style={{ color: 'var(--text-secondary)' }}>Fetching…</span>
                    ) : pos ? (
                      <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
                        <span><strong style={{ color: 'var(--text-primary)' }}>{AC_STATE[pos.state] || '—'}</strong></span>
                        <span>{Math.round(pos.altitude).toLocaleString()} ft</span>
                        <span>{Math.round(pos.speed)} kts</span>
                        <span>{Math.round(pos.heading)}°</span>
                        <span>Last pilot: {pos.lastPilotUsername || '—'}</span>
                        <span>Updated {new Date(pos.updatedAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>No position data.</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)',
        marginTop: '0.85rem', background: 'var(--bg-hover)', borderRadius: 10, padding: '0.6rem 0.8rem',
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Click the pencil to edit a flight's details, times, or move it to a different aircraft.</span>
      </div>

      {scheduleForm && (
        <div onClick={() => !savingSchedule && setScheduleForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: '1.75rem', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--avg-green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlaneTakeoff size={15} color="var(--avg-green)" />
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>{scheduleForm._mode === 'create' ? 'Add flight' : 'Edit flight'}</div>
              </div>
              <button onClick={() => setScheduleForm(null)} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={labelStyle}>Aircraft</label>
              <select value={scheduleForm.aircraftId} onChange={e => setScheduleForm(f => ({ ...f, aircraftId: e.target.value }))} style={inputStyle}>
                <option value="">Select aircraft…</option>
                {(columns || []).map(c => <option key={c.aircraft.id} value={c.aircraft.id}>{c.aircraft.registration}</option>)}
              </select>
              {scheduleForm._mode === 'edit' && scheduleForm.aircraftId !== scheduleForm._originalAircraftId && (
                <div style={{ fontSize: '0.72rem', color: 'var(--avg-gold-dark)', marginTop: '0.35rem' }}>
                  Saving will move this flight to the new aircraft (new ID, status resets to Scheduled).
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Callsign</label>
                <input value={scheduleForm.callsign} onChange={e => setScheduleForm(f => ({ ...f, callsign: e.target.value }))} maxLength={32} style={inputStyle} placeholder="PJX421" />
              </div>
              <div>
                <label style={labelStyle}>Flight type</label>
                <select value={scheduleForm.flightType} onChange={e => setScheduleForm(f => ({ ...f, flightType: e.target.value }))} style={inputStyle}>
                  {Object.entries(FLIGHT_TYPE).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Origin ICAO</label>
                <input value={scheduleForm.originIcao} onChange={e => setScheduleForm(f => ({ ...f, originIcao: e.target.value.toUpperCase() }))} maxLength={8} style={{ ...inputStyle, fontFamily: 'monospace' }} placeholder="KLAX" />
              </div>
              <div>
                <label style={labelStyle}>Destination ICAO</label>
                <input value={scheduleForm.destinationIcao} onChange={e => setScheduleForm(f => ({ ...f, destinationIcao: e.target.value.toUpperCase() }))} maxLength={8} style={{ ...inputStyle, fontFamily: 'monospace' }} placeholder="KJFK" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Departure (UTC)</label>
                <input type="datetime-local" value={scheduleForm.scheduledDepartureUtc} onChange={e => setScheduleForm(f => ({ ...f, scheduledDepartureUtc: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Arrival (UTC)</label>
                <input type="datetime-local" value={scheduleForm.scheduledArrivalUtc} onChange={e => setScheduleForm(f => ({ ...f, scheduledArrivalUtc: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={labelStyle}>Briefing <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
              <textarea value={scheduleForm.briefing} onChange={e => setScheduleForm(f => ({ ...f, briefing: e.target.value }))} maxLength={4000} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Flight plan <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
              <textarea value={scheduleForm.flightPlan} onChange={e => setScheduleForm(f => ({ ...f, flightPlan: e.target.value }))} maxLength={16000} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }} placeholder="KLAX DCT KJFK" />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {scheduleForm._mode === 'edit' && (
                <button onClick={() => { setDeleteTarget({ id: scheduleForm._id, callsign: scheduleForm.callsign, originIcao: scheduleForm.originIcao, destinationIcao: scheduleForm.destinationIcao }); setScheduleForm(null); }}
                  className="btn btn-secondary" style={{ color: '#c62828', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Trash2 size={13} />
                </button>
              )}
              <button onClick={() => setScheduleForm(null)} disabled={savingSchedule} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={saveScheduleForm} disabled={savingSchedule} className="btn btn-primary" style={{ flex: 1, opacity: savingSchedule ? 0.6 : 1 }}>
                {savingSchedule ? 'Saving…' : scheduleForm._mode === 'create' ? 'Create' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete flight?"
          message={`This permanently deletes the ${deleteTarget.callsign} schedule (${deleteTarget.originIcao} → ${deleteTarget.destinationIcao}) from Infinite Flight Live. This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default IFLiveSchedule;
