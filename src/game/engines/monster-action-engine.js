import {
  getMonsterSkill,
  MonsterSkillActivation,
  MonsterSkillTrigger,
} from '../data/monster-skills.js';
import { getMonsterActionRule } from '../data/monster-actions.js';
import { pickWeighted } from './weighted-random.js';

export function selectMonsterIntent(unit, { rng = Math.random } = {}) {
  const rule = getMonsterActionRule(unit.rank);
  const activeSkills = unit.skillIds
    .map((skillId) => getMonsterSkill(skillId))
    .filter((skill) => skill.activation === MonsterSkillActivation.ACTIVE);

  const roll = probabilityRoll(rng);
  if (roll < rule.basicAttackChance || activeSkills.length === 0) {
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
    activeSkills,
    rng,
    (entry) => entry.selectionWeight ?? 1,
  );
  return {
    type: 'skill',
    name: skill.name,
    skillId: skill.id,
    power: skill.power,
    damage: monsterSkillDamage(unit, skill.power),
    effects: structuredClone(skill.effects ?? []),
  };
}

/** 預告只鎖定行動種類；執行時以當下數值重建傷害與附帶效果。 */
export function resolveMonsterIntent(unit, intent) {
  if (intent?.type !== 'skill' || !intent.skillId) {
    return { ...intent, damage: unit.baseDamage, effects: [] };
  }
  const skill = getMonsterSkill(intent.skillId);
  return {
    ...intent,
    name: skill.name,
    power: skill.power,
    damage: monsterSkillDamage(unit, skill.power),
    effects: structuredClone(skill.effects ?? []),
  };
}

/**
 * 回傳指定戰鬥階段需要執行的怪物被動效果。
 * 未標示 trigger 的舊資料維持「戰鬥開始」語意。
 */
export function monsterPassiveEffects(unit, trigger) {
  return unit.skillIds
    .map((skillId) => getMonsterSkill(skillId))
    .filter((skill) => (
      skill.activation === MonsterSkillActivation.PASSIVE
      && (skill.trigger ?? MonsterSkillTrigger.BATTLE_START) === trigger
    ))
    .flatMap((skill) => structuredClone(skill.effects ?? []));
}

function monsterSkillDamage(unit, skillMultiplier) {
  const baseDamage = unit.baseDamageBeforeScaling ?? unit.baseDamage;
  const regionMultiplier = unit.regionMultipliers?.baseDamage ?? 1;
  return Math.ceil(baseDamage * regionMultiplier * skillMultiplier);
}

function probabilityRoll(rng) {
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('rng 必須回傳0（含）到1（不含）的數字');
  }
  return roll;
}
