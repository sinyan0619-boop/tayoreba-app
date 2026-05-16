import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import { FavoritesProvider } from '@/contexts/FavoritesContext';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'たよれば',
  description: '不動産任意売却の営業チーム向けPWA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'たよれば',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1a1a2e',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${geist.variable} h-full`}>
      <body className="h-full bg-gray-100 antialiased">
        <FavoritesProvider>
          <div className="flex flex-col h-dvh max-w-[430px] mx-auto bg-gray-50 shadow-xl">
            <div className="flex-1 min-h-0">{children}</div>
            <BottomNav />
          </div>
        </FavoritesProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))}`,
          }}
        />
      </body>
    </html>
  );
}
