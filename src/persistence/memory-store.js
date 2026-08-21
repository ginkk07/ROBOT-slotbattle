import { createDefaultProfile } from '../player/profile.js';
import { StoreConflictError, StoreNotFoundError } from './errors.js';

export class MemoryGameStore {
  constructor() {
    this.sessions = new Map();
    this.profiles = new Map();
    this.kind = 'memory';
  }

  async createSession(state) {
    if (this.sessions.has(state.id)) {
      throw new StoreConflictError(`遊戲 ${state.id} 已存在`);
    }
    const active = await this.findActiveSessionByOwner(state.ownerId);
    if (active) {
      throw new StoreConflictError(`玩家 ${state.ownerId} 已有進行中的遊戲`);
    }

    const record = sessionRecord(state, 1);
    this.sessions.set(state.id, record);
    return clone(record);
  }

  async getSession(gameId) {
    const record = this.sessions.get(gameId);
    return record ? clone(record) : null;
  }

  async saveSession(state, { expectedRevision } = {}) {
    const current = this.sessions.get(state.id);
    if (!current) throw new StoreNotFoundError(`找不到遊戲 ${state.id}`);
    assertRevision(current.revision, expectedRevision);

    const record = sessionRecord(state, current.revision + 1);
    this.sessions.set(state.id, record);
    return clone(record);
  }

  async findActiveSessionByOwner(ownerId) {
    const records = [...this.sessions.values()]
      .filter((record) => (
        record.state.ownerId === ownerId
        && record.state.status === 'active'
      ))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return records[0] ? clone(records[0]) : null;
  }

  async getOrCreateProfile(playerId) {
    const current = this.profiles.get(playerId);
    if (current) return clone(current);

    const record = profileRecord(createDefaultProfile(playerId), 1);
    this.profiles.set(playerId, record);
    return clone(record);
  }

  async saveProfile(profile, { expectedRevision } = {}) {
    const current = this.profiles.get(profile.playerId);
    if (!current) throw new StoreNotFoundError(`找不到玩家 ${profile.playerId}`);
    assertRevision(current.revision, expectedRevision);

    const record = profileRecord(profile, current.revision + 1);
    this.profiles.set(profile.playerId, record);
    return clone(record);
  }
}

function sessionRecord(state, revision) {
  return {
    state: clone(state),
    revision,
    updatedAt: new Date().toISOString(),
  };
}

function profileRecord(profile, revision) {
  return {
    profile: clone(profile),
    revision,
    updatedAt: new Date().toISOString(),
  };
}

function assertRevision(actual, expected) {
  if (expected !== undefined && actual !== expected) {
    throw new StoreConflictError(`資料版本不一致：目前${actual}，收到${expected}`);
  }
}

function clone(value) {
  return structuredClone(value);
}
