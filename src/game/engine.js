import { createConfig } from './config.js';
import { getItem } from './data/items.js';
import { getSkill } from './data/skills.js';
import { getStatus } from './data/statuses.js';
import { getUnit } from './data/units.js';
import { applyEffects } from './engines/effects.js';
import { mergeActiveStatus } from './engines/status-engine.js';
import { drawReels } from './random.js';
import { scoreSpin } from './scoring.js';

export const GAME_STATE_VERSION = 2;

export const GameStatus = Object.freeze({
  ACTIVE: 'active',
  WON: 'won',
  LOST: 'lost',
  ABANDONED: 'abandoned',
});

export function createGame({
  id,
  ownerId,
  config: configOverrides,
  loadout,
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
    phase: 'player-turn',
    round: 1,
    config,
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
      equippedSkillId: selectedSkillIds[0],
      inventory: startingItems.inventory,
      equipment: startingItems.equipment,
      damageResistances: { ...playerUnit.damageResistances },
      statusOverrides: structuredClone(playerUnit.statusOverrides),
      activeStatuses: [],
    },
    boss: {
      unitId: config.boss.unitId,
      name: config.boss.name,
      rank: config.boss.rank,
      tags: [...config.boss.tags],
      hp: config.boss.maxHp,
      maxHp: config.boss.maxHp,
      skillIds: [...config.boss.skillIds],
      damageResistances: { ...config.boss.damageResistances },
      statusOverrides: structuredClone(config.boss.statusOverrides),
      activeStatuses: [],
      lootTableId: config.boss.lootTableId,
    },
    resources: {
      action: config.actionPointsPerRound,
      armor: 0,
      mana: 0,
    },
    stunned: false,
    lastSpin: null,
    lastImpact: null,
    lastAction: null,
    lastResolution: null,
    history: [],
  };

  applyBattleStartEquipmentEffects(state);
  return state;
}

export function getBossIntent(state) {
  const pattern = state.config.boss.attackPattern;
  return pattern[(state.round - 1) % pattern.length];
}

export function placeBet(state, wager, { reels, rng } = {}) {
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
    next.lastImpact = {
      attackDamage: 0,
      armorGained: 0,
      manaGained: 0,
      equipmentBonus: 0,
      statusBonus: 0,
    };
    next.lastAction = {
      type: 'stunned',
      text: '三個不幸：本回合暈眩，只能按「回合結束」。',
    };
    return next;
  }

  const equipmentBonus = 0;
  const statusBonus = outcome.awarded.attack > 0
    ? attackStatusBonus(next.player)
    : 0;
  const requestedAttack = outcome.awarded.attack + equipmentBonus + statusBonus;
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
      target: next.boss,
    });
    next.player = attack.source;
    next.boss = attack.target;
    attackDamage = attack.events[0].amount;
  }

  next.resources.armor += outcome.awarded.defense;
  next.resources.mana += outcome.awarded.skill;
  next.lastImpact = {
    attackDamage,
    armorGained: outcome.awarded.defense,
    manaGained: outcome.awarded.skill,
    equipmentBonus,
    statusBonus,
  };
  next.lastAction = {
    type: 'spin',
    text: spinActionText(next.lastImpact),
  };

  if (next.boss.hp === 0) finishGame(next, GameStatus.WON);
  return next;
}

export function activateSkill(state, skillId, { rng } = {}) {
  const next = upgradeGameState(state);
  assertPlayerCanAct(next);

  if (!next.player.skillIds.includes(skillId)) {
    throw new Error('這個技能不在目前的攜帶技能中');
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
    target: next.boss,
    rng,
  });
  next.player = result.source;
  next.boss = result.target;
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

  if (next.boss.hp === 0) finishGame(next, GameStatus.WON);
  return next;
}

export function useItem(state, itemId, { rng } = {}) {
  const next = upgradeGameState(state);
  assertPlayerCanAct(next);
  const item = getItem(itemId);
  if (item.type !== 'consumable') throw new Error('裝備會在開局時自動穿戴');

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
    target: next.boss,
    rng,
  });
  next.player = result.source;
  next.boss = result.target;
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

  if (next.boss.hp === 0) finishGame(next, GameStatus.WON);
  return next;
}

