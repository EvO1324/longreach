/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import Dropdown from '../../components/Dropdown';
import ConfirmModal from '../../components/ConfirmModal';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { routes as routesApi, fleet as fleetApi } from '../../api/client';
import { getAirportDistance, estimateFlightTime } from '../../services/airportService';
import { showToast } from '../../components/Toast';

// helpers

function normaliseAircraft(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(x => String(x).trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const p = JSON.parse(s);
      const items = Array.isArray(p) ? p : [p];
      // Flatten any pipe-separated values inside individual elements
      return items.flatMap(x => String(x).trim().split('|').map(v => v.trim())).filter(Boolean);
    } catch {
      return [s.replace(/^\[|\]$/g, '').trim()].filter(Boolean);
    }
  }
  // Pipe-separated: Airbus A380|Boeing 787-9
  if (s.includes('|')) return s.split('|').map(x => x.trim()).filter(Boolean);
  if (s.includes(',')) {
    const parts = s.split(',').map(x => x.trim()).filter(Boolean);
    const looksLikeAircraftList = parts.length > 1 && parts.every(p => p.length > 2 && !/^\d+$/.test(p));
    if (looksLikeAircraftList) return parts;
  }
  return [s];
}

function parseCSV(text) {
  const parseRow = (line) => {
    const cols = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
  };
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const idx = name => headers.indexOf(name);
  return lines.slice(1).map(line => {
    const cols = parseRow(line);
    return {
      flight_number:  (cols[idx('flight_number')]  || '').toUpperCase().trim(),
      departure_icao: (cols[idx('departure_icao')] || '').toUpperCase().trim(),
      arrival_icao:   (cols[idx('arrival_icao')]   || '').toUpperCase().trim(),
      distance_nm:    cols[idx('distance_nm')] ? Number(cols[idx('distance_nm')]) : null,
      duration:       cols[idx('duration')]    ? Number(cols[idx('duration')])    : null,
      aircraft:       normaliseAircraft(cols[idx('aircraft')]),
      active:         cols[idx('active')] !== 'false',
    };
  }).filter(r => r.flight_number && r.departure_icao && r.arrival_icao);
}

function routeKey(r) {
  return `${r.flight_number}|${r.departure_icao}|${r.arrival_icao}`;
}

function changedFields(existing, incoming) {
  const changes = [];
  const exAc = normaliseAircraft(existing.aircraft).sort().join('|');
  const inAc = (incoming.aircraft || []).sort().join('|');
  if (existing.distance_nm !== incoming.distance_nm && incoming.distance_nm != null) changes.push({ field: 'distance_nm', label: 'Distance', from: existing.distance_nm, to: incoming.distance_nm });
  if (existing.duration    !== incoming.duration    && incoming.duration    != null) changes.push({ field: 'duration',    label: 'Duration',  from: existing.duration,    to: incoming.duration    });
  if (exAc !== inAc)                                                                  changes.push({ field: 'aircraft',    label: 'Aircraft',  from: exAc || '—',          to: inAc || '—'          });
  if (existing.active !== incoming.active)                                            changes.push({ field: 'active',      label: 'Active',    from: String(existing.active), to: String(incoming.active) });
  return changes;
}

// ImportReviewModal

