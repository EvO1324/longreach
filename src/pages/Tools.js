/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState } from 'react';
import { Globe, Plane, TowerControl, Search } from 'lucide-react';
import FleetInfo from './tools/FleetInfo';
import AirportInfo from './tools/AirportInfo';
import ServerStatus from './tools/ServerStatus';
import UserSearch from './tools/UserSearch';

function Tools() {
  const [activeTab, setActiveTab] = useState('server');

  const tabs = [
    { id: 'server',  label: 'Server Status', Icon: Globe },
    { id: 'airport', label: 'Airport Lookup', Icon: TowerControl },
    { id: 'fleet',   label: 'Fleet Info',     Icon: Plane },
    { id: 'user',    label: 'User Search',    Icon: Search },
  ];

  return (
    <div className="tools-container">
      <div className="page-header">
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Tools</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Live flight information and resources</p>
      </div>

      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        borderBottom: '2px solid var(--border-color)',
        overflowX: 'auto',
        scrollbarWidth: 'none', // Hides scrollbar on Firefox
      }}>
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '1rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--avg-green)' : '3px solid transparent',
                color: isActive ? 'var(--avg-green)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                fontSize: '0.95rem',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                marginBottom: '-2px',
                opacity: isActive ? 1 : 0.7,
              }}
            >
              {/* Rendering the library icon with a standard size */}
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="tab-content" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
        {activeTab === 'server'  && <ServerStatus />}
        {activeTab === 'airport' && <AirportInfo />}
        {activeTab === 'fleet'   && <FleetInfo />}
        {activeTab === 'user'    && <UserSearch />}
      </div>
    </div>
  );
}

export default Tools;
