import { BossRuleMode, getStatus } from '../data/statuses.js';
import { UnitRank } from '../data/units.js';

export function resolveStatusApplication({
  statusId,
  sourceUnitId,
  targetUnit,
  chance = 1,
  duration,
  potency = 1,
  rng = Math.random,
}) {
  const definition = getStatus(statusId);
  const rule = effectiveRule(definition, targetUnit);

  if (rule.mode === BossRuleMode.IMMUNE) {
    return { applied: false, reason: 'immune', statusId, chance: 0 };
  }

  const finalChance = clampProbability(chance * (rule.chanceMultiplier ?? 1));
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('rng 必須回傳0（含）到1（不含）的數字');
  }

  if (roll >= finalChance) {
    return { applied: false, reason: 'resisted', statusId, chance: finalChance };
  }

  const baseDuration = duration ?? definition.defaultDuration;
  const finalDuration = Math.max(
    1,
    Math.ceil(baseDuration * (rule.durationMultiplier ?? 1)),
  );
  const finalPotency = potency * (rule.potencyMultiplier ?? 1);

  return {
    applied: true,
    reason: 'applied',
    chance: finalChance,
    activeStatus: {
      statusId,
      sourceUnitId: sourceUnitId ?? null,
      remainingTurns: finalDuration,
      stacks: 1,
      potency: finalPotency,
    },
  };
}

export function mergeActiveStatus(activeStatuses, incoming) {
  const next = structuredClone(activeStatuses ?? []);
  const definition = getStatus(incoming.statusId);
  const index = next.findIndex((status) => status.statusId === incoming.statusId);

  if (index === -1) return [...next, structuredClone(incoming)];

  const current = next[index];
  if (definition.stacking.mode === 'stack-potency') {
    current.stacks = Math.min(
      definition.stacking.maxStacks,
      current.stacks + incoming.stacks,
    );
    current.potency = Math.max(current.potency, incoming.potency);
    current.remainingTurns = Math.max(
      current.remainingTurns,
      incoming.remainingTurns,
    );
  } else {
    current.remainingTurns = Math.max(
      current.remainingTurns,
      incoming.remainingTurns,
    );
    current.potency = incoming.potency;
  }

  return next;
}

function effectiveRule(status, targetUnit) {
  const isBoss = targetUnit?.rank === UnitRank.BOSS
    || targetUnit?.tags?.includes('boss');

  if (!isBoss) return { mode: BossRuleMode.NORMAL };

  return {
    ...status.bossRule,
    ...targetUnit.statusOverrides?.[status.id],
  };
}

function clampProbability(value) {
  if (!Number.isFinite(value)) throw new RangeError('狀態機率必須是數字');
  return Math.min(1, Math.max(0, value));
}
