import { createConfig } from './config.js';
import { contentTypeEmoji } from './data/content-types.js';
import { getEvent } from './data/events.js';
import { ItemEffectTrigger, ItemEffectType } from './data/item-effects.js';
import { getItem } from './data/items.js';
import { getRegion } from './data/regions.js';
import { getSkill, getSkillLevelDefinition } from './data/skills.js';
import { getStatus } from './data/statuses.js';
import { getUnit, UnitRank } from './data/units.js';
import {
  createAdventureProgress,
  drawNextAdventureNode,
  scaleEnemyUnit,
} from './engines/adventure-engine.js';
import { applyEffects } from './engines/effects.js';
import { drawEncounter } from './engines/encounter-engine.js';
import {
  afterSpinEquipmentBonuses,
  applyTriggeredEquipmentEffects,
  equipItem,
  equippedItemIds,
  equipmentActionLimitBonus,
  equipmentEffectEntries,
  equipmentSymbolChances,
  healingResourceBonus,
  minimumEliteEncounterChance,
  normalizeEquipmentIds,
  promotesSymbolsWithLucky,
  reduceIncomingDamageWithEquipment,
  spinDamageModifiers,
} from './engines/equipment-engine.js';
import { resolveEvent } from './engines/event-engine.js';
import { rollRewardChoices } from './engines/loot-engine.js';
import { selectMonsterIntent } from './engines/monster-action-engine.js';
import {
  grantSkillReward,
  forgetSkill,
  normalizePlayerSkills,
  playerSkillLevel,
} from './engines/skill-progression.js';
import { mergeActiveStatus } from './engines/status-engine.js';
import { randomInteger } from './engines/weighted-random.js';
import { drawReels } from './random.js';
import { scoreSpin } from './scoring.js';
import { SYMBOL_META } from './symbols.js';

export const GAME_STATE_VERSION = 5;

export const GameStatus = Object.freeze({
  ACTIVE: 'active',
  LOST: 'lost',
  ABANDONED: 'abandoned',
  // 只用於辨識舊版已結束存檔。
  WON: 'won',
});

export const GamePhase = Object.freeze({
  PLAYER_TURN: 'player-turn',
  VICTORY_CONFIRM: 'victory-confirm',
  REWARD_CHOICE: 'reward-choice',
  EVENT: 'event',
  ENDED: 'ended',
});

export function createGame({
  id,
  ownerId,
  config: configOverrides,
  loadout,
  worldRng = Math.random,
  monsterRng = Math.random,
} = {}) {
  if (!id || !ownerId) {
    throw new TypeError('建立遊戲需要 id 與 ownerId');
  }

  const config = createConfig(configOverrides);
  const playerUnit = getUnit(config.playerUnitId);
  const selectedSkillIds = loadout?.skillIds?.length
    ? [...loadout.skillIds]
    : [playerUnit.skillIds[0]];
  for (const skillId of selectedSkillIds) getSkill(skillId);

  const selectedItemIds = [...(loadout?.itemIds ?? [])];
  const startingItems = createStartingItems(selectedItemIds);
  const state = {
    schemaVersion: GAME_STATE_VERSION,
    id,
    ownerId,
    status: GameStatus.ACTIVE,
    phase: null,
    config,
    adventure: createAdventureProgress(config.regionId),
    initialLoadout: {
      skillIds: [...selectedSkillIds],
      itemIds: selectedItemIds,
    },
    player: {
      unitId: playerUnit.id,
      name: playerUnit.name,
      rank: playerUnit.rank,
      tags: [...playerUnit.tags],
      hp: config.playerMaxHp,
      maxHp: config.playerMaxHp,
      skillIds: selectedSkillIds,
      skillLevels: Object.fromEntries(selectedSkillIds.map((skillId) => [skillId, 1])),
      inventory: startingItems.inventory,
      equipment: startingItems.equipment,
      damageResistances: { ...playerUnit.damageResistances },
      statusOverrides: structuredClone(playerUnit.statusOverrides),
      activeStatuses: [],
    },
    enemy: null,
    event: null,
    rewardChoices: [],
    pendingRegionAdvance: false,
    round: 0,
    resources: { action: 0, armor: 0, mana: 0 },
    combatModifiers: createCombatModifiers(),
    stunned: false,
    lastSpin: null,
    lastImpact: null,
    lastAction: null,
    lastResolution: null,
    endSummary: null,
    history: [],
  };

  state.player = normalizePlayerSkills(state.player);

  startNextNode(state, {
    worldRng,
    monsterRng,
    forcedEnemyUnitId: config.initialEnemyUnitId,
    forcedEnemyOverrides: config.initialEnemyOverrides,
  });
  return state;
}

export function getEnemyIntent(state) {
  return state.enemy?.intent ?? null;
}

export function getBossIntent(state) {
  return getEnemyIntent(state)?.damage ?? 0;
}

