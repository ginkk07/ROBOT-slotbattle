import { deepFreeze } from './catalog.js';

/** 神秘商店的商品池與價格公式集中於此，避免事件流程寫死平衡數值。 */
export const SHOP_RULES = deepFreeze({
  itemChoices: 3,
  rarityWeights: {
    common: 90,
    rare: 9,
    legendary: 1,
  },
  pricing: {
    basePrice: 38,
    regionMultiplier: 1.66,
    purchaseMultiplier: 1.77,
  },
});
