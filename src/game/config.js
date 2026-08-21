import { deepFreeze } from './data/catalog.js';
import { getUnit } from './data/units.js';

const DEFAULT_PLAYER_UNIT_ID = 'wanderer';
const DEFAULT_BOSS_UNIT_ID = 'ruins-guardian';

export const DEFAULT_CONFIG = deepFreeze(buildConfig());

export function createConfig(overrides = {}) {
  return buildConfig(overrides);
}

function buildConfig(overrides = {}) {
  const playerUnit = getUnit(overrides.playerUnitId ?? DEFAULT_PLAYER_UNIT_ID);
  const bossUnit = getUnit(overrides.bossUnitId ?? DEFAULT_BOSS_UNIT_ID);
  const bossOverrides = overrides.boss ?? {};

  return {
    actionPointsPerRound: overrides.actionPointsPerRound
      ?? playerUnit.stats.actionPoints,
    playerUnitId: playerUnit.id,
    bossUnitId: bossUnit.id,
    playerMaxHp: overrides.playerMaxHp ?? playerUnit.stats.maxHp,
    boss: {
      unitId: bossUnit.id,
      name: bossUnit.name,
      rank: bossUnit.rank,
      tags: [...bossUnit.tags],
      maxHp: bossUnit.stats.maxHp,
      skillIds: [...bossUnit.skillIds],
      damageResistances: { ...bossUnit.damageResistances },
      statusOverrides: structuredClone(bossUnit.statusOverrides),
      lootTableId: bossUnit.lootTableId,
      encounterWeight: bossUnit.encounterWeight,
      ...bossOverrides,
      attackPattern: [
        ...(bossOverrides.attackPattern ?? bossUnit.attackPattern),
      ],
    },
  };
}
