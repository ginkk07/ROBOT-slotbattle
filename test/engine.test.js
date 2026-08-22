import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abandonGame,
  activateSkill,
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

test('新戰鬥取得4點行動點，護甲與法力從0開始', () => {
  const state = game();
  assert.equal(state.schemaVersion, 3);
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

test('強擊技能可作為開局技能並立即造成5點傷害', () => {
  let state = createGame({
    id: 'power-strike-test',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-guardian' },
    loadout: { skillIds: ['power-strike'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
  state = activateSkill(state, 'power-strike');

  assert.equal(state.enemy.hp, 55);
  assert.equal(state.resources.mana, 1);
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

test('火焰衝擊造成3點傷害並以50%機率附加3層燃燒', () => {
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
  state = activateSkill(state, 'flame-impact', { rng: () => 0.49 });

  assert.equal(state.enemy.hp, 97);
  assert.equal(state.enemy.activeStatuses[0].stacks, 3);
  assert.equal(state.resources.mana, 6);
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

test('擊敗怪物後進入三選一獎勵，不會結束整場遊戲或反擊', () => {
  const state = placeBet(game({ enemy: { maxHp: 3, baseDamage: 999 } }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });

  assert.equal(state.status, GameStatus.ACTIVE);
  assert.equal(state.phase, GamePhase.REWARD_CHOICE);
  assert.equal(state.player.hp, 45);
  assert.equal(state.rewardChoices.length, 3);
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
  };
  state.adventure.regionProgress = 1;
  state.adventure.completedEncounters = 1;

  state = completeEvent(state, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });
  assert.equal(state.adventure.regionProgress, 2);
  assert.equal(state.adventure.completedEncounters, 2);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
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

  assert.equal(upgraded.schemaVersion, 3);
  assert.equal(upgraded.enemy.hp, 54);
  assert.deepEqual(upgraded.resources, { action: 1, armor: 3, mana: 2 });
  assert.equal(upgraded.adventure.regionDepth, 1);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
