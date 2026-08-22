import { createCatalog, requireDefinition } from './catalog.js';
import { ContentRarity } from './rarities.js';

export const SKILLS = createCatalog([
  {
    id: 'life-recovery',
    name: '治癒',
    emoji: '💚',
    rarity: ContentRarity.COMMON,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
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
    rarity: ContentRarity.COMMON,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
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
    rarity: ContentRarity.RARE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
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
    id: 'flame-impact',
    name: '火焰衝擊',
    emoji: '🔥',
    rarity: ContentRarity.LEGENDARY,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
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
