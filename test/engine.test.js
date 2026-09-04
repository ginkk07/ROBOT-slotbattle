import test from 'node:test';
import assert from 'node:assert/strict';

import { DamageSource } from '../src/game/data/damage-sources.js';
import {
  abandonGame,
  activateSkill,
  chooseEventSkill,
  chooseEventWeapon,
  chooseEventOption,
  chooseVaultReward,
  chooseReward,
  completeEvent,
  confirmCombatVictory,
  createGame,
  currentShopPrice,
  endPlayerTurn,
  GamePhase,
  GameStatus,
  isStunned,
  leaveAdventurerCorpse,
  leaveShop,
  placeBet,
  purchaseShopItem,
  purchaseShopSkill,
  searchAdventurerCorpse,
  spinCollectorEvent,
  upgradeGameState,
  useItem,
} from '../src/game/engine.js';
import { SymbolId } from '../src/game/symbols.js';
import { getEvent } from '../src/game/data/events.js';
import { getItem } from '../src/game/data/items.js';

const { ATTACK, DEFENSE, SKILL, UNLUCKY } = SymbolId;
const zero = () => 0;

function game({
  enemy = {},
  initialEnemyUnitId = 'ruins-sentinel',
  ...config
} = {}) {
  return createGame({
    id: 'test-game',
    ownerId: 'player-1',
    config: {
      // 通用引擎測試固定使用無減傷的普通怪；BOSS規則由專用案例驗證。
      initialEnemyUnitId,
      initialEnemyOverrides: { maxHp: 60, baseDamage: 15, ...enemy },
      ...config,
    },
    worldRng: zero,
    monsterRng: zero,
  });
}

function springEventState(skillIds = ['power-strike']) {
  return eventState('ruins-mysterious-spring', skillIds);
}

function eventState(eventId, skillIds = ['power-strike']) {
  const state = createGame({
    id: `${eventId}-test`,
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds, itemIds: [] },
    monsterRng: zero,
  });
  const event = getEvent(eventId);
  state.phase = GamePhase.EVENT;
  state.enemy = null;
  state.event = {
    eventId: event.id,
    name: event.name,
    rarity: event.rarity,
    description: event.description,
    stage: 'choice',
    options: event.options.map(({ id, label, goldCost, itemCost }) => ({
      id,
      label,
      ...(goldCost !== undefined ? { goldCost } : {}),
      ...(itemCost !== undefined ? { itemCost: structuredClone(itemCost) } : {}),
    })),
    result: null,
  };
  return state;
}

test('新戰鬥取得4點行動點，護甲與法力從0開始', () => {
  const state = game();
  assert.equal(state.schemaVersion, 8);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.deepEqual(state.resources, { action: 4, armor: 0, mana: 0 });
  assert.equal(state.enemy.baseDefense, 0);
  assert.equal(state.enemy.armor, 0);
});

test('怪物基礎防禦力會在每個 ROUND_START 重設護甲，不會累加', () => {
  let state = game({ enemy: { baseDamage: 0, baseDefense: 3 } });

  assert.equal(state.enemy.baseDefense, 3);
  assert.equal(state.enemy.armor, 3);

  state = placeBet(state, 2, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.enemy.hp, 60);
  assert.equal(state.enemy.armor, 1);
  assert.equal(state.lastImpact.enemyArmorUsed, 2);

  // 護甲先吸收傷害；超過剩餘護甲的部分才扣除 HP。
  state = placeBet(state, 2, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.enemy.armor, 0);
  assert.equal(state.enemy.hp, 59);
  assert.equal(state.lastImpact.enemyArmorUsed, 1);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.armor, 3);
  assert.equal(state.enemy.hp, 59);

  // 戰鬥中變更的是基礎值；當下護甲不變，下個 ROUND_START 才使用新數值。
  state.enemy.baseDefense += 2;
  assert.equal(state.enemy.armor, 3);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.baseDefense, 5);
  assert.equal(state.enemy.armor, 5);
});

test('第一個 Round 也會完成 ROUND_START 與 PLAYER_TURN_START', () => {
  const state = createGame({
    id: 'first-round-phases',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds: ['power-strike'], itemIds: ['iron-shield'] },
    monsterRng: zero,
  });

  assert.equal(state.round, 1);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  // 鐵盾是 PLAYER_TURN_START 裝備，第一回合已經生效。
  assert.equal(state.resources.armor, 5);
  assert.equal(state.enemy.intent.type, 'basic-attack');
});

test('完整 Round 依明確階段結算，round 只在 ROUND_END 後增加', () => {
  let state = game({ enemy: { baseDamage: 0 } });
  state = endPlayerTurn(state, { monsterRng: zero });

  assert.deepEqual(state.lastResolution.phaseOrder, [
    'player-turn-end',
    'enemy-turn-start',
    'enemy-turn-end',
    'round-end',
    'round-start',
    'player-turn-start',
  ]);
  assert.equal(state.lastResolution.round, 1);
  assert.equal(state.round, 2);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.equal(state.enemy.intent.type, 'basic-attack');
});

