/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useRef } from 'react';
import Loader from '../components/Loader';
import { routes as routesApi, fleet as fleetApi, airlines as airlinesApi } from '../api/client';
import { useNavigate, useLocation } from 'react-router-dom';
import RouteInfoModal from '../components/RouteInfoModal';
import { useRankAccess, routeLock, aircraftLock } from '../utils/rankAccess';
import { inputStyle, labelStyle } from '../components/FormField';

const PAGE_SIZE = 20;

const CSS = `
  .route-card { transition: background 0.1s; }
  .route-card:hover { background: var(--bg-hover) !important; }
  .route-file-btn { transition: opacity 0.12s, transform 0.1s; }
  .route-file-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .route-file-btn:active { transform: translateY(0); }
  .route-desktop { display: flex; }
  .route-mobile { display: none; }
  @media (max-width: 780px) {
    .route-desktop { display: none !important; }
    .route-mobile { display: flex !important; flex-direction: column; gap: 0.5rem; }
  }
`;

function MultiSelectDropdown({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const label = value.length === 0 ? placeholder : value.length === 1 ? value[0] : `${value.length} selected`;
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '0.6rem 2.5rem 0.6rem 0.875rem',
        backgroundColor: 'var(--bg-primary)', color: value.length ? 'var(--text-primary)' : 'var(--text-secondary)',
        border: `1.5px solid ${open ? 'var(--avg-green)' : 'var(--border-color)'}`,
        borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'inherit',
        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', boxSizing: 'border-box', outline: 'none',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={open ? 'var(--avg-green)' : 'var(--text-secondary)'} strokeWidth="2" style={{ flexShrink: 0, marginLeft: '0.5rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999, background: 'var(--bg-card)', border: '1.5px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 240, overflowY: 'auto' }}>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{ width: '100%', padding: '0.6rem 1rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--avg-green)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
              Clear all ({value.length})
            </button>
          )}
          {options.map((opt, i) => {
            const checked = value.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)} style={{
                width: '100%', padding: '0.65rem 1rem', background: checked ? 'rgba(var(--brand-primary-rgb),0.06)' : 'none',
                border: 'none', borderBottom: i < options.length - 1 ? '1px solid var(--border-color)' : 'none',
                color: checked ? 'var(--avg-green)' : 'var(--text-primary)', fontSize: '0.9rem',
                fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', fontWeight: checked ? 600 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{opt}</span>
                {checked && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Maps ICAO first-letter prefix(es) to ISO country code for flag emoji
const ICAO_FLAG = {
  Y:'AU', N:'US', K:'US', P:'US', C:'CA', E:'GB', EG:'GB', EI:'IE', EK:'DK', EL:'LU',
  EN:'NO', EP:'PL', ES:'SE', ET:'DE', EV:'LV', EY:'LT', EZ:'EE', EB:'BE', ED:'DE', EH:'NL',
  LF:'FR', LI:'IT', LE:'ES', LP:'PT', LK:'CZ', LZ:'SK', LH:'HU', LB:'BG', LR:'RO',
  LO:'AT', LM:'MT', LS:'CH', LG:'GR', LW:'MK', LD:'HR', LJ:'SI', LY:'RS', LQ:'BA',
  UB:'AZ', UC:'KG', UD:'AM', UG:'GE', UK:'UA', UM:'BY', UT:'TJ', UU:'RU', UW:'RU',
  UL:'RU', UE:'RU', UI:'RU', UN:'RU', UO:'RU', UH:'RU', UA:'KZ', UZ:'UZ',
  Z:'CN', R:'JP', RK:'KR', VH:'HK', VT:'TH', VV:'VN', VN:'NP', VD:'KH', VL:'LA',
  VY:'MM', VM:'MO', VR:'TL', VB:'BN', WA:'ID', WI:'ID', WQ:'ID', WR:'ID',
  WM:'MY', WS:'SG', RP:'PH', PK:'PW', PG:'GU', PH:'US',
  O:'IR', OA:'AF', OI:'IR', OJ:'JO', OK:'KW', OL:'LB', OO:'SA', OP:'PK', OR:'IQ',
  OS:'SY', OT:'QA', OY:'YE',
  H:'AF', HA:'ET', HB:'ER', HC:'SO', HD:'DJ', HE:'EG', HH:'ET', HK:'KE', HL:'LY',
  HT:'TZ', HU:'UG', HV:'TZ',
  D:'AF', DA:'DZ', DB:'BJ', DF:'BF', DG:'GH', DI:'CI', DN:'NG', DR:'NE', DT:'TN',
  DX:'TG', DY:'BJ',
  F:'ZA', FA:'ZA', FB:'BW', FC:'CG', FD:'SZ', FE:'CF', FG:'GQ', FH:'IO', FI:'MU',
  FJ:'IO', FK:'CM', FL:'ZM', FM:'MG', FN:'AO', FO:'GA', FP:'ST', FQ:'MZ', FS:'SC',
  FT:'TD', FV:'ZW', FW:'MW', FX:'LS', FY:'NA', FZ:'CD',
  G:'GM', GA:'ML', GB:'GM', GC:'ES', GF:'SL', GG:'GW', GL:'LR', GM:'MA', GN:'GN',
  GO:'SN', GQ:'MR', GS:'EH', GU:'GN', GV:'CV',
  MB:'TC', MD:'DO', MG:'GT', MH:'HN', MK:'KY', MM:'MX', MN:'NI', MP:'PA', MR:'CR',
  MS:'SV', MT:'HT', MU:'CU', MW:'KY', MY:'BS', MZ:'BZ',
  S:'BR', SB:'BR', SC:'CL', SE:'EC', SF:'FK', SG:'PY', SK:'CO', SL:'BO', SM:'SR',
  SO:'GY', SP:'PE', SU:'UY', SV:'VE', SW:'BR', SY:'GY',
  T:'TT', TB:'BB', TD:'GD', TF:'GP', TG:'MQ', TI:'VI', TJ:'PR', TK:'KN', TL:'LC',
  TN:'AN', TQ:'AG', TT:'TT', TU:'TT', TV:'VC', TX:'BM',
  A:'AU', AG:'SB', AN:'NR', AY:'PG', NS:'WS', NF:'FJ', NI:'CK', NK:'CK', NW:'NC',
  NZ:'NZ', PF:'US', PL:'KI',
  BG:'GL', BI:'IS', EF:'FI',
  VG:'BD', VE:'IN', VI:'IN', VO:'IN', VA:'IN', VQ:'MV',
};

function icaoFlag(icao) {
  if (!icao) return null;
  const code = icao.toUpperCase();
  const cc = ICAO_FLAG[code.slice(0,2)] || ICAO_FLAG[code.slice(0,1)];
  if (!cc) return null;
  return (
    <img
      src={`https://flagcdn.com/w20/${cc.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/w40/${cc.toLowerCase()}.png 2x`}
      width={16}
      height={16}
      alt={cc}
      title={cc}
      style={{
        width: 16, height: 16,
        borderRadius: '50%',
        objectFit: 'cover',
        marginRight: 5,
        flexShrink: 0,
        border: '1px solid var(--border-color)',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    />
  );
}

function RoutesPage({ user }) {
  const location = useLocation();
  const presetSearch = location.state?.presetSearch || '';

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm]           = useState({ flight_number: '', departure_icao: '', arrival_icao: '', aircraft: '', notes: '' });
  const [requestLoading, setRequestLoading]     = useState(false);
  const [requestDone, setRequestDone]           = useState(false);
  const [requestError, setRequestError]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [routes, setRoutes]         = useState([]);
  const [hasSearched, setHasSearched] = useState(!!presetSearch);
  const [page, setPage]             = useState(1);
  const [fleetImageMap,  setFleetImageMap]  = useState({});
  const [selectedRoute,  setSelectedRoute]  = useState(null);
  const access = useRankAccess();
  const [airlineMap, setAirlineMap] = useState({});

  const [flightNumber, setFlightNumber] = useState('');
  const [departure, setDeparture]       = useState('');
  const [arrival, setArrival]           = useState('');
  const [durationMin, setDurationMin]   = useState('');
  const [durationMax, setDurationMax]   = useState('');
  const [sortCol, setSortCol]           = useState('flight_number');
  const [sortDir, setSortDir]           = useState('asc');
  const [selectedAircraft, setSelectedAircraft] = useState([]);
  const [allAircraft, setAllAircraft]   = useState([]);
  const [smartQuery, setSmartQuery]     = useState(presetSearch);
  const [onlyFlyable, setOnlyFlyable]   = useState(() => {
    try { return localStorage.getItem('routes.onlyFlyable') === '1'; } catch { return false; }
  });
  const ranksLoaded = !!access;

  const navigate = useNavigate();

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const loadFleetImages = async () => {
    try {
      const fleetData = await fleetApi.list();
      const imgMap = {};
      (fleetData.fleet || []).forEach(group => {
        group.liveries.forEach(l => { if (l.image_url) imgMap[l.name] = l.image_url; });
      });
      setFleetImageMap(imgMap);
    } catch {}
  };

  const loadRoutes = async () => {
    try {
      setLoading(true);
      const [data, airlinesData] = await Promise.all([
        routesApi.list({ active: true }),
        airlinesApi.list().catch(() => ({ airlines: [] })),
      ]);
      const allRoutes = data.routes || [];
      setRoutes(allRoutes);
      const map = {};
      (airlinesData.airlines || []).forEach(a => { map[a.code.toUpperCase()] = a; });
      setAirlineMap(map);
      const acSet = new Set();
      allRoutes.forEach(r => {
        try {
          const raw = r.aircraft;
          if (!raw) return;
          const items = Array.isArray(raw) ? raw : (String(raw).startsWith('[') ? JSON.parse(raw) : [raw]);
          items.flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean).forEach(ac => acSet.add(ac));
        } catch {}
      });
      setAllAircraft([...acSet].sort());
    } catch (err) {
      console.error('Error loading routes:', err);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRoutes(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFleetImages(); }, []);

  const formatDuration = (mins) => {
    if (!mins) return '—';
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const getAircraft = (route) => {
    try {
      const raw = route.aircraft;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean);
      const s = String(raw).trim();
      if (s.startsWith('[')) {
        const p = JSON.parse(s);
        return (Array.isArray(p) ? p : [p]).flatMap(x => String(x).split('|').map(v => v.trim())).filter(Boolean);
      }
      return s.split('|').map(v => v.trim()).filter(Boolean);
    } catch { return []; }
  };

  const getAirlineCode = (flightNumber) => {
    if (!flightNumber) return null;
    const m = flightNumber.match(/^([A-Z]{2,3})|^([A-Z0-9]{2})(?=\d)/);
    return m?.[1] || m?.[2] || null;
  };

  const getAirline = (flightNumber) => {
    const code = getAirlineCode(flightNumber);
    return code ? airlineMap[code] : null;
  };

  const handleFilePirep = (route) => {
    const aircraft = getAircraft(route);
    const unlocked = access ? aircraft.filter(ac => !aircraftLock(access, ac)) : aircraft;
    const preselect = unlocked.length === 1 ? unlocked[0] : aircraft.length === 1 ? aircraft[0] : '';
    navigate('/log-flight', { state: { prefill: {
      flight_number:   route.flight_number,
      departure_icao:  route.departure_icao,
      arrival_icao:    route.arrival_icao,
      allowedAircraft: unlocked.length > 0 ? unlocked : aircraft,
      ...(preselect ? { aircraft: preselect } : {}),
    }}});
  };

  const getRouteLock = (route) => (access ? routeLock(access, route) : null);

  const handleSearch = (e) => { e.preventDefault(); setHasSearched(true); setPage(1); };
  const toggleOnlyFlyable = (checked) => {
    setOnlyFlyable(checked);
    try { localStorage.setItem('routes.onlyFlyable', checked ? '1' : '0'); } catch {}
    setPage(1);
    if (checked) setHasSearched(true);
  };
  const handleReset  = () => {
    setSmartQuery(''); setFlightNumber(''); setDeparture(''); setArrival('');
    setDurationMin(''); setDurationMax(''); setSelectedAircraft([]);
    setHasSearched(false); setPage(1);
  };

  const filtered = hasSearched ? routes.filter(r => {
    // Smart query matches flight number, departure or arrival
    if (smartQuery) {
      const q = smartQuery.toLowerCase();
      const matches = r.flight_number?.toLowerCase().includes(q) ||
        r.departure_icao?.toLowerCase().includes(q) ||
        r.arrival_icao?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (flightNumber && !r.flight_number?.toLowerCase().includes(flightNumber.toLowerCase())) return false;
    if (departure && !r.departure_icao?.toLowerCase().includes(departure.toLowerCase())) return false;
    if (arrival && !r.arrival_icao?.toLowerCase().includes(arrival.toLowerCase())) return false;
    if (durationMin && (r.duration || 0) < parseFloat(durationMin) * 60) return false;
    if (durationMax && (r.duration || 0) > parseFloat(durationMax) * 60) return false;
    if (selectedAircraft.length > 0) {
      const routeAc = getAircraft(r);
      if (!selectedAircraft.some(ac => routeAc.includes(ac))) return false;
    }
    if (onlyFlyable && ranksLoaded && getRouteLock(r)) return false;
    return true;
  }) : [];

  const sorted = [...filtered].sort((a, b) => {
    const numeric = sortCol === 'distance_nm' || sortCol === 'duration';
    let av = a[sortCol] ?? (numeric ? 0 : '');
    let bv = b[sortCol] ?? (numeric ? 0 : '');
    if (numeric) { av = Number(av) || 0; bv = Number(bv) || 0; return sortDir === 'asc' ? av - bv : bv - av; }
    av = String(av).toLowerCase(); bv = String(bv).toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Route card
  const RouteCard = ({ route }) => {
    const airline = getAirline(route.flight_number);
    const aircraft = getAircraft(route);
    const lock = getRouteLock(route);

    const logo = airline?.logo_url ? (
      <img src={airline.logo_url} alt={airline.name}
        style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }}
        onError={e => { e.target.style.display = 'none'; }} />
    ) : (
      <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-secondary)', flexShrink: 0 }}>
        {getAirlineCode(route.flight_number) || '—'}
      </div>
    );

    const cta = lock ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        {lock}
      </span>
    ) : (
      <button onClick={() => handleFilePirep(route)} className="route-file-btn" style={{
        padding: '0.5rem 1.125rem', background: 'var(--avg-green)', color: 'white',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        fontWeight: 700, fontSize: '0.875rem', whiteSpace: 'nowrap',
      }}>
        File PIREP
      </button>
    );

    return (
      <div className="route-card" style={{ padding: '0.75rem 1rem' }}>

        {/* Desktop/tablet row */}
        <div className="route-desktop" style={{ alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{logo}</div>
          <div style={{ flex: '0 0 10%', minWidth: 0, fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{route.flight_number}</div>
          <div style={{ flex: '0 0 8%', minWidth: 0, fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>{icaoFlag(route.departure_icao)}{route.departure_icao}</div>
          <div style={{ flex: '0 0 8%', minWidth: 0, fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>{icaoFlag(route.arrival_icao)}{route.arrival_icao}</div>
          <div style={{ flex: '0 0 10%', minWidth: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{route.distance_nm ? `${route.distance_nm.toLocaleString()} nm` : '—'}</div>
          <div style={{ flex: '0 0 9%', minWidth: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{formatDuration(route.duration)}</div>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.35rem', minWidth: 0, overflow: 'hidden' }}>
            {aircraft.length === 0
              ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>—</span>
              : aircraft.map(ac => (
                <span key={ac} style={{ padding: '0.2rem 0.6rem', background: 'var(--bg-secondary)', borderRadius: 20, fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{ac}</span>
              ))}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setSelectedRoute(route)}
              title="Route info"
              style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0, transition: 'border-color 0.15s, color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--avg-green)'; e.currentTarget.style.color = 'var(--avg-green)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>
            </button>
            {cta}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="route-mobile">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              {logo}
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>{route.flight_number}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                onClick={() => setSelectedRoute(route)}
                title="Route info"
                style={{ width: 30, height: 30, borderRadius: 7, border: '1.5px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>
              </button>
              {cta}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem' }}>{icaoFlag(route.departure_icao)}{route.departure_icao}</span>
            <span style={{ color: 'var(--border-color)', fontSize: '0.75rem' }}>· · ·</span>
            <span style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem' }}>{icaoFlag(route.arrival_icao)}{route.arrival_icao}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            {route.duration && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDuration(route.duration)}</span>}
            {route.distance_nm && <><span style={{ color: 'var(--border-color)' }}>·</span><span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{route.distance_nm.toLocaleString()} nm</span></>}
            {aircraft.map(ac => (
              <span key={ac} style={{ padding: '0.15rem 0.5rem', background: 'var(--bg-secondary)', borderRadius: 20, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{ac}</span>
            ))}
          </div>
        </div>

      </div>
    );
  };

  // Pagination
  const Pagination = () => {
    if (totalPages <= 1) return null;
    const btnBase = { padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: 'var(--bg-card)', color: 'var(--text-primary)' };
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) pages.push(i);
      else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} routes
        </span>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={{ ...btnBase, opacity: page === 1 ? 0.4 : 1 }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {pages.map((p, i) => (
            p === '…'
              ? <span key={`e${i}`} style={{ padding: '0 0.25rem', color: 'var(--text-secondary)' }}>…</span>
              : <button key={p} onClick={() => setPage(p)} style={{ ...btnBase, background: p === page ? 'var(--avg-green)' : 'var(--bg-card)', color: p === page ? 'white' : 'var(--text-primary)', borderColor: p === page ? 'var(--avg-green)' : 'var(--border-color)' }}>{p}</button>
          ))}
          <button style={{ ...btnBase, opacity: page === totalPages ? 0.4 : 1 }} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>
    );
  };

  const handleRouteRequest = async (e) => {
    e.preventDefault();
    setRequestError(''); setRequestLoading(true);
    try {
      await routesApi.request(requestForm);
      setRequestDone(true);
    } catch (err) {
      setRequestError(err.message || 'Failed to submit');
    } finally { setRequestLoading(false); }
  };

  const closeModal = () => { setShowRequestModal(false); setRequestDone(false); setRequestError(''); setRequestForm({ flight_number: '', departure_icao: '', arrival_icao: '', aircraft: '', notes: '' }); };

  const modalInpStyle = { width: '100%', padding: '0.65rem 0.875rem', border: '1.5px solid var(--border-color)', borderRadius: 8, fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-primary)', color: 'var(--text-primary)', transition: 'border-color 0.15s' };
  const modalLblStyle = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' };

  return (
    <div>
      <style>{CSS}</style>

      {selectedRoute && (
        <RouteInfoModal
          route={selectedRoute}
          onClose={() => setSelectedRoute(null)}
          fleetImageMap={fleetImageMap}
        />
      )}

      {/* Missing Route Modal */}
      {showRequestModal && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ height: 3, background: 'var(--avg-green)' }} />
            <div style={{ padding: '1.5rem 1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Report a Missing Route</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>We'll review and add it to the network</div>
                </div>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.2rem', lineHeight: 1, padding: '0 4px' }}>×</button>
              </div>

              {requestDone ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(var(--brand-primary-rgb),0.1)', border: '1.5px solid var(--avg-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--avg-green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>Request submitted!</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>We'll review it and add it to the network.</div>
                  <button onClick={closeModal} style={{ padding: '0.6rem 1.5rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
                </div>
              ) : (
                <form onSubmit={handleRouteRequest}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={modalLblStyle}>Flight No.</label>
                      <input value={requestForm.flight_number} onChange={e => setRequestForm(f => ({ ...f, flight_number: e.target.value.toUpperCase() }))}
                        required placeholder="QF11" style={modalInpStyle}
                        onFocus={e => e.target.style.borderColor='var(--avg-green)'} onBlur={e => e.target.style.borderColor='var(--border-color)'} />
                    </div>
                    <div>
                      <label style={modalLblStyle}>Departure</label>
                      <input value={requestForm.departure_icao} onChange={e => setRequestForm(f => ({ ...f, departure_icao: e.target.value.toUpperCase() }))}
                        required placeholder="YSSY" maxLength={4} style={modalInpStyle}
                        onFocus={e => e.target.style.borderColor='var(--avg-green)'} onBlur={e => e.target.style.borderColor='var(--border-color)'} />
                    </div>
                    <div>
                      <label style={modalLblStyle}>Arrival</label>
                      <input value={requestForm.arrival_icao} onChange={e => setRequestForm(f => ({ ...f, arrival_icao: e.target.value.toUpperCase() }))}
                        required placeholder="KLAX" maxLength={4} style={modalInpStyle}
                        onFocus={e => e.target.style.borderColor='var(--avg-green)'} onBlur={e => e.target.style.borderColor='var(--border-color)'} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={modalLblStyle}>Aircraft</label>
                    <select value={requestForm.aircraft} onChange={e => setRequestForm(f => ({ ...f, aircraft: e.target.value }))} required
                      style={{ ...modalInpStyle, appearance: 'none' }}
                      onFocus={e => e.target.style.borderColor='var(--avg-green)'} onBlur={e => e.target.style.borderColor='var(--border-color)'}>
                      <option value="">Select aircraft…</option>
                      {allAircraft.map(ac => <option key={ac} value={ac}>{ac}</option>)}
                    </select>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={modalLblStyle}>Notes <span style={{ textTransform: 'none', fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
                    <textarea value={requestForm.notes} onChange={e => setRequestForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2} placeholder="Any context — real-world route, seasonal service, etc."
                      style={{ ...modalInpStyle, resize: 'vertical' }}
                      onFocus={e => e.target.style.borderColor='var(--avg-green)'} onBlur={e => e.target.style.borderColor='var(--border-color)'} />
                  </div>

                  {requestError && <div style={{ padding: '0.65rem', background: 'rgba(198,40,40,0.08)', border: '1px solid rgba(198,40,40,0.2)', color: '#c62828', borderRadius: 8, marginBottom: 14, fontSize: '0.82rem' }}>{requestError}</div>}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" onClick={closeModal} style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button type="submit" disabled={requestLoading} style={{ flex: 2, padding: '0.7rem', borderRadius: 8, border: 'none', background: 'var(--avg-green)', color: 'white', fontSize: '0.875rem', fontWeight: 600, cursor: requestLoading ? 'default' : 'pointer', fontFamily: 'inherit', opacity: requestLoading ? 0.65 : 1 }}>
                      {requestLoading ? 'Submitting…' : 'Submit Request'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h2>Flight Routes</h2>
          <p>Search available routes</p>
        </div>
        <button onClick={() => setShowRequestModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Missing a route?
        </button>
      </div>

      {/* Search */}
      <div className="card" data-tour="routes-search" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Flight Number</label>
              <input style={inputStyle} placeholder="QF1" value={flightNumber}
                onChange={e => setFlightNumber(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label style={labelStyle}>Departure</label>
              <input style={inputStyle} placeholder="YSSY" value={departure} maxLength="4"
                onChange={e => setDeparture(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label style={labelStyle}>Arrival</label>
              <input style={inputStyle} placeholder="EGLL" value={arrival} maxLength="4"
                onChange={e => setArrival(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label style={labelStyle}>Min Duration (hrs)</label>
              <input style={inputStyle} type="number" placeholder="1" step="0.5" value={durationMin} onChange={e => setDurationMin(e.target.value)} min="0" />
            </div>
            <div>
              <label style={labelStyle}>Max Duration (hrs)</label>
              <input style={inputStyle} type="number" placeholder="20" step="0.5" value={durationMax} onChange={e => setDurationMax(e.target.value)} min="0" />
            </div>
            {allAircraft.length > 0 && (
              <div>
                <label style={labelStyle}>Aircraft</label>
                <MultiSelectDropdown options={allAircraft} value={selectedAircraft} onChange={setSelectedAircraft} placeholder="Any aircraft" />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary">Search Routes</button>
            {hasSearched && <button type="button" onClick={handleReset} className="btn btn-secondary">Clear</button>}
            <label
              title={ranksLoaded ? 'Hide routes your current rank can\'t fly yet' : 'Loading your rank…'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto',
                padding: '0.45rem 0.8rem', borderRadius: 8, cursor: ranksLoaded ? 'pointer' : 'default',
                border: `1.5px solid ${onlyFlyable ? 'var(--avg-green)' : 'var(--border-color)'}`,
                background: onlyFlyable ? 'rgba(var(--brand-primary-rgb),0.06)' : 'var(--bg-card)',
                color: onlyFlyable ? 'var(--avg-green)' : 'var(--text-secondary)',
                fontSize: '0.85rem', fontWeight: 600, userSelect: 'none',
                opacity: ranksLoaded ? 1 : 0.6, transition: 'all 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={onlyFlyable}
                disabled={!ranksLoaded}
                onChange={e => toggleOnlyFlyable(e.target.checked)}
                style={{ accentColor: 'var(--avg-green)', width: 15, height: 15, margin: 0, cursor: 'inherit' }}
              />
              Only routes I can fly
            </label>
          </div>
        </form>
      </div>

      {/* Results */}
      {!hasSearched ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔍</div>
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Search for routes above</p>
            <p style={{ fontSize: '0.9rem' }}>Filter by flight number, airports, duration or aircraft</p>
          </div>
        </div>
      ) : loading ? (
        <div className="card"><div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader size={72} /></div></div>
      ) : sorted.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <p>No routes match your search</p>
            <button onClick={handleReset} className="btn btn-secondary" style={{ marginTop: '1rem' }}>Clear filters</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.625rem' }}>
            {sorted.length} result{sorted.length !== 1 ? 's' : ''}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Column headers */}
            <div className="route-desktop" style={{ alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ width: 36, flexShrink: 0 }} />
              {[
                { col: 'flight_number',  label: 'Flight',    flex: '0 0 10%' },
                { col: 'departure_icao', label: 'Departure', flex: '0 0 8%'  },
                { col: 'arrival_icao',   label: 'Arrival',   flex: '0 0 8%'  },
                { col: 'distance_nm',    label: 'Distance',  flex: '0 0 10%' },
                { col: 'duration',       label: 'Duration',  flex: '0 0 9%'  },
              ].map(({ col, label, flex }) => (
                <div key={col} onClick={() => handleSort(col)} style={{ flex, minWidth: 0, cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: sortCol === col ? 'var(--avg-green)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
                  <span style={{ fontSize: '0.6rem', color: sortCol === col ? 'var(--avg-green)' : 'var(--border-color)' }}>{sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}</span>
                </div>
              ))}
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>Aircraft</span>
              </div>
              <div style={{ flexShrink: 0, minWidth: 100 }} />
            </div>
            {paginated.map((route, i) => (
              <div key={route.id} style={{ borderBottom: i < paginated.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <RouteCard route={route} />
              </div>
            ))}
          </div>
          <Pagination />
        </>
      )}
    </div>
  );
}

export default RoutesPage;
