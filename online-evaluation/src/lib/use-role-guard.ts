'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const roleRoutes: Record<string, string> = { ADMIN: '/admin/home', TEACHER: '/teacher/home', STUDENT: '/student/home' };

export function useRoleGuard(expectedRole: 'ADMIN' | 'TEACHER' | 'STUDENT') {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data.user) router.replace('/');
        else if (data.user.role !== expectedRole) router.replace(roleRoutes[data.user.role] || '/');
      })
      .catch(() => { if (active) router.replace('/'); });
    return () => { active = false; };
  }, [expectedRole, router]);
}
