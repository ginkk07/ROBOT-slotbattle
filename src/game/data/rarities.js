export const ContentRarity = Object.freeze({
  COMMON: 'common',
  RARE: 'rare',
  LEGENDARY: 'legendary',
});

// 奇遇和戰利品雖使用相同名稱，但必須由不同的抽選流程處理。
export const EventRarity = Object.freeze({
  COMMON: 'common',
  RARE: 'rare',
  LEGENDARY: 'legendary',
});

export const RARITY_LABELS = Object.freeze({
  common: '普通',
  rare: '稀有',
  legendary: '傳說',
});

export function rarityLabel(rarity) {
  return RARITY_LABELS[rarity] ?? String(rarity);
}
