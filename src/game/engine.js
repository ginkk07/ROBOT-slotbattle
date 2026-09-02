import { createConfig } from './config.js';
import { contentTypeEmoji } from './data/content-types.js';
import {
  DAMAGE_SOURCES,
  DamageSource,
} from './data/damage-sources.js';
import { getEvent } from './data/events.js';
import { EffectType } from './data/effect-types.js';
import { ItemEffectTrigger, ItemEffectType } from './data/item-effects.js';
import { ITEMS, getItem } from './data/items.js';
import { PLAYER_PROGRESSION_RULES } from './data/player-progression.js';
import { ContentRarity } from './data/rarities.js';
import { getRegion } from './data/regions.js';
import {
  PassiveSkillTrigger,
  SkillActivation,
} from './data/skill-effects.js';
import {
  SKILLS,
  getSkill,
  getSkillLevelDefinition,
  skillActivation,
  skillCost,
} from './data/skills.js';
import {
  StatusEffectType,
  StatusTrigger,
  getStatus,
} from './data/statuses.js';
import { getUnit, UnitRank } from './data/units.js';
import {
  createAdventureProgress,
  drawNextAdventureNode,
  scaleEnemyUnit,
} from './engines/adventure-engine.js';
import { applyEffects, damageAfterMitigation } from './engines/effects.js';
import { drawEncounter } from './engines/encounter-engine.js';
import {
  afterSpinEquipmentBonuses,
  applyTriggeredEquipmentEffects,
  consumeStatusRemovalEquipment,
  ensureMinimumSymbols,
  equipItem,
  equippedItemIds,
  equipmentActionLimitBonus,
  equipmentEffectEntries,
  equipmentSymbolChances,
  extraDamageAmount,
  firstSpinDamageHealingRequests,
  healingAmount,
  healingResourceBonus,
  minimumEliteEncounterChance,
  normalizeEquipmentIds,
  progressiveSpinExtraDamageRequests,
  promotesSymbolsWithLucky,
  reduceDamageBySource,
  reduceIncomingDamageWithEquipment,
  resourceGainAmount,
  spinDamageModifiers,
  treatsSymbolAsLucky,
  turnResourceRetentionRatio,
} from './engines/equipment-engine.js';
import { resolveEvent } from './engines/event-engine.js';
import {
  rollCombatRewards,
  rollRewardChoices,
  rollShopItemChoices,
} from './engines/loot-engine.js';
import { selectMonsterIntent } from './engines/monster-action-engine.js';
import { resolvePassiveSkillEffects } from './engines/passive-skill-engine.js';
import {
  grantSkillReward,
  forgetSkill,
  normalizePlayerSkills,
  playerSkillLevel,
  skillMaximum,
} from './engines/skill-progression.js';
import { shopPrice } from './engines/shop-engine.js';
import {
  advanceStatusDurations,
  attackStatusBonuses,
  consumeResourceGainDamageStatuses,
  consumeSpinDamageMultiplierStatuses,
  hasSymbolChanceModifiers,
  mergeActiveStatus,
  resolveAfterEnemyAttackStatuses,
  symbolChancesWithStatuses,
} from './engines/status-engine.js';
import { pickWeighted, randomInteger } from './engines/weighted-random.js';
import { drawReels, resolveSymbolChances } from './random.js';
import { scoreSpin } from './scoring.js';
import { SYMBOL_META, SymbolId } from './symbols.js';

