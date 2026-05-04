export type IncomeKey =
  | 'work'
  | 'side_project'
  | 'blog'
  | 'scout'
  | 'headhunter';

export type IncomeType = 'click' | 'passive' | 'event';

export type IncomeDef = {
  key: IncomeKey;
  label: string;
  emoji: string;
  /** 이 단계 이상에서 활성 */
  unlockLevel: number;
  type: IncomeType;
  /** click: 쿨타임(ms) / passive: 주기(ms) / event: 트리거 확률(0~1) */
  param: number;
  /** level → 보상 gold */
  reward: (level: number) => number;
};

/** 단계별 보상이 power law로 증가 (lv가 높을수록 임팩트 큼) */
const pow = (lv: number, exp: number, mult: number) =>
  Math.ceil(Math.pow(lv + 1, exp) * mult);

export const INCOMES: Record<IncomeKey, IncomeDef> = {
  work: {
    key: 'work',
    label: '출근하기',
    emoji: '☕',
    unlockLevel: 0,
    type: 'click',
    param: 0,
    // 0lv: 3, 5lv: 35, 10lv: 76, 22lv: 240
    reward: (lv) => pow(lv, 1.4, 3),
  },
  side_project: {
    key: 'side_project',
    label: '사이드 프로젝트',
    emoji: '💼',
    unlockLevel: 3,
    type: 'passive',
    param: 60_000,
    // 3lv: 80, 10lv: 1000, 22lv: 3300
    reward: (lv) => pow(lv, 1.5, 10),
  },
  blog: {
    key: 'blog',
    label: '테크 블로그',
    emoji: '📝',
    unlockLevel: 5,
    type: 'click',
    param: 5_000,
    // 5lv: 196, 10lv: 760, 22lv: 3300
    reward: (lv) => pow(lv, 1.5, 15),
  },
  scout: {
    key: 'scout',
    label: '스카웃 메일',
    emoji: '📧',
    unlockLevel: 8,
    type: 'passive',
    param: 120_000,
    // 8lv: 1600, 15lv: 5800, 22lv: 16500
    reward: (lv) => pow(lv, 1.6, 50),
  },
  headhunter: {
    key: 'headhunter',
    label: '헤드헌터 연락',
    emoji: '🎰',
    unlockLevel: 6,
    type: 'event',
    param: 0.05,
    // 6lv: 1300, 15lv: 6500, 22lv: 21000
    reward: (lv) => pow(lv, 1.6, 60),
  },
};

export const INCOME_KEYS: readonly IncomeKey[] = [
  'work',
  'side_project',
  'blog',
  'scout',
  'headhunter',
];

export const CLICK_INCOMES = INCOME_KEYS.filter(
  (k) => INCOMES[k].type === 'click',
);
export const PASSIVE_INCOMES = INCOME_KEYS.filter(
  (k) => INCOMES[k].type === 'passive',
);
