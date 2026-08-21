import { getMonsterSkill } from '../data/monster-skills.js';
import { UnitRank } from '../data/units.js';
import { pickWeighted } from './weighted-random.js';

export const BASIC_ATTACK_CHANCE = Object.freeze({
  [UnitRank.NORMAL]: 0.6,
  [UnitRank.ELITE]: 0.4,
  [UnitRank.BOSS]: 0.2,
});

export function selectMonsterIntent(unit, { rng = Math.random } = {}) {
  const basicAttackChance = BASIC_ATTACK_CHANCE[unit.rank];
  if (basicAttackChance === undefined) {
    throw new RangeError(`無法替 ${unit.rank} 階級選擇怪物行動`);
  }

  const roll = probabilityRoll(rng);
  if (roll < basicAttackChance || unit.skillIds.length === 0) {
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
