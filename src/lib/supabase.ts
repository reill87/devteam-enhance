import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase가 환경변수로 설정되지 않으면 클라이언트는 null.
 * 호출부에서는 isSupabaseEnabled()로 체크 후 분기 처리.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export function isSupabaseEnabled(): boolean {
  return supabase !== null;
}