export const GAME_STATE_VERSION = 6;

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
      gold: 0,
      skillIds: selectedSkillIds,
      skillLevels: Object.fromEntries(selectedSkillIds.map((skillId) => [skillId, 1])),
      inventory: startingItems.inventory,
      equipment: startingItems.equipment,
      damageResistances: { ...playerUnit.damageResistances },
      statusOverrides: structuredClone(playerUnit.statusOverrides),
      activeStatuses: [],
      pendingBattleStatuses: [],
    },
    enemy: null,
    event: null,
    rewardChoices: [],
    lastCombatReward: null,
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

  const fixedSymbolChances = {
    ...equipmentSymbolChances(next.player),
    ...next.combatModifiers.nextSpinSymbolChances,
  };
  const symbolChances = hasSymbolChanceModifiers(next.player)
    ? symbolChancesWithStatuses(
      next.player,
      resolveSymbolChances(fixedSymbolChances),
    )
    : fixedSymbolChances;
  const drawnReels = reels ?? drawReels(rng, symbolChances);
  const spinReels = ensureMinimumSymbols(next.player, drawnReels, { rng: chanceRng });
  // 「下一次拉霸」效果在抽牌後立即清除，三個💀也不會保留。
  next.combatModifiers.nextSpinSymbolChances = {};
  const outcome = scoreSpin(spinReels, wager, {
    promoteWithLucky: promotesSymbolsWithLucky(next.player),
    unluckyActsAsLucky: treatsSymbolAsLucky(next.player, SymbolId.UNLUCKY),
  });
  next.resources.action -= wager;
  next.lastSpin = outcome;
  next.history.push({ type: 'spin', round: next.round, outcome });

  const hasAttackReward = outcome.awarded.attack > 0;
  const statusBonuses = hasAttackReward
    ? attackStatusBonuses(next.player)
    : { attackPower: 0, additionalDamage: 0 };
  const multiplierResult = hasAttackReward
    ? consumeSpinDamageMultiplierStatuses(next.player)
    : { unit: next.player, multiplier: 1 };
  next.player = multiplierResult.unit;
  const damageModifiers = spinDamageModifiers(next.player, {
    wager,
    actionLimit: playerActionLimit(next),
  });
  const afterSpin = afterSpinEquipmentBonuses(next.player, {
    reels: outcome.reels,
    wager,
    chanceRng,
  });
  const requestedAttack = hasAttackReward
    ? Math.floor(
      (outcome.awarded.attack + statusBonuses.attackPower)
      * multiplierResult.multiplier
      * damageModifiers.multiplier,
    )
    : 0;
  const attackEvent = dealDamageToEnemy(
    next,
    requestedAttack,
    'physical',
    DamageSource.SPIN,
    { deferFollowUps: true },
  );
  const spinDamage = attackEvent?.amount ?? 0;

  // 額外傷害逐筆獨立結算，不進入強擊或賭徒左手倍率。
  const extraDamageEvents = [];
  if (spinDamage > 0 && statusBonuses.additionalDamage > 0) {
    const damageEvent = dealDamageToEnemy(
      next,
      statusBonuses.additionalDamage,
      'fire',
      DamageSource.EXTRA,
      { deferFollowUps: true },
    );
    if (damageEvent) extraDamageEvents.push({ ...damageEvent, statusId: 'fire-imbue' });
  }
  for (const request of progressiveSpinExtraDamageRequests(next)) {
    const damageEvent = dealDamageToEnemy(
      next,
      request.amount,
      request.element,
      DamageSource.EXTRA,
      { deferFollowUps: true },
    );
    if (damageEvent) extraDamageEvents.push({ ...damageEvent, itemId: request.itemId });
  }
  for (const event of afterSpin.events.filter((entry) => entry.type === 'bonus-damage')) {
    const damageEvent = dealDamageToEnemy(
      next,
      event.amount,
      event.element ?? 'arcane',
      DamageSource.EXTRA,
      { deferFollowUps: true },
    );
    if (damageEvent) extraDamageEvents.push({ ...damageEvent, itemId: event.itemId });
  }

  const flameSword = resolveAfterSpinDamageEquipment(next, {
    spinDamage,
    rng: chanceRng,
    deferFollowUps: true,
  });

  const armorGained = resourceGainAmount(
    next.player,
    'armor',
    outcome.awarded.defense + afterSpin.resources.armor,
  );
  const manaGained = resourceGainAmount(
    next.player,
    'mana',
    outcome.awarded.skill + afterSpin.resources.mana,
  );
  next.resources.armor += armorGained;
  next.resources.mana += manaGained;
  next.resources.action = Math.min(
    playerActionLimit(next),
    next.resources.action + afterSpin.resources.action,
  );

  const resourceDamageResult = consumeResourceGainDamageStatuses(
    next.player,
    {
      reels: outcome.reels,
      resourceGains: { armor: armorGained, mana: manaGained },
    },
  );
  next.player = resourceDamageResult.unit;
  let resourceStatusDamage = 0;
  const resourceStatusEvents = [...resourceDamageResult.events];
  for (const request of resourceDamageResult.requests) {
    const damageEvent = dealDamageToEnemy(
      next,
      request.amount,
      request.element,
      DamageSource.EXTRA,
      { deferFollowUps: true },
    );
    if (!damageEvent) continue;
    resourceStatusDamage += damageEvent.amount;
    resourceStatusEvents.push({
      ...damageEvent,
      statusId: request.statusId,
      resource: request.resource,
      resourceAmount: request.resourceAmount,
    });
  }

  const primaryDamageEvents = [
    attackEvent,
    ...extraDamageEvents,
    ...flameSword.events.filter((event) => event.type === 'damage'),
    ...resourceStatusEvents.filter((event) => event.type === 'damage'),
  ].filter(Boolean);
  const followUpDamageEvents = settleDamageFollowUps(next, primaryDamageEvents);

  const postSpinEquipmentEvents = resolveAfterSpinStateEquipment(next, outcome, {
    rng: chanceRng,
  });
  const spinHealingEvents = [];
  if (spinDamage > 0 && next.player.hp > 0) {
    for (const request of firstSpinDamageHealingRequests(next)) {
      spinHealingEvents.push(...healPlayer(next, request.amount, {
        itemId: request.itemId,
      }));
    }
  }

  const stunEvents = [];
  if (outcome.stunned) {
    const prevented = consumeStatusRemovalEquipment(next, 'stunned');
    if (prevented) {
      stunEvents.push(prevented);
    } else {
      next.stunned = true;
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
      stunEvents.push({ type: 'apply-status', statusId: 'stunned', applied: true });
    }
  }

  const curseDamage = followUpDamageEvents
    .filter((event) => (
      event.damageSource === DamageSource.CURSE && event.target === 'enemy'
    ))
    .reduce((sum, event) => sum + event.amount, 0);
  const reflectionDamage = followUpDamageEvents
    .filter((event) => (
      event.damageSource === DamageSource.REFLECT && event.target === 'self'
    ))
    .reduce((sum, event) => sum + event.amount, 0);
  const additionalDamage = extraDamageEvents.reduce((sum, event) => sum + event.amount, 0)
    + flameSword.damage
    + resourceStatusDamage;
  const attackDamage = spinDamage + additionalDamage + curseDamage;
  next.lastImpact = {
    attackDamage,
    spinDamage,
    additionalDamage,
    curseDamage,
    reflectionDamage,
    // 舊面板與舊存檔仍讀取 skillDamage；新版內容請使用 additionalDamage。
    skillDamage: additionalDamage,
    armorGained,
    manaGained,
    equipmentBonus: extraDamageEvents
      .filter((event) => event.itemId)
      .reduce((sum, event) => sum + event.amount, 0) + flameSword.damage,
    statusBonus: statusBonuses.attackPower + statusBonuses.additionalDamage,
    damageMultiplier: multiplierResult.multiplier * damageModifiers.multiplier,
  };
  next.lastAction = {
    type: outcome.stunned && next.stunned ? 'stunned' : 'spin',
    text: [
      spinActionText(next.lastImpact),
      outcome.stunned && next.stunned ? '本回合暈眩，只能按「回合結束」' : null,
      outcome.stunned && !next.stunned ? '電擊裝置已解除暈眩' : null,
    ].filter(Boolean).join('、'),
  };
  next.history.at(-1).equipmentEvents = [
    ...afterSpin.events,
    ...extraDamageEvents.filter((event) => event.itemId),
    ...flameSword.events,
    ...postSpinEquipmentEvents,
    ...spinHealingEvents,
    ...stunEvents.filter((event) => event.itemId),
  ];
  next.history.at(-1).statusEvents = [
    ...resourceStatusEvents,
    ...extraDamageEvents.filter((event) => event.statusId),
    ...followUpDamageEvents,
    ...stunEvents.filter((event) => !event.itemId),
  ];

  if (next.player.hp === 0) {
    finishRun(next, GameStatus.LOST, next.enemy.name);
    return next;
  }
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
  if (next.combatModifiers.sealedSkillIds?.includes(skillId)) {
    throw new Error(`${getSkill(skillId).name}在本場戰鬥遭到封印`);
  }

  const skill = getSkill(skillId);
  if (skillActivation(skill) === SkillActivation.PASSIVE) {
    throw new Error(`${skill.name}是自動生效的被動技能`);
  }
  const skillLevel = playerSkillLevel(next.player, skillId);
  const levelDefinition = getSkillLevelDefinition(skillId, skillLevel);
  const cost = skillCost(skill, skillLevel);
  if (next.resources.mana < cost) {
    throw new RangeError(`${skill.name}需要 ${cost} 點法力`);
  }
  if (wouldOnlyHealFullHealth({ effects: levelDefinition.effects }, next.player)) {
    throw new Error('生命已全滿，現在不需要治療');
  }
  if (wouldOnlyRefreshActiveStatus(levelDefinition.effects, next.player)) {
    throw new Error('這個效果目前仍在持續中');
  }
  const resourceReason = effectResourceBlockReason(
    levelDefinition.effects,
    next.resources,
  );
  if (resourceReason) throw new Error(resourceReason);

  const events = applyPlayerEffects(next, {
    effects: levelDefinition.effects,
    damageSource: DamageSource.EXTRA,
    rng,
  });
  next.resources.mana -= cost;
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
    cost,
    events,
  });

  if (next.player.hp === 0) finishRun(next, GameStatus.LOST, next.enemy.name);
  else if (next.enemy.hp === 0) awaitCombatVictoryConfirmation(next);
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
    damageSource: DamageSource.EXTRA,
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

  if (next.player.hp === 0) finishRun(next, GameStatus.LOST, next.enemy.name);
  else if (next.enemy.hp === 0) awaitCombatVictoryConfirmation(next);
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
  const playerTurnEndStatus = resolveTriggeredStatuses(
    next,
    'player',
    StatusTrigger.TURN_END,
  );
  next.player = advanceStatusDurations(playerTurnEndStatus.unit);
  const turnEndHealingEvents = applyHealingEquipmentBonus(
    next,
    playerTurnEndStatus.events,
  );
  const playerTurnEndEquipmentEvents = resolvePlayerTurnEndEquipment(next);

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

  const enemyTurnStartStatus = resolveTriggeredStatuses(
    next,
    'enemy',
    StatusTrigger.TURN_START,
  );
  next.enemy = enemyTurnStartStatus.unit;
  if (next.enemy.hp === 0) {
    awaitCombatVictoryConfirmation(next);
    return next;
  }

  const resolvedRound = next.round;
  const intent = next.enemy.intent ?? selectMonsterIntent(next.enemy, { rng: monsterRng });
  const armorBroken = removeArmorBeforeIncomingDamage(next);
  const armorUsed = Math.min(next.resources.armor, intent.damage);
  next.resources.armor = Math.max(0, next.resources.armor - armorUsed);
  const incomingAfterArmor = Math.max(0, intent.damage - armorUsed);
  const reducedIncomingDamage = reduceIncomingDamageWithEquipment(
    next.player,
    incomingAfterArmor,
  );
  const manaBeforePassiveSkills = next.resources.mana;
  const passiveSkillResolution = resolvePassiveSkillEffects(
    next.player,
    PassiveSkillTrigger.BEFORE_DAMAGE_TAKEN,
    {
      damage: reducedIncomingDamage,
      resources: next.resources,
      sealedSkillIds: next.combatModifiers.sealedSkillIds,
    },
  );
  next.resources = passiveSkillResolution.context.resources;
  const passiveDamageBlocked = Math.max(
    0,
    reducedIncomingDamage - passiveSkillResolution.context.damage,
  );
  const passiveManaSpent = Math.max(
    0,
    manaBeforePassiveSkills - next.resources.mana,
  );
  const damageTaken = Math.min(
    next.player.hp,
    passiveSkillResolution.context.damage,
  );
  next.player.hp -= damageTaken;
  const enemyAttackDamageEvent = {
    type: 'damage',
    element: 'physical',
    requested: intent.damage,
    amount: damageTaken,
    damageSource: DamageSource.EXTRA,
    target: 'self',
    armorBroken,
    armorUsed,
    passiveDamageBlocked,
  };
  const enemyAttackFollowUpEvents = resolveDamageFollowUps(next, {
    attacker: 'enemy',
    target: 'player',
    requested: intent.damage,
    amount: damageTaken,
    damageSource: DamageSource.EXTRA,
  });

  let monsterEffectEvents = [];
  if (next.player.hp > 0 && next.enemy.hp > 0 && intent.effects.length > 0) {
    monsterEffectEvents = applyMonsterEffects(next, intent.effects, {
      rng: monsterRng,
    });
  }

  const reactiveStatusResult = next.player.hp > 0 && next.enemy.hp > 0
    ? resolveAfterEnemyAttackStatuses(
      next.player,
      next.enemy,
      { rng: monsterRng },
    )
    : { holder: next.player, attacker: next.enemy, events: [] };
  next.player = reactiveStatusResult.holder;
  next.enemy = reactiveStatusResult.attacker;

  const enemyTurnEndStatus = next.enemy.hp > 0
    ? resolveTriggeredStatuses(next, 'enemy', StatusTrigger.TURN_END)
    : { unit: next.enemy, events: [] };
  next.enemy = advanceStatusDurations(enemyTurnEndStatus.unit);
  const discardedResources = clearTurnResources(next, {
    preserveBetweenTurns: true,
  });
  const discardedMana = discardedResources.mana;
  const retainedArmor = next.resources.armor;
  next.stunned = false;

  if (next.player.hp === 0) {
    finishRun(next, GameStatus.LOST, next.enemy.name);
    return next;
  }

  const enemyDefeatedByReaction = next.enemy.hp === 0;
  let playerTurnStartStatus = { unit: next.player, events: [] };
  let turnStartHealingEvents = [];
  let playerTurnStartEquipmentEvents = [];
  if (!enemyDefeatedByReaction) {
    next.round += 1;
    next.phase = GamePhase.PLAYER_TURN;
    next.combatModifiers.damageDealtThisTurn = 0;
    next.combatModifiers.damageDealtBySource = createDamageSourceTotals();
    next.combatModifiers.progressiveSpinExtraDamage = {};
    next.combatModifiers.usedTurnEquipmentEffects = {};
    next.resources.action = playerActionLimit(next);
    playerTurnStartStatus = resolveTriggeredStatuses(
      next,
      'player',
      StatusTrigger.TURN_START,
    );
    next.player = playerTurnStartStatus.unit;
    turnStartHealingEvents = applyHealingEquipmentBonus(
      next,
      playerTurnStartStatus.events,
    );
    playerTurnStartEquipmentEvents = applyPlayerTurnStartEquipmentEffects(next);
    next.enemy.intent = selectMonsterIntent(next.enemy, { rng: monsterRng });
  }

  next.lastResolution = {
    round: resolvedRound,
    stunned: wasStunned,
    discardedAction,
    discardedMana,
    armorBroken,
    armorUsed,
    retainedArmor,
    enemyAction: {
      type: intent.type,
      name: intent.name,
      skillId: intent.skillId,
    },
    enemyAttack: intent.damage,
    bossAttack: intent.damage,
    passiveSkillEvents: passiveSkillResolution.events,
    passiveDamageBlocked,
    passiveManaSpent,
    // 保留既有欄位，讓舊存檔／外部紀錄仍可讀；戰鬥流程已不辨識魔力護甲。
    manaArmorBlocked: passiveDamageBlocked,
    manaSpent: passiveManaSpent,
    damageTaken,
    enemyAttackDamageEvent,
    monsterEffectEvents,
    afterEnemyAttackStatusEvents: reactiveStatusResult.events,
    damageFollowUpEvents: enemyAttackFollowUpEvents,
    // 舊欄位保留給現有面板；新版反射事件改收錄在 damageFollowUpEvents。
    afterEnemyAttackEquipmentEvents: [],
    enemyStatusEvents: [
      ...enemyTurnStartStatus.events,
      ...enemyTurnEndStatus.events,
    ],
    playerStatusEvents: [
      ...playerTurnEndStatus.events,
      ...reactiveStatusResult.events,
      ...playerTurnStartStatus.events,
    ],
    playerEquipmentEvents: [
      ...turnEndHealingEvents,
      ...playerTurnEndEquipmentEvents,
      ...enemyAttackFollowUpEvents,
      ...turnStartHealingEvents,
      ...playerTurnStartEquipmentEvents,
    ],
  };
  next.history.push({
    type: 'turn-resolution',
    ...structuredClone(next.lastResolution),
  });
  if (enemyDefeatedByReaction) awaitCombatVictoryConfirmation(next);
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
  const goldCost = Number(resolved.option.goldCost ?? 0);
  if (next.player.gold < goldCost) {
    throw new RangeError(`金錢不足，目前需要 🪙${goldCost}`);
  }
  next.player.gold -= goldCost;
  next.history.push({
    type: 'event-option-selected',
    eventId: next.event.eventId,
    optionId,
    outcomeId: outcome.id,
    outcomeType: outcome.type,
    goldCost,
  });

  if (outcome.type === 'full-heal') {
    next.player.hp = next.player.maxHp;
  } else if (outcome.type === 'seal-random-skill') {
    const skillId = randomPendingSkillSealId(next.player, eventRng);
    if (skillId) {
      next.player.pendingSealedSkillIds = [...new Set([
        ...(next.player.pendingSealedSkillIds ?? []),
        skillId,
      ])];
      next.event.sealedSkillId = skillId;
    }
  } else if (outcome.type === 'full-heal-start-combat') {
    next.player.hp = next.player.maxHp;
    startEventCombat(next, outcome, { rng: eventRng, monsterRng });
    return next;
  } else if (outcome.type === 'start-combat') {
    startEventCombat(next, outcome, { rng: eventRng, monsterRng });
    return next;
  } else if (outcome.type === 'blood-unseal') {
    resolveBloodUnseal(next, outcome, eventRng);
    return next;
  } else if (outcome.type === 'reduce-max-hp-upgrade-skill') {
    beginAncientEchoUpgrade(next, outcome);
    return next;
  } else if (outcome.type === 'collector-challenge') {
    beginCollectorChallenge(next, outcome, eventRng);
    return next;
  } else if (outcome.type === 'open-shop') {
    beginMysteriousShop(next, outcome, eventRng);
    return next;
  } else if (outcome.type === 'gain-gold') {
    const gold = randomInteger(outcome.gold.minimum, outcome.gold.maximum, eventRng);
    next.player.gold += gold;
    next.history.push({
      type: 'event-gold-gained',
      eventId: next.event.eventId,
      gold,
    });
    setEventResult(next, outcome, `${outcome.text}\n你獲得 🪙${gold}。`);
    return next;
  } else if (outcome.type === 'grant-next-battle-status') {
    queueNextBattleStatus(next, outcome);
    setEventResult(
      next,
      outcome,
      `${outcome.text}\n你失去 🪙${goldCost}；下一場戰鬥獲得「${getStatus(outcome.statusId).name}」${outcome.duration}回合。`,
    );
    return next;
  } else if (outcome.type === 'grant-random-reward') {
    grantRandomEventReward(next, outcome, eventRng);
    return next;
  } else if (outcome.type !== 'continue') {
    throw new RangeError(`尚未支援的事件結果：${outcome.type}`);
  }

  const sealedName = next.event.sealedSkillId
    ? `\n你的「${getSkill(next.event.sealedSkillId).name}」在下一場戰鬥中遭到封印。`
    : '';
  setEventResult(next, outcome, `${outcome.text}${sealedName}`);
  return next;
}

