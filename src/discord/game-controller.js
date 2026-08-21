import { COMMAND_NAME } from './commands.js';
import {
  renderGame,
  renderProfile,
  renderRules,
  renderWagerModal,
  WAGER_INPUT_ID,
} from './render.js';
import {
  abandonGame,
  activateSkill,
  createGame,
  endPlayerTurn,
  isStunned,
  placeBet,
  upgradeGameState,
  useItem,
} from '../game/engine.js';
import { StoreConflictError } from '../persistence/errors.js';
import { upgradePlayerProfile } from '../player/profile.js';

export const EPHEMERAL_FLAG = 64;

export function createGameController({
  store,
  idGenerator = createGameId,
  spinRng,
} = {}) {
  if (!store) throw new TypeError('建立遊戲控制器需要 store');

  const busyGames = new Set();
  const busyProfiles = new Set();

  const controller = {
    async handleCommand({ commandName, subcommand, userId }) {
      if (commandName !== COMMAND_NAME) return { handled: false };
      requireUserId(userId);

      if (subcommand === 'rules') {
        return handledResult(renderRules(), { ephemeral: true });
      }

      if (subcommand === 'profile') {
        const profile = await ensureCurrentProfile(store, userId);
        return handledResult(renderProfile(profile), { ephemeral: true });
      }

      if (subcommand === 'resume') {
        const found = await store.findActiveSessionByOwner(userId);
        if (!found) {
          return handledResult({
            content: '目前沒有進行中的戰鬥，請使用 `/slotbattle start`。',
          });
        }
        const session = await ensureCurrentSession(store, found);
        return handledResult(renderGame(session.state));
      }

      if (subcommand === 'start') {
        const existing = await store.findActiveSessionByOwner(userId);
        if (existing) {
          const session = await ensureCurrentSession(store, existing);
          return handledResult({
            content: '你已有進行中的戰鬥，已替你重新顯示。',
            ...renderGame(session.state),
          });
        }

        const profileRecord = await ensureCurrentProfile(store, userId);
        const game = createGame({
          id: idGenerator(),
          ownerId: userId,
          loadout: profileRecord.profile.lastStartingLoadout,
        });
        let session;
        try {
          session = await store.createSession(game);
        } catch (error) {
          if (!(error instanceof StoreConflictError)) throw error;
          session = await store.findActiveSessionByOwner(userId);
          if (!session) throw error;
          session = await ensureCurrentSession(store, session);
        }
        return handledResult(renderGame(session.state));
      }

      throw new Error(`未知的子指令：${subcommand ?? '未提供'}`);
    },

    async handleComponent({ customId, userId, values = [] }) {
      requireUserId(userId);

      if (customId?.startsWith('slotbattle-profile:')) {
        return handleProfileSelection({
          store,
          busyProfiles,
          customId,
          userId,
          values,
        });
      }

      const parsed = parseGameCustomId(customId);
      if (!parsed) return { handled: false };
      const { gameId, action, value } = parsed;

      return withGameLock({ busyGames, gameId }, async () => {
        const session = await ownedCurrentSession(store, gameId, userId);

        if (action === 'wager') {
          if (isStunned(session.state)) {
            throw new Error('暈眩中只能按「回合結束」');
          }
          if (session.state.resources.action < 1) {
            throw new Error('本回合已沒有行動點，可以使用技能或結束回合');
          }
          return handledResult(null, { modal: renderWagerModal(session.state) });
        }

        const next = nextStateForAction(session.state, { action, value });
        return saveAndRender(store, session, next);
      });
    },

    async handleModal({ customId, userId, fields = {} }) {
      requireUserId(userId);
      const parsed = parseGameCustomId(customId);
      if (!parsed) return { handled: false };
      if (parsed.action !== 'wager-submit') throw new Error('未知的輸入表單');

      return withGameLock({ busyGames, gameId: parsed.gameId }, async () => {
        const session = await ownedCurrentSession(store, parsed.gameId, userId);
        const rawWager = String(fields[WAGER_INPUT_ID] ?? '').trim();
        if (!/^\d+$/.test(rawWager)) {
          throw new RangeError('請輸入不含小數點的正整數');
        }
        const next = placeBet(session.state, Number(rawWager), { rng: spinRng });
        return saveAndRender(store, session, next);
      });
    },
  };

  // 本機 Gateway 舊呼叫端仍可沿用此名稱。
  controller.handleButton = controller.handleComponent;
  return controller;
}

