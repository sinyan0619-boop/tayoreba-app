# LINE報告 自動取り込み設計書

作成: 2026-07-07 ／ 対象: たよれ場アプリ(tayoreba-app)

## 1. 目的

複数のグループLINEに散らばっている現地報告(訪問報告・写真)を、**営業側の運用を変えずに**アプリへ自動集約し、案件情報の正本をアプリに一本化する。

- 営業は今まで通りグループLINEに報告を投げるだけ
- Botが報告文から案件を特定し、訪問記録・ステータス・写真を自動登録
- 報告者(安田/近藤/小原/共同)を自動判定して担当・記録者に反映

## 2. 現状(実装済みの土台)

`app/api/line-webhook/route.ts` に以下が実装済み:

| 機能 | 状態 |
|---|---|
| LINE署名検証・返信・コンテンツ取得 | ✅ |
| 競売一覧画像のOCR登録(Claude API) | ✅ |
| 「添付」コマンドによる資料添付モード | ✅ |
| `line_context`(ユーザー別の会話状態) | ✅ |

**不足**: グループ対応 / 訪問報告テキストの解釈 / 報告者判定 / 写真の自動追従添付

## 3. 全体フロー

```
グループLINE(複数)
   │  Botを各グループに招待(1つのBotで全グループ対応)
   ▼
LINE Webhook (source.type=group → groupId + userId)
   │
   ├─ テキスト ──► ①報告解析(Claude) ──► ②案件マッチング ──► ③自動登録
   │                {住所/氏名/事件番号/       正規化住所・氏名・      visits追加
   │                 状況/次アクション}        事件番号短縮形(8ヌ4)    status更新
   │                                                                 notes追記
   │                                          確信度で分岐:
   │                                          ・1件に確定 → 自動登録+短い✅返信
   │                                          ・複数候補 → 番号リスト(既存UI流用)
   │                                          ・0件 → 「特定できず」+ 新規登録の提案
   │
   └─ 画像 ──► 直前(15分以内)に同じ人が報告した案件へ「写真」として自動添付
               (report_contextにgroupId+userIdで案件を記憶)
```

## 4. 処理ルール詳細

### ①報告解析(Claude API・構造化抽出)
入力: 報告テキスト → 出力JSON:
```json
{
  "is_report": true,
  "address": "宇治市五ケ庄福角80",
  "owner_name": "田中勉",
  "case_shorthand": "8ヌ39",
  "visit_result": "不在" | "対応済み" | "再訪問" | "対象外",
  "memo": "居留守の可能性。時間帯を変えて再訪問",
  "next_action": "夜間に再訪問",
  "flags": { "tasha_hata": false, "baikai": false }
}
```
- 雑談・業務連絡(`is_report: false`)は**無視**(グループを汚さない)

### ②案件マッチング(確信度3段階)
1. 事件番号(短縮形対応: 8ヌ39) → 完全一致
2. 正規化住所(全半角/丁目/番地ゆらぎ吸収 — 既存同期スクリプトのロジックを移植)
3. 所有者名
- **1件に確定** → 自動登録。返信は1行「✅ 田中勉様(宇治市五ケ庄福角)に記録しました」
- **複数候補** → 番号リスト返信(既存の添付モードUIを流用)。番号返信で確定
- **0件** → 「特定できませんでした。『新規』と返信で新規案件として登録します」

### ③自動登録の内容
| 対象 | 内容 |
|---|---|
| `visits` | memo・result(○/△/✖)・next_action・**recorded_by=報告者名** |
| `properties.status` | 未訪問→訪問対象(接触があれば)。**他社の旗→訪問対象外** |
| `properties.assignee` | 空欄なら報告者名を設定(共同グループからの報告は「共同」) |
| `properties.notes` | 最新状況を先頭に追記(同一物件の断片報告は1案件に集約) |
| 写真 | 直後15分以内の画像を「写真」分類で自動添付 |

### 報告者判定(担当ルール)
新テーブル `line_reporters`:
```sql
CREATE TABLE line_reporters (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT,        -- LINEの表示名(自動取得)
  assignee     TEXT         -- 安田 / 近藤晃平 / 小原 / 共同
);
```
- 初回報告時にLINEプロフィールAPIで表示名を取得し自動登録(例: 「@こうへいsun☀️」→近藤晃平 はマッピング初期値に入れる)
- 未知の報告者は `display_name` のまま記録し、アプリの設定画面で紐付け修正可能にする

### 会話状態(グループ対応)
既存 `line_context` のキーを `line_user_id` → `context_key = "{groupId}:{userId}"` に拡張(1対1は従来通り userId のみ)。写真の追従添付・候補選択の状態管理に使う。

## 5. DB変更(migration)

```sql
-- グループ対応のためキー拡張(既存データはそのまま動く)
ALTER TABLE line_context ADD COLUMN IF NOT EXISTS context_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_line_context_key ON line_context(context_key);

-- 報告者マッピング
CREATE TABLE IF NOT EXISTS line_reporters (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  assignee     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 報告の生ログ(監査・言った言わない対策・再処理用)
CREATE TABLE IF NOT EXISTS line_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    TEXT,
  line_user_id TEXT,
  raw_text    TEXT,
  parsed      JSONB,
  property_id UUID REFERENCES properties(id),
  status      TEXT DEFAULT 'processed',  -- processed / unmatched / ignored
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

`line_reports` が「取りこぼしゼロ」の要: 特定できなかった報告も全部残り、アプリの「未処理報告」画面から後で手動紐付けできる。

## 6. LINE側の設定(1回だけの作業)

1. **LINE Developersコンソール**で既存Botの「グループトーク参加を許可」をON
2. 各営業グループLINEにBotを招待(スマホから招待するだけ)
3. Webhook URLは現行のまま(`https://tayoreba-app.vercel.app/api/line-webhook`)

※グループを1つに統一する運用改善は不要になる(全グループにBotを入れれば済む)が、将来的に統一する場合もこの設計はそのまま使える。

## 7. 導入ステップ

| Step | 内容 | 所要 |
|---|---|---|
| 1 | migration実行(line_reporters / line_reports / context_key) | 5分 |
| 2 | webhook改修(グループ対応・報告解析・自動登録・写真追従) | 実装1回 |
| 3 | テスト用グループで動作確認(こうへいさん+Bot) | 30分 |
| 4 | 本番グループへBot招待・1週間は並行運用(既存の手動転記と併用) | — |
| 5 | アプリに「未処理報告」一覧画面を追加(手動紐付けUI) | 実装1回 |

## 8. コスト・注意点

- **Claude API**: 報告1件あたり約0.5〜1円(解析のみ・軽量)。月500報告でも数百円
- **誤登録対策**: 自動登録はvisits追記が基本(上書きしない)。statusの自動変更は「未訪問→訪問対象」「他社旗→対象外」の安全な遷移のみ
- **プライバシー**: Botはグループの全メッセージを受信するため、業務グループのみに招待する
- **Vercel無料枠**: webhook実行時間(maxDuration 60s)内で完結。画像はLINEサーバーから直接取得
