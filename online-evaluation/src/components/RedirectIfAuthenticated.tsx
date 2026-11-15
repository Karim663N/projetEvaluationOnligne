'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const DESTINATIONS: Record<string, string> = {
  ADMIN: '/admin/home',
  TEACHER: '/teacher/home',
  STUDENT: '/student/home',
};

/**
 * If a valid session cookie already exists, sends the user to their
 * workspace instead of showing the login form. Render inside login pages.
 */
export default function RedirectIfAuthenticated() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user?.role) {
          router.replace(DESTINATIONS[data.user.role] || '/');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
