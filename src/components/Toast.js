/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';

let toastQueue = [];
let setToastsCallback = null;

export const showToast = (message, type = 'success') => {
  const id = Date.now();
  const toast = { id, message, type };
  toastQueue.push(toast);
  if (setToastsCallback) {
    setToastsCallback([...toastQueue]);
  }
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toastQueue = toastQueue.filter(t => t.id !== id);
    if (setToastsCallback) {
      setToastsCallback([...toastQueue]);
    }
  }, 3000);
};

function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    setToastsCallback = setToasts;
    return () => {
      setToastsCallback = null;
    };
  }, []);

  const removeToast = (id) => {
    toastQueue = toastQueue.filter(t => t.id !== id);
    setToasts([...toastQueue]);
  };

  return (
    <div style={{
      position: 'fixed',
      top: '2rem',
      right: '2rem',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          style={{
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            backgroundColor: toast.type === 'success' ? '#2e7d32' : 
                           toast.type === 'error' ? '#c62828' : 
                           '#1976d2',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.95rem',
            minWidth: '300px',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default Toast;