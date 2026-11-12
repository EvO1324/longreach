/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';

import brand from '../brand';
const LOGO_URL = brand.logos.icon;

function Loader({ size = 96, fullPage = false }) {
  const ring  = size;
  const img   = Math.round(size * 0.62);
  const thick = Math.max(3, Math.round(size * 0.045));

  const containerStyle = fullPage
    ? {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        height:         '100vh',
        width:          '100%',
      }
    : {
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
      };

  return (
    <div style={containerStyle} aria-label="Loading" role="status">
      <div style={{ position: 'relative', width: ring, height: ring }}>

        {/* SVG spinning ring */}
        <svg
          width={ring}
          height={ring}
          viewBox={`0 0 ${ring} ${ring}`}
          style={{ position: 'absolute', inset: 0, animation: 'avg-spin 1.1s linear infinite' }}
        >
          <defs>
            <linearGradient id="avg-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="var(--avg-gold)"  stopOpacity="1" />
              <stop offset="50%"  stopColor="var(--avg-green)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--avg-gold)"  stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle
            cx={ring / 2}
            cy={ring / 2}
            r={(ring - thick) / 2}
            fill="none"
            stroke="url(#avg-ring-grad)"
            strokeWidth={thick}
            strokeLinecap="round"
            strokeDasharray={`${Math.PI * (ring - thick) * 0.75} ${Math.PI * (ring - thick) * 0.25}`}
          />
        </svg>

        {/* Logo centred inside */}
        <div style={{
          position:        'absolute',
          inset:           0,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
        }}>
          <img
            src={LOGO_URL}
            alt={brand.abbreviation}
            style={{
              width:        img,
              height:       img,
              objectFit:    'contain',
              borderRadius: '50%',
              userSelect:   'none',
              pointerEvents:'none',
            }}
          />
        </div>
      </div>

      {/* Keyframe injected once */}
      <style>{`
        @keyframes avg-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default Loader;
