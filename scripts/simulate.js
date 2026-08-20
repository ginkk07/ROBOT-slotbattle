import { randomInt } from 'node:crypto';

import { createGame, GameStatus, placeBet } from '../src/game/engine.js';

const requestedRuns = Number.parseInt(process.argv[2] ?? '10000', 10);
const runs = Number.isInteger(requestedRuns) && requestedRuns > 0
  ? requestedRuns
  : 10000;
const rng = (max) => randomInt(max);
const config = simulationConfigFromEnvironment();

for (const strategy of ['all-in', 'split-twice', 'split-evenly']) {
  const summary = simulate(strategy, runs);
  const winRate = ((summary.wins / runs) * 100).toFixed(2);
  const averageRounds = (summary.totalRounds / runs).toFixed(2);

  console.log([
    `${strategy}:`,
    `${winRate}% 勝率`,
    `平均 ${averageRounds} 回合`,
    `最長 ${summary.longestGame} 回合`,
  ].join(' '));
}

function simulate(strategy, iterations) {
  const summary = { wins: 0, totalRounds: 0, longestGame: 0 };

  for (let index = 0; index < iterations; index += 1) {
    let state = createGame({
      id: `sim-${index}`,
      ownerId: 'simulator',
      config,
    });

    while (state.status === GameStatus.ACTIVE && state.round <= 200) {
      if (strategy === 'all-in') {
        state = placeBet(state, state.resources.action, { rng });
      } else if (strategy === 'split-twice') {
        const wager = state.spinsUsed === 0
          ? Math.ceil(state.resources.action / 2)
          : state.resources.action;
        state = placeBet(state, wager, { rng });
      } else {
        const spinsRemaining = state.config.maxSpinsPerRound - state.spinsUsed;
        const wager = Math.ceil(state.resources.action / spinsRemaining);
        state = placeBet(state, wager, { rng });
      }
    }

    if (state.status === GameStatus.WON) summary.wins += 1;
    summary.totalRounds += state.round;
    summary.longestGame = Math.max(summary.longestGame, state.round);
  }

  return summary;
}

function simulationConfigFromEnvironment() {
  const playerMaxHp = optionalPositiveInteger('SLOT_PLAYER_HP');
  const bossMaxHp = optionalPositiveInteger('SLOT_BOSS_HP');
  const attackPattern = process.env.SLOT_BOSS_PATTERN
    ?.split(',')
    .map((value) => Number.parseInt(value.trim(), 10));

  const config = {};
  if (playerMaxHp) config.playerMaxHp = playerMaxHp;

  if (bossMaxHp || attackPattern?.length) {
    config.boss = {};
    if (bossMaxHp) config.boss.maxHp = bossMaxHp;
    if (attackPattern?.length && attackPattern.every((value) => Number.isInteger(value) && value > 0)) {
      config.boss.attackPattern = attackPattern;
    }
  }

  return config;
}

function optionalPositiveInteger(name) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
