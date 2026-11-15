'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StudentLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Login failed');
    } else {
      const destinations: Record<string, string> = { ADMIN: '/admin/home', TEACHER: '/teacher/home', STUDENT: '/student/home' };
      router.replace(destinations[data.user?.role] || '/');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Student Portal Login</h2>
        {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-blue-600 py-2 text-white font-semibold hover:bg-blue-500"
          >
            Login as Student
          </button>
        </form>
      </div>
    </div>
  );
}
