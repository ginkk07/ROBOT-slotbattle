import {
  BossRuleMode,
  StatusEffectType,
  StatusTrigger,
  getStatus,
} from '../data/statuses.js';
import { UnitRank } from '../data/units.js';

export function resolveStatusApplication({
  statusId,
  sourceUnitId,
  targetUnit,
  chance = 1,
  duration,
  stacks = 1,
  potency = 1,
  rng = Math.random,
}) {
  const definition = getStatus(statusId);
  const rule = effectiveRule(definition, targetUnit);

  if (!Number.isInteger(stacks) || stacks < 1) {
    throw new RangeError('狀態層數必須是正整數');
  }

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

  const untilConsumed = definition.durationMode === 'until-consumed';
  const lastsForBattle = definition.durationMode === 'battle';
  const baseDuration = duration ?? definition.defaultDuration;
  const finalDuration = untilConsumed || lastsForBattle
    ? null
    : Math.max(1, Math.ceil(baseDuration * (rule.durationMultiplier ?? 1)));
  const finalPotency = potency * (rule.potencyMultiplier ?? 1);
  const remainingTurns = untilConsumed || lastsForBattle
    ? null
    : definition.stacking.mode === 'stack-countdown'
      ? stacks
      : finalDuration;

  return {
    applied: true,
    reason: 'applied',
    chance: finalChance,
    activeStatus: {
      statusId,
      sourceUnitId: sourceUnitId ?? null,
      remainingTurns,
      stacks,
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
  if (definition.durationMode === 'battle') {
    current.stacks = 1;
    current.potency = Math.max(current.potency, incoming.potency);
    current.remainingTurns = null;
  } else if (definition.stacking.mode === 'until-consumed') {
    current.stacks = 1;
    current.potency = incoming.potency;
    current.remainingTurns = null;
  } else if (definition.stacking.mode === 'stack-countdown') {
    current.stacks = Math.min(
      definition.stacking.maxStacks,
      current.stacks + incoming.stacks,
    );
    current.potency = Math.max(current.potency, incoming.potency);
    current.remainingTurns = current.stacks;
  } else if (definition.stacking.mode === 'stack-potency') {
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

/**
 * 彙總所有能影響拉霸攻擊的狀態。只看狀態的 trigger／effect 資料，
 * 因此新增使用相同機制的技能或裝備時，不必修改主戰鬥流程。
 */
export function attackStatusBonuses(unit) {
  return (unit.activeStatuses ?? []).reduce((bonuses, active) => {
    const definition = getStatus(active.statusId);
    const isAttackTrigger = definition.trigger === StatusTrigger.ON_ATTACK
      && definition.effect.type === StatusEffectType.BONUS_DAMAGE;
    const isAttackModifier = definition.effect.type === StatusEffectType.MODIFY_STAT
      && definition.effect.stat === 'attack';
    if (!isAttackTrigger && !isAttackModifier) return bonuses;

    const amount = activeStatusEffectAmount(definition, active);
    if (isAttackModifier) bonuses.attackPower += amount;
    if (isAttackTrigger) bonuses.additionalDamage += amount;
    return bonuses;
  }, { attackPower: 0, additionalDamage: 0 });
}

/**
 * 消耗所有「下一次拉霸攻擊」的傷害倍率狀態。
 * 強擊只是其中一筆狀態資料；這裡不依賴 power-strike-ready ID。
 */
export function consumeSpinDamageMultiplierStatuses(unit) {
  const next = structuredClone(unit);
  const events = [];
  let multiplier = 1;

  next.activeStatuses = (next.activeStatuses ?? []).filter((active) => {
    const definition = getStatus(active.statusId);
    const matches = definition.trigger === StatusTrigger.NEXT_SPIN_ATTACK
      && definition.effect.type === StatusEffectType.MULTIPLY_SPIN_DAMAGE;
    if (!matches) return true;

    const amount = Math.max(1, activeStatusEffectAmount(definition, active));
    multiplier *= amount;
    events.push({
      statusId: active.statusId,
      trigger: definition.trigger,
      effectType: definition.effect.type,
      amount,
    });
    return definition.durationMode !== 'until-consumed';
  });

  return { unit: next, multiplier, events };
}

/**
 * 將聖盾術等狀態的牌面機率增減套用到已解析完成的機率分布。
 * 狀態只提供各牌面的百分點差值，主流程不需要辨識狀態 ID。
 */
export function symbolChancesWithStatuses(unit, baseChances) {
  const chances = { ...baseChances };

  for (const active of unit.activeStatuses ?? []) {
    const definition = getStatus(active.statusId);
    const matches = definition.trigger === StatusTrigger.SYMBOL_ROLL
      && definition.effect.type === StatusEffectType.MODIFY_SYMBOL_CHANCE;
    if (!matches) continue;

    for (const [symbolId, delta] of Object.entries(
      definition.effect.chanceDeltas ?? {},
    )) {
      if (!Object.hasOwn(chances, symbolId)) {
        throw new RangeError(`牌面機率缺少 ${symbolId}`);
      }
      chances[symbolId] += Number(delta) * Number(active.potency ?? 1);
    }
  }

  const values = Object.values(chances);
  if (values.some((chance) => !Number.isFinite(chance) || chance < 0 || chance > 1)) {
    throw new RangeError('狀態調整後的牌面機率必須介於0與1');
  }
  const total = values.reduce((sum, chance) => sum + chance, 0);
  if (Math.abs(total - 1) > 1e-12) {
    throw new RangeError('狀態調整後的牌面機率總和必須為1');
  }
  return chances;
}

export function hasSymbolChanceModifiers(unit) {
  return (unit.activeStatuses ?? []).some((active) => {
    const definition = getStatus(active.statusId);
    return definition.trigger === StatusTrigger.SYMBOL_ROLL
      && definition.effect.type === StatusEffectType.MODIFY_SYMBOL_CHANCE;
  });
}

/**
 * 結算「下一次指定牌面，把該次取得資源轉為傷害」的狀態。
 * 盾牌投擲只是其中一份資料；符文魔方等加成已包含在 resourceGains。
 */
export function consumeResourceGainDamageStatuses(
  unit,
  { reels = [], resourceGains = {} } = {},
) {
  const next = structuredClone(unit);
  const requests = [];
  const events = [];

  next.activeStatuses = (next.activeStatuses ?? []).filter((active) => {
    const definition = getStatus(active.statusId);
    const effect = definition.effect;
    const matches = definition.trigger === StatusTrigger.NEXT_SPIN_RESOURCE
      && effect.type === StatusEffectType.DAMAGE_FROM_RESOURCE_GAIN
      && reels.includes(effect.requiresSymbolId);
    if (!matches) return true;

    const resourceAmount = Number(resourceGains[effect.resource] ?? 0);
    const potency = Number(active.potency ?? 1);
    const resourceMultiplier = Number(effect.resourceMultiplier ?? 1);
    const flatAmount = Number(effect.amount ?? 0)
      + Number(effect.amountPerPotency ?? 0) * potency;
    const amount = Math.floor(resourceAmount * resourceMultiplier + flatAmount);
    const request = {
      statusId: active.statusId,
      resource: effect.resource,
      resourceAmount,
      resourceMultiplier,
      flatAmount,
      amount,
      element: effect.element,
    };
    requests.push(request);
    events.push({
      type: 'resource-gain-damage',
      trigger: definition.trigger,
      effectType: effect.type,
      ...request,
    });
    return definition.durationMode !== 'until-consumed';
  });

  return { unit: next, requests, events };
}

/**
 * 敵人完成一次攻擊後，結算玩家身上的反應狀態並消耗一次性狀態。
 * 是否有實際扣除玩家 HP 不影響觸發，因為判定的是「受到攻擊」。
 */
export function resolveAfterEnemyAttackStatuses(
  holder,
  attacker,
  { rng = Math.random } = {},
) {
  const nextHolder = structuredClone(holder);
  let nextAttacker = structuredClone(attacker);
  const events = [];

  nextHolder.activeStatuses = (nextHolder.activeStatuses ?? []).filter((active) => {
    const definition = getStatus(active.statusId);
    const effect = definition.effect;
    const matches = definition.trigger === StatusTrigger.AFTER_ENEMY_ATTACK
      && effect.type === StatusEffectType.APPLY_STATUS;
    if (!matches) return true;

    const stacks = Math.max(
      1,
      Math.floor(
        Number(effect.stacksPerPotency ?? 1)
        * Number(active.potency ?? 1),
      ),
    );
    const result = resolveStatusApplication({
      statusId: effect.statusId,
      sourceUnitId: nextHolder.unitId,
      targetUnit: nextAttacker,
      chance: effect.chance ?? 1,
      stacks,
      potency: effect.potency ?? 1,
      rng,
    });
    if (result.applied) {
      nextAttacker.activeStatuses = mergeActiveStatus(
        nextAttacker.activeStatuses,
        result.activeStatus,
      );
    }
    events.push({
      type: 'apply-status',
      trigger: definition.trigger,
      sourceStatusId: active.statusId,
      statusId: effect.statusId,
      target: 'attacker',
      applied: result.applied,
      reason: result.reason,
      stacks: result.applied ? result.activeStatus.stacks : 0,
      potency: result.applied ? result.activeStatus.potency : 0,
    });
    return definition.durationMode !== 'until-consumed';
  });

  return { holder: nextHolder, attacker: nextAttacker, events };
}

/**
 * 所有有回合期限的狀態共用此入口；戰鬥常駐、消耗型與層數倒數狀態
 * 由各自的 durationMode／stacking 資料決定是否略過一般倒數。
 */
export function advanceStatusDurations(unit) {
  const next = structuredClone(unit);
  next.activeStatuses = (next.activeStatuses ?? [])
    .map((status) => {
      const definition = getStatus(status.statusId);
      if (definition.durationMode === 'until-consumed') return status;
      if (definition.durationMode === 'battle') return status;
      if (definition.stacking.mode === 'stack-countdown') return status;
      return { ...status, remainingTurns: Number(status.remainingTurns) - 1 };
    })
    .filter((status) => {
      const definition = getStatus(status.statusId);
      if (definition.durationMode === 'until-consumed') return true;
      if (definition.durationMode === 'battle') return true;
      if (definition.stacking.mode === 'stack-countdown') {
        return Number(status.stacks ?? 0) > 0;
      }
      return status.remainingTurns > 0;
    });
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

function activeStatusEffectAmount(definition, active) {
  return Number(definition.effect.amountPerPotency ?? 0)
    * Number(active.potency ?? 1)
    * Number(active.stacks ?? 1);
}
