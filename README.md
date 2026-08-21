# Discord 拉霸戰鬥

以「投入行動點拉霸，產生攻擊／防禦／技能指令點」為核心的單人 Boss 戰機器人。目前保留原型的戰鬥規則，同時把資料、規則、Discord 畫面與存檔拆成獨立模組，作為後續 Roguelike 內容的基礎。

## 目前可以遊玩的內容

- `/slotbattle start`：開始戰鬥；若已有進行中的戰鬥，會直接重新顯示。
- `/slotbattle resume`：找回尚未結束的戰鬥面板。
- `/slotbattle profile`：查看永久解鎖、初始技能與道具欄位。
- `/slotbattle rules`：查看目前規則。
- 每回合 4 點行動點、最多拉霸 3 次，可投入 1／2／3 點或全部投入。
- 三格各以 30% 攻擊、30% 防禦、30% 技能、5% 幸運、5% 不幸抽選。
- 同類圖示 1／2／3 個時為 1／3／9 點，再乘上本次投入的行動點。
- 幸運將相同基礎值加入攻擊、防禦與技能；三個不幸會使玩家本回合暈眩。
- 攻擊每點 1 傷害、防禦每點抵銷 1 傷害、生命回復每點恢復 2 生命。
- 行動點與指令點都不保留到下個回合。
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

目前初始道具已寫入玩家與戰鬥資料，但「戰鬥中使用道具是否消耗行動點」尚未定案，因此 Discord 面板暫時不顯示使用按鈕。

## 安裝與啟動

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

測試期建議填入 `DISCORD_GUILD_ID`；留空會註冊為全域指令，顯示更新可能需要等待。

## 玩家存檔

未設定 Google 存檔時，機器人使用記憶體模式，重啟後戰鬥會消失。

要啟用 Google 試算表，依照 [`apps-script/README.md`](apps-script/README.md) 部署 `Code.gs`，再設定：

```env
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_SECRET=伺服器端密鑰
```

試算表會保存：

- Discord 玩家 ID 與永久解鎖資料。
- 初始技能／道具欄位與最後開局配置。
- 進行中的完整戰鬥狀態。
- `revision` 版本號，避免連點或多實例互相覆蓋。

## 部署到 Google Cloud Run

專案包含 `Dockerfile` 與 HTTP 健康檢查。這個版本使用 Discord Gateway 長連線，因此 Cloud Run 必須維持單一常駐實例，並讓 CPU 在請求之外繼續運作。可參考 [Cloud Run 的 WebSocket 說明](https://cloud.google.com/run/docs/triggering/websockets) 與 [Instance-based billing 設定](https://cloud.google.com/run/docs/configuring/billing-settings)。

建議設定：

- 最小實例：1
- 最大實例：1
- Instance-based billing／CPU 不節流
- Discord Token 與 Apps Script Secret 放在 Secret Manager
- 區域可選 `asia-east1`（台灣）

部署來源碼的基本指令：

```bash
gcloud run deploy slotbattle-bot \
  --source . \
  --region asia-east1 \
  --min 1 \
  --max 1 \
  --no-cpu-throttling
```

部署後仍需在 Cloud Run 設定必要環境變數與密鑰。服務根路徑回傳存活狀態，`/readyz` 則在 Discord 登入完成後回傳 200。

## 測試與平衡

```bash
npm test
npm run validate-data
npm run simulate
npm run simulate -- 100000
```

測試涵蓋拉霸全部 125 種排列、回合結算、資料引用、Boss 狀態規則、共用效果、菁英遭遇、掉落與存檔版本衝突。GitHub Actions 會在 Push 與 Pull Request 時自動執行測試、資料驗證及短版模擬。

戰鬥基礎設定在 `src/game/config.js`；正式內容應優先修改 `src/game/data/`，不要把新單位或技能寫回 Discord 畫面或戰鬥函式。

## 專案結構

```text
src/game/data/       單位、技能、狀態、道具、事件、遭遇、掉落
src/game/engines/    共用效果、狀態、抽選、事件與掉落引擎
src/game/            拉霸、計分與目前 Boss 戰流程
src/discord/         指令定義與 Discord 訊息畫面
src/player/          永久玩家資料格式
src/persistence/     記憶體／Apps Script 存檔介面
apps-script/         Google 試算表 Web App
scripts/             指令註冊、模擬與資料驗證
test/                自動測試
```

## 尚未實作的遊戲內容

- 房間地圖、樓層推進與完整 RunState 流程。
- 戰鬥中的技能替換、道具使用時機與裝備介面。
- 狀態每回合觸發後的 Discord 戰鬥流程整合。
- 戰勝後的掉落選擇與永久解鎖條件。
- 多人協力戰鬥。

這些功能所需的資料庫與共用引擎已分離，之後可以逐項加入而不必重寫 Discord 介面或拉霸計分。
