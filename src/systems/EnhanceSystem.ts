import { rateAt, failPenaltyFor, costForJob } from '../data/rates';
import { MAX_LEVEL, type JobKey } from '../data/characters';
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
 * @param jobKey 직군별 페널티 오버레이 (Phase 1A: 개발자는 더 가혹). 미지정 시 base.
 */
export function tryEnhance(
  currentLevel: number,
  buffs: ActiveBuffs = {},
  rng: () => number = Math.random,
  mainBonus: number = 0,
  comboBonus: number = 0,
  jobKey?: JobKey,
): EnhanceResult {
  // 리팩토링: 즉시 +1, 다음 강화는 강제 실패. 다른 아이템 무시.
  if (buffs.refactor) {
    if (currentLevel >= MAX_LEVEL) return { kind: 'maxed', level: currentLevel };
    return { kind: 'success', from: currentLevel, to: currentLevel + 1 };
  }
  const first = rollOnce(currentLevel, buffs, rng, mainBonus, comboBonus, jobKey);
  if (!buffs.luck) return first;
  if (isFail(first)) {
    return rollOnce(currentLevel, { ...buffs, luck: false }, rng, mainBonus, comboBonus, jobKey);
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
  jobKey?: JobKey,
): EnhanceResult {
  if (currentLevel >= MAX_LEVEL) {
    return { kind: 'maxed', level: currentLevel };
  }

  if (buffs.masterhand) {
    return {
      kind: 'success',
      from: currentLevel,
      to: currentLevel + 1,
      protectedBy: 'masterhand',
    };
  }

  // 도박러시: 50% 확률로 +20%p, 50% 확률로 -20%p
  const gambleSign: 1 | -1 | 0 = buffs.gamble ? (rng() < 0.5 ? 1 : -1) : 0;
  const eff = effectiveRate(currentLevel, buffs, mainBonus, comboBonus, 0, gambleSign);
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

  let failKind = jobKey
    ? failPenaltyFor(currentLevel, jobKey)
    : rateAt(currentLevel).fail;

  // 마감 압박: 실패 시 단계 하락 +1 추가
  if (buffs.deadline && failKind.kind === 'down') {
    failKind = { kind: 'down', amount: failKind.amount + 1 };
  } else if (buffs.deadline && failKind.kind === 'stay') {
    failKind = { kind: 'down', amount: 1 };
  }

  switch (failKind.kind) {
    case 'stay':
      return { kind: 'fail-stay', level: currentLevel };
    case 'down': {
      if (buffs.protect) {
        return { kind: 'fail-stay', level: currentLevel, protectedBy: 'protect' };
      }
      const next = Math.max(0, currentLevel - failKind.amount);
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

export function costFor(level: number, jobKey?: JobKey): number {
  if (level >= MAX_LEVEL) return 0;
  return jobKey ? costForJob(level, jobKey) : rateAt(level).cost;
}

export function effectiveRate(
  level: number,
  buffs: ActiveBuffs,
  mainBonus: number = 0,
  comboBonus: number = 0,
  extraBonus: number = 0,
  gambleSign: 1 | -1 | 0 = 0,
): number {
  if (level >= MAX_LEVEL) return 0;
  if (buffs.masterhand || buffs.refactor) return 1;
  const base = rateAt(level).successRate;
  const itemBonus = buffs.super_blessing ? 0.4 : buffs.blessing ? 0.2 : 0;
  const deadlineBonus = buffs.deadline ? 0.3 : 0;
  const gambleBonus = buffs.gamble ? 0.2 * gambleSign : 0;
  return Math.min(
    0.99,
    Math.max(0, base + itemBonus + mainBonus + comboBonus + extraBonus + deadlineBonus + gambleBonus),
  );
}
