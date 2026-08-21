import { createCatalog, requireDefinition } from './catalog.js';

export const SKILLS = createCatalog([
  {
    id: 'life-recovery',
    name: '生命回復',
    emoji: '💚',
    availability: 'player',
    description: '每點技能指令點恢復2點生命。',
    effects: [
      { type: 'heal', amountPerPoint: 2, target: 'self' },
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
    description: '造成火焰傷害，並嘗試附加燃燒。',
    effects: [
      { type: 'damage', element: 'fire', amount: 6, target: 'enemy' },
      {
        type: 'apply-status',
        statusId: 'burning',
        target: 'enemy',
        chance: 0.8,
        duration: 3,
        potency: 2,
      },
    ],
  },
], '技能庫');

export function getSkill(skillId) {
  return requireDefinition(SKILLS, skillId, '技能庫');
}
