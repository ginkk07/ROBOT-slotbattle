import { deepFreeze } from './catalog.js';
import { EventRarity } from './rarities.js';

// 奇遇稀有度是獨立系統，不讀取戰鬥獎勵的稀有度修正。
export const EVENT_RULES = deepFreeze({
  rarityWeights: {
    [EventRarity.COMMON]: 60,
    [EventRarity.RARE]: 30,
    [EventRarity.LEGENDARY]: 10,
  },
});
