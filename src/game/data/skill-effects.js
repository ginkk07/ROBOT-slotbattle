import { deepFreeze } from './catalog.js';

/** 玩家技能的使用方式；每筆技能資料都必須明確指定。 */
export const SkillActivation = deepFreeze({
  ACTIVE: 'active',
  PASSIVE: 'passive',
});

/**
 * 被動技能可掛接的戰鬥時機。主流程只送出時機與戰鬥資料，
 * 不辨識技能 ID；同一時機可由多種被動效果共用。
 */
export const PassiveSkillTrigger = deepFreeze({
  BEFORE_DAMAGE_TAKEN: 'before-damage-taken',
});

/**
 * 被動技能效果使用獨立類型，不送進主動技能的通用 effects 處理器。
 * 新增被動戰鬥機制時，先在這裡登記，再由被動技能引擎統一結算。
 */
export const PassiveSkillEffectType = deepFreeze({
  MANA_ARMOR: 'mana-armor',
});

export const SKILL_ACTIVATIONS = deepFreeze(Object.values(SkillActivation));
export const PASSIVE_SKILL_EFFECT_TYPES = deepFreeze(
  Object.values(PassiveSkillEffectType),
);
export const PASSIVE_SKILL_TRIGGERS = deepFreeze(
  Object.values(PassiveSkillTrigger),
);
