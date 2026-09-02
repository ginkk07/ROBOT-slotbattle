# Discord 拉霸戰鬥

以「自由投入行動點拉霸、即時結算攻防、累積技能與裝備」為核心的單人 Roguelike Discord 遊戲。玩家會在同一輪冒險中依序遭遇普通怪、菁英怪、Boss 或奇遇；擊敗 Boss 後前往更強的下一個地區，直到戰敗或主動放棄才結束遊戲。

正式部署使用 **Discord HTTP Interactions + Cloudflare Workers 免費版**。Cloudflare D1 負責即時遊戲與玩家永久資料，Google Apps Script／試算表在背景保存玩家資料副本；Google 同步不會阻塞 Discord 操作。

## Discord 指令與戰鬥

- `/slotbattle start`：開始新遊戲；若已有進行中的遊戲，會直接重新顯示。
- `/slotbattle resume`：找回尚未結束的遊戲面板。
- `/slotbattle profile`：各選 1 個下一場新遊戲使用的開局技能與道具。
- `/slotbattle rules`：查看玩家操作說明。
- 每回合取得行動點；按下「投入點數」後可輸入任意剩餘點數，一次投入或拆成多次拉霸。
- 三格各以 30% 攻擊、30% 防禦、30% 技能、5% 幸運、5% 不幸抽選。
- 同類圖示 1／2／3 個時為 1／3／9 點，再乘上本次投入的行動點。
- 攻擊立即造成傷害、防禦轉成本回合護甲、技能轉為法力；幸運會同時取得三種效果。
- 三個不幸會使玩家本回合暈眩，只能手動結束回合；進入暈眩不會清空既有行動點、護甲或法力。
- 玩家可在多次拉霸之間使用技能或消耗品；取得的裝備可同時持有，並在各自觸發時機自動生效。
- 戰鬥面板以按鈕列出技能與消耗品，裝備集中在一個選單；點擊後會開啟私人詳情卡。內容可用時才顯示「使用」，否則只顯示「關閉」。
- 回合資源使用 `❇️`、`🛡️`、`✨` 與數值表示，不重複顯示欄位名稱。
- 玩家按下「回合結束」後敵人才會執行已預告的行動；回合資源預設不保留，指定裝備可按資料規則保留部分資源。

玩家版 `/slotbattle rules` 維持精簡操作說明；完整數值與流程記錄在 [`docs/combat-v2.md`](docs/combat-v2.md)，新增或調整內容時請依照 [`docs/content-management.md`](docs/content-management.md)。

## 冒險流程

每次抽取下一個節點時依下列順序判定：

1. **Boss**：同一地區前 4 次完成的遭遇不會遇到 Boss，但機率仍會每次累積 7 個百分點，因此第 5 次遭遇的 Boss 機率是 28%。
2. **奇遇**：Boss 判定失敗後，以 20% 機率發生；整場遊戲的第一次遭遇不會是奇遇。奇遇也會增加一次地區進度。
3. **菁英怪**：Boss 與奇遇都未發生時，基礎機率為 12%；此機率保存在地區資料，可由未來內容調整。
4. **普通怪**：其餘情況進入普通戰鬥。

擊敗 Boss 時玩家 HP 會立即回滿，選完獎勵後前往下一地區。本次冒險的地區深度每增加 1，敵人的基礎生命與基礎傷害線性增加 20%；怪物技能數量、技能倍率、施放機率與其他規則不變。

怪物會先判定普通攻擊或技能，再從持有技能中等機率選擇一個：

| 怪物階級 | 普通攻擊 | 使用技能 | 持有技能數 |
|---|---:|---:|---:|
| 普通 | 60% | 40% | 1 |
| 菁英 | 40% | 60% | 2 |
| Boss | 20% | 80% | 3 |

被動怪物技能不列入上述回合技能數，也不會被抽選成行動。強化遺跡哨兵與遺跡守衛都會以「護甲強化」狀態進入戰鬥，使受到的傷害降低 20%，Discord 敵人狀態列只顯示技能狀態名稱。怪物不再具有毒抗性或火焰抗性。