function ImportReviewModal({ updates, onConfirm, onCancel }) {
  const [checked, setChecked] = useState(() => Object.fromEntries(updates.map((u, i) => [i, true])));

  const toggle = i => setChecked(p => ({ ...p, [i]: !p[i] }));
  const toggleAll = () => {
    const allOn = Object.values(checked).every(Boolean);
    setChecked(Object.fromEntries(updates.map((_, i) => [i, !allOn])));
  };
  const selectedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '12px',
        width: '100%', maxWidth: '720px',
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>
            Review Changes — {updates.length} route{updates.length !== 1 ? 's' : ''} modified
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            These routes already exist but have changed fields. Select which ones to update.
          </p>
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', width: 40 }}>
                  <input type="checkbox" checked={Object.values(checked).every(Boolean)} onChange={toggleAll} />
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Route</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Changes</th>
              </tr>
            </thead>
            <tbody>
              {updates.map((u, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: checked[i] ? 'rgba(var(--brand-accent-rgb),0.04)' : 'transparent' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="checkbox" checked={!!checked[i]} onChange={() => toggle(i)} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{u.incoming.flight_number}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{u.incoming.departure_icao} → {u.incoming.arrival_icao}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {u.changes.map(c => (
                      <div key={c.field} style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.label}: </span>
                        <span style={{ color: '#c62828', textDecoration: 'line-through', marginRight: 6 }}>{c.from}</span>
                        <span style={{ color: '#2e7d32', fontWeight: 600 }}>→ {c.to}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border-color)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {selectedCount} of {updates.length} selected
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} className="btn btn-secondary" style={{ padding: '0.6rem 1.25rem' }}>
              Skip All
            </button>
            <button
              onClick={() => onConfirm(updates.filter((_, i) => checked[i]))}
              className="btn btn-primary"
              style={{ padding: '0.6rem 1.25rem' }}
              disabled={selectedCount === 0}
            >
              Update {selectedCount > 0 ? `${selectedCount} Route${selectedCount !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// RoutesManager

function RoutesManager() {
  const [routes, setRoutes]       = useState([]);
  const [fleet, setFleet]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [adding, setAdding]       = useState(false);
  const [editing, setEditing]     = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [aircraftDropdownOpen, setAircraftDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmImport, setConfirmImport] = useState(null);
  const [routeRequests, setRouteRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [updatingRequest, setUpdatingRequest] = useState(null); // { parts, toCreate, toUpdate }
  const aircraftDropdownRef = useRef(null);
  const importRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [reviewUpdates, setReviewUpdates] = useState(null); // pending update queue
  const [pendingNew, setPendingNew]       = useState([]);   // new routes waiting after review

  const [formData, setFormData] = useState({
    flight_number: '', departure_icao: '', arrival_icao: '',
    distance_nm: '', duration: '', aircraft: [], active: true,
  });

  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const PAGE_SIZE = 25;

  useEffect(() => {
    loadData();
    const handleClickOutside = e => {
      if (aircraftDropdownRef.current && !aircraftDropdownRef.current.contains(e.target))
        setAircraftDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      const [routesData, fleetData] = await Promise.all([routesApi.list(), fleetApi.list()]);
      setRoutes(routesData.routes || []);
      const flat = (fleetData.fleet || []).flatMap(g => g.liveries.map(l => ({ ...l, _type: g.type })));
      setFleet(flat);
    } catch { showToast('Failed to load routes', 'error'); }
    finally { setLoading(false); }
    loadRequests();
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      const token   = localStorage.getItem('qv_token');
      const res     = await fetch(`${apiBase}/routes/requests?status=pending`, { headers: { Authorization: `Bearer ${token}` } });
      const data    = await res.json();
      setRouteRequests(data.requests || []);
    } catch { /* silent */ }
    finally { setRequestsLoading(false); }
  };

  const handleRequestAction = async (id, status) => {
    setUpdatingRequest(id);
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      const token   = localStorage.getItem('qv_token');
      await fetch(`${apiBase}/routes/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      showToast(`Request ${status}`, 'success');
      loadRequests();
    } catch { showToast('Failed to update', 'error'); }
    finally { setUpdatingRequest(null); }
  };

  const handleCalculateDistance = async () => {
    if (!formData.departure_icao || !formData.arrival_icao) { showToast('Enter both ICAO codes first', 'error'); return; }
    if (formData.departure_icao.length !== 4 || formData.arrival_icao.length !== 4) { showToast('ICAO codes must be 4 characters', 'error'); return; }
    try {
      setCalculating(true);
      const distance = await getAirportDistance(formData.departure_icao.toUpperCase(), formData.arrival_icao.toUpperCase());
      const duration = estimateFlightTime(distance);
      setFormData({ ...formData, distance_nm: distance, duration });
      showToast(`${distance} nm · ${Math.floor(duration / 60)}h ${duration % 60}m`, 'success');
    } catch { showToast('Failed to calculate distance. Check ICAO codes.', 'error'); }
    finally { setCalculating(false); }
  };

  const toggleAircraft = ac => {
    const current = formData.aircraft || [];
    setFormData({ ...formData, aircraft: current.includes(ac) ? current.filter(a => a !== ac) : [...current, ac] });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      const data = { ...formData, aircraft: JSON.stringify(formData.aircraft), distance_nm: formData.distance_nm ? parseInt(formData.distance_nm) : null, duration: formData.duration ? parseInt(formData.duration) : null };
      if (editing) { await routesApi.update(editing, data); showToast('Route updated!', 'success'); setEditing(null); }
      else { await routesApi.create(data); showToast('Route added!', 'success'); }
      resetForm(); await loadData();
    } catch { showToast('Failed to save route', 'error'); }
  };

  const handleEdit = route => {
    setEditing(route.id);
    const raw = normaliseAircraft(route.aircraft);
    const matched = raw.map(acStr => {
      // Exact match first
      if (fleet.find(f => f.name === acStr)) return acStr;
      // Fuzzy: check if any fleet name contains both parts of "Type - Livery"
      const parts = acStr.split(' - ');
      if (parts.length === 2) {
        const [type, livery] = parts.map(s => s.trim().toLowerCase());
        const fuzz = fleet.find(f => {
          const fn = f.name.toLowerCase();
          return fn.includes(type) && fn.includes(livery);
        });
        if (fuzz) return fuzz.name;
      }
      return acStr; // keep original if no match found
    });
    setFormData({
      flight_number: route.flight_number, departure_icao: route.departure_icao, arrival_icao: route.arrival_icao,
      distance_nm: route.distance_nm || '', duration: route.duration || '',
      aircraft: matched, active: route.active,
    });
  };

  const handleDelete = (id) => setConfirmDelete(id);

  const handleExport = () => {
    const headers = ['flight_number','departure_icao','arrival_icao','distance_nm','duration','aircraft','active'];
    const rows = routes.map(r => {
      const ac = normaliseAircraft(r.aircraft).join('|');
      return [r.flight_number, r.departure_icao, r.arrival_icao, r.distance_nm || '', r.duration || '', ac, r.active ? 'true' : 'false'];
    });
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'qv-routes.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const enrichRoute = async route => {
    if ((!route.distance_nm || !route.duration) && route.departure_icao && route.arrival_icao) {
      try {
        const dist = await getAirportDistance(route.departure_icao, route.arrival_icao);
        if (dist) {
          if (!route.distance_nm) route.distance_nm = Math.round(dist);
          if (!route.duration)    route.duration    = estimateFlightTime(dist);
        }
      } catch {}
    }
    return route;
  };

  // actually write routes
  const commitImport = useCallback(async (toCreate, toUpdate) => {
    setImporting(true);
    let created = 0, updated = 0, failed = 0;

    const fuzzyMatchAircraft = (acList) => acList.map(acStr => {
      if (fleet.find(f => f.name === acStr)) return acStr;
      const parts = acStr.split(' - ');
      if (parts.length === 2) {
        const [type, livery] = parts.map(s => s.trim().toLowerCase());
        const fuzz = fleet.find(f => {
          const fn = f.name.toLowerCase();
          return fn.includes(type) && fn.includes(livery);
        });
        if (fuzz) return fuzz.name;
      }
      return acStr;
    });

    const BATCH = 10;
    const DELAY = 300; // ms between batches

    const allRoutes = [
      ...toCreate.map(r => ({ r, mode: 'create' })),
      ...toUpdate.map(({ existing, incoming }) => ({ r: incoming, existing, mode: 'update' })),
    ];

    for (let i = 0; i < allRoutes.length; i++) {
      const { r, existing, mode } = allRoutes[i];

      if (i > 0 && i % BATCH === 0) await sleep(DELAY);

      try {
        const enriched = await enrichRoute({ ...r, aircraft: fuzzyMatchAircraft(r.aircraft || []) });
        const payload  = { ...enriched, aircraft: JSON.stringify(enriched.aircraft) };

        if (mode === 'create') {
          await routesApi.create(payload);
          created++;
        } else {
          await routesApi.update(existing.id, payload);
          updated++;
        }
      } catch { failed++; }
    }

    setImporting(false);
    const parts = [];
    if (created) parts.push(`${created} added`);
    if (updated) parts.push(`${updated} updated`);
    if (failed)  parts.push(`${failed} failed`);
    showToast(parts.join(', ') || 'Nothing to do', failed ? 'error' : 'success');
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Review modal confirm
  const handleReviewConfirm = useCallback(async selectedUpdates => {
    setReviewUpdates(null);
    await commitImport(pendingNew, selectedUpdates);
    setPendingNew([]);
  }, [pendingNew, commitImport]);

  const handleReviewCancel = useCallback(async () => {
    setReviewUpdates(null);
    await commitImport(pendingNew, []);
    setPendingNew([]);
  }, [pendingNew, commitImport]);

  // File picked
  const handleImportFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { showToast('No valid routes found in CSV', 'error'); return; }

    // Build lookup of existing routes by key
    const existingByKey = {};
    for (const r of routes) existingByKey[routeKey(r)] = r;

    const toCreate  = [];
    const toUpdate  = [];
    let   skipped   = 0;

    for (const incoming of parsed) {
      const key = routeKey(incoming);
      const existing = existingByKey[key];

      if (!existing) {
        toCreate.push(incoming);
      } else {
        const changes = changedFields(existing, incoming);
        if (changes.length === 0) {
          skipped++;
        } else {
          toUpdate.push({ existing, incoming, changes });
        }
      }
    }

    // Summary before proceeding
    const parts = [];
    if (toCreate.length) parts.push(`${toCreate.length} new`);
    if (toUpdate.length) parts.push(`${toUpdate.length} changed`);
    if (skipped)         parts.push(`${skipped} unchanged (will skip)`);

    if (!toCreate.length && !toUpdate.length) {
      showToast(`All ${skipped} routes are already up to date — nothing to import.`, 'success');
      return;
    }

    setConfirmImport({ parts, toCreate, toUpdate });
  };

  const resetForm = () => {
    setFormData({ flight_number: '', departure_icao: '', arrival_icao: '', distance_nm: '', duration: '', aircraft: [], active: true });
    setAdding(false); setEditing(null); setAircraftDropdownOpen(false);
  };

  const formatDuration = mins => `${Math.floor(mins / 60)}h ${mins % 60}m`;

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem' }}>Loading routes...</div>;

  return (
    <div>
      {/* Review modal */}
      {reviewUpdates && (
        <ImportReviewModal
          updates={reviewUpdates}
          onConfirm={handleReviewConfirm}
          onCancel={handleReviewCancel}
        />
      )}

      {/* Add/Edit Form */}
      {adding ? (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3>{editing ? 'Edit Route' : 'Add New Route'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Flight Number</label>
                <input type="text" value={formData.flight_number} onChange={e => setFormData({ ...formData, flight_number: e.target.value.toUpperCase() })} placeholder="QF1" required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Status</label>
                <Dropdown value={String(formData.active)} onChange={v => setFormData({ ...formData, active: v === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Departure ICAO</label>
                <input type="text" value={formData.departure_icao} onChange={e => setFormData({ ...formData, departure_icao: e.target.value.toUpperCase() })} placeholder="YSSY" required maxLength="4" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Arrival ICAO</label>
                <input type="text" value={formData.arrival_icao} onChange={e => setFormData({ ...formData, arrival_icao: e.target.value.toUpperCase() })} placeholder="EGLL" required maxLength="4" />
              </div>
            </div>

            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button type="button" onClick={handleCalculateDistance} disabled={calculating} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '6px', cursor: calculating ? 'not-allowed' : 'pointer', fontSize: '0.95rem', fontWeight: 600, opacity: calculating ? 0.7 : 1 }}>
                {calculating ? 'Calculating...' : 'Auto-Calculate Distance & Time'}
              </button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>or enter manually below</span>
            </div>

            <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Distance (nm) {formData.distance_nm && '✓'}</label>
                <input type="number" value={formData.distance_nm} onChange={e => setFormData({ ...formData, distance_nm: e.target.value })} placeholder="7500" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Duration (minutes) {formData.duration && '✓'}</label>
                <input type="number" value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} placeholder="1320" />
              </div>
            </div>

            {/* Aircraft picker */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Aircraft Operating This Route</label>
              {fleet.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No aircraft in fleet yet.</p>
              ) : (
                <div ref={aircraftDropdownRef} style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setAircraftDropdownOpen(!aircraftDropdownOpen)} style={{ width: '100%', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-card)', border: `1.5px solid ${aircraftDropdownOpen ? 'var(--avg-green)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1rem', color: 'var(--text-primary)', boxShadow: aircraftDropdownOpen ? '0 0 0 3px rgba(var(--brand-primary-rgb),0.1)' : 'none', transition: 'border-color 0.2s ease' }}>
                    <span style={{ color: formData.aircraft.length === 0 ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{formData.aircraft.length === 0 ? 'Select aircraft...' : `${formData.aircraft.length} aircraft selected`}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={aircraftDropdownOpen ? 'var(--avg-green)' : 'var(--text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease', transform: aircraftDropdownOpen ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {aircraftDropdownOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, backgroundColor: 'var(--bg-card)', border: '1.5px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, maxHeight: '240px', overflowY: 'auto' }}>
                      {fleet.map((ac, index) => {
                        const isSelected = formData.aircraft.includes(ac.name);
                        return (
                          <button key={ac.id} type="button" onClick={() => toggleAircraft(ac.name)} style={{ width: '100%', padding: '0.75rem 1rem', background: isSelected ? 'rgba(var(--brand-primary-rgb),0.06)' : 'none', border: 'none', borderBottom: index < fleet.length - 1 ? '1px solid var(--border-color)' : 'none', color: isSelected ? 'var(--avg-green)' : 'var(--text-primary)', fontSize: '0.95rem', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: isSelected ? 600 : 400 }}>
                            {ac.name}
                            {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {formData.aircraft.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                  {formData.aircraft.map(ac => (
                    <span key={ac} style={{ padding: '0.3rem 0.75rem', backgroundColor: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {ac}
                      <button type="button" onClick={() => toggleAircraft(ac)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--avg-green)', padding: 0, fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn btn-primary">{editing ? 'Update Route' : 'Add Route'}</button>
              <button type="button" onClick={resetForm} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setAdding(true)} className="btn btn-primary">+ Add New Route</button>
          <button onClick={handleExport} disabled={routes.length === 0} style={{ padding: '0.6rem 1.25rem', borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: routes.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', opacity: routes.length === 0 ? 0.5 : 1 }}>⬇ Export CSV</button>
          <button onClick={() => importRef.current?.click()} disabled={importing} style={{ padding: '0.6rem 1.25rem', borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', opacity: importing ? 0.5 : 1 }}>
            {importing ? 'Importing...' : '⬆ Import CSV'}
          </button>
          <input ref={importRef} type="file" accept=".csv" onChange={handleImportFile} style={{ display: 'none' }} />
          {routes.length > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>{routes.length} routes</span>}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) resetForm(); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Edit Route</h3>
              <button onClick={resetForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
              <form id="edit-route-form" onSubmit={handleSubmit}>
                <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Flight Number</label>
                    <input type="text" value={formData.flight_number} onChange={e => setFormData({ ...formData, flight_number: e.target.value.toUpperCase() })} placeholder="QF1" required />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Status</label>
                    <Dropdown value={String(formData.active)} onChange={v => setFormData({ ...formData, active: v === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Departure ICAO</label>
                    <input type="text" value={formData.departure_icao} onChange={e => setFormData({ ...formData, departure_icao: e.target.value.toUpperCase() })} placeholder="YSSY" required maxLength="4" />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Arrival ICAO</label>
                    <input type="text" value={formData.arrival_icao} onChange={e => setFormData({ ...formData, arrival_icao: e.target.value.toUpperCase() })} placeholder="EGLL" required maxLength="4" />
                  </div>
                </div>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button type="button" onClick={handleCalculateDistance} disabled={calculating} style={{ padding: '0.6rem 1.25rem', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '6px', cursor: calculating ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600, opacity: calculating ? 0.7 : 1 }}>
                    {calculating ? 'Calculating...' : 'Auto-Calculate Distance & Time'}
                  </button>
                </div>
                <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Distance (nm)</label>
                    <input type="number" value={formData.distance_nm} onChange={e => setFormData({ ...formData, distance_nm: e.target.value })} placeholder="7500" />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Duration (minutes)</label>
                    <input type="number" value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} placeholder="1320" />
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Aircraft Operating This Route</label>
                  {fleet.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No aircraft in fleet yet.</p>
                  ) : (
                    <div ref={aircraftDropdownRef} style={{ position: 'relative' }}>
                      <button type="button" onClick={() => setAircraftDropdownOpen(!aircraftDropdownOpen)} style={{ width: '100%', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-card)', border: `1.5px solid ${aircraftDropdownOpen ? 'var(--avg-green)' : 'var(--border-color)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1rem', color: 'var(--text-primary)' }}>
                        <span style={{ color: formData.aircraft.length === 0 ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{formData.aircraft.length === 0 ? 'Select aircraft...' : `${formData.aircraft.length} aircraft selected`}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      {aircraftDropdownOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, backgroundColor: 'var(--bg-card)', border: '1.5px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, maxHeight: '200px', overflowY: 'auto' }}>
                          {fleet.map((ac, index) => {
                            const isSelected = formData.aircraft.includes(ac.name);
                            return (
                              <button key={ac.id} type="button" onClick={() => toggleAircraft(ac.name)} style={{ width: '100%', padding: '0.65rem 1rem', background: isSelected ? 'rgba(var(--brand-primary-rgb),0.06)' : 'none', border: 'none', borderBottom: index < fleet.length - 1 ? '1px solid var(--border-color)' : 'none', color: isSelected ? 'var(--avg-green)' : 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: isSelected ? 600 : 400 }}>
                                {ac.name}
                                {isSelected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {formData.aircraft.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {formData.aircraft.map(ac => (
                        <span key={ac} style={{ padding: '0.3rem 0.75rem', backgroundColor: 'rgba(var(--brand-primary-rgb),0.08)', color: 'var(--avg-green)', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {ac}
                          <button type="button" onClick={() => toggleAircraft(ac)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--avg-green)', padding: 0, fontSize: '1rem', lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </form>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button type="button" onClick={resetForm} className="btn btn-secondary">Cancel</button>
              <button type="submit" form="edit-route-form" className="btn btn-primary">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Route Requests */}
      {(requestsLoading || routeRequests.length > 0) && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: routeRequests.length ? '1rem' : 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              Route Requests
              {routeRequests.length > 0 && (
                <span style={{ marginLeft: 8, padding: '0.1rem 0.55rem', borderRadius: 20, background: 'rgba(var(--brand-accent-rgb),0.15)', color: 'var(--avg-gold-dark)', fontSize: '0.75rem', fontWeight: 700 }}>{routeRequests.length}</span>
              )}
            </h3>
          </div>
          {requestsLoading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
          ) : routeRequests.length === 0 ? null : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {routeRequests.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--text-primary)' }}>{r.flight_number}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--text-primary)' }}>{r.departure_icao} → {r.arrival_icao}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '0.1rem 0.45rem', borderRadius: 4 }}>{r.aircraft}</span>
                    </div>
                    {r.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontStyle: 'italic' }}>"{r.notes}"</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {r.expand?.submitted_by ? `${r.expand.submitted_by.first_name} ${r.expand.submitted_by.last_name}` : 'Unknown pilot'}
                      {' · '}{r.created ? new Date(r.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button onClick={() => handleRequestAction(r.id, 'approved')} disabled={updatingRequest === r.id}
                      style={{ padding: '0.4rem 0.75rem', borderRadius: 7, border: 'none', background: 'var(--avg-green)', color: 'white', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: updatingRequest === r.id ? 0.6 : 1 }}>
                      Approve
                    </button>
                    <button onClick={() => handleRequestAction(r.id, 'rejected')} disabled={updatingRequest === r.id}
                      style={{ padding: '0.4rem 0.75rem', borderRadius: 7, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: updatingRequest === r.id ? 0.6 : 1 }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Routes Table */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Routes ({routes.length})</h3>
          <div style={{ position: 'relative', flex: '1', maxWidth: '300px', minWidth: '180px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search flight, ICAO…" style={{ width: '100%', padding: '0.5rem 0.875rem 0.5rem 2rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        {routes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No routes added yet</div>
        ) : (() => {
          const filtered = routes.filter(r => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return r.flight_number?.toLowerCase().includes(q) || r.departure_icao?.toLowerCase().includes(q) || r.arrival_icao?.toLowerCase().includes(q);
          });
          const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
          const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
          return (
            <>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ minWidth: '680px' }}>
                  <thead>
                    <tr><th>Flight</th><th>Route</th><th>Distance</th><th>Duration</th><th>Aircraft</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {paginated.map(route => {
                      const aircraft = normaliseAircraft(route.aircraft);
                      return (
                        <tr key={route.id}>
                          <td><strong>{route.flight_number}</strong></td>
                          <td>{route.departure_icao} → {route.arrival_icao}</td>
                          <td>{route.distance_nm ? `${route.distance_nm} nm` : '-'}</td>
                          <td>{route.duration ? formatDuration(route.duration) : '-'}</td>
                          <td>
                            {aircraft.length === 0 ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>-</span> : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {aircraft.map(ac => <span key={ac} style={{ padding: '0.2rem 0.6rem', backgroundColor: 'var(--bg-hover)', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 500 }}>{ac}</span>)}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: route.active ? '#e8f5e9' : '#ffebee', color: route.active ? '#2e7d32' : '#c62828' }}>
                              {route.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button onClick={() => handleEdit(route)} style={{ padding: '0.4rem 0.875rem', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Edit</button>
                              <button onClick={() => handleDelete(route.id)} style={{ padding: '0.4rem 0.875rem', backgroundColor: '#c62828', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {filtered.length} route{filtered.length !== 1 ? 's' : ''} · page {page} of {totalPages}
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--text-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.35 : 1, fontWeight: 600 }}>←</button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let p;
                      if (totalPages <= 7) p = i + 1;
                      else if (page <= 4) p = i + 1;
                      else if (page >= totalPages - 3) p = totalPages - 6 + i;
                      else p = page - 3 + i;
                      return (
                        <button key={p} onClick={() => setPage(p)} style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: p === page ? 'var(--avg-green)' : 'transparent', color: p === page ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, minWidth: '2.2rem' }}>{p}</button>
                      );
                    })}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--text-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.35 : 1, fontWeight: 600 }}>→</button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete this route?"
          message="This route will be permanently removed and can no longer be filed against."
          confirmLabel="Delete Route"
          danger
          onConfirm={async () => {
            try { await routesApi.delete(confirmDelete); showToast('Route deleted', 'success'); await loadData(); }
            catch { showToast('Failed to delete route', 'error'); }
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {confirmImport && (
        <ConfirmModal
          title="Confirm import"
          message={confirmImport.parts.join(' · ')}
          confirmLabel="Import"
          onConfirm={async () => {
            const { toCreate, toUpdate } = confirmImport;
            if (toUpdate.length > 0) {
              setPendingNew(toCreate);
              setReviewUpdates(toUpdate);
            } else {
              await commitImport(toCreate, []);
            }
          }}
          onClose={() => setConfirmImport(null)}
        />
      )}
    </div>
  );
}

export default RoutesManager;