export function placeBet(
  state,
  wager,
  {
    reels,
    rng,
    chanceRng = Math.random,
    rewardRng = Math.random,
  } = {},
) {
  const next = upgradeGameState(state);
  assertPlayerCanAct(next);

  if (!Number.isInteger(wager) || wager < 1 || wager > next.resources.action) {
    throw new RangeError(`本次只能投入 1～${next.resources.action} 點行動點`);
  }

  const symbolChances = {
    ...equipmentSymbolChances(next.player),
    ...next.combatModifiers.nextSpinSymbolChances,
  };
  const spinReels = reels ?? drawReels(rng, symbolChances);
  // 「下一次拉霸」效果在抽牌後立即清除，三個💀也不會保留。
  next.combatModifiers.nextSpinSymbolChances = {};
  const outcome = scoreSpin(spinReels, wager, {
    promoteWithLucky: promotesSymbolsWithLucky(next.player),
  });
  next.resources.action -= wager;
  next.lastSpin = outcome;
  next.history.push({ type: 'spin', round: next.round, outcome });

  if (outcome.stunned) {
    next.stunned = true;
    next.resources.action = 0;
    next.resources.armor = 0;
    next.resources.mana = 0;
    next.player.activeStatuses = mergeActiveStatus(
      next.player.activeStatuses,
      {
        statusId: 'stunned',
        sourceUnitId: null,
        remainingTurns: 1,
        stacks: 1,
        potency: 1,
      },
    );
    next.lastImpact = emptyImpact();
    next.lastAction = {
      type: 'stunned',
      text: '三個不幸：本回合暈眩，只能按「回合結束」。',
    };
    return next;
  }

  const hasAttackReward = outcome.awarded.attack > 0;
  const statusBonuses = hasAttackReward
    ? attackStatusBonuses(next.player)
    : { attackPower: 0, additionalDamage: 0 };
  const multiplierResult = hasAttackReward
    ? consumeSpinDamageMultiplier(next.player)
    : { player: next.player, multiplier: 1 };
  next.player = multiplierResult.player;
  const damageModifiers = spinDamageModifiers(next.player, {
    wager,
    actionLimit: playerActionLimit(next),
  });
  const afterSpin = afterSpinEquipmentBonuses(next.player, {
    reels: outcome.reels,
    wager,
    chanceRng,
  });
  const attackEquipmentBonus = hasAttackReward ? damageModifiers.bonusDamage : 0;
  const requestedAttack = Math.floor((
    (
      outcome.awarded.attack
      + statusBonuses.attackPower
      + statusBonuses.additionalDamage
      + attackEquipmentBonus
    ) * multiplierResult.multiplier
    + afterSpin.bonusDamage
  ) * damageModifiers.multiplier);
  const attackEvent = dealDamageToEnemy(next, requestedAttack, 'physical');
  let attackDamage = attackEvent?.amount ?? 0;

  const flameSword = resolveAfterSpinDamageEquipment(next, {
    spinDamage: attackDamage,
    rng: chanceRng,
  });
  attackDamage += flameSword.damage;

  const armorGained = outcome.awarded.defense + afterSpin.resources.armor;
  const manaGained = outcome.awarded.skill + afterSpin.resources.mana;
  next.resources.armor += armorGained;
  next.resources.mana += manaGained;
  next.resources.action = Math.min(
    playerActionLimit(next),
    next.resources.action + afterSpin.resources.action,
  );
  next.lastImpact = {
    attackDamage,
    armorGained,
    manaGained,
    equipmentBonus: attackEquipmentBonus + afterSpin.bonusDamage + flameSword.damage,
    statusBonus: statusBonuses.attackPower + statusBonuses.additionalDamage,
    damageMultiplier: multiplierResult.multiplier * damageModifiers.multiplier,
  };
  next.lastAction = { type: 'spin', text: spinActionText(next.lastImpact) };
  next.history.at(-1).equipmentEvents = [
    ...afterSpin.events,
    ...flameSword.events,
  ];

  if (next.enemy.hp === 0) awaitCombatVictoryConfirmation(next);
  return next;
}

