-- 2026-07-08 LINE報告自動取り込み対応
-- グループ対応・報告者マッピング・報告ログ

-- line_context をグループ+ユーザー単位で管理できるようにキー拡張
ALTER TABLE line_context ADD COLUMN IF NOT EXISTS context_key TEXT;
UPDATE line_context SET context_key = line_user_id WHERE context_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_line_context_key ON line_context(context_key);

-- 直近アップロード先案件を記憶する列（写真の自動追従添付用）
ALTER TABLE line_context ADD COLUMN IF NOT EXISTS last_report_property_id UUID REFERENCES properties(id);
ALTER TABLE line_context ADD COLUMN IF NOT EXISTS last_report_at TIMESTAMPTZ;

-- 報告者（LINEユーザー）→ 担当者名のマッピング
CREATE TABLE IF NOT EXISTS line_reporters (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  assignee     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 報告の生ログ（取りこぼし防止・監査・再処理用）
CREATE TABLE IF NOT EXISTS line_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     TEXT,
  line_user_id TEXT,
  raw_text     TEXT,
  parsed       JSONB,
  property_id  UUID REFERENCES properties(id),
  status       TEXT NOT NULL DEFAULT 'processed'
                 CHECK (status IN ('processed','unmatched','ignored')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_reports_status ON line_reports(status);
CREATE INDEX IF NOT EXISTS idx_line_reports_created ON line_reports(created_at DESC);

ALTER TABLE line_reporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_reports   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='line_reporters' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON line_reporters FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='line_reports' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON line_reports FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2026-07-09追加: 報告より先に届いた画像の一時保持（案件確定時に自動添付）
CREATE TABLE IF NOT EXISTS line_pending_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_key  TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_size    INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_images_key ON line_pending_images(context_key, created_at DESC);
