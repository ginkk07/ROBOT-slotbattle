import { createCatalog, requireDefinition } from './catalog.js';

export const LOOT_TABLES = createCatalog([
  {
    id: 'ruins-common-loot',
    choices: 3,
    rarityWeights: { common: 70, rare: 25, legendary: 5 },
  },
  {
    id: 'ruins-elite-loot',
    choices: 3,
    rarityWeights: { common: 30, rare: 60, legendary: 10 },
  },
  {
    id: 'ruins-boss-loot',
    choices: 3,
    rarityWeights: { common: 0, rare: 0, legendary: 100 },
  },
], '掉落表');

export function getLootTable(lootTableId) {
  return requireDefinition(LOOT_TABLES, lootTableId, '掉落表');
}