export function activateSkill(
  state,
  skillId,
  { rng, rewardRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  assertPlayerCanAct(next);

  if (!next.player.skillIds.includes(skillId)) {
    throw new Error('這個技能不在目前持有的技能中');
  }

  const skill = getSkill(skillId);
  const skillLevel = playerSkillLevel(next.player, skillId);
  const levelDefinition = getSkillLevelDefinition(skillId, skillLevel);
  if (!Number.isInteger(skill.cost) || skill.cost < 0) {
    throw new Error(`技能 ${skill.name} 尚未設定法力消耗`);
  }
  if (next.resources.mana < skill.cost) {
    throw new RangeError(`${skill.name}需要 ${skill.cost} 點法力`);
  }
  if (wouldOnlyHealFullHealth({ effects: levelDefinition.effects }, next.player)) {
    throw new Error('生命已全滿，現在不需要治療');
  }
  if (wouldOnlyRefreshActiveStatus(levelDefinition.effects, next.player)) {
    throw new Error('這個效果目前仍在持續中');
  }

  const events = applyPlayerEffects(next, {
    effects: levelDefinition.effects,
    rng,
  });
  next.resources.mana -= skill.cost;
  next.lastAction = {
    type: 'skill',
    id: skill.id,
    text: `${contentTypeEmoji('skill')}${skill.name} Lv.${skillLevel}：${summarizeEffectEvents(events)}`,
  };
  next.history.push({
    type: 'skill',
    round: next.round,
    skillId: skill.id,
    skillLevel,
    events,
  });

  if (next.enemy.hp === 0) awaitCombatVictoryConfirmation(next);
  return next;
}

export function useItem(
  state,
  itemId,
  { rng, rewardRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  assertPlayerCanAct(next);
  const item = getItem(itemId);
  if (item.type !== 'consumable') throw new Error('裝備持有時會自動生效');

  const actionCost = itemActionCost(item);
  if (next.resources.action < actionCost) {
    throw new RangeError(`使用${item.name}需要 ${actionCost} 點行動點`);
  }

  const stack = next.player.inventory.find((entry) => entry.itemId === itemId);
  if (!stack || stack.quantity < 1) throw new Error(`已經沒有${item.name}`);
  if (wouldOnlyHealFullHealth(item, next.player)) {
    throw new Error('生命已全滿，現在不需要治療');
  }

  const events = applyPlayerEffects(next, {
    effects: item.effects,
    rng,
  });
  events.push(...applyCombatItemEffects(next, item));
  next.resources.action -= actionCost;
  const nextStack = next.player.inventory.find((entry) => entry.itemId === itemId);
  nextStack.quantity -= 1;
  next.player.inventory = next.player.inventory.filter((entry) => entry.quantity > 0);
  next.lastAction = {
    type: 'item',
    id: item.id,
    text: `${contentTypeEmoji('consumable')}${item.name}：${summarizeEffectEvents(events)}`,
  };
  next.history.push({
    type: 'item',
    round: next.round,
    itemId: item.id,
    actionCost,
    events,
  });

  if (next.enemy.hp === 0) awaitCombatVictoryConfirmation(next);
  return next;
}

export function confirmCombatVictory(
  state,
  { rewardRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  const canConfirm = next.status === GameStatus.ACTIVE
    && next.phase === GamePhase.VICTORY_CONFIRM
    && next.enemy?.hp === 0;
  if (!canConfirm) throw new Error('目前沒有待確認的戰鬥勝利');

  finishCombatVictory(next, { rewardRng });
  return next;
}

export function endPlayerTurn(
  state,
  { monsterRng = Math.random, rewardRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE || next.phase !== GamePhase.PLAYER_TURN) {
    throw new Error('目前無法結束回合');
  }

  const wasStunned = isStunned(next);
  const discardedAction = next.resources.action;
  const playerTurnEndStatus = resolveTriggeredStatuses(next.player, 'turn-end');
  next.player = advanceStatusDurations(playerTurnEndStatus.unit);
  const turnEndHealingEvents = applyHealingEquipmentBonus(
    next,
    playerTurnEndStatus.events,
  );
  const playerTurnEndEquipmentEvents = resolvePlayerTurnEndEquipment(next);
  const discardedMana = next.resources.mana;

  if (next.enemy.hp === 0) {
    next.history.push({
      type: 'equipment-turn-end',
      round: next.round,
      events: playerTurnEndEquipmentEvents,
    });
    awaitCombatVictoryConfirmation(next);
    return next;
  }
  if (next.player.hp === 0) {
    finishRun(next, GameStatus.LOST, next.enemy.name);
    return next;
  }

  const enemyTurnStartStatus = resolveTriggeredStatuses(next.enemy, 'turn-start');
  next.enemy = enemyTurnStartStatus.unit;
  if (next.enemy.hp === 0) {
    awaitCombatVictoryConfirmation(next);
    return next;
  }

  const intent = next.enemy.intent ?? selectMonsterIntent(next.enemy, { rng: monsterRng });
  const armorUsed = wasStunned ? 0 : Math.min(next.resources.armor, intent.damage);
  const incomingAfterArmor = Math.max(0, intent.damage - armorUsed);
  const reducedIncomingDamage = reduceIncomingDamageWithEquipment(
    next.player,
    incomingAfterArmor,
  );
  const damageTaken = Math.min(
    next.player.hp,
    reducedIncomingDamage,
  );
  next.player.hp -= damageTaken;

  let monsterEffectEvents = [];
  if (next.player.hp > 0 && intent.effects.length > 0) {
    const result = applyEffects({
      effects: intent.effects,
      source: next.enemy,
      target: next.player,
      rng: monsterRng,
    });
    next.enemy = result.source;
    next.player = result.target;
    monsterEffectEvents = result.events;
  }

  const enemyTurnEndStatus = next.enemy.hp > 0
    ? resolveTriggeredStatuses(next.enemy, 'turn-end')
    : { unit: next.enemy, events: [] };
  next.enemy = advanceStatusDurations(enemyTurnEndStatus.unit);
  clearTurnResources(next);
  next.stunned = false;

  if (next.player.hp === 0) {
    finishRun(next, GameStatus.LOST, next.enemy.name);
    return next;
  }

  next.round += 1;
  next.phase = GamePhase.PLAYER_TURN;
  next.combatModifiers.damageDealtThisTurn = 0;
  next.resources.action = playerActionLimit(next);
  const playerTurnStartStatus = resolveTriggeredStatuses(next.player, 'turn-start');
  next.player = playerTurnStartStatus.unit;
  const turnStartHealingEvents = applyHealingEquipmentBonus(
    next,
    playerTurnStartStatus.events,
  );
  const playerTurnStartEquipmentEvents = applyPlayerTurnStartEquipmentEffects(next);
  next.enemy.intent = selectMonsterIntent(next.enemy, { rng: monsterRng });

  next.lastResolution = {
    round: next.round - 1,
    stunned: wasStunned,
    discardedAction,
    discardedMana,
    armorUsed,
    enemyAction: {
      type: intent.type,
      name: intent.name,
      skillId: intent.skillId,
    },
    enemyAttack: intent.damage,
    bossAttack: intent.damage,
    damageTaken,
    monsterEffectEvents,
    enemyStatusEvents: [
      ...enemyTurnStartStatus.events,
      ...enemyTurnEndStatus.events,
    ],
    playerStatusEvents: [
      ...playerTurnEndStatus.events,
      ...playerTurnStartStatus.events,
    ],
    playerEquipmentEvents: [
      ...turnEndHealingEvents,
      ...playerTurnEndEquipmentEvents,
      ...turnStartHealingEvents,
      ...playerTurnStartEquipmentEvents,
    ],
  };
  next.history.push({
    type: 'turn-resolution',
    ...structuredClone(next.lastResolution),
  });
  return next;
}

export function chooseReward(
  state,
  choiceIndex,
  { worldRng = Math.random, monsterRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE || next.phase !== GamePhase.REWARD_CHOICE) {
    throw new Error('目前沒有可選擇的戰鬥獎勵');
  }
  if (!Number.isInteger(choiceIndex) || !next.rewardChoices[choiceIndex]) {
    throw new RangeError('獎勵選項不存在');
  }

  const choice = next.rewardChoices[choiceIndex];
  applyReward(next.player, choice);
  next.history.push({
    type: 'reward-selected',
    choice: structuredClone(choice),
  });
  next.lastAction = {
    type: 'reward',
    text: `選擇了${rewardContentName(choice)}`,
  };

  advanceAfterReward(next, { worldRng, monsterRng });
  return next;
}

export function continueWithoutReward(
  state,
  { worldRng = Math.random, monsterRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  if (
    next.status !== GameStatus.ACTIVE
    || next.phase !== GamePhase.REWARD_CHOICE
    || next.rewardChoices.length > 0
  ) {
    throw new Error('目前不能略過獎勵');
  }
  next.history.push({ type: 'reward-unavailable' });
  advanceAfterReward(next, { worldRng, monsterRng });
  return next;
}

export function chooseEventOption(
  state,
  optionId,
  {
    eventRng = Math.random,
    monsterRng = Math.random,
  } = {},
) {
  const next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE || next.phase !== GamePhase.EVENT) {
    throw new Error('目前沒有可選擇的奇遇');
  }
  if (next.event.stage !== 'choice') {
    throw new Error('這個奇遇已經完成選擇');
  }

  const resolved = resolveEvent(next.event.eventId, optionId, { rng: eventRng });
  const outcome = resolved.outcome;
  next.history.push({
    type: 'event-option-selected',
    eventId: next.event.eventId,
    optionId,
    outcomeId: outcome.id,
    outcomeType: outcome.type,
  });

  if (outcome.type === 'full-heal') {
    next.player.hp = next.player.maxHp;
  } else if (outcome.type === 'forget-random-skill') {
    const skillId = randomSkillId(next.player, eventRng);
    if (skillId) {
      next.player = forgetSkill(next.player, skillId);
      next.event.forgottenSkillId = skillId;
    }
  } else if (outcome.type === 'start-combat') {
    startEventCombat(next, outcome, { rng: eventRng, monsterRng });
    return next;
  } else if (outcome.type !== 'continue') {
    throw new RangeError(`尚未支援的事件結果：${outcome.type}`);
  }

  const forgottenName = next.event.forgottenSkillId
    ? `\n你遺忘了「${getSkill(next.event.forgottenSkillId).name}」。`
    : '';
  next.event.stage = 'result';
  next.event.result = {
    outcomeId: outcome.id,
    type: outcome.type,
    text: `${outcome.text}${forgottenName}`,
  };
  return next;
}

export function completeEvent(
  state,
  { worldRng = Math.random, monsterRng = Math.random } = {},
) {
  let next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE || next.phase !== GamePhase.EVENT) {
    throw new Error('目前沒有可完成的奇遇');
  }

  // 舊版按鈕與模擬器會直接完成奇遇；改版後以離開或第一個選項處理。
  if (next.event.stage === 'choice') {
    const event = getEvent(next.event.eventId);
    const optionId = event.options.find((option) => option.id === 'leave')?.id
      ?? event.options[0].id;
    next = chooseEventOption(next, optionId, {
      eventRng: worldRng,
      monsterRng,
    });
    if (next.phase !== GamePhase.EVENT) return next;
  }

  next.history.push({
    type: 'event-completed',
    eventId: next.event.eventId,
    rarity: next.event.rarity,
  });
  next.adventure.regionProgress += 1;
  next.adventure.completedEncounters += 1;
  startNextNode(next, { worldRng, monsterRng });
  return next;
}

// 保留舊名稱，讓外部模擬與尚未更新的呼叫端不會直接中斷。
export const endBetting = endPlayerTurn;

export function abandonGame(state) {
  const next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE) return next;
  finishRun(next, GameStatus.ABANDONED, null);
  return next;
}

export function isStunned(state) {
  return Boolean(
    state.stunned
    || state.player?.activeStatuses?.some((status) => status.statusId === 'stunned'),
  );
}

export function upgradeGameState(value) {
  const next = structuredClone(value);
  if (next.schemaVersion === GAME_STATE_VERSION) {
    ensureCurrentFields(next);
    return next;
  }

  if (next.schemaVersion === 3 || next.schemaVersion === 4) {
    migratePreItemExpansionState(next);
    next.schemaVersion = GAME_STATE_VERSION;
    ensureCurrentFields(next);
    if (next.endSummary?.finalSkillIds) {
      next.endSummary.finalSkillLevels ??= Object.fromEntries(
        next.endSummary.finalSkillIds.map((skillId) => [skillId, 1]),
      );
    }
    return next;
  }

  return upgradeLegacyState(next);
}

function startNextNode(state, {
  worldRng,
  monsterRng,
  forcedEnemyUnitId = null,
  forcedEnemyOverrides = {},
}) {
  state.enemy = null;
  state.event = null;
  state.rewardChoices = [];
  state.round = 0;
  clearTurnResources(state);
  state.combatModifiers = createCombatModifiers();
  clearCombatPresentation(state);
  state.player.activeStatuses = [];
  state.stunned = false;

  let node;
  if (forcedEnemyUnitId) {
    const region = getRegion(state.adventure.regionId);
    const enemy = scaleEnemyUnit(
      getUnit(forcedEnemyUnitId),
      state.adventure.regionDepth,
      region,
    );
    applyEnemyOverrides(enemy, forcedEnemyOverrides);
    node = { type: 'combat', enemy, bossChance: 0 };
  } else {
    node = drawNextAdventureNode(state.adventure, {
      rng: worldRng,
      minimumEliteChance: minimumEliteEncounterChance(state.player),
    });
  }

  if (node.type === 'event') {
    state.phase = GamePhase.EVENT;
    state.event = {
      eventId: node.eventId,
      name: node.event.name,
      description: node.event.description,
      rarity: node.rarity,
      stage: 'choice',
      options: node.event.options.map(({ id, label }) => ({ id, label })),
      result: null,
    };
    state.history.push({
      type: 'event-started',
      eventId: node.eventId,
      rarity: node.rarity,
    });
    return;
  }

  state.phase = GamePhase.PLAYER_TURN;
  state.enemy = node.enemy;
  state.enemy.intent = selectMonsterIntent(state.enemy, { rng: monsterRng });
  state.round = 1;
  state.resources.action = playerActionLimit(state);
  applyBattleStartEquipmentEffects(state);
  applyPlayerTurnStartEquipmentEffects(state);
  state.history.push({
    type: 'combat-started',
    unitId: state.enemy.unitId,
    rank: state.enemy.rank,
    regionDepth: state.adventure.regionDepth,
    bossChance: node.bossChance,
  });
}

function startEventCombat(state, outcome, { rng, monsterRng }) {
  const region = getRegion(state.adventure.regionId);
  const tableId = {
    normal: region.normalEncounterTableId,
    elite: region.eliteEncounterTableId,
    boss: region.bossEncounterTableId,
  }[outcome.rank];
  if (!tableId) throw new RangeError(`奇遇戰鬥階級不合法：${outcome.rank}`);
  const unit = drawEncounter(tableId, { rng });
  const enemy = scaleEnemyUnit(unit, state.adventure.regionDepth, region);
  const eventId = state.event.eventId;

  state.event = null;
  state.phase = GamePhase.PLAYER_TURN;
  state.enemy = enemy;
  state.enemy.intent = selectMonsterIntent(state.enemy, { rng: monsterRng });
  state.rewardChoices = [];
  state.round = 1;
  clearTurnResources(state);
  state.combatModifiers = createCombatModifiers();
  state.resources.action = playerActionLimit(state);
  clearCombatPresentation(state);
  state.player.activeStatuses = [];
  state.stunned = false;
  applyBattleStartEquipmentEffects(state);
  applyPlayerTurnStartEquipmentEffects(state);
  state.lastAction = { type: 'event', text: outcome.text };
  state.history.push({
    type: 'event-combat-started',
    eventId,
    unitId: state.enemy.unitId,
    rank: state.enemy.rank,
  });
}

function randomSkillId(player, rng) {
  const skillIds = player.skillIds ?? [];
  if (skillIds.length === 0) return null;
  return skillIds[randomInteger(0, skillIds.length - 1, rng)];
}

function awaitCombatVictoryConfirmation(state) {
  if (state.phase !== GamePhase.PLAYER_TURN) return;
  state.phase = GamePhase.VICTORY_CONFIRM;
  state.enemy.intent = null;
  clearTurnResources(state);
  state.stunned = false;
}

function finishCombatVictory(state, { rewardRng }) {
  if (state.phase !== GamePhase.VICTORY_CONFIRM) return;
  const defeated = state.enemy;
  state.adventure.defeatedUnitCount += 1;
  state.adventure.defeatedByRank[defeated.rank] += 1;
  state.adventure.completedEncounters += 1;
  state.adventure.regionProgress += 1;
  state.pendingRegionAdvance = defeated.rank === UnitRank.BOSS;
  const region = getRegion(state.adventure.regionId);
  state.rewardChoices = rollRewardChoices(defeated.lootTableId, {
    rng: rewardRng,
    regionTags: region.tags,
    rarityModifiers: state.adventure.modifiers.rewardRarity,
    player: state.player,
  });
  state.phase = GamePhase.REWARD_CHOICE;
  state.history.push({
    type: 'combat-victory',
    unitId: defeated.unitId,
    rank: defeated.rank,
    rewardChoices: structuredClone(state.rewardChoices),
  });
}

function finishRun(state, status, defeatedBy) {
  const finalSkillIds = [...(state.player.skillIds ?? [])];
  const finalSkillLevels = structuredClone(state.player.skillLevels ?? {});
  const finalEquipmentIds = equippedItemIds(state.player);
  state.endSummary = {
    runId: state.id,
    reason: status,
    defeatedBy,
    defeatedUnitCount: state.adventure?.defeatedUnitCount ?? 0,
    defeatedByRank: structuredClone(
      state.adventure?.defeatedByRank ?? { normal: 0, elite: 0, boss: 0 },
    ),
    finalRegionDepth: state.adventure?.regionDepth ?? 1,
    finalSkillIds,
    finalSkillLevels,
    finalEquipmentIds,
    newAchievementIds: [],
    newUnlockSkillIds: [],
    newUnlockItemIds: [],
    profileSettled: false,
  };
  state.status = status;
  state.phase = GamePhase.ENDED;
  state.enemy = null;
  state.event = null;
  state.rewardChoices = [];
  state.pendingRegionAdvance = false;
  clearTurnResources(state);
  state.player.activeStatuses = [];
  state.player.inventory = [];
  state.player.equipment = [];
  state.player.skillIds = [];
  state.adventure = null;
  state.history = [];
  state.lastSpin = null;
  state.lastImpact = null;
  state.lastAction = null;
  state.lastResolution = null;
  state.combatModifiers = createCombatModifiers();
  state.stunned = false;
}

function applyReward(player, choice) {
  if (choice.contentType === 'skill') {
    const granted = grantSkillReward(player, choice.contentId);
    Object.assign(player, granted.player);
    return granted;
  }

  const item = getItem(choice.contentId);
  if (item.type === 'equipment') {
    equipItem(player, item.id);
    return;
  }
  const stack = player.inventory.find((entry) => entry.itemId === item.id);
  if (stack) stack.quantity += 1;
  else player.inventory.push({ itemId: item.id, quantity: 1 });
}

function rewardContentName(choice) {
  if (choice.contentType === 'skill') {
    const name = getSkill(choice.contentId).name;
    return choice.acquisition === 'level-up'
      ? `${name}升至 Lv.${choice.targetLevel}`
      : name;
  }
  return getItem(choice.contentId).name;
}

function advanceAfterReward(state, { worldRng, monsterRng }) {
  if (state.pendingRegionAdvance) {
    state.adventure.regionDepth += 1;
    state.adventure.regionProgress = 0;
    state.pendingRegionAdvance = false;
  }
  startNextNode(state, { worldRng, monsterRng });
}

function assertPlayerCanAct(state) {
  if (state.status !== GameStatus.ACTIVE || state.phase !== GamePhase.PLAYER_TURN) {
    throw new Error('目前不是玩家行動階段');
  }
  if (isStunned(state)) throw new Error('暈眩中只能按「回合結束」');
}

function createStartingItems(itemIds) {
  const inventory = [];
  const equipment = [];
  const quantities = new Map();
  for (const itemId of itemIds) {
    const item = getItem(itemId);
    if (item.type === 'equipment') equipment.push(item.id);
    else quantities.set(item.id, (quantities.get(item.id) ?? 0) + 1);
  }
  for (const [itemId, quantity] of quantities) inventory.push({ itemId, quantity });
  return { inventory, equipment: [...new Set(equipment)] };
}

function splitEquipmentFromInventory(inventory) {
  const equipment = [];
  const consumables = [];
  for (const entry of inventory ?? []) {
    const item = getItem(entry.itemId);
    if (item.type === 'equipment') equipment.push(item.id);
    else consumables.push(structuredClone(entry));
  }
  return { inventory: consumables, equipment: [...new Set(equipment)] };
}

function applyBattleStartEquipmentEffects(state) {
  const events = applyTriggeredEquipmentEffects(
    state,
    ItemEffectTrigger.BATTLE_START,
  );
  if (events.length === 0) return;
  state.history.push({
    type: 'equipment-battle-start',
    round: state.round,
    events,
  });
}

function applyPlayerTurnStartEquipmentEffects(state) {
  const events = applyTriggeredEquipmentEffects(
    state,
    ItemEffectTrigger.PLAYER_TURN_START,
  );
  return [...events, ...applyHealingEquipmentBonus(state, events)];
}

/**
 * 玩家技能、消耗品共用的效果入口。所有玩家造成的傷害與治療觸發裝備
 * 都從這裡記錄，避免新增技能時漏掉夏賜儀碇或頌缽的判定。
 */
function applyPlayerEffects(state, { effects = [], rng } = {}) {
  if (effects.length === 0) return [];
  const result = applyEffects({
    effects,
    source: state.player,
    target: state.enemy,
    rng,
  });
  state.player = result.source;
  state.enemy = result.target;
  recordDamageEvents(state, result.events);
  return [
    ...result.events,
    ...applyHealingEquipmentBonus(state, result.events),
  ];
}

function applyHealingEquipmentBonus(state, events) {
  const bonus = healingResourceBonus(state.player, events);
  const bonusEvents = [];
  for (const [resource, amount] of Object.entries(bonus)) {
    if (amount <= 0) continue;
    if (resource === 'action') {
      state.resources.action = Math.min(
        playerActionLimit(state),
        state.resources.action + amount,
      );
    } else {
      state.resources[resource] += amount;
    }
    bonusEvents.push({ type: 'gain-resource', resource, amount });
  }
  return bonusEvents;
}

function applyCombatItemEffects(state, item) {
  const events = [];
  for (const effect of item.combatEffects ?? []) {
    if (
      effect.type === ItemEffectType.SET_SYMBOL_CHANCE
      && effect.duration === 'next-spin'
    ) {
      state.combatModifiers.nextSpinSymbolChances[effect.symbolId] = effect.chance;
      events.push({
        type: 'set-symbol-chance',
        symbolId: effect.symbolId,
        chance: effect.chance,
        duration: effect.duration,
      });
      continue;
    }

    if (effect.type === ItemEffectType.GAIN_RESOURCE) {
      if (effect.resource === 'action') {
        state.resources.action = Math.min(
          playerActionLimit(state),
          state.resources.action + effect.amount,
        );
      } else {
        state.resources[effect.resource] += effect.amount;
      }
      events.push({
        type: 'gain-resource',
        resource: effect.resource,
        amount: effect.amount,
      });
      continue;
    }

    throw new RangeError(`尚未支援的戰鬥道具效果：${effect.type}`);
  }
  return events;
}

function dealDamageToEnemy(state, amount, element) {
  if (!Number.isFinite(amount) || amount <= 0 || state.enemy?.hp <= 0) return null;
  const result = applyEffects({
    effects: [{ type: 'damage', element, amount, target: 'enemy' }],
    source: state.player,
    target: state.enemy,
  });
  state.player = result.source;
  state.enemy = result.target;
  recordDamageEvents(state, result.events);
  return result.events[0];
}

function resolveAfterSpinDamageEquipment(state, { spinDamage, rng }) {
  if (spinDamage <= 0 || state.enemy?.hp <= 0) return { damage: 0, events: [] };
  let damage = 0;
  const events = [];

  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.AFTER_SPIN,
    ItemEffectType.APPLY_BURN_AND_DAMAGE,
  )) {
    const statusResult = applyEffects({
      effects: [{
        type: 'apply-status',
        statusId: effect.statusId,
        target: 'enemy',
        chance: 1,
        stacks: effect.stacks,
        potency: 1,
      }],
      source: state.player,
      target: state.enemy,
      rng,
    });
    state.player = statusResult.source;
    state.enemy = statusResult.target;
    events.push(...statusResult.events.map((event) => ({ ...event, itemId })));

    const stacks = state.enemy.activeStatuses
      ?.find((status) => status.statusId === effect.statusId)?.stacks ?? 0;
    const damageEvent = dealDamageToEnemy(state, stacks, effect.element);
    if (damageEvent) {
      damage += damageEvent.amount;
      events.push({ ...damageEvent, itemId });
    }
  }

  return { damage, events };
}

