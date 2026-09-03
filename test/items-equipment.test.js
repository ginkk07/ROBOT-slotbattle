import test from 'node:test';
import assert from 'node:assert/strict';

import { DamageSource } from '../src/game/data/damage-sources.js';
import {
  createGame,
  endPlayerTurn,
  placeBet,
  upgradeGameState,
  useItem,
} from '../src/game/engine.js';
import { resolveSymbolChances } from '../src/game/random.js';
import { scoreSpin } from '../src/game/scoring.js';
import { ITEMS } from '../src/game/data/items.js';
import { SymbolId } from '../src/game/symbols.js';
import { upgradePlayerProfile } from '../src/player/profile.js';

const { ATTACK, DEFENSE, SKILL, LUCKY } = SymbolId;
const zero = () => 0;

function battle(itemIds = [], {
  enemyUnitId = 'ruins-sentinel',
  maxHp = 500,
  baseDamage = 0,
} = {}) {
  return createGame({
    id: `items-${itemIds.join('-') || 'none'}`,
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: enemyUnitId,
      initialEnemyOverrides: {
        maxHp,
        baseDamage,
        damageResistances: {},
      },
    },
    loadout: { skillIds: ['life-recovery'], itemIds },
    monsterRng: zero,
  });
}

test('新增道具完整收錄，且多件裝備會同時持有與生效', () => {
  assert.equal(Object.keys(ITEMS).length, 44);

  const state = battle(['sword', 'iron-shield', 'vip-membership']);
  assert.deepEqual(state.player.equipment, [
    'sword',
    'iron-shield',
    'vip-membership',
  ]);
  assert.equal(state.resources.action, 5);
  assert.equal(state.resources.armor, 5);
  assert.equal(
    state.player.activeStatuses.find((status) => status.statusId === 'attack-up')
      ?.remainingTurns,
    3,
  );
});

test('可頌與鐵盾在每個玩家回合開始時各觸發一次', () => {
  let state = battle(['croissant', 'iron-shield']);
  assert.equal(state.resources.armor, 5);

  state.player.hp = 40;
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.hp, 41);
  assert.equal(state.resources.armor, 5);
});

test('手裡劍每次拉霸固定造成1點額外傷害且不受賭徒左手倍率影響', () => {
  let state = battle(['shuriken', 'gamblers-left-hand']);
  state = placeBet(state, 4, { reels: [ATTACK, DEFENSE, SKILL] });

  assert.equal(state.lastImpact.spinDamage, 8);
  assert.equal(state.lastImpact.additionalDamage, 1);
  assert.equal(state.lastImpact.attackDamage, 9);
  assert.equal(state.lastImpact.damageMultiplier, 2);
  assert.equal(state.enemy.hp, 491);
  assert.equal(
    state.player.activeStatuses.some((status) => status.statusId === 'shuriken-combo'),
    false,
  );

  let missed = battle(['shuriken']);
  missed = placeBet(missed, 1, { reels: [DEFENSE, DEFENSE, DEFENSE] });
  assert.equal(missed.lastImpact.additionalDamage, 1);
  assert.equal(missed.enemy.hp, missed.enemy.maxHp - 1);
});

