/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Loader from '../components/Loader';
import Dropdown from '../components/Dropdown';
import { flights, routes as routesApi, fleet as fleetApi, ranks as ranksApi, multipliers as multipliersApi, events as eventsApi } from '../api/client';
import { aircraftLock, parseRouteAircraft } from '../utils/rankAccess';
import { cacheGet } from '../cache';
import { showToast } from '../components/Toast';
import { useLocation } from 'react-router-dom';
import ATCSession from './ATCSession';
import ManualPirep from './ManualPirep';
import { getAirport } from '../services/airportService';
import { canSeeEvents } from '../utils/eventsAccess';

import brand, { features } from '../brand';
function FilePirep({ user }) {
  const [activeTab, setActiveTab]   = useState('flight');
  const [rankMultiplier, setRankMultiplier] = useState(null);
  const [useRankMultiplier, setUseRankMultiplier] = useState(false);
  const [gifts, setGifts] = useState([]); // gifted multipliers this pilot hasn't used yet
  const [selectedGiftId, setSelectedGiftId] = useState(null);
  const [openEvents, setOpenEvents] = useState([]);
  const [eventMode, setEventMode] = useState(null);
  const [canManualPirep, setCanManualPirep]   = useState(false);
  const [access, setAccess]         = useState(null); // rank access from GET /api/ranks/me
  const [fleet, setFleet]           = useState([]);
  const [fullFleet, setFullFleet]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState(null); // string message, or null
  const [filing, setFiling] = useState(null); // { pct, label, done? } or null

  const location   = useLocation();
  const prefill    = location.state?.prefill || {};
  const hasPrefill = !!(prefill.flight_number && prefill.departure_icao && prefill.arrival_icao);
  const [promoMultiplier, setPromoMultiplier] = useState(null);

  const [routeQuery, setRouteQuery]             = useState(prefill.flight_number || '');
  const [routeResults, setRouteResults]         = useState([]);
  const [routeSearching, setRouteSearching]     = useState(false);
  const [routeSelected, setRouteSelected]       = useState(hasPrefill);
  const [showRouteResults, setShowRouteResults] = useState(false);
  const [selectedRouteAircraft, setSelectedRouteAircraft] = useState(null);
  const routeSearchRef = useRef(null);
  const searchDebounce = useRef(null);

  const [formData, setFormData] = useState({
    flight_number:  prefill.flight_number  || '',
    departure_icao: prefill.departure_icao || '',
    arrival_icao:   prefill.arrival_icao   || '',
    aircraft:       prefill.aircraft       || '',
    flight_hours:   '',
    flight_minutes: '',
    date:           new Date().toISOString().split('T')[0],
    notes:          '',
  });

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate promo code from URL param on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code   = params.get('multi')?.toUpperCase().trim();
    if (!code) return;
    multipliersApi.validatePromo(code)
      .then(data => {
        setPromoMultiplier({ ...data.multiplier, promoId: data.multiplier.id });

        // If a route is linked to this promo, auto-populate the form
        if (data.route) {
          const r = data.route;
          const parseAc = (raw) => {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw.flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean);
            const s = String(raw).trim();
            if (s.startsWith('[')) { try { const p = JSON.parse(s); return (Array.isArray(p) ? p : [p]).flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean); } catch {} }
            return s.split('|').map(v => v.trim()).filter(Boolean);
          };
          const aircraft = parseAc(r.aircraft)[0] || '';
          setRouteQuery(`${r.flight_number} — ${r.departure_icao} → ${r.arrival_icao}`);
          setRouteSelected(true);
          setSelectedRouteAircraft(parseAc(r.aircraft).length > 1 ? parseAc(r.aircraft) : null);
          setFormData(f => ({
            ...f,
            flight_number:  r.flight_number,
            departure_icao: r.departure_icao,
            arrival_icao:   r.arrival_icao,
            ...(aircraft ? { aircraft } : {}),
          }));
        }

        showToast(`Promo code applied: ×${data.multiplier.value} ${data.multiplier.name}`, 'success');
      })
      .catch(err => {
        const msg = err.message?.includes('already used')
          ? 'You have already used this promo code'
          : 'Invalid or expired promo code';
showToast(msg, 'error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => { if (routeSearchRef.current && !routeSearchRef.current.contains(e.target)) setShowRouteResults(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Only one multiplier applies per PIREP, so a gift and the rank benefit are either/or
  const selectGift = (id) => {
    setSelectedGiftId(id);
    if (id) setUseRankMultiplier(false);
  };
  const toggleRankMultiplier = () => {
    setUseRankMultiplier(v => !v);
    setSelectedGiftId(null);
  };
  const selectedGift = gifts.find(g => g.id === selectedGiftId) || null;
  const plainGifts = gifts;

  const loadData = async () => {
    multipliersApi.gifts().then(d => setGifts(d.gifts || [])).catch(() => {});
    if (canSeeEvents(user)) eventsApi.list().then(d => setOpenEvents((d.events || []).filter(e => e.myRegistration && e.filing?.open && !e.myLogged))).catch(() => {});
    try {
      const [fleetData, rankAccess] = await Promise.all([
        cacheGet('prefetch-fleet-raw') ? Promise.resolve(cacheGet('prefetch-fleet-raw')) : fleetApi.list(),
        ranksApi.me(),
      ]);
      setAccess(rankAccess);
      if (rankAccess.pirep_multiplier) {
        setRankMultiplier({ value: rankAccess.pirep_multiplier, label: `${rankAccess.rank?.name} benefit` });
      }
      if (rankAccess.manual_pirep) setCanManualPirep(true);
      const allLiveries = (fleetData.fleet || []).flatMap(group =>
        group.liveries
          .map(l => ({ ...l, displayName: l.name || `${group.type} - ${l.livery_name}` }))
          .filter(l => !aircraftLock(rankAccess, l.displayName))
      );
      setFleet(allLiveries);
      const allLiveriesUnfiltered = (fleetData.fleet || []).flatMap(group =>
        group.liveries.map(l => ({ ...l, displayName: l.name || `${group.type} - ${l.livery_name}` }))
      );
      setFullFleet(allLiveriesUnfiltered);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRouteSearch = (q) => {
    setRouteQuery(q);
    setRouteSelected(false);
    setShowRouteResults(true);
    clearTimeout(searchDebounce.current);
    if (q.trim().length < 2) { setRouteResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      setRouteSearching(true);
      try {
        // The server only returns routes this pilot's rank can fly
        const data = await routesApi.search(q.trim());
        setRouteResults(data.routes || []);
      } catch { setRouteResults([]); }
      finally { setRouteSearching(false); }
    }, 300);
  };

  const handleRouteSelect = (route) => {
    setRouteQuery(`${route.flight_number} — ${route.departure_icao} → ${route.arrival_icao}`);
    setRouteSelected(true);
    setShowRouteResults(false);
    setRouteResults([]);
    const routeAircraft = parseRouteAircraft(route.aircraft).filter(ac => !access || !aircraftLock(access, ac));
    setSelectedRouteAircraft(routeAircraft.length > 0 ? routeAircraft : null);
    const autoSelect = routeAircraft.length === 1 ? routeAircraft[0] : '';
    setFormData(f => ({
      ...f,
      flight_number:  route.flight_number,
      departure_icao: route.departure_icao,
      arrival_icao:   route.arrival_icao,
      ...(autoSelect ? { aircraft: autoSelect } : { aircraft: '' }),
    }));
  };

  const startEvent = (ev) => {
    setEventMode(ev);
    setRouteQuery(`${ev.flight_number} — ${ev.departure_icao} → ${ev.arrival_icao}`);
    setRouteSelected(true);
    setShowRouteResults(false);
    setRouteResults([]);
    setSelectedRouteAircraft(null);
    // The event's multiplier is the only one that applies
    setSelectedGiftId(null);
    setUseRankMultiplier(false);
    setFormData(f => ({ ...f, flight_number: ev.flight_number, departure_icao: ev.departure_icao, arrival_icao: ev.arrival_icao, aircraft: ev.aircraft }));
  };
  const stopEvent = () => {
    setEventMode(null);
    handleRouteClear();
  };

  const handleRouteClear = () => {
    setRouteQuery('');
    setRouteSelected(false);
    setRouteResults([]);
    setSelectedRouteAircraft(null);
    setIfCheck({ status: 'idle' });
    setFormData(f => ({ ...f, flight_number: '', departure_icao: '', arrival_icao: '', aircraft: '' }));
  };

  const isChallengeMode = !!prefill.challenge_leg_id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hours   = parseInt(formData.flight_hours)   || 0;
    const minutes = parseInt(formData.flight_minutes) || 0;
    const flightTimeHours = hours + minutes / 60;
    if (!routeSelected && !hasPrefill && !isChallengeMode) { showToast('Please select a route from the search results', 'error'); return; }
    if (!formData.flight_number || !formData.aircraft) { showToast('Please fill in all required fields', 'error'); return; }
    if (flightTimeHours <= 0) { showToast('Please enter a valid flight time', 'error'); return; }
    let stageTimers = [];
    try {
      setSubmitting(true);
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const startedAt = Date.now();
      const stages = [
        { at: 0,   pct: 20, label: 'Submitting…' },
        ...(user?.if_user_id ? [{ at: 700, pct: 60, label: 'Checking IF logbook…' }, { at: 2600, pct: 85, label: 'Checking IF logbook…' }] : [{ at: 700, pct: 70, label: 'Submitting…' }]),
      ];
      const flightLine = { number: formData.flight_number, dep: formData.departure_icao, arr: formData.arrival_icao };
      stageTimers = stages.map(st => setTimeout(() => setFiling({ ...flightLine, pct: st.pct, label: st.label }), st.at));
      const activeMultiplier = eventMode
        ? null // the server applies the event's multiplier itself
        : promoMultiplier
        ? { code: promoMultiplier.code, value: promoMultiplier.value, name: promoMultiplier.name }
        : prefill.multiplier
          ? prefill.multiplier
          : selectedGift
            ? { code: selectedGift.code, value: selectedGift.value, name: selectedGift.name }
            : (useRankMultiplier && rankMultiplier)
              ? { code: 'RANK', value: rankMultiplier.value, name: rankMultiplier.label }
              : null;
      const result = await flights.submit({
        flight_number:  formData.flight_number,
        departure_icao: formData.departure_icao,
        arrival_icao:   formData.arrival_icao,
        aircraft:       formData.aircraft,
        flight_time:    parseFloat(flightTimeHours.toFixed(4)),
        date:           formData.date,
        notes:          formData.notes,
        challenge_leg_id: prefill.challenge_leg_id || undefined,
        is_career: prefill.is_career || false,
        is_ferry: prefill.is_ferry || false,
        ...(eventMode ? { event_id: eventMode.id } : {}),
        ...(activeMultiplier ? { multiplier_code: activeMultiplier.code, multiplier_value: activeMultiplier.value, multiplier_name: activeMultiplier.name } : {}),
        ...(promoMultiplier && !eventMode ? { multiplier_promo_id: promoMultiplier.promoId } : {}),
        ...(!eventMode && !promoMultiplier && !prefill.multiplier && selectedGift
          ? { multiplier_gift_id: selectedGift.id }
          : {}),
      });
      // A gift is spent once the PIREP is filed
      if (selectedGift && !eventMode && !promoMultiplier && !prefill.multiplier) {
        setGifts(g => g.filter(x => x.id !== selectedGift.id));
        setSelectedGiftId(null);
      }
      await wait(Math.max(0, 2200 - (Date.now() - startedAt)));
      stageTimers.forEach(clearTimeout);
      // The popup shows the outcome itself, so no success toast on top of it
      setFiling({ ...flightLine, pct: 100, done: true, approved: !!result.auto_approved, label: result.auto_approved ? 'Auto-approved' : 'Submitted, awaiting approval' });
      await wait(1600);
      setFormData({ flight_number: '', departure_icao: '', arrival_icao: '', aircraft: '', flight_hours: '', flight_minutes: '', date: new Date().toISOString().split('T')[0], notes: '' });
      setRouteQuery(''); setRouteSelected(false); setSelectedRouteAircraft(null);
      setIfCheck({ status: 'idle' });
      if (eventMode) { setOpenEvents(list => list.filter(e => e.id !== eventMode.id)); setEventMode(null); }
    } catch (error) {
      if (error.code === 'duplicate_pending') {
        setDuplicateModal(error.message);
      } else {
        showToast(error.message || 'Failed to submit PIREP', 'error');
      }
    } finally {
      stageTimers.forEach(clearTimeout);
      setFiling(null);
      setSubmitting(false);
    }
  };

  const [ifCheck, setIfCheck] = useState({ status: 'idle' });
  const debounceRef           = useRef(null);
  const lastMatchKeyRef       = useRef(null); // track what triggered the last full IF check
  const ifCheckStatusRef      = useRef('idle'); // mirror of ifCheck.status for use in effects
  const previewRequestSeqRef  = useRef(0);

  const runPreviewMatch = useCallback(async (dep, arr, aircraft) => {
    const mySeq = ++previewRequestSeqRef.current;
    ifCheckStatusRef.current = 'checking';
    setIfCheck({ status: 'checking' });
    try {
      const data = await flights.previewMatch({ departure_icao: dep, arrival_icao: arr, aircraft });
      if (mySeq !== previewRequestSeqRef.current) return;
      if (!data.checked) {
        const status = data.reason === 'error' ? 'error' : 'idle';
        ifCheckStatusRef.current = status; setIfCheck({ status }); return;
      }
      const status = data.matched ? 'matched' : 'no_match';
      ifCheckStatusRef.current = status;
      setIfCheck({ status, checks: data.checks, bestCandidate: data.bestCandidate, reason: data.reason });
    } catch {
      if (mySeq !== previewRequestSeqRef.current) return;
      ifCheckStatusRef.current = 'error'; setIfCheck({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    const dep = formData.departure_icao;
    const arr = formData.arrival_icao;
    const ac  = formData.aircraft;
    const hrs = (parseInt(formData.flight_hours) || 0) + (parseInt(formData.flight_minutes) || 0) / 60;
    const complete = !!(user?.if_user_id) && dep && arr && dep !== arr && ac && hrs > 0;

    if (!complete) { clearTimeout(debounceRef.current); setIfCheck({ status: 'idle' }); lastMatchKeyRef.current = null; ifCheckStatusRef.current = 'idle'; return; }

    const matchKey = `${dep}|${arr}|${ac}`;
    if (matchKey === lastMatchKeyRef.current) return;

    lastMatchKeyRef.current = matchKey;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runPreviewMatch(dep, arr, ac); }, 1200);
  }, [formData.departure_icao, formData.arrival_icao, formData.aircraft, formData.flight_hours, formData.flight_minutes, runPreviewMatch, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  useEffect(() => {
    if (ifCheck.status !== 'no_match') return;
    const dep = formData.departure_icao, arr = formData.arrival_icao, ac = formData.aircraft;
    if (!dep || !arr || !ac) return;
    const poll = setInterval(() => { runPreviewMatch(dep, arr, ac); }, 15000);
    return () => clearInterval(poll);
  }, [ifCheck.status, formData.departure_icao, formData.arrival_icao, formData.aircraft, runPreviewMatch]);

  // City names for the sidebar ticket
  const [ticketAirports, setTicketAirports] = useState({ dep: null, arr: null });
  useEffect(() => {
    let cancelled = false;
    const dep = formData.departure_icao, arr = formData.arrival_icao;
    if (!dep || !arr) { setTicketAirports({ dep: null, arr: null }); return; }
    Promise.all([getAirport(dep), getAirport(arr)])
      .then(([d, a]) => { if (!cancelled) setTicketAirports({ dep: d, arr: a }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [formData.departure_icao, formData.arrival_icao]);

  if (loading) return <Loader fullPage />;

  const bypassRankRestriction = !!prefill.bypassRankRestriction;
  const allowedAircraft = prefill.allowedAircraft || selectedRouteAircraft || null;
  const isAircraftLocked = allowedAircraft?.length === 1;
  const fleetSource = bypassRankRestriction ? fullFleet : fleet;

  const aircraftOptions = allowedAircraft
    ? [{ value: '', label: 'Select aircraft…' }, ...fleetSource.filter(ac => allowedAircraft.includes(ac.displayName)).map(ac => ({ value: ac.displayName, label: ac.displayName }))]
    : [{ value: '', label: 'Select aircraft…' }, ...fleetSource.map(ac => ({ value: ac.displayName, label: ac.displayName }))];

  const ifLinked     = !!(user?.if_user_id);
  const routeOk      = !!(formData.departure_icao && formData.arrival_icao && formData.departure_icao !== formData.arrival_icao);
  const aircraftOk   = !!(formData.aircraft);
  const hours        = parseInt(formData.flight_hours) || 0;
  const mins         = parseInt(formData.flight_minutes) || 0;
  const flightTimeOk = (hours + mins / 60) > 0 && (hours > 0 || mins > 0);

  const inp = { width: '100%', padding: '0.7rem 0.875rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' };

  // Timeline step helpers
  const stepLabel = { fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: '20px' };
  const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'inherit', textDecoration: 'underline' };
  const StepDot = ({ done, active }) => (
    <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      background: done ? 'var(--avg-green)' : 'transparent',
      border: done ? 'none' : `2px solid ${active ? 'var(--avg-green)' : 'var(--border-color)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {done && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="2,5 4.5,7.5 8,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
    </div>
  );
  const StepLine = ({ done }) => (
    <div style={{ width: 2, flex: 1, minHeight: 16, background: done ? 'var(--avg-green)' : 'var(--border-color)', margin: '3px auto', borderRadius: 2 }} />
  );

  const step1Done = routeOk || isChallengeMode || hasPrefill;
  const eventMult = eventMode?.multiplier > 1 ? { value: eventMode.multiplier } : null;
  const step2Done = aircraftOk;
  const step3Done = flightTimeOk;

  return (
    <div>
      <style>{`
        .pirep-layout-grid { display: grid; grid-template-columns: minmax(0,1fr) 280px; gap: 1.5rem; align-items: start; }
        @media (max-width: 768px) { .pirep-layout-grid { grid-template-columns: 1fr; } }
        .flight-time-input::-webkit-outer-spin-button,
        .flight-time-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .flight-time-input { -moz-appearance: textfield; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pirep-step { transition: opacity 0.2s; }
        .pirep-progress-fill { height: 100%; background: var(--avg-green); transition: width 0.8s ease; }
        @media (prefers-reduced-motion: reduce) { .pirep-progress-fill { transition: none; } }
      `}</style>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>File PIREP</h2>
          {(promoMultiplier || prefill.multiplier) && (() => {
            const m = promoMultiplier || prefill.multiplier;
            return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '20px', background: 'rgba(var(--brand-accent-rgb),0.12)', border: '1px solid rgba(var(--brand-accent-rgb),0.3)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--avg-gold-dark)' }}>
                ×{m.value} {m.name}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[
          { key: 'flight', label: 'Flight PIREP', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 5.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg> },
          ...(features.atc !== false ? [{ key: 'atc',    label: 'ATC Session',  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> }] : []),
          ...(canManualPirep ? [{ key: 'manual', label: 'Manual PIREP', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> }] : []),
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)',
            background: activeTab === t.key ? 'var(--avg-green)' : 'var(--bg-card)',
            color: activeTab === t.key ? 'white' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {activeTab === 'atc' ? (
        <ATCSession user={user} />
      ) : activeTab === 'manual' ? (
        <ManualPirep user={user} fleet={fleet} fullFleet={fullFleet} bypassRankRestriction={true} />
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="pirep-layout-grid">

            {/* Timeline card */}
            <div className="card" data-tour="pirep-form" style={{ padding: '1.5rem' }}>

              {!eventMode && openEvents.map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.9rem', marginBottom: '0.75rem', background: 'rgba(123,63,160,0.06)', border: '1px solid rgba(123,63,160,0.25)', borderRadius: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(123,63,160,0.12)', color: '#7b3fa0' }}>EVENT</span>
                  <span style={{ fontSize: '0.86rem', flex: 1, minWidth: 180 }}>
                    <strong>{ev.title}</strong>
                    <span style={{ color: 'var(--text-secondary)' }}> · {ev.flight_number} {ev.departure_icao} → {ev.arrival_icao}{ev.myRegistration?.gate ? ` · gate ${ev.myRegistration.gate}` : ''}{ev.multiplier > 1 ? ` · ×${ev.multiplier}` : ''}</span>
                  </span>
                  <button type="button" className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => startEvent(ev)}>Log event</button>
                </div>
              ))}
              {eventMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.9rem', marginBottom: '1.25rem', background: 'rgba(123,63,160,0.06)', border: '1px solid rgba(123,63,160,0.25)', borderRadius: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(123,63,160,0.12)', color: '#7b3fa0' }}>EVENT</span>
                  <span style={{ fontSize: '0.86rem', flex: 1, minWidth: 180 }}>
                    Logging <strong>{eventMode.title}</strong>
                    <span style={{ color: 'var(--text-secondary)' }}>{eventMode.multiplier > 1 ? ` · ×${eventMode.multiplier} hours applied` : ''}</span>
                  </span>
                  <button type="button" onClick={stopEvent} style={linkBtn}>Not this flight</button>
                </div>
              )}

              {/* Challenge / Career / Multiplier banners */}
              {isChallengeMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.875rem', marginBottom: '1.25rem', background: 'rgba(var(--brand-accent-rgb),0.07)', border: '1px solid rgba(var(--brand-accent-rgb),0.25)', borderRadius: '8px', fontSize: '0.85rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--avg-gold)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span><strong style={{ color: 'var(--avg-gold)' }}>Challenge leg:</strong> {prefill.challenge_name} — {prefill.departure_icao} → {prefill.arrival_icao}</span>
                </div>
              )}
              {prefill.is_career && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem', borderRadius: '7px', background: 'rgba(var(--brand-primary-rgb),0.08)', border: '1px solid rgba(var(--brand-primary-rgb),0.2)', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(var(--brand-primary-rgb),0.15)', color: 'var(--avg-green)' }}>CAREER</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--avg-green)', fontWeight: 600 }}>This flight will be logged as a career flight</span>
                </div>
              )}
              {promoMultiplier && !eventMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem 1rem', marginBottom: '1.25rem', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <span style={{ padding: '0.3rem 0.7rem', background: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)', borderRadius: '6px', fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>×{promoMultiplier.value}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{promoMultiplier.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>Enter actual flight time — multiplier applied automatically.</div>
                  </div>
                </div>
              )}
              {!promoMultiplier && prefill.multiplier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem 1rem', marginBottom: '1.25rem', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <span style={{ padding: '0.3rem 0.7rem', background: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)', borderRadius: '6px', fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>×{prefill.multiplier.value}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{prefill.multiplier.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>Enter actual flight time — multiplier applied automatically.</div>
                  </div>
                </div>
              )}
              {rankMultiplier && !eventMode && !prefill.multiplier && !promoMultiplier && (
                <div onClick={toggleRankMultiplier} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 1rem', marginBottom: '1.25rem', background: useRankMultiplier ? 'rgba(var(--brand-primary-rgb),0.06)' : 'var(--bg-hover)', border: `1px solid ${useRankMultiplier ? 'rgba(var(--brand-primary-rgb),0.25)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ padding: '0.25rem 0.6rem', borderRadius: '5px', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', background: useRankMultiplier ? 'rgba(var(--brand-primary-rgb),0.1)' : 'var(--border-color)', color: useRankMultiplier ? 'var(--avg-green)' : 'var(--text-secondary)', transition: 'all 0.15s' }}>×{rankMultiplier.value}</span>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{rankMultiplier.label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Apply your rank multiplier to this PIREP</div>
                    </div>
                  </div>
                  <div style={{ position: 'relative', width: 38, height: 21, borderRadius: 999, background: useRankMultiplier ? 'var(--avg-green)' : '#ccc', flexShrink: 0, cursor: 'pointer', transition: 'background 0.2s' }}>
                    <span style={{ position: 'absolute', top: 2.5, left: useRankMultiplier ? 19 : 2.5, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                  </div>
                </div>
              )}

              {!eventMode && !prefill.multiplier && !promoMultiplier && plainGifts.map(gift => {
                const on = selectedGiftId === gift.id;
                return (
                  <div key={gift.id} onClick={() => selectGift(on ? null : gift.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 1rem', marginBottom: '1.25rem', background: on ? 'rgba(var(--brand-accent-rgb),0.08)' : 'var(--bg-hover)', border: `1px solid ${on ? 'rgba(var(--brand-accent-rgb),0.4)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ padding: '0.25rem 0.6rem', borderRadius: '5px', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', background: on ? 'rgba(var(--brand-accent-rgb),0.15)' : 'var(--border-color)', color: on ? 'var(--avg-gold-dark)' : 'var(--text-secondary)', transition: 'all 0.15s' }}>×{gift.value}</span>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {gift.name}
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(var(--brand-accent-rgb),0.15)', color: 'var(--avg-gold-dark)' }}>Gift</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{gift.description || 'Use it on any flight you like. One use only.'}</div>
                      </div>
                    </div>
                    <div style={{ position: 'relative', width: 38, height: 21, borderRadius: 999, background: on ? 'var(--avg-gold)' : '#ccc', flexShrink: 0, cursor: 'pointer', transition: 'background 0.2s' }}>
                      <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                    </div>
                  </div>
                );
              })}

              {/* Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>

                {/* Step 1: Route */}
                <div className="pirep-step" style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                    <StepDot done={step1Done} active={!step1Done} />
                    <StepLine done={step1Done} />
                  </div>
                  <div style={{ flex: 1, paddingBottom: '1.5rem' }}>
                    <div style={stepLabel}>
                      Route
                    </div>
                    {!isChallengeMode && !hasPrefill && !routeSelected && (
                      <div style={{ position: 'relative' }} ref={routeSearchRef}>
                        <div style={{ position: 'relative' }}>
                          <input type="text" value={routeQuery}
                            onChange={e => handleRouteSearch(e.target.value)}
                            onFocus={() => { if (routeResults.length) setShowRouteResults(true); }}
                            placeholder="Search by flight number or ICAO — e.g. QF1, YSSY"
                            style={{ ...inp, paddingRight: routeSelected ? '2.5rem' : undefined }}
                            autoComplete="off" autoCorrect="off" spellCheck="false"
                          />
                          {routeSelected && (
                            <button type="button" onClick={handleRouteClear} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.1rem', padding: 0, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                        {showRouteResults && (routeSearching || routeResults.length > 0) && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: 'var(--bg-card)', border: '1.5px solid var(--avg-green)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 300, overflowY: 'auto' }}>
                            {routeSearching && <div style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Searching…</div>}
                            {!routeSearching && routeResults.map(r => (
                              <div key={r.id}
                                onClick={() => !r._codeshare_locked && handleRouteSelect(r)}
                                style={{ padding: '0.65rem 1rem', cursor: r._codeshare_locked ? 'default' : 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', opacity: r._codeshare_locked ? 0.5 : 1 }}
                                onMouseEnter={e => { if (!r._codeshare_locked) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ fontWeight: 700 }}>{r.departure_icao}</span>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                  <span style={{ fontWeight: 700 }}>{r.arrival_icao}</span>
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{r.flight_number}</span>
                                  {r.duration_min && <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>{Math.floor(r.duration_min/60)}h {r.duration_min%60}m</span>}
                                  {r._codeshare_locked && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '0.1rem 0.4rem', whiteSpace: 'nowrap' }}>
                                      🔒 {access?.codeshare_unlock_rank || 'Higher rank'}+
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {!routeSearching && routeResults.length === 0 && routeQuery.length >= 2 && (
                              <div style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No routes found for your rank.</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Confirmed route pill */}
                    {step1Done && formData.flight_number && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.95rem', color: 'var(--avg-green)' }}>{formData.flight_number}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{formData.departure_icao}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{formData.arrival_icao}</span>
                        {routeSelected && !isChallengeMode && !hasPrefill && !eventMode && (
                          <button type="button" onClick={handleRouteClear} style={linkBtn}>Change</button>
                        )}
                      </div>
                    )}
                    {(isChallengeMode || hasPrefill) && !formData.flight_number && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.875rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{prefill.departure_icao} → {prefill.arrival_icao}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: Aircraft */}
                <div className="pirep-step" style={{ display: 'flex', gap: '1rem', opacity: step1Done ? 1 : 0.45 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                    <StepDot done={step2Done} active={step1Done && !step2Done} />
                    <StepLine done={step2Done} />
                  </div>
                  <div style={{ flex: 1, paddingBottom: '1.5rem' }}>
                    <div style={stepLabel}>
                      Aircraft
                    </div>
                    {formData.aircraft ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{formData.aircraft}</span>
                        {!isAircraftLocked && !eventMode && (
                          <button type="button" onClick={() => setFormData(f => ({ ...f, aircraft: '' }))} style={linkBtn}>Change</button>
                        )}
                      </div>
                    ) : allowedAircraft?.length > 1 ? (
                      <div style={{ maxWidth: 360 }}>
                        <Dropdown options={aircraftOptions} value={formData.aircraft} onChange={v => setFormData(f => ({ ...f, aircraft: v }))} placeholder="Select aircraft…" />
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        {step1Done ? 'Aircraft will be set automatically' : 'Select a route first'}
                      </div>
                    )}
                    {isChallengeMode && prefill.aircraft && formData.aircraft && formData.aircraft !== prefill.aircraft && (
                      <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: '#e65100' }}>This leg requires: {prefill.aircraft}</div>
                    )}
                  </div>
                </div>

                {/* Step 3: Flight time */}
                <div className="pirep-step" style={{ display: 'flex', gap: '1rem', opacity: step2Done ? 1 : 0.45 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                    <StepDot done={step3Done} active={step2Done && !step3Done} />
                    <StepLine done={step3Done} />
                  </div>
                  <div style={{ flex: 1, paddingBottom: '1.5rem' }}>
                    <div style={stepLabel}>
                      Flight time {(eventMult || (!eventMode && (promoMultiplier || prefill.multiplier || selectedGift))) ? `(actual — ×${(eventMult || promoMultiplier || prefill.multiplier || selectedGift).value} applied)` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                        <input className="flight-time-input" type="number" value={formData.flight_hours} onChange={e => setFormData(f => ({ ...f, flight_hours: e.target.value }))} placeholder="0" min="0" max="99"
                          style={{ width: 50, padding: '0.6rem 0.4rem', border: 'none', fontSize: '1.05rem', fontWeight: 600, textAlign: 'center', backgroundColor: 'transparent', color: 'var(--text-primary)', WebkitTextFillColor: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', paddingRight: '0.4rem' }}>hr</span>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                        <input className="flight-time-input" type="number" value={formData.flight_minutes} onChange={e => setFormData(f => ({ ...f, flight_minutes: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)).toString() }))} placeholder="0" min="0" max="59"
                          style={{ width: 50, padding: '0.6rem 0.4rem', border: 'none', fontSize: '1.05rem', fontWeight: 600, textAlign: 'center', backgroundColor: 'transparent', color: 'var(--text-primary)', WebkitTextFillColor: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', paddingRight: '0.4rem' }}>min</span>
                      </div>
                      {(() => {
                        const m = eventMode ? eventMult?.value || null : promoMultiplier?.value || prefill.multiplier?.value || (useRankMultiplier && rankMultiplier?.value) || null;
                        const h = (parseInt(formData.flight_hours) || 0) + (parseInt(formData.flight_minutes) || 0) / 60;
                        if (!m || h <= 0) return null;
                        return <span style={{ fontSize: '0.82rem', color: 'var(--avg-green)', fontWeight: 600 }}>= {(h * m).toFixed(2)}h</span>;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Step 5: Notes */}
                <div className="pirep-step" style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                    <StepDot done={false} active={false} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={stepLabel}>
                      Notes <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span>
                    </div>
                    <textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Any additional notes about your flight…" rows={2}
                      style={{ ...inp, resize: 'vertical', fontSize: '0.875rem' }} />
                  </div>
                </div>

              </div>{/* end timeline */}

              {/* Submit */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="submit" disabled={submitting} style={{ width: '100%', padding: '0.8rem', fontSize: '0.95rem', fontWeight: 700, background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, fontFamily: 'inherit' }}>
                  {submitting ? 'Submitting…' : 'Submit PIREP'}
                </button>
              </div>

            </div>

            {/* Sidebar */}
            <div>
              {(() => {
                const fmt = h => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;
                const flightHours = hours + mins / 60;
                const mult = eventMode ? eventMult?.value || null : promoMultiplier?.value || prefill.multiplier?.value || (useRankMultiplier && rankMultiplier?.value) || null;
                const depCity = ticketAirports.dep?.city || ticketAirports.dep?.name;
                const arrCity = ticketAirports.arr?.city || ticketAirports.arr?.name;
                const ifMins = ifCheck.bestCandidate?.totalTime != null ? Math.round(ifCheck.bestCandidate.totalTime) : null;
                const timeOff = ifCheck.status === 'matched' && ifMins !== null && Math.abs(Math.round(flightHours * 60) - ifMins) > 10;
                const approval = !ifLinked ? { text: 'Manual review', hint: 'Link your IF account in profile settings to auto-approve.' }
                  : timeOff                       ? { text: 'Check flight time', bad: true, hint: `Your IF logbook shows ${Math.floor(ifMins / 60)}h ${String(ifMins % 60).padStart(2, '0')}m.` }
                  : ifCheck.status === 'matched'  ? { text: 'Automatic', good: true, hint: 'Matching flight found in your IF logbook.' }
                  : ifCheck.status === 'checking' ? { text: 'Checking IF logbook…' }
                  : ifCheck.status === 'no_match' ? { text: 'Manual review', hint: 'No matching flight in your IF logbook yet.' }
                  : ifCheck.status === 'error'    ? { text: 'Manual review', hint: "Couldn't reach the IF logbook." }
                  : { text: 'Manual review' };
                const empty = <span style={{ color: 'var(--text-secondary)' }}>—</span>;
                const cell = (label, value) => (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.1rem' }}>{label}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{value}</div>
                  </div>
                );
                return (
                  <div className="card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1.25rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--avg-green)', minHeight: '1.1rem' }}>{formData.flight_number}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.5px', color: routeOk ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {routeOk ? <>{formData.departure_icao} → {formData.arrival_icao}</> : '—— → ——'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minHeight: '1.1rem' }}>
                        {routeOk ? (depCity && arrCity ? `${depCity} to ${arrCity}` : '') : 'Pick a route to start'}
                      </div>
                    </div>
                    <div style={{ borderTop: '1px dashed var(--border-color)', padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem 0.75rem' }}>
                      <div style={{ gridColumn: '1 / -1' }}>{cell('Aircraft', formData.aircraft || empty)}</div>
                      {cell('Flight time', flightTimeOk ? fmt(flightHours) : empty)}
                      {mult && cell(`Credited ×${mult}`, flightTimeOk ? <span style={{ color: 'var(--avg-gold-dark)' }}>{fmt(flightHours * mult)}</span> : empty)}
                      <div style={{ gridColumn: '1 / -1' }}>
                        {cell('Approval', <span style={{ color: approval.good ? 'var(--avg-green)' : approval.bad ? '#c62828' : 'var(--text-primary)' }}>{approval.text}</span>)}
                        {approval.hint && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{approval.hint}</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <details className="card" style={{ padding: '1rem 1.25rem' }}>
                <summary style={{ fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Submission rules</summary>
                <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <li>Only flights on approved {brand.abbreviation} routes are eligible.</li>
                  <li>Flight time must reflect actual in-sim time.</li>
                  <li>One PIREP per flight, no duplicates.</li>
                  <li>Fraudulent submissions may result in suspension.</li>
                </ul>
              </details>
            </div>

          </div>
        </form>
      )}

      {filing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div className="card" role="status" aria-live="polite" style={{ maxWidth: 360, width: '100%', padding: '1.5rem', margin: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--avg-green)' }}>{filing.number}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '1.35rem', fontWeight: 700, marginBottom: '1.25rem' }}>{filing.dep} → {filing.arr}</div>
            <div style={{ height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden', marginBottom: '0.75rem' }}>
              <div className="pirep-progress-fill" style={{ width: `${filing.pct}%` }} />
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: filing.done ? 700 : 400, color: filing.done ? (filing.approved ? 'var(--avg-green)' : 'var(--text-primary)') : 'var(--text-secondary)' }}>
              {filing.label}
            </div>
          </div>
        </div>
      )}

      {duplicateModal && (
        <div
          onClick={() => setDuplicateModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        >
          <div
            className="card"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 400, width: '100%', padding: '1.5rem', textAlign: 'center' }}
          >
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(230,81,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e65100" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.5rem' }}>Duplicate Pirep</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>{duplicateModal}</p>
            <button
              onClick={() => setDuplicateModal(null)}
              style={{ padding: '0.65rem 1.5rem', background: 'var(--avg-green)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilePirep;
