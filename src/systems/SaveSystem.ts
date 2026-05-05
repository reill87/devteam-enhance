import type { ItemKey } from '../data/items';
import { ITEM_KEYS } from '../data/items';
import { STARTING_GOLD } from '../data/rates';
import type { CurrencyKey } from '../data/currency';
import type { JobKey } from '../data/characters';
import type { EquipSlot } from '../data/equipment';
import {
  PLANNER_SLOT_COUNT,
  emptyPlannerSlots,
  type PlannerSlot,
} from '../data/planner';
import { MAX_TEAM_SIZE, type TeamMember } from '../data/team';

const STORAGE_KEY = 'devteam-enhance/save/v3';

export type EquipmentLevels = Record<EquipSlot, number>;

export type SaveData = {
  version: 3;
  gold: number;
  inventory: Record<ItemKey, number>;
  /** 누적 통계 (도감/리포트용) */
  stats: {
    totalAttempts: number;
    totalSuccess: number;
    totalFail: number;
    totalDestroyed: number;
    highestLevel: number;
  };
  /** 표시 통화 (KRW/USD 토글) */
  currency: CurrencyKey;
  /** 연속 강화 성공 콤보 (실패 시 0으로) */
  combo: number;
  /** 마지막 콤보 갱신 시각 (epoch ms). 개발자 콤보 만료 판정에 사용 */
  comboLastAt: number;
  /** 장인의 손길 마지막 사용 시각 (epoch ms) */
  masterhandLastUseAt: number;
  /** 장인의 손길 인플레이션: 누적 사용 횟수, 강화 N번 안 쓰면 0으로 리셋 */
  masterhandUseCount: number;
  /** 장인 인플레이션 리셋 카운트다운 — 강화 시도가 5회 누적되면 useCount 0으로 */
  masterhandIdleCounter: number;
  /** 직군별 장비 단계 */
  equipment: Record<JobKey, EquipmentLevels>;
  /** 마지막 접속 시각 (epoch ms) — AFK 보상 계산용 */
  lastVisitedAt: number;
  /** 누적 명성치 (이력서 판매로 획득). 영구 보너스. */
  prestige: number;
  /** 직군별 현재 진행 상태 (새로고침 후 복원) */
  progress: Record<JobKey, { level: number; alive: boolean }>;
  /** 직군별 도달 최고 단계 (이직/폭사해도 유지, 팀 시너지) */
  bestByJob: Record<JobKey, number>;
  /** 기획자 병렬 스펙 슬롯 (Phase 1B). 항상 PLANNER_SLOT_COUNT 길이. */
  plannerSlots: PlannerSlot[];
  /** 누적 프로젝트 출시 성공 횟수 (Phase 4 엔드게임). */
  projectsCompleted: number;
  /** 팀 멤버 (CEO 승격 후 활성화). 최대 MAX_TEAM_SIZE. */
  team: TeamMember[];
  /** 마지막 자동 매출/강화 틱 시각 (epoch ms). */
  lastTeamTickAt: number;

  // ============ L0 — 분기 KPI (전 단계) ============
  /** 연속 강화 성공 카운트 (분기 KPI). 실패하면 0. 10 도달 시 보상 + 0으로 초기화. */
  quarterlyKpiStreak: number;
  /** 분기 KPI 누적 달성 횟수. */
  quarterlyKpiTotal: number;

  // ============ L2 — 사옥 등급 ============
  /** 0=스타트업, 1=중견, 2=대기업, 3=다이아, 4=옴니버스 */
  officeTier: number;

  // ============ L3 — 모드 ============
  /** 야근 모드 (lv 40+ 해금). 비용/보상/콤보 ↑, 실패 시 단계 -3. */
  yagunMode: boolean;
  /** 워라밸 모드 (lv 100+ 해금). 오프라인 매출 ×1.5. */
  worklifeMode: boolean;

  // ============ L4 — 자동 강화 / 가챠 ============
  /** 본인 자동 강화 (lv 250+ 해금). */
  autoEnhanceEnabled: boolean;
  /** 헤드헌터 가챠 사용 횟수 (참고용). */
  gachaCount: number;

  // ============ L5 — 분기 미션 ============
  /** 현재 활성 미션 ID (null이면 새로 뽑아야 함). */
  activeMissionId: string | null;
  /** 미션 시작 시각. */
  activeMissionStartedAt: number;
  /** 미션 진행도 누적값. */
  activeMissionProgress: number;
  /** 미션 완료 누적 횟수. */
  completedMissionsCount: number;

  // ============ L6 — 양자 코어 ============
  /** 양자 코어 활성 (lv 800+). 강화 시 50% 확률 ×2. */
  quantumCoreEnabled: boolean;
};