## 獎勵與稀有度

戰鬥勝利後會產生最多 3 個獎勵選項，玩家選擇其中 1 個。每個選項會**各自獨立**抽取內容稀有度，再從該稀有度的玩家技能與道具中抽取內容。

| 擊敗單位 | 普通 | 稀有 | 傳說 |
|---|---:|---:|---:|
| 普通怪 | 70% | 25% | 5% |
| 菁英怪 | 30% | 60% | 10% |
| Boss | 0% | 0% | 100% |

下列機率是彼此獨立的資料與抽選流程，不會混用：

- 怪物階級：決定遇到普通怪、菁英怪或 Boss。
- 戰鬥獎勵稀有度：決定每一個三選一候選內容的稀有度，可由未來技能或道具調整權重。
- 奇遇稀有度：固定為普通 50%、稀有 30%、傳說 20%，不受玩家技能、裝備或戰鬥獎勵加成影響。

同一批候選不會重複。已裝備的物品、目前持有的消耗品與滿級技能會被排除；持有但未滿級的技能可以再次出現，選取後提升 1 級。技能已滿 3 個時不再產生新技能，但仍可抽到未滿級技能。若合格內容不足 3 個，就只顯示實際可產生的數量。

## 目前玩家技能與道具

玩家最多持有 3 個技能，技能等級上限為 3；沒有升級數值的技能可以只定義 1 級。重複取得持有且未滿級的技能會升級；滿級技能不再進入獎勵池。
開局時可從普通裝備「劍、幸運草、手裡劍」中選擇 1 件；生命藥水與火焰炸彈仍可在冒險途中取得。

