import { rateAt } from './rates';

/**
 * 기획자 전용 — 병렬 스펙 슬롯 (Phase 1B).
 * 3개의 슬롯이 동시에 작동.
 * 각 슬롯에 골드 투자 → durationMs 동안 진행 → 완료 시 강화 시도.
 */

export const PLANNER_SLOT_COUNT = 3;

export type PlannerSlot = {
  /** 시작 시각 (epoch ms). 0이면 비어있음. */
  startedAt: number;
  /** 진행 시간 (ms). 시작 시 결정. */
  durationMs: number;
  /** 시작 시 레벨 (강화 시점에 사용). */
  level: number;
};

export function emptyPlannerSlots(): PlannerSlot[] {
  return Array.from({ length: PLANNER_SLOT_COUNT }, () => ({
    startedAt: 0,
    durationMs: 0,
    level: 0,
  }));
}

/**
 * 슬롯 진행 시간 (ms). 단계 sqrt 비례 → 후반부에도 합리적인 시간 유지.
 * 3 슬롯 병렬이므로 effective attempts/min은 더 빠르다.
 *
 * - lv 0:    12s
 * - lv 10:   ~25s
 * - lv 50:   ~40s
 * - lv 100:  ~52s
 * - lv 200:  ~69s
 * - lv 600:  ~110s  (1분 50초)
 * - lv 999:  ~138s  (2분 18초)
 *
 * 비교: 이전 곡선 lv 600 = 912s (15분) — 너무 길었음.
 */
export function plannerSlotDurationMs(level: number): number {
  return Math.round(12_000 + Math.sqrt(level + 1) * 4000);
}

/**
 * 슬롯 시작 비용. 기본 강화 비용과 동일 (3개 동시 시도 가능 = 그만큼 비싸짐).
 */
export function plannerSlotCost(level: number): number {
  return rateAt(level).cost;
}

export type PlannerSlotState =
  | { kind: 'empty' }
  | { kind: 'running'; remainingMs: number; progress01: number; level: number }
  | { kind: 'ready'; level: number };

export function plannerSlotState(slot: PlannerSlot, now: number): PlannerSlotState {
  if (slot.startedAt <= 0 || slot.durationMs <= 0) return { kind: 'empty' };
  const elapsed = now - slot.startedAt;
  if (elapsed >= slot.durationMs) return { kind: 'ready', level: slot.level };
  return {
    kind: 'running',
    remainingMs: slot.durationMs - elapsed,
    progress01: Math.max(0, Math.min(1, elapsed / slot.durationMs)),
    level: slot.level,
  };
}
