import { createCatalog, requireDefinition } from './catalog.js';

export const REGIONS = createCatalog([
  {
    id: 'ruins',
    name: '遺跡',
    tags: ['ruins'],
    normalEncounterTableId: 'ruins-normal-encounter',
    eliteEncounterTableId: 'ruins-elite-encounter',
    bossEncounterTableId: 'ruins-boss-encounter',
    baseEliteChance: 0.12,
    eventChance: 0.2,
    bossLockedProgress: 4,
    bossChancePerProgress: 0.07,
    powerPerDepth: 0.2,
  },
], '地區庫');

export function getRegion(regionId) {
  return requireDefinition(REGIONS, regionId, '地區庫');
}
