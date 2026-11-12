/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { useMemo } from 'react';
import { isDeveloper } from '../components/DeveloperBadge';

export function usePermissions(user) {
  return useMemo(() => {
    if (!user) return { can: () => false, isAdmin: false, isStaff: false, hasStaffAccess: false };

    const isDev = isDeveloper(user);
    const isAdmin = user.role === 'admin' || isDev;
    // Staff = any user with a staff_role assigned, regardless of role field
    const isStaff = !!(user.staff_role);
    const permissions = user.staff_permissions || [];

    const can = (permission) => {
      if (isAdmin) return true;
      if (isStaff) return permissions.includes(permission);
      return false;
    };

    const canAny = (...perms) => perms.some(p => can(p));

    return { can, canAny, isAdmin, isStaff, hasStaffAccess: isAdmin || isStaff };
  }, [user]);
}
