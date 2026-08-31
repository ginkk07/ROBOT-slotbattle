import { createCatalog, requireDefinition } from './catalog.js';
import { SymbolId } from '../symbols.js';

export const StatusPolarity = Object.freeze({
  BUFF: 'buff',
  DEBUFF: 'debuff',
});

export const BossRuleMode = Object.freeze({
  NORMAL: 'normal',
  REDUCED: 'reduced',
  IMMUNE: 'immune',
});

/**
 * 狀態的共用觸發時機。技能只引用狀態 ID；實際結算依狀態資料，
 * 不在主流程辨識是哪一個技能建立了狀態。
 */
export const StatusTrigger = Object.freeze({
  PASSIVE: 'passive',
  NEXT_SPIN_ATTACK: 'next-spin-attack',
  NEXT_SPIN_RESOURCE: 'next-spin-resource',
  ON_ATTACK: 'on-attack',
  AFTER_ENEMY_ATTACK: 'after-enemy-attack',
  SYMBOL_ROLL: 'symbol-roll',
  TURN_START: 'turn-start',
  TURN_END: 'turn-end',
  ACTION_START: 'action-start',
});

export const StatusEffectType = Object.freeze({
  REDUCE_DAMAGE_TAKEN: 'reduce-damage-taken',
  MULTIPLY_SPIN_DAMAGE: 'multiply-spin-damage',
  DAMAGE_FROM_RESOURCE_GAIN: 'damage-from-resource-gain',
  BONUS_DAMAGE: 'bonus-damage',
  APPLY_STATUS: 'apply-status',
  MODIFY_SYMBOL_CHANCE: 'modify-symbol-chance',
  DAMAGE: 'damage',
  SKIP_ACTION: 'skip-action',
  MODIFY_STAT: 'modify-stat',
  HEAL: 'heal',
});

export const STATUS_TRIGGERS = Object.freeze(Object.values(StatusTrigger));
export const STATUS_EFFECT_TYPES = Object.freeze(Object.values(StatusEffectType));

