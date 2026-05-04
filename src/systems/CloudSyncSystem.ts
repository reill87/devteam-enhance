import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { type SaveData } from './SaveSystem';

/**
 * 클라우드 동기화 시스템 (이메일+비밀번호 인증).
 * - 로그인하지 않으면 모든 클라우드 함수는 no-op (로컬 모드)
 * - SaveData를 game_saves.data (JSONB)에 통째로 저장
 * - bestByJob, prestige는 비정규화 컬럼으로 저장 (리더보드 인덱스용)
 */

let cachedUserId: string | null = null;
let savePromise: Promise<void> | null = null;

export type AuthResult = { ok: boolean; reason?: string };

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
 * 현재 활성 세션의 user_id (없으면 null).
 */
export async function getSessionUserId(): Promise<string | null> {
  if (!isSupabaseEnabled() || !supabase) return null;
  if (cachedUserId) return cachedUserId;
  const { data } = await supabase.auth.getSession();
  cachedUserId = data.session?.user.id ?? null;
  return cachedUserId;
}

export function isLoggedIn(): boolean {
  return cachedUserId !== null;
}

/**
 * 회원가입 + 자동 로그인 + 닉네임 등록 (game_users insert).
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  nickname: string,
): Promise<AuthResult> {
  if (!isSupabaseEnabled() || !supabase) {
    return { ok: false, reason: 'Supabase 환경변수(.env) 미설정' };
  }
  const trimmedNick = nickname.trim().slice(0, 20);
  if (!trimmedNick) return { ok: false, reason: '닉네임을 입력해주세요.' };
  if (password.length < 6) return { ok: false, reason: '비밀번호는 최소 6자입니다.' };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
  if (error) {
    console.warn('[cloud] sign up failed', error);
    return { ok: false, reason: error.message };
  }
  const userId = data.user?.id;
  if (!userId) {
    return { ok: false, reason: '가입 후 사용자 ID를 받지 못했습니다. 이메일 인증이 필요한 환경이라면 메일 확인 후 다시 시도하세요.' };
  }
  cachedUserId = userId;

  // 닉네임 즉시 등록
  const { error: nickError } = await supabase
    .from('game_users')
    .upsert({ id: userId, nickname: trimmedNick }, { onConflict: 'id' });
  if (nickError) {
    console.warn('[cloud] nickname insert after signup failed', nickError);
    // 가입은 성공했지만 닉네임 저장 실패. 사용자가 다시 시도 가능.
    return { ok: true, reason: `가입은 성공했으나 닉네임 저장 실패: ${nickError.message}` };
  }
  return { ok: true };
}

/**
 * 이메일+비밀번호 로그인.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseEnabled() || !supabase) {
    return { ok: false, reason: 'Supabase 환경변수(.env) 미설정' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    console.warn('[cloud] sign in failed', error);
    return { ok: false, reason: error.message };
  }
  cachedUserId = data.user?.id ?? null;
  return { ok: true };
}

/**
 * 로그아웃.
 */
export async function signOut(): Promise<AuthResult> {
  if (!isSupabaseEnabled() || !supabase) return { ok: true };
  const { error } = await supabase.auth.signOut();
  cachedUserId = null;
  if (error) {
    console.warn('[cloud] sign out failed', error);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/**
 * 현재 사용자의 닉네임 조회.
 */
export async function fetchOwnNickname(): Promise<string | null> {
  if (!isSupabaseEnabled() || !supabase) return null;
  const userId = await getSessionUserId();
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
 * 닉네임 변경.
 */
export async function setNickname(
  nickname: string,
): Promise<AuthResult> {
  if (!isSupabaseEnabled() || !supabase) {
    return { ok: false, reason: 'Supabase 환경변수(.env) 미설정' };
  }
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, reason: '로그인이 필요합니다.' };

  const trimmed = nickname.trim().slice(0, 20);
  if (!trimmed) return { ok: false, reason: '닉네임을 입력해주세요.' };

  const { error } = await supabase
    .from('game_users')
    .upsert({ id: userId, nickname: trimmed }, { onConflict: 'id' });
  if (error) {
    console.warn('[cloud] set nickname failed', error);
    return { ok: false, reason: `DB 오류: ${error.message}` };
  }
  return { ok: true };
}

/**
 * 클라우드에서 SaveData 로드. 로그인 안 했거나 데이터 없으면 null.
 */
export async function loadCloudSave(): Promise<{ data: SaveData; updatedAt: string } | null> {
  if (!isSupabaseEnabled() || !supabase) return null;
  const userId = await getSessionUserId();
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
 * SaveData를 클라우드에 push (debounced 호출 권장).
 */
export async function pushCloudSave(save: SaveData): Promise<boolean> {
  if (!isSupabaseEnabled() || !supabase) return false;
  const userId = await getSessionUserId();
  if (!userId) return false;

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
 * 리더보드 상위 N명.
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
