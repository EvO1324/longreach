/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

export const IF_ROLES = {
  1:  { label: 'IF Staff',       color: '#c62828', bg: 'rgba(198,40,40,0.10)'  },
  2:  { label: 'Moderator',      color: '#7b1fa2', bg: 'rgba(123,31,162,0.10)' },
  41: { label: 'Beta',           color: '#1565c0', bg: 'rgba(21,101,192,0.10)' },
  43: { label: 'Alpha',          color: '#1565c0', bg: 'rgba(21,101,192,0.10)' },
  48: { label: 'IFAET Manager',  color: '#e65100', bg: 'rgba(230,81,0,0.10)'   },
  50: { label: 'IFATC Trainer',  color: 'var(--brand-primary)', bg: 'rgba(var(--brand-primary-rgb),0.10)'  },
  52: { label: 'IFATC Appeals',  color: 'var(--brand-primary)', bg: 'rgba(var(--brand-primary-rgb),0.10)'  },
  53: { label: 'API',            color: '#546e7a', bg: 'rgba(84,110,122,0.10)' },
  55: { label: 'IFATC Recruiter',color: 'var(--brand-primary)', bg: 'rgba(var(--brand-primary-rgb),0.10)'  },
  56: { label: 'IFATC Tester',   color: 'var(--brand-primary)', bg: 'rgba(var(--brand-primary-rgb),0.10)'  },
  57: { label: 'IFATC Supervisor',color:'var(--brand-primary)', bg: 'rgba(var(--brand-primary-rgb),0.10)'  },
  64: { label: 'IFATC',          color: 'var(--brand-primary)', bg: 'rgba(var(--brand-primary-rgb),0.10)'  },
  68: { label: 'IFAET',          color: '#e65100', bg: 'rgba(230,81,0,0.10)'   },
};

export default function IFRoleBadges({ roles = [], style = {} }) {
  if (!roles?.length) return null;

  const known = roles
    .map(id => IF_ROLES[id] ? { id, ...IF_ROLES[id] } : null)
    .filter(Boolean);

  if (!known.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', ...style }}>
      {known.map(({ id, label, color, bg }) => (
        <span key={id} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          padding: '0.15rem 0.5rem',
          borderRadius: '5px',
          background: bg,
          border: `1px solid ${color}33`,
          color,
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      ))}
    </div>
  );
}
