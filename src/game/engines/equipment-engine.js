import { getItem } from '../data/items.js';
import { DamageSource } from '../data/damage-sources.js';
import { ItemEffectTrigger, ItemEffectType } from '../data/item-effects.js';
import { applyEffects } from './effects.js';

/**
 * 將舊版以部位物件保存的裝備轉成新版 ID 陣列。
 * 新版裝備不分部位，取得後可同時持有並全部生效。
 */
export function normalizeEquipmentIds(equipment) {
  const values = Array.isArray(equipment)
    ? equipment
    : Object.values(equipment ?? {});
  return [...new Set(values.filter((itemId) => {
    if (typeof itemId !== 'string' || !itemId) return false;
    return getItem(itemId).type === 'equipment';
  }))];
}

export function equippedItemIds(player) {
  return normalizeEquipmentIds(player?.equipment);
}

export function equipItem(player, itemId) {
  const item = getItem(itemId);
  if (item.type !== 'equipment') throw new Error(`${item.name}不是裝備`);
  player.equipment = [...new Set([...equippedItemIds(player), itemId])];
}

export function equipmentEffectEntries(player, trigger, type = null) {
  return equippedItemIds(player).flatMap((itemId) => {
    const item = getItem(itemId);
    return (item.equipmentEffects ?? [])
      .filter((effect) => effect.trigger === trigger && (!type || effect.type === type))
      .map((effect) => ({ itemId, item, effect }));
  });
}

export function equipmentSymbolChances(player) {
  return Object.fromEntries(
    equipmentEffectEntries(
      player,
      ItemEffectTrigger.SYMBOL_ROLL,
      ItemEffectType.SET_SYMBOL_CHANCE,
    ).map(({ effect }) => [effect.symbolId, effect.chance]),
  );
}

export function minimumEliteEncounterChance(player) {
  return equipmentEffectEntries(
    player,
    ItemEffectTrigger.ENCOUNTER_ROLL,
    ItemEffectType.MINIMUM_ELITE_CHANCE,
  ).reduce((maximum, { effect }) => Math.max(maximum, effect.chance), 0);
}

export function equipmentActionLimitBonus(player) {
  return equipmentEffectEntries(
    player,
    ItemEffectTrigger.BATTLE_START,
    ItemEffectType.INCREASE_ACTION_LIMIT,
  ).reduce((total, { effect }) => total + effect.amount, 0);
}

export function resourceGainAmount(player, resource, amount) {
  const blocked = equipmentEffectEntries(
    player,
    ItemEffectTrigger.RESOURCE_GAIN,
    ItemEffectType.BLOCK_RESOURCE_GAIN,
  ).some(({ effect }) => effect.resource === resource);
  return blocked ? 0 : amount;
}

export function preservesTurnResource(player, resource) {
  return turnResourceRetentionRatio(player, resource) > 0;
}

export function turnResourceRetentionRatio(player, resource) {
  return equipmentEffectEntries(
    player,
    ItemEffectTrigger.TURN_RESOURCES_CLEAR,
    ItemEffectType.PRESERVE_RESOURCE,
  ).reduce((maximum, { effect }) => {
    if (effect.resource !== resource) return maximum;
    return Math.max(maximum, Number(effect.ratio ?? 1));
  }, 0);
}

export function promotesSymbolsWithLucky(player) {
  return equipmentEffectEntries(
    player,
    ItemEffectTrigger.AFTER_SPIN,
    ItemEffectType.PROMOTE_WITH_LUCKY,
  ).length > 0;
}

export function spinDamageModifiers(player, { wager, actionLimit }) {
  let bonusDamage = 0;
  let multiplier = 1;
  for (const { effect } of equipmentEffectEntries(player, ItemEffectTrigger.SPIN_DAMAGE)) {
    if (effect.type === ItemEffectType.BONUS_DAMAGE) {
      bonusDamage += effect.amount;
    }
    if (
      effect.type === ItemEffectType.MULTIPLY_DAMAGE
      && (!effect.wagerEqualsActionLimit || wager === actionLimit)
    ) {
      multiplier *= effect.multiplier;
    }
  }
  return { bonusDamage, multiplier };
}

export function reduceIncomingDamageWithEquipment(player, damage) {
  let reduced = damage;
  for (const { effect } of equipmentEffectEntries(
    player,
    ItemEffectTrigger.DAMAGE_TAKEN,
    ItemEffectType.REDUCE_SMALL_DAMAGE,
  )) {
    if (reduced > 0 && reduced < effect.below) {
      reduced = Math.min(reduced, effect.to);
    }
  }
  return reduced;
}

