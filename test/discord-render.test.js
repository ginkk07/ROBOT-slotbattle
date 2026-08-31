import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../src/discord/commands.js';
import {
  renderGame,
  renderProfile,
  renderRules,
  renderWagerModal,
} from '../src/discord/render.js';
import { renderContentDetail } from '../src/discord/content-detail.js';
import {
  activateSkill,
  abandonGame,
  confirmCombatVictory,
  createGame,
  GamePhase,
  placeBet,
  useItem,
} from '../src/game/engine.js';
import { getEvent } from '../src/game/data/events.js';
import { SymbolId } from '../src/game/symbols.js';
import { createDefaultProfile } from '../src/player/profile.js';

test('斜線指令包含開始、繼續、開局配置與玩法', () => {
  assert.equal(commands[0].name, 'slotbattle');
  assert.deepEqual(
    commands[0].options.map((option) => option.name),
    ['start', 'resume', 'profile', 'rules'],
  );
  assert.match(commands[0].options[2].description, /選擇/);
});

test('玩家資料頁可各選一個開局技能與道具', () => {
  const payload = renderProfile({
    profile: createDefaultProfile('player-1'),
    revision: 3,
  });
  const embed = payload.embeds[0];

  assert.equal(embed.title, '🧭 開局配置');
  assert.match(embed.fields[0].value, /治癒/);
  assert.match(embed.fields[1].value, /劍/);
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[0].components[0].type, 3);
  assert.equal(payload.components[0].components[0].options.length, 3);
  assert.equal(payload.components[1].components[0].options.length, 3);
  assert.equal(payload.components[0].components[0].max_values, 1);
  assert.equal(payload.components[1].components[0].max_values, 1);
  assert.deepEqual(
    payload.components[0].components[0].options.map((option) => option.emoji.name),
    ['⚡', '⚡', '⚡'],
  );
  assert.deepEqual(
    payload.components[1].components[0].options.map((option) => option.emoji.name),
    ['📦', '📦', '📦'],
  );
  assert.deepEqual(
    payload.components[1].components[0].options.map((option) => option.label),
    ['劍', '幸運草', '手裡劍'],
  );
});

test('戰鬥面板使用自由投入、技能、道具與回合結束按鈕', () => {
  const state = createGame({
    id: 'render-test',
    ownerId: 'player-1',
    loadout: {
      skillIds: ['power-strike'],
      itemIds: ['fire-bomb'],
    },
  });
  const payload = renderGame(state);
  const labels = payload.components
    .flatMap((row) => row.components.map((component) => component.label));

  assert.deepEqual(labels, [
    '投入點數（剩餘 4）',
    '強擊 Lv.1',
    '火焰炸彈 ×1',
    '回合結束',
    '放棄遊戲',
  ]);
  assert.equal(
    payload.components[0].components[1].custom_id,
    'slotbattle:render-test:detail-skill:power-strike',
  );
  assert.equal(
    payload.components[0].components[2].custom_id,
    'slotbattle:render-test:detail-item:fire-bomb',
  );
  assert.match(payload.embeds[0].description, /行動預告：/);
  assert.doesNotMatch(
    JSON.stringify(payload.embeds[0]),
    /冒險進度|總擊敗|目前配置|可繼續投入|回合結束時清空/,
  );
  assert.doesNotMatch(labels.join('、'), /投入1點|投入2點|投入3點|全部投入/);
});

test('裝備在面板顯示為已穿戴而不是使用按鈕', () => {
  const state = createGame({
    id: 'equipment-render-test',
    ownerId: 'player-1',
    loadout: {
      skillIds: ['life-recovery'],
      itemIds: ['sword'],
    },
  });
  const payload = renderGame(state);
  const player = payload.embeds[0].fields.find((field) => field.name.startsWith('👤'));
  const equipmentSelect = payload.components
    .flatMap((row) => row.components)
    .find((component) => component.custom_id === (
      'slotbattle:equipment-render-test:detail-equipment'
    ));

  assert.match(player.value, /玩家狀態[\s\S]*攻擊力＋1（3回合）/);
  assert.deepEqual(
    equipmentSelect.options.map((option) => [option.label, option.emoji.name]),
    [['劍', '📦']],
  );
});

