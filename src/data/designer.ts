/**
 * 디자이너 전용 — 다라운드 시안 검토 (Phase 1C).
 * 강화 1회 = 3라운드. 모든 라운드를 통과해야 강화 성공.
 * 라운드별 확률 = (overall_eff_rate)^(1/3) → 누적 통과 확률 = overall_eff_rate.
 */

export const DESIGNER_ROUND_COUNT = 3;

/** 라운드 사이 인터벌 (ms). 빌드업 총 시간 = 인터벌 × 라운드 수. */
export const DESIGNER_ROUND_INTERVAL_MS = 320;

/**
 * 라운드별 통과 확률을 계산.
 * P(all N rounds pass) = perRound^N = effRate
 *   → perRound = effRate^(1/N)
 */
export function designerPerRoundRate(effRate: number): number {
  if (effRate <= 0) return 0;
  if (effRate >= 1) return 1;
  return Math.pow(effRate, 1 / DESIGNER_ROUND_COUNT);
}

export const DESIGNER_ROUND_LABELS = ['1차 시안', '2차 시안', '3차 시안'] as const;
