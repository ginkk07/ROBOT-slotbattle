import { deepFreeze } from './catalog.js';

/**
 * 裝備效果的觸發時間。新增道具時應優先組合既有觸發與效果類型，
 * 避免在主戰鬥引擎中依照道具 ID 寫特殊判斷。
 */
export const ItemEffectTrigger = deepFreeze({
  SYMBOL_ROLL: 'symbol-roll',
  ENCOUNTER_ROLL: 'encounter-roll',
  BATTLE_START: 'battle-start',
  PLAYER_TURN_START: 'player-turn-start',
  SPIN_DAMAGE: 'spin-damage',
  AFTER_SPIN: 'after-spin',
  HEAL: 'heal',
  DAMAGE_TAKEN: 'damage-taken',
  AFTER_ENEMY_ATTACK: 'after-enemy-attack',
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
  MULTIPLY_DAMAGE: 'multiply-damage',
  REFUND_RESOURCE: 'refund-resource',
  PROMOTE_WITH_LUCKY: 'promote-with-lucky',
  GAIN_RESOURCE_ON_HEAL: 'gain-resource-on-heal',
  REDUCE_SMALL_DAMAGE: 'reduce-small-damage',
  INCREASE_ACTION_LIMIT: 'increase-action-limit',
  DAMAGE_FROM_RESOURCE: 'damage-from-resource',
  APPLY_BURN_AND_DAMAGE: 'apply-burn-and-damage',
  INCREASE_ACTION_LIMIT_IF_NO_DAMAGE: 'increase-action-limit-if-no-damage',
  BLOCK_RESOURCE_GAIN: 'block-resource-gain',
  PRESERVE_RESOURCE: 'preserve-resource',
  DAMAGE_FROM_SPENT_RESOURCE: 'damage-from-spent-resource',
});

export const ITEM_EFFECT_TRIGGERS = deepFreeze(Object.values(ItemEffectTrigger));
export const ITEM_EFFECT_TYPES = deepFreeze(Object.values(ItemEffectType));
