import test from 'node:test';
import assert from 'node:assert/strict';

import { DamageSource } from '../src/game/data/damage-sources.js';
import { getItem } from '../src/game/data/items.js';
import { PassiveSkillTrigger } from '../src/game/data/skill-effects.js';
import { getSkillLevelDefinition } from '../src/game/data/skills.js';
import { createGame } from '../src/game/engine.js';
import { applyEffects } from '../src/game/engines/effects.js';
import { resolvePassiveSkillEffects } from '../src/game/engines/passive-skill-engine.js';
import {
  consumeSpinDamageMultiplierStatuses,
  mergeActiveStatus,
  resolveStatusApplication,
} from '../src/game/engines/status-engine.js';

function game() {
  return createGame({
    id: 'effects-test',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-guardian' },
    monsterRng: () => 0,
  });
}

test('技能與道具使用同一套治療效果處理器', () => {
  const state = game();
  state.player.hp = 40;

  const result = applyEffects({
    effects: getSkillLevelDefinition('life-recovery', 1).effects,
    source: state.player,
    target: state.enemy,
  });

  assert.equal(result.source.hp, 45);
  assert.equal(result.events[0].requested, 5);
  assert.equal(result.events[0].amount, 5);
  assert.equal(state.player.hp, 40);
});

test('提升基礎防禦力只改變baseDefense，當前護甲維持至下回合重設', () => {
  const state = game();
  state.enemy.armor = 1;

  const result = applyEffects({
    effects: [{ type: 'gain-base-defense', amount: 2, target: 'enemy' }],
    source: state.player,
    target: state.enemy,
  });

  assert.equal(result.target.baseDefense, 2);
  assert.equal(result.target.armor, 1);
  assert.deepEqual(result.events[0], {
    type: 'gain-base-defense',
    amount: 2,
    baseDefense: 2,
    target: 'enemy',
  });
});

test('被動技能由觸發時機與處理器註冊表統一結算', () => {
  const result = resolvePassiveSkillEffects(
    {
      skillIds: ['mana-armor'],
      skillLevels: { 'mana-armor': 2 },
    },
    PassiveSkillTrigger.BEFORE_DAMAGE_TAKEN,
    {
      damage: 5,
      resources: { action: 0, armor: 0, mana: 2 },
    },
  );

  assert.equal(result.context.damage, 1);
  assert.equal(result.context.resources.mana, 0);
  assert.equal(result.events[0].skillId, 'mana-armor');
  assert.equal(result.events[0].blocked, 4);
});

test('下一次拉霸倍率依狀態機制定義結算，不由戰鬥流程辨識技能ID', () => {
  const result = consumeSpinDamageMultiplierStatuses({
    activeStatuses: [{
      statusId: 'power-strike-ready',
      sourceUnitId: 'player',
      remainingTurns: null,
      stacks: 1,
      potency: 3,
    }],
  });

  assert.equal(result.multiplier, 3);
  assert.equal(result.events[0].effectType, 'multiply-spin-damage');
  assert.deepEqual(result.unit.activeStatuses, []);
});

test('Boss護甲強化會降低火焰炸彈傷害並附加3層燃燒', () => {
  const state = game();
  const result = applyEffects({
    effects: getItem('fire-bomb').effects,
    source: state.player,
    target: state.enemy,
    damageSource: DamageSource.EXTRA,
    rng: () => 0,
  });

  assert.equal(result.target.hp, 54);
  assert.equal(result.events[0].resistance, 0);
  assert.ok(Math.abs(result.events[0].damageReduction - 0.2) < 1e-12);
  const burning = result.target.activeStatuses.find((status) => (
    status.statusId === 'burning'
  ));
  assert.equal(burning.stacks, 3);
  assert.equal(burning.remainingTurns, 3);
  assert.equal(burning.potency, 1);
});

test('護甲強化狀態使強化遺跡哨兵受到的傷害降低20%', () => {
  const state = createGame({
    id: 'armor-reinforcement-test',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'elite-ruins-sentinel' },
    monsterRng: () => 0,
  });
  const result = applyEffects({
    effects: [{ type: 'damage', element: 'physical', amount: 10, target: 'enemy' }],
    source: state.player,
    target: state.enemy,
    damageSource: DamageSource.SPIN,
  });

  assert.equal(result.events[0].resistance, 0);
  assert.ok(Math.abs(result.events[0].damageReduction - 0.2) < 1e-12);
  assert.equal(result.events[0].amount, 8);
});

test('單位自己的狀態覆寫優先於狀態庫Boss規則', () => {
  const state = game();
  const frozen = resolveStatusApplication({
    statusId: 'frozen',
    targetUnit: state.enemy,
    chance: 1,
    rng: () => {
      throw new Error('免疫時不應抽選');
    },
  });

  assert.equal(frozen.applied, false);
  assert.equal(frozen.reason, 'immune');

  const resisted = resolveStatusApplication({
    statusId: 'stunned',
    targetUnit: state.enemy,
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

  assert.equal(merged[0].stacks, 6);
  assert.equal(merged[0].remainingTurns, 6);
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