test('ROUND_START 將玩家 baseDefense 疊加到保留護甲', () => {
  let normal = game({ enemy: { baseDamage: 0 } });
  normal.player.baseDefense = 3;
  normal.resources.armor = 8;
  normal = endPlayerTurn(normal, { monsterRng: zero });
  assert.equal(normal.resources.armor, 3);

  let retained = game({ enemy: { baseDamage: 0 } });
  retained.player.baseDefense = 3;
  retained.player.equipment = ['diamond'];
  retained.resources.armor = 14;
  retained = endPlayerTurn(retained, { monsterRng: zero });
  // ROUND_END 保留 floor(14 × 0.5)=7，ROUND_START 再加上 baseDefense 3。
  assert.equal(retained.resources.armor, 10);
});

test('一般狀態 remainingTurns 在每個 ROUND_END 只扣一次', () => {
  let state = game({ enemy: { baseDamage: 0 } });
  state.player.activeStatuses.push({
    statusId: 'regeneration',
    sourceUnitId: state.player.unitId,
    remainingTurns: 3,
    stacks: 1,
    potency: 1,
  });
  state = endPlayerTurn(state, { monsterRng: zero });

  assert.equal(
    state.player.activeStatuses.find((status) => status.statusId === 'regeneration')
      ?.remainingTurns,
    2,
  );
});

test('ROUND_START 已決定 intent，玩家回合結束效果擊殺敵人不進敵方回合', () => {
  let state = game({ enemy: { maxHp: 1, baseDamage: 99 } });
  state.player.equipment = ['star-sea-compass'];
  state.resources.mana = 1;
  assert.equal(state.enemy.intent.type, 'basic-attack');

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.phase, GamePhase.VICTORY_CONFIRM);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.round, 1);
  assert.equal(state.lastResolution, null);
});

test('怪物 intent 在執行時使用最新 baseDamage', () => {
  let state = game({ enemy: { baseDamage: 1 } });
  assert.equal(state.enemy.intent.type, 'basic-attack');
  state.enemy.baseDamage = 7;
  state = endPlayerTurn(state, { monsterRng: zero });

  assert.equal(state.lastResolution.enemyAttack, 7);
  assert.equal(state.lastResolution.damageTaken, 7);
});

test('怪物行動殺死玩家時不會開始下一個 Round', () => {
  let state = game({ enemy: { baseDamage: 1 } });
  state.player.hp = 1;
  state = endPlayerTurn(state, { monsterRng: zero });

  assert.equal(state.status, GameStatus.LOST);
  assert.equal(state.phase, GamePhase.ENDED);
  assert.equal(state.round, 1);
});

test('每次拉霸會立即攻擊並累積本回合護甲與法力', () => {
  const state = placeBet(game(), 2, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });

  assert.equal(state.enemy.hp, 54);
  assert.deepEqual(state.resources, { action: 2, armor: 2, mana: 0 });
  assert.deepEqual(state.lastImpact, {
    attackDamage: 6,
    spinDamage: 6,
    additionalDamage: 0,
    curseDamage: 0,
    reflectionDamage: 0,
    skillDamage: 0,
    armorGained: 2,
    manaGained: 0,
    equipmentBonus: 0,
    statusBonus: 0,
    damageMultiplier: 1,
  });
});

test('可將4點行動拆成4次投入，且不會自動結束回合', () => {
  let state = game();
  for (let index = 0; index < 4; index += 1) {
    state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  }

  assert.equal(state.round, 1);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.deepEqual(state.resources, { action: 0, armor: 4, mana: 4 });
  assert.equal(state.enemy.hp, 56);
});

test('玩家手動結束回合，護甲抵擋已顯示的怪物行動', () => {
  let state = placeBet(game(), 2, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });
  state = endPlayerTurn(state, { monsterRng: zero });

  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 32);
  assert.equal(state.lastResolution.enemyAction.name, '普通攻擊');
  assert.equal(state.lastResolution.armorUsed, 2);
  assert.equal(state.lastResolution.damageTaken, 13);
  assert.equal(state.lastResolution.discardedAction, 2);
  assert.deepEqual(state.resources, { action: 4, armor: 0, mana: 0 });
});

test('治癒技能消耗3點法力並立即恢復5點生命', () => {
  let state = game();
  state.player.hp = 38;
  state = placeBet(state, 1, { reels: [SKILL, SKILL, ATTACK] });
  state = activateSkill(state, 'life-recovery');

  assert.equal(state.player.hp, 43);
  assert.equal(state.resources.mana, 0);
  assert.match(state.lastAction.text, /回復 5 HP/);
});

test('治癒技能會依等級回復5、10、15點生命', () => {
  for (const [level, expectedHealing] of [[1, 5], [2, 10], [3, 15]]) {
    let state = createGame({
      id: `healing-level-${level}`,
      ownerId: 'player-1',
      config: { initialEnemyUnitId: 'ruins-sentinel' },
      loadout: { skillIds: ['life-recovery'], itemIds: [] },
      monsterRng: zero,
    });
    state.player.skillLevels['life-recovery'] = level;
    state.player.hp = 20;
    state = placeBet(state, 1, { reels: [SKILL, SKILL, SKILL] });
    state = activateSkill(state, 'life-recovery');

    assert.equal(state.player.hp, 20 + expectedHealing);
  }
});

