'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: '今日', icon: '🏠' },
  { href: '/map', label: '地図', icon: '🗺️' },
  { href: '/cases', label: '案件', icon: '📋' },
  { href: '/report', label: '日報', icon: '📝' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex border-t border-gray-200 bg-white shrink-0">
      {navItems.map(({ href, label, icon }) => {
        const isActive =
          href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors
              ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
          >
            <span className="text-xl mb-0.5">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
