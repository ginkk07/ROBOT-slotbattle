import { mergeActiveStatus, resolveStatusApplication } from './status-engine.js';
import { DAMAGE_SOURCES } from '../data/damage-sources.js';
import { EffectType } from '../data/effect-types.js';
import { StatusEffectType, getStatus } from '../data/statuses.js';

/**
 * 主動技能與消耗品共用的效果處理器註冊表。
 * 技能資料只需組合既有效果；新增全新效果機制時，才在此登記一次。
 */
const EFFECT_HANDLERS = Object.freeze({
  [EffectType.HEAL]: applyHealEffect,
  [EffectType.DAMAGE]: applyDamageEffect,
  [EffectType.GAIN_RESOURCE]: applyGainResourceEffect,
  [EffectType.DAMAGE_FROM_RESOURCE]: applyDamageFromResourceEffect,
  [EffectType.GAIN_BASE_DEFENSE]: applyGainBaseDefenseEffect,
  [EffectType.APPLY_STATUS]: applyStatusEffect,
  [EffectType.REMOVE_STATUS]: applyRemoveStatusEffect,
  [EffectType.REMOVE_RESOURCE]: applyRemoveResourceEffect,
});

/**
 * 技能與道具共用的效果處理器。輸入角色會被複製，不會修改原始戰鬥狀態。
 */
export function applyEffects({
  effects,
  source,
  target,
  resources = null,
  resourceGainResolver = (_resource, amount) => amount,
  resourceMaximums = {},
  points = 1,
  damageSource = null,
  healAmountResolver = (amount) => amount,
  rng = Math.random,
}) {
  if (damageSource !== null && !DAMAGE_SOURCES.includes(damageSource)) {
    throw new RangeError(`不合法的傷害來源：${damageSource}`);
  }
  const nextSource = structuredClone(source);
  const nextTarget = structuredClone(target);
  const nextResources = resources === null ? null : structuredClone(resources);
  const events = [];

  for (const effect of effects) {
    const handler = EFFECT_HANDLERS[effect.type];
    if (!handler) throw new RangeError(`尚未支援的效果類型：${effect.type}`);
    events.push(...handler({
      effect,
      source: nextSource,
      target: nextTarget,
      resources: nextResources,
      resourceGainResolver,
      resourceMaximums,
      points,
      damageSource,
      healAmountResolver,
      rng,
    }));
  }

  const result = { source: nextSource, target: nextTarget, events };
  if (nextResources !== null) result.resources = nextResources;
  return result;
}

function applyHealEffect({ effect, source, target, points, healAmountResolver }) {
  const recipient = effectRecipient(effect, source, target);
  const baseRequested = effectAmount(effect, points);
  const requested = healAmountResolver(baseRequested);
  if (!Number.isFinite(requested) || requested < 0) {
    throw new RangeError('治療修正後的數值必須是非負數');
  }
  const amount = Math.min(recipient.maxHp - recipient.hp, requested);
  recipient.hp += amount;
  return [{
    type: 'heal',
    baseRequested,
    requested,
    amount,
    target: effect.target,
  }];
}

function applyDamageEffect({ effect, source, target, points, damageSource }) {
  if (!damageSource) {
    throw new TypeError('傷害效果必須指定 damageSource');
  }
  const recipient = effectRecipient(effect, source, target);
  const requested = effectAmount(effect, points);
  const mitigation = damageAfterMitigation(requested, recipient, effect.element);
  const amount = Math.min(recipient.hp, mitigation.amount);
  recipient.hp -= amount;
  return [{
    type: 'damage',
    element: effect.element,
    requested,
    resistance: mitigation.resistance,
    damageReduction: mitigation.damageReduction,
    damageSource,
    amount,
    target: effect.target,
  }];
}

function applyGainResourceEffect({
  effect,
  resources,
  resourceGainResolver,
  resourceMaximums,
  points,
}) {
  assertResourceContext(resources, effect.resource);
  const requested = effectAmount(effect, points);
  const resolved = resourceGainResolver(effect.resource, requested);
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError('實際資源取得量必須是非負數');
  }
  const before = Number(resources[effect.resource] ?? 0);
  const maximum = Number(resourceMaximums[effect.resource] ?? Number.POSITIVE_INFINITY);
  const after = Math.min(maximum, before + resolved);
  const amount = Math.max(0, after - before);
  resources[effect.resource] = after;
  return [{
    type: 'gain-resource',
    resource: effect.resource,
    requested,
    amount,
    target: effect.target,
  }];
}

function applyRemoveResourceEffect({ effect, resources }) {
  assertResourceContext(resources, effect.resource);
  const amount = Math.max(0, Number(resources[effect.resource] ?? 0));
  resources[effect.resource] = 0;
  return [{
    type: EffectType.REMOVE_RESOURCE,
    resource: effect.resource,
    amount,
    target: effect.target,
  }];
}