test('強擊狀態會跨回合保留，並使下一次拉霸攻擊造成2倍傷害', () => {
  let state = createGame({
    id: 'power-strike-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: { maxHp: 200, baseDamage: 0 },
    },
    loadout: { skillIds: ['power-strike'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
  state = activateSkill(state, 'power-strike');
  assert.equal(state.enemy.hp, 200);
  assert.equal(state.resources.mana, 1);
  assert.equal(state.player.activeStatuses[0].statusId, 'power-strike-ready');

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.activeStatuses[0].statusId, 'power-strike-ready');
  state = placeBet(state, 3, { reels: [ATTACK, ATTACK, ATTACK] });

  assert.equal(state.lastImpact.attackDamage, 54);
  assert.equal(state.lastImpact.damageMultiplier, 2);
  assert.equal(state.enemy.hp, 146);
  assert.equal(
    state.player.activeStatuses.some((status) => status.statusId === 'power-strike-ready'),
    false,
  );
});

test('重複取得強擊會提升技能等級，最高可使用對應倍率', () => {
  let state = createGame({
    id: 'power-strike-upgrade',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds: ['power-strike'], itemIds: [] },
    monsterRng: zero,
  });
  state.phase = GamePhase.REWARD_CHOICE;
  state.rewardChoices = [{
    contentType: 'skill',
    contentId: 'power-strike',
    rarity: 'common',
    acquisition: 'level-up',
    currentLevel: 1,
    targetLevel: 2,
  }];
  state = chooseReward(state, 0, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.player.skillLevels['power-strike'], 2);
});

test('火焰附加使後續有攻擊的拉霸額外造成1點傷害', () => {
  let state = createGame({
    id: 'fire-imbue-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: { maxHp: 60 },
    },
    loadout: { skillIds: ['fire-imbue'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
  state = activateSkill(state, 'fire-imbue');
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });

  assert.equal(state.lastImpact.attackDamage, 2);
  assert.equal(state.lastImpact.statusBonus, 1);
  assert.equal(state.enemy.hp, 58);
});

test('火焰附加會依等級使拉霸攻擊額外造成1、2、3點傷害', () => {
  for (const [level, expectedBonus] of [[1, 1], [2, 2], [3, 3]]) {
    let state = createGame({
      id: `fire-imbue-level-${level}`,
      ownerId: 'player-1',
      config: {
        initialEnemyUnitId: 'ruins-sentinel',
        initialEnemyOverrides: { maxHp: 100, damageResistances: {} },
      },
      loadout: { skillIds: ['fire-imbue'], itemIds: [] },
      monsterRng: zero,
    });
    state.player.skillLevels['fire-imbue'] = level;
    state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
    state = activateSkill(state, 'fire-imbue');
    state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });

    assert.equal(state.lastImpact.statusBonus, expectedBonus);
    assert.equal(state.lastImpact.attackDamage, 1 + expectedBonus);
  }
});

test('消耗品可在戰鬥中使用並從背包扣除', () => {
  let state = createGame({
    id: 'potion-test',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds: ['life-recovery'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state.player.hp = 35;
  state = useItem(state, 'healing-potion');

  assert.equal(state.player.hp, 45);
  assert.equal(state.resources.action, 4);
  assert.deepEqual(state.player.inventory, []);
});

test('長劍在每場戰鬥開始時取得攻擊力狀態並持續3回合', () => {
  let state = createGame({
    id: 'equipment-test',
    ownerId: 'player-1',
    config: {
      playerMaxHp: 100,
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: { maxHp: 100, baseDamage: 0 },
    },
    loadout: { skillIds: ['life-recovery'], itemIds: ['sword'] },
    monsterRng: zero,
  });
  const attackUp = state.player.activeStatuses.find((status) => (
    status.statusId === 'attack-up'
  ));

  assert.deepEqual(state.player.equipment, ['sword']);
  assert.deepEqual(attackUp, {
    statusId: 'attack-up',
    sourceUnitId: 'wanderer',
    remainingTurns: 3,
    stacks: 1,
    potency: 1,
  });

  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.lastImpact.statusBonus, 1);
  assert.equal(state.enemy.hp, 98);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.activeStatuses[0].remainingTurns, 2);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.activeStatuses[0].remainingTurns, 1);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(
    state.player.activeStatuses.some((status) => status.statusId === 'attack-up'),
    false,
  );
});

test('火焰炸彈附加3層燃燒，傷害後燃燒層數除以2並在低於1時解除', () => {
  let state = createGame({
    id: 'bomb-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: {
        maxHp: 100,
        baseDamage: 0,
        damageResistances: {},
      },
    },
    loadout: { skillIds: ['life-recovery'], itemIds: ['fire-bomb'] },
    monsterRng: zero,
  });
  state = useItem(state, 'fire-bomb', { rng: zero });
  assert.equal(state.enemy.hp, 92);
  assert.equal(state.enemy.activeStatuses[0].stacks, 3);
  assert.equal(state.history.at(-1).events[0].damageSource, DamageSource.EXTRA);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.hp, 89);
  assert.equal(state.enemy.activeStatuses[0].stacks, 1);
  assert.equal(
    state.lastResolution.enemyStatusEvents[0].damageSource,
    DamageSource.EXTRA,
  );
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.hp, 88);
  assert.equal(state.enemy.activeStatuses.length, 0);
});

