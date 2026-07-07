'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface Props {
  title: string;
  backHref?: string;
  right?: React.ReactNode;
}

const MENU_ITEMS = [
  { href: '/report',        label: '日報',       icon: '📝' },
  { href: '/line-reports',  label: '未処理報告', icon: '📨' },
  { href: '/account',       label: 'アカウント', icon: '👤' },
];

export default function Header({ title, backHref, right }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // ページ遷移時にメニューを閉じる
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <header
        className="flex items-center h-14 px-4 shrink-0"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        {backHref && (
          <Link href={backHref} className="mr-3 text-white text-2xl leading-none font-light">
            ‹
          </Link>
        )}
        <h1 className="text-white font-bold text-lg flex-1 truncate">{title}</h1>
        {right && <div className="ml-2">{right}</div>}

        {/* ハンバーガーボタン */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-3 flex flex-col justify-center items-center gap-1.5 w-8 h-8 shrink-0"
          aria-label="メニュー"
        >
          <span className={`block w-5 h-0.5 bg-white transition-all origin-center ${open ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-0.5 bg-white transition-all ${open ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-white transition-all origin-center ${open ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </header>

      {/* オーバーレイ */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
        />
      )}

      {/* スライドインメニュー */}
      <div
        className={`fixed top-0 right-0 h-full w-64 bg-white z-50 shadow-2xl transition-transform duration-200
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-14 flex items-center px-4" style={{ backgroundColor: '#1a1a2e' }}>
          <span className="text-white font-bold text-sm">メニュー</span>
        </div>
        <nav className="p-4 space-y-1">
          {MENU_ITEMS.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors
                ${pathname.startsWith(href)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100 active:bg-gray-100'}`}
            >
              <span className="text-xl">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
