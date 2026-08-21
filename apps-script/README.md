# Google 試算表存檔設定

Cloudflare 正式版使用 D1 即時讀寫；這個 Apps Script 只負責把玩家永久資料背景同步到 Google 試算表。舊版與本機 Gateway 所需的戰鬥存檔函式仍保留。Discord Bot Token 不應放進 Apps Script，也不要放進試算表。

## 1. 建立試算表與 Apps Script

1. 建立一份新的 Google 試算表。
2. 選擇「擴充功能 → Apps Script」。
3. 將 [`Code.gs`](Code.gs) 的內容完整貼入。
4. 在 Apps Script「專案設定 → 指令碼屬性」新增：
   - `API_SECRET`：自行產生的長隨機字串。
   - `SPREADSHEET_ID`：試算表網址 `/d/` 與 `/edit` 之間的字串。綁定試算表的專案也建議明確填寫。
5. 在編輯器中執行一次 `setupSheets()`，授權後會建立：
   - `slotbattle_sessions`
   - `slotbattle_profiles`

## 2. 部署 Web App

1. 選擇「部署 → 新增部署作業 → 網頁應用程式」。
2. 執行身分選擇「我」。
3. 存取權選擇允許機器人伺服器呼叫的公開選項。
4. 複製以 `/exec` 結尾的部署網址。

機器人的環境變數設定為：

```env
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_SECRET=與API_SECRET完全相同的字串
```

只要其中一個環境變數缺少，Worker 健康檢查會列出缺少項目，避免誤以為資料已經寫入 Google。

## 安全注意事項

- `API_SECRET`、`APPS_SCRIPT_SECRET`、Discord Bot Token 都不可提交到 Git。
- 不要沿用前端網頁中的公開雜湊鹽；Discord 機器人是伺服器程式，可以安全地把密鑰放在環境變數。
- D1 的 `revision` 會一起傳入；Apps Script 只接受較新的玩家版本，並使用 `LockService` 避免背景請求互相覆蓋。
- 修改 `Code.gs` 後，必須建立新部署版本，既有 `/exec` 網址才會執行新版。
