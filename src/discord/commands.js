import { SlashCommandBuilder } from 'discord.js';

export const COMMAND_NAME = 'slotbattle';

export const commands = [
  new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('拉霸戰鬥遊戲')
    .addSubcommand((subcommand) => subcommand
      .setName('start')
      .setDescription('開始一場單人 Boss 戰'))
    .addSubcommand((subcommand) => subcommand
      .setName('rules')
      .setDescription('查看目前的遊戲規則')),
];
