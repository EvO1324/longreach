/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { useState, useEffect, useCallback, useRef } from 'react';

const EXIT_MS = 180;
const ENTER_MS = 220;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useAuthTransition(navigate) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) { setVisible(true); return; }
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [reduced]);

  const go = useCallback((to) => {
    if (reduced) { navigate(to); return; }
    setExiting(true);
    exitTimer.current = setTimeout(() => navigate(to), EXIT_MS);
  }, [navigate, reduced]);

  // Spread this directly into the card's existing style object.
  const cardTransitionStyle = reduced ? {} : {
    opacity: exiting ? 0 : (visible ? 1 : 0),
    transform: exiting
      ? 'translateY(-6px) scale(0.99)'
      : (visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.99)'),
    transition: `opacity ${exiting ? EXIT_MS : ENTER_MS}ms ease, transform ${exiting ? EXIT_MS : ENTER_MS}ms ease`,
  };

  return { cardTransitionStyle, go };
}
