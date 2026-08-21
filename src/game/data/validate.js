import { ENCOUNTER_TABLES } from './encounters.js';
import { EVENTS } from './events.js';
import { ITEMS } from './items.js';
import { LOOT_TABLES } from './loot-tables.js';
import { SKILLS } from './skills.js';
import { STATUSES } from './statuses.js';
import { UNITS } from './units.js';

export function validateGameData() {
  const errors = [];

  for (const unit of Object.values(UNITS)) {
    for (const skillId of unit.skillIds) {
      checkReference(SKILLS, skillId, `單位 ${unit.id} 的 skillIds`, errors);
    }
    if (unit.lootTableId) {
      checkReference(LOOT_TABLES, unit.lootTableId, `單位 ${unit.id} 的 lootTableId`, errors);
    }
    for (const statusId of Object.keys(unit.statusOverrides)) {
      checkReference(STATUSES, statusId, `單位 ${unit.id} 的 statusOverrides`, errors);
    }
  }

  for (const source of [...Object.values(SKILLS), ...Object.values(ITEMS)]) {
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
  }

  for (const table of Object.values(LOOT_TABLES)) {
    for (const entry of table.entries) {
      checkReference(ITEMS, entry.itemId, `掉落表 ${table.id}`, errors);
    }
  }

  for (const event of Object.values(EVENTS)) {
    for (const outcome of event.outcomes) {
      if (outcome.encounterTableId) {
        checkReference(
          ENCOUNTER_TABLES,
          outcome.encounterTableId,
          `事件 ${event.id}`,
          errors,
        );
      }
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
