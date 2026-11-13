/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App';

const Embed = React.lazy(() => import('./pages/Embed'));

// Website embeds (/embed/<widget>) skip the app: no login, no sidebar
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  window.location.pathname.startsWith('/embed/')
    ? <React.Suspense fallback={null}><Embed /></React.Suspense>
    : <App />
);

