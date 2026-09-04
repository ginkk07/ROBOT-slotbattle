import { createCatalog, requireDefinition } from './catalog.js';

export const UnitRank = Object.freeze({
  PLAYER: 'player',
  NORMAL: 'normal',
  ELITE: 'elite',
  BOSS: 'boss',
});

export const UNITS = createCatalog([
  {
    id: 'wanderer',
    name: '冒險者',
    rank: UnitRank.PLAYER,
    tags: ['player', 'humanoid'],
    stats: {
      maxHp: 45,
      baseDamage: 0,
      baseDefense: 0,
      actionPoints: 4,
    },
    skillIds: ['life-recovery', 'power-strike', 'fire-imbue'],
    damageResistances: {},
    statusOverrides: {},
  },
  {
    id: 'ruins-sentinel',
    name: '遺跡哨兵',
    rank: UnitRank.NORMAL,
    tags: ['enemy', 'construct', 'ruins'],
    stats: { maxHp: 30, baseDamage: 8, baseDefense: 0, actionPoints: 0 },
    skillIds: ['guardian-strike'],
    damageResistances: {},
    statusOverrides: {},
    lootTableId: 'ruins-common-loot',
    encounterWeight: 30,
  },
  {
    id: 'elite-ruins-sentinel',
    name: '強化遺跡哨兵',
    rank: UnitRank.ELITE,
    tags: ['enemy', 'elite', 'construct', 'ruins', 'armored'],
    stats: { maxHp: 45, baseDamage: 12, baseDefense: 2, actionPoints: 0 },
    skillIds: ['guardian-strike', 'crushing-blow', 'armor-reinforcement'],
    damageResistances: {},
    statusOverrides: {
      stunned: { mode: 'reduced', chanceMultiplier: 0.5 },
    },
    lootTableId: 'ruins-elite-loot',
    encounterWeight: 10,
  },
  {
    id: 'ruins-mimic',
    name: '寶箱怪',
    rank: UnitRank.ELITE,
    tags: ['enemy', 'elite', 'mimic', 'construct', 'ruins', 'armored', 'event-only'],
    stats: { maxHp: 75, baseDamage: 12, baseDefense: 0, actionPoints: 0 },
    skillIds: ['armor-breaking-strike', 'armor-reinforcement'],
    requiredActiveSkillCount: 1,
    damageResistances: {},
    statusOverrides: {},
    lootTableId: 'ruins-elite-loot',
    encounterWeight: 0,
  },
  {
    id: 'ruins-guardian',
    name: '遺跡守衛',
    rank: UnitRank.BOSS,
    tags: ['enemy', 'boss', 'construct', 'ruins', 'armored'],
    stats: { maxHp: 60, baseDamage: 15, baseDefense: 0, actionPoints: 0 },
    skillIds: [
      'guardian-strike',
      'crushing-blow',
      'ruin-overload',
      'armor-reinforcement',
    ],
    damageResistances: {},
    statusOverrides: {
      frozen: { mode: 'immune' },
      stunned: { mode: 'reduced', durationMultiplier: 0.5 },
    },
    lootTableId: 'ruins-boss-loot',
    encounterWeight: 1,
  },
], '單位庫');

export function getUnit(unitId) {
  return requireDefinition(UNITS, unitId, '單位庫');
}