| 類型 | 稀有度 | 名稱 | 成本 | Lv.1／Lv.2／Lv.3 效果 |
|---|---|---|---|---|
| 技能 | 普通 | 治癒 | 3 法力 | 回復 5／10／15 點生命。 |
| 技能 | 普通 | 強擊 | 2 法力 | 取得強擊狀態；下次拉霸造成攻擊傷害時變為 2／3／4 倍，造成傷害後消耗。 |
| 技能 | 稀有 | 火焰附加 | 2 法力 | 拉霸造成攻擊傷害時額外造成 1／2／3 點傷害，持續 3 回合。 |
| 技能 | 稀有 | 魔力護甲 | 被動技能 | 受到傷害時，每消耗 1 點法力抵擋 1／2／3 點傷害。 |
| 技能 | 傳說 | 火焰衝擊 | 3 法力 | 立即造成 5 點額外傷害，60% 機率附加 5／10／15 層燃燒。 |
| 技能 | 普通 | 盾牌格檔 | 1 法力 | 立即獲得 2／4／6 點護甲。 |
| 技能 | 稀有 | 烈火罩 | 2 法力 | 立即獲得 2／4／6 點護甲；敵人完成攻擊後賦予 1／2／3 層燃燒，即使傷害完全被擋住仍會觸發。 |
| 技能 | 稀有 | 盾牌投擲 | 1 法力 | 下次拉霸出現🛡️時，依該次取得的護甲值＋3／6／9造成額外傷害。 |
| 技能 | 傳說 | 盾牌猛擊 | 2 法力 | 依目前護甲的 1／2／3 倍造成額外傷害，之後失去一半護甲。 |
| 技能 | 傳說 | 聖盾術 | 5／4／3 法力 | 持續 3 回合；🛡️機率＋25 個百分點、⚔️機率－25 個百分點。 |
| 裝備 | 普通 | 劍 | 自動生效 | 戰鬥開始時獲得攻擊力＋1，持續 3 回合。 |
| 裝備 | 普通 | 幸運草 | 自動生效 | 🍀牌面機率提升為 10%。 |
| 裝備 | 普通 | 可頌麵包 | 自動生效 | 回合開始時回復 1 點生命。 |
| 裝備 | 普通 | 紅鬼面具 | 自動生效 | 菁英遭遇率最低提升為 20%。 |
| 裝備 | 普通 | 鐵盾 | 自動生效 | 回合開始時獲得 5 點護甲。 |
| 裝備 | 普通 | 荊棘 | 自動生效 | 戰鬥開始時獲得 5 層傷害反射；實際受到 HP 傷害時反射 5 點。 |
| 裝備 | 普通 | 魔石 | 自動生效 | 回合開始時獲得 1 點法力。 |
| 裝備 | 普通 | 手裡劍 | 自動生效 | 每次拉霸使本回合手裡劍額外傷害＋1，回合結束清零。 |
| 裝備 | 普通 | 賭徒左手 | 自動生效 | 全額投入目前行動點上限時，本次拉霸傷害 ×2。 |
| 裝備 | 普通 | 再生藥草 | 自動生效 | 戰鬥結束時回復 6 點生命。 |
| 裝備 | 普通 | 火種袋 | 自動生效 | 戰鬥開始時使敵人獲得 3 層燃燒。 |
| 裝備 | 普通 | 黑貓尾巴 | 自動生效 | 每次拉霸出現💀時 HP 上限＋2；每次最多觸發一次。 |
| 裝備 | 普通 | 保險契約 | 自動生效 | 玩家回合結束時，護甲低於 6 點則補充至 6 點。 |
| 裝備 | 普通 | 元素瓶 | 自動生效 | 原本會造成額外傷害時，該筆額外傷害＋1。 |
| 裝備 | 普通 | 血蛭 | 自動生效 | 每回合第一次造成拉霸傷害時回復 3 點生命。 |
| 裝備 | 普通 | 巫毒人偶 | 自動生效 | 拉霸傷害全部結算後，每張💀使敵我雙方各獲得 1 層詛咒。 |
| 裝備 | 普通 | 佛珠 | 自動生效 | 受到的詛咒傷害減少 3 點。 |
| 裝備 | 普通 | 電擊裝置 | 自動生效 | 每場戰鬥一次，進入暈眩狀態時自動解除。 |
| 裝備 | 普通 | 急救包 | 自動生效 | 治療效果提升 40%，小數四捨五入。 |
| 裝備 | 稀有 | 符文魔方 | 自動生效 | 拉霸出現🛡️時，每次拉霸額外獲得 4 點護甲。 |
| 裝備 | 稀有 | 幸運幣 | 自動生效 | 投入 5 點時有 77% 機率補充 1 點行動點。 |
| 裝備 | 稀有 | 星星法杖 | 自動生效 | 拉霸出現✨時，每次拉霸額外造成 4 點傷害。 |
| 裝備 | 稀有 | 懸賞令 | 自動生效 | 菁英或 Boss 戰第 1 回合獲得 20 點護甲、攻擊力＋3。 |
| 裝備 | 稀有 | 頌缽 | 自動生效 | 實際回復生命時，法力＋1。 |
| 裝備 | 稀有 | 平安符 | 自動生效 | 護甲抵擋後的傷害小於 5 時，將傷害降為 1。 |
| 裝備 | 稀有 | 幸運蘿蔔 | 自動生效 | 每張🍀提升已出現的⚔️／🛡️／✨獎勵階級。 |
| 裝備 | 稀有 | 詛咒蛇麟 | 自動生效 | 敵人行動結束後保留剩餘法力，但無法獲得護甲。 |
| 裝備 | 稀有 | 惡魔之血 | 自動生效 | 每次至少出現 1 張💀；💀同時具有🍀收益，但 3 張💀仍會暈眩。 |
| 裝備 | 傳說 | VIP會員 | 自動生效 | 每回合行動點上限＋1。 |
| 裝備 | 傳說 | 星海羅盤 | 自動生效 | 回合結束時依剩餘法力造成等量額外傷害。 |
| 裝備 | 傳說 | 燃焰之劍 | 自動生效 | 拉霸造成傷害後使燃燒＋1，再造成等同目前燃燒層數的額外傷害。 |
| 裝備 | 傳說 | 夏賜儀碇 | 自動生效 | 如果本回合沒有造成傷害，本場戰鬥❇️上限＋1，最多＋5；造成傷害時清除累積。 |
| 裝備 | 傳說 | 金剛石 | 自動生效 | 回合開始時保留上一回合一半的剩餘護甲。 |
| 消耗品 | 普通 | 生命藥水 | 0 行動點 | 回復 10 點生命。 |
| 消耗品 | 普通 | 磨刀石 | 0 行動點 | 下一次拉霸的⚔️牌面機率提升為 50%，之後失效。 |
| 消耗品 | 普通 | 堅硬藥劑 | 0 行動點 | 立即獲得 15 點護甲。 |
| 消耗品 | 普通 | 魔菇 | 0 行動點 | 立即獲得 5 點法力。 |
| 消耗品 | 稀有 | 火焰炸彈 | 0 行動點 | 造成 8 點額外傷害，並附加 3 層燃燒狀態。 |

