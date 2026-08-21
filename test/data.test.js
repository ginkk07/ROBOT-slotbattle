import test from 'node:test';
import assert from 'node:assert/strict';

import { getItem } from '../src/game/data/items.js';
import { getMonsterSkill } from '../src/game/data/monster-skills.js';
import { getSkill } from '../src/game/data/skills.js';
import { getStatus } from '../src/game/data/statuses.js';
import { getUnit } from '../src/game/data/units.js';
import { validateGameData } from '../src/game/data/validate.js';

test('所有遊戲資料庫的交叉引用都有效', () => {
  assert.equal(validateGameData(), true);
});

test('單位以rank與tags區分普通、菁英與Boss', () => {
  const normal = getUnit('ruins-sentinel');
  const elite = getUnit('elite-ruins-sentinel');
  const boss = getUnit('ruins-guardian');

  assert.equal(normal.skillIds.length, 1);
  assert.equal(elite.rank, 'elite');
  assert.equal(elite.skillIds.length, 2);
  assert.ok(elite.tags.includes('elite'));
  assert.equal(boss.rank, 'boss');
  assert.ok(boss.tags.includes('construct'));
  assert.equal(boss.skillIds.length, 3);
  assert.equal(boss.lootTableId, 'ruins-boss-loot');
});

test('玩家技能與道具共用effects，怪物技能使用獨立資料庫', () => {
  assert.deepEqual(getSkill('life-recovery').effects[0], {
    type: 'heal',
    amount: 5,
    target: 'self',
  });
  assert.equal(getSkill('power-strike').cost, 2);
  assert.equal(getSkill('fire-imbue').effects[0].statusId, 'fire-imbue');
  assert.equal(getItem('fire-bomb').effects[1].statusId, 'burning');
  assert.equal(getItem('fire-bomb').effects[1].stacks, 3);
  assert.equal(getSkill('flame-impact').effects[0].amount, 3);
  assert.equal(getSkill('flame-impact').effects[1].chance, 0.5);
  assert.equal(getSkill('flame-impact').effects[1].stacks, 3);
  assert.equal(getItem('healing-potion').actionCost, 0);
  assert.equal(getItem('flame-sword').type, 'equipment');
  assert.equal(getItem('flame-sword').battleStartEffects[0].statusId, 'attack-up');
  assert.equal(getSkill('life-recovery').rarity, 'common');
  assert.equal(getSkill('flame-impact').rarity, 'legendary');
  assert.equal(getItem('fire-bomb').rarity, 'rare');
  assert.equal(getMonsterSkill('guardian-strike').power, 1.25);
  assert.equal(getStatus('attack-up').stacking.mode, 'stack-potency');
  assert.equal(getStatus('burning').trigger, 'turn-start');
  assert.equal(getStatus('burning').stacking.mode, 'stack-countdown');
});

test('資料定義為唯讀，戰鬥不能誤改原始資料庫', () => {
  assert.equal(Object.isFrozen(getUnit('ruins-guardian')), true);
  assert.equal(Object.isFrozen(getUnit('ruins-guardian').tags), true);
});
