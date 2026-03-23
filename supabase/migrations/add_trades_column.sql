-- daily_records テーブルに trades カラムを追加
-- Supabase SQL Editor で実行してください
-- このカラムがないとマルチスクリーンショット時の重複排除が無効になります

ALTER TABLE daily_records
  ADD COLUMN IF NOT EXISTS trades JSONB DEFAULT '[]'::jsonb;

-- 確認クエリ
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'daily_records'
  AND column_name = 'trades';
