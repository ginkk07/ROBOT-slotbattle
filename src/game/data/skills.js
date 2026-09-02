import { createCatalog, requireDefinition } from './catalog.js';
import { EffectType } from './effect-types.js';
import { ContentRarity } from './rarities.js';
import {
  PassiveSkillEffectType,
  PassiveSkillTrigger,
  SkillActivation,
} from './skill-effects.js';

export const SKILLS = createCatalog([
  {
    id: 'life-recovery',
    name: '治癒',
    emoji: '💚',
    rarity: ContentRarity.COMMON,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 3,
    levels: [
      {
        description: '回復 5 點生命。',
        effects: [{ type: EffectType.HEAL, amount: 5, target: 'self' }],
      },
      {
        description: '回復 10 點生命。',
        effects: [{ type: EffectType.HEAL, amount: 10, target: 'self' }],
      },
      {
        description: '回復 15 點生命。',
        effects: [{ type: EffectType.HEAL, amount: 15, target: 'self' }],
      },
    ],
  },
  {
    id: 'power-strike',
    name: '強擊',
    emoji: '💥',
    rarity: ContentRarity.COMMON,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 2,
    levels: [
      {
        description: '下一次拉霸造成攻擊傷害時，傷害變為2倍。',
        effects: [{
          type: EffectType.APPLY_STATUS,
          statusId: 'power-strike-ready',
          target: 'self',
          chance: 1,
          potency: 2,
        }],
      },
      {
        description: '下一次拉霸造成攻擊傷害時，傷害變為3倍。',
        effects: [{
          type: EffectType.APPLY_STATUS,
          statusId: 'power-strike-ready',
          target: 'self',
          chance: 1,
          potency: 3,
        }],
      },
      {
        description: '下一次拉霸造成攻擊傷害時，傷害變為4倍。',
        effects: [{
          type: EffectType.APPLY_STATUS,
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
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 2,
    levels: [
      {
        description: '獲得火焰附加狀態，拉霸造成攻擊傷害時額外造成 1 點傷害，持續 3 回合。',
        effects: [{
          type: EffectType.APPLY_STATUS,
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
          type: EffectType.APPLY_STATUS,
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
          type: EffectType.APPLY_STATUS,
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
    id: 'mana-armor',
    name: '魔力護甲',
    emoji: '✨',
    rarity: ContentRarity.RARE,
    activation: SkillActivation.PASSIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    levels: [
      {
        description: '受到傷害時，每消耗1點✨可抵擋1點傷害。',
        passiveEffects: [{
          trigger: PassiveSkillTrigger.BEFORE_DAMAGE_TAKEN,
          type: PassiveSkillEffectType.MANA_ARMOR,
          damagePerMana: 1,
        }],
      },
      {
        description: '受到傷害時，每消耗1點✨可抵擋2點傷害。',
        passiveEffects: [{
          trigger: PassiveSkillTrigger.BEFORE_DAMAGE_TAKEN,
          type: PassiveSkillEffectType.MANA_ARMOR,
          damagePerMana: 2,
        }],
      },
      {
        description: '受到傷害時，每消耗1點✨可抵擋3點傷害。',
        passiveEffects: [{
          trigger: PassiveSkillTrigger.BEFORE_DAMAGE_TAKEN,
          type: PassiveSkillEffectType.MANA_ARMOR,
          damagePerMana: 3,
        }],
      },
    ],
  },
  {
    id: 'flame-impact',
    name: '火焰衝擊',
    emoji: '🔥',
    rarity: ContentRarity.LEGENDARY,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 3,
    levels: [
      {
        description: '立即造成 5 點額外傷害，並有 60% 機率附加 5 層燃燒狀態。',
        effects: [
          { type: EffectType.DAMAGE, element: 'fire', amount: 5, target: 'enemy' },
          {
            type: EffectType.APPLY_STATUS,
            statusId: 'burning',
            target: 'enemy',
            chance: 0.6,
            stacks: 5,
            potency: 1,
          },
        ],
      },
      {
        description: '立即造成 5 點額外傷害，並有 60% 機率附加 10 層燃燒狀態。',
        effects: [
          { type: EffectType.DAMAGE, element: 'fire', amount: 5, target: 'enemy' },
          {
            type: EffectType.APPLY_STATUS,
            statusId: 'burning',
            target: 'enemy',
            chance: 0.6,
            stacks: 10,
            potency: 1,
          },
        ],
      },
      {
        description: '立即造成 5 點額外傷害，並有 60% 機率附加 15 層燃燒狀態。',
        effects: [
          { type: EffectType.DAMAGE, element: 'fire', amount: 5, target: 'enemy' },
          {
            type: EffectType.APPLY_STATUS,
            statusId: 'burning',
            target: 'enemy',
            chance: 0.6,
            stacks: 15,
            potency: 1,
          },
        ],
      },
    ],
  },
  {
    id: 'shield-block',
    name: '盾牌格檔',
    emoji: '🛡️',
    rarity: ContentRarity.COMMON,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 1,
    levels: [2, 4, 6].map((amount) => ({
      description: `立即獲得 ${amount} 點🛡️。`,
      effects: [{
        type: EffectType.GAIN_RESOURCE,
        resource: 'armor',
        amount,
        target: 'self',
      }],
    })),
  },
  {
    id: 'flame-cover',
    name: '烈火罩',
    emoji: '🔥',
    rarity: ContentRarity.RARE,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 2,
    levels: [1, 2, 3].map((potency) => ({
      description: `立即獲得 ${potency * 2} 點🛡️；敵人完成攻擊後，使敵人獲得 ${potency} 層燃燒，即使傷害被完全抵擋仍會觸發。`,
      effects: [
        {
          type: EffectType.GAIN_RESOURCE,
          resource: 'armor',
          amount: potency * 2,
          target: 'self',
        },
        {
          type: EffectType.APPLY_STATUS,
          statusId: 'flame-cover',
          target: 'self',
          chance: 1,
          potency,
        },
      ],
    })),
  },
  {
    id: 'shield-throw',
    name: '盾牌投擲',
    emoji: '🛡️',
    rarity: ContentRarity.RARE,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 1,
    levels: [1, 2, 3].map((potency) => ({
      description: `下次拉霸出現🛡️時，依該次拉霸取得的護甲值＋${potency * 3}，對敵人造成額外傷害。`,
      effects: [{
        type: EffectType.APPLY_STATUS,
        statusId: 'shield-throw-ready',
        target: 'self',
        chance: 1,
        potency,
      }],
    })),
  },
  {
    id: 'shield-bash',
    name: '盾牌猛擊',
    emoji: '💥',
    rarity: ContentRarity.LEGENDARY,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    cost: 2,
    levels: [1, 2, 3].map((multiplier) => ({
      description: `依目前🛡️的 ${multiplier} 倍對敵人造成額外傷害，結算後扣除一半🛡️。`,
      effects: [{
        type: EffectType.DAMAGE_FROM_RESOURCE,
        resource: 'armor',
        multiplier,
        consumeRatio: 0.5,
        minimumResource: 1,
        element: 'physical',
        target: 'enemy',
      }],
    })),
  },
  {
    id: 'holy-shield',
    name: '聖盾術',
    emoji: '✨',
    rarity: ContentRarity.LEGENDARY,
    activation: SkillActivation.ACTIVE,
    lootEligible: true,
    lootWeight: 100,
    lootTags: ['ruins'],
    levels: [5, 4, 3].map((cost) => ({
      cost,
      description: '持續3回合；每回合🛡️出現機率＋25個百分點、⚔️出現機率－25個百分點。',
      effects: [{
        type: EffectType.APPLY_STATUS,
        statusId: 'holy-shield',
        target: 'self',
        chance: 1,
        duration: 3,
        potency: 1,
      }],
    })),
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
  const definitions = skill.levels ?? [];
  if (!Number.isInteger(level) || level < 1 || level > definitions.length) {
    throw new RangeError(`${skill.name}沒有 Lv.${level} 的資料`);
  }
  return definitions[level - 1];
}

/**
 * 技能文字與效果都以 levels 為唯一來源，避免 Lv.1 在最外層再維護一次。
 * 清單介面沒有玩家等級時，一律顯示 Lv.1 說明。
 */
export function skillDescription(skillOrId, level = 1) {
  const skillId = typeof skillOrId === 'string' ? skillOrId : skillOrId.id;
  return getSkillLevelDefinition(skillId, level).description;
}

export function skillActivation(skillOrId) {
  const skill = typeof skillOrId === 'string' ? getSkill(skillOrId) : skillOrId;
  return skill.activation;
}

export function skillCost(skillOrId, level = 1) {
  const skill = typeof skillOrId === 'string' ? getSkill(skillOrId) : skillOrId;
  if (skillActivation(skill) === SkillActivation.PASSIVE) return null;
  const definition = getSkillLevelDefinition(skill.id, level);
  const cost = definition.cost ?? skill.cost;
  if (!Number.isInteger(cost) || cost < 0) {
    throw new RangeError(`${skill.name} Lv.${level} 的法力成本必須是非負整數`);
  }
  return cost;
}

export function skillUsageLabel(skillOrId, level = 1) {
  const skill = typeof skillOrId === 'string' ? getSkill(skillOrId) : skillOrId;
  return skillActivation(skill) === SkillActivation.PASSIVE
    ? '被動技能'
    : `${skillCost(skill, level)} 法力`;
}
