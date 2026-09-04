import test from 'node:test';
import assert from 'node:assert/strict';

import { AttackTrigger } from '../src/game/data/attack-triggers.js';
import { resolveAttack } from '../src/game/engines/attack-engine.js';

function attackFixture({ targetHp = 20, targetArmor = 0 } = {}) {
  return {
    player: { hp: targetHp },
    enemy: { hp: 20 },
    resources: { armor: targetArmor },
  };
}

function armorOf(state, key) {
  return key === 'player' ? state.resources.armor : state[key].armor ?? 0;
}

test('一個三連擊是一次 Attack、三次 Hit，且每次 Hit 讀取最新護甲', () => {
  const state = attackFixture({ targetArmor: 5 });
  const triggerCounts = Object.fromEntries(Object.values(AttackTrigger).map((trigger) => [trigger, 0]));
  const observedArmor = [];

  const result = resolveAttack({
    attackId: 'test-combo',
    attackerKey: 'enemy',
    targetKey: 'player',
    totalHits: 3,
    getState: () => state,
    getArmor: armorOf,
    runTrigger: (trigger, context) => {
      triggerCounts[trigger] += 1;
      if (trigger === AttackTrigger.BEFORE_ATTACK_HIT) observedArmor.push(context.armorBefore);
      return [];
    },
    resolveHit: () => {
      const armorUsed = Math.min(state.resources.armor, 2);
      state.resources.armor -= armorUsed;
      const damage = 2 - armorUsed;
      state.player.hp -= damage;
      return { requestedDamage: 2, armorDamage: armorUsed, actualHpDamage: damage };
    },
  });

  assert.deepEqual(observedArmor, [5, 3, 1]);
  assert.deepEqual(triggerCounts, {
    [AttackTrigger.BEFORE_ATTACK]: 1,
    [AttackTrigger.BEFORE_ATTACK_HIT]: 3,
    [AttackTrigger.AFTER_ATTACK_HIT]: 3,
    [AttackTrigger.AFTER_ATTACK]: 1,
  });
  assert.equal(result.hitResults.length, 3);
});

test('目標在第二 Hit 死亡時不會繼續第三 Hit', () => {
  const state = attackFixture({ targetHp: 2 });
  const triggers = [];
  const result = resolveAttack({
    attackId: 'lethal-combo',
    attackerKey: 'enemy',
    targetKey: 'player',
    totalHits: 3,
    getState: () => state,
    getArmor: armorOf,
    runTrigger: (trigger) => { triggers.push(trigger); return []; },
    resolveHit: () => {
      state.player.hp -= 1;
      return { requestedDamage: 1, actualHpDamage: 1, armorDamage: 0 };
    },
  });

  assert.equal(result.hitResults.length, 2);
  assert.equal(triggers.filter((trigger) => trigger === AttackTrigger.BEFORE_ATTACK_HIT).length, 2);
  assert.equal(triggers.filter((trigger) => trigger === AttackTrigger.AFTER_ATTACK_HIT).length, 2);
  assert.equal(triggers.filter((trigger) => trigger === AttackTrigger.AFTER_ATTACK).length, 1);
});
