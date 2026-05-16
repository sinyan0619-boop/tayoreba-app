'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Case, getHaitoKigen, HAITO_KIGEN_COLORS } from '@/types';
import { RankBadge, StatusBadge } from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase-browser';

const LS_KEY = 'tayoreba_last_seen';

export default function CasesList({ cases }: { cases: Case[] }) {
  const [lastSeen, setLastSeen]       = useState<string | null>(null);
  const [favorites, setFavorites]     = useState<Set<string>>(new Set());
  const [favOnly, setFavOnly]         = useState(false);

  useEffect(() => {
    const prev = localStorage.getItem(LS_KEY);
    setLastSeen(prev);
    const t = setTimeout(() => {
      localStorage.setItem(LS_KEY, new Date().toISOString());
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const client = createClient();
    client.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      client
        .from('user_favorites')
        .select('property_id')
        .eq('user_id', user.id)
        .then(({ data }) => {
          setFavorites(new Set((data ?? []).map((r) => r.property_id)));
        });
    });
  }, []);

  const isNew = (c: Case) => {
    if (!lastSeen || !c.updatedAt) return false;
    return new Date(c.updatedAt) > new Date(lastSeen);
  };

  const displayed = favOnly ? cases.filter((c) => favorites.has(c.id)) : cases;

  return (
    <div className="flex flex-col">
      {/* お気に入りフィルター */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white flex items-center gap-2">
        <button
          onClick={() => setFavOnly((v) => !v)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
            ${favOnly
              ? 'bg-amber-50 border-amber-400 text-amber-700'
              : 'bg-white border-gray-200 text-gray-500'}`}
        >
          <span>{favOnly ? '★' : '☆'}</span>
          お気に入りのみ
        </button>
        {favOnly && (
          <span className="text-xs text-gray-400">{displayed.length}件</span>
        )}
      </div>

      <div className="divide-y divide-gray-100 bg-white">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-1">
            <span className="text-2xl">☆</span>
            お気に入りがありません
          </div>
        ) : displayed.map((c) => (
          <Link
            key={c.id}
            href={`/case/${c.id}`}
            className="flex items-center px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <RankBadge rank={c.rank} />
            <div className="ml-3 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-900">{c.ownerName}</span>
                {favorites.has(c.id) && (
                  <span className="text-amber-400 text-xs leading-none">★</span>
                )}
                {isNew(c) && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none shrink-0">
                    NEW
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">{c.address}</div>
              {c.visits.length > 0 && (
                <div className="text-xs text-gray-400 mt-0.5">
                  最終訪問: {c.visits[c.visits.length - 1].date}
                </div>
              )}
            </div>
            <div className="ml-2 flex items-center gap-2 shrink-0">
              {(() => {
                const kigen = getHaitoKigen(c.haitoDate);
                return kigen ? (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium leading-none"
                    style={{ backgroundColor: HAITO_KIGEN_COLORS[kigen] }}
                  >
                    {kigen}
                  </span>
                ) : null;
              })()}
              <StatusBadge status={c.status} size="sm" />
              <span className="text-gray-400">›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
