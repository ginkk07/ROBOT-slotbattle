import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/game/engine.js';
import { AppsScriptGameStore } from '../src/persistence/apps-script-store.js';
import { StoreConflictError } from '../src/persistence/errors.js';
import { createGameStore } from '../src/persistence/game-store.js';
import { MemoryGameStore } from '../src/persistence/memory-store.js';

test('記憶體存檔具有revision並回傳防止誤改的複本', async () => {
  const store = new MemoryGameStore();
  const state = createGame({ id: 'save-test', ownerId: 'player-1' });
  const created = await store.createSession(state);
  created.state.player.hp = 1;

  const loaded = await store.getSession(state.id);
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.state.player.hp, 45);

  loaded.state.player.hp = 40;
  const saved = await store.saveSession(loaded.state, { expectedRevision: 1 });
  assert.equal(saved.revision, 2);
  assert.equal(saved.state.player.hp, 40);

  await assert.rejects(
    store.saveSession(saved.state, { expectedRevision: 1 }),
    StoreConflictError,
  );
});

test('可依Discord玩家ID找回進行中的戰鬥與永久資料', async () => {
  const store = new MemoryGameStore();
  const state = createGame({ id: 'resume-test', ownerId: 'player-1' });
  await store.createSession(state);

  const session = await store.findActiveSessionByOwner('player-1');
  const profile = await store.getOrCreateProfile('player-1');

  assert.equal(session.state.id, 'resume-test');
  assert.deepEqual(profile.profile.unlockedStartingSkillIds, ['life-recovery']);
  assert.deepEqual(profile.profile.lastStartingLoadout.itemIds, ['healing-potion']);

  await assert.rejects(
    store.createSession(createGame({ id: 'duplicate', ownerId: 'player-1' })),
    StoreConflictError,
  );
});

test('存檔工廠只有在兩個Apps Script設定都存在時才切換後端', () => {
  assert.equal(createGameStore({}).kind, 'memory');
  assert.throws(
    () => createGameStore({ APPS_SCRIPT_URL: 'https://example.com' }),
    /必須同時設定/,
  );
});

test('Apps Script存檔會帶入伺服器端密鑰並解析回傳資料', async () => {
  const requests = [];
  const store = new AppsScriptGameStore({
    url: 'https://script.google.com/example',
    secret: 'server-secret',
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        ok: true,
        session: { state: { id: 'remote' }, revision: 3 },
      }));
    },
  });

  const session = await store.getSession('remote');
  assert.equal(session.revision, 3);
  assert.deepEqual(requests[0].body, {
    action: 'getSession',
    secret: 'server-secret',
    gameId: 'remote',
  });
});

test('Apps Script的版本衝突會轉成可辨識錯誤', async () => {
  const store = new AppsScriptGameStore({
    url: 'https://script.google.com/example',
    secret: 'server-secret',
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      error: { code: 'conflict', message: '版本不一致' },
    })),
  });

  await assert.rejects(store.getSession('remote'), StoreConflictError);
});
