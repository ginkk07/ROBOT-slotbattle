import { randomUUID } from 'node:crypto';

import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from 'discord.js';

import { COMMAND_NAME } from './discord/commands.js';
import { renderGame, renderRules } from './discord/render.js';
import {
  abandonGame,
  createGame,
  endBetting,
  placeBet,
} from './game/engine.js';

const token = requiredEnvironment('DISCORD_TOKEN');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const games = new Map();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`拉霸戰鬥已上線：${readyClient.user.tag}`);
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

  if (subcommand === 'start') {
    const id = randomUUID().replaceAll('-', '').slice(0, 10);
    const game = createGame({ id, ownerId: interaction.user.id });
    games.set(id, { state: game, busy: false });
    await interaction.reply(renderGame(game));
  }
}

async function handleButton(interaction) {
  const [namespace, gameId, action, value] = interaction.customId.split(':');
  if (namespace !== 'slotbattle') return;

  const session = games.get(gameId);
  if (!session) {
    await interaction.reply({
      content: '這場遊戲已經失效，請使用 `/slotbattle start` 重新開始。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== session.state.ownerId) {
    await interaction.reply({
      content: '這是其他玩家的戰鬥面板。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (session.busy) {
    await interaction.reply({
      content: '上一個操作仍在處理中，請稍後再試。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  session.busy = true;
  try {
    await interaction.deferUpdate();
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
      next = createGame({ id: gameId, ownerId: session.state.ownerId });
    } else {
      throw new Error('未知的按鈕操作');
    }

    session.state = next;
    await interaction.editReply(renderGame(next));
  } finally {
    session.busy = false;
  }
}

async function safelyReportError(interaction, error) {
  const content = `操作失敗：${error instanceof Error ? error.message : '未知錯誤'}`;

  try {
    if (interaction.deferred || interaction.replied) {
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

await client.login(token);
