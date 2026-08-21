import { ACHIEVEMENTS } from './achievements.js';
import { ENCOUNTER_TABLES } from './encounters.js';
import { EVENTS } from './events.js';
import { ITEMS } from './items.js';
import { LOOT_TABLES } from './loot-tables.js';
import { MONSTER_SKILLS } from './monster-skills.js';
import { ContentRarity, EventRarity } from './rarities.js';
import { REGIONS } from './regions.js';
import { SKILLS } from './skills.js';
import { STATUSES } from './statuses.js';
import { UNITS } from './units.js';

export function validateGameData() {
  const errors = [];

  for (const unit of Object.values(UNITS)) {
    const skillCatalog = unit.rank === 'player' ? SKILLS : MONSTER_SKILLS;
    for (const skillId of unit.skillIds) {
      checkReference(skillCatalog, skillId, `單位 ${unit.id} 的 skillIds`, errors);
    }
    if (unit.lootTableId) {
      checkReference(LOOT_TABLES, unit.lootTableId, `單位 ${unit.id} 的 lootTableId`, errors);
    }
    for (const statusId of Object.keys(unit.statusOverrides)) {
      checkReference(STATUSES, statusId, `單位 ${unit.id} 的 statusOverrides`, errors);
    }

    if (unit.rank !== 'player') {
      const expectedSkillCount = { normal: 1, elite: 2, boss: 3 }[unit.rank];
      if (unit.skillIds.length !== expectedSkillCount) {
        errors.push(`單位 ${unit.id} 必須有 ${expectedSkillCount} 個怪物技能`);
      }
      if (!Number.isFinite(unit.stats.attack) || unit.stats.attack <= 0) {
        errors.push(`單位 ${unit.id} 的基礎傷害必須大於0`);
      }
    }
  }

  for (const source of [
    ...Object.values(SKILLS),
    ...Object.values(MONSTER_SKILLS),
    ...Object.values(ITEMS),
  ]) {
    const effects = [
      ...(source.effects ?? []),
      ...(source.battleStartEffects ?? []),
    ];
    for (const effect of effects) {
      if (effect.statusId) {
        checkReference(STATUSES, effect.statusId, `${source.id} 的效果`, errors);
      }
      if (effect.stacks !== undefined && (!Number.isInteger(effect.stacks) || effect.stacks < 1)) {
        errors.push(`${source.id} 的效果 stacks 必須是正整數`);
      }
    }
    for (const skillId of source.passiveSkillIds ?? []) {
      checkReference(SKILLS, skillId, `道具 ${source.id} 的 passiveSkillIds`, errors);
    }

    if (
      source.type === 'consumable'
      && (!Number.isInteger(source.actionCost) || source.actionCost < 0)
    ) {
      errors.push(`消耗品 ${source.id} 的 actionCost 必須是非負整數`);
    }

    if (source.lootEligible) {
      if (!Object.values(ContentRarity).includes(source.rarity)) {
        errors.push(`${source.id} 的 rarity 不合法`);
      }
      if (!Number.isFinite(source.lootWeight) || source.lootWeight <= 0) {
        errors.push(`${source.id} 的 lootWeight 必須大於0`);
      }
    }
  }

  for (const table of Object.values(LOOT_TABLES)) {
    if (table.choices !== 3) {
      errors.push(`掉落表 ${table.id} 必須產生3個選項`);
    }
    const weights = Object.values(ContentRarity)
      .map((rarity) => Number(table.rarityWeights?.[rarity] ?? -1));
    if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
      errors.push(`掉落表 ${table.id} 的稀有度權重不可為負數`);
    }
    if (weights.reduce((sum, weight) => sum + weight, 0) <= 0) {
      errors.push(`掉落表 ${table.id} 至少需要一個稀有度權重`);
    }
  }

  for (const event of Object.values(EVENTS)) {
    if (!Object.values(EventRarity).includes(event.rarity)) {
      errors.push(`事件 ${event.id} 的 rarity 不合法`);
    }
    for (const outcome of event.outcomes) {
      if (outcome.type !== 'continue') {
        errors.push(`事件 ${event.id} 的結果類型不合法：${outcome.type}`);
      }
    }
  }

  for (const region of Object.values(REGIONS)) {
    for (const [key, tableId] of Object.entries({
      normalEncounterTableId: region.normalEncounterTableId,
      eliteEncounterTableId: region.eliteEncounterTableId,
      bossEncounterTableId: region.bossEncounterTableId,
    })) {
      checkReference(ENCOUNTER_TABLES, tableId, `地區 ${region.id} 的 ${key}`, errors);
    }
    for (const [key, probability] of Object.entries({
      baseEliteChance: region.baseEliteChance,
      eventChance: region.eventChance,
      bossChancePerProgress: region.bossChancePerProgress,
    })) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        errors.push(`地區 ${region.id} 的 ${key} 必須介於0與1`);
      }
    }
    if (!Number.isInteger(region.bossLockedProgress) || region.bossLockedProgress < 0) {
      errors.push(`地區 ${region.id} 的 bossLockedProgress 必須是非負整數`);
    }
    if (!Number.isFinite(region.powerPerDepth) || region.powerPerDepth < 0) {
      errors.push(`地區 ${region.id} 的 powerPerDepth 必須是非負數`);
    }
  }

  for (const achievement of Object.values(ACHIEVEMENTS)) {
    for (const skillId of achievement.unlockSkillIds ?? []) {
      checkReference(SKILLS, skillId, `成就 ${achievement.id} 的 unlockSkillIds`, errors);
    }
    for (const itemId of achievement.unlockItemIds ?? []) {
      checkReference(ITEMS, itemId, `成就 ${achievement.id} 的 unlockItemIds`, errors);
    }
  }

  if (errors.length > 0) {
    throw new Error(`遊戲資料驗證失敗：\n- ${errors.join('\n- ')}`);
  }

  return true;
}

function checkReference(catalog, id, source, errors) {
  if (!catalog[id]) errors.push(`${source} 指向不存在的 id：${id}`);
}