法力與行動點成本是獨立欄位，不寫入效果文字。消耗品目前使用後會扣除 1 個物品，但不消耗行動點；`actionCost` 欄位已保留，未來可逐項調整。所有取得的裝備會同時生效，不使用裝備部位互相替換。

護甲流的內部結算規則：盾牌投擲使用該次拉霸最終實際取得的護甲，包含符文魔方一次追加的 4 點，再加上技能等級提供的 3／6／9 點基礎傷害；造成額外傷害後仍保留護甲。盾牌猛擊先依施放前護甲計算額外傷害，再留下向下取整的一半護甲。烈火罩在敵人完成下一次普通攻擊或怪物技能攻擊後附加燃燒並消失，即使攻擊被護甲完全抵擋也會觸發。聖盾術實際增加 25 個百分點的🛡️機率並降低 25 個百分點的⚔️機率。荊棘只在玩家實際受到 HP 傷害時反射 5 點；金剛石只保留敵人攻擊結算後的剩餘護甲，奇數向下取整。

## 如何新增技能（模組化）

玩家與怪物都只保存一份 `skillIds`。主動或被動由技能資料的 `activation` 決定，主戰鬥流程不會依技能 ID 寫個別判定；兩者的內容庫分開，避免玩家等級與怪物行動規則互相污染。

### 先判斷要修改哪個模組

| 新技能需求 | 要修改的位置 | 不需要修改 |
|---|---|---|
| 使用既有的治療、傷害、套用／移除狀態 | `src/game/data/skills.js` | `engine.js`、`effects.js` |
| 套用一個新的狀態，但使用既有狀態機制 | `skills.js`、`statuses.js` | `engine.js` |
| 使用既有被動效果類型 | `skills.js` | `engine.js`、`passive-skill-engine.js` |
| 全新的主動效果機制 | `skills.js`，並在 `engines/effects.js` 登記一個處理器 | `engine.js` |
| 全新的被動觸發／效果機制 | `skills.js`、`data/skill-effects.js`，並在 `engines/passive-skill-engine.js` 登記一個處理器 | `engine.js` |

### 1. 在 `skills.js` 建立技能

每個技能的最外層只放身分、稀有度、使用方式、掉落資料與各等級共用的主動技能成本。說明及效果只放在 `levels`，Lv.1 不可在最外層再複製一次。若成本會隨等級改變，改在每個 `levels[]` 設定 `cost`；介面、可用性與實際扣除都會讀取目前等級。

