'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import AuthLayout, { Field } from '@/components/shell/AuthLayout';
import { useT } from '@/lib/dynamic-text';

const STEPS = ['E-mail', 'Code', 'Terminé'];

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(1); // 1 : demander le code, 2 : nouveau mot de passe, 3 : termine
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Envoi du code impossible');
      setMessage(`${data.message} (en développement, le code s’affiche dans la console du serveur)`);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi du code impossible. Réessayez.');
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, token, newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Réinitialisation impossible');
      setMessage('Mot de passe réinitialisé. Vous pouvez vous connecter.');
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Réinitialisation impossible. Réessayez.');
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Recevez un code à 6 chiffres pour choisir un nouveau mot de passe."
      footer={<>{t('Vous vous en souvenez ?')} <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">{t('Se connecter')}</Link></>}
    >
      <ol className="mb-7 flex items-center gap-2" aria-label={t('Étapes')}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i + 1 < step ? 'bg-emerald-500 text-white' : i + 1 === step ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {i + 1 < step ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-xs font-semibold ${i + 1 <= step ? 'text-slate-800' : 'text-slate-400'}`}>{t(s)}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${i + 1 < step ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
          </li>
        ))}
      </ol>

      <div className="space-y-5">
        {error && <div role="alert" className="eg-alert eg-alert-error">{error}</div>}
        {message && <div role="status" className="eg-alert eg-alert-success">{message}</div>}

        {step === 1 && (
          <form className="space-y-5" onSubmit={handleRequestCode}>
            <Field label="Adresse e-mail" icon="mail">
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@itbs.tn" className="eg-input ps-10" />
            </Field>
            <button type="submit" disabled={loading} className="eg-btn eg-btn-primary eg-btn-lg w-full">{loading ? t('Envoi…') : t('Recevoir le code')}</button>
          </form>
        )}

        {step === 2 && (
          <form className="space-y-5" onSubmit={handleResetPassword}>
            <Field label="Code à 6 chiffres" icon="key">
              <input type="text" required inputMode="numeric" autoComplete="one-time-code" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456" className="eg-input ps-10 font-mono tracking-[0.4em]" />
            </Field>
            <Field label="Nouveau mot de passe" icon="lock">
              <input type="password" required minLength={6} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="eg-input ps-10" />
            </Field>
            <button type="submit" disabled={loading} className="eg-btn eg-btn-primary eg-btn-lg w-full">{loading ? t('Réinitialisation…') : t('Réinitialiser le mot de passe')}</button>
          </form>
        )}

        {step === 3 && <Link href="/login" className="eg-btn eg-btn-primary eg-btn-lg w-full">{t('Aller à la connexion')} <Icon name="arrowRight" className="h-4 w-4" /></Link>}
      </div>
    </AuthLayout>
  );
}
