'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import AuthLayout, { Field } from './AuthLayout';

const DESTINATIONS: Record<string, string> = { ADMIN: '/admin/home', TEACHER: '/teacher/home', STUDENT: '/student/home' };

export default function LoginForm({ expectedRole, title = 'Connexion', subtitle, badge }: {
  expectedRole?: 'ADMIN' | 'TEACHER' | 'STUDENT'; title?: string; subtitle?: string; badge?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expectedRole ? { email, password, expectedRole } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Adresse e-mail ou mot de passe incorrect');
      router.replace(DESTINATIONS[data.user?.role] || '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible. Réessayez.');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={title}
      badge={badge}
      subtitle={subtitle ?? 'Heureux de vous revoir. Connectez-vous pour accéder à votre espace.'}
      footer={<>Pas encore de compte ? <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">Créer un compte</Link></>}
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <div role="alert" className="eg-alert eg-alert-error flex items-start gap-2"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        <Field label="Adresse e-mail" icon="mail">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@itbs.tn" className="eg-input ps-10" />
        </Field>
        <Field label="Mot de passe" icon="lock">
          <input type={show ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="eg-input ps-10 pe-11" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
            <Icon name="eye" className="h-4 w-4" />
          </button>
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">Mot de passe oublié ?</Link>
        </div>
        <button type="submit" disabled={loading} className="eg-btn eg-btn-primary eg-btn-lg w-full">
          {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Connexion…</> : <>Se connecter <Icon name="arrowRight" className="h-4 w-4" /></>}
        </button>
      </form>
    </AuthLayout>
  );
}
