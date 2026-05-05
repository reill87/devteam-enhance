/**
 * 사옥 등급 시스템 (L2). 단계별 매출 멀티 + 시각 변화.
 * 업그레이드는 일회성 골드 비용. 명성/단계 조건 충족 후 골드 지불 → 영구 업그레이드.
 */

export type OfficeTier = {
  tier: number;             // 0~4
  name: string;
  emoji: string;
  /** 모든 매출/회복/클릭에 곱해지는 멀티플라이어 */
  multiplier: number;
  /** 업그레이드 비용 (KRW) */
  upgradeCost: number;
  /** 도달 조건 — 본인 best 단계 (한 직군 이상) */
  requiredLevel: number;
  /** 배경 색 (Phaser 색) */
  bgColor: number;
  /** 컷인 메시지 */
  unlockMessage: string;
};

export const OFFICE_TIERS: readonly OfficeTier[] = [
  {
    tier: 0,
    name: '스타트업',
    emoji: '🏠',
    multiplier: 1.0,
    upgradeCost: 0,
    requiredLevel: 0,
    bgColor: 0x0e0e12,
    unlockMessage: '',
  },
  {
    tier: 1,
    name: '중견 기업',
    emoji: '🏢',
    multiplier: 1.5,
    upgradeCost: 1_000_000,                // 100억 KRW (gold 단위)
    requiredLevel: 50,
    bgColor: 0x141822,
    unlockMessage: '🏢 중견 기업 사옥으로 이전 — 모든 매출 ×1.5',
  },
  {
    tier: 2,
    name: '대기업',
    emoji: '🏛',
    multiplier: 2.5,
    upgradeCost: 5_000_000_000,            // 50조 KRW
    requiredLevel: 200,
    bgColor: 0x1a2236,
    unlockMessage: '🏛 대기업 사옥 입주 — 모든 매출 ×2.5',
  },
  {
    tier: 3,
    name: '글로벌 기업',
    emoji: '🌐',
    multiplier: 4.0,
    upgradeCost: 200_000_000_000,          // 2000조 KRW
    requiredLevel: 300,
    bgColor: 0x1e2240,
    unlockMessage: '🌐 글로벌 기업 본사 — 모든 매출 ×4.0',
  },
  {
    tier: 4,
    name: '다국적 그룹',
    emoji: '🏗',
    multiplier: 6.0,
    upgradeCost: 3e12,                     // 3경 KRW
    requiredLevel: 400,
    bgColor: 0x202848,
    unlockMessage: '🏗 다국적 그룹 — 매출 ×6.0',
  },
  {
    tier: 5,
    name: '다이아 그룹',
    emoji: '💎',
    multiplier: 8.0,
    upgradeCost: 5e13,                     // 50경 KRW
    requiredLevel: 550,
    bgColor: 0x1e2a4a,
    unlockMessage: '💎 다이아 그룹 본사 — 매출 ×8.0',
  },
  {
    tier: 6,
    name: '옴니버스',
    emoji: '🌌',
    multiplier: 12.0,
    upgradeCost: 1e16,                     // 100경 KRW
    requiredLevel: 700,
    bgColor: 0x2a1e4a,
    unlockMessage: '🌌 옴니버스 회사 — 차원 너머의 사옥. 매출 ×12',
  },
];

export function officeTierAt(tier: number): OfficeTier {
  if (tier < 0) return OFFICE_TIERS[0];
  if (tier >= OFFICE_TIERS.length) return OFFICE_TIERS[OFFICE_TIERS.length - 1];
  return OFFICE_TIERS[tier];
}

export function officeMultiplier(tier: number): number {
  return officeTierAt(tier).multiplier;
}

export function nextOfficeTier(currentTier: number): OfficeTier | null {
  if (currentTier + 1 >= OFFICE_TIERS.length) return null;
  return OFFICE_TIERS[currentTier + 1];
}
