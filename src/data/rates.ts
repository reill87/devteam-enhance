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
import type { JobKey } from './characters';

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
 * 명시된 단계별 곡선 (0 → 1 ~ 33 → 34).
 * 35 이상은 rateAt()이 procedural로 계산 — idle/incremental 영역.
 *
 * 비용은 0.85x 완화 적용 (돈 벌기 쉬움 ↑).
 */
export const RATES: readonly LevelRate[] = [
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 13     },  // 0 → 1
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 21     },  // 1 → 2
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 34     },  // 2 → 3
  { successRate: 1.00, fail: { kind: 'stay' },            cost: 55     },  // 3 → 4
  { successRate: 0.95, fail: { kind: 'stay' },            cost: 85     },  // 4 → 5
  { successRate: 0.90, fail: { kind: 'stay' },            cost: 136    },  // 5 → 6
  { successRate: 0.85, fail: { kind: 'stay' },            cost: 204    },  // 6 → 7
  { successRate: 0.80, fail: { kind: 'stay' },            cost: 306    },  // 7 → 8
  { successRate: 0.75, fail: { kind: 'stay' },            cost: 442    },  // 8 → 9
  { successRate: 0.70, fail: { kind: 'stay' },            cost: 663    },  // 9 → 10
  { successRate: 0.62, fail: { kind: 'stay' },            cost: 935    },  // 10 → 11
  { successRate: 0.55, fail: { kind: 'stay' },            cost: 1360   },  // 11 → 12
  { successRate: 0.48, fail: { kind: 'stay' },            cost: 1955   },  // 12 → 13
  { successRate: 0.42, fail: { kind: 'down', amount: 1 }, cost: 2805   },  // 13 → 14
  { successRate: 0.36, fail: { kind: 'down', amount: 1 }, cost: 4080   },  // 14 → 15
  { successRate: 0.32, fail: { kind: 'down', amount: 1 }, cost: 5950   },  // 15 → 16
  { successRate: 0.28, fail: { kind: 'down', amount: 1 }, cost: 8500   },  // 16 → 17
  { successRate: 0.24, fail: { kind: 'down', amount: 1 }, cost: 12325  },  // 17 → 18
  { successRate: 0.20, fail: { kind: 'down', amount: 1 }, cost: 17850  },  // 18 → 19
  { successRate: 0.18, fail: { kind: 'down', amount: 2 }, cost: 25500  },  // 19 → 20
  { successRate: 0.15, fail: { kind: 'down', amount: 2 }, cost: 37400  },  // 20 → 21
  { successRate: 0.13, fail: { kind: 'down', amount: 2 }, cost: 55250  },  // 21 → 22
  { successRate: 0.11, fail: { kind: 'destroy' },         cost: 76500  },  // 22 → 23
  { successRate: 0.10, fail: { kind: 'destroy' },         cost: 110000 },  // 23 → 24
  { successRate: 0.09, fail: { kind: 'destroy' },         cost: 158000 },  // 24 → 25
  { successRate: 0.08, fail: { kind: 'destroy' },         cost: 226000 },  // 25 → 26
  { successRate: 0.07, fail: { kind: 'destroy' },         cost: 322000 },  // 26 → 27
  { successRate: 0.06, fail: { kind: 'destroy' },         cost: 458000 },  // 27 → 28
  { successRate: 0.05, fail: { kind: 'destroy' },         cost: 651000 },  // 28 → 29
  { successRate: 0.04, fail: { kind: 'destroy' },         cost: 924000 },  // 29 → 30
  { successRate: 0.03, fail: { kind: 'destroy' },         cost: 1310000 }, // 30 → 31
  { successRate: 0.02, fail: { kind: 'destroy' },         cost: 1850000 }, // 31 → 32
  { successRate: 0.015, fail: { kind: 'destroy' },        cost: 2620000 }, // 32 → 33
  { successRate: 0.01, fail: { kind: 'destroy' },         cost: 3700000 }, // 33 → 34
  { successRate: 0.008, fail: { kind: 'destroy' },        cost: 5240000 }, // 34 → 35
];

/**
 * 단계별 강화 파라미터를 가져온다. RATES 배열(35개)을 넘어서면 procedural.
 *
 * - lv 35~999 (idle 영역): 비용은 부드러운 power law (lv^2.2),
 *   성공률은 천천히 감소 후 0.5%로 수렴.
 * - 실패 시: destroy (부활권/마스터핸드로 우회)
 */
