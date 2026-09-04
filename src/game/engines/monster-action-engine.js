import {
  getMonsterSkill,
  MonsterSkillActivation,
  MonsterPassiveEffectType,
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
      hitCount: 1,
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
    hitCount: skill.hitCount ?? 1,
    damage: monsterSkillDamage(unit, skill.power),
    effects: structuredClone(skill.effects ?? []),
  };
}

/** 預告只鎖定行動種類；執行時以當下數值重建傷害與附帶效果。 */
export function resolveMonsterIntent(unit, intent, { targetResources = {} } = {}) {
  if (intent?.type !== 'skill' || !intent.skillId) {
    return { ...intent, damage: unit.baseDamage, effects: [] };
  }
  const skill = getMonsterSkill(intent.skillId);
  const baseDamage = monsterSkillDamage(unit, skill.power);
  return {
    ...intent,
    name: skill.name,
    power: skill.power,
    hitCount: skill.hitCount ?? 1,
    damage: baseDamage + monsterSkillTargetResourceDamage(skill, targetResources),
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
    .filter((skill) => skill.activation === MonsterSkillActivation.PASSIVE)
    .flatMap((skill) => {
      const effects = [];
      if ((skill.trigger ?? MonsterSkillTrigger.BATTLE_START) === trigger) {
        effects.push(...(skill.effects ?? []));
      }
      if (trigger === MonsterSkillTrigger.BATTLE_START) {
        effects.push(...(skill.battleStartEffects ?? []));
      }
      return structuredClone(effects);
    });
}

/** 供 Attack/Hit 引擎呼叫的怪物被動資料；不以技能 ID 分支。 */
export function monsterAttackPassiveEntries(unit, trigger) {
  return unit.skillIds
    .map((skillId) => getMonsterSkill(skillId))
    .filter((skill) => (
      skill.activation === MonsterSkillActivation.PASSIVE
      && skill.trigger === trigger
    ))
    .flatMap((skill) => (skill.passiveEffects ?? []).map((effect) => ({ skill, effect })));
}

export function resolveMonsterAttackPassives(state, context, trigger, getArmor) {
  const events = [];
  const holderKeys = [...new Set([context.attackerKey, context.targetKey])]
    .filter((key) => key === 'enemy' && state[key]?.hp > 0);
  for (const holderKey of holderKeys) {
    const holder = state[holderKey];
    for (const { skill, effect } of monsterAttackPassiveEntries(holder, trigger)) {
      if (effect.type === MonsterPassiveEffectType.GAIN_BASE_STATS_FROM_TARGET_ARMOR) {
        if (holderKey !== context.attackerKey) continue;
        const armor = Math.max(0, Number(getArmor(state, context.targetKey) ?? 0));
        const gain = Math.floor(armor / Math.max(1, Number(effect.armorPerGain ?? 6)));
        if (gain <= 0) continue;
        holder.baseDamage = Math.max(0, Number(holder.baseDamage ?? 0)) + gain;
        holder.baseDefense = Math.max(0, Number(holder.baseDefense ?? 0)) + gain;
        events.push({
          type: effect.type,
          trigger,
          skillId: skill.id,
          skillName: skill.name,
          gain,
          baseDamage: holder.baseDamage,
          baseDefense: holder.baseDefense,
        });
        continue;
      }
      if (effect.type === MonsterPassiveEffectType.GAIN_ARMOR_FROM_BASE_DEFENSE) {
        if (holderKey !== context.targetKey) continue;
        const gain = Math.max(0, Math.floor(
          Number(holder.baseDefense ?? 0) * Number(effect.multiplier ?? 1),
        ));
        if (gain <= 0) continue;
        holder.armor = Math.max(0, Number(holder.armor ?? 0)) + gain;
        events.push({
          type: effect.type,
          trigger,
          skillId: skill.id,
          skillName: skill.name,
          gain,
          armor: holder.armor,
        });
        continue;
      }
      throw new RangeError(`尚未支援的怪物攻擊被動效果：${effect.type}`);
    }
  }
  return events;
}

function monsterSkillTargetResourceDamage(skill, resources) {
  const effect = skill.damageFromTargetResource;
  if (!effect) return 0;
  const amount = Math.max(0, Number(resources[effect.resource] ?? 0));
  return Math.floor(amount * Number(effect.multiplier ?? 1));
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