test('回合資源只使用符號與數值顯示', () => {
  const payload = renderGame(createGame({
    id: 'resource-render-test',
    ownerId: 'player-1',
  }));
  const player = payload.embeds[0].fields.find((field) => field.name.startsWith('👤'));

  assert.match(player.value, /❇️ \*\*4\*\*　🛡️ \*\*0\*\*　✨ \*\*0\*\*/);
  assert.doesNotMatch(player.value, /本回合資源|行動點|護甲：|法力：/);
});

test('拉霸結果只顯示實際傷害、護甲與法力', () => {
  let state = createGame({
    id: 'simple-spin-result',
    ownerId: 'player-1',
    // 此案例只驗證顯示格式，固定使用沒有減傷狀態的普通怪避免隨機遭遇干擾。
    config: { initialEnemyUnitId: 'ruins-sentinel' },
  });
  state.player.activeStatuses.push({
    statusId: 'power-strike-ready',
    sourceUnitId: null,
    remainingTurns: null,
    stacks: 1,
    potency: 3,
  });
  state = placeBet(state, 1, {
    reels: [SymbolId.ATTACK, SymbolId.DEFENSE, SymbolId.SKILL],
  });
  const spin = renderGame(state).embeds[0].fields.find((field) => field.name === '\u200b');

  assert.match(spin.value, /╔═══════════╗/);
  assert.match(spin.value, /拉霸結果：造成 3 傷害／護甲 \+1／法力 \+1/);
  assert.doesNotMatch(spin.value, /投入|強擊|狀態 \+|立即結果/);
});

test('技能詳情依目前可用性顯示使用與關閉按鈕', () => {
  const state = createGame({
    id: 'skill-detail-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['power-strike'], itemIds: [] },
  });

  const unavailable = renderContentDetail(state, 'skill', 'power-strike');
  assert.match(unavailable.embeds[0].fields[2].value, /2倍/);
  assert.deepEqual(
    unavailable.components[0].components.map((component) => component.label),
    ['關閉'],
  );

  state.resources.mana = 2;
  const usable = renderContentDetail(state, 'skill', 'power-strike');
  assert.deepEqual(
    usable.components[0].components.map((component) => component.label),
    ['使用', '關閉'],
  );
});

test('聖盾術詳情依目前等級顯示5、4、3點法力成本', () => {
  const state = createGame({
    id: 'holy-shield-detail-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['holy-shield'], itemIds: [] },
  });
  state.player.skillLevels['holy-shield'] = 3;
  state.resources.mana = 2;

  const unavailable = renderContentDetail(state, 'skill', 'holy-shield');
  assert.equal(unavailable.embeds[0].fields[1].value, '3');
  assert.match(unavailable.embeds[0].fields[3].value, /需要 3 點法力/);

  state.resources.mana = 3;
  const usable = renderContentDetail(state, 'skill', 'holy-shield');
  assert.deepEqual(
    usable.components[0].components.map((component) => component.label),
    ['使用', '關閉'],
  );
});

test('一次性護甲技能狀態不會被誤顯示為拉霸傷害倍率', () => {
  let state = createGame({
    id: 'shield-status-render-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['shield-throw'], itemIds: [] },
  });
  state.resources.mana = 1;
  state = activateSkill(state, 'shield-throw');

  const player = renderGame(state).embeds[0].fields.find((field) => (
    field.name.startsWith('👤 玩家')
  ));
  assert.match(player.value, /盾牌投擲/);
  assert.doesNotMatch(player.value, /盾牌投擲[^\n]*×1/);
});

test('被動技能詳情不顯示法力消耗與使用按鈕', () => {
  const state = createGame({
    id: 'passive-skill-detail-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['mana-armor'], itemIds: [] },
  });
  const detail = renderContentDetail(state, 'skill', 'mana-armor');

  assert.equal(detail.embeds[0].fields[1].name, '技能類型');
  assert.equal(detail.embeds[0].fields[1].value, '被動技能');
  assert.match(detail.embeds[0].fields[2].value, /每消耗1點✨可抵擋1點傷害/);
  assert.deepEqual(
    detail.components[0].components.map((component) => component.label),
    ['關閉'],
  );
});

