import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from 'discord.js';

import { createGameController } from './discord/game-controller.js';
import { startHealthServer } from './health-server.js';
import { createGameStore } from './persistence/game-store.js';

const token = requiredEnvironment('DISCORD_TOKEN');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const store = createGameStore();
const controller = createGameController({ store });

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
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'rules') {
    const result = await controller.handleCommand({
      commandName: interaction.commandName,
      subcommand,
      userId: interaction.user.id,
    });
    if (!result.handled) return;

    await interaction.reply({
      ...result.payload,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({
    ...(subcommand === 'profile' ? { flags: MessageFlags.Ephemeral } : {}),
  });
  const result = await controller.handleCommand({
    commandName: interaction.commandName,
    subcommand,
    userId: interaction.user.id,
  });
  if (!result.handled) return;

  await interaction.editReply(result.payload);
}

async function handleButton(interaction) {
  await interaction.deferUpdate();
  const result = await controller.handleButton({
    customId: interaction.customId,
    userId: interaction.user.id,
  });
  if (!result.handled) return;

  if (result.payload) await interaction.editReply(result.payload);
  for (const followUp of result.followUps) {
    await interaction.followUp(followUp);
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

await client.login(token);
