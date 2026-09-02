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
  let multiplier = 1;
  for (const { effect } of equipmentEffectEntries(player, ItemEffectTrigger.SPIN_DAMAGE)) {
    if (
      effect.type === ItemEffectType.MULTIPLY_DAMAGE
      && (!effect.wagerEqualsActionLimit || wager === actionLimit)
    ) {
      multiplier *= effect.multiplier;
    }
  }
  return { multiplier };
}

/** 額外傷害至少為1時，元素瓶等裝備才會加入固定值。 */
export function extraDamageAmount(player, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const bonus = equipmentEffectEntries(
    player,
    ItemEffectTrigger.EXTRA_DAMAGE,
    ItemEffectType.BONUS_DAMAGE,
  ).reduce((total, { effect }) => total + Number(effect.amount ?? 0), 0);
  return amount + bonus;
}

/** 治療倍率依裝備資料套用，最後依指定規則取整。 */
export function healingAmount(player, amount) {
  let resolved = Number(amount);
  for (const { effect } of equipmentEffectEntries(
    player,
    ItemEffectTrigger.HEALING_AMOUNT,
    ItemEffectType.MULTIPLY_HEALING,
  )) {
    resolved *= Number(effect.multiplier ?? 1);
    resolved = effect.rounding === 'round' ? Math.round(resolved) : Math.floor(resolved);
  }
  return resolved;
}

export function reduceDamageBySource(player, damageSource, damage) {
  let reduced = Number(damage);
  for (const { effect } of equipmentEffectEntries(
    player,
    ItemEffectTrigger.DAMAGE_TAKEN,
    ItemEffectType.REDUCE_DAMAGE_SOURCE,
  )) {
    if (effect.damageSource !== damageSource) continue;
    reduced = Math.max(0, reduced - Number(effect.amount ?? 0));
  }
  return reduced;
}

export function treatsSymbolAsLucky(player, symbolId) {
  return equipmentEffectEntries(
    player,
    ItemEffectTrigger.AFTER_SPIN,
    ItemEffectType.TREAT_SYMBOL_AS_LUCKY,
  ).some(({ effect }) => effect.symbolId === symbolId);
}

/** 將惡魔之血等「至少出現N張」效果套到已抽出的牌面。 */
export function ensureMinimumSymbols(
  player,
  reels,
  { rng = Math.random } = {},
) {
  const next = [...reels];
  for (const { effect } of equipmentEffectEntries(
    player,
    ItemEffectTrigger.SYMBOL_ROLL,
    ItemEffectType.MINIMUM_SYMBOL_COUNT,
  )) {
    const required = Number(effect.count ?? 0);
    let current = next.filter((symbolId) => symbolId === effect.symbolId).length;
    while (current < required) {
      const candidates = next
        .map((symbolId, index) => ({ symbolId, index }))
        .filter(({ symbolId }) => symbolId !== effect.symbolId);
      if (candidates.length === 0) break;
      const roll = rng();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
        throw new RangeError('保證牌面 rng 必須回傳0（含）到1（不含）的數字');
      }
      const selected = candidates[Math.floor(roll * candidates.length)];
      next[selected.index] = effect.symbolId;
      current += 1;
    }
  }
  return next;
}

/** 電擊裝置等每場限定效果在實際攔截狀態時才消耗次數。 */
export function consumeStatusRemovalEquipment(state, statusId) {
  state.combatModifiers.usedOnceEquipmentEffects ??= {};
  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.STATUS_APPLIED,
    ItemEffectType.REMOVE_STATUS_ONCE,
  )) {
    if (effect.statusId !== statusId) continue;
    const key = `${itemId}:${effect.type}:${statusId}`;
    const used = Number(state.combatModifiers.usedOnceEquipmentEffects[key] ?? 0);
    if (used >= Number(effect.usesPerBattle ?? 1)) continue;
    state.combatModifiers.usedOnceEquipmentEffects[key] = used + 1;
    return { type: 'remove-status', itemId, statusId, removed: 1, automatic: true };
  }
  return null;
}

/** 手裡劍每拉一次累積1層，該次就以累積值建立一筆額外傷害。 */
export function progressiveSpinExtraDamageRequests(state) {
  state.combatModifiers.progressiveSpinExtraDamage ??= {};
  const requests = [];
  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.AFTER_SPIN,
    ItemEffectType.INCREASE_EXTRA_DAMAGE_EACH_SPIN,
  )) {
    const amount = Number(state.combatModifiers.progressiveSpinExtraDamage[itemId] ?? 0)
      + Number(effect.amount ?? 0);
    state.combatModifiers.progressiveSpinExtraDamage[itemId] = amount;
    requests.push({ itemId, amount, element: effect.element ?? 'physical' });
  }
  return requests;
}

/** 血蛭等效果每回合第一次有效拉霸傷害才回傳治療量。 */
export function firstSpinDamageHealingRequests(state) {
  state.combatModifiers.usedTurnEquipmentEffects ??= {};
  const requests = [];
  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.AFTER_SPIN_DAMAGE,
    ItemEffectType.HEAL_ON_FIRST_SPIN_DAMAGE,
  )) {
    const key = `${itemId}:${effect.type}`;
    if (state.combatModifiers.usedTurnEquipmentEffects[key]) continue;
    state.combatModifiers.usedTurnEquipmentEffects[key] = true;
    requests.push({ itemId, amount: Number(effect.amount ?? 0) });
  }
  return requests;
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
      events.push({
        type: 'bonus-damage',
        itemId,
        amount: effect.amount,
        element: effect.element,
      });
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

export function applyTriggeredEquipmentEffects(
  state,
  trigger,
  { healAmountResolver = (amount) => amount } = {},
) {
  const events = [];
  for (const { itemId, effect } of equipmentEffectEntries(state.player, trigger)) {
    if (effect.enemyRanks && !effect.enemyRanks.includes(state.enemy?.rank)) continue;

    if (effect.type === ItemEffectType.APPLY_EFFECTS) {
      const result = applyEffects({
        effects: effect.effects,
        source: state.player,
        target: state.enemy,
        damageSource: DamageSource.EXTRA,
        healAmountResolver,
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
