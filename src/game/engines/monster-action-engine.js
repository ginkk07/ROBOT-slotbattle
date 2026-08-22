import { getMonsterSkill } from '../data/monster-skills.js';
import { getMonsterActionRule } from '../data/monster-actions.js';
import { pickWeighted } from './weighted-random.js';

export function selectMonsterIntent(unit, { rng = Math.random } = {}) {
  const rule = getMonsterActionRule(unit.rank);

  const roll = probabilityRoll(rng);
  if (roll < rule.basicAttackChance || unit.skillIds.length === 0) {
    return {
      type: 'basic-attack',
      name: '普通攻擊',
      skillId: null,
      power: 1,
      damage: unit.baseDamage,
      effects: [],
    };
  }

  const skill = pickWeighted(
    unit.skillIds.map((skillId) => getMonsterSkill(skillId)),
    rng,
    (entry) => entry.selectionWeight ?? 1,
  );
  return {
    type: 'skill',
    name: skill.name,
    skillId: skill.id,
    power: skill.power,
    damage: Math.ceil(unit.baseDamage * skill.power),
    effects: structuredClone(skill.effects ?? []),
  };
}

function probabilityRoll(rng) {
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('rng 必須回傳0（含）到1（不含）的數字');
  }
  return roll;
}
