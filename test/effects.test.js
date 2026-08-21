import test from 'node:test';
import assert from 'node:assert/strict';

import { getItem } from '../src/game/data/items.js';
import { getSkill } from '../src/game/data/skills.js';
import { createGame } from '../src/game/engine.js';
import { applyEffects } from '../src/game/engines/effects.js';
import {
  mergeActiveStatus,
  resolveStatusApplication,
} from '../src/game/engines/status-engine.js';

function game() {
  return createGame({ id: 'effects-test', ownerId: 'player-1' });
}

test('技能與道具使用同一套治療效果處理器', () => {
  const state = game();
  state.player.hp = 40;

  const result = applyEffects({
    effects: getSkill('life-recovery').effects,
    source: state.player,
    target: state.boss,
  });

  assert.equal(result.source.hp, 45);
  assert.equal(result.events[0].requested, 5);
  assert.equal(result.events[0].amount, 5);
  assert.equal(state.player.hp, 40);
});

test('火焰炸彈會計算Boss火焰抗性與燃燒效果降低', () => {
  const state = game();
  const result = applyEffects({
    effects: getItem('fire-bomb').effects,
    source: state.player,
    target: state.boss,
    rng: () => 0,
  });

  assert.equal(result.target.hp, 54);
  assert.equal(result.events[0].resistance, 0.25);
  assert.equal(result.target.activeStatuses[0].statusId, 'burning');
  assert.equal(result.target.activeStatuses[0].potency, 1);
});

test('單位自己的狀態覆寫優先於狀態庫Boss規則', () => {
  const state = game();
  const frozen = resolveStatusApplication({
    statusId: 'frozen',
    targetUnit: state.boss,
    chance: 1,
    rng: () => {
      throw new Error('免疫時不應抽選');
    },
  });

  assert.equal(frozen.applied, false);
  assert.equal(frozen.reason, 'immune');

  const resisted = resolveStatusApplication({
    statusId: 'stunned',
    targetUnit: state.boss,
    chance: 1,
    rng: () => 0.25,
  });
  assert.equal(resisted.applied, false);
  assert.equal(resisted.chance, 0.25);
});

test('可疊加狀態遵守最大層數', () => {
  const current = [{
    statusId: 'burning',
    sourceUnitId: 'player',
    remainingTurns: 2,
    stacks: 4,
    potency: 1,
  }];
  const merged = mergeActiveStatus(current, {
    statusId: 'burning',
    sourceUnitId: 'player',
    remainingTurns: 3,
    stacks: 2,
    potency: 2,
  });

  assert.equal(merged[0].stacks, 5);
  assert.equal(merged[0].remainingTurns, 3);
  assert.equal(merged[0].potency, 2);
});

test('攻擊力加成狀態可以疊加並刷新持續回合', () => {
  const current = [{
    statusId: 'attack-up',
    sourceUnitId: 'equipment',
    remainingTurns: 2,
    stacks: 1,
    potency: 1,
  }];
  const merged = mergeActiveStatus(current, {
    statusId: 'attack-up',
    sourceUnitId: 'skill',
    remainingTurns: 3,
    stacks: 1,
    potency: 1,
  });

  assert.equal(merged[0].stacks, 2);
  assert.equal(merged[0].remainingTurns, 3);
});
