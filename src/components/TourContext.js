/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { auth as authApi } from '../api/client';

import brand from '../brand';
const TourContext = createContext(null);

export const TOUR_STEPS = [
  {
    id:       'dashboard-stats',
    route:    '/dashboard',
    title:    'Your stats at a glance',
    body:     'Track your total flights, hours, rank, and activity streak right from the dashboard.',
    position: 'bottom',
  },
  {
    id:       'sidebar-nav',
    route:    '/dashboard',
    title:    'Getting around',
    body:     "Use the sidebar to navigate. Routes of the Week and File PIREP are where you'll spend most of your time.",
    position: 'right',
  },
  {
    id:       'rotw-routes',
    route:    '/rotw',
    title:    'Routes of the Week',
    body:     "Fly these routes for bonus hour multipliers. Today's routes are highlighted. Hit File PIREP directly from here to pre-fill the form.",
    position: 'bottom',
  },
  {
    id:       'routes-search',
    route:    '/routes',
    title:    'Full route catalogue',
    body:     `Search every ${brand.abbreviation} route by flight number, departure, arrival, or aircraft. You can also file a PIREP directly from any result.`,
    position: 'bottom',
  },
  {
    id:       'pirep-form',
    route:    '/log-flight',
    title:    'Filing a PIREP',
    body:     'Search for your route, confirm your aircraft and flight time — the system checks your IF logbook automatically for instant approval.',
    position: 'right',
  },
];

export function TourProvider({ children, user, onComplete }) {
  const [active, setActive]   = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (false && user && !user.onboarding_complete) {
      setActive(true);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(async () => {
    setActive(false);
    try { await authApi.completeOnboarding(); } catch {}
    onComplete?.();
  }, [onComplete]);

  const next = useCallback(() => {
    if (stepIdx >= TOUR_STEPS.length - 1) finish();
    else setStepIdx(i => i + 1);
  }, [stepIdx, finish]);

  const prev = useCallback(() => {
    setStepIdx(i => Math.max(0, i - 1));
  }, []);

  return (
    <TourContext.Provider value={{ active, stepIdx, step: TOUR_STEPS[stepIdx], next, prev, finish, total: TOUR_STEPS.length }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  return useContext(TourContext);
}
