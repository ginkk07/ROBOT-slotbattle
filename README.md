# Discord 拉霸戰鬥

以「自由投入行動點拉霸，立即攻擊、取得護甲與累積法力」為核心的單人 Boss 戰機器人。資料、規則、Discord 畫面與存檔已拆成獨立模組，作為後續 Roguelike 內容的基礎。

正式部署使用 **Discord HTTP Interactions + Cloudflare Workers 免費版**；不需要常駐主機或一直開著個人電腦。Cloudflare D1 負責即時戰鬥與玩家資料，Google Apps Script／試算表在背景保存玩家永久資料副本。原本的 Discord Gateway 啟動方式仍保留作為本機備用。

## 目前可以遊玩的內容

- `/slotbattle start`：開始戰鬥；若已有進行中的戰鬥，會直接重新顯示。
- `/slotbattle resume`：找回尚未結束的戰鬥面板。
- `/slotbattle profile`：各選 1 個下一場使用的開局技能與道具。
- `/slotbattle rules`：查看玩家操作說明。
- 每回合 4 點行動點；按下「投入點數」後可輸入任意剩餘點數，一次投入或分次投入皆可。
- 三格各以 30% 攻擊、30% 防禦、30% 技能、5% 幸運、5% 不幸抽選。
- 同類圖示 1／2／3 個時為 1／3／9 點，再乘上本次投入的行動點。
- 幸運將相同基礎值加入攻擊、防禦與技能；三個不幸會使玩家本回合暈眩。
- 攻擊會立即傷害 Boss；防禦轉為本回合護甲；技能圖示轉為法力。
- 技能可在拉霸之間主動使用；玩家目前可選治癒、強擊或火焰附加。
- 消耗品可在戰鬥中使用，裝備會在開局自動穿戴；目前可選生命藥水、火焰炸彈或燃焰之劍。
- 玩家自行按下「回合結束」後 Boss 才會攻擊；行動點、護甲與法力不保留到下回合。
- 支援勝利、失敗、放棄、重新挑戰與重啟後續戰。

## 已建立的 Roguelike 資料架構

| 資料 | 位置 | 目前內容 |
|---|---|---|
| 單位庫 | `src/game/data/units.js` | 玩家、普通怪、菁英怪、Boss、rank、tags、抗性 |
| 技能庫 | `src/game/data/skills.js` | 玩家／怪物共用技能與 effects |
| 狀態庫 | `src/game/data/statuses.js` | 燃燒、中毒、冰凍、暈眩、強化、再生與 Boss 規則 |
| 道具庫 | `src/game/data/items.js` | 消耗品、裝備與共用 effects |
| 遭遇／事件 | `src/game/data/encounters.js`、`events.js` | 依 tags、rank 與權重抽選，包含高菁英機率事件 |
| 掉落表 | `src/game/data/loot-tables.js` | 加權掉落、數量範圍與多次抽選 |

技能與道具共用 `effects`；Boss 狀態規則支援 `normal`、`reduced`、`immune`，單位自己的 `statusOverrides` 具有最高優先權。

目前消耗品不消耗行動點；裝備則在建立戰鬥時自動套用。技能、道具與狀態都由共用效果引擎執行，不在 Discord 畫面內寫死效果。
完整的執行流程與資料責任請見 [`docs/combat-v2.md`](docs/combat-v2.md)。

## 免費部署到 Cloudflare Workers

完整圖文欄位與驗證順序請依照 [`docs/cloudflare-workers.md`](docs/cloudflare-workers.md)。

部署後的資料流：

```text
Discord 指令／按鈕
    → Cloudflare Worker（驗證簽章與執行遊戲）
    → Cloudflare D1（即時讀寫）
    → Cloudflare Worker 直接回傳 Discord 互動結果
    → Google Apps Script／試算表（背景同步玩家永久資料）
```

Worker 會在 Discord 的第一次互動回覆中直接送出結果，避免再由
Cloudflare 主動呼叫 Discord Webhook；D1 查詢保持在互動回覆的 3 秒期限內，
Google 試算表同步則使用背景工作，不會延後遊戲畫面。

Worker 執行時需要一個 D1 binding `DB`，以及三個 Cloudflare Secrets：

