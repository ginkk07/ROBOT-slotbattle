import { deepFreeze } from './catalog.js';

/**
 * 主動技能、消耗品與怪物技能共用的立即效果類型。
 * 效果實作統一登記在 engines/effects.js，不在各內容流程重寫。
 */
export const EffectType = deepFreeze({
  HEAL: 'heal',
  DAMAGE: 'damage',
  GAIN_RESOURCE: 'gain-resource',
  DAMAGE_FROM_RESOURCE: 'damage-from-resource',
  APPLY_STATUS: 'apply-status',
  REMOVE_STATUS: 'remove-status',
});

export const EFFECT_TYPES = deepFreeze(Object.values(EffectType));
