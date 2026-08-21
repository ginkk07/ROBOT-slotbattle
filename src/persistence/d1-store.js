import { createDefaultProfile } from '../player/profile.js';
import { StoreConflictError, StoreNotFoundError } from './errors.js';

export class D1GameStore {
  constructor({ database, now = () => new Date().toISOString() } = {}) {
    if (!database?.prepare) {
      throw new TypeError('D1 存檔需要 Cloudflare DB binding');
    }

    this.database = database;
    this.now = now;
    this.kind = 'd1';
  }

  async createSession(state) {
    validateState(state);
    const updatedAt = this.now();

    try {
      await this.database.prepare(`
        INSERT INTO slotbattle_sessions (
          game_id, owner_id, status, state_json, revision, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?)
      `).bind(
        state.id,
        state.ownerId,
        state.status,
        JSON.stringify(state),
        updatedAt,
      ).run();
    } catch (error) {
      if (isConstraintError(error)) {
        throw new StoreConflictError('遊戲已存在，或玩家已有進行中的遊戲');
      }
      throw error;
    }

    return sessionRecord(state, 1, updatedAt);
  }

  async getSession(gameId) {
    const row = await this.database.prepare(`
      SELECT state_json, revision, updated_at
      FROM slotbattle_sessions
      WHERE game_id = ?
    `).bind(gameId).first();

    return row ? sessionFromRow(row) : null;
  }

  async saveSession(state, { expectedRevision } = {}) {
    validateState(state);
    const currentRevision = await this.resolveSessionRevision(
      state.id,
      expectedRevision,
    );
    const revision = currentRevision + 1;
    const updatedAt = this.now();
    let result;

    try {
      result = await this.database.prepare(`
        UPDATE slotbattle_sessions
        SET owner_id = ?,
            status = ?,
            state_json = ?,
            revision = ?,
            updated_at = ?
        WHERE game_id = ? AND revision = ?
      `).bind(
        state.ownerId,
        state.status,
        JSON.stringify(state),
        revision,
        updatedAt,
        state.id,
        currentRevision,
      ).run();
    } catch (error) {
      if (isConstraintError(error)) {
        throw new StoreConflictError('玩家已有另一場進行中的遊戲');
      }
      throw error;
    }

    if (changedRows(result) === 0) {
      await this.throwSessionUpdateError(state.id, currentRevision);
    }

    return sessionRecord(state, revision, updatedAt);
  }

  async findActiveSessionByOwner(ownerId) {
    const row = await this.database.prepare(`
      SELECT state_json, revision, updated_at
      FROM slotbattle_sessions
      WHERE owner_id = ? AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(ownerId).first();

    return row ? sessionFromRow(row) : null;
  }

  async getOrCreateProfile(playerId) {
    if (!playerId) throw new TypeError('玩家 ID 不可為空');

    const existing = await this.findProfile(playerId);
    if (existing) return { ...existing, created: false };

    const profile = createDefaultProfile(playerId);
    const updatedAt = this.now();
    const result = await this.database.prepare(`
      INSERT INTO slotbattle_profiles (
        player_id, profile_json, revision, updated_at
      ) VALUES (?, ?, 1, ?)
      ON CONFLICT(player_id) DO NOTHING
    `).bind(playerId, JSON.stringify(profile), updatedAt).run();

    if (changedRows(result) > 0) {
      return { ...profileRecord(profile, 1, updatedAt), created: true };
    }

    const concurrent = await this.findProfile(playerId);
    if (!concurrent) throw new Error('建立玩家資料後無法讀回');
    return { ...concurrent, created: false };
  }

  async saveProfile(profile, { expectedRevision } = {}) {
    if (!profile?.playerId) throw new TypeError('玩家資料不完整');

    const currentRevision = await this.resolveProfileRevision(
      profile.playerId,
      expectedRevision,
    );
    const revision = currentRevision + 1;
    const updatedAt = this.now();
    const result = await this.database.prepare(`
      UPDATE slotbattle_profiles
      SET profile_json = ?, revision = ?, updated_at = ?
      WHERE player_id = ? AND revision = ?
    `).bind(
      JSON.stringify(profile),
      revision,
      updatedAt,
      profile.playerId,
      currentRevision,
    ).run();

    if (changedRows(result) === 0) {
      await this.throwProfileUpdateError(profile.playerId, currentRevision);
    }

    return profileRecord(profile, revision, updatedAt);
  }

  async findProfile(playerId) {
    const row = await this.database.prepare(`
      SELECT profile_json, revision, updated_at
      FROM slotbattle_profiles
      WHERE player_id = ?
    `).bind(playerId).first();

    return row ? profileFromRow(row) : null;
  }

  async resolveSessionRevision(gameId, expectedRevision) {
    if (expectedRevision !== undefined) return Number(expectedRevision);

    const current = await this.getSession(gameId);
    if (!current) throw new StoreNotFoundError(`找不到遊戲 ${gameId}`);
    return current.revision;
  }

  async resolveProfileRevision(playerId, expectedRevision) {
    if (expectedRevision !== undefined) return Number(expectedRevision);

    const current = await this.findProfile(playerId);
    if (!current) throw new StoreNotFoundError(`找不到玩家 ${playerId}`);
    return current.revision;
  }

  async throwSessionUpdateError(gameId, attemptedRevision) {
    const current = await this.database.prepare(`
      SELECT revision FROM slotbattle_sessions WHERE game_id = ?
    `).bind(gameId).first();

    if (!current) throw new StoreNotFoundError(`找不到遊戲 ${gameId}`);
    throw new StoreConflictError(
      `資料版本不一致：目前${Number(current.revision)}，收到${attemptedRevision}`,
    );
  }

  async throwProfileUpdateError(playerId, attemptedRevision) {
    const current = await this.database.prepare(`
      SELECT revision FROM slotbattle_profiles WHERE player_id = ?
    `).bind(playerId).first();

    if (!current) throw new StoreNotFoundError(`找不到玩家 ${playerId}`);
    throw new StoreConflictError(
      `資料版本不一致：目前${Number(current.revision)}，收到${attemptedRevision}`,
    );
  }
}

function sessionFromRow(row) {
  return sessionRecord(
    parseJson(row.state_json, '戰鬥'),
    Number(row.revision),
    String(row.updated_at),
  );
}

function profileFromRow(row) {
  return profileRecord(
    parseJson(row.profile_json, '玩家'),
    Number(row.revision),
    String(row.updated_at),
  );
}

function sessionRecord(state, revision, updatedAt) {
  return {
    state: structuredClone(state),
    revision,
    updatedAt,
  };
}

function profileRecord(profile, revision, updatedAt) {
  return {
    profile: structuredClone(profile),
    revision,
    updatedAt,
  };
}

function parseJson(value, label) {
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`${label}存檔不是合法 JSON`, { cause: error });
  }
}

function validateState(state) {
  if (!state?.id || !state.ownerId || !state.status) {
    throw new TypeError('戰鬥資料不完整');
  }
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? 0);
}

function isConstraintError(error) {
  return /(?:unique|constraint failed)/i.test(error?.message ?? '');
}