function resolvePlayerTurnEndEquipment(state) {
  const events = [];

  // 先結算星海羅盤等回合末傷害，再判斷本回合是否「沒有造成傷害」。
  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.PLAYER_TURN_END,
    ItemEffectType.DAMAGE_FROM_RESOURCE,
  )) {
    const amount = Number(state.resources[effect.resource] ?? 0);
    const damageEvent = dealDamageToEnemy(state, amount, effect.element);
    if (damageEvent) events.push({ ...damageEvent, itemId });
  }

  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.PLAYER_TURN_END,
    ItemEffectType.INCREASE_ACTION_LIMIT_IF_NO_DAMAGE,
  )) {
    if (state.combatModifiers.damageDealtThisTurn > 0) continue;
    state.combatModifiers.actionLimitBonus += effect.amount;
    events.push({
      type: 'increase-action-limit',
      itemId,
      amount: effect.amount,
    });
  }

  return events;
}

function recordDamageEvents(state, events) {
  const amount = events
    .filter((event) => event.type === 'damage' && event.target === 'enemy')
    .reduce((sum, event) => sum + event.amount, 0);
  state.combatModifiers.damageDealtThisTurn += amount;
}

function playerActionLimit(state) {
  return state.config.actionPointsPerRound
    + equipmentActionLimitBonus(state.player)
    + Number(state.combatModifiers?.actionLimitBonus ?? 0);
}