```text
DISCORD_PUBLIC_KEY
APPS_SCRIPT_URL
APPS_SCRIPT_SECRET
```

Bot Token 不放在 Worker；它只用於註冊斜線指令。專案提供手動執行的 GitHub Actions 工作流程 `Register Discord Commands`，可避免在個人電腦安裝與執行 Node.js。

## 本機 Gateway 備用模式

需求：Node.js 24.17.0 以上、Discord Application、Bot Token 與測試伺服器。

1. 到 [Discord Developer Portal](https://discord.com/developers/applications) 建立 Application 與 Bot。
2. 安裝到測試伺服器，Scopes 包含 `bot`、`applications.commands`，並授予傳送訊息與嵌入連結權限。
3. 建立本機環境檔：

```bash
cp .env.example .env
```

4. 填入：

```env
DISCORD_TOKEN=Bot_Token
DISCORD_CLIENT_ID=Application_ID
DISCORD_GUILD_ID=測試伺服器ID
```

5. 安裝、註冊指令並啟動：

```bash
npm ci
npm run register
npm start
```

測試期建議填入 `DISCORD_GUILD_ID`；留空會註冊為全域指令，顯示更新可能需要等待。Cloudflare 正式版本不需要執行 `npm start`。

## 玩家存檔

未設定 Google 存檔時，機器人使用記憶體模式，重啟後戰鬥會消失。

Cloudflare 正式版使用 D1 的兩張資料表：

- `slotbattle_sessions`：即時戰鬥狀態與版本號。
- `slotbattle_profiles`：玩家永久資料與版本號。

資料表定義在 `migrations/0001_initial.sql`。D1 讓 Discord 操作不必等待 Google 試算表；Apps Script 只在背景把新建或更新後的玩家資料同步到 `slotbattle_profiles` 工作表。

單位、技能、狀態、道具、事件與掉落屬於版本化遊戲內容，保存在 `src/game/data/`，不重複寫入 D1。D1 只保存會隨玩家操作改變的戰鬥實例與玩家配置。

要啟用 Google 試算表，依照 [`apps-script/README.md`](apps-script/README.md) 部署 `Code.gs`，再設定：

```env
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_SECRET=伺服器端密鑰
```

Google 試算表會保存：

- Discord 玩家 ID 與永久解鎖資料。
- 初始技能／道具欄位與最後開局配置。
- D1 的 `revision` 版本號；較舊的背景請求不會覆蓋新版資料。

## 測試與平衡

```bash
npm test
npm run validate-data
npm run simulate
npm run simulate -- 100000
npm run worker:check
```

測試涵蓋拉霸全部 125 種排列、自由投入 Modal、即時戰鬥、技能／道具／裝備、開局選擇、舊存檔升級、資料引用、Boss 狀態規則、菁英遭遇、掉落與存檔版本衝突。GitHub Actions 會在 Push 與 Pull Request 時自動執行測試、資料驗證及短版模擬。

戰鬥基礎設定在 `src/game/config.js`；正式內容應優先修改 `src/game/data/`，不要把新單位或技能寫回 Discord 畫面或戰鬥函式。

## 專案結構

```text
src/game/data/       單位、技能、狀態、道具、事件、遭遇、掉落
src/game/engines/    共用效果、狀態、抽選、事件與掉落引擎
src/game/            拉霸、計分與目前 Boss 戰流程
src/discord/         指令、共用控制器與 Discord 訊息
src/worker.js        Cloudflare Workers HTTP Interactions 入口
src/player/          永久玩家資料格式
src/persistence/     D1／Google鏡像／記憶體存檔介面
migrations/          Cloudflare D1資料表遷移
apps-script/         Google 試算表 Web App
docs/                Cloudflare 部署操作說明
scripts/             指令註冊、模擬與資料驗證
test/                自動測試
```

## 尚未實作的遊戲內容

- 房間地圖、樓層推進與完整 RunState 流程。
- 冒險途中替換技能、管理多格背包與更換裝備。
- 戰勝後的掉落選擇與永久解鎖條件。
- 多人協力戰鬥。

這些功能所需的資料庫與共用引擎已分離，之後可以逐項加入而不必重寫 Discord 介面或拉霸計分。
