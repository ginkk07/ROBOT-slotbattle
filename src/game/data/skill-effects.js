import { deepFreeze } from './catalog.js';
import { AttackTrigger } from './attack-triggers.js';

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
  BATTLE_START: 'battle-start',
  ROUND_START: 'round-start',
  PLAYER_TURN_START: 'player-turn-start',
  PLAYER_TURN_END: 'player-turn-end',
  ENEMY_TURN_START: 'enemy-turn-start',
  ENEMY_TURN_END: 'enemy-turn-end',
  ROUND_END: 'round-end',
  BATTLE_END: 'battle-end',
  BEFORE_DAMAGE_TAKEN: 'before-damage-taken',
  ...AttackTrigger,
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