/**
 * 處理奇遇中的技能選擇。遠古回響、收藏家下注與技能替換共用此入口，
 * 由 event.stage 決定選擇的用途，避免 Discord 按鈕直接改寫存檔。
 */
export function chooseEventSkill(
  state,
  skillId,
  { eventRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  assertEventStage(next, [
    'skill-upgrade-choice',
    'collector-wager-choice',
    'collector-replace-choice',
  ]);
  if (!next.event.skillChoices?.includes(skillId)) {
    throw new RangeError('這個技能不在目前的奇遇選項中');
  }

  if (next.event.stage === 'skill-upgrade-choice') {
    const granted = grantSkillReward(next.player, skillId);
    Object.assign(next.player, granted.player);
    const skill = getSkill(skillId);
    const outcome = next.event.pendingOutcome;
    next.history.push({
      type: 'event-skill-upgraded',
      eventId: next.event.eventId,
      skillId,
      targetLevel: granted.targetLevel,
    });
    setEventResult(
      next,
      outcome,
      `${outcome.text}\n你的最大生命降低 ${next.event.maxHpReduced} 點。遠古的知識湧入腦海，「${skill.name}」提升至 Lv.${granted.targetLevel}。`,
    );
    return next;
  }

  if (next.event.stage === 'collector-replace-choice') {
    const collector = next.event.collector;
    const oldSkill = getSkill(skillId);
    const rewardSkill = getSkill(collector.rewardId);
    next.player = forgetSkill(next.player, skillId);
    const granted = grantSkillReward(next.player, collector.rewardId);
    Object.assign(next.player, granted.player);
    next.history.push({
      type: 'event-collector-skill-replaced',
      eventId: next.event.eventId,
      oldSkillId: skillId,
      newSkillId: collector.rewardId,
    });
    setEventResult(next, {
      id: 'collector-skill-win',
      type: 'collector-challenge',
    }, `三枚符文同時亮起。你捨棄了「${oldSkill.name}」，掌握傳說技能「${rewardSkill.name}」。`);
    return next;
  }

  next.event.collector.wagerSkillId = skillId;
  next.history.push({
    type: 'event-collector-wager-selected',
    eventId: next.event.eventId,
    skillId,
    rewardType: next.event.collector.rewardType,
    rewardId: next.event.collector.rewardId,
  });
  resolveCollectorSpin(next, null, eventRng);
  return next;
}

/** 處理密封石室揭示裝備後的收下／放回選擇；已支付的生命不會返還。 */
export function chooseVaultReward(state, choice) {
  const next = upgradeGameState(state);
  assertEventStage(next, ['vault-reward-choice']);
  if (!['accept', 'leave'].includes(choice)) {
    throw new RangeError('密封石室的裝備選擇不存在');
  }

  const itemId = next.event.vault?.itemId;
  if (!itemId) throw new Error('密封石室沒有等待選擇的裝備');
  const item = getItem(itemId);
  const accepted = choice === 'accept';
  if (accepted) {
    applyReward(next.player, {
      contentType: 'item',
      contentId: item.id,
      acquisition: 'acquire',
      rarity: item.rarity,
    });
  }
  next.history.push({
    type: 'event-vault-reward-selected',
    eventId: next.event.eventId,
    itemId: item.id,
    accepted,
  });

  const text = accepted
    ? `你收下稀有裝備「${item.name}」，轉身離開石室。`
    : `你將稀有裝備「${item.name}」放回石臺。封印已經解除，支付的 ${next.event.vault.damage} 點生命不會返還。`;
  setEventResult(next, next.event.pendingOutcome, text);
  return next;
}

/** 目前神秘商店的下一筆交易價格。 */
export function currentShopPrice(state) {
  if (state.phase !== GamePhase.EVENT || state.event?.stage !== 'shop') {
    throw new Error('目前不在神秘商店中');
  }
  return shopPrice(
    state.adventure.regionDepth,
    state.event.shop?.purchases ?? 0,
  );
}

export function purchaseShopItem(state, itemId) {
  const next = upgradeGameState(state);
  assertEventStage(next, ['shop']);
  const offer = next.event.shop?.items?.find((entry) => entry.contentId === itemId);
  if (!offer || offer.purchased) throw new RangeError('這件商品目前無法購買');

  const price = currentShopPrice(next);
  payShopPrice(next, price);
  applyReward(next.player, offer);
  offer.purchased = true;
  recordShopPurchase(next, {
    purchaseType: 'item',
    contentId: itemId,
    price,
  });
  return next;
}

export function purchaseShopSkill(state, skillId) {
  const next = upgradeGameState(state);
  assertEventStage(next, ['shop']);
  if (!next.event.skillChoices?.includes(skillId)) {
    throw new RangeError('這項技能目前無法強化');
  }

  const price = currentShopPrice(next);
  payShopPrice(next, price);
  const granted = grantSkillReward(next.player, skillId);
  Object.assign(next.player, granted.player);
  next.event.skillChoices = upgradableSkillIds(next.player);
  recordShopPurchase(next, {
    purchaseType: 'skill',
    contentId: skillId,
    targetLevel: granted.targetLevel,
    price,
  });
  return next;
}

export function leaveShop(state) {
  const next = upgradeGameState(state);
  assertEventStage(next, ['shop']);
  const purchases = next.event.shop?.purchases ?? 0;
  const totalSpent = next.event.shop?.totalSpent ?? 0;
  const text = purchases > 0
    ? `你結束交易並離開商店。本次共購買 ${purchases} 次，花費 🪙${totalSpent}。`
    : '你沒有購買任何商品，向商人點頭後離開。';
  setEventResult(next, {
    id: 'shop-left',
    type: 'open-shop',
  }, text);
  return next;
}

/** 進行收藏家的下一次轉動；lockIndex為null時重新轉動全部三格。 */
export function spinCollectorEvent(
  state,
  lockIndex,
  { eventRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  assertEventStage(next, ['collector-spin']);
  const normalizedLock = lockIndex === null || lockIndex === 'none'
    ? null
    : Number(lockIndex);
  if (
    normalizedLock !== null
    && (!Number.isInteger(normalizedLock) || normalizedLock < 0 || normalizedLock > 2)
  ) {
    throw new RangeError('收藏家鎖定位置必須是第1～3格');
  }
  resolveCollectorSpin(next, normalizedLock, eventRng);
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
  if (next.event.stage !== 'result') {
    throw new Error('這個奇遇仍有尚未完成的選擇');
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

function resolveBloodUnseal(state, outcome, rng) {
  const item = drawEventEquipmentReward(state, {
    rarity: outcome.rewardRarity,
    rng,
  });
  if (!item) {
    setEventResult(
      state,
      outcome,
      `${outcome.text}\n石臺上已沒有你能取得的新裝備，封印也沒有奪走你的生命。`,
    );
    return;
  }

  const requestedDamage = Math.max(
    1,
    Math.floor(state.player.maxHp * Number(outcome.damageMaxHpRatio ?? 0)),
  );
  const damage = Math.min(requestedDamage, Math.max(0, state.player.hp - 1));
  state.player.hp -= damage;
  state.history.push({
    type: 'event-blood-unsealed',
    eventId: state.event.eventId,
    damage,
    itemId: item.id,
  });
  state.event.stage = 'vault-reward-choice';
  state.event.pendingOutcome = structuredClone(outcome);
  state.event.vault = { itemId: item.id, damage };
  state.event.prompt = [
    outcome.text,
    `你失去 ${damage} 點生命。石臺上出現稀有裝備「${item.name}」。`,
    `效果｜${item.description}`,
    '你可以收下裝備，或將它放回石臺；已支付的生命不會返還。',
  ].join('\n');
}

function beginAncientEchoUpgrade(state, outcome) {
  const previousMaxHp = state.player.maxHp;
  state.player.maxHp = Math.max(
    1,
    Math.floor(previousMaxHp * Number(outcome.maxHpRatio ?? 1)),
  );
  state.player.hp = Math.min(state.player.hp, state.player.maxHp);
  state.event.maxHpReduced = previousMaxHp - state.player.maxHp;
  state.event.pendingOutcome = structuredClone(outcome);
  state.event.skillChoices = (state.player.skillIds ?? []).filter((skillId) => (
    playerSkillLevel(state.player, skillId) < skillMaximum(skillId)
  ));

  if (state.event.skillChoices.length === 0) {
    setEventResult(
      state,
      outcome,
      `${outcome.text}\n你的最大生命降低 ${state.event.maxHpReduced} 點，但目前沒有尚未滿級的技能。`,
    );
    return;
  }

  state.event.stage = 'skill-upgrade-choice';
  state.event.prompt = `${outcome.text}\n你的最大生命降低 ${state.event.maxHpReduced} 點。請選擇一項尚未滿級的技能。`;
}

function beginCollectorChallenge(state, outcome, rng) {
  const reward = drawCollectorReward(state, outcome.rewardType, rng);
  if (!reward || (state.player.skillIds?.length ?? 0) === 0) {
    const reason = !reward
      ? '收藏家沒有能提供給你的新傳說獎勵。'
      : '你目前沒有可作為賭注的技能。';
    setEventResult(state, outcome, `${outcome.text}\n${reason}`);
    return;
  }

  state.event.collector = {
    rewardType: outcome.rewardType,
    rewardId: reward.id,
    wagerSkillId: null,
    attempt: 0,
    reels: [],
  };
  state.event.pendingOutcome = structuredClone(outcome);
  state.event.skillChoices = [...state.player.skillIds];
  state.event.stage = 'collector-wager-choice';
  state.event.prompt = [
    `收藏家向你展示了${outcome.rewardType === 'skill' ? '傳說技能' : '傳說裝備'}「${reward.name}」。`,
    '請選擇一項現有技能作為賭注。挑戰成功會保留賭注；失敗則永久失去該技能。',
  ].join('\n');
}

function beginMysteriousShop(state, outcome, rng) {
  const region = getRegion(state.adventure.regionId);
  const items = rollShopItemChoices({
    rng,
    regionTags: region.tags,
    player: state.player,
  });
  state.event.stage = 'shop';
  state.event.prompt = outcome.text;
  state.event.skillChoices = upgradableSkillIds(state.player);
  state.event.shop = {
    purchases: 0,
    totalSpent: 0,
    items,
  };
  state.history.push({
    type: 'event-shop-opened',
    eventId: state.event.eventId,
    regionDepth: state.adventure.regionDepth,
    items: structuredClone(items),
    skillIds: [...state.event.skillChoices],
  });
}

function upgradableSkillIds(player) {
  return (player.skillIds ?? []).filter((skillId) => (
    playerSkillLevel(player, skillId) < skillMaximum(skillId)
  ));
}

function payShopPrice(state, price) {
  if (state.player.gold < price) {
    throw new RangeError(`金錢不足，目前需要 🪙${price}`);
  }
  state.player.gold -= price;
}

function recordShopPurchase(state, purchase) {
  state.event.shop.purchases += 1;
  state.event.shop.totalSpent += purchase.price;
  state.history.push({
    type: 'event-shop-purchased',
    eventId: state.event.eventId,
    ...purchase,
  });
}

function resolveCollectorSpin(state, lockIndex, rng) {
  const collector = state.event.collector;
  if (!collector?.wagerSkillId) throw new Error('收藏家尚未收到賭注技能');
  if (collector.attempt >= 4) throw new Error('收藏家的轉動次數已用完');

  const probabilities = resolveSymbolChances(equipmentSymbolChances(state.player));
  const previous = collector.reels ?? [];
  collector.reels = [0, 1, 2].map((index) => (
    lockIndex !== null && previous.length === 3 && index === lockIndex
      ? previous[index]
      : drawEventSymbol(probabilities, rng)
  ));
  collector.attempt += 1;
  state.history.push({
    type: 'event-collector-spin',
    eventId: state.event.eventId,
    attempt: collector.attempt,
    lockIndex,
    reels: [...collector.reels],
  });

  if (collectorSpinWins(collector.reels)) {
    finishCollectorWin(state);
    return;
  }
  if (collector.attempt >= 4) {
    const wagerSkill = getSkill(collector.wagerSkillId);
    state.player = forgetSkill(state.player, collector.wagerSkillId);
    state.history.push({
      type: 'event-collector-lost',
      eventId: state.event.eventId,
      skillId: collector.wagerSkillId,
    });
    setEventResult(state, {
      id: 'collector-wager-lost',
      type: 'collector-challenge',
    }, `第四次轉動緩緩停下，符文依然無法排列一致。你永久失去了作為賭注的「${wagerSkill.name}」。`);
    return;
  }

  state.event.stage = 'collector-spin';
  state.event.prompt = `第 ${collector.attempt}／4 次轉動未成功。下一次可以重新轉動全部符文，或鎖定其中1格。`;
}

function finishCollectorWin(state) {
  const collector = state.event.collector;
  const wagerSkill = getSkill(collector.wagerSkillId);
  if (collector.rewardType === 'equipment') {
    const item = getItem(collector.rewardId);
    applyReward(state.player, {
      contentType: 'item',
      contentId: item.id,
      acquisition: 'acquire',
      rarity: item.rarity,
    });
    state.history.push({
      type: 'event-collector-won',
      eventId: state.event.eventId,
      rewardType: collector.rewardType,
      rewardId: item.id,
      wagerSkillId: collector.wagerSkillId,
    });
    setEventResult(state, {
      id: 'collector-item-win',
      type: 'collector-challenge',
    }, `三枚符文同時亮起。你取得傳說裝備「${item.name}」，作為賭注的「${wagerSkill.name}」也回到了你的手中。`);
    return;
  }

  const rewardSkill = getSkill(collector.rewardId);
  if ((state.player.skillIds?.length ?? 0) < PLAYER_PROGRESSION_RULES.maxHeldSkills) {
    const granted = grantSkillReward(state.player, rewardSkill.id);
    Object.assign(state.player, granted.player);
    state.history.push({
      type: 'event-collector-won',
      eventId: state.event.eventId,
      rewardType: collector.rewardType,
      rewardId: rewardSkill.id,
      wagerSkillId: collector.wagerSkillId,
    });
    setEventResult(state, {
      id: 'collector-skill-win',
      type: 'collector-challenge',
    }, `三枚符文同時亮起。你掌握傳說技能「${rewardSkill.name}」，作為賭注的「${wagerSkill.name}」也回到了你的手中。`);
    return;
  }

  state.event.stage = 'collector-replace-choice';
  state.event.skillChoices = [...state.player.skillIds];
  state.event.prompt = `三枚符文同時亮起，你贏得傳說技能「${rewardSkill.name}」。技能欄已滿，請選擇一項現有技能進行替換。`;
}

function drawEventEquipmentReward(state, { rarity, rng }) {
  const regionTags = getRegion(state.adventure.regionId).tags;
  const owned = new Set(equippedItemIds(state.player));
  const candidates = Object.values(ITEMS).filter((item) => (
    item.type === 'equipment'
    && item.rarity === rarity
    && item.lootEligible
    && regionTags.every((tag) => item.lootTags?.includes(tag))
    && !owned.has(item.id)
  ));
  return candidates.length > 0
    ? pickWeighted(candidates, rng, (item) => item.lootWeight)
    : null;
}

function drawCollectorReward(state, rewardType, rng) {
  const regionTags = getRegion(state.adventure.regionId).tags;
  if (rewardType === 'skill') {
    const owned = new Set(state.player.skillIds ?? []);
    const candidates = Object.values(SKILLS).filter((skill) => (
      skill.rarity === ContentRarity.LEGENDARY
      && skill.lootEligible
      && regionTags.every((tag) => skill.lootTags?.includes(tag))
      && !owned.has(skill.id)
    ));
    return candidates.length > 0
      ? pickWeighted(candidates, rng, (skill) => skill.lootWeight)
      : null;
  }
  if (rewardType === 'equipment') {
    return drawEventEquipmentReward(state, {
      rarity: ContentRarity.LEGENDARY,
      rng,
    });
  }
  throw new RangeError(`收藏家獎勵類型不合法：${rewardType}`);
}

function drawEventSymbol(probabilities, rng) {
  const entries = Object.entries(probabilities).map(([symbolId, weight]) => ({
    symbolId,
    weight,
  }));
  return pickWeighted(entries, rng).symbolId;
}

function collectorSpinWins(reels) {
  if (reels.includes(SymbolId.UNLUCKY)) return false;
  const fixedSymbols = reels.filter((symbolId) => symbolId !== SymbolId.LUCKY);
  return new Set(fixedSymbols).size <= 1;
}

function setEventResult(state, outcome, text) {
  state.event.stage = 'result';
  state.event.prompt = null;
  state.event.skillChoices = [];
  state.event.pendingOutcome = null;
  state.event.shop = null;
  state.event.vault = null;
  state.event.result = {
    outcomeId: outcome.id,
    type: outcome.type,
    text,
  };
}

function assertEventStage(state, stages) {
  if (state.status !== GameStatus.ACTIVE || state.phase !== GamePhase.EVENT) {
    throw new Error('目前沒有可處理的奇遇');
  }
  if (!stages.includes(state.event?.stage)) {
    throw new Error('目前不能進行這項奇遇選擇');
  }
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

  if (next.schemaVersion === 5) {
    next.schemaVersion = GAME_STATE_VERSION;
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
  state.lastCombatReward = null;
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
      options: node.event.options.map(({ id, label, goldCost }) => ({
        id,
        label,
        ...(goldCost !== undefined ? { goldCost } : {}),
      })),
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
  activatePendingSkillSeals(state);
  activatePendingBattleStatuses(state);
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
  const unit = outcome.unitId
    ? getUnit(outcome.unitId)
    : drawEncounter(tableId, { rng });
  const enemy = scaleEnemyUnit(unit, state.adventure.regionDepth, region);
  const eventId = state.event.eventId;

  state.event = null;
  state.phase = GamePhase.PLAYER_TURN;
  state.enemy = enemy;
  state.enemy.intent = selectMonsterIntent(state.enemy, { rng: monsterRng });
  state.rewardChoices = [];
  state.lastCombatReward = null;
  state.round = 1;
  clearTurnResources(state);
  state.combatModifiers = createCombatModifiers();
  state.resources.action = playerActionLimit(state);
  clearCombatPresentation(state);
  state.player.activeStatuses = [];
  state.stunned = false;
  activatePendingSkillSeals(state);
  activatePendingBattleStatuses(state);
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

function randomPendingSkillSealId(player, rng) {
  const alreadyPending = new Set(player.pendingSealedSkillIds ?? []);
  const available = (player.skillIds ?? []).filter((skillId) => (
    !alreadyPending.has(skillId)
  ));
  const skillIds = available.length > 0 ? available : (player.skillIds ?? []);
  if (skillIds.length === 0) return null;
  return skillIds[randomInteger(0, skillIds.length - 1, rng)];
}

function activatePendingSkillSeals(state) {
  state.combatModifiers.sealedSkillIds = [...new Set(
    state.player.pendingSealedSkillIds ?? [],
  )];
  state.player.pendingSealedSkillIds = [];
}

function activatePendingBattleStatuses(state) {
  const pending = state.player.pendingBattleStatuses ?? [];
  for (const status of pending) {
    state.player.activeStatuses = mergeActiveStatus(
      state.player.activeStatuses,
      status,
    );
  }
  if (pending.length > 0) {
    state.history.push({
      type: 'pending-battle-statuses-activated',
      statuses: structuredClone(pending),
    });
  }
  state.player.pendingBattleStatuses = [];
}

function awaitCombatVictoryConfirmation(state) {
  if (state.phase !== GamePhase.PLAYER_TURN) return;
  const battleEndEvents = applyTriggeredEquipmentEffects(
    state,
    ItemEffectTrigger.BATTLE_END,
    { healAmountResolver: (amount) => healingAmount(state.player, amount) },
  );
  const battleEndHealingEvents = applyHealingEquipmentBonus(state, battleEndEvents);
  if (battleEndEvents.length > 0 || battleEndHealingEvents.length > 0) {
    state.history.push({
      type: 'equipment-battle-end',
      round: state.round,
      events: [...battleEndEvents, ...battleEndHealingEvents],
    });
  }
  state.phase = GamePhase.VICTORY_CONFIRM;
  state.enemy.intent = null;
  clearTurnResources(state);
  state.stunned = false;

  const region = getRegion(state.adventure.regionId);
  const shouldRestoreHp = state.enemy.rank === UnitRank.BOSS
    && region.encounterRules.boss.restorePlayerHpAfterVictory;
  // BOSS 勝利回復是地區規則，不視為一般治療事件，因此不觸發頌缽等治療裝備。
  if (shouldRestoreHp) state.player.hp = state.player.maxHp;
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
  const combatReward = rollCombatRewards(defeated.lootTableId, {
    rng: rewardRng,
    regionTags: region.tags,
    rarityModifiers: state.adventure.modifiers.rewardRarity,
    player: state.player,
  });
  state.player.gold += combatReward.gold;
  state.rewardChoices = combatReward.choices;
  state.lastCombatReward = {
    gold: combatReward.gold,
    dropped: combatReward.dropped,
  };
  state.phase = GamePhase.REWARD_CHOICE;
  state.history.push({
    type: 'combat-victory',
    unitId: defeated.unitId,
    rank: defeated.rank,
    gold: combatReward.gold,
    rewardDropped: combatReward.dropped,
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
    finalGold: state.player.gold,
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
  state.lastCombatReward = null;
  state.pendingRegionAdvance = false;
  clearTurnResources(state);
  state.player.activeStatuses = [];
  state.player.pendingSealedSkillIds = [];
  state.player.pendingBattleStatuses = [];
  state.player.inventory = [];
  state.player.equipment = [];
  state.player.skillIds = [];
  state.player.gold = 0;
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

function queueNextBattleStatus(state, outcome) {
  const incoming = {
    statusId: outcome.statusId,
    sourceUnitId: null,
    remainingTurns: outcome.duration,
    stacks: outcome.stacks ?? 1,
    potency: outcome.potency ?? 1,
  };
  state.player.pendingBattleStatuses = mergeActiveStatus(
    state.player.pendingBattleStatuses,
    incoming,
  );
  state.history.push({
    type: 'event-next-battle-status-granted',
    eventId: state.event.eventId,
    ...incoming,
  });
}

function grantRandomEventReward(state, outcome, rng) {
  const region = getRegion(state.adventure.regionId);
  const reward = rollRewardChoices(outcome.lootTableId, {
    rng,
    regionTags: region.tags,
    player: state.player,
  })[0];
  if (!reward) {
    setEventResult(
      state,
      outcome,
      `${outcome.text}\n目前沒有符合持有與等級規則的新獎勵。`,
    );
    return;
  }

  applyReward(state.player, reward);
  state.history.push({
    type: 'event-random-reward-granted',
    eventId: state.event.eventId,
    reward: structuredClone(reward),
  });
  setEventResult(
    state,
    outcome,
    `${outcome.text}\n你獲得「${rewardContentName(reward)}」。`,
  );
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
    { healAmountResolver: (amount) => healingAmount(state.player, amount) },
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
    { healAmountResolver: (amount) => healingAmount(state.player, amount) },
  );
  return [...events, ...applyHealingEquipmentBonus(state, events)];
}

/**
 * 玩家技能、消耗品共用的效果入口。所有玩家造成的傷害與治療觸發裝備
 * 都從這裡記錄，避免新增技能時漏掉夏賜儀碇或頌缽的判定。
 */
function applyPlayerEffects(
  state,
  { effects = [], damageSource = null, rng } = {},
) {
  if (effects.length === 0) return [];
  const events = [];
  for (const effect of effects) {
    if (effect.target === 'enemy' && state.enemy?.hp <= 0) continue;

    if (effect.type === EffectType.DAMAGE) {
      const baseAmount = Number(effect.amount ?? effect.amountPerPoint ?? 0);
      const damageEvent = effect.target === 'self'
        ? applyDirectDamage(
          state,
          'player',
          extraDamageAmount(state.player, baseAmount),
          effect.element,
          damageSource,
        )
        : dealDamageToEnemy(state, baseAmount, effect.element, damageSource);
      if (damageEvent) {
        events.push(damageEvent, ...(damageEvent.followUpEvents ?? []));
      }
      continue;
    }

    if (effect.type === EffectType.DAMAGE_FROM_RESOURCE) {
      const current = Number(state.resources[effect.resource] ?? 0);
      const minimum = Number(effect.minimumResource ?? 0);
      if (current < minimum) {
        throw new RangeError(`${effect.resource}至少需要 ${minimum} 點`);
      }
      const baseAmount = Math.floor(current * Number(effect.multiplier ?? 1));
      const remaining = Math.floor(current * (1 - Number(effect.consumeRatio ?? 0)));
      const resourceSpent = current - remaining;
      state.resources[effect.resource] = remaining;
      const damageEvent = dealDamageToEnemy(
        state,
        baseAmount,
        effect.element,
        damageSource,
      );
      if (damageEvent) {
        Object.assign(damageEvent, {
          resource: effect.resource,
          resourceSpent,
          resourceRemaining: remaining,
        });
        events.push(damageEvent, ...(damageEvent.followUpEvents ?? []));
      }
      continue;
    }

    const result = applyEffects({
      effects: [effect],
      source: state.player,
      target: state.enemy,
      resources: state.resources,
      resourceGainResolver: (resource, amount) => resourceGainAmount(
        state.player,
        resource,
        amount,
      ),
      resourceMaximums: { action: playerActionLimit(state) },
      damageSource,
      healAmountResolver: (amount) => healingAmount(state.player, amount),
      rng,
    });
    state.player = result.source;
    state.enemy = result.target;
    state.resources = result.resources;
    events.push(...result.events);
    events.push(...applyHealingEquipmentBonus(state, result.events));
  }
  return events;
}

function applyMonsterEffects(state, effects, { rng = Math.random } = {}) {
  const events = [];
  for (const effect of effects) {
    if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
    if (effect.type === EffectType.DAMAGE) {
      const requested = Number(effect.amount ?? effect.amountPerPoint ?? 0);
      const targetKey = effect.target === 'self' ? 'enemy' : 'player';
      const attackerKey = targetKey === 'player' ? 'enemy' : 'player';
      const damageEvent = applyDirectDamage(
        state,
        targetKey,
        requested,
        effect.element,
        DamageSource.EXTRA,
      );
      if (damageEvent) {
        const followUpEvents = resolveDamageFollowUps(state, {
          attacker: attackerKey,
          target: targetKey,
          requested,
          amount: damageEvent.amount,
          damageSource: DamageSource.EXTRA,
        });
        events.push(damageEvent, ...followUpEvents);
      }
      continue;
    }

    const result = applyEffects({
      effects: [effect],
      source: state.enemy,
      target: state.player,
      damageSource: DamageSource.EXTRA,
      rng,
    });
    state.enemy = result.source;
    state.player = result.target;
    events.push(...result.events);
  }
  return events;
}

function applyHealingEquipmentBonus(state, events) {
  const bonus = healingResourceBonus(state.player, events);
  const bonusEvents = [];
  for (const [resource, requestedAmount] of Object.entries(bonus)) {
    const amount = resourceGainAmount(
      state.player,
      resource,
      requestedAmount,
    );
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
      const amount = resourceGainAmount(
        state.player,
        effect.resource,
        effect.amount,
      );
      if (amount <= 0) continue;
      if (effect.resource === 'action') {
        state.resources.action = Math.min(
          playerActionLimit(state),
          state.resources.action + amount,
        );
      } else {
        state.resources[effect.resource] += amount;
      }
      events.push({
        type: 'gain-resource',
        resource: effect.resource,
        amount,
      });
      continue;
    }

    throw new RangeError(`尚未支援的戰鬥道具效果：${effect.type}`);
  }
  return events;
}

function dealDamageToEnemy(
  state,
  amount,
  element,
  damageSource,
  { deferFollowUps = false } = {},
) {
  if (!Number.isFinite(amount) || amount <= 0 || state.enemy?.hp <= 0) return null;
  const requested = damageSource === DamageSource.EXTRA
    ? extraDamageAmount(state.player, amount)
    : amount;
  const event = applyDirectDamage(state, 'enemy', requested, element, damageSource);
  if (!event || event.amount <= 0) return event;
  if (deferFollowUps) {
    event.followUpEvents = [];
    return event;
  }

  const followUpEvents = resolveDamageFollowUps(state, {
    attacker: 'player',
    target: 'enemy',
    requested,
    amount: event.amount,
    damageSource,
  });
  event.followUpEvents = followUpEvents;
  event.curseDamage = followUpEvents
    .filter((entry) => entry.damageSource === DamageSource.CURSE && entry.target === 'enemy')
    .reduce((sum, entry) => sum + entry.amount, 0);
  event.reflectionDamage = followUpEvents
    .filter((entry) => entry.damageSource === DamageSource.REFLECT && entry.target === 'self')
    .reduce((sum, entry) => sum + entry.amount, 0);
  return event;
}

/**
 * 直接傷害共用入口：
 * - 詛咒只套用對應的來源減傷，無視護甲、抗性與一般減傷。
 * - 反射先套用對應的來源減傷，再由護甲吸收；無視抗性與一般減傷。
 * - 其餘傷害走既有元素抗性與狀態減傷。
 */
function applyDirectDamage(state, targetKey, requested, element, damageSource) {
  const unit = state[targetKey];
  if (!unit || unit.hp <= 0 || requested <= 0) return null;
  const usesSourceSpecificReduction = [
    DamageSource.CURSE,
    DamageSource.REFLECT,
  ].includes(damageSource);
  const sourceReducedAmount = targetKey === 'player' && usesSourceSpecificReduction
    ? reduceDamageBySource(state.player, damageSource, requested)
    : requested;
  const sourceDamageReduction = Math.max(0, requested - sourceReducedAmount);
  let armorUsed = 0;
  let resolved;

  if (damageSource === DamageSource.CURSE) {
    resolved = { amount: sourceReducedAmount, resistance: 0, damageReduction: 0 };
  } else if (damageSource === DamageSource.REFLECT) {
    if (targetKey === 'player') {
      armorUsed = Math.min(state.resources.armor, sourceReducedAmount);
      state.resources.armor = Math.max(0, state.resources.armor - armorUsed);
    }
    resolved = {
      amount: Math.max(0, sourceReducedAmount - armorUsed),
      resistance: 0,
      damageReduction: 0,
    };
  } else {
    resolved = damageAfterMitigation(requested, unit, element);
  }
  const amount = Math.min(unit.hp, resolved.amount);
  unit.hp -= amount;
  const event = {
    type: 'damage',
    element,
    requested,
    resistance: resolved.resistance,
    damageReduction: resolved.damageReduction,
    damageSource,
    amount,
    target: targetKey === 'enemy' ? 'enemy' : 'self',
    sourceDamageReduction,
    armorUsed,
  };
  recordDamageEvents(state, [event]);
  return event;
}

/**
 * 每筆有效的拉霸／額外傷害完成後，先結算詛咒，再結算反射。
 * 詛咒與反射兩類傷害都不會再觸發任何一種連鎖。
 */
function resolveDamageFollowUps(
  state,
  hit,
  { resolveCurse = true, resolveReflection = true } = {},
) {
  if (
    hit.amount <= 0
    || hit.damageSource === DamageSource.CURSE
    || hit.damageSource === DamageSource.REFLECT
  ) return [];

  const events = [];
  const damagedUnit = state[hit.target];
  const curseStacks = activeStatusValue(damagedUnit, 'curse');
  if (resolveCurse && curseStacks > 0) {
    for (const targetKey of ['player', 'enemy']) {
      const targetStacks = activeStatusValue(state[targetKey], 'curse');
      if (targetStacks <= 0) continue;
      const requested = Math.min(hit.requested, targetStacks);
      const event = applyDirectDamage(
        state,
        targetKey,
        requested,
        'curse',
        DamageSource.CURSE,
      );
      if (event) events.push(event);
    }
  }

  const reflection = activeStatusValue(damagedUnit, 'damage-reflection');
  if (resolveReflection && reflection > 0) {
    const attackerKey = hit.attacker;
    const event = applyDirectDamage(
      state,
      attackerKey,
      reflection,
      'physical',
      DamageSource.REFLECT,
    );
    if (event) events.push(event);
  }
  return events;
}

/** 單次拉霸先完成全部拉霸／額外傷害，再統一結算詛咒，最後才反射。 */
function settleDamageFollowUps(state, damageEvents) {
  const hits = damageEvents
    .filter((event) => event.amount > 0)
    .map((event) => ({
      attacker: 'player',
      target: 'enemy',
      requested: event.requested,
      amount: event.amount,
      damageSource: event.damageSource,
    }));
  const curseEvents = hits.flatMap((hit) => resolveDamageFollowUps(state, hit, {
    resolveCurse: true,
    resolveReflection: false,
  }));
  const reflectionEvents = hits.flatMap((hit) => resolveDamageFollowUps(state, hit, {
    resolveCurse: false,
    resolveReflection: true,
  }));
  return [...curseEvents, ...reflectionEvents];
}

function activeStatusValue(unit, statusId) {
  return (unit?.activeStatuses ?? [])
    .filter((active) => active.statusId === statusId)
    .reduce((total, active) => total + (
      Number(active.stacks ?? 1) * Number(active.potency ?? 1)
    ), 0);
}

function removeArmorBeforeIncomingDamage(state) {
  const requested = (state.player.activeStatuses ?? []).reduce((total, active) => {
    const definition = getStatus(active.statusId);
    if (definition.effect.type !== StatusEffectType.REMOVE_ARMOR_BEFORE_DAMAGE) {
      return total;
    }
    return total + (
      Number(definition.effect.amountPerPotency ?? 0)
      * Number(active.stacks ?? 1)
      * Number(active.potency ?? 1)
    );
  }, 0);
  const amount = Math.min(state.resources.armor, Math.max(0, requested));
  state.resources.armor -= amount;
  return amount;
}

function resolveAfterSpinDamageEquipment(
  state,
  { spinDamage, rng, deferFollowUps = false },
) {
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
    // 燃焰之劍由拉霸傷害觸發，追加的燃燒層數傷害屬於額外傷害。
    const damageEvent = dealDamageToEnemy(
      state,
      stacks,
      effect.element,
      DamageSource.EXTRA,
      { deferFollowUps },
    );
    if (damageEvent) {
      damage += damageEvent.amount;
      events.push({ ...damageEvent, itemId });
    }
  }

  return { damage, events };
}

/** 拉霸所有傷害結算後才處理黑貓尾巴與巫毒人偶。 */
function resolveAfterSpinStateEquipment(state, outcome, { rng = Math.random } = {}) {
  const events = [];
  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.AFTER_SPIN,
  )) {
    if (effect.requiresSymbolId && !outcome.reels.includes(effect.requiresSymbolId)) continue;

    if (effect.type === ItemEffectType.INCREASE_MAX_HP) {
      state.player.maxHp += Number(effect.amount ?? 0);
      events.push({
        type: 'increase-max-hp',
        itemId,
        amount: Number(effect.amount ?? 0),
        maxHp: state.player.maxHp,
      });
      continue;
    }

    if (effect.type === ItemEffectType.APPLY_STATUS_PER_SYMBOL) {
      const symbolCount = Number(outcome.counts[effect.symbolId] ?? 0);
      const stacks = symbolCount * Number(effect.stacksPerSymbol ?? 1);
      if (stacks <= 0) continue;
      for (const target of effect.targets ?? []) {
        const result = applyEffects({
          effects: [{
            type: EffectType.APPLY_STATUS,
            statusId: effect.statusId,
            target,
            chance: 1,
            stacks,
            potency: 1,
          }],
          source: state.player,
          target: state.enemy,
          rng,
        });
        state.player = result.source;
        state.enemy = result.target;
        events.push(...result.events.map((event) => ({ ...event, itemId })));
      }
    }
  }
  return events;
}

function healPlayer(state, baseAmount, metadata = {}) {
  const requested = healingAmount(state.player, baseAmount);
  const amount = Math.min(state.player.maxHp - state.player.hp, requested);
  state.player.hp += amount;
  const event = {
    type: 'heal',
    baseRequested: baseAmount,
    requested,
    amount,
    target: 'self',
    ...metadata,
  };
  return [event, ...applyHealingEquipmentBonus(state, [event])];
}

function resolvePlayerTurnEndEquipment(state) {
  const events = [];

  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.PLAYER_TURN_END,
    ItemEffectType.ENSURE_MINIMUM_RESOURCE,
  )) {
    const before = Number(state.resources[effect.resource] ?? 0);
    const minimum = Number(effect.minimum ?? 0);
    if (before >= minimum) continue;
    const amount = resourceGainAmount(state.player, effect.resource, minimum - before);
    if (amount <= 0) continue;
    state.resources[effect.resource] = before + amount;
    events.push({
      type: 'gain-resource',
      itemId,
      resource: effect.resource,
      amount,
    });
  }

  // 回合末傷害必須先結算。這能讓後面的夏賜儀碇把星海羅盤傷害
  // 一併視為「本回合有造成傷害」，並清除先前累積的額外上限。
  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.PLAYER_TURN_END,
    ItemEffectType.DAMAGE_FROM_RESOURCE,
  )) {
    const amount = Number(state.resources[effect.resource] ?? 0);
    const damageEvent = dealDamageToEnemy(
      state,
      amount,
      effect.element,
      DamageSource.EXTRA,
    );
    if (damageEvent) events.push({ ...damageEvent, itemId });
  }

  for (const { itemId, effect } of equipmentEffectEntries(
    state.player,
    ItemEffectTrigger.PLAYER_TURN_END,
    ItemEffectType.INCREASE_ACTION_LIMIT_IF_NO_DAMAGE,
  )) {
    const currentBonus = Number(state.combatModifiers.actionLimitBonus ?? 0);

    if (state.combatModifiers.damageDealtThisTurn > 0) {
      if (effect.resetOnDamage && currentBonus > 0) {
        state.combatModifiers.actionLimitBonus = 0;
        events.push({
          type: 'reset-action-limit',
          itemId,
          amount: currentBonus,
        });
      }
      continue;
    }

    const maxBonus = Number(effect.maxBonus ?? Number.POSITIVE_INFINITY);
    const amount = Math.min(effect.amount, Math.max(0, maxBonus - currentBonus));
    if (amount <= 0) continue;

    state.combatModifiers.actionLimitBonus = currentBonus + amount;
    events.push({
      type: 'increase-action-limit',
      itemId,
      amount,
    });
  }

  return events;
}

