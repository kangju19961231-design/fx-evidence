-- ====================================================
-- FX Evidence — Supabase スキーマ
-- Supabase の SQL Editor で実行してください
-- ====================================================

-- 1. 旧テーブルを削除（不要なら削除）
DROP TABLE IF EXISTS trades CASCADE;

-- 2. 新テーブル作成
CREATE TABLE daily_records (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  trade_date    DATE           UNIQUE NOT NULL,   -- 取引日
  settlements   INTEGER        NOT NULL DEFAULT 0, -- 決済回数
  wins          INTEGER        NOT NULL DEFAULT 0, -- 勝ち数
  losses        INTEGER        NOT NULL DEFAULT 0, -- 負け数
  pnl           DECIMAL(12,2)  NOT NULL DEFAULT 0, -- 損益（円）
  screenshot_url TEXT,                             -- 画像URL
  created_at    TIMESTAMPTZ    DEFAULT NOW()
);

-- 3. RLS 有効化
ALTER TABLE daily_records ENABLE ROW LEVEL SECURITY;

-- 4. 誰でも読めるポリシー（公開サイト用）
CREATE POLICY "public_read"
  ON daily_records FOR SELECT
  TO anon
  USING (true);

-- 5. サービスロール（Bot）のみ書き込み可能
CREATE POLICY "service_write"
  ON daily_records FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_update"
  ON daily_records FOR UPDATE
  TO service_role
  USING (true);

-- ====================================================
-- Supabase Storage の設定
-- Supabase ダッシュボード → Storage で手動作成：
--   バケット名: screenshots
--   Public: ON（チェックを入れる）
-- ====================================================
