/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useMemo, useRef } from 'react';
import { importer } from '../../api/client';
import { showToast } from '../../components/Toast';

const TYPES = {
  pilots:  { label: 'Pilots',  note: 'Each pilot gets an account with a random password; they choose their own with "Forgot password". Existing emails are skipped.' },
  flights: { label: 'Flights', note: 'Pilots are matched by email, callsign, pilot number, IFC username or full name, so import pilots first. Hours and ranks are recalculated afterwards.' },
  routes:  { label: 'Routes',  note: 'Separate several aircraft with | or ;. Duration can be minutes or hours (1:35, 1h 35m).' },
  fleet:   { label: 'Fleet',   note: 'The name is how pilots see the aircraft, e.g. "Boeing 737-800 - Example Air".' },
};

const LABELS = {
  first_name: 'First name', last_name: 'Last name', email: 'Email', callsign: 'Callsign or number', ifc_username: 'IFC username',
  discord_username: 'Discord username', role: 'Role', joined: 'Joined', pilot: 'Pilot', departure: 'Departure', arrival: 'Arrival',
  flight_time: 'Flight time', date: 'Date', flight_number: 'Flight number', aircraft: 'Aircraft', registration: 'Registration',
  distance_nm: 'Distance (nm)', status: 'Status', notes: 'Notes', duration: 'Duration', active: 'Active', name: 'Name',
  icao_code: 'ICAO type', livery_name: 'Livery', aircraft_id: 'IF aircraft ID', livery_id: 'IF livery ID', image_url: 'Image URL',
};

// Column names other crew centres and spreadsheets tend to use
const SYNONYMS = {
  pilot: ['pilot', 'pilotemail', 'pilotid', 'user', 'username', 'member', 'callsign', 'email', 'pilotname'],
  first_name: ['firstname', 'first', 'givenname', 'forename'], last_name: ['lastname', 'last', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'mail'], callsign: ['callsign', 'cs', 'pilotnumber', 'pilotid', 'number'],
  ifc_username: ['ifcusername', 'ifc', 'ifcname', 'community', 'discourse'], discord_username: ['discord', 'discordusername', 'discordname'],
  role: ['role'], joined: ['joined', 'created', 'registered', 'joindate'],
  departure: ['departure', 'dep', 'depicao', 'departureicao', 'from', 'origin', 'departureairport'],
  arrival: ['arrival', 'arr', 'arricao', 'arrivalicao', 'to', 'destination', 'dest', 'arrivalairport'],
  flight_time: ['flighttime', 'time', 'blocktime', 'duration', 'hours', 'length', 'flightduration'],
  date: ['date', 'flightdate', 'flown', 'submitted', 'datetime', 'created'],
  flight_number: ['flightnumber', 'flight', 'flightno', 'fltnum', 'flightnum', 'routenumber'],
  aircraft: ['aircraft', 'ac', 'equipment', 'plane', 'aircrafttype', 'type'], registration: ['registration', 'reg', 'tail'],
  distance_nm: ['distance', 'distancenm', 'nm', 'miles'], status: ['status', 'state'], notes: ['notes', 'comments', 'remarks', 'comment'],
  duration: ['duration', 'time', 'blocktime', 'flighttime'], active: ['active', 'enabled'],
  name: ['name', 'aircraft', 'fleetname'], icao_code: ['icao', 'icaocode', 'typecode'], livery_name: ['livery', 'liveryname'],
  aircraft_id: ['aircraftid'], livery_id: ['liveryid'], image_url: ['image', 'imageurl', 'photo', 'picture'],
};

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// File reading
function parseDelimited(textIn) {
  const t = textIn.replace(/^﻿/, '');
  const firstLine = t.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t', '|'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell); if (row.some(v => v.trim() !== '')) rows.push(row);
  const [head = [], ...body] = rows;
  const columns = head.map((h, i) => h.trim() || `Column ${i + 1}`);
  return { columns, records: body.map(r => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()]))) };
}
function parseJson(textIn) {
  let data = JSON.parse(textIn);
  if (!Array.isArray(data)) data = Object.values(data).find(Array.isArray) || [data];
  const flat = (o, p = '') => Object.entries(o || {}).reduce((acc, [k, v]) => (
    v && typeof v === 'object' && !Array.isArray(v) ? { ...acc, ...flat(v, `${p}${k}.`) } : { ...acc, [`${p}${k}`]: Array.isArray(v) ? v.join('|') : v }
  ), {});
  const records = data.map(r => flat(r));
  const columns = [...new Set(records.flatMap(Object.keys))];
  return { columns, records };
}
function readAny(textIn) {
  const s = textIn.trim();
  if (s.startsWith('[') || s.startsWith('{')) return parseJson(s);
  return parseDelimited(textIn);
}
function guessMapping(fields, columns) {
  const used = new Set(); const map = {};
  for (const f of fields) {
    const want = [norm(f), ...(SYNONYMS[f] || [])];
    const col = columns.find(c => !used.has(c) && want.includes(norm(c)));
    if (col) { map[f] = col; used.add(col); }
  }
  return map;
}
function templateFor(type, fields) {
  const example = {
    pilots: { first_name: 'Sam', last_name: 'Pilot', email: 'sam@example.com', callsign: '123', ifc_username: 'SamFlies', discord_username: 'sam', role: 'pilot', joined: '2026-01-15' },
    flights: { pilot: 'sam@example.com', departure: 'KLAX', arrival: 'KJFK', flight_time: '5:22', date: '2026-11-12', flight_number: 'EX100', aircraft: 'Boeing 787-9', registration: '', distance_nm: '2145', status: 'approved', notes: '' },
    routes: { flight_number: 'EX100', departure: 'KLAX', arrival: 'KJFK', aircraft: 'Boeing 787-9|Airbus A350', distance_nm: '2145', duration: '5:20', active: 'true' },
    fleet: { name: 'Boeing 787-9 - Example Air', icao_code: 'B789', livery_name: 'Example Air', aircraft_id: '', livery_id: '', image_url: '' },
  }[type];
  const q = v => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  return `${fields.join(',')}\n${fields.map(f => q(example[f] ?? '')).join(',')}\n`;
}

