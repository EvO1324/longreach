/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState } from 'react';

function UserAvatar({ user, size = 32, fontSize = '0.875rem' }) {
  const [imgError, setImgError] = useState(false);

  const ifcUrl = user?.ifc_username && !imgError
    ? `https://community.infiniteflight.com/user_avatar/community.infiniteflight.com/${user.ifc_username.toLowerCase()}/288/1487666_2.png`
    : null;

  if (ifcUrl) {
    return (
      <img
        src={ifcUrl}
        alt={user.first_name}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
        }}
      />
    );
  }

  // Fallback to letter avatar
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--avg-green) 0%, var(--avg-green-dark) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontWeight: 600,
      fontSize,
      flexShrink: 0,
    }}>
      {user?.first_name?.charAt(0) || 'A'}
    </div>
  );
}

export default UserAvatar;
