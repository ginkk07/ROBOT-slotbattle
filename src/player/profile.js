import { ITEMS } from '../game/data/items.js';
import { SKILLS } from '../game/data/skills.js';

export const PLAYER_SAVE_VERSION = 3;

export const STARTING_SKILL_IDS = Object.freeze([
  'life-recovery',
  'power-strike',
  'fire-imbue',
]);

export const STARTING_ITEM_IDS = Object.freeze([
  'healing-potion',
  'fire-bomb',
  'flame-sword',
]);

export function createDefaultProfile(playerId) {
  if (!playerId) throw new TypeError('建立玩家資料需要 playerId');

  return {
    playerId,
    saveVersion: PLAYER_SAVE_VERSION,
    unlockedStartingSkillIds: [...STARTING_SKILL_IDS],
    unlockedStartingItemIds: [...STARTING_ITEM_IDS],
    achievementIds: [],
    settledRunIds: [],
    lifetimeStats: {
      runsEnded: 0,
      unitsDefeated: 0,
    },
    startingSkillSlots: 1,
    startingItemSlots: 1,
    lastStartingLoadout: {
      skillIds: [STARTING_SKILL_IDS[0]],
      itemIds: [STARTING_ITEM_IDS[0]],
    },
  };
}

export function upgradePlayerProfile(value, playerId = value?.playerId) {
  if (!playerId) throw new TypeError('更新玩家資料需要 playerId');

  const source = value ? structuredClone(value) : {};
  const unlockedSkills = uniqueKnownIds(
    source.unlockedStartingSkillIds,
    Object.keys(SKILLS),
    STARTING_SKILL_IDS,
  );
  const unlockedItems = uniqueKnownIds(
    source.unlockedStartingItemIds,
    Object.keys(ITEMS),
    STARTING_ITEM_IDS,
  );
  const selectedSkill = firstAllowed(
    source.lastStartingLoadout?.skillIds,
    unlockedSkills,
  );
  const selectedItem = firstAllowed(
    source.lastStartingLoadout?.itemIds,
    unlockedItems,
  );

  return {
    ...source,
    playerId: String(playerId),
    saveVersion: PLAYER_SAVE_VERSION,
    unlockedStartingSkillIds: unlockedSkills,
    unlockedStartingItemIds: unlockedItems,
    achievementIds: uniqueStrings(source.achievementIds),
    settledRunIds: uniqueStrings(source.settledRunIds).slice(-50),
    lifetimeStats: {
      runsEnded: nonNegativeInteger(source.lifetimeStats?.runsEnded),
      unitsDefeated: nonNegativeInteger(source.lifetimeStats?.unitsDefeated),
    },
    startingSkillSlots: 1,
    startingItemSlots: 1,
    lastStartingLoadout: {
      skillIds: [selectedSkill ?? unlockedSkills[0]],
      itemIds: [selectedItem ?? unlockedItems[0]],
    },
  };
}

function uniqueKnownIds(current, known, defaults) {
  return [...new Set([
    ...(Array.isArray(current)
      ? current.filter((id) => known.includes(id))
      : []),
    ...defaults,
  ])];
}

function firstAllowed(selected, unlocked) {
  return (Array.isArray(selected) ? selected : [])
    .find((id) => unlocked.includes(id));
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === 'string' && value),
  )];
}

function nonNegativeInteger(value) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}