function createCombatModifiers() {
  return {
    // 夏賜儀碇在本場戰鬥累積的每回合行動點上限。
    actionLimitBonus: 0,
    // 只計玩家在目前回合實際對敵人造成的傷害。
    damageDealtThisTurn: 0,
    // 磨刀石等「下一次拉霸」消耗品暫存在此，抽牌後立刻清空。
    nextSpinSymbolChances: {},
  };
}

function attackStatusBonuses(player) {
  return (player.activeStatuses ?? []).reduce((bonuses, active) => {
    const definition = getStatus(active.statusId);
    const isAttackTrigger = definition.trigger === 'on-attack'
      && definition.effect.type === 'bonus-damage';
    const isAttackModifier = definition.effect.type === 'modify-stat'
      && definition.effect.stat === 'attack';
    if (!isAttackTrigger && !isAttackModifier) return bonuses;
    const amount = (
      Number(definition.effect.amountPerPotency ?? 0)
      * Number(active.potency ?? 1)
      * Number(active.stacks ?? 1)
    );
    if (isAttackModifier) bonuses.attackPower += amount;
    if (isAttackTrigger) bonuses.additionalDamage += amount;
    return bonuses;
  }, { attackPower: 0, additionalDamage: 0 });
}

function itemActionCost(item) {
  const actionCost = item.actionCost ?? 0;
  if (!Number.isInteger(actionCost) || actionCost < 0) {
    throw new RangeError(`${item.name}的行動點成本必須是非負整數`);
  }
  return actionCost;
}

