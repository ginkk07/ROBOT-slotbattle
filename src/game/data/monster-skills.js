import { createCatalog, requireDefinition } from './catalog.js';

export const MONSTER_SKILLS = createCatalog([
  {
    id: 'guardian-strike',
    name: '守衛重擊',
    power: 1.25,
    description: '造成基礎傷害 125% 的傷害。',
    effects: [],
  },
  {
    id: 'crushing-blow',
    name: '粉碎重擊',
    power: 1.5,
    description: '造成基礎傷害 150% 的傷害。',
    effects: [],
  },
  {
    id: 'ruin-overload',
    name: '遺跡超載',
    power: 1.75,
    description: '造成基礎傷害 175% 的傷害。',
    effects: [],
  },
], '怪物技能庫');

export function getMonsterSkill(skillId) {
  return requireDefinition(MONSTER_SKILLS, skillId, '怪物技能庫');
}
