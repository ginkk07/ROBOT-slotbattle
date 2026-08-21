import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import { createGame } from '../src/game/engine.js';
import { D1GameStore } from '../src/persistence/d1-store.js';
import { StoreConflictError } from '../src/persistence/errors.js';

const MIGRATION_URL = new URL('../migrations/0001_initial.sql', import.meta.url);
const NOW = '2026-08-21T08:00:00.000Z';

test('D1會建立、讀取並以revision更新戰鬥', async (context) => {
  const { database, store } = await createStore(context);
  const state = createGame({ id: 'd1-game', ownerId: 'player-1' });
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

  const row = await database.prepare(`
    SELECT revision, state_json FROM slotbattle_sessions WHERE game_id = ?
  `).bind('d1-game').first();
  assert.equal(Number(row.revision), 2);
  assert.equal(JSON.parse(row.state_json).player.hp, 40);
});

test('D1只允許每位玩家有一場進行中的戰鬥', async (context) => {
  const { store } = await createStore(context);
  await store.createSession(createGame({ id: 'first', ownerId: 'player-1' }));

  const active = await store.findActiveSessionByOwner('player-1');
  assert.equal(active.state.id, 'first');

  await assert.rejects(
    store.createSession(createGame({ id: 'second', ownerId: 'player-1' })),
    StoreConflictError,
  );
});

test('D1會建立永久玩家資料並防止舊版本覆寫', async (context) => {
  const { store } = await createStore(context);
  const created = await store.getOrCreateProfile('player-1');

  assert.equal(created.created, true);
  assert.equal(created.revision, 1);
  assert.deepEqual(created.profile.unlockedStartingSkillIds, ['life-recovery']);

  const loaded = await store.getOrCreateProfile('player-1');
  assert.equal(loaded.created, false);

  loaded.profile.startingItemSlots = 3;
  const saved = await store.saveProfile(loaded.profile, { expectedRevision: 1 });
  assert.equal(saved.revision, 2);
  assert.equal(saved.profile.startingItemSlots, 3);

  await assert.rejects(
    store.saveProfile(saved.profile, { expectedRevision: 1 }),
    StoreConflictError,
  );
});

async function createStore(context) {
  const database = new SqliteD1Database();
  context.after(() => database.close());
  await database.exec(await readFile(MIGRATION_URL, 'utf8'));
  return {
    database,
    store: new D1GameStore({ database, now: () => NOW }),
  };
}

class SqliteD1Database {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async exec(sql) {
    this.database.exec(sql);
    return { count: 1, duration: 0 };
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.database.prepare(sql));
  }

  close() {
    this.database.close();
  }
}

class SqliteD1PreparedStatement {
  constructor(statement) {
    this.statement = statement;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first(column) {
    const row = this.statement.get(...this.values) ?? null;
    return column && row ? row[column] : row;
  }

  async all() {
    return {
      success: true,
      results: this.statement.all(...this.values),
      meta: { changes: 0 },
    };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    };
  }
}