function resolveTriggeredStatuses(unit, trigger) {
  const next = structuredClone(unit);
  const events = [];
  for (const active of next.activeStatuses ?? []) {
    const definition = getStatus(active.statusId);
    if (definition.trigger !== trigger) continue;
    const requested = Number(definition.effect.amountPerPotency ?? 0)
      * Number(active.potency ?? 1)
      * Number(active.stacks ?? 1);

    if (definition.effect.type === 'damage') {
      const resistance = Math.min(
        1,
        Math.max(0, Number(next.damageResistances?.[definition.effect.element] ?? 0)),
      );
      const amount = Math.min(
        next.hp,
        requested <= 0 || resistance >= 1
          ? 0
          : Math.max(1, Math.floor(requested * (1 - resistance))),
      );
      next.hp -= amount;
      events.push({
        type: 'damage',
        statusId: active.statusId,
        amount,
        element: definition.effect.element,
      });
    }

    if (definition.effect.type === 'heal') {
      const amount = Math.min(next.maxHp - next.hp, requested);
      next.hp += amount;
      events.push({ type: 'heal', statusId: active.statusId, amount });
    }

    if (definition.stacking.mode === 'stack-countdown') {
      active.stacks = Math.max(0, Number(active.stacks ?? 1) - 1);
      active.remainingTurns = active.stacks;
      const latestEvent = events.at(-1);
      if (latestEvent) latestEvent.remainingStacks = active.stacks;
    }
  }
  next.activeStatuses = (next.activeStatuses ?? [])
    .filter((status) => Number(status.stacks ?? 1) > 0);
  return { unit: next, events };
}

