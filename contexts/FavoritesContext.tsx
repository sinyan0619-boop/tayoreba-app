'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

interface FavoritesCtx {
  favorites: Set<string>;
  toggle: (propertyId: string) => Promise<void>;
  isFav: (propertyId: string) => boolean;
}

const Ctx = createContext<FavoritesCtx>({
  favorites: new Set(),
  toggle: async () => {},
  isFav: () => false,
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId]       = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fetchFavs = useCallback(async (uid: string) => {
    const client = createClient();
    const { data } = await client
      .from('user_favorites')
      .select('property_id')
      .eq('user_id', uid);
    setFavorites(new Set((data ?? []).map((r: any) => r.property_id)));
  }, []);

  useEffect(() => {
    const client = createClient();
    client.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      setUserId(session.user.id);
      fetchFavs(session.user.id);
    });
  }, [fetchFavs]);

  const toggle = useCallback(async (propertyId: string) => {
    if (!userId) return;
    const client = createClient();
    if (favorites.has(propertyId)) {
      await client.from('user_favorites').delete()
        .eq('user_id', userId).eq('property_id', propertyId);
      setFavorites((prev) => { const next = new Set(prev); next.delete(propertyId); return next; });
    } else {
      await client.from('user_favorites').insert({ user_id: userId, property_id: propertyId });
      setFavorites((prev) => new Set([...prev, propertyId]));
    }
  }, [userId, favorites]);

  return (
    <Ctx.Provider value={{ favorites, toggle, isFav: (id) => favorites.has(id) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useFavorites = () => useContext(Ctx);
