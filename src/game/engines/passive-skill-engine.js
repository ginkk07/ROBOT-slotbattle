import { PassiveSkillEffectType } from '../data/skill-effects.js';
import { getSkill, getSkillLevelDefinition } from '../data/skills.js';
import { playerSkillLevel } from './skill-progression.js';

export function passiveSkillEffectEntries(player, type = null) {
  return (player?.skillIds ?? []).flatMap((skillId) => {
    const level = playerSkillLevel(player, skillId);
    if (level < 1) return [];
    const skill = getSkill(skillId);
    const definition = getSkillLevelDefinition(skillId, level);
    return (definition.passiveEffects ?? [])
      .filter((effect) => !type || effect.type === type)
      .map((effect) => ({ skillId, skill, level, effect }));
  });
}

/**
 * 魔力護甲只處理護甲與裝備減傷後的剩餘傷害。
 * 每點法力提供 damagePerMana 點抵擋量；實際消耗量無條件進位，
 * 因此不會出現半點法力，也不會消耗超過本次抵擋所需的法力。
 */
export function resolveManaArmor(player, { damage, mana }) {
  const entry = passiveSkillEffectEntries(
    player,
    PassiveSkillEffectType.MANA_ARMOR,
  ).reduce((best, current) => (
    !best || current.effect.damagePerMana > best.effect.damagePerMana
      ? current
      : best
  ), null);

  if (!entry || damage <= 0 || mana <= 0) {
    return {
      damage,
      blocked: 0,
      manaSpent: 0,
      damagePerMana: entry?.effect.damagePerMana ?? 0,
      skillId: entry?.skillId ?? null,
    };
  }

  const damagePerMana = entry.effect.damagePerMana;
  const blocked = Math.min(damage, mana * damagePerMana);
  const manaSpent = Math.ceil(blocked / damagePerMana);
  return {
    damage: damage - blocked,
    blocked,
    manaSpent,
    damagePerMana,
    skillId: entry.skillId,
  };
}