function advanceStatusDurations(unit) {
  const next = structuredClone(unit);
  next.activeStatuses = (next.activeStatuses ?? [])
    .map((status) => {
      const definition = getStatus(status.statusId);
      if (definition.durationMode === 'until-consumed') return status;
      if (definition.stacking.mode === 'stack-countdown') return status;
      return { ...status, remainingTurns: Number(status.remainingTurns) - 1 };
    })
    .filter((status) => {
      const definition = getStatus(status.statusId);
      if (definition.durationMode === 'until-consumed') return true;
      if (definition.stacking.mode === 'stack-countdown') {
        return Number(status.stacks ?? 0) > 0;
      }
      return status.remainingTurns > 0;
    });
  return next;
}

function wouldOnlyHealFullHealth(source, player) {
  return source.effects?.length > 0
    && source.effects.every((effect) => effect.type === 'heal' && effect.target === 'self')
    && player.hp >= player.maxHp;
}

function wouldOnlyRefreshActiveStatus(effects, player) {
  const selfStatuses = effects
    ?.filter((effect) => effect.type === 'apply-status' && effect.target === 'self')
    .map((effect) => effect.statusId) ?? [];
  return selfStatuses.length > 0
    && selfStatuses.every((statusId) => {
      const active = player.activeStatuses
        ?.find((status) => status.statusId === statusId);
      if (!active) return false;
      const definition = getStatus(statusId);
      if (definition.durationMode === 'until-consumed') return true;
      if (definition.stacking.mode === 'refresh-duration') return true;
      return Number(active.stacks ?? 1) >= definition.stacking.maxStacks;
    });
}

function summarizeEffectEvents(events) {
  const parts = events.flatMap((event) => {
    if (event.type === 'heal') return [`回復 ${event.amount} HP`];
    if (event.type === 'damage') return [`造成 ${event.amount} 傷害`];
    if (event.type === 'gain-resource') {
      const label = { action: '❇️', armor: '🛡️', mana: '✨' }[event.resource];
      return [`${label}＋${event.amount}`];
    }
    if (event.type === 'set-symbol-chance') {
      const symbol = SYMBOL_META[event.symbolId]?.emoji ?? event.symbolId;
      return [`下一次拉霸${symbol}機率提升為${Math.round(event.chance * 100)}%`];
    }
    if (event.type === 'increase-action-limit') {
      return [`本場戰鬥❇️上限＋${event.amount}`];
    }
    if (event.type === 'apply-status' && event.applied) {
      const status = getStatus(event.statusId);
      if (status.durationMode === 'until-consumed') {
        return [`獲得${status.name}（下次拉霸傷害 ×${event.potency}）`];
      }
      const stackText = event.stacks > 1 ? `${event.stacks}層` : '';
      return [`附加${stackText}${status.name}`];
    }
    if (event.type === 'apply-status') return ['狀態未生效'];
    if (event.type === 'remove-status') return [`移除 ${event.removed} 個狀態`];
    return [];
  });
  return parts.join('、') || '沒有產生效果';
}

function spinActionText(impact) {
  const parts = [
    impact.attackDamage ? `造成 ${impact.attackDamage} 傷害` : null,
    impact.damageMultiplier > 1 ? `傷害倍率 ×${impact.damageMultiplier}` : null,
    impact.armorGained ? `護甲 +${impact.armorGained}` : null,
    impact.manaGained ? `法力 +${impact.manaGained}` : null,
  ].filter(Boolean);
  return parts.join('、') || '沒有產生效果';
}

function emptyImpact() {
  return {
    attackDamage: 0,
    armorGained: 0,
    manaGained: 0,
    equipmentBonus: 0,
    statusBonus: 0,
    damageMultiplier: 1,
  };
}

function consumeSpinDamageMultiplier(player) {
  const next = structuredClone(player);
  const index = (next.activeStatuses ?? [])
    .findIndex((active) => active.statusId === 'power-strike-ready');
  if (index < 0) return { player: next, multiplier: 1 };
  const active = next.activeStatuses[index];
  const multiplier = Math.max(1, Number(active.potency ?? 1));
  next.activeStatuses.splice(index, 1);
  return { player: next, multiplier };
}

function clearTurnResources(state) {
  state.resources.action = 0;
  state.resources.armor = 0;
  state.resources.mana = 0;
}

function clearCombatPresentation(state) {
  state.lastSpin = null;
  state.lastImpact = null;
  state.lastAction = null;
  state.lastResolution = null;
}

function applyEnemyOverrides(enemy, overrides) {
  if (overrides.maxHp !== undefined) {
    enemy.maxHp = Number(overrides.maxHp);
    enemy.hp = enemy.maxHp;
  }
  if (overrides.baseDamage !== undefined) {
    enemy.baseDamage = Number(overrides.baseDamage);
  }
  if (overrides.damageResistances) {
    enemy.damageResistances = structuredClone(overrides.damageResistances);
  }
  if (overrides.lootTableId) enemy.lootTableId = overrides.lootTableId;
}

