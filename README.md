# Discord 拉霸戰鬥 MVP

這是一個以「投入行動點拉霸，產生攻擊／防禦／技能指令點」為核心的單人 Boss 戰原型。開發目標是先驗證玩法，因此只使用 Discord 原生訊息、Emoji 與按鈕，不需要任何美術素材。

## 目前可玩的內容

- `/slotbattle start` 開始單人 Boss 戰。
- 每回合取得 4 點行動點，最多拉霸 3 次。
- 可以投入 1 點、2 點或一次投入所有剩餘行動點。
- 三格分別以 30% 攻擊、30% 防禦、30% 技能、5% 幸運、5% 不幸抽選。
- 同類圖示 1／2／3 個時，基礎指令點為 1／3／9，再乘上本次投入的行動點。
- 幸運將相同的基礎值同時加到攻擊、防禦、技能。
- 三個不幸會令玩家當回合暈眩，失去所有資源並承受 Boss 完整攻擊。
- 攻擊指令點每點造成 1 傷害。
- 防禦指令點每點抵銷 1 傷害。
- 預設攜帶技能為「生命回復」，每點技能指令點恢復 2 生命。
- 行動點與三種指令點都不保留到下一回合。
- 支援勝利、失敗、放棄與重新挑戰。

## 執行需求

- Node.js 24.17.0 以上
- Discord Application 與 Bot Token
- 測試用 Discord 伺服器

## 安裝

1. 到 [Discord Developer Portal](https://discord.com/developers/applications) 建立 Application。
2. 在 Bot 頁面建立機器人並取得 Token。Token 等同密碼，不要貼到聊天室、上傳或提交到 Git。
3. 安裝機器人到測試伺服器，至少授予「傳送訊息」與「嵌入連結」權限，並包含 `bot`、`applications.commands` scopes。
4. 將 `.env.example` 複製成 `.env`，填入：

```env
DISCORD_TOKEN=你的Bot_Token
DISCORD_CLIENT_ID=你的Application_ID
DISCORD_GUILD_ID=你的測試伺服器ID
```

5. 安裝依賴：

```bash
npm install
```

6. 註冊斜線指令：

```bash
npm run register
```

7. 啟動機器人：

```bash
npm start
```

8. 在測試伺服器輸入：

```text
/slotbattle start
```

若 `.env` 沒有填 `DISCORD_GUILD_ID`，指令會註冊為全域指令，Discord 端可能需要一段時間才會顯示；試驗期建議使用測試伺服器 ID。

## 操作方式

遊戲開始後會出現同一則持續更新的戰鬥訊息：

- `投入1點`：投入 1 點行動點抽選。
- `投入2點`：投入 2 點行動點抽選。
- `投入3點`：投入 3 點行動點抽選，適合分成 3＋3。
- `全部投入`：將當回合剩餘行動點一次投入。
- `結束抽選`：捨棄尚未使用的行動點並立即結算。
- `放棄戰鬥`：結束當前遊戲。

第三次拉霸或行動點歸零時，系統會自動結算回合。攻擊、防禦與目前攜帶的生命回復技能都會自動執行，之後進入下一回合。

## 調整平衡

主要數值集中在 [`src/game/config.js`](src/game/config.js)：

- `actionPointsPerRound`：每回合行動點。
- `maxSpinsPerRound`：每回合最多抽選次數。
- `playerMaxHp`：玩家生命上限。
- `boss.maxHp`：Boss 生命上限。
- `boss.attackPattern`：每回合循環使用的 Boss 傷害。
- `commands.attackDamagePerPoint`：每點攻擊的傷害。
- `commands.defensePerPoint`：每點防禦的減傷。
- `commands.skill.healPerPoint`：每點技能的生命回復量。

抽選機率位於 [`src/game/random.js`](src/game/random.js)，圖示資訊位於 [`src/game/symbols.js`](src/game/symbols.js)。

可以執行模擬器比較「全押」與「平均分配」：

```bash
npm run simulate
# 或指定模擬場數
npm run simulate -- 100000
```

## 測試

```bash
npm test
```

測試包含全部 125 種三格排列、1／3／9 組合值、幸運、不幸暈眩、投入倍率、每回合資源清空、生命回復與勝敗結算。

## 目前限制

- 遊戲狀態只保存在記憶體中，機器人重新啟動後進行中的戰鬥會失效。
- 目前只有單人 Boss 戰。
- 目前攻擊、防禦與技能會自動結算，尚未加入指令牌選擇。
- 目前只有一個技能欄位，預設為生命回復；之後可在不更動拉霸計算的情況下加入技能替換與攜帶設定。
- 數值屬於試驗版，應依實際遊玩紀錄持續調整。

## 專案結構

```text
src/game/       與 Discord 無關的抽選、計分與戰鬥核心
src/discord/    斜線指令與 Discord 訊息介面
src/bot.js      機器人進入點
scripts/        指令註冊與大量模擬
test/           遊戲核心測試
```
