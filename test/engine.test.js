import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abandonGame,
  activateSkill,
  createGame,
  endPlayerTurn,
  GameStatus,
  isStunned,
  placeBet,
  upgradeGameState,
  useItem,
} from '../src/game/engine.js';
import { SymbolId } from '../src/game/symbols.js';

const { ATTACK, DEFENSE, SKILL, UNLUCKY } = SymbolId;

function game(config) {
  return createGame({ id: 'test-game', ownerId: 'player-1', config });
}

test('新回合取得4點行動點，護甲與法力從0開始', () => {
  const state = game();
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.resources, { action: 4, armor: 0, mana: 0 });
});

test('每次拉霸會立即攻擊並累積本回合護甲與法力', () => {
  const state = placeBet(game(), 2, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });

  assert.equal(state.boss.hp, 54);
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
  assert.equal(state.phase, 'player-turn');
  assert.deepEqual(state.resources, { action: 0, armor: 4, mana: 4 });
  assert.equal(state.boss.hp, 56);
});

test('玩家可手動結束回合，護甲抵擋Boss攻擊且未使用資源消失', () => {
  let state = placeBet(game(), 2, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });
  state = endPlayerTurn(state);

  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 32);
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
    loadout: { skillIds: ['power-strike'], itemIds: ['healing-potion'] },
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
  state = activateSkill(state, 'power-strike');

  assert.equal(state.boss.hp, 55);
  assert.equal(state.resources.mana, 1);
});

test('火焰附加使後續有攻擊的拉霸額外造成1點傷害', () => {
  let state = createGame({
    id: 'fire-imbue-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['fire-imbue'], itemIds: ['healing-potion'] },
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
  state = activateSkill(state, 'fire-imbue');
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });

  assert.equal(state.lastImpact.attackDamage, 2);
  assert.equal(state.lastImpact.statusBonus, 1);
  assert.equal(state.boss.hp, 58);
});

test('消耗品可在戰鬥中使用並從背包扣除', () => {
  let state = createGame({
    id: 'potion-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['life-recovery'], itemIds: ['healing-potion'] },
  });
  state.player.hp = 35;
  state = useItem(state, 'healing-potion');

  assert.equal(state.player.hp, 45);
  assert.deepEqual(state.player.inventory, []);
});

test('裝備在開局自動穿戴並加成每次有攻擊的拉霸', () => {
  let state = createGame({
    id: 'equipment-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['life-recovery'], itemIds: ['flame-sword'] },
  });
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });

  assert.equal(state.player.equipment.weapon, 'flame-sword');
  assert.deepEqual(state.player.inventory, []);
  assert.equal(state.lastImpact.equipmentBonus, 4);
  assert.equal(state.boss.hp, 55);
});

test('火焰炸彈沿用Boss抗性並在回合結束觸發燃燒', () => {
  let state = createGame({
    id: 'bomb-test',
    ownerId: 'player-1',
    loadout: { skillIds: ['life-recovery'], itemIds: ['fire-bomb'] },
  });
  state = useItem(state, 'fire-bomb', { rng: () => 0 });
  assert.equal(state.boss.hp, 54);
  assert.equal(state.boss.activeStatuses[0].statusId, 'burning');

  state = endPlayerTurn(state);
  assert.equal(state.boss.hp, 53);
  assert.equal(state.player.hp, 30);
});

test('三個不幸不會自動換回合，玩家只能手動結束', () => {
  let state = placeBet(game(), 1, { reels: [ATTACK, ATTACK, DEFENSE] });
  state = placeBet(state, 1, { reels: [UNLUCKY, UNLUCKY, UNLUCKY] });

  assert.equal(state.round, 1);
  assert.equal(state.boss.hp, 57);
  assert.equal(state.player.hp, 45);
  assert.equal(isStunned(state), true);
  assert.deepEqual(state.resources, { action: 0, armor: 0, mana: 0 });
  assert.throws(() => placeBet(state, 1), /暈眩/);

  state = endPlayerTurn(state);
  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 30);
  assert.equal(state.lastResolution.stunned, true);
  assert.equal(isStunned(state), false);
});

test('Boss被即時攻擊擊敗後不會反擊', () => {
  const state = placeBet(game({ boss: { maxHp: 3, attackPattern: [999] } }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });

  assert.equal(state.status, GameStatus.WON);
  assert.equal(state.player.hp, 45);
  assert.equal(state.lastResolution, null);
});

test('投入點數必須是剩餘行動點範圍內的整數', () => {
  assert.throws(() => placeBet(game(), 0), /1～4/);
  assert.throws(() => placeBet(game(), 5), /1～4/);
  assert.throws(() => placeBet(game(), 1.5), /1～4/);
});

test('舊版戰鬥存檔會轉成即時結算格式', () => {
  const legacy = game();
  legacy.schemaVersion = 1;
  legacy.spinsUsed = 2;
  legacy.resources = { action: 1, attack: 6, defense: 3, skill: 2 };
  const upgraded = upgradeGameState(legacy);

  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.spinsUsed, undefined);
  assert.equal(upgraded.boss.hp, 54);
  assert.deepEqual(upgraded.resources, { action: 1, armor: 3, mana: 2 });
});

test('可以放棄尚未結束的遊戲', () => {
  const state = abandonGame(game());
  assert.equal(state.status, GameStatus.ABANDONED);
  assert.equal(state.phase, 'ended');
  assert.deepEqual(state.resources, { action: 0, armor: 0, mana: 0 });
});
