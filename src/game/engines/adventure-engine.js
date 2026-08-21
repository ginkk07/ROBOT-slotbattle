import { EVENTS } from '../data/events.js';
import { EventRarity } from '../data/rarities.js';
import { getRegion } from '../data/regions.js';
import { drawEncounter } from './encounter-engine.js';
import { drawEvent } from './event-engine.js';
import { pickWeighted } from './weighted-random.js';

const EVENT_RARITY_WEIGHTS = Object.freeze({
  [EventRarity.COMMON]: 50,
  [EventRarity.RARE]: 30,
  [EventRarity.LEGENDARY]: 20,
});

export function createAdventureProgress(regionId = 'ruins') {
  return {
    regionId,
    regionDepth: 1,
    regionProgress: 0,
    completedEncounters: 0,
    defeatedUnitCount: 0,
    defeatedByRank: { normal: 0, elite: 0, boss: 0 },
    modifiers: {
      eliteChanceBonus: 0,
      rewardRarity: {
        rareMultiplier: 1,
        legendaryMultiplier: 1,
      },
    },
  };
}

export function drawNextAdventureNode(progress, { rng = Math.random } = {}) {
  const region = getRegion(progress.regionId);
  const bossChance = bossEncounterChance(progress, region);

  if (bossChance > 0 && probabilityRoll(rng) < bossChance) {
    return combatNode(
      drawEncounter(region.bossEncounterTableId, { rng }),
      progress.regionDepth,
      bossChance,
      region,
    );
  }

  const eventAllowed = progress.completedEncounters > 0;
  if (eventAllowed && probabilityRoll(rng) < region.eventChance) {
    const rarity = drawEventRarity(rng);
    const event = drawEvent(rarity, {
      events: Object.values(EVENTS),
      regionTags: region.tags,
      rng,
    });
    return {
      type: 'event',
      rarity,
      eventId: event.id,
      event: structuredClone(event),
      bossChance,
    };
  }

  const eliteChance = clampProbability(
    region.baseEliteChance + Number(progress.modifiers?.eliteChanceBonus ?? 0),
  );
  const elite = probabilityRoll(rng) < eliteChance;
  const tableId = elite
    ? region.eliteEncounterTableId
    : region.normalEncounterTableId;
  return combatNode(
    drawEncounter(tableId, { rng }),
    progress.regionDepth,
    bossChance,
    region,
  );
}

export function bossEncounterChance(progress, region = getRegion(progress.regionId)) {
  if (progress.regionProgress < region.bossLockedProgress) return 0;
  return clampProbability(
    progress.regionProgress * region.bossChancePerProgress,
  );
}

export function regionPowerMultiplier(
  depth,
  region = getRegion('ruins'),
) {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new RangeError('地區深度必須是正整數');
  }
  return 1 + ((depth - 1) * region.powerPerDepth);
}

export function scaleEnemyUnit(unit, depth, region = getRegion('ruins')) {
  const multiplier = regionPowerMultiplier(depth, region);
  return {
    unitId: unit.id,
    name: unit.name,
    rank: unit.rank,
    tags: [...unit.tags],
    hp: Math.ceil(unit.stats.maxHp * multiplier),
    maxHp: Math.ceil(unit.stats.maxHp * multiplier),
    baseDamage: Math.ceil(unit.stats.attack * multiplier),
    baseMaxHp: unit.stats.maxHp,
    baseDamageBeforeScaling: unit.stats.attack,
    regionMultiplier: multiplier,
    skillIds: [...unit.skillIds],
    damageResistances: { ...unit.damageResistances },
    statusOverrides: structuredClone(unit.statusOverrides),
    activeStatuses: [],
    lootTableId: unit.lootTableId,
  };
}

function combatNode(unit, depth, bossChance, region) {
  return {
    type: 'combat',
    enemy: scaleEnemyUnit(unit, depth, region),
    bossChance,
  };
}

function drawEventRarity(rng) {
  const entries = Object.entries(EVENT_RARITY_WEIGHTS)
    .map(([rarity, weight]) => ({ rarity, weight }));
  return pickWeighted(entries, rng).rarity;
}

function probabilityRoll(rng) {
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('rng 必須回傳0（含）到1（不含）的數字');
  }
  return roll;
}

function clampProbability(value) {
  if (!Number.isFinite(value)) throw new RangeError('機率必須是數字');
  return Math.min(1, Math.max(0, value));
}
