/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { ifLive, ifLiveBids, ifLiveStats, routes as routesApi } from '../../../api/client';
import { showToast } from '../../../components/Toast';
import ConfirmModal from '../../../components/ConfirmModal';
import { useIFLive } from './IFLiveContext';
import {
  Plane, RefreshCw, X, Gavel, Plus, Trash2,
  CalendarClock, Lock, CheckCircle2, Clock, Ban, TrendingUp, Clock3, ClipboardCheck, PenLine,
} from 'lucide-react';

const STATUS_META = {
  pending:   { label: 'Pending review', icon: Clock, color: 'var(--avg-gold-dark)', bg: 'var(--avg-gold-pale)' },
  active:    { label: 'Confirmed',       icon: CheckCircle2, color: 'var(--avg-green)', bg: 'var(--avg-green-pale)' },
  denied:    { label: 'Denied',          icon: Ban, color: '#c62828', bg: 'rgba(198,40,40,0.08)' },
  completed: { label: 'All legs logged', icon: ClipboardCheck, color: 'var(--avg-green)', bg: 'var(--avg-green-pale)' },
};

const emptyLeg = { routeId: '', flightNumber: '', originIcao: '', destIcao: '', departureUtc: '', arrivalUtc: '' };

function toIso(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

function IFLiveBidding({ user }) {
  const { primaryOrg } = useIFLive();

  const [aircraft, setAircraft] = useState(null);
  const [bids, setBids] = useState(null);
  const [myBids, setMyBids] = useState(null); // this pilot's full history (pending/active/denied)
  const [routeOptions, setRouteOptions] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const [bidTarget, setBidTarget] = useState(null); // aircraft object being bid on
  const [leg1, setLeg1] = useState(emptyLeg);
  const [includeReturn, setIncludeReturn] = useState(false);
  const [leg2, setLeg2] = useState(emptyLeg);
  const [submitting, setSubmitting] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);

  const [pirepTarget, setPirepTarget] = useState(null); // { bid, legIndex }
  const [pirepNotes, setPirepNotes] = useState('');
  const [filingPirep, setFilingPirep] = useState(false);
  const [pirepError, setPirepError] = useState(null);

  useEffect(() => {
    if (primaryOrg) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryOrg?.id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [acRes, bidsRes, mineRes, routesRes] = await Promise.all([
        ifLive.aircraftList(primaryOrg.id),
        ifLiveBids.list(primaryOrg.id),
        ifLiveBids.mine(),
        routesApi.list({ fields: 'id,flight_number,departure_icao,arrival_icao' }).catch(() => ({ routes: [] })),
      ]);
      setAircraft(acRes.aircraft || []);
      setBids(bidsRes.bids || []);
      setMyBids((mineRes.bids || []).filter(b => b.status !== 'cancelled'));
      setRouteOptions(routesRes.routes || []);
    } catch (err) {
      showToast(err.message || 'Failed to load the bid board', 'error');
    } finally {
      setLoading(false);
    }
    ifLiveStats.mine().then(setMyStats).catch(() => {});
  };

  const bidsForAircraft = (acId) => (bids || []).filter(b => b.aircraftId === acId);

  const openBidModal = (ac) => {
    setBidTarget(ac);
    setLeg1(emptyLeg);
    setLeg2(emptyLeg);
    setIncludeReturn(false);
  };
  const closeBidModal = () => setBidTarget(null);

  const applyRouteToLeg = (setLeg, routeId) => {
    const r = routeOptions.find(x => x.id === routeId);
    if (!r) { setLeg(l => ({ ...l, routeId: '' })); return; }
    setLeg(l => ({ ...l, routeId, flightNumber: r.flight_number || l.flightNumber, originIcao: r.departure_icao || '', destIcao: r.arrival_icao || '' }));
  };

  const validateLeg = (leg) => {
    if (!leg.flightNumber.trim()) return 'Flight number is required';
    if (!leg.originIcao.trim() || !leg.destIcao.trim()) return 'Origin and destination are required';
    if (!leg.departureUtc || !leg.arrivalUtc) return 'Departure and arrival times are required';
    if (new Date(leg.arrivalUtc) <= new Date(leg.departureUtc)) return "Arrival must be after departure";
    return null;
  };

  const submitBid = async () => {
    const err1 = validateLeg(leg1);
    if (err1) return showToast(`Outbound leg: ${err1}`, 'error');
    if (includeReturn) {
      const err2 = validateLeg(leg2);
      if (err2) return showToast(`Return leg: ${err2}`, 'error');
    }

    const legs = [
      { flightNumber: leg1.flightNumber.trim().slice(0, 32), originIcao: leg1.originIcao.trim().toUpperCase(), destIcao: leg1.destIcao.trim().toUpperCase(), departureUtc: toIso(leg1.departureUtc), arrivalUtc: toIso(leg1.arrivalUtc) },
    ];
    if (includeReturn) {
      legs.push({ flightNumber: leg2.flightNumber.trim().slice(0, 32), originIcao: leg2.originIcao.trim().toUpperCase(), destIcao: leg2.destIcao.trim().toUpperCase(), departureUtc: toIso(leg2.departureUtc), arrivalUtc: toIso(leg2.arrivalUtc) });
    }

    setSubmitting(true);
    try {
      await ifLiveBids.create({
        organizationId: primaryOrg.id,
        aircraftId: bidTarget.id,
        aircraftRegistration: bidTarget.registration,
        legs,
      });
      showToast(`Bid submitted for ${bidTarget.registration} — waiting on staff approval`, 'success');
      closeBidModal();
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to place bid', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openPirepModal = (bid, legIndex) => {
    setPirepTarget({ bid, legIndex });
    setPirepNotes('');
    setPirepError(null);
  };
  const closePirepModal = () => setPirepTarget(null);

  const submitPirep = async () => {
    setFilingPirep(true);
    setPirepError(null);
    try {
      await ifLiveBids.filePirep(pirepTarget.bid.id, pirepTarget.legIndex, { notes: pirepNotes });
      showToast('Verified against your Infinite Flight logbook — PIREP auto-approved', 'success');
      closePirepModal();
      await loadAll();
    } catch (err) {
      setPirepError(err.message || 'Failed to file PIREP');
    } finally {
      setFilingPirep(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await ifLiveBids.cancel(cancelTarget.id);
      showToast('Bid cancelled', 'success');
      setCancelTarget(null);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to cancel bid', 'error');
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.55rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: '7px',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', maxWidth: 620 }}>
          <Gavel size={16} color="var(--avg-green)" style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
            Bid on an aircraft to request it for an outbound leg — and, if you want, a return leg too. Submitting sends it to staff for approval; nothing goes into Infinite Flight Live until they confirm it.
          </p>
        </div>
        <button onClick={loadAll} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', flexShrink: 0 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {myStats && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div style={{
            flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: '0.75rem',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '0.9rem 1.1rem',
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--avg-green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TrendingUp size={17} color="var(--avg-green)" />
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.1 }}>{myStats.flights}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Live flights flown &amp; logged</div>
            </div>
          </div>
          <div style={{
            flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: '0.75rem',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '0.9rem 1.1rem',
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--avg-gold-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock3 size={17} color="var(--avg-gold-dark)" />
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.1 }}>{myStats.hours}h</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Hours flown on Live</div>
            </div>
          </div>
        </div>
      )}

      {myBids && myBids.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Your bids
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {myBids.map(bid => {
              const meta = STATUS_META[bid.status] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              return (
                <div key={bid.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem',
                  background: meta.bg, border: `1px solid ${meta.color}`, borderRadius: 12, padding: '0.75rem 1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                    <StatusIcon size={16} color={meta.color} style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.87rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {bid.aircraftRegistration}
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{meta.label}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {(bid.legs || []).map((l) => `${l.flightNumber} ${l.originIcao}→${l.destIcao}`).join('  ·  ')}
                      </div>
                      {bid.status === 'denied' && bid.reviewNote && (
                        <div style={{ fontSize: '0.74rem', color: '#c62828', marginTop: 2 }}>“{bid.reviewNote}”</div>
                      )}
                    </div>
                  </div>
                  {(bid.status === 'denied' || bid.status === 'completed') ? null : (
                    <button onClick={() => setCancelTarget(bid)} className="btn btn-secondary" style={{ fontSize: '0.76rem', color: '#c62828', flexShrink: 0 }}>
                      {bid.status === 'pending' ? 'Withdraw bid' : 'Cancel bid'}
                    </button>
                  )}
                  {(bid.status === 'active' || bid.status === 'completed') && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.3rem' }}>
                      {(bid.legs || []).map((leg, legIndex) => (
                        <div key={legIndex} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
                          background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.4rem 0.6rem',
                        }}>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            {leg.flightNumber} {leg.originIcao}→{leg.destIcao}
                          </span>
                          {leg.pirepId ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--avg-green)' }}>
                              <ClipboardCheck size={12} /> Verified & logged ({leg.pirepFlightTime}h)
                            </span>
                          ) : (
                            <button onClick={() => openPirepModal(bid, legIndex)} className="btn btn-primary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <PenLine size={12} /> File PIREP
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading aircraft…</div>
      ) : (aircraft || []).length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: 14,
          padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem',
        }}>
          No aircraft found in this organization.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.9rem' }}>
          {aircraft.map(ac => {
            const acBids = bidsForAircraft(ac.id);
            const blocked = acBids.length > 0;
            const mineOnThis = acBids.some(b => b.isMine);
            return (
              <div key={ac.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14,
                overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              }}>
                <div style={{ height: 4, background: blocked ? 'linear-gradient(90deg, var(--brand-accent), var(--brand-accent-light))' : 'linear-gradient(90deg, var(--avg-green), var(--avg-green-light))' }} />
                <div style={{ padding: '1.1rem 1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plane size={16} color="var(--text-secondary)" />
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{ac.registration}</div>
                    </div>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', flexShrink: 0,
                      background: blocked ? 'var(--avg-gold-pale)' : 'var(--avg-green-pale)',
                      color: blocked ? 'var(--avg-gold-dark)' : 'var(--avg-green)',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                    }}>
                      {blocked ? <Lock size={10} /> : null} {blocked ? `${acBids.length} bid${acBids.length > 1 ? 's' : ''}` : 'Open'}
                    </span>
                  </div>

                  {acBids.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
                      {acBids.map(b => {
                        const meta = STATUS_META[b.status] || STATUS_META.pending;
                        const StatusIcon = meta.icon;
                        return (
                          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'var(--text-secondary)', background: 'var(--bg-hover)', borderRadius: 8, padding: '0.35rem 0.6rem' }}>
                            <StatusIcon size={11} color={meta.color} style={{ flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {b.isMine ? 'You' : (b.pilot?.callsign || `${b.pilot?.first_name || ''} ${b.pilot?.last_name || ''}`.trim() || 'Another pilot')}
                              {' · '}{(b.legs || []).map(l => `${l.originIcao}→${l.destIcao}`).join(', ')}
                              {' · '}{meta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button onClick={() => openBidModal(ac)} disabled={mineOnThis} className="btn btn-primary" style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    fontSize: '0.82rem', fontWeight: 700, opacity: mineOnThis ? 0.5 : 1,
                  }}>
                    <Gavel size={13} /> {mineOnThis ? 'You have a bid on this' : 'Bid on this aircraft'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bidTarget && (
        <div onClick={() => !submitting && closeBidModal()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '88vh', overflowY: 'auto', padding: '1.75rem', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--avg-green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Gavel size={15} color="var(--avg-green)" />
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>Bid on {bidTarget.registration}</div>
              </div>
              <button onClick={closeBidModal} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Pick your outbound route, and add a return leg if you want to hold the aircraft for the round trip. This goes to staff for approval before anything is scheduled.
            </p>

            <LegForm title="Outbound leg" leg={leg1} setLeg={setLeg1} routeOptions={routeOptions} onRouteChange={id => applyRouteToLeg(setLeg1, id)} inputStyle={inputStyle} labelStyle={labelStyle} />

            <div style={{ margin: '1.1rem 0' }}>
              {!includeReturn ? (
                <button onClick={() => setIncludeReturn(true)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: '1px dashed var(--border-color)',
                  borderRadius: 9, padding: '0.6rem 0.9rem', cursor: 'pointer', color: 'var(--avg-green)', fontSize: '0.8rem', fontWeight: 700, width: '100%', justifyContent: 'center',
                }}>
                  <Plus size={13} /> Add a return leg
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Return leg</div>
                    <button onClick={() => { setIncludeReturn(false); setLeg2(emptyLeg); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                  <LegForm leg={leg2} setLeg={setLeg2} routeOptions={routeOptions} onRouteChange={id => applyRouteToLeg(setLeg2, id)} inputStyle={inputStyle} labelStyle={labelStyle} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }}>
              <button onClick={closeBidModal} disabled={submitting} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={submitBid} disabled={submitting} className="btn btn-primary" style={{ flex: 1, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Submitting…' : 'Submit bid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pirepTarget && (
        <div onClick={() => !filingPirep && closePirepModal()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 420, padding: '1.75rem', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--avg-green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PenLine size={15} color="var(--avg-green)" />
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>File PIREP</div>
              </div>
              <button onClick={closePirepModal} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.1rem' }}>
              {pirepTarget.bid.legs[pirepTarget.legIndex].flightNumber} {pirepTarget.bid.legs[pirepTarget.legIndex].originIcao}→{pirepTarget.bid.legs[pirepTarget.legIndex].destIcao} · {pirepTarget.bid.aircraftRegistration}. We'll check your Infinite Flight logbook for a matching flight and pull the real flight time from there — nothing to type in.
            </p>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={labelStyle}>Notes <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
              <textarea value={pirepNotes} onChange={e => setPirepNotes(e.target.value)} rows={3} maxLength={1000} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} autoFocus />
            </div>
            {pirepError && (
              <div style={{ marginTop: '0.8rem', fontSize: '0.78rem', color: '#c62828', background: 'rgba(198,40,40,0.08)', border: '1px solid rgba(198,40,40,0.25)', borderRadius: 9, padding: '0.65rem 0.8rem', lineHeight: 1.5 }}>
                {pirepError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button onClick={closePirepModal} disabled={filingPirep} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={submitPirep} disabled={filingPirep} className="btn btn-primary" style={{ flex: 1, opacity: filingPirep ? 0.6 : 1 }}>
                {filingPirep ? 'Verifying…' : 'Verify & file PIREP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <ConfirmModal
          title={cancelTarget.status === 'pending' ? 'Withdraw this bid?' : 'Cancel this bid?'}
          message={cancelTarget.status === 'pending'
            ? `This withdraws your request for ${cancelTarget.aircraftRegistration} before it's been reviewed.`
            : `This releases ${cancelTarget.aircraftRegistration} and removes the schedule(s) from Infinite Flight Live. This can't be undone.`}
          confirmLabel={cancelTarget.status === 'pending' ? 'Withdraw' : 'Cancel bid'}
          danger
          onConfirm={confirmCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

function LegForm({ title, leg, setLeg, routeOptions, onRouteChange, inputStyle, labelStyle }) {
  return (
    <div>
      {title && <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>{title}</div>}

      <div style={{ marginBottom: '0.7rem' }}>
        <label style={labelStyle}>Route <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional — pick to autofill, or type your own below)</span></label>
        <select value={leg.routeId} onChange={e => onRouteChange(e.target.value)} style={inputStyle}>
          <option value="">— Choose a route —</option>
          {routeOptions.map(r => (
            <option key={r.id} value={r.id}>{r.flight_number} · {r.departure_icao} → {r.arrival_icao}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.7rem' }}>
        <div>
          <label style={labelStyle}>Flight #</label>
          <input value={leg.flightNumber} onChange={e => setLeg(l => ({ ...l, flightNumber: e.target.value }))} maxLength={32} style={inputStyle} placeholder="PJX421" />
        </div>
        <div>
          <label style={labelStyle}>Origin</label>
          <input value={leg.originIcao} onChange={e => setLeg(l => ({ ...l, originIcao: e.target.value.toUpperCase() }))} maxLength={8} style={{ ...inputStyle, fontFamily: 'monospace' }} placeholder="YSSY" />
        </div>
        <div>
          <label style={labelStyle}>Destination</label>
          <input value={leg.destIcao} onChange={e => setLeg(l => ({ ...l, destIcao: e.target.value.toUpperCase() }))} maxLength={8} style={{ ...inputStyle, fontFamily: 'monospace' }} placeholder="YMML" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <div>
          <label style={labelStyle}><CalendarClock size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Departure (UTC)</label>
          <input type="datetime-local" value={leg.departureUtc} onChange={e => setLeg(l => ({ ...l, departureUtc: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}><CalendarClock size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Arrival (UTC)</label>
          <input type="datetime-local" value={leg.arrivalUtc} onChange={e => setLeg(l => ({ ...l, arrivalUtc: e.target.value }))} style={inputStyle} />
        </div>
      </div>
    </div>
  );
}

export default IFLiveBidding;
