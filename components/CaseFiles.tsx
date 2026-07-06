'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FILE_CATEGORIES, FileCategory } from '@/types';

interface CaseFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  created_at: string;
}

const SECTION_META: Record<FileCategory, { icon: string; label: string }> = {
  '写真':     { icon: '📷', label: '写真' },
  '登記簿':   { icon: '📜', label: '登記簿情報' },
  '物件目録': { icon: '📋', label: '物件目録' },
  'その他':   { icon: '📎', label: 'その他重要資料' },
};

const IMAGE_TYPES = ['jpeg', 'jpg', 'png'];

export default function CaseFiles({ propertyId }: { propertyId: string }) {
  const [files, setFiles] = useState<CaseFile[]>([]);
  const [uploading, setUploading] = useState<FileCategory | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCategory = useRef<FileCategory>('その他');

  const load = async () => {
    const { data } = await supabase
      .from('case_files')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    setFiles(data ?? []);
  };

  useEffect(() => { load(); }, [propertyId]);

  const startUpload = (category: FileCategory) => {
    pendingCategory.current = category;
    if (inputRef.current) {
      // 写真は画像のみ・カメラ起動可、それ以外はPDFも受け付ける
      inputRef.current.accept = category === '写真' ? 'image/*' : '.pdf,.jpg,.jpeg,.png';
      inputRef.current.click();
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    const category = pendingCategory.current;
    setUploading(category);
    for (const file of selected) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('property_id', propertyId);
      fd.append('category', category);
      const res = await fetch('/api/case-files', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`アップロードに失敗しました: ${body.error ?? res.status}`);
        break;
      }
    }
    await load();
    setUploading(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('この資料を削除しますか？')) return;
    await fetch(`/api/case-files/${fileId}`, { method: 'DELETE' });
    await load();
  };

  const getUrl = (path: string) => {
    const { data } = supabase.storage.from('case-files').getPublicUrl(path);
    return data.publicUrl;
  };

  const isImage = (f: CaseFile) => IMAGE_TYPES.includes(f.file_type ?? '');

  const byCategory = (cat: FileCategory) =>
    files.filter((f) => (f.category ?? 'その他') === cat);

  return (
    <div className="space-y-4">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} />

      {FILE_CATEGORIES.map((cat) => {
        const meta = SECTION_META[cat];
        const items = byCategory(cat);
        return (
          <div key={cat} className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-700 text-sm">
                  {meta.icon} {meta.label}
                </span>
                {items.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">{items.length}件</span>
                )}
              </div>
              <button
                onClick={() => startUpload(cat)}
                disabled={uploading !== null}
                className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-full active:opacity-80 disabled:opacity-50"
              >
                {uploading === cat ? '送信中...' : '＋ 追加'}
              </button>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-4 text-center text-gray-300 text-xs">
                未登録
              </div>
            ) : cat === '写真' ? (
              /* 写真: サムネイルグリッド */
              <div className="p-3 grid grid-cols-3 gap-2">
                {items.map((f) => (
                  <div key={f.id} className="relative aspect-square">
                    <a href={getUrl(f.file_path)} target="_blank" rel="noopener noreferrer">
                      {isImage(f) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getUrl(f.file_path)}
                          alt={f.file_name}
                          loading="lazy"
                          className="w-full h-full object-cover rounded-lg bg-gray-100"
                        />
                      ) : (
                        <div className="w-full h-full rounded-lg bg-gray-100 flex items-center justify-center text-2xl">
                          📄
                        </div>
                      )}
                    </a>
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700/80 text-white text-[10px] leading-none flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              /* 登記簿・物件目録・その他: リスト表示 */
              <div className="divide-y divide-gray-100">
                {items.map((f) => (
                  <div key={f.id} className="flex items-center px-4 py-3 gap-3">
                    <span className="text-2xl shrink-0">
                      {f.file_type === 'pdf' ? '📄' : isImage(f) ? '🖼️' : '📎'}
                    </span>
                    <a
                      href={getUrl(f.file_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0"
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">{f.file_name}</div>
                      <div className="text-xs text-gray-400">
                        {f.file_size ? `${Math.round(f.file_size / 1024)}KB · ` : ''}
                        {new Date(f.created_at).toLocaleDateString('ja-JP')}
                      </div>
                    </a>
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="text-gray-300 active:text-red-400 p-1 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
