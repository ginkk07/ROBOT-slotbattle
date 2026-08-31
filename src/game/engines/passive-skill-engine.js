import { PassiveSkillEffectType } from '../data/skill-effects.js';
import { getSkill, getSkillLevelDefinition } from '../data/skills.js';
import { playerSkillLevel } from './skill-progression.js';

/**
 * 被動技能的共用處理器註冊表。
 *
 * 主戰鬥流程只會呼叫 resolvePassiveSkillEffects()，不會辨識技能 ID
 * 或「魔力護甲」名稱。新增全新的被動機制時，只需新增效果類型、
 * 在這裡登記處理器，再把效果掛進技能等級資料。
 */
const PASSIVE_SKILL_EFFECT_HANDLERS = Object.freeze({
  [PassiveSkillEffectType.MANA_ARMOR]: resolveManaArmorEffect,
});

export function passiveSkillEffectEntries(
  player,
  { trigger = null, type = null } = {},
) {
  return (player?.skillIds ?? []).flatMap((skillId) => {
    const level = playerSkillLevel(player, skillId);
    if (level < 1) return [];
    const skill = getSkill(skillId);
    const definition = getSkillLevelDefinition(skillId, level);
    return (definition.passiveEffects ?? [])
      .filter((effect) => !trigger || effect.trigger === trigger)
      .filter((effect) => !type || effect.type === type)
      .map((effect) => ({ skillId, skill, level, effect }));
  });
}

/**
 * 結算指定時機的所有玩家被動技能。
 *
 * 每個效果處理器接收上一個處理器留下的 context，因此不同機制可以
 * 依資料順序串接；同類效果會一次交給同一個處理器決定疊加規則。
 */
export function resolvePassiveSkillEffects(player, trigger, context = {}) {
  const entries = passiveSkillEffectEntries(player, { trigger });
  const entriesByType = groupEntriesByType(entries);
  let nextContext = structuredClone(context);
  const events = [];

  for (const [type, matchingEntries] of entriesByType) {
    const handler = PASSIVE_SKILL_EFFECT_HANDLERS[type];
    if (!handler) throw new RangeError(`尚未支援的被動技能效果：${type}`);
    const result = handler({
      player,
      entries: matchingEntries,
      context: nextContext,
    });
    nextContext = result.context;
    events.push(...result.events);
  }

  return { context: nextContext, events };
}

function groupEntriesByType(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const matches = groups.get(entry.effect.type) ?? [];
    matches.push(entry);
    groups.set(entry.effect.type, matches);
  }
  return groups;
}

/**
 * 魔力護甲只處理護甲與裝備減傷後的剩餘傷害。
 * 若未來有多個同類效果，只採 damagePerMana 最高者，避免同一筆傷害
 * 重複消耗法力。主流程不需要知道這項疊加規則。
 */
function resolveManaArmorEffect({ entries, context }) {
  const entry = entries.reduce((best, current) => (
    !best || current.effect.damagePerMana > best.effect.damagePerMana
      ? current
      : best
  ), null);
  const damage = Number(context.damage ?? 0);
  const mana = Number(context.resources?.mana ?? 0);

  if (!entry || damage <= 0 || mana <= 0) {
    return { context, events: [] };
  }

  const damagePerMana = entry.effect.damagePerMana;
  const blocked = Math.min(damage, mana * damagePerMana);
  const manaSpent = Math.ceil(blocked / damagePerMana);
  return {
    context: {
      ...context,
      damage: damage - blocked,
      resources: {
        ...context.resources,
        mana: mana - manaSpent,
      },
    },
    events: [{
      type: entry.effect.type,
      trigger: entry.effect.trigger,
      skillId: entry.skillId,
      skillLevel: entry.level,
      blocked,
      manaSpent,
      damagePerMana,
    }],
  };
}
