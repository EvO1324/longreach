/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function getToken() {
  return localStorage.getItem('qv_token');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Get all aircraft types
export const getAllAircraft = async () => {
  const data = await apiFetch('/if/aircraft');
  return data.result;
};

// Get liveries for a specific aircraft
export const getAircraftLiveries = async (aircraftId) => {
  const data = await apiFetch(`/if/aircraft/${aircraftId}/liveries`);
  return data.result;
};

// Get IF user stats by IFC username
export const getUserStats = async (username) => {
  if (!username) return null;
  try {
    const data = await apiFetch('/if/users', {
      method: 'POST',
      body: JSON.stringify({ discourseNames: [username] }),
    });
    return data.result?.[0] || null;
  } catch (err) {
    console.warn('IF user not found:', err.message);
    return null;
  }
};
