import { ITEMS } from '../data/items.js';
import { getLootTable } from '../data/loot-tables.js';
import { ContentRarity } from '../data/rarities.js';
import { SKILLS } from '../data/skills.js';
import { skillRewardEligibility } from './skill-progression.js';
import { pickWeighted } from './weighted-random.js';

/**
 * 獎勵候選不足時的稀有度補位順序。
 *
 * 例如：
 * - BOSS 原本只抽傳說，傳說內容不足時依序用稀有、普通補滿。
 * - 普通獎勵不足時依序使用稀有、傳說補滿。
 *
 * 每組第一個稀有度必須是原始稀有度。
 * 調整補位規則時，只需要修改這裡，不必更動抽選引擎。
 */
const RARITY_FALLBACKS = {
  [ContentRarity.COMMON]: [
    ContentRarity.COMMON,
    ContentRarity.RARE,
    ContentRarity.LEGENDARY,
  ],
  [ContentRarity.RARE]: [
    ContentRarity.RARE,
    ContentRarity.COMMON,
    ContentRarity.LEGENDARY,
  ],
  [ContentRarity.LEGENDARY]: [
    ContentRarity.LEGENDARY,
    ContentRarity.RARE,
    ContentRarity.COMMON,
  ],
};

export function rollRewardChoices(
  lootTableId,
  {
    rng = Math.random,
    regionTags = [],
    rarityModifiers = {},
    player = { skillIds: [], skillLevels: {}, inventory: [], equipment: {} },
  } = {},
) {
  const table = getLootTable(lootTableId);
  const choices = [];

  for (let roll = 0; roll < table.choices; roll += 1) {
    const rolledRarity = rollContentRarity(
      table.rarityWeights,
      rarityModifiers,
      rng,
    );

    let selectedPool = [];
    let selectedRarity = rolledRarity;

    for (const rarity of RARITY_FALLBACKS[rolledRarity]) {
      selectedPool = rewardPool(rarity, regionTags, player)
        .filter((entry) => !choices.some((choice) => (
          choice.contentType === entry.contentType
          && choice.contentId === entry.contentId
        )));

      if (selectedPool.length > 0) {
        selectedRarity = rarity;
        break;
      }
    }

    if (selectedPool.length === 0) break;

    const selected = pickWeighted(
      selectedPool,
      rng,
      (entry) => entry.lootWeight,
    );

    choices.push({
      ...selected,
      rarity: selectedRarity,
    });
  }

  return choices;
}

// 保留名稱，讓既有資料工具不會直接中斷；新版回傳三選一候選內容。
export const rollLoot = rollRewardChoices;

function rollContentRarity(baseWeights, modifiers, rng) {
  const multipliers = {
    [ContentRarity.COMMON]: 1,
    [ContentRarity.RARE]: Number(modifiers.rareMultiplier ?? 1),
    [ContentRarity.LEGENDARY]: Number(modifiers.legendaryMultiplier ?? 1),
  };
  const entries = Object.values(ContentRarity)
    .map((rarity) => ({
      rarity,
      weight: Number(baseWeights[rarity] ?? 0) * multipliers[rarity],
    }))
    .filter((entry) => entry.weight > 0);
  return pickWeighted(entries, rng).rarity;
}

function rewardPool(rarity, regionTags, player) {
  const skills = Object.values(SKILLS)
    .filter((skill) => eligible(skill, rarity, regionTags))
    .flatMap((skill) => {
      const eligibility = skillRewardEligibility(player, skill.id);
      return eligibility ? [{
        contentType: 'skill',
        contentId: skill.id,
        lootWeight: skill.lootWeight,
        ...eligibility,
      }] : [];
    });
  const ownedItems = new Set([
    ...Object.values(player.equipment ?? {}),
    ...(player.inventory ?? [])
      .filter((entry) => entry.quantity > 0)
      .map((entry) => entry.itemId),
  ]);
  const items = Object.values(ITEMS)
    .filter((item) => (
      eligible(item, rarity, regionTags) && !ownedItems.has(item.id)
    ))
    .map((item) => ({
      contentType: 'item',
      contentId: item.id,
      lootWeight: item.lootWeight,
      acquisition: 'acquire',
    }));
  const pool = [...skills, ...items];
  return pool;
}

function eligible(content, rarity, regionTags) {
  return content.lootEligible
    && content.rarity === rarity
    && regionTags.every((tag) => content.lootTags?.includes(tag));
}
