import {
  EQUIP_MAX_LEVEL,
  EQUIP_RATES,
  type EquipSlot,
} from '../data/equipment';

export type EquipResult =
  | { kind: 'success'; from: number; to: number }
  | { kind: 'fail-stay'; level: number }
  | { kind: 'maxed'; level: number };

export function equipRateAt(level: number) {
  if (level >= EQUIP_MAX_LEVEL) return null;
  if (level < EQUIP_RATES.length) return EQUIP_RATES[level];
  // procedural: 본체 강화와 동일한 부드러운 곡선
  // 성공률은 0.5% 캡 — lv 999까지 도달 가능 (느리지만 가능)
  const offset = level - (EQUIP_RATES.length - 1);
  const successRate = Math.max(0.005, 0.10 * Math.pow(0.96, offset));
  const cost = Math.round(24000 * Math.pow(offset, 1.8));
  return { successRate, cost };
}

export function equipCostFor(level: number): number {
  const r = equipRateAt(level);
  return r?.cost ?? 0;
}

export function equipSuccessRate(level: number): number {
  const r = equipRateAt(level);
  return r?.successRate ?? 0;
}

export function tryEnhanceEquip(
  level: number,
  rng: () => number = Math.random,
): EquipResult {
  const r = equipRateAt(level);
  if (!r) return { kind: 'maxed', level };
  const roll = rng();
  if (roll < r.successRate) {
    return { kind: 'success', from: level, to: level + 1 };
  }
  return { kind: 'fail-stay', level };
}

export type _ForcedExport = EquipSlot;
