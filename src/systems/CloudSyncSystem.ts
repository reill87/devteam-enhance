import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { type SaveData } from './SaveSystem';

/**
 * 클라우드 동기화 시스템.
 * - Supabase 익명 인증으로 user_id 확보
 * - SaveData를 game_saves.data (JSONB)에 통째로 저장
 * - bestByJob, prestige는 비정규화 컬럼으로도 저장 (리더보드 인덱스용)
 *
 * Supabase 미설정 시 자동으로 no-op (로컬만 동작).
 */

let cachedUserId: string | null = null;
let savePromise: Promise<void> | null = null;

export type LeaderboardRow = {
  user_id: string;
  nickname: string;
  best_developer: number;
  best_planner: number;
  best_designer: number;
  prestige: number;
  best_overall: number;
  total_levels: number;
  updated_at: string;
};

/**
 * 익명 인증해서 user_id를 확보. 이미 인증된 세션이 있으면 그대로 사용.
 */
export async function ensureAnonymousUser(): Promise<string | null> {
  if (!isSupabaseEnabled() || !supabase) return null;
  if (cachedUserId) return cachedUserId;

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) {
    cachedUserId = sessionData.session.user.id;
    return cachedUserId;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn('[cloud] anonymous sign-in failed', error.message);
    return null;
  }
  cachedUserId = data.user?.id ?? null;
  return cachedUserId;
}

/**
 * 닉네임이 등록되어 있는지 확인. 없으면 null.
 */
export async function fetchOwnNickname(): Promise<string | null> {
  if (!isSupabaseEnabled() || !supabase) return null;
  const userId = await ensureAnonymousUser();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('game_users')
    .select('nickname')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[cloud] fetch nickname failed', error.message);
    return null;
  }
  return data?.nickname ?? null;
}

/**
 * 닉네임 등록 또는 변경. game_users 행을 upsert.
 */
export async function setNickname(nickname: string): Promise<boolean> {
  if (!isSupabaseEnabled() || !supabase) return false;
  const userId = await ensureAnonymousUser();
  if (!userId) return false;

  const trimmed = nickname.trim().slice(0, 20);
  if (!trimmed) return false;

  const { error } = await supabase
    .from('game_users')
    .upsert(
      { id: userId, nickname: trimmed },
      { onConflict: 'id' },
    );
  if (error) {
    console.warn('[cloud] set nickname failed', error.message);
    return false;
  }
  return true;
}

/**
 * 클라우드에서 SaveData 로드. 없으면 null.
 */
export async function loadCloudSave(): Promise<{ data: SaveData; updatedAt: string } | null> {
  if (!isSupabaseEnabled() || !supabase) return null;
  const userId = await ensureAnonymousUser();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('game_saves')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[cloud] load save failed', error.message);
    return null;
  }
  if (!data) return null;
  return { data: data.data as SaveData, updatedAt: data.updated_at as string };
}

/**
 * SaveData를 클라우드에 업로드 (debounced 호출 권장).
 */
export async function pushCloudSave(save: SaveData): Promise<boolean> {
  if (!isSupabaseEnabled() || !supabase) return false;
  const userId = await ensureAnonymousUser();
  if (!userId) return false;

  // 동시 호출 방지: 진행 중인 push가 있으면 그게 끝나면 다시 시도하는 형태로 단순화
  if (savePromise) await savePromise;

  savePromise = (async () => {
    if (!supabase) return;
    const payload = {
      user_id: userId,
      data: save,
      best_developer: save.bestByJob.developer,
      best_planner: save.bestByJob.planner,
      best_designer: save.bestByJob.designer,
      prestige: save.prestige,
    };
    const { error } = await supabase
      .from('game_saves')
      .upsert(payload, { onConflict: 'user_id' });
    if (error) {
      console.warn('[cloud] push save failed', error.message);
    }
  })();

  await savePromise;
  savePromise = null;
  return true;
}

/**
 * 리더보드 상위 N명 (정렬 키: best_overall 또는 prestige).
 */
export type LeaderboardSort = 'best_overall' | 'prestige' | 'best_developer' | 'best_planner' | 'best_designer';

export async function fetchLeaderboard(
  sort: LeaderboardSort = 'best_overall',
  limit = 30,
): Promise<LeaderboardRow[]> {
  if (!isSupabaseEnabled() || !supabase) return [];

  const { data, error } = await supabase
    .from('game_leaderboard')
    .select('*')
    .order(sort, { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[cloud] fetch leaderboard failed', error.message);
    return [];
  }
  return (data ?? []) as LeaderboardRow[];
}

export function clearCachedUserId(): void {
  cachedUserId = null;
}
