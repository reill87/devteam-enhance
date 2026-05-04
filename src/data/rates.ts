/**
 * 강화 확률 + 비용 + 보상 테이블
 * index = 현재 레벨, "i → i+1 시도"의 파라미터
 *
 * 곡선 의도:
 * - 0~2: 사실상 보장 (입문 도파민)
 * - 3~5: 70~85% (쭉쭉 올라가는 맛)
 * - 6~8: 가팔라짐, 단계 하락 시작
 * - 9~10: 폭사 가능, 진짜 도전
 */
export type FailPenalty =
  | { kind: 'stay' }
  | { kind: 'down'; amount: number }
  | { kind: 'destroy' };

export type LevelRate = {
  /** 다음 단계로 올라갈 성공률 (0~1) */
  successRate: number;
  /** 실패 시 페널티 */
  fail: FailPenalty;
  /** 강화 시도 비용 (gold) */
  cost: number;
};

/**
 * 명시된 단계별 곡선 (0 → 1 ~ 14 → 15).
 * 15 이후는 rateAt()이 procedural로 계산.
 */
export const RATES: readonly LevelRate[] = [
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 15     },  // 0 → 1
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 25     },  // 1 → 2
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 40     },  // 2 → 3
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 65     },  // 3 → 4
  { successRate: 0.95, fail: { kind: 'stay' },            cost: 100    },  // 4 → 5
  { successRate: 0.90, fail: { kind: 'stay' },            cost: 160    },  // 5 → 6
  { successRate: 0.85, fail: { kind: 'stay' },            cost: 240    },  // 6 → 7
  { successRate: 0.80, fail: { kind: 'stay' },            cost: 360    },  // 7 → 8
  { successRate: 0.75, fail: { kind: 'stay' },            cost: 520    },  // 8 → 9
  { successRate: 0.70, fail: { kind: 'stay' },            cost: 780    },  // 9 → 10
  { successRate: 0.60, fail: { kind: 'stay' },            cost: 1100   },  // 10 → 11
  { successRate: 0.50, fail: { kind: 'stay' },            cost: 1600   },  // 11 → 12
  { successRate: 0.40, fail: { kind: 'stay' },            cost: 2300   },  // 12 → 13
  { successRate: 0.32, fail: { kind: 'down', amount: 1 }, cost: 3300   },  // 13 → 14
  { successRate: 0.25, fail: { kind: 'down', amount: 1 }, cost: 4800   },  // 14 → 15
  { successRate: 0.18, fail: { kind: 'down', amount: 1 }, cost: 7000   },  // 15 → 16
  { successRate: 0.12, fail: { kind: 'down', amount: 2 }, cost: 10000  },  // 16 → 17
  { successRate: 0.08, fail: { kind: 'down', amount: 2 }, cost: 14500  },  // 17 → 18
  { successRate: 0.06, fail: { kind: 'destroy' },         cost: 21000  },  // 18 → 19
  { successRate: 0.04, fail: { kind: 'destroy' },         cost: 30000  },  // 19 → 20
  { successRate: 0.025, fail: { kind: 'destroy' },        cost: 44000  },  // 20 → 21
  { successRate: 0.015, fail: { kind: 'destroy' },        cost: 65000  },  // 21 → 22
];

/**
 * 단계별 강화 파라미터를 가져온다. RATES 배열을 넘어서면 procedural로 계산.
 * - 성공률: 마지막 단계에서 매 단계 ×0.85, 최소 0.1%
 * - 비용: 마지막 단계에서 매 단계 ×1.4
 * - 실패 시: destroy
 */
export function rateAt(level: number): LevelRate {
  if (level < RATES.length) return RATES[level];
  const last = RATES[RATES.length - 1];
  const offset = level - (RATES.length - 1);
  const successRate = Math.max(0.001, last.successRate * Math.pow(0.85, offset));
  const cost = Math.round(last.cost * Math.pow(1.55, offset));
  return { successRate, fail: { kind: 'destroy' }, cost };
}

/**
 * 결과별 골드 보상.
 * - success: 비용의 일부 환급 (재투자 흐름)
 * - fail-stay: 적은 위로금
 * - fail-down: 단계 손실 보전
 * - destroy: 큰 보너스 (잔해 / 보험금 콘셉트, 다시 시작 동력)
 */
export function rewardFor(
  result: 'success' | 'fail-stay' | 'fail-down' | 'destroy',
  cost: number,
): number {
  switch (result) {
    case 'success':   return Math.round(cost * 0.6);
    case 'fail-stay': return Math.round(cost * 0.5);
    case 'fail-down': return Math.round(cost * 0.7);
    case 'destroy':   return Math.max(5000, cost * 2);
  }
}

export const STARTING_GOLD = 500;

/** 자동 골드 회복 주기 (ms) */
export const REGEN_INTERVAL_MS = 3000;

/**
 * 단계별 자동 회복량 (3초마다).
 * power law: 단계가 높을수록 회복도 커지지만 후반에 감속.
 */
export function regenAmount(level: number): number {
  return Math.max(2, Math.ceil(Math.pow(level + 1, 1.3)));
}

/** 출근하기 버튼 클릭당 획득량 (power law) */
export function workClickReward(level: number): number {
  return Math.max(3, Math.ceil(Math.pow(level + 1, 1.4) * 3));
}
