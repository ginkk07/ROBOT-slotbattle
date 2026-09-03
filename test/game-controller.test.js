import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameController } from '../src/discord/game-controller.js';
import { getEvent } from '../src/game/data/events.js';
import { GamePhase } from '../src/game/engine.js';
import { MemoryGameStore } from '../src/persistence/memory-store.js';

function controllerFor(store, id = 'controller-test', overrides = {}) {
  return createGameController({
    store,
    idGenerator: () => id,
    spinRng: () => 0,
    worldRng: () => 0.99,
    monsterRng: () => 0,
    rewardRng: () => 0,
    ...overrides,
  });
}

async function moveSessionToEvent(store, gameId, eventId, updatePlayer = () => {}) {
  const record = await store.getSession(gameId);
  const event = getEvent(eventId);
  record.state.phase = GamePhase.EVENT;
  record.state.enemy = null;
  record.state.event = {
    eventId: event.id,
    name: event.name,
    rarity: event.rarity,
    description: event.description,
    stage: 'choice',
    options: event.options.map(({ id, label, goldCost, itemCost }) => ({
      id,
      label,
      ...(goldCost !== undefined ? { goldCost } : {}),
      ...(itemCost !== undefined ? { itemCost: structuredClone(itemCost) } : {}),
    })),
    result: null,
  };
  updatePlayer(record.state.player);
  await store.saveSession(record.state, { expectedRevision: record.revision });
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
    resumed.payload.components[0].components.map((component) => component.custom_id).join(','),
    [
      'slotbattle:controller-test:wager-one',
      'slotbattle:controller-test:wager-all-in',
      'slotbattle:controller-test:wager',
    ].join(','),
  );
});

test('自行輸入按鈕先開啟Modal，送出數字後才更新戰鬥', async () => {
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

test('投入1點與投入全部都會直接拉霸', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'all-in-test');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });

  const wageredOne = await controller.handleComponent({
    customId: 'slotbattle:all-in-test:wager-one',
    userId: 'player-1',
  });
  let saved = await store.getSession('all-in-test');

  assert.equal(wageredOne.modal, null);
  assert.equal(saved.state.lastSpin.wager, 1);
  assert.equal(saved.state.resources.action, 3);

  const wageredAll = await controller.handleComponent({
    customId: 'slotbattle:all-in-test:wager-all-in',
    userId: 'player-1',
  });
  saved = await store.getSession('all-in-test');

  assert.equal(wageredAll.modal, null);
  assert.equal(saved.state.lastSpin.wager, 3);
  assert.equal(saved.state.resources.action, 0);
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
    values: ['sword'],
  });
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  const session = await store.getSession('loadout-test');

  assert.match(selected.payload.embeds[0].fields[1].value, /劍/);
  assert.deepEqual(session.state.player.skillIds, ['power-strike']);
  assert.deepEqual(session.state.player.equipment, ['sword']);
});

test('裝備選單可以開啟所選裝備的詳情', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'equipment-select-controller');
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'profile',
    userId: 'player-1',
  });
  await controller.handleComponent({
    customId: 'slotbattle-profile:item',
    userId: 'player-1',
    values: ['sword'],
  });
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });

  const detail = await controller.handleComponent({
    customId: 'slotbattle:equipment-select-controller:detail-equipment-1',
    userId: 'player-1',
    values: ['sword'],
  });
  assert.match(detail.payload.embeds[0].title, /📦 長劍/);
  assert.deepEqual(
    detail.payload.components[0].components.map((component) => component.label),
    ['關閉'],
  );
});

