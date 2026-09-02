import { createCatalog, requireDefinition } from './catalog.js';

export const LOOT_TABLES = createCatalog([
  {
    id: 'ruins-common-loot',
    choices: 3,
    dropChance: 0.1,
    contentTypes: ['equipment'],
    rarityWeights: { common: 90, rare: 10, legendary: 0 },
    gold: { minimum: 10, maximum: 20 },
  },
  {
    id: 'ruins-elite-loot',
    choices: 3,
    dropChance: 0.75,
    contentTypes: ['equipment', 'skill'],
    rarityWeights: { common: 70, rare: 29, legendary: 1 },
    gold: { minimum: 15, maximum: 30 },
  },
  {
    id: 'ruins-boss-loot',
    choices: 3,
    dropChance: 1,
    contentTypes: ['equipment', 'skill'],
    rarityWeights: { common: 0, rare: 50, legendary: 50 },
    gold: { minimum: 60, maximum: 80 },
  },
  {
    id: 'ruins-ornate-chest-item',
    choices: 1,
    dropChance: 1,
    contentTypes: ['equipment', 'consumable'],
    rarityWeights: { common: 70, rare: 29, legendary: 1 },
    gold: { minimum: 0, maximum: 0 },
  },
  {
    id: 'ruins-ornate-chest-skill',
    choices: 1,
    dropChance: 1,
    contentTypes: ['skill'],
    rarityWeights: { common: 70, rare: 29, legendary: 1 },
    gold: { minimum: 0, maximum: 0 },
  },
], '掉落表');

export function getLootTable(lootTableId) {
  return requireDefinition(LOOT_TABLES, lootTableId, '掉落表');
}
