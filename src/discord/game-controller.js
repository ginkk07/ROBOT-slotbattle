import { COMMAND_NAME } from './commands.js';
import { renderGame, renderProfile, renderRules } from './render.js';
import {
  abandonGame,
  createGame,
  endBetting,
  placeBet,
} from '../game/engine.js';
import { StoreConflictError } from '../persistence/errors.js';

export const EPHEMERAL_FLAG = 64;

export function createGameController({
  store,
  idGenerator = createGameId,
} = {}) {
  if (!store) throw new TypeError('建立遊戲控制器需要 store');

  const busyGames = new Set();

  return {
    async handleCommand({ commandName, subcommand, userId }) {
      if (commandName !== COMMAND_NAME) return { handled: false };
      if (!userId) throw new TypeError('Discord 互動缺少玩家 ID');

      if (subcommand === 'rules') {
        return handledResult(renderRules(), { ephemeral: true });
      }

      if (subcommand === 'profile') {
        const profile = await store.getOrCreateProfile(userId);
        return handledResult(renderProfile(profile), { ephemeral: true });
      }

      if (subcommand === 'resume') {
        const session = await store.findActiveSessionByOwner(userId);
        if (!session) {
          return handledResult({
            content: '目前沒有進行中的戰鬥，請使用 `/slotbattle start`。',
          });
        }

        return handledResult(renderGame(session.state));
      }

      if (subcommand === 'start') {
        const existing = await store.findActiveSessionByOwner(userId);
        if (existing) {
          return handledResult({
            content: '你已有進行中的戰鬥，已替你重新顯示。',
            ...renderGame(existing.state),
          });
        }

        const profileRecord = await store.getOrCreateProfile(userId);
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
        }

        return handledResult(renderGame(session.state));
      }

      throw new Error(`未知的子指令：${subcommand ?? '未提供'}`);
    },

    async handleButton({ customId, userId }) {
      if (!userId) throw new TypeError('Discord 互動缺少玩家 ID');

      const [namespace, gameId, action, value] = customId?.split(':') ?? [];
      if (namespace !== 'slotbattle') return { handled: false };
      if (!gameId || !action) throw new Error('按鈕資料不完整');

      if (busyGames.has(gameId)) {
        return handledResult(null, {
          followUps: [ephemeralMessage('上一個操作仍在處理中，請稍後再試。')],
        });
      }

      busyGames.add(gameId);
      try {
        const session = await store.getSession(gameId);
        if (!session) {
          return handledResult(null, {
            followUps: [ephemeralMessage(
              '這場遊戲已經失效，請使用 `/slotbattle start` 重新開始。',
            )],
          });
        }

        if (userId !== session.state.ownerId) {
          return handledResult(null, {
            followUps: [ephemeralMessage('這是其他玩家的戰鬥面板。')],
          });
        }

        const next = nextStateForAction(session.state, { action, value });
        const saved = await store.saveSession(next, {
          expectedRevision: session.revision,
        });
        return handledResult(renderGame(saved.state));
      } catch (error) {
        if (!(error instanceof StoreConflictError)) throw error;

        const latest = await store.getSession(gameId);
        return handledResult(latest ? renderGame(latest.state) : null, {
          followUps: [ephemeralMessage(
            '這場戰鬥剛被另一個操作更新，已顯示最新狀態。',
          )],
        });
      } finally {
        busyGames.delete(gameId);
      }
    },
  };
}

function handledResult(payload, { ephemeral = false, followUps = [] } = {}) {
  return {
    handled: true,
    payload,
    ephemeral,
    followUps,
  };
}

function ephemeralMessage(content) {
  return { content, flags: EPHEMERAL_FLAG };
}

function nextStateForAction(state, { action, value }) {
  if (action === 'bet') {
    const wager = value === 'all'
      ? state.resources.action
      : Number.parseInt(value, 10);
    return placeBet(state, wager);
  }

  if (action === 'end') return endBetting(state);
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

function createGameId() {
  return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10);
}

function loadoutFromState(state) {
  if (state.initialLoadout) return structuredClone(state.initialLoadout);

  return {
    skillIds: [...state.player.skillIds],
    itemIds: state.player.inventory.flatMap(({ itemId, quantity }) => (
      Array.from({ length: quantity }, () => itemId)
    )),
  };
}
