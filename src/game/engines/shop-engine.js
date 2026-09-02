import { SHOP_RULES } from '../data/shop-rules.js';

/**
 * 神秘商店價格：地區與本次商店已購買次數分別採乘算，最後統一無條件進位。
 */
export function shopPrice(regionDepth, purchases = 0) {
  if (!Number.isInteger(regionDepth) || regionDepth < 1) {
    throw new RangeError('商店地區深度必須是正整數');
  }
  if (!Number.isInteger(purchases) || purchases < 0) {
    throw new RangeError('商店購買次數必須是非負整數');
  }
  const { basePrice, regionMultiplier, purchaseMultiplier } = SHOP_RULES.pricing;
  return Math.ceil(
    basePrice
    * (regionMultiplier ** (regionDepth - 1))
    * (purchaseMultiplier ** purchases),
  );
}
