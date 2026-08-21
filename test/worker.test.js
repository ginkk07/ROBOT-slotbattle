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
  assert.equal(body.data.embeds[0].title, '🎰 拉霸戰鬥規則');
});

test('開始指令會先延遲回應，再以Webhook更新遊戲面板', async () => {
  const store = new MemoryGameStore();
  const calls = [];
  const background = [];
  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: () => store,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const context = {
    waitUntil(promise) {
      background.push(promise);
    },
  };

  const response = await worker.fetch(interactionRequest(commandInteraction('start')),
    ENVIRONMENT, context);
  const deferred = await response.json();
  await Promise.all(background);

  assert.equal(deferred.type, 5);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/messages\/@original$/);
  assert.equal(calls[0].options.method, 'PATCH');

  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.embeds[0].title, '🎰 拉霸戰鬥｜第 1 回合');
  assert.equal(payload.components[0].components[0].type, 2);
});

test('Google背景同步不會延後Discord戰鬥面板', async () => {
  const store = new MemoryGameStore();
  const background = [];
  let finishMirror;
  const mirrorTask = new Promise((resolve) => {
    finishMirror = resolve;
  });
  let webhookEdited;
  const editSeen = new Promise((resolve) => {
    webhookEdited = resolve;
  });

  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: (environment, { enqueue }) => {
      enqueue(mirrorTask);
      return store;
    },
    fetchImpl: async () => {
      webhookEdited();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await worker.fetch(
    interactionRequest(commandInteraction('start')),
    ENVIRONMENT,
    { waitUntil: (promise) => background.push(promise) },
  );
  assert.equal((await response.json()).type, 5);

  await editSeen;
  let finished = false;
  background[0].then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(finished, false);

  finishMirror();
  await Promise.all(background);
});

test('按鈕互動會先確認，再更新原本的戰鬥訊息', async () => {
  const store = new MemoryGameStore();
  const calls = [];
  const worker = createWorker({
    verifyRequest: async () => true,
    storeFactory: () => store,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const startBackground = [];
  await worker.fetch(interactionRequest(commandInteraction('start')), ENVIRONMENT, {
    waitUntil: (promise) => startBackground.push(promise),
  });
  await Promise.all(startBackground);
  const startPayload = JSON.parse(calls[0].options.body);
  const customId = startPayload.components[0].components[0].custom_id;

  calls.length = 0;
  const buttonBackground = [];
  const response = await worker.fetch(interactionRequest(componentInteraction(customId)),
    ENVIRONMENT, {
      waitUntil: (promise) => buttonBackground.push(promise),
    });
  const deferred = await response.json();
  await Promise.all(buttonBackground);

  assert.equal(deferred.type, 6);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.match(calls[0].url, /\/messages\/@original$/);
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

function componentInteraction(customId) {
  return {
    id: 'interaction-2',
    application_id: '526581724554067969',
    token: 'interaction-token-2',
    type: 3,
    member: { user: { id: 'player-1' } },
    data: {
      component_type: 2,
      custom_id: customId,
    },
  };
}

function toHex(value) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