// Page
const FIELDS = {
  pilots: ['first_name', 'last_name', 'email', 'callsign', 'ifc_username', 'discord_username', 'role', 'joined'],
  flights: ['pilot', 'departure', 'arrival', 'flight_time', 'date', 'flight_number', 'aircraft', 'registration', 'distance_nm', 'status', 'notes'],
  routes: ['flight_number', 'departure', 'arrival', 'aircraft', 'distance_nm', 'duration', 'active'],
  fleet: ['name', 'icao_code', 'livery_name', 'aircraft_id', 'livery_id', 'image_url'],
};
const REQUIRED = { pilots: ['first_name', 'email'], flights: ['pilot', 'departure', 'arrival', 'flight_time'], routes: ['departure', 'arrival'], fleet: ['name'] };

const box = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '1.1rem 1.25rem', marginBottom: '1rem' };
const h = { margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600 };
const muted = { color: 'var(--text-secondary)', fontSize: '0.85rem' };
const sel = { width: '100%', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' };

export default function ImportTool() {
  const [type, setType] = useState('pilots');
  const [file, setFile] = useState(null);       // { name, columns, records }
  const [mapping, setMapping] = useState({});
  const [check, setCheck] = useState(null);     // server dry run
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const inputRef = useRef(null);
  const fields = FIELDS[type];

  const chooseType = t => { setType(t); setCheck(null); setDone(null); if (file) setMapping(guessMapping(FIELDS[t], file.columns)); };

  const load = async f => {
    if (!f) return;
    try {
      const parsed = readAny(await f.text());
      if (!parsed.records.length) return showToast('That file has no rows', 'error');
      setFile({ name: f.name, ...parsed });
      setMapping(guessMapping(fields, parsed.columns));
      setCheck(null); setDone(null);
    } catch (err) {
      showToast(`Couldn't read that file (${err.message})`, 'error');
    }
  };

  const rows = useMemo(() => (file ? file.records.map(r => Object.fromEntries(fields.filter(f => mapping[f]).map(f => [f, r[mapping[f]]]))) : []), [file, mapping, fields]);
  const missing = REQUIRED[type].filter(f => !mapping[f]);

  const run = async dryRun => {
    setBusy(true);
    try {
      const res = await importer.run(type, rows, dryRun);
      if (dryRun) setCheck(res); else { setDone(res); setCheck(null); showToast(`Imported ${res.summary.create}`, 'success'); }
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([templateFor(type, fields)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${type}-template.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.3rem' }}>Import</h2>
      <p style={{ ...muted, margin: '0 0 1.25rem' }}>Bring pilots, flights, routes or fleet in from another crew centre or a spreadsheet. CSV, TSV and JSON all work, in any column order.</p>

      <div style={box}>
        <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
          {Object.entries(TYPES).map(([k, t]) => (
            <button key={k} onClick={() => chooseType(k)} style={{ border: 0, background: 'none', padding: '0 0 0.6rem', cursor: 'pointer', color: k === type ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: `2px solid ${k === type ? 'var(--brand-primary)' : 'transparent'}`, marginBottom: -1, fontSize: '0.95rem' }}>{t.label}</button>
          ))}
        </div>
        <p style={{ ...muted, margin: '0 0 0.75rem' }}>{TYPES[type].note}</p>
        <button onClick={download} style={{ border: 0, background: 'none', padding: 0, color: 'var(--brand-primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem' }}>Download a template</button>
      </div>

      <div
        style={{ ...box, borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', padding: '1.5rem' }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); load(e.dataTransfer.files[0]); }}
      >
        <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.json" hidden onChange={e => { load(e.target.files[0]); e.target.value = ''; }} />
        {file
          ? <span><strong>{file.name}</strong> <span style={muted}>· {file.records.length.toLocaleString()} rows, {file.columns.length} columns · choose another</span></span>
          : <span style={muted}>Drop a file here, or click to choose one</span>}
      </div>

      {file && (
        <div style={box}>
          <p style={h}>Match the columns</p>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: '0.5rem 0.75rem', alignItems: 'center', fontSize: '0.88rem' }}>
            <span style={muted}>Field</span><span style={muted}>Column in your file</span><span style={muted}>First row</span>
            {fields.map(f => (
              <React.Fragment key={f}>
                <span>{LABELS[f] || f}{REQUIRED[type].includes(f) && <span style={{ color: '#c62828' }}> *</span>}</span>
                <select value={mapping[f] || ''} onChange={e => { setMapping(m => ({ ...m, [f]: e.target.value || undefined })); setCheck(null); }} style={sel}>
                  <option value="">Not in this file</option>
                  {file.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mapping[f] ? String(file.records[0][mapping[f]] ?? '') : ''}</span>
              </React.Fragment>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" disabled={busy || missing.length > 0} onClick={() => run(true)}>{busy && !check ? 'Checking…' : 'Check'}</button>
            {check && check.summary.create > 0 && (
              <button className="btn btn-primary" disabled={busy} onClick={() => run(false)}>{busy ? 'Importing…' : `Import ${check.summary.create.toLocaleString()}`}</button>
            )}
            {missing.length > 0 && <span style={{ fontSize: '0.85rem', color: '#c62828' }}>Choose a column for {missing.map(f => LABELS[f]).join(', ')}</span>}
          </div>
        </div>
      )}

      {(check || done) && (() => {
        const r = check || done;
        return (
          <div style={box}>
            <p style={h}>{done ? 'Imported' : 'Ready to import'}</p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>
              {r.summary.create.toLocaleString()} {done ? 'added' : 'to add'} · {r.summary.skip.toLocaleString()} already there · {r.summary.error.toLocaleString()} with problems
            </p>
            {r.rows.length > 0 && (
              <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border-color)' }}>
                {r.rows.map(x => (
                  <div key={x.row} style={{ display: 'flex', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.84rem' }}>
                    <span style={{ ...muted, width: 64, flexShrink: 0 }}>Row {x.row}</span>
                    <span style={{ color: x.status === 'error' ? '#c62828' : 'var(--text-secondary)' }}>{x.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
