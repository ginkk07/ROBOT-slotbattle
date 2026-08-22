import { randomInt } from 'node:crypto';

import { getSkill } from '../src/game/data/skills.js';
import {
  activateSkill,
  chooseEventOption,
  chooseReward,
  completeEvent,
  continueWithoutReward,
  createGame,
  endPlayerTurn,
  GamePhase,
  GameStatus,
  isStunned,
  placeBet,
} from '../src/game/engine.js';

const requestedRuns = Number.parseInt(process.argv[2] ?? '10000', 10);
const runs = Number.isInteger(requestedRuns) && requestedRuns > 0
  ? requestedRuns
  : 10000;
const spinRng = (maximum) => randomInt(maximum);
const probabilityRng = () => randomInt(1_000_000) / 1_000_000;
const config = simulationConfigFromEnvironment();

for (const strategy of ['all-in', 'split-twice', 'split-evenly']) {
  const summary = simulate(strategy, runs);
  console.log([
    `${strategy}:`,
    `平均擊敗 ${(summary.unitsDefeated / runs).toFixed(2)} 個單位`,
    `平均到達地區 ${(summary.regionDepth / runs).toFixed(2)}`,
    `平均 ${((summary.turns / runs)).toFixed(2)} 回合`,
  ].join(' '));
}

function simulate(strategy, iterations) {
  const summary = { unitsDefeated: 0, regionDepth: 0, turns: 0 };

  for (let index = 0; index < iterations; index += 1) {
    let turns = 0;
    let state = createGame({
      id: `sim-${index}`,
      ownerId: 'simulator',
      config,
      worldRng: probabilityRng,
      monsterRng: probabilityRng,
    });

    while (state.status === GameStatus.ACTIVE && turns < 500) {
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
        state = state.event.stage === 'choice'
          ? chooseEventOption(state, state.event.options[0].id, {
            eventRng: probabilityRng,
            monsterRng: probabilityRng,
          })
          : completeEvent(state, {
            worldRng: probabilityRng,
            monsterRng: probabilityRng,
          });
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
