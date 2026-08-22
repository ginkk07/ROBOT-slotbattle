import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abandonGame,
  activateSkill,
  chooseEventOption,
  chooseReward,
  completeEvent,
  createGame,
  endPlayerTurn,
  GamePhase,
  GameStatus,
  isStunned,
  placeBet,
  upgradeGameState,
  useItem,
} from '../src/game/engine.js';
import { SymbolId } from '../src/game/symbols.js';
import { getEvent } from '../src/game/data/events.js';

const { ATTACK, DEFENSE, SKILL, UNLUCKY } = SymbolId;
const zero = () => 0;

function game({ enemy = {}, ...config } = {}) {
  return createGame({
    id: 'test-game',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-guardian',
      initialEnemyOverrides: enemy,
      ...config,
    },
    worldRng: zero,
    monsterRng: zero,
  });
}

function springEventState(skillIds = ['power-strike']) {
  const state = createGame({
    id: 'spring-event',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds, itemIds: [] },
    monsterRng: zero,
  });
  const event = getEvent('ruins-mysterious-spring');
  state.phase = GamePhase.EVENT;
  state.enemy = null;
  state.event = {
    eventId: event.id,
    name: event.name,
    rarity: event.rarity,
    description: event.description,
    stage: 'choice',
    options: event.options.map(({ id, label }) => ({ id, label })),
    result: null,
  };
  return state;
}

test('新戰鬥取得4點行動點，護甲與法力從0開始', () => {
  const state = game();
  assert.equal(state.schemaVersion, 4);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.deepEqual(state.resources, { action: 4, armor: 0, mana: 0 });
});

test('每次拉霸會立即攻擊並累積本回合護甲與法力', () => {
  const state = placeBet(game(), 2, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });

  assert.equal(state.enemy.hp, 54);
  assert.deepEqual(state.resources, { action: 2, armor: 2, mana: 0 });
  assert.deepEqual(state.lastImpact, {
    attackDamage: 6,
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
      config: { initialEnemyUnitId: 'ruins-guardian' },
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
      initialEnemyUnitId: 'ruins-guardian',
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
    config: { initialEnemyUnitId: 'ruins-guardian' },
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
        initialEnemyUnitId: 'ruins-guardian',
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
    config: { initialEnemyUnitId: 'ruins-guardian' },
    loadout: { skillIds: ['life-recovery'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state.player.hp = 35;
  state = useItem(state, 'healing-potion');

  assert.equal(state.player.hp, 45);
  assert.equal(state.resources.action, 4);
  assert.deepEqual(state.player.inventory, []);
});

test('燃焰之劍在每場戰鬥開始時取得攻擊力狀態並持續3回合', () => {
  let state = createGame({
    id: 'equipment-test',
    ownerId: 'player-1',
    config: {
      playerMaxHp: 100,
      initialEnemyUnitId: 'ruins-guardian',
      initialEnemyOverrides: { maxHp: 100, baseDamage: 0 },
    },
    loadout: { skillIds: ['life-recovery'], itemIds: ['flame-sword'] },
    monsterRng: zero,
  });
  const attackUp = state.player.activeStatuses.find((status) => (
    status.statusId === 'attack-up'
  ));

  assert.equal(state.player.equipment.weapon, 'flame-sword');
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

test('火焰炸彈附加3層燃燒並在回合開始造成層數傷害後減少1層', () => {
  let state = createGame({
    id: 'bomb-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-guardian',
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

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.hp, 89);
  assert.equal(state.enemy.activeStatuses[0].stacks, 2);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.hp, 87);
  assert.equal(state.enemy.activeStatuses[0].stacks, 1);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.hp, 86);
  assert.equal(state.enemy.activeStatuses.length, 0);
});

test('火焰衝擊立即造成5點傷害並以60%機率附加3層燃燒', () => {
  let state = createGame({
    id: 'flame-impact-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-guardian',
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
  assert.equal(state.enemy.activeStatuses[0].stacks, 3);
  assert.equal(state.resources.mana, 6);
});

test('火焰衝擊會依等級附加3、4、5層燃燒', () => {
  for (const [level, expectedStacks] of [[1, 3], [2, 4], [3, 5]]) {
    let state = createGame({
      id: `flame-impact-level-${level}`,
      ownerId: 'player-1',
      config: {
        initialEnemyUnitId: 'ruins-guardian',
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
  assert.deepEqual(state.resources, { action: 0, armor: 0, mana: 0 });
  assert.throws(() => placeBet(state, 1), /暈眩/);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 30);
  assert.equal(isStunned(state), false);
});

test('擊敗怪物後進入獨立獎勵選擇，不會結束整場遊戲或反擊', () => {
  const state = placeBet(game({ enemy: { maxHp: 3, baseDamage: 999 } }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });

  assert.equal(state.status, GameStatus.ACTIVE);
  assert.equal(state.phase, GamePhase.REWARD_CHOICE);
  assert.equal(state.player.hp, 45);
  assert.equal(state.rewardChoices.length, 2);
  assert.equal(state.adventure.defeatedUnitCount, 1);
});

test('選擇Boss獎勵後換區，敵人生命與基礎傷害提高20%', () => {
  let state = placeBet(game({ enemy: { maxHp: 3 } }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });
  state = chooseReward(state, 0, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.adventure.regionDepth, 2);
  assert.equal(state.adventure.regionProgress, 0);
  assert.equal(state.enemy.rank, 'normal');
  assert.equal(state.enemy.maxHp, 36);
  assert.equal(state.enemy.baseDamage, 10);
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
    worldRng: sequence([0.99, 0.99, 0, 0, 0]),
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
  assert.match(state.event.result.text, /HP 回滿/);
});

test('神秘泉水有20%機率隨機遺忘一個技能', () => {
  let state = springEventState(['power-strike', 'life-recovery']);
  state.player.skillLevels['power-strike'] = 2;
  state = chooseEventOption(state, 'drink', {
    eventRng: sequence([0.5, 0]),
  });

  assert.deepEqual(state.player.skillIds, ['life-recovery']);
  assert.equal(state.player.skillLevels['power-strike'], undefined);
  assert.match(state.event.result.text, /遺忘了「強擊」/);
});

test('神秘泉水有20%機率進入菁英戰鬥，整個奇遇只計一次進度', () => {
  let state = springEventState();
  state = chooseEventOption(state, 'drink', {
    eventRng: sequence([0.7, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.equal(state.enemy.rank, 'elite');
  assert.equal(state.adventure.regionProgress, 0);
  assert.match(state.lastAction.text, /進入了戰鬥/);

  state.enemy.hp = 1;
  state = placeBet(state, 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });
  assert.equal(state.adventure.regionProgress, 1);
  assert.equal(state.adventure.completedEncounters, 1);
});

test('戰敗會立即結束遊戲並清除本輪資料，只保留結算快照', () => {
  const state = endPlayerTurn(game({ enemy: { baseDamage: 999 } }), {
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
  const current = game();
  const legacy = {
    ...structuredClone(current),
    schemaVersion: 2,
    boss: structuredClone(current.enemy),
  };
  delete legacy.enemy;
  legacy.resources = { action: 1, attack: 6, defense: 3, skill: 2 };
  const upgraded = upgradeGameState(legacy);

  assert.equal(upgraded.schemaVersion, 4);
  assert.equal(upgraded.enemy.hp, 54);
  assert.deepEqual(upgraded.resources, { action: 1, armor: 3, mana: 2 });
  assert.equal(upgraded.adventure.regionDepth, 1);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
