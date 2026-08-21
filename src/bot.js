import { randomUUID } from 'node:crypto';

import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from 'discord.js';

import { COMMAND_NAME } from './discord/commands.js';
import { renderGame, renderProfile, renderRules } from './discord/render.js';
import {
  abandonGame,
  createGame,
  endBetting,
  placeBet,
} from './game/engine.js';
import { startHealthServer } from './health-server.js';
import { StoreConflictError } from './persistence/errors.js';
import { createGameStore } from './persistence/game-store.js';

const token = requiredEnvironment('DISCORD_TOKEN');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const store = createGameStore();
const busyGames = new Set();

startHealthServer({ isReady: () => client.isReady() });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`拉霸戰鬥已上線：${readyClient.user.tag}（${store.kind}存檔）`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (error) {
    console.error(error);
    await safelyReportError(interaction, error);
  }
});

async function handleCommand(interaction) {
  if (interaction.commandName !== COMMAND_NAME) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'rules') {
    await interaction.reply({
      ...renderRules(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'profile') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const profile = await store.getOrCreateProfile(interaction.user.id);
    await interaction.editReply(renderProfile(profile));
    return;
  }

  if (subcommand === 'resume') {
    await interaction.deferReply();
    const session = await store.findActiveSessionByOwner(interaction.user.id);
    if (!session) {
      await interaction.editReply('目前沒有進行中的戰鬥，請使用 `/slotbattle start`。');
      return;
    }

    await interaction.editReply(renderGame(session.state));
    return;
  }

  if (subcommand === 'start') {
    await interaction.deferReply();
    const existing = await store.findActiveSessionByOwner(interaction.user.id);
    if (existing) {
      await interaction.editReply({
        content: '你已有進行中的戰鬥，已替你重新顯示。',
        ...renderGame(existing.state),
      });
      return;
    }

    const profileRecord = await store.getOrCreateProfile(interaction.user.id);
    const id = randomUUID().replaceAll('-', '').slice(0, 10);
    const game = createGame({
      id,
      ownerId: interaction.user.id,
      loadout: profileRecord.profile.lastStartingLoadout,
    });
    let session;
    try {
      session = await store.createSession(game);
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      session = await store.findActiveSessionByOwner(interaction.user.id);
      if (!session) throw error;
    }
    await interaction.editReply(renderGame(session.state));
  }
}

async function handleButton(interaction) {
  const [namespace, gameId, action, value] = interaction.customId.split(':');
  if (namespace !== 'slotbattle') return;

  await interaction.deferUpdate();

  if (busyGames.has(gameId)) {
    await interaction.followUp({
      content: '上一個操作仍在處理中，請稍後再試。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  busyGames.add(gameId);
  try {
    const session = await store.getSession(gameId);
    if (!session) {
      await interaction.followUp({
        content: '這場遊戲已經失效，請使用 `/slotbattle start` 重新開始。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.user.id !== session.state.ownerId) {
      await interaction.followUp({
        content: '這是其他玩家的戰鬥面板。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let next;

    if (action === 'bet') {
      const wager = value === 'all'
        ? session.state.resources.action
        : Number.parseInt(value, 10);
      next = placeBet(session.state, wager);
    } else if (action === 'end') {
      next = endBetting(session.state);
    } else if (action === 'abandon') {
      next = abandonGame(session.state);
    } else if (action === 'restart') {
      next = createGame({
        id: gameId,
        ownerId: session.state.ownerId,
        loadout: loadoutFromState(session.state),
      });
    } else {
      throw new Error('未知的按鈕操作');
    }

    const saved = await store.saveSession(next, {
      expectedRevision: session.revision,
    });
    await interaction.editReply(renderGame(saved.state));
  } catch (error) {
    if (error instanceof StoreConflictError) {
      const latest = await store.getSession(gameId);
      if (latest) await interaction.editReply(renderGame(latest.state));
      await interaction.followUp({
        content: '這場戰鬥剛被另一個操作更新，已顯示最新狀態。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    throw error;
  } finally {
    busyGames.delete(gameId);
  }
}

async function safelyReportError(interaction, error) {
  const content = `操作失敗：${error instanceof Error ? error.message : '未知錯誤'}`;

  try {
    if (interaction.isButton() && (interaction.deferred || interaction.replied)) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else if (interaction.deferred) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else if (interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (reportError) {
    console.error('無法回報互動錯誤：', reportError);
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
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

await client.login(token);