function ensureCurrentFields(state) {
  state.player = normalizePlayerSkills(state.player);
  state.player.activeStatuses ??= [];
  state.player.inventory ??= [];
  state.player.equipment = normalizeEquipmentIds(state.player.equipment);
  state.combatModifiers = {
    ...createCombatModifiers(),
    ...(state.combatModifiers ?? {}),
    nextSpinSymbolChances: {
      ...(state.combatModifiers?.nextSpinSymbolChances ?? {}),
    },
  };
  state.rewardChoices ??= [];
  state.endSummary ??= null;
  state.stunned = isStunned(state);
  if (state.event) {
    const definition = getEvent(state.event.eventId);
    state.event.stage ??= 'choice';
    state.event.options ??= definition.options.map(({ id, label }) => ({ id, label }));
    state.event.result ??= null;
  }
  if (state.enemy) {
    state.enemy.activeStatuses ??= [];
    state.enemy.intent ??= {
      type: 'basic-attack',
      name: '普通攻擊',
      skillId: null,
      power: 1,
      damage: state.enemy.baseDamage,
      effects: [],
    };
  }
}

function upgradeLegacyState(legacy) {
  const next = structuredClone(legacy);
  const legacyResources = next.resources ?? {};
  const legacyAttack = Number(legacyResources.attack ?? 0);
  const legacyBoss = next.boss ?? next.enemy;
  const legacyStatus = next.status;
  const playerUnit = getUnit(next.player?.unitId ?? 'wanderer');
  const config = createConfig({
    playerUnitId: playerUnit.id,
    playerMaxHp: next.player?.maxHp ?? playerUnit.stats.maxHp,
  });

  next.schemaVersion = GAME_STATE_VERSION;
  next.config = config;
  next.adventure = createAdventureProgress(config.regionId);
  next.initialLoadout ??= {
    skillIds: [...(next.player?.skillIds ?? [playerUnit.skillIds[0]])],
    itemIds: [],
  };
  next.initialLoadout.itemIds = (next.initialLoadout.itemIds ?? [])
    .map(replaceLegacyStarterSwordId);
  next.player.activeStatuses ??= [];
  next.player.skillLevels ??= Object.fromEntries(
    (next.player.skillIds ?? []).map((skillId) => [skillId, 1]),
  );
  next.player.inventory ??= [];
  next.player.equipment ??= [];
  const splitItems = splitEquipmentFromInventory(next.player.inventory);
  next.player.inventory = splitItems.inventory;
  next.player.equipment = [
    ...splitItems.equipment,
    ...normalizeEquipmentIds(next.player.equipment),
  ];
  next.player.equipment = [...new Set(
    next.player.equipment.map(replaceLegacyStarterSwordId),
  )];
  next.resources = {
    action: Number(legacyResources.action ?? 0),
    armor: Number(legacyResources.armor ?? legacyResources.defense ?? 0),
    mana: Number(legacyResources.mana ?? legacyResources.skill ?? 0),
  };

  if (legacyBoss) {
    const unit = getUnit(legacyBoss.unitId ?? 'ruins-guardian');
    next.enemy = {
      ...scaleEnemyUnit(unit, 1, getRegion(config.regionId)),
      ...structuredClone(legacyBoss),
      unitId: legacyBoss.unitId ?? unit.id,
      baseDamage: Number(
        legacyBoss.baseDamage
        ?? legacy.config?.boss?.attackPattern?.[(next.round ?? 1) - 1]
        ?? unit.stats.attack,
      ),
      activeStatuses: structuredClone(legacyBoss.activeStatuses ?? []),
    };
    next.enemy.intent = {
      type: 'basic-attack',
      name: '普通攻擊',
      skillId: null,
      power: 1,
      damage: next.enemy.baseDamage,
      effects: [],
    };
  } else {
    next.enemy = null;
  }
  delete next.boss;

  if (legacyAttack > 0 && legacyStatus === GameStatus.ACTIVE && next.enemy) {
    const damage = Math.min(next.enemy.hp, legacyAttack);
    next.enemy.hp -= damage;
    next.lastImpact = {
      attackDamage: damage,
      armorGained: 0,
      manaGained: 0,
      equipmentBonus: 0,
      statusBonus: 0,
      damageMultiplier: 1,
    };
  } else {
    next.lastImpact ??= null;
  }

  next.status = legacyStatus;
  next.phase = legacyStatus === GameStatus.ACTIVE
    ? GamePhase.PLAYER_TURN
    : GamePhase.ENDED;
  next.event = null;
  next.rewardChoices = [];
  next.pendingRegionAdvance = false;
  next.combatModifiers = createCombatModifiers();
  next.endSummary = legacyStatus === GameStatus.ACTIVE ? null : {
    runId: next.id,
    reason: legacyStatus,
    defeatedBy: legacyStatus === GameStatus.LOST ? next.enemy?.name ?? null : null,
    defeatedUnitCount: 0,
    defeatedByRank: { normal: 0, elite: 0, boss: 0 },
    finalRegionDepth: 1,
    finalSkillIds: [...(next.player.skillIds ?? [])],
    finalSkillLevels: Object.fromEntries(
      (next.player.skillIds ?? []).map((skillId) => [skillId, 1]),
    ),
    finalEquipmentIds: equippedItemIds(next.player),
    newAchievementIds: [],
    newUnlockSkillIds: [],
    newUnlockItemIds: [],
    profileSettled: false,
  };
  next.lastAction ??= null;
  next.lastResolution ??= null;
  next.history ??= [];
  next.stunned = isStunned(next);
  delete next.spinsUsed;
  ensureCurrentFields(next);
  return next;
}

/**
 * v4以前的「燃焰之劍」其實是現在的普通「劍」。升級存檔時改成新 ID，
 * 避免舊玩家因同名道具改版而直接取得新的傳說效果。
 */
function migratePreItemExpansionState(state) {
  const splitItems = splitEquipmentFromInventory(state.player?.inventory ?? []);
  state.player.inventory = splitItems.inventory;
  state.player.equipment = [...new Set([
    ...splitItems.equipment,
    ...normalizeEquipmentIds(state.player?.equipment),
  ].map(replaceLegacyStarterSwordId))];
  if (state.initialLoadout?.itemIds) {
    state.initialLoadout.itemIds = state.initialLoadout.itemIds
      .map(replaceLegacyStarterSwordId);
  }
  if (state.endSummary?.finalEquipmentIds) {
    state.endSummary.finalEquipmentIds = state.endSummary.finalEquipmentIds
      .map(replaceLegacyStarterSwordId);
  }
  state.combatModifiers = createCombatModifiers();
}

function replaceLegacyStarterSwordId(itemId) {
  return itemId === 'flame-sword' ? 'sword' : itemId;
}
