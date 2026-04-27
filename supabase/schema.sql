-- ========================================
-- たよれば DB スキーマ
-- Supabase SQL Editor で実行してください
-- ========================================

-- propertiesテーブル（物件）
CREATE TABLE IF NOT EXISTS properties (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  address       TEXT        NOT NULL,
  owner_name    TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT '未訪問'
                            CHECK (status IN ('未訪問','訪問対象外','訪問対象','媒介','契約')),
  rank          TEXT        NOT NULL DEFAULT 'C'
                            CHECK (rank IN ('A','B','C')),
  lat           FLOAT8,
  lng           FLOAT8,
  phone         TEXT,
  loan_amount   INTEGER,
  bank_name     TEXT,
  assignee      TEXT,
  case_number   TEXT,
  notes           TEXT,
  import_batch_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- visitsテーブル（訪問記録）
CREATE TABLE IF NOT EXISTS visits (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  contact_type  TEXT,                        -- 接触方法（ドアノック/電話/郵便）
  summary       TEXT,                        -- 内容・メモ
  judgment      TEXT        CHECK (judgment IN ('○','△','✖')),  -- 目処
  next_action   TEXT,                        -- 次のアクション
  next_date     DATE,                        -- 次回訪問予定日
  requests      TEXT,                        -- 要望・特記事項
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_rank   ON properties(rank);
CREATE INDEX IF NOT EXISTS idx_properties_batch  ON properties(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_visits_property   ON visits(property_id);
CREATE INDEX IF NOT EXISTS idx_visits_created    ON visits(created_at DESC);

-- RLS（Row Level Security）有効化
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits     ENABLE ROW LEVEL SECURITY;

-- MVP用: anon keyで全操作許可（本番では認証ポリシーに変更すること）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY allow_all ON properties FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'visits' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY allow_all ON visits FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