test('裝備詳情只顯示關閉，消耗品可用時顯示使用', () => {
  const equipmentState = createGame({
    id: 'equipment-detail-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['power-strike'], itemIds: ['sword'] },
  });
  const equipment = renderContentDetail(equipmentState, 'item', 'sword');
  assert.deepEqual(
    equipment.components[0].components.map((component) => component.label),
    ['關閉'],
  );

  const itemState = createGame({
    id: 'item-detail-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['power-strike'], itemIds: ['fire-bomb'] },
  });
  const consumable = renderContentDetail(itemState, 'item', 'fire-bomb');
  assert.deepEqual(
    consumable.components[0].components.map((component) => component.label),
    ['使用', '關閉'],
  );
});

test('戰鬥勝利先顯示敵人生命0與確認按鈕，確認後才顯示獎勵', () => {
  let state = createGame({
    id: 'reward-render-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: { maxHp: 3 },
    },
    monsterRng: () => 0,
  });
  state = placeBet(state, 1, {
    reels: [SymbolId.ATTACK, SymbolId.ATTACK, SymbolId.DEFENSE],
    rewardRng: () => 0,
  });
  const victoryPayload = renderGame(state);

  assert.match(victoryPayload.embeds[0].fields[0].name, /HP　0\//);
  assert.doesNotMatch(victoryPayload.embeds[0].description, /HP 已回滿/);
  assert.deepEqual(
    victoryPayload.components[0].components.map((component) => component.label),
    ['確認'],
  );

  state = confirmCombatVictory(state, { rewardRng: () => 0 });
  const payload = renderGame(state);

  assert.equal(payload.embeds[0].title, '🏆 戰鬥勝利｜選擇獎勵');
  assert.equal(payload.embeds[0].fields.length, 3);
  assert.equal(payload.components[0].components.length, 3);
  assert.match(payload.embeds[0].fields[0].name, /【普通】/);
  for (const field of payload.embeds[0].fields) {
    assert.doesNotMatch(field.name, /^\d+\.\s/);
  }
  for (const component of payload.components[0].components) {
    assert.doesNotMatch(component.label, /^\d+\.\s/);
  }
  assert.deepEqual(
    payload.components[0].components.map((component) => component.custom_id),
    [
      'slotbattle:reward-render-test:reward:0',
      'slotbattle:reward-render-test:reward:1',
      'slotbattle:reward-render-test:reward:2',
    ],
  );
});

test('擊敗地區BOSS時顯示HP已回滿', () => {
  let state = createGame({
    id: 'boss-recovery-render-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-guardian',
      initialEnemyOverrides: { maxHp: 1 },
    },
    monsterRng: () => 0,
  });
  state.player.hp = 7;
  state = placeBet(state, 1, {
    reels: [SymbolId.ATTACK, SymbolId.DEFENSE, SymbolId.SKILL],
  });

  const payload = renderGame(state);
  assert.match(payload.embeds[0].description, /HP 已回滿/);
  assert.match(payload.embeds[0].fields.at(-1).name, /45\/45/);
});

test('戰鬥面板會分開顯示玩家與敵人的狀態', () => {
  let state = createGame({
    id: 'enemy-status-render',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-guardian' },
    loadout: { skillIds: ['power-strike'], itemIds: ['fire-bomb'] },
    monsterRng: () => 0,
  });
  state = useItem(state, 'fire-bomb', { rng: () => 0 });
  const fields = renderGame(state).embeds[0].fields;
  const enemy = fields.find((field) => field.name.startsWith('👹'));
  const player = fields.find((field) => field.name.startsWith('👤'));

  assert.match(enemy.value, /敵人狀態[\s\S]*燃燒 ×3/);
  assert.match(player.value, /玩家狀態\*\*\n無/);
});

