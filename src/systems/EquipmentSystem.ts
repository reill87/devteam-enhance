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
  // procedural: 명시 단계 이후로는 매 단계 성공률 ×0.85 / 비용 ×1.5
  const last = EQUIP_RATES[EQUIP_RATES.length - 1];
  const offset = level - (EQUIP_RATES.length - 1);
  return {
    successRate: Math.max(0.001, last.successRate * Math.pow(0.85, offset)),
    cost: Math.round(last.cost * Math.pow(1.5, offset)),
  };
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
