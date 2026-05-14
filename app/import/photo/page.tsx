'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { CaseRank, CaseStatus } from '@/types';

type Parsed = {
  address:     string;
  owner_name:  string;
  case_number: string;
  haito_date:  string;
  loan_amount: string;
  bank_name:   string;
  phone:       string;
  assignee:    string;
};

const empty: Parsed = {
  address: '', owner_name: '', case_number: '', haito_date: '',
  loan_amount: '', bank_name: '', phone: '', assignee: '',
};

type Step = 'upload' | 'parsing' | 'review' | 'done';

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400';
const labelCls = 'text-xs text-gray-500 mb-1 block';

export default function PhotoImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep]         = useState<Step>('upload');
  const [preview, setPreview]   = useState<string | null>(null);
  const [data, setData]         = useState<Parsed>(empty);
  const [saving, setSaving]     = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const processImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください'); return; }

    // preview
    const url = URL.createObjectURL(file);
    setPreview(url);
    setStep('parsing');

    // base64 encode
    const buffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    try {
      const res  = await fetch('/api/parse-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData({
        address:     json.address     ?? '',
        owner_name:  json.owner_name  ?? '',
        case_number: json.case_number ?? '',
        haito_date:  json.haito_date  ?? '',
        loan_amount: json.loan_amount ? String(json.loan_amount) : '',
        bank_name:   json.bank_name   ?? '',
        phone:       json.phone       ?? '',
        assignee:    json.assignee    ?? '',
      });
      setStep('review');
    } catch (e) {
      alert('AI読み取りに失敗しました。もう一度試してください。');
      setStep('upload');
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processImage(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processImage(f);
  }, [processImage]);

  const handleImport = async () => {
    if (!data.address.trim()) { alert('住所を入力してください'); return; }
    setSaving(true);

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${sbUrl}/rest/v1/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify([{
        address:     data.address.trim()    || null,
        owner_name:  data.owner_name.trim() || null,
        case_number: data.case_number.trim() || null,
        haito_date:  data.haito_date || null,
        loan_amount: data.loan_amount ? parseInt(data.loan_amount) : null,
        bank_name:   data.bank_name.trim() || null,
        phone:       data.phone.trim()     || null,
        assignee:    data.assignee.trim()  || null,
        status:      '未訪問' as CaseStatus,
        rank:        'C' as CaseRank,
        import_batch_id: crypto.randomUUID(),
      }]),
    });

    setSaving(false);
    if (!res.ok) { alert(`インポートに失敗しました: ${res.status}`); return; }
    setStep('done');
  };

  const reset = () => {
    setStep('upload');
    setPreview(null);
    setData(empty);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="写真インポート" backHref="/import" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* STEP 1: アップロード */}
        {step === 'upload' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-16 cursor-pointer transition-colors
              ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
          >
            <span className="text-5xl mb-4">📷</span>
            <p className="font-semibold text-gray-700 text-sm">書類の写真をアップロード</p>
            <p className="text-xs text-gray-400 mt-1">タップして選択 または ドロップ</p>
            <p className="text-xs text-gray-400 mt-1">JPG / PNG / HEIC 対応</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </div>
        )}

        {/* STEP 2: AI解析中 */}
        {step === 'parsing' && (
          <div className="flex flex-col items-center py-12 space-y-4">
            {preview && (
              <img src={preview} alt="uploaded" className="max-h-48 rounded-xl object-contain shadow" />
            )}
            <div className="flex items-center gap-3 text-gray-600">
              <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">AIが書類を読み取っています...</span>
            </div>
          </div>
        )}

        {/* STEP 3: 内容確認・編集 */}
        {step === 'review' && (
          <>
            {preview && (
              <img src={preview} alt="uploaded" className="w-full max-h-40 rounded-xl object-contain bg-gray-100" />
            )}

            <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700">
              AIが読み取った内容です。修正してからインポートしてください。
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div>
                <label className={labelCls}>住所 <span className="text-red-500">*</span></label>
                <input value={data.address} onChange={(e) => setData(p => ({ ...p, address: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>所有者名</label>
                <input value={data.owner_name} onChange={(e) => setData(p => ({ ...p, owner_name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={`${labelCls} font-semibold text-blue-700`}>配当要求日 ★</label>
                <input type="date" value={data.haito_date} onChange={(e) => setData(p => ({ ...p, haito_date: e.target.value }))} className={`${inputCls} border-blue-300`} />
              </div>
              <div>
                <label className={labelCls}>事件番号</label>
                <input value={data.case_number} onChange={(e) => setData(p => ({ ...p, case_number: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>金融機関</label>
                <input value={data.bank_name} onChange={(e) => setData(p => ({ ...p, bank_name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>残債額（万円）</label>
                <input type="number" value={data.loan_amount} onChange={(e) => setData(p => ({ ...p, loan_amount: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>電話番号</label>
                <input value={data.phone} onChange={(e) => setData(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>担当者</label>
                <input value={data.assignee} onChange={(e) => setData(p => ({ ...p, assignee: e.target.value }))} className={inputCls} />
              </div>
            </div>

            <button
              onClick={handleImport}
              disabled={saving || !data.address.trim()}
              className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
              style={{ backgroundColor: '#1a1a2e' }}
            >
              {saving ? '保存中...' : '案件としてインポート'}
            </button>
          </>
        )}

        {/* STEP 4: 完了 */}
        {step === 'done' && (
          <div className="flex flex-col items-center py-12 space-y-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl bg-green-50">✅</div>
            <p className="text-xl font-bold text-gray-900">インポート完了</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={reset}
                className="flex-1 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium"
              >
                続けて読み取る
              </button>
              <button
                onClick={() => router.push('/cases')}
                className="flex-1 py-3 rounded-xl text-white text-sm font-bold"
                style={{ backgroundColor: '#1a1a2e' }}
              >
                案件一覧へ
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