```js
{
  id: 'example-heal',
  name: '範例治療',
  emoji: '💚',
  rarity: ContentRarity.COMMON,
  activation: SkillActivation.ACTIVE,
  lootEligible: true,
  lootWeight: 100,
  lootTags: ['ruins'],
  cost: 3,
  levels: [
    {
      description: '回復 4 點生命。',
      effects: [{ type: 'heal', amount: 4, target: 'self' }],
    },
    {
      description: '回復 8 點生命。',
      effects: [{ type: 'heal', amount: 8, target: 'self' }],
    },
    {
      description: '回復 12 點生命。',
      effects: [{ type: 'heal', amount: 12, target: 'self' }],
    },
  ],
}
```

現有主動效果可直接組合：

- `heal`：治療；設定 `amount`、`target`。
- `damage`：傷害；設定 `amount`、`element`、`target`。
- `gain-resource`：立即取得行動點、護甲或法力；設定 `resource`、`amount`、`target`。
- `damage-from-resource`：依目前資源造成傷害並按比例消耗資源；設定 `resource`、`multiplier`、`consumeRatio`、`element`、`target`。
- `apply-status`：套用狀態；設定 `statusId`、`target`，並視需要設定 `chance`、`duration`、`stacks`、`potency`。
- `remove-status`：移除指定狀態；設定 `statusId`、`target`。

這些效果由 `engines/effects.js` 的共用處理器執行，技能啟用流程只負責檢查持有、等級、法力與可用性。

傷害事件以 `DamageSource` 固定分成 `spin`（拉霸）、`extra`（額外）、`curse`（詛咒）、`reflect`（反射）。技能、道具、裝備與持續狀態造成的直接傷害都屬於 `extra`；詛咒與反射不會互相觸發，也不會再次觸發自身。

### 2. 技能需要新狀態時

先在 `src/game/data/statuses.js` 建立狀態，再由技能等級的 `apply-status` 引用。狀態行為由 `trigger`、`durationMode`、`stacking` 與 `effect` 決定，不可在 `engine.js` 搜尋特定 `statusId`。

例如強擊使用：

```js
{
  trigger: StatusTrigger.NEXT_SPIN_ATTACK,
  durationMode: 'until-consumed',
  effect: {
    type: StatusEffectType.MULTIPLY_SPIN_DAMAGE,
    amountPerPotency: 1,
  },
}
```

任何技能只要套用同一種觸發／效果機制，都會自動由 `status-engine.js` 結算。若狀態需要全新的結算方式，才在該模組新增共用處理器，仍不可依技能 ID 判斷。

### 3. 新增被動技能

被動技能不設定 `cost`，每個等級改放 `passiveEffects`，而且每個效果都必須同時指定 `trigger` 與 `type`：

```js
{
  id: 'example-mana-guard',
  name: '範例魔力防護',
  emoji: '✨',
  rarity: ContentRarity.RARE,
  activation: SkillActivation.PASSIVE,
  lootEligible: true,
  lootWeight: 100,
  lootTags: ['ruins'],
  levels: [1, 2, 3].map((damagePerMana) => ({
    description: `每點✨抵擋 ${damagePerMana} 點傷害。`,
    passiveEffects: [{
      trigger: PassiveSkillTrigger.BEFORE_DAMAGE_TAKEN,
      type: PassiveSkillEffectType.MANA_ARMOR,
      damagePerMana,
    }],
  })),
}
```

如果是全新的被動機制：

1. 在 `src/game/data/skill-effects.js` 新增 `PassiveSkillTrigger`（需要新時機時）與 `PassiveSkillEffectType`。
2. 在 `src/game/engines/passive-skill-engine.js` 實作處理器，登記到 `PASSIVE_SKILL_EFFECT_HANDLERS`。
3. 處理器只接收同類效果與戰鬥 `context`，回傳更新後的 `context` 及事件；不要直接修改原始玩家或戰鬥狀態。
4. 在技能的三個 `levels` 引用該 `trigger` 與 `type`。
5. 在 `src/game/data/validate.js` 補上新欄位的數值驗證，並新增處理器與整場戰鬥測試。

主流程固定只呼叫 `resolvePassiveSkillEffects()`；新增被動技能時不得在 `engine.js` 加入技能名稱或技能 ID 分支。

