import type { JobKey } from './characters';

/**
 * 프로젝트 출시 시스템 (Phase 4 — 엔드게임 미션).
 *
 * 트리거:
 *  - 3직군 best가 모두 nextProjectThreshold 단계 이상이면 "출시 가능".
 *  - 출시 시도 → 성공/실패 결정. 성공 시 nextProjectThreshold += 5.
 *
 * 보상:
 *  - 성공: prestige +3, 큰 골드 보너스, 메뉴에 출시 횟수 누적
 *  - 실패: 위로금 (작은 골드)
 */

export const FIRST_PROJECT_THRESHOLD = 5;
export const PROJECT_THRESHOLD_STEP = 5;

export type ProjectDef = {
  name: string;
  pitch: string;
  successMessage: string;
  failureMessage: string;
};

export const PROJECTS: readonly ProjectDef[] = [
  {
    name: 'MVP 사이드 프로젝트',
    pitch: '주말에 만든 사이드를 GitHub에 올린다',
    successMessage: '🌟 GitHub 트렌딩 1위! 인터뷰 요청 폭주.',
    failureMessage: '😅 별 5개 받았지만 아무도 안 씀.',
  },
  {
    name: '사내 도구 출시',
    pitch: '회사 생산성 도구로 동료들 작업 효율 +N%',
    successMessage: '🏆 사내 슈퍼스타. 기술 리드로 발탁.',
    failureMessage: '🔧 동료들이 쓰다가 버그로 도구 자체를 더 안 씀.',
  },
  {
    name: '오픈소스 라이브러리',
    pitch: 'npm publish — 글로벌 개발자 커뮤니티 정조준',
    successMessage: '🌐 주간 다운로드 1만+ 기록.',
    failureMessage: '🐛 issue가 폭주하고 답변 못 함.',
  },
  {
    name: '컨퍼런스 발표',
    pitch: '대규모 컨퍼런스에서 기술 발표',
    successMessage: '🎤 영상 조회수 폭증 + 헤드헌터 ×10 연락.',
    failureMessage: '😶 청중이 다음 세션으로 빠져나감.',
  },
  {
    name: '스타트업 창업',
    pitch: 'YC 인큐베이팅 도전 — 친구 한 명과 시작',
    successMessage: '💸 시드 라운드 마감. 직원 채용 시작.',
    failureMessage: '🪦 인큐베이팅 탈락. 다시 회사로 복귀.',
  },
  {
    name: '테크 IPO',
    pitch: '회사 상장 — 주식 행사권 D-day',
    successMessage: '💎 주식 ×10. 조기 은퇴 가능.',
    failureMessage: '📉 상장 직후 -40%. 락업 해제까지 기다림.',
  },
  {
    name: '튜링상 후보',
    pitch: '학계가 인정한 컴퓨터 과학자',
    successMessage: '🏅 튜링상 수상. 위키피디아 영구 등재.',
    failureMessage: '🤷 후보 명단에는 올랐다.',
  },
  {
    name: '신규 산업 창출',
    pitch: '아무도 본 적 없는 시장을 만든다',
    successMessage: '🌌 시대를 정의한 인물. 자손이 부자.',
    failureMessage: '🌧 너무 시대를 앞서갔다.',
  },
];

/**
 * 다음 프로젝트의 트리거 단계.
 * 0번째 출시: 5단계, 1번째: 10, 2번째: 15, ...
 */
export function nextProjectThreshold(completedCount: number): number {
  return FIRST_PROJECT_THRESHOLD + completedCount * PROJECT_THRESHOLD_STEP;
}

/**
 * 출시 가능 여부.
 * 3직군 best가 모두 threshold 이상이어야 함.
 */
export function canLaunchProject(
  bestByJob: Record<JobKey, number>,
  completedCount: number,
): boolean {
  const th = nextProjectThreshold(completedCount);
  return (
    bestByJob.developer >= th
    && bestByJob.planner >= th
    && bestByJob.designer >= th
  );
}

/**
 * 출시 성공률.
 * - 평균이 임계 +0 = 60%
 * - 평균이 임계 +5 = 90%
 * - 평균이 임계 +10 = 99%
 * - 단순 선형 모델
 */
export function projectSuccessRate(
  bestByJob: Record<JobKey, number>,
  completedCount: number,
): number {
  const th = nextProjectThreshold(completedCount);
  const avg =
    (bestByJob.developer + bestByJob.planner + bestByJob.designer) / 3;
  const margin = avg - th;
  const rate = 0.6 + margin * 0.06;
  return Math.max(0.1, Math.min(0.99, rate));
}

/**
 * 성공 시 골드 보너스.
 */
export function projectSuccessReward(completedCount: number): number {
  return Math.round(20_000 * Math.pow(1.6, completedCount));
}

/**
 * 실패 시 위로금.
 */
export function projectFailureReward(completedCount: number): number {
  return Math.round(3_000 * Math.pow(1.4, completedCount));
}

/**
 * 성공 시 prestige 증가량.
 */
export const PROJECT_SUCCESS_PRESTIGE = 3;

/**
 * 출시 누적 횟수에 해당하는 ProjectDef. 후반부는 마지막 것 반복 + 라벨링.
 */
export function projectDefAt(completedCount: number): ProjectDef {
  if (completedCount < PROJECTS.length) return PROJECTS[completedCount];
  return PROJECTS[PROJECTS.length - 1];
}