function applyDamageFromResourceEffect({
  effect,
  source,
  target,
  resources,
  damageSource,
}) {
  if (!damageSource) {
    throw new TypeError('資源轉換傷害必須指定 damageSource');
  }
  assertResourceContext(resources, effect.resource);
  const current = Number(resources[effect.resource] ?? 0);
  const minimum = Number(effect.minimumResource ?? 0);
  if (current < minimum) {
    throw new RangeError(`${effect.resource}至少需要 ${minimum} 點`);
  }
  const multiplier = Number(effect.multiplier ?? 1);
  const consumeRatio = Number(effect.consumeRatio ?? 0);
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new RangeError('資源傷害倍率必須是非負數');
  }
  if (!Number.isFinite(consumeRatio) || consumeRatio < 0 || consumeRatio > 1) {
    throw new RangeError('資源消耗比例必須介於0與1');
  }

  const recipient = effectRecipient(effect, source, target);
  const requested = Math.floor(current * multiplier);
  const mitigation = damageAfterMitigation(requested, recipient, effect.element);
  const amount = Math.min(recipient.hp, mitigation.amount);
  recipient.hp -= amount;

  // 先用施放前資源計算傷害，再保留向下取整的剩餘比例。
  const remaining = Math.floor(current * (1 - consumeRatio));
  const resourceSpent = current - remaining;
  resources[effect.resource] = remaining;

  return [{
    type: 'damage',
    element: effect.element,
    requested,
    resistance: mitigation.resistance,
    damageReduction: mitigation.damageReduction,
    damageSource,
    amount,
    target: effect.target,
    resource: effect.resource,
    resourceSpent,
    resourceRemaining: remaining,
  }];
}

/**
 * 基礎防禦力是整場戰鬥持續的屬性，不直接增加目前 armor。
 * 下一次該單位回合開始時，戰鬥引擎會以新的 baseDefense 重設 armor。
 */
function applyGainBaseDefenseEffect({ effect, source, target, points }) {
  const recipient = effectRecipient(effect, source, target);
  const amount = effectAmount(effect, points);
  const before = Math.max(0, Number(recipient.baseDefense ?? 0));
  recipient.baseDefense = before + amount;
  return [{
    type: 'gain-base-defense',
    amount,
    baseDefense: recipient.baseDefense,
    target: effect.target,
  }];
}

function applyStatusEffect({ effect, source, target, rng }) {
  const recipient = effectRecipient(effect, source, target);
  const result = resolveStatusApplication({
    statusId: effect.statusId,
    sourceUnitId: source.unitId,
    targetUnit: recipient,
    chance: effect.chance,
    duration: effect.duration,
    stacks: effect.stacks,
    potency: effect.potency,
    rng,
  });

  if (result.applied) {
    recipient.activeStatuses = mergeActiveStatus(
      recipient.activeStatuses,
      result.activeStatus,
    );
  }

  return [{
    type: 'apply-status',
    statusId: effect.statusId,
    target: effect.target,
    applied: result.applied,
    reason: result.reason,
    stacks: result.applied ? result.activeStatus.stacks : 0,
    potency: result.applied ? result.activeStatus.potency : 0,
  }];
}

function applyRemoveStatusEffect({ effect, source, target }) {
  const recipient = effectRecipient(effect, source, target);
  const before = recipient.activeStatuses?.length ?? 0;
  recipient.activeStatuses = (recipient.activeStatuses ?? [])
    .filter((status) => status.statusId !== effect.statusId);
  return [{
    type: 'remove-status',
    statusId: effect.statusId,
    target: effect.target,
    removed: before - recipient.activeStatuses.length,
  }];
}

function effectRecipient(effect, source, target) {
  return effect.target === 'self' ? source : target;
}

function effectAmount(effect, points) {
  const amount = effect.amount ?? (effect.amountPerPoint * points);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('效果數值必須是非負數');
  }
  return amount;
}

function assertResourceContext(resources, resource) {
  if (resources === null || typeof resources !== 'object') {
    throw new TypeError('此效果需要戰鬥資源資料');
  }
  if (!['action', 'armor', 'mana'].includes(resource)) {
    throw new RangeError(`不合法的資源類型：${resource}`);
  }
}

function clampResistance(value) {
  if (!Number.isFinite(value)) throw new RangeError('傷害抗性必須是數字');
  return Math.min(1, Math.max(0, value));
}

/**
 * 元素抗性與狀態減傷共用同一個入口，避免普通攻擊、技能與持續傷害
 * 分別維護不同公式。多個減傷狀態採乘算，單次傷害最後只 floor 一次。
 */
export function damageAfterMitigation(requested, target, element) {
  const resistance = clampResistance(
    target.damageResistances?.[element] ?? 0,
  );
  const damageReduction = statusDamageReduction(target);
  const multiplier = (1 - resistance) * (1 - damageReduction);
  const amount = requested <= 0 || multiplier <= 0
    ? 0
    : Math.max(1, Math.floor(requested * multiplier));
  return { amount, resistance, damageReduction };
}

function statusDamageReduction(target) {
  let multiplier = 1;
  for (const active of target.activeStatuses ?? []) {
    const definition = getStatus(active.statusId);
    if (definition.effect.type !== StatusEffectType.REDUCE_DAMAGE_TAKEN) continue;
    const reduction = clampResistance(
      Number(definition.effect.amountPerPotency ?? 0)
      * Number(active.potency ?? 1)
      * Number(active.stacks ?? 1),
    );
    multiplier *= 1 - reduction;
  }
  return 1 - multiplier;
}
