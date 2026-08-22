import { ITEMS } from '../data/items.js';
import { getLootTable } from '../data/loot-tables.js';
import { ContentRarity } from '../data/rarities.js';
import { SKILLS } from '../data/skills.js';
import { pickWeighted } from './weighted-random.js';

export function rollRewardChoices(
  lootTableId,
  {
    rng = Math.random,
    regionTags = [],
    rarityModifiers = {},
  } = {},
) {
  const table = getLootTable(lootTableId);
  const choices = [];

  for (let roll = 0; roll < table.choices; roll += 1) {
    const rarity = rollContentRarity(table.rarityWeights, rarityModifiers, rng);
    const fullPool = rewardPool(rarity, regionTags);
    const unusedPool = fullPool.filter((entry) => (
      !choices.some((choice) => (
        choice.contentType === entry.contentType && choice.contentId === entry.contentId
      ))
    ));
    const selected = pickWeighted(
      unusedPool.length > 0 ? unusedPool : fullPool,
      rng,
      (entry) => entry.lootWeight,
    );
    choices.push({ ...selected, rarity });
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

function rewardPool(rarity, regionTags) {
  const skills = Object.values(SKILLS)
    .filter((skill) => eligible(skill, rarity, regionTags))
    .map((skill) => ({
      contentType: 'skill',
      contentId: skill.id,
      lootWeight: skill.lootWeight,
    }));
  const items = Object.values(ITEMS)
    .filter((item) => eligible(item, rarity, regionTags))
    .map((item) => ({
      contentType: 'item',
      contentId: item.id,
      lootWeight: item.lootWeight,
    }));
  const pool = [...skills, ...items];
  if (pool.length === 0) {
    throw new RangeError(`${rarity} 稀有度沒有可抽取的技能或道具`);
  }
  return pool;
}

function eligible(content, rarity, regionTags) {
  return content.lootEligible
    && content.rarity === rarity
    && regionTags.every((tag) => content.lootTags?.includes(tag));
}