test('控制器可完成尋寶鐵匠的付款與武器選擇', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'blacksmith-controller', {
    eventRng: () => 0,
  });
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  await moveSessionToEvent(
    store,
    'blacksmith-controller',
    'ruins-treasure-blacksmith',
    (player) => { player.gold = 20; },
  );

  const selectedPayment = await controller.handleComponent({
    customId: 'slotbattle:blacksmith-controller:event-option:forge-risky',
    userId: 'player-1',
  });
  assert.match(selectedPayment.payload.embeds[0].description, /選擇一件普通武器/);

  const upgraded = await controller.handleComponent({
    customId: 'slotbattle:blacksmith-controller:event-weapon:sword',
    userId: 'player-1',
  });
  const saved = await store.getSession('blacksmith-controller');
  assert.equal(saved.state.player.gold, 0);
  assert.deepEqual(saved.state.player.equipment, ['reinforced-longsword']);
  assert.match(upgraded.payload.embeds[0].description, /長劍\(強化\)/);
});

test('控制器可搜刮冒險者屍體並帶著既有收穫離開', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'corpse-controller', {
    eventRng: () => 0.99,
  });
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  await moveSessionToEvent(store, 'corpse-controller', 'ruins-adventurer-corpse');

  const searched = await controller.handleComponent({
    customId: 'slotbattle:corpse-controller:event-option:search',
    userId: 'player-1',
  });
  assert.match(searched.payload.embeds[0].description, /獲得 40 枚金幣/);

  const left = await controller.handleComponent({
    customId: 'slotbattle:corpse-controller:event-corpse-leave',
    userId: 'player-1',
  });
  const saved = await store.getSession('corpse-controller');
  assert.equal(saved.state.player.gold, 40);
  assert.equal(saved.state.event.stage, 'result');
  assert.match(left.payload.embeds[0].description, /帶著目前找到的財物離開/);
});

test('控制器選定收藏家賭注後會顯示轉輪與鎖定按鈕', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'collector-controller', {
    eventRng: sequence([0, 0, 0, 0.4, 0.7]),
  });
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  await moveSessionToEvent(store, 'collector-controller', 'ruins-mysterious-collector');

  await controller.handleComponent({
    customId: 'slotbattle:collector-controller:event-option:challenge-item',
    userId: 'player-1',
  });
  const wagered = await controller.handleComponent({
    customId: 'slotbattle:collector-controller:event-skill:life-recovery',
    userId: 'player-1',
  });
  const saved = await store.getSession('collector-controller');
  const labels = wagered.payload.components[0].components.map((component) => component.label);

  assert.equal(saved.state.event.stage, 'collector-spin');
  assert.equal(saved.state.event.collector.attempt, 1);
  assert.equal(labels[0], '全部重新轉動');
  assert.deepEqual(labels.slice(1).map((label) => label.match(/[^ ]+$/u)[0]), ['⚔️', '🛡️', '✨']);
});

test('新畫面無法產生時不會先保存已前進的奇遇狀態', async () => {
  const store = new MemoryGameStore();
  const controller = controllerFor(store, 'render-guard-controller', {
    eventRng: sequence([0, 0, 0, 0.4, 0.7, 0.4, 0.7]),
  });
  await controller.handleCommand({
    commandName: 'slotbattle',
    subcommand: 'start',
    userId: 'player-1',
  });
  await moveSessionToEvent(store, 'render-guard-controller', 'ruins-mysterious-collector');
  await controller.handleComponent({
    customId: 'slotbattle:render-guard-controller:event-option:challenge-item',
    userId: 'player-1',
  });
  await controller.handleComponent({
    customId: 'slotbattle:render-guard-controller:event-skill:life-recovery',
    userId: 'player-1',
  });

  const corrupted = await store.getSession('render-guard-controller');
  corrupted.state.event.collector.reels[0] = 'unknown-symbol';
  const before = await store.saveSession(corrupted.state, {
    expectedRevision: corrupted.revision,
  });

  await assert.rejects(
    controller.handleComponent({
      customId: 'slotbattle:render-guard-controller:event-collector-spin:0',
      userId: 'player-1',
    }),
    /emoji/,
  );
  const after = await store.getSession('render-guard-controller');

  assert.equal(after.revision, before.revision);
  assert.equal(after.state.event.collector.attempt, 1);
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

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