export function rateAt(level: number): LevelRate {
  if (level < RATES.length) return RATES[level];
  // procedural ≥ 35
  // 비용: 5.24M × ((level-34)/1)^1.05 × 1.05^(level-34)
  //  → 부드러운 다항식 + 약한 지수
  const offset = level - (RATES.length - 1);  // ≥ 1
  const cost = Math.round(5_240_000 * Math.pow(offset, 1.05) * Math.pow(1.05, offset - 1));
  // 성공률: 0.008에서 출발해 매우 천천히 감소, 0.5% 캡
  const successRate = Math.max(0.005, 0.008 * Math.pow(0.96, offset));
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

export const STARTING_GOLD = 1000;

/** 자동 골드 회복 주기 (ms) */
export const REGEN_INTERVAL_MS = 3000;

/**
 * 단계별 자동 회복량 (3초마다). power law 가속 (B2: ×1.5 효과).
 * lv 0=2, lv 10=39, lv 30=274, lv 100=2783, lv 500=58k, lv 999=176k
 */
export function regenAmount(level: number): number {
  return Math.max(2, Math.ceil(Math.pow(level + 1, 1.5) * 1.5));
}

/** 출근하기 버튼 클릭당 획득량 (B2: ×1.6 가속) */
export function workClickReward(level: number): number {
  return Math.max(4, Math.ceil(Math.pow(level + 1, 1.6) * 4));
}

// ============ 직군별 비대칭 (Phase 1A~1C) ============

/**
 * 개발자 콤보 만료 시간 (ms).
 * 마지막 강화 후 이 시간이 지나면 콤보가 0으로 리셋된다.
 */
export const DEVELOPER_COMBO_DEADLINE_MS = 8000;

/** 개발자 콤보당 보너스(%p). 캡 포함. */
export const DEVELOPER_COMBO_BONUS_PER = 0.01;
export const DEVELOPER_COMBO_BONUS_CAP = 0.30;

/**
 * 직군별 강화 비용 배수.
 * - developer: 0.7 (자주 시도해 콤보 유지 가능)
 * - planner/designer: 1.0
 */
export function costMultiplierFor(job: JobKey): number {
  return job === 'developer' ? 0.7 : 1.0;
}

/**
 * 직군별 실패 페널티 오버레이.
 * 개발자는 단계 하락 폭이 1 더 가혹, destroy 시작 단계도 한 단계 빨리 진입.
 */
export function failPenaltyFor(level: number, job: JobKey): FailPenalty {
  const base = rateAt(level).fail;
  if (job !== 'developer') return base;
  switch (base.kind) {
    case 'stay':
      return base;
    case 'down':
      return { kind: 'down', amount: base.amount + 1 };
    case 'destroy':
      return base;
  }
}

/**
 * 직군별 강화 비용 (개발자 ×0.7).
 */
export function costForJob(level: number, job: JobKey): number {
  return Math.max(1, Math.round(rateAt(level).cost * costMultiplierFor(job)));
}

// ============ 직군 간 시너지 게이팅 (Phase 3) ============

/**
 * 다음 단계로 강화하려면 다른 두 직군 best의 평균이 이 값 이상이어야 한다.
 * - 0~9단계: 게이트 없음 (자유롭게 진행)
 * - 10단계 이상부터: max(0, currentLevel - 5) 평균 필요
 *
 * 의도: 한 직군만 미는 외길 빌드를 lv 10에서 막음 → 셋 다 키우게 유도.
 */
export function synergyGateAvg(currentLevel: number): number {
  if (currentLevel < 10) return 0;
  return currentLevel - 5;
}

/**
 * 강화 가능 여부.
 * @param currentLevel 현재 강화하려는 직군의 레벨 (i → i+1 시도)
 * @param otherBestAvg 다른 두 직군의 best 단계 평균
 * @returns ok: 통과, gated: 차단됨 (얼마 부족한지)
 */
export type GateResult = { ok: true } | { ok: false; required: number; have: number };

export function checkSynergyGate(currentLevel: number, otherBestAvg: number): GateResult {
  const req = synergyGateAvg(currentLevel);
  if (req === 0 || otherBestAvg >= req) return { ok: true };
  return { ok: false, required: req, have: otherBestAvg };
}
