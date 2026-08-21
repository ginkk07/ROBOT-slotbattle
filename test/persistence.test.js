import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/game/engine.js';
import { AppsScriptGameStore } from '../src/persistence/apps-script-store.js';
import { StoreConflictError } from '../src/persistence/errors.js';
import { createGameStore } from '../src/persistence/game-store.js';
import { MemoryGameStore } from '../src/persistence/memory-store.js';
import { ProfileMirrorGameStore } from '../src/persistence/profile-mirror-store.js';

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
  assert.deepEqual(profile.profile.unlockedStartingSkillIds, [
    'life-recovery',
    'power-strike',
    'fire-imbue',
  ]);
  assert.deepEqual(profile.profile.unlockedStartingItemIds, [
    'healing-potion',
    'fire-bomb',
    'flame-sword',
  ]);
  assert.deepEqual(profile.profile.lastStartingLoadout.itemIds, ['healing-potion']);

  await assert.rejects(
    store.createSession(createGame({ id: 'duplicate', ownerId: 'player-1' })),
    StoreConflictError,
  );
});

test('存檔工廠會優先使用D1，並保留本機與Apps Script備用模式', () => {
  assert.equal(createGameStore({}).kind, 'memory');
  const database = { prepare() {} };
  assert.equal(createGameStore({ DB: database }).kind, 'd1');
  assert.equal(createGameStore({
    DB: database,
    APPS_SCRIPT_URL: 'https://example.com',
    APPS_SCRIPT_SECRET: 'secret',
  }).kind, 'd1+google-mirror');
  assert.throws(
    () => createGameStore({ APPS_SCRIPT_URL: 'https://example.com' }),
    /必須同時設定/,
  );
});

test('Google鏡像只在D1新建或更新玩家時排入背景工作', async () => {
  const primary = new MemoryGameStore();
  primary.kind = 'd1';
  const originalGetOrCreate = primary.getOrCreateProfile.bind(primary);
  primary.getOrCreateProfile = async (playerId) => {
    const existed = primary.profiles.has(playerId);
    return { ...await originalGetOrCreate(playerId), created: !existed };
  };

  const synced = [];
  const queued = [];
  const store = new ProfileMirrorGameStore({
    primary,
    mirror: {
      async syncProfile(profile, metadata) {
        synced.push({ profile, metadata });
      },
    },
    enqueue: (task) => queued.push(task),
  });

  const created = await store.getOrCreateProfile('player-1');
  await Promise.all(queued.splice(0));
  assert.equal(created.created, true);
  assert.equal(synced.length, 1);
  assert.equal(synced[0].metadata.revision, 1);

  await store.getOrCreateProfile('player-1');
  assert.equal(queued.length, 0);

  created.profile.startingSkillSlots = 4;
  await store.saveProfile(created.profile, { expectedRevision: 1 });
  await Promise.all(queued.splice(0));
  assert.equal(synced.length, 2);
  assert.equal(synced[1].metadata.revision, 2);
});

test('Google背景同步失敗不會讓D1玩家操作失敗', async () => {
  const primary = new MemoryGameStore();
  primary.kind = 'd1';
  const originalGetOrCreate = primary.getOrCreateProfile.bind(primary);
  primary.getOrCreateProfile = async (playerId) => ({
    ...await originalGetOrCreate(playerId),
    created: true,
  });

  const queued = [];
  const errors = [];
  const store = new ProfileMirrorGameStore({
    primary,
    mirror: {
      async syncProfile() {
        throw new Error('Google 暫時無法連線');
      },
    },
    enqueue: (task) => queued.push(task),
    onMirrorError: (error) => errors.push(error),
  });

  const profile = await store.getOrCreateProfile('player-1');
  await Promise.all(queued);

  assert.equal(profile.profile.playerId, 'player-1');
  assert.equal(errors[0].message, 'Google 暫時無法連線');
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

test('Apps Script玩家鏡像會帶入D1版本與更新時間', async () => {
  const requests = [];
  const store = new AppsScriptGameStore({
    url: 'https://script.google.com/example',
    secret: 'server-secret',
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        ok: true,
        profile: { profile: { playerId: 'player-1' }, revision: 2 },
      }));
    },
  });

  await store.syncProfile({ playerId: 'player-1' }, {
    revision: 2,
    updatedAt: '2026-08-21T08:00:00.000Z',
  });
  assert.deepEqual(requests[0].body, {
    action: 'syncProfile',
    secret: 'server-secret',
    profile: { playerId: 'player-1' },
    revision: 2,
    updatedAt: '2026-08-21T08:00:00.000Z',
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
