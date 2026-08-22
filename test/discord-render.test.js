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
  assert.match(embed.fields[1].value, /生命藥水/);
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[0].components[0].type, 3);
  assert.equal(payload.components[0].components[0].options.length, 3);
  assert.equal(payload.components[1].components[0].options.length, 3);
  assert.equal(payload.components[0].components[0].max_values, 1);
  assert.equal(payload.components[1].components[0].max_values, 1);
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
  assert.doesNotMatch(labels.join('、'), /投入1點|投入2點|投入3點|全部投入/);
});

test('裝備在面板顯示為已穿戴而不是使用按鈕', () => {
  const state = createGame({
    id: 'equipment-render-test',
    ownerId: 'player-1',
    loadout: {
      skillIds: ['life-recovery'],
      itemIds: ['flame-sword'],
    },
  });
  const payload = renderGame(state);
  const loadout = payload.embeds[0].fields.find((field) => field.name === '目前配置');
  const labels = payload.components.flatMap((row) => (
    row.components.map((component) => component.label)
  ));

  assert.match(loadout.value, /燃焰之劍（已裝備）/);
  assert.match(
    payload.embeds[0].fields.find((field) => field.name === '玩家狀態').value,
    /攻擊力＋1（3回合）/,
  );
  assert.ok(labels.includes('燃焰之劍'));
  assert.doesNotMatch(labels.join('、'), /使用燃焰之劍/);
});

test('回合資源只使用符號與數值顯示', () => {
  const payload = renderGame(createGame({
    id: 'resource-render-test',
    ownerId: 'player-1',
  }));
  const resources = payload.embeds[0].fields
    .find((field) => field.name === '本回合資源').value;

  assert.equal(resources, '❇️ **4**　🛡️ **0**　✨ **0**');
  assert.doesNotMatch(resources, /行動|護甲|法力/);
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

test('裝備詳情只顯示關閉，消耗品可用時顯示使用', () => {
  const equipmentState = createGame({
    id: 'equipment-detail-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['power-strike'], itemIds: ['flame-sword'] },
  });
  const equipment = renderContentDetail(equipmentState, 'item', 'flame-sword');
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

  assert.match(victoryPayload.embeds[0].fields[1].name, /HP　0\//);
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
  const fields = Object.fromEntries(renderGame(state).embeds[0].fields.map((field) => (
    [field.name, field.value]
  )));

  assert.match(fields['敵人狀態｜遺跡守衛'], /燃燒 ×3/);
  assert.equal(fields['玩家狀態'], '無');
});

test('奇遇只顯示內文與選項，不會公開事件名稱', () => {
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
  const labels = payload.components[0].components.map((component) => component.label);

  assert.doesNotMatch(payload.embeds[0].title, /神秘泉水/);
  assert.match(payload.embeds[0].description, /是否要取水喝/);
  assert.deepEqual(labels, ['是', '否']);
});

test('遊戲結束畫面顯示擊敗數量與最後技能道具配置', () => {
  const state = abandonGame(createGame({
    id: 'end-render-test',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: {
      skillIds: ['power-strike'],
      itemIds: ['flame-sword'],
    },
    monsterRng: () => 0,
  }));
  const payload = renderGame(state);
  const fields = Object.fromEntries(payload.embeds[0].fields.map((field) => (
    [field.name, field.value]
  )));

  assert.equal(payload.embeds[0].title, '冒險結束');
  assert.match(fields['最後裝備配置'], /燃焰之劍/);
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
  assert.doesNotMatch(description, /4 點行動點|30%|最多拉霸|結束抽選/);
});
