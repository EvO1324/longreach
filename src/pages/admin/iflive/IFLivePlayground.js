/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { ifLive } from '../../../api/client';
import { useIFLive } from './IFLiveContext';

const V3_ENDPOINTS = [
  { key: 'orgs',         label: 'List organizations',  note: 'live:organizations.read', path: () => '/live/organizations' },
  { key: 'org',          label: 'Get organization',    note: 'live:organizations.read', path: ({ orgId }) => `/live/organizations/${orgId}`, needs: ['orgId'] },
  { key: 'members',      label: 'Organization members', note: 'live:members.read',      path: ({ orgId }) => `/live/organizations/${orgId}/members`, needs: ['orgId'] },
  { key: 'aircraft',     label: 'Organization aircraft', note: 'live:aircraft.read',    path: ({ orgId }) => `/live/organizations/${orgId}/aircraft`, needs: ['orgId'] },
  { key: 'orgSchedules', label: 'Organization schedules (open)', note: 'live:schedules.read', path: ({ orgId, page, pageSize }) => `/live/organizations/${orgId}/schedules?page=${page}&pageSize=${pageSize}`, needs: ['orgId'] },
  { key: 'acft',         label: 'Get aircraft',        note: 'live:aircraft.read',      path: ({ aircraftId }) => `/live/aircraft/${aircraftId}`, needs: ['aircraftId'] },
  { key: 'position',     label: 'Aircraft position',   note: 'live:aircraft.read',      path: ({ aircraftId }) => `/live/aircraft/${aircraftId}/position`, needs: ['aircraftId'] },
  { key: 'flights',      label: 'Aircraft flight log', note: 'live:aircraft.read',      path: ({ aircraftId, page, pageSize }) => `/live/aircraft/${aircraftId}/flights?page=${page}&pageSize=${pageSize}`, needs: ['aircraftId'] },
  { key: 'acSchedules',  label: 'Aircraft schedules',  note: 'live:schedules.read',     path: ({ aircraftId }) => `/live/aircraft/${aircraftId}/schedules`, needs: ['aircraftId'] },
];

// `large` responses (the full airport and livery lists) are left out of Run all.
const V2_ENDPOINTS = [
  { key: 'sessions',      label: 'Sessions (servers)',   path: () => '/sessions' },
  { key: 'session',       label: 'Session detail',       path: ({ sessionId }) => `/sessions/${sessionId}`, needs: ['sessionId'] },
  { key: 'sessionFlights', label: 'Flights in session',  path: ({ sessionId }) => `/sessions/${sessionId}/flights`, needs: ['sessionId'], note: 'Large' },
  { key: 'route',         label: 'Flight route',         path: ({ sessionId, flightId }) => `/sessions/${sessionId}/flights/${flightId}/route`, needs: ['sessionId', 'flightId'] },
  { key: 'flightplan',    label: 'Flight plan',          path: ({ sessionId, flightId }) => `/sessions/${sessionId}/flights/${flightId}/flightplan`, needs: ['sessionId', 'flightId'] },
  { key: 'atc',           label: 'Active ATC',           path: ({ sessionId }) => `/sessions/${sessionId}/atc`, needs: ['sessionId'] },
  { key: 'world',         label: 'World status (airports)', path: ({ sessionId }) => `/sessions/${sessionId}/world`, needs: ['sessionId'] },
  { key: 'airportStatus', label: 'Airport status',       path: ({ sessionId, icao }) => `/sessions/${sessionId}/airport/${icao}/status`, needs: ['sessionId', 'icao'] },
  { key: 'atis',          label: 'Airport ATIS',         path: ({ sessionId, icao }) => `/sessions/${sessionId}/airport/${icao}/atis`, needs: ['sessionId', 'icao'] },
  { key: 'userStats',     label: 'User stats by IFC username', path: () => '/users', method: 'POST', needs: ['ifcName'], note: 'POST, discourseNames' },
  { key: 'user',          label: 'User detail (grade)',  path: ({ userId }) => `/users/${userId}`, needs: ['userId'] },
  { key: 'userFlights',   label: 'User logbook',         path: ({ userId, page }) => `/users/${userId}/flights?page=${page}`, needs: ['userId'] },
  { key: 'userFlight',    label: 'User logbook flight',  path: ({ userId, logFlightId }) => `/users/${userId}/flights/${logFlightId}`, needs: ['userId', 'logFlightId'] },
  { key: 'userAtc',       label: 'User ATC sessions',    path: ({ userId, page }) => `/users/${userId}/atc?page=${page}`, needs: ['userId'] },
  { key: 'tracks',        label: 'Oceanic tracks',       path: () => '/tracks' },
  { key: 'acTypes',       label: 'Aircraft types',       path: () => '/aircraft' },
  { key: 'liveries',      label: 'Liveries for aircraft type', path: ({ aircraftType }) => `/aircraft/${aircraftType}/liveries`, needs: ['aircraftType'] },
  { key: 'allLiveries',   label: 'All liveries',         path: () => '/aircraft/liveries', large: true, note: 'Very large' },
  { key: 'airports',      label: 'All airports',         path: () => '/airports', large: true, note: 'Very large' },
];

