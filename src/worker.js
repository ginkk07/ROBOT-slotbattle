import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';

import { COMMAND_NAME } from './discord/commands.js';
import { createGameController } from './discord/game-controller.js';
import { createGameStore } from './persistence/game-store.js';

const INTERACTION_PATHS = new Set(['/', '/interactions']);
const REQUIRED_STRING_VARIABLES = Object.freeze([
  'DISCORD_PUBLIC_KEY',
  'APPS_SCRIPT_URL',
  'APPS_SCRIPT_SECRET',
]);

export function createWorker({
  verifyRequest = verifyKey,
  storeFactory = createGameStore,
  controllerFactory = createGameController,
} = {}) {
  return {
    async fetch(request, env, context) {
      const url = new URL(request.url);

      if (request.method === 'GET' && INTERACTION_PATHS.has(url.pathname)) {
        const missing = missingRuntimeVariables(env);
        return jsonResponse({
          ok: missing.length === 0,
          service: 'slotbattle-discord-worker',
          mode: 'http-interactions',
          storage: env.DB ? 'd1' : 'unavailable',
          profileMirror: (
            env.APPS_SCRIPT_URL?.trim() && env.APPS_SCRIPT_SECRET?.trim()
          ) ? 'google-sheets' : 'unavailable',
          ...(missing.length ? { missing } : {}),
        }, { status: missing.length ? 503 : 200 });
      }

      if (request.method !== 'POST' || !INTERACTION_PATHS.has(url.pathname)) {
        return jsonResponse({ ok: false, error: 'not_found' }, { status: 404 });
      }

      const publicKey = env.DISCORD_PUBLIC_KEY?.trim();
      if (!publicKey) {
        return jsonResponse({
          ok: false,
          error: 'missing_DISCORD_PUBLIC_KEY',
        }, { status: 503 });
      }

      const signature = request.headers.get('x-signature-ed25519') ?? '';
      const timestamp = request.headers.get('x-signature-timestamp') ?? '';
      const rawBody = await request.arrayBuffer();
      const verified = await verifyRequest(rawBody, signature, timestamp, publicKey);
      if (!verified) {
        return new Response('invalid request signature', { status: 401 });
      }

      let interaction;
      try {
        interaction = JSON.parse(new TextDecoder().decode(rawBody));
      } catch {
        return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 });
      }

      if (interaction.type === InteractionType.PING) {
        return interactionResponse(InteractionResponseType.PONG);
      }

      const missing = missingRuntimeVariables(env);
      if (missing.length) {
        return messageResponse({
          content: `機器人尚未完成設定：${missing.join('、')}`,
          flags: InteractionResponseFlags.EPHEMERAL,
        });
      }

      if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        return handleApplicationCommand({
          interaction,
          env,
          context,
          storeFactory,
          controllerFactory,
        });
      }

      if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        return handleMessageComponent({
          interaction,
          env,
          context,
          storeFactory,
          controllerFactory,
        });
      }

      return messageResponse({
        content: '目前不支援這種 Discord 互動。',
        flags: InteractionResponseFlags.EPHEMERAL,
      });
    },
  };
}

async function handleApplicationCommand({
  interaction,
  env,
  context,
  storeFactory,
  controllerFactory,
}) {
  const commandName = interaction.data?.name;
  const subcommand = interaction.data?.options?.find((option) => option.type === 1)?.name;

  if (commandName !== COMMAND_NAME) {
    return messageResponse({
      content: '未知的指令。',
      flags: InteractionResponseFlags.EPHEMERAL,
    });
  }

  try {
    const controller = controllerFactory({
      store: storeForRequest({ env, context, storeFactory }),
    });
    const result = await controller.handleCommand({
      commandName,
      subcommand,
      userId: userIdFor(interaction),
    });
    return messageResponse({
      ...result.payload,
      ...(result.ephemeral ? { flags: InteractionResponseFlags.EPHEMERAL } : {}),
    });
  } catch (error) {
    console.error('處理 Discord 指令失敗：', error);
    return messageResponse(errorPayload(error, { ephemeral: true }));
  }
}

async function handleMessageComponent({
  interaction,
  env,
  context,
  storeFactory,
  controllerFactory,
}) {
  try {
    const controller = controllerFactory({
      store: storeForRequest({ env, context, storeFactory }),
    });
    const result = await controller.handleButton({
      customId: interaction.data?.custom_id,
      userId: userIdFor(interaction),
    });

    if (result.payload) {
      return interactionResponse(
        InteractionResponseType.UPDATE_MESSAGE,
        result.payload,
      );
    }

    if (result.followUps.length) return messageResponse(result.followUps[0]);
    return interactionResponse(InteractionResponseType.DEFERRED_UPDATE_MESSAGE);
  } catch (error) {
    console.error('處理 Discord 按鈕失敗：', error);
    return messageResponse(errorPayload(error, { ephemeral: true }));
  }
}

function storeForRequest({ env, context, storeFactory }) {
  return storeFactory(env, {
    enqueue: (task) => schedule(context, task),
  });
}

function errorPayload(error, { ephemeral = false } = {}) {
  return {
    content: `操作失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
    embeds: [],
    components: [],
    ...(ephemeral ? { flags: InteractionResponseFlags.EPHEMERAL } : {}),
  };
}

function userIdFor(interaction) {
  return interaction.member?.user?.id ?? interaction.user?.id;
}

function missingRuntimeVariables(environment) {
  const missing = REQUIRED_STRING_VARIABLES.filter(
    (name) => !environment[name]?.trim(),
  );
  if (!environment.DB) missing.push('DB');
  return missing;
}

function schedule(context, promise) {
  if (!context?.waitUntil) {
    throw new Error('Cloudflare ExecutionContext 不可用');
  }
  context.waitUntil(promise);
}

function messageResponse(data) {
  return interactionResponse(
    InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data,
  );
}

function interactionResponse(type, data) {
  return jsonResponse({
    type,
    ...(data ? { data } : {}),
  });
}

function jsonResponse(value, { status = 200 } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default createWorker();
