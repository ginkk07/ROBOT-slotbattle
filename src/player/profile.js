import { ITEMS } from '../game/data/items.js';
import { PLAYER_PROGRESSION_RULES } from '../game/data/player-progression.js';
import { SKILLS } from '../game/data/skills.js';

export const PLAYER_SAVE_VERSION = 4;

export const STARTING_SKILL_IDS = (
  PLAYER_PROGRESSION_RULES.defaultUnlockedStartingSkillIds
);

export const STARTING_ITEM_IDS = (
  PLAYER_PROGRESSION_RULES.defaultUnlockedStartingItemIds
);

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
    startingSkillSlots: PLAYER_PROGRESSION_RULES.startingSkillSlots,
    startingItemSlots: PLAYER_PROGRESSION_RULES.startingItemSlots,
    lastStartingLoadout: {
      skillIds: STARTING_SKILL_IDS.slice(
        0,
        PLAYER_PROGRESSION_RULES.startingSkillSlots,
      ),
      itemIds: STARTING_ITEM_IDS.slice(
        0,
        PLAYER_PROGRESSION_RULES.startingItemSlots,
      ),
    },
  };
}

export function upgradePlayerProfile(value, playerId = value?.playerId) {
  if (!playerId) throw new TypeError('更新玩家資料需要 playerId');

  const source = value ? structuredClone(value) : {};
  if (Number(source.saveVersion ?? 0) < PLAYER_SAVE_VERSION) {
    // 舊版同名「燃焰之劍」是現在的普通「劍」，不可直接升成傳說裝備。
    source.unlockedStartingItemIds = replaceLegacyStarterSword(
      source.unlockedStartingItemIds,
    );
    if (source.lastStartingLoadout) {
      source.lastStartingLoadout.itemIds = replaceLegacyStarterSword(
        source.lastStartingLoadout.itemIds,
      );
    }
  }
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
  const selectedSkills = allowedLoadoutIds(
    source.lastStartingLoadout?.skillIds,
    unlockedSkills,
    PLAYER_PROGRESSION_RULES.startingSkillSlots,
  );
  const selectedItems = allowedLoadoutIds(
    source.lastStartingLoadout?.itemIds,
    unlockedItems,
    PLAYER_PROGRESSION_RULES.startingItemSlots,
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
    startingSkillSlots: PLAYER_PROGRESSION_RULES.startingSkillSlots,
    startingItemSlots: PLAYER_PROGRESSION_RULES.startingItemSlots,
    lastStartingLoadout: {
      skillIds: selectedSkills,
      itemIds: selectedItems,
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

function allowedLoadoutIds(selected, unlocked, slots) {
  const requested = (Array.isArray(selected) ? selected : [])
    .filter((id) => unlocked.includes(id));
  return [...new Set([...requested, ...unlocked])].slice(0, slots);
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

function replaceLegacyStarterSword(itemIds) {
  if (!Array.isArray(itemIds)) return itemIds;
  return itemIds.map((itemId) => (
    itemId === 'flame-sword' ? 'sword' : itemId
  ));
}
