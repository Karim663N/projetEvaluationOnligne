'use client';

// Cadre commun des espaces etudiant / enseignant / administrateur :
// barre laterale sombre (navigation groupee, compteurs, profil, langue), barre superieure
// (fil d'Ariane, recherche rapide Ctrl+K) et tiroir de navigation sur mobile.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Language } from '@/lib/i18n';
import { useLang } from '@/lib/use-lang';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Brand } from '@/components/ui/kit';

export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
type L10n = Record<Language, string>;
interface NavItem { key: string; href: string; icon: string; label: L10n; tab?: boolean; count?: 'alerts' | 'grading' }
interface NavSection { label: L10n; items: NavItem[] }

const l = (fr: string, en: string, ar: string): L10n => ({ fr, en, ar });

const NAV: Record<Role, NavSection[]> = {
  STUDENT: [
    { label: l('Apprentissage', 'Learning', 'التعلم'), items: [
      { key: 'exams', href: '/student/home', icon: 'dashboard', label: l('Tableau de bord', 'Dashboard', 'لوحة التحكم'), tab: true },
      { key: 'classes', href: '/student/home?tab=classes', icon: 'users', label: l('Mes classes', 'My classes', 'فصولي'), tab: true },
      { key: 'results', href: '/student/results', icon: 'chart', label: l('Résultats', 'Results', 'النتائج') },
      { key: 'certificates', href: '/student/certificates', icon: 'award', label: l('Certificats', 'Certificates', 'الشهادات') },
    ] },
    { label: l('Carrière', 'Career', 'المسار المهني'), items: [
      { key: 'cv', href: '/student/home?tab=cv', icon: 'exam', label: l('Mon CV', 'My CV', 'سيرتي الذاتية'), tab: true },
      { key: 'recommendations', href: '/student/recommendations', icon: 'sparkles', label: l('Recommandations IA', 'AI recommendations', 'توصيات الذكاء الاصطناعي') },
    ] },
    { label: l('Compte', 'Account', 'الحساب'), items: [
      { key: 'profile', href: '/student/home?tab=profile', icon: 'user', label: l('Profil & badges', 'Profile & badges', 'الملف والشارات'), tab: true },
    ] },
  ],
  TEACHER: [
    { label: l('Enseignement', 'Teaching', 'التدريس'), items: [
      { key: 'exams', href: '/teacher/home', icon: 'exam', label: l('Examens', 'Exams', 'الامتحانات') },
      { key: 'classes', href: '/teacher/classes', icon: 'users', label: l('Classes', 'Classes', 'الفصول') },
      { key: 'grading', href: '/teacher/grading', icon: 'pen', label: l('Correction', 'Grading', 'التصحيح'), count: 'grading' },
    ] },
    { label: l('Intégrité', 'Integrity', 'النزاهة'), items: [
      { key: 'surveillance', href: '/teacher/surveillance', icon: 'shield', label: l('Surveillance IA', 'AI proctoring', 'المراقبة الذكية'), count: 'alerts' },
    ] },
    { label: l('Compte', 'Account', 'الحساب'), items: [
      { key: 'profile', href: '/teacher/profile', icon: 'user', label: l('Profil', 'Profile', 'الملف الشخصي') },
    ] },
  ],
  ADMIN: [
    { label: l('Plateforme', 'Platform', 'المنصة'), items: [
      { key: 'users', href: '/admin/home', icon: 'users', label: l('Utilisateurs', 'Users', 'المستخدمون') },
      { key: 'classes', href: '/admin/classes', icon: 'cap', label: l('Classes', 'Classes', 'الفصول') },
      { key: 'badges', href: '/admin/badges', icon: 'award', label: l('Badges', 'Badges', 'الشارات') },
    ] },
    { label: l('Système', 'System', 'النظام'), items: [
      { key: 'system', href: '/admin/system', icon: 'settings', label: l('Paramètres & journal', 'Settings & logs', 'الإعدادات والسجل') },
    ] },
  ],
};

const ROLE_LABEL: Record<Role, L10n> = {
  STUDENT: l('Espace étudiant', 'Student space', 'فضاء الطالب'),
  TEACHER: l('Espace enseignant', 'Teacher space', 'فضاء الأستاذ'),
  ADMIN: l('Administration', 'Administration', 'الإدارة'),
};
const UI = {
  search: l('Rechercher une page…', 'Search a page…', 'ابحث عن صفحة…'),
  logout: l('Déconnexion', 'Log out', 'تسجيل الخروج'),
  noResult: l('Aucune page ne correspond.', 'No matching page.', 'لا توجد صفحة مطابقة.'),
  go: l('Aller à', 'Go to', 'انتقل إلى'),
};

