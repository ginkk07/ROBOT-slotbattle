import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../src/discord/commands.js';
import {
  renderGame,
  renderProfile,
  renderRules,
  renderWagerModal,
} from '../src/discord/render.js';
import { createGame } from '../src/game/engine.js';
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
    '放棄戰鬥',
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
  const loadout = payload.embeds[0].fields.find((field) => field.name === '攜帶內容');
  const labels = payload.components.flatMap((row) => (
    row.components.map((component) => component.label)
  ));

  assert.match(loadout.value, /燃焰之劍（已裝備）/);
  assert.doesNotMatch(labels.join('、'), /使用燃焰之劍/);
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
