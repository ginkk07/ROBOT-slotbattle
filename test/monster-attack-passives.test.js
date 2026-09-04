import test from 'node:test';
import assert from 'node:assert/strict';

import { AttackTrigger } from '../src/game/data/attack-triggers.js';
import { getUnit } from '../src/game/data/units.js';
import {
  resolveMonsterAttackPassives,
  selectMonsterIntent,
} from '../src/game/engines/monster-action-engine.js';

function stateWithArmor(armor) {
  const unit = getUnit('iron-beast');
  return {
    enemy: {
      ...structuredClone(unit),
      hp: 45,
      baseDamage: 6,
      baseDefense: 0,
      armor: 0,
    },
    player: { hp: 45 },
    resources: { armor },
  };
}

function armorOf(state, key) {
  return key === 'player' ? state.resources.armor : state[key].armor ?? 0;
}

test('食鐵在每個 Attack Hit 前依當下護甲立即增加基礎能力，不消耗護甲', () => {
  const unit = getUnit('iron-beast');
  assert.deepEqual(unit.skillIds, ['iron-eating']);
  assert.equal(unit.requiredActiveSkillCount, 0);
  assert.equal(selectMonsterIntent(unit, { rng: () => 0.99 }).type, 'basic-attack');

  for (const [armor, expectedGain] of [[5, 0], [6, 1], [30, 5]]) {
    const state = stateWithArmor(armor);
    const events = resolveMonsterAttackPassives(state, {
      attackerKey: 'enemy',
      targetKey: 'player',
    }, AttackTrigger.BEFORE_ATTACK_HIT, armorOf);

    assert.equal(state.enemy.baseDamage, 6 + expectedGain);
    assert.equal(state.enemy.baseDefense, expectedGain);
    assert.equal(state.enemy.armor, 0);
    assert.equal(state.resources.armor, armor);
    assert.equal(events[0]?.gain ?? 0, expectedGain);
    assert.equal(events[0]?.baseDamage ?? 6, 6 + expectedGain);
    assert.equal(events[0]?.baseDefense ?? 0, expectedGain);
  }
});
