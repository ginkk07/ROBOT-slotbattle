import { REST, Routes } from 'discord.js';

import { commands } from '../src/discord/commands.js';

const token = requiredEnvironment('DISCORD_TOKEN');
const clientId = requiredEnvironment('DISCORD_CLIENT_ID');
const guildId = process.env.DISCORD_GUILD_ID?.trim();
const rest = new REST({ version: '10' }).setToken(token);
const body = commands.map((command) => command.toJSON());

if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log('測試伺服器的斜線指令已更新。');
} else {
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log('全域斜線指令已送出更新。');
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}
