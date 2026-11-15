'use client';

import { useRouter, usePathname } from 'next/navigation';
import type { Language } from '@/lib/i18n';
import { useLang, useSetLang, useT } from '@/lib';

export type SidebarNavItem = {
  href: string;
  icon: string;
  label: string;
  color: 'sky' | 'emerald' | 'amber' | 'violet' | 'purple' | 'orange' | 'teal' | 'rose';
};

const NAV_COLORS: Record<SidebarNavItem['color'], { active: string; hover: string }> = {
  sky: { active: 'bg-sky-600 text-white shadow-md shadow-sky-600/25', hover: 'hover:bg-sky-50 hover:text-sky-700' },
  emerald: { active: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25', hover: 'hover:bg-emerald-50 hover:text-emerald-700' },
  amber: { active: 'bg-amber-500 text-white shadow-md shadow-amber-500/25', hover: 'hover:bg-amber-50 hover:text-amber-700' },
  violet: { active: 'bg-violet-600 text-white shadow-md shadow-violet-600/25', hover: 'hover:bg-violet-50 hover:text-violet-700' },
  purple: { active: 'bg-purple-600 text-white shadow-md shadow-purple-600/25', hover: 'hover:bg-purple-50 hover:text-purple-700' },
  orange: { active: 'bg-orange-500 text-white shadow-md shadow-orange-500/25', hover: 'hover:bg-orange-50 hover:text-orange-700' },
  teal: { active: 'bg-teal-600 text-white shadow-md shadow-teal-600/25', hover: 'hover:bg-teal-50 hover:text-teal-700' },
  rose: { active: 'bg-rose-600 text-white shadow-md shadow-rose-600/25', hover: 'hover:bg-rose-50 hover:text-rose-700' },
};

const ACCENTS = {
  emerald: { title: 'from-emerald-600 to-teal-600', active: 'text-emerald-600' },
  purple: { title: 'from-purple-600 to-indigo-600', active: 'text-purple-600' },
  indigo: { title: 'from-indigo-600 to-blue-600', active: 'text-indigo-600' },
} as const;

type Props = {
  title: string;
  items: SidebarNavItem[];
  accent?: keyof typeof ACCENTS;
  subtitle?: string;
  logo?: React.ReactNode;
  showLangSwitcher?: boolean;
};

export default function WorkspaceSidebar({ title, items, accent = 'emerald', subtitle, logo, showLangSwitcher = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const lang = useLang();
  const setLang = useSetLang();
  const t = useT();
  const theme = ACCENTS[accent];

  const changeLanguage = (newLang: Language) => setLang(newLang);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  };

  return (
    <aside className="w-80 shrink-0 sticky top-0 h-screen border-r border-slate-200 bg-white p-6 flex flex-col justify-between shadow-sm overflow-y-auto">
      <div>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {logo}
            <div>
              <h1 className={`text-xl font-black bg-gradient-to-r ${theme.title} bg-clip-text text-transparent`}>{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{t(subtitle)}</p>}
            </div>
          </div>
          {showLangSwitcher && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
              <button onClick={() => changeLanguage('en')} className={`px-2 py-1 rounded ${lang === 'en' ? `bg-white shadow ${theme.active}` : 'text-slate-600'}`}>EN</button>
              <button onClick={() => changeLanguage('fr')} className={`px-2 py-1 rounded ${lang === 'fr' ? `bg-white shadow ${theme.active}` : 'text-slate-600'}`}>FR</button>
              <button onClick={() => changeLanguage('ar')} className={`px-2 py-1 rounded ${lang === 'ar' ? `bg-white shadow ${theme.active}` : 'text-slate-600'}`}>AR</button>
            </div>
          )}
        </div>
        <nav className="space-y-1.5">
          {items.map((item) => {
            const isActive = pathname === item.href;
            const colors = NAV_COLORS[item.color];
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full text-left rounded-xl px-4 py-3 font-semibold transition-all ${isActive ? colors.active : `text-slate-600 ${colors.hover}`}`}
              >
                {item.icon} {t(item.label)}
              </button>
            );
          })}
        </nav>
      </div>
      <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-all">
        🚪 {t('Logout')}
      </button>
    </aside>
  );
}
