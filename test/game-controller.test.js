import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameController, EPHEMERAL_FLAG } from '../src/discord/game-controller.js';
import { MemoryGameStore } from '../src/persistence/memory-store.js';

test('共用控制器可以建立並重新顯示戰鬥', async () => {
  const store = new MemoryGameStore();
  const controller = createGameController({
    store,
    idGenerator: () => 'controller-test',
  });

  const started = await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  const resumed = await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'resume',
    userId: 'player-1',
  });

  assert.equal(started.handled, true);
  assert.equal(started.payload.embeds[0].title, '🎰 拉霸戰鬥｜第 1 回合');
  assert.equal(resumed.payload.components[0].components[0].custom_id,
    'slotbattle:controller-test:bet:1');
});

test('其他玩家無法操作別人的戰鬥面板', async () => {
  const store = new MemoryGameStore();
  const controller = createGameController({
    store,
    idGenerator: () => 'owner-test',
  });

  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'owner',
  });
  const result = await controller.handleButton({
    customId: 'slotbattle:owner-test:bet:1',
    userId: 'other-player',
  });

  assert.equal(result.payload, null);
  assert.equal(result.followUps[0].flags, EPHEMERAL_FLAG);
  assert.match(result.followUps[0].content, /其他玩家/);
});