test('火焰衝擊立即造成5點額外傷害並以60%機率附加5層燃燒', () => {
  let state = createGame({
    id: 'flame-impact-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: {
        maxHp: 100,
        baseDamage: 0,
        damageResistances: {},
      },
    },
    loadout: { skillIds: ['flame-impact'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, SKILL] });
  state = activateSkill(state, 'flame-impact', { rng: () => 0.59 });

  assert.equal(state.enemy.hp, 95);
  assert.equal(state.enemy.activeStatuses[0].stacks, 5);
  assert.equal(state.resources.mana, 6);
  assert.equal(state.history.at(-1).events[0].damageSource, DamageSource.EXTRA);
  assert.equal(state.combatModifiers.damageDealtBySource.extra, 5);
});

test('火焰衝擊會依等級附加5、10、15層燃燒', () => {
  for (const [level, expectedStacks] of [[1, 5], [2, 10], [3, 15]]) {
    let state = createGame({
      id: `flame-impact-level-${level}`,
      ownerId: 'player-1',
      config: {
        initialEnemyUnitId: 'ruins-sentinel',
        initialEnemyOverrides: {
          maxHp: 100,
          baseDamage: 0,
          damageResistances: {},
        },
      },
      loadout: { skillIds: ['flame-impact'], itemIds: [] },
      monsterRng: zero,
    });
    state.player.skillLevels['flame-impact'] = level;
    state = placeBet(state, 1, { reels: [SKILL, SKILL, SKILL] });
    state = activateSkill(state, 'flame-impact', { rng: () => 0.59 });

    assert.equal(state.enemy.hp, 95);
    assert.equal(state.enemy.activeStatuses[0].stacks, expectedStacks);
  }
});

test('三個不幸不會自動換回合，玩家只能手動結束', () => {
  let state = placeBet(game(), 1, { reels: [ATTACK, ATTACK, DEFENSE] });
  state = placeBet(state, 1, { reels: [UNLUCKY, UNLUCKY, UNLUCKY] });

  assert.equal(state.round, 1);
  assert.equal(state.enemy.hp, 57);
  assert.equal(state.player.hp, 45);
  assert.equal(isStunned(state), true);
  assert.deepEqual(state.resources, { action: 2, armor: 1, mana: 0 });
  assert.throws(() => placeBet(state, 1), /暈眩/);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 31);
  assert.equal(isStunned(state), false);
});

test('擊敗怪物後先等待玩家確認，再進入獨立獎勵選擇', () => {
  let state = placeBet(game({ enemy: { maxHp: 3, baseDamage: 999 } }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });

  assert.equal(state.status, GameStatus.ACTIVE);
  assert.equal(state.phase, GamePhase.VICTORY_CONFIRM);
  assert.equal(state.enemy.hp, 0);
  assert.equal(state.player.hp, 45);
  assert.equal(state.rewardChoices.length, 0);
  assert.equal(state.adventure.defeatedUnitCount, 0);

  state = confirmCombatVictory(state, { rewardRng: zero });
  assert.equal(state.phase, GamePhase.REWARD_CHOICE);
  assert.equal(state.rewardChoices.length, 3);
  assert.equal(state.player.gold, 10);
  assert.deepEqual(state.lastCombatReward, { gold: 10, dropped: true });
  assert.equal(state.adventure.defeatedUnitCount, 1);
});

test('擊敗地區BOSS時生命回滿，普通敵人不觸發', () => {
  let bossState = game({
    initialEnemyUnitId: 'ruins-guardian',
    enemy: { maxHp: 1 },
  });
  bossState.player.hp = 7;
  bossState = placeBet(bossState, 1, {
    reels: [ATTACK, DEFENSE, SKILL],
  });

  assert.equal(bossState.phase, GamePhase.VICTORY_CONFIRM);
  assert.equal(bossState.player.hp, bossState.player.maxHp);

  let normalState = game({
    initialEnemyUnitId: 'ruins-sentinel',
    enemy: { maxHp: 1 },
  });
  normalState.player.hp = 7;
  normalState = placeBet(normalState, 1, {
    reels: [ATTACK, DEFENSE, SKILL],
  });

  assert.equal(normalState.phase, GamePhase.VICTORY_CONFIRM);
  assert.equal(normalState.player.hp, 7);
});

test('選擇Boss獎勵後換區，敵人生命與基礎傷害提高50%', () => {
  let state = placeBet(game({
    initialEnemyUnitId: 'ruins-guardian',
    enemy: { maxHp: 2 },
  }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });
  state = confirmCombatVictory(state, { rewardRng: zero });
  state = chooseReward(state, 0, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.adventure.regionDepth, 2);
  assert.equal(state.adventure.regionProgress, 0);
  assert.equal(state.enemy.rank, 'normal');
  assert.equal(state.enemy.maxHp, 45);
  assert.equal(state.enemy.baseDamage, 12);
});

