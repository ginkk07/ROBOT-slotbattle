import { deepFreeze } from './catalog.js';

/**
 * 傷害大分類。這與 fire／physical 等元素不同；技能、道具、裝備與
 * 持續狀態造成的直接傷害統一屬於額外傷害，詛咒與反射各自獨立。
 */
export const DamageSource = deepFreeze({
  SPIN: 'spin',
  EXTRA: 'extra',
  CURSE: 'curse',
  REFLECT: 'reflect',
});

export const DAMAGE_SOURCES = deepFreeze(Object.values(DamageSource));
