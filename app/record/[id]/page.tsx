'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { supabase, dbToCase } from '@/lib/supabase';
import { Case, VisitResult } from '@/types';

const JUDGMENTS: { value: VisitResult; label: string; color: string; bg: string }[] = [
  { value: '○', label: '対応あり',    color: '#27ae60', bg: '#eafaf1' },
  { value: '△', label: '不在・様子見', color: '#f39c12', bg: '#fef9e7' },
  { value: '✖', label: '対応不可',    color: '#e74c3c', bg: '#fdedec' },
];

const CONTACT_TYPES = ['ドアノック', '電話', '郵便', 'その他'];

export default function RecordPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();

  const [property, setProperty] = useState<Case | null>(null);
  const [judgment, setJudgment] = useState<VisitResult | null>(null);
  const [contactType, setContactType] = useState('ドアノック');
  const [summary, setSummary]         = useState('');
  const [nextAction, setNextAction]   = useState('');
  const [nextDate, setNextDate]       = useState('');
  const [requests, setRequests]       = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) setProperty(dbToCase(data));
      });
  }, [id]);

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('このブラウザは音声入力に対応していません');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r  = new SR();
    r.lang = 'ja-JP';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e: any) => {
      setSummary((prev) => prev ? prev + '　' + e.results[0][0].transcript : e.results[0][0].transcript);
      setIsRecording(false);
    };
    r.onerror = () => setIsRecording(false);
    r.onend   = () => setIsRecording(false);
    recognitionRef.current = r;
    setIsRecording(true);
    r.start();
  };

  const handleSave = async () => {
    if (!judgment) { alert('目処（○△✖）を選択してください'); return; }
    setSaving(true);

    const { error } = await supabase.from('visits').insert({
      property_id:  id,
      contact_type: contactType,
      summary:      summary || null,
      judgment,
      next_action:  nextAction || null,
      next_date:    nextDate   || null,
      requests:     requests   || null,
    });

    if (error) {
      alert(`保存に失敗しました: ${error.message}`);
      setSaving(false);
      return;
    }

    await supabase
      .from('properties')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    setSaved(true);
    setTimeout(() => router.push(`/case/${id}`), 1000);
  };

  if (!property) {
    return (
      <div className="flex flex-col h-full">
        <Header title="訪問記録" backHref="/" />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="訪問記録" backHref={`/case/${id}`} />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* 案件名 */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-0.5">訪問先</div>
          <div className="font-bold text-gray-900">{property.ownerName}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">{property.address}</div>
        </div>

        {/* 目処（○△✖） */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-3">
            目処 <span className="text-red-500">*</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {JUDGMENTS.map((j) => (
              <button
                key={j.value}
                onClick={() => setJudgment(j.value)}
                className="flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all active:scale-95"
                style={
                  judgment === j.value
                    ? { backgroundColor: j.bg, borderColor: j.color }
                    : { backgroundColor: '#fff', borderColor: '#e5e7eb' }
                }
              >
                <span className="text-3xl font-bold leading-none"
                  style={{ color: judgment === j.value ? j.color : '#9ca3af' }}>
                  {j.value}
                </span>
                <span className="text-xs mt-1.5"
                  style={{ color: judgment === j.value ? j.color : '#9ca3af' }}>
                  {j.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 接触方法 */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">接触方法</div>
          <div className="flex gap-2 flex-wrap">
            {CONTACT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setContactType(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                  ${contactType === t
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-300'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 内容・メモ（音声入力対応） */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-700">内容・メモ</div>
            <button
              onClick={isRecording ? () => { recognitionRef.current?.stop(); setIsRecording(false); } : startVoice}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95
                ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-600'}`}
            >
              <span>{isRecording ? '⏹' : '🎤'}</span>
              {isRecording ? '録音中...' : '音声入力'}
            </button>
          </div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="対応内容、反応など..."
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </div>

        {/* 次のアクション */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">次のアクション</div>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="例: 来週再訪、資料郵送..."
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* 次回訪問予定日 */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">次回訪問予定日</div>
          <input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* 要望・特記事項 */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">要望・特記事項</div>
          <textarea
            value={requests}
            onChange={(e) => setRequests(e.target.value)}
            placeholder="依頼人の要望や特記事項..."
            rows={2}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`w-full py-4 rounded-2xl text-white font-bold text-base transition-all active:scale-95
            ${saved ? 'bg-green-500 cursor-default' : saving ? 'bg-gray-400 cursor-not-allowed' : ''}`}
          style={!saved && !saving ? { backgroundColor: '#1a1a2e' } : {}}
        >
          {saved ? '✓ 保存しました' : saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  );
}
