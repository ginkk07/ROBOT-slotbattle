export const COMMAND_NAME = 'slotbattle';

const SUBCOMMAND_TYPE = 1;

// 使用 Discord API 的純 JSON 格式，Gateway 與 HTTP Interactions 都能共用。
export const commands = [
  {
    type: 1,
    name: COMMAND_NAME,
    description: '拉霸戰鬥遊戲',
    options: [
      {
        type: SUBCOMMAND_TYPE,
        name: 'start',
        description: '開始一場單人 Boss 戰',
      },
      {
        type: SUBCOMMAND_TYPE,
        name: 'resume',
        description: '重新顯示尚未結束的戰鬥',
      },
      {
        type: SUBCOMMAND_TYPE,
        name: 'profile',
        description: '查看永久解鎖與開局攜帶欄位',
      },
      {
        type: SUBCOMMAND_TYPE,
        name: 'rules',
        description: '查看目前的遊戲規則',
      },
    ],
  },
];
