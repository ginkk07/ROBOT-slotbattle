import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../src/discord/commands.js';
import { renderGame, renderProfile } from '../src/discord/render.js';
import { createGame } from '../src/game/engine.js';
import { createDefaultProfile } from '../src/player/profile.js';

test('斜線指令可以轉換成Discord API格式', () => {
  const data = commands;
  assert.equal(data[0].name, 'slotbattle');
  assert.deepEqual(
    data[0].options.map((option) => option.name),
    ['start', 'resume', 'profile', 'rules'],
  );
});

test('玩家資料訊息會顯示初始技能與道具欄位', () => {
  const payload = renderProfile(createDefaultProfile('player-1'));
  const embed = payload.embeds[0];

  assert.equal(embed.title, '🧭 Roguelike 玩家資料');
  assert.match(embed.fields[0].name, /技能欄位/);
  assert.match(embed.fields[0].value, /生命回復/);
  assert.match(embed.fields[1].value, /生命藥水/);
});

test('遊戲訊息包含投入按鈕與控制按鈕', () => {
  const state = createGame({ id: 'render-test', ownerId: 'player-1' });
  const payload = renderGame(state);
  const rows = payload.components;
  const labels = rows.flatMap((row) => row.components.map((button) => button.label));

  assert.equal(payload.embeds.length, 1);
  assert.deepEqual(labels, [
    '投入1點',
    '投入2點',
    '投入3點',
    '全部投入（4）',
    '結束抽選',
    '放棄戰鬥',
  ]);
});
