import { deepFreeze } from './data/catalog.js';
import { getSkill } from './data/skills.js';
import { getUnit } from './data/units.js';

const DEFAULT_PLAYER_UNIT_ID = 'wanderer';
const DEFAULT_BOSS_UNIT_ID = 'ruins-guardian';
const DEFAULT_SKILL_ID = 'life-recovery';

export const DEFAULT_CONFIG = deepFreeze(buildConfig());

export function createConfig(overrides = {}) {
  return buildConfig(overrides);
}

function buildConfig(overrides = {}) {
  const playerUnit = getUnit(overrides.playerUnitId ?? DEFAULT_PLAYER_UNIT_ID);
  const bossUnit = getUnit(overrides.bossUnitId ?? DEFAULT_BOSS_UNIT_ID);
  const requestedSkillId = overrides.skillId
    ?? overrides.commands?.skill?.id
    ?? playerUnit.skillIds[0]
    ?? DEFAULT_SKILL_ID;
  const skill = getSkill(requestedSkillId);
  const healEffect = skill.effects.find((effect) => effect.type === 'heal');
  const requestedHealPerPoint = overrides.commands?.skill?.healPerPoint;
  const skillEffects = structuredClone(
    overrides.commands?.skill?.effects ?? skill.effects,
  );

  if (requestedHealPerPoint !== undefined && !overrides.commands?.skill?.effects) {
    for (const effect of skillEffects) {
      if (effect.type === 'heal' && effect.amountPerPoint !== undefined) {
        effect.amountPerPoint = requestedHealPerPoint;
      }
    }
  }

  const boss = {
    unitId: bossUnit.id,
    name: bossUnit.name,
    rank: bossUnit.rank,
    tags: [...bossUnit.tags],
    maxHp: bossUnit.stats.maxHp,
    skillIds: [...bossUnit.skillIds],
    damageResistances: { ...bossUnit.damageResistances },
    statusOverrides: structuredClone(bossUnit.statusOverrides),
    lootTableId: bossUnit.lootTableId,
    encounterWeight: bossUnit.encounterWeight,
    ...overrides.boss,
    attackPattern: [
      ...(overrides.boss?.attackPattern ?? bossUnit.attackPattern),
    ],
  };

  const skillConfig = {
    id: skill.id,
    name: skill.name,
    emoji: skill.emoji,
    description: skill.description,
    effects: skillEffects,
    // 保留舊欄位，讓模擬器與既有設定在重構期間仍可使用。
    healPerPoint: requestedHealPerPoint ?? healEffect?.amountPerPoint ?? 0,
    ...overrides.commands?.skill,
  };

  return {
    actionPointsPerRound: overrides.actionPointsPerRound
      ?? playerUnit.stats.actionPoints,
    maxSpinsPerRound: overrides.maxSpinsPerRound ?? 3,
    playerUnitId: playerUnit.id,
    bossUnitId: bossUnit.id,
    skillId: skillConfig.id,
    playerMaxHp: overrides.playerMaxHp ?? playerUnit.stats.maxHp,
    boss,
    commands: {
      attackDamagePerPoint: 1,
      defensePerPoint: 1,
      ...overrides.commands,
      skill: skillConfig,
    },
  };
}
