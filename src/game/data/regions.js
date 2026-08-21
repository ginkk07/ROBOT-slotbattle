import { createCatalog, requireDefinition } from './catalog.js';

export const REGIONS = createCatalog([
  {
    id: 'ruins',
    name: '遺跡',
    tags: ['ruins'],
    normalEncounterTableId: 'ruins-normal-encounter',
    eliteEncounterTableId: 'ruins-elite-encounter',
    bossEncounterTableId: 'ruins-boss-encounter',
    encounterRules: {
      boss: {
        minimumCompletedEncounters: 4,
        chancePerCompletedEncounter: 0.07,
      },
      event: {
        chance: 0.2,
        allowOnFirstEncounter: false,
      },
      elite: {
        baseChance: 0.12,
      },
    },
    scaling: {
      maxHpPerDepth: 0.2,
      baseDamagePerDepth: 0.2,
    },
  },
], '地區庫');

export function getRegion(regionId) {
  return requireDefinition(REGIONS, regionId, '地區庫');
}
