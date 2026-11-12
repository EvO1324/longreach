/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Login from './components/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Signup from './components/Signup';
import Toast from './components/Toast';
import EventPopup from './components/EventPopup';
import { canSeeEvents } from './utils/eventsAccess';
import SiteBanner from './components/SiteBanner';
import Loader from './components/Loader';
import ForcePasswordModal from './components/ForcePasswordModal';
import { TourProvider } from './components/TourContext';
import TourOverlay from './components/TourOverlay';
import { auth, saveToken, clearToken, fleet as fleetApi, ranks as ranksApi, routes as routesApi } from './api/client';
import { cacheGet, cacheSet } from './cache';
import { registerPush } from './services/pushService';
import { isDeveloper } from './components/DeveloperBadge';

import brand from './brand';
import { features } from './brand';
import { plugins as pluginsApi } from './api/client';

// A page switched off in va.config.json features goes to the dashboard
const on = (feature, element) => (features[feature] === false ? <Navigate to="/dashboard" replace /> : element);
function prefetchStaticData() {
  const prefetches = [
    { key: 'prefetch-fleet-raw', fn: () => fleetApi.list().then(d => {
        // Store raw for FilePirep
        cacheSet('prefetch-fleet-raw', d);
        // Also store flattened for Logbook (key it already checks)
        const liveries = (d.fleet || []).flatMap(g => g.liveries.map(l => ({ ...l, name: l.name || g.type })));
        cacheSet('fleet', liveries);
      }),
    },
    { key: 'prefetch-ranks-raw', fn: () => ranksApi.list().then(d => cacheSet('prefetch-ranks-raw', d)) },
    { key: 'atc-card-routes', fn: () => routesApi.list({ fields: 'id,flight_number,departure_icao,arrival_icao,aircraft' })
        .then(d => cacheSet('atc-card-routes', d.routes || [], 15 * 60 * 1000)) },
  ];

  prefetches.forEach(({ key, fn }) => {
    if (!cacheGet(key)) fn().catch(() => {});
  });
}

