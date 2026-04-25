'use client';
import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { getCaseById } from '@/lib/mockData';
import { VisitResult } from '@/types';

const RESULTS: { value: VisitResult; label: string; color: string; bg: string }[] = [
  { value: '○', label: '対応あり', color: '#27ae60', bg: '#eafaf1' },
  { value: '△', label: '不在・様子見', color: '#f39c12', bg: '#fef9e7' },
  { value: '✖', label: '対応不可', color: '#e74c3c', bg: '#fdedec' },
];

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const c = getCaseById(id);

  const [result, setResult] = useState<VisitResult | null>(null);
  const [memo, setMemo] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [saved, setSaved] = useState(false);
  const recognitionRef = useRef<any>(null);

  if (!c) {
    return (
      <div className="flex flex-col h-full">
        <Header title="訪問記録" backHref="/" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          案件が見つかりません
        </div>
      </div>
    );
  }

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('このブラウザは音声入力に対応していません');
      return;
    }

    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setMemo((prev) => (prev ? prev + '　' + transcript : transcript));
      setIsRecording(false);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const handleSave = () => {
    if (!result) {
      alert('結果（○△✖）を選択してください');
      return;
    }
    // TODO: Supabase連携時にここで保存
    console.log('Save visit:', { caseId: id, result, memo, date: new Date().toISOString().split('T')[0] });
    setSaved(true);
    setTimeout(() => router.push(`/case/${id}`), 1200);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="訪問記録" backHref={`/case/${id}`} />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* 案件名 */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-0.5">訪問先</div>
          <div className="font-bold text-gray-900">{c.ownerName}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">{c.address}</div>
        </div>

        {/* 結果選択（○△✖） */}
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-3">
            結果 <span className="text-red-500">*</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {RESULTS.map((r) => (
              <button
                key={r.value}
                onClick={() => setResult(r.value)}
                className="flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all active:scale-95"
                style={
                  result === r.value
                    ? {
                        backgroundColor: r.bg,
                        borderColor: r.color,
                      }
                    : {
                        backgroundColor: '#fff',
                        borderColor: '#e5e7eb',
                      }
                }
              >
                <span
                  className="text-3xl font-bold leading-none"
                  style={{ color: result === r.value ? r.color : '#9ca3af' }}
                >
                  {r.value}
                </span>
                <span
                  className="text-xs mt-1.5"
                  style={{ color: result === r.value ? r.color : '#9ca3af' }}
                >
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* メモ入力 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-700">メモ</div>
            <button
              onClick={isRecording ? stopVoiceInput : startVoiceInput}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95
                ${isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-gray-100 text-gray-600'}`}
            >
              <span>{isRecording ? '⏹' : '🎤'}</span>
              {isRecording ? '録音中...' : '音声入力'}
            </button>
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="対応内容、反応、次回アクションなどを入力..."
            rows={5}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={saved}
          className={`w-full py-4 rounded-2xl text-white font-bold text-base transition-all active:scale-95
            ${saved
              ? 'bg-green-500 cursor-default'
              : 'active:opacity-90'}`}
          style={!saved ? { backgroundColor: '#1a1a2e' } : {}}
        >
          {saved ? '✓ 保存しました' : '保存する'}
        </button>
      </div>
    </div>
  );
}
