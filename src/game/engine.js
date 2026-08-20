import { createConfig } from './config.js';
import { drawReels } from './random.js';
import { scoreSpin } from './scoring.js';

export const GameStatus = Object.freeze({
  ACTIVE: 'active',
  WON: 'won',
  LOST: 'lost',
  ABANDONED: 'abandoned',
});

export function createGame({ id, ownerId, config: configOverrides } = {}) {
  if (!id || !ownerId) {
    throw new TypeError('建立遊戲需要 id 與 ownerId');
  }

  const config = createConfig(configOverrides);

  return {
    id,
    ownerId,
    status: GameStatus.ACTIVE,
    phase: 'betting',
    round: 1,
    config,
    player: {
      hp: config.playerMaxHp,
      maxHp: config.playerMaxHp,
    },
    boss: {
      name: config.boss.name,
      hp: config.boss.maxHp,
      maxHp: config.boss.maxHp,
    },
    resources: {
      action: config.actionPointsPerRound,
      attack: 0,
      defense: 0,
      skill: 0,
    },
    spinsUsed: 0,
    stunned: false,
    lastSpin: null,
    lastResolution: null,
    history: [],
  };
}

export function getBossIntent(state) {
  const pattern = state.config.boss.attackPattern;
  return pattern[(state.round - 1) % pattern.length];
}

export function placeBet(state, wager, { reels, rng } = {}) {
  assertCanBet(state);

  if (!Number.isInteger(wager) || wager < 1 || wager > state.resources.action) {
    throw new RangeError(`本次只能投入 1～${state.resources.action} 點行動點`);
  }

  const next = structuredClone(state);
  const outcome = scoreSpin(reels ?? drawReels(rng), wager);

  next.resources.action -= wager;
  next.spinsUsed += 1;
  next.lastSpin = outcome;
  next.history.push({ type: 'spin', round: next.round, outcome });

  if (outcome.stunned) {
    next.stunned = true;
    return resolveRound(next);
  }

  next.resources.attack += outcome.awarded.attack;
  next.resources.defense += outcome.awarded.defense;
  next.resources.skill += outcome.awarded.skill;

  if (
    next.resources.action === 0
    || next.spinsUsed >= next.config.maxSpinsPerRound
  ) {
    return resolveRound(next);
  }

  return next;
}

export function endBetting(state) {
  assertCanBet(state);
  return resolveRound(structuredClone(state));
}

export function abandonGame(state) {
  if (state.status !== GameStatus.ACTIVE) return structuredClone(state);

  const next = structuredClone(state);
  next.status = GameStatus.ABANDONED;
  next.phase = 'ended';
  clearRoundResources(next);
  next.history.push({ type: 'abandoned', round: next.round });
  return next;
}

export function resolveRound(state) {
  if (state.status !== GameStatus.ACTIVE || state.phase !== 'betting') {
    throw new Error('目前無法結算回合');
  }

  const next = structuredClone(state);
  const bossAttack = getBossIntent(next);
  const before = { ...next.resources };

  let healing = 0;
  let attackDamage = 0;
  let defense = 0;

  if (!next.stunned) {
    const missingHp = next.player.maxHp - next.player.hp;
    healing = Math.min(
      missingHp,
      before.skill * next.config.commands.skill.healPerPoint,
    );
    next.player.hp += healing;

    attackDamage = Math.min(
      next.boss.hp,
      before.attack * next.config.commands.attackDamagePerPoint,
    );
    next.boss.hp -= attackDamage;
    defense = before.defense * next.config.commands.defensePerPoint;
  }

  const damageTaken = next.boss.hp === 0
    ? 0
    : Math.max(0, bossAttack - defense);

  next.player.hp = Math.max(0, next.player.hp - damageTaken);

  next.lastResolution = {
    round: next.round,
    stunned: next.stunned,
    wageredAction: next.config.actionPointsPerRound - before.action,
    discardedAction: before.action,
    commandPoints: {
      attack: before.attack,
      defense: before.defense,
      skill: before.skill,
    },
    attackDamage,
    healing,
    defense,
    bossAttack: next.boss.hp === 0 ? 0 : bossAttack,
    damageTaken,
  };
  next.history.push({
    type: 'round-resolution',
    ...structuredClone(next.lastResolution),
  });

  clearRoundResources(next);

  if (next.boss.hp === 0) {
    next.status = GameStatus.WON;
    next.phase = 'ended';
    return next;
  }

  if (next.player.hp === 0) {
    next.status = GameStatus.LOST;
    next.phase = 'ended';
    return next;
  }

  next.round += 1;
  next.phase = 'betting';
  next.resources.action = next.config.actionPointsPerRound;
  next.spinsUsed = 0;
  next.stunned = false;
  return next;
}

function assertCanBet(state) {
  if (state.status !== GameStatus.ACTIVE || state.phase !== 'betting') {
    throw new Error('目前不是可投入行動點的階段');
  }

  if (state.resources.action < 1) {
    throw new Error('本回合已沒有行動點');
  }

  if (state.spinsUsed >= state.config.maxSpinsPerRound) {
    throw new Error('本回合拉霸次數已達上限');
  }
}

function clearRoundResources(state) {
  state.resources.action = 0;
  state.resources.attack = 0;
  state.resources.defense = 0;
  state.resources.skill = 0;
}
