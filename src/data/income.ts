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
    // B2: ×1.3 가속. 0lv: 4, 10lv: 100, 22lv: 312
    reward: (lv) => pow(lv, 1.4, 4),
  },
  side_project: {
    key: 'side_project',
    label: '사이드 프로젝트',
    emoji: '💼',
    unlockLevel: 3,
    type: 'passive',
    param: 60_000,
    // B2: ×1.3. 3lv: 104, 10lv: 1300, 22lv: 4290
    reward: (lv) => pow(lv, 1.5, 13),
  },
  blog: {
    key: 'blog',
    label: '테크 블로그',
    emoji: '📝',
    unlockLevel: 5,
    type: 'click',
    param: 5_000,
    // B2: ×1.3. 5lv: 255, 10lv: 988, 22lv: 4290
    reward: (lv) => pow(lv, 1.5, 20),
  },
  scout: {
    key: 'scout',
    label: '스카웃 메일',
    emoji: '📧',
    unlockLevel: 8,
    type: 'passive',
    param: 120_000,
    // B2: ×1.3. 8lv: 2080, 15lv: 7540, 22lv: 21450
    reward: (lv) => pow(lv, 1.6, 65),
  },
  headhunter: {
    key: 'headhunter',
    label: '헤드헌터 연락',
    emoji: '🎰',
    unlockLevel: 6,
    type: 'event',
    param: 0.05,
    // B2: ×1.3. 6lv: 1690, 15lv: 8450, 22lv: 27300
    reward: (lv) => pow(lv, 1.6, 78),
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
