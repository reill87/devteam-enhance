/**
 * 분기 미션 시스템 (L5, lv 500+ 해금).
 * 8시간 주기로 미션 풀에서 1개 선택해 진행.
 *
 * 진행도 추적은 SaveSystem의 activeMissionProgress (number)로 통합.
 */

export type MissionId =
  | 'enhance-50'
  | 'critical-5'
  | 'hire-2'
  | 'kpi-3'
  | 'office-upgrade'
  | 'gacha-3'
  | 'level-up-10';

export type MissionDef = {
  id: MissionId;
  label: string;
  emoji: string;
  desc: string;
  /** 진행도 목표값 */
  target: number;
  /** 보상 종류 */
  reward: { gold?: number; prestige?: number };
  /** 보상 라벨 */
  rewardLabel: string;
};

export const MISSION_DURATION_MS = 8 * 3600 * 1000; // 8시간

export const MISSIONS: Record<MissionId, MissionDef> = {
  'enhance-50': {
    id: 'enhance-50',
    label: '강화 50회',
    emoji: '⚡',
    desc: '8시간 안에 강화를 50회 시도',
    target: 50,
    reward: { gold: 100_000_000_000 },
    rewardLabel: '💰 +₩1,000억',
  },
  'critical-5': {
    id: 'critical-5',
    label: '크리티컬 5회',
    emoji: '🌟',
    desc: '크리티컬/메가 크리티컬 합계 5회',
    target: 5,
    reward: { prestige: 3 },
    rewardLabel: '⭐ 명성 +3',
  },
  'hire-2': {
    id: 'hire-2',
    label: '신규 채용 2명',
    emoji: '👥',
    desc: '새 팀원 2명 영입',
    target: 2,
    reward: { prestige: 5 },
    rewardLabel: '⭐ 명성 +5',
  },
  'kpi-3': {
    id: 'kpi-3',
    label: '분기 KPI 3회',
    emoji: '🏆',
    desc: '10연속 강화 성공을 3회 달성',
    target: 3,
    reward: { gold: 500_000_000_000, prestige: 2 },
    rewardLabel: '💰 +₩5,000억 · ⭐ +2',
  },
  'office-upgrade': {
    id: 'office-upgrade',
    label: '사옥 1단계 상승',
    emoji: '🏢',
    desc: '현재 사옥을 다음 등급으로 업그레이드',
    target: 1,
    reward: { gold: 10_000_000_000_000 },
    rewardLabel: '💰 +₩10조',
  },
  'gacha-3': {
    id: 'gacha-3',
    label: '헤드헌터 3회',
    emoji: '🎰',
    desc: '헤드헌터 가챠 3회 시도',
    target: 3,
    reward: { prestige: 4 },
    rewardLabel: '⭐ 명성 +4',
  },
  'level-up-10': {
    id: 'level-up-10',
    label: '단계 +10',
    emoji: '📈',
    desc: '본인 단계를 10 이상 상승',
    target: 10,
    reward: { gold: 1_000_000_000_000, prestige: 1 },
    rewardLabel: '💰 +₩1조 · ⭐ +1',
  },
};

export const MISSION_IDS: readonly MissionId[] = Object.keys(MISSIONS) as MissionId[];

export function pickRandomMission(): MissionDef {
  const id = MISSION_IDS[Math.floor(Math.random() * MISSION_IDS.length)];
  return MISSIONS[id];
}

export function isMissionExpired(startedAt: number, now: number = Date.now()): boolean {
  if (startedAt <= 0) return true;
  return now - startedAt >= MISSION_DURATION_MS;
}
