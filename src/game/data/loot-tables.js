import { createCatalog, requireDefinition } from './catalog.js';

export const LOOT_TABLES = createCatalog([
  {
    id: 'ruins-common-loot',
    rolls: 1,
    entries: [
      { itemId: 'healing-potion', weight: 80, quantity: [1, 1] },
      { itemId: 'fire-bomb', weight: 20, quantity: [1, 1] },
    ],
  },
  {
    id: 'ruins-elite-loot',
    rolls: 1,
    entries: [
      { itemId: 'healing-potion', weight: 55, quantity: [1, 2] },
      { itemId: 'fire-bomb', weight: 40, quantity: [1, 2] },
      { itemId: 'flame-sword', weight: 5, quantity: [1, 1] },
    ],
  },
  {
    id: 'ruins-boss-loot',
    rolls: 2,
    entries: [
      { itemId: 'healing-potion', weight: 40, quantity: [1, 2] },
      { itemId: 'fire-bomb', weight: 40, quantity: [1, 2] },
      { itemId: 'flame-sword', weight: 20, quantity: [1, 1] },
    ],
  },
], '掉落表');

export function getLootTable(lootTableId) {
  return requireDefinition(LOOT_TABLES, lootTableId, '掉落表');
}