function recordDamageEvents(state, events) {
  for (const event of events) {
    if (event.type !== 'damage' || event.target !== 'enemy') continue;
    state.combatModifiers.damageDealtThisTurn += event.amount;
    if (!event.damageSource) continue;
    const previous = Number(
      state.combatModifiers.damageDealtBySource[event.damageSource] ?? 0,
    );
    state.combatModifiers.damageDealtBySource[event.damageSource] = previous + event.amount;
  }
}

function playerActionLimit(state) {
  return state.config.actionPointsPerRound
    + equipmentActionLimitBonus(state.player)
    + Number(state.combatModifiers?.actionLimitBonus ?? 0);
}

function createCombatModifiers() {
  return {
    // 夏賜儀碇在本場戰鬥累積的行動點上限；其最大值與清除條件
    // 定義在 items.js，換道具數值時不需要修改存檔結構。
    actionLimitBonus: 0,
    // 只計玩家在目前回合實際對敵人造成的傷害。
    damageDealtThisTurn: 0,
    // 依四大傷害分類記錄本回合實際傷害。
    damageDealtBySource: createDamageSourceTotals(),
    progressiveSpinExtraDamage: {},
    usedTurnEquipmentEffects: {},
    usedOnceEquipmentEffects: {},
    // 神秘泉水等奇遇可封印下一場戰鬥的技能；戰鬥結束後隨重置清除。
    sealedSkillIds: [],
    // 磨刀石等「下一次拉霸」消耗品暫存在此，抽牌後立刻清空。
    nextSpinSymbolChances: {},
  };
}

