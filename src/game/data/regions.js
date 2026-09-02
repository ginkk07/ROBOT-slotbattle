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
        minimumCompletedEncounters: 8,
        chancePerCompletedEncounter: 0.05,
        // 地區 BOSS 被擊敗並進入勝利確認時，直接將玩家生命回復至上限。
        restorePlayerHpAfterVictory: true,
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
      maxHpPerDepth: 0.5,
      baseDamagePerDepth: 0.5,
    },
  },
], '地區庫');

export function getRegion(regionId) {
  return requireDefinition(REGIONS, regionId, '地區庫');
}
