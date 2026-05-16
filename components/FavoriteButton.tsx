'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function FavoriteButton({ propertyId }: { propertyId: string }) {
  const [userId, setUserId]       = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const client = createClient();
    client.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      client
        .from('user_favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('property_id', propertyId)
        .maybeSingle()
        .then(({ data }) => {
          setFavorited(!!data);
          setLoading(false);
        });
    });
  }, [propertyId]);

  const toggle = async () => {
    if (!userId || loading) return;
    const client = createClient();
    setLoading(true);
    if (favorited) {
      await client
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('property_id', propertyId);
      setFavorited(false);
    } else {
      await client
        .from('user_favorites')
        .insert({ user_id: userId, property_id: propertyId });
      setFavorited(true);
    }
    setLoading(false);
  };

  if (!userId) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex items-center justify-center gap-1.5 w-full py-3 rounded-xl border text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
      style={favorited
        ? { backgroundColor: '#fef9c3', borderColor: '#f59e0b', color: '#b45309' }
        : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}
    >
      <span className="text-lg leading-none">{favorited ? '★' : '☆'}</span>
      {favorited ? 'お気に入り登録済み' : 'お気に入りに追加'}
    </button>
  );
}
