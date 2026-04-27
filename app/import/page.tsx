'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { CaseRank, CaseStatus } from '@/types';

// ── xlsx パーサー（.xlsx / .xls 直接読込）──────────────────────────
async function parseXLSX(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, raw: false, defval: '' });

  if (raw.length < 2) return { headers: [], rows: [] };

  // 1行目がタイトル行の場合はスキップ、2行目をヘッダーとして使う
  // ヘッダー行の判定: '事件番号'/'住所'/'所在地' いずれかを含む行を探す
  let headerIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const row = raw[i].map((v) => String(v ?? ''));
    if (row.some((v) => v.includes('事件番号') || v.includes('所在地') || v.includes('住所') || v.includes('所有者'))) {
      headerIdx = i;
      break;
    }
  }

  const headers = raw[headerIdx].map((v) =>
    String(v ?? '').replace(/\n/g, '').replace(/\s+/g, ' ').trim()
  );

  const rows = raw.slice(headerIdx + 1)
    .map((row) =>
      headers.reduce<Record<string, string>>((acc, h, i) => {
        const val = String(row[i] ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        return { ...acc, [h]: val };
      }, {})
    )
    // 全フィールドが空の行を除外
    .filter((row) => Object.values(row).some((v) => v.trim() !== ''));

  return { headers, rows };
}

// ── CSV パーサー ────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim()); current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1)
    .map((line) => {
      const vals = parseCSVLine(line);
      return headers.reduce<Record<string, string>>(
        (acc, h, i) => ({ ...acc, [h]: vals[i] ?? '' }),
        {}
      );
    })
    // 全フィールドが空の行（空白行）を除外
    .filter((row) => Object.values(row).some((v) => v.trim() !== ''));
  return { headers, rows };
}

// ── アプリフィールド定義 ──────────────────────────────────────────
const APP_FIELDS = [
  { key: 'address',    label: '住所',      required: true  },
  { key: 'ownerName',  label: '所有者名',  required: true  },
  { key: 'status',     label: 'ステータス',required: false },
  { key: 'rank',       label: 'ランク',    required: false },
  { key: 'assignee',   label: '担当者',    required: false },
  { key: 'caseNumber', label: '事件番号',  required: false },
  { key: 'notes',      label: '備考',      required: false },
] as const;
type AppFieldKey = (typeof APP_FIELDS)[number]['key'];

const VALID_STATUSES = new Set<string>(['未訪問', '訪問対象外', '訪問対象', '媒介', '契約']);
const VALID_RANKS = new Set<string>(['A', 'B', 'C']);

// 自動マッピング
function autoMap(headers: string[]): Partial<Record<AppFieldKey, string>> {
  const rules: [AppFieldKey, string[]][] = [
    ['address',    ['住所', '所在地', 'アドレス', '物件住所']],
    ['ownerName',  ['所有者名', '所有者', '氏名', '名前', 'オーナー']],
    ['status',     ['ステータス', '状態', '状況']],
    ['rank',       ['ランク', 'rank', 'RANK', '優先度']],
    ['assignee',   ['担当者', '担当']],
    ['caseNumber', ['事件番号', '案件番号', '番号', 'No.', 'NO']],
    ['notes',      ['備考', 'メモ', '備考欄', '注記']],
  ];
  const result: Partial<Record<AppFieldKey, string>> = {};
  for (const [field, patterns] of rules) {
    const matched = headers.find((h) => patterns.some((p) => h.includes(p)));
    if (matched) result[field] = matched;
  }
  return result;
}

// バリデーション
function validateRow(
  row: Record<string, string>,
  mapping: Partial<Record<AppFieldKey, string>>
): string[] {
  const errors: string[] = [];
  const address = mapping.address ? (row[mapping.address] ?? '') : '';
  if (!address.trim()) errors.push('住所が空です');
  const status = mapping.status ? (row[mapping.status] ?? '') : '';
  if (status && !VALID_STATUSES.has(status))
    errors.push(`ステータス「${status}」は無効（未訪問/訪問対象外/訪問対象/媒介/契約）`);
  const rank = mapping.rank ? (row[mapping.rank] ?? '') : '';
  if (rank && !VALID_RANKS.has(rank))
    errors.push(`ランク「${rank}」は無効（A/B/C）`);
  return errors;
}

