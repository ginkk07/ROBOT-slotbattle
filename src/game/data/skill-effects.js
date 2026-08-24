import { deepFreeze } from './catalog.js';

/**
 * 技能的使用方式。未標示的舊技能視為主動技能，確保舊內容相容。
 */
export const SkillActivation = deepFreeze({
  ACTIVE: 'active',
  PASSIVE: 'passive',
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
