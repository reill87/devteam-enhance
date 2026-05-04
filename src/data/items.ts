export type ItemKey =
  | 'protect'
  | 'blessing'
  | 'super_blessing'
  | 'masterhand'
  | 'revive'
  | 'luck';

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
};

export const ITEM_KEYS: readonly ItemKey[] = [
  'blessing',
  'super_blessing',
  'protect',
  'revive',
  'luck',
  'masterhand',
];
