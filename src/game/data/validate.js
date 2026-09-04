import { ACHIEVEMENTS } from './achievements.js';
import { DAMAGE_SOURCES } from './damage-sources.js';
import { ENCOUNTER_TABLES } from './encounters.js';
import { EFFECT_TYPES } from './effect-types.js';
import { EVENT_RULES } from './event-rules.js';
import { EVENTS } from './events.js';
import { ITEMS } from './items.js';
import { ITEM_EFFECT_TRIGGERS, ITEM_EFFECT_TYPES } from './item-effects.js';
import { LOOT_TABLES } from './loot-tables.js';
import { MONSTER_ACTION_RULES } from './monster-actions.js';
import {
  MONSTER_SKILLS,
  MonsterSkillActivation,
} from './monster-skills.js';
import { PLAYER_PROGRESSION_RULES } from './player-progression.js';
import { ContentRarity, EventRarity } from './rarities.js';
import { REGIONS } from './regions.js';
import { SHOP_RULES } from './shop-rules.js';
import {
  PASSIVE_SKILL_EFFECT_TYPES,
  PASSIVE_SKILL_TRIGGERS,
  SKILL_ACTIVATIONS,
  SkillActivation,
} from './skill-effects.js';
import { SKILLS } from './skills.js';
import {
  STATUS_EFFECT_TYPES,
  STATUS_TRIGGERS,
  STATUSES,
} from './statuses.js';
import { UNITS } from './units.js';
import { isSymbol } from '../symbols.js';

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
      const expectedSkillCount = unit.requiredActiveSkillCount
        ?? MONSTER_ACTION_RULES[unit.rank]?.requiredSkillCount;
      if (expectedSkillCount === undefined) {
        errors.push(`單位 ${unit.id} 的怪物階級沒有行動規則：${unit.rank}`);
      } else if (unit.skillIds.filter((skillId) => (
        MONSTER_SKILLS[skillId]?.activation === MonsterSkillActivation.ACTIVE
      )).length !== expectedSkillCount) {
        errors.push(`單位 ${unit.id} 必須有 ${expectedSkillCount} 個怪物技能`);
      }
      if (!Number.isFinite(unit.stats.baseDamage) || unit.stats.baseDamage <= 0) {
        errors.push(`單位 ${unit.id} 的基礎傷害必須大於0`);
      }
    }
    if (!Number.isFinite(unit.stats.baseDefense) || unit.stats.baseDefense < 0) {
      errors.push(`單位 ${unit.id} 的基礎防禦力必須是非負數`);
    }
  }

  for (const skill of Object.values(MONSTER_SKILLS)) {
    if (!Object.values(MonsterSkillActivation).includes(skill.activation)) {
      errors.push(`怪物技能 ${skill.id} 的 activation 不合法：${skill.activation}`);
    }
  }

  for (const status of Object.values(STATUSES)) {
    if (!STATUS_TRIGGERS.includes(status.trigger)) {
      errors.push(`狀態 ${status.id} 的 trigger 不合法：${status.trigger}`);
    }
    if (!STATUS_EFFECT_TYPES.includes(status.effect?.type)) {
      errors.push(`狀態 ${status.id} 的 effect.type 不合法：${status.effect?.type}`);
    }
    if (status.effect?.statusId !== undefined) {
      checkReference(STATUSES, status.effect.statusId, `狀態 ${status.id} 的效果`, errors);
    }
    if (
      status.effect?.requiresSymbolId !== undefined
      && !isSymbol(status.effect.requiresSymbolId)
    ) {
      errors.push(`狀態 ${status.id} 指向不存在的觸發牌面`);
    }
    if (
      status.effect?.resource !== undefined
      && !['action', 'armor', 'mana'].includes(status.effect.resource)
    ) {
      errors.push(`狀態 ${status.id} 的資源類型不合法`);
    }
    if (status.effect?.chanceDeltas !== undefined) {
      let total = 0;
      for (const [symbolId, delta] of Object.entries(status.effect.chanceDeltas)) {
        if (!isSymbol(symbolId)) errors.push(`狀態 ${status.id} 指向不存在的牌面`);
        if (!Number.isFinite(delta)) errors.push(`狀態 ${status.id} 的牌面機率差值必須是數字`);
        total += Number(delta);
      }
      if (Math.abs(total) > 1e-12) {
        errors.push(`狀態 ${status.id} 的牌面機率差值總和必須為0`);
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
      ...(source.equipmentEffects ?? []).flatMap((effect) => effect.effects ?? []),
      ...(source.levels ?? []).flatMap((level) => level.effects ?? []),
    ];
    for (const effect of effects) {
      if (!EFFECT_TYPES.includes(effect.type)) {
        errors.push(`${source.id} 的共用效果類型不合法：${effect.type}`);
      }
      if (effect.statusId) {
        checkReference(STATUSES, effect.statusId, `${source.id} 的效果`, errors);
      }
      if (effect.stacks !== undefined && (!Number.isInteger(effect.stacks) || effect.stacks < 1)) {
        errors.push(`${source.id} 的效果 stacks 必須是正整數`);
      }
      if (
        effect.resource !== undefined
        && !['action', 'armor', 'mana'].includes(effect.resource)
      ) {
        errors.push(`${source.id} 的共用效果資源不合法：${effect.resource}`);
      }
      if (
        effect.multiplier !== undefined
        && (!Number.isFinite(effect.multiplier) || effect.multiplier < 0)
      ) {
        errors.push(`${source.id} 的共用效果 multiplier 必須是非負數`);
      }
      if (
        effect.consumeRatio !== undefined
        && (
          !Number.isFinite(effect.consumeRatio)
          || effect.consumeRatio < 0
          || effect.consumeRatio > 1
        )
      ) {
        errors.push(`${source.id} 的共用效果 consumeRatio 必須介於0與1`);
      }
      if (
        effect.minimumResource !== undefined
        && (!Number.isInteger(effect.minimumResource) || effect.minimumResource < 0)
      ) {
        errors.push(`${source.id} 的共用效果 minimumResource 必須是非負整數`);
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

    for (const effect of source.equipmentEffects ?? []) {
      if (!ITEM_EFFECT_TRIGGERS.includes(effect.trigger)) {
        errors.push(`裝備 ${source.id} 的觸發時間不合法：${effect.trigger}`);
      }
      validateItemEffect(source.id, effect, errors);
    }
    for (const effect of source.combatEffects ?? []) {
      validateItemEffect(source.id, effect, errors);
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

  for (const item of Object.values(ITEMS)) {
    if (item.weaponUpgradeId !== undefined) {
      checkReference(ITEMS, item.weaponUpgradeId, `武器 ${item.id} 的強化目標`, errors);
      if (item.rarity !== ContentRarity.COMMON) {
        errors.push(`可強化武器 ${item.id} 必須是普通稀有度`);
      }
      if (ITEMS[item.weaponUpgradeId]?.weaponBaseId !== item.id) {
        errors.push(`武器 ${item.id} 與強化目標的對應不一致`);
      }
    }
    if (item.weaponBaseId !== undefined) {
      checkReference(ITEMS, item.weaponBaseId, `強化武器 ${item.id} 的基礎武器`, errors);
      if (item.rarity !== ContentRarity.RARE) {
        errors.push(`強化武器 ${item.id} 必須是稀有稀有度`);
      }
      if (item.lootEligible !== false) {
        errors.push(`強化武器 ${item.id} 只能由重鑄奇遇取得`);
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
    if (!Number.isFinite(table.dropChance) || table.dropChance < 0 || table.dropChance > 1) {
      errors.push(`掉落表 ${table.id} 的 dropChance 必須介於0與1`);
    }
    if (
      !Array.isArray(table.contentTypes)
      || table.contentTypes.length === 0
      || table.contentTypes.some((type) => !['skill', 'equipment', 'consumable'].includes(type))
    ) {
      errors.push(`掉落表 ${table.id} 的 contentTypes 不合法`);
    }
    if (
      !Number.isInteger(table.gold?.minimum)
      || !Number.isInteger(table.gold?.maximum)
      || table.gold.minimum < 0
      || table.gold.maximum < table.gold.minimum
    ) {
      errors.push(`掉落表 ${table.id} 的金錢區間不合法`);
    }
  }

  validateRarityWeights(
    SHOP_RULES.rarityWeights,
    Object.values(ContentRarity),
    '神秘商店商品稀有度',
    errors,
  );
  if (!Number.isInteger(SHOP_RULES.itemChoices) || SHOP_RULES.itemChoices < 1) {
    errors.push('神秘商店的 itemChoices 必須是正整數');
  }
  for (const [key, value] of Object.entries(SHOP_RULES.pricing)) {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`神秘商店 pricing.${key} 必須大於0`);
    }
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
      if (
        option.goldCost !== undefined
        && (!Number.isInteger(option.goldCost) || option.goldCost < 0)
      ) {
        errors.push(`事件 ${event.id} 的選項 ${option.id} 金錢需求不合法`);
      }
      if (option.itemCost !== undefined) {
        checkReference(ITEMS, option.itemCost.itemId, `事件 ${event.id} 的選項消耗品`, errors);
        if (ITEMS[option.itemCost.itemId]?.type !== 'consumable') {
          errors.push(`事件 ${event.id} 的選項 ${option.id} 只能要求消耗品`);
        }
        if (!Number.isInteger(option.itemCost.quantity) || option.itemCost.quantity < 1) {
          errors.push(`事件 ${event.id} 的選項 ${option.id} 消耗數量不合法`);
        }
      }
      if (!Array.isArray(option.outcomes) || option.outcomes.length === 0) {
        errors.push(`事件 ${event.id} 的選項 ${option.id} 至少需要一個結果`);
        continue;
      }
      for (const outcome of option.outcomes) {
        if (![
          'continue',
          'full-heal',
          'seal-random-skill',
          'full-heal-start-combat',
          'start-combat',
          'blood-unseal',
          'reduce-max-hp-upgrade-skill',
          'begin-weapon-upgrade',
          'search-adventurer-corpse',
          'collector-challenge',
          'open-shop',
          'gain-gold',
          'grant-next-battle-status',
          'grant-random-reward',
        ].includes(outcome.type)) {
          errors.push(`事件 ${event.id} 的結果類型不合法：${outcome.type}`);
        }
        if (!Number.isFinite(outcome.weight) || outcome.weight <= 0) {
          errors.push(`事件 ${event.id} 的結果權重必須大於0`);
        }
        if (
          ['start-combat', 'full-heal-start-combat'].includes(outcome.type)
          && !['normal', 'elite', 'boss'].includes(outcome.rank)
        ) {
          errors.push(`事件 ${event.id} 的戰鬥階級不合法：${outcome.rank}`);
        }
        if (outcome.unitId !== undefined) {
          checkReference(UNITS, outcome.unitId, `事件 ${event.id} 的戰鬥單位`, errors);
          if (UNITS[outcome.unitId]?.rank !== outcome.rank) {
            errors.push(`事件 ${event.id} 的戰鬥單位階級與結果階級不一致`);
          }
        }
        if (outcome.type === 'gain-gold' && (
          !Number.isInteger(outcome.gold?.minimum)
          || !Number.isInteger(outcome.gold?.maximum)
          || outcome.gold.minimum < 0
          || outcome.gold.maximum < outcome.gold.minimum
        )) {
          errors.push(`事件 ${event.id} 的金錢獎勵區間不合法`);
        }
        if (outcome.type === 'grant-next-battle-status') {
          checkReference(STATUSES, outcome.statusId, `事件 ${event.id} 的下場戰鬥狀態`, errors);
          if (!Number.isInteger(outcome.duration) || outcome.duration < 1) {
            errors.push(`事件 ${event.id} 的下場戰鬥狀態回合數不合法`);
          }
        }
        if (outcome.type === 'grant-random-reward') {
          checkReference(LOOT_TABLES, outcome.lootTableId, `事件 ${event.id} 的獎勵掉落表`, errors);
        }
        if (
          outcome.type === 'begin-weapon-upgrade'
          && (!Number.isFinite(outcome.successChance)
            || outcome.successChance < 0
            || outcome.successChance > 1)
        ) {
          errors.push(`事件 ${event.id} 的武器強化成功率不合法`);
        }
        if (outcome.type === 'search-adventurer-corpse') {
          const weights = outcome.lootWeights ?? {};
          if (['consumable', 'weapon', 'gold'].some((type) => (
            !Number.isFinite(weights[type]) || weights[type] <= 0
          ))) {
            errors.push(`事件 ${event.id} 的屍體戰利品權重不合法`);
          }
          if (
            !Number.isInteger(outcome.gold?.minimum)
            || !Number.isInteger(outcome.gold?.maximum)
            || outcome.gold.minimum < 0
            || outcome.gold.maximum < outcome.gold.minimum
          ) {
            errors.push(`事件 ${event.id} 的屍體金錢區間不合法`);
          }
          if (
            !Array.isArray(outcome.eliteChances)
            || outcome.eliteChances.length !== 3
            || outcome.eliteChances.some((chance) => (
              !Number.isFinite(chance) || chance < 0 || chance > 1
            ))
          ) {
            errors.push(`事件 ${event.id} 的屍體菁英遭遇率不合法`);
          }
        }
        if (
          outcome.type === 'collector-challenge'
          && !['skill', 'equipment'].includes(outcome.rewardType)
        ) {
          errors.push(`事件 ${event.id} 的收藏家獎勵類型不合法`);
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
    if (typeof region.encounterRules?.boss?.restorePlayerHpAfterVictory !== 'boolean') {
      errors.push(`地區 ${region.id} 的 Boss 勝利回滿生命設定必須是布林值`);
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
    const activation = skill.activation;
    if (!SKILL_ACTIVATIONS.includes(activation)) {
      errors.push(`技能 ${skill.id} 的 activation 不合法：${activation}`);
    }
    if (
      activation === SkillActivation.ACTIVE
      && skill.cost !== undefined
      && (!Number.isInteger(skill.cost) || skill.cost < 0)
    ) {
      errors.push(`主動技能 ${skill.id} 的共用 cost 必須是非負整數`);
    }
    for (const duplicatedField of ['description', 'effects', 'passiveEffects']) {
      if (Object.hasOwn(skill, duplicatedField)) {
        errors.push(
          `技能 ${skill.id} 不可在最外層設定 ${duplicatedField}，請只維護 levels`,
        );
      }
    }

    const levels = skill.levels?.length ?? 0;
    if (levels < 1 || levels > PLAYER_PROGRESSION_RULES.maxSkillLevel) {
      errors.push(
        `技能 ${skill.id} 必須定義1～${PLAYER_PROGRESSION_RULES.maxSkillLevel}個等級`,
      );
    }
    for (const [index, level] of (skill.levels ?? []).entries()) {
      if (typeof level.description !== 'string' || !level.description.trim()) {
        errors.push(`技能 ${skill.id} 的 Lv.${index + 1} 缺少說明`);
      }
      if (activation === SkillActivation.ACTIVE) {
        const cost = level.cost ?? skill.cost;
        if (!Number.isInteger(cost) || cost < 0) {
          errors.push(`主動技能 ${skill.id} 的 Lv.${index + 1} cost 必須是非負整數`);
        }
      }
      const effects = activation === SkillActivation.PASSIVE
        ? level.passiveEffects
        : level.effects;
      if (!Array.isArray(effects) || effects.length === 0) {
        const label = activation === SkillActivation.PASSIVE ? '被動效果' : '效果';
        errors.push(`技能 ${skill.id} 的 Lv.${index + 1} 缺少${label}`);
      }
      if (
        activation === SkillActivation.ACTIVE
        && Object.hasOwn(level, 'passiveEffects')
      ) {
        errors.push(`主動技能 ${skill.id} 的 Lv.${index + 1} 不可設定 passiveEffects`);
      }
      if (
        activation === SkillActivation.PASSIVE
        && Object.hasOwn(level, 'effects')
      ) {
        errors.push(`被動技能 ${skill.id} 的 Lv.${index + 1} 不可設定 effects`);
      }
      for (const effect of level.passiveEffects ?? []) {
        validatePassiveSkillEffect(skill.id, effect, errors);
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

function validateItemEffect(itemId, effect, errors) {
  if (!ITEM_EFFECT_TYPES.includes(effect.type)) {
    errors.push(`道具 ${itemId} 的效果類型不合法：${effect.type}`);
  }
  if (effect.symbolId !== undefined && !isSymbol(effect.symbolId)) {
    errors.push(`道具 ${itemId} 指向不存在的牌面：${effect.symbolId}`);
  }
  if (effect.requiresSymbolId !== undefined && !isSymbol(effect.requiresSymbolId)) {
    errors.push(`道具 ${itemId} 指向不存在的觸發牌面：${effect.requiresSymbolId}`);
  }
  if (effect.statusId !== undefined) {
    checkReference(STATUSES, effect.statusId, `道具 ${itemId} 的效果`, errors);
  }
  if (
    effect.damageSource !== undefined
    && !DAMAGE_SOURCES.includes(effect.damageSource)
  ) {
    errors.push(`道具 ${itemId} 的傷害分類不合法：${effect.damageSource}`);
  }
  if (
    effect.targets !== undefined
    && (
      !Array.isArray(effect.targets)
      || effect.targets.some((target) => !['self', 'enemy'].includes(target))
    )
  ) {
    errors.push(`道具 ${itemId} 的效果目標不合法`);
  }
  if (
    effect.chance !== undefined
    && (!Number.isFinite(effect.chance) || effect.chance < 0 || effect.chance > 1)
  ) {
    errors.push(`道具 ${itemId} 的效果機率必須介於0與1`);
  }
  if (
    effect.resource !== undefined
    && !['action', 'armor', 'mana'].includes(effect.resource)
  ) {
    errors.push(`道具 ${itemId} 的資源類型不合法：${effect.resource}`);
  }
  if (
    effect.maxBonus !== undefined
    && (!Number.isInteger(effect.maxBonus) || effect.maxBonus < 1)
  ) {
    errors.push(`道具 ${itemId} 的 maxBonus 必須是正整數`);
  }
  if (
    effect.resetOnDamage !== undefined
    && typeof effect.resetOnDamage !== 'boolean'
  ) {
    errors.push(`道具 ${itemId} 的 resetOnDamage 必須是布林值`);
  }
  if (
    effect.ratio !== undefined
    && (!Number.isFinite(effect.ratio) || effect.ratio < 0 || effect.ratio > 1)
  ) {
    errors.push(`道具 ${itemId} 的 ratio 必須介於0與1`);
  }
  if (
    effect.multiplier !== undefined
    && (!Number.isFinite(effect.multiplier) || effect.multiplier < 0)
  ) {
    errors.push(`道具 ${itemId} 的 multiplier 必須是非負數`);
  }
}

function validatePassiveSkillEffect(skillId, effect, errors) {
  if (!PASSIVE_SKILL_TRIGGERS.includes(effect.trigger)) {
    errors.push(`技能 ${skillId} 的被動觸發時機不合法：${effect.trigger}`);
  }
  if (!PASSIVE_SKILL_EFFECT_TYPES.includes(effect.type)) {
    errors.push(`技能 ${skillId} 的被動效果類型不合法：${effect.type}`);
  }
  if (
    effect.damagePerMana !== undefined
    && (!Number.isInteger(effect.damagePerMana) || effect.damagePerMana < 1)
  ) {
    errors.push(`技能 ${skillId} 的 damagePerMana 必須是正整數`);
  }
}
