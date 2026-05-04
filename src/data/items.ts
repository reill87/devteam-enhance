export type ItemKey =
  | 'protect'
  | 'blessing'
  | 'super_blessing'
  | 'masterhand'
  | 'revive'
  | 'luck'
  | 'deadline'
  | 'gamble'
  | 'refactor'
  | 'moodboard';

export type ItemDef = {
  key: ItemKey;
  label: string;
  shortLabel: string;
  emoji: string;
  desc: string;
  price: number;
  /** 시각 강조 색 */
  color: number;
};

export const ITEMS: Record<ItemKey, ItemDef> = {
  protect: {
    key: 'protect',
    label: '보호권',
    shortLabel: '보호',
    emoji: '🛡️',
    desc: '실패해도 단계 유지 (하락/소멸 무효)',
    price: 2000,
    color: 0x4a90e2,
  },
  blessing: {
    key: 'blessing',
    label: '축복권',
    shortLabel: '축복',
    emoji: '⭐',
    desc: '다음 강화 성공률 +20%p',
    price: 800,
    color: 0xffd23f,
  },
  super_blessing: {
    key: 'super_blessing',
    label: '슈퍼 축복권',
    shortLabel: '슈퍼',
    emoji: '🎯',
    desc: '다음 강화 성공률 +40%p (축복권과 중복 X)',
    price: 4500,
    color: 0xff8c42,
  },
  masterhand: {
    key: 'masterhand',
    label: '장인의 손길',
    shortLabel: '장인',
    emoji: '💎',
    desc: '다음 강화 100% 성공 (비상용)',
    price: 50000,
    color: 0xe24a90,
  },
  revive: {
    key: 'revive',
    label: '부활권',
    shortLabel: '부활',
    emoji: '⛑️',
    desc: '소멸 결과를 단계 유지로 바꿔줌',
    price: 12000,
    color: 0x4ae290,
  },
  luck: {
    key: 'luck',
    label: '행운 부적',
    shortLabel: '행운',
    emoji: '🎰',
    desc: '실패해도 한 번 더 시도. 두 번째 결과 채택',
    price: 6000,
    color: 0xa370ff,
  },
  // ===== Phase 2: 트레이드오프 아이템 (리스크/리워드) =====
  deadline: {
    key: 'deadline',
    label: '마감 압박',
    shortLabel: '마감',
    emoji: '🔥',
    desc: '다음 강화 +30%p, 단 실패 시 단계 하락 +1 추가',
    price: 1500,
    color: 0xe24a4a,
  },
  gamble: {
    key: 'gamble',
    label: '도박러시',
    shortLabel: '도박',
    emoji: '🎲',
    desc: '다음 강화 ±20%p 무작위. 천국 또는 지옥',
    price: 1200,
    color: 0xa370ff,
  },
  refactor: {
    key: 'refactor',
    label: '리팩토링',
    shortLabel: '리팩',
    emoji: '🔄',
    desc: '현재 단계 즉시 +1, 단 다음 강화 자동 실패 (보호 무시)',
    price: 8000,
    color: 0x4a90e2,
  },
  moodboard: {
    key: 'moodboard',
    label: '무드보드',
    shortLabel: '무드',
    emoji: '🎨',
    desc: '디자이너 best의 절반(%p)을 다음 강화에 추가',
    price: 2000,
    color: 0xe24a90,
  },
};

export const ITEM_KEYS: readonly ItemKey[] = [
  'blessing',
  'super_blessing',
  'protect',
  'revive',
  'luck',
  'masterhand',
  'deadline',
  'gamble',
  'refactor',
  'moodboard',
];
