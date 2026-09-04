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
      baseDamage: 6,
      baseDefense: 0,
      pendingBaseDamage: 0,
      pendingBaseDefense: 0,
    },
    player: { hp: 45 },
    resources: { armor },
  };
}

function armorOf(state, key) {
  return key === 'player' ? state.resources.armor : state[key].armor ?? 0;
}

test('食鐵只依攻擊前護甲累積下回合的基礎能力，不改變當前能力或護甲', () => {
  const unit = getUnit('iron-beast');
  assert.deepEqual(unit.skillIds, ['iron-eating']);
  assert.equal(unit.requiredActiveSkillCount, 0);
  assert.equal(selectMonsterIntent(unit, { rng: () => 0.99 }).type, 'basic-attack');

  for (const [armor, expectedGain] of [[4, 0], [5, 1], [30, 6]]) {
    const state = stateWithArmor(armor);
    const events = resolveMonsterAttackPassives(state, {
      attackerKey: 'enemy',
      targetKey: 'player',
    }, AttackTrigger.BEFORE_ATTACK_HIT, armorOf);

    assert.equal(state.enemy.baseDamage, 6);
    assert.equal(state.enemy.baseDefense, 0);
    assert.equal(state.resources.armor, armor);
    assert.equal(state.enemy.pendingBaseDamage, expectedGain);
    assert.equal(state.enemy.pendingBaseDefense, expectedGain);
    assert.equal(events[0]?.gain ?? 0, expectedGain);
  }
});
