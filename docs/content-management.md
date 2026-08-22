# 遊戲內容維護指南

這份文件是新增內容與調整平衡時的入口。原則是：**資料層保存內容與數值，引擎層執行規則，Discord 層只顯示與接收操作，存檔層只保存狀態。**

## 想修改什麼，要去哪裡

| 想修改的內容 | 唯一管理位置 |
|---|---|
| 玩家技能、法力成本、Lv.1～3 效果、稀有度 | `src/game/data/skills.js` |
| 怪物技能、傷害倍率、技能效果 | `src/game/data/monster-skills.js` |
| 普通／菁英／Boss 的普通攻擊率與技能數 | `src/game/data/monster-actions.js` |
| 道具、裝備、行動點成本、稀有度 | `src/game/data/items.js` |
| 燃燒、攻擊力加成等狀態及疊加方式 | `src/game/data/statuses.js` |
| 怪物生命、基礎傷害、持有技能、掉落表 | `src/game/data/units.js` |
| 地區的 Boss／奇遇／菁英機率與能力成長 | `src/game/data/regions.js` |
| 各地區會抽到哪些普通／菁英／Boss | `src/game/data/encounters.js` |
| 奇遇內容與結果 | `src/game/data/events.js` |
| 奇遇稀有度 50／30／20 | `src/game/data/event-rules.js` |
| 三選一數量與戰鬥獎勵稀有度 | `src/game/data/loot-tables.js` |
| 預設開局解鎖、技能／道具欄位、技能持有與等級上限 | `src/game/data/player-progression.js` |
| 成就條件與解鎖內容 | `src/game/data/achievements.js` |
| 稀有度代碼與玩家顯示名稱 | `src/game/data/rarities.js` |
| 拉霸圖示機率與組合計分 | `src/game/symbols.js`、`scoring.js` |
| 玩家版規則文字與 Discord 畫面 | `src/discord/render.js` |

## 模組責任

### `src/game/data/`

- 只放內容定義、平衡數值、ID 與內容之間的引用。
- 所有資料會深度凍結，執行中的戰鬥不能改到原始定義。
- 不直接操作 Discord、D1 或玩家存檔。
- 新增或修改資料後必須通過 `npm run validate-data`。

### `src/game/engines/`

- `adventure-engine.js`：依地區資料執行 Boss → 奇遇 → 菁英 → 普通判定及能力成長。
- `monster-action-engine.js`：依怪物階級資料選擇普通攻擊或技能。
- `loot-engine.js`：執行三選一的獨立稀有度與內容抽取。
- `event-engine.js`：抽取及處理奇遇。
- `effects.js`：技能與道具共用的傷害、治療與狀態效果。
- `status-engine.js`：狀態成功率、抗性與疊加規則。
- `skill-progression.js`：技能持有上限、等級正規化、升級與遺忘。
- `action-availability.js`：戰鬥面板與詳情卡共用的技能／道具可用性判定。
- 引擎不得另存一份相同機率或內容數值；需要數值時一律讀取資料層。

### `src/game/engine.js`

這是遊戲流程的對外入口，負責協調玩家行動、敵人回合、獎勵、下一節點與遊戲結算。內容名稱、稀有度、怪物機率及地區成長不應寫在這裡。

### `src/discord/`

- `game-controller.js`：把 Discord 指令、按鈕與 Modal 轉成遊戲引擎操作。
- `render.js`：把目前狀態轉成 Discord 訊息。
- `content-detail.js`：產生技能／道具私人詳情卡與「使用／關閉」按鈕。
- Discord 層不可自行計算傷害、抽選稀有度或改變戰鬥規則。

### `src/player/` 與 `src/persistence/`

- `profile.js`：永久玩家資料格式與舊資料升級。
- `achievement-engine.js`：遊戲結束後的永久統計、成就及解鎖。
- `persistence/`：D1、Google 鏡像與本機儲存；不包含遊戲規則。

## 常見新增流程

### 新增玩家技能

1. 在 `skills.js` 建立唯一且不再重複使用的 ID。
2. 設定 `cost`、`rarity`、`description`、`effects` 與掉落標籤。
3. 在 `levels` 依序建立 Lv.1～Lv.3 的 `description` 與 `effects`；最外層 `description`、`effects` 保持與 Lv.1 一致，供舊呼叫端與資料檢視使用。
4. 如果需要新狀態，先在 `statuses.js` 建立狀態。
5. 若要預設開局解鎖，將 ID 加入 `player-progression.js`；若由成就解鎖，寫入 `achievements.js`。
6. 補每個等級的效果、獎勵升級與資料驗證測試。

### 新增怪物

1. 如需新技能，先在 `monster-skills.js` 建立。
2. 在 `units.js` 設定階級、生命、基礎傷害、持有技能與掉落表。
3. 技能數必須符合 `monster-actions.js` 的階級規則。
4. 將怪物標籤加入對應 `encounters.js` 遭遇池。
5. 補遭遇與行動測試。

### 新增道具或裝備

1. 在 `items.js` 設定類型、稀有度、效果及 `actionCost`。
2. 裝備使用 `battleStartEffects`；消耗品使用 `effects`。
3. 需要的新狀態先加入 `statuses.js`。
4. 設定預設解鎖或成就解鎖來源。
5. 補效果與戰鬥測試。

### 修改技能／道具詳情卡

1. 內容名稱、稀有度、法力成本與效果仍只修改資料層，不在 Discord 檔案複製文字。
2. 是否可用由 `action-availability.js` 統一判定；新增限制時同時補引擎的執行驗證，避免舊按鈕繞過規則。
3. 詳情卡排版與按鈕只修改 `content-detail.js`。
4. 戰鬥面板上的技能／道具入口按鈕只修改 `render.js`。
5. 裝備不能主動使用，因此詳情卡固定只顯示「關閉」。

### 新增地區

1. 在 `regions.js` 設定遭遇表、Boss／奇遇／菁英規則與生命／傷害成長。
2. 在 `encounters.js` 建立普通、菁英與 Boss 遭遇表。
3. 為該地區建立至少一個普通怪、菁英怪與 Boss。
4. 為每個奇遇稀有度建立可抽取事件。
5. 為所有可掉落稀有度準備至少一個符合地區標籤的玩家技能或道具。
6. 補地區抽選、換區與成長測試。

### 新增成就

1. 在 `achievements.js` 建立 ID、條件與解鎖內容。
2. 可用條件由 `achievement-engine.js` 統一判定，不在 Discord 畫面寫條件。
3. 確認所有解鎖 ID 存在，並補成就結算與重複結算測試。

## ID 與存檔規則

- 已進入玩家存檔的單位、技能、道具、狀態、事件與成就 ID 不要直接改名或重複使用。
- 必須改 ID 時，要同時新增明確的存檔升級規則。
- 只調整名稱、說明、機率或效果數值不需要 D1 migration。
- D1 的 `slotbattle_sessions` 與 `slotbattle_profiles` 保存 JSON；只有改變資料表欄位時才新增 SQL migration。

## 修改後的固定檢查

```bash
npm test
npm run validate-data
npm run simulate -- 100
npm run worker:check
```

合併前的快速檢查使用固定種子與每局 100 回合上限；進行平衡評估時，再以 `SLOT_SIM_SEED`、`SLOT_SIM_MAX_TURNS` 與執行局數擴大樣本。

資料驗證會檢查內容引用、怪物技能數、所有機率與權重、地區結構、開局解鎖、成就解鎖及掉落表。新增平衡欄位時，也必須同步加入驗證，避免錯誤設定直到遊戲執行時才被發現。