### 4. 解鎖、掉落與固定檢查

- `lootEligible: true` 的技能會依 `rarity`、`lootWeight`、`lootTags` 進入符合條件的戰鬥獎勵池。
- 要成為預設開局技能，將 ID 加入 `src/game/data/player-progression.js`。
- 要由成就解鎖，將 ID 寫入 `src/game/data/achievements.js`。
- 技能 ID 一旦進入存檔就不可直接改名；真的要改時必須新增存檔升級規則。

修改後至少確認資料驗證、技能三個等級、主動／被動執行、獎勵升級與 Discord 詳情卡。完整指令如下：

```bash
npm test
npm run validate-data
npm run simulate -- 100
npm run worker:check
```

### 5. 新增怪物技能

怪物技能放在 `src/game/data/monster-skills.js`，不要加入玩家的 `skills.js`。主動技能以 `power` 設定本次攻擊相對於怪物基礎傷害的倍率，額外狀態仍使用共用 `effects`：

```js
{
  id: 'example-monster-strike',
  name: '範例重擊',
  activation: MonsterSkillActivation.ACTIVE,
  power: 1.5,
  effects: [{
    type: 'apply-status',
    statusId: 'stunned',
    target: 'enemy',
    chance: 0.25,
  }],
}
```

怪物被動技能同樣放在 `monster-skills.js`，但使用 `MonsterSkillActivation.PASSIVE`。現有被動模式是在戰鬥建立時套用共用效果，例如「護甲強化」套用一個戰鬥常駐狀態；它不會被抽成回合行動。

建立後只要把技能 ID 加到 `src/game/data/units.js` 對應怪物的 `skillIds`：

- 不可另建 `passiveSkillIds` 或在 Boss 流程複製同一效果。
- `adventure-engine.js` 會在建立敵人時執行其中的被動技能。
- `monster-action-engine.js` 只會從其中的主動技能抽選。
- `monster-actions.js` 的階級技能數只計算主動技能；普通／菁英／Boss 目前分別必須持有 1／2／3 個主動技能。
- 若使用既有共用效果，不需修改任何引擎；全新立即效果只在 `engines/effects.js` 的註冊表實作一次。

## 遊戲結束與永久資料

戰敗或玩家按下「放棄遊戲」都會立即結束整場冒險。本輪取得的技能、道具、裝備、地區進度與戰鬥狀態不保留，但會先產生結算快照並結算永久成就。

結算畫面會顯示：

- 被哪個單位擊敗，或玩家主動放棄。
- 本輪擊敗的單位總數。
- 最後的裝備配置。
- 最後的技能配置。
- 本次新達成的成就與新解鎖的開局內容。

成就引擎已支援依單輪或永久統計解鎖開局技能與道具，且同一場遊戲不會重複結算；正式成就名稱與條件尚待設計，目前成就內容庫保持空白。

## 遊戲內容架構

| 資料 | 位置 | 內容 |
|---|---|---|
| 單位庫 | `src/game/data/units.js` | 玩家、普通怪、菁英怪、Boss、階級與基礎能力 |
| 玩家技能庫 | `src/game/data/skills.js` | 法力成本、Lv.1～3、稀有度、效果與掉落條件 |
| 怪物技能庫 | `src/game/data/monster-skills.js` | 怪物技能倍率與額外效果，與玩家技能完全分離 |
| 怪物行動規則 | `src/game/data/monster-actions.js` | 各階級普通攻擊率、技能率與技能數 |
| 技能效果規格 | `src/game/data/skill-effects.js` | 主動／被動分類、被動觸發時機與效果類型 |
| 狀態庫 | `src/game/data/statuses.js` | 狀態觸發、效果、持續時間、疊加及抗性規則 |
| 道具庫 | `src/game/data/items.js` | 消耗品、裝備、稀有度與共用效果 |
| 道具效果規格 | `src/game/data/item-effects.js` | 裝備觸發時機與可重用效果類型 |
| 內容分類 ICON | `src/game/data/content-types.js` | 技能、裝備、消耗品三種介面圖示 |
| 地區／遭遇 | `src/game/data/regions.js`、`encounters.js` | Boss、奇遇、菁英與普通怪的判定參數 |
| 奇遇庫 | `src/game/data/events.js` | 固定稀有度系統與事件結果 |
| 奇遇規則 | `src/game/data/event-rules.js` | 獨立的奇遇稀有度權重 |
| 掉落表 | `src/game/data/loot-tables.js` | 各怪物階級的三選一獨立稀有度權重 |
| 成就庫 | `src/game/data/achievements.js` | 永久成就條件與開局內容解鎖 |
| 玩家進度規則 | `src/game/data/player-progression.js` | 預設解鎖、開局欄位、技能持有與等級上限 |

