import { mergeActiveStatus, resolveStatusApplication } from './status-engine.js';

/**
 * 技能與道具共用的效果處理器。輸入角色會被複製，不會修改原始戰鬥狀態。
 */
export function applyEffects({
  effects,
  source,
  target,
  points = 1,
  rng = Math.random,
}) {
  const nextSource = structuredClone(source);
  const nextTarget = structuredClone(target);
  const events = [];

  for (const effect of effects) {
    const recipient = effect.target === 'self' ? nextSource : nextTarget;

    if (effect.type === 'heal') {
      const requested = effectAmount(effect, points);
      const actual = Math.min(recipient.maxHp - recipient.hp, requested);
      recipient.hp += actual;
      events.push({ type: 'heal', requested, amount: actual, target: effect.target });
      continue;
    }

    if (effect.type === 'damage') {
      const requested = effectAmount(effect, points);
      const resistance = clampResistance(
        recipient.damageResistances?.[effect.element] ?? 0,
      );
      const afterResistance = resistedDamage(requested, resistance);
      const actual = Math.min(recipient.hp, afterResistance);
      recipient.hp -= actual;
      events.push({
        type: 'damage',
        element: effect.element,
        requested,
        resistance,
        amount: actual,
        target: effect.target,
      });
      continue;
    }

    if (effect.type === 'apply-status') {
      const result = resolveStatusApplication({
        statusId: effect.statusId,
        sourceUnitId: nextSource.unitId,
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

      events.push({
        type: 'apply-status',
        statusId: effect.statusId,
        target: effect.target,
        applied: result.applied,
        reason: result.reason,
        stacks: result.applied ? result.activeStatus.stacks : 0,
        potency: result.applied ? result.activeStatus.potency : 0,
      });
      continue;
    }

    if (effect.type === 'remove-status') {
      const before = recipient.activeStatuses?.length ?? 0;
      recipient.activeStatuses = (recipient.activeStatuses ?? [])
        .filter((status) => status.statusId !== effect.statusId);
      events.push({
        type: 'remove-status',
        statusId: effect.statusId,
        target: effect.target,
        removed: before - recipient.activeStatuses.length,
      });
      continue;
    }

    throw new RangeError(`尚未支援的效果類型：${effect.type}`);
  }

  return { source: nextSource, target: nextTarget, events };
}

function effectAmount(effect, points) {
  const amount = effect.amount ?? (effect.amountPerPoint * points);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('效果數值必須是非負數');
  }
  return amount;
}

function clampResistance(value) {
  if (!Number.isFinite(value)) throw new RangeError('傷害抗性必須是數字');
  return Math.min(1, Math.max(0, value));
}

function resistedDamage(requested, resistance) {
  if (requested <= 0 || resistance >= 1) return 0;
  return Math.max(1, Math.floor(requested * (1 - resistance)));
}
