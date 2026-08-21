import { createConfig } from './config.js';
import { getItem } from './data/items.js';
import { getRegion } from './data/regions.js';
import { getSkill } from './data/skills.js';
import { getStatus } from './data/statuses.js';
import { getUnit, UnitRank } from './data/units.js';
import {
  createAdventureProgress,
  drawNextAdventureNode,
  scaleEnemyUnit,
} from './engines/adventure-engine.js';
import { applyEffects } from './engines/effects.js';
import { rollRewardChoices } from './engines/loot-engine.js';
import { selectMonsterIntent } from './engines/monster-action-engine.js';
import { mergeActiveStatus } from './engines/status-engine.js';
import { drawReels } from './random.js';
import { scoreSpin } from './scoring.js';

export const GAME_STATE_VERSION = 3;

export const GameStatus = Object.freeze({
  ACTIVE: 'active',
  LOST: 'lost',
  ABANDONED: 'abandoned',
  // 只用於辨識舊版已結束存檔。
  WON: 'won',
});

export const GamePhase = Object.freeze({
  PLAYER_TURN: 'player-turn',
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
    stunned: false,
    lastSpin: null,
    lastImpact: null,
    lastAction: null,
    lastResolution: null,
    endSummary: null,
    history: [],
  };

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
  { reels, rng, rewardRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  assertPlayerCanAct(next);

  if (!Number.isInteger(wager) || wager < 1 || wager > next.resources.action) {
    throw new RangeError(`本次只能投入 1～${next.resources.action} 點行動點`);
  }

  const outcome = scoreSpin(reels ?? drawReels(rng), wager);
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

  const statusBonus = outcome.awarded.attack > 0
    ? attackStatusBonus(next.player)
    : 0;
  const requestedAttack = outcome.awarded.attack + statusBonus;
  let attackDamage = 0;

  if (requestedAttack > 0) {
    const attack = applyEffects({
      effects: [{
        type: 'damage',
        element: 'physical',
        amount: requestedAttack,
        target: 'enemy',
      }],
      source: next.player,
      target: next.enemy,
    });
    next.player = attack.source;
    next.enemy = attack.target;
    attackDamage = attack.events[0].amount;
  }

  next.resources.armor += outcome.awarded.defense;
  next.resources.mana += outcome.awarded.skill;
  next.lastImpact = {
    attackDamage,
    armorGained: outcome.awarded.defense,
    manaGained: outcome.awarded.skill,
    equipmentBonus: 0,
    statusBonus,
  };
  next.lastAction = { type: 'spin', text: spinActionText(next.lastImpact) };

  if (next.enemy.hp === 0) finishCombatVictory(next, { rewardRng });
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
  if (!Number.isInteger(skill.cost) || skill.cost < 0) {
    throw new Error(`技能 ${skill.name} 尚未設定法力消耗`);
  }
  if (next.resources.mana < skill.cost) {
    throw new RangeError(`${skill.name}需要 ${skill.cost} 點法力`);
  }
  if (wouldOnlyHealFullHealth(skill, next.player)) {
    throw new Error('生命已全滿，現在不需要治療');
  }
  if (wouldOnlyRefreshActiveStatus(skill, next.player)) {
    throw new Error('這個效果目前仍在持續中');
  }

  const result = applyEffects({
    effects: skill.effects,
    source: next.player,
    target: next.enemy,
    rng,
  });
  next.player = result.source;
  next.enemy = result.target;
  next.resources.mana -= skill.cost;
  next.lastAction = {
    type: 'skill',
    id: skill.id,
    text: `${skill.emoji}${skill.name}：${summarizeEffectEvents(result.events)}`,
  };
  next.history.push({
    type: 'skill',
    round: next.round,
    skillId: skill.id,
    events: result.events,
  });

  if (next.enemy.hp === 0) finishCombatVictory(next, { rewardRng });
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
  if (item.type !== 'consumable') throw new Error('裝備會在戰鬥開始時自動穿戴');

  const actionCost = itemActionCost(item);
  if (next.resources.action < actionCost) {
    throw new RangeError(`使用${item.name}需要 ${actionCost} 點行動點`);
  }

  const stack = next.player.inventory.find((entry) => entry.itemId === itemId);
  if (!stack || stack.quantity < 1) throw new Error(`已經沒有${item.name}`);
  if (wouldOnlyHealFullHealth(item, next.player)) {
    throw new Error('生命已全滿，現在不需要治療');
  }

  const result = applyEffects({
    effects: item.effects,
    source: next.player,
    target: next.enemy,
    rng,
  });
  next.player = result.source;
  next.enemy = result.target;
  next.resources.action -= actionCost;
  const nextStack = next.player.inventory.find((entry) => entry.itemId === itemId);
  nextStack.quantity -= 1;
  next.player.inventory = next.player.inventory.filter((entry) => entry.quantity > 0);
  next.lastAction = {
    type: 'item',
    id: item.id,
    text: `${item.emoji}${item.name}：${summarizeEffectEvents(result.events)}`,
  };
  next.history.push({
    type: 'item',
    round: next.round,
    itemId: item.id,
    actionCost,
    events: result.events,
  });

  if (next.enemy.hp === 0) finishCombatVictory(next, { rewardRng });
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
  const discardedMana = next.resources.mana;
  const playerTurnEndStatus = resolveTriggeredStatuses(next.player, 'turn-end');
  next.player = advanceStatusDurations(playerTurnEndStatus.unit);

  const enemyTurnStartStatus = resolveTriggeredStatuses(next.enemy, 'turn-start');
  next.enemy = enemyTurnStartStatus.unit;
  if (next.enemy.hp === 0) {
    finishCombatVictory(next, { rewardRng });
    return next;
  }

  const intent = next.enemy.intent ?? selectMonsterIntent(next.enemy, { rng: monsterRng });
  const armorUsed = wasStunned ? 0 : Math.min(next.resources.armor, intent.damage);
  const damageTaken = Math.min(
    next.player.hp,
    Math.max(0, intent.damage - armorUsed),
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
  const playerTurnStartStatus = next.player.hp > 0
    ? resolveTriggeredStatuses(next.player, 'turn-start')
    : { unit: next.player, events: [] };
  next.player = playerTurnStartStatus.unit;

  next.lastResolution = {
    round: next.round,
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
  };
  next.history.push({
    type: 'turn-resolution',
    ...structuredClone(next.lastResolution),
  });
  clearTurnResources(next);
  next.stunned = false;

  if (next.player.hp === 0) {
    finishRun(next, GameStatus.LOST, next.enemy.name);
    return next;
  }

  next.round += 1;
  next.phase = GamePhase.PLAYER_TURN;
  next.resources.action = next.config.actionPointsPerRound;
  next.enemy.intent = selectMonsterIntent(next.enemy, { rng: monsterRng });
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

  if (next.pendingRegionAdvance) {
    next.adventure.regionDepth += 1;
    next.adventure.regionProgress = 0;
    next.pendingRegionAdvance = false;
  }

  startNextNode(next, { worldRng, monsterRng });
  return next;
}

export function completeEvent(
  state,
  { worldRng = Math.random, monsterRng = Math.random } = {},
) {
  const next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE || next.phase !== GamePhase.EVENT) {
    throw new Error('目前沒有可完成的奇遇');
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
    node = drawNextAdventureNode(state.adventure, { rng: worldRng });
  }

  if (node.type === 'event') {
    state.phase = GamePhase.EVENT;
    state.event = {
      eventId: node.eventId,
      name: node.event.name,
      description: node.event.description,
      rarity: node.rarity,
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
  state.resources.action = state.config.actionPointsPerRound;
  applyBattleStartEquipmentEffects(state);
  state.history.push({
    type: 'combat-started',
    unitId: state.enemy.unitId,
    rank: state.enemy.rank,
    regionDepth: state.adventure.regionDepth,
    bossChance: node.bossChance,
  });
}

function finishCombatVictory(state, { rewardRng }) {
  if (state.phase !== GamePhase.PLAYER_TURN) return;
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
  });
  state.phase = GamePhase.REWARD_CHOICE;
  state.enemy.intent = null;
  clearTurnResources(state);
  state.stunned = false;
  state.history.push({
    type: 'combat-victory',
    unitId: defeated.unitId,
    rank: defeated.rank,
    rewardChoices: structuredClone(state.rewardChoices),
  });
}

function finishRun(state, status, defeatedBy) {
  const finalSkillIds = [...(state.player.skillIds ?? [])];
  const finalEquipmentIds = Object.values(state.player.equipment ?? {});
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
  state.player.equipment = {};
  state.player.skillIds = [];
  state.adventure = null;
  state.history = [];
  state.lastSpin = null;
  state.lastImpact = null;
  state.lastAction = null;
  state.lastResolution = null;
  state.stunned = false;
}

function applyReward(player, choice) {
  if (choice.contentType === 'skill') {
    getSkill(choice.contentId);
    if (!player.skillIds.includes(choice.contentId)) {
      player.skillIds.push(choice.contentId);
    }
    return;
  }

  const item = getItem(choice.contentId);
  if (item.type === 'equipment') {
    player.equipment[item.slot] = item.id;
    return;
  }
  const stack = player.inventory.find((entry) => entry.itemId === item.id);
  if (stack) stack.quantity += 1;
  else player.inventory.push({ itemId: item.id, quantity: 1 });
}

function rewardContentName(choice) {
  return choice.contentType === 'skill'
    ? getSkill(choice.contentId).name
    : getItem(choice.contentId).name;
}

function assertPlayerCanAct(state) {
  if (state.status !== GameStatus.ACTIVE || state.phase !== GamePhase.PLAYER_TURN) {
    throw new Error('目前不是玩家行動階段');
  }
  if (isStunned(state)) throw new Error('暈眩中只能按「回合結束」');
}

function createStartingItems(itemIds) {
  const inventory = [];
  const equipment = {};
  const quantities = new Map();
  for (const itemId of itemIds) {
    const item = getItem(itemId);
    if (item.type === 'equipment') equipment[item.slot] = item.id;
    else quantities.set(item.id, (quantities.get(item.id) ?? 0) + 1);
  }
  for (const [itemId, quantity] of quantities) inventory.push({ itemId, quantity });
  return { inventory, equipment };
}

function splitEquipmentFromInventory(inventory) {
  const equipment = {};
  const consumables = [];
  for (const entry of inventory ?? []) {
    const item = getItem(entry.itemId);
    if (item.type === 'equipment') equipment[item.slot] = item.id;
    else consumables.push(structuredClone(entry));
  }
  return { inventory: consumables, equipment };
}

function applyBattleStartEquipmentEffects(state) {
  for (const itemId of Object.values(state.player.equipment ?? {})) {
    const item = getItem(itemId);
    if (!item.battleStartEffects?.length) continue;
    const result = applyEffects({
      effects: item.battleStartEffects,
      source: state.player,
      target: state.enemy,
    });
    state.player = result.source;
    state.enemy = result.target;
    state.history.push({
      type: 'equipment-battle-start',
      round: state.round,
      itemId,
      events: result.events,
    });
  }
}

function attackStatusBonus(player) {
  return (player.activeStatuses ?? []).reduce((total, active) => {
    const definition = getStatus(active.statusId);
    const isAttackTrigger = definition.trigger === 'on-attack'
      && definition.effect.type === 'bonus-damage';
    const isAttackModifier = definition.effect.type === 'modify-stat'
      && definition.effect.stat === 'attack';
    if (!isAttackTrigger && !isAttackModifier) return total;
    return total + (
      Number(definition.effect.amountPerPotency ?? 0)
      * Number(active.potency ?? 1)
      * Number(active.stacks ?? 1)
    );
  }, 0);
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
      if (definition.stacking.mode === 'stack-countdown') return status;
      return { ...status, remainingTurns: Number(status.remainingTurns) - 1 };
    })
    .filter((status) => {
      const definition = getStatus(status.statusId);
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

function wouldOnlyRefreshActiveStatus(skill, player) {
  const selfStatuses = skill.effects
    ?.filter((effect) => effect.type === 'apply-status' && effect.target === 'self')
    .map((effect) => effect.statusId) ?? [];
  return selfStatuses.length > 0
    && selfStatuses.every((statusId) => {
      const active = player.activeStatuses
        ?.find((status) => status.statusId === statusId);
      if (!active) return false;
      const definition = getStatus(statusId);
      if (definition.stacking.mode === 'refresh-duration') return true;
      return Number(active.stacks ?? 1) >= definition.stacking.maxStacks;
    });
}

function summarizeEffectEvents(events) {
  const parts = events.flatMap((event) => {
    if (event.type === 'heal') return [`回復 ${event.amount} HP`];
    if (event.type === 'damage') return [`造成 ${event.amount} 傷害`];
    if (event.type === 'apply-status' && event.applied) {
      const stackText = event.stacks > 1 ? `${event.stacks}層` : '';
      return [`附加${stackText}${getStatus(event.statusId).name}`];
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
  };
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
  state.player.activeStatuses ??= [];
  state.player.inventory ??= [];
  state.player.equipment ??= {};
  state.rewardChoices ??= [];
  state.endSummary ??= null;
  state.stunned = isStunned(state);
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
  next.player.activeStatuses ??= [];
  next.player.inventory ??= [];
  next.player.equipment ??= {};
  const splitItems = splitEquipmentFromInventory(next.player.inventory);
  next.player.inventory = splitItems.inventory;
  next.player.equipment = { ...splitItems.equipment, ...next.player.equipment };
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
  next.endSummary = legacyStatus === GameStatus.ACTIVE ? null : {
    runId: next.id,
    reason: legacyStatus,
    defeatedBy: legacyStatus === GameStatus.LOST ? next.enemy?.name ?? null : null,
    defeatedUnitCount: 0,
    defeatedByRank: { normal: 0, elite: 0, boss: 0 },
    finalRegionDepth: 1,
    finalSkillIds: [...(next.player.skillIds ?? [])],
    finalEquipmentIds: Object.values(next.player.equipment ?? {}),
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
