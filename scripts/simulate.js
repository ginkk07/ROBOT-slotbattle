import { getSkill } from '../src/game/data/skills.js';
import { skillActionAvailability } from '../src/game/engines/action-availability.js';
import {
  activateSkill,
  chooseEventSkill,
  chooseEventWeapon,
  chooseEventOption,
  chooseReward,
  chooseVaultReward,
  completeEvent,
  confirmCombatVictory,
  continueWithoutReward,
  createGame,
  endPlayerTurn,
  GamePhase,
  GameStatus,
  isStunned,
  leaveShop,
  placeBet,
  searchAdventurerCorpse,
  spinCollectorEvent,
} from '../src/game/engine.js';

const requestedRuns = Number.parseInt(process.argv[2] ?? '100', 10);
const runs = Number.isInteger(requestedRuns) && requestedRuns > 0
  ? requestedRuns
  : 100;
const maxTurnsPerRun = optionalPositiveInteger('SLOT_SIM_MAX_TURNS') ?? 100;
const probabilityRng = createSeededRng(seedFromEnvironment());
const spinRng = (maximum) => Math.floor(probabilityRng() * maximum);
const config = simulationConfigFromEnvironment();

for (const strategy of ['all-in', 'split-twice', 'split-evenly']) {
  const summary = simulate(strategy, runs, maxTurnsPerRun);
  console.log([
    `${strategy}:`,
    `平均擊敗 ${(summary.unitsDefeated / runs).toFixed(2)} 個單位`,
    `平均到達地區 ${(summary.regionDepth / runs).toFixed(2)}`,
    `平均 ${((summary.turns / runs)).toFixed(2)} 回合`,
    `達到 ${maxTurnsPerRun} 回合上限 ${summary.cappedRuns} 局`,
  ].join(' '));
}

function simulate(strategy, iterations, turnLimit) {
  const summary = {
    unitsDefeated: 0,
    regionDepth: 0,
    turns: 0,
    cappedRuns: 0,
  };

  for (let index = 0; index < iterations; index += 1) {
    let turns = 0;
    let state = createGame({
      id: `sim-${index}`,
      ownerId: 'simulator',
      config,
      worldRng: probabilityRng,
      monsterRng: probabilityRng,
    });

    while (state.status === GameStatus.ACTIVE && turns < turnLimit) {
      if (state.phase === GamePhase.VICTORY_CONFIRM) {
        state = confirmCombatVictory(state, { rewardRng: probabilityRng });
        continue;
      }
      if (state.phase === GamePhase.REWARD_CHOICE) {
        state = state.rewardChoices.length
          ? chooseReward(state, 0, {
            worldRng: probabilityRng,
            monsterRng: probabilityRng,
          })
          : continueWithoutReward(state, {
            worldRng: probabilityRng,
            monsterRng: probabilityRng,
          });
        continue;
      }
      if (state.phase === GamePhase.EVENT) {
        if (state.event.stage === 'choice') {
          const option = state.event.options.find((entry) => (
            Number(entry.goldCost ?? 0) <= state.player.gold
            && (!entry.itemCost || state.player.inventory.some((stack) => (
              stack.itemId === entry.itemCost.itemId
              && stack.quantity >= entry.itemCost.quantity
            )))
          )) ?? state.event.options.find((entry) => entry.id === 'leave');
          state = chooseEventOption(state, option.id, {
            eventRng: probabilityRng,
            monsterRng: probabilityRng,
          });
        } else if ([
          'skill-upgrade-choice',
          'collector-wager-choice',
          'collector-replace-choice',
        ].includes(state.event.stage)) {
          state = chooseEventSkill(state, state.event.skillChoices[0], {
            eventRng: probabilityRng,
          });
        } else if (state.event.stage === 'weapon-upgrade-choice') {
          state = chooseEventWeapon(state, state.event.weaponChoices[0], {
            eventRng: probabilityRng,
          });
        } else if (state.event.stage === 'corpse-search') {
          state = searchAdventurerCorpse(state, {
            eventRng: probabilityRng,
            monsterRng: probabilityRng,
          });
        } else if (state.event.stage === 'collector-spin') {
          state = spinCollectorEvent(state, 'none', {
            eventRng: probabilityRng,
          });
        } else if (state.event.stage === 'vault-reward-choice') {
          state = chooseVaultReward(state, 'accept');
        } else if (state.event.stage === 'shop') {
          state = leaveShop(state);
        } else {
          state = completeEvent(state, {
            worldRng: probabilityRng,
            monsterRng: probabilityRng,
          });
        }
        continue;
      }

      for (const wager of wagersFor(strategy, state.resources.action)) {
        if (state.status !== GameStatus.ACTIVE || isStunned(state)) break;
        state = placeBet(state, wager, {
          rng: spinRng,
          rewardRng: probabilityRng,
        });
        if (state.phase !== GamePhase.PLAYER_TURN) break;
        state = useHealingWhenPossible(state);
      }
      if (state.phase === GamePhase.PLAYER_TURN) {
        state = endPlayerTurn(state, {
          monsterRng: probabilityRng,
          rewardRng: probabilityRng,
        });
        turns += 1;
      }
    }

    summary.unitsDefeated += state.endSummary?.defeatedUnitCount
      ?? state.adventure?.defeatedUnitCount
      ?? 0;
    summary.regionDepth += state.endSummary?.finalRegionDepth
      ?? state.adventure?.regionDepth
      ?? 1;
    summary.turns += turns;
    if (state.status === GameStatus.ACTIVE && turns >= turnLimit) {
      summary.cappedRuns += 1;
    }
  }

  return summary;
}

function wagersFor(strategy, available) {
  if (strategy === 'all-in') return [available];
  if (strategy === 'split-twice') {
    const first = Math.ceil(available / 2);
    return [first, available - first].filter(Boolean);
  }
  return Array.from({ length: available }, () => 1);
}

function useHealingWhenPossible(state) {
  const skillId = state.player.skillIds.find((id) => id === 'life-recovery');
  if (!skillId) return state;
  const skill = getSkill(skillId);
  let next = state;
  while (
    next.status === GameStatus.ACTIVE
    && next.phase === GamePhase.PLAYER_TURN
    && !isStunned(next)
    && next.player.hp < next.player.maxHp
    && next.resources.mana >= skill.cost
    && skillActionAvailability(next, skillId).usable
  ) {
    next = activateSkill(next, skillId, { rewardRng: probabilityRng });
  }
  return next;
}

function simulationConfigFromEnvironment() {
  const playerMaxHp = optionalPositiveInteger('SLOT_PLAYER_HP');
  return playerMaxHp ? { playerMaxHp } : {};
}

function optionalPositiveInteger(name) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function seedFromEnvironment() {
  const value = Number.parseInt(process.env.SLOT_SIM_SEED ?? '', 10);
  return Number.isInteger(value) ? value >>> 0 : 0x5EED_BA77;
}

function createSeededRng(seed) {
  let value = seed;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}
