import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abandonGame,
  createGame,
  endBetting,
  GameStatus,
  placeBet,
} from '../src/game/engine.js';
import { SymbolId } from '../src/game/symbols.js';

const { ATTACK, DEFENSE, SKILL, UNLUCKY } = SymbolId;

function game(overrides) {
  return createGame({ id: 'test-game', ownerId: 'player-1', config: overrides });
}

test('新回合取得固定行動點且指令點從0開始', () => {
  const state = game();
  assert.equal(state.resources.action, 4);
  assert.deepEqual(state.resources, {
    action: 4,
    attack: 0,
    defense: 0,
    skill: 0,
  });
});

test('投入後累積指令點，結算後所有資源清空並補充下一回合行動點', () => {
  let state = game();
  state = placeBet(state, 2, { reels: [ATTACK, ATTACK, DEFENSE] });

  assert.deepEqual(state.resources, {
    action: 2,
    attack: 6,
    defense: 2,
    skill: 0,
  });

  state = endBetting(state);
  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 32);
  assert.equal(state.boss.hp, 54);
  assert.deepEqual(state.resources, {
    action: 4,
    attack: 0,
    defense: 0,
    skill: 0,
  });
  assert.equal(state.lastResolution.discardedAction, 2);
});

test('生命回復技能每點恢復2生命', () => {
  let state = game();
  state.player.hp = 40;
  state = placeBet(state, 1, { reels: [SKILL, DEFENSE, UNLUCKY] });
  state = endBetting(state);

  assert.equal(state.lastResolution.commandPoints.skill, 1);
  assert.equal(state.lastResolution.healing, 2);
  assert.equal(state.player.hp, 28);
});

test('生命回復不會超過最大生命', () => {
  let state = game();
  state.player.hp = 44;
  state = placeBet(state, 1, { reels: [SKILL, SKILL, SKILL] });
  state = endBetting(state);

  assert.equal(state.lastResolution.commandPoints.skill, 9);
  assert.equal(state.lastResolution.healing, 1);
});

test('三個不幸會捨棄先前累積的指令點與剩餘行動點', () => {
  let state = game();
  state = placeBet(state, 1, { reels: [ATTACK, ATTACK, DEFENSE] });
  state = placeBet(state, 1, { reels: [UNLUCKY, UNLUCKY, UNLUCKY] });

  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 30);
  assert.equal(state.boss.hp, 60);
  assert.equal(state.lastResolution.stunned, true);
  assert.equal(state.lastResolution.wageredAction, 2);
  assert.equal(state.lastResolution.discardedAction, 2);
  assert.deepEqual(state.resources, {
    action: 4,
    attack: 0,
    defense: 0,
    skill: 0,
  });
});

test('第三次拉霸後自動結算回合', () => {
  let state = game();
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });

  assert.equal(state.round, 2);
  assert.equal(state.lastResolution.discardedAction, 1);
  assert.deepEqual(state.resources, {
    action: 4,
    attack: 0,
    defense: 0,
    skill: 0,
  });
});

test('Boss在玩家攻擊後死亡就不會反擊', () => {
  let state = game({ boss: { maxHp: 3, attackPattern: [999] } });
  state = placeBet(state, 1, { reels: [ATTACK, ATTACK, DEFENSE] });
  state = endBetting(state);

  assert.equal(state.status, GameStatus.WON);
  assert.equal(state.player.hp, 45);
  assert.equal(state.lastResolution.bossAttack, 0);
  assert.equal(state.lastResolution.damageTaken, 0);
});

test('可以放棄尚未結束的遊戲', () => {
  const state = abandonGame(game());
  assert.equal(state.status, GameStatus.ABANDONED);
  assert.equal(state.phase, 'ended');
  assert.deepEqual(state.resources, {
    action: 0,
    attack: 0,
    defense: 0,
    skill: 0,
  });
});

test('開局配置會帶入技能與初始道具', () => {
  const state = createGame({
    id: 'loadout-test',
    ownerId: 'player-1',
    loadout: {
      skillIds: ['life-recovery'],
      itemIds: ['healing-potion', 'healing-potion'],
    },
  });

  assert.deepEqual(state.player.skillIds, ['life-recovery']);
  assert.deepEqual(state.player.inventory, [
    { itemId: 'healing-potion', quantity: 2 },
  ]);
});
