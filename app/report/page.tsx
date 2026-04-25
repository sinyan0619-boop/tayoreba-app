'use client';
import { useState } from 'react';
import Header from '@/components/Header';
import { mockCases } from '@/lib/mockData';
import { VisitResult } from '@/types';

const RESULT_LABEL: Record<VisitResult, string> = {
  '○': '対応あり',
  '△': '不在',
  '✖': '対応不可',
};

export default function ReportPage() {
  const [teamNote, setTeamNote] = useState('');
  const [copied, setCopied] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const dateLabel = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  // 今日の訪問記録を収集
  const todayRecords = mockCases.flatMap((c) =>
    c.visits
      .filter((v) => v.date === today)
      .map((v) => ({ visit: v, case: c }))
  );

  const countByResult = (r: VisitResult) =>
    todayRecords.filter((x) => x.visit.result === r).length;

  const reportText = [
    `【営業日報】${dateLabel}`,
    ``,
    `■ 本日の活動サマリー`,
    `・訪問件数: ${todayRecords.length}件`,
    `・対応あり(○): ${countByResult('○')}件`,
    `・不在(△): ${countByResult('△')}件`,
    `・対応不可(✖): ${countByResult('✖')}件`,
    ``,
    ...(todayRecords.length > 0
      ? [
          `■ 訪問詳細`,
          ...todayRecords.map(
            ({ visit, case: c }, i) =>
              `${i + 1}. ${c.ownerName}（${c.address.replace('大阪市', '')}）\n   結果: ${visit.result} ${RESULT_LABEL[visit.result]}\n   メモ: ${visit.memo}`
          ),
          ``,
        ]
      : [`■ 本日の訪問記録はありません`, ``]),
    ...(teamNote
      ? [`■ チーム共有事項`, teamNote, ``]
      : []),
    `以上、よろしくお願いします。`,
  ].join('\n');

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = reportText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareToLine = () => {
    const url = `https://line.me/R/msg/text/?${encodeURIComponent(reportText)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="日報" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* サマリーカード */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-3">{dateLabel}</div>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">
                {todayRecords.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">訪問</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {countByResult('○')}
              </div>
              <div className="text-xs text-gray-500 mt-1">○対応</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-500">
                {countByResult('△')}
              </div>
              <div className="text-xs text-gray-500 mt-1">△不在</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">
                {countByResult('✖')}
              </div>
              <div className="text-xs text-gray-500 mt-1">✖不可</div>
            </div>
          </div>
        </div>

        {/* 自動生成テキスト */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">
              自動生成テキスト
            </span>
            <span className="text-xs text-gray-400">LINEにコピー可</span>
          </div>
          <pre className="px-4 py-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-sans overflow-x-auto">
            {reportText}
          </pre>
        </div>

        {/* チーム共有事項 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-700 text-sm">
              チーム共有事項
            </span>
          </div>
          <div className="p-4">
            <textarea
              value={teamNote}
              onChange={(e) => setTeamNote(e.target.value)}
              placeholder="チームへの連絡事項や引き継ぎ事項を入力..."
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button
            onClick={copyToClipboard}
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-95
              ${copied
                ? 'bg-green-500 text-white'
                : 'bg-white border-2 border-gray-200 text-gray-700'}`}
          >
            <span>{copied ? '✓' : '📋'}</span>
            {copied ? 'コピー完了！' : 'コピー'}
          </button>
          <button
            onClick={shareToLine}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
            style={{ backgroundColor: '#06C755' }}
          >
            <span>💬</span>
            LINEで送る
          </button>
        </div>
      </div>
    </div>
  );
}
