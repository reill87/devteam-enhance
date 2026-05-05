/**
 * 마일스톤 시스템 — 특정 단계 도달 시 일회성 보너스 + 컷인.
 * 직군마다 별개로 트리거 (developer lv 50, planner lv 50 등 따로).
 */

export type MilestoneDef = {
  level: number;
  label: string;
  /** 일시불 골드 보너스 (현 단계 cost의 N배 등) */
  goldBonus: number;
  /** prestige (명성) 보너스 */
  prestigeBonus: number;
  /** 컷인 메시지 */
  message: string;
};

export const MILESTONES: readonly MilestoneDef[] = [
  {
    level: 50,
    label: '🌟 신화 등극',
    goldBonus: 5_000_000,
    prestigeBonus: 2,
    message: '신화 영역 진입! 업계 전설로 기록됩니다.',
  },
  {
    level: 100,
    label: '💫 초월의 경지',
    goldBonus: 100_000_000,
    prestigeBonus: 5,
    message: '범인의 한계를 초월했습니다. 명성 +5.',
  },
  {
    level: 200,
    label: '🌌 차원 돌파',
    goldBonus: 1_500_000_000,
    prestigeBonus: 10,
    message: '차원의 벽을 깨뜨렸습니다. 명성 +10.',
  },
  {
    level: 500,
    label: '✨ 우주적 존재',
    goldBonus: 100_000_000_000,
    prestigeBonus: 25,
    message: '우주 자체가 당신을 인지하기 시작합니다.',
  },
  {
    level: 999,
    label: '♾️ 옴니버스 완성',
    goldBonus: 10_000_000_000_000,
    prestigeBonus: 100,
    message: '모든 차원이 당신의 코드/디자인/기획을 따릅니다.',
  },
];

/**
 * 한 번에 도달한 단계가 여러 마일스톤을 동시에 통과할 수 있다 (예: 0→999).
 * `reachedFrom`은 직전 best level, `reachedTo`는 새 best level.
 */
export function milestonesReached(
  reachedFrom: number,
  reachedTo: number,
): MilestoneDef[] {
  return MILESTONES.filter((m) => m.level > reachedFrom && m.level <= reachedTo);
}
