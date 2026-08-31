import { deepFreeze } from './catalog.js';

/**
 * 傷害來源分類。這與 fire／physical 等元素不同，用來判斷傷害是由
 * 拉霸、技能、道具、裝備或狀態產生，供未來的限定加成與觸發使用。
 */
export const DamageSource = deepFreeze({
  SPIN: 'spin',
  SKILL: 'skill',
  ITEM: 'item',
  EQUIPMENT: 'equipment',
  STATUS: 'status',
});

export const DAMAGE_SOURCES = deepFreeze(Object.values(DamageSource));
