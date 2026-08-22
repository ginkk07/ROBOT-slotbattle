import { ACHIEVEMENTS } from './achievements.js';
import { ENCOUNTER_TABLES } from './encounters.js';
import { EVENT_RULES } from './event-rules.js';
import { EVENTS } from './events.js';
import { ITEMS } from './items.js';
import { LOOT_TABLES } from './loot-tables.js';
import { MONSTER_ACTION_RULES } from './monster-actions.js';
import { MONSTER_SKILLS } from './monster-skills.js';
import { PLAYER_PROGRESSION_RULES } from './player-progression.js';
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
      const expectedSkillCount = MONSTER_ACTION_RULES[unit.rank]
        ?.requiredSkillCount;
      if (expectedSkillCount === undefined) {
        errors.push(`單位 ${unit.id} 的怪物階級沒有行動規則：${unit.rank}`);
      } else if (unit.skillIds.length !== expectedSkillCount) {
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
      ...(source.levels ?? []).flatMap((level) => level.effects ?? []),
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
    if (!Number.isInteger(table.choices) || table.choices < 1) {
      errors.push(`掉落表 ${table.id} 的 choices 必須是正整數`);
    }
    validateRarityWeights(
      table.rarityWeights,
      Object.values(ContentRarity),
      `掉落表 ${table.id} 的稀有度`,
      errors,
    );
  }

  validateRarityWeights(
    EVENT_RULES.rarityWeights,
    Object.values(EventRarity),
    '奇遇稀有度',
    errors,
  );

  for (const [rank, rule] of Object.entries(MONSTER_ACTION_RULES)) {
    if (
      !Number.isFinite(rule.basicAttackChance)
      || rule.basicAttackChance < 0
      || rule.basicAttackChance > 1
    ) {
      errors.push(`怪物階級 ${rank} 的 basicAttackChance 必須介於0與1`);
    }
    if (!Number.isInteger(rule.requiredSkillCount) || rule.requiredSkillCount < 0) {
      errors.push(`怪物階級 ${rank} 的 requiredSkillCount 必須是非負整數`);
    }
  }

  for (const event of Object.values(EVENTS)) {
    if (!Object.values(EventRarity).includes(event.rarity)) {
      errors.push(`事件 ${event.id} 的 rarity 不合法`);
    }
    if (!Array.isArray(event.options) || event.options.length === 0) {
      errors.push(`事件 ${event.id} 至少需要一個選項`);
      continue;
    }
    for (const option of event.options) {
      if (!option.id || !option.label) {
        errors.push(`事件 ${event.id} 的選項需要 id 與 label`);
      }
      if (!Array.isArray(option.outcomes) || option.outcomes.length === 0) {
        errors.push(`事件 ${event.id} 的選項 ${option.id} 至少需要一個結果`);
        continue;
      }
      for (const outcome of option.outcomes) {
        if (![
          'continue',
          'full-heal',
          'forget-random-skill',
          'start-combat',
        ].includes(outcome.type)) {
          errors.push(`事件 ${event.id} 的結果類型不合法：${outcome.type}`);
        }
        if (!Number.isFinite(outcome.weight) || outcome.weight <= 0) {
          errors.push(`事件 ${event.id} 的結果權重必須大於0`);
        }
        if (outcome.type === 'start-combat' && !['normal', 'elite', 'boss'].includes(outcome.rank)) {
          errors.push(`事件 ${event.id} 的戰鬥階級不合法：${outcome.rank}`);
        }
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
      'encounterRules.elite.baseChance': region.encounterRules?.elite?.baseChance,
      'encounterRules.event.chance': region.encounterRules?.event?.chance,
      'encounterRules.boss.chancePerCompletedEncounter': (
        region.encounterRules?.boss?.chancePerCompletedEncounter
      ),
    })) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        errors.push(`地區 ${region.id} 的 ${key} 必須介於0與1`);
      }
    }
    const minimumBossProgress = region.encounterRules?.boss
      ?.minimumCompletedEncounters;
    if (!Number.isInteger(minimumBossProgress) || minimumBossProgress < 0) {
      errors.push(`地區 ${region.id} 的 Boss 最低遭遇數必須是非負整數`);
    }
    if (typeof region.encounterRules?.event?.allowOnFirstEncounter !== 'boolean') {
      errors.push(`地區 ${region.id} 的 allowOnFirstEncounter 必須是布林值`);
    }
    for (const [key, growth] of Object.entries({
      maxHpPerDepth: region.scaling?.maxHpPerDepth,
      baseDamagePerDepth: region.scaling?.baseDamagePerDepth,
    })) {
      if (!Number.isFinite(growth) || growth < 0) {
        errors.push(`地區 ${region.id} 的 scaling.${key} 必須是非負數`);
      }
    }
  }

  for (const skillId of PLAYER_PROGRESSION_RULES.defaultUnlockedStartingSkillIds) {
    checkReference(SKILLS, skillId, '預設開局技能', errors);
  }
  for (const itemId of PLAYER_PROGRESSION_RULES.defaultUnlockedStartingItemIds) {
    checkReference(ITEMS, itemId, '預設開局道具', errors);
  }
  for (const [key, slots] of Object.entries({
    startingSkillSlots: PLAYER_PROGRESSION_RULES.startingSkillSlots,
    startingItemSlots: PLAYER_PROGRESSION_RULES.startingItemSlots,
    maxHeldSkills: PLAYER_PROGRESSION_RULES.maxHeldSkills,
    maxSkillLevel: PLAYER_PROGRESSION_RULES.maxSkillLevel,
  })) {
    if (!Number.isInteger(slots) || slots < 1) {
      errors.push(`玩家開局規則 ${key} 必須是正整數`);
    }
  }
  if (
    PLAYER_PROGRESSION_RULES.startingSkillSlots
    > PLAYER_PROGRESSION_RULES.defaultUnlockedStartingSkillIds.length
  ) {
    errors.push('開局技能欄位不可多於預設解鎖技能數');
  }
  if (
    PLAYER_PROGRESSION_RULES.startingItemSlots
    > PLAYER_PROGRESSION_RULES.defaultUnlockedStartingItemIds.length
  ) {
    errors.push('開局道具欄位不可多於預設解鎖道具數');
  }
  if (PLAYER_PROGRESSION_RULES.startingSkillSlots > PLAYER_PROGRESSION_RULES.maxHeldSkills) {
    errors.push('開局技能欄位不可多於冒險技能持有上限');
  }
  for (const skill of Object.values(SKILLS)) {
    const levels = skill.levels?.length ?? 1;
    if (levels !== PLAYER_PROGRESSION_RULES.maxSkillLevel) {
      errors.push(
        `技能 ${skill.id} 必須定義 ${PLAYER_PROGRESSION_RULES.maxSkillLevel} 個等級`,
      );
    }
    for (const [index, level] of (skill.levels ?? []).entries()) {
      if (typeof level.description !== 'string' || !level.description.trim()) {
        errors.push(`技能 ${skill.id} 的 Lv.${index + 1} 缺少說明`);
      }
      if (!Array.isArray(level.effects) || level.effects.length === 0) {
        errors.push(`技能 ${skill.id} 的 Lv.${index + 1} 缺少效果`);
      }
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

function validateRarityWeights(weights, rarities, source, errors) {
  const values = rarities.map((rarity) => Number(weights?.[rarity] ?? -1));
  if (values.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    errors.push(`${source}權重不可為負數`);
  }
  if (values.reduce((sum, weight) => sum + weight, 0) <= 0) {
    errors.push(`${source}至少需要一個大於0的權重`);
  }
}
