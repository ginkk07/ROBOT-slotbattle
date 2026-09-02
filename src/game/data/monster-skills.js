import { createCatalog, requireDefinition } from './catalog.js';

export const MonsterSkillActivation = Object.freeze({
  ACTIVE: 'active',
  PASSIVE: 'passive',
});

export const MONSTER_SKILLS = createCatalog([
  {
    id: 'armor-reinforcement',
    name: '護甲強化',
    activation: MonsterSkillActivation.PASSIVE,
    effects: [{
      type: 'apply-status',
      statusId: 'armor-reinforcement',
      target: 'self',
      chance: 1,
      potency: 1,
    }],
  },
  {
    id: 'guardian-strike',
    name: '守衛重擊',
    activation: MonsterSkillActivation.ACTIVE,
    power: 1.25,
    description: '造成基礎傷害 125% 的傷害。',
    effects: [],
  },
  {
    id: 'armor-breaking-strike',
    name: '破甲攻擊',
    activation: MonsterSkillActivation.ACTIVE,
    power: 1,
    description: '造成基礎傷害100%的傷害，並使玩家獲得2層裝甲破壞。',
    effects: [{
      type: 'apply-status',
      statusId: 'armor-break',
      target: 'enemy',
      chance: 1,
      stacks: 2,
      potency: 1,
    }],
  },
  {
    id: 'crushing-blow',
    name: '粉碎重擊',
    activation: MonsterSkillActivation.ACTIVE,
    power: 1.5,
    description: '造成基礎傷害 150% 的傷害。',
    effects: [],
  },
  {
    id: 'ruin-overload',
    name: '遺跡超載',
    activation: MonsterSkillActivation.ACTIVE,
    power: 1.75,
    description: '造成基礎傷害 175% 的傷害。',
    effects: [],
  },
], '怪物技能庫');

export function getMonsterSkill(skillId) {
  return requireDefinition(MONSTER_SKILLS, skillId, '怪物技能庫');
}