export default function AppShell({ role, active, onSelect, actions, children }: {
  role: Role;
  /** cle de l'element de navigation actif */
  active: string;
  /** navigation interne (onglets d'une meme page) : si fourni, les elements "tab" appellent ce rappel */
  onSelect?: (key: string) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [lang, setLang] = useLang();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [counts, setCounts] = useState<{ alerts?: number; grading?: number }>({});
  const sections = NAV[role];
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const current = items.find((i) => i.key === active);
  const rtl = lang === 'ar';

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => d.user && setUser(d.user)).catch(() => {});
    if (role !== 'TEACHER') return;
    // compteurs de la barre laterale : alertes a examiner, copies a corriger
    fetch('/api/teacher/proctoring', { cache: 'no-store' }).then((r) => r.json())
      .then((d) => setCounts((c) => ({ ...c, alerts: (d.reports || []).filter((x: { alert: boolean; status: string }) => x.alert && x.status === 'PENDING').length })))
      .catch(() => {});
    fetch('/api/teacher/submissions', { cache: 'no-store' }).then((r) => r.json())
      .then((d) => setCounts((c) => ({ ...c, grading: (d.submissions || []).filter((x: { status: string }) => x.status === 'SUBMITTED').length })))
      .catch(() => {});
  }, [role, pathname]);

  useEffect(() => { setDrawer(false); }, [pathname, active]);

  // recherche rapide : Ctrl+K / Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === 'Escape') { setPalette(false); setDrawer(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = useCallback((item: NavItem) => {
    setPalette(false);
    setDrawer(false);
    if (item.tab && onSelect) onSelect(item.key);
    else router.push(item.href);
  }, [onSelect, router]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  };

  const sidebar = (
    <div className="relative flex h-full flex-col overflow-hidden bg-ink-950 text-slate-300">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 eg-aurora opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-transparent to-ink-950" />
      <div className="relative flex items-center justify-between px-5 pb-4 pt-5">
        <Link href={items[0]?.href ?? '/'} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow-400"><Brand dark /></Link>
        <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Fermer le menu"><Icon name="x" /></button>
      </div>

      <div className="relative mx-4 mb-4 flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10 backdrop-blur">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
        <span className="text-xs font-semibold text-white">{ROLE_LABEL[role][lang]}</span>
        <button onClick={() => setPalette(true)} className="ms-auto flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-white/20" title={UI.search[lang]}>
          <Icon name="search" className="h-3 w-3" strokeWidth={2.4} /> Ctrl K
        </button>
      </div>

      <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
        {sections.map((section) => (
          <div key={section.label.fr}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{section.label[lang]}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.key === active;
                const n = item.count ? counts[item.count] : undefined;
                const content = (
                  <>
                    {isActive && <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-gradient-to-b from-brand-400 to-glow-400" />}
                    <Icon name={item.icon} className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-glow-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span className="truncate">{item.label[lang]}</span>
                    {!!n && <span className={`ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${item.count === 'alerts' ? 'bg-rose-500 text-white' : 'bg-amber-400 text-ink-950'}`}>{n}</span>}
                  </>
                );
                const cls = `group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition ${isActive ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`;
                return (
                  <li key={item.key}>
                    {item.tab && onSelect
                      ? <button type="button" onClick={() => go(item)} className={cls} aria-current={isActive ? 'page' : undefined}>{content}</button>
                      : <Link href={item.href} className={cls} aria-current={isActive ? 'page' : undefined}>{content}</Link>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="relative space-y-3 border-t border-white/10 p-4">
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/10" role="group" aria-label="Langue">
          <Icon name="globe" className="mx-1.5 h-4 w-4 text-slate-500" />
          {(['fr', 'en', 'ar'] as Language[]).map((code) => (
            <button key={code} onClick={() => setLang(code)} aria-pressed={lang === code}
              className={`flex-1 rounded-lg py-1 text-[11px] font-bold transition ${lang === code ? 'bg-white text-ink-950' : 'text-slate-400 hover:text-white'}`}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-xl px-1">
          <Avatar name={user?.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{user?.name ?? '…'}</p>
            <p className="truncate text-[11px] text-slate-500">{user?.email ?? ''}</p>
          </div>
          <button onClick={logout} title={UI.logout[lang]} aria-label={UI.logout[lang]} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300">
            <Icon name="logout" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    // lang + dir : le CSS compile retourne les proprietes logiques (start/end) selon :lang()
    <div dir={rtl ? 'rtl' : 'ltr'} lang={lang} className="min-h-screen lg:ps-[272px]">
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[272px] lg:block print:hidden">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm animate-fade-in" onClick={() => setDrawer(false)} aria-label="Fermer le menu" />
          <aside className="relative h-full w-[280px] max-w-[85vw] animate-slide-in shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#f5f6fb]/80 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-8">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-slate-600 hover:bg-white lg:hidden" aria-label="Ouvrir le menu"><Icon name="menu" /></button>
          <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Fil d'Ariane">
            <span className="hidden text-slate-400 sm:inline">{ROLE_LABEL[role][lang]}</span>
            <Icon name={rtl ? 'chevronLeft' : 'chevronRight'} className="hidden h-4 w-4 text-slate-300 sm:block" />
            <span className="truncate font-semibold text-slate-900">{current?.label[lang]}</span>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            {actions}
            <button onClick={() => setPalette(true)} className="hidden items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-400 ring-1 ring-slate-200 transition hover:text-slate-600 hover:ring-slate-300 md:flex">
              <Icon name="search" className="h-4 w-4" /> <span className="w-36 text-start">{UI.search[lang]}</span>
              <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500">Ctrl K</kbd>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 animate-fade-up md:px-8 md:py-8">{children}</main>

      {palette && <CommandPalette items={items} lang={lang} onClose={() => setPalette(false)} onGo={go} />}
    </div>
  );
}

function CommandPalette({ items, lang, onClose, onGo }: { items: NavItem[]; lang: Language; onClose: () => void; onGo: (i: NavItem) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const list = items.filter((i) => i.label[lang].toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-950/50 p-4 pt-[14vh] backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 animate-fade-up" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={UI.search[lang]}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Icon name="search" className="h-5 w-5 text-slate-400" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder={UI.search[lang]}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === 'Enter' && list[sel]) onGo(list[sel]);
            }}
            className="h-14 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400" />
          <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Échap</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">{UI.noResult[lang]}</li>}
          {list.map((item, i) => (
            <li key={item.key}>
              <button onMouseEnter={() => setSel(i)} onClick={() => onGo(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm ${i === sel ? 'bg-brand-50 text-brand-800' : 'text-slate-700'}`}>
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${i === sel ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon name={item.icon} className="h-4 w-4" /></span>
                <span className="font-medium">{item.label[lang]}</span>
                <span className="ms-auto text-xs text-slate-400">{UI.go[lang]} ↵</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
