import {
  TEAM_REVENUE_TICK_MS,
  TEAM_AUTO_ENHANCE_TICK_MS,
  teamMemberSuccessRate,
  teamRevenuePerTick,
  type TeamMember,
} from '../data/team';
import { rdGlobalMultiplier } from '../data/rd';
import { type SaveData } from './SaveSystem';

/**
 * 팀 자동 매출/강화 틱 시스템.
 * 메뉴/게임 진입 시 + 주기적으로 호출.
 *
 * 마지막 틱 시각(`save.lastTeamTickAt`) 이후 경과 시간을 계산해
 * 발생해야 했던 틱 수만큼 일괄 처리 (offline 누적 지원).
 */

export type TickResult = {
  /** 누적 매출 */
  revenue: number;
  /** 자동 강화 성공한 멤버 ID 목록 */
  successes: string[];
  /** 폭사한 멤버 ID 목록 (alive=false 처리됨) */
  destroyed: string[];
  /** 경과 틱 수 */
  ticks: number;
};

/**
 * CEO best level 중 최댓값. 멤버 레벨 캡(ace - 2)에 사용.
 */
function ceoBestMax(save: SaveData): number {
  return Math.max(
    save.bestByJob.developer,
    save.bestByJob.planner,
    save.bestByJob.designer,
  );
}

/**
 * 팀 시스템을 한 번 진행 — `save`를 직접 mutate.
 * 호출 후 caller가 persistSave(save) + UI refresh.
 */
export function runTeamTick(save: SaveData, now: number = Date.now()): TickResult {
  const result: TickResult = { revenue: 0, successes: [], destroyed: [], ticks: 0 };
  if (save.team.length === 0) return result;
  if (save.lastTeamTickAt <= 0) {
    save.lastTeamTickAt = now;
    return result;
  }
  const elapsed = now - save.lastTeamTickAt;
  const tickInterval = TEAM_REVENUE_TICK_MS;
  const ticks = Math.floor(elapsed / tickInterval);
  if (ticks <= 0) return result;
  // offline 누적 캡: 최대 8시간 = 960 ticks (30초 기준)
  const cappedTicks = Math.min(ticks, 8 * 3600 * 1000 / tickInterval);
  result.ticks = cappedTicks;

  const memberLevelCap = Math.max(0, ceoBestMax(save) - 2);

  const globalMul = rdGlobalMultiplier(save.rdLevels.global);
  for (let t = 0; t < cappedTicks; t++) {
    // 매출 (현재 살아있는 팀원만, 명성/출시 + R&D global 보정)
    result.revenue += Math.round(
      teamRevenuePerTick(save.team, save.prestige, save.projectsCompleted) * globalMul,
    );
    // 자동 강화 (TEAM_AUTO_ENHANCE_TICK_MS 기준; 동일 주기라 매 틱)
    if (TEAM_AUTO_ENHANCE_TICK_MS === TEAM_REVENUE_TICK_MS) {
      tryAutoEnhanceAll(save.team, save.prestige, memberLevelCap, result);
    }
  }

  save.gold += result.revenue;
  save.lastTeamTickAt = now;
  return result;
}

/**
 * 모든 살아있는 팀원에 대해 자동 강화 한 번 시도. 결과는 in-place mutate.
 *
 * 디자인 방침: **팀원은 안정적 수입원**. 자동 강화 폭사 없음.
 * 폭사 리스크는 본인(에이스) 직접 강화에서만 발생.
 *
 * @param prestige CEO 명성치 (성공률 보정)
 * @param levelCap 멤버 도달 가능 최대 단계 (CEO ace - 2)
 */
function tryAutoEnhanceAll(
  team: TeamMember[],
  prestige: number,
  levelCap: number,
  result: TickResult,
): void {
  for (const m of team) {
    if (!m.alive) continue;
    if (m.level >= levelCap) continue; // CEO 추월 방지
    const rate = teamMemberSuccessRate(m.level, prestige);
    if (Math.random() < rate) {
      m.level += 1;
      result.successes.push(m.id);
    } else if (m.level >= 20 && Math.random() < 0.15) {
      // lv 20+ 실패 시 15% 확률로 단계 -1 (가벼운 페널티)
      m.level = Math.max(0, m.level - 1);
    }
    // 폭사 없음. 유지가 기본.
  }
}