// サンプル CSV
const SAMPLE_CSV =
  '住所,所有者名,ステータス,ランク,担当者,事件番号,備考\n' +
  '大阪市住之江区北島3丁目2-8,北島靖章,訪問対象,A,田中,2024-001,要確認\n' +
  '大阪市東住吉区今川4丁目11-3,田中美佐子,未訪問,B,鈴木,2024-002,\n';

type Step = 'upload' | 'mapping' | 'preview' | 'result';

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<AppFieldKey, string>>>({});
  const [result, setResult] = useState({ success: 0, error: 0 });

  const processFile = (file: File) => {
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const { headers: h, rows: r } = await parseXLSX(buffer);
        if (h.length === 0) { alert('Excelファイルを正しく読み込めませんでした'); return; }
        setHeaders(h);
        setRows(r);
        setMapping(autoMap(h));
        setStep('mapping');
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers: h, rows: r } = parseCSV(text);
        if (h.length === 0) { alert('CSVを正しく読み込めませんでした'); return; }
        setHeaders(h);
        setRows(r);
        setMapping(autoMap(h));
        setStep('mapping');
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, []);

  const downloadSample = () => {
    const blob = new Blob(['\uFEFF' + SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sample.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // 住所列が空の行はエラーではなくスキップ（続き行・空白行扱い）
  const dataRows = mapping.address
    ? rows.filter((r) => (r[mapping.address!] ?? '').trim() !== '')
    : rows;
  const skippedCount = rows.length - dataRows.length;
  const rowErrors = dataRows.map((r) => validateRow(r, mapping));
  const validCount = rowErrors.filter((e) => e.length === 0).length;
  const errorCount = rowErrors.filter((e) => e.length > 0).length;

  const handleImport = async () => {
    const validRows = dataRows.filter((_, i) => rowErrors[i].length === 0);
    const toInsert = validRows.map((row) => ({
      address:     (mapping.address    ? row[mapping.address]    : '') || '',
      owner_name:  (mapping.ownerName  ? row[mapping.ownerName]  : '') || '',
      status: (VALID_STATUSES.has(mapping.status ? (row[mapping.status] ?? '') : '')
        ? row[mapping.status!]
        : '未訪問') as CaseStatus,
      rank: (VALID_RANKS.has(mapping.rank ? (row[mapping.rank] ?? '') : '')
        ? row[mapping.rank!]
        : 'C') as CaseRank,
      assignee:     mapping.assignee    ? (row[mapping.assignee]    || null) : null,
      case_number:  mapping.caseNumber  ? (row[mapping.caseNumber]  || null) : null,
      notes:        mapping.notes       ? (row[mapping.notes]        || null) : null,
    }));

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${sbUrl}/rest/v1/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':        sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(toInsert),
    });
    if (!res.ok) {
      const errBody = await res.text();
      alert(`インポートに失敗しました: ${res.status} ${errBody}`);
      return;
    }
    setResult({ success: validCount, error: errorCount });
    setStep('result');
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="CSVインポート" backHref="/cases" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── STEP 1: アップロード ── */}
        {step === 'upload' && (
          <>
            {/* ドロップゾーン */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-12 cursor-pointer transition-colors
                ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
            >
              <span className="text-4xl mb-3">📂</span>
              <p className="font-semibold text-gray-700 text-sm">
                ExcelまたはCSVをドロップ
              </p>
              <p className="text-xs text-gray-400 mt-1">.xlsx / .xls / .csv 対応</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {/* フォーマット説明 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-700 text-sm">想定CSV列</p>
                <button
                  onClick={downloadSample}
                  className="text-xs text-blue-500 font-medium"
                >
                  サンプルDL ↓
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['住所', '所有者名', 'ステータス', 'ランク', '担当者', '事件番号', '備考'].map((col) => (
                  <span
                    key={col}
                    className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                ステータス: 未訪問 / 訪問対象外 / 訪問対象 / 媒介 / 契約<br />
                ランク: A / B / C
              </p>
            </div>
          </>
        )}

        {/* ── STEP 2: 列マッピング ── */}
        {step === 'mapping' && (
          <>
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700">
              <strong>{rows.length}行</strong>を読み込みました。
              CSVの列をアプリの項目に対応付けてください。
            </div>

            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-700 text-sm">列マッピング</span>
              </div>
              <div className="divide-y divide-gray-100">
                {APP_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center px-4 py-3 gap-3">
                    <div className="w-24 shrink-0">
                      <span className="text-sm text-gray-700">{field.label}</span>
                      {field.required && (
                        <span className="text-red-500 text-xs ml-0.5">*</span>
                      )}
                    </div>
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]: e.target.value || undefined,
                        }))
                      }
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                    >
                      <option value="">（スキップ）</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('preview')}
              className="w-full py-4 rounded-2xl text-white font-bold text-sm active:opacity-90"
              style={{ backgroundColor: '#1a1a2e' }}
            >
              プレビューを確認 ›
            </button>
          </>
        )}

        {/* ── STEP 3: プレビュー ── */}
        {step === 'preview' && (
          <>
            {/* サマリー */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <div className="text-xl font-bold text-gray-800">{dataRows.length}</div>
                <div className="text-xs text-gray-500 mt-1">
                  有効行{skippedCount > 0 && <span className="text-gray-400">（{skippedCount}件除外）</span>}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <div className="text-xl font-bold text-green-600">{validCount}</div>
                <div className="text-xs text-gray-500 mt-1">正常</div>
              </div>
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <div className={`text-xl font-bold ${errorCount > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {errorCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">エラー</div>
              </div>
            </div>

            {/* プレビューテーブル（最初の5件） */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="font-semibold text-gray-700 text-sm">
                  プレビュー（先頭5件）
                </span>
                <button
                  onClick={() => setStep('mapping')}
                  className="text-xs text-blue-500"
                >
                  ← マッピング変更
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {dataRows.slice(0, 5).map((row, i) => {
                  const errs = rowErrors[i];
                  const hasError = errs.length > 0;
                  return (
                    <div
                      key={i}
                      className={`px-4 py-3 ${hasError ? 'bg-red-50' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`text-xs font-bold mt-0.5 ${
                            hasError ? 'text-red-500' : 'text-green-600'
                          }`}
                        >
                          {hasError ? '✖' : '✓'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {mapping.ownerName ? (row[mapping.ownerName] || '（氏名なし）') : '（未マップ）'}
                          </div>
                          <div className="text-xs text-gray-500 truncate mt-0.5">
                            {mapping.address ? (row[mapping.address] || '（住所なし）') : '（未マップ）'}
                          </div>
                          <div className="flex gap-2 mt-1">
                            {mapping.status && row[mapping.status] && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                {row[mapping.status]}
                              </span>
                            )}
                            {mapping.rank && row[mapping.rank] && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                ランク{row[mapping.rank]}
                              </span>
                            )}
                            {mapping.assignee && row[mapping.assignee] && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                👤 {row[mapping.assignee]}
                              </span>
                            )}
                          </div>
                          {hasError && (
                            <div className="mt-1 space-y-0.5">
                              {errs.map((e, ei) => (
                                <p key={ei} className="text-xs text-red-500">
                                  • {e}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          #{i + 1}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {dataRows.length > 5 && (
                  <div className="px-4 py-2 text-xs text-gray-400 text-center">
                    他 {dataRows.length - 5} 件
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleImport}
              disabled={validCount === 0}
              className={`w-full py-4 rounded-2xl text-white font-bold text-sm transition-all active:opacity-90
                ${validCount === 0 ? 'bg-gray-300 cursor-not-allowed' : ''}`}
              style={validCount > 0 ? { backgroundColor: '#1a1a2e' } : {}}
            >
              {validCount}件をインポート実行
              {errorCount > 0 && ` （${errorCount}件スキップ）`}
            </button>
          </>
        )}

        {/* ── STEP 4: 完了 ── */}
        {step === 'result' && (
          <div className="flex flex-col items-center py-8 space-y-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
              style={{ backgroundColor: '#eafaf1' }}
            >
              ✅
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">
                インポート完了
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {result.success}件を追加しました
                {result.error > 0 && `（${result.error}件スキップ）`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <div className="text-3xl font-bold text-green-600">
                  {result.success}
                </div>
                <div className="text-xs text-gray-500 mt-1">成功</div>
              </div>
              <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <div className={`text-3xl font-bold ${result.error > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                  {result.error}
                </div>
                <div className="text-xs text-gray-500 mt-1">スキップ</div>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center px-4">
              ※ Supabase連携後、本番データベースに保存されます
            </p>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setStep('upload');
                  setHeaders([]);
                  setRows([]);
                  setMapping({});
                }}
                className="flex-1 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium active:bg-gray-50"
              >
                続けてインポート
              </button>
              <button
                onClick={() => router.push('/cases')}
                className="flex-1 py-3 rounded-xl text-white text-sm font-bold active:opacity-90"
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
