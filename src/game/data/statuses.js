import { createCatalog, requireDefinition } from './catalog.js';

export const StatusPolarity = Object.freeze({
  BUFF: 'buff',
  DEBUFF: 'debuff',
});

export const BossRuleMode = Object.freeze({
  NORMAL: 'normal',
  REDUCED: 'reduced',
  IMMUNE: 'immune',
});

export const STATUSES = createCatalog([
  {
    id: 'fire-imbue',
    name: '火焰附加',
    emoji: '🔥',
    polarity: StatusPolarity.BUFF,
    category: 'attack-trigger',
    trigger: 'on-attack',
    defaultDuration: 3,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: 'bonus-damage', element: 'fire', amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'burning',
    name: '燃燒',
    emoji: '🔥',
    description: '回合開始時造成等同於目前層數的傷害，造成傷害後[燃燒狀態]層數－1。',
    polarity: StatusPolarity.DEBUFF,
    category: 'damage-over-time',
    trigger: 'turn-start',
    defaultDuration: 1,
    stacking: { mode: 'stack-countdown', maxStacks: 5 },
    effect: { type: 'damage', element: 'fire', amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'poisoned',
    name: '中毒',
    emoji: '☠️',
    polarity: StatusPolarity.DEBUFF,
    category: 'damage-over-time',
    trigger: 'turn-end',
    defaultDuration: 3,
    stacking: { mode: 'stack-potency', maxStacks: 5 },
    effect: { type: 'damage', element: 'poison', amountPerPotency: 1 },
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
    trigger: 'action-start',
    defaultDuration: 1,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: 'skip-action' },
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
    trigger: 'action-start',
    defaultDuration: 1,
    stacking: { mode: 'refresh-duration', maxStacks: 1 },
    effect: { type: 'skip-action' },
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
    trigger: 'passive',
    defaultDuration: 3,
    stacking: { mode: 'stack-potency', maxStacks: 5 },
    effect: { type: 'modify-stat', stat: 'attack', amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
  {
    id: 'regeneration',
    name: '再生',
    emoji: '🌿',
    polarity: StatusPolarity.BUFF,
    category: 'healing-over-time',
    trigger: 'turn-end',
    defaultDuration: 3,
    stacking: { mode: 'stack-potency', maxStacks: 5 },
    effect: { type: 'heal', amountPerPotency: 1 },
    bossRule: { mode: BossRuleMode.NORMAL },
  },
], '狀態庫');

export function getStatus(statusId) {
  return requireDefinition(STATUSES, statusId, '狀態庫');
}