test('完成奇遇會增加地區進度並繼續下一次遭遇', () => {
  let state = game();
  state.phase = GamePhase.EVENT;
  state.enemy = null;
  state.event = {
    eventId: 'ruins-abandoned-camp',
    name: '廢棄營地',
    rarity: 'common',
    description: '測試',
    stage: 'choice',
    options: [{ id: 'continue', label: '繼續' }],
    result: null,
  };
  state.adventure.regionProgress = 1;
  state.adventure.completedEncounters = 1;

  state = completeEvent(state, {
    worldRng: sequence([0, 0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });
  assert.equal(state.adventure.regionProgress, 2);
  assert.equal(state.adventure.completedEncounters, 2);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
});

test('神秘泉水選擇喝水後有50%機率回滿HP並顯示結果', () => {
  let state = springEventState();
  state.player.hp = 5;
  state = chooseEventOption(state, 'drink', { eventRng: zero });

  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.phase, GamePhase.EVENT);
  assert.equal(state.event.stage, 'result');
  assert.match(state.event.result.text, /傷口逐漸癒合/);
});

test('神秘泉水有20%機率封印下一場戰鬥的一個技能', () => {
  let state = springEventState(['power-strike', 'life-recovery']);
  state.player.skillLevels['power-strike'] = 2;
  state = chooseEventOption(state, 'drink', {
    eventRng: sequence([0.5, 0]),
  });

  assert.deepEqual(state.player.skillIds, ['power-strike', 'life-recovery']);
  assert.deepEqual(state.player.pendingSealedSkillIds, ['power-strike']);
  assert.match(state.event.result.text, /「強擊」在下一場戰鬥中遭到封印/);

  state = completeEvent(state, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });
  assert.deepEqual(state.player.pendingSealedSkillIds, []);
  assert.deepEqual(state.combatModifiers.sealedSkillIds, ['power-strike']);
  assert.throws(() => activateSkill(state, 'power-strike'), /遭到封印/);
});

