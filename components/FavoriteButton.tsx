'use client';
import { useFavorites } from '@/contexts/FavoritesContext';

export default function FavoriteButton({ propertyId }: { propertyId: string }) {
  const { isFav, toggle } = useFavorites();
  const favorited = isFav(propertyId);

  return (
    <button
      onClick={() => toggle(propertyId)}
      className="flex items-center justify-center gap-1.5 w-full py-3 rounded-xl border text-sm font-medium transition-all active:scale-95"
      style={favorited
        ? { backgroundColor: '#fef9c3', borderColor: '#f59e0b', color: '#b45309' }
        : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}
    >
      <span className="text-lg leading-none">{favorited ? '★' : '☆'}</span>
      {favorited ? 'お気に入り登録済み' : 'お気に入りに追加'}
    </button>
  );
}
