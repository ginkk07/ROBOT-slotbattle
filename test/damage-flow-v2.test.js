import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateSkill,
  createGame,
  endPlayerTurn,
  isStunned,
  placeBet,
} from '../src/game/engine.js';
import { DamageSource } from '../src/game/data/damage-sources.js';
import { renderGame } from '../src/discord/render.js';

const ATTACK = 'attack';
const DEFENSE = 'defense';
const SKILL = 'skill';
const UNLUCKY = 'unlucky';
const zero = () => 0;

function battle({
  itemIds = [],
  skillIds = ['life-recovery'],
  enemyMaxHp = 500,
  enemyDamage = 0,
} = {}) {
  return createGame({
    id: `damage-v2-${Math.random()}`,
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: {
        maxHp: enemyMaxHp,
        baseDamage: enemyDamage,
        damageResistances: {},
      },
    },
    loadout: { skillIds, itemIds },
    monsterRng: zero,
  });
}

test('拉霸公式只放大S與攻擊力，所有額外傷害逐筆獨立結算', () => {
  let state = battle({
    itemIds: ['sword', 'gamblers-left-hand', 'shuriken'],
    skillIds: ['power-strike', 'fire-imbue'],
  });
  state.resources.mana = 4;
  state = activateSkill(state, 'power-strike');
  state = activateSkill(state, 'fire-imbue');
  state = placeBet(state, 4, {
    reels: [ATTACK, DEFENSE, SKILL],
    chanceRng: zero,
  });

  // R = floor(((4 + 1) × 2) × 2) = 20；火焰附加1、手裡劍1另算。
  assert.equal(state.lastImpact.spinDamage, 20);
  assert.equal(state.lastImpact.additionalDamage, 2);
  assert.equal(state.lastImpact.attackDamage, 22);
  assert.deepEqual(state.combatModifiers.damageDealtBySource, {
    spin: 20,
    extra: 2,
    curse: 0,
    reflect: 0,
  });

  let progressive = battle({ itemIds: ['reinforced-shuriken'] });
  progressive = placeBet(progressive, 1, { reels: [DEFENSE, DEFENSE, DEFENSE] });
  assert.equal(progressive.lastImpact.additionalDamage, 1);
  progressive = placeBet(progressive, 1, { reels: [DEFENSE, DEFENSE, DEFENSE] });
  assert.equal(progressive.lastImpact.additionalDamage, 2);
  assert.equal(
    progressive.player.activeStatuses.find(
      (status) => status.statusId === 'shuriken-combo',
    )?.stacks,
    2,
  );
  progressive = endPlayerTurn(progressive, { monsterRng: zero });
  assert.equal(
    progressive.player.activeStatuses.some(
      (status) => status.statusId === 'shuriken-combo',
    ),
    false,
  );
  progressive = placeBet(progressive, 1, { reels: [DEFENSE, DEFENSE, DEFENSE] });
  assert.equal(progressive.lastImpact.additionalDamage, 1);

  let bottle = battle({ itemIds: ['elemental-bottle', 'star-staff'] });
  bottle = placeBet(bottle, 1, { reels: [DEFENSE, DEFENSE, SKILL] });
  assert.equal(bottle.lastImpact.additionalDamage, 5);
});

test('詛咒依觸發傷害與各自層數結算，且詛咒與反射不互相觸發', () => {
  let state = battle({ itemIds: ['thorns'], enemyDamage: 2 });
  state.player.activeStatuses.push({
    statusId: 'curse',
    sourceUnitId: null,
    remainingTurns: null,
    stacks: 5,
    potency: 1,
  });
  state.enemy.activeStatuses.push({
    statusId: 'curse',
    sourceUnitId: null,
    remainingTurns: null,
    stacks: 3,
    potency: 1,
  });
  state.enemy.activeStatuses.push({
    statusId: 'armor-reinforcement',
    sourceUnitId: null,
    remainingTurns: null,
    stacks: 1,
    potency: 1,
  });
  state = endPlayerTurn(state, { monsterRng: zero });

  // 玩家：主要傷害2＋詛咒2；敵人：詛咒2＋一次反射5。
  assert.equal(state.player.hp, 41);
  assert.equal(state.enemy.hp, 493);
  assert.deepEqual(
    state.lastResolution.damageFollowUpEvents.map((event) => [
      event.damageSource,
      event.target,
      event.amount,
    ]),
    [
      [DamageSource.CURSE, 'self', 2],
      [DamageSource.CURSE, 'enemy', 2],
      [DamageSource.REFLECT, 'enemy', 5],
    ],
  );
  const reflectedToReinforcedEnemy = state.lastResolution.damageFollowUpEvents
    .find((event) => event.damageSource === DamageSource.REFLECT);
  assert.equal(reflectedToReinforcedEnemy.requested, 5);
  assert.equal(reflectedToReinforcedEnemy.damageReduction, 0);
  assert.equal(reflectedToReinforcedEnemy.amount, 5);

  let beads = battle({ itemIds: ['prayer-beads'], enemyDamage: 4 });
  beads.player.activeStatuses.push({
    statusId: 'curse', sourceUnitId: null, remainingTurns: null, stacks: 5, potency: 1,
  });
  beads.enemy.activeStatuses.push({
    statusId: 'curse', sourceUnitId: null, remainingTurns: null, stacks: 5, potency: 1,
  });
  beads = endPlayerTurn(beads, { monsterRng: zero });
  assert.equal(beads.player.hp, 40); // 主要傷害4＋佛珠減免後詛咒1。
  assert.equal(beads.enemy.hp, 496);
  assert.equal(
    beads.lastResolution.damageFollowUpEvents.find((event) => (
      event.damageSource === DamageSource.CURSE && event.target === 'self'
    )).sourceDamageReduction,
    3,
  );

  let voodoo = battle({ itemIds: ['voodoo-doll'] });
  voodoo = placeBet(voodoo, 1, {
    reels: [ATTACK, UNLUCKY, SKILL],
    chanceRng: zero,
  });
  assert.equal(voodoo.enemy.hp, 499);
  assert.equal(voodoo.player.hp, 45);
  assert.equal(voodoo.player.activeStatuses[0].stacks, 1);
  assert.equal(voodoo.enemy.activeStatuses[0].stacks, 1);
});

