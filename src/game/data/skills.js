import { createCatalog, requireDefinition } from './catalog.js';
import { ContentRarity } from './rarities.js';

export const SKILLS = createCatalog([
  {
    id: 'life-recovery',
    name: '治癒',
    emoji: '💚',
    rarity: ContentRarity.COMMON,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 3,
    description: '回復 5 點生命。',
    effects: [
      { type: 'heal', amount: 5, target: 'self' },
    ],
    levels: [
      {
        description: '回復 5 點生命。',
        effects: [{ type: 'heal', amount: 5, target: 'self' }],
      },
      {
        description: '回復 10 點生命。',
        effects: [{ type: 'heal', amount: 10, target: 'self' }],
      },
      {
        description: '回復 15 點生命。',
        effects: [{ type: 'heal', amount: 15, target: 'self' }],
      },
    ],
  },
  {
    id: 'power-strike',
    name: '強擊',
    emoji: '💥',
    rarity: ContentRarity.COMMON,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 2,
    description: '下一次拉霸造成攻擊傷害時，傷害變為2倍。',
    effects: [
      {
        type: 'apply-status',
        statusId: 'power-strike-ready',
        target: 'self',
        chance: 1,
        potency: 2,
      },
    ],
    levels: [
      {
        description: '下一次拉霸造成攻擊傷害時，傷害變為2倍。',
        effects: [{
          type: 'apply-status',
          statusId: 'power-strike-ready',
          target: 'self',
          chance: 1,
          potency: 2,
        }],
      },
      {
        description: '下一次拉霸造成攻擊傷害時，傷害變為3倍。',
        effects: [{
          type: 'apply-status',
          statusId: 'power-strike-ready',
          target: 'self',
          chance: 1,
          potency: 3,
        }],
      },
      {
        description: '下一次拉霸造成攻擊傷害時，傷害變為4倍。',
        effects: [{
          type: 'apply-status',
          statusId: 'power-strike-ready',
          target: 'self',
          chance: 1,
          potency: 4,
        }],
      },
    ],
  },
  {
    id: 'fire-imbue',
    name: '火焰附加',
    emoji: '🔥',
    rarity: ContentRarity.RARE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 2,
    description: '獲得火焰附加狀態，拉霸造成攻擊傷害時額外造成 1 點傷害，持續 3 回合。',
    effects: [
      {
        type: 'apply-status',
        statusId: 'fire-imbue',
        target: 'self',
        chance: 1,
        duration: 3,
        potency: 1,
      },
    ],
    levels: [
      {
        description: '獲得火焰附加狀態，拉霸造成攻擊傷害時額外造成 1 點傷害，持續 3 回合。',
        effects: [{
          type: 'apply-status',
          statusId: 'fire-imbue',
          target: 'self',
          chance: 1,
          duration: 3,
          potency: 1,
        }],
      },
      {
        description: '獲得火焰附加狀態，拉霸造成攻擊傷害時額外造成 2 點傷害，持續 3 回合。',
        effects: [{
          type: 'apply-status',
          statusId: 'fire-imbue',
          target: 'self',
          chance: 1,
          duration: 3,
          potency: 2,
        }],
      },
      {
        description: '獲得火焰附加狀態，拉霸造成攻擊傷害時額外造成 3 點傷害，持續 3 回合。',
        effects: [{
          type: 'apply-status',
          statusId: 'fire-imbue',
          target: 'self',
          chance: 1,
          duration: 3,
          potency: 3,
        }],
      },
    ],
  },
  {
    id: 'flame-impact',
    name: '火焰衝擊',
    emoji: '🔥',
    rarity: ContentRarity.LEGENDARY,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 3,
    description: '立即造成 5 點傷害，並有 60% 機率附加 3 層燃燒狀態。',
    effects: [
      { type: 'damage', element: 'fire', amount: 5, target: 'enemy' },
      {
        type: 'apply-status',
        statusId: 'burning',
        target: 'enemy',
        chance: 0.6,
        stacks: 3,
        potency: 1,
      },
    ],
    levels: [
      {
        description: '立即造成 5 點傷害，並有 60% 機率附加 3 層燃燒狀態。',
        effects: [
          { type: 'damage', element: 'fire', amount: 5, target: 'enemy' },
          {
            type: 'apply-status',
            statusId: 'burning',
            target: 'enemy',
            chance: 0.6,
            stacks: 3,
            potency: 1,
          },
        ],
      },
      {
        description: '立即造成 5 點傷害，並有 60% 機率附加 4 層燃燒狀態。',
        effects: [
          { type: 'damage', element: 'fire', amount: 5, target: 'enemy' },
          {
            type: 'apply-status',
            statusId: 'burning',
            target: 'enemy',
            chance: 0.6,
            stacks: 4,
            potency: 1,
          },
        ],
      },
      {
        description: '立即造成 5 點傷害，並有 60% 機率附加 5 層燃燒狀態。',
        effects: [
          { type: 'damage', element: 'fire', amount: 5, target: 'enemy' },
          {
            type: 'apply-status',
            statusId: 'burning',
            target: 'enemy',
            chance: 0.6,
            stacks: 5,
            potency: 1,
          },
        ],
      },
    ],
  },
], '技能庫');

export function getSkill(skillId) {
  return requireDefinition(SKILLS, skillId, '技能庫');
}

export function getSkillMaxLevel(skillId, globalMaximum = Infinity) {
  const skill = getSkill(skillId);
  const definedLevels = skill.levels?.length ?? 1;
  return Math.min(definedLevels, globalMaximum);
}

export function getSkillLevelDefinition(skillId, level = 1) {
  const skill = getSkill(skillId);
  const definitions = skill.levels?.length
    ? skill.levels
    : [{ description: skill.description, effects: skill.effects }];
  if (!Number.isInteger(level) || level < 1 || level > definitions.length) {
    throw new RangeError(`${skill.name}沒有 Lv.${level} 的資料`);
  }
  return definitions[level - 1];
}