test('神秘泉水有20%機率回滿生命後進入菁英戰鬥，整個奇遇只計一次進度', () => {
  let state = springEventState();
  state.player.hp = 5;
  state = chooseEventOption(state, 'drink', {
    eventRng: sequence([0.7, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.equal(state.enemy.rank, 'elite');
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.adventure.regionProgress, 0);
  assert.match(state.lastAction.text, /強大生物/);

  state.enemy.hp = 1;
  state = placeBet(state, 1, {
    // 菁英怪現在會先以其 baseDefense 承受傷害。
    reels: [ATTACK, ATTACK, ATTACK],
    rewardRng: zero,
  });
  assert.equal(state.phase, GamePhase.VICTORY_CONFIRM);
  state = confirmCombatVictory(state, { rewardRng: zero });
  assert.equal(state.adventure.regionProgress, 1);
  assert.equal(state.adventure.completedEncounters, 1);
});

test('密封石室支付最大生命50%後揭示稀有裝備，收下時才取得', () => {
  let state = eventState('ruins-sealed-vault');
  state = chooseEventOption(state, 'blood-unseal', {
    eventRng: sequence([0, 0]),
  });

  assert.equal(state.player.hp, 23);
  assert.equal(state.event.stage, 'vault-reward-choice');
  assert.equal(state.event.vault.damage, 22);
  assert.match(state.event.prompt, /失去 22 點生命/);
  assert.match(state.event.prompt, /效果｜/);
  assert.equal(state.player.equipment.length, 0);

  const itemId = state.event.vault.itemId;
  state = chooseVaultReward(state, 'accept');

  assert.equal(state.player.equipment.length, 1);
  assert.equal(state.player.equipment[0], itemId);
  assert.equal(getItem(itemId).rarity, 'rare');
  assert.match(state.event.result.text, /收下稀有裝備/);
});

test('密封石室可放回揭示裝備，生命最低保留1且不會返還', () => {
  let state = eventState('ruins-sealed-vault');
  state.player.hp = 8;
  state = chooseEventOption(state, 'blood-unseal', {
    eventRng: sequence([0, 0]),
  });

  assert.equal(state.player.hp, 1);
  assert.equal(state.event.vault.damage, 7);

  state = chooseVaultReward(state, 'leave');

  assert.equal(state.player.hp, 1);
  assert.equal(state.player.equipment.length, 0);
  assert.equal(state.event.stage, 'result');
  assert.match(state.event.result.text, /放回石臺.*7 點生命不會返還/);
});

test('廢棄營地伏擊會直接進入普通戰鬥且不恢復生命', () => {
  let state = eventState('ruins-abandoned-camp');
  state.player.hp = 9;
  state = chooseEventOption(state, 'rest', {
    eventRng: sequence([0.9, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.equal(state.enemy.rank, 'normal');
  assert.equal(state.player.hp, 9);
});

test('廢棄營地可以不休息直接離開且不恢復生命', () => {
  let state = eventState('ruins-abandoned-camp');
  state.player.hp = 9;
  state = chooseEventOption(state, 'leave', { eventRng: zero });

  assert.equal(state.phase, GamePhase.EVENT);
  assert.equal(state.enemy, null);
  assert.equal(state.player.hp, 9);
  assert.equal(state.event.stage, 'result');
  assert.match(state.event.result.text, /不在陌生的營地停留/);
});

test('雜亂足跡有50%取得20～30金幣，另50%進入普通戰鬥', () => {
  let rewardState = eventState('ruins-disordered-footprints');
  rewardState = chooseEventOption(rewardState, 'follow', {
    eventRng: sequence([0, 0.999]),
  });
  assert.equal(rewardState.player.gold, 30);
  assert.match(rewardState.event.result.text, /獲得 🪙30/);

  let combatState = eventState('ruins-disordered-footprints');
  combatState = chooseEventOption(combatState, 'follow', {
    eventRng: sequence([0.75, 0, 0]),
    monsterRng: zero,
  });
  assert.equal(combatState.phase, GamePhase.PLAYER_TURN);
  assert.equal(combatState.enemy.rank, 'normal');
});

test('年邁探險家收取30金幣，下一場戰鬥給予攻擊力＋3共9回合', () => {
  const insufficient = eventState('ruins-aged-explorer');
  insufficient.player.gold = 29;
  assert.throws(
    () => chooseEventOption(insufficient, 'fund', { eventRng: zero }),
    /金錢不足.*30/,
  );

  let state = eventState('ruins-aged-explorer');
  state.player.gold = 30;
  state = chooseEventOption(state, 'fund', { eventRng: zero });
  assert.equal(state.player.gold, 0);
  assert.equal(state.player.pendingBattleStatuses[0].statusId, 'bounty-attack-up');
  assert.equal(state.player.pendingBattleStatuses[0].remainingTurns, 9);

  state = completeEvent(state, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });
  assert.equal(state.player.pendingBattleStatuses.length, 0);
  assert.equal(state.player.activeStatuses[0].statusId, 'bounty-attack-up');
  assert.equal(state.player.activeStatuses[0].remainingTurns, 9);

  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.lastImpact.attackDamage, 4);
});

test('華麗寶箱可取得物品或技能卷軸，60%分支會遭遇指定寶箱怪', () => {
  let itemState = eventState('ruins-ornate-chest');
  itemState = chooseEventOption(itemState, 'open', {
    eventRng: sequence([0, 0, 0]),
  });
  assert.equal(itemState.event.stage, 'result');
  assert.equal(
    itemState.player.equipment.length + itemState.player.inventory.length,
    1,
  );

  let skillState = eventState('ruins-ornate-chest');
  skillState = chooseEventOption(skillState, 'open', {
    eventRng: sequence([0.9, 0, 0]),
  });
  assert.equal(skillState.event.stage, 'result');
  assert.match(skillState.event.result.text, /技能卷軸/);

  let mimicState = eventState('ruins-ornate-chest');
  mimicState = chooseEventOption(mimicState, 'open', {
    eventRng: sequence([0.5]),
    monsterRng: sequence([0.99, 0]),
  });
  assert.equal(mimicState.phase, GamePhase.PLAYER_TURN);
  assert.equal(mimicState.enemy.unitId, 'ruins-mimic');
  assert.equal(mimicState.enemy.maxHp, 75);
  assert.equal(mimicState.enemy.baseDamage, 12);
  assert.equal(mimicState.enemy.intent.skillId, 'armor-breaking-strike');
});

test('破甲攻擊附加2層裝甲破壞，無護甲時保留並在後續攻擊先移除護甲', () => {
  let state = eventState('ruins-ornate-chest');
  state = chooseEventOption(state, 'open', {
    eventRng: sequence([0.5]),
    monsterRng: sequence([0.99, 0]),
  });
  state.resources.armor = 0;
  state = endPlayerTurn(state, {
    monsterRng: sequence([0.5, 0, 0]),
  });
  assert.equal(state.lastResolution.armorBroken, 0);
  assert.equal(state.lastResolution.armorUsed, 0);
  assert.equal(state.lastResolution.damageTaken, 12);
  assert.equal(state.player.activeStatuses[0].statusId, 'armor-break');
  assert.equal(state.player.activeStatuses[0].stacks, 2);

  state.resources.armor = 0;
  state = endPlayerTurn(state, {
    monsterRng: sequence([0.5, 0, 0]),
  });
  assert.equal(state.lastResolution.armorBroken, 0);
  assert.equal(state.player.activeStatuses[0].stacks, 4);

  state.resources.armor = 5;
  state = endPlayerTurn(state, {
    monsterRng: zero,
  });
  assert.equal(state.lastResolution.armorBroken, 4);
  assert.equal(state.lastResolution.armorUsed, 1);
  assert.equal(state.lastResolution.damageTaken, 11);
  assert.equal(state.player.activeStatuses[0].stacks, 4);
});

test('遠古回響降低20%最大生命並讓玩家選擇一項未滿級技能提升', () => {
  let state = eventState('ruins-ancient-echo', [
    'power-strike',
    'life-recovery',
  ]);
  state.player.skillLevels['life-recovery'] = 3;
  state = chooseEventOption(state, 'accept', { eventRng: zero });

  assert.equal(state.player.maxHp, 36);
  assert.equal(state.event.stage, 'skill-upgrade-choice');
  assert.deepEqual(state.event.skillChoices, ['power-strike']);

  state = chooseEventSkill(state, 'power-strike');
  assert.equal(state.player.skillLevels['power-strike'], 2);
  assert.equal(state.event.stage, 'result');
  assert.match(state.event.result.text, /強擊.*Lv\.2/);
});

test('尋寶中的鐵匠支付20金幣後有60%機率強化武器', () => {
  let state = eventState('ruins-treasure-blacksmith');
  state.player.equipment = ['sword', 'shuriken', 'iron-shield'];
  state.player.gold = 40;

  state = chooseEventOption(state, 'forge-risky', { eventRng: zero });
  assert.equal(state.player.gold, 20);
  assert.equal(state.event.stage, 'weapon-upgrade-choice');
  assert.deepEqual(state.event.weaponChoices, ['sword', 'shuriken']);

  state = chooseEventWeapon(state, 'sword', { eventRng: () => 0.59 });
  assert.equal(state.event.stage, 'result');
  assert.deepEqual(
    state.player.equipment,
    ['reinforced-longsword', 'shuriken', 'iron-shield'],
  );
  assert.match(state.event.result.text, /長劍.*長劍\(強化\)/);
});

test('尋寶中的鐵匠強化失敗會消耗金幣但保留原武器', () => {
  let state = eventState('ruins-treasure-blacksmith');
  state.player.equipment = ['sword'];
  state.player.gold = 20;

  state = chooseEventOption(state, 'forge-risky', { eventRng: zero });
  state = chooseEventWeapon(state, 'sword', { eventRng: () => 0.6 });

  assert.equal(state.player.gold, 0);
  assert.deepEqual(state.player.equipment, ['sword']);
  assert.match(state.event.result.text, /強化失敗.*長劍.*保持不變/);
});

test('尋寶中的鐵匠收取磨刀石與20金幣後必定強化成功', () => {
  let state = eventState('ruins-treasure-blacksmith');
  state.player.equipment = ['knight-hammer'];
  state.player.inventory = [{ itemId: 'whetstone', quantity: 1 }];
  state.player.gold = 20;

  state = chooseEventOption(state, 'forge-guaranteed', { eventRng: zero });
  state = chooseEventWeapon(state, 'knight-hammer', { eventRng: () => 0.999 });

  assert.equal(state.player.gold, 0);
  assert.deepEqual(state.player.inventory, []);
  assert.deepEqual(state.player.equipment, ['reinforced-knight-hammer']);
});

test('冒險者屍體先判定菁英怪，抽中時該次沒有戰利品', () => {
  let state = eventState('ruins-adventurer-corpse');

  state = chooseEventOption(state, 'search', {
    eventRng: sequence([0, 0.249, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.equal(state.enemy.rank, 'elite');
  assert.equal(state.player.gold, 0);
  assert.deepEqual(state.player.inventory, []);
  assert.deepEqual(state.player.equipment, []);
});

test('冒險者屍體保留先前收穫，後續遇到菁英怪時不取得當次戰利品', () => {
  let state = eventState('ruins-adventurer-corpse');
  state = chooseEventOption(state, 'search', {
    eventRng: sequence([0, 0.25, 0.5, 0]),
  });
  assert.equal(state.event.stage, 'corpse-search');
  assert.equal(state.player.gold, 10);

  state = searchAdventurerCorpse(state, {
    eventRng: sequence([0.499, 0, 0]),
    monsterRng: zero,
  });
  assert.equal(state.enemy.rank, 'elite');
  assert.equal(state.player.gold, 10);
});

test('冒險者屍體最多搜刮3次，取得武器後不會再次抽到武器', () => {
  let state = eventState('ruins-adventurer-corpse');
  state = chooseEventOption(state, 'search', {
    eventRng: sequence([0, 0.25, 0.35, 0]),
  });
  assert.deepEqual(state.player.equipment, ['sword']);

  state = searchAdventurerCorpse(state, {
    eventRng: sequence([0.5, 0.35, 0]),
  });
  assert.equal(state.player.gold, 10);

  state = searchAdventurerCorpse(state, {
    eventRng: sequence([0.75, 0.1, 0]),
  });
  assert.equal(state.event.stage, 'result');
  assert.deepEqual(state.player.equipment, ['sword']);
  assert.equal(state.player.inventory.length, 1);
  assert.match(state.event.result.text, /搜刮結束/);
});

test('冒險者屍體可帶著目前的收穫主動離開', () => {
  let state = eventState('ruins-adventurer-corpse');
  state = chooseEventOption(state, 'search', {
    eventRng: sequence([0, 0.25, 0.5, 0]),
  });
  state = leaveAdventurerCorpse(state);

  assert.equal(state.player.gold, 10);
  assert.equal(state.event.stage, 'result');
  assert.match(state.event.result.text, /帶著目前找到的財物離開/);
});

test('神秘商店共用價格累積購買道具與技能升級，離開後清空', () => {
  let state = eventState('ruins-mysterious-shop');
  state.player.gold = 500;
  state = chooseEventOption(state, 'browse', {
    eventRng: sequence([0, 0, 0, 0, 0, 0, 0]),
  });

  assert.equal(state.event.stage, 'shop');
  assert.equal(state.event.shop.items.length, 3);
  assert.equal(currentShopPrice(state), 38);

  const itemId = state.event.shop.items[0].contentId;
  state = purchaseShopItem(state, itemId);
  assert.equal(state.player.gold, 462);
  assert.equal(state.event.shop.items[0].purchased, true);
  assert.equal(currentShopPrice(state), 68);

  state = purchaseShopSkill(state, 'power-strike');
  assert.equal(state.player.gold, 394);
  assert.equal(state.player.skillLevels['power-strike'], 2);
  assert.equal(state.event.shop.purchases, 2);
  assert.equal(currentShopPrice(state), 120);

  state = leaveShop(state);
  assert.equal(state.event.stage, 'result');
  assert.equal(state.event.shop, null);
  assert.match(state.event.result.text, /購買 2 次.*106/);
});

test('神秘收藏家轉出三個相同符文時取得傳說裝備並保留賭注技能', () => {
  let state = eventState('ruins-mysterious-collector');
  state = chooseEventOption(state, 'challenge-item', {
    eventRng: sequence([0, 0]),
  });
  assert.equal(state.event.stage, 'collector-wager-choice');

  state = chooseEventSkill(state, 'power-strike', {
    eventRng: sequence([0, 0, 0]),
  });
  assert.equal(state.event.stage, 'result');
  assert.equal(state.player.skillIds.includes('power-strike'), true);
  assert.equal(state.player.equipment.length, 1);
  assert.equal(getItem(state.player.equipment[0]).rarity, 'legendary');
});

test('神秘收藏家可鎖定一格重轉，第四次仍失敗會永久失去賭注技能', () => {
  let state = eventState('ruins-mysterious-collector');
  state = chooseEventOption(state, 'challenge-skill', {
    eventRng: sequence([0, 0]),
  });
  state = chooseEventSkill(state, 'power-strike', {
    eventRng: sequence([0, 0.4, 0.7]),
  });
  assert.equal(state.event.stage, 'collector-spin');

  state = spinCollectorEvent(state, 0, { eventRng: sequence([0.4, 0.7]) });
  state = spinCollectorEvent(state, 0, { eventRng: sequence([0.4, 0.7]) });
  state = spinCollectorEvent(state, 0, { eventRng: sequence([0.4, 0.7]) });

  assert.equal(state.event.stage, 'result');
  assert.equal(state.player.skillIds.includes('power-strike'), false);
  assert.match(state.event.result.text, /永久失去/);
});

test('戰敗會立即結束遊戲並清除本輪資料，只保留結算快照', () => {
  const state = endPlayerTurn(game({
    initialEnemyUnitId: 'ruins-guardian',
    enemy: { baseDamage: 999 },
  }), {
    monsterRng: zero,
  });

  assert.equal(state.status, GameStatus.LOST);
  assert.equal(state.phase, GamePhase.ENDED);
  assert.equal(state.endSummary.defeatedBy, '遺跡守衛');
  assert.equal(state.endSummary.defeatedUnitCount, 0);
  assert.deepEqual(state.endSummary.finalSkillIds, ['life-recovery']);
  assert.equal(state.adventure, null);
  assert.deepEqual(state.player.skillIds, []);
});

test('玩家主動放棄也會結束整場遊戲並建立結算資料', () => {
  const state = abandonGame(game());
  assert.equal(state.status, GameStatus.ABANDONED);
  assert.equal(state.phase, GamePhase.ENDED);
  assert.equal(state.endSummary.defeatedBy, null);
  assert.deepEqual(state.resources, { action: 0, armor: 0, mana: 0 });
});

test('投入點數必須是剩餘行動點範圍內的整數', () => {
  assert.throws(() => placeBet(game(), 0), /1～4/);
  assert.throws(() => placeBet(game(), 5), /1～4/);
  assert.throws(() => placeBet(game(), 1.5), /1～4/);
});

test('舊版Boss戰存檔會升級為冒險格式', () => {
  const current = game({ initialEnemyUnitId: 'ruins-guardian' });
  const legacy = {
    ...structuredClone(current),
    schemaVersion: 2,
    boss: structuredClone(current.enemy),
  };
  delete legacy.enemy;
  legacy.resources = { action: 1, attack: 6, defense: 3, skill: 2 };
  const upgraded = upgradeGameState(legacy);

  assert.equal(upgraded.schemaVersion, 8);
  assert.equal(upgraded.enemy.hp, 54);
  assert.deepEqual(upgraded.resources, { action: 1, armor: 3, mana: 2 });
  assert.equal(upgraded.adventure.regionDepth, 1);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
