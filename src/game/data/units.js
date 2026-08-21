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
      attack: 0,
      defense: 0,
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
    stats: { maxHp: 30, attack: 8, defense: 0, actionPoints: 0 },
    attackPattern: [7, 9],
    skillIds: ['guardian-strike'],
    damageResistances: { poison: 0.25 },
    statusOverrides: {},
    lootTableId: 'ruins-common-loot',
    encounterWeight: 30,
  },
  {
    id: 'elite-ruins-sentinel',
    name: '強化遺跡哨兵',
    rank: UnitRank.ELITE,
    tags: ['enemy', 'elite', 'construct', 'ruins', 'armored'],
    stats: { maxHp: 45, attack: 12, defense: 2, actionPoints: 0 },
    attackPattern: [9, 12, 14],
    skillIds: ['guardian-strike'],
    damageResistances: { physical: 0.1, poison: 0.5 },
    statusOverrides: {
      stunned: { mode: 'reduced', chanceMultiplier: 0.5 },
    },
    lootTableId: 'ruins-elite-loot',
    encounterWeight: 10,
  },
  {
    id: 'ruins-guardian',
    name: '遺跡守衛',
    rank: UnitRank.BOSS,
    tags: ['enemy', 'boss', 'construct', 'ruins', 'armored'],
    stats: { maxHp: 60, attack: 15, defense: 0, actionPoints: 0 },
    attackPattern: [15, 17, 20, 22],
    skillIds: ['guardian-strike'],
    damageResistances: { physical: 0, fire: 0.25, poison: 0.5 },
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