const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Logbook       = lazy(() => import('./pages/Logbook'));
const Statistics    = lazy(() => import('./pages/Statistics'));
const RoutesPage    = lazy(() => import('./pages/Routes'));
const FilePirep     = lazy(() => import('./pages/FilePirep'));
const AdminPanel    = lazy(() => import('./pages/AdminPanel'));
const PirepDetail   = lazy(() => import('./pages/admin/PirepDetail'));
const PilotDetail   = lazy(() => import('./pages/admin/PilotDetail'));
const Profile       = lazy(() => import('./pages/Profile'));
const Tools         = lazy(() => import('./pages/Tools'));
const RoutesOfTheWeek = lazy(() => import('./pages/RoutesOfTheWeek'));
const Docs          = lazy(() => import('./pages/Docs'));
const Challenges    = lazy(() => import('./pages/Challenges'));
const Events        = lazy(() => import('./pages/Events'));
const LiveMap       = lazy(() => import('./pages/LiveMap'));
const Exam          = lazy(() => import('./pages/Exam'));
const Career        = lazy(() => import('./pages/Career'));
const Leave         = lazy(() => import('./pages/Leave'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const StaffApply    = lazy(() => import('./pages/StaffApply'));
const Legal         = lazy(() => import('./pages/Legal'));
const IFLive        = lazy(() => import('./pages/admin/IFLivePanel'));

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setPluginsLoaded] = useState(0);

  // which plugins are on (Admin › Plugins); the page redraws once it's known
  useEffect(() => {
    const refresh = () => pluginsApi.list().then(d => {
      (d.plugins || []).forEach(p => { features[p.id] = p.enabled; });
      setPluginsLoaded(n => n + 1);
    }).catch(() => {});
    refresh();
    window.addEventListener('plugins-changed', refresh);
    return () => window.removeEventListener('plugins-changed', refresh);
  }, []);

  useEffect(() => {
    if (darkMode) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('qv_token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await auth.me();
        if (data.user && data.user.status === 'approved') {
          setUser(data.user);
          prefetchStaticData();
        } else {
          clearToken();
          setUser(null);
        }
      } catch {
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const handleLogin = (token, userData) => {
    saveToken(token);
    setUser(userData);
    prefetchStaticData();
    registerPush()
      .then(result => console.log('Push registration result:', result))
      .catch(err => console.error('Push registration error:', err));
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
  };

  const handleUserUpdate = (updatedUser) => setUser(updatedUser);

  if (window.location.pathname === '/exam') {
    return (
      <Router>
        <Suspense fallback={<Loader fullPage size={100} />}>
          <Exam />
        </Suspense>
      </Router>
    );
  }

  if (loading) return <Loader fullPage size={100} />;

  if (!user) return (
    <Router>
      <Suspense fallback={<Loader fullPage size={100} />}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0.75rem 1rem 0' }}>
          <SiteBanner />
        </div>
        <Routes>
          <Route path="/signup"          element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/legal"           element={<Legal />} />
          <Route path="*"                element={<Login onLogin={handleLogin} />} />
        </Routes>
      </Suspense>
    </Router>
  );

  return (
    <Router>
      <TourProvider user={user} onComplete={() => setUser(u => ({ ...u, onboarding_complete: true }))}>
      <div className="App">
        {user?.must_change_password && (
          <ForcePasswordModal
            onDone={() => setUser(u => ({ ...u, must_change_password: false }))}
          />
        )}
        <TourOverlay />
        {canSeeEvents(user) && <EventPopup />}
        <Toast />
        <div className="app-layout">
          <Sidebar user={user} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} onLogout={handleLogout} />
          <div className="main-content">
            <Topbar user={user} onLogout={handleLogout} />
            <div className="main-content-inner">
            <SiteBanner />
            <Suspense fallback={<Loader fullPage />}>
            <Routes>
              <Route path="/"           element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"  element={<Dashboard user={user} />} />
              <Route path="/logbook"    element={<Logbook user={user} />} />
              <Route path="/statistics" element={<Statistics user={user} />} />
              <Route path="/routes"     element={<RoutesPage />} />
              <Route path="/rotw"       element={on('routesOfTheWeek', <RoutesOfTheWeek />)} />
              <Route path="/events"     element={on('events', canSeeEvents(user) ? <Events /> : <Navigate to="/dashboard" replace />)} />
              <Route path="/log-flight" element={<FilePirep user={user} />} />
              <Route path="/profile"    element={<Profile user={user} onUserUpdate={handleUserUpdate} />} />
              <Route path="/tools"      element={<Tools user={user} />} />
              <Route path="/docs"       element={<Docs user={user} />} />
              <Route path="/livemap"    element={<LiveMap />} />
              <Route path="/leave"      element={<Leave />} />
              <Route path="/career"     element={on('career', (user.role === 'admin' || user.role === 'staff' || user.role === 'beta_tester' || user.staff_role) ? <Career user={user} /> : <Navigate to="/dashboard" replace />)} />
              <Route path="/staff-apply" element={<StaffApply user={user} />} />
              <Route path="/legal"      element={<Legal user={user} />} />
              <Route path="/pilot/:id"  element={<PublicProfile currentUser={user} />} />
              {(user.role === 'admin' || user.staff_role || isDeveloper(user)) && (
                <>
                  <Route path="/admin"           element={<AdminPanel user={user} />} />
                  <Route path="/admin/pirep/:id" element={<PirepDetail user={user} />} />
                  <Route path="/admin/pilot/:id" element={<PilotDetail user={user} />} />
                </>
              )}
              {(user.role === 'admin' || isDeveloper(user)) && (
                <>
                  <Route path="/challenges" element={on('challenges', <Challenges user={user} />)} />
                  <Route path="/challenges/:id" element={on('challenges', <Challenges user={user} />)} />
                </>
              )}
              <Route path="/if-live" element={on('liveMode', (user.role === 'admin' || user.role === 'staff' || user.live_access || user.staff_role || isDeveloper(user)) ? <IFLive user={user} /> : <Navigate to="/dashboard" replace />)} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </Suspense>
            </div>
            <footer style={{
              borderTop: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              padding: '1rem 2rem',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              letterSpacing: '0.02em',
            }}>
              © {new Date().getFullYear()} {brand.name} - All rights reserved - <Link to="/legal" style={{ color: 'inherit' }}>Terms &amp; Privacy</Link>
            </footer>
          </div>
        </div>
      </div>
      </TourProvider>
    </Router>
  );
}

export default App;
