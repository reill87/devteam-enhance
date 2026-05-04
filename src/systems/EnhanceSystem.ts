import { rateAt } from '../data/rates';
import { MAX_LEVEL } from '../data/characters';
import type { ItemKey } from '../data/items';

export type EnhanceResult =
  | { kind: 'success'; from: number; to: number; protectedBy?: ItemKey }
  | { kind: 'fail-stay'; level: number; protectedBy?: ItemKey }
  | { kind: 'fail-down'; from: number; to: number }
  | { kind: 'destroy'; from: number }
  | { kind: 'maxed'; level: number };

export type ActiveBuffs = Partial<Record<ItemKey, boolean>>;

/**
 * 한 번의 강화를 시도한다. 순수 함수.
 * @param mainBonus 장비 메인 도구 단계 보너스 (0~0.10), effectiveRate에 가산
 * @param comboBonus 콤보 보너스 (0~0.05)
 */
export function tryEnhance(
  currentLevel: number,
  buffs: ActiveBuffs = {},
  rng: () => number = Math.random,
  mainBonus: number = 0,
  comboBonus: number = 0,
): EnhanceResult {
  const first = rollOnce(currentLevel, buffs, rng, mainBonus, comboBonus);
  if (!buffs.luck) return first;
  if (isFail(first)) {
    return rollOnce(currentLevel, { ...buffs, luck: false }, rng, mainBonus, comboBonus);
  }
  return first;
}

function isFail(r: EnhanceResult): boolean {
  return r.kind === 'fail-stay' || r.kind === 'fail-down' || r.kind === 'destroy';
}

function rollOnce(
  currentLevel: number,
  buffs: ActiveBuffs,
  rng: () => number,
  mainBonus: number,
  comboBonus: number,
): EnhanceResult {
  if (currentLevel >= MAX_LEVEL) {
    return { kind: 'maxed', level: currentLevel };
  }

  const rate = rateAt(currentLevel);

  if (buffs.masterhand) {
    return {
      kind: 'success',
      from: currentLevel,
      to: currentLevel + 1,
      protectedBy: 'masterhand',
    };
  }

  const eff = effectiveRate(currentLevel, buffs, mainBonus, comboBonus);
  const roll = rng();
  if (roll < eff) {
    const protectedBy: ItemKey | undefined = buffs.super_blessing
      ? 'super_blessing'
      : buffs.blessing
        ? 'blessing'
        : undefined;
    return {
      kind: 'success',
      from: currentLevel,
      to: currentLevel + 1,
      ...(protectedBy ? { protectedBy } : {}),
    };
  }

  switch (rate.fail.kind) {
    case 'stay':
      return { kind: 'fail-stay', level: currentLevel };
    case 'down': {
      if (buffs.protect) {
        return { kind: 'fail-stay', level: currentLevel, protectedBy: 'protect' };
      }
      const next = Math.max(0, currentLevel - rate.fail.amount);
      return { kind: 'fail-down', from: currentLevel, to: next };
    }
    case 'destroy':
      if (buffs.protect) {
        return { kind: 'fail-stay', level: currentLevel, protectedBy: 'protect' };
      }
      if (buffs.revive) {
        return { kind: 'fail-stay', level: currentLevel, protectedBy: 'revive' };
      }
      return { kind: 'destroy', from: currentLevel };
  }
}

export function costFor(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return rateAt(level).cost;
}

export function effectiveRate(
  level: number,
  buffs: ActiveBuffs,
  mainBonus: number = 0,
  comboBonus: number = 0,
): number {
  if (level >= MAX_LEVEL) return 0;
  if (buffs.masterhand) return 1;
  const base = rateAt(level).successRate;
  const itemBonus = buffs.super_blessing ? 0.4 : buffs.blessing ? 0.2 : 0;
  return Math.min(0.99, base + itemBonus + mainBonus + comboBonus);
}
