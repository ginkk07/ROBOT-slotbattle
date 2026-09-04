import { deepFreeze } from './catalog.js';

/**
 * 一次 Attack 可包含一段以上的 Hit。這些時機不區分玩家或怪物，
 * 讓普通攻擊、主動技能與未來連擊共用同一套生命週期。
 */
export const AttackTrigger = deepFreeze({
  BEFORE_ATTACK: 'before-attack',
  BEFORE_ATTACK_HIT: 'before-attack-hit',
  AFTER_ATTACK_HIT: 'after-attack-hit',
  AFTER_ATTACK: 'after-attack',
});

export const ATTACK_TRIGGERS = deepFreeze(Object.values(AttackTrigger));
