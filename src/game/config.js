export const DEFAULT_CONFIG = Object.freeze({
  actionPointsPerRound: 4,
  maxSpinsPerRound: 3,
  playerMaxHp: 45,
  boss: Object.freeze({
    name: '遺跡守衛',
    maxHp: 60,
    attackPattern: Object.freeze([15, 17, 20, 22]),
  }),
  commands: Object.freeze({
    attackDamagePerPoint: 1,
    defensePerPoint: 1,
    skill: Object.freeze({
      id: 'life-recovery',
      name: '生命回復',
      healPerPoint: 2,
    }),
  }),
});

export function createConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    boss: {
      ...DEFAULT_CONFIG.boss,
      ...overrides.boss,
      attackPattern: [
        ...(overrides.boss?.attackPattern ?? DEFAULT_CONFIG.boss.attackPattern),
      ],
    },
    commands: {
      ...DEFAULT_CONFIG.commands,
      ...overrides.commands,
      skill: {
        ...DEFAULT_CONFIG.commands.skill,
        ...overrides.commands?.skill,
      },
    },
  };
}