內容定義皆為版本化唯讀資料，不寫入 D1。奇遇率為20%，首次遭遇不會出現；奇遇稀有度獨立採普通60／稀有30／傳說10，不受戰鬥獎勵稀有度修正影響。神秘泉水、密封石室與遠古回響目前啟用；廢棄營地與神秘收藏家已完成資料與結算流程，但維持停用。玩家只會看到奇遇內文，不會看到內部事件名稱。

## 免費部署到 Cloudflare Workers

完整欄位與驗證順序請依照 [`docs/cloudflare-workers.md`](docs/cloudflare-workers.md)。

部署後的資料流：

```text
Discord 指令／按鈕
    → Cloudflare Worker（驗證簽章與執行遊戲）
    → Cloudflare D1（即時讀寫）
    → Cloudflare Worker 直接回傳 Discord 互動結果
    → Google Apps Script／試算表（背景同步玩家永久資料）
```

Worker 需要 D1 binding `DB`，以及三個 Cloudflare Secrets：

```text
DISCORD_PUBLIC_KEY
APPS_SCRIPT_URL
APPS_SCRIPT_SECRET
```

Bot Token 不放在 Worker；它只用於註冊斜線指令。專案提供手動執行的 GitHub Actions 工作流程 `Register Discord Commands`。

## 玩家存檔

Cloudflare 正式版沿用既有兩張 D1 資料表，不需要新增 migration：

- `slotbattle_sessions`：保存整輪冒險狀態 JSON 與 revision。
- `slotbattle_profiles`：保存永久解鎖、開局配置、成就與累計統計。

資料表定義在 `migrations/0001_initial.sql`。Apps Script 只在背景把 D1 玩家資料同步到 Google 試算表，較舊的 revision 不會覆蓋新版資料。

## 測試與平衡

```bash
npm test
npm run validate-data
npm run simulate
npm run simulate -- 1000
npm run worker:check
```

模擬器使用固定種子，讓相同版本的結果可以重現；預設每局最多 100 回合。深入平衡測試可自行指定，例如 `SLOT_SIM_SEED=123 SLOT_SIM_MAX_TURNS=500 npm run simulate -- 1000`。CI 只執行 100 局快速模擬，避免極少數高治療長局占滿檢查時間。

測試涵蓋拉霸全部 125 種排列、自由投入 Modal、技能／道具私人詳情卡、十種玩家技能及其有效等級、即時戰鬥、怪物行動、奇遇與 Boss 判定順序、獨立稀有度、區域成長、玩家／怪物技能分離、遊戲結算、成就冪等性、舊存檔升級與 D1 版本衝突。GitHub Actions 會在 Push 與 Pull Request 時自動執行測試、資料驗證、模擬及 Worker 打包。

## 尚待設計的內容

- 稀有與傳說奇遇的正式選項與實際效果。
- 正式成就名稱、條件及對應的開局技能／道具解鎖。
- 更多地區、怪物、玩家技能與道具，避免長局中獎勵內容重複。
- 冒險途中更換裝備、管理多格背包與技能配置的介面。
- 多人協力戰鬥。
