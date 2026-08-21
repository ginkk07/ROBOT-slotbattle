export class ProfileMirrorGameStore {
  constructor({
    primary,
    mirror,
    enqueue = () => {},
    onMirrorError = (error) => console.error('Google 玩家資料同步失敗：', error),
  } = {}) {
    if (!primary || !mirror?.syncProfile) {
      throw new TypeError('玩家資料鏡像需要 primary 與 mirror');
    }

    this.primary = primary;
    this.mirror = mirror;
    this.enqueue = enqueue;
    this.onMirrorError = onMirrorError;
    this.kind = `${primary.kind}+google-mirror`;
  }

  createSession(state) {
    return this.primary.createSession(state);
  }

  getSession(gameId) {
    return this.primary.getSession(gameId);
  }

  saveSession(state, options) {
    return this.primary.saveSession(state, options);
  }

  findActiveSessionByOwner(ownerId) {
    return this.primary.findActiveSessionByOwner(ownerId);
  }

  async getOrCreateProfile(playerId) {
    const record = await this.primary.getOrCreateProfile(playerId);
    if (record.created) this.queueProfileSync(record);
    return record;
  }

  async saveProfile(profile, options) {
    const record = await this.primary.saveProfile(profile, options);
    this.queueProfileSync(record);
    return record;
  }

  queueProfileSync(record) {
    const task = Promise.resolve()
      .then(() => this.mirror.syncProfile(record.profile, {
        revision: record.revision,
        updatedAt: record.updatedAt,
      }))
      .catch(this.onMirrorError);

    this.enqueue(task);
  }
}
