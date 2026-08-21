import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameController } from '../src/discord/game-controller.js';
import { MemoryGameStore } from '../src/persistence/memory-store.js';

function controllerFor(store, id = 'controller-test') {
  return createGameController({
    store,
    idGenerator: () => id,
    spinRng: () => 0,
    worldRng: () => 0.99,
    monsterRng: () => 0,
    rewardRng: () => 0,
  });
}

test('共用控制器可以建立並重新顯示新版戰鬥', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store);

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
  assert.equal(started.payload.embeds[0].title, '🎰 地區 1｜第 1 回合');
  assert.equal(
    resumed.payload.components[0].components[0].custom_id,
    'slotbattle:controller-test:wager',
  );
});

test('投入按鈕先開啟Modal，送出數字後才更新戰鬥', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'wager-test');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });

  const opened = await controller.handleComponent({
    customId: 'slotbattle:wager-test:wager',
    userId: 'player-1',
  });
  assert.equal(opened.modal.custom_id, 'slotbattle:wager-test:wager-submit');

  const submitted = await controller.handleModal({
    customId: opened.modal.custom_id,
    userId: 'player-1',
    fields: { wager: '2' },
  });
  const saved = await store.getSession('wager-test');

  assert.equal(submitted.payload.embeds[0].title, '🎰 地區 1｜第 1 回合');
  assert.equal(saved.state.resources.action, 2);
  assert.ok(saved.state.enemy.hp < saved.state.enemy.maxHp);
});

test('Modal拒絕小數與超過剩餘行動點的投入', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'invalid-wager');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });

  await assert.rejects(
    controller.handleModal({
      customId: 'slotbattle:invalid-wager:wager-submit',
      userId: 'player-1',
      fields: { wager: '1.5' },
    }),
    /正整數/,
  );
  await assert.rejects(
    controller.handleModal({
      customId: 'slotbattle:invalid-wager:wager-submit',
      userId: 'player-1',
      fields: { wager: '5' },
    }),
    /1～4/,
  );
});

test('玩家可在profile各選一個技能與道具並帶入下一場', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'loadout-test');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'profile',
    userId: 'player-1',
  });
  await controller.handleComponent({
    customId: 'slotbattle-profile:skill',
    userId: 'player-1',
    values: ['power-strike'],
  });
  const selected = await controller.handleComponent({
    customId: 'slotbattle-profile:item',
    userId: 'player-1',
    values: ['flame-sword'],
  });
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  const session = await store.getSession('loadout-test');

  assert.match(selected.payload.embeds[0].fields[1].value, /燃焰之劍/);
  assert.deepEqual(session.state.player.skillIds, ['power-strike']);
  assert.equal(session.state.player.equipment.weapon, 'flame-sword');
});

test('其他玩家無法操作別人的戰鬥面板', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'owner-test');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'owner',
  });

  await assert.rejects(
    controller.handleComponent({
      customId: 'slotbattle:owner-test:wager',
      userId: 'other-player',
    }),
    /其他玩家/,
  );
});

test('主動放棄會結算永久紀錄並清除本輪配置', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'abandon-run');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });

  const ended = await controller.handleComponent({
    customId: 'slotbattle:abandon-run:abandon',
    userId: 'player-1',
  });
  const session = await store.getSession('abandon-run');
  const profile = await store.getOrCreateProfile('player-1');

  assert.equal(ended.payload.embeds[0].title, '冒險結束');
  assert.equal(session.state.endSummary.profileSettled, true);
  assert.deepEqual(session.state.player.skillIds, []);
  assert.equal(profile.profile.lifetimeStats.runsEnded, 1);
});