function createDamageSourceTotals() {
  return Object.fromEntries(DAMAGE_SOURCES.map((source) => [source, 0]));
}

function itemActionCost(item) {
  const actionCost = item.actionCost ?? 0;
  if (!Number.isInteger(actionCost) || actionCost < 0) {
    throw new RangeError(`${item.name}的行動點成本必須是非負整數`);
  }
  return actionCost;
}

function resolveTriggeredStatuses(state, targetKey, trigger) {
  state[targetKey] = structuredClone(state[targetKey]);
  const next = state[targetKey];
  const events = [];
  for (const active of next.activeStatuses ?? []) {
    const definition = getStatus(active.statusId);
    if (definition.trigger !== trigger) continue;
    const requested = Number(definition.effect.amountPerPotency ?? 0)
      * Number(active.potency ?? 1)
      * Number(active.stacks ?? 1);

    if (definition.effect.type === StatusEffectType.DAMAGE) {
      const damageEvent = targetKey === 'enemy'
        ? dealDamageToEnemy(
          state,
          requested,
          definition.effect.element,
          DamageSource.EXTRA,
        )
        : applyDirectDamage(
          state,
          'player',
          requested,
          definition.effect.element,
          DamageSource.EXTRA,
        );
      if (damageEvent) {
        const followUpEvents = targetKey === 'player'
          ? resolveDamageFollowUps(state, {
            attacker: 'enemy',
            target: 'player',
            requested,
            amount: damageEvent.amount,
            damageSource: DamageSource.EXTRA,
          })
          : (damageEvent.followUpEvents ?? []);
        events.push(
          { ...damageEvent, statusId: active.statusId },
          ...followUpEvents,
        );
      }
    }

    if (definition.effect.type === StatusEffectType.HEAL) {
      const resolved = targetKey === 'player'
        ? healingAmount(state.player, requested)
        : requested;
      const amount = Math.min(next.maxHp - next.hp, resolved);
      next.hp += amount;
      events.push({
        type: 'heal',
        statusId: active.statusId,
        baseRequested: requested,
        requested: resolved,
        amount,
      });
    }

    if (definition.stacking.mode === 'stack-countdown') {
      active.stacks = Math.floor(Number(active.stacks ?? 1) / 2);
      active.remainingTurns = active.stacks;
      const latestEvent = [...events].reverse().find((event) => (
        event.type === 'damage' && event.statusId === active.statusId
      ));
      if (latestEvent) latestEvent.remainingStacks = active.stacks;
    }
  }
  next.activeStatuses = (next.activeStatuses ?? [])
    .filter((status) => Number(status.stacks ?? 1) > 0);
  return { unit: state[targetKey], events };
}

