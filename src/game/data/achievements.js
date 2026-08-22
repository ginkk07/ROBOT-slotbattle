import { createCatalog } from './catalog.js';

// 成就內容與解鎖條件會在使用者完成設計後逐項加入；引擎已支援
// achievementIds 與技能／道具解鎖，避免把條件寫死在 Discord 介面。
export const ACHIEVEMENTS = createCatalog([], '成就庫');
