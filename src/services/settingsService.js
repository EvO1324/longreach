/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

let cache = null;

export const loadSettings = async (force = false) => {
  if (cache && !force) return cache;
  try {
    const res = await fetch(`${API_URL}/settings`);
    const data = await res.json();
    cache = data.settings || {};
    return cache;
  } catch (error) {
    console.error('Error loading settings:', error);
    return cache || {};
  }
};

export const getSetting = async (key, fallback = '') => {
  const settings = await loadSettings();
  return settings[key] || fallback;
};

export const getCachedSettings = () => cache;

export const clearSettingsCache = () => {
  cache = null;
};
