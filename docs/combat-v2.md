# 戰鬥與內容架構 v2

## 資料責任

| 資料 | 唯一來源 | 說明 |
|---|---|---|
| 單位、技能、狀態、道具、事件、遭遇、掉落 | `src/game/data/` | 隨程式版本部署，不寫入玩家資料庫 |
| 進行中戰鬥 | D1 `slotbattle_sessions` | 保存完整戰鬥狀態 JSON 與 revision |
| 玩家開局配置 | D1 `slotbattle_profiles` | 保存已解鎖內容與各 1 個開局技能／道具 |
| 玩家永久資料副本 | Google 試算表 `slotbattle_profiles` | Apps Script 在背景接收 D1 最新 revision |

D1 不需要為技能、道具或狀態各建立一張表。這些內容是版本化定義；戰鬥與玩家資料只保存其 ID，執行時再從內容庫取得完整定義。

## Discord 互動

1. `/slotbattle profile` 顯示兩個單選選單，選擇後立即寫入 D1，並在背景同步 Google 試算表。
2. `/slotbattle start` 讀取玩家配置，建立 `GameState v2`。
3. 「投入點數」開啟 Discord Modal，接受 `1` 到目前剩餘行動點的整數。
4. Modal 送出後，拉霸結果立即套用攻擊、護甲與法力，並更新同一則戰鬥訊息。
5. 技能與消耗品按鈕共用 effects 引擎；裝備在建立戰鬥時自動套用 `battleStartEffects`。
6. 「回合結束」才觸發狀態、Boss 攻擊、資源清空與下一回合。

## 戰鬥狀態

`GameState` 的主要欄位：

- `schemaVersion`：目前為 `2`，讀取舊戰鬥時自動升級。
- `player`／`boss`：目前 HP、抗性、技能 ID、狀態；玩家另有背包與裝備。
- `resources.action`：本回合剩餘可投入點數。
- `resources.armor`：本回合抵擋 Boss 攻擊的護甲。
- `resources.mana`：本回合可使用攜帶技能的法力。
- `lastSpin`／`lastImpact`／`lastAction`：Discord 畫面顯示最近操作。
- `lastResolution`：前一回合的 Boss 攻擊、抵擋、傷害與狀態結果。

## 開局內容

目前每位玩家各攜帶 1 個技能與 1 個道具：

| 類型 | 內容 |
|---|---|
| 技能 | 治癒、強擊、火焰附加 |
| 消耗品 | 生命藥水、火焰炸彈 |
| 裝備 | 燃焰之劍 |

消耗品目前的 `actionCost` 均為 `0`，所以使用時不消耗行動點；成本已是道具資料欄位，未來可逐項調整，不需要改 Discord 互動格式。

燃焰之劍只在戰鬥開始時觸發一次：獲得 1 層「攻擊力＋1」狀態，持續 3 回合。`attack-up` 使用可疊加狀態規則，因此未來其他技能或道具也能增加層數；燃焰之劍本身不會在每回合重複疊加。
