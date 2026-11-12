/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ifLive, infiniteFlight, fleet } from '../../../api/client';
import { showToast } from '../../../components/Toast';

const IFLiveCtx = createContext(null);

export function useIFLive() {
  const ctx = useContext(IFLiveCtx);
  if (!ctx) throw new Error('useIFLive() must be used inside <IFLiveProvider>');
  return ctx;
}

export function IFLiveProvider({ children, returnTo }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const [primaryOrg, setPrimaryOrg] = useState(null);
  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [pickerOrgs, setPickerOrgs] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState(null);

  const [typeNames, setTypeNames] = useState({}); // IF aircraft/livery id -> human-readable name
  const [fleetImages, setFleetImages] = useState({}); // IF aircraft/livery id -> image url, staff-set
  const [fleetNameById, setFleetNameById] = useState({});

  const refreshFleetImages = () => {
    ifLive.fleetImages().then(d => setFleetImages(d.images || {})).catch(() => {});
  };

  useEffect(() => {
    fleet.list().then(d => {
      const map = {};
      for (const group of (d.fleet || [])) {
        for (const item of (group.liveries || [])) {
          if (item.aircraft_id) map[item.aircraft_id] = item.name;
          if (item.livery_id) map[item.livery_id] = item.name;
        }
      }
      setFleetNameById(map);
    }).catch(() => { });
  }, []);

  const hasInitialised = useRef(false);

  const loadStatus = async () => {
    try {
      const d = await ifLive.status();
      setStatus(d);
    } catch (err) {
      showToast(err.message || 'Failed to check IF Live status', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('if_live_connected')) {
      showToast('Connected to Infinite Flight Live', 'success');
      setSearchParams(prev => { prev.delete('if_live_connected'); return prev; }, { replace: true });
    }
    const err = searchParams.get('if_live_error');
    if (err) {
      showToast(`IF Live connection failed: ${err}`, 'error');
      setSearchParams(prev => { prev.delete('if_live_error'); return prev; }, { replace: true });
    }
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!status?.connected || hasInitialised.current) return;
    hasInitialised.current = true;
    if (status.primary_org_id) resolvePrimaryOrg(status.primary_org_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, status?.primary_org_id]);

  useEffect(() => {
    if (!status?.connected) return;
    infiniteFlight.aircraftLiveryMap()
      .then(d => setTypeNames(d.map || {}))
      .catch(() => { });
    refreshFleetImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  const resolvePrimaryOrg = async (orgId) => {
    try {
      const d = await ifLive.organization(orgId);
      setPrimaryOrg(d.organization);
    } catch (err) {
      showToast(err.message || 'Failed to load your default organization', 'error');
    }
  };

  const loadPickerOrgs = async () => {
    setPickerLoading(true);
    try {
      const d = await ifLive.organizations();
      setPickerOrgs(d.organizations || []);
    } catch (err) {
      showToast(err.message || 'Failed to load organizations', 'error');
    } finally {
      setPickerLoading(false);
    }
  };

  const openOrgPicker = async () => {
    setShowOrgPicker(true);
    await loadPickerOrgs();
  };

  const chooseOrg = async (org, opts = {}) => {
    const silent = !!opts.silent;
    setSettingPrimary(org.id);
    try {
      await ifLive.setPrimaryOrg(org.id);
      setStatus(s => ({ ...s, primary_org_id: org.id }));
      if (org.name) setPrimaryOrg(org);
      else await resolvePrimaryOrg(org.id);
      setShowOrgPicker(false);
      if (!silent) showToast(`${org.name} set as your default — this is what you'll see from now on`, 'success');
    } catch (err) {
      if (!silent) showToast(err.message || 'Failed to set default organization', 'error');
      else console.error('[if-live] auto-select default org failed:', err.message);
    } finally {
      setSettingPrimary(null);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const d = await ifLive.connect(returnTo);
      window.location.href = d.authUrl;
    } catch (err) {
      showToast(err.message || 'Failed to start IF Live connection', 'error');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await ifLive.disconnect();
      showToast('Disconnected from Infinite Flight Live', 'success');
      hasInitialised.current = false;
      setStatus(s => ({ ...s, connected: false }));
      setPrimaryOrg(null);
    } catch (err) {
      showToast(err.message || 'Failed to disconnect', 'error');
    }
  };

  const orgId = status?.primary_org_id || null;

  const value = {
    status, loading, connecting, handleConnect, handleDisconnect,
    primaryOrg, orgId, typeNames, fleetImages, refreshFleetImages, fleetNameById,
    showOrgPicker, setShowOrgPicker, pickerOrgs, pickerLoading, settingPrimary, openOrgPicker, loadPickerOrgs, chooseOrg,
  };

  return <IFLiveCtx.Provider value={value}>{children}</IFLiveCtx.Provider>;
}