const NEEDS_LABEL = { orgId: 'organization', aircraftId: 'aircraft', sessionId: 'session', flightId: 'flight ID', icao: 'ICAO', ifcName: 'IFC username', userId: 'user ID', logFlightId: 'logbook flight ID', aircraftType: 'aircraft type' };

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8rem' };
const fieldLabel = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' };
const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' };

function statusColour(status) {
  if (status >= 200 && status < 300) return 'var(--avg-green)';
  if (status === 429) return '#e65100';
  return '#c62828';
}

function ResultCard({ result, onRemove }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const json = result.error ? result.error : JSON.stringify(result.body, null, 2);

  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="card" style={{ padding: 0, marginBottom: '0.75rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', flexWrap: 'wrap', borderBottom: open ? '1px solid var(--border-color)' : 'none' }}>
        <span style={{ ...mono, fontWeight: 700, color: result.status ? statusColour(result.status) : '#c62828' }}>
          {result.status || 'ERR'}
        </span>
        <span style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{result.api}</span>
        <span style={{ ...mono, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={result.path}>
          {result.method || 'GET'} {result.path}
        </span>
        {result.durationMs != null && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{result.durationMs} ms</span>}
        <button onClick={copy} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>{copied ? 'Copied' : 'Copy'}</button>
        <button onClick={() => setOpen(o => !o)} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>{open ? 'Hide' : 'Show'}</button>
        <button onClick={onRemove} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>Remove</button>
      </div>
      {open && (
        <pre style={{ ...mono, margin: 0, padding: '0.85rem 1rem', maxHeight: 420, overflow: 'auto', whiteSpace: 'pre', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
          {json}
        </pre>
      )}
    </div>
  );
}

// Endpoint table + Run all + custom path box, shared by both tabs.
function EndpointRunner({ endpoints, params, noteHeading, busy, running, onRun, onRunAll, customPlaceholder, onCustom }) {
  const [customPath, setCustomPath] = useState('');
  const canRun = (ep) => (ep.needs || []).every(n => params[n]);
  const missing = (ep) => (ep.needs || []).filter(n => !params[n]).map(n => NEEDS_LABEL[n]).join(', ');
  const allCount = endpoints.filter(ep => canRun(ep) && !ep.large).length;

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Endpoint</th><th>Path</th><th>{noteHeading}</th><th /></tr></thead>
          <tbody>
            {endpoints.map(ep => (
              <tr key={ep.key}>
                <td style={{ whiteSpace: 'nowrap' }}>{ep.label}</td>
                <td style={{ ...mono, color: 'var(--text-secondary)' }}>{canRun(ep) ? `${ep.method || 'GET'} ${ep.path(params)}` : `needs ${missing(ep)}`}</td>
                <td style={{ ...mono, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{ep.note || ''}</td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => onRun(ep)} disabled={busy || !canRun(ep)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem', opacity: busy || !canRun(ep) ? 0.5 : 1 }}>
                    {running === ep.key ? 'Running…' : 'Run'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => onRunAll(endpoints.filter(ep => canRun(ep) && !ep.large))} disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
          {running === 'all' ? 'Running all…' : `Run all (${allCount} calls)`}
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); if (customPath.trim()) onCustom(customPath.trim()); }} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input value={customPath} onChange={e => setCustomPath(e.target.value)} placeholder={customPlaceholder} style={{ ...mono, flex: 1 }} />
        <button type="submit" disabled={busy || !customPath.trim()} className="btn btn-secondary" style={{ opacity: busy ? 0.6 : 1 }}>
          {running === 'custom' ? 'Running…' : 'Run path'}
        </button>
      </form>
    </>
  );
}

function V3Panel({ call, busy, running, setRunning }) {
  const { orgId } = useIFLive();
  const [aircraft, setAircraft] = useState([]);
  const [aircraftId, setAircraftId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const params = { orgId, aircraftId, page, pageSize };

  const loadAircraft = async () => {
    if (!orgId) return;
    setRunning('aircraft');
    const entry = await call('v3', `/live/organizations/${orgId}/aircraft`);
    const list = Array.isArray(entry.body?.result) ? entry.body.result : [];
    setAircraft(list);
    if (!aircraftId && list[0]) setAircraftId(list[0].id);
    setRunning(null);
  };

  useEffect(() => {
    loadAircraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const run = async (key, fn) => { setRunning(key); await fn(); setRunning(null); };

  return (
    <>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
        raw responses from api v3, only for testing/development pls.
      </div>

      <div style={fieldGrid}>
        <div>
          <span style={fieldLabel}>Organization</span>
          <div style={{ ...mono, padding: '0.45rem 0', overflow: 'hidden', textOverflow: 'ellipsis' }} title={orgId}>{orgId || 'Not set'}</div>
        </div>
        <div>
          <span style={fieldLabel}>Aircraft</span>
          <select value={aircraftId} onChange={e => setAircraftId(e.target.value)} style={{ width: '100%' }}>
            {aircraft.length === 0 && <option value="">No aircraft loaded</option>}
            {aircraft.map(a => <option key={a.id} value={a.id}>{a.registration} ({a.id.slice(0, 8)})</option>)}
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Page</span>
          <input type="number" min="1" value={page} onChange={e => setPage(Math.max(1, Number(e.target.value) || 1))} style={{ width: '100%' }} />
        </div>
        <div>
          <span style={fieldLabel}>Page size</span>
          <input type="number" min="1" max="100" value={pageSize} onChange={e => setPageSize(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={{ width: '100%' }} />
        </div>
      </div>

      <EndpointRunner
        endpoints={V3_ENDPOINTS} params={params} noteHeading="Scope" busy={busy} running={running}
        onRun={ep => run(ep.key, () => call('v3', ep.path(params)))}
        onRunAll={eps => run('all', async () => { for (const ep of eps) await call('v3', ep.path(params)); })}
        customPlaceholder="/live/aircraft/{id}/flights?page=2"
        onCustom={path => run('custom', () => call('v3', path))}
      />
      <button onClick={loadAircraft} disabled={busy || !orgId} className="btn btn-secondary" style={{ marginTop: '0.75rem', opacity: busy ? 0.6 : 1 }}>Reload aircraft</button>
    </>
  );
}

function V2Panel({ call, busy, running, setRunning, active }) {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [flights, setFlights] = useState([]);
  const [flightId, setFlightId] = useState('');
  const [icao, setIcao] = useState('YSSY');
  const [ifcName, setIfcName] = useState('');
  const [userId, setUserId] = useState('');
  const [logFlightId, setLogFlightId] = useState('');
  const [aircraftTypes, setAircraftTypes] = useState([]);
  const [aircraftType, setAircraftType] = useState('');
  const [page, setPage] = useState(1);
  const params = { sessionId, flightId, icao: icao.trim().toUpperCase(), ifcName: ifcName.trim(), userId: userId.trim(), logFlightId: logFlightId.trim(), aircraftType, page };

  const harvest = (ep, entry) => {
    const result = entry.body?.result;
    if (ep.key === 'sessions' && Array.isArray(result)) {
      setSessions(result);
      if (!sessionId && result.length) setSessionId((result.find(s => /expert/i.test(s.name)) || result[0]).id);
    }
    if (ep.key === 'sessionFlights' && Array.isArray(result)) {
      setFlights(result.slice(0, 300));
      if (result[0]) setFlightId(result[0].flightId);
    }
    if (ep.key === 'userStats' && Array.isArray(result) && result[0]?.userId) setUserId(result[0].userId);
    if (ep.key === 'userFlights' && result?.data?.[0]?.id) setLogFlightId(result.data[0].id);
    if (ep.key === 'acTypes' && Array.isArray(result)) {
      setAircraftTypes(result);
      if (!aircraftType && result[0]) setAircraftType(result[0].id);
    }
  };

  const runEp = async (ep) => {
    const entry = await call('v2', ep.path(params), ep.key === 'userStats' ? params.ifcName : undefined);
    harvest(ep, entry);
  };
  const run = async (key, fn) => { setRunning(key); await fn(); setRunning(null); };

  // Load the session list the first time the tab is opened, not on page load.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!active || loaded) return;
    setLoaded(true);
    run('sessions', () => runEp(V2_ENDPOINTS[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
        raw responses from api v2, only for testing/development pls.
      </div>

      <div style={fieldGrid}>
        <div>
          <span style={fieldLabel}>Session</span>
          <select value={sessionId} onChange={e => setSessionId(e.target.value)} style={{ width: '100%' }}>
            {sessions.length === 0 && <option value="">Run Sessions first</option>}
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.userCount ?? '?'} users)</option>)}
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Live flight</span>
          <select value={flightId} onChange={e => setFlightId(e.target.value)} style={{ width: '100%' }}>
            {flights.length === 0 && <option value="">Run Flights in session first</option>}
            {flights.map(f => <option key={f.flightId} value={f.flightId}>{f.callsign} ({f.username || 'no username'})</option>)}
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Airport ICAO</span>
          <input value={icao} onChange={e => setIcao(e.target.value)} style={{ ...mono, width: '100%' }} />
        </div>
        <div>
          <span style={fieldLabel}>IFC username</span>
          <input value={ifcName} onChange={e => setIfcName(e.target.value)} placeholder="Comma-separate for several" style={{ width: '100%' }} />
        </div>
        <div>
          <span style={fieldLabel}>User ID</span>
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="Filled by user stats" style={{ ...mono, width: '100%' }} />
        </div>
        <div>
          <span style={fieldLabel}>Logbook flight ID</span>
          <input value={logFlightId} onChange={e => setLogFlightId(e.target.value)} placeholder="Filled by user logbook" style={{ ...mono, width: '100%' }} />
        </div>
        <div>
          <span style={fieldLabel}>Aircraft type</span>
          <select value={aircraftType} onChange={e => setAircraftType(e.target.value)} style={{ width: '100%' }}>
            {aircraftTypes.length === 0 && <option value="">Run Aircraft types first</option>}
            {aircraftTypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <span style={fieldLabel}>Page</span>
          <input type="number" min="1" value={page} onChange={e => setPage(Math.max(1, Number(e.target.value) || 1))} style={{ width: '100%' }} />
        </div>
      </div>

      <EndpointRunner
        endpoints={V2_ENDPOINTS} params={params} noteHeading="Note" busy={busy} running={running}
        onRun={ep => run(ep.key, () => runEp(ep))}
        onRunAll={eps => run('all', async () => { for (const ep of eps) await runEp(ep); })}
        customPlaceholder="/sessions/{id}/flights/{flightId}/route"
        onCustom={path => run('custom', () => call('v2', path))}
      />
    </>
  );
}

export default function IFLivePlayground() {
  const [api, setApi] = useState('v3');
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(null); // endpoint key, 'all' or 'custom'
  const busy = running !== null;

  const call = async (which, path, discourseNames) => {
    let entry;
    try {
      entry = which === 'v2' ? await ifLive.playgroundV2(path, discourseNames) : await ifLive.playground(path);
    } catch (err) {
      entry = { path, error: err.message, status: err.status };
    }
    entry.api = which;
    entry.id = `${Date.now()}-${Math.random()}`;
    setResults(prev => [entry, ...prev]);
    return entry;
  };

  const panelProps = { call, busy, running, setRunning };

  return (
    <div>
      <div style={{ display: 'inline-flex', gap: '0.25rem', padding: '0.25rem', marginBottom: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10 }}>
        {[['v3', 'v3 Live'], ['v2', 'v2']].map(([key, text]) => (
          <button key={key} onClick={() => setApi(key)} disabled={busy} style={{
            padding: '0.45rem 1.1rem', borderRadius: 7, border: 'none', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
            background: api === key ? 'var(--avg-green)' : 'transparent', color: api === key ? '#fff' : 'var(--text-secondary)',
          }}>{text}</button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '1rem', display: api === 'v3' ? 'block' : 'none' }}>
        <V3Panel {...panelProps} />
      </div>
      <div className="card" style={{ marginBottom: '1rem', display: api === 'v2' ? 'block' : 'none' }}>
        <V2Panel {...panelProps} active={api === 'v2'} />
      </div>

      {results.length > 0 && (
        <button onClick={() => setResults([])} disabled={busy} className="btn btn-secondary" style={{ marginBottom: '0.75rem' }}>Clear results</button>
      )}
      {results.map(r => (
        <ResultCard key={r.id} result={r} onRemove={() => setResults(prev => prev.filter(x => x.id !== r.id))} />
      ))}
    </div>
  );
}
