import { createCatalog, requireDefinition } from './catalog.js';

export const MonsterSkillActivation = Object.freeze({
  ACTIVE: 'active',
  PASSIVE: 'passive',
});

/** 怪物被動可明確掛接的戰鬥階段；未標示的舊被動視為 BATTLE_START。 */
export const MonsterSkillTrigger = Object.freeze({
  BATTLE_START: 'battle-start',
  ROUND_START: 'round-start',
  ENEMY_TURN_START: 'enemy-turn-start',
  ENEMY_TURN_END: 'enemy-turn-end',
  ROUND_END: 'round-end',
  BATTLE_END: 'battle-end',
});

export const MONSTER_SKILLS = createCatalog([
  {
    id: 'armor-reinforcement',
    name: '護甲強化',
    activation: MonsterSkillActivation.PASSIVE,
    trigger: MonsterSkillTrigger.BATTLE_START,
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