function wouldOnlyHealFullHealth(source, player) {
  return source.effects?.length > 0
    && source.effects.every((effect) => effect.type === 'heal' && effect.target === 'self')
    && player.hp >= player.maxHp;
}

function effectResourceBlockReason(effects = [], resources = {}) {
  for (const effect of effects) {
    if (effect.type !== EffectType.DAMAGE_FROM_RESOURCE) continue;
    const minimum = Number(effect.minimumResource ?? 0);
    if (Number(resources[effect.resource] ?? 0) >= minimum) continue;
    const label = { action: '❇️', armor: '🛡️', mana: '✨' }[effect.resource]
      ?? effect.resource;
    return `至少需要 ${minimum} 點${label}`;
  }
  return null;
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
    if (event.type === 'reset-action-limit') {
      return [`清除本場戰鬥累積的❇️上限（－${event.amount}）`];
    }
    if (event.type === 'apply-status' && event.applied) {
      const status = getStatus(event.statusId);
      if (status.durationMode === 'until-consumed') {
        if (status.effect.type === StatusEffectType.MULTIPLY_SPIN_DAMAGE) {
          return [`獲得${status.name}（下次拉霸傷害 ×${event.potency}）`];
        }
        return [`獲得${status.name}`];
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
    spinDamage: 0,
    additionalDamage: 0,
    curseDamage: 0,
    reflectionDamage: 0,
    skillDamage: 0,
    armorGained: 0,
    manaGained: 0,
    equipmentBonus: 0,
    statusBonus: 0,
    damageMultiplier: 1,
  };
}

function clearTurnResources(
  state,
  { preserveBetweenTurns = false } = {},
) {
  const discarded = { action: 0, armor: 0, mana: 0 };
  for (const resource of Object.keys(discarded)) {
    const current = Number(state.resources[resource] ?? 0);
    const ratio = preserveBetweenTurns
      ? turnResourceRetentionRatio(state.player, resource)
      : 0;
    const retained = Math.floor(current * ratio);
    discarded[resource] = current - retained;
    state.resources[resource] = retained;
  }
  return discarded;
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
  state.player.gold = Math.max(0, Math.floor(Number(state.player.gold ?? 0)));
  state.player.activeStatuses ??= [];
  state.player.pendingSealedSkillIds ??= [];
  state.player.pendingBattleStatuses ??= [];
  state.player.inventory ??= [];
  state.player.equipment = normalizeEquipmentIds(state.player.equipment);
  state.combatModifiers = {
    ...createCombatModifiers(),
    ...(state.combatModifiers ?? {}),
    damageDealtBySource: {
      ...createDamageSourceTotals(),
      ...(state.combatModifiers?.damageDealtBySource ?? {}),
    },
    nextSpinSymbolChances: {
      ...(state.combatModifiers?.nextSpinSymbolChances ?? {}),
    },
  };
  state.rewardChoices ??= [];
  state.lastCombatReward ??= null;
  if (state.lastImpact) {
    state.lastImpact.spinDamage ??= state.lastImpact.attackDamage ?? 0;
    state.lastImpact.additionalDamage ??= state.lastImpact.skillDamage ?? 0;
    state.lastImpact.curseDamage ??= 0;
    state.lastImpact.reflectionDamage ??= 0;
    state.lastImpact.skillDamage ??= state.lastImpact.additionalDamage;
  }
  state.endSummary ??= null;
  state.stunned = isStunned(state);
  if (state.event) {
    const definition = getEvent(state.event.eventId);
    state.event.stage ??= 'choice';
    state.event.options ??= definition.options.map(({ id, label, goldCost }) => ({
      id,
      label,
      ...(goldCost !== undefined ? { goldCost } : {}),
    }));
    state.event.result ??= null;
    state.event.skillChoices ??= [];
    if (state.event.stage === 'shop') {
      state.event.shop ??= { purchases: 0, totalSpent: 0, items: [] };
      state.event.shop.purchases ??= 0;
      state.event.shop.totalSpent ??= 0;
      state.event.shop.items ??= [];
    }
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
      spinDamage: damage,
      skillDamage: 0,
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
  next.lastCombatReward = null;
  next.pendingRegionAdvance = false;
  next.combatModifiers = createCombatModifiers();
  next.endSummary = legacyStatus === GameStatus.ACTIVE ? null : {
    runId: next.id,
    reason: legacyStatus,
    defeatedBy: legacyStatus === GameStatus.LOST ? next.enemy?.name ?? null : null,
    defeatedUnitCount: 0,
    defeatedByRank: { normal: 0, elite: 0, boss: 0 },
    finalRegionDepth: 1,
    finalGold: Number(next.player.gold ?? 0),
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
