import { createCatalog, requireDefinition } from './catalog.js';

export const ITEMS = createCatalog([
  {
    id: 'healing-potion',
    name: '生命藥水',
    emoji: '🧪',
    type: 'consumable',
    stackable: true,
    maxStack: 99,
    description: '恢復10點生命。',
    effects: [
      { type: 'heal', amount: 10, target: 'self' },
    ],
  },
  {
    id: 'fire-bomb',
    name: '火焰炸彈',
    emoji: '💣',
    type: 'consumable',
    stackable: true,
    maxStack: 20,
    description: '造成8點火焰傷害，並附加燃燒。',
    effects: [
      { type: 'damage', element: 'fire', amount: 8, target: 'enemy' },
      {
        type: 'apply-status',
        statusId: 'burning',
        target: 'enemy',
        chance: 1,
        duration: 3,
        potency: 2,
      },
    ],
  },
  {
    id: 'flame-sword',
    name: '燃焰之劍',
    emoji: '🗡️',
    type: 'equipment',
    slot: 'weapon',
    stackable: false,
    description: '提高攻擊，並提供火焰武器被動效果。',
    statModifiers: { attack: 4 },
    passiveSkillIds: ['flame-impact'],
  },
], '道具庫');

export function getItem(itemId) {
  return requireDefinition(ITEMS, itemId, '道具庫');
}
