import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateSkill,
  createGame,
  endPlayerTurn,
  placeBet,
  useItem,
} from '../src/game/engine.js';
import { SymbolId } from '../src/game/symbols.js';

const zero = () => 0;

function battle({ level = 1, itemIds = [], enemyDamage = 7 } = {}) {
  const state = createGame({
    id: `mana-armor-${level}-${itemIds.join('-') || 'none'}`,
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: {
        maxHp: 500,
        baseDamage: enemyDamage,
        damageResistances: {},
      },
    },
    loadout: { skillIds: ['mana-armor'], itemIds },
    monsterRng: zero,
  });
  state.player.skillLevels['mana-armor'] = level;
  return state;
}

test('魔力護甲每消耗1點法力，依等級抵擋1／2／3點傷害', () => {
  for (const [level, blocked, damageTaken] of [
    [1, 2, 5],
    [2, 4, 3],
    [3, 6, 1],
  ]) {
    let state = battle({ level });
    state.resources.mana = 2;
    state = endPlayerTurn(state, { monsterRng: zero });

    assert.equal(state.lastResolution.manaArmorBlocked, blocked);
    assert.equal(state.lastResolution.manaSpent, 2);
    assert.equal(state.lastResolution.damageTaken, damageTaken);
    assert.equal(state.player.hp, 45 - damageTaken);
  }
});

test('魔力護甲是自動生效的被動技能，不能主動使用', () => {
  const state = battle();
  assert.throws(
    () => activateSkill(state, 'mana-armor'),
    /自動生效的被動技能/,
  );
});

test('詛咒蛇麟封鎖所有護甲來源，並保留魔力護甲未消耗的法力', () => {
  let state = battle({
    level: 2,
    enemyDamage: 5,
    itemIds: [
      'cursed-snake-scale',
      'iron-shield',
      'rune-cube',
      'hardening-potion',
    ],
  });

  // 鐵盾的回合開始護甲、堅硬藥劑與拉霸防禦牌面都必須被封鎖。
  assert.equal(state.resources.armor, 0);
  state = useItem(state, 'hardening-potion');
  assert.equal(state.resources.armor, 0);
  state = placeBet(state, 1, {
    reels: [SymbolId.DEFENSE, SymbolId.DEFENSE, SymbolId.SKILL],
  });
  assert.equal(state.resources.armor, 0);
  assert.equal(state.lastImpact.armorGained, 0);

  state.resources.mana = 5;
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.lastResolution.manaArmorBlocked, 5);
  assert.equal(state.lastResolution.manaSpent, 3);
  assert.equal(state.lastResolution.discardedMana, 0);
  assert.equal(state.resources.mana, 2);

  // 下一回合會使用保留下來的2點法力抵擋4點，再承受剩餘1點。
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.lastResolution.manaArmorBlocked, 4);
  assert.equal(state.lastResolution.manaSpent, 2);
  assert.equal(state.lastResolution.damageTaken, 1);
  assert.equal(state.resources.mana, 0);
});
