import { createDefaultProfile } from '../player/profile.js';
import { StoreConflictError, StoreNotFoundError } from './errors.js';

export class AppsScriptGameStore {
  constructor({ url, secret, fetchImpl = fetch, timeoutMs = 8000 }) {
    if (!url || !secret) {
      throw new TypeError('Apps Script 存檔需要 url 與 secret');
    }

    this.url = url;
    this.secret = secret;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.kind = 'apps-script';
  }

  async createSession(state) {
    const result = await this.request('createSession', { state });
    return result.session;
  }

  async getSession(gameId) {
    const result = await this.request('getSession', { gameId });
    return result.session;
  }

  async saveSession(state, { expectedRevision } = {}) {
    const result = await this.request('saveSession', {
      state,
      expectedRevision,
    });
    return result.session;
  }

  async findActiveSessionByOwner(ownerId) {
    const result = await this.request('findActiveSessionByOwner', { ownerId });
    return result.session;
  }

  async getOrCreateProfile(playerId) {
    const result = await this.request('getOrCreateProfile', {
      playerId,
      defaultProfile: createDefaultProfile(playerId),
    });
    return result.profile;
  }

  async saveProfile(profile, { expectedRevision } = {}) {
    const result = await this.request('saveProfile', {
      profile,
      expectedRevision,
    });
    return result.profile;
  }

  async syncProfile(profile, { revision, updatedAt } = {}) {
    const result = await this.request('syncProfile', {
      profile,
      revision,
      updatedAt,
    });
    return result.profile;
  }

  async request(action, payload) {
    let response;
    try {
      response = await this.fetch(this.url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, secret: this.secret, ...payload }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`無法連線至 Apps Script：${error.message}`, { cause: error });
    }

    if (!response.ok) {
      throw new Error(`Apps Script 回傳 HTTP ${response.status}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error('Apps Script 未回傳合法 JSON', { cause: error });
    }

    if (result.ok) return result;
    if (result.error?.code === 'conflict') {
      throw new StoreConflictError(result.error.message);
    }
    if (result.error?.code === 'not_found') {
      throw new StoreNotFoundError(result.error.message);
    }

    throw new Error(result.error?.message ?? 'Apps Script 存檔失敗');
  }
}