async function handleProfileSelection({
  store,
  busyProfiles,
  customId,
  userId,
  values,
}) {
  if (busyProfiles.has(userId)) {
    return handledResult(null, {
      followUps: [ephemeralMessage('上一個開局配置仍在保存，請稍後再試。')],
    });
  }

  busyProfiles.add(userId);
  try {
    const [, category] = customId.split(':');
    const selectedId = values[0];
    if (!selectedId) throw new Error('沒有收到選擇內容');

    const record = await ensureCurrentProfile(store, userId);
    const profile = structuredClone(record.profile);
    if (category === 'skill') {
      if (!profile.unlockedStartingSkillIds.includes(selectedId)) {
        throw new Error('這個技能尚未解鎖');
      }
      profile.lastStartingLoadout.skillIds = [selectedId];
    } else if (category === 'item') {
      if (!profile.unlockedStartingItemIds.includes(selectedId)) {
        throw new Error('這個道具尚未解鎖');
      }
      profile.lastStartingLoadout.itemIds = [selectedId];
    } else {
      throw new Error('未知的開局配置類型');
    }

    const saved = await store.saveProfile(profile, {
      expectedRevision: record.revision,
    });
    return handledResult(renderProfile(saved));
  } finally {
    busyProfiles.delete(userId);
  }
}

async function ownedCurrentSession(store, gameId, userId) {
  const found = await store.getSession(gameId);
  if (!found) {
    throw new Error('這場遊戲已經失效，請使用 `/slotbattle start` 重新開始');
  }
  if (userId !== found.state.ownerId) throw new Error('這是其他玩家的戰鬥面板');
  return ensureCurrentSession(store, found);
}

async function ensureCurrentSession(store, record) {
  const upgraded = upgradeGameState(record.state);
  if (sameJson(upgraded, record.state)) return record;
  return store.saveSession(upgraded, { expectedRevision: record.revision });
}

async function ensureCurrentProfile(store, userId) {
  const record = await store.getOrCreateProfile(userId);
  const upgraded = upgradePlayerProfile(record.profile, userId);
  if (sameJson(upgraded, record.profile)) return record;
  return store.saveProfile(upgraded, { expectedRevision: record.revision });
}

async function saveAndRender(store, session, next) {
  try {
    const saved = await store.saveSession(next, {
      expectedRevision: session.revision,
    });
    return handledResult(renderGame(saved.state));
  } catch (error) {
    if (!(error instanceof StoreConflictError)) throw error;
    const latest = await store.getSession(session.state.id);
    return handledResult(latest ? renderGame(upgradeGameState(latest.state)) : null, {
      followUps: [ephemeralMessage('戰鬥剛被另一個操作更新，已顯示最新狀態。')],
    });
  }
}

async function withGameLock({ busyGames, gameId }, callback) {
  if (busyGames.has(gameId)) {
    return handledResult(null, {
      followUps: [ephemeralMessage('上一個操作仍在處理中，請稍後再試。')],
    });
  }

  busyGames.add(gameId);
  try {
    return await callback();
  } finally {
    busyGames.delete(gameId);
  }
}

function nextStateForAction(state, { action, value }) {
  if (action === 'skill') return activateSkill(state, value);
  if (action === 'item') return useItem(state, value);
  if (action === 'end') return endPlayerTurn(state);
  if (action === 'abandon') return abandonGame(state);
  if (action === 'restart') {
    return createGame({
      id: state.id,
      ownerId: state.ownerId,
      loadout: loadoutFromState(state),
    });
  }
  throw new Error('未知的按鈕操作');
}

function handledResult(payload, {
  ephemeral = false,
  followUps = [],
  modal = null,
} = {}) {
  return {
    handled: true,
    payload,
    ephemeral,
    followUps,
    modal,
  };
}

function ephemeralMessage(content) {
  return { content, flags: EPHEMERAL_FLAG };
}

function parseGameCustomId(customId) {
  const [namespace, gameId, action, value] = customId?.split(':') ?? [];
  if (namespace !== 'slotbattle') return null;
  if (!gameId || !action) throw new Error('互動資料不完整');
  return { gameId, action, value };
}

function createGameId() {
  return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10);
}

function loadoutFromState(state) {
  if (state.initialLoadout) return structuredClone(state.initialLoadout);
  return {
    skillIds: [...state.player.skillIds],
    itemIds: [
      ...state.player.inventory.flatMap(({ itemId, quantity }) => (
        Array.from({ length: quantity }, () => itemId)
      )),
      ...Object.values(state.player.equipment ?? {}),
    ],
  };
}

function requireUserId(userId) {
  if (!userId) throw new TypeError('Discord 互動缺少玩家 ID');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
