import { deepFreeze } from './catalog.js';

/**
 * Discord 介面只顯示內容分類 ICON，不為每個技能或道具配置獨立 ICON。
 * 未來若要更換分類圖示，只需要修改這個檔案。
 */
export const CONTENT_TYPE_META = deepFreeze({
  skill: { label: '技能', emoji: '📘' },
  equipment: { label: '裝備', emoji: '🎒' },
  consumable: { label: '消耗品', emoji: '🧪' },
});

export function contentTypeMeta(type) {
  const meta = CONTENT_TYPE_META[type];
  if (!meta) throw new RangeError(`不存在的內容分類：${type}`);
  return meta;
}

export function contentTypeEmoji(type) {
  return contentTypeMeta(type).emoji;
}

