'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import AuthLayout, { Field } from '@/components/shell/AuthLayout';

const ROLES = [
  { value: 'STUDENT', icon: 'cap', title: 'Étudiant', text: 'Passer des examens' },
  { value: 'TEACHER', icon: 'pen', title: 'Enseignant', text: 'Créer et surveiller' },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const strength = Math.min(4, [password.length >= 6, password.length >= 10, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d|[^\w]/.test(password)].filter(Boolean).length);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Inscription impossible');
      router.push(role === 'TEACHER' ? '/teacher/home' : '/student/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inscription impossible. Réessayez.');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Rejoignez la plateforme d’évaluation de l’ITBS en moins d’une minute."
      footer={<>Déjà inscrit ? <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">Se connecter</Link></>}
    >
      <form onSubmit={handleRegister} className="space-y-5">
        {error && <div role="alert" className="eg-alert eg-alert-error flex items-start gap-2"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        <div>
          <span className="eg-label">Je suis</span>
          <div className="grid grid-cols-2 gap-3" role="radiogroup">
            {ROLES.map((r) => (
              <button key={r.value} type="button" role="radio" aria-checked={role === r.value} onClick={() => setRole(r.value)}
                className={`flex items-center gap-3 rounded-xl p-3 text-start ring-1 transition ${role === r.value ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${role === r.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon name={r.icon} className="h-[18px] w-[18px]" /></span>
                <span><span className="block text-sm font-semibold text-slate-900">{r.title}</span><span className="block text-xs text-slate-500">{r.text}</span></span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Nom complet" icon="user">
          <input type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" className="eg-input ps-10" />
        </Field>
        <Field label="Adresse e-mail" icon="mail">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@itbs.tn" className="eg-input ps-10" />
        </Field>
        <Field label="Mot de passe" icon="lock" hint="6 caractères minimum.">
          <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="eg-input ps-10" />
        </Field>
        {password && (
          <div className="flex items-center gap-2" aria-label="Robustesse du mot de passe">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? ['bg-rose-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'][strength - 1] : 'bg-slate-200'}`} />)}
            <span className="w-14 text-end text-xs font-medium text-slate-500">{['Faible', 'Faible', 'Moyen', 'Bon', 'Fort'][strength]}</span>
          </div>
        )}
        <button type="submit" disabled={loading} className="eg-btn eg-btn-primary eg-btn-lg w-full">
          {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Création du compte…</> : <>Créer mon compte <Icon name="arrowRight" className="h-4 w-4" /></>}
        </button>
      </form>
    </AuthLayout>
  );
}
