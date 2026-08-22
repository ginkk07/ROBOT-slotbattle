import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../src/discord/commands.js';
import {
  renderGame,
  renderProfile,
  renderRules,
  renderWagerModal,
} from '../src/discord/render.js';
import { abandonGame, createGame, placeBet } from '../src/game/engine.js';
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
    '強擊（2法力）',
    '使用火焰炸彈 ×1',
    '回合結束',
    '放棄遊戲',
  ]);
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
    payload.embeds[0].fields.find((field) => field.name === '狀態').value,
    /攻擊力＋1（3回合）/,
  );
  assert.doesNotMatch(labels.join('、'), /使用燃焰之劍/);
});

test('戰鬥勝利後顯示三個各自帶稀有度的獎勵按鈕', () => {
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
  const payload = renderGame(state);

  assert.equal(payload.embeds[0].title, '🏆 戰鬥勝利｜選擇獎勵');
  assert.equal(payload.embeds[0].fields.length, 3);
  assert.equal(payload.components[0].components.length, 3);
  assert.match(payload.embeds[0].fields[0].name, /【普通】/);
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
