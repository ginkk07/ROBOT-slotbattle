import { createCatalog, requireDefinition } from './catalog.js';
import { ContentRarity } from './rarities.js';

export const ITEMS = createCatalog([
  {
    id: 'healing-potion',
    name: '生命藥水',
    emoji: '🧪',
    type: 'consumable',
    rarity: ContentRarity.COMMON,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    stackable: true,
    maxStack: 99,
    actionCost: 0,
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
    rarity: ContentRarity.RARE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    stackable: true,
    maxStack: 20,
    actionCost: 0,
    description: '造成 8 點傷害，並附加 3 層[燃燒狀態]。',
    effects: [
      { type: 'damage', element: 'fire', amount: 8, target: 'enemy' },
      {
        type: 'apply-status',
        statusId: 'burning',
        target: 'enemy',
        chance: 1,
        stacks: 3,
        potency: 1,
      },
    ],
  },
  {
    id: 'flame-sword',
    name: '燃焰之劍',
    emoji: '🗡️',
    type: 'equipment',
    rarity: ContentRarity.LEGENDARY,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    slot: 'weapon',
    stackable: false,
    description: '戰鬥開始時獲得「攻擊力＋1」狀態，持續3回合。',
    battleStartEffects: [
      {
        type: 'apply-status',
        statusId: 'attack-up',
        target: 'self',
        chance: 1,
        duration: 3,
        potency: 1,
      },
    ],
  },
], '道具庫');

export function getItem(itemId) {
  return requireDefinition(ITEMS, itemId, '道具庫');
}
