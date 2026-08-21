# Cloudflare Workers 免費部署步驟

這個版本透過 Discord HTTP Interactions 接收斜線指令與按鈕，因此不需要 24 小時常駐主機。Cloudflare D1 負責快速保存戰鬥與玩家資料，Google Apps Script／Google 試算表只在背景保存玩家永久資料副本。

> Bot Token、Apps Script Secret 都不要貼在聊天、程式碼、README 或 Cloudflare 一般文字變數中。

## 需要準備的資料

| 名稱 | 從哪裡取得 | 放置位置 |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | Discord Developer Portal → General Information → Public Key | Cloudflare Secret |
| `APPS_SCRIPT_URL` | Apps Script 部署後的 `/exec` 網址 | Cloudflare Secret |
| `APPS_SCRIPT_SECRET` | Apps Script 的指令碼屬性 | Cloudflare Secret |
| `DISCORD_TOKEN` | Discord Developer Portal → Bot | GitHub Actions Secret，只用於註冊指令 |
| `DISCORD_CLIENT_ID` | Discord Application ID | GitHub Actions Secret |
| `DISCORD_GUILD_ID` | Discord 測試伺服器 ID | GitHub Actions Secret |
| `DB` | Cloudflare D1 的 `slotbattle-data` | Worker D1 binding（由 `wrangler.jsonc` 設定） |

## 一、建立 D1 資料庫與資料表

1. 在 Cloudflare Dashboard 進入 **Storage & databases → D1 SQL database**。
2. 建立資料庫，名稱填入 `slotbattle-data`。
3. 將資料庫 ID 填入 `wrangler.jsonc` 的 `database_id`。
4. 進入資料庫的 **Console**，執行 `migrations/0001_initial.sql` 的完整內容。
5. 回到 Overview，確認 **Number of Tables** 顯示 `2`。

## 二、從 GitHub 建立 Worker

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 進入 **Workers & Pages**。
3. 選擇 **Create application**。
4. 在 **Import a repository** 旁選擇 **Get started**。
5. 連接 GitHub，並只授權需要的儲存庫 `ginkk07/ROBOT-slotbattle`。
6. 選擇 `ginkk07/ROBOT-slotbattle`。
7. 使用以下設定：

| Cloudflare 欄位 | 設定值 |
|---|---|
| Worker name | `slotbattle-discord-bot` |
| Production branch | `main` |
| Build command | 留空 |
| Deploy command | `npx wrangler deploy` |
| Root directory | 留空 |

8. 選擇 **Save and Deploy**。

第一次部署後如果顯示尚未設定密鑰屬於正常現象，下一節補上即可。

## 三、加入 Worker 執行密鑰

1. 打開剛建立的 `slotbattle-discord-bot`。
2. 進入 **Settings** → **Variables and Secrets**。
3. 選擇 **Add**，類型一律選擇 **Secret**。
4. 依序新增：

```text
DISCORD_PUBLIC_KEY
APPS_SCRIPT_URL
APPS_SCRIPT_SECRET
```

5. 選擇 **Deploy** 套用設定。

開啟 Cloudflare 提供的 `https://slotbattle-discord-bot.<帳號>.workers.dev/` 網址，設定完成時應看到：

```json
{
  "ok": true,
  "service": "slotbattle-discord-worker",
  "mode": "http-interactions",
  "storage": "d1",
  "profileMirror": "google-sheets"
}
```

若 `ok` 是 `false`，回傳內容只會列出缺少的變數名稱，不會顯示密鑰值。

## 四、連接 Discord Interactions Endpoint

1. 打開 [Discord Developer Portal](https://discord.com/developers/applications)。
2. 選擇拉霸戰鬥的 Application。
3. 進入 **General Information**。
4. 在 **Interactions Endpoint URL** 填入：

```text
https://slotbattle-discord-bot.<帳號>.workers.dev/interactions
```

5. 按下 **Save Changes**。

Discord 會傳送簽章驗證與 `PING`；能成功儲存即代表 Worker 端點有效。設定 HTTP Endpoint 後，Discord 不會再用原本 Gateway 連線傳送這些互動。

## 五、使用 GitHub Actions 註冊斜線指令

這一步不需要把 Bot Token 放進 Cloudflare。

1. 打開 GitHub 儲存庫的 **Settings**。
2. 進入 **Secrets and variables** → **Actions**。
3. 建立三個 Repository secrets：

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
```

4. 回到儲存庫的 **Actions**。
5. 選擇 **Register Discord Commands**。
6. 選擇 **Run workflow**，分支選擇 `main`。
7. 等待綠色勾勾。

測試伺服器內應出現：

```text
/slotbattle start
/slotbattle resume
/slotbattle profile
/slotbattle rules
```

## 六、實際驗證

建議依序測試：

1. `/slotbattle rules` 是否立即顯示規則。
2. `/slotbattle start` 是否建立戰鬥面板。
3. 點擊「投入1點」是否更新拉霸結果。
4. `/slotbattle resume` 是否能重新顯示進行中的戰鬥。
5. `/slotbattle profile` 是否能立即顯示玩家資料。
6. 查看 D1 的 `slotbattle_profiles` 與 `slotbattle_sessions` 是否新增資料。
7. 稍候查看 Google 試算表的 `slotbattle_profiles` 是否新增 Discord 玩家 ID。

## 更新方式

Cloudflare 已連接 GitHub 後，`main` 每次有新提交都會自動重新建置與部署。遊戲規則與資料更新不需要重新設定 Discord Endpoint；只有斜線指令結構變更時才需要再執行一次 **Register Discord Commands**。

## 常見問題

### Discord 顯示「應用程式沒有回應」

先打開 Worker 網址，確認 `ok` 是 `true`、`storage` 是 `d1`，再到 Cloudflare 的 **Observability / Logs** 查看錯誤。Discord 的遊戲回覆只等待 D1；Google 同步逾時只會寫入 Log，不會讓指令一直停在載入狀態。

### Discord 不接受 Endpoint URL

通常是 `DISCORD_PUBLIC_KEY` 輸入錯誤、Secret 尚未 Deploy，或網址沒有使用 HTTPS。修正後重新按 **Save Changes**。

### 機器人頭像顯示離線

HTTP Interactions 不建立 Gateway 在線狀態，因此可能顯示離線，但斜線指令與按鈕仍可正常使用。
