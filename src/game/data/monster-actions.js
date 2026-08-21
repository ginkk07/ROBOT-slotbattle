import { deepFreeze } from './catalog.js';
import { UnitRank } from './units.js';

// 怪物階級的共用行動規則。調整普通攻擊／技能機率或技能數時，
// 只修改此處；怪物個別持有哪些技能仍由 units.js 管理。
export const MONSTER_ACTION_RULES = deepFreeze({
  [UnitRank.NORMAL]: {
    basicAttackChance: 0.6,
    requiredSkillCount: 1,
  },
  [UnitRank.ELITE]: {
    basicAttackChance: 0.4,
    requiredSkillCount: 2,
  },
  [UnitRank.BOSS]: {
    basicAttackChance: 0.2,
    requiredSkillCount: 3,
  },
});

export function getMonsterActionRule(rank) {
  const rule = MONSTER_ACTION_RULES[rank];
  if (!rule) throw new RangeError(`不存在的怪物階級規則：${rank}`);
  return rule;
}