export function endPlayerTurn(state) {
  const next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE || next.phase !== 'player-turn') {
    throw new Error('目前無法結束回合');
  }

  const wasStunned = isStunned(next);
  const discardedAction = next.resources.action;
  const discardedMana = next.resources.mana;

  const playerTurnEndStatus = resolveTriggeredStatuses(next.player, 'turn-end');
  next.player = advanceStatusDurations(playerTurnEndStatus.unit);

  const bossTurnStartStatus = resolveTriggeredStatuses(next.boss, 'turn-start');
  next.boss = bossTurnStartStatus.unit;

  const bossAttack = next.boss.hp === 0 ? 0 : getBossIntent(next);
  const armorUsed = wasStunned
    ? 0
    : Math.min(next.resources.armor, bossAttack);
  const damageTaken = Math.min(
    next.player.hp,
    Math.max(0, bossAttack - armorUsed),
  );
  next.player.hp -= damageTaken;

  const bossTurnEndStatus = next.boss.hp > 0
    ? resolveTriggeredStatuses(next.boss, 'turn-end')
    : { unit: next.boss, events: [] };
  next.boss = advanceStatusDurations(bossTurnEndStatus.unit);

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
    bossAttack,
    damageTaken,
    bossStatusEvents: [
      ...bossTurnStartStatus.events,
      ...bossTurnEndStatus.events,
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

  if (next.boss.hp === 0) {
    finishGame(next, GameStatus.WON);
    return next;
  }
  if (next.player.hp === 0) {
    finishGame(next, GameStatus.LOST);
    return next;
  }

  next.round += 1;
  next.phase = 'player-turn';
  next.resources.action = next.config.actionPointsPerRound;
  return next;
}

// 保留舊名稱，讓外部模擬與尚未更新的呼叫端不會直接中斷。
export const endBetting = endPlayerTurn;

export function abandonGame(state) {
  const next = upgradeGameState(state);
  if (next.status !== GameStatus.ACTIVE) return next;
  finishGame(next, GameStatus.ABANDONED);
  next.history.push({ type: 'abandoned', round: next.round });
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
    next.player.activeStatuses ??= [];
    next.boss.activeStatuses ??= [];
    next.player.inventory ??= [];
    next.player.equipment ??= {};
    next.lastImpact ??= null;
    next.lastAction ??= null;
    next.stunned = isStunned(next);
    return next;
  }

  const legacy = next.resources ?? {};
  const legacyAttack = Number(legacy.attack ?? 0);
  next.schemaVersion = GAME_STATE_VERSION;
  next.phase = next.status === GameStatus.ACTIVE ? 'player-turn' : 'ended';
  next.player.activeStatuses ??= [];
  next.boss.activeStatuses ??= [];
  next.player.inventory ??= [];
  next.player.equipment ??= {};

  const splitItems = splitEquipmentFromInventory(next.player.inventory);
  next.player.inventory = splitItems.inventory;
  next.player.equipment = {
    ...splitItems.equipment,
    ...next.player.equipment,
  };
  next.resources = {
    action: Number(legacy.action ?? 0),
    armor: Number(legacy.armor ?? legacy.defense ?? 0),
    mana: Number(legacy.mana ?? legacy.skill ?? 0),
  };

  if (legacyAttack > 0 && next.status === GameStatus.ACTIVE && !next.stunned) {
    const damage = Math.min(next.boss.hp, legacyAttack);
    next.boss.hp -= damage;
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
  next.lastAction ??= null;

  if (next.stunned) {
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
  }

  delete next.spinsUsed;
  if (next.boss.hp === 0) finishGame(next, GameStatus.WON);
  return next;
}

function assertPlayerCanAct(state) {
  if (state.status !== GameStatus.ACTIVE || state.phase !== 'player-turn') {
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
    if (item.type === 'equipment') {
      equipment[item.slot] = item.id;
    } else {
      quantities.set(item.id, (quantities.get(item.id) ?? 0) + 1);
    }
  }

  for (const [itemId, quantity] of quantities) {
    inventory.push({ itemId, quantity });
  }
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
      target: state.boss,
    });
    state.player = result.source;
    state.boss = result.target;
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
      return {
        ...status,
        remainingTurns: Number(status.remainingTurns) - 1,
      };
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

function clearTurnResources(state) {
  state.resources.action = 0;
  state.resources.armor = 0;
  state.resources.mana = 0;
}

function finishGame(state, status) {
  state.status = status;
  state.phase = 'ended';
  clearTurnResources(state);
}