function emptyInventory(): Record<ItemKey, number> {
  return ITEM_KEYS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {}) as Record<ItemKey, number>;
}

function emptyEquipment(): Record<JobKey, EquipmentLevels> {
  const slot: EquipmentLevels = { main: 0, sub: 0, accessory: 0 };
  return {
    developer: { ...slot },
    planner: { ...slot },
    designer: { ...slot },
  };
}

function emptyProgress(): Record<JobKey, { level: number; alive: boolean }> {
  return {
    developer: { level: 0, alive: true },
    planner: { level: 0, alive: true },
    designer: { level: 0, alive: true },
  };
}

function emptyBestByJob(): Record<JobKey, number> {
  return { developer: 0, planner: 0, designer: 0 };
}

function parseProgress(raw: unknown): Record<JobKey, { level: number; alive: boolean }> {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const job of ['developer', 'planner', 'designer'] as JobKey[]) {
    const e = obj[job];
    if (e && typeof e === 'object') {
      const lv = (e as Record<string, unknown>).level;
      const al = (e as Record<string, unknown>).alive;
      out[job] = {
        level: typeof lv === 'number' && lv >= 0 ? Math.floor(lv) : 0,
        alive: typeof al === 'boolean' ? al : true,
      };
    }
  }
  return out;
}

function parseBestByJob(raw: unknown): Record<JobKey, number> {
  const out = emptyBestByJob();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const job of ['developer', 'planner', 'designer'] as JobKey[]) {
    const v = obj[job];
    if (typeof v === 'number' && v >= 0) out[job] = Math.floor(v);
  }
  return out;
}

export function defaultSave(): SaveData {
  return {
    version: 3,
    gold: STARTING_GOLD,
    inventory: emptyInventory(),
    stats: {
      totalAttempts: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDestroyed: 0,
      highestLevel: 0,
    },
    currency: 'KRW',
    combo: 0,
    comboLastAt: 0,
    masterhandLastUseAt: 0,
    masterhandUseCount: 0,
    masterhandIdleCounter: 0,
    equipment: emptyEquipment(),
    lastVisitedAt: 0,
    prestige: 0,
    progress: emptyProgress(),
    bestByJob: emptyBestByJob(),
    plannerSlots: emptyPlannerSlots(),
    projectsCompleted: 0,
    team: [],
    lastTeamTickAt: 0,
    // L0~L6 기본값
    quarterlyKpiStreak: 0,
    quarterlyKpiTotal: 0,
    officeTier: 0,
    yagunMode: false,
    worklifeMode: false,
    autoEnhanceEnabled: false,
    gachaCount: 0,
    activeMissionId: null,
    activeMissionStartedAt: 0,
    activeMissionProgress: 0,
    completedMissionsCount: 0,
    quantumCoreEnabled: false,
  };
}

function parseTeam(raw: unknown): TeamMember[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamMember[] = [];
  for (let i = 0; i < raw.length && out.length < MAX_TEAM_SIZE; i++) {
    const e = raw[i];
    if (!e || typeof e !== 'object') continue;
    const m = e as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id : null;
    const name = typeof m.name === 'string' ? m.name : null;
    const jobKey = m.jobKey === 'planner' || m.jobKey === 'designer' || m.jobKey === 'developer' ? m.jobKey : null;
    const level = typeof m.level === 'number' && m.level >= 0 ? Math.floor(m.level) : 0;
    const alive = typeof m.alive === 'boolean' ? m.alive : true;
    const hiredAt = typeof m.hiredAt === 'number' && m.hiredAt > 0 ? m.hiredAt : Date.now();
    if (id && name && jobKey) {
      out.push({ id, name, jobKey, level, alive, hiredAt });
    }
  }
  return out;
}