test('長劍與強化版在戰鬥開始時分別獲得攻擊力＋1與＋5', () => {
  const longsword = battle(['sword']);
  const reinforced = battle(['reinforced-longsword']);

  assert.equal(
    longsword.player.activeStatuses.find((status) => status.statusId === 'attack-up')
      ?.potency,
    1,
  );
  assert.equal(
    reinforced.player.activeStatuses.find(
      (status) => status.statusId === 'weapon-attack-up-5',
    )?.remainingTurns,
    3,
  );
  const attacked = placeBet(reinforced, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(attacked.lastImpact.spinDamage, 6);
});

test('強化手裡劍每次拉霸累積1點額外傷害', () => {
  let state = battle(['reinforced-shuriken']);
  state = placeBet(state, 1, { reels: [DEFENSE, DEFENSE, DEFENSE] });
  assert.equal(state.lastImpact.additionalDamage, 1);
  state = placeBet(state, 1, { reels: [DEFENSE, DEFENSE, DEFENSE] });
  assert.equal(state.lastImpact.additionalDamage, 2);
  assert.equal(
    state.player.activeStatuses.find((status) => status.statusId === 'shuriken-combo')
      ?.stacks,
    2,
  );
});

test('騎士錘依投入點數附加裝甲破壞，強化版在無護甲時追加傷害', () => {
  let normal = battle(['knight-hammer']);
  normal.enemy.armor = 5;
  normal = placeBet(normal, 2, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(normal.enemy.armor, 3);
  assert.equal(normal.lastImpact.spinDamage, 0);
  assert.equal(
    normal.enemy.activeStatuses.find((status) => status.statusId === 'armor-break')
      ?.stacks,
    2,
  );
  normal = placeBet(normal, 1, { reels: [DEFENSE, DEFENSE, DEFENSE] });
  assert.equal(normal.enemy.armor, 3);
  normal = placeBet(normal, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(normal.lastImpact.enemyArmorBroken, 2);
  assert.equal(normal.enemy.armor, 0);

  let reinforced = battle(['reinforced-knight-hammer']);
  reinforced = placeBet(reinforced, 3, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(reinforced.lastImpact.spinDamage, 3);
  assert.equal(reinforced.lastImpact.additionalDamage, 3);
  assert.equal(
    reinforced.enemy.activeStatuses.find((status) => status.statusId === 'armor-break')
      ?.stacks,
    3,
  );
});

test('十字弓的三枚攻擊會保留並無視敵方護甲，強化版造成雙倍傷害', () => {
  let normal = battle(['crossbow']);
  normal.enemy.armor = 20;
  normal = placeBet(normal, 1, { reels: [ATTACK, ATTACK, ATTACK] });
  assert.equal(normal.lastImpact.spinDamage, 9);
  assert.equal(normal.enemy.armor, 20);
  assert.equal(normal.lastImpact.ignoredEnemyArmor, 20);

  let reinforced = battle(['reinforced-crossbow']);
  reinforced.enemy.armor = 20;
  reinforced = placeBet(reinforced, 1, { reels: [ATTACK, ATTACK, ATTACK] });
  assert.equal(reinforced.lastImpact.spinDamage, 18);
  assert.equal(reinforced.lastImpact.damageMultiplier, 2);
  assert.equal(reinforced.enemy.armor, 20);
});

test('符文魔方與星星法杖每次拉霸最多各觸發一次', () => {
  let state = battle(['rune-cube', 'star-staff']);
  state = placeBet(state, 1, { reels: [DEFENSE, DEFENSE, SKILL] });

  assert.equal(state.lastImpact.attackDamage, 4);
  assert.equal(state.resources.armor, 7);
  assert.equal(state.resources.mana, 1);
});

test('幸運幣、幸運蘿蔔與指定牌面機率依設定結算', () => {
  let state = battle(['vip-membership', 'lucky-coin']);
  state = placeBet(state, 5, {
    reels: [DEFENSE, DEFENSE, DEFENSE],
    chanceRng: () => 0.76,
  });
  assert.equal(state.resources.action, 1);

  const carrot = scoreSpin([ATTACK, DEFENSE, LUCKY], 1, {
    promoteWithLucky: true,
  });
  assert.deepEqual(carrot.awarded, { attack: 4, defense: 4, skill: 1 });

  const chances = resolveSymbolChances({
    [SymbolId.ATTACK]: 0.5,
    [SymbolId.LUCKY]: 0.1,
  });
  assert.equal(chances.attack, 0.5);
  assert.equal(chances.lucky, 0.1);
  assert.ok(Math.abs(Object.values(chances).reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test('懸賞令、頌缽與平安符在各自時機生效', () => {
  let bounty = battle(['bounty-poster'], {
    enemyUnitId: 'elite-ruins-sentinel',
  });
  assert.equal(bounty.resources.armor, 20);
  bounty = placeBet(bounty, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  // 1點牌面傷害＋懸賞令攻擊力3，之後由菁英的護甲強化降低20%。
  assert.equal(bounty.lastImpact.attackDamage, 3);

  let bowl = battle(['singing-bowl', 'healing-potion']);
  bowl.player.hp = 30;
  bowl = useItem(bowl, 'healing-potion');
  assert.equal(bowl.player.hp, 40);
  assert.equal(bowl.resources.mana, 1);

  const charm = endPlayerTurn(battle(['peace-charm'], { baseDamage: 4 }), {
    monsterRng: zero,
  });
  assert.equal(charm.lastResolution.damageTaken, 1);
  assert.equal(charm.player.hp, 44);
});

test('夏賜儀碇在星海羅盤之後判定，羅盤傷害會清除既有累積', () => {
  let state = battle([
    'star-sea-compass',
    'summer-gift-anchor',
    'magic-mushroom',
  ]);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.resources.action, 5);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.resources.action, 6);

  state = useItem(state, 'magic-mushroom');
  state = endPlayerTurn(state, { monsterRng: zero });

  assert.equal(state.enemy.hp, 495);
  assert.equal(state.resources.action, 4);
  assert.equal(state.combatModifiers.actionLimitBonus, 0);

  const turnEndEvents = state.lastResolution.playerEquipmentEvents;
  const compassIndex = turnEndEvents.findIndex((event) => (
    event.itemId === 'star-sea-compass' && event.type === 'damage'
  ));
  const anchorIndex = turnEndEvents.findIndex((event) => (
    event.itemId === 'summer-gift-anchor' && event.type === 'reset-action-limit'
  ));
  assert.ok(compassIndex >= 0 && compassIndex < anchorIndex);
});

test('夏賜儀碇最多累積5點，之後造成傷害會全部清除', () => {
  let state = battle(['summer-gift-anchor']);

  for (let round = 0; round < 6; round += 1) {
    state = endPlayerTurn(state, { monsterRng: zero });
  }

  assert.equal(state.combatModifiers.actionLimitBonus, 5);
  assert.equal(state.resources.action, 9);

  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.combatModifiers.actionLimitBonus, 0);
  assert.equal(state.resources.action, 4);
});

test('傳說燃焰之劍在拉霸造成傷害後加燃燒並依目前層數追加傷害', () => {
  let state = battle(['flame-sword']);
  state = placeBet(state, 1, {
    reels: [ATTACK, DEFENSE, SKILL],
    chanceRng: zero,
  });
  assert.equal(state.lastImpact.attackDamage, 2);
  assert.equal(state.lastImpact.spinDamage, 1);
  assert.equal(state.lastImpact.skillDamage, 1);
  assert.equal(state.combatModifiers.damageDealtBySource.spin, 1);
  assert.equal(state.combatModifiers.damageDealtBySource.extra, 1);
  assert.equal(
    state.history.at(-1).equipmentEvents.find((event) => event.type === 'damage')
      .damageSource,
    DamageSource.EXTRA,
  );
  assert.equal(state.enemy.activeStatuses[0].stacks, 1);

  state = placeBet(state, 1, {
    reels: [ATTACK, DEFENSE, SKILL],
    chanceRng: zero,
  });
  assert.equal(state.lastImpact.attackDamage, 3);
  assert.equal(state.lastImpact.spinDamage, 1);
  assert.equal(state.lastImpact.skillDamage, 2);
  assert.equal(state.combatModifiers.damageDealtBySource.spin, 2);
  assert.equal(state.combatModifiers.damageDealtBySource.extra, 3);
  assert.equal(state.enemy.activeStatuses[0].stacks, 2);
});

test('磨刀石只提高下一次拉霸的攻擊牌面，藥劑與魔菇立即加資源', () => {
  let state = battle(['whetstone', 'hardening-potion', 'magic-mushroom']);
  state = useItem(state, 'hardening-potion');
  state = useItem(state, 'magic-mushroom');
  state = useItem(state, 'whetstone');
  assert.equal(state.resources.armor, 15);
  assert.equal(state.resources.mana, 5);
  assert.equal(state.combatModifiers.nextSpinSymbolChances.attack, 0.5);

  const chanceAwareRng = (maximum) => (maximum === 1_000_000 ? 400_000 : 40);
  state = placeBet(state, 1, { rng: chanceAwareRng });
  assert.deepEqual(state.lastSpin.reels, [ATTACK, ATTACK, ATTACK]);
  assert.deepEqual(state.combatModifiers.nextSpinSymbolChances, {});

  state = placeBet(state, 1, { rng: chanceAwareRng });
  assert.deepEqual(state.lastSpin.reels, [DEFENSE, DEFENSE, DEFENSE]);
});

test('紅鬼面具將菁英遭遇率提高至20%', () => {
  const normal = createGame({
    id: 'elite-without-mask',
    ownerId: 'player-1',
    loadout: { skillIds: ['life-recovery'], itemIds: [] },
    worldRng: sequence([0.19, 0, 0]),
    monsterRng: zero,
  });
  const elite = createGame({
    id: 'elite-with-mask',
    ownerId: 'player-1',
    loadout: { skillIds: ['life-recovery'], itemIds: ['red-oni-mask'] },
    worldRng: sequence([0.19, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(normal.enemy.rank, 'normal');
  assert.equal(elite.enemy.rank, 'elite');
});

test('舊存檔的初始燃焰之劍會遷移成普通劍', () => {
  const legacyGame = battle(['sword']);
  legacyGame.schemaVersion = 4;
  legacyGame.player.equipment = { weapon: 'flame-sword' };
  legacyGame.initialLoadout.itemIds = ['flame-sword'];
  const upgradedGame = upgradeGameState(legacyGame);
  assert.deepEqual(upgradedGame.player.equipment, ['sword']);
  assert.deepEqual(upgradedGame.initialLoadout.itemIds, ['sword']);

  const upgradedProfile = upgradePlayerProfile({
    playerId: 'player-1',
    saveVersion: 3,
    unlockedStartingSkillIds: ['life-recovery'],
    unlockedStartingItemIds: ['healing-potion', 'fire-bomb', 'flame-sword'],
    lastStartingLoadout: {
      skillIds: ['life-recovery'],
      itemIds: ['flame-sword'],
    },
  });
  assert.deepEqual(upgradedProfile.unlockedStartingItemIds, [
    'sword',
    'lucky-clover',
    'shuriken',
  ]);
  assert.deepEqual(upgradedProfile.lastStartingLoadout.itemIds, ['sword']);
});

test('v4玩家改用新版開局選項，且真正的傳說燃焰之劍不會被誤轉換', () => {
  const upgradedProfile = upgradePlayerProfile({
    playerId: 'player-1',
    saveVersion: 4,
    unlockedStartingSkillIds: ['life-recovery'],
    unlockedStartingItemIds: [
      'healing-potion',
      'fire-bomb',
      'sword',
      'flame-sword',
    ],
    lastStartingLoadout: { skillIds: ['life-recovery'], itemIds: ['flame-sword'] },
  });

  assert.deepEqual(upgradedProfile.unlockedStartingItemIds, [
    'sword',
    'flame-sword',
    'lucky-clover',
    'shuriken',
  ]);
  assert.deepEqual(upgradedProfile.lastStartingLoadout.itemIds, ['flame-sword']);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