test('反射傷害先結算專用減傷再消耗護甲，且不走一般抗性', () => {
  let state = battle();
  state.resources.armor = 3;
  state.enemy.activeStatuses.push({
    statusId: 'damage-reflection',
    sourceUnitId: null,
    remainingTurns: null,
    stacks: 5,
    potency: 1,
  });

  state = placeBet(state, 1, {
    reels: [ATTACK, SKILL, SKILL],
    chanceRng: zero,
  });

  const reflection = state.history.at(-1).statusEvents
    .find((event) => event.damageSource === DamageSource.REFLECT);
  assert.equal(reflection.requested, 5);
  assert.equal(reflection.sourceDamageReduction, 0);
  assert.equal(reflection.armorUsed, 3);
  assert.equal(reflection.resistance, 0);
  assert.equal(reflection.damageReduction, 0);
  assert.equal(reflection.amount, 2);
  assert.equal(state.resources.armor, 0);
  assert.equal(state.player.hp, 43);
});

test('暈眩保留資源，電擊裝置每場只解除一次，惡魔之血仍保留暈眩', () => {
  let shock = battle({ itemIds: ['shock-device', 'black-cat-tail'] });
  shock.resources.armor = 7;
  shock.resources.mana = 2;
  shock = placeBet(shock, 1, {
    reels: [UNLUCKY, UNLUCKY, UNLUCKY],
    chanceRng: zero,
  });
  assert.equal(isStunned(shock), false);
  assert.deepEqual(shock.resources, { action: 3, armor: 7, mana: 2 });
  assert.equal(shock.player.maxHp, 47);

  shock = placeBet(shock, 1, {
    reels: [UNLUCKY, UNLUCKY, UNLUCKY],
    chanceRng: zero,
  });
  assert.equal(isStunned(shock), true);
  assert.deepEqual(shock.resources, { action: 2, armor: 7, mana: 2 });
  assert.equal(shock.player.maxHp, 49);

  let demon = battle({ itemIds: ['demon-blood'] });
  demon = placeBet(demon, 1, {
    reels: [UNLUCKY, UNLUCKY, UNLUCKY],
    chanceRng: zero,
  });
  assert.equal(demon.lastImpact.spinDamage, 9);
  assert.deepEqual(demon.resources, { action: 3, armor: 9, mana: 9 });
  assert.equal(isStunned(demon), true);
  const demonRender = renderGame(demon).embeds[0];
  assert.match(
    demonRender.fields.find((field) => field.name === '\u200b').value,
    /造成 9 傷害／護甲 \+9／法力 \+9／進入暈眩狀態/,
  );

  const guaranteed = placeBet(battle({ itemIds: ['demon-blood'] }), 1, {
    reels: [ATTACK, DEFENSE, SKILL],
    chanceRng: zero,
  });
  assert.equal(guaranteed.lastSpin.counts.unlucky, 1);
});

test('急救包四捨五入治療，血蛭每回合只觸發一次', () => {
  let state = battle({ itemIds: ['first-aid-kit', 'blood-leech'] });
  state.player.hp = 30;
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.player.hp, 34); // 3 × 1.4 = 4.2，四捨五入為4。
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.player.hp, 34);

  state = endPlayerTurn(state, { monsterRng: zero });
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.player.hp, 38);
});

test('火種袋、保險契約與再生藥草依戰鬥時機生效', () => {
  const tinder = battle({ itemIds: ['tinder-bag'] });
  assert.equal(
    tinder.enemy.activeStatuses.find((status) => status.statusId === 'burning')?.stacks,
    3,
  );

  let insurance = battle({ itemIds: ['insurance-contract'], enemyDamage: 5 });
  insurance = endPlayerTurn(insurance, { monsterRng: zero });
  assert.equal(insurance.lastResolution.armorUsed, 5);
  assert.equal(insurance.player.hp, 45);

  let herb = battle({ itemIds: ['regeneration-herb'], enemyMaxHp: 1 });
  herb.player.hp = 30;
  herb = placeBet(herb, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(herb.enemy.hp, 0);
  assert.equal(herb.player.hp, 36);
});
