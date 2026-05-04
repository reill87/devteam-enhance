import type { ItemKey } from '../data/items';
import { ITEM_KEYS } from '../data/items';
import { STARTING_GOLD } from '../data/rates';
import type { CurrencyKey } from '../data/currency';
import type { JobKey } from '../data/characters';
import type { EquipSlot } from '../data/equipment';

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
    masterhandLastUseAt: 0,
    masterhandUseCount: 0,
    masterhandIdleCounter: 0,
    equipment: emptyEquipment(),
    lastVisitedAt: Date.now(),
    prestige: 0,
    progress: emptyProgress(),
    bestByJob: emptyBestByJob(),
  };
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
      masterhandLastUseAt: typeof parsed.masterhandLastUseAt === 'number' ? parsed.masterhandLastUseAt : 0,
      masterhandUseCount: typeof parsed.masterhandUseCount === 'number' ? parsed.masterhandUseCount : 0,
      masterhandIdleCounter: typeof parsed.masterhandIdleCounter === 'number' ? parsed.masterhandIdleCounter : 0,
      equipment: eq,
      lastVisitedAt: typeof parsed.lastVisitedAt === 'number' ? parsed.lastVisitedAt : def.lastVisitedAt,
      prestige: typeof parsed.prestige === 'number' && parsed.prestige >= 0 ? parsed.prestige : 0,
      progress: parseProgress(parsed.progress),
      bestByJob: parseBestByJob(parsed.bestByJob),
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
