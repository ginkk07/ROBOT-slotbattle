import test from 'node:test';
import assert from 'node:assert/strict';

import { commands } from '../src/discord/commands.js';
import { renderGame } from '../src/discord/render.js';
import { createGame } from '../src/game/engine.js';

test('斜線指令可以轉換成Discord API格式', () => {
  const data = commands.map((command) => command.toJSON());
  assert.equal(data[0].name, 'slotbattle');
  assert.deepEqual(
    data[0].options.map((option) => option.name),
    ['start', 'rules'],
  );
});

test('遊戲訊息包含投入按鈕與控制按鈕', () => {
  const state = createGame({ id: 'render-test', ownerId: 'player-1' });
  const payload = renderGame(state);
  const rows = payload.components.map((row) => row.toJSON());
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
