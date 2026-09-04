import { EVENTS } from '../data/events.js';
import { EVENT_RULES } from '../data/event-rules.js';
import { getRegion } from '../data/regions.js';
import { getItem } from '../data/items.js';
import { drawEncounter } from './encounter-engine.js';
import { drawEvent } from './event-engine.js';
import { pickWeighted } from './weighted-random.js';

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

export function drawNextAdventureNode(
  progress,
  { rng = Math.random, minimumEliteChance = 0, player = null } = {},
) {
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

  const eventRule = region.encounterRules.event;
  const eventAllowed = eventRule.allowOnFirstEncounter
    || progress.completedEncounters > 0;
  if (eventAllowed && probabilityRoll(rng) < eventRule.chance) {
    const rarity = drawEventRarity(rng);
    const event = drawEvent(rarity, {
      events: Object.values(EVENTS).filter((entry) => eventRequirementsMet(entry, player)),
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

  const eliteChance = Math.max(
    clampProbability(minimumEliteChance),
    clampProbability(
      region.encounterRules.elite.baseChance
        + Number(progress.modifiers?.eliteChanceBonus ?? 0),
    ),
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

function eventRequirementsMet(event, player) {
  if (!event.requirements?.upgradableEquipment) return true;
  return (player?.equipment ?? []).some((itemId) => getItem(itemId).weaponUpgradeId);
}

export function bossEncounterChance(progress, region = getRegion(progress.regionId)) {
  const rule = region.encounterRules.boss;
  if (progress.regionProgress < rule.minimumCompletedEncounters) return 0;
  return clampProbability(
    progress.regionProgress * rule.chancePerCompletedEncounter,
  );
}

export function regionPowerMultiplier(
  depth,
  region = getRegion('ruins'),
) {
  return regionScalingMultipliers(depth, region).maxHp;
}

export function regionScalingMultipliers(
  depth,
  region = getRegion('ruins'),
) {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new RangeError('地區深度必須是正整數');
  }
  return {
    maxHp: statMultiplier(depth, region.scaling.maxHpPerDepth),
    baseDamage: statMultiplier(depth, region.scaling.baseDamagePerDepth),
  };
}

export function scaleEnemyUnit(unit, depth, region = getRegion('ruins')) {
  const multipliers = regionScalingMultipliers(depth, region);
  let enemy = {
    unitId: unit.id,
    name: unit.name,
    rank: unit.rank,
    tags: [...unit.tags],
    hp: Math.ceil(unit.stats.maxHp * multipliers.maxHp),
    maxHp: Math.ceil(unit.stats.maxHp * multipliers.maxHp),
    // armor 是本回合實際護甲；每次輪到怪物時都會由 baseDefense 重設。
    // 新戰鬥已位於第 1 回合，因此先建立對應的初始護甲。
    baseDefense: Math.max(0, Number(unit.stats.baseDefense ?? 0)),
    armor: Math.max(0, Number(unit.stats.baseDefense ?? 0)),
    baseDamage: Math.ceil(unit.stats.baseDamage * multipliers.baseDamage),
    baseMaxHp: unit.stats.maxHp,
    baseDamageBeforeScaling: unit.stats.baseDamage,
    regionMultipliers: multipliers,
    skillIds: [...unit.skillIds],
    damageResistances: { ...unit.damageResistances },
    statusOverrides: structuredClone(unit.statusOverrides),
    activeStatuses: [],
    lootTableId: unit.lootTableId,
  };

  return enemy;
}

function combatNode(unit, depth, bossChance, region) {
  return {
    type: 'combat',
    enemy: scaleEnemyUnit(unit, depth, region),
    bossChance,
  };
}

function drawEventRarity(rng) {
  const entries = Object.entries(EVENT_RULES.rarityWeights)
    .map(([rarity, weight]) => ({ rarity, weight }));
  return pickWeighted(entries, rng).rarity;
}

function statMultiplier(depth, growthPerDepth) {
  return 1 + ((depth - 1) * growthPerDepth);
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
