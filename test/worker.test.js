import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorker } from '../src/worker.js';
import { MemoryGameStore } from '../src/persistence/memory-store.js';

const ENVIRONMENT = Object.freeze({
  DISCORD_PUBLIC_KEY: 'test-public-key',
  APPS_SCRIPT_URL: 'https://script.google.com/test',
  APPS_SCRIPT_SECRET: 'test-secret',
  DB: { prepare() {} },
});

test('Worker健康檢查會確認D1與Google鏡像設定', async () => {
  const worker = createWorker({ verifyRequest: async () => true });
  const response = await worker.fetch(
    new Request('https://slotbattle.example/'),
    ENVIRONMENT,
    {},
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'slotbattle-discord-worker',
    mode: 'http-interactions',
    storage: 'd1',
    profileMirror: 'google-sheets',
  });
});

test('Worker健康檢查會明確列出缺少D1 binding', async () => {
  const response = await createWorker().fetch(
    new Request('https://slotbattle.example/'),
    { ...ENVIRONMENT, DB: undefined },
    {},
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    service: 'slotbattle-discord-worker',
    mode: 'http-interactions',
    storage: 'unavailable',
    profileMirror: 'google-sheets',
    missing: ['DB'],
  });
});

test('Worker會拒絕未通過Discord簽章的請求', async () => {
  const worker = createWorker({ verifyRequest: async () => false });
  const response = await worker.fetch(interactionRequest({ type: 1 }), ENVIRONMENT, {});

  assert.equal(response.status, 401);
});

test('Worker會回應Discord的PING驗證', async () => {
  const worker = createWorker({ verifyRequest: async () => true });
  const response = await worker.fetch(interactionRequest({ type: 1 }), ENVIRONMENT, {});

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 1 });
});

test('Worker可以驗證真實Ed25519簽章', async () => {
  const keys = await globalThis.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = toHex(await globalThis.crypto.subtle.exportKey('raw', keys.publicKey));
  const timestamp = '1770000000';
  const body = JSON.stringify({ type: 1 });
  const message = new TextEncoder().encode(timestamp + body);
  const signature = toHex(await globalThis.crypto.subtle.sign(
    { name: 'Ed25519' },
    keys.privateKey,
    message,
  ));
  const request = new Request('https://slotbattle.example/interactions', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
    body,
  });

  const response = await createWorker().fetch(request, {
    ...ENVIRONMENT,
    DISCORD_PUBLIC_KEY: publicKey,
  }, {});

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 1 });
});

test('規則指令會立即回傳非同步之外的Discord訊息', async () => {
  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: () => new MemoryGameStore(),
  });
  const response = await worker.fetch(interactionRequest(commandInteraction('rules')),
    ENVIRONMENT, {});
  const body = await response.json();

  assert.equal(body.type, 4);
  assert.equal(body.data.flags, 64);
  assert.equal(body.data.embeds[0].title, '🎰 拉霸戰鬥｜怎麼玩');
});

test('開始指令會直接回傳遊戲面板，不再呼叫Discord Webhook', async () => {
  const store = new MemoryGameStore();
  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: () => store,
  });

  const response = await worker.fetch(interactionRequest(commandInteraction('start')),
    ENVIRONMENT, {});
  const body = await response.json();

  assert.equal(body.type, 4);
  assert.equal(body.data.embeds[0].title, '🎰 地區 1｜第 1 回合');
  assert.equal(body.data.components[0].components[0].type, 2);
});

test('玩家資料指令會直接回傳私人訊息', async () => {
  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: () => new MemoryGameStore(),
  });

  const response = await worker.fetch(
    interactionRequest(commandInteraction('profile')),
    ENVIRONMENT,
    {},
  );
  const body = await response.json();

  assert.equal(body.type, 4);
  assert.equal(body.data.flags, 64);
  assert.equal(body.data.embeds[0].title, '🧭 開局配置');
  assert.equal(body.data.components[0].components[0].type, 3);
});

