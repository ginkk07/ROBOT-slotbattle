import { createCatalog, requireDefinition } from './catalog.js';

export const SKILLS = createCatalog([
  {
    id: 'life-recovery',
    name: '治癒',
    emoji: '💚',
    availability: 'player',
    cost: 3,
    description: '立即回復5點生命。',
    effects: [
      { type: 'heal', amount: 5, target: 'self' },
    ],
  },
  {
    id: 'power-strike',
    name: '強擊',
    emoji: '💥',
    availability: 'player',
    cost: 2,
    description: '立即對敵人造成5點物理傷害。',
    effects: [
      { type: 'damage', element: 'physical', amount: 5, target: 'enemy' },
    ],
  },
  {
    id: 'fire-imbue',
    name: '火焰附加',
    emoji: '🔥',
    availability: 'player',
    cost: 2,
    description: '每次攻擊額外造成1點傷害，持續3回合。',
    effects: [
      {
        type: 'apply-status',
        statusId: 'fire-imbue',
        target: 'self',
        chance: 1,
        duration: 3,
        potency: 1,
      },
    ],
  },
  {
    id: 'guardian-strike',
    name: '守衛重擊',
    emoji: '🔨',
    availability: 'monster',
    description: '造成物理傷害。',
    effects: [
      { type: 'damage', element: 'physical', amount: 10, target: 'enemy' },
    ],
  },
  {
    id: 'flame-impact',
    name: '火焰衝擊',
    emoji: '🔥',
    availability: 'both',
    cost: 3,
    description: '造成 3 點傷害，並有 50% 機率附加 3 層[燃燒狀態]。',
    effects: [
      { type: 'damage', element: 'fire', amount: 3, target: 'enemy' },
      {
        type: 'apply-status',
        statusId: 'burning',
        target: 'enemy',
        chance: 0.5,
        stacks: 3,
        potency: 1,
      },
    ],
  },
], '技能庫');

export function getSkill(skillId) {
  return requireDefinition(SKILLS, skillId, '技能庫');
}
