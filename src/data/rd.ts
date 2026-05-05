/**
 * R&D 투자 시스템 — 골드 sink + 영구 부스트.
 * 3개 트랙, 각 10단계, 비용 누적 증가 (×2 per step).
 *
 * 트랙:
 *  - enhance: 본체 강화 성공률 +0.5%p (단계당)
 *  - ops: 회복/클릭 ×1.05 (단계당) → 누적
 *  - global: 팀 매출 ×1.10 (단계당) → 누적
 *
 * 비용: base × 2^(currentLevel)
 */

export type RdTrack = 'enhance' | 'ops' | 'global';

export const RD_MAX_LEVEL = 10;

export type RdTrackDef = {
  id: RdTrack;
  emoji: string;
  label: string;
  desc: string;
  effectPerLevel: string;
  /** 1단계 비용 (KRW) */
  baseCost: number;
};

export const RD_TRACKS: Record<RdTrack, RdTrackDef> = {
  enhance: {
    id: 'enhance',
    emoji: '🔬',
    label: '본체 강화 연구',
    desc: '강화 성공률 영구 +0.5%p',
    effectPerLevel: '+0.5%p',
    baseCost: 30_000_000_000_000,    // 30조
  },
  ops: {
    id: 'ops',
    emoji: '⚙️',
    label: '운영 자동화',
    desc: '자동 회복/클릭 보상 ×1.05',
    effectPerLevel: '×1.05',
    baseCost: 50_000_000_000_000,    // 50조
  },
  global: {
    id: 'global',
    emoji: '🌐',
    label: '글로벌 확장',
    desc: '팀 매출 ×1.10',
    effectPerLevel: '×1.10',
    baseCost: 100_000_000_000_000,   // 100조
  },
};

export const RD_TRACK_IDS: readonly RdTrack[] = ['enhance', 'ops', 'global'];

/** 다음 투자 비용 (currentLevel 0~9). 10단계 도달 후 -1. */
export function rdNextCost(track: RdTrack, currentLevel: number): number {
  if (currentLevel >= RD_MAX_LEVEL) return -1;
  return Math.round(RD_TRACKS[track].baseCost * Math.pow(2, currentLevel));
}

/** 누적 효과 — 단계 N 도달 시. */
export function rdEnhanceBonus(level: number): number {
  // 단계당 +0.5%p
  return level * 0.005;
}
export function rdOpsMultiplier(level: number): number {
  // ×1.05 누적
  return Math.pow(1.05, level);
}
export function rdGlobalMultiplier(level: number): number {
  // ×1.10 누적
  return Math.pow(1.10, level);
}

export type RdState = {
  enhance: number;
  ops: number;
  global: number;
};

export function emptyRdState(): RdState {
  return { enhance: 0, ops: 0, global: 0 };
}