test('Google背景同步不會延後Discord戰鬥面板', async () => {
  const store = new MemoryGameStore();
  const background = [];
  let finishMirror;
  const mirrorTask = new Promise((resolve) => {
    finishMirror = resolve;
  });

  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: (environment, { enqueue }) => {
      enqueue(mirrorTask);
      return store;
    },
  });

  const response = await worker.fetch(
    interactionRequest(commandInteraction('start')),
    ENVIRONMENT,
    { waitUntil: (promise) => background.push(promise) },
  );
  assert.equal((await response.json()).type, 4);

  let finished = false;
  background[0].then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(finished, false);

  finishMirror();
  await Promise.all(background);
});

test('投入按鈕會開啟Modal，送出數字後直接更新戰鬥訊息', async () => {
  const store = new MemoryGameStore();
  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: () => store,
  });

  const startResponse = await worker.fetch(
    interactionRequest(commandInteraction('start')),
    ENVIRONMENT,
    {},
  );
  const startBody = await startResponse.json();
  const customId = startBody.data.components[0].components[0].custom_id;

  const modalResponse = await worker.fetch(
    interactionRequest(componentInteraction(customId)),
    ENVIRONMENT, {});
  const modalBody = await modalResponse.json();
  assert.equal(modalBody.type, 9);
  assert.equal(
    modalBody.data.custom_id,
    `slotbattle:${customId.split(':')[1]}:wager-submit`,
  );

  const response = await worker.fetch(
    interactionRequest(modalInteraction(modalBody.data.custom_id, '2')),
    ENVIRONMENT,
    {},
  );
  const body = await response.json();
  assert.equal(body.type, 7);
  assert.equal(body.data.embeds[0].title, '🎰 地區 1｜第 1 回合');
});

test('開局配置選單會保存選擇並更新私人訊息', async () => {
  const store = new MemoryGameStore();
  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: () => store,
  });
  await worker.fetch(
    interactionRequest(commandInteraction('profile')),
    ENVIRONMENT,
    {},
  );

  const response = await worker.fetch(
    interactionRequest(componentInteraction(
      'slotbattle-profile:skill',
      { componentType: 3, values: ['fire-imbue'] },
    )),
    ENVIRONMENT,
    {},
  );
  const body = await response.json();
  const profile = await store.getOrCreateProfile('player-1');

  assert.equal(body.type, 7);
  assert.match(body.data.embeds[0].fields[0].value, /火焰附加/);
  assert.deepEqual(profile.profile.lastStartingLoadout.skillIds, ['fire-imbue']);
});

function interactionRequest(payload) {
  return new Request('https://slotbattle.example/interactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature-ed25519': 'signature',
      'x-signature-timestamp': 'timestamp',
    },
    body: JSON.stringify(payload),
  });
}

function commandInteraction(subcommand) {
  return {
    id: 'interaction-1',
    application_id: '526581724554067969',
    token: 'interaction-token',
    type: 2,
    member: { user: { id: 'player-1' } },
    data: {
      name: 'slotbattle',
      options: [{ type: 1, name: subcommand }],
    },
  };
}

function componentInteraction(customId, { componentType = 2, values } = {}) {
  return {
    id: 'interaction-2',
    application_id: '526581724554067969',
    token: 'interaction-token-2',
    type: 3,
    member: { user: { id: 'player-1' } },
    data: {
      component_type: componentType,
      custom_id: customId,
      ...(values ? { values } : {}),
    },
  };
}

function modalInteraction(customId, wager) {
  return {
    id: 'interaction-3',
    application_id: '526581724554067969',
    token: 'interaction-token-3',
    type: 5,
    member: { user: { id: 'player-1' } },
    data: {
      custom_id: customId,
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: 'wager',
          value: wager,
        }],
      }],
    },
  };
}

function toHex(value) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
