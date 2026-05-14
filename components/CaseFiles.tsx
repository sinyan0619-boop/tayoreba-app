'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CaseFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

export default function CaseFiles({ propertyId }: { propertyId: string }) {
  const [files, setFiles] = useState<CaseFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from('case_files')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    setFiles(data ?? []);
  };

  useEffect(() => { load(); }, [propertyId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('property_id', propertyId);
    const res = await fetch('/api/case-files', { method: 'POST', body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(`アップロードに失敗しました: ${body.error ?? res.status}`);
    } else {
      await load();
    }
    setUploading(false);
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

  const icon = (type: string | null) => {
    if (type === 'pdf') return '📄';
    if (type === 'jpeg' || type === 'jpg' || type === 'png') return '🖼️';
    return '📎';
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <span className="font-semibold text-gray-700 text-sm">資料</span>
          {files.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">{files.length}件</span>
          )}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-full active:opacity-80 disabled:opacity-50"
        >
          {uploading ? '送信中...' : '＋ 追加'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {files.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">
          資料がありません
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {files.map((f) => (
            <div key={f.id} className="flex items-center px-4 py-3 gap-3">
              <span className="text-2xl shrink-0">{icon(f.file_type)}</span>
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
}
