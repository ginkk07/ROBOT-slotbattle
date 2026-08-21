import { deepFreeze } from './data/catalog.js';
import { getRegion } from './data/regions.js';
import { getUnit } from './data/units.js';

const DEFAULT_PLAYER_UNIT_ID = 'wanderer';
const DEFAULT_REGION_ID = 'ruins';

export const DEFAULT_CONFIG = deepFreeze(buildConfig());

export function createConfig(overrides = {}) {
  return buildConfig(overrides);
}

function buildConfig(overrides = {}) {
  const playerUnit = getUnit(overrides.playerUnitId ?? DEFAULT_PLAYER_UNIT_ID);
  const region = getRegion(overrides.regionId ?? DEFAULT_REGION_ID);

  return {
    actionPointsPerRound: overrides.actionPointsPerRound
      ?? playerUnit.stats.actionPoints,
    playerUnitId: playerUnit.id,
    playerMaxHp: overrides.playerMaxHp ?? playerUnit.stats.maxHp,
    regionId: region.id,
    initialEnemyUnitId: overrides.initialEnemyUnitId ?? null,
    initialEnemyOverrides: structuredClone(overrides.initialEnemyOverrides ?? {}),
  };
}
