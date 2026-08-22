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

test('擊敗敵人後先在原戰鬥面板確認，再顯示獎勵', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'victory-confirm-controller');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  const record = await store.getSession('victory-confirm-controller');
  record.state.enemy.hp = 1;
  await store.saveSession(record.state, { expectedRevision: record.revision });

  const defeated = await controller.handleModal({
    customId: 'slotbattle:victory-confirm-controller:wager-submit',
    userId: 'player-1',
    fields: { wager: '1' },
  });
  assert.match(defeated.payload.embeds[0].fields[0].name, /HP　0\//);
  assert.deepEqual(
    defeated.payload.components[0].components.map((component) => component.label),
    ['確認'],
  );

  const confirmed = await controller.handleComponent({
    customId: 'slotbattle:victory-confirm-controller:victory-confirm',
    userId: 'player-1',
  });
  assert.equal(confirmed.payload.embeds[0].title, '🏆 戰鬥勝利｜選擇獎勵');
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

test('技能按鈕在原訊息顯示詳情，可用時才提供使用按鈕', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'skill-detail-controller');
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
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });

  const unavailable = await controller.handleComponent({
    customId: 'slotbattle:skill-detail-controller:detail-skill:power-strike',
    userId: 'player-1',
  });
  assert.equal(unavailable.ephemeral, false);
  assert.deepEqual(
    unavailable.payload.components[0].components.map((component) => component.label),
    ['關閉'],
  );

  const record = await store.getSession('skill-detail-controller');
  record.state.resources.mana = 2;
  await store.saveSession(record.state, { expectedRevision: record.revision });
  const usable = await controller.handleComponent({
    customId: 'slotbattle:skill-detail-controller:detail-skill:power-strike',
    userId: 'player-1',
  });
  assert.deepEqual(
    usable.payload.components[0].components.map((component) => component.label),
    ['使用', '關閉'],
  );

  const used = await controller.handleComponent({
    customId: 'slotbattle:skill-detail-controller:skill:power-strike',
    userId: 'player-1',
  });
  const saved = await store.getSession('skill-detail-controller');
  assert.equal(used.ephemeral, false);
  assert.equal(saved.state.resources.mana, 0);
  assert.ok(saved.state.player.activeStatuses.some((status) => (
    status.statusId === 'power-strike-ready'
  )));
});

test('詳情關閉按鈕會在原訊息恢復戰鬥面板', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'detail-close-controller');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });

  const closed = await controller.handleComponent({
    customId: 'slotbattle:detail-close-controller:detail-close',
    userId: 'player-1',
  });
  assert.equal(closed.ephemeral, false);
  assert.equal(closed.payload.embeds[0].title, '🎰 地區 1｜第 1 回合');
  assert.ok(closed.payload.components.length > 0);
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
