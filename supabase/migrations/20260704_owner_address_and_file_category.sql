-- 2026-07-04 案件画面の見える化対応
-- ①資料の4分類（写真/登記簿/物件目録/その他） ②所有者住所の管理（地図の色分けピン用）

-- 資料の分類列
ALTER TABLE case_files ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'その他';

-- 既存の画像ファイルは「写真」に分類
UPDATE case_files SET category = '写真' WHERE file_type IN ('jpeg', 'jpg', 'png') AND category = 'その他';

-- 所有者住所（所在地とは別に管理し、地図で別色ピン表示）
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_address TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_lat FLOAT8;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_lng FLOAT8;
