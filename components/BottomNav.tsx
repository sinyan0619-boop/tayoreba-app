'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

const navItems = [
  { href: '/map',   label: '地図', icon: '🗺️' },
  { href: '/cases', label: '案件', icon: '📋' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    const client = createClient();
    // タイムリミット = haito_date + 3ヶ月。その1週間前にアラート
    // → haito_date が (今日-3ヶ月) 〜 (今日-3ヶ月+7日) の範囲
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

  return (
    <nav className="flex border-t border-gray-200 bg-white shrink-0">
      {navItems.map(({ href, label, icon }) => {
        const isActive =
          href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);
        const showBadge = href === '/cases' && urgentCount > 0;
        return (
          <Link
            key={href}
            href={href}
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
          </Link>
        );
      })}
    </nav>
  );
}
