import { deepFreeze } from './catalog.js';

/**
 * 裝備效果的觸發時間。新增道具時應優先組合既有觸發與效果類型，
 * 避免在主戰鬥引擎中依照道具 ID 寫特殊判斷。
 */
export const ItemEffectTrigger = deepFreeze({
  SYMBOL_ROLL: 'symbol-roll',
  ENCOUNTER_ROLL: 'encounter-roll',
  BATTLE_START: 'battle-start',
  BATTLE_END: 'battle-end',
  PLAYER_TURN_START: 'player-turn-start',
  SPIN_DAMAGE: 'spin-damage',
  EXTRA_DAMAGE: 'extra-damage',
  AFTER_SPIN: 'after-spin',
  AFTER_SPIN_DAMAGE: 'after-spin-damage',
  HEAL: 'heal',
  HEALING_AMOUNT: 'healing-amount',
  DAMAGE_TAKEN: 'damage-taken',
  STATUS_APPLIED: 'status-applied',
  PLAYER_TURN_END: 'player-turn-end',
  RESOURCE_GAIN: 'resource-gain',
  TURN_RESOURCES_CLEAR: 'turn-resources-clear',
});

export const ItemEffectType = deepFreeze({
  SET_SYMBOL_CHANCE: 'set-symbol-chance',
  MINIMUM_ELITE_CHANCE: 'minimum-elite-chance',
  APPLY_EFFECTS: 'apply-effects',
  GAIN_RESOURCE: 'gain-resource',
  BONUS_DAMAGE: 'bonus-damage',
  INCREASE_EXTRA_DAMAGE_EACH_SPIN: 'increase-extra-damage-each-spin',
  MULTIPLY_DAMAGE: 'multiply-damage',
  REFUND_RESOURCE: 'refund-resource',
  PROMOTE_WITH_LUCKY: 'promote-with-lucky',
  GAIN_RESOURCE_ON_HEAL: 'gain-resource-on-heal',
  REDUCE_SMALL_DAMAGE: 'reduce-small-damage',
  REDUCE_DAMAGE_SOURCE: 'reduce-damage-source',
  MULTIPLY_HEALING: 'multiply-healing',
  INCREASE_ACTION_LIMIT: 'increase-action-limit',
  DAMAGE_FROM_RESOURCE: 'damage-from-resource',
  APPLY_BURN_AND_DAMAGE: 'apply-burn-and-damage',
  INCREASE_ACTION_LIMIT_IF_NO_DAMAGE: 'increase-action-limit-if-no-damage',
  BLOCK_RESOURCE_GAIN: 'block-resource-gain',
  PRESERVE_RESOURCE: 'preserve-resource',
  ENSURE_MINIMUM_RESOURCE: 'ensure-minimum-resource',
  HEAL_ON_FIRST_SPIN_DAMAGE: 'heal-on-first-spin-damage',
  INCREASE_MAX_HP: 'increase-max-hp',
  APPLY_STATUS_PER_SYMBOL: 'apply-status-per-symbol',
  MINIMUM_SYMBOL_COUNT: 'minimum-symbol-count',
  TREAT_SYMBOL_AS_LUCKY: 'treat-symbol-as-lucky',
  REMOVE_STATUS_ONCE: 'remove-status-once',
});

export const ITEM_EFFECT_TRIGGERS = deepFreeze(Object.values(ItemEffectTrigger));
export const ITEM_EFFECT_TYPES = deepFreeze(Object.values(ItemEffectType));
