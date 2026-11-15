'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
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
      body: JSON.stringify({ email, password, expectedRole: 'ADMIN' }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Login failed');
    } else {
      router.push('/admin/home');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-8 shadow-md">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Admin Portal Login</h2>
        {error && <p className="mb-4 text-red-400 text-sm">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-red-600 py-2 text-white font-semibold hover:bg-red-500"
          >
            Login as Admin
          </button>
        </form>
      </div>
    </div>
  );
}