/**
 * 敵人攻擊結束後，將實際消耗的資源交給對應裝備產生傷害請求。
 * 荊棘只是一筆「消耗護甲轉傷害」資料，戰鬥流程不辨識道具 ID。
 */
export function afterEnemyAttackEquipmentDamageRequests(
  player,
  spentResources = {},
) {
  const requests = [];
  for (const { itemId, effect } of equipmentEffectEntries(
    player,
    ItemEffectTrigger.AFTER_ENEMY_ATTACK,
    ItemEffectType.DAMAGE_FROM_SPENT_RESOURCE,
  )) {
    const spent = Number(spentResources[effect.resource] ?? 0);
    const amount = Math.floor(spent * Number(effect.multiplier ?? 1));
    if (amount <= 0) continue;
    requests.push({
      itemId,
      resource: effect.resource,
      spent,
      amount,
      element: effect.element,
    });
  }
  return requests;
}

export function healingResourceBonus(player, healEvents) {
  const healedCount = healEvents.filter((event) => (
    event.type === 'heal' && event.amount > 0
  )).length;
  if (healedCount === 0) return { armor: 0, mana: 0, action: 0 };

  const bonus = { armor: 0, mana: 0, action: 0 };
  for (const { effect } of equipmentEffectEntries(
    player,
    ItemEffectTrigger.HEAL,
    ItemEffectType.GAIN_RESOURCE_ON_HEAL,
  )) {
    bonus[effect.resource] += effect.amount * healedCount;
  }
  return bonus;
}

/**
 * 結算「每次拉霸」型裝備。牌面條件只判斷有沒有出現，因此符文魔方
 * 與星星法杖即使同一牌面出現多張，每次拉霸仍只觸發一次。
 */
export function afterSpinEquipmentBonuses(
  player,
  { reels, wager, chanceRng = Math.random },
) {
  const resources = { armor: 0, mana: 0, action: 0 };
  let bonusDamage = 0;
  const events = [];

  for (const { itemId, effect } of equipmentEffectEntries(
    player,
    ItemEffectTrigger.AFTER_SPIN,
  )) {
    if (effect.requiresSymbolId && !reels.includes(effect.requiresSymbolId)) continue;

    if (effect.type === ItemEffectType.GAIN_RESOURCE) {
      const amount = resourceGainAmount(player, effect.resource, effect.amount);
      if (amount <= 0) continue;
      resources[effect.resource] += amount;
      events.push({
        type: 'gain-resource',
        itemId,
        resource: effect.resource,
        amount,
      });
      continue;
    }

    if (effect.type === ItemEffectType.BONUS_DAMAGE) {
      bonusDamage += effect.amount;
      events.push({ type: 'bonus-damage', itemId, amount: effect.amount });
      continue;
    }

    if (
      effect.type === ItemEffectType.REFUND_RESOURCE
      && wager === effect.wager
      && probabilityRoll(chanceRng) < effect.chance
    ) {
      const amount = resourceGainAmount(player, effect.resource, effect.amount);
      if (amount <= 0) continue;
      resources[effect.resource] += amount;
      events.push({
        type: 'gain-resource',
        itemId,
        resource: effect.resource,
        amount,
      });
    }
  }

  return { resources, bonusDamage, events };
}

export function applyTriggeredEquipmentEffects(state, trigger) {
  const events = [];
  for (const { itemId, effect } of equipmentEffectEntries(state.player, trigger)) {
    if (effect.enemyRanks && !effect.enemyRanks.includes(state.enemy?.rank)) continue;

    if (effect.type === ItemEffectType.APPLY_EFFECTS) {
      const result = applyEffects({
        effects: effect.effects,
        source: state.player,
        target: state.enemy,
        damageSource: DamageSource.EQUIPMENT,
      });
      state.player = result.source;
      state.enemy = result.target;
      events.push(...result.events.map((event) => ({ ...event, itemId })));
      continue;
    }

    if (effect.type === ItemEffectType.GAIN_RESOURCE) {
      const amount = resourceGainAmount(
        state.player,
        effect.resource,
        effect.amount,
      );
      if (amount <= 0) continue;
      state.resources[effect.resource] += amount;
      events.push({
        type: 'gain-resource',
        itemId,
        resource: effect.resource,
        amount,
      });
    }
  }
  return events;
}

function probabilityRoll(rng) {
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('機率 rng 必須回傳0（含）到1（不含）的數字');
  }
  return roll;
}
