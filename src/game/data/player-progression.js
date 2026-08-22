import { deepFreeze } from './catalog.js';

// 永久玩家資料的開局規則。新增預設解鎖或調整開局欄位數時，
// 不需要修改 profile 的升級與儲存流程。
export const PLAYER_PROGRESSION_RULES = deepFreeze({
  defaultUnlockedStartingSkillIds: [
    'life-recovery',
    'power-strike',
    'fire-imbue',
  ],
  defaultUnlockedStartingItemIds: [
    'healing-potion',
    'fire-bomb',
    'flame-sword',
  ],
  startingSkillSlots: 1,
  startingItemSlots: 1,
});