test('怪物被動技能狀態只顯示名稱，不顯示說明或回合數', () => {
  const state = createGame({
    id: 'passive-monster-status-render',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'elite-ruins-sentinel' },
    monsterRng: () => 0,
  });
  const enemy = renderGame(state).embeds[0].fields
    .find((field) => field.name.startsWith('👹'));

  assert.match(enemy.value, /敵人狀態[\s\S]*🛡️護甲強化/);
  assert.doesNotMatch(enemy.value, /護甲強化.*回合|受到的傷害/);
});

test('奇遇先顯示冒險進度，再顯示不公開名稱的奇遇內文', () => {
  const event = getEvent('ruins-mysterious-spring');
  const state = createGame({
    id: 'event-render',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    monsterRng: () => 0,
  });
  state.phase = GamePhase.EVENT;
  state.enemy = null;
  state.event = {
    eventId: event.id,
    name: event.name,
    description: event.description,
    rarity: event.rarity,
    stage: 'choice',
    options: event.options.map(({ id, label }) => ({ id, label })),
    result: null,
  };
  const payload = renderGame(state);
  const embed = payload.embeds[0];
  const labels = payload.components[0].components.map((component) => component.label);

  assert.equal(embed.title, '冒險進度');
  assert.equal(
    embed.description,
    '地區 1｜本區完成 0 次遭遇\n\n【奇遇】你遇到一座充滿生命力的泉水，是否要取水喝？',
  );
  assert.equal(embed.fields, undefined);
  assert.equal(embed.footer, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /神秘泉水/);
  assert.doesNotMatch(JSON.stringify(payload), /奇遇名稱不會顯示/);
  assert.deepEqual(labels, ['是', '否']);

  state.event.stage = 'result';
  state.event.result = { text: '你覺得身體裡充滿活力，HP 回滿了。' };
  const resultEmbed = renderGame(state).embeds[0];

  assert.equal(resultEmbed.title, '冒險進度');
  assert.equal(
    resultEmbed.description,
    '地區 1｜本區完成 0 次遭遇\n\n【奇遇】你覺得身體裡充滿活力，HP 回滿了。',
  );
});

test('遊戲結束畫面顯示擊敗數量與最後技能道具配置', () => {
  const state = abandonGame(createGame({
    id: 'end-render-test',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: {
      skillIds: ['power-strike'],
      itemIds: ['sword'],
    },
    monsterRng: () => 0,
  }));
  const payload = renderGame(state);
  const fields = Object.fromEntries(payload.embeds[0].fields.map((field) => (
    [field.name, field.value]
  )));

  assert.equal(payload.embeds[0].title, '冒險結束');
  assert.match(fields['最後裝備配置'], /劍/);
  assert.match(fields['最後技能配置'], /強擊/);
  assert.equal(payload.components[0].components[0].label, '開始新遊戲');
});

test('投入點數按鈕會建立可輸入剩餘行動點的Modal', () => {
  const state = createGame({ id: 'modal-test', ownerId: 'player-1' });
  const modal = renderWagerModal(state);
  const input = modal.components[0].components[0];

  assert.equal(modal.custom_id, 'slotbattle:modal-test:wager-submit');
  assert.equal(input.type, 4);
  assert.equal(input.custom_id, 'wager');
  assert.match(input.label, /1～4/);
});

test('玩法說明使用定稿文案，不顯示固定行動點或內部機率', () => {
  const description = renderRules().embeds[0].description;
  assert.match(description, /每回合開始時會獲得行動點/);
  assert.match(description, /一次投入，也可以拆成多次拉霸/);
  assert.match(description, /⚔️｜🛡️｜✨｜🍀｜💀/);
  assert.match(description, /🍀則會同時獲得上述全部效果/);
  assert.match(description, /三個💀就會進入暈眩狀態/);
  assert.match(description, /\/slotbattle profile/);
  assert.match(description, /最多可以持有3個技能，技能等級上限為3級/);
  assert.doesNotMatch(description, /4 點行動點|30%|最多拉霸|結束抽選/);
});
