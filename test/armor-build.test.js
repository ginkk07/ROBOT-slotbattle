import test from 'node:test';
import assert from 'node:assert/strict';

import { DamageSource } from '../src/game/data/damage-sources.js';
import {
  activateSkill,
  createGame,
  endPlayerTurn,
  placeBet,
} from '../src/game/engine.js';
import { resolveSymbolChances } from '../src/game/random.js';
import { symbolChancesWithStatuses } from '../src/game/engines/status-engine.js';
import { SymbolId } from '../src/game/symbols.js';

const { ATTACK, DEFENSE, SKILL } = SymbolId;
const zero = () => 0;

function battle({
  skillIds = ['shield-block'],
  itemIds = [],
  baseDamage = 0,
  maxHp = 500,
} = {}) {
  return createGame({
    id: `armor-build-${skillIds.join('-')}-${itemIds.join('-')}`,
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: {
        maxHp,
        baseDamage,
        damageResistances: {},
      },
    },
    loadout: { skillIds, itemIds },
    monsterRng: zero,
  });
}

test('盾牌格檔依等級立即取得2、4、6點護甲', () => {
  for (const [level, expectedArmor] of [2, 4, 6].entries()) {
    let state = battle({ skillIds: ['shield-block'] });
    state.player.skillLevels['shield-block'] = level + 1;
    state.resources.mana = 1;
    state = activateSkill(state, 'shield-block');

    assert.equal(state.resources.armor, expectedArmor);
    assert.equal(state.resources.mana, 0);
  }
});

test('烈火罩在敵人完成攻擊後附加燃燒並消失，即使傷害全被護甲擋住', () => {
  let state = battle({ skillIds: ['flame-cover'], baseDamage: 4 });
  state.player.skillLevels['flame-cover'] = 2;
  state.resources.mana = 2;
  state = activateSkill(state, 'flame-cover');

  assert.equal(state.resources.armor, 4);
  assert.equal(
    state.player.activeStatuses.find((status) => status.statusId === 'flame-cover')
      ?.potency,
    2,
  );

  state = endPlayerTurn(state, { monsterRng: zero });

  assert.equal(state.lastResolution.armorUsed, 4);
  assert.equal(state.lastResolution.damageTaken, 0);
  assert.equal(
    state.enemy.activeStatuses.find((status) => status.statusId === 'burning')
      ?.stacks,
    2,
  );
  assert.equal(
    state.player.activeStatuses.some((status) => status.statusId === 'flame-cover'),
    false,
  );
});

test('盾牌投擲造成該次實際護甲加3、6、9點額外傷害且仍保留護甲', () => {
  for (const level of [1, 2, 3]) {
    let state = battle({
      skillIds: ['shield-throw'],
      itemIds: ['rune-cube'],
    });
    state.player.skillLevels['shield-throw'] = level;
    state.resources.mana = 1;
    state = activateSkill(state, 'shield-throw');
    state = placeBet(state, 1, { reels: [DEFENSE, DEFENSE, SKILL] });

    const expectedDamage = 7 + level * 3;
    assert.equal(state.lastImpact.spinDamage, 0);
    assert.equal(state.lastImpact.skillDamage, expectedDamage);
    assert.equal(state.lastImpact.attackDamage, expectedDamage);
    assert.equal(state.lastImpact.armorGained, 7);
    assert.equal(state.resources.armor, 7);
    assert.equal(state.enemy.hp, 500 - expectedDamage);
    assert.equal(
      state.player.activeStatuses.some((status) => (
        status.statusId === 'shield-throw-ready'
      )),
      false,
    );
    assert.equal(
      state.history.at(-1).statusEvents.find((event) => event.type === 'damage')
        ?.damageSource,
      DamageSource.EXTRA,
    );
  }
});

test('盾牌猛擊使用施放前護甲計算傷害，再留下向下取整的一半護甲', () => {
  let state = battle({ skillIds: ['shield-bash'] });
  state.player.skillLevels['shield-bash'] = 3;
  state.resources.mana = 2;
  state.resources.armor = 5;
  state = activateSkill(state, 'shield-bash');

  assert.equal(state.enemy.hp, 485);
  assert.equal(state.resources.armor, 2);
  assert.equal(state.resources.mana, 0);
  assert.equal(state.history.at(-1).events[0].damageSource, DamageSource.EXTRA);
  assert.equal(state.history.at(-1).events[0].resourceSpent, 3);
});

test('聖盾術Lv3消耗3點法力，持續三個玩家回合並調整25個百分點', () => {
  let state = battle({ skillIds: ['holy-shield'] });
  state.player.skillLevels['holy-shield'] = 3;
  state.resources.mana = 3;
  state = activateSkill(state, 'holy-shield');

  const active = state.player.activeStatuses.find((status) => (
    status.statusId === 'holy-shield'
  ));
  assert.equal(state.resources.mana, 0);
  assert.equal(active.remainingTurns, 3);

  const chances = symbolChancesWithStatuses(
    state.player,
    resolveSymbolChances({}),
  );
  assert.ok(Math.abs(chances.attack - 0.05) < 1e-12);
  assert.ok(Math.abs(chances.defense - 0.55) < 1e-12);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(
    state.player.activeStatuses.find((status) => status.statusId === 'holy-shield')
      ?.remainingTurns,
    2,
  );
  state = endPlayerTurn(state, { monsterRng: zero });
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(
    state.player.activeStatuses.some((status) => status.statusId === 'holy-shield'),
    false,
  );
});

test('荊棘在實際受到HP傷害時反射5點，護甲完全擋住時不反射', () => {
  let blocked = battle({
    itemIds: ['iron-shield', 'thorns', 'magic-stone', 'diamond'],
    baseDamage: 1,
  });
  blocked = endPlayerTurn(blocked, { monsterRng: zero });
  assert.equal(blocked.enemy.hp, 500);
  assert.equal(blocked.lastResolution.damageFollowUpEvents.length, 0);

  let state = battle({ itemIds: ['thorns'], baseDamage: 1 });
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.hp, 44);
  assert.equal(state.enemy.hp, 495);
  assert.equal(
    state.lastResolution.damageFollowUpEvents[0].damageSource,
    DamageSource.REFLECT,
  );
});

test('沒有護甲時不能使用盾牌猛擊', () => {
  const state = battle({ skillIds: ['shield-bash'] });
  state.resources.mana = 2;
  assert.throws(
    () => activateSkill(state, 'shield-bash'),
    /至少需要 1 點🛡️/,
  );
});

test('聖盾術可與磨刀石類絕對機率效果共同計算', () => {
  const state = battle({ skillIds: ['holy-shield'] });
  state.player.activeStatuses.push({
    statusId: 'holy-shield',
    sourceUnitId: state.player.unitId,
    remainingTurns: 3,
    stacks: 1,
    potency: 1,
  });
  const chances = symbolChancesWithStatuses(
    state.player,
    resolveSymbolChances({ [ATTACK]: 0.5 }),
  );
  assert.ok(Math.abs(chances.attack - 0.25) < 1e-12);
  assert.ok(Math.abs(Object.values(chances).reduce((sum, chance) => (
    sum + chance
  ), 0) - 1) < 1e-12);
});
