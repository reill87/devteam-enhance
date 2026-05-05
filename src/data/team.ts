import type { JobKey } from './characters';

/**
 * 팀 시스템 (Phase A~D) — CEO 승격 후 활성화되는 회사 운영 메커닉.
 * 첫 프로젝트 출시 성공 시 언락, 출시 횟수에 비례해 cap 증가.
 */

export const MAX_TEAM_SIZE = 12;

export type TeamMember = {
  id: string;            // uuid (단순 랜덤 string)
  name: string;          // 자동 생성
  jobKey: JobKey;
  level: number;         // 자체 강화 단계
  alive: boolean;
  hiredAt: number;       // epoch ms
};

/**
 * 출시 횟수에 따른 팀 cap.
 * 0회 = 잠김, 1회 = 4, 2회 = 6, 3회 = 8, 4회 = 10, 5회+ = 12
 */
export function teamCapForProjects(projectsCompleted: number): number {
  if (projectsCompleted <= 0) return 0;
  return Math.min(MAX_TEAM_SIZE, 2 + projectsCompleted * 2);
}

/**
 * 신규 채용 비용. 현재 팀 크기에 지수적 증가.
 * 0명 → 1000, 1명 → 1500, 2명 → 2250, ..., 11명 → ~58k
 */
export function hireCost(currentTeamSize: number): number {
  return Math.round(1000 * Math.pow(1.5, currentTeamSize));
}

/**
 * 해고 시 환급 = 채용가의 50%.
 */
export function fireRefund(memberSizeAtHire: number): number {
  return Math.round(hireCost(memberSizeAtHire) * 0.5);
}

/**
 * 자동 매출 틱 주기 (ms). 30초마다 모든 팀원이 한 번 매출 기여.
 */
export const TEAM_REVENUE_TICK_MS = 30_000;

/**
 * 팀원 한 명의 자동 강화 시도 주기 (ms). 매출 틱과 같이 굴림.
 */
export const TEAM_AUTO_ENHANCE_TICK_MS = 30_000;

/**
 * 직군 다양성 보너스 — 보유 직군 수에 따른 매출 ×.
 *  1직군 = 1.0 / 2직군 = 1.3 / 3직군 = 2.0
 */
export function diversityMultiplier(team: TeamMember[]): number {
  const aliveJobs = new Set(team.filter((m) => m.alive).map((m) => m.jobKey));
  switch (aliveJobs.size) {
    case 0: return 0;
    case 1: return 1.0;
    case 2: return 1.3;
    case 3: return 2.0;
    default: return 2.0;
  }
}

/**
 * 팀원 한 명의 매출 기여 (틱당) — `(level+1)^1.4 × 5`.
 * 죽은 멤버는 0 기여.
 */
export function memberContribution(member: TeamMember): number {
  if (!member.alive) return 0;
  return Math.ceil(Math.pow(member.level + 1, 1.4) * 5);
}

/**
 * 팀 전체 매출 (틱당) = ∑ 멤버 기여 × 다양성 보너스.
 */
export function teamRevenuePerTick(team: TeamMember[]): number {
  if (team.length === 0) return 0;
  const sum = team.reduce((acc, m) => acc + memberContribution(m), 0);
  return Math.round(sum * diversityMultiplier(team));
}

/**
 * 팀원의 자동 강화 성공률 — 본인 단계의 일반 RATES 기반에 약간 보정.
 * Phase 1A의 직군 비대칭은 적용 안 함 (UI 단순화).
 */
export function teamMemberSuccessRate(level: number): number {
  // 본인 단계가 낮으면 거의 성공, 높을수록 어려움.
  // base curve: lv 0→1: 95%, lv 10: 50%, lv 20: 20%, lv 30: 8%
  if (level >= 30) return 0.06;
  if (level >= 20) return Math.max(0.10, 0.50 - (level - 10) * 0.04);
  if (level >= 10) return Math.max(0.30, 0.95 - (level - 5) * 0.07);
  return Math.max(0.60, 0.95 - level * 0.05);
}

// ============ 이름 풀 ============

const SURNAMES = ['김', '이', '박', '정', '최', '한', '조', '오', '장', '윤', '강', '신'] as const;

const PLANNER_NAMES = ['기획', '스펙', '로드맵', '비전', '전략', '플랜', '분석', '리서치'] as const;
const DESIGNER_NAMES = ['디자인', '시안', '컬러', '픽셀', '여백', '아이콘', '타이포', '브랜드'] as const;
const DEVELOPER_NAMES = ['개발', '코드', '리팩', '알고', '커널', '버그', '컴파일', '빌드'] as const;

const NAMES_BY_JOB: Record<JobKey, readonly string[]> = {
  planner: PLANNER_NAMES,
  designer: DESIGNER_NAMES,
  developer: DEVELOPER_NAMES,
};

export function randomMemberName(jobKey: JobKey): string {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  const pool = NAMES_BY_JOB[jobKey];
  const given = pool[Math.floor(Math.random() * pool.length)];
  return `${surname}${given}`;
}

/**
 * 자동 채용 시 부족한 직군 우선 선택.
 * 모두 있으면 랜덤. 본인 에이스 직군은 자동 채용에서 제외 (UX: 동료를 다양하게).
 */
export function pickAutoHireJob(team: TeamMember[], aceJob: JobKey): JobKey {
  const allJobs: JobKey[] = ['planner', 'designer', 'developer'];
  const jobsInTeam = new Set(team.filter((m) => m.alive).map((m) => m.jobKey));
  // 1) ace 직군 외에 빈 직군이 있으면 그것
  const missing = allJobs.filter((j) => j !== aceJob && !jobsInTeam.has(j));
  if (missing.length > 0) {
    return missing[Math.floor(Math.random() * missing.length)];
  }
  // 2) 그 외 (모두 차있음): ace 외 랜덤
  const others = allJobs.filter((j) => j !== aceJob);
  return others[Math.floor(Math.random() * others.length)];
}

/**
 * 신규 멤버 생성.
 */
export function createMember(jobKey: JobKey): TeamMember {
  return {
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: randomMemberName(jobKey),
    jobKey,
    level: 0,
    alive: true,
    hiredAt: Date.now(),
  };
}
