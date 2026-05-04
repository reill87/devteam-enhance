-- =============================================================
-- 개발팀 강화하기 — Supabase 스키마
-- 같은 프로젝트(stockontext) DB에 게임 전용 테이블만 추가
-- =============================================================

-- 1) 사용자 테이블 (Supabase auth.users와 1:1)
CREATE TABLE IF NOT EXISTS public.game_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_users_nickname ON public.game_users(nickname);

-- 2) 클라우드 세이브 (1 user : 1 row, 통째로 JSON 보관)
CREATE TABLE IF NOT EXISTS public.game_saves (
  user_id UUID PRIMARY KEY REFERENCES public.game_users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  -- 빠른 조회용 비정규화 (강화 결과 시 갱신)
  best_developer INTEGER NOT NULL DEFAULT 0,
  best_planner INTEGER NOT NULL DEFAULT 0,
  best_designer INTEGER NOT NULL DEFAULT 0,
  prestige INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_saves_best_dev ON public.game_saves(best_developer DESC);
CREATE INDEX IF NOT EXISTS idx_game_saves_best_pla ON public.game_saves(best_planner DESC);
CREATE INDEX IF NOT EXISTS idx_game_saves_best_des ON public.game_saves(best_designer DESC);
CREATE INDEX IF NOT EXISTS idx_game_saves_prestige ON public.game_saves(prestige DESC);

-- 3) 리더보드 뷰 (직군별 순위)
CREATE OR REPLACE VIEW public.game_leaderboard AS
SELECT
  u.id AS user_id,
  u.nickname,
  s.best_developer,
  s.best_planner,
  s.best_designer,
  s.prestige,
  GREATEST(s.best_developer, s.best_planner, s.best_designer) AS best_overall,
  s.best_developer + s.best_planner + s.best_designer AS total_levels,
  s.updated_at
FROM public.game_users u
JOIN public.game_saves s ON s.user_id = u.id;

-- =============================================================
-- RLS (Row-Level Security)
-- =============================================================
ALTER TABLE public.game_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_saves ENABLE ROW LEVEL SECURITY;

-- game_users
DROP POLICY IF EXISTS "Anyone can read users (for leaderboard)" ON public.game_users;
CREATE POLICY "Anyone can read users (for leaderboard)"
  ON public.game_users FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users insert their own row" ON public.game_users;
CREATE POLICY "Users insert their own row"
  ON public.game_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users update their own row" ON public.game_users;
CREATE POLICY "Users update their own row"
  ON public.game_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- game_saves: 본인만 읽기/쓰기. 리더보드는 view 통해 우회.
DROP POLICY IF EXISTS "Users read own save" ON public.game_saves;
CREATE POLICY "Users read own save"
  ON public.game_saves FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users upsert own save" ON public.game_saves;
CREATE POLICY "Users upsert own save"
  ON public.game_saves FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own save" ON public.game_saves;
CREATE POLICY "Users update own save"
  ON public.game_saves FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 리더보드 뷰는 누구나 읽기 가능 (보조 row가 비정규화되어 RLS에 영향 안 받음)
GRANT SELECT ON public.game_leaderboard TO anon, authenticated;

-- =============================================================
-- updated_at 자동 갱신 트리거
-- =============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_game_users_updated_at ON public.game_users;
CREATE TRIGGER trg_game_users_updated_at
  BEFORE UPDATE ON public.game_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_game_saves_updated_at ON public.game_saves;
CREATE TRIGGER trg_game_saves_updated_at
  BEFORE UPDATE ON public.game_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
