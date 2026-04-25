'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { supabase } from '@/lib/supabase';
import { VisitResult } from '@/types';

const RESULT_LABEL: Record<VisitResult, string> = {
  '○': '対応あり', '△': '不在', '✖': '対応不可',
};

interface TodayRecord {
  id: string;
  judgment: VisitResult | null;
  summary: string | null;
  next_action: string | null;
  created_at: string;
  properties: { owner_name: string; address: string } | null;
}

export default function ReportPage() {
  const [records, setRecords]   = useState<TodayRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [teamNote, setTeamNote] = useState('');
  const [copied, setCopied]     = useState(false);

  const today    = new Date().toISOString().split('T')[0];
  const dateLabel = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  useEffect(() => {
    const start = `${today}T00:00:00`;
    const end   = `${today}T23:59:59`;
    supabase
      .from('visits')
      .select('id, judgment, summary, next_action, created_at, properties(owner_name, address)')
      .gte('created_at', start)
      .lte('created_at', end)
      .then(({ data }) => {
        setRecords((data ?? []) as unknown as TodayRecord[]);
        setLoading(false);
      });
  }, [today]);

  const count = (r: VisitResult) => records.filter((x) => x.judgment === r).length;

  const reportText = [
    `【営業日報】${dateLabel}`,
    ``,
    `■ 本日の活動サマリー`,
    `・訪問件数: ${records.length}件`,
    `・対応あり(○): ${count('○')}件`,
    `・不在(△): ${count('△')}件`,
    `・対応不可(✖): ${count('✖')}件`,
    ``,
    ...(records.length > 0
      ? [
          `■ 訪問詳細`,
          ...records.map((v, i) => {
            const name = v.properties?.owner_name ?? '不明';
            const addr = (v.properties?.address ?? '').replace('大阪市', '');
            return `${i + 1}. ${name}（${addr}）\n   結果: ${v.judgment ?? '―'} ${v.judgment ? RESULT_LABEL[v.judgment] : ''}\n   ${v.summary ? `内容: ${v.summary}` : ''}${v.next_action ? `\n   次回: ${v.next_action}` : ''}`.trim();
          }),
          ``,
        ]
      : [`■ 本日の訪問記録はありません`, ``]),
    ...(teamNote ? [`■ チーム共有事項`, teamNote, ``] : []),
    `以上、よろしくお願いします。`,
  ].join('\n');

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
    } catch {
      const el = document.createElement('textarea');
      el.value = reportText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="日報" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* サマリー */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-3">{dateLabel}</div>
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-2">集計中...</div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '訪問', value: records.length, color: 'text-gray-800' },
                { label: '○対応', value: count('○'), color: 'text-green-600' },
                { label: '△不在', value: count('△'), color: 'text-yellow-500' },
                { label: '✖不可', value: count('✖'), color: 'text-red-500' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 自動生成テキスト */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">自動生成テキスト</span>
            <span className="text-xs text-gray-400">LINEにコピー可</span>
          </div>
          <pre className="px-4 py-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
            {reportText}
          </pre>
        </div>

        {/* チーム共有事項 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-700 text-sm">チーム共有事項</span>
          </div>
          <div className="p-4">
            <textarea
              value={teamNote}
              onChange={(e) => setTeamNote(e.target.value)}
              placeholder="チームへの連絡事項や引き継ぎ..."
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>
        </div>

        {/* アクション */}
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button
            onClick={copyToClipboard}
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-95
              ${copied ? 'bg-green-500 text-white' : 'bg-white border-2 border-gray-200 text-gray-700'}`}
          >
            <span>{copied ? '✓' : '📋'}</span>
            {copied ? 'コピー完了！' : 'コピー'}
          </button>
          <button
            onClick={() => window.open(`https://line.me/R/msg/text/?${encodeURIComponent(reportText)}`, '_blank')}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-95"
            style={{ backgroundColor: '#06C755' }}
          >
            <span>💬</span> LINEで送る
          </button>
        </div>
      </div>
    </div>
  );
}
