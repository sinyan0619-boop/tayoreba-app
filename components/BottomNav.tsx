'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

function buildHrefFromFilter(base: string): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem('tayoreba_case_filter') ?? '{}');
    const p = new URLSearchParams();
    if (saved.status)     p.set('status',      saved.status);
    if (saved.haitoKigen) p.set('haito_kigen', saved.haitoKigen);
    if (saved.pref)       p.set('pref',        saved.pref);
    if (saved.assignee)   p.set('assignee',    saved.assignee);
    if (saved.q)          p.set('q',           saved.q);
    if (saved.rank)       p.set('rank',        saved.rank);
    return p.toString() ? `${base}?${p.toString()}` : base;
  } catch { return base; }
}

export default function BottomNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    const client = createClient();
    const base = new Date();
    base.setMonth(base.getMonth() - 3);
    const rangeStart = base.toISOString().split('T')[0];
    const rangeEnd   = new Date(base.getTime() + 7 * 86400000).toISOString().split('T')[0];
    client
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .gte('haito_date', rangeStart)
      .lte('haito_date', rangeEnd)
      .then(({ count }) => setUrgentCount(count ?? 0));
  }, [pathname]);

  if (pathname === '/login') return null;

  const items = [
    { base: '/map',   label: '地図', icon: '🗺️' },
    { base: '/cases', label: '案件', icon: '📋' },
  ];

  return (
    <nav className="flex border-t border-gray-200 bg-white shrink-0">
      {items.map(({ base, label, icon }) => {
        const isActive  = pathname.startsWith(base);
        const showBadge = base === '/cases' && urgentCount > 0;
        return (
          <button
            key={base}
            onClick={() => router.push(buildHrefFromFilter(base))}
            className={`flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors
              ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
          >
            <span className="text-xl mb-0.5 relative inline-block">
              {icon}
              {showBadge && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
                  {urgentCount}
                </span>
              )}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