export const STATUSES = createCatalog([
  {
    id: 'armor-reinforcement',
    name: '護甲強化',
    emoji: '🛡️',
    polarity: StatusPolarity.BUFF,
    category: 'damage-reduction',
    trigger: StatusTrigger.PASSIVE,
    durationMode: 'battle',
    defaultDuration: null,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: StatusEffectType.REDUCE_DAMAGE_TAKEN, amountPerPotency: 0.2 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'power-strike-ready',
    name: '強擊',
    emoji: '💥',
    description: '下一次拉霸造成攻擊傷害時，依技能等級提高傷害倍率。',
    polarity: StatusPolarity.BUFF,
    category: 'attack-trigger',
    trigger: StatusTrigger.NEXT_SPIN_ATTACK,
    durationMode: 'until-consumed',
    defaultDuration: null,
    stacking: { mode: 'until-consumed', maxStacks: 1 },
    effect: { type: StatusEffectType.MULTIPLY_SPIN_DAMAGE, amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'fire-imbue',
    name: '火焰附加',
    emoji: '🔥',
    polarity: StatusPolarity.BUFF,
    category: 'attack-trigger',
    trigger: StatusTrigger.ON_ATTACK,
    defaultDuration: 3,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: StatusEffectType.BONUS_DAMAGE, element: 'fire', amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'shield-throw-ready',
    name: '盾牌投擲',
    emoji: '🛡️',
    polarity: StatusPolarity.BUFF,
    category: 'resource-trigger',
    trigger: StatusTrigger.NEXT_SPIN_RESOURCE,
    durationMode: 'until-consumed',
    defaultDuration: null,
    stacking: { mode: 'until-consumed', maxStacks: 1 },
    effect: {
      type: StatusEffectType.DAMAGE_FROM_RESOURCE_GAIN,
      requiresSymbolId: SymbolId.DEFENSE,
      resource: 'armor',
      element: 'physical',
      resourceMultiplier: 1,
      amountPerPotency: 3,
    },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'flame-cover',
    name: '烈火罩',
    emoji: '🔥',
    polarity: StatusPolarity.BUFF,
    category: 'enemy-attack-reaction',
    trigger: StatusTrigger.AFTER_ENEMY_ATTACK,
    durationMode: 'until-consumed',
    defaultDuration: null,
    stacking: { mode: 'until-consumed', maxStacks: 1 },
    effect: {
      type: StatusEffectType.APPLY_STATUS,
      statusId: 'burning',
      stacksPerPotency: 1,
      chance: 1,
    },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'holy-shield',
    name: '聖盾術',
    emoji: '🛡️',
    polarity: StatusPolarity.BUFF,
    category: 'symbol-chance',
    trigger: StatusTrigger.SYMBOL_ROLL,
    defaultDuration: 3,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: {
      type: StatusEffectType.MODIFY_SYMBOL_CHANCE,
      chanceDeltas: {
        [SymbolId.ATTACK]: -0.25,
        [SymbolId.DEFENSE]: 0.25,
      },
    },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'burning',
    name: '燃燒',
    emoji: '🔥',
    description: '回合開始時造成等同於目前層數的傷害，造成傷害後[燃燒狀態]層數－1。',
    polarity: StatusPolarity.DEBUFF,
    category: 'damage-over-time',
    trigger: StatusTrigger.TURN_START,
    defaultDuration: 1,
    stacking: { mode: 'stack-countdown', maxStacks: 5 },
    effect: { type: StatusEffectType.DAMAGE, element: 'fire', amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'poisoned',
    name: '中毒',
    emoji: '☠️',
    polarity: StatusPolarity.DEBUFF,
    category: 'damage-over-time',
    trigger: StatusTrigger.TURN_END,
    defaultDuration: 3,
    stacking: { mode: 'stack-potency', maxStacks: 5 },
    effect: { type: StatusEffectType.DAMAGE, element: 'poison', amountPerPotency: 1 },
    bossRule: {
      mode: BossRuleMode.REDUCED,
      chanceMultiplier: 0.75,
      durationMultiplier: 1,
      potencyMultiplier: 0.5,
    },
  },
  {
    id: 'frozen',
    name: '冰凍',
    emoji: '🧊',
    polarity: StatusPolarity.DEBUFF,
    category: 'control',
    trigger: StatusTrigger.ACTION_START,
    defaultDuration: 1,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: StatusEffectType.SKIP_ACTION },
    bossRule: {
      mode: BossRuleMode.REDUCED,
      chanceMultiplier: 0.25,
      durationMultiplier: 1,
      potencyMultiplier: 1,
    },
  },
  {
    id: 'stunned',
    name: '暈眩',
    emoji: '💫',
    polarity: StatusPolarity.DEBUFF,
    category: 'control',
    trigger: StatusTrigger.ACTION_START,
    defaultDuration: 1,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: StatusEffectType.SKIP_ACTION },
    bossRule: {
      mode: BossRuleMode.REDUCED,
      chanceMultiplier: 0.25,
      durationMultiplier: 0.5,
      potencyMultiplier: 1,
    },
  },
  {
    id: 'attack-up',
    name: '攻擊力＋1',
    emoji: '💪',
    polarity: StatusPolarity.BUFF,
    category: 'stat-modifier',
    trigger: StatusTrigger.PASSIVE,
    defaultDuration: 3,
    stacking: { mode: 'stack-potency', maxStacks: 5 },
    effect: { type: StatusEffectType.MODIFY_STAT, stat: 'attack', amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    // 與「劍」的攻擊力＋1分開保存，避免兩種不同持續時間互相覆蓋。
    id: 'bounty-attack-up',
    name: '攻擊力＋3',
    emoji: '💪',
    polarity: StatusPolarity.BUFF,
    category: 'stat-modifier',
    trigger: StatusTrigger.PASSIVE,
    defaultDuration: 1,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: StatusEffectType.MODIFY_STAT, stat: 'attack', amountPerPotency: 3 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'regeneration',
    name: '再生',
    emoji: '🌿',
    polarity: StatusPolarity.BUFF,
    category: 'healing-over-time',
    trigger: StatusTrigger.TURN_END,
    defaultDuration: 3,
    stacking: { mode: 'stack-potency', maxStacks: 5 },
    effect: { type: StatusEffectType.HEAL, amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
], '狀態庫');

export function getStatus(statusId) {
  return requireDefinition(STATUSES, statusId, '狀態庫');
}