function parsePlannerSlots(raw: unknown): PlannerSlot[] {
  const out = emptyPlannerSlots();
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < PLANNER_SLOT_COUNT && i < raw.length; i++) {
    const e = raw[i];
    if (!e || typeof e !== 'object') continue;
    const slot = e as Record<string, unknown>;
    const startedAt = typeof slot.startedAt === 'number' ? slot.startedAt : 0;
    const durationMs = typeof slot.durationMs === 'number' ? slot.durationMs : 0;
    const level = typeof slot.level === 'number' ? slot.level : 0;
    out[i] = { startedAt, durationMs, level };
  }
  return out;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 3) return defaultSave();

    const inv = emptyInventory();
    if (parsed.inventory) {
      for (const k of ITEM_KEYS) {
        const v = parsed.inventory[k];
        if (typeof v === 'number' && v >= 0) inv[k] = Math.floor(v);
      }
    }

    const eq = emptyEquipment();
    if (parsed.equipment) {
      for (const job of ['developer', 'planner', 'designer'] as JobKey[]) {
        const e = parsed.equipment[job];
        if (e) {
          for (const s of ['main', 'sub', 'accessory'] as EquipSlot[]) {
            const v = e[s];
            if (typeof v === 'number' && v >= 0) eq[job][s] = Math.floor(v);
          }
        }
      }
    }

    const def = defaultSave();
    return {
      version: 3,
      gold: typeof parsed.gold === 'number' && parsed.gold >= 0 ? parsed.gold : def.gold,
      inventory: inv,
      stats: { ...def.stats, ...(parsed.stats ?? {}) },
      currency: parsed.currency === 'USD' || parsed.currency === 'KRW' ? parsed.currency : def.currency,
      combo: typeof parsed.combo === 'number' && parsed.combo >= 0 ? parsed.combo : 0,
      comboLastAt: typeof parsed.comboLastAt === 'number' && parsed.comboLastAt >= 0 ? parsed.comboLastAt : 0,
      masterhandLastUseAt: typeof parsed.masterhandLastUseAt === 'number' ? parsed.masterhandLastUseAt : 0,
      masterhandUseCount: typeof parsed.masterhandUseCount === 'number' ? parsed.masterhandUseCount : 0,
      masterhandIdleCounter: typeof parsed.masterhandIdleCounter === 'number' ? parsed.masterhandIdleCounter : 0,
      equipment: eq,
      lastVisitedAt: typeof parsed.lastVisitedAt === 'number' ? parsed.lastVisitedAt : def.lastVisitedAt,
      prestige: typeof parsed.prestige === 'number' && parsed.prestige >= 0 ? parsed.prestige : 0,
      progress: parseProgress(parsed.progress),
      bestByJob: parseBestByJob(parsed.bestByJob),
      plannerSlots: parsePlannerSlots(parsed.plannerSlots),
      projectsCompleted: typeof parsed.projectsCompleted === 'number' && parsed.projectsCompleted >= 0
        ? Math.floor(parsed.projectsCompleted) : 0,
      team: parseTeam(parsed.team),
      lastTeamTickAt: typeof parsed.lastTeamTickAt === 'number' && parsed.lastTeamTickAt >= 0
        ? parsed.lastTeamTickAt : 0,
      quarterlyKpiStreak: typeof parsed.quarterlyKpiStreak === 'number' && parsed.quarterlyKpiStreak >= 0
        ? parsed.quarterlyKpiStreak : 0,
      quarterlyKpiTotal: typeof parsed.quarterlyKpiTotal === 'number' && parsed.quarterlyKpiTotal >= 0
        ? parsed.quarterlyKpiTotal : 0,
      officeTier: typeof parsed.officeTier === 'number' && parsed.officeTier >= 0
        ? Math.min(4, Math.floor(parsed.officeTier)) : 0,
      yagunMode: parsed.yagunMode === true,
      worklifeMode: parsed.worklifeMode === true,
      autoEnhanceEnabled: parsed.autoEnhanceEnabled === true,
      gachaCount: typeof parsed.gachaCount === 'number' && parsed.gachaCount >= 0
        ? parsed.gachaCount : 0,
      activeMissionId: typeof parsed.activeMissionId === 'string' ? parsed.activeMissionId : null,
      activeMissionStartedAt: typeof parsed.activeMissionStartedAt === 'number' && parsed.activeMissionStartedAt >= 0
        ? parsed.activeMissionStartedAt : 0,
      activeMissionProgress: typeof parsed.activeMissionProgress === 'number' && parsed.activeMissionProgress >= 0
        ? parsed.activeMissionProgress : 0,
      completedMissionsCount: typeof parsed.completedMissionsCount === 'number' && parsed.completedMissionsCount >= 0
        ? parsed.completedMissionsCount : 0,
      quantumCoreEnabled: parsed.quantumCoreEnabled === true,
    };
  } catch {
    return defaultSave();
  }
}

export function persistSave(data: SaveData): void {
  try {
    data.lastVisitedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 차단 환경에서는 무시
  }
}

export function resetSave(): SaveData {
  const fresh = defaultSave();
  persistSave(fresh);
  return fresh;
}
